import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AppWindow, Archive, Boxes, CalendarDays, Check, ChevronDown, ChevronRight, CircleCheck,
  Clock, Cloud, Code2, Command, Ellipsis, FileCode2, FileText, Folder, FolderOpen, Grid2X2,
  Hammer, House, Image, Leaf, Lightbulb, List, PencilLine, Play, Plus, Rocket, Search,
  Settings, Share, Sparkles, Square, Star, Trash2, Upload, Wand2, X,
} from 'lucide-react'
import './styles.css'

/* ------------------------------------------------------------------ *
 * Storage
 *
 * v3 keys: v2 held the seeded demo corpus. Bumping the namespace retires
 * that placeholder content instead of leaving it stranded in localStorage.
 * ------------------------------------------------------------------ */

const STORAGE = {
  notes: 'devdoc-v3-notes',
  details: 'devdoc-v3-details',
  settings: 'devdoc-v3-settings',
  starred: 'devdoc-v3-starred',
  sessions: 'devdoc-v3-sessions',
  focusLog: 'devdoc-v3-focus-log',
  activity: 'devdoc-v3-activity',
}

const DEFAULT_SETTINGS = { notifications: true, reducedMotion: false, stopQuitsAll: false }

const TAGS = ['Tech', 'SaaS', 'Design', 'Mobile', 'API', 'Docs', 'Ideas']

const GLYPHS = [
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'cloud', label: 'Cloud', icon: Cloud },
  { id: 'leaf', label: 'Nature', icon: Leaf },
  { id: 'cube', label: 'Package', icon: Boxes },
  { id: 'brand', label: 'Brand', icon: Sparkles },
  { id: 'bulb', label: 'Idea', icon: Lightbulb },
  { id: 'roadmap', label: 'Roadmap', icon: Wand2 },
  { id: 'document', label: 'Document', icon: FileText },
]

const GLYPH_ICONS = {
  code: FileCode2, cloud: Cloud, leaf: Leaf, cube: Boxes, brand: Sparkles,
  bulb: Lightbulb, roadmap: Wand2, document: FileText, archive: Archive,
}

const PAGE_LABELS = { home: 'Home', notes: 'Notes', projects: 'Projects', settings: 'Settings', detail: 'Project' }

const DAY_MS = 86400000
const SESSION_GRACE_MS = 15000

/*
 * The New Project sheet offers one tile per kind of tool rather than a raw
 * application list. Each slot resolves to the first candidate that is actually
 * installed, so the grid shows this Mac's editor rather than a guess. The first
 * four slots start checked - they are the ones nearly every project wants.
 */
const SUGGESTED_APPS = [
  { id: 'notes', names: ['Notes', 'Obsidian', 'Bear', 'Notion', 'Craft'] },
  { id: 'terminal', names: ['Ghostty', 'iTerm', 'Warp', 'WezTerm', 'kitty', 'Alacritty', 'Hyper', 'Terminal'] },
  { id: 'editor', names: ['Visual Studio Code', 'Cursor', 'Zed', 'Sublime Text', 'Nova', 'WebStorm', 'Xcode'] },
  { id: 'browser', names: ['Arc', 'Google Chrome', 'Safari', 'Firefox', 'Brave Browser', 'Microsoft Edge'] },
  { id: 'git', names: ['GitHub Desktop', 'Tower', 'Sourcetree', 'Fork', 'Sublime Merge', 'GitKraken'] },
  { id: 'design', names: ['Figma', 'Sketch', 'Framer', 'Affinity Designer', 'Pixelmator Pro'] },
  { id: 'ai', names: ['Claude', 'ChatGPT', 'Perplexity', 'Raycast'] },
]

const DEFAULT_CHECKED_SLOTS = 4

const PROJECT_ICON_LIMIT = 2 * 1024 * 1024
const PROJECT_ICON_SIZE = 256
const PROJECT_ICON_TYPES = 'image/png,image/jpeg,image/svg+xml,image/webp'

/* ------------------------------------------------------------------ *
 * Utilities
 * ------------------------------------------------------------------ */

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// `delay` batches the write. Note bodies change on every keystroke, and
// serialising the whole store that often is wasted work; the state itself is
// still updated immediately, so nothing on screen lags behind. A pending write
// is flushed when the window goes away, so quitting mid-sentence cannot lose
// the last few characters.
function usePersistedState(key, fallback, delay = 0) {
  const [value, setValue] = useState(() => readLocal(key, fallback))

  useEffect(() => {
    const write = () => {
      try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage is an enhancement, not a requirement. */ }
    }
    if (!delay) { write(); return undefined }

    const timer = window.setTimeout(write, delay)
    const flush = () => { window.clearTimeout(timer); write() }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [key, value, delay])

  return [value, setValue]
}

function createId(seed, used) {
  const base = seed.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'
  let id = base
  let count = 2
  while (used.has(id)) { id = `${base}-${count}`; count += 1 }
  return id
}

function relativeTime(timestamp) {
  if (!timestamp) return 'just now'
  const diff = Date.now() - timestamp
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < DAY_MS) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < DAY_MS * 7) return `${Math.floor(diff / DAY_MS)}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Walks each session day by day so a run crossing midnight is split across both
// dates. Advancing with setDate rather than adding 24h keeps it correct over DST.
function minutesByDay(entries, now) {
  const totals = new Map()
  for (const entry of entries) {
    const end = entry.endedAt || now
    if (!entry.startedAt || end <= entry.startedAt) continue
    const cursor = new Date(entry.startedAt)
    cursor.setHours(0, 0, 0, 0)
    let guard = 0
    while (cursor.getTime() < end && guard < 400) {
      const dayStart = cursor.getTime()
      const next = new Date(cursor)
      next.setDate(next.getDate() + 1)
      const overlap = Math.min(end, next.getTime()) - Math.max(entry.startedAt, dayStart)
      if (overlap > 0) {
        const key = dayKey(cursor)
        totals.set(key, (totals.get(key) || 0) + overlap / 60000)
      }
      cursor.setTime(next.getTime())
      guard += 1
    }
  }
  return totals
}

// Fixed thresholds rather than quartiles of your own history: a 20-minute day
// should not read as a heavy one just because it is the busiest on record.
function focusLevel(minutes) {
  if (minutes < 1) return 0
  if (minutes < 30) return 1
  if (minutes < 90) return 2
  if (minutes < 180) return 3
  return 4
}

// Columns are weeks, rows are Sunday-first days, matching GitHub's layout.
function buildCalendar(totals, weeks, now) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const cursor = new Date(today)
  cursor.setDate(cursor.getDate() + (6 - cursor.getDay()) - (weeks * 7 - 1))

  const columns = []
  for (let week = 0; week < weeks; week += 1) {
    const days = []
    for (let day = 0; day < 7; day += 1) {
      const key = dayKey(cursor)
      days.push({
        key,
        date: new Date(cursor),
        minutes: totals.get(key) || 0,
        future: cursor.getTime() > today.getTime(),
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    columns.push(days)
  }
  return columns
}

function sameSet(a, b) {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'DD'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function makeDetail(note) {
  return { body: '', overview: note?.description || '', goal: '', images: [], features: [] }
}

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

const UNTITLED_NOTE = 'Untitled Note'

// Notes used to be written into the project fields, so their text lives in
// `overview` and `goal`. Both are folded into the single body on first read.
// `makeDetail` seeded overview from the description, so that pair is deduped
// rather than repeated back to the writer.
function migrateDetail(detail, note) {
  if (!detail || typeof detail.body === 'string') return detail
  const parts = []
  const overview = (detail.overview || '').trim()
  const goal = (detail.goal || '').trim()
  const description = (note?.description || '').trim()
  if (overview && overview !== description) parts.push(overview)
  if (goal) parts.push(goal)
  const body = parts.join('\n\n') || (note?.project ? '' : description)
  return { ...detail, body }
}

// `skipTitle` drops a leading line that just repeats the note's name - a body
// starting with "# Q3 Roadmap" should not preview as "Q3 Roadmap Q3 Roadmap…".
function noteSnippet(body, limit = 140, skipTitle = '') {
  let source = String(body || '')
  if (skipTitle) {
    const [first, ...rest] = source.split('\n')
    if (first.replace(/^\s*#+\s*/, '').trim() === skipTitle.trim()) source = rest.join('\n')
  }
  const flat = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*[-*+]\s*\[[ xX]\]\s*/gm, '')  // task markers, before the bullet strip
    .replace(/^\s*[#>\-*+]+\s*/gm, '')
    .replace(/\[([^\]]*)\]\([^)\s]*\)/g, '$1')  // links keep their label, drop the URL
    .replace(/[*`_[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > limit ? `${flat.slice(0, limit).trimEnd()}…` : flat
}

function wordCount(body) {
  const words = String(body || '').trim().split(/\s+/).filter(Boolean)
  return words.length
}

// An untitled note takes its name from whatever was written first, so the list
// never fills up with identical placeholders.
function noteDisplayTitle(note, body) {
  const explicit = (note?.title || '').trim()
  if (explicit && explicit !== UNTITLED_NOTE) return explicit
  const firstLine = String(body || '').split('\n').map(line => line.replace(/^\s*#+\s*/, '').trim()).find(Boolean)
  return firstLine ? firstLine.slice(0, 80) : UNTITLED_NOTE
}

function noteAsText(note, detail) {
  const title = noteDisplayTitle(note, detail?.body)
  const body = (detail?.body || '').trim()
  return body ? `${title}\n\n${body}\n` : `${title}\n`
}

/* ------------------------------------------------------------------ *
 * Markdown
 *
 * Rendered to React elements rather than an HTML string: there is no
 * dangerouslySetInnerHTML anywhere, so note text can never be executed as
 * markup no matter what gets pasted in.
 * ------------------------------------------------------------------ */

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/g

function renderInline(text, keyPrefix) {
  const nodes = []
  let cursor = 0
  let index = 0
  for (const match of String(text).matchAll(INLINE_PATTERN)) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('[')) {
      const label = token.slice(1, token.indexOf(']'))
      const href = token.slice(token.indexOf('(') + 1, -1)
      // Only http(s) is linked. Anything else renders as plain text so a
      // javascript: or file: URL in a note can never become clickable.
      nodes.push(/^https?:\/\//i.test(href)
        ? <a key={key} href={href} target="_blank" rel="noreferrer noopener">{label}</a>
        : token)
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    cursor = match.index + token.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function renderMarkdown(source) {
  const lines = String(source || '').split('\n')
  const blocks = []
  let list = null

  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`list-${blocks.length}`} className={list.task ? 'md-tasks' : undefined}>
        {list.items.map((item, index) => (
          <li key={index}>
            {item.task !== undefined && (
              <input type="checkbox" checked={item.task} readOnly tabIndex={-1} aria-hidden="true" />
            )}
            {renderInline(item.text, `li-${blocks.length}-${index}`)}
          </li>
        ))}
      </Tag>
    )
    list = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (line.trim().startsWith('```')) {
      flushList()
      const code = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      blocks.push(<pre key={`code-${blocks.length}`}><code>{code.join('\n')}</code></pre>)
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushList()
      const Tag = `h${heading[1].length + 1}`
      blocks.push(<Tag key={`h-${blocks.length}`}>{renderInline(heading[2], `h-${blocks.length}`)}</Tag>)
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flushList()
      blocks.push(<blockquote key={`q-${blocks.length}`}>{renderInline(quote[1], `q-${blocks.length}`)}</blockquote>)
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (bullet || ordered) {
      const raw = (bullet || ordered)[1]
      const task = raw.match(/^\[([ xX])\]\s*(.*)$/)
      const isOrdered = Boolean(ordered)
      if (!list || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [], task: Boolean(task) }
      }
      list.items.push(task
        ? { text: task[2], task: task[1].toLowerCase() === 'x' }
        : { text: raw })
      if (task) list.task = true
      continue
    }

    if (!line.trim()) { flushList(); continue }

    flushList()
    blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line, `p-${blocks.length}`)}</p>)
  }

  flushList()
  return blocks
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  return copied
}

