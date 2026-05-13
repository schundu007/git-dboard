import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Container, Play, RefreshCw, RotateCcw, ExternalLink,
  ChevronDown, ChevronUp, XCircle, Package, TrendingUp,
  Clock, CheckCircle2, AlertTriangle, Users, Calendar,
  StopCircle, Zap, Activity, HardDrive, Trash2, Rocket,
  GitBranch, Filter, Search, BarChart3, Globe, Timer,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import {
  getBuildRuns, getBuildJobs, getBuildArtifacts, getBuildStats,
  getFailureSummary, getAllRuns, getCaches, deleteCache,
  getDeployments, getEnvironments, getBuildUsage, getBuildPerformance, getWorkflowsWithStatus,
  triggerBuild, rerunBuild, rerunFailedJobs, cancelBuild, buildLogsWS,
} from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import LogViewer, { LogLine } from '../components/LogViewer'
import type { WorkflowRun, Job } from '../lib/types'
import clsx from 'clsx'

// ── Pinned workflows ──────────────────────────────────────────────────────────

const PINNED = [
  { filename: 'postmerge-ci.yml',        label: 'Post-Merge CI' },
  { filename: 'build.yml',               label: 'Build & Test' },
  { filename: 'publish-images.yaml',     label: 'Publish Images' },
  { filename: 'install-ci.yml',          label: 'Installation Tests' },
  { filename: 'lightweight-tests.yml',   label: 'Lightweight Tests' },
  { filename: 'license-check.yaml',      label: 'License Check' },
  { filename: 'check-links.yml',         label: 'Check Links' },
  { filename: 'pre-commit.yaml',         label: 'Pre-commit' },
  { filename: 'wheel.yml',               label: 'PIP Wheel' },
]

const GH_EVENTS = [
  'push', 'pull_request', 'pull_request_target', 'workflow_dispatch',
  'schedule', 'workflow_call', 'repository_dispatch', 'release',
]

