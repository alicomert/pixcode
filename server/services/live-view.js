import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { ensureManagedRuntime, getManagedRuntimeStatus } from './managed-runtimes.js';

const sessionsByProject = new Map();
const sessionsByShareId = new Map();
const READY_TIMEOUT_MS = 12000;
const LOG_LIMIT = 200;
const RUNTIME_CHECK_TIMEOUT_MS = 1800;

const localUrlRegex = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\])(?::(\d+))?[^\s"'<>]*/i;

function normalizeHost(host) {
  if (!host || host === '0.0.0.0' || host === '::') return '127.0.0.1';
  return host.replace(/^\[|\]$/g, '');
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function dirExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function readTextIfExists(filePath, maxBytes = 512 * 1024) {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

function hasDependency(packageJson, name) {
  return Boolean(
    packageJson?.dependencies?.[name]
    || packageJson?.devDependencies?.[name]
    || packageJson?.peerDependencies?.[name],
  );
}

async function detectPackageManager(projectPath) {
  if (await fileExists(path.join(projectPath, 'bun.lockb')) || await fileExists(path.join(projectPath, 'bun.lock'))) {
    return 'bun';
  }
  if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function packageRunArgs(packageManager, scriptName, extraArgs = []) {
  if (packageManager === 'npm') return ['run', scriptName, ...(extraArgs.length ? ['--', ...extraArgs] : [])];
  if (packageManager === 'pnpm') return ['run', scriptName, ...extraArgs];
  if (packageManager === 'yarn') return [scriptName, ...extraArgs];
  if (packageManager === 'bun') return ['run', scriptName, ...extraArgs];
  return ['run', scriptName, ...(extraArgs.length ? ['--', ...extraArgs] : [])];
}

function buildDisplayCommand(command, args) {
  return [command, ...args].join(' ');
}

function quoteForPosixShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function quoteForWindowsShell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function isPathLikeCommand(command) {
  return path.isAbsolute(command) || command.includes('/') || command.includes('\\');
}

function runtimeMissingReason(command, framework) {
  const base = `${command} is not available on this machine.`;
  if (framework === 'PHP' || command === 'php') {
    return 'Pixcode can prepare a local PHP runtime automatically before starting this project.';
  }
  if (command === 'npm' || command === 'pnpm' || command === 'yarn' || command === 'bun') {
    return `${base} Pixcode will use its bundled Node runtime when possible; otherwise install the package manager or use a custom command.`;
  }
  if (command === 'python' || command === 'python3') {
    return `${base} Pixcode does not have a managed Python runtime for this stack yet.`;
  }
  return `${base} Pixcode does not have a managed ${framework || command} runtime for this stack yet.`;
}

async function checkCommandAvailability(command, env = process.env) {
  if (!command || command.includes('\n') || command.includes('\r')) return true;

  if (isPathLikeCommand(command)) {
    try {
      await fs.access(command);
      return true;
    } catch {
      return false;
    }
  }

  const checker = process.platform === 'win32'
    ? {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `where ${quoteForWindowsShell(command)}`],
    }
    : {
      command: '/bin/sh',
      args: ['-lc', `command -v ${quoteForPosixShell(command)}`],
    };

  return new Promise((resolve) => {
    let settled = false;
    let child = null;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(available);
    };

    const timer = setTimeout(() => {
      try {
        child?.kill();
      } catch {
        // Ignore a raced process exit.
      }
      finish(true);
    }, RUNTIME_CHECK_TIMEOUT_MS);

    child = spawn(checker.command, checker.args, {
      env,
      stdio: 'ignore',
      windowsHide: true,
    });

    child.on('error', (error) => {
      finish(error?.code === 'ENOENT' ? false : true);
    });
    child.on('exit', (code) => {
      finish(code === 0);
    });
  });
}

function buildPackageCommand(packageManager, scriptName, id, label, framework, extraArgs = []) {
  const args = packageRunArgs(packageManager, scriptName, extraArgs);
  return {
    id,
    label,
    framework,
    command: packageManager,
    args,
    displayCommand: buildDisplayCommand(packageManager, args),
  };
}

function buildManagedPhpCommand(runtimeStatus) {
  const executable = runtimeStatus?.executablePath || 'frankenphp';
  return {
    id: 'frankenphp-php-server',
    label: 'Pixcode PHP runtime',
    framework: 'PHP',
    command: executable,
    args: ['php-server', '-r', '.'],
    displayCommand: `${executable} php-server -r .`,
    env: {
      SERVER_NAME: 'http://127.0.0.1:$PORT',
    },
    managedRuntime: {
      id: 'frankenphp',
      status: runtimeStatus?.status || 'missing',
    },
  };
}

function detectPackageCommand(packageJson, packageManager) {
  const scripts = packageJson.scripts || {};
  const devScript = String(scripts.dev || '');
  const startScript = String(scripts.start || '');

  if (scripts.dev) {
    if (devScript.includes('next') || hasDependency(packageJson, 'next')) {
      return buildPackageCommand(packageManager, 'dev', 'npm-dev-next', 'Next.js dev server', 'Next.js', [
        '--hostname',
        '127.0.0.1',
        '--port',
        '$PORT',
      ]);
    }

    if (
      devScript.includes('vite')
      || hasDependency(packageJson, 'vite')
      || hasDependency(packageJson, '@vitejs/plugin-react')
    ) {
      return buildPackageCommand(packageManager, 'dev', 'npm-dev-vite', 'Vite dev server', 'Vite', [
        '--host',
        '127.0.0.1',
        '--port',
        '$PORT',
      ]);
    }

    if (devScript.includes('nuxt') || hasDependency(packageJson, 'nuxt')) {
      return buildPackageCommand(packageManager, 'dev', 'npm-dev-nuxt', 'Nuxt dev server', 'Nuxt', [
        '--host',
        '127.0.0.1',
        '--port',
        '$PORT',
      ]);
    }

    if (devScript.includes('astro') || hasDependency(packageJson, 'astro')) {
      return buildPackageCommand(packageManager, 'dev', 'npm-dev-astro', 'Astro dev server', 'Astro', [
        '--host',
        '127.0.0.1',
        '--port',
        '$PORT',
      ]);
    }

    return buildPackageCommand(packageManager, 'dev', 'npm-dev', 'Package dev script', 'JavaScript', []);
  }

  if (scripts.start) {
    return buildPackageCommand(packageManager, 'start', 'npm-start', 'Package start script', 'JavaScript', []);
  }

  if (scripts.preview) {
    return buildPackageCommand(packageManager, 'preview', 'npm-preview', 'Package preview script', 'JavaScript', [
      '--host',
      '127.0.0.1',
      '--port',
      '$PORT',
    ]);
  }

  return null;
}

function withPort(command, port) {
  return {
    ...command,
    args: command.args.map((arg) => arg.replaceAll('$PORT', String(port))),
    displayCommand: command.displayCommand.replaceAll('$PORT', String(port)),
    env: command.env
      ? Object.fromEntries(Object.entries(command.env).map(([key, value]) => [
        key,
        String(value).replaceAll('$PORT', String(port)),
      ]))
      : undefined,
  };
}

function shouldUseShell(command) {
  if (command.shell) return true;
  if (process.platform !== 'win32') return false;
  if (path.isAbsolute(command.command) && command.command.toLowerCase().endsWith('.exe')) return false;
  return true;
}

async function detectStaticRoot(projectPath) {
  const candidates = [
    projectPath,
    path.join(projectPath, 'public'),
    path.join(projectPath, 'dist'),
    path.join(projectPath, 'build'),
  ];

  for (const candidate of candidates) {
    if (await fileExists(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return null;
}

async function detectPythonTarget(projectPath) {
  if (await fileExists(path.join(projectPath, 'manage.py'))) {
    return {
      id: 'python-django',
      label: 'Django development server',
      framework: 'Django',
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: ['manage.py', 'runserver', '127.0.0.1:$PORT'],
      displayCommand: 'python manage.py runserver 127.0.0.1:$PORT',
    };
  }

  const mainPy = path.join(projectPath, 'main.py');
  const appPy = path.join(projectPath, 'app.py');
  const mainContent = await readTextIfExists(mainPy, 128 * 1024);
  const appContent = await readTextIfExists(appPy, 128 * 1024);

  if (mainContent?.includes('FastAPI(')) {
    return {
      id: 'python-fastapi-main',
      label: 'FastAPI via uvicorn',
      framework: 'FastAPI',
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '$PORT'],
      displayCommand: 'python -m uvicorn main:app --host 127.0.0.1 --port $PORT',
    };
  }

  if (appContent?.includes('FastAPI(')) {
    return {
      id: 'python-fastapi-app',
      label: 'FastAPI via uvicorn',
      framework: 'FastAPI',
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '$PORT'],
      displayCommand: 'python -m uvicorn app:app --host 127.0.0.1 --port $PORT',
    };
  }

  if (appContent?.includes('Flask(')) {
    return {
      id: 'python-flask',
      label: 'Flask development server',
      framework: 'Flask',
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: ['-m', 'flask', '--app', 'app', 'run', '--host', '127.0.0.1', '--port', '$PORT'],
      displayCommand: 'python -m flask --app app run --host 127.0.0.1 --port $PORT',
    };
  }

  return null;
}

async function detectProcessCommand(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageJsonText = await readTextIfExists(packageJsonPath);
  if (packageJsonText) {
    try {
      const packageJson = JSON.parse(packageJsonText);
      const packageManager = await detectPackageManager(projectPath);
      const command = detectPackageCommand(packageJson, packageManager);
      if (command) return command;
    } catch {
      return null;
    }
  }

  const pythonCommand = await detectPythonTarget(projectPath);
  if (pythonCommand) return pythonCommand;

  if (await fileExists(path.join(projectPath, 'go.mod'))) {
    return {
      id: 'go-run',
      label: 'Go application',
      framework: 'Go',
      command: 'go',
      args: ['run', '.'],
      displayCommand: 'go run .',
    };
  }

  if (await fileExists(path.join(projectPath, 'Cargo.toml'))) {
    return {
      id: 'cargo-run',
      label: 'Rust application',
      framework: 'Rust',
      command: 'cargo',
      args: ['run'],
      displayCommand: 'cargo run',
    };
  }

  if (await fileExists(path.join(projectPath, 'composer.json')) || await fileExists(path.join(projectPath, 'index.php'))) {
    return {
      id: 'php-built-in',
      label: 'PHP built-in server',
      framework: 'PHP',
      command: 'php',
      args: ['-S', '127.0.0.1:$PORT', '-t', '.'],
      displayCommand: 'php -S 127.0.0.1:$PORT -t .',
    };
  }

  return null;
}

export async function detectLiveViewTarget(projectPath, options = {}) {
  if (!projectPath || !(await dirExists(projectPath))) {
    return {
      available: false,
      kind: 'none',
      reason: 'Project directory is not available.',
    };
  }

  const processCommand = await detectProcessCommand(projectPath);
  if (processCommand) {
    const runtimeAvailable = await checkCommandAvailability(processCommand.command, options.env || process.env);
    if (!runtimeAvailable) {
      if (processCommand.framework === 'PHP' || processCommand.command === 'php') {
        const managedRuntime = await getManagedRuntimeStatus('frankenphp', { env: options.env || process.env });
        const command = buildManagedPhpCommand(managedRuntime);
        return {
          available: true,
          kind: 'process',
          label: command.label,
          framework: command.framework,
          command,
          managedRuntime,
          reason: managedRuntime.status === 'missing'
            ? 'Pixcode will prepare a local PHP runtime automatically before starting this project.'
            : 'Pixcode will run this project with its managed PHP runtime.',
        };
      }

      return {
        available: false,
        kind: 'process',
        label: processCommand.label,
        framework: processCommand.framework,
        command: processCommand,
        missingRuntime: processCommand.command,
        reason: runtimeMissingReason(processCommand.command, processCommand.framework),
      };
    }

    return {
      available: true,
      kind: 'process',
      label: processCommand.label,
      framework: processCommand.framework,
      command: processCommand,
    };
  }

  const staticRoot = await detectStaticRoot(projectPath);
  if (staticRoot) {
    return {
      available: true,
      kind: 'static',
      label: staticRoot === projectPath ? 'Static HTML' : `Static HTML (${path.relative(projectPath, staticRoot)})`,
      framework: 'Static HTML',
      staticRoot,
    };
  }

  return {
    available: false,
    kind: 'none',
    reason: 'No runnable web entry was detected. Add an index.html, package.json script, manage.py, go.mod, Cargo.toml, or enter a custom command.',
  };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = READY_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 700);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.status < 500) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  return false;
}

function appendLog(session, line) {
  if (!line) return;
  session.log.push(line);
  if (session.log.length > LOG_LIMIT) session.log.shift();

  const url = line.match(localUrlRegex)?.[0];
  if (url) {
    try {
      const parsed = new URL(url.replace('0.0.0.0', '127.0.0.1'));
      session.host = normalizeHost(parsed.hostname);
      session.port = parsed.port ? Number(parsed.port) : session.port;
      session.upstreamUrl = `http://${session.host}:${session.port}`;
    } catch {
      // Ignore malformed tool output.
    }
  }
}

function publicSession(session) {
  if (!session) return null;
  return {
    projectName: session.projectName,
    shareId: session.shareId,
    sharePath: `/live/${session.shareId}/`,
    status: session.status,
    kind: session.kind,
    framework: session.framework,
    label: session.label,
    command: session.command ? {
      id: session.command.id,
      label: session.command.label,
      displayCommand: session.command.displayCommand,
    } : null,
    managedRuntime: session.managedRuntime || null,
    port: session.port,
    upstreamUrl: session.upstreamUrl,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    exitCode: session.exitCode ?? null,
    exitSignal: session.exitSignal ?? null,
    spawnErrorCode: session.spawnErrorCode ?? null,
    error: session.error,
    log: session.log.slice(-40),
  };
}

export async function getLiveViewState(projectName, projectPath) {
  const target = await detectLiveViewTarget(projectPath);
  const session = sessionsByProject.get(projectName) ?? null;
  return {
    target,
    session: publicSession(session),
  };
}

export async function startLiveView(projectName, projectPath, options = {}) {
  const existing = sessionsByProject.get(projectName);
  if (existing && (existing.status === 'running' || existing.status === 'starting')) {
    return publicSession(existing);
  }

  const detectedTarget = await detectLiveViewTarget(projectPath);
  const customCommand = typeof options.customCommand === 'string' ? options.customCommand.trim() : '';
  const target = customCommand
    ? {
      available: true,
      kind: 'process',
      label: 'Custom command',
      framework: 'Custom',
      command: {
        id: 'custom',
        label: 'Custom command',
        framework: 'Custom',
        command: customCommand,
        args: [],
        displayCommand: customCommand,
        shell: true,
      },
    }
    : detectedTarget;

  if (!target.available) {
    const error = new Error(target.reason || 'No Live View target detected.');
    error.code = 'LIVE_VIEW_NOT_AVAILABLE';
    throw error;
  }

  const shareId = crypto.randomBytes(12).toString('hex');
  if (target.kind === 'static') {
    const session = {
      projectName,
      projectPath,
      shareId,
      status: 'running',
      kind: 'static',
      framework: target.framework,
      label: target.label,
      staticRoot: target.staticRoot,
      command: null,
      port: null,
      upstreamUrl: null,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      exitSignal: null,
      spawnErrorCode: null,
      error: null,
      log: [`Serving static files from ${path.relative(projectPath, target.staticRoot) || '.'}`],
    };
    sessionsByProject.set(projectName, session);
    sessionsByShareId.set(shareId, session);
    return publicSession(session);
  }

  const port = await findFreePort();
  let runtimeStatus = target.managedRuntime || target.command?.managedRuntime || null;
  let targetCommand = target.command;
  if (runtimeStatus?.id && runtimeStatus.status !== 'system' && runtimeStatus.status !== 'installed') {
    runtimeStatus = await ensureManagedRuntime(runtimeStatus.id);
    if (runtimeStatus.id === 'frankenphp') {
      targetCommand = buildManagedPhpCommand(runtimeStatus);
    }
  }

  const command = withPort(targetCommand, port);
  const session = {
    projectName,
    projectPath,
    shareId,
    status: 'starting',
    kind: 'process',
    framework: target.framework,
    label: target.label,
    command,
    managedRuntime: runtimeStatus,
    port,
    host: '127.0.0.1',
    upstreamUrl: `http://127.0.0.1:${port}`,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    exitCode: null,
    exitSignal: null,
    spawnErrorCode: null,
    error: null,
    log: [`$ ${command.displayCommand}`],
    child: null,
  };

  const env = {
    ...process.env,
    ...(command.env || {}),
    PORT: String(port),
    HOST: '127.0.0.1',
    VITE_HOST: '127.0.0.1',
    VITE_PORT: String(port),
    BROWSER: 'none',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const child = spawn(command.command, command.args, {
    cwd: projectPath,
    env,
    shell: shouldUseShell(command),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  session.child = child;
  sessionsByProject.set(projectName, session);
  sessionsByShareId.set(shareId, session);

  child.stdout.on('data', (chunk) => {
    chunk.toString().split(/\r?\n/).forEach((line) => appendLog(session, line));
  });
  child.stderr.on('data', (chunk) => {
    chunk.toString().split(/\r?\n/).forEach((line) => appendLog(session, line));
  });
  child.on('error', (error) => {
    session.status = 'error';
    session.error = error.message;
    session.spawnErrorCode = error.code || null;
    appendLog(session, `process error: ${error.message}`);
  });
  child.on('exit', (code, signal) => {
    session.status = code === 0 ? 'stopped' : 'error';
    session.stoppedAt = new Date().toISOString();
    session.exitCode = code;
    session.exitSignal = signal;
    session.error = code === 0 ? null : `Process exited with ${signal || `code ${code}`}`;
    appendLog(session, session.error || 'Process stopped.');
  });

  const ready = await waitForHttp(session.upstreamUrl);
  if (session.status === 'starting') {
    session.status = ready ? 'running' : 'starting';
    if (!ready) {
      appendLog(session, 'Waiting for the app to open its HTTP port.');
    }
  }

  return publicSession(session);
}

export async function stopLiveView(projectName) {
  const session = sessionsByProject.get(projectName);
  if (!session) return null;

  if (session.child) {
    try {
      session.child.kill();
    } catch {
      // Process may already be gone.
    }
  }

  session.status = 'stopped';
  session.stoppedAt = new Date().toISOString();
  sessionsByProject.delete(projectName);
  sessionsByShareId.delete(session.shareId);
  return publicSession(session);
}

export async function restartLiveView(projectName, projectPath, options = {}) {
  await stopLiveView(projectName);
  return startLiveView(projectName, projectPath, options);
}

export function getLiveViewSessionByShareId(shareId) {
  return sessionsByShareId.get(shareId) ?? null;
}
