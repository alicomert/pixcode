import { useRef } from 'preact/hooks'
import { ChevronDown, ChevronUp } from '../lib/icons.jsx'
import { t } from '../lib/i18n.js'
import { scrollTerminalLines } from '../lib/terminal-touch.js'
import { terminalScrollSpeed } from '../state/app.js'

const HOLD_DELAY_MS = 280
const HOLD_REPEAT_MS = 60
const TAP_LINES = 5

// Floating edge arrows so touch users can scroll a terminal like a mouse
// wheel: tap for a few lines, hold for a continuous repeat. Rendered only on
// coarse-pointer devices — the desktop scrollbar already does this job.
export function TerminalScrollButtons({ hostRef, terminalRef }) {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return null
  const repeat = useRef({ delay: 0, interval: 0 })

  function scroll(direction) {
    scrollTerminalLines(hostRef.current, terminalRef.current, TAP_LINES * terminalScrollSpeed.value * direction)
  }

  function press(direction) {
    return (event) => {
      event.preventDefault()
      event.stopPropagation()
      release()
      scroll(direction)
      repeat.current.delay = setTimeout(() => {
        repeat.current.interval = setInterval(() => scroll(direction), HOLD_REPEAT_MS)
      }, HOLD_DELAY_MS)
    }
  }

  function release() {
    clearTimeout(repeat.current.delay)
    clearInterval(repeat.current.interval)
    repeat.current.delay = 0
    repeat.current.interval = 0
  }

  // Taps must never reach the host's click-to-focus listener or move focus
  // onto the button — the keyboard stays in whatever state the user left it.
  const swallow = (event) => { event.preventDefault(); event.stopPropagation() }
  const stop = (event) => event.stopPropagation()

  return <div class="terminal-scroll-buttons"
    onTouchStart={stop} onTouchMove={stop} onTouchEnd={stop}
    onClick={swallow} onPointerUp={stop} onAuxClick={swallow}>
    <button type="button" class="terminal-scroll-btn" aria-label={t('terminal.scrollUp')}
      onPointerDown={press(-1)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={(event) => event.preventDefault()}>
      <ChevronUp size={18} />
    </button>
    <button type="button" class="terminal-scroll-btn" aria-label={t('terminal.scrollDown')}
      onPointerDown={press(1)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={(event) => event.preventDefault()}>
      <ChevronDown size={18} />
    </button>
  </div>
}
