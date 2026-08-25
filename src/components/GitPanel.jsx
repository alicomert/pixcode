import { useEffect, useState } from 'preact/hooks'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'

function badge(file) {
  if (file.untracked) return { label: 'A', className: 'added' }
  if (file.x === 'D' || file.y === 'D') return { label: 'D', className: 'deleted' }
  return { label: 'M', className: 'modified' }
}

export function GitPanel() {
  const [state, setState] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [output, setOutput] = useState('')
  const [diff, setDiff] = useState(null)

  async function refresh() {
    setError('')
    try { setState(await ws.request('git', 'status')) } catch (requestError) { setState(null); setError(requestError.message) }
  }

  useEffect(() => { refresh() }, [])

  async function run(operation, data = {}) {
    setBusy(operation)
    setError('')
    setOutput('')
    try {
      const result = await ws.request('git', operation, data)
      setOutput(result?.output || '')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy('')
    }
  }

  async function commit() {
    if (!message.trim()) return
    await run('commit', { message })
    setMessage('')
  }

  async function toggleStage(file) {
    const staged = !file.untracked && file.x !== ' '
    await run(staged ? 'unstage' : 'stage', { paths: [file.path] })
  }

  async function showDiff(filePath) {
    setBusy('diff')
    setError('')
    try { setDiff({ path: filePath, text: (await ws.request('git', 'diff', { path: filePath })).diff }) } catch (requestError) { setError(requestError.message) } finally { setBusy('') }
  }

  return (
    <div style="display:flex; flex:1; min-height:0; flex-direction:column">
      <div class="section-title">
        <span>{state?.branch || t('git.title')}</span>
        <button type="button" onClick={refresh} disabled={!!busy} title={t('git.refresh')}>↻</button>
      </div>
      {error && <div class="error-text" style="padding:8px">{error}</div>}
      <div class="git-list">
        {!state && !error && <div class="tree muted">{t('tree.loading')}</div>}
        {state?.files.length === 0 && <div class="tree muted">{t('git.noChanges')}</div>}
        {state?.files.map((file) => {
          const item = badge(file)
          return (
            <div class="git-item" key={file.path}>
              <span class={`git-badge ${item.className}`}>{item.label}</span>
              <span class="path">{file.path}</span>
              <button type="button" onClick={() => showDiff(file.path)} disabled={!!busy}>{t('git.diff')}</button>
              <button type="button" onClick={() => toggleStage(file)} disabled={!!busy}>{!file.untracked && file.x !== ' ' ? t('git.unstage') : t('git.stage')}</button>
            </div>
          )
        })}
      </div>
      <div class="commit-row">
        <input value={message} onInput={(event) => setMessage(event.currentTarget.value)} placeholder={t('git.messagePlaceholder')} />
        <button class="btn-accent" type="button" onClick={commit} disabled={!!busy || !message.trim()}>{t('git.commit')}</button>
      </div>
      <div class="git-actions">
        <button type="button" onClick={() => run('pull')} disabled={!!busy}>{busy === 'pull' ? t('git.busy') : t('git.pull')}</button>
        <button class="btn-accent" type="button" onClick={() => run('push')} disabled={!!busy}>{busy === 'push' ? t('git.busy') : t('git.push')}</button>
      </div>
      {diff && <div class="git-diff"><strong>{diff.path}</strong><pre>{diff.text || t('git.noChanges')}</pre></div>}
      {output && <pre class="tree muted" style="max-height:90px; overflow:auto; margin:0">{output}</pre>}
    </div>
  )
}
