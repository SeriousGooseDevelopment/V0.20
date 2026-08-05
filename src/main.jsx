import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Archive, Check, ChevronDown, ChevronRight, CircleHelp, Cloud, Code2,
  Command, Ellipsis, ExternalLink, FileCode2, FileText, Folder, FolderOpen,
  Grid2X2, House, Image, Info, Leaf, Lightbulb, List, PencilLine, Plus,
  Search, Settings, Share, Sparkles, Star, Terminal, Upload, UserRound,
  Wand2, X,
} from 'lucide-react'
import './styles.css'

const seedNotes = [
  { id: 'unstunted', title: 'Unstunted', description: 'Sound effects platform for editors and creators.', tag: 'Tech', edited: '10m ago', glyph: 'sound', project: true, tools: ['browser', 'code', 'terminal', 'source'], workspacePath: '' },
  { id: 'devdoc', title: 'DevDoc', description: 'Developer workspace and project launcher.', tag: 'SaaS', edited: '1h ago', glyph: 'code', project: true, tools: ['code', 'browser', 'terminal', 'design'], workspacePath: '' },
  { id: 'portfolio', title: 'Portfolio Redesign', description: 'Personal portfolio refresh for 2025.', tag: 'Design', edited: '1d ago', glyph: 'leaf', project: true, tools: ['design', 'code', 'browser'], workspacePath: '' },
  { id: 'weather', title: 'Weather App', description: 'iOS weather application with radar maps.', tag: 'Mobile', edited: '3d ago', glyph: 'cloud', project: true, tools: ['mobile', 'terminal', 'source'], workspacePath: '' },
  { id: 'api', title: 'AI API Explorer', description: 'Tool to test and compare AI model APIs.', tag: 'API', edited: '5d ago', glyph: 'cube', project: true, tools: ['code', 'terminal', 'source'], workspacePath: '' },
  { id: 'commerce', title: 'E-commerce Platform', description: 'Next-gen e-commerce platform for DTC brands.', tag: 'SaaS', edited: '6d ago', glyph: 'cart', project: true, tools: ['browser', 'code', 'terminal'], workspacePath: '' },
  { id: 'database', title: 'Database Schema', description: 'Core database structure and relationships.', tag: 'Tech', edited: '1w ago', glyph: 'database', project: false, tools: [], workspacePath: '' },
  { id: 'brand', title: 'Brand Identity', description: 'Logo, colors, typography, and brand guidelines.', tag: 'Design', edited: '1w ago', glyph: 'brand', project: false, tools: [], workspacePath: '' },
  { id: 'content', title: 'Content Strategy', description: 'Content pillars, topics, and publishing plan.', tag: 'Docs', edited: '1w ago', glyph: 'document', project: false, tools: [], workspacePath: '' },
  { id: 'ideas', title: 'Ideas Backlog', description: 'Raw ideas and concepts for future projects.', tag: 'Ideas', edited: '2w ago', glyph: 'bulb', project: false, tools: [], workspacePath: '' },
  { id: 'roadmap', title: 'Mobile App Roadmap', description: 'Features, milestones, and delivery timeline.', tag: 'Mobile', edited: '2w ago', glyph: 'roadmap', project: false, tools: [], workspacePath: '' },
  { id: 'plugins', title: 'Plugin Integrations', description: 'Third-party plugins and integration roadmap.', tag: 'Tech', edited: '2w ago', glyph: 'puzzle', project: false, tools: [], workspacePath: '' },
]

const focusDays = [
  { label: 'Mon', minutes: 265 }, { label: 'Tue', minutes: 190 }, { label: 'Wed', minutes: 322 },
  { label: 'Thu', minutes: 248 }, { label: 'Fri', minutes: 284 }, { label: 'Sat', minutes: 118 }, { label: 'Sun', minutes: 84 },
]

const baseFeatures = [
  { id: 'smart-search', title: 'Smart Search', description: 'Search with mood, BPM, and similar sound suggestions.', status: 'Building' },
  { id: 'instant-preview', title: 'Instant Preview', description: 'Waveform preview with quick trims and comparison mode.', status: 'Building' },
  { id: 'team-libraries', title: 'Team Libraries', description: 'Shared collections, folders, and usage tracking for teams.', status: 'Planned' },
]

const pageLabels = { home: 'Home', notes: 'Notes', projects: 'Projects', settings: 'Settings', detail: 'Project' }

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function usePersistedState(key, fallback) {
  const [value, setValue] = useState(() => readLocal(key, fallback))
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage is an enhancement, not a requirement. */ }
  }, [key, value])
  return [value, setValue]
}

