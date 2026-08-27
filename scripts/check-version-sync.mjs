#!/usr/bin/env node

/** Fail when npm, lockfile, Tauri, or Cargo versions drift apart. */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
const packageJson = await readJson('package.json')
const lockJson = await readJson('package-lock.json')
const tauriJson = await readJson('src-tauri/tauri.conf.json')
const cargo = await readFile(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8')
const config = await readFile(path.join(root, 'server', 'config.js'), 'utf8')
const updater = await readFile(path.join(root, 'src', 'lib', 'updater.js'), 'utf8')

const packageVersion = packageJson.version
const cargoLines = cargo.split('\n')
const packageStart = cargoLines.findIndex((line) => line.trim() === '[package]')
const nextSection = cargoLines.findIndex((line, index) => index > packageStart && /^\s*\[[^\]]+\]/.test(line))
const packageEnd = nextSection === -1 ? cargoLines.length : nextSection
const cargoPackage = packageStart === -1 ? '' : cargoLines.slice(packageStart, packageEnd).join('\n')
const cargoVersion = cargoPackage.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const configVersion = config.match(/export const VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1]
const updaterVersion = updater.match(/export const CURRENT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1]

const expected = [
  ['package.json', packageVersion],
  ['package-lock.json', lockJson.version],
  ['package-lock.json packages[""].version', lockJson.packages?.['']?.version],
  ['src-tauri/tauri.conf.json', tauriJson.version],
  ['src-tauri/Cargo.toml', cargoVersion],
  ['server/config.js VERSION', configVersion],
  ['src/lib/updater.js CURRENT_VERSION', updaterVersion],
]
const mismatches = expected.filter(([, value]) => value !== packageVersion)
if (mismatches.length) {
  for (const [file, value] of mismatches) console.error(file + ': ' + (value ?? '(missing)') + ' (expected ' + packageVersion + ')')
  process.exitCode = 1
}

const tagIndex = process.argv.indexOf('--tag')
if (tagIndex !== -1) {
  const tag = process.argv[tagIndex + 1]
  if (!tag) throw new Error('--tag requires a value')
  const tagVersion = tag.startsWith('v') ? tag.slice(1) : tag
  if (tagVersion !== packageVersion) {
    console.error('Release tag ' + tag + ' does not match package version ' + packageVersion)
    process.exitCode = 1
  }
}

if (process.exitCode) process.exit()
console.log('Version sync OK: ' + packageVersion)
