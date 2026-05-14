import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import {
  CheckCircle, XCircle, Circle, Minus, AlertTriangle,
  ExternalLink, ChevronRight, GitBranch, Cpu, Package,
  Server, Boxes, Clock, RefreshCw, ShieldCheck, GitPullRequest,
  Activity, TrendingUp, TrendingDown,
} from 'lucide-react'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import {
  getOverviewSummary, getNightlyRuns,
  getAllRuns, getRunners,
  getNightlyImageMatrix,
  getRegistryPushStatus, getActiveRunners,
  getPRGateOverview, getActiveRepo,
} from '../lib/api'
import BusinessReport from '../components/BusinessReport'
import { useCountUp } from '../hooks/useCountUp'

// ── Engineering Health Score ──────────────────────────────────────────────────

interface HealthScoreProps {
  builds?: any
  nightly?: any
  prs?: any
}

function HealthScore({ builds, nightly, prs }: HealthScoreProps) {
  // CI Pass Rate (0-100)
  const ciPassRate: number = builds?.success_rate_last10 ?? 0

  // Nightly Health (0-100 based on consecutive_failures)
  const consecutiveFailures: number = nightly?.consecutive_failures ?? 0
  const nightlyHealth: number =
    consecutiveFailures === 0 ? 100
    : consecutiveFailures === 1 ? 80
    : consecutiveFailures === 2 ? 50
    : 0

  // PR Pipeline (ready / max(open, 1)) * 100
  const openPRs: number = prs?.open ?? 0
  const readyPRs: number = prs?.ready ?? 0
  const prPipeline: number = Math.round((readyPRs / Math.max(openPRs, 1)) * 100)

  // Weighted score
  const score = Math.round(
    ciPassRate * 0.40 + nightlyHealth * 0.35 + prPipeline * 0.25
  )

  // Label and colors
  const { label, ringColor, textColor } = score >= 80
    ? { label: 'Elite',    ringColor: 'text-[#E0FF4F]', textColor: 'text-[#E0FF4F]' }
    : score >= 65
    ? { label: 'Healthy',  ringColor: 'text-accent-green', textColor: 'text-accent-green' }
    : score >= 45
    ? { label: 'At Risk',  ringColor: 'text-accent-yellow', textColor: 'text-accent-yellow' }
    : { label: 'Critical', ringColor: 'text-accent-red', textColor: 'text-accent-red' }

  // SVG ring params
  const RADIUS = 30
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const arcLength = (score / 100) * CIRCUMFERENCE
  const ringStroke = score >= 80 ? '#E0FF4F' : score >= 65 ? '#76b900' : score >= 45 ? '#f59e0b' : '#ff1b2d'

  // vs last period: use week_score if available
  const prevScore: number | null = builds?.success_rate_last_week ?? null
  const prevNightlyHealth: number | null = null // not available in current data
  const weeklyDelta: number | null =
    prevScore != null
      ? Math.round(prevScore * 0.40 + (prevNightlyHealth ?? nightlyHealth) * 0.35 + prPipeline * 0.25) - score
      : null

  const components = [
    { label: 'CI Pass Rate',        value: ciPassRate,  weight: '40%' },
    { label: 'Nightly Health',      value: nightlyHealth, weight: '35%' },
    { label: 'PR Pipeline Health',  value: prPipeline,  weight: '25%' },
  ]

  const loading = !builds && !nightly && !prs

  if (loading) {
    return (
      <div className="bg-surface-1 border border-border rounded-xl p-4 flex items-center justify-center py-8">
        <RefreshCw size={14} className="animate-spin text-gray-500 mr-2" />
        <span className="text-sm text-gray-500">Computing health score…</span>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 card-appear">
      <div className="flex items-center gap-3 mb-4">
        <Activity size={14} className="text-gray-400" />
        <h2 className="text-sm font-semibold text-white">Engineering Health Score</h2>
        <span className="text-[10px] text-gray-500 ml-auto">CI · Nightly · PRs</span>
      </div>

      <div className="flex items-center gap-6">
        {/* Score ring */}
        <div className="flex-shrink-0 relative">
          <svg width="80" height="80" viewBox="0 0 80 80">
            {/* Background track */}
            <circle
              cx="40" cy="40" r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-surface-3"
            />
            {/* Score arc */}
            <circle
              cx="40" cy="40" r={RADIUS}
              fill="none"
              stroke={ringStroke}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${CIRCUMFERENCE}`}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={clsx('text-xl font-bold font-mono leading-none', textColor)}>{score}</span>
            <span className={clsx('text-[9px] font-semibold mt-0.5', textColor)}>{label}</span>
          </div>
        </div>

        {/* Component bars */}
        <div className="flex-1 space-y-2.5">
          {components.map((c) => {
            const barColor =
              c.value >= 80 ? 'bg-accent-green'
              : c.value >= 60 ? 'bg-accent-yellow'
              : 'bg-accent-red'
            const textC =
              c.value >= 80 ? 'text-accent-green'
              : c.value >= 60 ? 'text-accent-yellow'
              : 'text-accent-red'
            return (
              <div key={c.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-600">{c.weight}</span>
                    <span className={clsx('text-[10px] font-mono font-semibold', textC)}>{c.value}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-700', barColor)}
                    style={{ width: `${Math.min(100, c.value)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* vs last period */}
        <div className="flex-shrink-0 text-right">
          <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-1">vs last week</p>
          {weeklyDelta == null ? (
            <span className="text-[13px] text-gray-600 font-mono">—</span>
          ) : weeklyDelta > 0 ? (
            <span className="flex items-center gap-1 text-accent-green text-[13px] font-bold font-mono">
              <TrendingUp size={11} /> +{weeklyDelta}
            </span>
          ) : weeklyDelta < 0 ? (
            <span className="flex items-center gap-1 text-accent-red text-[13px] font-bold font-mono">
              <TrendingDown size={11} /> {weeklyDelta}
            </span>
          ) : (
            <span className="text-[13px] text-gray-500 font-mono">±0</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pipeline stage types ──────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { id: 'pr', label: 'PR open', sub: 'github event', color: 'border-gray-500 bg-surface-2', textColor: 'text-gray-300' },
  { id: 'precommit', label: 'Pre-commit', sub: 'lint · format', color: 'border-accent-blue/60 bg-accent-blue/10', textColor: 'text-accent-blue' },
  { id: 'premerge', label: 'Pre-merge', sub: 'pytest · docs', color: 'border-accent-teal/60 bg-accent-teal/10', textColor: 'text-accent-teal' },
  { id: 'image', label: 'Image build', sub: 'base · ros2 · xr', color: 'border-accent-purple/60 bg-accent-purple/10', textColor: 'text-accent-purple' },
  { id: 'gpu', label: 'GPU assign', sub: 'sim test matrix', color: 'border-accent-yellow/60 bg-accent-yellow/10', textColor: 'text-accent-yellow' },
  { id: 'registry', label: 'Registry push', sub: 'NGC · GHCR', color: 'border-accent-green/60 bg-accent-green/10', textColor: 'text-accent-green' },
]

// ── Build matrix helpers ──────────────────────────────────────────────────────

type CellStatus = 'success' | 'failure' | 'in_progress' | 'skipped' | 'warning' | null

function MatrixCell({ status, url }: { status: CellStatus; url?: string }) {
  const content = () => {
    switch (status) {
      case 'success': return <CheckCircle size={14} className="text-accent-green" />
      case 'failure': return <XCircle size={14} className="text-accent-red" />
      case 'in_progress': return <Circle size={14} className="text-accent-blue animate-pulse fill-accent-blue/30" />
      case 'warning': return <AlertTriangle size={14} className="text-accent-yellow" />
      case 'skipped': return <Minus size={14} className="text-gray-600" />
      default: return <Minus size={14} className="text-gray-700" />
    }
  }
  if (url && status) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center hover:opacity-70 transition-opacity">
        {content()}
      </a>
    )
  }
  return <span className="flex items-center justify-center">{content()}</span>
}

// ── Check badge ───────────────────────────────────────────────────────────────

function CheckBadge({ label, status }: { label: string; status: 'pass' | 'fail' | 'pending' | 'missing' }) {
  const cls = {
    pass: 'bg-accent-green/10 text-accent-green border-accent-green/30',
    fail: 'bg-accent-red/10 text-accent-red border-accent-red/30',
    pending: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
    missing: 'bg-surface-3 text-gray-600 border-border',
  }[status]
  const suffix = { pass: '✓', fail: '✗', pending: '●', missing: '-' }[status]
  return (
    <span className={clsx('text-[9px] font-semibold px-1.5 py-0.5 rounded border font-mono', cls)}>
      {label} {suffix}
    </span>
  )
}

// ── Utilization bar ───────────────────────────────────────────────────────────

function UtilBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? 'bg-accent-red' : pct >= 50 ? 'bg-accent-yellow' : 'bg-accent-green'
  const textColor = pct >= 80 ? 'text-accent-red' : pct >= 50 ? 'text-accent-yellow' : 'text-accent-green'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={clsx('text-[10px] font-mono font-semibold w-10 text-right', textColor)}>{label}</span>
    </div>
  )
}

