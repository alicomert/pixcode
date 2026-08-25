import { useEffect, useState } from 'preact/hooks'
import { api, getToken, setToken } from './lib/api.js'
import { ws } from './lib/ws.js'
import { t } from './lib/i18n.js'
import { AuthGate } from './components/AuthGate.jsx'
import { Shell } from './components/Shell.jsx'

export function App() {
  const [state, setState] = useState({ loading: true, setupRequired: false, authenticated: false })

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const health = await api.health()
        let authenticated = false
        if (getToken()) {
          try {
            await api.get('/api/auth/me')
            authenticated = true
          } catch {
            setToken('')
          }
        }
        if (!cancelled) setState({ loading: false, setupRequired: health.setupRequired, authenticated })
      } catch {
        if (!cancelled) setState({ loading: false, setupRequired: false, authenticated: false, unavailable: true })
      }
    }
    boot()
    return () => { cancelled = true; ws.close() }
  }, [])

  if (state.loading) return <div class="loading-screen">Pixcode</div>
  if (state.unavailable) return <div class="loading-screen">{t('app.unavailable')}</div>
  if (state.authenticated) return <Shell />
  return <AuthGate setupRequired={state.setupRequired} onAuthenticated={() => setState((current) => ({ ...current, authenticated: true }))} />
}

export default App
