import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileCode, ExternalLink, Loader2, AlertCircle, Search,
  Code2, BookOpen, Bug, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react'
import { getActiveRepo } from '../lib/api'
import { cn } from '../lib/cn'

// ─── CI/infra discovery filter ────────────────────────────────────────────────
// Classifies by *evidence* (file kind, executable bit, directory role) rather
// than by an allowlist of literal directory names. Name allowlists under-match
// silently: a repo that calls its CI directory `build_tools` instead of `tools`
// simply vanishes from the browser with no error to explain the absence.

// Genuinely non-source: dependency trees, caches, build output, binary assets.
const HARD_EXCLUDED_DIRS = new Set([
  'node_modules', '__pycache__', '.venv', 'venv', 'site-packages',
  'dist', 'coverage', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.git',
  'assets', 'images', 'media', 'icons', 'fonts', 'mermaid', 'diagrams',
])

// Directory-name *tokens* implying an operational role. Matched against each
// path segment split on `_`, `-` and `.`, so `build_tools`, `ci-scripts`,
// `external-builds` and `infra.aws` all resolve correctly.
const INFRA_TOKENS = new Set([
  'github', 'workflows', 'actions',
  'scripts', 'script', 'ci', 'cicd', 'cd',
  'docker', 'dockerfiles', 'containers', 'container',
  'infra', 'infrastructure', 'deploy', 'deployment',
  'tools', 'tool', 'tooling', 'utils', 'util',
  'ops', 'devops', 'automation', 'bootstrap',
  'build', 'builds', 'make', 'cmake',
  'pipeline', 'pipelines', 'release', 'releases',
  'provision', 'ansible', 'terraform', 'packer',
  'k8s', 'kubernetes', 'helm', 'charts',
])

// Canonical infra files recognised wherever they appear.
//
// NOTE — `CMakeLists.txt` is deliberately NOT here. In a superproject like
// TheRock it matches ~90 near-empty `add_subdirectory()` stubs under
// third-party/, core/ and math-libs/, which would bury the ~300 real CI scripts.
// Add it back if you want build-system definitions treated as browsable scripts.
const INFRA_FILENAMES = new Set([
  'Makefile', 'Justfile', 'Procfile', 'Jenkinsfile', 'Vagrantfile',
  'docker-compose.yml', 'docker-compose.yaml',
  '.travis.yml', '.gitlab-ci.yml', '.pre-commit-config.yaml',
  'nixpacks.toml', 'railway.toml', 'vercel.json', 'fly.toml', 'netlify.toml',
  '.env.example', 'CMakePresets.json',
])

const SCRIPT_EXTS = new Set(['.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd'])
const CONFIG_EXTS = new Set(['.toml', '.json', '.yml', '.yaml', '.cfg', '.ini'])

function segTokens(segment: string): string[] {
  return segment.toLowerCase().split(/[._\-\s]+/).filter(Boolean)
}

// `tmp`/`temp` scratch dirs, but NOT legitimate names that merely start with
// those letters — a bare `startsWith('temp')` silently swallows `templates/`.
const SCRATCH_DIR = /^(tmp|temp)([._-].*)?$/

function isExcludedDir(dir: string): boolean {
  return dir.toLowerCase().split('/').some(p =>
    HARD_EXCLUDED_DIRS.has(p) || SCRATCH_DIR.test(p),
  )
}

function isInInfraDir(dir: string): boolean {
  if (!dir) return false
  return dir.toLowerCase().split('/').some(seg =>
    INFRA_TOKENS.has(seg) || segTokens(seg).some(t => INFRA_TOKENS.has(t)),
  )
}

/** GitHub tree entries carry a POSIX mode; `100755` means the file is executable. */
function isExecutable(mode?: string): boolean {
  return mode === '100755'
}