function fileUrl(filePath) {
  return `file://${filePath.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
}

function folderName(folderPath) {
  return folderPath.split('/').filter(Boolean).pop() || folderPath
}

function tildePath(folderPath, home) {
  if (!folderPath) return ''
  if (home && folderPath === home) return '~'
  if (home && folderPath.startsWith(`${home}/`)) return `~${folderPath.slice(home.length)}`
  return folderPath
}

// A folder name, not a path: separators and leading dots in a project title
// would otherwise nest the workspace somewhere the user never asked for.
function folderSafeName(title) {
  return title.trim().replace(/[/\\:]+/g, '-').replace(/^\.+/, '').trim()
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('Could not read that file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Turns a chosen file into a small square data URL. Bitmaps are redrawn at icon
 * size before being stored - a full resolution screenshot would exhaust the
 * localStorage quota on its own. Vectors are kept as-is so they stay crisp.
 */
async function prepareProjectIcon(file) {
  const source = await readFileAsDataUrl(file)
  if (file.type === 'image/svg+xml') return source

  const image = await new Promise((resolve, reject) => {
    const element = new window.Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('Could not read that image'))
    element.src = source
  })
  if (!image.width || !image.height) throw new Error('Could not read that image')

  const canvas = document.createElement('canvas')
  canvas.width = PROJECT_ICON_SIZE
  canvas.height = PROJECT_ICON_SIZE
  const context = canvas.getContext('2d')
  // Cover, not contain: scale by the larger ratio and centre-crop the overflow,
  // so the square is always filled. Fitting inside it baked transparent bars
  // into the stored image, which then showed as pale strips on the card.
  const scale = Math.max(PROJECT_ICON_SIZE / image.width, PROJECT_ICON_SIZE / image.height)
  const width = image.width * scale
  const height = image.height * scale
  context.drawImage(image, (PROJECT_ICON_SIZE - width) / 2, (PROJECT_ICON_SIZE - height) / 2, width, height)
  return canvas.toDataURL('image/png')
}

// One installed application per slot, first candidate wins, no app used twice.
function resolveSuggestedApps(catalog) {
  const taken = new Set()
  const resolved = []
  for (const slot of SUGGESTED_APPS) {
    let match = null
    for (const name of slot.names) {
      const needle = name.toLowerCase()
      const free = catalog.filter(item => !taken.has(item.path))
      match = free.find(item => item.name.toLowerCase() === needle)
        || free.find(item => item.name.toLowerCase().startsWith(needle))
      if (match) break
    }
    if (!match) continue
    taken.add(match.path)
    resolved.push(match)
  }
  return resolved
}

// Everything the session launcher needs, with a safe shape for apps that could
// not be inspected (an un-inspected app simply launches without the folder).
function toSessionApp(entry) {
  return {
    path: entry.path,
    name: entry.name,
    scriptName: entry.scriptName || entry.name,
    bundleId: entry.bundleId || '',
    openWithFolder: Boolean(entry.opensFolders ?? entry.openWithFolder),
  }
}

/* ------------------------------------------------------------------ *
 * Native application icons
 *
 * Icons are fetched from the main process on demand and cached in memory -
 * never persisted, because base64 bundles would bloat localStorage.
 * ------------------------------------------------------------------ */

const AppIconContext = createContext({ icons: {}, request: () => {} })

function AppIconProvider({ children }) {
  const [icons, setIcons] = useState({})
  const requested = useRef(new Set())

  const request = useCallback((paths) => {
    if (!window.devdocDesktop?.applicationIcons) return
    const missing = (paths || []).filter(item => item && !requested.current.has(item))
    if (!missing.length) return
    missing.forEach(item => requested.current.add(item))
    window.devdocDesktop.applicationIcons(missing)
      .then(result => setIcons(previous => ({ ...previous, ...result })))
      .catch(() => missing.forEach(item => requested.current.delete(item)))
  }, [])

  const value = useMemo(() => ({ icons, request }), [icons, request])
  return <AppIconContext.Provider value={value}>{children}</AppIconContext.Provider>
}

function AppIcon({ app, size = 28 }) {
  const { icons, request } = useContext(AppIconContext)
  useEffect(() => { request([app.path]) }, [app.path, request])
  const source = icons[app.path]
  const style = { width: size, height: size }
  if (source) return <img className="app-icon" src={source} alt="" style={style} draggable="false" />
  return (
    <span className="app-icon app-icon--fallback" style={style} aria-hidden="true">
      <AppWindow size={Math.round(size * 0.54)} strokeWidth={1.7} />
    </span>
  )
}

// Always renders something. A card whose rows come and go with its contents
// makes the grid look ragged, and an empty strip is the one place worth
// pointing at anyway - a project with no apps has nothing to start.
function AppStrip({ apps = [], running, onEdit }) {
  if (!apps.length) {
    if (!onEdit) return null
    return (
      <button type="button" className="tool-strip-empty" onClick={onEdit}>
        <Plus size={13} strokeWidth={2} />Add apps
      </button>
    )
  }
  const shown = apps.slice(0, 4)
  return (
    <div className="tool-strip" aria-label={`${apps.length} project app${apps.length === 1 ? '' : 's'}`}>
      {shown.map(app => (
        <span
          className={`project-tool ${running?.has(app.path) ? 'project-tool--running' : ''}`}
          key={app.path}
          title={running?.has(app.path) ? `${app.name} — running` : app.name}
        >
          <AppIcon app={app} size={21} />
        </span>
      ))}
      {apps.length > shown.length && <span className="project-tool project-tool--more">+{apps.length - shown.length}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

function Glyph({ type, size = 'normal', image = '' }) {
  if (image) {
    return (
      <span className={`project-glyph project-glyph--image project-glyph--${size}`} aria-hidden="true">
        <img src={image} alt="" draggable="false" />
      </span>
    )
  }
  const Icon = GLYPH_ICONS[type] || FileText
  return (
    <span className={`project-glyph project-glyph--${type} project-glyph--${size}`} aria-hidden="true">
      <Icon strokeWidth={1.75} />
    </span>
  )
}

function IconButton({ label, children, onClick, active = false, className = '', disabled = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-btn ${active ? 'icon-btn--active' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Surface({ children, className = '' }) {
  return <section className={`surface ${className}`}>{children}</section>
}

function SectionTitle({ children, action }) {
  return <div className="section-title"><h2>{children}</h2>{action}</div>
}

function EmptyState({ icon: Icon = Sparkles, title, text, action, label, tone = 'page' }) {
  return (
    <div className={`empty-state empty-state--${tone}`}>
      <span className="empty-state-icon" aria-hidden="true"><Icon size={23} strokeWidth={1.55} /></span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action && label && (
        <button className="button-primary" onClick={action}><Plus size={15} />{label}</button>
      )}
    </div>
  )
}

function SessionButton({ note, running, busy, onStart, onStop, className = '' }) {
  if (running) {
    return (
      <button className={`button-stop ${className}`} onClick={() => onStop(note)} disabled={busy}>
        <Square size={11} fill="currentColor" strokeWidth={0} />{busy ? 'Stopping…' : 'Stop'}
      </button>
    )
  }
  return (
    <button className={`button-primary ${className}`} onClick={() => onStart(note)} disabled={busy}>
      <Play size={11} fill="currentColor" strokeWidth={0} />{busy ? 'Starting…' : 'Start'}
    </button>
  )
}

function RunningPill({ startedAt }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const minutes = Math.max(0, Math.round((Date.now() - startedAt) / 60000))
  return (
    <span className="running-pill" title={`Running since ${new Date(startedAt).toLocaleTimeString()}`}>
      <i aria-hidden="true" />Running · {formatDuration(minutes)}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

const SIDEBAR_NOTE_LIMIT = 12

function Sidebar({ activePage, onNavigate, onCreate, userName, runningCount, notes, details, openNoteId, onOpenNote }) {
  const nav = [[House, 'Home', 'home'], [FileText, 'Notes', 'notes'], [FolderOpen, 'Projects', 'projects'], [Settings, 'Settings', 'settings']]

  // The list belongs to the Notes section, so it rolls open whenever that
  // section is showing - the notes list itself or any note opened from it.
  const notesOpen = activePage === 'notes'
  const recentNotes = useMemo(() => notes
    .filter(note => !note.project)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, SIDEBAR_NOTE_LIMIT), [notes])

  return (
    <aside className="sidebar">
      <div className="brand-block"><strong>DevDoc</strong><span>Developer workspace</span></div>
      <nav className="side-nav" aria-label="Workspace">
        {nav.map(([Icon, label, id]) => (
          <React.Fragment key={id}>
            <button
              className={activePage === id ? 'is-active' : ''}
              aria-current={activePage === id ? 'page' : undefined}
              aria-expanded={id === 'notes' && recentNotes.length ? notesOpen : undefined}
              onClick={() => onNavigate(id)}
            >
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {id === 'projects' && runningCount > 0 && <em className="nav-badge" aria-label={`${runningCount} running`}>{runningCount}</em>}
            </button>

            {id === 'notes' && recentNotes.length > 0 && (
              /* Animated with grid-template-rows 0fr -> 1fr so the list can
                 slide open at its natural height without measuring it in JS. */
              <div className={`nav-notes ${notesOpen ? 'is-open' : ''}`} aria-hidden={!notesOpen}>
                <ul>
                  {recentNotes.map((note, index) => (
                    <li key={note.id} style={{ '--stagger': `${Math.min(index, 8) * 22}ms` }}>
                      <button
                        className={note.id === openNoteId ? 'is-current' : ''}
                        aria-current={note.id === openNoteId ? 'true' : undefined}
                        tabIndex={notesOpen ? 0 : -1}
                        onClick={() => onOpenNote(note)}
                        title={noteDisplayTitle(note, details[note.id]?.body)}
                      >
                        <i aria-hidden="true" />
                        <span>{noteDisplayTitle(note, details[note.id]?.body)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </React.Fragment>
        ))}
      </nav>
      <button className="source-new" onClick={() => onCreate('project')}><Plus size={16} />New</button>
      <button className="profile" onClick={() => onNavigate('settings')} aria-label="Open DevDoc settings">
        <span className="avatar">{initialsOf(userName)}</span>
        <span>{userName || 'Your workspace'}</span>
      </button>
    </aside>
  )
}

/* ------------------------------------------------------------------ *
 * Home
 * ------------------------------------------------------------------ */

const CELL_SIZE = 11
const CELL_GAP = 3
const CELL_PITCH = CELL_SIZE + CELL_GAP
const DAY_LABEL_WIDTH = 28
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

function ContributionGraph({ focusLog, sessions }) {
  const scrollRef = useRef(null)
  const [weeks, setWeeks] = useState(26)

  // A running project keeps accruing time, so the clock is re-read on a slow
  // tick rather than on every parent render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  // Show as many weeks as the panel can hold rather than a fixed year, so the
  // grid never overflows its column or leaves a band of dead space.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return undefined
    const measure = () => {
      const available = node.clientWidth - DAY_LABEL_WIDTH
      const fit = Math.floor((available + CELL_GAP) / CELL_PITCH)
      setWeeks(Math.max(8, Math.min(53, fit)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const entries = useMemo(() => [
    ...focusLog,
    ...Object.values(sessions).map(session => ({ startedAt: session.startedAt, endedAt: null })),
  ], [focusLog, sessions])

  const totals = useMemo(() => minutesByDay(entries, now), [entries, now])
  const columns = useMemo(() => buildCalendar(totals, weeks, now), [totals, weeks, now])

  // A label sits above the week a month begins in. A partial month scrolled in
  // at the left edge gets none, since its first day is not on the grid.
  const months = useMemo(() => {
    const labels = []
    let lastLabelled = -99
    columns.forEach((week, index) => {
      const opening = week.find(day => day.date.getDate() === 1)
      if (!opening) return
      if (index - lastLabelled < 3 || index > columns.length - 3) return
      labels.push({ index, text: opening.date.toLocaleDateString(undefined, { month: 'short' }) })
      lastLabelled = index
    })
    return labels
  }, [columns])

  const tracked = columns.flat().filter(day => !day.future)
  const total = tracked.reduce((sum, day) => sum + day.minutes, 0)
  const activeDays = tracked.filter(day => day.minutes >= 1).length
  const gridWidth = columns.length * CELL_PITCH - CELL_GAP

  return (
    <Surface className="contribution-panel">
      <div className="contribution-scroll" ref={scrollRef}>
        <div className="contribution-months" style={{ marginLeft: DAY_LABEL_WIDTH, width: gridWidth }}>
          {months.map(month => (
            <span key={month.index} style={{ left: month.index * CELL_PITCH }}>{month.text}</span>
          ))}
        </div>
        <div className="contribution-body">
          <div className="contribution-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}
          </div>
          <div className="contribution-weeks" role="img" aria-label={
            total >= 1
              ? `${formatDuration(total)} of focus across ${activeDays} day${activeDays === 1 ? '' : 's'}`
              : 'No focus time recorded yet'
          }>
            {columns.map((week, index) => (
              <div className="contribution-week" key={index}>
                {week.map(day => (
                  <span
                    key={day.key}
                    className={`contribution-cell contribution-cell--${day.future ? 'future' : focusLevel(day.minutes)}`}
                    title={day.future ? undefined : `${day.minutes >= 1 ? formatDuration(day.minutes) : 'No focus time'} on ${day.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="contribution-footer">
        <span>{total >= 1
          ? `${formatDuration(total)} across ${activeDays} day${activeDays === 1 ? '' : 's'}`
          : 'No focus time recorded yet'}</span>
        <span className="contribution-legend">
          Less
          {[0, 1, 2, 3, 4].map(level => <i key={level} className={`contribution-cell contribution-cell--${level}`} />)}
          More
        </span>
      </div>
    </Surface>
  )
}

const ACTIVITY_ICONS = { start: Play, stop: Square, create: Plus, workspace: Folder, apps: AppWindow, edit: PencilLine }

