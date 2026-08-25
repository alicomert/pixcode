import { useEffect, useState } from 'preact/hooks'
import { Archive, Binary, BookOpen, Box, Braces, ChevronDown, ChevronRight, Code2, Cog, Coffee, Cpu, Database, File, FileCheck, FileCode, FileCode2, FilePlus2, FileSpreadsheet, FileText, FileType, Flame, FlaskConical, Folder, FolderOpen, FolderPlus, Gem, Globe, Hash, Hexagon, Image, Lock, Music2, NotebookPen, Palette, Pencil, RefreshCw, Scroll, Settings, Shield, SquareFunction, Terminal, Trash2, Video, Workflow } from 'lucide-preact'
import { ws } from '../lib/ws.js'
import { t } from '../lib/i18n.js'
import { openFile } from '../state/app.js'

function joinPath(parent, name) {
  return parent === '.' ? name : parent + '/' + name
}

const fileIcons = {
  js: [FileCode, '#e7c15b'], jsx: [FileCode, '#e7c15b'], mjs: [FileCode, '#e7c15b'], cjs: [FileCode, '#e7c15b'],
  ts: [FileCode2, '#4e9be8'], tsx: [FileCode2, '#4e9be8'], mts: [FileCode2, '#4e9be8'],
  py: [Code2, '#54c48b'], pyw: [Code2, '#54c48b'], pyi: [Code2, '#54c48b'],
  ipynb: [NotebookPen, '#f08a3c'], rs: [Cog, '#e27c35'], toml: [Settings, '#9299a5'],
  go: [Hexagon, '#38bcd3'], rb: [Gem, '#e35c63'], erb: [Gem, '#e35c63'], php: [Box, '#9c77df'],
  java: [Coffee, '#dd6262'], jar: [Coffee, '#dd6262'], kt: [Hexagon, '#aa72e5'], kts: [Hexagon, '#aa72e5'],
  c: [Cpu, '#538fd2'], h: [Cpu, '#538fd2'], cpp: [Cpu, '#538fd2'], hpp: [Cpu, '#538fd2'], cc: [Cpu, '#538fd2'],
  cs: [Hexagon, '#9d74d4'], swift: [Flame, '#ed8748'], lua: [SquareFunction, '#538fd2'], r: [FlaskConical, '#538fd2'],
  html: [Globe, '#eb8248'], htm: [Globe, '#eb8248'], css: [Hash, '#5e9be7'], scss: [Hash, '#d475a3'], sass: [Hash, '#d475a3'], less: [Hash, '#8d8ce0'],
  vue: [FileCode2, '#4dbb83'], svelte: [FileCode2, '#ef874f'], json: [Braces, '#dbb84b'], jsonc: [Braces, '#dbb84b'], json5: [Braces, '#dbb84b'],
  yaml: [Settings, '#a68bd3'], yml: [Settings, '#a68bd3'], xml: [FileCode, '#eb8248'], csv: [FileSpreadsheet, '#54ae72'], tsv: [FileSpreadsheet, '#54ae72'],
  sql: [Database, '#5e9be7'], graphql: [Workflow, '#dc73bb'], gql: [Workflow, '#dc73bb'], proto: [Box, '#54ae72'],
  env: [Shield, '#d9b34b'], md: [BookOpen, '#5e9be7'], mdx: [BookOpen, '#5e9be7'], txt: [FileText, '#9299a5'], doc: [FileText, '#538fd2'], docx: [FileText, '#538fd2'],
  pdf: [FileCheck, '#e35c63'], rtf: [FileText, '#9299a5'], tex: [Scroll, '#53b5ae'], rst: [FileText, '#9299a5'],
  sh: [Terminal, '#54c48b'], bash: [Terminal, '#54c48b'], zsh: [Terminal, '#54c48b'], fish: [Terminal, '#54c48b'], ps1: [Terminal, '#5e9be7'], bat: [Terminal, '#9299a5'], cmd: [Terminal, '#9299a5'],
  png: [Image, '#a477df'], jpg: [Image, '#a477df'], jpeg: [Image, '#a477df'], gif: [Image, '#a477df'], webp: [Image, '#a477df'], ico: [Image, '#a477df'], bmp: [Image, '#a477df'], svg: [Palette, '#dbad4d'],
  mp3: [Music2, '#d675a9'], wav: [Music2, '#d675a9'], ogg: [Music2, '#d675a9'], flac: [Music2, '#d675a9'], mp4: [Video, '#e06b80'], mov: [Video, '#e06b80'], webm: [Video, '#e06b80'],
  ttf: [FileType, '#df6666'], otf: [FileType, '#df6666'], woff: [FileType, '#df6666'], woff2: [FileType, '#df6666'], zip: [Archive, '#d9a94c'], tar: [Archive, '#d9a94c'], gz: [Archive, '#d9a94c'], rar: [Archive, '#d9a94c'],
  lock: [Lock, '#9299a5'], exe: [Binary, '#9299a5'], bin: [Binary, '#9299a5'], dll: [Binary, '#9299a5'], so: [Binary, '#9299a5'], wasm: [Binary, '#a477df'], ini: [Settings, '#9299a5'], cfg: [Settings, '#9299a5'], conf: [Settings, '#9299a5'], log: [Scroll, '#9299a5']
}

