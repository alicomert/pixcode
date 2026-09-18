import { useEffect, useRef } from 'preact/hooks'

// Escape unwinds dialogs one layer at a time: each open dialog pushes itself
// onto a stack and only the topmost entry answers the key, so a confirm box
// inside a picker modal never closes the whole chain in one press.
const escapeStack = []

export function useEscape(open, onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return undefined
    const entry = { close: () => closeRef.current() }
    escapeStack.push(entry)
    const handler = (event) => {
      if (event.key !== 'Escape' || escapeStack.at(-1) !== entry) return
      event.stopPropagation()
      entry.close()
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      const index = escapeStack.indexOf(entry)
      if (index >= 0) escapeStack.splice(index, 1)
    }
  }, [open])
}