function ActivityList({ activity, onNavigate }) {
  if (!activity.length) {
    return (
      <EmptyState
        icon={Clock}
        tone="panel"
        title="No activity yet"
        text="Starting, stopping, and creating shows up here."
      />
    )
  }
  return (
    <div className="activity-list">
      {activity.slice(0, 4).map(entry => {
        const Icon = ACTIVITY_ICONS[entry.kind] || Sparkles
        return (
          <button className="activity-row" key={entry.id} onClick={() => onNavigate('projects')}>
            <span className="activity-icon"><Icon size={14} /></span>
            <span>{entry.title}</span>
            <time>{relativeTime(entry.at)}</time>
          </button>
        )
      })}
    </div>
  )
}

function ProjectPreviewCard({ note, running, busy, onOpen, onMenu, onStart, onStop, runningApps, onEditApps }) {
  return (
    <article className={`project-preview-card ${running ? 'is-running' : ''}`}>
      <button className="project-preview-main" onClick={() => onOpen(note)}>
        <Glyph type={note.glyph} image={note.iconImage} />
        <span>
          <strong>{note.title}</strong>
          {note.description && <small>{note.description}</small>}
        </span>
      </button>
      {running && <RunningPill startedAt={running.startedAt} />}
      <AppStrip apps={note.apps} running={runningApps} onEdit={() => onEditApps(note)} />
      <div className="project-card-actions">
        <SessionButton note={note} running={running} busy={busy} onStart={onStart} onStop={onStop} />
        <button className="button-secondary" onClick={() => onOpen(note)}>Open</button>
        <IconButton label={`Project actions for ${note.title}`} onClick={() => onMenu(note)}><Ellipsis size={18} /></IconButton>
      </div>
    </article>
  )
}

function HomePage({ notes, details, sessions, runningApps, busyProject, activity, focusLog, onNavigate, onOpen, onCreate, onCreateNote, onMenu, onCommand, onStart, onStop, onEditApps, onDelete }) {
  const projects = notes.filter(note => note.project)
  // Recent Notes means notes - projects have their own panel right above it.
  const recent = notes.filter(note => !note.project).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4)

  return (
    <div className="page page--home">
      <header className="page-intro">
        <h1 tabIndex="-1">What are we working on today?</h1>
        <p>{projects.length ? 'Pick a project to get started.' : 'Create a project to set up your workspace.'}</p>
      </header>
      <div className="home-grid">
        <Surface className="start-projects">
          <SectionTitle action={projects.length ? (
            <button className="text-button" onClick={() => onNavigate('projects')}>View all <ChevronRight size={16} /></button>
          ) : null}>Start Projects</SectionTitle>
          {projects.length === 0 ? (
            <EmptyState
              icon={Rocket}
              tone="panel"
              title="No projects yet"
              text="A project links a folder and the apps you want open while you work."
              action={() => onCreate('project')}
              label="New Project"
            />
          ) : (
            <div className="start-grid">
              {projects.slice(0, 2).map(note => (
                <ProjectPreviewCard
                  key={note.id}
                  note={note}
                  running={sessions[note.id]}
                  busy={busyProject === note.id}
                  runningApps={runningApps}
                  onOpen={onOpen}
                  onMenu={onMenu}
                  onStart={onStart}
                  onStop={onStop}
                  onEditApps={onEditApps}
                />
              ))}
            </div>
          )}
        </Surface>

        <Surface className="quick-command">
          <SectionTitle>Quick Command</SectionTitle>
          <p>Navigate, create, or find work from one keyboard-first menu.</p>
          <button className="command-callout" onClick={onCommand}>
            <Command size={18} /><span>Open Command Palette</span><kbd>⌘ K</kbd>
          </button>
          <ActivityList activity={activity} onNavigate={onNavigate} />
        </Surface>

        <Surface className="recent-notes">
          <SectionTitle action={
            <button className="text-button" onClick={onCreateNote}>New Note <Plus size={16} /></button>
          }>Recent Notes</SectionTitle>
          {recent.length === 0 ? (
            <EmptyState
              icon={PencilLine}
              tone="panel"
              title="Nothing captured yet"
              text="Notes are for the thinking that happens before the code."
              action={onCreateNote}
              label="New Note"
            />
          ) : (
            <>
              <div className="recent-list">
                {recent.map(note => (
                  <div key={note.id} className="recent-row">
                    <button className="recent-row-main" onClick={() => onOpen(note)}>
                      <Glyph type={note.glyph} size="small" image={note.iconImage} />
                      <span>
                        <strong>{noteDisplayTitle(note, details[note.id]?.body)}</strong>
                        {noteSnippet(details[note.id]?.body, 90, noteDisplayTitle(note, details[note.id]?.body)) && (
                          <small>{noteSnippet(details[note.id]?.body, 90, noteDisplayTitle(note, details[note.id]?.body))}</small>
                        )}
                      </span>
                      <time>Edited {relativeTime(note.updatedAt)}</time>
                    </button>
                    <IconButton
                      label={`Delete ${noteDisplayTitle(note, details[note.id]?.body)}`}
                      className="row-delete"
                      onClick={() => onDelete(note)}
                    ><Trash2 size={15} /></IconButton>
                  </div>
                ))}
              </div>
              <button className="footer-link" onClick={() => onNavigate('notes')}>View all notes <ChevronRight size={16} /></button>
            </>
          )}
        </Surface>

        <ContributionGraph focusLog={focusLog} sessions={sessions} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

function SearchField({ placeholder, value, onChange }) {
  const inputRef = useRef(null)
  useEffect(() => {
    const focus = () => inputRef.current?.focus()
    window.addEventListener('devdoc:find', focus)
    return () => window.removeEventListener('devdoc:find', focus)
  }, [])
  return (
    <label className="search-field">
      <Search size={17} />
      <input ref={inputRef} aria-label={placeholder} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
      <kbd>⌘F</kbd>
    </label>
  )
}

function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" aria-label="Choose layout">
      <IconButton label="Grid view" active={view === 'grid'} onClick={() => onChange('grid')}><Grid2X2 size={17} /></IconButton>
      <IconButton label="List view" active={view === 'list'} onClick={() => onChange('list')}><List size={18} /></IconButton>
    </div>
  )
}

function NoteCard({ note, body, view, starred, onOpen, onMenu }) {
  const title = noteDisplayTitle(note, body)
  const snippet = noteSnippet(body, 140, title)
  return (
    <article className={`note-card ${view === 'list' ? 'note-card--list' : ''}`}>
      <button className="note-card-main" onClick={() => onOpen(note)}>
        <Glyph type={note.glyph} image={note.iconImage} />
        <span className="note-copy">
          <strong>{title}</strong>
          {snippet ? <small>{snippet}</small> : <small className="note-copy--empty">Empty note</small>}
          <em>Edited {relativeTime(note.updatedAt)}</em>
        </span>
      </button>
      <span className="note-card-meta">
        {starred && <Star size={13} fill="currentColor" strokeWidth={0} className="note-star" aria-label="Starred" />}
        <span className="tag">{note.tag}</span>
      </span>
      <IconButton label={`Actions for ${title}`} className="note-card-menu" onClick={() => onMenu(note)}>
        <Ellipsis size={17} />
      </IconButton>
    </article>
  )
}

const NOTE_SORTS = {
  edited: { label: 'Recently edited', compare: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) },
  created: { label: 'Recently created', compare: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) },
  title: { label: 'Title A–Z', compare: (a, b, bodies) => noteDisplayTitle(a, bodies[a.id]).localeCompare(noteDisplayTitle(b, bodies[b.id]), undefined, { sensitivity: 'base' }) },
}

