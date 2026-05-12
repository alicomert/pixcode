import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { buildCliSpawnEnv } from './install-jobs.js';
import { ensureManagedRuntime } from './managed-runtimes.js';
import { resolveLiveViewRuntime } from './runtime-manager.js';

const sessionsByProject = new Map();
const sessionsByShareId = new Map();
const READY_TIMEOUT_MS = 12000;
const LOG_LIMIT = 200;

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

function buildPackageCommand(packageManager, scriptName, id, label, framework, extraArgs = []) {
  const args = packageRunArgs(packageManager, scriptName, extraArgs);
  return {
    id,
    label,
    framework,
    packageManager,
    scriptName,
    extraArgs,
    command: packageManager,
    args,
    displayCommand: buildDisplayCommand(packageManager, args),
  };
}

function isPackageManagerCommand(command) {
  return command === 'npm' || command === 'pnpm' || command === 'yarn' || command === 'bun';
}

function buildManagedPackageCommand(command, runtimeStatus) {
  const npmArgs = command.scriptName
    ? packageRunArgs('npm', command.scriptName, command.extraArgs || [])
    : command.args;
  const runtimeExecutable = runtimeStatus?.executablePath || null;
  const commandExecutable = runtimeExecutable
    ? (runtimeStatus?.runner === 'node' || runtimeExecutable.endsWith('.js') ? process.execPath : runtimeExecutable)
    : command.command;
  const args = runtimeExecutable && (runtimeStatus?.runner === 'node' || runtimeExecutable.endsWith('.js'))
    ? [runtimeExecutable, ...npmArgs]
    : npmArgs;

  return {
    ...command,
    packageManager: 'npm',
    command: commandExecutable,
    args,
    displayCommand: buildDisplayCommand('npm', npmArgs),
    managedRuntime: {
      id: 'npm',
      status: runtimeStatus?.status || 'missing',
    },
  };
}

function packageBinCandidates(binName) {
  return process.platform === 'win32'
    ? [binName, `${binName}.cmd`, `${binName}.ps1`, `${binName}.exe`]
    : [binName];
}

function expectedPackageBin(command) {
  if (command.framework === 'Vite' || command.id === 'npm-dev-vite') return 'vite';
  if (command.framework === 'Next.js' || command.id === 'npm-dev-next') return 'next';
  if (command.framework === 'Nuxt' || command.id === 'npm-dev-nuxt') return 'nuxt';
  if (command.framework === 'Astro' || command.id === 'npm-dev-astro') return 'astro';
  return null;
}

async function packageDependenciesReady(projectPath, command) {
  if (!command?.scriptName && !command?.packageManager) return true;
  if (!(await dirExists(path.join(projectPath, 'node_modules')))) return false;

  const binName = expectedPackageBin(command);
  if (!binName) return true;

  const binDir = path.join(projectPath, 'node_modules', '.bin');
  for (const candidate of packageBinCandidates(binName)) {
    if (await fileExists(path.join(binDir, candidate))) return true;
  }
  return false;
}

function packageInstallInvocation(command) {
  if (!command || command.packageManager !== 'npm') return null;
  const installArgs = ['install', '--no-audit', '--no-fund', '--include=dev'];

  if (
    command.managedRuntime?.id === 'npm'
    && command.args?.[0]
    && String(command.args[0]).endsWith('npm-cli.js')
  ) {
    return {
      command: command.command,
      args: [command.args[0], ...installArgs],
      displayCommand: 'npm install --no-audit --no-fund --include=dev',
    };
  }

  if (command.command === 'npm' || path.basename(command.command || '').startsWith('npm')) {
    return {
      command: command.command,
      args: installArgs,
      displayCommand: 'npm install --no-audit --no-fund --include=dev',
    };
  }

  return null;
}

function runPrepProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: shouldUseShell({ command }),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timeoutMs = Number.parseInt(process.env.PIXCODE_LIVE_VIEW_INSTALL_TIMEOUT_MS || '', 10) || 300000;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Process may already be gone.
      }
      finish(reject, new Error(`Dependency install timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      chunk.toString().split(/\r?\n/).forEach((line) => options.onLog?.(line));
    });
    child.stderr.on('data', (chunk) => {
      chunk.toString().split(/\r?\n/).forEach((line) => options.onLog?.(line));
    });
    child.on('error', (error) => finish(reject, error));
    child.on('exit', (code, signal) => {
      if (code === 0) {
        finish(resolve);
        return;
      }
      finish(reject, new Error(`Dependency install exited with ${signal || `code ${code}`}.`));
    });
  });
}

export async function preparePackageDependencies(projectPath, command, env = process.env, onLog = () => {}) {
  if (!command || command.packageManager !== 'npm') return false;
  if (await packageDependenciesReady(projectPath, command)) return false;

  const install = packageInstallInvocation(command);
  if (!install) return false;

  onLog(`Installing project dependencies: ${install.displayCommand}`);
  await runPrepProcess(install.command, install.args, {
    cwd: projectPath,
    env: {
      ...env,
      NODE_ENV: 'development',
      NPM_CONFIG_PRODUCTION: 'false',
      npm_config_production: 'false',
    },
    onLog,
  });
  if (!(await packageDependenciesReady(projectPath, command))) {
    const binName = expectedPackageBin(command);
    throw new Error(binName
      ? `${binName} was not installed. Check package.json dependencies or install output.`
      : 'Project dependencies were not installed.');
  }
  onLog('Project dependencies are ready.');
  return true;
}

function prependPathEntries(env, entries) {
  const cleanEntries = entries.filter(Boolean);
  if (!cleanEntries.length) return env;

  const existingPath = env.Path || env.PATH || '';
  const nextPath = [...cleanEntries, existingPath].filter(Boolean).join(path.delimiter);
  return process.platform === 'win32'
    ? { ...env, PATH: nextPath, Path: nextPath }
    : { ...env, PATH: nextPath };
}

function applyManagedRuntimeEnv(env, runtimeStatus) {
  if (runtimeStatus?.id !== 'frankenphp' || !runtimeStatus.executablePath) {
    return env;
  }

  const runtimeDir = path.dirname(runtimeStatus.executablePath);
  return prependPathEntries(env, [
    runtimeDir,
    path.join(runtimeDir, 'ext'),
  ]);
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

function publicCommand(command) {
  if (!command) return null;
  return {
    id: command.id,
    label: command.label,
    displayCommand: command.displayCommand,
    custom: command.custom === true || command.id === 'custom',
  };
}

function liveViewEnvironmentMode(target, session) {
  const kind = session?.kind || target?.kind || 'none';
  if (kind === 'static') return 'static';
  if (kind === 'process') return 'local-process';
  return 'unavailable';
}

function liveViewEnvironmentStatus(target, session) {
  if (session?.status) return session.status;
  if (target?.available) return 'ready';
  return 'unavailable';
}

function liveViewEnvironmentCommand(target, session) {
  return publicCommand(session?.command) || publicCommand(target?.command);
}

function liveViewEnvironmentLogs(session) {
  return Array.isArray(session?.log) ? session.log.slice(-40) : [];
}

function liveViewEnvironmentRuntime(target, session) {
  return session?.runtime || target?.runtime || null;
}

function liveViewEnvironmentManagedRuntime(target, session) {
  return session?.managedRuntime || target?.managedRuntime || target?.command?.managedRuntime || null;
}

export function buildLiveViewEnvironment({ target = null, session = null } = {}) {
  const mode = liveViewEnvironmentMode(target, session);
  const status = liveViewEnvironmentStatus(target, session);
  const command = liveViewEnvironmentCommand(target, session);
  const framework = session?.framework || target?.framework || null;
  const label = session?.label || target?.label || framework || 'Live View';
  const runtime = liveViewEnvironmentRuntime(target, session);
  const managedRuntime = liveViewEnvironmentManagedRuntime(target, session);
  const logs = liveViewEnvironmentLogs(session);
  const reason = session?.error || target?.reason || null;

  return {
    id: mode === 'unavailable' ? 'live-view-unavailable' : `live-view-${mode}`,
    mode,
    status,
    framework,
    label,
    command,
    runtime,
    managedRuntime,
    port: session?.port ?? null,
    upstreamUrl: session?.upstreamUrl ?? null,
    sharePath: session?.sharePath ?? null,
    logs,
    diagnostics: {
      runnerKind: session?.kind || target?.kind || 'none',
      targetAvailable: Boolean(target?.available || session),
      reason,
      error: session?.error || null,
      exitCode: session?.exitCode ?? null,
      exitSignal: session?.exitSignal ?? null,
      spawnErrorCode: session?.spawnErrorCode ?? null,
      startedAt: session?.startedAt || null,
      stoppedAt: session?.stoppedAt || null,
      readyTimeoutMs: READY_TIMEOUT_MS,
      staticServing: mode === 'static',
      customCommand: command?.custom === true,
      publicTunnelReady: false,
    },
    tunnel: {
      status: 'local-only',
      url: null,
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
    const runtimeResolution = await resolveLiveViewRuntime(processCommand, {
      env: options.env || process.env,
      preferManaged: true,
    });

    if (isPackageManagerCommand(processCommand.command)) {
      const managedRuntime = runtimeResolution.managedRuntime;
      const command = buildManagedPackageCommand(processCommand, managedRuntime);
      return {
        available: true,
        kind: 'process',
        label: processCommand.label,
        framework: processCommand.framework,
        command,
        managedRuntime,
        runtime: runtimeResolution.runtime,
        reason: runtimeResolution.reason,
      };
    }

    if (processCommand.framework === 'PHP' || processCommand.command === 'php') {
      const managedRuntime = runtimeResolution.managedRuntime;
      const command = buildManagedPhpCommand(managedRuntime);
      return {
        available: true,
        kind: 'process',
        label: command.label,
        framework: command.framework,
        command,
        managedRuntime,
        runtime: runtimeResolution.runtime,
        reason: runtimeResolution.reason,
      };
    }

    if (!runtimeResolution.available) {
      return {
        available: false,
        kind: 'process',
        label: processCommand.label,
        framework: processCommand.framework,
        command: processCommand,
        missingRuntime: processCommand.command,
        runtime: runtimeResolution.runtime,
        reason: runtimeResolution.reason,
      };
    }

    return {
      available: true,
      kind: 'process',
      label: processCommand.label,
      framework: processCommand.framework,
      command: processCommand,
      runtime: runtimeResolution.runtime,
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
    command: publicCommand(session.command),
    runtime: session.runtime || null,
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
  const publicLiveViewSession = publicSession(session);
  return {
    target,
    session: publicLiveViewSession,
    environment: buildLiveViewEnvironment({ target, session: publicLiveViewSession }),
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
        custom: true,
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
      runtime: null,
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
    runtimeStatus = await ensureManagedRuntime(runtimeStatus.id, {
      preferManaged: runtimeStatus.id === 'frankenphp' || runtimeStatus.id === 'npm',
    });
    if (runtimeStatus.id === 'frankenphp') {
      targetCommand = buildManagedPhpCommand(runtimeStatus);
    } else if (runtimeStatus.id === 'npm') {
      targetCommand = buildManagedPackageCommand(targetCommand, runtimeStatus);
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
    runtime: target.runtime || null,
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
    ...buildCliSpawnEnv(process.env),
    ...(command.env || {}),
    ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    NODE_ENV: 'development',
    PORT: String(port),
    HOST: '127.0.0.1',
    VITE_HOST: '127.0.0.1',
    VITE_PORT: String(port),
    BROWSER: 'none',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const spawnEnv = applyManagedRuntimeEnv(env, runtimeStatus);

  sessionsByProject.set(projectName, session);
  sessionsByShareId.set(shareId, session);

  try {
    await preparePackageDependencies(projectPath, command, spawnEnv, (line) => appendLog(session, line));
  } catch (error) {
    session.status = 'error';
    session.stoppedAt = new Date().toISOString();
    session.error = error instanceof Error ? error.message : String(error);
    appendLog(session, session.error);
    return publicSession(session);
  }

  const child = spawn(command.command, command.args, {
    cwd: projectPath,
    env: spawnEnv,
    shell: shouldUseShell(command),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  session.child = child;

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
