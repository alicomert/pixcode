import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Tauri does not ship Node or npm dependencies for us.  Stage only the
// production runtime before a desktop build so the installed app can start
// its local HTTP/WebSocket server without requiring Node on PATH.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stageRoot = path.join(root, '.desktop-resources', 'pixcode')
const copy = (source, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(source, destination, { recursive: true, dereference: false })
}

fs.rmSync(stageRoot, { recursive: true, force: true })
fs.mkdirSync(stageRoot, { recursive: true })
copy(path.join(root, 'server'), path.join(stageRoot, 'server'))
copy(path.join(root, 'dist'), path.join(stageRoot, 'dist'))

const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
copy(process.execPath, path.join(stageRoot, nodeName))
if (process.platform !== 'win32') fs.chmodSync(path.join(stageRoot, nodeName), 0o755)

const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
const packagePaths = Object.entries(lock.packages || {})
  .filter(([relative, metadata]) => relative && metadata?.dev !== true)
  .map(([relative]) => path.join(root, relative))
  .filter((value) => fs.existsSync(value))
if (!packagePaths.length) {
  throw new Error('could not resolve production dependencies from package-lock.json')
}

for (const packagePath of packagePaths) {
  if (path.resolve(packagePath) === root) continue
  const relative = path.relative(root, packagePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue
  copy(packagePath, path.join(stageRoot, relative))
}

// node-pty publishes binaries for every OS, architecture, Node ABI, and
// libc variant in one package. Shipping all of them makes linuxdeploy scan
// the musl binaries too; a glibc AppImage then fails because libc.musl is not
// present on the runner. Keep only the host tuple (the bundle cannot execute
// another architecture anyway) and remove musl variants from Linux bundles.
const prebuildRoot = path.join(stageRoot, 'node_modules', '@homebridge', 'node-pty-prebuilt-multiarch', 'prebuilds')
if (fs.existsSync(prebuildRoot)) {
  const hostPrebuild = `${process.platform}-${process.arch}`
  for (const entry of fs.readdirSync(prebuildRoot)) {
    if (entry !== hostPrebuild) fs.rmSync(path.join(prebuildRoot, entry), { recursive: true, force: true })
  }
  if (process.platform === 'linux') {
    for (const entry of fs.readdirSync(path.join(prebuildRoot, hostPrebuild), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.musl.node')) fs.rmSync(path.join(prebuildRoot, hostPrebuild, entry.name), { force: true })
    }
  }
}

const bytes = (filePath) => {
  try {
    const stat = fs.statSync(filePath)
    if (stat.isFile()) return stat.size
    return fs.readdirSync(filePath).reduce((total, entry) => total + bytes(path.join(filePath, entry)), 0)
  } catch {
    return 0
  }
}
const sizeMb = (bytes(stageRoot) / 1024 / 1024).toFixed(1)
console.log(`desktop runtime staged at ${path.relative(root, stageRoot)} (${sizeMb} MiB, ${os.platform()} ${os.arch()})`)
