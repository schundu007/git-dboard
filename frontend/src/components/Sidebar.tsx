import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, Link } from 'react-router-dom'
import GitPulseLogo from './GitPulseLogo'
import {
  LayoutDashboard, GitPullRequest, Container,
  Server, Layers, GitBranch,
  Shield, BarChart2, Cpu, Lightbulb, ChevronLeft, ChevronRight,
  AlertTriangle, Settings, ChevronDown, Check, Plus,
  Loader2, CheckCircle2, XCircle, Link as LinkIcon, Key, ExternalLink, BookOpen, Terminal,
  type LucideIcon,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../lib/cn'
import { useSidebar } from '../contexts/SidebarContext'
import { Tooltip } from './ui/Tooltip'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { getActiveRepo, getRepos, addRepo, activateRepo, testRepoConnection } from '../lib/api'

type NavItem    = { to: string; icon: LucideIcon; label: string; exact?: boolean; badge?: string }
type NavSection = { label: string; items: NavItem[] }

const NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
      { to: '/action-plan', icon: Lightbulb,       label: 'Action Plan' },
    ],
  },
  {
    label: 'Source Control',
    items: [
      { to: '/prs',      icon: GitPullRequest, label: 'Source Control' },
    ],
  },
  {
    label: 'CI / CD',
    items: [
      { to: '/builds',   icon: Container, label: 'CI Pipeline' },
      { to: '/registry', icon: Layers,    label: 'Registry'    },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/infra',    icon: Server, label: 'Infrastructure' },
      { to: '/security', icon: Shield, label: 'Security'       },
    ],
  },
  {
    label: 'Observability',
    items: [
      { to: '/monitoring', icon: AlertTriangle, label: 'Diagnostics' },
      { to: '/analytics',  icon: BarChart2,     label: 'Analytics'   },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/scripts',    icon: BookOpen, label: 'Scripts'    },
      { to: '/playground', icon: Terminal, label: 'Playground' },
    ],
  },
]

const getApiUrl = () => localStorage.getItem('api_url') || 'http://localhost:8000'

function parseGitHubUrl(raw: string): { owner: string; repo: string } | null {
  const s = raw.trim().replace(/\.git$/, '')
  const full = s.match(/github\.com\/([^/]+)\/([^/?\s]+)/)
  if (full) return { owner: full[1], repo: full[2] }
  const short = s.match(/^([^/]+)\/([^/?\s]+)$/)
  if (short) return { owner: short[1], repo: short[2] }
  return null
}

function SwitchingOverlay({ slug }: { slug: string }) {
  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <Loader2 size={28} className="text-nvidia animate-spin" />
      <div className="text-center">
        <p className="text-[14px] font-semibold text-white">Switching repository</p>
        <p className="text-[12px] text-gray-400 font-mono mt-1">{slug}</p>
      </div>
      <p className="text-[11px] text-gray-400">Reloading dashboard…</p>
    </div>,
    document.body,
  )
}

interface RepoSwitcherProps { collapsed: boolean }

