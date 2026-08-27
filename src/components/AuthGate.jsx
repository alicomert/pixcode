import { useState } from 'preact/hooks'
import { api, setToken } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { Lock } from '../lib/icons.jsx'

export function AuthGate({ setupRequired, onAuthenticated }) {
  const [username, setUsername] = useState(() => setupRequired ? '' : (localStorage.getItem('pixcode.username') || 'admin'))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = setupRequired
        ? await api.post('/api/auth/setup', { username: username.trim(), password })
        : await api.post('/api/auth/login', { ...(username.trim() ? { username: username.trim() } : {}), password })
      setToken(response.token)
      if (response.username) localStorage.setItem('pixcode.username', response.username)
      onAuthenticated()
    } catch (requestError) {
      setError(requestError.message || t('auth.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main class="auth">
      <div class="auth-orb auth-orb-one" aria-hidden="true" />
      <div class="auth-orb auth-orb-two" aria-hidden="true" />
      <form class="auth-card" onSubmit={submit}>
        <div class="auth-brand"><img class="auth-brand-logo" src="/logo.png" alt="Pixcode" /><span>PIXCODE</span></div>
        <div class="auth-heading"><p class="auth-eyebrow">{setupRequired ? t('auth.setup.eyebrow') : t('auth.login.eyebrow')}</p><h1>{t(setupRequired ? 'auth.setup.title' : 'auth.login.title')}</h1><p class="auth-description">{t(setupRequired ? 'auth.setup.description' : 'auth.login.description')}</p></div>
        <label class="auth-field"><span>{t('auth.username')}</span><span class="auth-input-wrap"><span class="auth-input-glyph" aria-hidden="true">@</span><input type="text" value={username} placeholder={t(setupRequired ? 'auth.usernamePlaceholder' : 'auth.usernameLoginHint')} onInput={(event) => setUsername(event.currentTarget.value)} autoComplete="username" autoFocus={setupRequired} required={setupRequired} minLength={setupRequired ? 3 : undefined} maxLength={32} /></span></label>
        <label class="auth-field"><span>{t('auth.password')}</span><span class="auth-input-wrap"><Lock size={16} aria-hidden="true" /><input type="password" value={password} placeholder={t('auth.passwordPlaceholder')} onInput={(event) => setPassword(event.currentTarget.value)} autoComplete={setupRequired ? 'new-password' : 'current-password'} required minLength={setupRequired ? 6 : undefined} /></span></label>
        {error && <div class="error-text">{error}</div>}
        <button class="btn-accent auth-submit" type="submit" disabled={busy}>{busy ? t('auth.loading') : t(setupRequired ? 'auth.setup.submit' : 'auth.login.submit')}<span aria-hidden="true">→</span></button>
        <p class="auth-footnote">{t('auth.localOnly')}</p>
      </form>
    </main>
  )
}
