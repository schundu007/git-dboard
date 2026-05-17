import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRepos, getActiveRepo, addRepo, deleteRepo, activateRepo,
  deactivateRepo, testRepoConnection,
} from '../lib/api'
import { cn } from '../lib/cn'
import { useTheme } from '../contexts/ThemeContext'
import {
  GitBranch, Plus, Trash2, CheckCircle2, XCircle, Loader2,
  Globe, Lock, Zap, AlertCircle,
  ChevronDown, ChevronUp, RefreshCw, Link,
  Sun, Moon, Server, Key, Bell, Pencil, Check, X,
} from 'lucide-react'

const getApiUrl = () => localStorage.getItem('api_url') || 'http://localhost:8000'

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border card-head">
        <h2 className="text-[13px] font-semibold text-white">{title}</h2>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm text-white font-medium">{label}</p>
        {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ── Appearance section ─────────────────────────────────────────────────────────
function AppearanceSection() {
  const { theme, toggle } = useTheme()
  return (
    <SectionCard title="Appearance">
      <Row label="Theme" description="Toggle between dark and light mode">
        <button
          onClick={toggle}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm text-gray-300 hover:border-neutral-500 transition-colors"
        >
          {theme === 'dark' ? <Moon size={13} className="text-neutral-400" /> : <Sun size={13} className="text-nvidia" />}
          <span className="capitalize">{theme}</span>
        </button>
      </Row>
    </SectionCard>
  )
}

// ── API section ────────────────────────────────────────────────────────────────
function ApiSection() {
  const [apiDraft, setApiDraft] = useState(getApiUrl)
  const [testState, setTestState] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle')
  const [saved, setSaved] = useState(false)

  async function testConnection(url: string) {
    setTestState('loading')
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) })
      setTestState(r.ok ? 'ok' : 'fail')
    } catch { setTestState('fail') }
  }

  function save() {
    const trimmed = apiDraft.trim().replace(/\/$/, '')
    localStorage.setItem('api_url', trimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    testConnection(trimmed)
  }

  return (
    <SectionCard title="Backend API">
      <Row label="API URL" description="FastAPI backend endpoint used for all data fetching">
        <div className="flex items-center gap-1.5">
          {testState === 'ok'      && <CheckCircle2 size={13} className="text-nvidia" />}
          {testState === 'fail'    && <XCircle      size={13} className="text-accent-red" />}
          {testState === 'loading' && <Loader2      size={13} className="text-neutral-400 animate-spin" />}
        </div>
      </Row>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Server size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="url"
            value={apiDraft}
            onChange={e => setApiDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            className="w-full bg-surface-3 border border-border rounded-lg pl-7 pr-3 py-1.5 text-[12px] font-mono text-gray-300 focus:outline-none focus:border-nvidia/50 transition-colors"
            placeholder="http://localhost:8000"
          />
        </div>
        <button onClick={save}
          className={cn('px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors flex-shrink-0',
            saved ? 'bg-nvidia/20 text-nvidia border border-nvidia/30' : 'bg-surface-2 border border-border text-gray-300 hover:border-neutral-500')}>
          {saved ? 'Saved' : 'Save'}
        </button>
        <button onClick={() => testConnection(apiDraft)}
          disabled={testState === 'loading'}
          className="px-3 py-1.5 rounded-lg text-[12px] border border-border bg-surface-2 text-gray-400 hover:border-neutral-500 disabled:opacity-40 transition-colors flex-shrink-0">
          Test
        </button>
      </div>
      {testState === 'fail' && <p className="text-[11px] text-accent-red">Could not reach the backend. Is it running?</p>}
    </SectionCard>
  )
}

// ── GitHub token section ───────────────────────────────────────────────────────
function GitHubSection() {
  const token = import.meta.env.VITE_GITHUB_TOKEN
  return (
    <SectionCard title="GitHub">
      <Row
        label="Personal Access Token"
        description={token ? 'Configured via VITE_GITHUB_TOKEN' : 'Not set — add to .env and restart Vite'}
      >
        <div className="flex items-center gap-1.5">
          <Key size={12} className={token ? 'text-nvidia' : 'text-gray-400'} />
          <span className={cn('text-[11px] font-mono', token ? 'text-nvidia' : 'text-gray-400')}>
            {token ? `${token.slice(0, 4)}${'•'.repeat(12)}` : 'not set'}
          </span>
        </div>
      </Row>
      <p className="text-[11px] text-gray-400 bg-surface-2 rounded-lg px-3 py-2 font-mono border border-border">
        VITE_GITHUB_TOKEN=ghp_xxxx&nbsp;&nbsp;<span className="text-gray-400">← .env · restart Vite</span>
      </p>
    </SectionCard>
  )
}

// ── Refresh intervals section ──────────────────────────────────────────────────
function RefreshSection() {
  return (
    <SectionCard title="Data Refresh">
      <div className="space-y-3">
        {([
          ['CI Runs',              '30s'],
          ['PR list',              '60s'],
          ['Nightly jobs',         '5 min'],
          ['Insights / Analytics', '5 min'],
        ] as const).map(([label, interval]) => (
          <Row key={label} label={label} description={`Auto-refreshes every ${interval}`}>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <RefreshCw size={10} />{interval}
            </div>
          </Row>
        ))}
      </div>
    </SectionCard>
  )
}

interface RepoForm {
  name: string
  owner: string
  repo: string
  gh_pat: string
}

const EMPTY_FORM: RepoForm = { name: '', owner: '', repo: '', gh_pat: '' }

function parseGitHubUrl(raw: string): { owner: string; repo: string } | null {
  const s = raw.trim().replace(/\.git$/, '')
  const full = s.match(/github\.com\/([^/]+)\/([^/?\s]+)/)
  if (full) return { owner: full[1], repo: full[2] }
  const short = s.match(/^([^/]+)\/([^/?\s]+)$/)
  if (short) return { owner: short[1], repo: short[2] }
  return null
}

function Cap({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
      active
        ? 'bg-nvidia/10 text-nvidia border-nvidia/25'
        : 'bg-surface-3 text-gray-500 border-border',
    )}>
      {label}
    </span>
  )
}