function RepoSwitcher({ collapsed }: RepoSwitcherProps) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [form, setForm] = useState({ name: '', owner: '', repo: '', gh_pat: '' })
  const [showPat, setShowPat] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const { data: reposData, refetch: refetchRepos } = useQuery({
    queryKey: ['repos'],
    queryFn: getRepos,
    enabled: open,
    staleTime: 10_000,
  })

  const repoSlug = activeRepoData?.active?.slug ?? ''
  const repos: any[] = reposData?.repos ?? []

  function openPanel() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: collapsed ? rect.right + 6 : rect.left,
        width: 292,
        zIndex: 100,
      })
    }
    setOpen(true)
    refetchRepos()
  }

  function closePanel() {
    setOpen(false)
    setShowAddForm(false)
    setUrlInput('')
    setUrlError('')
    setForm({ name: '', owner: '', repo: '', gh_pat: '' })
    setTestResult(null)
  }

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) closePanel()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const switchTo = async (id: number, slug: string) => {
    closePanel()
    setSwitching(slug)
    try {
      await activateRepo(id)
      await fetch(`${getApiUrl()}/cache/clear`, { method: 'POST' }).catch(() => {})
    } catch { setSwitching(null); return }
    qc.clear()
    setTimeout(() => { window.location.href = '/' }, 800)
  }

  const handleUrlPaste = (raw: string) => {
    setUrlInput(raw)
    setUrlError('')
    if (!raw.trim()) return
    const parsed = parseGitHubUrl(raw)
    if (parsed) {
      setForm(f => ({ ...f, owner: parsed.owner, repo: parsed.repo, name: f.name || `${parsed.owner}/${parsed.repo}` }))
      setTestResult(null)
    } else if (raw.length > 5) {
      setUrlError('Expected github.com/owner/repo')
    }
  }

  const handleTest = async () => {
    if (!form.owner || !form.repo) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testRepoConnection(form)
      setTestResult(res)
      if (res.ok && !form.name)
        setForm(f => ({ ...f, name: res.repo?.full_name ?? `${form.owner}/${form.repo}` }))
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const addMut = useMutation({
    mutationFn: () => addRepo(form),
    onSuccess: async (created: any) => {
      if (created?.id) {
        switchTo(created.id, created.slug ?? created.name)
      } else {
        qc.invalidateQueries({ queryKey: ['repos'] })
        closePanel()
      }
    },
  })

  const canAdd = form.owner.trim() && form.repo.trim()

  return (
    <>
      {switching && <SwitchingOverlay slug={switching} />}

      <button
        ref={triggerRef}
        onClick={open ? closePanel : openPanel}
        className={cn(
          'flex items-center border-b border-border flex-shrink-0 h-[52px] w-full transition-colors',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-4',
          open ? 'bg-surface-2' : 'hover:bg-surface-2/60',
        )}
      >
        <div className="flex-shrink-0 w-[26px] h-[26px] rounded bg-nvidia dark:bg-[#76b900]/15 flex items-center justify-center">
          <Cpu size={12} className="text-[#0f1a00] dark:text-nvidia" />
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[13px] font-semibold tracking-[-0.02em] text-neutral-900 dark:text-white leading-none truncate">
                {repoSlug ? repoSlug.split('/')[1] : 'Select repo'}
              </p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5 leading-none">
                {repoSlug ? repoSlug.split('/')[0] : 'No repo active'}
              </p>
            </div>
            <ChevronDown
              size={12}
              className={cn(
                'flex-shrink-0 text-neutral-400 transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          </>
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Repositories</span>
            <button
              onClick={() => { setShowAddForm(v => !v); setTestResult(null) }}
              className={cn(
                'flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors',
                showAddForm
                  ? 'bg-surface-3 text-white'
                  : 'text-nvidia hover:bg-nvidia/10',
              )}
            >
              <Plus size={10} />
              Add repo
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="p-3 border-b border-border space-y-2.5 bg-surface-2/40">
              {/* URL paste */}
              <div>
                <label className="flex items-center gap-1 text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <LinkIcon size={8} /> GitHub URL
                  <span className="text-gray-400 normal-case font-normal ml-1">paste to auto-fill</span>
                </label>
                <input
                  value={urlInput}
                  onChange={e => handleUrlPaste(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  autoFocus
                  className={cn(
                    'w-full bg-surface-3 border rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none transition-colors font-mono',
                    urlError ? 'border-accent-red/50' : 'border-border focus:border-nvidia/50',
                  )}
                />
                {urlError && <p className="text-[9px] text-accent-red mt-0.5">{urlError}</p>}
                {!urlError && form.owner && form.repo && urlInput && (
                  <p className="text-[9px] text-nvidia mt-0.5 flex items-center gap-1">
                    <CheckCircle2 size={8} />
                    <span className="font-mono">{form.owner}/{form.repo}</span>
                  </p>
                )}
              </div>

              {/* Manual owner/repo */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Owner *</label>
                  <input
                    value={form.owner}
                    onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                    placeholder="owner"
                    className="w-full bg-surface-3 border border-border rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-nvidia/50 transition-colors font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Repo *</label>
                  <input
                    value={form.repo}
                    onChange={e => setForm(f => ({ ...f, repo: e.target.value }))}
                    placeholder="repo"
                    className="w-full bg-surface-3 border border-border rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-nvidia/50 transition-colors font-mono"
                  />
                </div>
              </div>

              {/* PAT toggle */}
              <div>
                <button
                  onClick={() => setShowPat(v => !v)}
                  className="flex items-center gap-1 text-[9px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Key size={8} />
                  {showPat ? 'Hide PAT' : 'Add GitHub PAT (optional)'}
                </button>
                {showPat && (
                  <input
                    value={form.gh_pat}
                    onChange={e => setForm(f => ({ ...f, gh_pat: e.target.value }))}
                    placeholder="ghp_xxxxxxxxxxxx"
                    type="password"
                    className="mt-1 w-full bg-surface-3 border border-border rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-nvidia/50 transition-colors font-mono"
                  />
                )}
              </div>

              {/* Test result */}
              {testResult && (
                <div className={cn(
                  'flex items-start gap-1.5 p-2 rounded-lg text-[10px]',
                  testResult.ok
                    ? 'bg-nvidia/[.06] border border-nvidia/20 text-nvidia'
                    : 'bg-accent-red/[.08] border border-accent-red/20 text-accent-red',
                )}>
                  {testResult.ok
                    ? <CheckCircle2 size={11} className="flex-shrink-0 mt-px" />
                    : <XCircle size={11} className="flex-shrink-0 mt-px" />
                  }
                  <span>{testResult.ok ? `Connected — ${testResult.repo?.full_name ?? 'ok'}` : testResult.error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTest}
                  disabled={!canAdd || testing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border border-border bg-surface-2 text-gray-300 hover:border-neutral-500 disabled:opacity-40 transition-colors"
                >
                  {testing && <Loader2 size={10} className="animate-spin" />}
                  Test
                </button>
                <button
                  onClick={() => addMut.mutate()}
                  disabled={!canAdd || addMut.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] bg-nvidia/15 border border-nvidia/25 text-nvidia hover:bg-nvidia/25 disabled:opacity-40 transition-colors"
                >
                  {addMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                  Add & activate
                </button>
              </div>
            </div>
          )}

          {/* Repo list */}
          <div className="max-h-[260px] overflow-y-auto">
            {repos.length === 0 && !showAddForm && (
              <div className="px-3 py-6 text-center">
                <p className="text-[11px] text-gray-400">No saved repos.</p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-2 text-[11px] text-nvidia hover:underline"
                >
                  Add your first repo →
                </button>
              </div>
            )}
            {repos.map((r: any) => {
              const slug = r.slug ?? `${r.owner}/${r.repo}`
              const isActive = activeRepoData?.active?.id === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => !isActive && switchTo(r.id, slug)}
                  disabled={isActive}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                    isActive
                      ? 'cursor-default'
                      : 'hover:bg-surface-2',
                  )}
                >
                  <div className={cn(
                    'w-[28px] h-[28px] rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold',
                    isActive ? 'bg-nvidia/15 text-nvidia' : 'bg-surface-3 text-gray-500',
                  )}>
                    {slug.split('/')[1]?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-[12px] font-medium leading-none truncate',
                      isActive ? 'text-nvidia' : 'text-white',
                    )}>
                      {slug.split('/')[1] ?? slug}
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{slug.split('/')[0]}</p>
                  </div>
                  {isActive && (
                    <Check size={12} className="text-nvidia flex-shrink-0" />
                  )}
                  {!isActive && (
                    <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100">Switch</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer link */}
          <div className="px-3 py-2 border-t border-border">
            <Link
              to="/settings"
              onClick={closePanel}
              className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-100 transition-colors"
            >
              <Settings size={10} />
              Manage in Settings
              <ExternalLink size={8} className="ml-auto" />
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function NavItemRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation()
  const isActive = item.exact
    ? location.pathname === item.to
    : location.pathname.startsWith(item.to) && item.to !== '/'

  const linkContent = (
    <NavLink
      to={item.to}
      end={item.exact}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        'group flex items-center gap-2.5 rounded-md transition-all duration-150 select-none',
        collapsed ? 'justify-center h-7 w-7 mx-auto' : 'px-2.5 py-[6px] mx-2',
        isActive
          ? 'bg-surface-3 text-white dark:bg-surface-2 dark:text-white font-semibold'
          : 'text-neutral-400 dark:text-neutral-400 hover:bg-surface-2/60 hover:text-neutral-100 dark:hover:bg-surface-2 dark:hover:text-neutral-100',
      )}
    >
      <item.icon
        size={14}
        className={cn(
          'flex-shrink-0 transition-colors duration-150',
          isActive
            ? 'text-white dark:text-white'
            : 'text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-200 dark:group-hover:text-neutral-200',
        )}
      />
      {!collapsed && (
        <span className={cn('text-[13px] truncate', isActive ? 'font-semibold' : 'font-normal')}>
          {item.label}
        </span>
      )}
      {!collapsed && item.badge && (
        <span className="ml-auto text-[10px] font-medium bg-surface-3 text-neutral-400 ring-1 ring-border rounded-full px-1.5 py-0.5 leading-none tabular-nums">
          {item.badge}
        </span>
      )}
    </NavLink>
  )

  if (collapsed) {
    return (
      <Tooltip content={item.label} side="right" delayDuration={80}>
        {linkContent}
      </Tooltip>
    )
  }

  return linkContent
}

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar()
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''

  return (
    <aside
      className={cn(
        'sidebar-transition relative flex-shrink-0 flex flex-col',
        'bg-surface-1 border-r border-border h-screen overflow-visible',
        collapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      {/* App wordmark / icon — links to home */}
      <Link
        to="/"
        className={cn(
          'flex items-center border-b border-border/40 hover:opacity-80 transition-opacity',
          collapsed ? 'justify-center py-2 px-0' : 'px-3.5 py-2.5',
        )}
      >
        {collapsed
          ? <GitPulseLogo size={20} className="text-nvidia" />
          : <GitPulseLogo size={18} withText textSize="text-[13px]" className="text-nvidia" />
        }
      </Link>

      {/* Repo Switcher */}
      <RepoSwitcher collapsed={collapsed} />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none">
        <RadixTooltip.Provider delayDuration={80}>
          {NAV.map((section, si) => (
            <div key={section.label} className={cn(si > 0 && 'mt-1')}>
              {si > 0 && (
                <div className="mx-3 my-1.5 h-px bg-border-subtle" />
              )}
              <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center gap-0.5')}>
                {section.items.map((item) => (
                  <NavItemRow key={item.to} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </RadixTooltip.Provider>
      </nav>

      {/* Footer */}
      <div className={cn(
        'border-t border-border flex-shrink-0',
        collapsed ? 'py-2 flex flex-col items-center gap-1.5' : 'px-3 py-2.5',
      )}>
        {!collapsed && (
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-nvidia flex-shrink-0" />
            <span className="text-[11px] text-neutral-400 font-mono truncate">{repoSlug}</span>
          </div>
        )}
        {!collapsed && (
          <div className="flex items-center gap-1.5 mb-2">
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-surface-2 ring-1 ring-border rounded text-neutral-400">⌘K</kbd>
            <span className="text-[10px] text-neutral-400">command palette</span>
          </div>
        )}
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'gap-1')}>
          <Tooltip content="Settings" side="right" delayDuration={80}>
            <Link
              to="/settings"
              className={cn(
                'flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-surface-2 transition-all duration-150',
                collapsed ? 'w-8 h-8' : 'w-8 h-7',
              )}
            >
              <Settings size={13} />
            </Link>
          </Tooltip>

          <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse'} side="right" delayDuration={80}>
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className={cn(
                'flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-surface-2 transition-all duration-150',
                collapsed ? 'w-8 h-8' : 'flex-1 h-7 gap-1.5 px-2 text-[11px]',
              )}
            >
              {collapsed
                ? <ChevronRight size={13} />
                : <><ChevronLeft size={11} /><span>Collapse</span></>
              }
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}