function makeDetail(note) {
  return {
    overview: note.id === 'unstunted'
      ? 'Unstunted is a sound effects platform built for editors, creators, and filmmakers. We’re creating a modern, fast, and ethical way to find, preview, and license high-quality SFX — without the chaos.'
      : note.description,
    goal: note.id === 'unstunted'
      ? 'Become the go-to platform for premium, royalty-free sound effects with a focus on speed, clarity, and creator-friendly licensing.'
      : `Clarify the next useful milestone for ${note.title}.`,
    images: [],
    features: note.project ? baseFeatures.map(feature => ({ ...feature })) : [],
  }
}

function buildInitialDetails(notes) {
  return Object.fromEntries(notes.map(note => [note.id, makeDetail(note)]))
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

function Glyph({ type, size = 'normal' }) {
  const map = { code: FileCode2, leaf: Leaf, cloud: Cloud, cart: Archive, cube: Code2, database: Archive, brand: Sparkles, document: FileText, bulb: Lightbulb, roadmap: Wand2, puzzle: Settings }
  const Icon = map[type]
  if (type === 'sound') return <span className={`project-glyph project-glyph--sound project-glyph--${size}`} aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></span>
  return <span className={`project-glyph project-glyph--${type} project-glyph--${size}`} aria-hidden="true">{Icon && <Icon strokeWidth={1.75}/>}</span>
}

function ToolStrip({ tools = [] }) {
  const icons = { browser: Cloud, code: Code2, terminal: Terminal, source: Folder, design: Sparkles, mobile: Command }
  const labels = { browser: 'Browser', code: 'Code editor', terminal: 'Terminal', source: 'Source control', design: 'Design tools', mobile: 'Mobile tools' }
  if (!tools.length) return null
  return <div className="tool-strip" aria-label="Project tools">{tools.slice(0, 4).map(tool => {
    const Icon = icons[tool] || Code2
    return <span className="project-tool" key={tool} aria-label={labels[tool] || tool} title={labels[tool] || tool}><Icon size={15} strokeWidth={1.9}/></span>
  })}</div>
}

function IconButton({ label, children, onClick, active = false, className = '', disabled = false }) {
  return <button type="button" aria-label={label} title={label} className={`icon-btn ${active ? 'icon-btn--active' : ''} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>
}

function Sidebar({ activePage, onNavigate, onCreate }) {
  const nav = [[House, 'Home', 'home'], [FileText, 'Notes', 'notes'], [FolderOpen, 'Projects', 'projects'], [Settings, 'Settings', 'settings']]
  return <aside className="sidebar">
    <div className="brand-block"><strong>DevDoc</strong><span>Developer workspace</span></div>
    <nav className="side-nav" aria-label="Workspace">
      {nav.map(([Icon, label, id]) => <button key={id} className={activePage === id ? 'is-active' : ''} aria-current={activePage === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={18} strokeWidth={1.8}/><span>{label}</span></button>)}
    </nav>
    <button className="source-new" onClick={() => onCreate('project')}><Plus size={16}/>New</button>
    <button className="profile" onClick={() => onNavigate('settings')} aria-label="Open DevDoc settings"><span className="avatar">TK</span><span>Timothy Koelsch</span></button>
  </aside>
}

function Surface({ children, className = '' }) { return <section className={`surface ${className}`}>{children}</section> }

function SectionTitle({ children, action }) { return <div className="section-title"><h2>{children}</h2>{action}</div> }

function ProjectPreviewCard({ note, onOpen, onMenu }) {
  return <article className="project-preview-card">
    <button className="project-preview-main" onClick={() => onOpen(note)}>
      <Glyph type={note.glyph}/>
      <span><strong>{note.title}</strong><small>{note.description}</small></span>
    </button>
    <ToolStrip tools={note.tools}/>
    <div className="project-card-actions"><button className="button-primary" onClick={() => onOpen(note)}>Open</button><IconButton label={`Project actions for ${note.title}`} onClick={() => onMenu(note)}><Ellipsis size={18}/></IconButton></div>
  </article>
}

function ActivityRow({ icon: Icon, title, time, onClick }) {
  return <button className="activity-row" onClick={onClick}><span className="activity-icon"><Icon size={15}/></span><span>{title}</span><time>{time}</time></button>
}

function FocusOverview() {
  const [selected, setSelected] = useState(2)
  const active = focusDays[selected]
  const max = Math.max(...focusDays.map(day => day.minutes))
  const hours = `${Math.floor(active.minutes / 60)}h ${active.minutes % 60}m`
  return <Surface className="focus-overview"><SectionTitle action={<button className="help-button" title="Choose a day to view its recorded focus time" aria-label="About focus time"><CircleHelp size={16}/></button>}>Focus time</SectionTitle><div className="focus-chart" role="group" aria-label="Focus time by day this week">{focusDays.map((day, index) => <button key={day.label} className={index === selected ? 'is-selected' : ''} onClick={() => setSelected(index)} aria-pressed={index === selected} aria-label={`${day.label}: ${Math.floor(day.minutes / 60)} hours ${day.minutes % 60} minutes`}><span className="focus-bar-wrap"><i style={{ height: `${Math.max(18, Math.round((day.minutes / max) * 100))}%` }}/></span><small>{day.label}</small></button>)}</div><div className="focus-summary"><span>{active.label} · recorded focus</span><strong>{hours}</strong><em>↑ 12%</em><small>vs last week</small></div></Surface>
}

function HomePage({ notes, onNavigate, onOpen, onCreate, onMenu, onCommand }) {
  const projects = notes.filter(note => note.project).slice(0, 2)
  return <div className="page page--home"><header className="page-intro"><h1 tabIndex="-1">What are we working on today?</h1><p>Pick a project to get started.</p></header><div className="home-grid">
    <Surface className="start-projects"><SectionTitle action={<button className="text-button" onClick={() => onNavigate('projects')}>View all <ChevronRight size={16}/></button>}>Start Projects</SectionTitle><div className="start-grid">{projects.map(note => <ProjectPreviewCard key={note.id} note={note} onOpen={onOpen} onMenu={onMenu}/>)}</div></Surface>
    <Surface className="quick-command"><SectionTitle>Quick Command</SectionTitle><p>Navigate, create, or find work from one keyboard-first menu.</p><button className="command-callout" onClick={onCommand}><Command size={18}/><span>Open Command Palette</span><kbd>⌘ K</kbd></button><div className="activity-list"><ActivityRow icon={FolderOpen} title="Opened Unstunted workspace" time="2m ago" onClick={() => onOpen(projects[0])}/><ActivityRow icon={FileText} title="Updated API integration notes" time="1h ago" onClick={() => onOpen(notes.find(note => note.id === 'api'))}/><ActivityRow icon={Code2} title="Opened DevDoc project" time="Yesterday" onClick={() => onOpen(notes.find(note => note.id === 'devdoc'))}/></div><button className="footer-link" onClick={onCommand}>View all commands <ChevronRight size={16}/></button></Surface>
    <Surface className="recent-notes"><SectionTitle action={<button className="text-button" onClick={() => onCreate('note')}>New Note <Plus size={16}/></button>}>Recent Notes</SectionTitle><div className="recent-list">{notes.slice(0, 4).map(note => <button key={note.id} className="recent-row" onClick={() => onOpen(note)}><Glyph type={note.glyph} size="small"/><span><strong>{note.title}</strong><small>{note.description}</small></span><time>Edited {note.edited}</time></button>)}</div><button className="footer-link" onClick={() => onNavigate('notes')}>View all notes <ChevronRight size={16}/></button></Surface>
    <FocusOverview />
  </div></div>
}

function SearchField({ placeholder, value, onChange }) {
  const inputRef = useRef(null)
  useEffect(() => {
    const focus = () => inputRef.current?.focus()
    window.addEventListener('devdoc:find', focus)
    return () => window.removeEventListener('devdoc:find', focus)
  }, [])
  return <label className="search-field"><Search size={17}/><input ref={inputRef} aria-label={placeholder} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/><kbd>⌘F</kbd></label>
}

function ViewToggle({ view, onChange }) { return <div className="view-toggle" aria-label="Choose layout"><IconButton label="Grid view" active={view === 'grid'} onClick={() => onChange('grid')}><Grid2X2 size={17}/></IconButton><IconButton label="List view" active={view === 'list'} onClick={() => onChange('list')}><List size={18}/></IconButton></div> }

function NoteCard({ note, view, onOpen }) { return <button className={`note-card ${view === 'list' ? 'note-card--list' : ''}`} onClick={() => onOpen(note)}><Glyph type={note.glyph}/><span className="note-copy"><strong>{note.title}</strong><small>{note.description}</small><em>Edited {note.edited}</em></span><span className="tag">{note.tag}</span></button> }

function EmptyState({ title, text, action, label }) { return <div className="empty-state"><Search size={28}/><h2>{title}</h2><p>{text}</p><button className="button-primary" onClick={action}><Plus size={15}/>{label}</button></div> }

function NotesPage({ notes, onOpen, onCreate }) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState('grid')
  const [filter, setFilter] = useState('All Notes')
  const visibleNotes = useMemo(() => notes.filter(note => (`${note.title} ${note.description} ${note.tag}`).toLowerCase().includes(query.toLowerCase()) && (filter === 'All Notes' || note.tag === filter)), [notes, query, filter])
  return <div className="page"><header className="page-header"><div><h1 tabIndex="-1">Notes</h1><p>Your ideas, plans, and everything in between.</p></div><div className="header-actions"><SearchField placeholder="Search notes" value={query} onChange={setQuery}/><button className="button-primary button-primary--header" onClick={() => onCreate('note')}><Plus size={16}/>New Note</button></div></header><div className="content-toolbar"><label className="select-field"><FileText size={16}/><span className="visually-hidden">Filter notes</span><select value={filter} onChange={event => setFilter(event.target.value)}><option>All Notes</option><option>Tech</option><option>SaaS</option><option>Design</option><option>Mobile</option><option>API</option><option>Docs</option><option>Ideas</option></select><ChevronDown size={14}/></label><ViewToggle view={view} onChange={setView}/></div><div className={`notes-grid notes-grid--${view}`}>{visibleNotes.map(note => <NoteCard note={note} key={note.id} view={view} onOpen={onOpen}/>)}{visibleNotes.length === 0 && <EmptyState title="No notes found" text="Try a different search or create a note." action={() => onCreate('note')} label="Create Note"/>}</div></div>
}

function ProjectCard({ note, onOpen, onChooseFolder, onRevealFolder, onMenu }) {
  const linked = Boolean(note.workspacePath)
  return <article className="project-card"><button className="project-card-main" onClick={() => onOpen(note)}><Glyph type={note.glyph}/><span><strong>{note.title}</strong><small>{note.description}</small></span></button><ToolStrip tools={note.tools}/><button className="workspace-row" onClick={() => linked ? onRevealFolder(note) : onChooseFolder(note)}><Folder size={15}/><span>{linked ? folderName(note.workspacePath) : 'Choose a workspace folder'}</span><ChevronRight size={15}/></button><div className="project-card-actions"><button className="button-primary" onClick={() => onOpen(note)}>Open</button><button className="button-secondary" onClick={() => linked ? onRevealFolder(note) : onChooseFolder(note)}>{linked ? 'Reveal' : 'Choose Folder'}</button><IconButton label={`Project actions for ${note.title}`} onClick={() => onMenu(note)}><Ellipsis size={18}/></IconButton></div></article>
}

function ProjectsPage({ notes, onOpen, onCreate, onMenu, onChooseFolder, onRevealFolder }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [view, setView] = useState('grid')
  const projects = notes.filter(note => note.project && (`${note.title} ${note.description}`).toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || filter === 'Linked' ? filter === 'All' || Boolean(note.workspacePath) : note.edited.includes('m') || note.edited.includes('h')))
  return <div className="page"><header className="page-header"><div><h1 tabIndex="-1">Projects</h1><p>Launch, organize, and manage your developer workspaces.</p></div><div className="header-actions"><SearchField placeholder="Search projects" value={query} onChange={setQuery}/><button className="button-primary button-primary--header" onClick={() => onCreate('project')}><Plus size={16}/>New Project</button></div></header><div className="content-toolbar"><div className="segmented" role="group" aria-label="Filter projects">{['All', 'Linked', 'Recent'].map(item => <button key={item} className={filter === item ? 'is-active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div><ViewToggle view={view} onChange={setView}/></div><div className={`projects-grid projects-grid--${view}`}>{projects.map(note => <ProjectCard note={note} key={note.id} onOpen={onOpen} onChooseFolder={onChooseFolder} onRevealFolder={onRevealFolder} onMenu={onMenu}/>)}<button className="new-project-card" onClick={() => onCreate('project')}><span><Plus size={25}/></span><div><strong>New Project</strong><small>Create a workspace from scratch.</small></div></button></div></div>
}

function FeatureList({ features, onChange }) {
  if (!features.length) return <p className="empty-copy">This note does not have a feature list yet.</p>
  return <div className="feature-list">{features.map(feature => <div className="feature-row" key={feature.id}><span className="feature-icon"><Lightbulb size={16}/></span><span><strong>{feature.title}</strong><small>{feature.description}</small></span><label className={`feature-status feature-status--${feature.status.toLowerCase()}`}><span className="visually-hidden">Status for {feature.title}</span><select value={feature.status} onChange={event => onChange(feature.id, event.target.value)}><option>Building</option><option>Planned</option><option>Idea</option></select></label></div>)}</div>
}

function MediaLibrary({ images, onAdd, onRemove }) {
  return <div className="media-library">{images.length ? <div className="image-grid">{images.map(filePath => <figure key={filePath}><img src={fileUrl(filePath)} alt={folderName(filePath)}/><button aria-label={`Remove ${folderName(filePath)}`} onClick={() => onRemove(filePath)}><X size={14}/></button><figcaption>{folderName(filePath)}</figcaption></figure>)}</div> : <div className="media-empty"><Image size={25}/><p>No images have been added to this project.</p></div>}<button className="button-secondary media-add" onClick={onAdd}><Upload size={15}/>Add Image</button></div>
}

function DetailPage({ note, detail, starred, onToggleStar, onMenu, onUpdateDetail, onAddImages, onRemoveImage, onChooseFolder, onRevealFolder, onShare }) {
  const [tab, setTab] = useState('notes')
  const tabs = [{ id: 'notes', label: 'Notes' }, { id: 'media', label: 'Images' }, { id: 'features', label: 'Features' }]
  const activeIndex = tabs.findIndex(item => item.id === tab)
  const switchTab = (index) => setTab(tabs[(index + tabs.length) % tabs.length].id)
  const updateFeature = (featureId, status) => onUpdateDetail({ ...detail, features: detail.features.map(feature => feature.id === featureId ? { ...feature, status } : feature) })
  return <div className="page page--detail"><header className="detail-header"><div className="detail-title"><Glyph type={note.glyph} size="large"/><div><h1 tabIndex="-1">{note.title}</h1><p>Edited {note.edited}</p></div></div><div className="detail-actions"><IconButton label="Favorite project" active={starred} onClick={onToggleStar}><Star size={18} fill={starred ? 'currentColor' : 'none'}/></IconButton><IconButton label="Share project link" onClick={onShare}><Share size={18}/></IconButton><IconButton label="Project actions" onClick={() => onMenu(note)}><Ellipsis size={18}/></IconButton></div></header><div className="detail-grid"><section className="editor-surface"><div className="editor-tabs" role="tablist" aria-label="Project content">{tabs.map((item, index) => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? 'is-active' : ''} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); switchTab(index + 1) } if (event.key === 'ArrowLeft') { event.preventDefault(); switchTab(index - 1) } }} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>{tab === 'notes' && <div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" className="editor-content"><label className="editor-field"><span>Project Overview</span><textarea value={detail.overview} onChange={event => onUpdateDetail({ ...detail, overview: event.target.value })}/></label><label className="editor-field"><span>Goal</span><textarea value={detail.goal} onChange={event => onUpdateDetail({ ...detail, goal: event.target.value })}/></label><p className="autosave"><Check size={14}/>Saved locally</p></div>}{tab === 'media' && <div id="panel-media" role="tabpanel" aria-labelledby="tab-media" className="tab-panel"><MediaLibrary images={detail.images} onAdd={onAddImages} onRemove={onRemoveImage}/></div>}{tab === 'features' && <div id="panel-features" role="tabpanel" aria-labelledby="tab-features" className="tab-panel"><FeatureList features={detail.features} onChange={updateFeature}/></div>}</section><aside className="detail-side"><Surface className="project-info"><SectionTitle>Workspace</SectionTitle><button className="workspace-row workspace-row--panel" onClick={() => note.workspacePath ? onRevealFolder(note) : onChooseFolder(note)}><Folder size={16}/><span>{note.workspacePath ? folderName(note.workspacePath) : 'Choose a workspace folder'}</span><ChevronRight size={15}/></button><p>{note.workspacePath ? 'This folder is linked to the project and can be revealed in Finder.' : 'Link a real folder to reveal it in Finder from DevDoc.'}</p></Surface><Surface className="project-features"><SectionTitle>Feature Ideas</SectionTitle><FeatureList features={detail.features.slice(0, 3)} onChange={updateFeature}/></Surface></aside></div></div>
}

function SettingsPage({ settings, onChange, onOpenAppData }) {
  return <div className="page settings-page"><header className="page-intro"><h1 tabIndex="-1">Settings</h1><p>Fine tune your DevDoc workspace.</p></header><Surface className="settings-surface"><SectionTitle>General</SectionTitle><div className="setting-row"><span><strong>Workspace notifications</strong><small>Keep this preference with your local DevDoc workspace.</small></span><button role="switch" aria-checked={settings.notifications} className={`switch ${settings.notifications ? 'on' : ''}`} onClick={() => onChange({ ...settings, notifications: !settings.notifications })}><i/></button></div><div className="setting-row"><span><strong>Reduce motion</strong><small>Use short, quiet transitions throughout DevDoc.</small></span><button role="switch" aria-checked={settings.reducedMotion} className={`switch ${settings.reducedMotion ? 'on' : ''}`} onClick={() => onChange({ ...settings, reducedMotion: !settings.reducedMotion })}><i/></button></div><div className="setting-row"><span><strong>DevDoc data</strong><small>Open the local folder where DevDoc keeps its desktop data.</small></span><button className="button-secondary" onClick={onOpenAppData}>Open Folder</button></div></Surface></div>
}

function Sheet({ children, titleId, onDismiss }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const focusDialog = () => {
      const first = dialogRef.current?.querySelector('[autofocus], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])')
      first?.focus()
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
    return () => { cancelAnimationFrame(frame); document.body.classList.remove('dialog-open'); document.removeEventListener('keydown', trap); previous?.focus?.() }
  }, [onDismiss])
  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onDismiss()}><section className="sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>{children}</section></div>
}

function CreateSheet({ kind, onDismiss, onCreate }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tag, setTag] = useState(kind === 'project' ? 'Tech' : 'Docs')
  const label = kind === 'project' ? 'New Project' : 'New Note'
  const submit = event => {
    event.preventDefault()
    const normalizedTitle = title.trim()
    if (!normalizedTitle) return
    onCreate({ title: normalizedTitle, description: description.trim(), tag, project: kind === 'project' })
    onDismiss()
  }
  return <Sheet titleId="create-sheet-title" onDismiss={onDismiss}><form className="create-sheet" onSubmit={submit}><header><div><h2 id="create-sheet-title">{label}</h2><p>{kind === 'project' ? 'Give your workspace a name and add a real folder later.' : 'Capture an idea and open it when you are ready.'}</p></div><IconButton label="Close sheet" onClick={onDismiss}><X size={17}/></IconButton></header><label>Title<input autoFocus required value={title} onChange={event => setTitle(event.target.value)} placeholder={kind === 'project' ? 'Project name' : 'Note title'}/></label><label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="A short description" rows="3"/></label><label>Category<select value={tag} onChange={event => setTag(event.target.value)}><option>Tech</option><option>SaaS</option><option>Design</option><option>Mobile</option><option>API</option><option>Docs</option><option>Ideas</option></select></label><footer><button type="button" className="button-secondary" onClick={onDismiss}>Cancel</button><button className="button-primary" type="submit">Create</button></footer></form></Sheet>
}

function CommandPalette({ onDismiss, onNavigate, onCreate }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const commands = useMemo(() => [
    { id: 'home', title: 'Go to Home', icon: House, action: () => onNavigate('home') },
    { id: 'notes', title: 'Browse Notes', icon: FileText, action: () => onNavigate('notes') },
    { id: 'projects', title: 'Open Projects', icon: FolderOpen, action: () => onNavigate('projects') },
    { id: 'new-project', title: 'Create a new project', icon: Plus, action: () => onCreate('project') },
    { id: 'new-note', title: 'Create a new note', icon: PencilLine, action: () => onCreate('note') },
  ].filter(command => command.title.toLowerCase().includes(query.toLowerCase())), [query, onNavigate, onCreate])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])
  const run = command => { onDismiss(); requestAnimationFrame(command.action) }
  const onKeyDown = event => {
    if (!commands.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % commands.length) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index - 1 + commands.length) % commands.length) }
    if (event.key === 'Enter') { event.preventDefault(); run(commands[active]) }
  }
  return <Sheet titleId="command-sheet-title" onDismiss={onDismiss}><div className="command-palette"><div className="command-search"><Search size={19}/><input ref={inputRef} aria-labelledby="command-sheet-title" aria-controls="command-results" aria-activedescendant={commands[active] ? `command-${commands[active].id}` : undefined} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="Search commands"/><kbd>Esc</kbd></div><h2 id="command-sheet-title" className="visually-hidden">Command Palette</h2><span className="command-caption">COMMANDS</span><div id="command-results" role="listbox">{commands.length ? commands.map((command, index) => { const Icon = command.icon; return <button id={`command-${command.id}`} role="option" aria-selected={index === active} className={index === active ? 'is-active' : ''} key={command.id} onMouseEnter={() => setActive(index)} onClick={() => run(command)}><Icon size={17}/><span>{command.title}</span><ChevronRight size={16}/></button> }) : <p className="command-empty">No matching commands.</p>}</div></div></Sheet>
}

function Toast({ message, onDismiss }) { return message ? <div className="toast" role="status"><Check size={15}/><span>{message}</span><button aria-label="Dismiss notification" onClick={onDismiss}><X size={14}/></button></div> : null }

function App() {
  const [notes, setNotes] = usePersistedState('devdoc-v2-notes', seedNotes)
  const [details, setDetails] = usePersistedState('devdoc-v2-details', buildInitialDetails(seedNotes))
  const [settings, setSettings] = usePersistedState('devdoc-v2-settings', { notifications: true, reducedMotion: false })
  const [starred, setStarred] = usePersistedState('devdoc-v2-starred', {})
  const [page, setPage] = useState('home')
  const [selectedId, setSelectedId] = useState('unstunted')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const mainRef = useRef(null)
  const selected = notes.find(note => note.id === selectedId) || notes[0]
  const selectedDetail = details[selected?.id] || makeDetail(selected)
  const isDesktop = Boolean(window.devdocDesktop)

  const notify = useCallback(message => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => { document.title = 'DevDoc' }, [])
  useEffect(() => {
    const frame = requestAnimationFrame(() => mainRef.current?.querySelector('h1')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [page, selectedId])

  const navigate = useCallback(next => { setPage(next); setModal(null) }, [])
  const openNote = useCallback(note => { if (!note) return; setSelectedId(note.id); setPage('detail'); setModal(null) }, [])
  const updateDetail = useCallback(nextDetail => setDetails(items => ({ ...items, [selected.id]: nextDetail })), [selected?.id, setDetails])

  const chooseWorkspace = useCallback(async note => {
    if (!isDesktop) { notify('Choose a workspace folder in DevDoc for Mac.'); return }
    const selectedPath = await window.devdocDesktop.chooseWorkspaceFolder()
    if (!selectedPath) return
    setNotes(items => items.map(item => item.id === note.id ? { ...item, workspacePath: selectedPath, edited: 'now' } : item))
    notify(`${folderName(selectedPath)} linked to ${note.title}`)
  }, [isDesktop, notify, setNotes])

  const revealWorkspace = useCallback(async note => {
    if (!note.workspacePath) { chooseWorkspace(note); return }
    if (!isDesktop) { notify('Reveal this folder in DevDoc for Mac.'); return }
    const error = await window.devdocDesktop.revealFolder(note.workspacePath)
    notify(error ? 'Could not reveal that workspace folder.' : `Revealed ${folderName(note.workspacePath)} in Finder`)
  }, [chooseWorkspace, isDesktop, notify])

  const addImages = useCallback(async () => {
    if (!isDesktop) { notify('Add images in DevDoc for Mac.'); return }
    const paths = await window.devdocDesktop.chooseImages()
    if (!paths.length) return
    updateDetail({ ...selectedDetail, images: [...new Set([...selectedDetail.images, ...paths])] })
    notify(`${paths.length} image${paths.length === 1 ? '' : 's'} added`)
  }, [isDesktop, notify, selectedDetail, updateDetail])

  const removeImage = useCallback(filePath => {
    updateDetail({ ...selectedDetail, images: selectedDetail.images.filter(item => item !== filePath) })
    notify('Image removed from this project')
  }, [notify, selectedDetail, updateDetail])

  const showProjectMenu = useCallback(note => {
    if (!isDesktop) { notify('Project action menus are available in DevDoc for Mac.'); return }
    window.devdocDesktop.showProjectMenu({ id: note.id, hasWorkspace: Boolean(note.workspacePath) })
  }, [isDesktop, notify])

  const create = useCallback(({ title, description, tag, project }) => {
    const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'
    let id = base
    let count = 2
    const used = new Set(notes.map(note => note.id))
    while (used.has(id)) { id = `${base}-${count}`; count += 1 }
    const note = { id, title, description: description || (project ? 'A new developer workspace.' : 'A new note.'), tag, edited: 'now', glyph: project ? 'code' : 'document', project, tools: project ? ['code', 'terminal'] : [], workspacePath: '' }
    setNotes(items => [note, ...items])
    setDetails(items => ({ ...items, [id]: makeDetail(note) }))
    setSelectedId(id)
    setPage(project ? 'projects' : 'detail')
    notify(`${title} created`)
  }, [notes, notify, setDetails, setNotes])

  const shareProject = useCallback(async () => {
    const copied = await copyText(`devdoc://projects/${selected.id}`)
    notify(copied ? 'Project link copied to clipboard' : 'Clipboard access is unavailable')
  }, [notify, selected])

  const openAppData = useCallback(async () => {
    if (!isDesktop) { notify('Open local DevDoc data in the Mac app.'); return }
    const error = await window.devdocDesktop.openAppData()
    notify(error ? 'Could not open DevDoc data.' : 'Opened DevDoc data in Finder')
  }, [isDesktop, notify])

  useEffect(() => {
    const handleCommand = command => {
      if (command === 'new-note') setModal('note')
      else if (command === 'new-project') setModal('project')
      else if (command === 'command') setModal('command')
      else if (command === 'find') window.dispatchEvent(new Event('devdoc:find'))
      else if (command === 'settings') navigate('settings')
      else if (command === 'help') notify('Use ⌘K to browse DevDoc commands.')
    }
    const handleKeyboard = event => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'k') { event.preventDefault(); setModal('command') }
      if (key === 'f') { event.preventDefault(); window.dispatchEvent(new Event('devdoc:find')) }
      if (key === 'n') { event.preventDefault(); setModal(event.shiftKey ? 'project' : 'note') }
      if (key === ',') { event.preventDefault(); navigate('settings') }
    }
    const removeDesktopCommand = window.devdocDesktop?.onAppCommand?.(handleCommand)
    window.addEventListener('keydown', handleKeyboard)
    return () => { removeDesktopCommand?.(); window.removeEventListener('keydown', handleKeyboard) }
  }, [navigate, notify])

  useEffect(() => {
    const removeMenu = window.devdocDesktop?.onProjectMenuAction?.(({ id, action }) => {
      const note = notes.find(item => item.id === id)
      if (!note) return
      if (action === 'open') openNote(note)
      if (action === 'choose-folder') chooseWorkspace(note)
      if (action === 'reveal') revealWorkspace(note)
    })
    return () => removeMenu?.()
  }, [chooseWorkspace, notes, openNote, revealWorkspace])

  const activePage = page === 'detail' ? (selected.project ? 'projects' : 'notes') : page
  let content = <HomePage notes={notes} onNavigate={navigate} onOpen={openNote} onCreate={setModal} onMenu={showProjectMenu} onCommand={() => setModal('command')}/>
  if (page === 'notes') content = <NotesPage notes={notes} onOpen={openNote} onCreate={setModal}/>
  if (page === 'projects') content = <ProjectsPage notes={notes} onOpen={openNote} onCreate={setModal} onMenu={showProjectMenu} onChooseFolder={chooseWorkspace} onRevealFolder={revealWorkspace}/>
  if (page === 'detail') content = <DetailPage note={selected} detail={selectedDetail} starred={Boolean(starred[selected.id])} onToggleStar={() => setStarred(items => ({ ...items, [selected.id]: !items[selected.id] }))} onMenu={showProjectMenu} onUpdateDetail={updateDetail} onAddImages={addImages} onRemoveImage={removeImage} onChooseFolder={chooseWorkspace} onRevealFolder={revealWorkspace} onShare={shareProject}/>
  if (page === 'settings') content = <SettingsPage settings={settings} onChange={setSettings} onOpenAppData={openAppData}/>

  return <div className={`app-window ${settings.reducedMotion ? 'is-reduced-motion' : ''}`}><Sidebar activePage={activePage} onNavigate={navigate} onCreate={setModal}/><main className="main-area" ref={mainRef} aria-label={pageLabels[page]}>{content}</main>{modal === 'command' && <CommandPalette onDismiss={() => setModal(null)} onNavigate={navigate} onCreate={kind => setModal(kind)}/>} {modal === 'project' || modal === 'note' ? <CreateSheet kind={modal} onDismiss={() => setModal(null)} onCreate={create}/> : null}<Toast message={toast} onDismiss={() => setToast('')}/></div>
}

createRoot(document.getElementById('root')).render(<App />)