function NotesPage({ notes, details, starred, onOpen, onCreate, onMenu }) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState('grid')
  const [tag, setTag] = useState('All Tags')
  const [scope, setScope] = useState('All')
  const [sort, setSort] = useState('edited')

  // Only notes. Projects have their own page, and mixing them here is what made
  // the two sidebar entries show the same things.
  const library = useMemo(() => notes.filter(note => !note.project), [notes])
  const bodies = useMemo(() => Object.fromEntries(library.map(note => [note.id, details[note.id]?.body || ''])), [library, details])

  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return library
      .filter(note => {
        if (scope === 'Starred' && !starred[note.id]) return false
        if (tag !== 'All Tags' && note.tag !== tag) return false
        if (!needle) return true
        // The body is searched too - a note you cannot find by what you wrote
        // in it is not much of a note.
        return `${noteDisplayTitle(note, bodies[note.id])} ${note.tag} ${bodies[note.id]}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => NOTE_SORTS[sort].compare(a, b, bodies))
  }, [library, bodies, query, tag, scope, sort, starred])

  const filtered = query.trim() || tag !== 'All Tags' || scope !== 'All'
  const clearFilters = () => { setQuery(''); setTag('All Tags'); setScope('All') }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 tabIndex="-1">Notes</h1>
          <p>Your ideas, plans, and everything in between.</p>
        </div>
        <div className="header-actions">
          {library.length > 0 && <SearchField placeholder="Search notes" value={query} onChange={setQuery} />}
          <button className="button-primary button-primary--header" onClick={onCreate}><Plus size={16} />New Note</button>
        </div>
      </header>

      {library.length === 0 ? (
        <EmptyState
          icon={PencilLine}
          title="No notes yet"
          text="Capture an idea, a spec, or a half-formed thought. Notes stay on this Mac."
          action={onCreate}
          label="Create Note"
        />
      ) : (
        <>
          <div className="content-toolbar">
            <div className="segmented" role="group" aria-label="Filter notes">
              {['All', 'Starred'].map(item => (
                <button key={item} className={scope === item ? 'is-active' : ''} aria-pressed={scope === item} onClick={() => setScope(item)}>{item}</button>
              ))}
            </div>
            <label className="select-field">
              <FileText size={16} />
              <span className="visually-hidden">Filter by tag</span>
              <select value={tag} onChange={event => setTag(event.target.value)}>
                <option>All Tags</option>
                {TAGS.map(item => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-field">
              <Clock size={15} />
              <span className="visually-hidden">Sort notes</span>
              <select value={sort} onChange={event => setSort(event.target.value)}>
                {Object.entries(NOTE_SORTS).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <ViewToggle view={view} onChange={setView} />
          </div>
          {visibleNotes.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matching notes"
              text="Nothing here matches the current search and filters."
              action={filtered ? clearFilters : undefined}
              label={filtered ? 'Clear Filters' : undefined}
            />
          ) : (
            <div className={`notes-grid notes-grid--${view}`}>
              {visibleNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  body={bodies[note.id]}
                  view={view}
                  starred={Boolean(starred[note.id])}
                  onOpen={onOpen}
                  onMenu={onMenu}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

function ProjectCard({ note, running, busy, runningApps, onOpen, onChooseFolder, onRevealFolder, onMenu, onStart, onStop, onEditApps, onDelete }) {
  const linked = Boolean(note.workspacePath)
  return (
    <article className={`project-card ${running ? 'is-running' : ''}`}>
      <button className="project-card-main" onClick={() => onOpen(note)}>
        <Glyph type={note.glyph} image={note.iconImage} />
        <span>
          <strong>{note.title}</strong>
          {note.description && <small>{note.description}</small>}
        </span>
      </button>
      {running && <RunningPill startedAt={running.startedAt} />}
      <AppStrip apps={note.apps} running={runningApps} onEdit={() => onEditApps(note)} />
      <button className="workspace-row" onClick={() => linked ? onRevealFolder(note) : onChooseFolder(note)}>
        <Folder size={15} />
        <span>{linked ? folderName(note.workspacePath) : 'Choose a workspace folder'}</span>
        <ChevronRight size={15} />
      </button>
      <div className="project-card-actions">
        <SessionButton note={note} running={running} busy={busy} onStart={onStart} onStop={onStop} />
        <button className="button-secondary" onClick={() => onOpen(note)}>Open</button>
        <IconButton label={`Project actions for ${note.title}`} onClick={() => onMenu(note)}><Ellipsis size={18} /></IconButton>
        <IconButton label={`Delete ${note.title}`} className="card-delete" onClick={() => onDelete(note)}><Trash2 size={17} /></IconButton>
      </div>
    </article>
  )
}

function ProjectsPage({ notes, sessions, runningApps, busyProject, onOpen, onCreate, onMenu, onChooseFolder, onRevealFolder, onStart, onStop, onEditApps, onDelete }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [view, setView] = useState('grid')

  const allProjects = notes.filter(note => note.project)
  const projects = allProjects.filter(note => {
    if (!`${note.title} ${note.description}`.toLowerCase().includes(query.toLowerCase())) return false
    if (filter === 'Running') return Boolean(sessions[note.id])
    return true
  })

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 tabIndex="-1">Projects</h1>
          <p>Launch, organize, and manage your developer workspaces.</p>
        </div>
        <div className="header-actions">
          {allProjects.length > 0 && <SearchField placeholder="Search projects" value={query} onChange={setQuery} />}
          <button className="button-primary button-primary--header" onClick={() => onCreate('project')}><Plus size={16} />New Project</button>
        </div>
      </header>

      {allProjects.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No projects yet"
          text="A project remembers your folder and the apps you work in. Press Start and they all open together."
          action={() => onCreate('project')}
          label="Create Project"
        />
      ) : (
        <>
          <div className="content-toolbar">
            <div className="segmented" role="group" aria-label="Filter projects">
              {['All', 'Running'].map(item => (
                <button key={item} className={filter === item ? 'is-active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>
              ))}
            </div>
            <ViewToggle view={view} onChange={setView} />
          </div>
          <div className={`projects-grid projects-grid--${view}`}>
            {projects.map(note => (
              <ProjectCard
                key={note.id}
                note={note}
                running={sessions[note.id]}
                busy={busyProject === note.id}
                runningApps={runningApps}
                onOpen={onOpen}
                onChooseFolder={onChooseFolder}
                onRevealFolder={onRevealFolder}
                onMenu={onMenu}
                onStart={onStart}
                onStop={onStop}
                onEditApps={onEditApps}
                onDelete={onDelete}
              />
            ))}
            {projects.length === 0 ? (
              <EmptyState icon={Search} title="Nothing matches" text="Try a different search term or filter." />
            ) : (
              <button className="new-project-card" onClick={() => onCreate('project')}>
                <span><Plus size={25} /></span>
                <div><strong>New Project</strong><small>Create a workspace from scratch.</small></div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

// Each status carries its own icon, so a feature's state is readable from the
// row without parsing the label. A native <select> cannot draw icons in its
// options, so the icon sits in the pill for the chosen value and doubles as the
// row's leading mark.
const FEATURE_STATUS_ICONS = {
  Building: Hammer,
  Planned: CalendarDays,
  Idea: Lightbulb,
  Done: CircleCheck,
}

const FEATURE_STATUSES = Object.keys(FEATURE_STATUS_ICONS)

// Images are only offered where there is room to show them - the Features tab
// passes the handlers, the sidebar summary does not.
function FeatureList({ features, onChange, onRemove, onAddImages, onRemoveImage }) {
  const withImages = Boolean(onAddImages)
  return (
    <div className={`feature-list ${withImages ? 'feature-list--full' : ''}`}>
      {features.map(feature => {
        const done = feature.status === 'Done'
        const images = feature.images || []
        const tone = feature.status.toLowerCase()
        const StatusIcon = FEATURE_STATUS_ICONS[feature.status] || Lightbulb
        return (
          <div className={`feature-row ${done ? 'feature-row--done' : ''}`} key={feature.id}>
            <span className={`feature-icon feature-icon--${tone}`}>
              <StatusIcon size={15} strokeWidth={2.1} />
            </span>
            <span className="feature-copy">
              <strong>{feature.title}</strong>
              {feature.description && <small>{feature.description}</small>}
            </span>
            <label className={`feature-status feature-status--${tone}`}>
              <span className="visually-hidden">Status for {feature.title}</span>
              <StatusIcon className="feature-status-icon" size={11} strokeWidth={2.4} aria-hidden="true" />
              <select value={feature.status} onChange={event => onChange(feature.id, event.target.value)}>
                {FEATURE_STATUSES.map(status => <option key={status}>{status}</option>)}
              </select>
            </label>
            {onRemove && (
              <IconButton label={`Remove ${feature.title}`} onClick={() => onRemove(feature.id)} className="feature-remove">
                <Trash2 size={15} />
              </IconButton>
            )}

            {withImages && (
              <div className="feature-shots">
                {images.map(filePath => (
                  <figure key={filePath}>
                    <img src={fileUrl(filePath)} alt={folderName(filePath)} />
                    <button
                      type="button"
                      aria-label={`Remove ${folderName(filePath)} from ${feature.title}`}
                      onClick={() => onRemoveImage(feature.id, filePath)}
                    ><X size={11} /></button>
                  </figure>
                ))}
                {/* Full height only when it sits beside thumbnails; on its own
                    it stays compact so an empty feature is still a slim row. */}
                <button
                  type="button"
                  className={`feature-shot-add ${images.length ? '' : 'feature-shot-add--compact'}`}
                  onClick={() => onAddImages(feature.id)}
                >
                  <Upload size={13} />{images.length ? 'Add' : 'Add photos'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FeatureComposer({ onAdd }) {
  const [title, setTitle] = useState('')
  const submit = event => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setTitle('')
  }
  return (
    <form className="feature-composer" onSubmit={submit}>
      <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Add a feature idea" aria-label="Feature title" />
      <button className="button-secondary" type="submit" disabled={!title.trim()}><Plus size={15} />Add</button>
    </form>
  )
}

function MediaLibrary({ images, onAdd, onRemove }) {
  return (
    <div className="media-library">
      {images.length ? (
        <div className="image-grid">
          {images.map(filePath => (
            <figure key={filePath}>
              <img src={fileUrl(filePath)} alt={folderName(filePath)} />
              <button aria-label={`Remove ${folderName(filePath)}`} onClick={() => onRemove(filePath)}><X size={14} /></button>
              <figcaption>{folderName(filePath)}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Image}
          tone="dashed"
          title="No images yet"
          text="Add screenshots, references, or moodboards for this project."
        />
      )}
      <button className="button-secondary media-add" onClick={onAdd}><Upload size={15} />Add Image</button>
    </div>
  )
}

function ProjectAppsPanel({ note, runningApps, onEdit }) {
  if (!note.apps?.length) {
    return (
      <EmptyState
        icon={AppWindow}
        tone="panel"
        title="No apps selected"
        text="Choose the apps that should open when you start this project."
        action={onEdit}
        label="Choose Apps"
      />
    )
  }
  return (
    <>
      <ul className="app-summary-list">
        {note.apps.map(app => (
          <li key={app.path}>
            <AppIcon app={app} size={26} />
            <span className="app-row-name">{app.name}</span>
            {app.openWithFolder && note.workspacePath && (
              <span className="app-row-flag" title={`Opens ${folderName(note.workspacePath)}`}><Folder size={12} />Folder</span>
            )}
            {runningApps?.has(app.path) && <span className="app-row-dot" title="Running" aria-label="Running" />}
          </li>
        ))}
      </ul>
      <button className="footer-link" onClick={onEdit}>Edit apps <ChevronRight size={16} /></button>
    </>
  )
}

function NoteDetailPage({
  note, detail, starred, saving,
  onRename, onRetag, onSetGlyph, onToggleStar, onMenu, onUpdateDetail, onAddImages, onRemoveImage, onCopy, onConvert,
}) {
  const [tab, setTab] = useState('write')
  const tabs = [{ id: 'write', label: 'Write' }, { id: 'preview', label: 'Preview' }, { id: 'images', label: 'Images' }]
  const activeIndex = tabs.findIndex(item => item.id === tab)
  const switchTab = index => setTab(tabs[(index + tabs.length) % tabs.length].id)
  const titleRef = useRef(null)

  const body = detail.body || ''
  const words = wordCount(body)
  const features = detail.features || []

  // Same shape as a project's features, so converting a note to a project
  // carries the list across untouched.
  const updateFeature = (featureId, status) => onUpdateDetail({
    ...detail,
    features: features.map(feature => feature.id === featureId ? { ...feature, status } : feature),
  })
  const removeFeature = featureId => onUpdateDetail({
    ...detail,
    features: features.filter(feature => feature.id !== featureId),
  })
  const addFeature = title => onUpdateDetail({
    ...detail,
    features: [...features, { id: `f-${Date.now().toString(36)}`, title, description: '', status: 'Idea', images: [] }],
  })

  // A brand new note opens with the cursor already in the title, so New Note
  // puts you straight into writing rather than into a form.
  useEffect(() => {
    if (!note.title || note.title === UNTITLED_NOTE) titleRef.current?.focus()
    setTab('write')
  }, [note.id, note.title])

  return (
    <div className="page page--note">
      <header className="detail-header">
        <div className="detail-title">
          <Glyph type={note.glyph} size="large" image={note.iconImage} />
          <div>
            {/* An unnamed note shows an empty field whose placeholder is the
                name the list is using for it, so the two never disagree. */}
            <input
              ref={titleRef}
              className="note-title-input"
              value={note.title === UNTITLED_NOTE ? '' : note.title}
              placeholder={noteDisplayTitle(note, body)}
              aria-label="Note title"
              onChange={event => onRename(event.target.value.trim() ? event.target.value : UNTITLED_NOTE)}
            />
            <p>
              Edited {relativeTime(note.updatedAt)} · {words} word{words === 1 ? '' : 's'}
              {saving ? ' · Saving…' : ''}
            </p>
          </div>
        </div>
        <div className="detail-actions">
          <IconButton label={starred ? 'Remove from starred' : 'Add to starred'} active={starred} onClick={onToggleStar}>
            <Star size={18} fill={starred ? 'currentColor' : 'none'} />
          </IconButton>
          <IconButton label="Copy note as text" onClick={onCopy}><Share size={18} /></IconButton>
          <IconButton label="Note actions" onClick={() => onMenu(note)}><Ellipsis size={18} /></IconButton>
        </div>
      </header>

      <div className="note-meta-bar">
        <div className="glyph-picker glyph-picker--inline" role="radiogroup" aria-label="Note icon">
          {GLYPHS.map(option => {
            const Icon = option.icon
            return (
              <button
                type="button"
                key={option.id}
                role="radio"
                aria-checked={note.glyph === option.id}
                aria-label={option.label}
                title={option.label}
                className={`glyph-swatch project-glyph--${option.id} ${note.glyph === option.id ? 'is-selected' : ''}`}
                onClick={() => onSetGlyph(option.id)}
              >
                <Icon size={15} strokeWidth={1.8} />
              </button>
            )
          })}
        </div>
        <label className="select-field">
          <span className="visually-hidden">Note tag</span>
          <select value={note.tag} onChange={event => onRetag(event.target.value)}>
            {TAGS.map(item => <option key={item}>{item}</option>)}
          </select>
          <ChevronDown size={14} />
        </label>
        {/* Visible rather than buried in the context menu - promoting an idea
            to a project is a thing you go looking for, not a right-click. */}
        <button type="button" className="text-button note-convert" onClick={onConvert}>
          <Rocket size={15} />Convert to Project
        </button>
      </div>

      <div className="note-grid">
      <section className="editor-surface note-editor">
        <div className="editor-tabs" role="tablist" aria-label="Note content">
          {tabs.map((item, index) => (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              className={tab === item.id ? 'is-active' : ''}
              onKeyDown={event => {
                if (event.key === 'ArrowRight') { event.preventDefault(); switchTab(activeIndex + 1) }
                if (event.key === 'ArrowLeft') { event.preventDefault(); switchTab(activeIndex - 1) }
              }}
              onClick={() => setTab(item.id)}
            >{item.label}</button>
          ))}
        </div>

        {tab === 'write' && (
          <div id="panel-write" role="tabpanel" aria-labelledby="tab-write" className="note-write">
            <textarea
              value={body}
              aria-label="Note body"
              placeholder={'Start writing…\n\nMarkdown works here: # headings, **bold**, `code`, - lists, - [ ] tasks.'}
              onChange={event => onUpdateDetail({ ...detail, body: event.target.value })}
            />
            <p className="autosave"><Check size={14} />{saving ? 'Saving…' : 'Saved locally'}</p>
          </div>
        )}

        {tab === 'preview' && (
          <div id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" className="note-preview markdown-body">
            {body.trim()
              ? renderMarkdown(body)
              : <p className="empty-copy">Nothing to preview yet. Switch to Write and start typing.</p>}
          </div>
        )}

        {tab === 'images' && (
          <div id="panel-images" role="tabpanel" aria-labelledby="tab-images" className="tab-panel">
            <MediaLibrary images={detail.images} onAdd={onAddImages} onRemove={onRemoveImage} />
          </div>
        )}
      </section>

        <aside className="detail-side">
          <Surface className="project-features note-features">
            <SectionTitle>Feature Ideas</SectionTitle>
            {features.length === 0
              ? <p className="empty-copy">Nothing tracked yet. Add the first idea below.</p>
              : <FeatureList features={features} onChange={updateFeature} onRemove={removeFeature} />}
            <div className="note-feature-composer">
              <FeatureComposer onAdd={addFeature} />
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  )
}

function ProjectDetailPage({
  note, detail, starred, running, busy, runningApps,
  onToggleStar, onMenu, onUpdateDetail, onAddImages, onRemoveImage, onPickImages,
  onChooseFolder, onRevealFolder, onShare, onStart, onStop, onEditApps,
}) {
  const [tab, setTab] = useState('notes')
  const tabs = [{ id: 'notes', label: 'Notes' }, { id: 'media', label: 'Images' }, { id: 'features', label: 'Features' }]
  const activeIndex = tabs.findIndex(item => item.id === tab)
  const switchTab = index => setTab(tabs[(index + tabs.length) % tabs.length].id)

  const patchFeature = (featureId, patch) => onUpdateDetail({
    ...detail,
    features: detail.features.map(feature => feature.id === featureId ? { ...feature, ...patch } : feature),
  })
  const updateFeature = (featureId, status) => patchFeature(featureId, { status })
  const removeFeature = featureId => onUpdateDetail({
    ...detail,
    features: detail.features.filter(feature => feature.id !== featureId),
  })
  const addFeature = title => onUpdateDetail({
    ...detail,
    features: [...detail.features, { id: `f-${Date.now().toString(36)}`, title, description: '', status: 'Idea', images: [] }],
  })

  const addFeatureImages = async featureId => {
    const paths = await onPickImages()
    if (!paths?.length) return
    const current = detail.features.find(feature => feature.id === featureId)?.images || []
    patchFeature(featureId, { images: [...new Set([...current, ...paths])] })
  }
  const removeFeatureImage = (featureId, filePath) => {
    const current = detail.features.find(feature => feature.id === featureId)?.images || []
    patchFeature(featureId, { images: current.filter(item => item !== filePath) })
  }

  return (
    <div className="page page--detail">
      <header className="detail-header">
        <div className="detail-title">
          <Glyph type={note.glyph} size="large" image={note.iconImage} />
          <div>
            <h1 tabIndex="-1">{note.title}</h1>
            <p>Edited {relativeTime(note.updatedAt)}{running ? ' · running now' : ''}</p>
          </div>
        </div>
        <div className="detail-actions">
          <SessionButton note={note} running={running} busy={busy} onStart={onStart} onStop={onStop} className="button-primary--header" />
          <IconButton label="Favorite project" active={starred} onClick={onToggleStar}><Star size={18} fill={starred ? 'currentColor' : 'none'} /></IconButton>
          <IconButton label="Share project link" onClick={onShare}><Share size={18} /></IconButton>
          <IconButton label="Project actions" onClick={() => onMenu(note)}><Ellipsis size={18} /></IconButton>
        </div>
      </header>

      <div className="detail-grid">
        <section className="editor-surface">
          <div className="editor-tabs" role="tablist" aria-label="Project content">
            {tabs.map((item, index) => (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                className={tab === item.id ? 'is-active' : ''}
                onKeyDown={event => {
                  if (event.key === 'ArrowRight') { event.preventDefault(); switchTab(activeIndex + 1) }
                  if (event.key === 'ArrowLeft') { event.preventDefault(); switchTab(activeIndex - 1) }
                }}
                onClick={() => setTab(item.id)}
              >{item.label}</button>
            ))}
          </div>

          {tab === 'notes' && (
            <div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" className="editor-content">
              <label className="editor-field">
                <span>Project Overview</span>
                <textarea
                  value={detail.overview}
                  placeholder="What is this project, in a sentence or two?"
                  onChange={event => onUpdateDetail({ ...detail, overview: event.target.value })}
                />
              </label>
              <label className="editor-field">
                <span>Goal</span>
                <textarea
                  value={detail.goal}
                  placeholder="What does done look like?"
                  onChange={event => onUpdateDetail({ ...detail, goal: event.target.value })}
                />
              </label>
              <p className="autosave"><Check size={14} />Saved locally</p>
            </div>
          )}

          {tab === 'media' && (
            <div id="panel-media" role="tabpanel" aria-labelledby="tab-media" className="tab-panel">
              <MediaLibrary images={detail.images} onAdd={onAddImages} onRemove={onRemoveImage} />
            </div>
          )}

          {tab === 'features' && (
            <div id="panel-features" role="tabpanel" aria-labelledby="tab-features" className="tab-panel">
              {detail.features.length === 0 ? (
                <EmptyState
                  icon={Lightbulb}
                  tone="dashed"
                  title="No features yet"
                  text="Track what you are building, planning, and still thinking about."
                />
              ) : (
                <FeatureList
                  features={detail.features}
                  onChange={updateFeature}
                  onRemove={removeFeature}
                  onAddImages={addFeatureImages}
                  onRemoveImage={removeFeatureImage}
                />
              )}
              <FeatureComposer onAdd={addFeature} />
            </div>
          )}
        </section>

        <aside className="detail-side">
          <Surface className="project-apps">
            <SectionTitle action={
              note.apps?.length ? <button className="text-button" onClick={onEditApps}>Edit <ChevronRight size={16} /></button> : null
            }>Apps</SectionTitle>
            <ProjectAppsPanel note={note} runningApps={runningApps} onEdit={onEditApps} />
          </Surface>

          <Surface className="project-info">
            <SectionTitle>Workspace</SectionTitle>
            <button className="workspace-row workspace-row--panel" onClick={() => note.workspacePath ? onRevealFolder(note) : onChooseFolder(note)}>
              <Folder size={16} />
              <span>{note.workspacePath ? folderName(note.workspacePath) : 'Choose a workspace folder'}</span>
              <ChevronRight size={15} />
            </button>
            <p>{note.workspacePath
              ? 'Apps marked “Opens folder” receive this path when the project starts.'
              : 'Link a real folder so DevDoc can hand it to your editor and terminal.'}</p>
          </Surface>

          <Surface className="project-features">
            <SectionTitle action={detail.features.length > 3 ? (
              <button className="text-button" onClick={() => setTab('features')}>
                See all {detail.features.length} <ChevronRight size={16} />
              </button>
            ) : null}>Feature Ideas</SectionTitle>
            {detail.features.length === 0
              ? <p className="empty-copy">Nothing tracked yet. Add ideas from the Features tab.</p>
              : <FeatureList features={detail.features.slice(0, 3)} onChange={updateFeature} />}
          </Surface>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

function SettingsPage({ settings, onChange, onOpenAppData, userName, isDesktop }) {
  const toggle = key => onChange({ ...settings, [key]: !settings[key] })
  return (
    <div className="page settings-page">
      <header className="page-intro">
        <h1 tabIndex="-1">Settings</h1>
        <p>Fine tune your DevDoc workspace.</p>
      </header>

      <Surface className="settings-surface">
        <SectionTitle>General</SectionTitle>
        <div className="setting-row">
          <span><strong>Workspace notifications</strong><small>Keep this preference with your local DevDoc workspace.</small></span>
          <button role="switch" aria-checked={settings.notifications} className={`switch ${settings.notifications ? 'on' : ''}`} onClick={() => toggle('notifications')}><i /></button>
        </div>
        <div className="setting-row">
          <span><strong>Reduce motion</strong><small>Use short, quiet transitions throughout DevDoc.</small></span>
          <button role="switch" aria-checked={settings.reducedMotion} className={`switch ${settings.reducedMotion ? 'on' : ''}`} onClick={() => toggle('reducedMotion')}><i /></button>
        </div>
      </Surface>

      <Surface className="settings-surface">
        <SectionTitle>Projects</SectionTitle>
        <div className="setting-row">
          <span>
            <strong>Stop quits every project app</strong>
            <small>Off, Stop only quits apps DevDoc opened. On, it also quits apps that were already running.</small>
          </span>
          <button role="switch" aria-checked={settings.stopQuitsAll} className={`switch ${settings.stopQuitsAll ? 'on' : ''}`} onClick={() => toggle('stopQuitsAll')}><i /></button>
        </div>
        <div className="setting-row">
          <span><strong>DevDoc data</strong><small>Open the local folder where DevDoc keeps its desktop data.</small></span>
          <button className="button-secondary" onClick={onOpenAppData}>Open Folder</button>
        </div>
        {userName && (
          <div className="setting-row">
            <span><strong>Signed in as</strong><small>Taken from your macOS account. DevDoc has no accounts of its own.</small></span>
            <span className="setting-value">{userName}</span>
          </div>
        )}
        {!isDesktop && (
          <div className="setting-row">
            <span><strong>Browser preview</strong><small>Launching apps, folders, and Finder actions need DevDoc for Mac.</small></span>
          </div>
        )}
      </Surface>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Sheets
 * ------------------------------------------------------------------ */

function Sheet({ children, titleId, onDismiss, className = '' }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    // A field marked data-autofocus wins outright. React never reflects its
    // autoFocus prop as an attribute, so the sheet has to be told explicitly -
    // otherwise focus lands on whatever comes first, usually the close button.
    const focusDialog = () => {
      const target = dialogRef.current?.querySelector('[data-autofocus]')
        || dialogRef.current?.querySelector('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])')
      target?.focus()
    }
    const trap = event => {
      if (event.key === 'Escape') { event.preventDefault(); onDismiss(); return }
      if (event.key !== 'Tab') return
      const items = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]') || [])]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.body.classList.add('dialog-open')
    const frame = requestAnimationFrame(focusDialog)
    document.addEventListener('keydown', trap)
    return () => {
      cancelAnimationFrame(frame)
      document.body.classList.remove('dialog-open')
      document.removeEventListener('keydown', trap)
      previous?.focus?.()
    }
  }, [onDismiss])

  return (
    <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onDismiss()}>
      <section className={`sheet ${className}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>{children}</section>
    </div>
  )
}

