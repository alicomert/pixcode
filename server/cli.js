#!/usr/bin/env node
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { ask, box, c, choose, closePrompts, confirm, isInteractive } from './cli-ui.js'
import { cliConfigExists, readCliConfig, resolvePort, validPort, writeCliConfig } from './cli-config.js'

function usage() {
  console.log(`pixcode
Usage: pixcode <command>

Commands:
  (none)                                Interactive dashboard
  start [--port N] [--workspace PATH]  Start the server in the foreground
  daemon <command>                     Manage the background server
  settings [set <key> <value>]         View or change CLI settings
  update [--check] [--yes]             Update from npm or the git repo
  status                                Show server health
  version                               Print version`)
}

function lanIps() {
  return Object.values(os.networkInterfaces()).flatMap((items) => (items || [])
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address))
}

function parseStartArgs(args) {
  const options = {}
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--port') {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error('--port requires a value')
      options.port = Number(value)
    } else if (args[i] === '--workspace') {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error('--workspace requires a value')
      options.workspace = value
    }
    else throw new Error(`unknown option: ${args[i]}`)
  }
  if (options.port !== undefined && !validPort(options.port)) throw new Error('invalid port')
  return options
}

function parseDaemonArgs(args) {
  const options = {}
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i]
    if (value === '--port') {
      const next = args[++i]
      if (!next || next.startsWith('--')) throw new Error('--port requires a value')
      options.port = Number(next)
    } else if (value === '--workspace') {
      const next = args[++i]
      if (!next || next.startsWith('--')) throw new Error('--workspace requires a value')
      options.workspace = next
    } else if (value === '--mode') {
      const next = args[++i]
      if (!next || next.startsWith('--')) throw new Error('--mode requires a value')
      options.mode = next
    }
    else if (value === '--json') options.json = true
    else throw new Error(`unknown option: ${value}`)
  }
  if (options.port !== undefined && !validPort(options.port)) throw new Error('invalid port')
  if (options.mode && !['auto', 'system', 'user', 'desktop'].includes(options.mode)) throw new Error('invalid daemon mode')
  return options
}

function printDaemonResult(result, json = false) {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (result.message) console.log(result.message)
  if (result.pid) console.log(`pid: ${result.pid}`)
  if (result.port) console.log(`port: ${result.port}`)
  if (result.logFile) console.log(`log: ${result.logFile}`)
  if (result.service) console.log(`autostart: ${result.service.enabled ? `enabled (${result.service.mode})` : 'disabled'}`)
}

// What is living on this port right now? Friendly wording for the three
// possible answers: our daemon, a pixcode we do not manage, a foreign app.
async function describePort(port) {
  const { healthProbe } = await import('./daemon.js')
  const probe = await healthProbe(port)
  if (!probe.occupied) return { kind: 'free', probe }
  if (probe.pixcode) return { kind: 'pixcode', probe }
  return { kind: 'foreign', probe }
}

function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try { spawn(opener, args, { detached: true, stdio: 'ignore' }).unref() } catch { void 0 }
}

// --- interactive home -----------------------------------------------------