function TestResult({ result }: { result: any }) {
  if (!result) return null
  if (!result.ok) return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-red/[.08] border border-accent-red/20 text-accent-red text-[12px]">
      <XCircle size={13} className="flex-shrink-0 mt-0.5" />
      <span>{result.error}</span>
    </div>
  )
  const repo = result.repo ?? {}
  const caps = result.capabilities ?? {}
  return (
    <div className="p-3 rounded-lg bg-nvidia/[.06] border border-nvidia/20 space-y-2">
      <div className="flex items-center gap-2 text-nvidia text-[12px] font-medium">
        <CheckCircle2 size={13} />
        Connected — {repo.full_name}
      </div>
      {repo.description && <p className="text-[11px] text-gray-500 leading-relaxed">{repo.description}</p>}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Cap label="Actions"      active={caps.has_actions} />
        <Cap label="Nightly"      active={caps.has_nightly} />
        <Cap label="Post-merge CI" active={caps.has_postmerge} />
        <Cap label="Monorepo"     active={caps.is_monorepo} />
        {(caps.languages ?? []).slice(0, 3).map((l: string) => <Cap key={l} label={l} active />)}
      </div>
    </div>
  )
}

function SwitchingOverlay({ slug }: { slug: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <Loader2 size={28} className="text-nvidia animate-spin" />
      <div className="text-center">
        <p className="text-[14px] font-semibold text-white">Switching repository</p>
        <p className="text-[12px] text-gray-400 font-mono mt-1">{slug}</p>
      </div>
      <p className="text-[11px] text-gray-400">Reloading dashboard…</p>
    </div>
  )
}

// ── Alert Rules ────────────────────────────────────────────────────────────────

interface AlertRule {
  id: string
  label: string
  metric: string
  op: 'gte' | 'lte'
  threshold: number
  enabled: boolean
  description: string
}

