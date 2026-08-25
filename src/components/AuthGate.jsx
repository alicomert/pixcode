import { useState } from 'preact/hooks'
import { api, setToken } from '../lib/api.js'
import { t } from '../lib/i18n.js'

export function AuthGate({ setupRequired, onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = setupRequired
        ? await api.post('/api/auth/setup', { password })
        : await api.post('/api/auth/login', { password })
      setToken(response.token)
      onAuthenticated()
    } catch (requestError) {
      setError(requestError.message || t('auth.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main class="auth">
      <form class="auth-card" onSubmit={submit}>
        <h1>{t(setupRequired ? 'auth.setup.title' : 'auth.login.title')}</h1>
        <input
          type="password"
          value={password}
          placeholder={t(setupRequired ? 'auth.setup.password' : 'auth.login.password')}
          onInput={(event) => setPassword(event.currentTarget.value)}
          autoFocus
          minLength={setupRequired ? 6 : undefined}
        />
        {error && <div class="error-text">{error}</div>}
        <button class="btn-accent" type="submit" disabled={busy}>
          {busy ? t('git.busy') : t(setupRequired ? 'auth.setup.submit' : 'auth.login.submit')}
        </button>
      </form>
    </main>
  )
}