// ── Registry row ─────────────────────────────────────────────────────────────

function RegistryRow({
  icon, iconBg, name, sub, status, url, title, statusNote,
}: {
  icon: ReactNode; iconBg: string; name: string; sub: string
  status?: string; url?: string; title?: string; statusNote?: string
}) {
  const badge = () => {
    if (!status || status === 'unavailable') {
      return (
        <span className="text-[9px] text-gray-500 bg-surface-3 border border-border px-2 py-0.5 rounded">
          {statusNote ?? 'unavailable'}
        </span>
      )
    }
    if (status === 'success') return (
      <span className="flex items-center gap-1 text-[9px] text-accent-green bg-accent-green/10 border border-accent-green/30 px-2 py-0.5 rounded font-semibold">
        <CheckCircle size={9} /> passed
      </span>
    )
    if (status === 'failure') return (
      <span className="flex items-center gap-1 text-[9px] text-accent-red bg-accent-red/10 border border-accent-red/30 px-2 py-0.5 rounded font-semibold">
        <XCircle size={9} /> failed
      </span>
    )
    if (status === 'in_progress') return (
      <span className="flex items-center gap-1 text-[9px] text-accent-blue bg-accent-blue/10 border border-accent-blue/30 px-2 py-0.5 rounded">
        <RefreshCw size={9} className="animate-spin" /> running
      </span>
    )
    return (
      <span className="text-[9px] text-gray-500 bg-surface-3 border border-border px-2 py-0.5 rounded font-mono">{status}</span>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-surface-2 rounded-lg border border-border">
      <div className={clsx('w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0', iconBg)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-white">{name}</p>
        <p className="text-[10px] text-gray-600 font-mono truncate">{sub}</p>
        {title && <p className="text-[9px] text-gray-700 truncate">{title}</p>}
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="flex-shrink-0">
          {badge()}
        </a>
      ) : (
        <span className="flex-shrink-0">{badge()}</span>
      )}
    </div>
  )
}

