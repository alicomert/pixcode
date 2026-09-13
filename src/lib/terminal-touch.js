// xterm scrolls its viewport programmatically from wheel events. Its own
// touchmove handler only covers the regular buffer and loses the gesture as
// soon as the browser claims the vertical pan — the rendered screen overlays
// the scrollable viewport, so native touch scrolling can never reach it.
// Forward vertical drags as wheel events instead: the regular buffer scrolls
// its scrollback, and full-screen TUI apps with mouse reporting (devin,
// claude, vim, ...) receive SGR wheel sequences, so scrolling works there too.
const DRAG_THRESHOLD_PX = 6
const SCROLL_SCALE = 1.5

export function attachTerminalTouchScroll(host) {
  if (!host) return () => {}

  let startY = 0
  let lastY = 0
  let target = null
  let scrolling = false

  const onStart = (event) => {
    if (event.touches.length !== 1) { target = null; return }
    target = event.target
    startY = lastY = event.touches[0].pageY
    scrolling = false
  }

  const onMove = (event) => {
    if (!target || event.touches.length !== 1) return
    const y = event.touches[0].pageY
    if (!scrolling && Math.abs(y - startY) < DRAG_THRESHOLD_PX) { lastY = y; return }
    scrolling = true
    // Claim the gesture before xterm or the browser can: the page must not
    // scroll or pull-to-refresh while a terminal drag is in progress.
    event.preventDefault()
    event.stopPropagation()
    const delta = lastY - y
    lastY = y
    if (delta === 0) return
    target.dispatchEvent(new WheelEvent('wheel', { deltaY: delta * SCROLL_SCALE, deltaMode: 0, bubbles: true, cancelable: true }))
  }

  const onEnd = () => { target = null; scrolling = false }

  host.addEventListener('touchstart', onStart, { capture: true, passive: true })
  host.addEventListener('touchmove', onMove, { capture: true, passive: false })
  host.addEventListener('touchend', onEnd, { capture: true, passive: true })
  host.addEventListener('touchcancel', onEnd, { capture: true, passive: true })

  return () => {
    host.removeEventListener('touchstart', onStart, { capture: true })
    host.removeEventListener('touchmove', onMove, { capture: true })
    host.removeEventListener('touchend', onEnd, { capture: true })
    host.removeEventListener('touchcancel', onEnd, { capture: true })
  }
}
