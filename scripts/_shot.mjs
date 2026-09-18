// CDP screenshot driver: open Pixcode, optionally run JS, capture a shot.
// Usage: node scripts/_shot.mjs <out.png> [evalJs] [waitMs] [widthxheight]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import WebSocket from 'ws'

const [, , out = '/tmp/shot.png', evalJs = '', waitMs = '2500', size = '1440x900'] = process.argv
const [w, h] = size.split('x').map(Number)
const PORT = 9333 + Math.floor(Math.random() * 400)

const chrome = spawn('google-chrome', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--window-size=${w},${h}`, 'about:blank'
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const getJson = (path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
    let data = ''; res.on('data', (chunk) => { data += chunk })
    res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
  }).on('error', reject)
})

let id = 0
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id
    const onMsg = (raw) => {
      const msg = JSON.parse(raw)
      if (msg.id === mid) { ws.off('message', onMsg); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result) }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}

try {
  let targets = null
  for (let i = 0; i < 40; i++) { try { targets = await getJson('/json/list'); if (targets.length) break } catch { await sleep(250) } }
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 })
  await new Promise((resolve) => ws.on('open', resolve))
  await send(ws, 'Page.enable')
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 })
  await send(ws, 'Page.navigate', { url: 'http://127.0.0.1:3001/seed.html' })
  await sleep(4500)
  if (evalJs) {
    await send(ws, 'Runtime.evaluate', { expression: evalJs, awaitPromise: true })
    await sleep(Number(waitMs))
  } else {
    await sleep(Number(waitMs) - 3500 > 0 ? Number(waitMs) - 3500 : 500)
  }
  const { data } = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(out, Buffer.from(data, 'base64'))
  console.log('wrote', out)
  ws.close()
} finally {
  chrome.kill('SIGKILL')
}
