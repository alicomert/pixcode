import { useEffect, useRef } from 'preact/hooks'

// Uncontrolled text inputs that mirror `value` into state via onInput but
// only write back when it diverges from the DOM. Rewriting the prop on
// every keystroke aborts IME composition — mobile keyboards (Gboard,
// SwiftKey, CJK IMEs) duplicate text when a suggestion is tapped.
// `domRef` receives the rendered element (a plain `ref` would land on
// Preact's internal component object instead).
function mergedRef(inner, outer) {
  return (el) => {
    inner.current = el
    if (outer) outer.current = el
  }
}

export function TField({ value = '', domRef, ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el && 'value' in el && el.value !== value) el.value = value
  })
  return <vscode-textfield ref={mergedRef(ref, domRef)} {...props} />
}

export function TInput({ value = '', domRef, ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.value !== value) el.value = value
  })
  return <input ref={mergedRef(ref, domRef)} {...props} />
}
