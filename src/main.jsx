import { render } from 'preact'
import { App } from './App.jsx'
import './styles/tailwind.css'
import './styles/global.css'

render(<App />, document.getElementById('app'))

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, { once: true })
}
