import { useEffect, useRef } from 'preact/hooks'

// vscode-elements controls emit vsc-* custom events instead of the native
// events Preact props map to, so they need ref-bound listeners.
export function useVscEvent(name, handler) {
  const ref = useRef(null)
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const listener = (event) => handlerRef.current(event)
    el.addEventListener(name, listener)
    return () => el.removeEventListener(name, listener)
  }, [name])
  return ref
}

export function VscSelect({ value, onChange, children, ...rest }) {
  const ref = useVscEvent('vsc-change', (event) => onChange(event.target.value))
  useEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value
  }, [value, ref])
  return <vscode-single-select ref={ref} {...rest}>{children}</vscode-single-select>
}