// ── Stat cards — each with distinct visual identity ───────────────────────────

function StatCards({
  openPRs, prsTodayCount,
  activeBuilds, queued,
  nightlyOk, nightlyTime, latestNightly,
  rBusy, rOnline, rTotal,
}: {
  openPRs: number; prsTodayCount: number
  activeBuilds: number; queued: number
  nightlyOk: boolean; nightlyTime: string; latestNightly: any
  rBusy: number; rOnline: number; rTotal: number
}) {
  const prCount    = useCountUp(openPRs)
  const buildCount = useCountUp(activeBuilds)
  const busyCount  = useCountUp(rBusy)
  const onlineCount = useCountUp(rOnline || rTotal)

  const gpuPct = rOnline > 0 ? Math.round((rBusy / rOnline) * 100) : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

      {/* Open PRs — blue identity */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 hover-lift relative overflow-hidden card-appear card-appear-1">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent-blue/70 via-accent-blue/30 to-transparent rounded-t-xl" />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 font-medium">Open PRs</p>
            <p className="text-[2.1rem] font-bold tabular-nums leading-none mt-1.5">{prCount}</p>
            <p className="text-[11px] mt-1.5 font-medium">
              {prsTodayCount > 0
                ? <span className="text-accent-green">+{prsTodayCount} opened today</span>
                : <span className="text-gray-500">none opened today</span>
              }
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-accent-blue/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <GitPullRequest size={16} className="text-accent-blue" />
          </div>
        </div>
      </div>

      {/* Active Builds — green/amber by activity */}
      <div className={clsx(
        'bg-surface-1 border border-border rounded-xl p-4 hover-lift relative overflow-hidden card-appear card-appear-2',
      )}>
        <div className={clsx(
          'absolute inset-x-0 top-0 h-[2px] rounded-t-xl',
          activeBuilds > 0
            ? 'bg-gradient-to-r from-accent-green/70 via-accent-green/30 to-transparent'
            : 'bg-gradient-to-r from-gray-400/30 to-transparent',
        )} />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 font-medium">Active Builds</p>
            <p className="text-[2.1rem] font-bold tabular-nums leading-none mt-1.5">{buildCount}</p>
            <p className="text-[11px] mt-1.5 font-medium">
              {queued > 0
                ? <span className="text-accent-yellow">{queued} queued</span>
                : activeBuilds > 0
                  ? <span className="text-accent-green">all running</span>
                  : <span className="text-gray-500">idle</span>
              }
            </p>
          </div>
          <div className={clsx(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
            activeBuilds > 0 ? 'bg-accent-green/10' : 'bg-surface-2',
          )}>
            {activeBuilds > 0
              ? <RefreshCw size={16} className="text-accent-green animate-spin" style={{ animationDuration: '2s' }} />
              : <Activity size={16} className="text-gray-500" />
            }
          </div>
        </div>
      </div>

      {/* Nightly Build — pass/fail with natural language */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 hover-lift relative overflow-hidden card-appear card-appear-3">
        <div className={clsx(
          'absolute inset-x-0 top-0 h-[2px] rounded-t-xl',
          !latestNightly ? 'bg-gradient-to-r from-gray-500/30 to-transparent'
            : nightlyOk ? 'bg-gradient-to-r from-accent-green/70 via-accent-green/30 to-transparent'
            : 'bg-gradient-to-r from-accent-red/70 via-accent-red/30 to-transparent',
        )} />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 font-medium">Nightly Build</p>
            <p className={clsx(
              'text-[2.1rem] font-bold leading-none mt-1.5',
              !latestNightly ? 'text-gray-500'
                : nightlyOk ? 'text-accent-green'
                : 'text-accent-red',
            )}>
              {!latestNightly ? '–' : nightlyOk ? 'Pass' : 'Fail'}
            </p>
            <p className="text-[11px] text-gray-500 mt-1.5 truncate">
              {latestNightly ? nightlyTime : 'No runs'}
            </p>
          </div>
          <div className={clsx(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
            !latestNightly ? 'bg-surface-2'
              : nightlyOk ? 'bg-accent-green/10'
              : 'bg-accent-red/10',
          )}>
            {!latestNightly
              ? <Circle size={16} className="text-gray-500" />
              : nightlyOk
                ? <CheckCircle size={16} className="text-accent-green" />
                : <XCircle size={16} className="text-accent-red" />
            }
          </div>
        </div>
      </div>

      {/* GPU Runners — with utilization bar */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 hover-lift relative overflow-hidden card-appear card-appear-4">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-nvidia/60 via-nvidia/25 to-transparent rounded-t-xl" />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-400 font-medium">GPU Runners</p>
            <p className="text-[2.1rem] font-bold tabular-nums leading-none mt-1.5">
              {busyCount}
              <span className="text-base text-gray-500 font-medium">/{onlineCount || '–'}</span>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all duration-700',
                    gpuPct >= 80 ? 'bg-accent-red' : gpuPct >= 50 ? 'bg-nvidia' : 'bg-nvidia/60')}
                  style={{ width: `${gpuPct}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 tabular-nums w-8 text-right">{gpuPct}%</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-nvidia/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Cpu size={16} className="text-nvidia" />
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ControlPlane() {
  const { data: summary } = useQuery({ queryKey: ['overview'], queryFn: getOverviewSummary, staleTime: 60_000, refetchInterval: 120_000 })
  const { data: imageMatrix } = useQuery({ queryKey: ['nightly-image-matrix'], queryFn: getNightlyImageMatrix, staleTime: 120_000, refetchInterval: 300_000 })
  const { data: nightlyRuns } = useQuery({ queryKey: ['nightly-runs-1'], queryFn: () => getNightlyRuns(1), staleTime: 60_000 })
  const { data: allRuns } = useQuery({ queryKey: ['all-runs-ctrl'], queryFn: () => getAllRuns({ per_page: 20 }), staleTime: 60_000 })
  const { data: runnersData } = useQuery({ queryKey: ['runners-ctrl'], queryFn: getRunners, staleTime: 30_000, refetchInterval: 60_000 })
  const { data: pushStatus } = useQuery({ queryKey: ['registry-push-status'], queryFn: getRegistryPushStatus, staleTime: 120_000, refetchInterval: 300_000 })
  const { data: activeRunnersData } = useQuery({ queryKey: ['active-runners'], queryFn: getActiveRunners, staleTime: 120_000, refetchInterval: 300_000 })
  const { data: gateOverview } = useQuery({ queryKey: ['pr-gate-overview', null], queryFn: () => getPRGateOverview(), staleTime: 60_000, refetchInterval: 90_000 })
  const { data: activeRepo } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })

  // ── Derived data ────────────────────────────────────────────────────────────

  const openPRs = summary?.prs?.open ?? 0
  const prsTodayCount = summary?.prs?.prs_today ?? 0
  const recentPRs: any[] = summary?.prs?.attention?.slice(0, 4) ?? []

  const runners: any[] = runnersData?.runners ?? []
  const rOnline = runners.filter((r) => r.status === 'online')
  const rBusy = rOnline.filter((r) => r.busy)
  const rTotal = runners.length

  const allRunsList: any[] = allRuns?.workflow_runs ?? []
  const activeRuns = allRunsList.filter((r) => r.status === 'in_progress')
  const queuedRuns = allRunsList.filter((r) => r.status === 'queued')

  const latestNightly: any = (nightlyRuns?.workflow_runs ?? [])[0]
  const nightlyOk = latestNightly?.conclusion === 'success'
  const nightlyTime = latestNightly?.updated_at
    ? new Date(latestNightly.updated_at).toUTCString().slice(17, 22) + ' UTC'
    : '–'

  // Image matrix: Extension × Sim Version
  const imgExts: string[] = imageMatrix?.extensions ?? ['base', 'ros2', 'cloudxr', 'ngc-slim']
  const simVersions: string[] = imageMatrix?.sim_versions ?? ['4.5', '5.0', '5.1']
  const imgMatrixData: Record<string, Record<string, any>> = imageMatrix?.matrix ?? {}

  // Active runners from job history
  const activeRunnersList: any[] = activeRunnersData?.gpu_runners ?? activeRunnersData?.runners ?? []

  return (
    <div className="space-y-5">

      <BusinessReport />

      {/* ── Engineering Health Score ──────────────────────────────────────────── */}
      <HealthScore
        builds={summary?.builds}
        nightly={summary?.nightly}
        prs={summary?.prs}
      />

      {/* ── Pipeline flow ─────────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl p-5 card-appear">
        <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage.id} className="flex items-center flex-shrink-0">
              <div className={clsx(
                'border rounded-xl px-3.5 py-2.5 text-center min-w-[96px] relative',
                stage.color,
              )}>
                <p className={clsx('text-[11px] font-semibold', stage.textColor)}>{stage.label}</p>
                <p className="text-[9px] text-gray-500 mt-0.5 leading-snug">{stage.sub}</p>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <div className="flex items-center flex-shrink-0 px-0.5">
                  <svg width="24" height="12" viewBox="0 0 24 12" fill="none" className="overflow-visible">
                    <line x1="0" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" className="text-gray-400" strokeDasharray="3 2" />
                    <polyline points="14,3 18,6 14,9" stroke="currentColor" strokeWidth="1.5" fill="none" className="text-gray-500" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-blue inline-block" />
              Pre-merge gate
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" />
              Nightly + release
            </span>
          </div>
          <p className="text-[10px] text-gray-500 font-mono">
            {activeRepo?.active?.slug ?? ''}
          </p>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────────── */}
      <StatCards
        openPRs={openPRs} prsTodayCount={prsTodayCount}
        activeBuilds={activeRuns.length} queued={queuedRuns.length}
        nightlyOk={nightlyOk} nightlyTime={nightlyTime} latestNightly={latestNightly}
        rBusy={rBusy.length} rOnline={rOnline.length} rTotal={rTotal}
      />

      {/* ── Main grid ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* PR Automation */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3 card-appear card-appear-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-accent-blue" />
              <h2 className="text-sm font-semibold text-white">PR Automation</h2>
            </div>
            <NavLink to="/prs" className="text-[10px] text-gray-500 hover:text-accent-blue flex items-center gap-1">
              PR Hub <ChevronRight size={10} />
            </NavLink>
          </div>

          {/* Gate summary counters */}
          {gateOverview?.summary && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Passing', val: gateOverview.summary.success, color: 'text-accent-green', bg: 'bg-accent-green/10 border-accent-green/20' },
                { label: 'Failing', val: gateOverview.summary.failure, color: 'text-accent-red', bg: 'bg-accent-red/10 border-accent-red/20' },
                { label: 'Pending', val: gateOverview.summary.pending, color: 'text-accent-yellow', bg: 'bg-accent-yellow/10 border-accent-yellow/20' },
                { label: 'Skipped', val: gateOverview.summary.skipped, color: 'text-gray-400', bg: 'bg-surface-2 border-border' },
              ].map(({ label, val, color, bg }) => (
                <div key={label} className={clsx('rounded-lg border px-2 py-2 text-center', bg)}>
                  <p className={clsx('text-lg font-semibold tabular-nums', color)}>{val ?? 0}</p>
                  <p className="text-[9px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* PRs needing attention */}
          <div className="space-y-1.5">
            {(gateOverview?.prs ?? [])
              .filter((p: any) => p.verdict === 'failure' && !p.draft)
              .slice(0, 4)
              .map((p: any) => (
                <div key={p.pr_number} className="flex items-center gap-2 py-1.5 px-2 bg-surface-2 rounded-lg border border-border">
                  <XCircle size={11} className="text-accent-red flex-shrink-0" />
                  <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">#{p.pr_number}</span>
                  <p className="flex-1 text-[10px] text-gray-300 truncate">{p.title}</p>
                  <span className={clsx(
                    'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0',
                    p.classification === 'docs' && 'bg-blue-500/[.07] text-blue-400 ring-1 ring-blue-500/25',
                    p.classification === 'source' && 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25',
                    p.classification === 'tests' && 'bg-purple-500/[.07] text-purple-400 ring-1 ring-purple-500/25',
                    p.classification === 'ci' && 'bg-amber-500/[.07] text-amber-400 ring-1 ring-amber-500/25',
                    p.classification === 'mixed' && 'bg-surface-3 text-gray-400',
                  )}>
                    {p.classification}
                  </span>
                </div>
              ))}
            {(gateOverview?.prs ?? []).filter((p: any) => p.verdict === 'failure' && !p.draft).length === 0 && gateOverview && (
              <div className="flex items-center gap-2 py-3 justify-center text-[11px] text-accent-green">
                <CheckCircle size={12} /> All open PRs passing gate
              </div>
            )}
            {!gateOverview && (
              <div className="py-4 text-center text-gray-600 text-[11px]">Evaluating gates…</div>
            )}
          </div>

          {/* Pending PRs */}
          {(gateOverview?.prs ?? []).filter((p: any) => p.verdict === 'pending' && !p.draft).length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold">Awaiting checks</p>
              {(gateOverview.prs as any[])
                .filter((p: any) => p.verdict === 'pending' && !p.draft)
                .slice(0, 3)
                .map((p: any) => (
                  <div key={p.pr_number} className="flex items-center gap-2 py-1 px-2 bg-surface-2 rounded border border-border">
                    <Clock size={10} className="text-accent-yellow flex-shrink-0" />
                    <span className="text-[10px] font-mono text-gray-500">#{p.pr_number}</span>
                    <p className="flex-1 text-[10px] text-gray-400 truncate">{p.title}</p>
                  </div>
                ))}
            </div>
          )}

          <NavLink
            to="/prs"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-accent-blue/10 border border-accent-blue/20 text-[11px] text-accent-blue hover:bg-accent-blue/20 transition-colors font-medium"
          >
            <GitPullRequest size={11} /> Open PR Hub
          </NavLink>
        </div>

        {/* Build Matrix — Extension × Isaac Sim Version */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Build matrix
              <span className="text-[10px] text-gray-500 font-normal ml-2">· Isaac Sim versions</span>
            </h2>
            {imageMatrix?.run_date && (
              <a href={imageMatrix.run_url} target="_blank" rel="noreferrer"
                className="text-[10px] text-gray-500 hover:text-accent-blue flex items-center gap-1">
                {imageMatrix.run_date} <ExternalLink size={10} />
              </a>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-gray-500 font-medium pr-6">Extension</th>
                  {simVersions.map((v) => (
                    <th key={v} className="text-center pb-2 text-gray-500 font-medium font-mono px-4">
                      Sim {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {imgExts.map((ext) => (
                  <tr key={ext} className="hover:bg-surface-2 transition-colors">
                    <td className="py-2.5 pr-6 text-gray-300 font-mono font-medium">{ext}</td>
                    {simVersions.map((v) => {
                      const cell = imgMatrixData[ext]?.[v]
                      const s = cell?.status
                      const cellStatus: CellStatus =
                        s === 'success' ? 'success'
                        : s === 'failure' ? 'failure'
                        : s === 'in_progress' || s === 'queued' ? 'in_progress'
                        : s === 'skipped' ? 'skipped'
                        : null
                      return (
                        <td key={v} className="py-2.5 text-center px-4">
                          <MatrixCell status={cellStatus} url={cell?.url} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 text-[9px] text-gray-600 pt-1">
            <span className="flex items-center gap-1"><CheckCircle size={10} className="text-accent-green" /> pass</span>
            <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-accent-yellow" /> warn</span>
            <span className="flex items-center gap-1"><XCircle size={10} className="text-accent-red" /> fail</span>
            <span className="flex items-center gap-1"><Circle size={10} className="text-accent-blue" /> running</span>
            <span className="flex items-center gap-1"><Minus size={10} className="text-gray-600" /> skipped</span>
          </div>

          <NavLink
            to="/nightly"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface-2 border border-border text-[11px] text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
          >
            View nightly runs <ChevronRight size={10} />
          </NavLink>
        </div>

        {/* Container Registry Push */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Container Registry Push</h2>
            {pushStatus?.ngc?.run_date && (
              <a href={pushStatus.ngc.run_url} target="_blank" rel="noreferrer"
                className="text-[10px] text-gray-500 hover:text-accent-blue flex items-center gap-1">
                {pushStatus.ngc.run_date} <ExternalLink size={10} />
              </a>
            )}
          </div>

          <div className="space-y-3">
            {/* NGC */}
            <RegistryRow
              icon={<Boxes size={14} className="text-accent-green" />}
              iconBg="bg-accent-green/10 border-accent-green/20"
              name="NVIDIA NGC"
              sub={`nvcr.io/nvidia/${(activeRepo?.active?.repo ?? 'isaac-lab').toLowerCase().replace(/_/g, '-')}`}
              status={pushStatus?.ngc?.status}
              url={pushStatus?.ngc?.run_url}
              title={pushStatus?.ngc?.display_title}
            />

            {/* GHCR */}
            <RegistryRow
              icon={<Package size={14} className="text-accent-blue" />}
              iconBg="bg-accent-blue/10 border-accent-blue/20"
              name="GHCR"
              sub={`ghcr.io/${(activeRepo?.active?.owner ?? 'isaac-sim').toLowerCase()}/${(activeRepo?.active?.repo ?? 'isaaclab').toLowerCase()}`}
              status={pushStatus?.ghcr?.status}
              url={pushStatus?.ghcr?.run_url}
              title={pushStatus?.ghcr?.display_title}
            />

            {/* HPC / Apptainer */}
            <RegistryRow
              icon={<Server size={14} className="text-gray-400" />}
              iconBg="bg-surface-3 border-border"
              name="HPC / Apptainer"
              sub="Singularity export · SLURM"
              status="unavailable"
              statusNote="nightly pipeline"
            />
          </div>

          <NavLink
            to="/registry"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface-2 border border-border text-[11px] text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
          >
            View Registry Manager <ChevronRight size={10} />
          </NavLink>
        </div>

        {/* GPU Infrastructure Assignment */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">GPU Infrastructure</h2>
            <a href="/infra" className="text-[10px] text-gray-500 hover:text-accent-blue flex items-center gap-1">
              Infra page <ExternalLink size={10} />
            </a>
          </div>

          {activeRunnersList.length > 0 ? (
            <div className="space-y-2.5">
              {activeRunnersList.slice(0, 5).map((r: any) => (
                <div key={r.name} className="flex items-start gap-2.5 p-2.5 bg-surface-2 rounded-lg border border-border">
                  <div className="flex-shrink-0 mt-0.5">
                    <Cpu size={11} className="text-accent-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono font-semibold text-gray-200 truncate">{r.name}</span>
                      <span className={clsx(
                        'text-[9px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0',
                        r.last_conclusion === 'success'
                          ? 'text-accent-green bg-accent-green/10 border-accent-green/30'
                          : r.last_conclusion === 'failure'
                          ? 'text-accent-red bg-accent-red/10 border-accent-red/30'
                          : 'text-gray-500 bg-surface-3 border-border'
                      )}>
                        {r.last_conclusion || 'unknown'}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-600 truncate mt-0.5">{r.last_job}</p>
                    <p className="text-[9px] text-gray-700">{r.runner_group} · {r.last_run_date}</p>
                  </div>
                  {r.last_run_url && (
                    <a href={r.last_run_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                      <ExternalLink size={10} className="text-gray-600 hover:text-accent-blue" />
                    </a>
                  )}
                </div>
              ))}
              <p className="text-[9px] text-gray-700 text-center">Runners from recent job history · live utilization requires <span className="font-mono text-gray-500">manage_runners:repo</span> scope</p>
            </div>
          ) : runners.length > 0 ? (
            <div className="space-y-3">
              {runners.slice(0, 5).map((r: any) => {
                const isOnline = r.status === 'online'
                const statusLabel = !isOnline ? 'offline' : r.busy ? 'busy' : 'idle'
                const statusColor = !isOnline ? 'text-gray-600' : r.busy ? 'text-accent-yellow' : 'text-accent-green'
                const labels: string[] = r.labels?.map((l: any) => l.name ?? l) ?? []
                const gpuLabel = labels.find((l: string) => /a100|h100|v100/i.test(l))
                return (
                  <div key={r.id} className="flex items-center gap-2.5 p-2.5 bg-surface-2 rounded-lg border border-border">
                    <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', isOnline && r.busy ? 'bg-accent-yellow' : isOnline ? 'bg-accent-green animate-pulse' : 'bg-gray-600')} />
                    <span className="text-[11px] font-mono font-semibold text-gray-200 flex-1 truncate">{r.name}</span>
                    {gpuLabel && <span className="text-[9px] text-accent-purple font-mono">{gpuLabel}</span>}
                    <span className={clsx('text-[10px] font-semibold', statusColor)}>{statusLabel}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-4 text-center space-y-1.5">
              <AlertTriangle size={16} className="text-accent-yellow mx-auto" />
              <p className="text-[11px] text-gray-400 font-medium">Runner data unavailable</p>
              <p className="text-[10px] text-gray-600">Add <span className="font-mono">manage_runners:repo</span> scope to your PAT</p>
            </div>
          )}

          <NavLink
            to="/infra"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface-2 border border-border text-[11px] text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
          >
            View Infra &amp; Runners <ChevronRight size={10} />
          </NavLink>
        </div>
      </div>

      {/* ── Recent workflow runs ───────────────────────────────────────────────── */}
      {activeRuns.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <RefreshCw size={13} className="text-accent-blue animate-spin" />
            Active Builds
          </h2>
          <div className="space-y-2">
            {activeRuns.slice(0, 5).map((run: any) => (
              <div key={run.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                <Circle size={10} className="text-accent-blue animate-pulse fill-accent-blue/30 flex-shrink-0" />
                <span className="text-[11px] text-gray-300 flex-1 truncate">
                  {run.display_title || run.name || `Run #${run.id}`}
                </span>
                <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">
                  {run.head_branch}
                </span>
                <span className="text-[10px] text-gray-600 flex-shrink-0">
                  <Clock size={9} className="inline mr-1" />
                  {formatDistanceToNow(new Date(run.run_started_at ?? run.created_at), { addSuffix: true })}
                </span>
                <a href={run.html_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={10} className="text-gray-600 hover:text-accent-blue" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