type StatusFilter = 'all' | 'in_progress' | 'success' | 'failure' | 'cancelled'
type StatsWindow = 7 | 14 | 30 | 60
type MainMode = 'runs' | 'management'
type MgmtTab = 'caches' | 'deployments' | 'usage' | 'performance'
type RunsSubMode = 'all' | 'list' | string  // 'all' | 'list' (workflow browser) | workflow filename

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)}KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)}MB`
  return `${(b / 1024 ** 3).toFixed(2)}GB`
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = 'text-white', icon: Icon,
}: {
  label: string; value: string | number | null | undefined
  sub?: string; color?: string; icon?: any
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
        {Icon && <Icon size={13} className="text-gray-600" />}
      </div>
      <p className={clsx('text-2xl font-semibold tabular-nums', color)}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-gray-600">{sub}</p>}
    </div>
  )
}

// ── Stats panel ───────────────────────────────────────────────────────────────

function StatsPanel({ workflow, days }: { workflow: string; days: StatsWindow }) {
  const { data, isLoading } = useQuery({
    queryKey: ['build-stats', workflow, days],
    queryFn: () => getBuildStats(workflow, days),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  if (isLoading) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-xs">Loading stats…</div>
  )
  if (!data) return null

  const d = data.duration ?? {}
  const byDay: any[] = (data.by_day ?? []).slice(-14)
  const topActors: any[] = data.top_actors ?? []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Success Rate"
          value={data.success_rate != null ? `${data.success_rate}%` : null}
          sub={`${data.success ?? 0} / ${data.total ?? 0} runs`}
          color={data.success_rate >= 80 ? 'text-accent-green' : data.success_rate >= 60 ? 'text-accent-yellow' : 'text-accent-red'}
          icon={CheckCircle2}
        />
        <StatCard
          label="Failure Rate"
          value={data.failure_rate != null ? `${data.failure_rate}%` : null}
          sub={`${data.failure ?? 0} failures`}
          color={data.failure_rate < 10 ? 'text-accent-green' : data.failure_rate < 30 ? 'text-accent-yellow' : 'text-accent-red'}
          icon={XCircle}
        />
        <StatCard label="Avg Duration" value={d.avg_label ?? '—'} sub={`p50: ${d.p50_label ?? '—'}`} color="text-accent-blue" icon={Clock} />
        <StatCard label="p90 Duration" value={d.p90_label ?? '—'} sub={`${data.runs_analysed ?? 0} runs analysed`} color="text-accent-purple" icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {byDay.length > 0 && (
          <div className="md:col-span-2 bg-surface-1 border border-border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-3">Daily Runs — last 14 days</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={byDay} barSize={10}>
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={20} />
                <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3d', fontSize: 11 }} itemStyle={{ color: '#d1d5db' }} labelStyle={{ color: '#9ca3af', marginBottom: 4 }} />
                <Bar dataKey="success" name="Success" stackId="a" fill="#22c55e" />
                <Bar dataKey="failure" name="Failure" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {topActors.length > 0 && (
          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Users size={10} /> Top Triggerers
            </p>
            <div className="space-y-2">
              {topActors.slice(0, 6).map((a: any) => {
                const pct = Math.round((a.count / (data.runs_analysed || 1)) * 100)
                return (
                  <div key={a.login} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-300">{a.login}</span>
                      <span className="text-gray-500">{a.count} ({pct}%)</span>
                    </div>
                    <div className="h-1 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full rounded-full bg-accent-blue transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {(data.in_progress ?? 0) > 0 && (
        <div className="flex items-center gap-2 text-xs text-accent-blue bg-blue-950/30 border border-blue-900/40 rounded-lg px-3 py-2">
          <Zap size={12} className="animate-pulse" />
          {data.in_progress} run{data.in_progress > 1 ? 's' : ''} currently in progress
        </div>
      )}
    </div>
  )
}

// ── Failure detail ────────────────────────────────────────────────────────────

function FailureDetail({ runId }: { runId: number }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['failure-summary', runId],
    queryFn: () => getFailureSummary(runId),
    enabled: open,
    staleTime: 300_000,
  })

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-accent-red hover:text-red-400 transition-colors"
      >
        <AlertTriangle size={9} />
        {open ? 'Hide error detail' : 'Show error detail'}
        {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>
      {open && (
        <div className="mt-2 bg-black/40 rounded border border-red-900/40 p-2.5 space-y-2.5">
          {isLoading && <p className="text-[10px] text-gray-600">Fetching logs…</p>}
          {data?.summaries?.map((s: any, i: number) => (
            <div key={i} className="space-y-1">
              <p className="text-[10px] font-semibold text-accent-red flex items-center gap-1">
                <XCircle size={9} /> {s.job}
                {s.runner && <span className="text-gray-600 font-normal ml-1">on {s.runner}</span>}
              </p>
              {s.failed_steps?.map((step: any) => (
                <p key={step.number} className="text-[10px] text-orange-400 pl-3 flex items-center gap-1">
                  <AlertTriangle size={8} /> Step {step.number}: {step.name}
                </p>
              ))}
              {s.error_lines?.length > 0 && (
                <div className="bg-black/60 rounded p-1.5 font-mono max-h-32 overflow-y-auto">
                  {s.error_lines.map((line: string, li: number) => (
                    <p key={li} className={clsx(
                      'text-[9px] leading-4 break-all',
                      line.toLowerCase().includes('error') || line.includes('##[error]')
                        ? 'text-accent-red'
                        : line.toLowerCase().includes('traceback') || line.toLowerCase().includes('exception')
                        ? 'text-orange-400'
                        : 'text-gray-400',
                    )}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {data?.failed_jobs === 0 && (
            <p className="text-[10px] text-gray-600">No failed jobs found.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Job list ──────────────────────────────────────────────────────────────────

function JobList({ runId }: { runId: number }) {
  const { data } = useQuery({
    queryKey: ['build-jobs', runId],
    queryFn: () => getBuildJobs(runId),
    refetchInterval: 10_000,
  })
  const jobs: (Job & { duration_label?: string })[] = data?.jobs ?? []
  return (
    <div className="space-y-1.5">
      {jobs.map((j) => (
        <div key={j.id} className="bg-surface-2 rounded-lg p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-200 truncate max-w-sm">{j.name}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(j as any).duration_label && <span className="text-gray-500 text-[10px]">{(j as any).duration_label}</span>}
              <StatusBadge status={j.conclusion ?? j.status} />
            </div>
          </div>
          {j.runner_name && <p className="text-[10px] text-gray-600 mt-1">runner: {j.runner_name}</p>}
          {j.steps?.filter((s) => s.conclusion === 'failure').map((s) => (
            <p key={s.number} className="text-[10px] text-accent-red mt-0.5 flex items-center gap-1">
              <XCircle size={9} /> Step {s.number}: {s.name}
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Artifacts panel ───────────────────────────────────────────────────────────

function ArtifactsPanel({ runId }: { runId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['build-artifacts', runId],
    queryFn: () => getBuildArtifacts(runId),
    staleTime: 300_000,
  })
  const artifacts = data?.artifacts ?? []
  if (isLoading) return <p className="text-[10px] text-gray-600">Loading artifacts…</p>
  if (!artifacts.length) return <p className="text-[10px] text-gray-600">No artifacts.</p>
  return (
    <div className="space-y-1.5">
      {artifacts.map((a: any) => (
        <div key={a.id} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Package size={11} className="text-gray-500" />
            <span className="text-gray-200">{a.name}</span>
            <span className="text-gray-600">{a.size_kb} KB</span>
            {a.expired && <span className="text-accent-red text-[9px]">EXPIRED</span>}
          </div>
          {!a.expired && a.url && (
            <a href={a.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline text-[10px]">Download ↗</a>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function LogPanel({ runId, onClose }: { runId: number; onClose: () => void }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    const ws = buildLogsWS(runId)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.done) { setDone(true); ws.close() }
      else if (msg.line) setLines((p) => [...p, { job: msg.job, line: msg.line }])
    }
    ws.onerror = () => setDone(true)
    return () => ws.close()
  }, [runId])

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end justify-center p-4">
      <div className="w-full max-w-5xl bg-surface-1 border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium">Live Logs — run #{runId}</span>
          <div className="flex items-center gap-3">
            {done ? <span className="text-xs text-accent-green">Stream complete</span> : <span className="text-xs text-accent-blue animate-pulse">Streaming…</span>}
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
          </div>
        </div>
        <LogViewer lines={lines} maxHeight="60vh" />
      </div>
    </div>
  )
}

// ── Run card ──────────────────────────────────────────────────────────────────

function RunCard({ run, showWorkflow = false }: { run: WorkflowRun; showWorkflow?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'jobs' | 'artifacts'>('jobs')
  const [showLogs, setShowLogs] = useState(false)
  const qc = useQueryClient()

  const isInProgress = run.status === 'in_progress' || run.status === 'queued'
  const isFailed = run.conclusion === 'failure' || run.conclusion === 'timed_out'

  const { mutate: rerun, isPending: rerunning } = useMutation({
    mutationFn: () => rerunBuild(run.id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['build-runs'] }), 2000),
  })
  const { mutate: rerunFailed, isPending: rerunningFailed } = useMutation({
    mutationFn: () => rerunFailedJobs(run.id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['build-runs'] }), 2000),
  })
  const { mutate: cancel, isPending: cancelling } = useMutation({
    mutationFn: () => cancelBuild(run.id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['build-runs'] }), 1500),
  })

  const actor = run.triggering_actor ?? run.actor

  return (
    <>
      {showLogs && <LogPanel runId={run.id} onClose={() => setShowLogs(false)} />}
      <div className="bg-surface-1 border border-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <StatusBadge status={run.conclusion ?? run.status} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-[10px] text-gray-600 font-mono">#{run.run_number}</span>
              {showWorkflow && (run as any).workflow_label && (
                <span className="text-[10px] bg-purple-950 text-accent-purple px-1.5 py-0.5 rounded">
                  {(run as any).workflow_label}
                </span>
              )}
              <span className="text-[10px] text-gray-600 bg-surface-2 px-1.5 py-0.5 rounded">{run.event}</span>
              {run.duration_label && run.duration_label !== '—' && (
                <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                  <Clock size={9} /> {run.duration_label}
                </span>
              )}
              {isInProgress && (
                <span className="flex items-center gap-1 text-[10px] text-accent-blue">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                  {run.status === 'queued' ? 'Queued' : 'Running'}
                </span>
              )}
            </div>
            <p className="text-sm text-white truncate font-medium">{run.display_title || run.head_branch}</p>
            <div className="flex flex-wrap items-center gap-2.5 mt-1 text-[10px] text-gray-500">
              <span className="text-accent-blue font-mono">{run.head_branch}</span>
              <span className="font-mono">{run.head_sha?.slice(0, 7)}</span>
              <span className="flex items-center gap-0.5">
                <Calendar size={9} />
                {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
              </span>
              {actor && (
                <span className="flex items-center gap-1">
                  <img src={actor.avatar_url} className="w-3 h-3 rounded-full" alt="" />
                  {actor.login}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isInProgress && (
              <button onClick={() => cancel()} disabled={cancelling}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-red-950 text-accent-red hover:bg-red-900 disabled:opacity-50 transition-colors">
                <StopCircle size={10} />
                {cancelling ? '…' : 'Cancel'}
              </button>
            )}
            {isFailed && (
              <button onClick={() => rerunFailed()} disabled={rerunningFailed}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-yellow-950 text-yellow-400 hover:bg-yellow-900 disabled:opacity-50 transition-colors">
                <AlertTriangle size={9} />
                {rerunningFailed ? '…' : 'Retry Failed'}
              </button>
            )}
            <button onClick={() => rerun()} disabled={rerunning}
              className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
              <RotateCcw size={12} />
            </button>
            <button onClick={() => setShowLogs(true)}
              className="px-2 py-1 rounded text-[10px] bg-surface-2 text-gray-300 hover:bg-surface-3 transition-colors">
              Logs
            </button>
            <a href={run.html_url} target="_blank" rel="noreferrer">
              <ExternalLink size={12} className="text-gray-500 hover:text-accent-blue" />
            </a>
            <button onClick={() => setExpanded((v) => !v)}
              className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-surface-2 transition-colors">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Inline failure detail */}
        {isFailed && (
          <div className="border-t border-red-900/20 mt-3 pt-2 px-1">
            <FailureDetail runId={run.id} />
          </div>
        )}

        {/* Expanded tabs */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex gap-1 mb-3">
              {(['jobs', 'artifacts'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={clsx('px-2.5 py-1 rounded text-[10px] font-medium capitalize transition-colors',
                    activeTab === tab ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}>
                  {tab}
                </button>
              ))}
            </div>
            {activeTab === 'jobs' ? <JobList runId={run.id} /> : <ArtifactsPanel runId={run.id} />}
          </div>
        )}
      </div>
    </>
  )
}

// ── Live runs banner ──────────────────────────────────────────────────────────

function LiveRunsBanner({ runs }: { runs: WorkflowRun[] }) {
  const qc = useQueryClient()
  const live = runs.filter((r) => r.status === 'in_progress' || r.status === 'queued')
  if (!live.length) return null

  return (
    <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
        <p className="text-xs font-semibold text-accent-blue">{live.length} run{live.length !== 1 ? 's' : ''} in progress</p>
      </div>
      <div className="space-y-2">
        {live.map((r) => {
          const actor = r.triggering_actor ?? r.actor
          return (
            <div key={r.id} className="flex items-center gap-3 bg-surface-1/60 rounded-lg px-3 py-2">
              <StatusBadge status={r.status} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{r.display_title || r.head_branch}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                  <span className="bg-purple-950 text-accent-purple px-1.5 py-0.5 rounded text-[9px]">
                    {(r as any).workflow_label || r.name}
                  </span>
                  <span className="text-accent-blue font-mono">{r.head_branch}</span>
                  {actor && (
                    <span className="flex items-center gap-1">
                      <img src={actor.avatar_url} className="w-3 h-3 rounded-full" alt="" />
                      {actor.login}
                    </span>
                  )}
                  <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {r.status === 'in_progress' && (
                  <CancelMiniButton runId={r.id} onSuccess={() => qc.invalidateQueries({ queryKey: ['all-runs'] })} />
                )}
                <a href={r.html_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={11} className="text-gray-500 hover:text-accent-blue" />
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CancelMiniButton({ runId, onSuccess }: { runId: number; onSuccess: () => void }) {
  const { mutate, isPending } = useMutation({ mutationFn: () => cancelBuild(runId), onSuccess })
  return (
    <button onClick={() => mutate()} disabled={isPending}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-red-950 text-accent-red hover:bg-red-900 disabled:opacity-50">
      <StopCircle size={8} /> {isPending ? '…' : 'Cancel'}
    </button>
  )
}

// ── All-workflows panel ───────────────────────────────────────────────────────

function AllWorkflowsPanel() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [branch, setBranch] = useState('')
  const [event, setEvent] = useState('')
  const [actor, setActor] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['all-runs', statusFilter, branch, event, actor, page],
    queryFn: () => getAllRuns({
      per_page: 30,
      page,
      branch: branch || undefined,
      event: event || undefined,
      status: statusFilter !== 'all' ? (statusFilter === 'in_progress' ? undefined : statusFilter) : undefined,
      actor: actor || undefined,
    }),
    refetchInterval: 10_000,
    staleTime: 8_000,
  })

  const runs: WorkflowRun[] = data?.workflow_runs ?? []
  const total = data?.total_count ?? 0

  // For in_progress filter, apply client-side since GH API doesn't support it as conclusion
  const displayed = statusFilter === 'in_progress'
    ? runs.filter((r) => r.status === 'in_progress' || r.status === 'queued')
    : runs

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-surface-1 border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={11} className="text-gray-500" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Filters</span>
          {isFetching && <span className="text-[9px] text-gray-600 animate-pulse ml-auto">Refreshing…</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Status pills */}
          <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-1">
            {(['all', 'in_progress', 'success', 'failure', 'cancelled'] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
                className={clsx('px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                  statusFilter === s ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
                {s === 'in_progress' ? 'Running' : s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {/* Branch */}
          <div className="relative">
            <GitBranch size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1) }}
              placeholder="branch"
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-32 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
          </div>
          {/* Event */}
          <select value={event} onChange={(e) => { setEvent(e.target.value); setPage(1) }}
            className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-accent-blue">
            <option value="">Event: all</option>
            {GH_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
          {/* Actor */}
          <div className="relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={actor} onChange={(e) => { setActor(e.target.value); setPage(1) }}
              placeholder="actor / author"
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-36 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
          </div>
          {/* Clear */}
          {(branch || event || actor || statusFilter !== 'all') && (
            <button onClick={() => { setStatusFilter('all'); setBranch(''); setEvent(''); setActor(''); setPage(1) }}
              className="text-[10px] text-gray-600 hover:text-gray-400 px-1.5">
              ✕ Clear
            </button>
          )}
          <span className="text-[10px] text-gray-600 ml-auto">
            {total.toLocaleString()} total runs
          </span>
        </div>
      </div>

      {/* Live runs section */}
      <LiveRunsBanner runs={runs} />

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Loading runs…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load runs.</div>}
      {!isLoading && displayed.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">No runs match the selected filters.</div>
      )}

      <div className="space-y-2.5">
        {displayed.map((r) => <RunCard key={r.id} run={r} showWorkflow />)}
      </div>

      {/* Pagination */}
      {total > 30 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded text-xs bg-surface-2 text-gray-300 hover:bg-surface-3 disabled:opacity-40">
            ← Prev
          </button>
          <span className="text-xs text-gray-500">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={displayed.length < 30}
            className="px-3 py-1.5 rounded text-xs bg-surface-2 text-gray-300 hover:bg-surface-3 disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Caches panel ──────────────────────────────────────────────────────────────

const GH_CACHE_LIMIT_GB = 10
const GH_CACHE_LIMIT_BYTES = GH_CACHE_LIMIT_GB * 1024 ** 3

function staleness(lastAccessedAt: string | null): { label: string; color: string } {
  if (!lastAccessedAt) return { label: 'unknown', color: 'text-gray-600' }
  const days = Math.floor((Date.now() - new Date(lastAccessedAt).getTime()) / 86_400_000)
  if (days <= 3) return { label: `${days}d ago`, color: 'text-accent-green' }
  if (days <= 7) return { label: `${days}d ago`, color: 'text-accent-yellow' }
  if (days <= 30) return { label: `${days}d ago`, color: 'text-orange-400' }
  return { label: `${days}d ago`, color: 'text-accent-red' }
}

function CachesPanel() {
  const [refFilter, setRefFilter] = useState('')
  const [keyFilter, setKeyFilter] = useState('')
  const [sortBy, setSortBy] = useState<'size' | 'age' | 'ref'>('size')
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['caches', refFilter, keyFilter],
    queryFn: () => getCaches(refFilter || undefined, keyFilter || undefined),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const { mutate: del, isPending: deleting, variables: deletingId } = useMutation({
    mutationFn: (id: number) => deleteCache(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caches'] }),
  })

  const allCaches: any[] = data?.caches ?? []
  const caches = [...allCaches].sort((a, b) => {
    if (sortBy === 'size') return b.size_bytes - a.size_bytes
    if (sortBy === 'age') return new Date(b.last_accessed_at ?? 0).getTime() - new Date(a.last_accessed_at ?? 0).getTime()
    return (a.ref ?? '').localeCompare(b.ref ?? '')
  })

  const usedBytes = data?.total_size_bytes ?? 0
  const usedPct = Math.min(100, (usedBytes / GH_CACHE_LIMIT_BYTES) * 100)
  const staleCount = allCaches.filter((c) => {
    if (!c.last_accessed_at) return false
    return (Date.now() - new Date(c.last_accessed_at).getTime()) / 86_400_000 > 7
  }).length

  // Group by key prefix (before first - or _)
  const prefixGroups: Record<string, number> = {}
  allCaches.forEach((c) => {
    const prefix = c.key.split(/[-_]/)[0] || 'other'
    prefixGroups[prefix] = (prefixGroups[prefix] ?? 0) + 1
  })
  const topPrefixes = Object.entries(prefixGroups).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Caches" value={data.total_count} icon={HardDrive} />
          <StatCard label="Total Size" value={data.total_size_label} color="text-accent-blue" icon={HardDrive}
            sub={`${usedPct.toFixed(1)}% of ${GH_CACHE_LIMIT_GB}GB limit`} />
          <StatCard label="Stale (>7d)" value={staleCount}
            color={staleCount > 5 ? 'text-accent-red' : staleCount > 0 ? 'text-accent-yellow' : 'text-accent-green'}
            icon={Clock} sub="last accessed >7 days ago" />
          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Key Prefixes</p>
            <div className="space-y-0.5">
              {topPrefixes.map(([prefix, count]) => (
                <div key={prefix} className="flex justify-between text-[10px]">
                  <span className="font-mono text-gray-400">{prefix}-*</span>
                  <span className="text-gray-600">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Storage utilization bar */}
      {data && (
        <div className="bg-surface-1 border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5 text-[10px]">
            <span className="text-gray-400">GitHub Actions Cache Storage</span>
            <span className={clsx(usedPct > 80 ? 'text-accent-red' : usedPct > 60 ? 'text-accent-yellow' : 'text-accent-green')}>
              {data.total_size_label} / {GH_CACHE_LIMIT_GB}GB
            </span>
          </div>
          <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', usedPct > 80 ? 'bg-accent-red' : usedPct > 60 ? 'bg-accent-yellow' : 'bg-accent-blue')}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="text-[9px] text-gray-600 mt-1">Caches exceeding the limit are evicted automatically (oldest first)</p>
        </div>
      )}

      {/* By-branch breakdown */}
      {data?.by_ref?.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Storage by Branch</p>
          <div className="space-y-1.5">
            {(data.by_ref ?? []).map((r: any) => {
              const pct = Math.round((r.size_bytes / Math.max(usedBytes, 1)) * 100)
              return (
                <div key={r.ref} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-gray-300 truncate max-w-[200px]">{r.ref || '(root)'}</span>
                    <span className="text-gray-500 flex-shrink-0">{r.count} entries · {r.size_label} ({pct}%)</span>
                  </div>
                  <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-blue rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters + sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <GitBranch size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={refFilter} onChange={(e) => setRefFilter(e.target.value)} placeholder="filter by branch"
            className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-40 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
        </div>
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)} placeholder="filter by key"
            className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-52 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
        </div>
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 ml-auto">
          {(['size', 'age', 'ref'] as const).map((s) => (
            <button key={s} onClick={() => setSortBy(s)}
              className={clsx('px-2 py-0.5 rounded text-[10px] transition-colors capitalize',
                sortBy === s ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {s === 'age' ? 'Last used' : s}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Loading caches…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load caches.</div>}
      {!isLoading && caches.length === 0 && <div className="text-center py-12 text-gray-500 text-sm">No caches found.</div>}

      {caches.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-px bg-border">
            {['Cache Key', 'Branch', 'Size', 'Last Accessed', ''].map((h) => (
              <div key={h} className="bg-surface-2 px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider">{h}</div>
            ))}
            {caches.map((c: any) => {
              const s = staleness(c.last_accessed_at)
              return (
                <>
                  <div key={`${c.id}-key`} className="bg-surface-1 px-3 py-2.5 font-mono text-[10px] text-gray-200 truncate" title={c.key}>{c.key}</div>
                  <div key={`${c.id}-ref`} className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-blue font-mono">{c.ref || '—'}</div>
                  <div key={`${c.id}-size`} className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-300 text-right">{c.size_label}</div>
                  <div key={`${c.id}-acc`} className={clsx('bg-surface-1 px-3 py-2.5 text-[10px]', s.color)}>{s.label}</div>
                  <div key={`${c.id}-del`} className="bg-surface-1 px-3 py-2.5 flex items-center justify-center">
                    <button onClick={() => del(c.id)} disabled={deleting && deletingId === c.id}
                      className="p-1 rounded text-gray-600 hover:text-accent-red hover:bg-red-950/30 transition-colors disabled:opacity-50">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared deployment helpers ─────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  success: 'text-accent-green bg-green-950',
  active: 'text-accent-green bg-green-950',
  failure: 'text-accent-red bg-red-950',
  error: 'text-accent-red bg-red-950',
  inactive: 'text-gray-400 bg-surface-3',
  pending: 'text-accent-yellow bg-yellow-950',
  in_progress: 'text-accent-blue bg-blue-950',
  queued: 'text-gray-400 bg-surface-3',
}

function statusDot(status: string) {
  if (status === 'success' || status === 'active') return 'bg-accent-green'
  if (status === 'failure' || status === 'error') return 'bg-accent-red'
  if (status === 'in_progress') return 'bg-accent-blue animate-pulse'
  if (status === 'pending') return 'bg-accent-yellow'
  return 'bg-gray-600'
}

// ── Deployments panel ─────────────────────────────────────────────────────────

// Known environments to always show, even if not in current page of results
const PINNED_ENVS = ['premerge-verification', 'mirror-production']

function DeploymentsPanel() {
  const [selectedEnv, setSelectedEnv] = useState('')
  const [page, setPage] = useState(1)

  // Load all known environments from the dedicated endpoint
  const { data: envsData } = useQuery({
    queryKey: ['environments'],
    queryFn: () => getEnvironments(),
    staleTime: 300_000,
  })

  // Load deployments — filtered by selected env when one is chosen
  const { data, isLoading, isError } = useQuery({
    queryKey: ['deployments', selectedEnv, page],
    queryFn: () => getDeployments(selectedEnv || undefined, undefined, page, 30),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const allDeployments: any[] = data?.deployments ?? []

  // Build environment list: pinned first, then from API, de-duped
  const knownEnvNames: string[] = (envsData?.environments ?? []).map((e: any) => e.name)
  const deploymentEnvs: string[] = data?.environments ?? []
  const envNames: string[] = Array.from(new Set([
    ...PINNED_ENVS,
    ...knownEnvNames,
    ...deploymentEnvs,
  ]))

  // Stats per env from current deployment page
  const envStatMap = new Map<string, { lastStatus: string; lastAt: string; history: string[] }>()
  allDeployments.forEach((d: any) => {
    if (!envStatMap.has(d.environment)) {
      envStatMap.set(d.environment, { lastStatus: d.status, lastAt: d.created_at, history: [] })
    }
    envStatMap.get(d.environment)!.history.push(d.status)
  })

  const displayed = selectedEnv
    ? allDeployments.filter((d) => d.environment === selectedEnv)
    : allDeployments

  return (
    <div className="flex gap-4" style={{ minHeight: '60vh' }}>
      {/* Environment sidebar */}
      <div className="w-56 flex-shrink-0 bg-surface-1 border border-border rounded-xl p-2 space-y-0.5 overflow-y-auto">
        <p className="text-[9px] text-gray-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Environments</p>

        {/* All */}
        <button
          onClick={() => { setSelectedEnv(''); setPage(1) }}
          className={clsx('w-full text-left px-3 py-2 rounded-lg transition-colors text-[10px]',
            selectedEnv === '' ? 'bg-surface-3 border border-border/60 text-white' : 'text-gray-400 hover:bg-surface-2')}
        >
          All environments
        </button>

        {envNames.map((name) => {
          const s = envStatMap.get(name)
          const isPinned = PINNED_ENVS.includes(name)
          return (
            <button
              key={name}
              onClick={() => { setSelectedEnv(name); setPage(1) }}
              className={clsx('w-full text-left px-3 py-2 rounded-lg transition-colors group',
                selectedEnv === name
                  ? 'bg-surface-3 border border-border/60'
                  : 'hover:bg-surface-2',
              )}
            >
              <div className="flex items-center gap-2">
                <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
                  s ? statusDot(s.lastStatus) : 'bg-gray-700')} />
                <span className={clsx('text-[10px] font-medium truncate flex-1',
                  selectedEnv === name ? 'text-white' : 'text-gray-300')}>
                  {name}
                </span>
                {isPinned && (
                  <span className="text-[8px] text-accent-blue flex-shrink-0">★</span>
                )}
              </div>
              {s?.lastAt && (
                <p className="text-[9px] text-gray-600 mt-0.5 pl-3.5">
                  {formatDistanceToNow(new Date(s.lastAt), { addSuffix: true })}
                </p>
              )}
              {s && s.history.length > 0 && (
                <div className="flex gap-0.5 mt-1 pl-3.5">
                  {s.history.slice(0, 8).map((st, i) => (
                    <div key={i} className={clsx('w-1.5 h-1.5 rounded-full', statusDot(st))} title={st} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Deployment list */}
      <div className="flex-1 space-y-3 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">
              {selectedEnv || 'All environments'}
            </span>
            <span className="text-[10px] text-gray-500">{displayed.length} deployments</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2 py-1 rounded text-[10px] bg-surface-2 text-gray-400 hover:bg-surface-3 disabled:opacity-40">
              ← Prev
            </button>
            <span className="text-[10px] text-gray-500">Page {page}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={displayed.length < 30}
              className="px-2 py-1 rounded text-[10px] bg-surface-2 text-gray-400 hover:bg-surface-3 disabled:opacity-40">
              Next →
            </button>
          </div>
        </div>

        {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Loading deployments…</div>}
        {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load deployments.</div>}
        {!isLoading && displayed.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No deployments found{selectedEnv ? ` for "${selectedEnv}"` : ''}.
          </div>
        )}

        <div className="space-y-2">
          {displayed.map((d: any) => (
            <div key={d.id} className="bg-surface-1 border border-border rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={clsx('text-[9px] px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0',
                  STATUS_COLOR[d.status] ?? 'text-gray-400 bg-surface-3')}>
                  {d.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!selectedEnv && (
                      <span className="text-xs font-medium text-white">{d.environment}</span>
                    )}
                    <span className="text-[10px] text-gray-600 bg-surface-2 px-1.5 py-0.5 rounded">{d.task}</span>
                    <span className="font-mono text-[10px] text-accent-blue">{d.ref}</span>
                    <span className="font-mono text-[10px] text-gray-600">{d.sha}</span>
                  </div>
                  {d.description && (
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{d.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
                    {d.creator_avatar && (
                      <img src={d.creator_avatar} className="w-3 h-3 rounded-full" alt="" />
                    )}
                    <span>{d.creator}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {d.environment_url && (
                    <a href={d.environment_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] text-accent-green hover:underline">
                      <Globe size={9} /> Open
                    </a>
                  )}
                  {d.log_url && (
                    <a href={d.log_url} target="_blank" rel="noreferrer">
                      <ExternalLink size={11} className="text-gray-500 hover:text-accent-blue" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Usage panel ───────────────────────────────────────────────────────────────

function UsagePanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['build-usage'],
    queryFn: getBuildUsage,
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  const workflows: any[] = data?.workflows ?? []
  const selfHosted: boolean = data?.self_hosted ?? false

  // When self-hosted, chart actual wall-clock time; otherwise billable minutes
  const chartKey = selfHosted ? 'actual_min' : 'total_min'
  const chartLabel = selfHosted ? 'Wall-clock time (min)' : 'Billable minutes'

  return (
    <div className="space-y-4">
      {/* Self-hosted notice */}
      {data && selfHosted && (
        <div className="flex items-start gap-2 bg-yellow-950/20 border border-yellow-900/30 rounded-lg px-4 py-3 text-xs text-yellow-300">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-yellow-400" />
          <span>
            All workflows use <strong>self-hosted runners</strong> — GitHub billable minutes are not applicable (always 0).
            Showing <strong>actual wall-clock time</strong> computed from recent runs instead.
          </span>
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {selfHosted ? (
            <>
              <StatCard
                label="Total Wall-Clock"
                value={`${data.total_actual_min}m`}
                sub="across last 30 runs each"
                icon={Timer}
                color="text-accent-blue"
              />
              <StatCard
                label="Workflows tracked"
                value={workflows.length}
                sub="active workflows"
                icon={Activity}
              />
              <StatCard
                label="Longest avg"
                value={workflows[0] ? `${workflows[0].avg_min}m` : '—'}
                sub={workflows[0]?.name ?? ''}
                icon={Clock}
                color="text-accent-orange"
              />
              <StatCard
                label="GitHub billable"
                value="0m"
                sub="self-hosted runners"
                icon={Timer}
                color="text-gray-600"
              />
            </>
          ) : (
            <>
              <StatCard label="Total Billable" value={`${data.total_min}m`} icon={Timer} color="text-accent-blue" />
              <StatCard label="Ubuntu" value={`${data.total_ubuntu_min}m`} icon={Timer} color="text-accent-green" sub="Linux runners" />
              <StatCard label="macOS" value={`${data.total_macos_min}m`} icon={Timer} color="text-accent-yellow" sub="macOS runners" />
              <StatCard label="Wall-Clock Total" value={`${data.total_actual_min}m`} icon={Clock} color="text-accent-purple" sub="from recent runs" />
            </>
          )}
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Fetching workflow usage…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load usage.</div>}

      {/* Chart */}
      {workflows.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-4">
            {chartLabel} by Workflow
          </p>
          <ResponsiveContainer width="100%" height={Math.max(180, workflows.length * 28)}>
            <BarChart data={workflows} layout="vertical" barSize={10} margin={{ left: 0, right: 60 }}>
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 9 }} unit="m" />
              <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 9 }} width={180} />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3d', fontSize: 11 }}
                formatter={(v: any, name: string) => [`${v}m`, name]}
              />
              {selfHosted ? (
                <>
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="actual_min" name="Wall-clock (min)" fill="#3b82f6" radius={[0, 2, 2, 0]} />
                </>
              ) : (
                <>
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="ubuntu_min" name="Ubuntu" stackId="a" fill="#22c55e" />
                  <Bar dataKey="macos_min" name="macOS" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="windows_min" name="Windows" stackId="a" fill="#3b82f6" radius={[0, 2, 2, 0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      {workflows.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className={clsx('grid gap-px bg-border', selfHosted
            ? 'grid-cols-[1fr_auto_auto_auto]'
            : 'grid-cols-[1fr_auto_auto_auto_auto_auto]')}>
            {(selfHosted
              ? ['Workflow', 'Runs (last 30)', 'Avg per run', 'Total wall-clock']
              : ['Workflow', 'Ubuntu', 'macOS', 'Windows', 'Billable', 'Wall-clock']
            ).map((h) => (
              <div key={h} className="bg-surface-2 px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider">{h}</div>
            ))}
            {workflows.map((w: any) => (
              selfHosted ? (
                <div key={w.id} className="contents">
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-200 truncate">{w.name}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-400 text-right tabular-nums">{w.run_count}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-blue text-right tabular-nums">{w.avg_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-white font-semibold text-right tabular-nums">{w.actual_min}m</div>
                </div>
              ) : (
                <div key={w.id} className="contents">
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-200 truncate">{w.name}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-green text-right">{w.ubuntu_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-yellow text-right">{w.macos_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-blue text-right">{w.windows_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-white font-semibold text-right">{w.total_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-purple text-right">{w.actual_min}m</div>
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Performance metrics panel ─────────────────────────────────────────────────

function PerformanceMetricsPanel() {
  const [days, setDays] = useState<7 | 14 | 30>(14)
  const [sortBy, setSortBy] = useState<'failure_rate' | 'avg' | 'total'>('avg')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['build-performance', days],
    queryFn: () => getBuildPerformance(days),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  const workflows: any[] = data?.workflows ?? []
  const sorted = [...workflows].sort((a, b) => {
    if (sortBy === 'failure_rate') return ((b.failure / Math.max(b.total, 1)) * 100) - ((a.failure / Math.max(a.total, 1)) * 100)
    if (sortBy === 'avg') return (b.avg_seconds ?? 0) - (a.avg_seconds ?? 0)
    return b.total - a.total
  })

  const best = workflows.length ? workflows.reduce((a, b) => ((a.success_rate ?? 0) > (b.success_rate ?? 0) ? a : b)) : null
  const fastest = workflows.filter((w) => w.avg_seconds).length
    ? workflows.filter((w) => w.avg_seconds).reduce((a, b) => (a.avg_seconds < b.avg_seconds ? a : b))
    : null
  const heaviest = workflows.length ? workflows.reduce((a, b) => (b.total > a.total ? b : a)) : null

  const chartData = sorted.slice(0, 10).map((w) => ({
    name: w.workflow.length > 20 ? w.workflow.slice(0, 17) + '…' : w.workflow,
    avg: w.avg_seconds ? +(w.avg_seconds / 60).toFixed(1) : 0,
    p50: w.p50_seconds ? +(w.p50_seconds / 60).toFixed(1) : 0,
    p90: w.p90_seconds ? +(w.p90_seconds / 60).toFixed(1) : 0,
    failure_pct: w.total ? +(w.failure / w.total * 100).toFixed(0) : 0,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-accent-purple" />
          <span className="text-xs font-medium text-gray-300">Cross-Workflow Performance</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={11} className="text-gray-500" />
          {([7, 14, 30] as const).map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={clsx('px-2 py-0.5 rounded text-[10px] transition-colors',
                days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards matching GitHub Performance Metrics */}
      {workflows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Best Success Rate"
            value={best?.success_rate != null ? `${best.success_rate}%` : '—'}
            sub={best?.workflow}
            color={best?.success_rate >= 80 ? 'text-accent-green' : 'text-accent-yellow'}
            icon={CheckCircle2}
          />
          <StatCard
            label="Fastest Avg Duration"
            value={fastest?.avg_label ?? '—'}
            sub={fastest?.workflow}
            color="text-accent-blue"
            icon={Clock}
          />
          <StatCard
            label="Most Active"
            value={heaviest?.total ?? '—'}
            sub={`${heaviest?.workflow ?? ''} · ${days}d`}
            color="text-accent-purple"
            icon={Activity}
          />
          <StatCard
            label="Workflows Analysed"
            value={workflows.length}
            sub={`${days}-day window`}
            icon={TrendingUp}
          />
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Computing performance metrics…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load performance data.</div>}

      {/* Duration comparison chart */}
      {chartData.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-4">
            Avg Run Duration by Workflow (minutes) — {days}d window
          </p>
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 34)}>
            <BarChart data={chartData} layout="vertical" barSize={7} margin={{ left: 0, right: 60 }}>
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 9 }} unit="m" />
              <YAxis type="category" dataKey="name" tick={{ fill: '#d1d5db', fontSize: 9 }} width={155} />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3d', fontSize: 11 }}
                formatter={(v: any, name: string) => [`${v}m`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="avg" name="Avg" fill="#3b82f6" />
              <Bar dataKey="p50" name="p50 (median)" fill="#a855f7" />
              <Bar dataKey="p90" name="p90" fill="#f59e0b" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detailed table: matches GitHub "Actions Performance Metrics" layout */}
      {sorted.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Per-Workflow Details</p>
            <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5">
              {([['failure_rate', 'Job Failures'], ['avg', 'Duration'], ['total', 'Runs']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key as any)}
                  className={clsx('px-2 py-0.5 rounded text-[9px] transition-colors',
                    sortBy === key ? 'bg-surface-3 text-white' : 'text-gray-600 hover:text-gray-400')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-px bg-border">
            {['Workflow', 'Runs', 'Failures %', 'Avg', 'p50', 'p90', 'Success'].map((h) => (
              <div key={h} className="bg-surface-2 px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider">{h}</div>
            ))}
            {sorted.map((w) => {
              const failurePct = w.total ? +((w.failure / w.total) * 100).toFixed(0) : 0
              return (
                <div key={w.filename} className="contents">
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-200 truncate">{w.workflow}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-400 text-right">{w.total}</div>
                  <div className={clsx('bg-surface-1 px-3 py-2.5 text-[10px] font-semibold text-right',
                    failurePct >= 30 ? 'text-accent-red' : failurePct >= 10 ? 'text-accent-yellow' : 'text-accent-green')}>
                    {failurePct}%
                  </div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-blue text-right">{w.avg_label ?? '—'}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-purple text-right">{w.p50_label ?? '—'}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-accent-yellow text-right">{w.p90_label ?? '—'}</div>
                  <div className={clsx('bg-surface-1 px-3 py-2.5 text-[10px] font-semibold text-right',
                    w.success_rate == null ? 'text-gray-600' : w.success_rate >= 80 ? 'text-accent-green' : w.success_rate >= 60 ? 'text-accent-yellow' : 'text-accent-red')}>
                    {w.success_rate != null ? `${w.success_rate}%` : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Workflow browser panel ─────────────────────────────────────────────────────

function WorkflowListPanel() {
  const [search, setSearch] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflows-status'],
    queryFn: getWorkflowsWithStatus,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const allWorkflows: any[] = data?.workflows ?? []
  const filtered = allWorkflows
    .filter((w) => showDisabled || w.state === 'active')
    .filter((w) => !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.filename.toLowerCase().includes(search.toLowerCase()))

  const activeCount = allWorkflows.filter((w) => w.state === 'active').length
  const pinnedCount = allWorkflows.filter((w) => w.pinned).length

  return (
    <div className="space-y-4">
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total Workflows" value={data.total} icon={Activity} />
          <StatCard label="Active" value={activeCount} color="text-accent-green" icon={CheckCircle2} />
          <StatCard label="Pinned" value={pinnedCount} color="text-accent-blue" icon={TrendingUp} sub="tracked in pipeline tabs" />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workflows…"
            className="w-full bg-surface-2 border border-border rounded-md pl-6 pr-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} className="w-3 h-3" />
          Show disabled
        </label>
        <span className="text-[10px] text-gray-600 ml-auto">{filtered.length} of {data?.total ?? '…'} workflows</span>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Loading workflows…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load workflows.</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filtered.map((w) => (
          <div key={w.id} className={clsx(
            'bg-surface-1 border rounded-xl px-4 py-3 flex items-start gap-3 transition-colors',
            w.pinned ? 'border-blue-900/40 hover:border-blue-700/50' : 'border-border hover:border-gray-600',
            w.state !== 'active' && 'opacity-60',
          )}>
            <div className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
              w.state === 'active' ? 'bg-accent-green' : 'bg-gray-600')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                {w.pinned && (
                  <span className="text-[9px] bg-blue-950 text-accent-blue px-1.5 py-0.5 rounded flex-shrink-0">Pinned</span>
                )}
                <span className="text-xs font-medium text-white truncate">{w.name}</span>
              </div>
              <p className="text-[9px] font-mono text-gray-600">{w.filename}</p>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-600 flex-wrap">
                {w.last_branch && <span className="text-accent-blue font-mono">{w.last_branch}</span>}
                {w.last_run_at && (
                  <span>{formatDistanceToNow(new Date(w.last_run_at), { addSuffix: true })}</span>
                )}
                {w.state !== 'active' && (
                  <span className="text-gray-600 bg-surface-3 px-1.5 py-0.5 rounded">disabled</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {w.last_status && <StatusBadge status={w.last_status} />}
              {w.html_url && (
                <a href={w.html_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={11} className="text-gray-600 hover:text-accent-blue" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Per-workflow runs panel ────────────────────────────────────────────────────

function WorkflowRunsPanel({ workflow, statsWindow, setStatsWindow, showStats, setShowStats }: {
  workflow: string
  statsWindow: StatsWindow
  setStatsWindow: (w: StatsWindow) => void
  showStats: boolean
  setShowStats: (v: boolean) => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [branch, setBranch] = useState('')
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['build-runs', workflow, statusFilter, branch],
    queryFn: () => getBuildRuns(
      workflow, 1,
      branch || undefined,
      statusFilter === 'all' ? undefined : statusFilter,
    ),
    refetchInterval: 30_000,
  })

  const runs: WorkflowRun[] = data?.workflow_runs ?? []

  return (
    <div className="space-y-4">
      {/* Stats section */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white transition-colors">
            <BarChart3 size={14} className="text-accent-blue" />
            Pipeline Statistics
            {showStats ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
          </button>
          <div className="flex items-center gap-1">
            <Calendar size={11} className="text-gray-500" />
            {([7, 14, 30, 60] as StatsWindow[]).map((d) => (
              <button key={d} onClick={() => setStatsWindow(d)}
                className={clsx('px-2 py-0.5 rounded text-[10px] transition-colors',
                  statsWindow === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        {showStats && <StatsPanel workflow={workflow} days={statsWindow} />}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-lg p-1">
          {(['all', 'in_progress', 'success', 'failure', 'cancelled'] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={clsx('px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors',
                statusFilter === s ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {s === 'in_progress' ? 'Running' : s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Branch:</span>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="filter by branch"
            className="bg-surface-2 border border-border rounded-md px-2 py-1 text-xs w-40 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
          {branch && <button onClick={() => setBranch('')} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>}
        </div>
        <span className="text-xs text-gray-600 ml-auto">{runs.length} runs</span>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Loading runs…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load runs.</div>}
      {!isLoading && runs.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">No runs found.</div>
      )}
      <div className="space-y-2.5">
        {runs.map((r) => <RunCard key={r.id} run={r} />)}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuildPipeline() {
  const [mode, setMode] = useState<MainMode>('runs')
  const [mgmtTab, setMgmtTab] = useState<MgmtTab>('caches')
  const [workflow, setWorkflow] = useState<string | 'all'>('all')
  const [statsWindow, setStatsWindow] = useState<StatsWindow>(14)
  const [showStats, setShowStats] = useState(true)
  const [ref, setRef] = useState('main')
  const qc = useQueryClient()

  const activeWorkflow = PINNED.find((p) => p.filename === workflow)

  const { mutate: trigger, isPending: triggering } = useMutation({
    mutationFn: () => triggerBuild(ref, workflow === 'all' ? 'postmerge-ci.yml' : workflow),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['build-runs'] }), 3000),
  })

  // Derive the active tab key for the unified tab bar
  const activeTab: string = mode === 'management' ? mgmtTab : workflow

  const selectTab = (key: string) => {
    const mgmtKeys = ['caches', 'deployments', 'usage', 'performance']
    if (mgmtKeys.includes(key)) {
      setMode('management')
      setMgmtTab(key as MgmtTab)
    } else {
      setMode('runs')
      setWorkflow(key)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Container size={18} className="text-accent-purple" />
          <h1 className="text-lg font-semibold">Build Pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'runs' && workflow !== 'all' && workflow !== 'list' && (
            <>
              <input value={ref} onChange={(e) => setRef(e.target.value)}
                className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs w-28 text-white focus:outline-none focus:border-accent-blue"
                placeholder="branch / ref" />
              <button onClick={() => trigger()} disabled={triggering}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-accent-blue text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
                <Play size={11} />
                {triggering ? 'Queuing…' : 'Trigger'}
              </button>
            </>
          )}
          <button onClick={() => { qc.invalidateQueries({ queryKey: ['build-runs'] }); qc.invalidateQueries({ queryKey: ['all-runs'] }) }}
            className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── Unified tab bar ───────────────────────────────────────────────────── */}
      <div className="border-b border-border pb-3 space-y-2">
        {/* Runs row */}
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[9px] text-gray-600 uppercase tracking-wider w-20 flex-shrink-0">Workflows</span>
          <button onClick={() => selectTab('all')}
            className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeTab === 'all' ? 'bg-accent-blue text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200')}>
            All
          </button>
          {PINNED.map((w) => (
            <button key={w.filename} onClick={() => selectTab(w.filename)}
              className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === w.filename ? 'bg-accent-blue text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200')}>
              {w.label}
            </button>
          ))}
          <button onClick={() => selectTab('list')}
            className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeTab === 'list' ? 'bg-surface-3 text-white' : 'bg-surface-2 text-gray-500 hover:bg-surface-3 hover:text-gray-300')}>
            Browse All →
          </button>
        </div>

        {/* Management row */}
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[9px] text-gray-600 uppercase tracking-wider w-20 flex-shrink-0">Management</span>
          {[
            { key: 'caches',      icon: HardDrive, label: 'Caches' },
            { key: 'deployments', icon: Rocket,    label: 'Deployments' },
            { key: 'usage',       icon: BarChart3, label: 'Usage / Billing' },
            { key: 'performance', icon: TrendingUp, label: 'Performance' },
          ].map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => selectTab(key)}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === key ? 'bg-accent-blue text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200')}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      {mode === 'runs' && (
        workflow === 'list'
          ? <WorkflowListPanel />
          : workflow === 'all'
          ? <AllWorkflowsPanel />
          : <WorkflowRunsPanel
              workflow={workflow}
              statsWindow={statsWindow}
              setStatsWindow={setStatsWindow}
              showStats={showStats}
              setShowStats={setShowStats}
            />
      )}

      {mode === 'management' && (
        <>
          {mgmtTab === 'caches'      && <CachesPanel />}
          {mgmtTab === 'deployments' && <DeploymentsPanel />}
          {mgmtTab === 'usage'       && <UsagePanel />}
          {mgmtTab === 'performance' && <PerformanceMetricsPanel />}
        </>
      )}
    </div>
  )
}
