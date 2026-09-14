import { render } from 'preact'
import { App } from './App.jsx'
import '@fontsource/cascadia-code/400.css'
import '@fontsource/cascadia-code/700.css'
import './styles/tailwind.css'
import './styles/global.css'

render(<App />, document.getElementById('app'))

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, { once: true })
}