async function home() {
  const { daemonStatus, stopDaemon, startDaemon, readDaemonLog } = await import('./daemon.js')
  const settings = readCliConfig()
  const port = resolvePort()
  const status = await daemonStatus({ port })

  if (!isInteractive()) {
    printDaemonResult(status)
    return
  }

  const rows = [
    `status     ${status.running ? c.ok('● running') : c.dim('○ stopped')}${status.pid ? c.dim(` · pid ${status.pid}`) : ''}`,
    `port       ${status.port}`,
    `autostart  ${status.service.enabled ? c.ok(`enabled (${status.service.mode})`) : c.dim('disabled')}`
  ]
  if (status.listening) {
    rows.push(`local      ${c.cyan(`http://localhost:${status.port}`)}`)
    for (const ip of lanIps()) rows.push(`lan        ${c.cyan(`http://${ip}:${status.port}`)}`)
  }
  if (!status.listening && status.running) rows.push(c.warn('daemon alive but not listening yet — check `pixcode daemon logs`'))
  box(`pixcode ${c.accent('v' + status.version)}`, rows)
  console.log('')

  for (;;) {
    const action = await choose('what next?', [
      { value: 'start', label: status.running ? 'Restart daemon' : 'Start daemon' },
      { value: 'install', label: 'Install autostart', hint: status.service.enabled ? 'already enabled' : 'survives reboot' },
      { value: 'open', label: 'Open in browser', hint: status.listening ? `localhost:${status.port}` : 'server is down' },
      { value: 'settings', label: 'Settings', hint: `${settings.port}${settings.workspace ? ` · ${settings.workspace}` : ''}` },
      { value: 'update', label: 'Check for updates' },
      { value: 'logs', label: 'View logs', hint: 'last 20 lines' },
      { value: 'stop', label: 'Stop daemon' }
    ], { defaultValue: 'open' })

    if (action === null || action === 'back') break
    if (action === 'open') {
      if (status.listening) openBrowser(`http://localhost:${status.port}`)
      else console.log(`  ${c.warn('server is not listening — start it first')}`)
    } else if (action === 'start') {
      if (status.running) await stopDaemon()
      const result = await startDaemon({ port: settings.port, workspace: settings.workspace })
      console.log(`  ${result.listening ? c.ok('✓') : c.warn('!')} ${result.message}`)
      Object.assign(status, result)
    } else if (action === 'stop') {
      await stopDaemon()
      console.log(`  ${c.ok('✓')} daemon stopped`)
      break
    } else if (action === 'install') {
      await installFlow({})
      break
    } else if (action === 'settings') {
      await settingsFlow()
      break
    } else if (action === 'update') {
      await updateFlow({})
    } else if (action === 'logs') {
      const output = readDaemonLog().trim().split('\n').slice(-20).join('\n')
      console.log(output ? `\n${c.dim(output)}\n` : `  ${c.dim('log is empty')}`)
    }
  }
  closePrompts()
}

// --- first-run wizard ------------------------------------------------------

// Runs once before `daemon install` when the operator has not chosen a port
// yet. Skipped entirely for --json, flags, or non-TTY callers.
async function firstRunWizard(options) {
  if (!isInteractive() || options.json || options.port || cliConfigExists()) return options
  const settings = readCliConfig()
  console.log(`\n  ${c.bold('pixcode setup')} ${c.dim('— first run, two questions')}\n`)

  let port = settings.port
  for (;;) {
    const answer = await ask('port', String(port))
    const candidate = validPort(answer)
    if (!candidate) { console.log(`  ${c.err('not a valid port')}`); continue }
    const holder = await describePort(candidate)
    if (holder.kind === 'free') { port = candidate; break }
    if (holder.kind === 'pixcode') {
      console.log(`  ${c.ok('✓')} pixcode is already serving on :${candidate} (v${holder.probe.version || '?'}) — reusing it`)
      port = candidate
      break
    }
    console.log(`  ${c.warn(`:${candidate} is used by another app — pick a different port`)}`)
    port = candidate + 1
  }

  const autostart = await confirm('start pixcode automatically at login?', settings.autostart)
  const next = writeCliConfig({ port, autostart })
  console.log(`  ${c.dim(`saved → ${next ? 'cli.json' : ''}`)}\n`)
  return { ...options, port, _wizard: true, _autostart: autostart }
}

async function installFlow(options) {
  const { installAutostart, removeAutostart, startDaemon } = await import('./daemon.js')
  const settings = readCliConfig()
  const port = resolvePort(options.port)
  const wantAutostart = options._autostart ?? settings.autostart
  const service = wantAutostart
    ? installAutostart({ port, workspace: options.workspace ?? settings.workspace, mode: options.mode || 'auto' })
    : removeAutostart()
  const started = await startDaemon({ port, workspace: options.workspace ?? settings.workspace })
  const result = { ...started, service, message: wantAutostart ? 'autostart enabled and daemon started' : 'daemon started (autostart off)' }
  if (options.json) printDaemonResult(result, true)
  else {
    printDaemonResult(result)
    if (started.listening) console.log(`\n  ${c.cyan(`→ http://localhost:${port}`)}`)
  }
  return result
}

// --- settings ---------------------------------------------------------------

async function settingsFlow() {
  const { daemonStatus, installAutostart, removeAutostart, stopDaemon, startDaemon } = await import('./daemon.js')

  const apply = async (label) => {
    const settings = readCliConfig()
    const status = await daemonStatus({ port: settings.port })
    if (settings.autostart) installAutostart({ port: settings.port, workspace: settings.workspace })
    else removeAutostart()
    if (status.running) {
      await stopDaemon()
      await startDaemon({ port: settings.port, workspace: settings.workspace })
      console.log(`  ${c.ok('✓')} ${label} — daemon restarted on :${settings.port}`)
    } else {
      console.log(`  ${c.ok('✓')} ${label}`)
    }
  }

  if (!isInteractive()) {
    console.log(JSON.stringify(readCliConfig(), null, 2))
    return
  }

  for (;;) {
    const settings = readCliConfig()
    const status = await daemonStatus({ port: settings.port })
    box('settings', [
      `port       ${settings.port}${status.listening ? c.dim(' · listening') : ''}`,
      `workspace  ${settings.workspace || c.dim('(managed projects)')}`,
      `autostart  ${settings.autostart ? 'on' : 'off'}${status.service.enabled ? c.dim(` · ${status.service.mode}`) : ''}`
    ])
    console.log('')
    const pick = await choose('change what?', [
      { value: 'port', label: 'Port' },
      { value: 'workspace', label: 'Pinned workspace' },
      { value: 'autostart', label: `Autostart ${settings.autostart ? 'off' : 'on'}` },
      { value: 'back', label: 'Back' }
    ], { defaultValue: 'back' })
    if (pick === null || pick === 'back') break

    if (pick === 'autostart') {
      writeCliConfig({ autostart: !settings.autostart })
      await apply(`autostart ${settings.autostart ? 'off' : 'on'}`)
      continue
    }
    if (pick === 'workspace') {
      const value = await ask('absolute path (empty = managed projects)', settings.workspace || '')
      writeCliConfig({ workspace: value || null })
      await apply('workspace updated')
      continue
    }
    if (pick === 'port') {
      const answer = await ask('new port', String(settings.port))
      const candidate = validPort(answer)
      if (!candidate) { console.log(`  ${c.err('not a valid port')}`); continue }
      const holder = await describePort(candidate)
      if (holder.kind === 'foreign') { console.log(`  ${c.err(`:${candidate} is used by another app`)}`); continue }
      if (holder.kind === 'pixcode' && candidate !== settings.port) {
        console.log(`  ${c.warn(`:${candidate} already runs a pixcode — point the daemon there? no, pick a free port`)}`)
        continue
      }
      writeCliConfig({ port: candidate })
      await apply(`port → ${candidate}`)
    }
  }
}

async function settingsCommand(args) {
  if (args[0] === 'set') {
    const [key, ...rest] = args.slice(1)
    const value = rest.join(' ')
    if (key === 'port') {
      const port = validPort(value)
      if (!port) throw new Error('settings set port <1-65535>')
      writeCliConfig({ port })
    } else if (key === 'workspace') {
      writeCliConfig({ workspace: value || null })
    } else if (key === 'autostart') {
      if (!['on', 'off', 'true', 'false'].includes(value)) throw new Error('settings set autostart on|off')
      writeCliConfig({ autostart: value === 'on' || value === 'true' })
    } else {
      throw new Error('known keys: port, workspace, autostart')
    }
    console.log('saved. Restart the daemon to apply: pixcode daemon restart')
    return
  }
  await settingsFlow()
}

// --- update ------------------------------------------------------------------

async function updateFlow(options) {
  const { checkForUpdate, applyUpdate, installMode, RELEASE_PAGE } = await import('./update.js')
  const info = await checkForUpdate()
  box('update', [
    `current    ${info.current}`,
    `npm        ${info.npm || c.dim('unreachable')}`,
    `github     ${info.github ? 'v' + info.github : c.dim('unreachable')}`,
    `channel    ${installMode()}`
  ])
  console.log('')
  if (!info.updateAvailable) {
    console.log(`  ${c.ok('✓')} already on the latest release`)
    return
  }
  console.log(`  ${c.accent('→')} ${c.bold('v' + info.latest)} available`)
  const go = options.yes || !isInteractive()
    ? options.yes
    : await confirm('install it now?', true)
  if (!go) {
    console.log(`  ${c.dim(RELEASE_PAGE)}`)
    return
  }
  const result = await applyUpdate({ restartDaemon: true })
  console.log(`  ${c.ok('✓')} updated via ${result.mode} (${result.steps.join(', ')})`)
}

// --- daemon command ----------------------------------------------------------

async function daemonCommand(args) {
  const command = args[0] || 'status'
  const options = parseDaemonArgs(args.slice(1))
  if (options.port) process.env.PORT = String(options.port)
  if (options.workspace) process.env.PIXCODE_WORKSPACE = options.workspace
  const { config } = await import('./config.js')
  const { daemonStatus, healthProbe, readDaemonLog, removeAutostart, runDaemonForeground, startDaemon, stopDaemon } = await import('./daemon.js')
  const port = options.port || readCliConfig().port || config.port
  if (command === 'run') {
    // Internal foreground entrypoint used by systemd, LaunchAgents, the
    // startup folder, and `daemon start`. It must never fork another child.
    await runDaemonForeground({ port, workspace: options.workspace })
    return
  }
  if (command === 'start') {
    const result = await startDaemon({ port, workspace: options.workspace })
    if (!result.started && result.listening && !options.json) {
      const probe = await healthProbe(port)
      if (probe.pixcode) {
        console.log(`pixcode is already serving on :${port}${probe.version ? ` (v${probe.version})` : ''}`)
        console.log(`→ http://localhost:${port}  ·  restart with \`pixcode daemon restart\``)
        return
      }
      console.log(`${c.warn(`port ${port} is held by another app`)} — pick another: ${c.cyan(`pixcode daemon start --port ${port + 1}`)}`)
      return
    }
    printDaemonResult(result, options.json)
    return
  }
  if (command === 'stop') {
    printDaemonResult(await stopDaemon(), options.json)
    return
  }
  if (command === 'restart') {
    await stopDaemon()
    printDaemonResult(await startDaemon({ port, workspace: options.workspace }), options.json)
    return
  }
  if (command === 'install' || command === 'enable') {
    const merged = await firstRunWizard(options)
    await installFlow(merged)
    return
  }
  if (command === 'uninstall' || command === 'disable') {
    const service = removeAutostart()
    const stopped = await stopDaemon()
    printDaemonResult({ ...stopped, service, message: 'autostart disabled and daemon stopped' }, options.json)
    return
  }
  if (command === 'status') {
    printDaemonResult(await daemonStatus({ port }), options.json)
    return
  }
  if (command === 'logs') {
    const output = readDaemonLog()
    if (options.json) console.log(JSON.stringify({ output }, null, 2))
    else process.stdout.write(output || 'daemon log is empty\n')
    return
  }
  throw new Error(`unknown daemon command: ${command}`)
}

// --- entry -------------------------------------------------------------------

async function main() {
  const command = process.argv[2]
  const args = process.argv.slice(3)
  if (!command) {
    await home()
    return
  }
  if (command === 'version') {
    const { VERSION } = await import('./config.js')
    console.log(VERSION)
    return
  }
  if (command === 'daemon') {
    await daemonCommand(args)
    return
  }
  if (command === 'settings' || command === 'config') {
    await settingsCommand(args)
    return
  }
  if (command === 'update' || command === 'upgrade') {
    const options = { check: args.includes('--check'), yes: args.includes('--yes') || args.includes('-y') }
    if (options.check) {
      const { checkForUpdate } = await import('./update.js')
      console.log(JSON.stringify(await checkForUpdate(), null, 2))
      return
    }
    await updateFlow(options)
    return
  }
  if (command === 'status') {
    const { config } = await import('./config.js')
    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/api/health`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      console.log(await response.text())
    } catch (error) {
      console.error(`server not running: ${error.message}`)
      process.exitCode = 1
    }
    return
  }
  if (command !== 'start') {
    usage()
    process.exitCode = 1
    return
  }
  const options = parseStartArgs(args)
  const { config } = await import('./config.js')
  // config.js was already loaded by cli-config's top-level import, so the env
  // vars below are frozen — apply flags onto the live config object instead.
  if (options.workspace) config.workspace = path.resolve(options.workspace)
  const port = resolvePort(options.port) || config.port
  const holder = await describePort(port)
  if (holder.kind === 'pixcode') {
    console.log(`pixcode is already serving on :${port} (v${holder.probe.version || '?'})`)
    console.log(`→ http://localhost:${port}  ·  manage it with \`pixcode\` or \`pixcode daemon restart\``)
    return
  }
  if (holder.kind === 'foreign') {
    console.error(`port ${port} is used by another app — pick another: pixcode start --port ${port + 1}`)
    process.exitCode = 1
    return
  }
  const { startServer } = await import('./index.js')
  // config.js was loaded before --port set env.PORT, so pass the resolved
  // port explicitly — config.port alone would always bind the default.
  const server = startServer({ port })
  server.once('listening', () => {
    const bound = Number(server.address()?.port || port)
    for (const ip of lanIps()) console.log(`mobile: http://${ip}:${bound}`)
  })
}

main().catch((error) => {
  closePrompts()
  console.error(error.message)
  process.exitCode = 1
})
