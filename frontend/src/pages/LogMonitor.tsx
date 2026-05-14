import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ScrollText, Search, Trash2, Download, RefreshCw,
  Play, XCircle, CheckCircle2, Clock, Zap, Copy, Check,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getLogs, ingestLogs, purgeLogs, getAllRuns } from '../lib/api'
import type { LogEntry } from '../lib/types'
import clsx from 'clsx'

type TimeRange = 'all' | '1h' | '6h' | '24h' | '7d'
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; ms: number }[] = [
  { value: 'all', label: 'All time', ms: 0 },
  { value: '1h', label: 'Last 1h', ms: 3_600_000 },
  { value: '6h', label: 'Last 6h', ms: 21_600_000 },
  { value: '24h', label: 'Last 24h', ms: 86_400_000 },
  { value: '7d', label: 'Last 7d', ms: 604_800_000 },
]

const LEVEL_BG: Record<string, string> = {
  ERROR: 'border-l-2 border-accent-red/40 bg-accent-red/[.04]',
  WARNING: 'border-l-2 border-amber-500/40 bg-amber-500/[.04]',
  INFO: '',
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

// ── Copy button ───────────────────────────────────────────────────────────────

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
      className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded hover:bg-surface-3 text-gray-600 hover:text-gray-300 transition-opacity"
    >
      {copied
        ? <Check size={9} className="text-accent-green" />
        : <Copy size={9} />}
    </button>
  )
}

// ── Log row ───────────────────────────────────────────────────────────────────

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
      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap text-[10px] font-mono align-top pt-2">
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

// ── Job sidebar item ──────────────────────────────────────────────────────────

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
        <span className="text-[9px] text-gray-600 flex-shrink-0 tabular-nums">{count}</span>
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