const namedFileIcons = {
  Dockerfile: [Box, '#5e9be7'], 'docker-compose.yml': [Box, '#5e9be7'], 'docker-compose.yaml': [Box, '#5e9be7'],
  '.gitignore': [Settings, '#9299a5'], '.gitattributes': [Settings, '#9299a5'], '.editorconfig': [Settings, '#9299a5'],
  '.env': [Shield, '#d9b34b'], '.env.local': [Shield, '#d9b34b'], '.env.example': [Shield, '#d9b34b'],
  'package.json': [Braces, '#54ae72'], 'package-lock.json': [Lock, '#9299a5'], 'yarn.lock': [Lock, '#5e9be7'], 'pnpm-lock.yaml': [Lock, '#e28a55'],
  'Cargo.toml': [Cog, '#e27c35'], 'Cargo.lock': [Lock, '#e27c35'], Makefile: [Terminal, '#9299a5'],
  'README.md': [BookOpen, '#5e9be7'], LICENSE: [FileCheck, '#9299a5'], 'CHANGELOG.md': [Scroll, '#5e9be7']
}

function getFileIcon(name, type, expanded) {
  if (type === 'dir') return [expanded ? FolderOpen : Folder, expanded ? '#d6a94e' : '#c9973e']
  if (namedFileIcons[name]) return namedFileIcons[name]
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  return fileIcons[extension] || [File, '#858585']
}

