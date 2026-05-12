import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { buildCliSpawnEnv, findExecutableOnPath, resolveNpmCommand } from './install-jobs.js';
import { getManagedRuntimeStatus } from './managed-runtimes.js';

const RUNTIME_CHECK_TIMEOUT_MS = 1800;

export const RUNTIME_DEFINITIONS = {
  node: {
    id: 'node',
    name: 'Node.js',
    commands: ['node'],
    versionArgs: ['--version'],
    installAction: 'Install Node.js 22 or newer and ensure node is available on PATH.',
  },
  npm: {
    id: 'npm',
    name: 'Node package runner',
    commands: ['npm'],
    versionArgs: ['--version'],
    managedRuntimeId: 'npm',
    installAction: 'Install Node.js/npm or let Pixcode prepare its managed Node package runner.',
  },
  php: {
    id: 'php',
    name: 'PHP',
    commands: ['php'],
    versionArgs: ['--version'],
    managedRuntimeId: 'frankenphp',
    installAction: 'Install PHP or let Pixcode prepare its managed PHP runtime.',
  },
  python: {
    id: 'python',
    name: 'Python',
    commands: process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'],
    versionArgs: ['--version'],
    installAction: 'Install Python 3 and ensure python3 or python is available on PATH.',
  },
  go: {
    id: 'go',
    name: 'Go',
    commands: ['go'],
    versionArgs: ['version'],
    installAction: 'Install Go and ensure go is available on PATH.',
  },
  java: {
    id: 'java',
    name: 'Java',
    commands: ['java'],
    versionArgs: ['-version'],
    installAction: 'Install a JDK and ensure java is available on PATH.',
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    commands: ['cargo', 'rustc'],
    versionArgs: ['--version'],
    installAction: 'Install Rust with rustup and ensure cargo is available on PATH.',
  },
};

function runtimeDiagnostic(definition, status, detail) {
  if (status === 'available') {
    return {
      message: `${definition.name} is available.`,
      action: 'No action needed.',
    };
  }

  if (status === 'too_old') {
    return {
      message: `${definition.name} is installed but does not meet the required version.`,
      action: definition.installAction,
      detail,
    };
  }

  if (status === 'error') {
    return {
      message: `${definition.name} was found but could not be started.`,
      action: definition.installAction,
      detail,
    };
  }

  return {
    message: `${definition.name} is not available on this machine.`,
    action: definition.installAction,
    detail,
  };
}

function normalizeVersion(output) {
  const match = String(output || '').match(/(?:v|version\s*)?(\d+\.\d+\.\d+)/i);
  return match?.[1];
}

function runVersion(command, args, env) {
  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Ignore a raced process exit.
      }
      finish({ ok: false, error: `${command} version check timed out.` });
    }, RUNTIME_CHECK_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', (error) => {
      finish({ ok: false, error: error.message });
    });
    child.on('exit', (code) => {
      finish({
        ok: code === 0,
        output,
        error: code === 0 ? undefined : `${command} exited with code ${code}.`,
      });
    });
  });
}