// ── Quick-ingest card ─────────────────────────────────────────────────────────

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
  const { data, isLoading } = useQuery({
    queryKey: ['build-runs-for-logs'],
    queryFn: () => getAllRuns({ per_page: 8, page: 1 }),
    staleTime: 60_000,
  })
  const runs: any[] = (data?.workflow_runs ?? []).slice(0, 8)

  return (
    <div className="flex flex-col items-center justify-start pt-8 px-4 space-y-6">
      <div className="text-center space-y-2">
        <ScrollText size={40} className="mx-auto text-gray-700" />
        <p className="text-gray-400 font-medium">No logs ingested yet</p>
        <p className="text-gray-600 text-sm max-w-md">
          The backend auto-ingests completed GHA runs every 5 minutes.
          To pull a specific run immediately, click below or enter a run ID above.
        </p>
      </div>
      <div className="w-full max-w-2xl space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={12} className="text-accent-blue" />
          <p className="text-xs text-gray-400 font-medium">Recent runs — click to ingest</p>
        </div>
        {isLoading && <p className="text-xs text-gray-600 text-center py-4">Loading recent runs…</p>}
        {runs.map((r) => (
          <RunIngestCard key={r.id} run={r} onIngested={onIngested} />
        ))}
      </div>
      <p className="text-[10px] text-gray-700">Ingested logs are stored in local SQLite and persist across sessions</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LogMonitor() {
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [selectedRunId, setSelectedRunId] = useState('')
  const [selectedJob, setSelectedJob] = useState('')
  const [ingestId, setIngestId] = useState('')
  const [wrap, setWrap] = useState(false)
  const qc = useQueryClient()

  // Only level + search go to the server; run_id and job are client-side
  // so we can derive the full list of runs/jobs from the returned data.
  const params: Record<string, string> = {}
  if (level) params.level = level
  if (search) params.search = search

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['logs', params],
    queryFn: () => getLogs({ ...params, limit: 2000 }),
    refetchInterval: 15_000,
  })

  const allEntries: LogEntry[] = Array.isArray(data) ? data : []

  // Time filter
  const timeFiltered = useMemo(() => {
    const opt = TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)
    if (!opt || opt.ms === 0) return allEntries
    const cutoff = Date.now() - opt.ms
    return allEntries.filter(
      (e) => !e.timestamp || new Date(e.timestamp).getTime() >= cutoff,
    )
  }, [allEntries, timeRange])

  // Unique run IDs with stats
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

  // Entries for selected run
  const runFiltered = useMemo(
    () => (selectedRunId ? timeFiltered.filter((e) => e.run_id === selectedRunId) : timeFiltered),
    [timeFiltered, selectedRunId],
  )

  // Job stats for sidebar
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

  // Final entries (job filter)
  const entries = useMemo(
    () => (selectedJob ? runFiltered.filter((e) => (e.meta?.job ?? '') === selectedJob) : runFiltered),
    [runFiltered, selectedJob],
  )

  const errorCount = entries.filter((e) => e.level === 'ERROR').length
  const warnCount = entries.filter((e) => e.level === 'WARNING').length

  const { mutate: ingest, isPending: ingesting } = useMutation({
    mutationFn: () => ingestLogs(Number(ingestId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logs'] })
      setIngestId('')
    },
  })

  const { mutate: purge } = useMutation({
    mutationFn: () => purgeLogs(30),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logs'] }),
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
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[9px] text-gray-600 bg-surface-2 px-2 py-0.5 rounded-full" title="Auto-ingests completed GHA runs every 5 minutes">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            auto
          </span>
          {hasLogs && (
            <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
              {entries.length.toLocaleString()} / {allEntries.length.toLocaleString()} entries
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-[10px] text-accent-red bg-accent-red/10 px-2 py-0.5 rounded-full">
              {errorCount} errors
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
              {warnCount} warnings
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
            title="Toggle word wrap"
          >
            wrap
          </button>
          {hasLogs && (
            <button
              onClick={download}
              className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors"
              title="Download current view"
            >
              <Download size={13} />
            </button>
          )}
          <button
            onClick={() => purge()}
            className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-red-400 transition-colors"
            title="Purge logs older than 30 days"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors"
          >
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
            className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-44 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue"
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

        {/* Run selector */}
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

        {/* Level pills */}
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

        {/* Ingest */}
        <div className="flex items-center gap-1.5 ml-auto">
          <input
            value={ingestId}
            onChange={(e) => setIngestId(e.target.value)}
            placeholder="GHA run ID"
            className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[10px] w-28 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue"
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
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
          Loading logs…
        </div>
      ) : !hasLogs ? (
        <div className="flex-1 bg-surface-1 border border-border rounded-xl overflow-y-auto">
          <EmptyState
            onIngested={(id) => {
              qc.invalidateQueries({ queryKey: ['logs'] })
              setSelectedRunId(String(id))
            }}
          />
        </div>
      ) : (
        <div className="flex gap-3 flex-1" style={{ minHeight: '500px' }}>
          {/* Job sidebar */}
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

          {/* Log table */}
          <div className="flex-1 bg-surface-1 border border-border rounded-xl overflow-hidden flex flex-col min-w-0">
            {/* Table header bar */}
            <div className="px-3 py-2 border-b border-border bg-surface-2/30 flex items-center gap-3 flex-shrink-0">
              <span className="text-[10px] font-medium text-gray-300">
                {selectedJob
                  ? <span className={clsx(jobColorMap.get(selectedJob))}>{selectedJob}</span>
                  : <span className="text-gray-400">All jobs</span>}
              </span>
              <span className="text-[10px] text-gray-600">{entries.length} lines</span>
              {errorCount > 0 && (
                <span className="text-[10px] text-accent-red bg-accent-red/10 px-1.5 py-0.5 rounded">
                  {errorCount} errors
                </span>
              )}
              {warnCount > 0 && (
                <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  {warnCount} warnings
                </span>
              )}
              <div className="ml-auto flex items-center gap-2 text-[9px] text-gray-600">
                <span>timestamp</span>
                <span>·</span>
                <span>level</span>
                {showJobCol && <><span>·</span><span>job</span></>}
                <span>·</span>
                <span>message</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto font-mono">
              {entries.length === 0 ? (
                <div className="text-center py-12 text-gray-600 text-sm">
                  No entries match the current filters.
                </div>
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
  )
}