/**
 * The New Project sheet. A project is a shortcut for opening a set of apps on a
 * folder, so creating one is exactly those three decisions: what it is called,
 * which apps open with it, and where its workspace lives.
 */
function NewProjectSheet({ isDesktop, notify, onDismiss, onCreate }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [iconImage, setIconImage] = useState('')
  const [catalog, setCatalog] = useState(null)
  const [tiles, setTiles] = useState([])
  const [selectedPaths, setSelectedPaths] = useState(() => new Set())
  const [appDetails, setAppDetails] = useState({})
  const [browsing, setBrowsing] = useState(false)
  const [query, setQuery] = useState('')
  const [locations, setLocations] = useState({ home: '', root: '' })
  const [chosenPath, setChosenPath] = useState('')
  const [creating, setCreating] = useState(false)
  const iconInputRef = useRef(null)
  const { request } = useContext(AppIconContext)

  useEffect(() => {
    if (!isDesktop) { setCatalog([]); return undefined }
    let cancelled = false

    window.devdocDesktop.workspaceDefaults()
      .then(value => { if (!cancelled) setLocations(value) })
      .catch(() => { /* Without a default root the folder row simply waits for Choose. */ })

    window.devdocDesktop.listApplications()
      .then(async list => {
        if (cancelled) return
        const suggested = resolveSuggestedApps(list)
        setCatalog(list)
        setTiles(suggested)
        setSelectedPaths(new Set(suggested.slice(0, DEFAULT_CHECKED_SLOTS).map(item => item.path)))
        request(suggested.map(item => item.path))
        try {
          const inspected = await window.devdocDesktop.inspectApplications(suggested.map(item => item.path))
          if (!cancelled) setAppDetails(Object.fromEntries(inspected.map(entry => [entry.path, entry])))
        } catch {
          // Inspection only decides who receives the folder - launching still works.
        }
      })
      .catch(() => { if (!cancelled) setCatalog([]) })

    return () => { cancelled = true }
  }, [isDesktop, request])

  // The full catalog's icons are only worth fetching once the list is on screen.
  useEffect(() => {
    if (browsing && catalog?.length) request(catalog.map(item => item.path))
  }, [browsing, catalog, request])

  const tiledPaths = useMemo(() => new Set(tiles.map(item => item.path)), [tiles])

  const results = useMemo(() => {
    if (!catalog) return []
    const needle = query.trim().toLowerCase()
    const available = catalog.filter(item => !tiledPaths.has(item.path))
    return needle ? available.filter(item => item.name.toLowerCase().includes(needle)) : available
  }, [catalog, query, tiledPaths])

  const safeName = folderSafeName(title)
  const workspacePath = chosenPath || (locations.root && safeName ? `${locations.root}/${safeName}` : '')

  const toggleApp = useCallback(path => setSelectedPaths(previous => {
    const next = new Set(previous)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  }), [])

  const addApp = useCallback(async entry => {
    setTiles(items => items.some(item => item.path === entry.path) ? items : [...items, entry])
    setSelectedPaths(previous => new Set(previous).add(entry.path))
    setQuery('')
    setBrowsing(false)
    request([entry.path])
    try {
      const [inspected] = await window.devdocDesktop.inspectApplications([entry.path])
      if (inspected) setAppDetails(items => ({ ...items, [entry.path]: inspected }))
    } catch {
      // As above - a missing inspection just means no folder is handed over.
    }
  }, [request])

  const browseForApp = useCallback(async () => {
    try {
      const picked = await window.devdocDesktop.browseForApplication()
      if (!picked) return
      setTiles(items => items.some(item => item.path === picked.path) ? items : [...items, picked])
      setSelectedPaths(previous => new Set(previous).add(picked.path))
      setAppDetails(items => ({ ...items, [picked.path]: picked }))
      setBrowsing(false)
      request([picked.path])
    } catch {
      notify('Could not open that application.')
    }
  }, [notify, request])

  const chooseFolder = useCallback(async () => {
    if (!isDesktop) { notify('Choosing a folder needs DevDoc for Mac.'); return }
    const picked = await window.devdocDesktop.chooseWorkspaceFolder()
    if (picked) setChosenPath(picked)
  }, [isDesktop, notify])

  const pickIcon = useCallback(async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > PROJECT_ICON_LIMIT) { notify('That image is larger than 2MB. Choose a smaller one.'); return }
    try {
      setIconImage(await prepareProjectIcon(file))
    } catch {
      notify('Could not read that image.')
    }
  }, [notify])

  const submit = async event => {
    event.preventDefault()
    const name = title.trim()
    if (!name || creating) return

    const apps = tiles
      .filter(tile => selectedPaths.has(tile.path))
      .map(tile => toSessionApp(appDetails[tile.path] || tile))

    setCreating(true)
    try {
      await onCreate({
        title: name,
        description: description.trim(),
        tag: 'Tech',
        glyph: 'code',
        project: true,
        apps,
        workspacePath,
        iconImage,
      })
      onDismiss()
    } catch {
      notify('Could not create that project.')
      setCreating(false)
    }
  }

  return (
    <Sheet titleId="new-project-title" onDismiss={onDismiss} className="sheet--project">
      <form className="project-sheet" onSubmit={submit}>
        <header>
          <div>
            <h2 id="new-project-title">New Project</h2>
            <p>Create a new developer workspace.</p>
          </div>
          <IconButton label="Close sheet" onClick={onDismiss}><X size={17} /></IconButton>
        </header>

        <div className="project-sheet-scroll">
          <div className="project-identity">
            <div className="project-identity-fields">
              <label><span>Project name</span>
                <input
                  data-autofocus
                  required
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="My Awesome Project"
                />
              </label>
              <label><span>Description <em>optional</em></span>
                <input
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  placeholder="What is this project about?"
                />
              </label>
            </div>

            <div className="project-icon-field">
              <span className="field-label">Project icon</span>
              <input
                ref={iconInputRef}
                type="file"
                accept={PROJECT_ICON_TYPES}
                onChange={pickIcon}
                className="visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
              />
              {iconImage ? (
                <div className="project-icon-preview">
                  <img src={iconImage} alt="Chosen project icon" />
                  <button type="button" aria-label="Remove project icon" onClick={() => setIconImage('')}><X size={13} /></button>
                </div>
              ) : (
                <button type="button" className="project-icon-drop" onClick={() => iconInputRef.current?.click()}>
                  <Upload size={21} strokeWidth={1.6} />
                  <strong>Upload image</strong>
                  <small>PNG, JPG, SVG</small>
                  <small>Max 2MB</small>
                </button>
              )}
            </div>
          </div>

          <section className="project-sheet-section">
            <h3>Open with</h3>
            <p>Choose the tools and apps that open automatically with this project.</p>

            {isDesktop && catalog === null && <p className="app-picker-hint">Looking for applications…</p>}
            {!isDesktop && <p className="app-picker-hint">Application launching is available in DevDoc for Mac.</p>}

            {catalog !== null && (
              <div className="app-tile-grid">
                {tiles.map(app => {
                  const checked = selectedPaths.has(app.path)
                  return (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      key={app.path}
                      className={`app-tile ${checked ? 'is-on' : ''}`}
                      onClick={() => toggleApp(app.path)}
                    >
                      <AppIcon app={app} size={34} />
                      <span className="app-tile-name">{app.name}</span>
                      <i className="app-tile-check" aria-hidden="true">{checked && <Check size={11} strokeWidth={3.4} />}</i>
                    </button>
                  )
                })}
                {isDesktop && (
                  <button
                    type="button"
                    className={`app-tile app-tile--more ${browsing ? 'is-open' : ''}`}
                    aria-expanded={browsing}
                    onClick={() => setBrowsing(open => !open)}
                  >
                    <span className="app-tile-plus"><Plus size={22} strokeWidth={1.7} /></span>
                    <span className="app-tile-name">More apps</span>
                  </button>
                )}
              </div>
            )}

            {browsing && (
              <div className="app-browser">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    autoFocus
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search applications"
                    aria-label="Search applications"
                  />
                </label>
                <div className="app-browser-list">
                  {results.length === 0 && (
                    <p className="app-picker-hint">{query.trim() ? 'No applications match that search.' : 'Every installed application is already listed.'}</p>
                  )}
                  {results.slice(0, 300).map(app => (
                    <button type="button" className="app-row" key={app.path} onClick={() => addApp(app)}>
                      <AppIcon app={app} size={24} />
                      <span className="app-row-name">{app.name}</span>
                      <Plus size={15} />
                    </button>
                  ))}
                </div>
                <button type="button" className="text-button app-browser-browse" onClick={browseForApp}>
                  Browse for an application… <ChevronRight size={15} />
                </button>
              </div>
            )}

            <p className="field-note">You can add or remove apps later from the project.</p>
          </section>

          <section className="project-sheet-section">
            <h3>Workspace folder</h3>
            <div className="workspace-picker">
              <Folder size={15} />
              <span>{workspacePath ? tildePath(workspacePath, locations.home) : 'No folder yet'}</span>
              <button type="button" className="button-secondary" onClick={chooseFolder}>Choose…</button>
            </div>
            <p className="field-note">
              {workspacePath
                ? 'This folder will be created if it doesn’t exist.'
                : 'Name the project to get a suggested folder, or choose one yourself.'}
            </p>
          </section>
        </div>

        <footer>
          <button type="button" className="button-secondary" onClick={onDismiss}>Cancel</button>
          <button className="button-primary" type="submit" disabled={!title.trim() || creating}>
            {creating ? 'Creating…' : 'Create Project'}
          </button>
        </footer>
      </form>
    </Sheet>
  )
}

