import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  XCircle, Bug, RefreshCw, ExternalLink,
  Clock, Activity, AlertCircle, ChevronDown, ChevronUp,
  ScrollText, Search, Trash2, Download,
  Play, CheckCircle2, Zap, Copy, Check,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getAllRuns, getIssues, getIssueStats, getLogs, ingestLogs, purgeLogs } from '../lib/api'
import type { LogEntry } from '../lib/types'
import StatusBadge from '../components/StatusBadge'
import clsx from 'clsx'
import { useRepoSlug } from '../lib/hooks'

const BASE = 'http://localhost:8000'
const req = (path: string) => fetch(`${BASE}${path}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })

type MainMode = 'diagnostics' | 'logs'

// ── CI Failures ───────────────────────────────────────────────────────────────

function CIFailuresPanel() {
  const slug = useRepoSlug()
  const [expanded, setExpanded] = useState<number | null>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: [slug, 'monitor-ci-failures'],
    queryFn: () => getAllRuns({ per_page: 30, page: 1 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const failures = (data?.workflow_runs ?? []).filter(
    (r: any) => r.conclusion === 'failure' || r.conclusion === 'timed_out',
  ).slice(0, 15)

  if (isLoading) return <p className="text-[11px] text-gray-500 py-4 text-center">Loading…</p>
  if (isError)   return <p className="text-[11px] text-accent-red py-4 text-center">Failed to load CI failures</p>
  if (!failures.length) return <p className="text-[11px] text-gray-500 py-4 text-center">No recent CI failures</p>

  return (
    <div className="space-y-1.5">
      {failures.map((r: any) => {
        const isOpen = expanded === r.id
        return (
          <div key={r.id} className="bg-surface-2 border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-3 transition-colors"
              onClick={() => setExpanded(isOpen ? null : r.id)}
              aria-expanded={isOpen}
            >
              <XCircle size={12} className="text-accent-red flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white truncate font-medium">{r.display_title || r.head_branch}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                  <span className="font-mono">{r.head_branch}</span>
                  <span>·</span>
                  <span>{r.name}</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Clock size={8} />
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={r.conclusion} size="sm" />
                <a href={r.html_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                  <ExternalLink size={11} className="text-gray-400 hover:text-neutral-300" />
                </a>
                {isOpen ? <ChevronUp size={11} className="text-gray-500" /> : <ChevronDown size={11} className="text-gray-500" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border px-3 py-2 text-[10px] text-gray-500">
                <span className="font-mono">#{r.run_number}</span>
                <span className="mx-2">·</span>
                <span>sha: {r.head_sha?.slice(0, 7)}</span>
                {r.duration_label && r.duration_label !== '—' && (
                  <span className="ml-2">· {r.duration_label}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Nightly Job Failures ──────────────────────────────────────────────────────

function NightlyFailuresPanel() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'failure-analysis-monitor'],
    queryFn: () => req('/analytics/failure-analysis?runs=20'),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })
  const jobs: any[] = (data?.ranked ?? []).filter((j: any) => j.failure_rate > 0).slice(0, 12)

  if (isLoading) return <p className="text-[11px] text-gray-500 py-4 text-center">Loading…</p>
  if (!jobs.length) return <p className="text-[11px] text-gray-500 py-4 text-center">No nightly job failures</p>

  return (
    <div className="space-y-1.5">
      {jobs.map((j) => (
        <div key={j.name} className="bg-surface-2 border border-border rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-white truncate font-medium flex-1">{j.name}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {j.consecutive_failures > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25">
                  {j.consecutive_failures} streak
                </span>
              )}
              <span className={clsx(
                'text-[11px] font-semibold tabular-nums',
                j.failure_rate >= 50 ? 'text-accent-red' : j.failure_rate >= 20 ? 'text-neutral-300' : 'text-neutral-400',
              )}>
                {j.failure_rate}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[9px] text-gray-400">
            <span>{j.failed} / {j.total} failed</span>
            {j.trend === 'worsening' && <span className="text-accent-red">↑ worsening</span>}
            {j.trend === 'improving' && <span className="text-brand">↓ improving</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Error Patterns ────────────────────────────────────────────────────────────

function ErrorPatternsPanel() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'error-patterns'],
    queryFn: () => req('/analytics/error-patterns'),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })
  const patterns: any[] = data?.patterns ?? []

  if (isLoading) return <p className="text-[11px] text-gray-500 py-4 text-center">Loading…</p>
  if (!patterns.length) return <p className="text-[11px] text-gray-500 py-4 text-center">No error patterns recorded</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border text-[9px] uppercase tracking-wider text-gray-500">
            <th className="py-1.5 pr-3 font-medium">Pattern</th>
            <th className="py-1.5 pr-3 font-medium text-right">Count</th>
            <th className="py-1.5 pr-3 font-medium">Sources</th>
            <th className="py-1.5 font-medium whitespace-nowrap">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {patterns.slice(0, 12).map((p, i) => (
            <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors align-top">
              <td className="py-2 pr-3 text-[10px] font-mono text-red-400 break-all leading-4 max-w-[420px]">{p.pattern}</td>
              <td className="py-2 pr-3 text-[11px] font-semibold tabular-nums text-neutral-300 text-right whitespace-nowrap">×{p.count}</td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-1">
                  {(p.sources ?? []).slice(0, 3).map((s: string) => (
                    <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-gray-500 font-mono">{s}</span>
                  ))}
                </div>
              </td>
              <td className="py-2 text-[9px] text-gray-400 whitespace-nowrap">
                {p.last_seen ? formatDistanceToNow(new Date(p.last_seen), { addSuffix: true }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Bug Issues ────────────────────────────────────────────────────────────────

function BugIssuesPanel() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'monitor-bugs'],
    queryFn: () => getIssues({ state: 'open', labels: 'bug', per_page: 20 }),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })
  const issues: any[] = Array.isArray(data) ? data : ((data as any)?.issues ?? [])

  if (isLoading) return <p className="text-[11px] text-gray-500 py-4 text-center">Loading…</p>
  if (!issues.length) return <p className="text-[11px] text-gray-500 py-4 text-center">No open bug issues</p>

  return (
    <div className="space-y-1.5">
      {issues.slice(0, 15).map((issue: any) => (
        <div key={issue.number} className="bg-surface-2 border border-border rounded-lg px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white font-medium truncate">{issue.title}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                <span className="font-mono">#{issue.number}</span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <img src={issue.user?.avatar_url} className="w-3 h-3 rounded-full" alt="" />
                  {issue.user?.login}
                </span>
                <span>·</span>
                <span>{formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}</span>
              </div>
            </div>
            <a href={issue.html_url} target="_blank" rel="noreferrer">
              <ExternalLink size={11} className="text-gray-400 hover:text-neutral-300 flex-shrink-0" />
            </a>
          </div>
          {issue.labels?.filter((l: any) => l.name !== 'bug').slice(0, 3).map((l: any) => (
            <span
              key={l.name}
              className="inline-block mr-1 mt-1 text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: `#${l.color}22`, color: `#${l.color}` }}
            >
              {l.name}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Log Monitor sub-components ────────────────────────────────────────────────

type TimeRange = 'all' | '1h' | '6h' | '24h' | '7d'
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; ms: number }[] = [
  { value: 'all', label: 'All time', ms: 0 },
  { value: '1h', label: 'Last 1h', ms: 3_600_000 },
  { value: '6h', label: 'Last 6h', ms: 21_600_000 },
  { value: '24h', label: 'Last 24h', ms: 86_400_000 },
  { value: '7d', label: 'Last 7d', ms: 604_800_000 },
]

