#!/usr/bin/env node
import os from 'node:os'

function usage() {
  console.log(`pixcode
Usage: pixcode <command>

Commands:
  start [--port N] [--workspace PATH]  Start the server
  daemon <command>                     Manage the background server
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
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) throw new Error('invalid port')
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
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) throw new Error('invalid port')
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

async function daemonCommand(args) {
  const command = args[0] || 'status'
  const options = parseDaemonArgs(args.slice(1))
  if (options.port) process.env.PORT = String(options.port)
  if (options.workspace) process.env.PIXCODE_WORKSPACE = options.workspace
  const { config } = await import('./config.js')
  const { daemonStatus, installAutostart, readDaemonLog, removeAutostart, runDaemonForeground, startDaemon, stopDaemon } = await import('./daemon.js')
  const port = options.port || config.port
  if (command === 'run') {
    // Internal foreground entrypoint used by systemd, LaunchAgents, the
    // startup folder, and `daemon start`. It must never fork another child.
    await runDaemonForeground({ port, workspace: options.workspace })
    return
  }
  if (command === 'start') {
    printDaemonResult(await startDaemon({ port, workspace: options.workspace }), options.json)
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
    const service = installAutostart({ port, workspace: options.workspace, mode: options.mode || 'auto' })
    const started = await startDaemon({ port, workspace: options.workspace })
    printDaemonResult({ ...started, service, message: 'autostart enabled and daemon started' }, options.json)
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

async function main() {
  const command = process.argv[2] || 'start'
  const args = process.argv.slice(3)
  if (command === 'version') {
    const { VERSION } = await import('./config.js')
    console.log(VERSION)
    return
  }
  if (command === 'daemon') {
    await daemonCommand(args)
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
  if (options.port) process.env.PORT = String(options.port)
  if (options.workspace) process.env.PIXCODE_WORKSPACE = options.workspace
  const { config } = await import('./config.js')
  const { startServer } = await import('./index.js')
  const server = startServer()
  server.once('listening', () => {
    for (const ip of lanIps()) console.log(`mobile: http://${ip}:${config.port}`)
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