export function isInfraScript(path: string, mode?: string): boolean {
  const filename  = path.split('/').pop() ?? ''
  const fileLower = filename.toLowerCase()
  const ext       = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : ''
  const dir       = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const dirLower  = dir.toLowerCase()

  if (dir && isExcludedDir(dir)) return false

  // Container definitions — prefix (`Dockerfile.ci`) AND suffix (`build.Dockerfile`).
  if (fileLower.startsWith('dockerfile') || fileLower.endsWith('.dockerfile')) return true
  if (fileLower.startsWith('docker-compose')) return true

  // Everything declarative under .github/ is CI surface: workflows, composite
  // actions, dependabot, issue automation.
  if (dirLower === '.github' || dirLower.startsWith('.github/')) {
    return ext === '.yml' || ext === '.yaml' || ext === '.py' || SCRIPT_EXTS.has(ext)
  }

  // Named infra files, anywhere.
  if (INFRA_FILENAMES.has(filename)) return true
  if (ext === '.mk') return true

  // Shell/PowerShell scripts are operational wherever they live — a shell script
  // outside an "infra" directory is still a shell script someone runs.
  if (SCRIPT_EXTS.has(ext)) return true

  // Executable blobs are self-evidently runnable tooling, regardless of naming.
  if (isExecutable(mode) && (ext === '.py' || ext === '' || SCRIPT_EXTS.has(ext))) return true

  // Python and config inside an operational directory. No filename-keyword gate:
  // `fetch_sources.py` and `artifact_manager.py` are CI code even though neither
  // name contains a word from any keyword list.
  if (ext === '.py') {
    if (fileLower === '__init__.py') return false
    return isInInfraDir(dir)
  }
  if (CONFIG_EXTS.has(ext)) {
    if (!dir) return ext === '.toml' || ext === '.json' || ext === '.yml' || ext === '.yaml'
    return isInInfraDir(dir)
  }

  return false
}

// ─── Language + type helpers ──────────────────────────────────────────────────

type ScriptTypeId = 'all' | 'actions' | 'shell' | 'docker' | 'python' | 'makefile'

const SCRIPT_TYPE_TABS: { id: ScriptTypeId; label: string }[] = [
  { id: 'all',      label: 'All'      },
  { id: 'actions',  label: 'Actions'  },
  { id: 'shell',    label: 'Shell'    },
  { id: 'docker',   label: 'Docker'   },
  { id: 'python',   label: 'Python'   },
  { id: 'makefile', label: 'Make'     },
]

function langFromPath(path: string): string {
  const filename = path.split('/').pop() ?? ''
  const lower    = filename.toLowerCase()
  if (lower.startsWith('dockerfile') || lower.endsWith('.dockerfile')) return 'dockerfile'
  if (filename === 'Makefile' || filename === 'Justfile' || filename === 'Procfile') return 'makefile'
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : ''
  const map: Record<string, string> = {
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
    '.ps1': 'powershell', '.bat': 'batch', '.cmd': 'batch',
    '.py': 'python',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'toml', '.json': 'json',
    '.mk': 'makefile', '.cfg': 'toml', '.ini': 'toml',
  }
  return map[ext] ?? 'text'
}

function typeFromPath(path: string): Exclude<ScriptTypeId, 'all'> {
  const dir      = path.includes('/') ? path.slice(0, path.lastIndexOf('/')).toLowerCase() : ''
  const filename = path.split('/').pop() ?? ''
  const lang     = langFromPath(path)
  if (dir === '.github' || dir.startsWith('.github/')) return 'actions'
  if (lang === 'dockerfile' || filename.toLowerCase().startsWith('docker-compose')) return 'docker'
  if (lang === 'bash') return 'shell'
  if (lang === 'python') return 'python'
  if (lang === 'makefile') return 'makefile'
  return 'shell'
}

function titleFromPath(path: string): string {
  const filename = path.split('/').pop() ?? path
  // Strip extension for clean display
  const noExt = filename.includes('.')
    ? filename.slice(0, filename.lastIndexOf('.'))
    : filename
  return noExt || filename
}

const LANG_DISPLAY: Record<string, string> = {
  bash: 'bash', python: 'python', yaml: 'yaml',
  dockerfile: 'dockerfile', makefile: 'make', toml: 'toml', json: 'json',
  powershell: 'ps1', batch: 'bat', cmake: 'cmake', text: 'txt',
}

const LANG_COLOR: Record<string, string> = {
  bash: 'text-[#76b900]', python: 'text-[#3b82f6]', yaml: 'text-[#f59e0b]',
  dockerfile: 'text-[#0db7ed]', toml: 'text-[#a855f7]', json: 'text-[#f97316]',
  makefile: 'text-neutral-400', powershell: 'text-[#5391fe]',
  batch: 'text-neutral-400', cmake: 'text-[#22c55e]',
}