function findExecutableOnDeclaredPath(name, env = process.env) {
  const separator = process.platform === 'win32' ? ';' : ':';
  const extensions = process.platform === 'win32'
    ? ['.cmd', '.exe', '.bat', '.ps1', '']
    : [''];
  const pathDirs = (env.PATH || env.Path || '').split(separator).filter(Boolean);
  for (const dir of pathDirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${name}${extension}`);
      try {
        if (candidate && fs.existsSync(candidate)) return candidate;
      } catch {
        // Ignore invalid PATH entries.
      }
    }
  }
  return null;
}

function commandPathForRuntime(id, definition, env, strictPath = false) {
  const spawnEnv = buildCliSpawnEnv(env);
  if (id === 'node') return process.execPath;
  if (id === 'npm') return resolveNpmCommand(spawnEnv);

  for (const command of definition.commands) {
    const executable = strictPath
      ? findExecutableOnDeclaredPath(command, env)
      : findExecutableOnPath(command, spawnEnv);
    if (executable) return executable;
  }
  return null;
}

async function discoverSystemRuntime(id, definition, env, options = {}) {
  const executable = commandPathForRuntime(id, definition, env, Boolean(options.strictPath));
  if (!executable) {
    return {
      id,
      name: definition.name,
      status: 'missing',
      source: 'none',
      installStatus: 'missing',
      diagnostic: runtimeDiagnostic(definition, 'missing'),
    };
  }

  const versionResult = await runVersion(executable, definition.versionArgs, env);
  if (!versionResult.ok) {
    return {
      id,
      name: definition.name,
      status: 'error',
      source: 'system',
      path: executable,
      installStatus: 'installed',
      diagnostic: runtimeDiagnostic(definition, 'error', versionResult.error),
    };
  }

  return {
    id,
    name: definition.name,
    status: 'available',
    source: 'system',
    path: executable,
    version: normalizeVersion(versionResult.output),
    installStatus: 'installed',
    diagnostic: runtimeDiagnostic(definition, 'available'),
  };
}

async function discoverManagedRuntime(id, definition, env, preferManaged) {
  if (!definition.managedRuntimeId || !preferManaged) return null;

  const managedRuntime = await getManagedRuntimeStatus(definition.managedRuntimeId, {
    env,
    preferManaged: true,
  });
  const available = managedRuntime.status === 'installed' || managedRuntime.status === 'system';
  return {
    id,
    name: definition.name,
    status: available ? 'available' : 'missing',
    source: 'managed',
    path: managedRuntime.executablePath,
    version: managedRuntime.version,
    installStatus: managedRuntime.status,
    installable: managedRuntime.installable,
    managedRuntime,
    diagnostic: runtimeDiagnostic(definition, available ? 'available' : 'missing', managedRuntime.reason),
  };
}

export async function discoverRuntime(id, options = {}) {
  const definition = RUNTIME_DEFINITIONS[id];
  if (!definition) {
    return {
      id,
      name: id,
      status: 'unsupported',
      source: 'none',
      installStatus: 'unsupported',
      diagnostic: {
        message: `${id} is not registered in the Pixcode runtime manager.`,
        action: 'Add a runtime definition before using this stack.',
      },
    };
  }

  const env = options.env || process.env;
  const managed = await discoverManagedRuntime(id, definition, env, Boolean(options.preferManaged));
  if (managed) return managed;
  return discoverSystemRuntime(id, definition, env, options);
}

function isPackageManagerCommand(command) {
  return command === 'npm' || command === 'pnpm' || command === 'yarn' || command === 'bun';
}

function runtimeIdForLiveViewCommand(command) {
  if (!command) return null;
  if (isPackageManagerCommand(command.command) || command.packageManager) return 'node';
  if (command.framework === 'PHP' || command.command === 'php') return 'php';
  if (command.framework === 'Django' || command.framework === 'FastAPI' || command.framework === 'Flask') return 'python';
  if (command.framework === 'Go' || command.command === 'go') return 'go';
  if (command.framework === 'Rust' || command.command === 'cargo') return 'rust';
  if (command.framework === 'Java' || command.command === 'java') return 'java';
  return null;
}

export async function resolveLiveViewRuntime(command, options = {}) {
  const env = options.env || process.env;
  const runtimeId = runtimeIdForLiveViewCommand(command);
  if (!runtimeId) {
    return {
      available: true,
      reason: 'No dedicated runtime check is required for this Live View command.',
    };
  }

  if (runtimeId === 'node') {
    const runtime = await discoverRuntime('node', { env });
    const managedRuntime = await getManagedRuntimeStatus('npm', {
      env,
      preferManaged: Boolean(options.preferManaged),
    });
    return {
      available: true,
      runtime,
      managedRuntime,
      reason: managedRuntime.reason || 'Pixcode will run this project with its managed Node package runner.',
    };
  }

  if (runtimeId === 'php') {
    const runtime = await discoverRuntime('php', {
      env,
      preferManaged: Boolean(options.preferManaged),
    });
    return {
      available: Boolean(runtime.managedRuntime?.installable) || runtime.status === 'available',
      runtime,
      managedRuntime: runtime.managedRuntime,
      reason: runtime.managedRuntime?.reason || runtime.diagnostic.message,
    };
  }

  const runtime = await discoverRuntime(runtimeId, { env });
  return {
    available: runtime.status === 'available',
    runtime,
    reason: runtime.status === 'available' ? runtime.diagnostic.message : runtime.diagnostic.action,
  };
}

export const runtimeManager = {
  definitions: RUNTIME_DEFINITIONS,
  discover: discoverRuntime,
  resolveLiveViewRuntime,
};