const LEVEL_BG: Record<string, string> = {
  ERROR:   'bg-accent-red/[.05] ring-1 ring-accent-red/15',
  WARNING: 'bg-amber-500/[.05] ring-1 ring-amber-500/15',
  INFO:    '',
}
const LEVEL_BADGE: Record<string, string> = {
  ERROR: 'bg-accent-red/10 text-accent-red ring-1 ring-accent-red/25',
  WARNING: 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/25',
  INFO: 'bg-surface-3 text-gray-500',
}

const JOB_PALETTE = [
  'text-accent-blue', 'text-accent-purple', 'text-accent-orange',
  'text-accent-green', 'text-cyan-400', 'text-pink-400', 'text-indigo-400',
  'text-teal-400', 'text-rose-400', 'text-lime-400',
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded hover:bg-surface-3 text-gray-400 hover:text-gray-300 transition-opacity"
    >
      {copied
        ? <Check size={9} className="text-accent-green" />
        : <Copy size={9} />}
    </button>
  )
}

function LogRow({
  entry, jobColor, wrap, showJob,
}: { entry: LogEntry; jobColor: string; wrap: boolean; showJob: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = entry.message.length > 300
  const msg = isLong && !expanded ? entry.message.slice(0, 300) + '…' : entry.message

  return (
    <tr
      className={clsx(
        'group border-b border-border/20 hover:bg-surface-2/50 transition-colors',
        LEVEL_BG[entry.level] ?? '',
      )}
    >
      <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap text-[10px] font-mono align-top pt-2">
        {entry.timestamp?.slice(0, 19).replace('T', ' ')}
      </td>
      <td className="px-2 py-1.5 align-top pt-2">
        <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded', LEVEL_BADGE[entry.level])}>
          {entry.level}
        </span>
      </td>
      {showJob && (
        <td className="px-2 py-1.5 w-44 max-w-[11rem] align-top pt-2">
          <span className={clsx('text-[10px] font-medium truncate block', jobColor)} title={entry.meta?.job}>
            {entry.meta?.job || '—'}
          </span>
        </td>
      )}
      <td className="px-2 py-1.5 text-gray-300 text-[10px] font-mono leading-relaxed align-top min-w-0 max-w-0">
        <div className="flex items-start gap-2">
          <span className={clsx('flex-1 min-w-0', wrap ? 'break-all' : 'break-words')}>
            {msg}
          </span>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-shrink-0 text-[9px] text-accent-blue hover:underline"
            >
              {expanded ? 'less' : 'more'}
            </button>
          )}
          <CopyButton text={entry.message} />
        </div>
      </td>
    </tr>
  )
}