// ─── GitHub fetch (proxied through backend to support private repos) ──────────

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

async function fetchTree(owner: string, repo: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/proxy/tree?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const data = await res.json()
  return (data.tree ?? [])
    .filter((f: any) => f.type === 'blob' && isInfraScript(f.path, f.mode))
    .map((f: any) => f.path as string)
}

// ─── Per-file analysis (LLM-backed, cached server-side by content hash) ───────

export type AnalysisStep  = { detail: string; lines: string | null }
export type AnalysisIssue = {
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  fix: string
  lines: string | null
}
export type FileAnalysis = {
  cached: boolean
  lang: string
  summary: string
  steps: AnalysisStep[]
  concepts: string[]
  issues: AnalysisIssue[]
  deep_dive: { q: string; a: string }[]
}

export type PrewarmState = {
  running: boolean
  total: number
  done: number
  failed: number
  eligible?: number
  already_cached?: number
}

/** Kick off pre-generation for this repo's Actions YAML. Idempotent and cheap:
 *  the server filters to .github/**.y(a)ml and skips anything already cached. */
async function startPrewarm(owner: string, repo: string, paths: string[]): Promise<PrewarmState> {
  const res = await fetch(`${API_BASE}/analyze/prewarm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, paths }),
  })
  if (!res.ok) throw new Error(`Prewarm failed (${res.status})`)
  return res.json()
}

async function fetchPrewarmStatus(owner: string, repo: string): Promise<PrewarmState> {
  const res = await fetch(`${API_BASE}/analyze/prewarm/status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
  if (!res.ok) throw new Error(`Status failed (${res.status})`)
  return res.json()
}

async function fetchCachedPaths(owner: string, repo: string): Promise<Set<string>> {
  const res = await fetch(`${API_BASE}/analyze/cached?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
  if (!res.ok) return new Set()
  const data = await res.json()
  return new Set<string>(data.paths ?? [])
}

async function fetchAnalysis(owner: string, repo: string, path: string): Promise<FileAnalysis> {
  const res = await fetch(
    `${API_BASE}/analyze/file?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`,
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.detail ?? `Analysis failed (${res.status})`)
  }
  return res.json()
}

async function fetchContent(owner: string, repo: string, path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/proxy/content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const data = await res.json()
  if (data.encoding === 'base64') return atob(data.content.replace(/\n/g, ''))
  return data.content ?? ''
}

// ─── Tab content panes ────────────────────────────────────────────────────────

/** All three analysis panes render from one shared request for the selected file. */
type PaneProps = {
  analysis: FileAnalysis | undefined
  loading: boolean
  error: Error | null
}

function CodePane({ content, loading }: { content: string | undefined; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <Loader2 size={16} className="animate-spin text-neutral-500" />
    </div>
  )
  return (
    <pre className="p-4 text-[11.5px] font-mono leading-[1.65] text-neutral-300 whitespace-pre overflow-x-auto min-h-full">
      {content}
    </pre>
  )
}

function AnalysisState({ loading, error }: { loading: boolean; error: Error | null }) {
  if (loading) return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-16">
      <Loader2 size={18} className="animate-spin text-brand" />
      <p className="text-[11px] text-gray-400">Reading the file and analysing it…</p>
      <p className="text-[10px] text-gray-600">First look at a file takes a few seconds; afterwards it is cached.</p>
    </div>
  )
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 px-8 text-center">
      <AlertCircle size={18} className="text-accent-red" />
      <p className="text-[11.5px] text-gray-300">Could not analyse this file</p>
      <p className="text-[10px] text-gray-500 font-mono max-w-md">{error?.message}</p>
    </div>
  )
}

/** Small monospace chip showing which lines of the file a point refers to. */
function LineRef({ lines }: { lines: string | null | undefined }) {
  if (!lines) return null
  return (
    <span className="text-[9px] font-mono text-gray-500 bg-surface-3 px-1.5 py-0.5 rounded border border-border/60 flex-shrink-0">
      L{lines}
    </span>
  )
}

function ExplainPane({ analysis, loading, error }: PaneProps) {
  if (loading || error || !analysis) return <AnalysisState loading={loading} error={error} />
  const { summary, steps, concepts } = analysis
  return (
    <div className="p-4 space-y-5">
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">What this file does</p>
        <p className="text-[12px] text-gray-300 leading-relaxed">{summary}</p>
      </div>
      {steps.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Step by step</p>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-[10px] font-mono text-gray-400 w-4 flex-shrink-0 pt-0.5">{i + 1}</span>
                <p className="flex-1 text-[11.5px] text-gray-300 leading-relaxed">{step.detail}</p>
                <LineRef lines={step.lines} />
              </li>
            ))}
          </ol>
        </div>
      )}
      {concepts.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Techniques used here</p>
          <div className="flex flex-wrap gap-1.5">
            {concepts.map(c => (
              <span key={c} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border bg-surface-2 text-gray-400">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-accent-red/10 text-accent-red border-accent-red/20',
  high:     'bg-orange-400/10 text-orange-400 border-orange-400/30',
  medium:   'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
  low:      'bg-neutral-400/10 text-neutral-400 border-neutral-400/30',
}

const SEV_OPEN: Record<string, string> = {
  critical: 'border-accent-red/30 bg-accent-red/[.04]',
  high:     'border-orange-400/30 bg-orange-400/[.04]',
  medium:   'border-accent-yellow/30 bg-accent-yellow/[.04]',
  low:      'border-neutral-500/30 bg-neutral-500/[.04]',
}

function IssuesPane({ analysis, loading, error }: PaneProps) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setRevealed(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  if (loading || error || !analysis) return <AnalysisState loading={loading} error={error} />
  const issues = analysis.issues

  // An empty findings list is a real result, not a gap to paper over with
  // generic advice — say so plainly.
  if (issues.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 px-8 text-center">
      <Bug size={18} className="text-neutral-600" />
      <p className="text-[11.5px] text-gray-300">No issues found in this file</p>
      <p className="text-[10px] text-gray-500 max-w-sm">
        The analysis flagged nothing actionable here. Findings are specific to this file's
        contents — no generic checklist is shown.
      </p>
    </div>
  )

  return (
    <div className="space-y-3 p-4">
      <p className="text-[11px] text-gray-500">
        {issues.length} finding{issues.length === 1 ? '' : 's'} in this file. Try to spot each one in the
        Code tab before revealing it.
      </p>
      {issues.map((iss, i) => {
        const open = revealed.has(i)
        return (
          <div key={i} className={cn(
            'rounded-xl border overflow-hidden transition-colors',
            open ? (SEV_OPEN[iss.severity] ?? SEV_OPEN.medium) : 'border-border bg-surface-2',
          )}>
            <button onClick={() => toggle(i)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left">
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-white font-mono">{iss.title}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase', SEV_BADGE[iss.severity] ?? SEV_BADGE.medium)}>
                    {iss.severity}
                  </span>
                  <LineRef lines={iss.lines} />
                </div>
              </div>
              <span className="text-[10px] text-gray-500 flex-shrink-0">{open ? 'Hide' : 'Reveal'}</span>
            </button>
            {open && (
              <div className="px-3.5 pb-3.5 pt-0 space-y-2.5">
                <div className="border-t border-border/40 pt-2.5">
                  <p className="text-[11px] text-gray-300 leading-relaxed">{iss.description}</p>
                </div>
                {iss.fix && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Fix</p>
                    <div className="bg-surface-3 border border-border rounded-lg p-3">
                      <p className="text-[11px] font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">{iss.fix}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DeepDivePane({ analysis, loading, error }: PaneProps) {
  const [open, setOpen] = useState<number | null>(null)
  if (loading || error || !analysis) return <AnalysisState loading={loading} error={error} />
  const items = analysis.deep_dive
  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <MessageSquare size={18} className="text-neutral-600" />
      <p className="text-[11.5px] text-gray-300">No deep-dive questions for this file</p>
    </div>
  )
  return (
    <div className="space-y-2 p-4">
      {items.map((item, i) => (
        <div key={i} className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2 transition-colors"
          >
            <MessageSquare size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />
            <span className="flex-1 text-[11.5px] text-gray-100 font-medium leading-snug">{item.q}</span>
            {open === i
              ? <ChevronUp   size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />
              : <ChevronDown size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />}
          </button>
          {open === i && (
            <div className="px-3.5 pb-3 pt-0">
              <p className="text-[11px] text-gray-400 leading-relaxed border-t border-border/40 pt-2.5">{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'code' | 'explain' | 'issues' | 'qa'

export default function ScriptBrowser() {
  const [selected,  setSelected]  = useState<string | null>(null)
  const [search,    setSearch]    = useState('')
  const [typeTab,   setTypeTab]   = useState<ScriptTypeId>('all')
  const [tab,       setTab]       = useState<Tab>('code')

  const { data: repoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const owner = repoData?.active?.owner ?? ''
  const repo  = repoData?.active?.repo  ?? ''
  const slug  = repoData?.active?.slug  ?? ''

  const { data: paths = [], isLoading, error } = useQuery({
    queryKey: ['repo-tree', owner, repo],
    queryFn: () => fetchTree(owner, repo),
    enabled: !!owner && !!repo,
    staleTime: 300_000,
  })

  const { data: content, isLoading: contentLoading } = useQuery({
    queryKey: ['file-content', owner, repo, selected],
    queryFn: () => fetchContent(owner, repo, selected!),
    enabled: !!selected && !!owner && !!repo,
    staleTime: 300_000,
  })

  // One analysis request per file, shared by Explain / Issues / Deep Dive.
  // Only fires once the user opens an analysis tab, so merely browsing code
  // costs nothing. Server-side it is cached by content hash, so revisiting a
  // file — or another user opening it — is instant.
  const analysisWanted = !!selected && tab !== 'code'
  const {
    data: analysis,
    isLoading: analysisLoading,
    error: analysisError,
  } = useQuery({
    queryKey: ['file-analysis', owner, repo, selected],
    queryFn: () => fetchAnalysis(owner, repo, selected!),
    enabled: analysisWanted && !!owner && !!repo,
    staleTime: Infinity,
    retry: false,
  })

  // Pre-generate Actions YAML analyses as soon as the file list lands, so those
  // panes are already populated when opened rather than generating on click.
  const yamlTargets = useMemo(
    () => paths.filter(p => {
      const l = p.toLowerCase()
      return l.startsWith('.github/') && (l.endsWith('.yml') || l.endsWith('.yaml'))
    }),
    [paths],
  )

  const { data: prewarm, refetch: refetchPrewarm } = useQuery({
    queryKey: ['prewarm-status', owner, repo],
    queryFn: () => fetchPrewarmStatus(owner, repo),
    enabled: !!owner && !!repo && yamlTargets.length > 0,
    // Poll while work is outstanding, then stop.
    refetchInterval: q => (q.state.data?.running ? 3000 : false),
  })

  // Pre-generation is explicit: each analysis is a billed API call, so switching
  // repos must never start spending on its own.
  const [starting, setStarting] = useState(false)
  const [prewarmError, setPrewarmError] = useState<string | null>(null)

  const { data: cachedPaths } = useQuery({
    queryKey: ['cached-paths', owner, repo, prewarm?.done, prewarm?.running],
    queryFn: () => fetchCachedPaths(owner, repo),
    enabled: !!owner && !!repo,
  })

  const pendingYaml = useMemo(
    () => yamlTargets.filter(p => !cachedPaths?.has(p)),
    [yamlTargets, cachedPaths],
  )

  async function handlePrewarm() {
    setStarting(true)
    setPrewarmError(null)
    try {
      await startPrewarm(owner, repo, yamlTargets)
      await refetchPrewarm()
    } catch (e) {
      setPrewarmError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const paneProps: PaneProps = {
    analysis,
    loading: analysisLoading && analysisWanted,
    error: (analysisError as Error) ?? null,
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const byType = typeTab === 'all' ? paths : paths.filter(p => typeFromPath(p) === typeTab)
    if (!q) return byType
    return byType.filter(p => p.toLowerCase().includes(q))
  }, [paths, search, typeTab])

  function selectFile(path: string) {
    setSelected(path)
    setTab('code')
  }

  function switchTypeTab(id: ScriptTypeId) {
    setTypeTab(id)
    const first = id === 'all' ? paths[0] : paths.find(p => typeFromPath(p) === id)
    if (first) { setSelected(first); setTab('code') }
  }

  const selectedFilename = selected?.split('/').pop() ?? ''
  const selectedDir      = selected?.includes('/') ? selected.slice(0, selected.lastIndexOf('/')) : ''
  const selectedLang     = selected ? langFromPath(selected) : ''
  const githubFileUrl    = selected ? `https://github.com/${slug}/blob/HEAD/${selected}` : ''

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'code',    label: 'Code',      icon: <Code2 size={11} /> },
    { id: 'explain', label: 'Explain',   icon: <BookOpen size={11} /> },
    { id: 'issues',  label: 'Issues',    icon: <Bug size={11} /> },
    { id: 'qa',      label: 'Deep Dive', icon: <MessageSquare size={11} /> },
  ]

  return (
    <div className="flex h-full min-h-0 bg-surface">

      {/* ── Left: script list ───────────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-surface-1">

        {/* Header */}
        <div className="px-3 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[12px] font-bold text-white">Scripts</p>
            {slug && (
              <a href={`https://github.com/${slug}`} target="_blank" rel="noreferrer"
                className="text-[10px] text-brand hover:underline font-mono flex items-center gap-0.5">
                GitHub <ExternalLink size={9} />
              </a>
            )}
          </div>
          <p className="text-[10px] text-gray-500 leading-snug">Browse · explain · review issues</p>
          <div className="relative mt-2.5">
            <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter scripts…"
              className="w-full bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-brand/40 transition-colors"
            />
          </div>
        </div>

        {/* Type filter tabs */}
        <div className="px-2 py-1.5 border-b border-border flex flex-wrap gap-1">
          {SCRIPT_TYPE_TABS.map(t => {
            const count = t.id === 'all' ? paths.length : paths.filter(p => typeFromPath(p) === t.id).length
            if (t.id !== 'all' && count === 0) return null
            return (
              <button
                key={t.id}
                onClick={() => switchTypeTab(t.id)}
                className={cn(
                  'flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded transition-colors',
                  t.id === typeTab
                    ? 'bg-brand/15 text-brand border border-brand/30'
                    : 'text-gray-400 hover:text-gray-300 border border-transparent hover:border-border',
                )}
              >
                {t.label}
                <span className={cn('text-[8px] font-mono', t.id === typeTab ? 'text-brand/70' : 'text-gray-400')}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Script list */}
        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={16} className="animate-spin text-neutral-500" />
            </div>
          )}
          {error && (
            <div className="px-3 py-6 flex flex-col items-center gap-2 text-center">
              <AlertCircle size={16} className="text-accent-red" />
              <p className="text-[11px] text-neutral-400">Could not load repo</p>
              <p className="text-[10px] text-neutral-600 font-mono">{(error as Error).message}</p>
            </div>
          )}
          {!isLoading && !error && paths.length === 0 && slug && (
            <p className="px-3 py-6 text-[11px] text-neutral-500 text-center">No CI/infra scripts found</p>
          )}
          {filtered.length === 0 && paths.length > 0 && (
            <p className="text-center text-[11px] text-gray-400 py-6">No scripts match</p>
          )}
          {filtered.map(path => {
            const isSelected = selected === path
            const lang       = langFromPath(path)
            const dir        = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
            return (
              <button
                key={path}
                onClick={() => selectFile(path)}
                className={cn(
                  'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                  isSelected && 'bg-brand/10 text-neutral-50',
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className={cn('text-[11.5px] font-semibold truncate', isSelected ? 'text-white' : 'text-gray-300')}>
                    {titleFromPath(path)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] text-gray-500 font-mono truncate max-w-[110px]">
                      {dir || 'root'}
                    </span>
                    <span className="text-gray-600">·</span>
                    <span className={cn('text-[9px] font-semibold', LANG_COLOR[lang] ?? 'text-neutral-400')}>
                      {lang}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-0.5 flex-shrink-0">
                  {cachedPaths?.has(path) && (
                    <span
                      title="Analysis ready — opens instantly"
                      className="w-1.5 h-1.5 rounded-full bg-brand/70"
                    />
                  )}
                  <span className="text-[9px] font-mono text-gray-400 bg-surface-3 px-1.5 py-0.5 rounded border border-border/60">
                    {LANG_DISPLAY[lang] ?? 'txt'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-2.5 border-t border-border space-y-1.5">
          {paths.length > 0 && (
            <p className="text-[9px] text-neutral-600 font-mono">{paths.length} scripts · {slug}</p>
          )}
          {/* Pre-generation is opt-in: each file is a billed API call, so this
              never runs on its own — not on load, not on repo switch. */}
          {prewarm?.running && prewarm.total > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Loader2 size={9} className="animate-spin text-brand flex-shrink-0" />
                <p className="text-[9px] text-gray-400 font-mono">
                  Pre-analysing {prewarm.done}/{prewarm.total}
                </p>
              </div>
              <div className="h-0.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-500"
                  style={{ width: `${Math.round((prewarm.done / prewarm.total) * 100)}%` }}
                />
              </div>
            </div>
          ) : yamlTargets.length > 0 && pendingYaml.length > 0 ? (
            <button
              onClick={handlePrewarm}
              disabled={starting}
              title={`Analyses ${pendingYaml.length} Actions YAML file${pendingYaml.length === 1 ? '' : 's'} up front — one API call each. Other file types stay on demand.`}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg',
                'text-[10px] font-semibold border transition-colors',
                starting
                  ? 'text-gray-500 border-border bg-surface-2 cursor-wait'
                  : 'text-brand border-brand/30 bg-brand/10 hover:bg-brand/15',
              )}
            >
              {starting
                ? <Loader2 size={9} className="animate-spin" />
                : <BookOpen size={9} />}
              Pre-analyse {pendingYaml.length} workflow{pendingYaml.length === 1 ? '' : 's'}
            </button>
          ) : yamlTargets.length > 0 ? (
            <p className="text-[9px] text-gray-500 font-mono">
              {yamlTargets.length} workflows ready
            </p>
          ) : null}
          {prewarm && !prewarm.running && prewarm.failed > 0 && (
            <p className="text-[9px] text-accent-yellow font-mono">
              {prewarm.failed} file{prewarm.failed === 1 ? '' : 's'} could not be pre-analysed
            </p>
          )}
          {prewarmError && (
            <p className="text-[9px] text-accent-red font-mono">{prewarmError}</p>
          )}
        </div>
      </div>

      {/* ── Right: content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <FileCode size={28} className="text-neutral-600" />
            <p className="text-[13px] font-semibold text-neutral-400">Select a script to view</p>
            <p className="text-[11px] text-neutral-600 max-w-xs">
              {slug
                ? `${paths.length} CI/infra scripts found in ${slug}`
                : 'No repo active. Select a repo from the sidebar.'}
            </p>
          </div>
        ) : (
          <>
            {/* Script header */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[13px] font-bold font-mono', LANG_COLOR[selectedLang] ?? 'text-white')}>
                    {selectedFilename}
                  </span>
                  <span className="text-[9px] font-mono text-gray-500 bg-surface-3 px-1.5 py-0.5 rounded border border-border">
                    {selectedLang}
                  </span>
                  {selectedDir && (
                    <span className="text-[9px] text-gray-500 bg-surface-3 px-1.5 py-0.5 rounded border border-border">
                      {selectedDir}
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-gray-500 mt-0.5 leading-snug font-mono truncate">{selected}</p>
              </div>
              <a href={githubFileUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[10px] text-brand hover:underline font-mono flex-shrink-0">
                View on GitHub <ExternalLink size={9} />
              </a>
            </div>

            {/* Tab bar — exact same style as ScriptLibrary */}
            <div className={cn(
              'flex-shrink-0 flex items-center gap-1 p-1 m-2 rounded-xl border',
              'bg-gradient-to-br from-surface-2 to-surface-2/60',
              'border-border/60',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_3px_rgba(0,0,0,0.25)]',
            )}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 border',
                    t.id === tab
                      ? ['bg-surface-3 text-neutral-50 border-border/80']
                      : 'text-neutral-500 border-transparent hover:text-neutral-200 hover:bg-surface-3/30',
                  )}
                >
                  <span className={cn('flex-shrink-0', t.id === tab && 'text-brand')}>{t.icon}</span>
                  {t.label}
                  {t.id === tab && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-brand/60" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {tab === 'code'    && <CodePane      content={content} loading={contentLoading} />}
              {tab === 'explain' && <ExplainPane   {...paneProps} />}
              {tab === 'issues'  && <IssuesPane    {...paneProps} />}
              {tab === 'qa'      && <DeepDivePane  {...paneProps} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
