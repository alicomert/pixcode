import { readCliConfig } from './cli-config.js'

// Outbound webhook for "the agent is done" moments. The URL resolves at send
// time — env override first, then `pixcode settings set webhook <url>` — so a
// config change reaches the running daemon without a restart. Any endpoint
// that accepts a JSON POST works: ntfy.sh topics, Discord/Slack incoming
// webhooks, or a custom bridge.
const TIMEOUT_MS = 5_000

function webhookUrl() {
  const env = process.env.PIXCODE_NOTIFY_WEBHOOK
  if (env) return env
  try { return readCliConfig().webhook || '' } catch { return '' }
}

export function notifyWebhook(kind, { title, body, workspace } = {}) {
  const url = webhookUrl()
  if (!url) return
  const payload = JSON.stringify({ source: 'pixcode', kind, title, body, workspace: String(workspace || ''), ts: Date.now() })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  timer.unref?.()
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': `pixcode/${process.env.PIXCODE_VERSION || 'daemon'}` },
    body: payload,
    signal: controller.signal
  }).catch(() => {}).finally(() => clearTimeout(timer))
}