function JobItem({
  label, count, errors, warns, color, selected, onClick,
}: {
  label: string; count: number; errors: number; warns: number;
  color: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-2 rounded-lg transition-colors',
        selected ? 'bg-surface-3 border border-border/60' : 'hover:bg-surface-2',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={clsx('text-[10px] font-medium truncate', selected ? 'text-white' : 'text-gray-300', color !== 'text-gray-400' && !selected && color)}>
          {label}
        </span>
        <span className="text-[9px] text-gray-400 flex-shrink-0 tabular-nums">{count}</span>
      </div>
      {(errors > 0 || warns > 0) && (
        <div className="flex items-center gap-2 mt-0.5">
          {errors > 0 && <span className="text-[9px] text-red-400">{errors}E</span>}
          {warns > 0 && <span className="text-[9px] text-yellow-400">{warns}W</span>}
        </div>
      )}
      <div className="mt-1.5 h-0.5 rounded-full bg-surface-3 overflow-hidden">
        {errors > 0 && (
          <div
            className="h-full bg-red-500 rounded-full"
            style={{ width: `${Math.min(100, (errors / count) * 100)}%` }}
          />
        )}
      </div>
    </button>
  )
}

function RunIngestCard({ run, onIngested }: { run: any; onIngested: (id: number) => void }) {
  const { mutate: ingest, isPending, isSuccess } = useMutation({
    mutationFn: () => ingestLogs(run.id),
    onSuccess: () => onIngested(run.id),
  })
  const isInProgress = run.status === 'in_progress' || run.status === 'queued'
  const isFailed = run.conclusion === 'failure' || run.conclusion === 'timed_out'

  const statusIcon = isFailed
    ? <XCircle size={11} className="text-red-400 flex-shrink-0" />
    : isInProgress
    ? <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse flex-shrink-0" />
    : run.conclusion === 'success'
    ? <CheckCircle2 size={11} className="text-accent-green flex-shrink-0" />
    : <Clock size={11} className="text-gray-500 flex-shrink-0" />

  return (
    <div className={clsx(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors',
      isFailed ? 'border-accent-red/25 bg-accent-red/[.04]' : 'border-border bg-surface-2',
    )}>
      {statusIcon}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">{run.display_title || run.head_branch}</p>
        <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-0.5">
          <span className="font-mono text-accent-blue">{run.head_branch}</span>
          <span>#{run.run_number}</span>
          <span>{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</span>
        </div>
      </div>
      <button
        onClick={() => ingest()}
        disabled={isPending || isSuccess || isInProgress}
        className={clsx(
          'flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium transition-colors flex-shrink-0',
          isSuccess
            ? 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25'
            : 'bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 disabled:opacity-40',
        )}
      >
        {isSuccess ? '✓ Done' : isPending ? 'Ingesting…' : 'Ingest logs'}
      </button>
    </div>
  )
}

function EmptyState({ onIngested }: { onIngested: (id: number) => void }) {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'build-runs-for-logs'],
    queryFn: () => getAllRuns({ per_page: 8, page: 1 }),
    staleTime: 60_000,
  })
  const runs: any[] = (data?.workflow_runs ?? []).slice(0, 8)

  return (
    <div className="flex flex-col items-center justify-start pt-8 px-4 space-y-6">
      <div className="text-center space-y-2">
        <ScrollText size={40} className="mx-auto text-gray-400" />
        <p className="text-gray-400 font-medium">No logs ingested yet</p>
        <p className="text-gray-400 text-sm max-w-md">
          The backend auto-ingests completed GHA runs every 5 minutes.
          To pull a specific run immediately, click below or enter a run ID above.
        </p>
      </div>
      <div className="w-full max-w-2xl space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={12} className="text-accent-blue" />
          <p className="text-xs text-gray-400 font-medium">Recent runs — click to ingest</p>
        </div>
        {isLoading && <p className="text-xs text-gray-400 text-center py-4">Loading recent runs…</p>}
        {runs.map((r) => (
          <RunIngestCard key={r.id} run={r} onIngested={onIngested} />
        ))}
      </div>
      <p className="text-[10px] text-gray-400">Ingested logs are stored in local SQLite and persist across sessions</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ErrorMonitor() {
  const slug = useRepoSlug()
  const [mode, setMode] = useState<MainMode>('diagnostics')
  const qc = useQueryClient()

  // ── Diagnostics tab state ──
  const { data: issueStats } = useQuery({
    queryKey: [slug, 'issue-stats-monitor'],
    queryFn: getIssueStats,
    staleTime: 300_000,
  })
  const { data: ciData } = useQuery({
    queryKey: [slug, 'monitor-ci-failures'],
    queryFn: () => getAllRuns({ per_page: 30, page: 1 }),
    staleTime: 30_000,
  })
  const { data: epData } = useQuery({
    queryKey: [slug, 'error-patterns'],
    queryFn: () => req('/analytics/error-patterns'),
    staleTime: 120_000,
  })

  const failureCount = (ciData?.workflow_runs ?? []).filter(
    (r: any) => r.conclusion === 'failure' || r.conclusion === 'timed_out',
  ).length
  const bugCount = issueStats?.by_label?.bug
  const errorCount = epData?.total_errors ?? 0

  function refreshDiagnostics() {
    qc.invalidateQueries({ queryKey: [slug, 'monitor-ci-failures'] })
    qc.invalidateQueries({ queryKey: [slug, 'monitor-bugs'] })
    qc.invalidateQueries({ queryKey: [slug, 'error-patterns'] })
    qc.invalidateQueries({ queryKey: [slug, 'failure-analysis-monitor'] })
    qc.invalidateQueries({ queryKey: [slug, 'issue-stats-monitor'] })
  }

  // ── Logs tab state ──
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [selectedRunId, setSelectedRunId] = useState('')
  const [selectedJob, setSelectedJob] = useState('')
  const [ingestId, setIngestId] = useState('')
  const [wrap, setWrap] = useState(false)

  const logParams: Record<string, string> = {}
  if (level) logParams.level = level
  if (search) logParams.search = search

  const { data: logsData = [], isLoading: logsLoading, isError: logsError, refetch: refetchLogs } = useQuery({
    queryKey: [slug, 'logs', logParams],
    queryFn: () => getLogs({ ...logParams, limit: 2000 }),
    refetchInterval: 15_000,
  })

  const allEntries: LogEntry[] = Array.isArray(logsData) ? logsData : []

  const timeFiltered = useMemo(() => {
    const opt = TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)
    if (!opt || opt.ms === 0) return allEntries
    const cutoff = Date.now() - opt.ms
    return allEntries.filter(
      (e) => !e.timestamp || new Date(e.timestamp).getTime() >= cutoff,
    )
  }, [allEntries, timeRange])

  const uniqueRuns = useMemo(() => {
    const map = new Map<string, { count: number; errors: number; jobs: Set<string> }>()
    timeFiltered.forEach((e) => {
      if (!map.has(e.run_id)) map.set(e.run_id, { count: 0, errors: 0, jobs: new Set() })
      const m = map.get(e.run_id)!
      m.count++
      if (e.level === 'ERROR') m.errors++
      if (e.meta?.job) m.jobs.add(e.meta.job)
    })
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, s]) => ({ id, count: s.count, errors: s.errors, jobs: s.jobs.size }))
  }, [timeFiltered])

  const runFiltered = useMemo(
    () => (selectedRunId ? timeFiltered.filter((e) => e.run_id === selectedRunId) : timeFiltered),
    [timeFiltered, selectedRunId],
  )

  const jobStats = useMemo(() => {
    const map = new Map<string, { count: number; errors: number; warns: number }>()
    runFiltered.forEach((e) => {
      const j = e.meta?.job ?? ''
      if (!map.has(j)) map.set(j, { count: 0, errors: 0, warns: 0 })
      const m = map.get(j)!
      m.count++
      if (e.level === 'ERROR') m.errors++
      if (e.level === 'WARNING') m.warns++
    })
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([job, stats], i) => ({
        job,
        ...stats,
        color: JOB_PALETTE[i % JOB_PALETTE.length],
      }))
  }, [runFiltered])

  const jobColorMap = useMemo(() => {
    const m = new Map<string, string>()
    jobStats.forEach(({ job, color }) => m.set(job, color))
    return m
  }, [jobStats])

  const entries = useMemo(
    () => (selectedJob ? runFiltered.filter((e) => (e.meta?.job ?? '') === selectedJob) : runFiltered),
    [runFiltered, selectedJob],
  )

  const logErrorCount = entries.filter((e) => e.level === 'ERROR').length
  const logWarnCount = entries.filter((e) => e.level === 'WARNING').length

  const { mutate: ingest, isPending: ingesting } = useMutation({
    mutationFn: () => ingestLogs(Number(ingestId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [slug, 'logs'] })
      setIngestId('')
    },
  })

  const { mutate: purge } = useMutation({
    mutationFn: () => purgeLogs(30),
    onSuccess: () => qc.invalidateQueries({ queryKey: [slug, 'logs'] }),
  })

  const download = () => {
    const text = entries
      .map((e) => `[${e.timestamp}] [${e.level}] [${e.meta?.job ?? ''}] ${e.message}`)
      .join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `logs-${selectedRunId || 'all'}-${selectedJob || 'all'}.txt`
    a.click()
  }

  const hasLogs = allEntries.length > 0
  const showJobCol = selectedJob === ''

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="bg-surface-2 rounded-xl p-1 flex items-center gap-1 w-fit">
        <button
          onClick={() => setMode('diagnostics')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
            mode === 'diagnostics' ? 'bg-surface-3 text-white' : 'text-gray-400 hover:text-gray-200',
          )}
        >
          <AlertCircle size={12} />
          Diagnostics
        </button>
        <button
          onClick={() => setMode('logs')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
            mode === 'logs' ? 'bg-surface-3 text-white' : 'text-gray-400 hover:text-gray-200',
          )}
        >
          <ScrollText size={12} />
          Logs
        </button>
      </div>

      {/* Diagnostics tab */}
      {mode === 'diagnostics' && (
        <>
          {/* Refresh */}
          <div className="flex justify-end">
            <button onClick={refreshDiagnostics} className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
              <RefreshCw size={13} />
            </button>
          </div>

          {/* All 4 panels in a 2×2 grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* CI Failures */}
            <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col">
              <div className="section-head">
                <XCircle size={13} className="text-accent-red flex-shrink-0" />
                CI Failures
                {failureCount > 0 && (
                  <span className="ml-auto text-[10px] font-semibold tabular-nums text-accent-red bg-red-500/10 px-1.5 py-0.5 rounded ring-1 ring-red-500/20">
                    {failureCount}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5 pr-0.5">
                <CIFailuresPanel />
              </div>
            </div>

            {/* Bug Issues */}
            <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col">
              <div className="section-head">
                <Bug size={13} className="text-accent-red flex-shrink-0" />
                Bug Issues
                {bugCount !== '—' && bugCount > 0 && (
                  <span className="ml-auto text-[10px] font-semibold tabular-nums text-accent-red bg-red-500/10 px-1.5 py-0.5 rounded ring-1 ring-red-500/20">
                    {bugCount}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5 pr-0.5">
                <BugIssuesPanel />
              </div>
            </div>

            {/* Nightly Job Failures */}
            <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col">
              <div className="section-head">
                <Activity size={13} className="text-neutral-400 flex-shrink-0" />
                Nightly Job Failures
              </div>
              <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5 pr-0.5">
                <NightlyFailuresPanel />
              </div>
            </div>

            {/* Error Patterns */}
            <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col">
              <div className="section-head">
                <AlertCircle size={13} className="text-neutral-400 flex-shrink-0" />
                Error Patterns
                {errorCount > 0 && (
                  <span className="ml-auto text-[10px] font-semibold tabular-nums text-neutral-400 bg-surface-3 px-1.5 py-0.5 rounded">
                    {errorCount} total
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5 pr-0.5">
                <ErrorPatternsPanel />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Logs tab */}
      {mode === 'logs' && (
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[9px] text-gray-400 bg-surface-2 px-2 py-0.5 rounded-full" title="Auto-ingests completed GHA runs every 5 minutes">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                auto
              </span>
              {hasLogs && (
                <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
                  {entries.length.toLocaleString()} / {allEntries.length.toLocaleString()} entries
                </span>
              )}
              {logErrorCount > 0 && (
                <span className="text-[10px] text-accent-red bg-accent-red/10 px-2 py-0.5 rounded-full">
                  {logErrorCount} errors
                </span>
              )}
              {logWarnCount > 0 && (
                <span className="text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  {logWarnCount} warnings
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWrap(!wrap)}
                className={clsx(
                  'px-2 py-1 rounded text-[10px] transition-colors',
                  wrap ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300',
                )}
              >
                wrap
              </button>
              {hasLogs && (
                <button onClick={download} className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
                  <Download size={13} />
                </button>
              )}
              <button onClick={() => purge()} className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
              <button onClick={() => refetchLogs()} className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="bg-surface-1 border border-border rounded-xl p-3 flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs…"
                className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-44 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue"
              />
            </div>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none"
            >
              {TIME_RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={selectedRunId}
              onChange={(e) => { setSelectedRunId(e.target.value); setSelectedJob('') }}
              className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none max-w-[18rem]"
            >
              <option value="">All runs ({uniqueRuns.length})</option>
              {uniqueRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  Run {r.id} · {r.count} lines · {r.jobs} jobs{r.errors ? ` · ${r.errors}E` : ''}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              {(['', 'ERROR', 'WARNING', 'INFO'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[9px] font-medium transition-colors',
                    level === l ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  {l || 'All'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <input
                value={ingestId}
                onChange={(e) => setIngestId(e.target.value)}
                placeholder="GHA run ID"
                className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[10px] w-28 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue"
              />
              <button
                onClick={() => ingestId && ingest()}
                disabled={ingesting || !ingestId}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] bg-accent-blue text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
              >
                <Play size={9} />
                {ingesting ? 'Ingesting…' : 'Ingest'}
              </button>
            </div>
          </div>

          {/* Main content */}
          {logsLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm">Loading logs…</div>
          ) : logsError ? (
            <div className="flex items-center justify-center py-16 text-[12px] text-gray-500">
              Failed to load logs — <button onClick={() => refetchLogs()} className="text-accent-blue hover:underline ml-1">retry</button>
            </div>
          ) : !hasLogs ? (
            <div className="flex-1 bg-surface-1 border border-border rounded-xl overflow-y-auto">
              <EmptyState onIngested={(id) => { qc.invalidateQueries({ queryKey: [slug, 'logs'] }); setSelectedRunId(String(id)) }} />
            </div>
          ) : (
            <div className="flex gap-3 flex-1" style={{ minHeight: '500px' }}>
              <div className="w-52 flex-shrink-0 bg-surface-1 border border-border rounded-xl p-2 overflow-y-auto space-y-0.5">
                <p className="text-xs text-gray-500 font-semibold px-2 py-1.5">
                  {selectedRunId ? `Run ${selectedRunId}` : 'All Runs'} · Jobs
                </p>
                <JobItem
                  label="All jobs"
                  count={runFiltered.length}
                  errors={runFiltered.filter((e) => e.level === 'ERROR').length}
                  warns={runFiltered.filter((e) => e.level === 'WARNING').length}
                  color="text-gray-400"
                  selected={selectedJob === ''}
                  onClick={() => setSelectedJob('')}
                />
                {jobStats.map(({ job, count, errors, warns, color }) => (
                  <JobItem
                    key={job}
                    label={job || 'unknown'}
                    count={count}
                    errors={errors}
                    warns={warns}
                    color={color}
                    selected={selectedJob === job}
                    onClick={() => setSelectedJob(job)}
                  />
                ))}
              </div>
              <div className="flex-1 bg-surface-1 border border-border rounded-xl overflow-hidden flex flex-col min-w-0">
                <div className="px-3 py-2 border-b border-border bg-surface-2/30 flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] font-medium text-gray-300">
                    {selectedJob
                      ? <span className={clsx(jobColorMap.get(selectedJob))}>{selectedJob}</span>
                      : <span className="text-gray-400">All jobs</span>}
                  </span>
                  <span className="text-[10px] text-gray-400">{entries.length} lines</span>
                  {logErrorCount > 0 && (
                    <span className="text-[10px] text-accent-red bg-accent-red/10 px-1.5 py-0.5 rounded">{logErrorCount} errors</span>
                  )}
                  {logWarnCount > 0 && (
                    <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">{logWarnCount} warnings</span>
                  )}
                  <div className="ml-auto flex items-center gap-2 text-[9px] text-gray-400">
                    <span>timestamp · level{showJobCol ? ' · job' : ''} · message</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto font-mono">
                  {entries.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">No entries match the current filters.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <colgroup>
                        <col style={{ width: '9rem' }} />
                        <col style={{ width: '5rem' }} />
                        {showJobCol && <col style={{ width: '11rem' }} />}
                        <col />
                      </colgroup>
                      <tbody>
                        {entries.map((e) => (
                          <LogRow
                            key={e.id}
                            entry={e}
                            jobColor={jobColorMap.get(e.meta?.job ?? '') ?? 'text-gray-500'}
                            wrap={wrap}
                            showJob={showJobCol}
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
