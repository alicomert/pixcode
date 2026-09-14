// Native-feel touch scrolling for xterm. The rendered screen overlays the
// scrollable viewport, so the browser's own pan can never reach it; instead
// we own the gesture (touch-action:none) and drive the scroll ourselves:
//
//   normal buffer — move the viewport's scrollTop in pixels for smooth,
//                   1:1 finger tracking plus release momentum;
//   alt-buffer / mouse-reporting TUI (devin, claude, vim, …) — the viewport
//                   has nothing to scroll. When the app reports mouse mode
//                   we forward real wheel events (xterm turns them into SGR
//                   mouse reports); when it does not, we translate drags into
//                   arrow keys — the same thing xterm does for wheel input in
//                   the alternate buffer.
const DRAG_THRESHOLD_PX = 6
const MOMENTUM_DECAY = 0.94
const MOMENTUM_MIN_PX = 0.4
const FRAME_MS = 16.7

export function attachTerminalTouchScroll(host, terminal) {
  if (!host) return () => {}

  let startY = 0
  let lastY = 0
  let lastT = 0
  let velocity = 0 // px per ms, positive when dragging up (content scrolls down)
  let target = null
  let scrolling = false
  let momentumFrame = 0

  const viewport = () => host.querySelector('.xterm-viewport')
  const xtermEl = () => host.querySelector('.xterm')
  // Mouse-reporting apps get real wheel events; other alt-buffer TUIs get
  // arrow keys — xterm only listens to wheel while mouse mode is active, so
  // a wheel event on a plain alt-buffer app would go nowhere.
  const viaMouse = () => terminal?.modes?.mouseTrackingMode !== 'none'
  const viaArrows = () => !viaMouse() && terminal?.buffer?.active?.type === 'alternate'
  const lineHeightPx = () => Math.max(8, (terminal?.options?.fontSize || 13) * (terminal?.options?.lineHeight || 1.25))

  const cancelMomentum = () => {
    if (momentumFrame) cancelAnimationFrame(momentumFrame)
    momentumFrame = 0
  }

  const wheel = (deltaY) => {
    xtermEl()?.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true }))
  }

  // Carry of partial-line drags so a slow finger still accumulates whole
  // arrow presses instead of losing the remainder on every event.
  let arrowRemainder = 0
  const arrows = (delta) => {
    arrowRemainder += delta
    const unit = lineHeightPx()
    while (Math.abs(arrowRemainder) >= unit) {
      // delta > 0 means the finger moved up, i.e. content scrolls down.
      // wasUserInput=false keeps scrollOnUserInput from snapping back to the
      // prompt while the user is still dragging through history.
      terminal?.input(arrowRemainder > 0 ? '\x1b[B' : '\x1b[A', false)
      arrowRemainder -= Math.sign(arrowRemainder) * unit
    }
  }

  const apply = (delta) => {
    if (viaMouse()) wheel(delta)
    else if (viaArrows()) arrows(delta)
    else { const vp = viewport(); if (vp) vp.scrollTop += delta }
  }

  const onStart = (event) => {
    cancelMomentum()
    if (event.touches.length !== 1) { target = null; return }
    target = event.target
    startY = lastY = event.touches[0].pageY
    lastT = performance.now()
    velocity = 0
    arrowRemainder = 0
    scrolling = false
  }

  const onMove = (event) => {
    if (!target || event.touches.length !== 1) return
    const y = event.touches[0].pageY
    const now = performance.now()
    if (!scrolling && Math.abs(y - startY) < DRAG_THRESHOLD_PX) { lastY = y; lastT = now; return }
    scrolling = true
    // Claim the gesture before xterm or the browser can: the page must not
    // scroll or pull-to-refresh while a terminal drag is in progress.
    event.preventDefault()
    event.stopPropagation()
    const delta = lastY - y
    const dt = now - lastT
    lastY = y
    lastT = now
    if (delta === 0) return
    // Exponential moving average of recent drag speed feeds the release
    // momentum; a slow careful drag barely moves after the finger lifts.
    if (dt > 0) velocity = velocity * 0.6 + (delta / dt) * 0.4
    apply(delta)
  }

  const momentum = () => {
    momentumFrame = 0
    if (!target) return
    velocity *= MOMENTUM_DECAY
    const step = velocity * FRAME_MS
    if (Math.abs(step) < MOMENTUM_MIN_PX) { target = null; return }
    apply(step)
    momentumFrame = requestAnimationFrame(momentum)
  }

  const onEnd = (event) => {
    if (event.touches && event.touches.length > 0) return
    if (scrolling && Math.abs(velocity * FRAME_MS) >= MOMENTUM_MIN_PX) momentumFrame = requestAnimationFrame(momentum)
    else target = null
    scrolling = false
  }

  host.addEventListener('touchstart', onStart, { capture: true, passive: true })
  host.addEventListener('touchmove', onMove, { capture: true, passive: false })
  host.addEventListener('touchend', onEnd, { capture: true, passive: true })
  host.addEventListener('touchcancel', onEnd, { capture: true, passive: true })

  return () => {
    cancelMomentum()
    host.removeEventListener('touchstart', onStart, { capture: true })
    host.removeEventListener('touchmove', onMove, { capture: true })
    host.removeEventListener('touchend', onEnd, { capture: true })
    host.removeEventListener('touchcancel', onEnd, { capture: true })
  }
}