function ConfirmSheet({ title, text, confirmLabel, onDismiss, onConfirm }) {
  return (
    <Sheet titleId="confirm-sheet-title" onDismiss={onDismiss}>
      <div className="create-sheet confirm-sheet">
        <header>
          <div>
            <h2 id="confirm-sheet-title">{title}</h2>
            <p>{text}</p>
          </div>
        </header>
        <footer>
          <button type="button" className="button-secondary" onClick={onDismiss}>Cancel</button>
          <button type="button" className="button-destructive" onClick={() => { onConfirm(); onDismiss() }}>{confirmLabel}</button>
        </footer>
      </div>
    </Sheet>
  )
}

/**
 * The app picker. Reads the real /Applications catalog, shows real bundle
 * icons, and records whether each app should receive the workspace folder.
 */
function AppPickerSheet({ project, isDesktop, onDismiss, onSave, notify }) {
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState(null)
  const [selected, setSelected] = useState(() => project.apps || [])
  const [pending, setPending] = useState('')
  const { request } = useContext(AppIconContext)

  useEffect(() => {
    if (!isDesktop) { setCatalog([]); return undefined }
    let cancelled = false
    window.devdocDesktop.listApplications()
      .then(list => {
        if (cancelled) return
        setCatalog(list)
        request(list.map(item => item.path))
      })
      .catch(() => { if (!cancelled) setCatalog([]) })
    return () => { cancelled = true }
  }, [isDesktop, request])

  const selectedPaths = useMemo(() => new Set(selected.map(item => item.path)), [selected])

  const results = useMemo(() => {
    if (!catalog) return []
    const needle = query.trim().toLowerCase()
    const available = catalog.filter(item => !selectedPaths.has(item.path))
    return needle ? available.filter(item => item.name.toLowerCase().includes(needle)) : available
  }, [catalog, query, selectedPaths])

  const addEntry = useCallback(entry => {
    setSelected(items => items.some(item => item.path === entry.path) ? items : [...items, {
      path: entry.path,
      name: entry.name,
      scriptName: entry.scriptName || entry.name,
      bundleId: entry.bundleId || '',
      openWithFolder: Boolean(entry.opensFolders),
    }])
  }, [])

  const addApp = useCallback(async candidate => {
    setPending(candidate.path)
    let detail = candidate
    try {
      const [inspected] = await window.devdocDesktop.inspectApplications([candidate.path])
      if (inspected) detail = inspected
    } catch {
      // Inspection is an optimisation - fall back to a folder-free launch.
    }
    addEntry(detail)
    setPending('')
    setQuery('')
  }, [addEntry])

  const browse = useCallback(async () => {
    if (!isDesktop) return
    try {
      const picked = await window.devdocDesktop.browseForApplication()
      if (picked) { addEntry(picked); request([picked.path]) }
    } catch {
      notify('Could not open that application.')
    }
  }, [addEntry, isDesktop, notify, request])

  const removeApp = path => setSelected(items => items.filter(item => item.path !== path))
  const toggleFolder = path => setSelected(items => items.map(item =>
    item.path === path ? { ...item, openWithFolder: !item.openWithFolder } : item
  ))

  const linked = Boolean(project.workspacePath)

  return (
    <Sheet titleId="apps-sheet-title" onDismiss={onDismiss} className="sheet--wide">
      <div className="app-picker">
        <header>
          <div>
            <h2 id="apps-sheet-title">Project Apps</h2>
            <p>Choose what opens when you start {project.title}.</p>
          </div>
          <IconButton label="Close sheet" onClick={onDismiss}><X size={17} /></IconButton>
        </header>

        <div className="app-picker-selected">
          <span className="command-caption">SELECTED · {selected.length}</span>
          {selected.length === 0 ? (
            <p className="app-picker-hint">Nothing selected yet. Pick apps below and Start opens them together.</p>
          ) : (
            <ul>
              {selected.map(app => (
                <li key={app.path}>
                  <AppIcon app={app} size={26} />
                  <span className="app-row-name">{app.name}</span>
                  <button
                    type="button"
                    className={`folder-toggle ${app.openWithFolder && linked ? 'is-on' : ''}`}
                    onClick={() => toggleFolder(app.path)}
                    disabled={!linked}
                    aria-pressed={Boolean(app.openWithFolder && linked)}
                    title={linked
                      ? (app.openWithFolder ? `Opens ${folderName(project.workspacePath)}` : 'Launches without the workspace folder')
                      : 'Link a workspace folder first'}
                  >
                    <Folder size={12} />{app.openWithFolder && linked ? 'Opens folder' : 'App only'}
                  </button>
                  <IconButton label={`Remove ${app.name}`} onClick={() => removeApp(app.path)}><X size={15} /></IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="search-field app-picker-search">
          <Search size={17} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search applications"
            aria-label="Search applications"
          />
        </label>

        <div className="app-picker-list">
          {!isDesktop && (
            <p className="app-picker-hint">Application launching is available in DevDoc for Mac.</p>
          )}
          {isDesktop && catalog === null && <p className="app-picker-hint">Looking for applications…</p>}
          {isDesktop && catalog !== null && results.length === 0 && (
            <p className="app-picker-hint">{query.trim() ? 'No applications match that search.' : 'Every installed application is already selected.'}</p>
          )}
          {results.slice(0, 300).map(app => (
            <button
              type="button"
              className="app-row"
              key={app.path}
              onClick={() => addApp(app)}
              disabled={pending === app.path}
            >
              <AppIcon app={app} size={26} />
              <span className="app-row-name">{app.name}</span>
              <Plus size={16} />
            </button>
          ))}
        </div>

        <footer>
          <button type="button" className="button-secondary" onClick={browse} disabled={!isDesktop}>Browse…</button>
          <span className="app-picker-count">
            {catalog?.length ? `${catalog.length} applications found` : ''}
          </span>
          <button type="button" className="button-secondary" onClick={onDismiss}>Cancel</button>
          <button type="button" className="button-primary" onClick={() => { onSave(selected); onDismiss() }}>Done</button>
        </footer>
      </div>
    </Sheet>
  )
}

function CommandPalette({ onDismiss, onNavigate, onCreate, onCreateNote, onStartSelected, canStart, isRunning }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const commands = useMemo(() => [
    { id: 'home', title: 'Go to Home', icon: House, action: () => onNavigate('home') },
    { id: 'notes', title: 'Browse Notes', icon: FileText, action: () => onNavigate('notes') },
    { id: 'projects', title: 'Open Projects', icon: FolderOpen, action: () => onNavigate('projects') },
    ...(canStart ? [{
      id: 'toggle-session',
      title: isRunning ? 'Stop current project' : 'Start current project',
      icon: isRunning ? Square : Play,
      action: onStartSelected,
    }] : []),
    { id: 'new-project', title: 'Create a new project', icon: Plus, action: () => onCreate('project') },
    { id: 'new-note', title: 'Create a new note', icon: PencilLine, action: onCreateNote },
    { id: 'settings', title: 'Open Settings', icon: Settings, action: () => onNavigate('settings') },
  ].filter(command => command.title.toLowerCase().includes(query.toLowerCase())), [query, onNavigate, onCreate, onCreateNote, onStartSelected, canStart, isRunning])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])

  const run = command => { onDismiss(); requestAnimationFrame(command.action) }

  const onKeyDown = event => {
    if (!commands.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % commands.length) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index - 1 + commands.length) % commands.length) }
    if (event.key === 'Enter') { event.preventDefault(); run(commands[active]) }
  }

  return (
    <Sheet titleId="command-sheet-title" onDismiss={onDismiss}>
      <div className="command-palette">
        <div className="command-search">
          <Search size={19} />
          <input
            ref={inputRef}
            aria-labelledby="command-sheet-title"
            aria-controls="command-results"
            aria-activedescendant={commands[active] ? `command-${commands[active].id}` : undefined}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands"
          />
          <kbd>Esc</kbd>
        </div>
        <h2 id="command-sheet-title" className="visually-hidden">Command Palette</h2>
        <span className="command-caption">COMMANDS</span>
        <div id="command-results" role="listbox">
          {commands.length ? commands.map((command, index) => {
            const Icon = command.icon
            return (
              <button
                id={`command-${command.id}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? 'is-active' : ''}
                key={command.id}
                onMouseEnter={() => setActive(index)}
                onClick={() => run(command)}
              >
                <Icon size={17} /><span>{command.title}</span><ChevronRight size={16} />
              </button>
            )
          }) : <p className="command-empty">No matching commands.</p>}
        </div>
      </div>
    </Sheet>
  )
}

function Toast({ message, onDismiss }) {
  return message ? (
    <div className="toast" role="status">
      <Check size={15} /><span>{message}</span>
      <button aria-label="Dismiss notification" onClick={onDismiss}><X size={14} /></button>
    </div>
  ) : null
}

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

function App() {
  const [notes, setNotes] = usePersistedState(STORAGE.notes, [])
  const [details, setDetails] = usePersistedState(STORAGE.details, {}, 400)
  const [settings, setSettings] = usePersistedState(STORAGE.settings, DEFAULT_SETTINGS)
  const [starred, setStarred] = usePersistedState(STORAGE.starred, {})
  const [sessions, setSessions] = usePersistedState(STORAGE.sessions, {})
  const [focusLog, setFocusLog] = usePersistedState(STORAGE.focusLog, [])
  const [activity, setActivity] = usePersistedState(STORAGE.activity, [])

  const [page, setPage] = useState('home')
  const [selectedId, setSelectedId] = useState('')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const [busyProject, setBusyProject] = useState('')
  const [runningApps, setRunningApps] = useState(() => new Set())
  const [userName, setUserName] = useState('')

  const [saving, setSaving] = useState(false)

  const toastTimer = useRef(null)
  const savingTimer = useRef(null)
  const mainRef = useRef(null)

  const isDesktop = Boolean(window.devdocDesktop)
  const selected = notes.find(note => note.id === selectedId) || null

  // Notes written before the body field existed kept their text in the project
  // `overview`/`goal` fields. Reads go through the migrated copy so nothing ever
  // renders the old shape, and the effect below writes the repair back once.
  const migratedDetails = useMemo(() => {
    let changed = false
    const next = {}
    for (const note of notes) {
      const current = details[note.id]
      const migrated = migrateDetail(current, note) || makeDetail(note)
      if (migrated !== current) changed = true
      next[note.id] = migrated
    }
    return changed ? next : details
  }, [details, notes])

  useEffect(() => {
    if (migratedDetails !== details) setDetails(migratedDetails)
  }, [migratedDetails, details, setDetails])

  const selectedDetail = (selected && migratedDetails[selected.id]) || makeDetail(selected)

  const notify = useCallback(message => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 3600)
  }, [])

  const logActivity = useCallback((kind, title) => {
    setActivity(items => [
      { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, kind, title, at: Date.now() },
      ...items,
    ].slice(0, 40))
  }, [setActivity])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => { document.title = 'DevDoc' }, [])

  useEffect(() => {
    if (!isDesktop) return
    window.devdocDesktop.userName().then(name => setUserName(name || '')).catch(() => setUserName(''))
  }, [isDesktop])

  useEffect(() => {
    const frame = requestAnimationFrame(() => mainRef.current?.querySelector('h1')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [page, selectedId])

  const navigate = useCallback(next => { setPage(next); setModal(null) }, [])
  const openNote = useCallback(note => {
    if (!note) return
    setSelectedId(note.id)
    setPage('detail')
    setModal(null)
  }, [])

  const touchNote = useCallback(id => {
    setNotes(items => items.map(item => item.id === id ? { ...item, updatedAt: Date.now() } : item))
  }, [setNotes])

  const updateDetail = useCallback(nextDetail => {
    if (!selected) return
    setDetails(items => ({ ...items, [selected.id]: nextDetail }))
    touchNote(selected.id)
    // Mirrors the persistence debounce, so "Saving…" reflects a real pending
    // write rather than being decorative.
    setSaving(true)
    window.clearTimeout(savingTimer.current)
    savingTimer.current = window.setTimeout(() => setSaving(false), 700)
  }, [selected, setDetails, touchNote])

  useEffect(() => () => window.clearTimeout(savingTimer.current), [])

  /* ---- notes ---- */

  const patchNote = useCallback((noteId, patch) => {
    setNotes(items => items.map(item => item.id === noteId ? { ...item, ...patch, updatedAt: Date.now() } : item))
  }, [setNotes])

  const createNote = useCallback(() => {
    const used = new Set(notes.map(note => note.id))
    const id = createId(UNTITLED_NOTE, used)
    const now = Date.now()
    const note = {
      id,
      title: UNTITLED_NOTE,
      description: '',
      tag: 'Docs',
      glyph: 'document',
      iconImage: '',
      project: false,
      createdAt: now,
      updatedAt: now,
      workspacePath: '',
      apps: [],
    }
    setNotes(items => [note, ...items])
    setDetails(items => ({ ...items, [id]: makeDetail(note) }))
    setSelectedId(id)
    setPage('detail')
    setModal(null)
    logActivity('create', `Created a note`)
  }, [logActivity, notes, setDetails, setNotes])

  const toggleStar = useCallback(noteId => {
    setStarred(items => {
      const next = { ...items }
      if (next[noteId]) delete next[noteId]
      else next[noteId] = true
      return next
    })
  }, [setStarred])

  const copyNoteAsText = useCallback(async noteId => {
    const note = notes.find(item => item.id === noteId)
    if (!note) return
    const copied = await copyText(noteAsText(note, migratedDetails[note.id]))
    notify(copied ? 'Note copied as text' : 'Clipboard access is unavailable')
  }, [migratedDetails, notes, notify])

  const duplicateNote = useCallback(noteId => {
    const note = notes.find(item => item.id === noteId)
    if (!note) return
    const used = new Set(notes.map(item => item.id))
    const title = `${noteDisplayTitle(note, migratedDetails[note.id]?.body)} Copy`
    const id = createId(title, used)
    const now = Date.now()
    setNotes(items => [{ ...note, id, title, createdAt: now, updatedAt: now }, ...items])
    setDetails(items => ({ ...items, [id]: { ...(migratedDetails[note.id] || makeDetail(note)) } }))
    setSelectedId(id)
    setPage('detail')
    notify(`${title} created`)
  }, [migratedDetails, notes, notify, setDetails, setNotes])

  // The note's text becomes the project overview so nothing written before the
  // idea graduated is stranded on a page that no longer shows it.
  const convertToProject = useCallback(noteId => {
    const note = notes.find(item => item.id === noteId)
    if (!note || note.project) return
    const detail = migratedDetails[noteId] || makeDetail(note)
    patchNote(noteId, {
      project: true,
      glyph: note.glyph === 'document' ? 'code' : note.glyph,
      title: noteDisplayTitle(note, detail.body),
    })
    setDetails(items => ({ ...items, [noteId]: { ...detail, overview: detail.overview || detail.body } }))
    logActivity('create', `Converted ${noteDisplayTitle(note, detail.body)} to a project`)
    notify('Converted to a project · choose its apps to start it')
  }, [logActivity, migratedDetails, notes, notify, patchNote, setDetails])

  /* ---- workspace ---- */

  const chooseWorkspace = useCallback(async note => {
    if (!isDesktop) { notify('Choose a workspace folder in DevDoc for Mac.'); return }
    const selectedPath = await window.devdocDesktop.chooseWorkspaceFolder()
    if (!selectedPath) return
    setNotes(items => items.map(item => item.id === note.id ? { ...item, workspacePath: selectedPath, updatedAt: Date.now() } : item))
    logActivity('workspace', `Linked ${folderName(selectedPath)} to ${note.title}`)
    notify(`${folderName(selectedPath)} linked to ${note.title}`)
  }, [isDesktop, logActivity, notify, setNotes])

  const revealWorkspace = useCallback(async note => {
    if (!note.workspacePath) { chooseWorkspace(note); return }
    if (!isDesktop) { notify('Reveal this folder in DevDoc for Mac.'); return }
    const error = await window.devdocDesktop.revealFolder(note.workspacePath)
    notify(error ? 'Could not reveal that workspace folder.' : `Revealed ${folderName(note.workspacePath)} in Finder`)
  }, [chooseWorkspace, isDesktop, notify])

  /* ---- sessions ---- */

  const startProject = useCallback(async note => {
    if (!note) return
    if (!isDesktop) { notify('Launching apps needs DevDoc for Mac.'); return }
    if (!note.apps?.length) {
      notify('Choose apps for this project first.')
      setModal({ kind: 'apps', id: note.id })
      return
    }
    setBusyProject(note.id)
    try {
      const result = await window.devdocDesktop.startSession({ apps: note.apps, workspacePath: note.workspacePath })
      setSessions(items => ({
        ...items,
        [note.id]: { startedAt: Date.now(), launched: result.launched, tracked: note.apps.map(app => app.path) },
      }))
      setRunningApps(previous => new Set([...previous, ...result.launched, ...result.alreadyRunning]))
      logActivity('start', `Started ${note.title}`)

      const parts = []
      if (result.launched.length) parts.push(`${result.launched.length} opened`)
      if (result.alreadyRunning.length) parts.push(`${result.alreadyRunning.length} already running`)
      if (result.failed.length) parts.push(`${result.failed.length} failed`)
      notify(`${note.title} started · ${parts.join(' · ') || 'nothing to open'}`)
    } catch {
      notify(`Could not start ${note.title}.`)
    } finally {
      setBusyProject('')
    }
  }, [isDesktop, logActivity, notify, setSessions])

  const stopProject = useCallback(async note => {
    if (!note) return
    const session = sessions[note.id]
    if (!session) return
    if (!isDesktop) { notify('Stopping a project needs DevDoc for Mac.'); return }

    setBusyProject(note.id)
    const targets = new Set(settings.stopQuitsAll ? session.tracked : session.launched)
    const apps = (note.apps || []).filter(app => targets.has(app.path))

    try {
      const result = apps.length ? await window.devdocDesktop.stopSession({ apps }) : { stopped: [], failed: [] }
      setFocusLog(log => [...log, { projectId: note.id, startedAt: session.startedAt, endedAt: Date.now() }].slice(-500))
      setSessions(items => {
        const next = { ...items }
        delete next[note.id]
        return next
      })
      setRunningApps(previous => {
        const next = new Set(previous)
        result.stopped.forEach(path => next.delete(path))
        return next
      })
      logActivity('stop', `Stopped ${note.title}`)

      const minutes = Math.round((Date.now() - session.startedAt) / 60000)
      if (!apps.length) {
        notify(`${note.title} stopped · every app was already open, so nothing was quit`)
      } else if (result.failed.length) {
        notify(`${note.title} stopped · ${result.stopped.length} quit, ${result.failed.length} would not close`)
      } else {
        notify(`${note.title} stopped · ${result.stopped.length} quit · ${formatDuration(minutes)} focused`)
      }
    } catch {
      notify(`Could not stop ${note.title}.`)
    } finally {
      setBusyProject('')
    }
  }, [isDesktop, logActivity, notify, sessions, setFocusLog, setSessions, settings.stopQuitsAll])

  const toggleSession = useCallback(note => {
    if (!note?.project) return
    if (sessions[note.id]) stopProject(note)
    else startProject(note)
  }, [sessions, startProject, stopProject])

  // Keeps Start/Stop honest when apps are quit outside DevDoc. A session whose
  // launched apps have all exited is closed out and its focus time recorded.
  useEffect(() => {
    const ids = Object.keys(sessions)
    if (!ids.length || !isDesktop) return undefined

    let cancelled = false
    const tick = async () => {
      const paths = [...new Set(ids.flatMap(id => sessions[id]?.tracked || []))]
      if (!paths.length) return
      let running
      try {
        running = new Set(await window.devdocDesktop.runningApplications(paths))
      } catch {
        return // Transient failure - try again on the next tick.
      }
      if (cancelled) return
      setRunningApps(previous => sameSet(previous, running) ? previous : running)

      const now = Date.now()
      const finished = ids.filter(id => {
        const session = sessions[id]
        if (!session?.launched?.length) return false
        if (now - session.startedAt < SESSION_GRACE_MS) return false
        return session.launched.every(path => !running.has(path))
      })
      if (!finished.length) return

      setFocusLog(log => [
        ...log,
        ...finished.map(id => ({ projectId: id, startedAt: sessions[id].startedAt, endedAt: now })),
      ].slice(-500))
      setSessions(items => {
        const next = { ...items }
        finished.forEach(id => delete next[id])
        return next
      })
      finished.forEach(id => {
        const note = notes.find(item => item.id === id)
        logActivity('stop', `${note?.title || 'Project'} ended`)
      })
    }

    tick()
    const timer = window.setInterval(tick, 6000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [sessions, isDesktop, notes, logActivity, setFocusLog, setSessions])

  /* ---- media ---- */

  const addImages = useCallback(async () => {
    if (!isDesktop) { notify('Add images in DevDoc for Mac.'); return }
    const paths = await window.devdocDesktop.chooseImages()
    if (!paths.length) return
    updateDetail({ ...selectedDetail, images: [...new Set([...selectedDetail.images, ...paths])] })
    notify(`${paths.length} image${paths.length === 1 ? '' : 's'} added`)
  }, [isDesktop, notify, selectedDetail, updateDetail])

  // Returns the chosen paths instead of writing them anywhere, so per-feature
  // uploads can put them on the feature rather than the project's own library.
  const pickImages = useCallback(async () => {
    if (!isDesktop) { notify('Add images in DevDoc for Mac.'); return [] }
    return window.devdocDesktop.chooseImages()
  }, [isDesktop, notify])

  const removeImage = useCallback(filePath => {
    updateDetail({ ...selectedDetail, images: selectedDetail.images.filter(item => item !== filePath) })
    notify('Image removed from this project')
  }, [notify, selectedDetail, updateDetail])

  /* ---- project lifecycle ---- */

  const saveApps = useCallback((noteId, apps) => {
    setNotes(items => items.map(item => item.id === noteId ? { ...item, apps, updatedAt: Date.now() } : item))
    const note = notes.find(item => item.id === noteId)
    logActivity('apps', `${apps.length} app${apps.length === 1 ? '' : 's'} set for ${note?.title || 'project'}`)
    notify(apps.length ? `${apps.length} app${apps.length === 1 ? '' : 's'} ready to launch` : 'All apps removed from this project')
  }, [logActivity, notes, notify, setNotes])

  const showItemMenu = useCallback(note => {
    if (!isDesktop) { notify('Action menus are available in DevDoc for Mac.'); return }
    window.devdocDesktop.showItemMenu({
      id: note.id,
      kind: note.project ? 'project' : 'note',
      hasWorkspace: Boolean(note.workspacePath),
      isRunning: Boolean(sessions[note.id]),
      isStarred: Boolean(starred[note.id]),
    })
  }, [isDesktop, notify, sessions, starred])

  const create = useCallback(async ({ title, description, tag, glyph, project, apps = [], workspacePath = '', iconImage = '' }) => {
    // The workspace folder is created up front so the first Start has somewhere
    // real to hand the editor. A failure here is not fatal - the project is
    // still made, just without a linked folder.
    let linkedPath = workspacePath
    if (linkedPath && isDesktop) {
      const error = await window.devdocDesktop.ensureFolder(linkedPath)
      if (error) {
        linkedPath = ''
        notify(`Could not create ${folderName(workspacePath)} — the project was made without a folder.`)
      }
    }

    const used = new Set(notes.map(note => note.id))
    const id = createId(title, used)
    const now = Date.now()
    const note = {
      id,
      title,
      description,
      tag,
      glyph: glyph || (project ? 'code' : 'document'),
      iconImage,
      project,
      createdAt: now,
      updatedAt: now,
      workspacePath: linkedPath,
      apps,
    }
    setNotes(items => [note, ...items])
    setDetails(items => ({ ...items, [id]: makeDetail(note) }))
    setSelectedId(id)
    setPage('detail')
    logActivity('create', `Created ${title}`)

    const summary = [
      apps.length ? `${apps.length} app${apps.length === 1 ? '' : 's'} ready` : '',
      linkedPath ? 'folder linked' : '',
    ].filter(Boolean).join(' · ')
    notify(summary ? `${title} created · ${summary}` : `${title} created`)
  }, [isDesktop, logActivity, notes, notify, setDetails, setNotes])

  const deleteNote = useCallback(noteId => {
    const note = notes.find(item => item.id === noteId)
    setNotes(items => items.filter(item => item.id !== noteId))
    setDetails(items => {
      const next = { ...items }
      delete next[noteId]
      return next
    })
    setSessions(items => {
      const next = { ...items }
      delete next[noteId]
      return next
    })
    if (selectedId === noteId) { setSelectedId(''); setPage(note?.project ? 'projects' : 'notes') }
    notify(`${note?.title || 'Item'} deleted`)
  }, [notes, notify, selectedId, setDetails, setNotes, setSessions])

  const shareProject = useCallback(async () => {
    if (!selected) return
    const copied = await copyText(`devdoc://projects/${selected.id}`)
    notify(copied ? 'Project link copied to clipboard' : 'Clipboard access is unavailable')
  }, [notify, selected])

  const openAppData = useCallback(async () => {
    if (!isDesktop) { notify('Open local DevDoc data in the Mac app.'); return }
    const error = await window.devdocDesktop.openAppData()
    notify(error ? 'Could not open DevDoc data.' : 'Opened DevDoc data in Finder')
  }, [isDesktop, notify])

  /* ---- commands ---- */

  useEffect(() => {
    const handleCommand = command => {
      if (command === 'new-note') createNote()
      else if (command === 'new-project') setModal({ kind: 'project' })
      else if (command === 'command') setModal({ kind: 'command' })
      else if (command === 'find') window.dispatchEvent(new Event('devdoc:find'))
      else if (command === 'settings') navigate('settings')
      else if (command === 'toggle-session') toggleSession(selected)
      else if (command === 'project-apps' && selected?.project) setModal({ kind: 'apps', id: selected.id })
      else if (command === 'help') notify('Use ⌘K to browse DevDoc commands.')
    }

    const handleKeyboard = event => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'k') { event.preventDefault(); setModal({ kind: 'command' }) }
      if (key === 'f') { event.preventDefault(); window.dispatchEvent(new Event('devdoc:find')) }
      if (key === 'n') { event.preventDefault(); if (event.shiftKey) setModal({ kind: 'project' }); else createNote() }
      if (key === ',') { event.preventDefault(); navigate('settings') }
      if (key === 'enter') { event.preventDefault(); toggleSession(selected) }
      if (key === 'a' && event.shiftKey && selected?.project) { event.preventDefault(); setModal({ kind: 'apps', id: selected.id }) }
      // Not while writing - in a text field macOS already uses ⌘⌫ to delete to
      // the start of the line, and stealing that would be maddening.
      const typing = /^(INPUT|TEXTAREA)$/.test(event.target?.tagName || '')
      if (key === 'backspace' && selected && !typing) { event.preventDefault(); setModal({ kind: 'delete', id: selected.id }) }
    }

    const removeDesktopCommand = window.devdocDesktop?.onAppCommand?.(handleCommand)
    window.addEventListener('keydown', handleKeyboard)
    return () => { removeDesktopCommand?.(); window.removeEventListener('keydown', handleKeyboard) }
  }, [navigate, notify, selected, toggleSession])

  useEffect(() => {
    const removeMenu = window.devdocDesktop?.onItemMenuAction?.(({ id, action }) => {
      const note = notes.find(item => item.id === id)
      if (!note) return
      if (action === 'open') openNote(note)
      if (action === 'choose-folder') chooseWorkspace(note)
      if (action === 'reveal') revealWorkspace(note)
      if (action === 'apps') setModal({ kind: 'apps', id: note.id })
      if (action === 'start') startProject(note)
      if (action === 'stop') stopProject(note)
      if (action === 'star') toggleStar(note.id)
      if (action === 'copy') copyNoteAsText(note.id)
      if (action === 'duplicate') duplicateNote(note.id)
      if (action === 'convert') convertToProject(note.id)
      if (action === 'delete') setModal({ kind: 'delete', id: note.id })
    })
    return () => removeMenu?.()
  }, [chooseWorkspace, convertToProject, copyNoteAsText, duplicateNote, notes, openNote, revealWorkspace, startProject, stopProject, toggleStar])

  /* ---- render ---- */

  const modalNote = modal?.id ? notes.find(item => item.id === modal.id) : null
  const runningCount = Object.keys(sessions).length
  const activePage = page === 'detail' ? (selected?.project ? 'projects' : 'notes') : page

  const homePage = (
    <HomePage
      notes={notes}
      details={migratedDetails}
      sessions={sessions}
      runningApps={runningApps}
      busyProject={busyProject}
      activity={activity}
      focusLog={focusLog}
      onNavigate={navigate}
      onOpen={openNote}
      onCreate={kind => setModal({ kind })}
      onCreateNote={createNote}
      onMenu={showItemMenu}
      onCommand={() => setModal({ kind: 'command' })}
      onStart={startProject}
      onStop={stopProject}
      onEditApps={note => setModal({ kind: 'apps', id: note.id })}
      onDelete={note => setModal({ kind: 'delete', id: note.id })}
    />
  )

  let content = homePage
  if (page === 'notes') {
    content = (
      <NotesPage
        notes={notes}
        details={migratedDetails}
        starred={starred}
        onOpen={openNote}
        onCreate={createNote}
        onMenu={showItemMenu}
      />
    )
  }
  if (page === 'projects') {
    content = (
      <ProjectsPage
        notes={notes}
        sessions={sessions}
        runningApps={runningApps}
        busyProject={busyProject}
        onOpen={openNote}
        onCreate={kind => setModal({ kind })}
        onMenu={showItemMenu}
        onChooseFolder={chooseWorkspace}
        onRevealFolder={revealWorkspace}
        onStart={startProject}
        onStop={stopProject}
        onEditApps={note => setModal({ kind: 'apps', id: note.id })}
        onDelete={note => setModal({ kind: 'delete', id: note.id })}
      />
    )
  }
  if (page === 'detail' && selected) {
    content = selected.project ? (
      <ProjectDetailPage
        note={selected}
        detail={selectedDetail}
        starred={Boolean(starred[selected.id])}
        running={sessions[selected.id]}
        busy={busyProject === selected.id}
        runningApps={runningApps}
        onToggleStar={() => toggleStar(selected.id)}
        onMenu={showItemMenu}
        onUpdateDetail={updateDetail}
        onAddImages={addImages}
        onRemoveImage={removeImage}
        onPickImages={pickImages}
        onChooseFolder={chooseWorkspace}
        onRevealFolder={revealWorkspace}
        onShare={shareProject}
        onStart={startProject}
        onStop={stopProject}
        onEditApps={() => setModal({ kind: 'apps', id: selected.id })}
      />
    ) : (
      <NoteDetailPage
        note={selected}
        detail={selectedDetail}
        starred={Boolean(starred[selected.id])}
        saving={saving}
        onRename={title => patchNote(selected.id, { title })}
        onRetag={tag => patchNote(selected.id, { tag })}
        onSetGlyph={glyph => patchNote(selected.id, { glyph })}
        onToggleStar={() => toggleStar(selected.id)}
        onMenu={showItemMenu}
        onUpdateDetail={updateDetail}
        onAddImages={addImages}
        onRemoveImage={removeImage}
        onCopy={() => copyNoteAsText(selected.id)}
        onConvert={() => convertToProject(selected.id)}
      />
    )
  }
  if (page === 'settings') {
    content = <SettingsPage settings={settings} onChange={setSettings} onOpenAppData={openAppData} userName={userName} isDesktop={isDesktop} />
  }

  return (
    <div className={`app-window ${settings.reducedMotion ? 'is-reduced-motion' : ''}`}>
      <Sidebar
        activePage={activePage}
        onNavigate={navigate}
        onCreate={kind => setModal({ kind })}
        userName={userName}
        runningCount={runningCount}
        notes={notes}
        details={migratedDetails}
        openNoteId={selected && !selected.project ? selected.id : ''}
        onOpenNote={openNote}
      />
      <main className="main-area" ref={mainRef} aria-label={PAGE_LABELS[page]}>{content}</main>

      {modal?.kind === 'command' && (
        <CommandPalette
          onDismiss={() => setModal(null)}
          onNavigate={navigate}
          onCreate={kind => setModal({ kind })}
          onCreateNote={createNote}
          onStartSelected={() => toggleSession(selected)}
          canStart={Boolean(selected?.project)}
          isRunning={Boolean(selected && sessions[selected.id])}
        />
      )}

      {modal?.kind === 'project' && (
        <NewProjectSheet
          isDesktop={isDesktop}
          notify={notify}
          onDismiss={() => setModal(null)}
          onCreate={create}
        />
      )}

      {modal?.kind === 'apps' && modalNote && (
        <AppPickerSheet
          project={modalNote}
          isDesktop={isDesktop}
          onDismiss={() => setModal(null)}
          onSave={apps => saveApps(modalNote.id, apps)}
          notify={notify}
        />
      )}

      {modal?.kind === 'delete' && modalNote && (
        <ConfirmSheet
          title={`Delete ${noteDisplayTitle(modalNote, migratedDetails[modalNote.id]?.body)}?`}
          text={modalNote.project
            ? 'This removes the project and its notes from DevDoc. Your files and folders on disk are untouched.'
            : 'This permanently deletes the note and everything written in it.'}
          confirmLabel="Delete"
          onDismiss={() => setModal(null)}
          onConfirm={() => deleteNote(modalNote.id)}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <AppIconProvider>
    <App />
  </AppIconProvider>
)
