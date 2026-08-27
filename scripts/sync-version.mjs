#!/usr/bin/env node

/**
 * Keep the package version as the single source of truth for all distributable
 * manifests. npm runs this file through its version lifecycle hook after it
 * updates package.json and package-lock.json, and it can also be run manually
 * with npm run version:sync.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')
const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json')
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml')
const configPath = path.join(root, 'server', 'config.js')

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
const version = packageJson.version

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Invalid package version: ' + version)
}

const writeJsonIfChanged = async (filePath, value) => {
  const current = await readFile(filePath, 'utf8')
  const next = JSON.stringify(value, null, 2) + '\n'
  if (current !== next) await writeFile(filePath, next)
}

// npm normally updates this field itself. Updating it here also makes a
// manually edited package.json safe before the next npm install/publish.
const lockJson = JSON.parse(await readFile(lockPath, 'utf8'))
let lockChanged = false
if (lockJson.version !== version) {
  lockJson.version = version
  lockChanged = true
}
if (lockJson.packages?.[''] && lockJson.packages[''].version !== version) {
  lockJson.packages[''].version = version
  lockChanged = true
}
if (lockChanged) await writeJsonIfChanged(lockPath, lockJson)

const tauriJson = JSON.parse(await readFile(tauriPath, 'utf8'))
if (tauriJson.version !== version) {
  tauriJson.version = version
  await writeJsonIfChanged(tauriPath, tauriJson)
}

const cargo = await readFile(cargoPath, 'utf8')
const cargoLines = cargo.split('\n')
const packageStart = cargoLines.findIndex((line) => line.trim() === '[package]')
const nextSection = cargoLines.findIndex((line, index) => index > packageStart && /^\s*\[[^\]]+\]/.test(line))
const packageEnd = nextSection === -1 ? cargoLines.length : nextSection
if (packageStart === -1) throw new Error('Missing [package] section in ' + cargoPath)
const packageText = cargoLines.slice(packageStart, packageEnd).join('\n')
const packageVersion = packageText.match(/^version\s*=\s*"([^"]+)"/m)
if (!packageVersion) throw new Error('Missing package version in ' + cargoPath)
if (packageVersion[1] !== version) {
  const updatedSection = packageText.replace(
    /^(version\s*=\s*)"[^"]+"/m,
    '$1"' + version + '"',
  )
  await writeFile(cargoPath, cargo.replace(packageText, updatedSection))
}

const config = await readFile(configPath, 'utf8')
const configVersion = config.match(/export const VERSION\s*=\s*['"]([^'"]+)['"]/)
if (!configVersion) throw new Error('Missing VERSION export in ' + configPath)
if (configVersion[1] !== version) {
  await writeFile(configPath, config.replace(/(export const VERSION\s*=\s*)['"][^'"]+['"]/, '$1' + JSON.stringify(version)))
}

console.log('Synchronized release manifests to ' + version)