const DEFAULT_RULES: AlertRule[] = [
  { id: 'nightly-fail',    label: 'Nightly build fails',   metric: 'nightly_consecutive_failures', op: 'gte', threshold: 3,  enabled: true,  description: 'Alert when nightly fails 3+ consecutive times' },
  { id: 'build-pass-drop', label: 'CI pass rate drops',    metric: 'ci_pass_rate_last10',          op: 'lte', threshold: 70, enabled: true,  description: 'Alert when CI pass rate drops below 70%' },
  { id: 'open-prs-spike',  label: 'PR queue spike',        metric: 'open_prs',                     op: 'gte', threshold: 60, enabled: false, description: 'Alert when open PRs exceed 60' },
  { id: 'lead-time-high',  label: 'Lead time too high',    metric: 'lead_time_hours',              op: 'gte', threshold: 48, enabled: true,  description: 'Alert when average lead time exceeds 48h' },
  { id: 'mttr-breach',     label: 'MTTR SLO breach',       metric: 'mttr_hours',                   op: 'gte', threshold: 24, enabled: true,  description: 'Alert when MTTR exceeds 24 hours' },
  { id: 'queue-depth',     label: 'Runner queue depth',    metric: 'queued_runs',                  op: 'gte', threshold: 10, enabled: false, description: 'Alert when more than 10 runs are queued' },
]

const ALERT_RULES_KEY = 'alert-rules'

function loadRules(): AlertRule[] {
  try {
    const stored = localStorage.getItem(ALERT_RULES_KEY)
    if (stored) return JSON.parse(stored) as AlertRule[]
  } catch { /* ignore */ }
  return DEFAULT_RULES
}

function saveRules(rules: AlertRule[]): void {
  try {
    localStorage.setItem(ALERT_RULES_KEY, JSON.stringify(rules))
  } catch { /* ignore */ }
}

