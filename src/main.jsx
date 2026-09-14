import { render } from 'preact'
import { App } from './App.jsx'
import '@fontsource/cascadia-code/400.css'
import '@fontsource/cascadia-code/700.css'
import '@vscode-elements/elements/dist/vscode-button/index.js'
import '@vscode-elements/elements/dist/vscode-badge/index.js'
import '@vscode-elements/elements/dist/vscode-textfield/index.js'
import '@vscode-elements/elements/dist/vscode-textarea/index.js'
import '@vscode-elements/elements/dist/vscode-single-select/index.js'
import '@vscode-elements/elements/dist/vscode-option/index.js'
import '@vscode-elements/elements/dist/vscode-checkbox/index.js'
import '@vscode-elements/elements/dist/vscode-scrollable/index.js'
import '@vscode-elements/elements/dist/vscode-icon/index.js'
import '@vscode-elements/elements/dist/vscode-toolbar-button/index.js'
import '@vscode-elements/elements/dist/vscode-progress-ring/index.js'
import '@vscode-elements/elements/dist/vscode-divider/index.js'
import '@vscode-elements/elements/dist/vscode-collapsible/index.js'
import '@vscode-elements/elements/dist/vscode-label/index.js'
import './styles/tailwind.css'
import './styles/global.css'

render(<App />, document.getElementById('app'))

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, { once: true })
}