function Node({ path, name, type, depth = 0, refreshToken, onError, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(null)

  useEffect(() => {
    setExpanded(false)
    setChildren(null)
  }, [refreshToken])

  async function loadChildren(force = false) {
    if (!force && children) return
    try {
      setChildren(await ws.request('fs', 'list', { path }))
      onError('')
    } catch (requestError) {
      onError(requestError.message)
    }
  }

  async function activate() {
    if (type !== 'dir') { openFile(path); return }
    const next = !expanded
    setExpanded(next)
    if (next) await loadChildren()
  }

  const itemClass = ['tree-item', type === 'dir' ? 'dir' : 'file', expanded ? 'open' : ''].filter(Boolean).join(' ')
  const [FileGlyph, iconColor] = getFileIcon(name, type, expanded)
  return (
    <div class="tree-node">
      <div class="tree-row">
        <button class={itemClass} style={{ paddingLeft: String(6 + depth * 12) + 'px' }} type="button" onClick={activate} title={path}>
          <span class="tree-file-icon" style={{ color: iconColor }} aria-hidden="true">{type === 'dir' ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <FileGlyph size={14} strokeWidth={1.7} />}</span>
          <span class="name">{name}</span>
        </button>
        <span class="tree-actions">
          <button class="tw-icon-button" type="button" title={t('tree.rename')} aria-label={t('tree.rename')} onClick={() => onChanged({ type: 'rename', path, name })}><Pencil size={13} /></button>
          <button class="tw-icon-button" type="button" title={t('tree.delete')} aria-label={t('tree.delete')} onClick={() => onChanged({ type: 'delete', path, name })}><Trash2 size={13} /></button>
        </span>
      </div>
      {expanded && children?.map((child) => <Node key={joinPath(path, child.name)} path={joinPath(path, child.name)} {...child} depth={depth + 1} refreshToken={refreshToken} onError={onError} onChanged={onChanged} />)}
      {expanded && children?.length === 0 && <div class="tree-item muted" style={{ paddingLeft: String(18 + depth * 12) + 'px' }}>{t('tree.empty')}</div>}
    </div>
  )
}

export function FileTree() {
  const [root, setRoot] = useState(null)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [dialog, setDialog] = useState(null)

  async function refresh() {
    try {
      setError('')
      setRoot(await ws.request('fs', 'list', { path: '.' }))
      setRefreshToken((value) => value + 1)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => { refresh() }, [])

  async function submitAction(event) {
    event.preventDefault()
    if (!dialog) return
    try {
      if (dialog.type === 'delete') {
        await ws.request('fs', 'delete', { path: dialog.path })
      } else if (dialog.type === 'rename') {
        const parent = dialog.path.includes('/') ? dialog.path.slice(0, dialog.path.lastIndexOf('/')) : '.'
        await ws.request('fs', 'rename', { from: dialog.path, to: joinPath(parent, dialog.value.trim()) })
      } else if (dialog.type === 'file') {
        await ws.request('fs', 'write', { path: dialog.value.trim(), content: '' })
      } else {
        await ws.request('fs', 'mkdir', { path: dialog.value.trim() })
      }
      setDialog(null)
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function openCreate(type) {
    setDialog({ type, value: '' })
  }

  function handleNodeAction(action) {
    setDialog({ ...action, value: action.type === 'rename' ? action.name : '' })
  }

  return (
    <div class="file-tree">
      <div class="tree-toolbar" aria-label={t('view.explorer')}>
        <button class="tw-icon-button" type="button" title={t('tree.newFile')} aria-label={t('tree.newFile')} onClick={() => openCreate('file')}><FilePlus2 size={15} /></button>
        <button class="tw-icon-button" type="button" title={t('tree.newFolder')} aria-label={t('tree.newFolder')} onClick={() => openCreate('folder')}><FolderPlus size={15} /></button>
        <button class="tw-icon-button" type="button" title={t('tree.refresh')} aria-label={t('tree.refresh')} onClick={refresh}><RefreshCw size={14} /></button>
      </div>
      {error && <div class="tree-error error-text">{error}</div>}
      {!error && !root && <div class="tree muted">{t('tree.loading')}</div>}
      {!error && root?.length === 0 && <div class="tree muted">{t('tree.empty')}</div>}
      {!error && root?.length > 0 && <div class="tree">{root.map((entry) => <Node key={entry.name} path={entry.name} {...entry} refreshToken={refreshToken} onError={setError} onChanged={handleNodeAction} />)}</div>}
      {dialog && <div class="modal-backdrop" onClick={() => setDialog(null)}>
        <form class="file-action-modal" onSubmit={submitAction} onClick={(event) => event.stopPropagation()}>
          <h2>{t(dialog.type === 'delete' ? 'tree.delete' : dialog.type === 'rename' ? 'tree.rename' : dialog.type === 'file' ? 'tree.newFile' : 'tree.newFolder')}</h2>
          {dialog.type === 'delete' ? <p>{t('tree.deleteConfirm', { name: dialog.name })}</p> : <input value={dialog.value} onInput={(event) => setDialog((current) => ({ ...current, value: event.currentTarget.value }))} placeholder={t('tree.pathPlaceholder')} autoFocus />}
          <div class="modal-actions"><button type="button" onClick={() => setDialog(null)}>{t('common.cancel')}</button><button class="btn-accent" type="submit" disabled={dialog.type !== 'delete' && !dialog.value.trim()}>{t(dialog.type === 'delete' ? 'tree.delete' : dialog.type === 'rename' ? 'tree.rename' : 'tree.create')}</button></div>
        </form>
      </div>}
    </div>
  )
}