function AlertRulesSection() {
  const [rules, setRules] = useState<AlertRule[]>(() => loadRules())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editThreshold, setEditThreshold] = useState<string>('')

  // Persist on every change
  useEffect(() => {
    saveRules(rules)
  }, [rules])

  const toggleRule = (id: string) => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  const startEdit = (rule: AlertRule) => {
    setEditingId(rule.id)
    setEditThreshold(String(rule.threshold))
  }

  const saveEdit = (id: string) => {
    const val = parseFloat(editThreshold)
    if (!isNaN(val)) {
      setRules((prev) => prev.map((r) => r.id === id ? { ...r, threshold: val } : r))
    }
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditThreshold('')
  }

  const metCount = rules.filter((r) => r.enabled).length

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-border card-head flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={13} className="text-gray-500" />
          <h2 className="text-[13px] font-semibold text-white">Alert Rules</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 border border-border text-gray-500">
            {metCount} active
          </span>
        </div>
        <p className="text-[10px] text-gray-400 hidden sm:block">
          Rules are evaluated on dashboard load. Future: push/email notifications.
        </p>
      </div>

      <div className="divide-y divide-border">
        {rules.map((rule) => {
          const isEditing = editingId === rule.id
          return (
            <div key={rule.id} className="p-4">
              <div className="flex items-start gap-3">
                {/* CSS-only toggle */}
                <button
                  type="button"
                  onClick={() => toggleRule(rule.id)}
                  className={cn(
                    'w-9 h-5 rounded-full transition-colors flex-shrink-0 relative mt-0.5',
                    rule.enabled ? 'bg-nvidia' : 'bg-surface-3 border border-border',
                  )}
                  aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                >
                  <span className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm',
                    rule.enabled ? 'left-4' : 'left-0.5',
                  )} />
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-white">{rule.label}</span>
                    {/* Threshold display / edit */}
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400">{rule.op === 'gte' ? '≥' : '≤'}</span>
                        <input
                          type="number"
                          value={editThreshold}
                          onChange={(e) => setEditThreshold(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(rule.id); if (e.key === 'Escape') cancelEdit() }}
                          autoFocus
                          className="w-16 bg-surface-3 border border-nvidia/50 rounded px-1.5 py-0.5 text-[11px] text-white font-mono focus:outline-none"
                        />
                        <button onClick={() => saveEdit(rule.id)} className="text-accent-green hover:text-accent-green/80 transition-colors">
                          <Check size={11} />
                        </button>
                        <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-300 transition-colors">
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-gray-400 bg-surface-2 border border-border rounded px-1.5 py-0.5">
                        {rule.op === 'gte' ? '≥' : '≤'} {rule.threshold}
                      </span>
                    )}
                    {/* Status pill */}
                    <span className={cn(
                      'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border',
                      rule.enabled
                        ? 'bg-accent-green/10 text-accent-green border-accent-green/30'
                        : 'bg-surface-3 text-gray-400 border-border'
                    )}>
                      {rule.enabled ? 'Monitoring' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{rule.description}</p>
                  <p className="text-[9px] text-gray-400 font-mono mt-0.5">metric: {rule.metric}</p>
                </div>

                {/* Edit button */}
                {!isEditing && (
                  <button
                    onClick={() => startEdit(rule)}
                    className="flex-shrink-0 text-gray-400 hover:text-gray-300 transition-colors p-1 rounded hover:bg-surface-2"
                    title="Edit threshold"
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Settings() {
  const qc = useQueryClient()
  const [form, setForm] = useState<RepoForm>(EMPTY_FORM)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [activateOnAdd, setActivateOnAdd] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [expandedCaps, setExpandedCaps] = useState<number | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)

  const { data: reposData, isLoading } = useQuery({ queryKey: ['repos'], queryFn: getRepos })
  const { data: activeData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, refetchInterval: 5000 })

  const switchTo = async (id: number, slug: string) => {
    setSwitching(slug)
    try {
      await activateRepo(id)
      // Bust all server-side caches so next requests fetch from the new repo
      await fetch(`${getApiUrl()}/cache/clear`, { method: 'POST' }).catch(() => {})
    } catch { setSwitching(null); return }
    qc.clear()
    setTimeout(() => { window.location.href = '/' }, 800)
  }

  const deactivateAndReload = async () => {
    setSwitching('env defaults')
    try {
      await deactivateRepo()
      await fetch(`${getApiUrl()}/cache/clear`, { method: 'POST' }).catch(() => {})
    } catch { setSwitching(null); return }
    qc.clear()
    setTimeout(() => { window.location.href = '/' }, 800)
  }

  const addMut = useMutation({
    mutationFn: addRepo,
    onSuccess: async (created: any) => {
      if (activateOnAdd && created?.id) {
        await switchTo(created.id, created.slug ?? created.name)
      } else {
        qc.invalidateQueries({ queryKey: ['repos'] })
        setForm(EMPTY_FORM); setUrlInput(''); setUrlError('')
        setShowForm(false); setTestResult(null)
      }
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteRepo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  })

  const handleUrlPaste = (raw: string) => {
    setUrlInput(raw); setUrlError('')
    if (!raw.trim()) return
    const parsed = parseGitHubUrl(raw)
    if (parsed) {
      setForm(f => ({ ...f, owner: parsed.owner, repo: parsed.repo, name: f.name || `${parsed.owner}/${parsed.repo}` }))
      setTestResult(null)
    } else if (raw.length > 5) {
      setUrlError('Could not parse — expected github.com/owner/repo')
    }
  }

  const handleTest = async () => {
    if (!form.owner || !form.repo) return
    setTesting(true); setTestResult(null)
    try {
      const res = await testRepoConnection(form)
      setTestResult(res)
      if (res.ok && !form.name)
        setForm(f => ({ ...f, name: res.repo?.full_name ?? `${form.owner}/${form.repo}` }))
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message })
    } finally { setTesting(false) }
  }

  const repos = reposData?.repos ?? []
  const active = activeData?.active
  const activeSource = activeData?.source

  return (
    <>
      {switching && <SwitchingOverlay slug={switching} />}

      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <p className="text-[12px] text-gray-500">Repositories · Appearance · API · GitHub</p>

        {/* Active repo banner */}
        {active && (
          <div className="rounded-xl border border-nvidia/20 bg-nvidia/[.04] p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Active Repository</p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-nvidia animate-pulse flex-shrink-0" />
                <span className="text-[14px] font-semibold text-white">{active.slug ?? active.name}</span>
                {activeSource === 'env' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 border border-border text-gray-500 font-mono">env</span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">All dashboard pages fetch data from this repo.</p>
            </div>
            {active.id && (
              <button
                onClick={deactivateAndReload}
                className="text-[11px] text-gray-500 hover:text-gray-300 border border-border rounded-lg px-3 py-1.5 hover:bg-surface-3 transition-colors flex-shrink-0"
              >
                Use env defaults
              </button>
            )}
          </div>
        )}

        {/* Repo list card */}
        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border card-head card-head">
            <div className="flex items-center gap-2">
              <GitBranch size={13} className="text-gray-500" />
              <span className="text-[13px] font-semibold text-white">Repositories</span>
              {repos.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 border border-border text-gray-500">{repos.length}</span>
              )}
            </div>
            <button
              onClick={() => { setShowForm(v => !v); setTestResult(null); setUrlInput(''); setUrlError('') }}
              className={cn(
                'flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors',
                showForm ? 'bg-surface-3 text-gray-300' : 'bg-nvidia/15 text-nvidia hover:bg-nvidia/25',
              )}
            >
              <Plus size={12} />
              Add repo
            </button>
          </div>

          {/* Add form */}
          {showForm && (
            <div className="p-4 border-b border-border space-y-3 bg-surface-2/50">
              {/* GitHub URL paste */}
              <div>
                <label className="flex items-center gap-1 text-xs font-semibold text-gray-400 mb-1">
                  <Link size={9} />
                  GitHub URL
                  <span className="text-gray-400 normal-case font-normal ml-1">(paste to auto-fill)</span>
                </label>
                <input
                  value={urlInput}
                  onChange={e => handleUrlPaste(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  autoFocus
                  className={cn(
                    'w-full bg-surface-3 border rounded-lg px-3 py-2 text-[12px] text-white placeholder-gray-500 focus:outline-none transition-colors font-mono',
                    urlError ? 'border-accent-red/50 focus:border-accent-red' : 'border-border focus:border-nvidia/50',
                  )}
                />
                {urlError && <p className="text-[10px] text-accent-red mt-1">{urlError}</p>}
                {!urlError && form.owner && form.repo && urlInput && (
                  <p className="text-[10px] text-nvidia mt-1 flex items-center gap-1">
                    <CheckCircle2 size={9} />
                    Parsed: <span className="font-mono ml-0.5">{form.owner}/{form.repo}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <div className="flex-1 h-px bg-border" />
                <span>or enter manually</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Owner / Org *</label>
                  <input
                    value={form.owner}
                    onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                    placeholder="e.g. isaac-sim"
                    className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-[12px] text-white placeholder-gray-500 focus:outline-none focus:border-nvidia/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Repository *</label>
                  <input
                    value={form.repo}
                    onChange={e => setForm(f => ({ ...f, repo: e.target.value }))}
                    placeholder="e.g. my-repo"
                    className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-[12px] text-white placeholder-gray-500 focus:outline-none focus:border-nvidia/50 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Display Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Auto-filled on test"
                  className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-[12px] text-white placeholder-gray-500 focus:outline-none focus:border-nvidia/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  GitHub PAT <span className="text-gray-400 normal-case font-normal">(leave blank to use env GH_PAT)</span>
                </label>
                <input
                  type="password"
                  value={form.gh_pat}
                  onChange={e => setForm(f => ({ ...f, gh_pat: e.target.value }))}
                  placeholder="ghp_…"
                  className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-[12px] text-white placeholder-gray-500 focus:outline-none focus:border-nvidia/50 transition-colors font-mono"
                />
              </div>

              {testResult && <TestResult result={testResult} />}

              {/* Activate on add toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <div
                  onClick={() => setActivateOnAdd(v => !v)}
                  className={cn(
                    'w-8 h-4 rounded-full transition-colors flex-shrink-0 relative',
                    activateOnAdd ? 'bg-nvidia' : 'bg-surface-3 border border-border',
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
                    activateOnAdd ? 'left-4' : 'left-0.5',
                  )} />
                </div>
                <span className="text-[11px] text-gray-400 group-hover:text-gray-300 transition-colors">
                  Switch dashboard to this repo after adding
                </span>
              </label>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleTest}
                  disabled={testing || !form.owner || !form.repo}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors disabled:opacity-40"
                >
                  {testing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  Test connection
                </button>
                <button
                  onClick={() => addMut.mutate({ ...form, name: form.name || `${form.owner}/${form.repo}` })}
                  disabled={addMut.isPending || !form.owner || !form.repo}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-nvidia text-black hover:bg-[#5a8c00] transition-colors disabled:opacity-40 font-medium"
                >
                  {addMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  {activateOnAdd ? 'Add & switch' : 'Add repository'}
                </button>
                {addMut.isError && (
                  <span className="text-[11px] text-accent-red">{String(addMut.error)}</span>
                )}
              </div>
            </div>
          )}

          {/* Repo rows */}
          {isLoading ? (
            <div className="p-8 text-center text-[12px] text-gray-400 flex items-center justify-center gap-2">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : repos.length === 0 ? (
            <div className="p-8 text-center">
              <Globe size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-[12px] text-gray-400">No repositories added yet.</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Using <span className="font-mono text-gray-500">{active?.slug}</span> from .env
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {repos.map((r: any) => {
                const isActive = r.id === active?.id
                const caps = r.capabilities ?? {}
                const showCaps = expandedCaps === r.id
                return (
                  <div key={r.id} className={cn('p-4 transition-colors', isActive && 'bg-nvidia/[.03]')}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border',
                        isActive
                          ? 'bg-nvidia/15 border-nvidia/30 text-nvidia'
                          : 'bg-surface-3 border-border text-gray-500',
                      )}>
                        <GitBranch size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-white truncate">{r.name}</span>
                          {isActive && (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-nvidia bg-nvidia/10 border border-nvidia/20 rounded-full px-1.5 py-0.5">
                              <span className="w-1 h-1 rounded-full bg-nvidia animate-pulse" />
                              Active
                            </span>
                          )}
                          {r.has_pat && <Lock size={10} className="text-gray-400" />}
                        </div>
                        <p className="text-[11px] text-gray-400 font-mono">{r.slug}</p>
                      </div>

                      {caps.workflows?.length > 0 && (
                        <button
                          onClick={() => setExpandedCaps(showCaps ? null : r.id)}
                          className="text-gray-400 hover:text-gray-400 transition-colors"
                        >
                          {showCaps ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}

                      <div className="flex items-center gap-1.5">
                        {!isActive && (
                          <button
                            onClick={() => switchTo(r.id, r.slug)}
                            className="text-[11px] px-3 py-1.5 rounded-lg border border-nvidia/30 text-nvidia hover:bg-nvidia/10 transition-colors font-medium flex items-center gap-1"
                          >
                            <Zap size={10} />
                            Switch
                          </button>
                        )}
                        <button
                          onClick={() => deleteMut.mutate(r.id)}
                          disabled={deleteMut.isPending}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {showCaps && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          <Cap label="Actions"      active={caps.has_actions} />
                          <Cap label="Nightly"      active={caps.has_nightly} />
                          <Cap label="Post-merge CI" active={caps.has_postmerge} />
                          <Cap label="Monorepo"     active={caps.is_monorepo} />
                          {(caps.languages ?? []).slice(0, 4).map((l: string) => <Cap key={l} label={l} active />)}
                        </div>
                        {caps.workflows?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {caps.workflows.map((w: string) => (
                              <span key={w} className="text-[10px] font-mono text-gray-400 bg-surface-3 border border-border px-1.5 py-0.5 rounded">
                                {w}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Info card */}
        <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-400">
            <AlertCircle size={12} />
            How repo switching works
          </div>
          <ul className="space-y-1 text-[11px] text-gray-400 list-disc list-inside leading-relaxed">
            <li>Switching clears all cached data and reloads the dashboard</li>
            <li>The active repo overrides <span className="font-mono text-gray-500">GH_OWNER / GH_REPO</span> from <span className="font-mono text-gray-500">.env</span></li>
            <li>A per-repo PAT overrides the env <span className="font-mono text-gray-500">GH_PAT</span> — useful for private repos</li>
            <li>The active repo persists in SQLite and is restored on backend restart</li>
          </ul>
        </div>

        {/* ── Other settings ── */}
        <AppearanceSection />
        <ApiSection />
        <GitHubSection />
        <RefreshSection />

        {/* Alert Rules */}
        <AlertRulesSection />

        {/* About */}
        <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-1.5">
          <p className="text-[12px] text-gray-500 font-semibold">About</p>
          <p className="text-[11px] text-gray-400">DevOps Dashboard</p>
          <p className="text-[11px] text-gray-400 font-mono">React + Vite + FastAPI</p>
        </div>
      </div>
    </>
  )
}
