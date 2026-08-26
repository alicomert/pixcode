// Keep xterm and the server-side PTY in sync with split-pane layout changes.
// A pane can settle over more than one frame while a sash is dragged, so the
// fit is deliberately scheduled after two animation frames.
export function watchTerminalResize(host, fit, terminal, onResize) {
  if (!host) return () => {}

  let frame = 0
  let disposed = false
  let lastSize = ''
  const schedule = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0
        if (disposed || !host.isConnected) return
        const rect = host.getBoundingClientRect()
        if (rect.width < 4 || rect.height < 4) return
        try {
          fit.fit()
          // xterm exposes the current dimensions on the terminal instance.
          // Avoid FitAddon's private `_terminal` reference so this keeps
          // working across xterm addon releases.
          const size = `${terminal.cols || 0}x${terminal.rows || 0}`
          if (size === lastSize) return
          const [cols, rows] = size.split('x').map(Number)
          if (cols > 0 && rows > 0) {
            onResize(cols, rows)
            lastSize = size
          }
        } catch {
          // xterm may be between open/dispose while a pane is being switched.
        }
      })
    })
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
  let current = host
  // Observe the immediate layout parents too. This catches grid/flex changes
  // where the host's content box is unchanged until the next layout pass.
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) observer?.observe(current)
  window.addEventListener('resize', schedule)
  window.addEventListener('orientationchange', schedule)
  window.addEventListener('pageshow', schedule)
  window.addEventListener('pixcode:ws-open', schedule)
  document.addEventListener('visibilitychange', schedule)
  document.fonts?.ready.then(schedule).catch(() => {})
  schedule()

  const stop = () => {
    disposed = true
    if (frame) cancelAnimationFrame(frame)
    observer?.disconnect()
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    window.removeEventListener('pageshow', schedule)
    window.removeEventListener('pixcode:ws-open', schedule)
    document.removeEventListener('visibilitychange', schedule)
  }
  // Consumers can request another measurement after an async history restore
  // or when a previously hidden pane becomes visible.
  stop.refresh = schedule
  return stop
}
