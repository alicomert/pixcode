import { useEffect } from 'preact/hooks'
import { t, setLocale, locale } from '../lib/i18n.js'
import { ws } from '../lib/ws.js'
import { setToken } from '../lib/api.js'
import { mobileTab, setTheme, theme } from '../state/app.js'
import { FileTree } from './FileTree.jsx'
import { EditorPane } from './EditorPane.jsx'
import { GitPanel } from './GitPanel.jsx'
import { AgentPanel } from './AgentPanel.jsx'
import { Terminals } from './Terminals.jsx'

const tabs = [
  { id: 'files', label: 'tab.files' },
  { id: 'editor', label: 'tab.editor' },
  { id: 'agent', label: 'tab.agent' },
  { id: 'terminal', label: 'tab.terminal' },
  { id: 'git', label: 'tab.git' }
]

function TopBar() {
  function logout() {
    ws.close()
    setToken('')
    location.reload()
  }

  return (
    <header class="topbar">
      <strong>{t('app.title')}</strong>
      <span class="workspace-name">{t('topbar.workspace')}</span>
      <span class="spacer" />
      <select aria-label={t('lang.label')} value={locale.value} onChange={(event) => setLocale(event.currentTarget.value)}>
        <option value="tr">TR</option>
        <option value="en">EN</option>
      </select>
      <button
        type="button"
        title={t(theme.value === 'dark' ? 'topbar.theme.light' : 'topbar.theme.dark')}
        aria-label={t(theme.value === 'dark' ? 'topbar.theme.light' : 'topbar.theme.dark')}
        onClick={() => setTheme(theme.value === 'dark' ? 'light' : 'dark')}
      >
        {theme.value === 'dark' ? 'Light' : 'Dark'}
      </button>
      <button type="button" onClick={logout}>{t('topbar.logout')}</button>
    </header>
  )
}

export function Shell() {
  useEffect(() => () => ws.close(), [])
  const tab = mobileTab.value
  const leftActive = tab === 'files' || tab === 'git'
  const rightActive = tab === 'agent' || tab === 'terminal'
  return (
    <div class="shell">
      <TopBar />
      <div class="body">
        <aside class={`pane left-pane ${leftActive ? 'active' : ''}`}>
          <section class={`left-section files ${tab === 'files' ? 'mobile-view active' : 'mobile-view'}`}>
            <div class="section-title">{t('tab.files')}</div>
            <FileTree />
          </section>
          <section class={`left-section git ${tab === 'git' ? 'mobile-view active' : 'mobile-view'}`}>
            <GitPanel />
          </section>
        </aside>
        <main class={`pane center ${tab === 'editor' ? 'active' : ''}`}>
          <EditorPane />
        </main>
        <aside class={`pane right-pane ${rightActive ? 'active' : ''}`}>
          <section class={`right-view agent-view ${tab === 'agent' ? 'mobile-view active' : 'mobile-view'}`}>
            <AgentPanel />
          </section>
          <section class={`right-view terminal-view ${tab === 'terminal' ? 'mobile-view active' : 'mobile-view'}`}>
            <Terminals />
          </section>
        </aside>
      </div>
      <nav class="mobile-tabs" aria-label="Workbench views">
        {tabs.map((item) => (
          <button class={`mobile-tab ${tab === item.id ? 'active' : ''}`} type="button" onClick={() => (mobileTab.value = item.id)}>
            {t(item.label)}
          </button>
        ))}
      </nav>
    </div>
  )
}
