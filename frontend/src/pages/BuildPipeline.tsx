import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Container, Play, RefreshCw, RotateCcw, ExternalLink,
  ChevronDown, ChevronUp, XCircle, Package, TrendingUp,
  Clock, CheckCircle2, AlertTriangle, Users, Calendar,
  StopCircle, Zap, Activity, HardDrive, Trash2, Rocket,
  GitBranch, Filter, Search, BarChart3, Globe, Timer,
  Moon, Terminal, Settings,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import {
  getBuildRuns, getBuildJobs, getBuildArtifacts, getBuildStats,
  getFailureSummary, getAllRuns, getCaches, deleteCache,
  getDeployments, getEnvironments, getBuildUsage, getBuildPerformance, getWorkflowsWithStatus,
  triggerBuild, rerunBuild, rerunFailedJobs, cancelBuild, buildLogsWS,
  getNightlyMatrix, getNightlyRuns, getNightlyTrend, triggerNightly,
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
type StatsWindow = 1 | 3 | 7 | 14 | 130
type MainMode = 'runs' | 'nightly' | 'management'
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
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        {Icon && <Icon size={13} className="text-gray-400" />}
      </div>
      <p className={clsx('text-2xl font-semibold tabular-nums', color)}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
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
    <div className="h-48 flex items-center justify-center text-gray-400 text-xs">Loading stats…</div>
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
          color={data.success_rate >= 80 ? 'text-nvidia' : data.success_rate >= 60 ? 'text-neutral-300' : 'text-accent-red'}
          icon={CheckCircle2}
        />
        <StatCard
          label="Failure Rate"
          value={data.failure_rate != null ? `${data.failure_rate}%` : null}
          sub={`${data.failure ?? 0} failures`}
          color={data.failure_rate < 10 ? 'text-nvidia' : data.failure_rate < 30 ? 'text-neutral-300' : 'text-accent-red'}
          icon={XCircle}
        />
        <StatCard label="Avg Duration" value={d.avg_label ?? '—'} sub={`p50: ${d.p50_label ?? '—'}`} color="text-neutral-300" icon={Clock} />
        <StatCard label="p90 Duration" value={d.p90_label ?? '—'} sub={`${data.runs_analysed ?? 0} runs analysed`} color="text-neutral-300" icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {byDay.length > 0 && (
          <div className="md:col-span-2 bg-surface-1 border border-border rounded-lg p-3">
            <p className="text-xs text-gray-500 font-medium mb-3">Daily Runs — last 14 days</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={byDay} barSize={10}>
                <XAxis dataKey="date" tick={{ fill: '#86939e', fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={20} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 }} itemStyle={{ color: '#1d2226' }} labelStyle={{ color: '#56687a', marginBottom: 4 }} />
                <Bar dataKey="success" name="Success" stackId="a" fill="#76b900" />
                <Bar dataKey="failure" name="Failure" stackId="a" fill="#ff1b2d" radius={[2, 2, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {topActors.length > 0 && (
          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <p className="text-xs text-gray-500 font-medium mb-3 flex items-center gap-1">
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
                      <div className="h-full rounded-full bg-nvidia transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {(data.in_progress ?? 0) > 0 && (
        <div className="flex items-center gap-2 text-xs text-nvidia bg-[#76b900]/[.07] ring-1 ring-[#76b900]/25 border border-[#76b900]/20 rounded-lg px-3 py-2">
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
        <div className="mt-2 bg-accent-red/[.03] rounded border border-accent-red/20 p-2.5 space-y-2.5">
          {isLoading && <p className="text-[10px] text-gray-400">Fetching logs…</p>}
          {data?.summaries?.map((s: any, i: number) => (
            <div key={i} className="space-y-1">
              <p className="text-[10px] font-semibold text-accent-red flex items-center gap-1">
                <XCircle size={9} /> {s.job}
                {s.runner && <span className="text-gray-400 font-normal ml-1">on {s.runner}</span>}
              </p>
              {s.failed_steps?.map((step: any) => (
                <p key={step.number} className="text-[10px] text-red-400 pl-3 flex items-center gap-1">
                  <AlertTriangle size={8} /> Step {step.number}: {step.name}
                </p>
              ))}
              {s.error_lines?.length > 0 && (
                <div className="bg-surface-2 rounded p-1.5 font-mono max-h-32 overflow-y-auto border border-border">
                  {s.error_lines.map((line: string, li: number) => (
                    <p key={li} className={clsx(
                      'text-[9px] leading-4 break-all',
                      line.toLowerCase().includes('error') || line.includes('##[error]')
                        ? 'text-accent-red'
                        : line.toLowerCase().includes('traceback') || line.toLowerCase().includes('exception')
                        ? 'text-red-400'
                        : 'text-gray-400',
                    )}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {data?.failed_jobs === 0 && (
            <p className="text-[10px] text-gray-400">No failed jobs found.</p>
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
          {j.runner_name && <p className="text-[10px] text-gray-400 mt-1">runner: {j.runner_name}</p>}
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
  if (isLoading) return <p className="text-[10px] text-gray-400">Loading artifacts…</p>
  if (!artifacts.length) return <p className="text-[10px] text-gray-400">No artifacts.</p>
  return (
    <div className="space-y-1.5">
      {artifacts.map((a: any) => (
        <div key={a.id} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Package size={11} className="text-gray-500" />
            <span className="text-gray-200">{a.name}</span>
            <span className="text-gray-400">{a.size_kb} KB</span>
            {a.expired && <span className="text-accent-red text-[9px]">EXPIRED</span>}
          </div>
          {!a.expired && a.url && (
            <a href={a.url} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-neutral-200 hover:underline text-[10px]">Download ↗</a>
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-border card-head">
          <span className="text-sm font-medium">Live Logs — run #{runId}</span>
          <div className="flex items-center gap-3">
            {done ? <span className="text-xs text-nvidia">Stream complete</span> : <span className="text-xs text-nvidia animate-pulse">Streaming…</span>}
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
              <span className="text-[10px] text-gray-400 font-mono">#{run.run_number}</span>
              {showWorkflow && (run as any).workflow_label && (
                <span className="text-[10px] bg-surface-3 text-gray-400 px-1.5 py-0.5 rounded">
                  {(run as any).workflow_label}
                </span>
              )}
              <span className="text-[10px] text-gray-400 bg-surface-2 px-1.5 py-0.5 rounded">{run.event}</span>
              {run.duration_label && run.duration_label !== '—' && (
                <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                  <Clock size={9} /> {run.duration_label}
                </span>
              )}
              {isInProgress && (
                <span className="flex items-center gap-1 text-[10px] text-nvidia">
                  <span className="w-1.5 h-1.5 rounded-full bg-nvidia animate-pulse" />
                  {run.status === 'queued' ? 'Queued' : 'Running'}
                </span>
              )}
            </div>
            <p className="text-sm text-white truncate font-medium">{run.display_title || run.head_branch}</p>
            <div className="flex flex-wrap items-center gap-2.5 mt-1 text-[10px] text-gray-500">
              <span className="text-gray-500 font-mono">{run.head_branch}</span>
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
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25 hover:bg-accent-red/10 disabled:opacity-50 transition-colors">
                <StopCircle size={10} />
                {cancelling ? '…' : 'Cancel'}
              </button>
            )}
            {isFailed && (
              <button onClick={() => rerunFailed()} disabled={rerunningFailed}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25 hover:bg-surface-3 disabled:opacity-50 transition-colors">
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
              <ExternalLink size={12} className="text-gray-500 hover:text-neutral-300" />
            </a>
            <button onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse run details' : 'Expand run details'}
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
    <div className="bg-[#76b900]/[.05] border border-[#76b900]/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-nvidia animate-pulse" />
        <p className="text-xs font-semibold text-nvidia">{live.length} run{live.length !== 1 ? 's' : ''} in progress</p>
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
                  <span className="bg-surface-3 text-gray-400 px-1.5 py-0.5 rounded text-[9px]">
                    {(r as any).workflow_label || r.name}
                  </span>
                  <span className="text-gray-500 font-mono">{r.head_branch}</span>
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
                  <ExternalLink size={11} className="text-gray-500 hover:text-neutral-300" />
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
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25 hover:bg-accent-red/10 disabled:opacity-50">
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
          <span className="text-xs text-gray-500 font-medium">Filters</span>
          {isFetching && <span className="text-[9px] text-gray-400 animate-pulse ml-auto">Refreshing…</span>}
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
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-32 text-white placeholder-gray-500 focus:outline-none focus:border-neutral-500" />
          </div>
          {/* Event */}
          <select value={event} onChange={(e) => { setEvent(e.target.value); setPage(1) }}
            className="bg-surface-2 border border-border rounded-md px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-neutral-500">
            <option value="">Event: all</option>
            {GH_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
          {/* Actor */}
          <div className="relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={actor} onChange={(e) => { setActor(e.target.value); setPage(1) }}
              placeholder="actor / author"
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-36 text-white placeholder-gray-500 focus:outline-none focus:border-neutral-500" />
          </div>
          {/* Clear */}
          {(branch || event || actor || statusFilter !== 'all') && (
            <button onClick={() => { setStatusFilter('all'); setBranch(''); setEvent(''); setActor(''); setPage(1) }}
              className="text-[10px] text-gray-400 hover:text-gray-400 px-1.5">
              ✕ Clear
            </button>
          )}
          <span className="text-[10px] text-gray-400 ml-auto">
            {total.toLocaleString()} total runs
          </span>
        </div>
      </div>

      {/* Live runs section */}
      <LiveRunsBanner runs={runs} />

      {isLoading && (
        <div className="flex items-center justify-center py-12 gap-2 text-[12px] text-gray-500">
          <span className="w-3.5 h-3.5 rounded-full border border-border border-t-accent-blue animate-spin" />
          Loading runs…
        </div>
      )}
      {isError && <div className="py-12 text-center text-[12px] text-accent-red">Failed to load runs.</div>}
      {!isLoading && !isError && displayed.length === 0 && (
        <div className="py-12 text-center text-[12px] text-gray-500">No runs match the selected filters.</div>
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
  if (!lastAccessedAt) return { label: 'unknown', color: 'text-gray-400' }
  const days = Math.floor((Date.now() - new Date(lastAccessedAt).getTime()) / 86_400_000)
  if (days <= 3) return { label: `${days}d ago`, color: 'text-accent-green' }
  if (days <= 7) return { label: `${days}d ago`, color: 'text-neutral-400' }
  if (days <= 30) return { label: `${days}d ago`, color: 'text-neutral-500' }
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
          <StatCard label="Total Size" value={data.total_size_label} color="text-neutral-300" icon={HardDrive}
            sub={`${usedPct.toFixed(1)}% of ${GH_CACHE_LIMIT_GB}GB limit`} />
          <StatCard label="Stale (>7d)" value={staleCount}
            color={staleCount > 5 ? 'text-accent-red' : staleCount > 0 ? 'text-neutral-400' : 'text-nvidia'}
            icon={Clock} sub="last accessed >7 days ago" />
          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <p className="text-xs text-gray-500 font-medium mb-1.5">Key Prefixes</p>
            <div className="space-y-0.5">
              {topPrefixes.map(([prefix, count]) => (
                <div key={prefix} className="flex justify-between text-[10px]">
                  <span className="font-mono text-gray-400">{prefix}-*</span>
                  <span className="text-gray-400">{count}</span>
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
            <span className={clsx(usedPct > 80 ? 'text-accent-red' : usedPct > 60 ? 'text-neutral-300' : 'text-nvidia')}>
              {data.total_size_label} / {GH_CACHE_LIMIT_GB}GB
            </span>
          </div>
          <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', usedPct > 80 ? 'bg-accent-red' : 'bg-nvidia')}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="text-[9px] text-gray-400 mt-1">Caches exceeding the limit are evicted automatically (oldest first)</p>
        </div>
      )}

      {/* By-branch breakdown */}
      {data?.by_ref?.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-3">
          <p className="text-xs text-gray-500 font-medium mb-2">Storage by Branch</p>
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
                    <div className="h-full bg-nvidia rounded-full" style={{ width: `${pct}%` }} />
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
            className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-40 text-white placeholder-gray-500 focus:outline-none focus:border-neutral-500" />
        </div>
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)} placeholder="filter by key"
            className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-52 text-white placeholder-gray-500 focus:outline-none focus:border-neutral-500" />
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
              <div key={h} className="bg-surface-2 px-3 py-2 text-xs text-gray-500 font-medium">{h}</div>
            ))}
            {caches.map((c: any) => {
              const s = staleness(c.last_accessed_at)
              return (
                <>
                  <div key={`${c.id}-key`} className="bg-surface-1 px-3 py-2.5 font-mono text-[10px] text-gray-200 truncate" title={c.key}>{c.key}</div>
                  <div key={`${c.id}-ref`} className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-500 font-mono">{c.ref || '—'}</div>
                  <div key={`${c.id}-size`} className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-300 text-right">{c.size_label}</div>
                  <div key={`${c.id}-acc`} className={clsx('bg-surface-1 px-3 py-2.5 text-[10px]', s.color)}>{s.label}</div>
                  <div key={`${c.id}-del`} className="bg-surface-1 px-3 py-2.5 flex items-center justify-center">
                    <button onClick={() => del(c.id)} disabled={deleting && deletingId === c.id}
                      className="p-1 rounded text-gray-400 hover:text-accent-red hover:bg-accent-red/10 transition-colors disabled:opacity-50">
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
  success: 'text-emerald-400 bg-emerald-500/[.07] ring-1 ring-emerald-500/25',
  active: 'text-emerald-400 bg-emerald-500/[.07] ring-1 ring-emerald-500/25',
  failure: 'text-red-400 bg-red-500/[.07] ring-1 ring-red-500/25',
  error: 'text-red-400 bg-red-500/[.07] ring-1 ring-red-500/25',
  inactive: 'text-gray-400 bg-surface-3',
  pending: 'text-neutral-400 bg-neutral-500/[.07] ring-1 ring-neutral-500/25',
  in_progress: 'text-nvidia bg-[#76b900]/[.07] ring-1 ring-[#76b900]/25',
  queued: 'text-gray-400 bg-surface-3',
}

function statusDot(status: string) {
  if (status === 'success' || status === 'active') return 'bg-accent-green'
  if (status === 'failure' || status === 'error') return 'bg-accent-red'
  if (status === 'in_progress') return 'bg-nvidia animate-pulse'
  if (status === 'pending') return 'bg-neutral-400'
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
        <p className="text-xs text-gray-500 font-semibold px-2 py-1.5">Environments</p>

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
                  <span className="text-[9px] text-nvidia flex-shrink-0">★</span>
                )}
              </div>
              {s?.lastAt && (
                <p className="text-[9px] text-gray-400 mt-0.5 pl-3.5">
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
                    <span className="text-[10px] text-gray-400 bg-surface-2 px-1.5 py-0.5 rounded">{d.task}</span>
                    <span className="font-mono text-[10px] text-gray-500">{d.ref}</span>
                    <span className="font-mono text-[10px] text-gray-400">{d.sha}</span>
                  </div>
                  {d.description && (
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{d.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
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
                      <ExternalLink size={11} className="text-gray-500 hover:text-neutral-300" />
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
                color="text-neutral-300"
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
                color="text-neutral-300"
              />
              <StatCard
                label="GitHub billable"
                value="0m"
                sub="self-hosted runners"
                icon={Timer}
                color="text-gray-400"
              />
            </>
          ) : (
            <>
              <StatCard label="Total Billable" value={`${data.total_min}m`} icon={Timer} color="text-neutral-300" />
              <StatCard label="Ubuntu" value={`${data.total_ubuntu_min}m`} icon={Timer} color="text-nvidia" sub="Linux runners" />
              <StatCard label="macOS" value={`${data.total_macos_min}m`} icon={Timer} color="text-neutral-300" sub="macOS runners" />
              <StatCard label="Wall-Clock Total" value={`${data.total_actual_min}m`} icon={Clock} color="text-neutral-300" sub="from recent runs" />
            </>
          )}
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Fetching workflow usage…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load usage.</div>}

      {/* Chart */}
      {workflows.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium mb-4">
            {chartLabel} by Workflow
          </p>
          <ResponsiveContainer width="100%" height={Math.max(180, workflows.length * 28)}>
            <BarChart data={workflows} layout="vertical" barSize={10} margin={{ left: 0, right: 60 }}>
              <XAxis type="number" tick={{ fill: '#86939e', fontSize: 9 }} unit="m" />
              <YAxis type="category" dataKey="name" tick={{ fill: '#1d2226', fontSize: 9 }} width={180} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 }}
                formatter={(v: any, name: string) => [`${v}m`, name]}
              />
              {selfHosted ? (
                <>
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="actual_min" name="Wall-clock (min)" fill="#76b900" radius={[0, 2, 2, 0]} />
                </>
              ) : (
                <>
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="ubuntu_min" name="Ubuntu" stackId="a" fill="#76b900" />
                  <Bar dataKey="macos_min" name="macOS" stackId="a" fill="#bab9b6" />
                  <Bar dataKey="windows_min" name="Windows" stackId="a" fill="#a19f9a" radius={[0, 2, 2, 0]} />
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
              <div key={h} className="bg-surface-2 px-3 py-2 text-xs text-gray-500 font-medium">{h}</div>
            ))}
            {workflows.map((w: any) => (
              selfHosted ? (
                <div key={w.id} className="contents">
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-200 truncate">{w.name}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-400 text-right tabular-nums">{w.run_count}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-400 text-right tabular-nums">{w.avg_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-white font-semibold text-right tabular-nums">{w.actual_min}m</div>
                </div>
              ) : (
                <div key={w.id} className="contents">
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-200 truncate">{w.name}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-400 text-right">{w.ubuntu_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-400 text-right">{w.macos_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-400 text-right">{w.windows_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-200 font-semibold text-right">{w.total_min}m</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-400 text-right">{w.actual_min}m</div>
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
  const [days, setDays] = useState<1 | 3 | 7 | 14 | 130>(14)
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
          <TrendingUp size={13} className="text-neutral-500" />
          <span className="text-xs font-medium text-gray-300">Cross-Workflow Performance</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={11} className="text-gray-500" />
          {([1, 3, 7, 14, 130] as const).map((d) => (
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
            color={best?.success_rate >= 80 ? 'text-nvidia' : 'text-neutral-300'}
            icon={CheckCircle2}
          />
          <StatCard
            label="Fastest Avg Duration"
            value={fastest?.avg_label ?? '—'}
            sub={fastest?.workflow}
            color="text-neutral-300"
            icon={Clock}
          />
          <StatCard
            label="Most Active"
            value={heaviest?.total ?? '—'}
            sub={`${heaviest?.workflow ?? ''} · ${days}d`}
            color="text-neutral-300"
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
          <p className="text-xs text-gray-500 font-medium mb-4">
            Avg Run Duration by Workflow (minutes) — {days}d window
          </p>
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 34)}>
            <BarChart data={chartData} layout="vertical" barSize={7} margin={{ left: 0, right: 60 }}>
              <XAxis type="number" tick={{ fill: '#86939e', fontSize: 9 }} unit="m" />
              <YAxis type="category" dataKey="name" tick={{ fill: '#1d2226', fontSize: 9 }} width={155} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 }}
                formatter={(v: any, name: string) => [`${v}m`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="avg" name="Avg" fill="#76b900" />
              <Bar dataKey="p50" name="p50 (median)" fill="#bab9b6" />
              <Bar dataKey="p90" name="p90" fill="#a19f9a" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detailed table: matches GitHub "Actions Performance Metrics" layout */}
      {sorted.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-xs text-gray-500 font-medium">Per-Workflow Details</p>
            <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5">
              {([['failure_rate', 'Job Failures'], ['avg', 'Duration'], ['total', 'Runs']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key as any)}
                  className={clsx('px-2 py-0.5 rounded text-[9px] transition-colors',
                    sortBy === key ? 'bg-surface-3 text-white' : 'text-gray-400 hover:text-gray-400')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-px bg-border">
            {['Workflow', 'Runs', 'Failures %', 'Avg', 'p50', 'p90', 'Success'].map((h) => (
              <div key={h} className="bg-surface-2 px-3 py-2 text-xs text-gray-500 font-medium">{h}</div>
            ))}
            {sorted.map((w) => {
              const failurePct = w.total ? +((w.failure / w.total) * 100).toFixed(0) : 0
              return (
                <div key={w.filename} className="contents">
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-200 truncate">{w.workflow}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-gray-400 text-right">{w.total}</div>
                  <div className={clsx('bg-surface-1 px-3 py-2.5 text-[10px] font-semibold text-right',
                    failurePct >= 30 ? 'text-accent-red' : failurePct >= 10 ? 'text-neutral-400' : 'text-nvidia')}>
                    {failurePct}%
                  </div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-400 text-right">{w.avg_label ?? '—'}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-500 text-right">{w.p50_label ?? '—'}</div>
                  <div className="bg-surface-1 px-3 py-2.5 text-[10px] text-neutral-500 text-right">{w.p90_label ?? '—'}</div>
                  <div className={clsx('bg-surface-1 px-3 py-2.5 text-[10px] font-semibold text-right',
                    w.success_rate == null ? 'text-gray-400' : w.success_rate >= 80 ? 'text-nvidia' : w.success_rate >= 60 ? 'text-neutral-400' : 'text-accent-red')}>
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
          <StatCard label="Active" value={activeCount} color="text-nvidia" icon={CheckCircle2} />
          <StatCard label="Pinned" value={pinnedCount} color="text-neutral-300" icon={TrendingUp} sub="tracked in pipeline tabs" />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workflows…"
            className="w-full bg-surface-2 border border-border rounded-md pl-6 pr-2 py-1 text-[10px] text-white placeholder-gray-500 focus:outline-none focus:border-neutral-500" />
        </div>
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} className="w-3 h-3" />
          Show disabled
        </label>
        <span className="text-[10px] text-gray-400 ml-auto">{filtered.length} of {data?.total ?? '…'} workflows</span>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Loading workflows…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load workflows.</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filtered.map((w) => (
          <div key={w.id} className={clsx(
            'bg-surface-1 border rounded-xl px-4 py-3 flex items-start gap-3 transition-colors',
            w.pinned ? 'border-[#76b900]/20 hover:border-[#76b900]/40' : 'border-border hover:border-gray-600',
            w.state !== 'active' && 'opacity-60',
          )}>
            <div className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
              w.state === 'active' ? 'bg-nvidia' : 'bg-gray-600')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                {w.pinned && (
                  <span className="text-[9px] bg-surface-3 text-gray-400 ring-1 ring-border px-1.5 py-0.5 rounded flex-shrink-0">Pinned</span>
                )}
                <span className="text-xs font-medium text-white truncate">{w.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-400 flex-wrap">
                {w.last_branch && <span className="text-gray-500 font-mono">{w.last_branch}</span>}
                {w.last_run_at && (
                  <span>{formatDistanceToNow(new Date(w.last_run_at), { addSuffix: true })}</span>
                )}
                {w.state !== 'active' && (
                  <span className="text-gray-400 bg-surface-3 px-1.5 py-0.5 rounded">disabled</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {w.last_status && <StatusBadge status={w.last_status} />}
              {w.html_url && (
                <a href={w.html_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={11} className="text-gray-400 hover:text-neutral-300" />
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
            <BarChart3 size={14} className="text-neutral-500" />
            Pipeline Statistics
            {showStats ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
          </button>
          <div className="flex items-center gap-1">
            <Calendar size={11} className="text-gray-500" />
            {([1, 3, 7, 14, 130] as StatsWindow[]).map((d) => (
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
            className="bg-surface-2 border border-border rounded-md px-2 py-1 text-xs w-40 text-white placeholder-gray-500 focus:outline-none focus:border-neutral-500" />
          {branch && <button onClick={() => setBranch('')} className="text-gray-400 hover:text-gray-400 text-xs">✕</button>}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{runs.length} runs</span>
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

// ── Nightly: cell colour ─────────────────────────────────────────────────────

function nightlyCellStyle(status: string | undefined) {
  if (!status) return { bg: 'bg-surface-2 border border-border', text: 'text-gray-500', sym: '—' }
  const s = status.toLowerCase()
  if (s === 'success')
    return { bg: 'bg-accent-green/10 border border-accent-green/25', text: 'text-accent-green', sym: '✓' }
  if (s === 'failure')
    return { bg: 'bg-accent-red/10 border border-accent-red/25', text: 'text-accent-red', sym: '✗' }
  if (['in_progress', 'queued'].includes(s))
    return { bg: 'bg-accent-blue/10 border border-accent-blue/25 animate-pulse', text: 'text-accent-blue', sym: '~' }
  if (s === 'skipped')
    return { bg: 'bg-surface-2 border border-border', text: 'text-gray-500', sym: '⊘' }
  return { bg: 'bg-surface-2 border border-border', text: 'text-gray-500', sym: '?' }
}

// ── Nightly: job matrix ──────────────────────────────────────────────────────

function NightlyMatrixTable() {
  const [days, setDays] = useState<1 | 3 | 7 | 14 | 130>(14)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['nightly-matrix', days],
    queryFn: () => getNightlyMatrix(days),
    refetchInterval: 120_000,
  })

  if (isLoading) return <div className="text-center py-10 text-gray-500 text-sm">Loading matrix — fetching job data…</div>
  if (isError) return (
    <div className="text-center py-10 text-[12px] text-gray-500">
      Failed to load — <button onClick={() => refetch()} className="text-accent-blue hover:underline">retry</button>
    </div>
  )

  const dates: string[] = data?.dates ?? []
  const matrix: Record<string, Record<string, any>> = data?.matrix ?? {}
  const jobNames: string[] = data?.job_names ?? []
  const flaky: string[] = data?.flaky_jobs ?? []
  const consecutive: Record<string, number> = data?.consecutive_failures ?? {}

  if (dates.length === 0) return <p className="text-gray-400 text-sm text-center py-6">No nightly runs found.</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Window:</span>
          {([1, 3, 7, 14, 130] as const).map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={clsx('px-2 py-0.5 rounded transition-colors',
                days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}>
              {d}d
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          {[{ sym: '✓', cls: 'text-accent-green', label: 'pass' },
            { sym: '✗', cls: 'text-accent-red', label: 'fail' },
            { sym: '~', cls: 'text-accent-blue', label: 'running' },
            { sym: '—', cls: 'text-gray-400', label: 'no run' }].map(({ sym, cls, label }) => (
            <span key={label} className="flex items-center gap-1"><span className={cls}>{sym}</span> {label}</span>
          ))}
          <button onClick={() => refetch()} className="p-1 rounded hover:bg-surface-2 text-gray-400 hover:text-white ml-1">
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {flaky.length > 0 && (
        <div className="flex items-start gap-2 bg-yellow-950/40 border border-yellow-800 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="text-accent-yellow mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-medium text-accent-yellow">Flaky jobs detected</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{flaky.join(' · ')}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-normal pb-2 pr-4 whitespace-nowrap min-w-[220px]">Job</th>
              {dates.map((d) => (
                <th key={d} className="text-[9px] text-gray-400 font-normal pb-2 px-0.5 text-center whitespace-nowrap">{d.slice(5)}</th>
              ))}
              <th className="text-[9px] text-gray-400 font-normal pb-2 px-2 text-center whitespace-nowrap">Streak</th>
            </tr>
          </thead>
          <tbody>
            {jobNames.map((name) => {
              const isFlaky = flaky.includes(name)
              const streak = consecutive[name] ?? 0
              return (
                <tr key={name} className={isFlaky ? 'bg-yellow-950/10' : ''}>
                  <td className="pr-4 py-1 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isFlaky && <Zap size={9} className="text-accent-yellow flex-shrink-0" />}
                      <span className={clsx('text-gray-300 truncate max-w-[200px]', isFlaky && 'text-accent-yellow')}>{name}</span>
                    </div>
                  </td>
                  {dates.map((d) => {
                    const cell = matrix[d]?.[name]
                    const { bg, text, sym } = nightlyCellStyle(cell?.status)
                    return (
                      <td key={d} className="px-0.5 py-1 text-center">
                        {cell ? (
                          <a href={cell.url} target="_blank" rel="noreferrer">
                            <span className={clsx('inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold cursor-pointer transition-opacity hover:opacity-70', bg, text)}
                              title={`${name}\n${d}: ${cell.status}`}>{sym}</span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center justify-center w-7 h-5 rounded text-[10px] text-gray-400">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-1 text-center">
                    {streak > 0
                      ? <span className="text-[10px] text-accent-red font-semibold">{streak}×</span>
                      : <span className="text-[10px] text-gray-400">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Nightly: trend chart ─────────────────────────────────────────────────────

function NightlyTrendChart() {
  const [days, setDays] = useState<1 | 3 | 7 | 14 | 130>(14)
  const { data, isLoading } = useQuery({
    queryKey: ['nightly-trend', days],
    queryFn: () => getNightlyTrend(days),
    refetchInterval: 300_000,
  })
  const trend = [...(data?.trend ?? [])].reverse()

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="section-head">Nightly Pass Rate Trend</span>
        <div className="flex items-center gap-1 text-[10px]">
          {([1, 3, 7, 14, 130] as const).map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={clsx('px-1.5 py-0.5 rounded', days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      {isLoading && <div className="h-[120px] flex items-center justify-center text-gray-400 text-xs">Loading…</div>}
      {!isLoading && trend.length === 0 && <div className="h-[120px] flex items-center justify-center text-gray-400 text-xs">No data in this window.</div>}
      {!isLoading && trend.length > 0 && (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" />
            <XAxis dataKey="date" tick={{ fill: '#86939e', fontSize: 9 }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fill: '#86939e', fontSize: 9 }} tickFormatter={(v) => `${v}%`} width={32} />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 6, fontSize: 11 }}
              formatter={(v: any) => [`${v}%`, 'Pass rate']}
            />
            <Line type="monotone" dataKey="pass_rate" stroke="#76b900" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#76b900' }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Nightly: failure detail ───────────────────────────────────────────────────

function NightlyFailureDetail({ runId }: { runId: number }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['failure-summary', runId],
    queryFn: () => getFailureSummary(runId),
    enabled: open,
    staleTime: 300_000,
  })

  return (
    <div className="mt-2 border-t border-red-900/20 pt-2">
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-accent-red hover:text-red-400 transition-colors">
        <Terminal size={9} />
        {open ? 'Hide error detail' : 'Show error detail'}
        {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>
      {open && (
        <div className="mt-2 bg-black/40 rounded border border-red-900/40 p-2.5 space-y-3">
          {isLoading && <p className="text-[10px] text-gray-400">Fetching job logs…</p>}
          {data?.summaries?.length === 0 && !isLoading && (
            <p className="text-[10px] text-gray-400">No failed jobs found in this run.</p>
          )}
          {data?.summaries?.map((s: any, i: number) => (
            <div key={i} className="space-y-1">
              <p className="text-[10px] font-semibold text-accent-red flex items-center gap-1">
                <XCircle size={9} /> {s.job}
                {s.runner && <span className="text-gray-400 font-normal ml-1">on {s.runner}</span>}
              </p>
              {s.failed_steps?.map((step: any) => (
                <p key={step.number} className="text-[10px] text-orange-400 pl-3 flex items-center gap-1">
                  <AlertTriangle size={8} /> Step {step.number}: {step.name}
                </p>
              ))}
              {s.error_lines?.length > 0 && (
                <div className="bg-black/60 rounded p-1.5 font-mono max-h-40 overflow-y-auto">
                  {s.error_lines.map((line: string, li: number) => (
                    <p key={li} className={clsx(
                      'text-[9px] leading-4 break-all whitespace-pre-wrap',
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
        </div>
      )}
    </div>
  )
}

// ── Nightly: recent runs ─────────────────────────────────────────────────────

function NightlyRecentRuns() {
  const { data, isLoading } = useQuery({
    queryKey: ['nightly-runs'],
    queryFn: () => getNightlyRuns(),
    refetchInterval: 60_000,
  })
  const runs: WorkflowRun[] = data?.workflow_runs ?? []
  if (isLoading || runs.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="section-head">Recent Nightly Runs</div>
      {runs.slice(0, 15).map((r) => {
        const isFailed = r.conclusion === 'failure' || r.conclusion === 'timed_out'
        const isRunning = r.status === 'in_progress' || r.status === 'queued'
        const dur = (r as any).duration_label
        return (
          <div key={r.id} className={clsx('bg-surface-1 border rounded-xl px-4 py-3',
            isFailed ? 'border-red-900/40' : 'border-border')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <StatusBadge status={r.conclusion ?? r.status} />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate font-medium">{r.display_title || r.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 flex-wrap">
                    <span className="text-accent-blue font-mono">{r.head_branch}</span>
                    <span className="font-mono">{r.head_sha?.slice(0, 7)}</span>
                    <span>{r.created_at.slice(0, 10)}</span>
                    <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                    {dur && dur !== '—' && <span className="flex items-center gap-0.5"><Clock size={9} /> {dur}</span>}
                    {isRunning && (
                      <span className="flex items-center gap-1 text-accent-blue">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                        {r.status === 'queued' ? 'Queued' : 'Running'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <a href={r.html_url} target="_blank" rel="noreferrer" className="flex-shrink-0 ml-3">
                <ExternalLink size={12} className="text-gray-500 hover:text-accent-blue" />
              </a>
            </div>
            {isFailed && <NightlyFailureDetail runId={r.id} />}
          </div>
        )
      })}
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
  const [nightlyRef, setNightlyRef] = useState('main')
  const qc = useQueryClient()

  const { mutate: trigger, isPending: triggering } = useMutation({
    mutationFn: () => triggerBuild(ref, workflow === 'all' ? '' : workflow),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['build-runs'] }), 3000),
  })

  const { mutate: triggerNight, isPending: triggeringNight } = useMutation({
    mutationFn: () => triggerNightly(nightlyRef),
  })

  return (
    <div className="space-y-4">

      {/* ── Primary tab navigation ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-surface-2 rounded-xl p-1">
          {([
            { key: 'runs',       icon: Activity, label: 'Runs'       },
            { key: 'nightly',    icon: Moon,     label: 'Nightly'    },
            { key: 'management', icon: Settings, label: 'Management' },
          ] as { key: MainMode; icon: any; label: string }[]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                mode === key
                  ? 'bg-surface-3 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-surface-3/50',
              )}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>

        {/* Contextual right actions */}
        <div className="flex items-center gap-2">
          {mode === 'runs' && workflow !== 'all' && workflow !== 'list' && (
            <>
              <input value={ref} onChange={(e) => setRef(e.target.value)}
                className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs w-28 text-white focus:outline-none focus:border-neutral-500"
                placeholder="branch / ref" />
              <button onClick={() => trigger()} disabled={triggering}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-nvidia text-black hover:bg-[#5a8c00] disabled:opacity-50 transition-colors">
                <Play size={11} />
                {triggering ? 'Queuing…' : 'Trigger'}
              </button>
            </>
          )}
          {mode === 'nightly' && (
            <>
              <input value={nightlyRef} onChange={(e) => setNightlyRef(e.target.value)}
                className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs w-24 text-white focus:outline-none focus:border-neutral-500"
                placeholder="ref" />
              <button onClick={() => triggerNight()} disabled={triggeringNight}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-accent-yellow text-black hover:opacity-90 disabled:opacity-50 font-medium transition-colors">
                <Play size={11} />
                {triggeringNight ? 'Triggering…' : 'Run Nightly'}
              </button>
            </>
          )}
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['build-runs'] })
              qc.invalidateQueries({ queryKey: ['all-runs'] })
              if (mode === 'nightly') {
                qc.invalidateQueries({ queryKey: ['nightly-matrix'] })
                qc.invalidateQueries({ queryKey: ['nightly-runs'] })
                qc.invalidateQueries({ queryKey: ['nightly-trend'] })
              }
            }}
            className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── Sub-navigation ──────────────────────────────────────────────── */}
      {mode === 'runs' && (
        <div className="flex flex-wrap gap-1 pb-3 border-b border-border">
          <button onClick={() => setWorkflow('all')}
            className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              workflow === 'all' ? 'bg-surface-3 text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200')}>
            All Runs
          </button>
          {PINNED.map((w) => (
            <button key={w.filename} onClick={() => setWorkflow(w.filename)}
              className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                workflow === w.filename ? 'bg-surface-3 text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200')}>
              {w.label}
            </button>
          ))}
          <button onClick={() => setWorkflow('list')}
            className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              workflow === 'list' ? 'bg-surface-3 text-white' : 'bg-surface-2 text-gray-500 hover:bg-surface-3 hover:text-gray-300')}>
            Browse All →
          </button>
        </div>
      )}

      {mode === 'nightly' && (
        <div className="pb-3 border-b border-border" />
      )}

      {mode === 'management' && (
        <div className="flex flex-wrap gap-1 pb-3 border-b border-border">
          {([
            { key: 'caches',      icon: HardDrive,  label: 'Caches'           },
            { key: 'deployments', icon: Rocket,     label: 'Deployments'      },
            { key: 'usage',       icon: BarChart3,  label: 'Usage / Billing'  },
            { key: 'performance', icon: TrendingUp, label: 'Performance'      },
          ] as { key: MgmtTab; icon: any; label: string }[]).map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setMgmtTab(key)}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                mgmtTab === key ? 'bg-surface-3 text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200')}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab content ─────────────────────────────────────────────────── */}
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

      {mode === 'nightly' && (
        <div className="space-y-5">
          <NightlyTrendChart />
          <div className="bg-surface-1 border border-border rounded-xl p-4">
            <div className="section-head">Isaac Sim Compatibility Matrix</div>
            <NightlyMatrixTable />
          </div>
          <NightlyRecentRuns />
        </div>
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
