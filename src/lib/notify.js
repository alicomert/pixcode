import { ws } from './ws.js'
import { workspace } from '../state/app.js'

// Agent-finished notifications: a lightweight global activity watcher that
// turns `agent exit`/`handoff` records into browser Notifications, a short
// chime, and a title-bar dot. The server-side webhook covers "away from the
// desk"; this covers "app is open in another tab".
const PREF_KEY = 'pixcode.notify'
const CHIME_FREQ = 880
const CHIME_MS = 90

let armed = false
let unsubscribe = null
let audioContext = null
let titleFlashed = false
let baseTitle = ''

export function notificationsEnabled() {
  return typeof Notification !== 'undefined'
    && Notification.permission === 'granted'
    && localStorage.getItem(PREF_KEY) === '1'
}

export async function setNotificationsEnabled(on) {
  if (!on) {
    localStorage.setItem(PREF_KEY, '0')
    return true
  }
  if (typeof Notification === 'undefined') return false
  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission().catch(() => 'denied')
    if (result !== 'granted') return false
  }
  localStorage.setItem(PREF_KEY, '1')
  arm()
  return true
}

// Called once at app start: re-arms a previously granted preference.
export function initNotifications() {
  if (notificationsEnabled()) arm()
}

function arm() {
  if (armed) return
  armed = true
  subscribe()
  window.addEventListener('pixcode:workspace-change', subscribe)
  window.addEventListener('pixcode:ws-open', subscribe)
  window.addEventListener('focus', clearTitle)
  baseTitle = document.title
}

function subscribe() {
  ws.request('activity', 'watch', { workspace: workspace.value?.path || '' }).catch(() => {})
  if (!unsubscribe) unsubscribe = ws.on('activity', 'event', onEvent)
}

function onEvent(data) {
  const entry = data?.entry
  if (!entry) return
  let title = ''
  let body = ''
  if (entry.kind === 'agent' && entry.action === 'exit') {
    title = `${entry.agent || 'Agent'} #${entry.index || 1} finished`
    body = `session ended (code ${entry.exitCode ?? '?'})${entry.user ? ` · ${entry.user}` : ''}`
  } else if (entry.kind === 'agent' && entry.action === 'handoff') {
    title = `${entry.agent || 'Agent'} wrote a handoff`
    body = entry.user ? `by ${entry.user}` : 'ready to continue'
  } else {
    return
  }
  fire(title, body)
}

function fire(title, body) {
  try {
    const note = new Notification(title, { body, tag: 'pixcode-agent', icon: '/icons/icon-128x128.png' })
    note.onclick = () => { window.focus(); note.close() }
  } catch { void 0 }
  chime()
  flashTitle()
}

function chime() {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.frequency.value = CHIME_FREQ
    gain.gain.setValueAtTime(0.06, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + CHIME_MS / 1000)
    osc.connect(gain).connect(audioContext.destination)
    osc.start()
    osc.stop(audioContext.currentTime + CHIME_MS / 1000)
  } catch { void 0 }
}

function flashTitle() {
  if (titleFlashed || document.hasFocus()) return
  titleFlashed = true
  document.title = `• ${baseTitle}`
}

function clearTitle() {
  if (!titleFlashed) return
  titleFlashed = false
  document.title = baseTitle
}
