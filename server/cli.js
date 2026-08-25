#!/usr/bin/env node
import os from 'node:os'
function usage() {
  console.log(`pixcode
Usage: pixcode <command>

Commands:
  start [--port N] [--workspace PATH]  Start the server
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
    if (args[i] === '--port') options.port = Number(args[++i])
    else if (args[i] === '--workspace') options.workspace = args[++i]
    else throw new Error(`unknown option: ${args[i]}`)
  }
  if (options.port && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) throw new Error('invalid port')
  return options
}

async function main() {
  const command = process.argv[2] || 'start'
  const args = process.argv.slice(3)
  if (command === 'version') {
    const { VERSION } = await import('./config.js')
    console.log(VERSION)
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
  startServer()
  for (const ip of lanIps()) console.log(`mobile: http://${ip}:${config.port}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
