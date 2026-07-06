import { useState, useEffect } from 'react'

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const anim = (v: string) => prefersReducedMotion ? undefined : v
import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import {
  CheckCircle, XCircle, Circle, Minus, AlertTriangle,
  ExternalLink, ChevronRight, ChevronDown, Cpu, Package,
  Boxes, RefreshCw, ShieldCheck, GitPullRequest,
  Activity, TrendingUp, TrendingDown, Target,
  GitMerge, FlaskConical, Box, Server, Upload,
  Zap, Clock, Timer, Rocket, Moon, Wrench, BarChart2, CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import {
  getOverviewSummary, getNightlyRuns,
  getAllRuns, getRunners,
  getNightlyImageMatrix,
  getRegistryPushStatus,
  getPRGateOverview, getActiveRepo,
  getHealthDora, getBuildStats,
  getHealthCiTriage, getHealthPipelinePerf, getHealthRunnerHealth,
  getBuildUsage, getWorkflowsWithStatus,
} from '../lib/api'
import { useCountUp } from '../hooks/useCountUp'
import IssuesPanel from '../components/IssuesPanel'
import CIHealthDigest from '../components/CIHealthDigest'
import { classifyWorkflowStage, WORKFLOW_STAGE_ORDER } from '../components/LiveCICDPipeline'
import { useRepoSlug } from '../lib/hooks'

// ── SLO Definitions ───────────────────────────────────────────────────────────

interface SloDefinition {
  id: string
  label: string
  target: number
  unit: string
  good: 'gte' | 'lte'
  description: string
  icon: React.ElementType
  iconColor: string
}

export const SLO_DEFINITIONS: SloDefinition[] = [
  { id: 'deploy-freq',  label: 'Deploy Frequency',  target: 1,  unit: '/week', good: 'gte', description: 'At least 1 deploy per week',               icon: Rocket,      iconColor: 'text-accent-blue'   },
  { id: 'lead-time',   label: 'Lead Time',           target: 24, unit: 'hrs',  good: 'lte', description: 'Merge-to-deploy under 24 hours',            icon: Clock,       iconColor: 'text-accent-purple' },
  { id: 'mttr',        label: 'MTTR',                target: 8,  unit: 'hrs',  good: 'lte', description: 'Recover from incidents within 8 hours',     icon: Wrench,      iconColor: 'text-accent-yellow' },
  { id: 'change-fail', label: 'Change Failure Rate', target: 10, unit: '%',    good: 'lte', description: 'Less than 10% of changes fail',             icon: TrendingDown, iconColor: 'text-accent-red'   },
  { id: 'nightly-pass',label: 'Nightly Pass Rate',   target: 90, unit: '%',    good: 'gte', description: 'Nightly builds pass ≥90% of the time',      icon: Moon,        iconColor: 'text-accent-teal'   },
  { id: 'build-pass',  label: 'CI Pass Rate',        target: 85, unit: '%',    good: 'gte', description: 'CI build success rate above 85%',           icon: BarChart2,   iconColor: 'text-accent-green'  },
]

export interface SloStatus {
  status: 'MET' | 'BREACHED' | 'PENDING'
  current: number | null
  budgetConsumed: number | null  // 0–100
}

export function computeSloStatus(def: SloDefinition, current: number | null): SloStatus {
  if (current === null) return { status: 'PENDING', current: null, budgetConsumed: null }

  const met = def.good === 'gte' ? current >= def.target : current <= def.target
  const status: 'MET' | 'BREACHED' = met ? 'MET' : 'BREACHED'

  let budgetConsumed: number | null = null
  if (def.unit === '%') {
    const totalBudget = def.good === 'gte' ? (100 - def.target) : def.target
    if (totalBudget > 0) {
      budgetConsumed = def.good === 'gte'
        ? Math.min(100, Math.round((Math.max(0, def.target - current) / totalBudget) * 100))
        : Math.min(100, Math.round((current / totalBudget) * 100))
    }
  } else if (def.unit === '/week') {
    budgetConsumed = (def.good === 'gte' && current < def.target)
      ? Math.min(100, Math.round(((def.target - current) / def.target) * 100))
      : 0
  } else if (def.unit === 'hrs' && def.good === 'lte') {
    budgetConsumed = current <= def.target
      ? Math.round((current / def.target) * 50)
      : Math.min(100, 50 + Math.round(((current - def.target) / def.target) * 50))
  }

  return { status, current, budgetConsumed }
}

export function computeSloStatuses(data: any): Array<{ def: SloDefinition; sloData: SloStatus }> {
  const df   = data?.deployment_frequency
  const lt   = data?.lead_time
  const mttr = data?.mttr
  const cfr  = data?.change_failure_rate

  const metricValues: Record<string, number | null> = {
    'deploy-freq':  df?.per_week    ?? null,
    'lead-time':    lt?.avg_hours   ?? null,
    'mttr':         mttr?.avg_hours ?? null,
    'change-fail':  cfr?.pct        ?? null,
    'nightly-pass': data?.nightly_pass_rate ?? null,
    'build-pass':   data?.ci_pass_rate      ?? null,
  }

  return SLO_DEFINITIONS.map((def) => ({
    def,
    sloData: computeSloStatus(def, metricValues[def.id] ?? null),
  }))
}

// ── Loading / Error helpers ───────────────────────────────────────────────────

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16 gap-3 text-gray-500 text-sm">
      <RefreshCw size={14} className="animate-spin" />
      {label}
    </div>
  )
}

function QueryError({ refetch }: { refetch: () => void }) {
  return (
    <div className="flex items-center justify-center py-16 gap-2 text-[12px] text-gray-500">
      Failed to load —{' '}
      <button onClick={refetch} className="text-accent-blue hover:underline">retry</button>
    </div>
  )
}

// ── Section Divider ───────────────────────────────────────────────────────────

function SectionDivider({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-5 rounded-full bg-[#E0FF4F] [data-theme=light]:bg-[#84cc16]" />
        <Icon size={14} className="text-gray-400" />
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      <div className="flex-1 h-px bg-border" />
      <p className="text-[11px] text-gray-500 hidden sm:block">{subtitle}</p>
    </div>
  )
}

// ── Engineering Health Score ──────────────────────────────────────────────────

interface HealthScoreProps {
  builds?: any
  nightly?: any
  prs?: any
  openPRs?: number
  prsTodayCount?: number
  activeBuilds?: number
  queued?: number
  nightlyOk?: boolean
  nightlyTime?: string
  latestNightly?: any
  rBusy?: number
  rOnline?: number
  rTotal?: number
}

function HealthScore({ builds, nightly, prs, openPRs = 0, prsTodayCount = 0, activeBuilds = 0, queued = 0, nightlyOk = false, nightlyTime = '–', latestNightly, rBusy = 0, rOnline = 0, rTotal = 0 }: HealthScoreProps) {
  const prCount    = useCountUp(openPRs)
  const buildCount = useCountUp(activeBuilds)
  const busyCount  = useCountUp(rBusy)
  const onlineCount = useCountUp(rOnline || rTotal)
  const gpuPct = rOnline > 0 ? Math.round((rBusy / rOnline) * 100) : 0
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
  const prsOpen: number = prs?.open ?? 0
  const readyPRs: number = prs?.ready ?? 0
  const prPipeline: number = Math.round((readyPRs / Math.max(prsOpen, 1)) * 100)

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

  // Animate arc from 0 → actual value on mount / score change
  const [displayArc, setDisplayArc] = useState(0)
  useEffect(() => {
    let id1: number
    const id0 = requestAnimationFrame(() => {
      id1 = requestAnimationFrame(() => setDisplayArc(arcLength))
    })
    return () => { cancelAnimationFrame(id0); cancelAnimationFrame(id1) }
  }, [arcLength])

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

  // suppress unused warning
  void ringColor

  if (loading) {
    return (
      <div className="bg-surface-1 border border-border rounded-xl p-4 flex items-center justify-center py-8">
        <RefreshCw size={14} className="animate-spin text-gray-500 mr-2" />
        <span className="text-sm text-gray-500">Computing health score…</span>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden card-appear">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border card-head">
        <Activity size={14} className="text-gray-400" />
        <h2 className="text-base font-bold text-white">Health Score</h2>
        <span className="text-[10px] text-gray-500 ml-auto">CI · Nightly · PRs</span>
      </div>

      <div className="p-4 flex items-center gap-6">
        {/* Score ring */}
        <div className="flex-shrink-0 relative">
          <svg width="58" height="58" viewBox="0 0 80 80" className={score >= 95 ? 'ring-elite-glow' : ''}>
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
              strokeDasharray={`${displayArc} ${CIRCUMFERENCE}`}
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.4s ease-out' }}
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
                    <span className="text-[9px] text-gray-400">{c.weight}</span>
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
          <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">vs last week</p>
          {weeklyDelta == null ? (
            <span className="text-[13px] text-gray-400 font-mono">—</span>
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

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <div className="border-t border-border grid grid-cols-4">

        {/* Open PRs */}
        <div className="px-3.5 py-2.5 border-r border-border relative overflow-hidden">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">Open PRs</p>
          <p className="text-[18px] font-bold font-mono tabular-nums leading-none mt-1 text-white">{prCount}</p>
          <p className="text-[10px] mt-1">
            {prsTodayCount > 0
              ? <span className="text-accent-green">+{prsTodayCount} today</span>
              : <span className="text-gray-500">none today</span>}
          </p>
        </div>

        {/* Active Builds */}
        <div className="px-3.5 py-2.5 border-r border-border relative overflow-hidden">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">Active Builds</p>
          <p className="text-[18px] font-bold font-mono tabular-nums leading-none mt-1 text-white">{buildCount}</p>
          <p className="text-[10px] mt-1">
            {queued > 0
              ? <span className="text-accent-yellow">{queued} queued</span>
              : activeBuilds > 0
                ? <span className="text-accent-green">all running</span>
                : <span className="text-gray-500">idle</span>}
          </p>
        </div>

        {/* Nightly Build */}
        <div className="px-3.5 py-2.5 border-r border-border relative overflow-hidden">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">Nightly Build</p>
          <p className={clsx('text-[18px] font-bold font-mono leading-none mt-1',
            !latestNightly ? 'text-gray-500'
              : nightlyOk ? 'text-accent-green'
              : 'text-accent-red',
          )}>
            {!latestNightly ? '–' : nightlyOk ? 'Pass' : 'Fail'}
          </p>
          <p className="text-[10px] text-gray-500 mt-1 truncate">{latestNightly ? nightlyTime : 'No runs'}</p>
        </div>

        {/* GPU Runners */}
        <div className="px-3.5 py-2.5 relative overflow-hidden">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">GPU Runners</p>
          <p className="text-[18px] font-bold font-mono tabular-nums leading-none mt-1 text-white">
            {busyCount}<span className="text-sm text-gray-500 font-normal">/{onlineCount || '–'}</span>
          </p>
          <div className="mt-1.5 flex items-center gap-2">
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

      </div>
    </div>
  )
}


// ── Pipeline stage types ──────────────────────────────────────────────────────

const PIPELINE_STAGES: {
  id: string; label: string; sub: string
  icon: LucideIcon; accent: string; dot: string
}[] = [
  { id: 'pr',        label: 'PR Open',       sub: 'github event',    icon: GitPullRequest, accent: 'text-gray-300',        dot: 'bg-gray-500'         },
  { id: 'precommit', label: 'Pre-commit',    sub: 'lint · format',   icon: CheckCircle,    accent: 'text-accent-blue',     dot: 'bg-accent-blue'      },
  { id: 'premerge',  label: 'Pre-merge',     sub: 'pytest · docs',   icon: FlaskConical,   accent: 'text-accent-teal',     dot: 'bg-accent-teal'      },
  { id: 'image',     label: 'Image Build',   sub: 'base · ros2 · xr',icon: Box,            accent: 'text-accent-purple',   dot: 'bg-accent-purple'    },
  { id: 'gpu',       label: 'GPU Assign',    sub: 'sim test matrix', icon: Server,         accent: 'text-accent-yellow',   dot: 'bg-accent-yellow'    },
  { id: 'registry',  label: 'Registry Push', sub: 'ghcr · ecr',      icon: Upload,         accent: 'text-accent-green',    dot: 'bg-accent-green'     },
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
      case 'skipped': return <Minus size={14} className="text-gray-400" />
      default: return <Minus size={14} className="text-gray-400" />
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
    missing: 'bg-surface-3 text-gray-400 border-border',
  }[status]
  const suffix = { pass: '✓', fail: '✗', pending: '●', missing: '-' }[status]
  return (
    <span className={clsx('text-[9px] font-semibold px-1.5 py-0.5 rounded border font-mono', cls)}>
      {label} {suffix}
    </span>
  )
}

// ── HealthAnalysis shared components ─────────────────────────────────────────

function RatingBadge({ rating }: { rating: string }) {
  const cls = {
    Elite:  'bg-accent-green/10 text-accent-green border-accent-green/30',
    High:   'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
    Medium: 'bg-surface-3 text-gray-500 border-border',
    Low:    'bg-accent-red/10 text-accent-red border-accent-red/30',
  }[rating] ?? 'bg-surface-3 text-gray-500 border-border'

  return (
    <span className={clsx('text-[11px] font-semibold px-2.5 py-0.5 rounded-full border', cls)}>
      {rating}
    </span>
  )
}

function StatCard({
  label, value, unit, rating, icon: Icon, color, subtitle,
}: {
  label: string; value: string | number; unit?: string; rating?: string
  icon: any; color: string; subtitle?: string
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={clsx('p-1.5 rounded-lg', `bg-${color}/10`)}>
            <Icon size={13} className={`text-${color}`} />
          </div>
          <p className="text-xs text-gray-500 font-semibold">{label}</p>
        </div>
        {rating && <RatingBadge rating={rating} />}
      </div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums font-mono">
          {value}<span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
        </p>
        {subtitle && <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── DORA Tab ──────────────────────────────────────────────────────────────────

function DoraTab() {
  const slug = useRepoSlug()
  const [days, setDays] = useState<1 | 3 | 7 | 14 | 130>(14)
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [slug, 'health-dora', days],
    queryFn: () => getHealthDora(days),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  if (isLoading) return <Loading label="Computing DORA metrics…" />
  if (isError) return <QueryError refetch={refetch} />
  if (!data) return null

  const df = data.deployment_frequency
  const lt = data.lead_time
  const mttr = data.mttr
  const cfr = data.change_failure_rate

  const noData = data.ci_pass_rate == null && data.nightly_pass_rate == null && (df?.total_in_period ?? 0) === 0

  const tooltipStyle = {
    contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 },
    itemStyle: { color: '#1d2226' },
  }

  return (
    <div className="space-y-5">
      {/* Sub-header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-gray-500">
            Industry benchmark · last {data.period_days} days (Google DevOps Research)
          </p>
          {noData && (
            <span className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
              No activity in this window
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px]">
            {([1, 3, 7, 14, 130] as const).map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={clsx('px-1.5 py-0.5 rounded transition-colors',
                  days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={() => refetch()}
            className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-2 text-gray-400 hover:text-gray-200 border border-border transition-colors', isFetching && 'animate-pulse')}>
            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* 4 Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Deploy Frequency"
          value={df.per_week < 1 ? `${df.total_in_period ?? df.total_30d}` : df.per_week}
          unit={df.per_week < 1 ? `deploys/${days}d` : '/week'}
          rating={df.rating}
          icon={Zap}
          color="accent-blue"
          subtitle={`${df.total_in_period ?? df.total_30d} deployments in ${days} days`}
        />
        <StatCard
          label="Lead Time"
          value={lt.avg_hours || lt.avg_min}
          unit={lt.avg_hours ? 'hrs' : 'min'}
          rating={lt.rating}
          icon={GitMerge}
          color="accent-teal"
          subtitle={`from ${lt.sample_count} pipeline runs`}
        />
        <StatCard
          label="MTTR"
          value={mttr.avg_hours || mttr.avg_min}
          unit={mttr.avg_hours ? 'hrs' : 'min'}
          rating={mttr.rating}
          icon={Clock}
          color="accent-purple"
          subtitle={mttr.sample_count ? `from ${mttr.sample_count} incidents` : 'no failures detected'}
        />
        <StatCard
          label="Change Failure Rate"
          value={cfr.pct}
          unit="%"
          rating={cfr.rating}
          icon={TrendingDown}
          color="accent-orange"
          subtitle={`${cfr.failed_runs} failed / ${cfr.total_runs} total runs`}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Deploy frequency chart */}
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="section-head">Deployment Frequency — Last 14 Days</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={df.chart} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#86939e', fontSize: 9 }} />
              <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={20} allowDecimals={false} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => [v, 'Deployments']} />
              <Bar dataKey="deploys" fill="#0b5cff" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Failure trend chart */}
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="section-head">Pipeline Pass / Fail — Last 14 Days</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={cfr.trend} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#86939e', fontSize: 9 }} />
              <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={20} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="passed" name="Passed" stackId="a" fill="#76b900" />
              <Bar dataKey="failed" name="Failed" stackId="a" fill="#ff1b2d" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DORA reference table */}
      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <div className="section-head">DORA Performance Benchmarks</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left pb-2 text-gray-500 font-medium">Metric</th>
                <th className="text-left pb-2 text-accent-green font-medium">Elite</th>
                <th className="text-left pb-2 text-accent-blue font-medium">High</th>
                <th className="text-left pb-2 text-accent-yellow font-medium">Medium</th>
                <th className="text-left pb-2 text-accent-red font-medium">Low</th>
                <th className="text-left pb-2 text-gray-300 font-medium">Current</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { name: 'Deploy Frequency', elite: 'Multiple/day', high: 'Daily–Weekly', medium: 'Monthly', low: '6+ months', current: df.rating, value: df.total_30d > 0 ? `${df.per_week.toFixed(1)}/wk` : 'No deploys' },
                { name: 'Lead Time', elite: '< 1 hour', high: '< 1 day', medium: '< 1 week', low: '> 1 month', current: lt.rating, value: lt.avg_hours ? `${lt.avg_hours}h` : `${lt.avg_min}m` },
                { name: 'MTTR', elite: '< 1 hour', high: '< 1 day', medium: '< 1 week', low: '> 1 month', current: mttr.rating, value: mttr.avg_min ? (mttr.avg_hours ? `${mttr.avg_hours}h` : `${mttr.avg_min}m`) : 'N/A' },
                { name: 'Change Failure Rate', elite: '< 5%', high: '< 10%', medium: '< 15%', low: '> 15%', current: cfr.rating, value: `${cfr.pct}%` },
              ].map((row) => (
                <tr key={row.name}>
                  <td className="py-2 text-gray-300 font-medium">{row.name}</td>
                  <td className="py-2 text-gray-500">{row.elite}</td>
                  <td className="py-2 text-gray-500">{row.high}</td>
                  <td className="py-2 text-gray-500">{row.medium}</td>
                  <td className="py-2 text-gray-500">{row.low}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-white">{row.value}</span>
                      <RatingBadge rating={row.current} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── CI Triage Tab ─────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string; icon: any; desc: string }> = {
  infra: { label: 'Infrastructure', color: 'text-accent-orange', icon: Server, desc: 'Runner setup, Docker, env config' },
  product: { label: 'Product / Test', color: 'text-accent-red', icon: XCircle, desc: 'Code bugs, test failures' },
  flaky: { label: 'Flaky / Intermittent', color: 'text-accent-yellow', icon: AlertTriangle, desc: 'Failed, passed on re-run' },
  timeout: { label: 'Timeout', color: 'text-accent-purple', icon: Timer, desc: 'Job exceeded time limit' },
  mixed: { label: 'Mixed', color: 'text-accent-cyan', icon: Activity, desc: 'Both infra and product' },
  unknown: { label: 'Unknown', color: 'text-gray-400', icon: Activity, desc: 'Could not determine' },
}

function TriageRow({ f }: { f: any }) {
  const [open, setOpen] = useState(false)
  const meta = CATEGORY_META[f.category] ?? CATEGORY_META.unknown
  const Icon = meta.icon

  return (
    <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors text-left"
      >
        <Icon size={13} className={meta.color} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-white truncate max-w-xs">{f.name || `Run #${f.run_id}`}</span>
            <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase', meta.color, 'bg-current/10')} style={{ backgroundColor: 'transparent', border: '1px solid currentColor' }}>
              {meta.label}
            </span>
            <span className="text-[10px] text-gray-400 font-mono">{f.workflow?.replace('.yml', '')}</span>
            {f.branch && <span className="text-[10px] text-gray-400">@ {f.branch}</span>}
          </div>
          {f.failed_jobs?.length > 0 && (
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">
              Failed: {f.failed_jobs.join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {f.duration_min && (
            <span className="text-[10px] text-gray-400 font-mono">{f.duration_min}m</span>
          )}
          {f.run_attempt > 1 && (
            <span className="text-[9px] text-accent-yellow border border-accent-yellow/30 px-1.5 py-0.5 rounded">
              Attempt #{f.run_attempt}
            </span>
          )}
          {f.created_at && (
            <span className="text-[10px] text-gray-400">
              {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
            </span>
          )}
          {open ? <ChevronDown size={13} className="text-gray-500" /> : <ChevronRight size={13} className="text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-border bg-surface-2 space-y-2">
          <p className="text-[11px] text-gray-400">
            <span className="font-semibold text-gray-300">{meta.label}</span> — {meta.desc}
          </p>
          {f.failed_jobs?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {f.failed_jobs.map((j: string) => (
                <span key={j} className="text-[10px] font-mono bg-surface-3 text-gray-300 px-2 py-0.5 rounded">
                  {j}
                </span>
              ))}
            </div>
          )}
          {f.url && (
            <a href={f.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-accent-blue hover:underline">
              <ExternalLink size={10} /> View on GitHub
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function TriageTab() {
  const slug = useRepoSlug()
  const [filter, setFilter] = useState<string>('all')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [slug, 'health-triage'],
    queryFn: getHealthCiTriage,
    staleTime: 120_000,
  })

  if (isLoading) return <Loading label="Analyzing CI failures…" />
  if (isError) return <QueryError refetch={refetch} />
  if (!data) return null

  const summary = data.summary ?? {}
  const pcts = data.pcts ?? {}
  const failures: any[] = data.failures ?? []
  const filtered = filter === 'all' ? failures : failures.filter((f) => f.category === filter)

  const cats = ['infra', 'product', 'flaky', 'timeout', 'mixed'] as const

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-gray-500">Distinguish infrastructure issues from product bugs</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {cats.map((cat) => {
          const meta = CATEGORY_META[cat]
          const Icon = meta.icon
          const count = summary[cat] ?? 0
          const pct = pcts[cat] ?? 0
          return (
            <button
              key={cat}
              onClick={() => setFilter(filter === cat ? 'all' : cat)}
              className={clsx(
                'bg-surface-1 border rounded-xl p-3 text-left transition-all',
                filter === cat ? 'border-accent-blue ring-1 ring-accent-blue/40' : 'border-border hover:border-gray-600'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={13} className={meta.color} />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">{cat}</span>
              </div>
              <p className={clsx('text-xl font-bold font-mono', meta.color)}>{count}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{pct}% of failures</p>
            </button>
          )
        })}
      </div>

      {/* Failures list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-500">
            {filtered.length} failures
            {filter !== 'all' && ` · filtered: ${CATEGORY_META[filter]?.label}`}
          </p>
          {filter !== 'all' && (
            <button onClick={() => setFilter('all')} className="text-[10px] text-accent-blue hover:underline">
              Clear filter
            </button>
          )}
        </div>
        {filtered.map((f: any) => <TriageRow key={f.run_id} f={f} />)}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">No failures in this category</div>
        )}
      </div>
    </div>
  )
}

// ── Pipeline Performance Tab ───────────────────────────────────────────────────

function PerfTab() {
  const slug = useRepoSlug()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [slug, 'health-perf'],
    queryFn: getHealthPipelinePerf,
    staleTime: 120_000,
  })

  if (isLoading) return <Loading label="Fetching pipeline metrics…" />
  if (isError) return <QueryError refetch={refetch} />
  if (!data) return null

  const workflows: any[] = data.workflows ?? []
  const tooltipStyle = {
    contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 },
    itemStyle: { color: '#1d2226' },
  }

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-gray-500">Duration trends and P95 latency per workflow</p>

      {/* Summary stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {workflows.map((wf) => (
          <div key={wf.file} className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">{wf.workflow}</p>
              <span className="text-[9px] text-gray-400 font-mono">{wf.file}</span>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Avg', value: wf.avg_min, color: 'text-accent-blue' },
                { label: 'P50', value: wf.p50_min, color: 'text-accent-teal' },
                { label: 'P95', value: wf.p95_min, color: 'text-accent-orange' },
                { label: 'Max', value: wf.max_min, color: 'text-accent-red' },
              ].map((s) => (
                <div key={s.label} className="bg-surface-2 rounded-lg p-2">
                  <p className="text-[9px] text-gray-500 uppercase">{s.label}</p>
                  <p className={clsx('text-base font-bold font-mono', s.color)}>{s.value}m</p>
                </div>
              ))}
            </div>

            {/* Duration trend chart */}
            {wf.trend?.length > 0 && (
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={wf.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#86939e', fontSize: 8 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={28}
                    tickFormatter={(v) => `${v}m`} domain={['auto', 'auto']} />
                  <Tooltip {...tooltipStyle}
                    formatter={(v: any) => [`${v}m`, 'Duration']}
                    labelFormatter={(l) => `Date: ${l}`}
                  />
                  <Line
                    type="monotone" dataKey="minutes" stroke="#0b5cff" strokeWidth={1.5}
                    dot={(props: any) => {
                      const fail = props.payload?.conclusion === 'failure'
                      return <circle key={props.key} cx={props.cx} cy={props.cy} r={fail ? 4 : 3}
                        fill={fail ? '#ff1b2d' : '#0b5cff'} stroke="none" />
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            <p className="text-[10px] text-gray-400">
              Based on {wf.sample_count} recent runs · Red dots = failed runs
            </p>
          </div>
        ))}
      </div>

      {workflows.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No pipeline data available</div>
      )}
    </div>
  )
}

// ── Runner Health Tab ─────────────────────────────────────────────────────────

function RunnerDot({ status, busy }: { status: string; busy: boolean }) {
  if (status !== 'online') return <span className="inline-block w-2 h-2 rounded-full bg-gray-600" />
  if (busy) return <span className="inline-block w-2 h-2 rounded-full bg-accent-yellow" />
  return <span className="inline-block w-2 h-2 rounded-full bg-accent-green animate-pulse" />
}

function RunnersTab() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'health-runners'],
    queryFn: getHealthRunnerHealth,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  if (isLoading) return <Loading label="Fetching runner status…" />
  if (!data) return null
  if (data.error || data.access_denied) return (
    <div className="bg-surface-1 border border-border rounded-xl p-6 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-accent-yellow flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">
            {data.access_denied ? 'Runner API access restricted' : 'Failed to load runner data'}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {data.access_denied
              ? 'The GitHub PAT needs the manage_runners:repo scope to list self-hosted runners. This is an admin-level permission.'
              : data.error}
          </p>
          {data.access_denied && (
            <div className="mt-3 bg-surface-2 border border-border rounded-lg p-3 space-y-1">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">To enable runner visibility:</p>
              <p className="text-[10px] font-mono text-gray-300">1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens</p>
              <p className="text-[10px] font-mono text-gray-300">2. Add scope: <span className="text-accent-blue">manage_runners:repo</span></p>
              <p className="text-[10px] font-mono text-gray-300">3. Update GH_PAT in backend .env and restart</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const s = data.summary
  const gpu = data.gpu
  const groups: any[] = data.groups ?? []
  const runners: any[] = data.runners ?? []

  const utilizationColor = (pct: number) =>
    pct >= 90 ? 'text-accent-red' : pct >= 70 ? 'text-accent-yellow' : 'text-accent-green'

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-gray-500">Self-hosted GPU runner capacity and utilization · auto-refreshes every 60s</p>

      {/* Summary grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">All Runners</p>
          <p className="text-2xl font-bold text-white font-mono">{s.online}<span className="text-sm text-gray-500">/{s.total}</span></p>
          <p className="text-[10px] text-gray-400 mt-1">online</p>
          <div className="h-1.5 bg-surface-3 rounded-full mt-2">
            <div className="h-full bg-accent-green rounded-full" style={{ width: `${s.total ? (s.online / s.total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Utilization</p>
          <p className={clsx('text-2xl font-bold font-mono', utilizationColor(s.utilization_pct))}>{s.utilization_pct}%</p>
          <p className="text-[10px] text-gray-400 mt-1">{s.busy} busy / {s.idle} idle</p>
          <div className="h-1.5 bg-surface-3 rounded-full mt-2">
            <div className={clsx('h-full rounded-full', s.utilization_pct >= 90 ? 'bg-accent-red' : s.utilization_pct >= 70 ? 'bg-accent-yellow' : 'bg-accent-blue')}
              style={{ width: `${s.utilization_pct}%` }} />
          </div>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Cpu size={11} className="text-accent-purple" />
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">GPU Runners</p>
          </div>
          <p className="text-2xl font-bold text-white font-mono">{gpu.online}<span className="text-sm text-gray-500">/{gpu.total}</span></p>
          <p className="text-[10px] text-gray-400 mt-1">online</p>
          <div className="h-1.5 bg-surface-3 rounded-full mt-2">
            <div className="h-full bg-accent-purple rounded-full" style={{ width: `${gpu.total ? (gpu.online / gpu.total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">GPU Utilization</p>
          <p className={clsx('text-2xl font-bold font-mono', utilizationColor(gpu.utilization_pct))}>{gpu.utilization_pct}%</p>
          <p className="text-[10px] text-gray-400 mt-1">{gpu.busy} busy / {gpu.idle} idle</p>
          <div className="h-1.5 bg-surface-3 rounded-full mt-2">
            <div className={clsx('h-full rounded-full', gpu.utilization_pct >= 90 ? 'bg-accent-red' : gpu.utilization_pct >= 70 ? 'bg-accent-yellow' : 'bg-accent-purple')}
              style={{ width: `${gpu.utilization_pct}%` }} />
          </div>
        </div>
      </div>

      {/* Groups breakdown */}
      {groups.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="section-head">Runner Groups</div>
          <div className="space-y-2">
            {groups.map((g) => (
              <div key={g.name} className="flex items-center gap-4">
                <span className="text-[11px] text-gray-300 w-40 flex-shrink-0">{g.name}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-blue rounded-full"
                      style={{ width: `${g.total ? (g.online / g.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono w-16 text-right">
                    {g.online}/{g.total} up
                  </span>
                  <span className="text-[10px] font-mono w-16 text-right"
                    style={{ color: g.busy > 0 ? '#56687a' : '#057642' }}>
                    {g.busy} busy
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Runner table */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="border-b border-border bg-surface-2">
            <tr>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Runner</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Type</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium">OS</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runners.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2 transition-colors">
                <td className="px-4 py-2.5 font-mono text-gray-200 text-[10px]">{r.name}</td>
                <td className="px-4 py-2.5">
                  {r.gpu ? (
                    <span className="flex items-center gap-1 text-accent-purple">
                      <Cpu size={10} /> GPU
                    </span>
                  ) : (
                    <span className="text-gray-500">CPU</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-500 capitalize">{r.os}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <RunnerDot status={r.status} busy={r.busy} />
                    <span className={clsx('font-medium', r.status === 'online' ? (r.busy ? 'text-accent-yellow' : 'text-accent-green') : 'text-gray-400')}>
                      {r.status === 'online' ? (r.busy ? 'Busy' : 'Idle') : 'Offline'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── SLO Card ──────────────────────────────────────────────────────────────────

function SloCard({ def, sloData }: { def: SloDefinition; sloData: SloStatus }) {
  const { status, current, budgetConsumed } = sloData
  const Icon = def.icon

  const stripCls = {
    MET:      'bg-accent-green/[.06] border-b-accent-green/20',
    BREACHED: 'bg-accent-red/[.06] border-b-accent-red/20',
    PENDING:  'bg-surface-2/60 border-b-border',
  }[status]

  const statusPillCls = {
    MET:      'bg-accent-green/10 text-accent-green border-accent-green/30',
    BREACHED: 'bg-accent-red/10 text-accent-red border-accent-red/30',
    PENDING:  'bg-surface-3 text-gray-500 border-border',
  }[status]

  const budgetColor =
    budgetConsumed == null ? 'bg-gray-700'
    : budgetConsumed >= 100 ? 'bg-accent-red'
    : budgetConsumed > 75  ? 'bg-orange-500'
    : budgetConsumed > 50  ? 'bg-accent-yellow'
    : 'bg-accent-green'

  const budgetTextCls =
    budgetConsumed == null ? 'text-gray-400'
    : budgetConsumed >= 100 ? 'text-accent-red'
    : budgetConsumed > 75  ? 'text-orange-400'
    : budgetConsumed > 50  ? 'text-accent-yellow'
    : 'text-accent-green'

  const currentDisplay =
    current == null ? '—'
    : def.unit === '%'    ? `${current.toFixed(1)}%`
    : def.unit === '/week'? `${current.toFixed(1)}/wk`
    : `${current.toFixed(1)}h`

  const budgetRemaining = budgetConsumed != null ? Math.max(0, 100 - budgetConsumed) : null

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      {/* Header strip */}
      <div className={clsx('flex items-center justify-between px-4 py-2.5 border-b', stripCls)}>
        <div className="flex items-center gap-2">
          <Icon size={13} className={clsx('flex-shrink-0', def.iconColor)} />
          <p className="text-[12px] font-bold text-white">{def.label}</p>
        </div>
        <span className={clsx('text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider', statusPillCls)}>
          {status === 'PENDING' ? 'N/A' : status}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-[10px] text-gray-500 leading-relaxed">{def.description}</p>

        {/* Target vs Current */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-2 rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Target</p>
            <p className="text-sm font-bold font-mono text-gray-300">
              {def.good === 'gte' ? '≥' : '≤'}{def.target}
              <span className="text-[10px] font-normal text-gray-500 ml-0.5">{def.unit}</span>
            </p>
          </div>
          <div className="bg-surface-2 rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Current</p>
            <p className={clsx(
              'text-sm font-bold font-mono',
              status === 'MET' ? 'text-accent-green' : status === 'BREACHED' ? 'text-accent-red' : 'text-gray-500'
            )}>{currentDisplay}</p>
          </div>
        </div>

        {/* Error budget */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] text-gray-400">30-day error budget</span>
            <div className="flex items-center gap-1.5">
              {budgetRemaining != null && (
                <span className="text-[9px] text-gray-400">{budgetRemaining}% remaining</span>
              )}
              <span className={clsx('text-[9px] font-mono font-bold', budgetTextCls)}>
                {budgetConsumed == null ? '—' : `${budgetConsumed}% used`}
              </span>
            </div>
          </div>
          <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-700', budgetColor)}
              style={{ width: `${budgetConsumed ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SLO Tracker ───────────────────────────────────────────────────────────────

function SloTracker() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'health-dora'],
    queryFn: () => getHealthDora(),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  if (isLoading) return <Loading label="Loading SLO data…" />

  const sloStatuses = computeSloStatuses(data)
  const metCount      = sloStatuses.filter((s) => s.sloData.status === 'MET').length
  const breachCount   = sloStatuses.filter((s) => s.sloData.status === 'BREACHED').length
  const pendingCount  = sloStatuses.filter((s) => s.sloData.status === 'PENDING').length
  const totalCount    = SLO_DEFINITIONS.length
  const metPct        = Math.round((metCount / totalCount) * 100)

  const healthColor =
    metCount === totalCount   ? 'text-accent-green'
    : metCount >= totalCount * 0.7 ? 'text-accent-yellow'
    : 'text-accent-red'

  const barColor =
    metCount === totalCount   ? 'bg-accent-green'
    : metCount >= totalCount * 0.7 ? 'bg-accent-yellow'
    : 'bg-accent-red'

  return (
    <div className="space-y-5">
      {/* Summary band */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-6">
          {/* Score */}
          <div className="flex-shrink-0 text-center">
            <p className={clsx('text-3xl font-bold font-mono tabular-nums', healthColor)}>{metPct}%</p>
            <p className="text-[10px] text-gray-500 mt-0.5">SLOs Met</p>
          </div>
          {/* Bar + breakdown */}
          <div className="flex-1 space-y-2">
            <div className="h-2.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all duration-700', barColor)}
                style={{ width: `${metPct}%` }}
              />
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <span className="flex items-center gap-1 text-accent-green">
                <CheckCircle2 size={10} /> {metCount} met
              </span>
              {breachCount > 0 && (
                <span className="flex items-center gap-1 text-accent-red">
                  <XCircle size={10} /> {breachCount} breached
                </span>
              )}
              {pendingCount > 0 && (
                <span className="text-gray-400">{pendingCount} pending data</span>
              )}
            </div>
          </div>
          <p className="text-[10px] text-gray-400 hidden sm:block text-right leading-relaxed">
            30-day rolling window<br />DORA research targets
          </p>
        </div>
      </div>

      {/* SLO grid */}
      {!data ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No DORA data available — SLOs cannot be evaluated.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sloStatuses.map(({ def, sloData }) => (
            <SloCard key={def.id} def={def} sloData={sloData} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── DevOps Intelligence ───────────────────────────────────────────────────────

function DevOpsIntelligence({
  buildStats, dora, allRunsList, runners, gateOverview, summary, nightlyStreak, nightlyOk,
}: {
  buildStats: any; dora: any; allRunsList: any[]
  runners: any[]; gateOverview: any; summary: any
  nightlyStreak: number; nightlyOk: boolean
}) {
  const successRate: number = buildStats?.success_rate ?? summary?.builds?.success_rate_last10 ?? 0
  const prevRate: number | null = summary?.builds?.success_rate_last_week ?? null
  const rateDelta = prevRate != null ? +(successRate - prevRate).toFixed(1) : null
  const totalRuns: number = buildStats?.total ?? allRunsList.length
  const totalSuccess: number = buildStats?.success ?? 0
  const totalFailed: number = buildStats?.failure ?? 0

  const runnersOnline = runners.filter(r => r.status === 'online')
  const runnersBusy   = runnersOnline.filter(r => r.busy)
  const runnersGpu    = runners.filter(r => (r.labels ?? []).some((l: any) => (l.name ?? l).toLowerCase().includes('gpu')))
  const runnerUtil    = runnersOnline.length > 0 ? Math.round((runnersBusy.length / runnersOnline.length) * 100) : 0

  const DORA_SCORE: Record<string, number> = { Elite: 4, High: 3, Medium: 2, Low: 1 }
  const doraRatings = [dora?.deployment_frequency?.rating, dora?.lead_time?.rating, dora?.mttr?.rating, dora?.change_failure_rate?.rating].filter(Boolean)
  const doraAvg     = doraRatings.length ? doraRatings.reduce((s, r) => s + (DORA_SCORE[r] ?? 0), 0) / doraRatings.length : null
  const doraLabel   = doraAvg == null ? '—' : doraAvg >= 3.5 ? 'Elite' : doraAvg >= 2.5 ? 'High' : doraAvg >= 1.5 ? 'Medium' : 'Low'
  const doraColor   = doraLabel === 'Elite' ? 'text-[#E0FF4F]' : doraLabel === 'High' ? 'text-accent-green' : doraLabel === 'Medium' ? 'text-accent-yellow' : doraLabel === 'Low' ? 'text-accent-red' : 'text-gray-400'

  const byDay: any[]  = buildStats?.by_day ?? []
  const sparkData     = byDay.slice(-10).map((d: any) => d.total > 0 ? Math.round((d.success / d.total) * 100) : 0)
  const sparkColor    = successRate >= 80 ? '#76b900' : successRate >= 60 ? '#f59e0b' : '#ff1b2d'

  const gateSummary = gateOverview?.summary ?? {}
  const gateTotal   = (gateSummary.success ?? 0) + (gateSummary.failure ?? 0) + (gateSummary.pending ?? 0)
  const gatePassPct = gateTotal > 0 ? Math.round((gateSummary.success ?? 0) / gateTotal * 100) : null

  const activeRuns = allRunsList.filter(r => r.status === 'in_progress').length
  const queuedRuns = allRunsList.filter(r => r.status === 'queued').length

  const rateClass = successRate >= 80 ? 'text-nvidia' : successRate >= 60 ? 'text-accent-yellow' : 'text-accent-red'
  const rateAccent = successRate >= 80
    ? 'from-nvidia/70 via-nvidia/30'
    : successRate >= 60 ? 'from-accent-yellow/70 via-accent-yellow/30'
    : 'from-accent-red/70 via-accent-red/30'

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden card-appear">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border card-head">
        <div className="flex items-center gap-2.5">
          <Activity size={14} className="text-nvidia" />
          <span className="text-sm font-bold text-white">DevOps Intelligence</span>
          <span className="text-[10px] text-gray-500 border border-border rounded px-1.5 py-0.5 font-mono">14d</span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 border-b border-border">
        {/* CI Pass Rate */}
        <div className="px-5 py-4 border-r border-border relative overflow-hidden">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">CI Pass Rate</p>
          <div className="flex items-end gap-2 mt-2">
            <span className={clsx('text-[2rem] font-bold font-mono tabular-nums leading-none', rateClass)}>
              {successRate.toFixed(0)}<span className="text-[1.1rem]">%</span>
            </span>
            {rateDelta != null && (
              <span className={clsx('text-[10px] font-mono font-bold mb-0.5', rateDelta > 0 ? 'text-accent-green' : rateDelta < 0 ? 'text-accent-red' : 'text-gray-500')}>
                {rateDelta > 0 ? '↑' : '↓'}{Math.abs(rateDelta)}%
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5 font-mono">{totalSuccess} passed · {totalFailed} failed</p>
        </div>

        {/* Pipeline Volume */}
        <div className="px-5 py-4 border-r border-border relative overflow-hidden">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Pipeline Runs</p>
          <div className="flex items-end gap-2 mt-2">
            <span className="text-[2rem] font-bold font-mono tabular-nums leading-none text-white">{totalRuns}</span>
            <span className="text-[10px] text-gray-500 mb-0.5">/ 14 days</span>
          </div>
          <p className="text-[10px] mt-1.5 font-mono">
            {activeRuns > 0
              ? <span className="text-accent-green">{activeRuns} active</span>
              : <span className="text-gray-500">none active</span>}
            {queuedRuns > 0 && <span className="text-accent-yellow ml-2">{queuedRuns} queued</span>}
          </p>
        </div>

        {/* Runner Fleet */}
        <div className="px-5 py-4 border-r border-border relative overflow-hidden">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Runner Fleet</p>
          <div className="flex items-end gap-2 mt-2">
            <span className="text-[2rem] font-bold font-mono tabular-nums leading-none text-white">
              {runnerUtil}<span className="text-[1.1rem]">%</span>
            </span>
            <span className="text-[10px] text-gray-500 mb-0.5">utilized</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5 font-mono">{runnersBusy.length}/{runnersOnline.length} busy · {runnersGpu.length} GPU</p>
        </div>

        {/* DORA Level */}
        <div className="px-5 py-4 relative overflow-hidden">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">DORA Level</p>
          <div className="mt-2">
            <span className={clsx('text-[2rem] font-bold leading-none', doraColor)}>{doraLabel}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5 font-mono">{doraRatings.length} metrics · DevOps Research</p>
        </div>
      </div>

      {/* 3-column domain panels */}
      <div className="grid grid-cols-3 divide-x divide-border">

        {/* CI/CD Pipelines */}
        <div className="p-4 space-y-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-nvidia inline-block" />
            CI / CD Pipelines
          </p>

          {/* Pass rate bar chart by day */}
          {sparkData.length > 1 && (
            <div className="space-y-1">
              <div className="flex items-end gap-[2px] h-9">
                {sparkData.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[2px]"
                    style={{
                      height: `${Math.max(4, (v / 100) * 36)}px`,
                      background: sparkColor,
                      opacity: 0.3 + (i / (sparkData.length - 1)) * 0.7,
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-gray-600">
                <span>10d ago</span><span>today</span>
              </div>
            </div>
          )}

          {/* Gate pass rate */}
          {gateTotal > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">PR gate pass rate</span>
                <span className={clsx('font-mono font-bold', (gatePassPct ?? 0) >= 80 ? 'text-accent-green' : 'text-accent-yellow')}>{gatePassPct}%</span>
              </div>
              <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                <div className="h-full bg-accent-green rounded-full transition-all duration-700" style={{ width: `${gatePassPct}%` }} />
              </div>
              <p className="text-[9px] text-gray-600">{gateTotal} PRs evaluated · {gateSummary.failure ?? 0} failing</p>
            </div>
          )}
        </div>

        {/* Infrastructure */}
        <div className="p-4 space-y-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-purple inline-block" />
            Infrastructure
          </p>

          {/* Runner dot matrix */}
          <div className="flex flex-wrap gap-1">
            {runners.slice(0, 24).map((r: any, i: number) => {
              const isGpu    = (r.labels ?? []).some((l: any) => (l.name ?? l).toLowerCase().includes('gpu'))
              const isOnline = r.status === 'online'
              const isBusy   = r.busy
              return (
                <div
                  key={i} title={r.name}
                  className={clsx('w-3 h-3 rounded-[3px] transition-colors',
                    !isOnline ? 'bg-surface-3 ring-1 ring-border/50'
                    : isBusy ? (isGpu ? 'bg-nvidia' : 'bg-accent-blue')
                    : 'bg-accent-green/30 ring-1 ring-accent-green/25',
                  )}
                />
              )
            })}
            {runners.length > 24 && <span className="text-[9px] text-gray-500 self-center">+{runners.length - 24}</span>}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-gray-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-accent-green/30 ring-1 ring-accent-green/25 inline-block" />idle</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-accent-blue inline-block" />busy (CPU)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-nvidia inline-block" />busy (GPU)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-[2px] bg-surface-3 ring-1 ring-border inline-block" />offline</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center pt-0.5">
            <div className="bg-surface-2 rounded-lg px-2 py-1.5">
              <p className="text-[12px] font-bold text-accent-green tabular-nums">{runnersOnline.length}</p>
              <p className="text-[9px] text-gray-500">online</p>
            </div>
            <div className="bg-surface-2 rounded-lg px-2 py-1.5">
              <p className="text-[12px] font-bold text-accent-blue tabular-nums">{runnersBusy.length}</p>
              <p className="text-[9px] text-gray-500">busy</p>
            </div>
            <div className="bg-surface-2 rounded-lg px-2 py-1.5">
              <p className="text-[12px] font-bold text-nvidia tabular-nums">{runnersGpu.length}</p>
              <p className="text-[9px] text-gray-500">GPU</p>
            </div>
          </div>
        </div>

        {/* DORA + Reliability */}
        <div className="p-4 space-y-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-teal inline-block" />
            DORA · Reliability
          </p>

          {dora ? (
            <div className="space-y-1">
              {([
                { label: 'Deploy Freq',   value: dora.deployment_frequency?.per_week != null ? `${dora.deployment_frequency.per_week.toFixed(1)}/wk` : '—', rating: dora.deployment_frequency?.rating },
                { label: 'Lead Time',     value: dora.lead_time?.avg_hours ? `${dora.lead_time.avg_hours}h` : dora.lead_time?.avg_min ? `${dora.lead_time.avg_min}m` : '—',                        rating: dora.lead_time?.rating },
                { label: 'MTTR',          value: dora.mttr?.avg_hours ? `${dora.mttr.avg_hours}h` : dora.mttr?.avg_min ? `${dora.mttr.avg_min}m` : '—',                                            rating: dora.mttr?.rating },
                { label: 'Change Fail %', value: dora.change_failure_rate?.pct != null ? `${dora.change_failure_rate.pct}%` : '—',                                                                  rating: dora.change_failure_rate?.rating },
              ] as { label: string; value: string; rating?: string }[]).map(({ label, value, rating }) => {
                const rc = rating === 'Elite' ? 'text-[#E0FF4F]' : rating === 'High' ? 'text-accent-green' : rating === 'Medium' ? 'text-accent-yellow' : 'text-accent-red'
                return (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                    <span className="text-[10px] text-gray-500">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-gray-300 tabular-nums">{value}</span>
                      {rating && <span className={clsx('text-[9px] font-bold uppercase tracking-wide', rc)}>{rating}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[10px] text-gray-500 py-2">DORA data loading…</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', nightlyOk ? 'bg-accent-green' : 'bg-accent-red')} />
            <span className="text-[10px] text-gray-400">
              Nightly: {nightlyOk
                ? <span className="text-accent-green font-semibold">passing</span>
                : <span className="text-accent-red font-semibold">{nightlyStreak} day{nightlyStreak !== 1 ? 's' : ''} failing</span>}
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ControlPlane() {
  const slug = useRepoSlug()
  const { data: summary, isError: summaryError, refetch: refetchSummary } = useQuery({ queryKey: [slug, 'overview'], queryFn: getOverviewSummary, staleTime: 60_000, refetchInterval: 120_000 })
  const { data: imageMatrix } = useQuery({ queryKey: [slug, 'nightly-image-matrix'], queryFn: getNightlyImageMatrix, staleTime: 120_000, refetchInterval: 300_000 })
  const { data: nightlyRuns } = useQuery({ queryKey: [slug, 'nightly-runs-1'], queryFn: () => getNightlyRuns(1), staleTime: 60_000 })
  const { data: allRuns } = useQuery({ queryKey: [slug, 'all-runs-ctrl'], queryFn: () => getAllRuns({ per_page: 20 }), staleTime: 60_000 })
  const { data: runnersData } = useQuery({ queryKey: [slug, 'runners-ctrl'], queryFn: getRunners, staleTime: 30_000, refetchInterval: 60_000 })
  const { data: pushStatus } = useQuery({ queryKey: [slug, 'registry-push-status'], queryFn: getRegistryPushStatus, staleTime: 120_000, refetchInterval: 300_000 })
  const { data: gateOverview } = useQuery({ queryKey: [slug, 'pr-gate-overview', null], queryFn: () => getPRGateOverview(), staleTime: 60_000, refetchInterval: 90_000 })
  const { data: activeRepo } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const { data: buildStats } = useQuery({ queryKey: [slug, 'build-stats-ctrl'], queryFn: () => getBuildStats('', 14), staleTime: 120_000 })
  const { data: doraData }   = useQuery({ queryKey: [slug, 'health-dora'], queryFn: () => getHealthDora(), staleTime: 120_000, refetchInterval: 300_000 })
  const { data: usageData }  = useQuery({ queryKey: [slug, 'build-usage'], queryFn: getBuildUsage, staleTime: 300_000, refetchInterval: 300_000 })
  const { data: wfStatus }   = useQuery({ queryKey: [slug, 'ctrl-workflows'], queryFn: getWorkflowsWithStatus, staleTime: 60_000, refetchInterval: 120_000 })

  // ── Derived data ────────────────────────────────────────────────────────────

  const openPRs = summary?.prs?.open ?? 0
  const prsTodayCount = summary?.prs?.prs_today ?? 0

  // NGC (nvcr.io/nvidia/…) is NVIDIA's private registry — only meaningful for IsaacLab.
  // The backend fabricates an nvcr.io path + "unknown" status for every repo, so gate on
  // the repo identity, not on push-status.
  const isIsaacLab = slug.toLowerCase().includes('isaaclab')

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

  // CI Pipeline flow — derived from the ACTIVE repo's real workflows (not hardcoded).
  // Each canonical stage is shown only if the repo has a workflow that maps to it;
  // the status dot aggregates that stage's latest run states.
  const STAGE_META: Record<string, { label: string; icon: LucideIcon; accent: string }> = {
    premerge: { label: 'Pre-merge', icon: GitPullRequest, accent: 'text-gray-300' },
    test:     { label: 'Test',      icon: FlaskConical,   accent: 'text-accent-blue' },
    build:    { label: 'Build',     icon: Box,            accent: 'text-accent-purple' },
    nightly:  { label: 'Nightly',   icon: Moon,           accent: 'text-accent-teal' },
    release:  { label: 'Release',   icon: Upload,         accent: 'text-accent-green' },
  }
  const wfList: any[] = wfStatus?.workflows ?? []
  const flowStages = WORKFLOW_STAGE_ORDER
    .map((id) => {
      const meta = STAGE_META[id]
      const wfs = wfList.filter((w) => classifyWorkflowStage(w.filename ?? '', w.name ?? '') === id)
      if (wfs.length === 0) return null
      const anyFail = wfs.some((w) => w.last_status === 'failure' || w.last_status === 'timed_out')
      const anyRun  = wfs.some((w) => ['in_progress', 'queued', 'pending'].includes(w.last_status))
      const anyOk   = wfs.some((w) => w.last_status === 'success')
      const dot = anyFail ? 'bg-accent-red' : anyRun ? 'bg-accent-yellow' : anyOk ? 'bg-accent-green' : 'bg-gray-500'
      const sub = wfs.length === 1 ? wfs[0].filename : `${wfs.length} workflows`
      return { id, label: meta.label, sub, icon: meta.icon, accent: meta.accent, dot }
    })
    .filter(Boolean) as { id: string; label: string; sub: string; icon: LucideIcon; accent: string; dot: string }[]

  // Image matrix: Extension × Sim Version
  const imgExts: string[] = imageMatrix?.extensions ?? []
  const simVersions: string[] = imageMatrix?.sim_versions ?? []
  const imgMatrixData: Record<string, Record<string, any>> = imageMatrix?.matrix ?? {}
  const hasImgMatrix = imgExts.length > 0 && simVersions.length > 0

  const repoSlug = activeRepo?.active?.slug ?? ''

  return (
    <div className="space-y-5">

      {/* ── Top row: error banner + GitHub Actions link ───────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          {summaryError && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-accent-red/[.06] ring-1 ring-accent-red/20 rounded-xl text-[12px]">
              <span className="text-accent-red font-medium">Pipeline data unavailable.</span>
              <button onClick={() => refetchSummary()} className="text-accent-blue hover:underline ml-1">Retry</button>
            </div>
          )}
        </div>
        <a
          href={`https://github.com/${repoSlug}/actions`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-accent-blue transition-colors flex-shrink-0"
        >
          <ExternalLink size={10} /> GitHub Actions
        </a>
      </div>

      {/* ── CI Usage summary — flat metric strip (was a 4-card grid) ──────────── */}
      {usageData && (
        <div className="grid grid-cols-2 md:grid-cols-4 bg-surface-1 border border-border rounded-xl overflow-hidden">
          {(usageData.self_hosted
            ? [
                { k: 'Total Wall-Clock', v: `${usageData.total_actual_min}m`, s: 'last 30 runs each', c: 'text-white' },
                { k: 'Workflows Tracked', v: (usageData.workflows ?? []).length, s: 'active workflows', c: 'text-accent-green' },
                { k: 'Longest Avg', v: (usageData.workflows ?? [])[0] ? `${(usageData.workflows)[0].avg_min}m` : '—', s: (usageData.workflows ?? [])[0]?.name ?? '', c: 'text-white' },
                { k: 'GitHub Billable', v: '0m', s: 'self-hosted runners', c: 'text-gray-400' },
              ]
            : [
                { k: 'Total Billable', v: `${usageData.total_min}m`, s: 'billable minutes', c: 'text-white' },
                { k: 'Ubuntu', v: `${usageData.total_ubuntu_min}m`, s: 'Linux runners', c: 'text-accent-green' },
                { k: 'macOS', v: `${usageData.total_macos_min}m`, s: 'macOS runners', c: 'text-white' },
                { k: 'Wall-Clock', v: `${usageData.total_actual_min}m`, s: 'from recent runs', c: 'text-white' },
              ]
          ).map((m, i) => (
            <div key={i} className="px-3.5 py-2.5 border-r border-border/50 last:border-r-0 min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-gray-500 truncate">{m.k}</p>
              <p className={clsx('text-[17px] font-semibold tabular-nums leading-none mt-1', m.c)}>{m.v}</p>
              {m.s && <p className="text-[9px] text-gray-600 mt-1 truncate">{m.s}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Engineering Health Score + stat strip ─────────────────────────────── */}
      <HealthScore
        builds={summary?.builds}
        nightly={summary?.nightly}
        prs={summary?.prs}
        openPRs={openPRs} prsTodayCount={prsTodayCount}
        activeBuilds={activeRuns.length} queued={queuedRuns.length}
        nightlyOk={nightlyOk} nightlyTime={nightlyTime} latestNightly={latestNightly}
        rBusy={rBusy.length} rOnline={rOnline.length} rTotal={rTotal}
      />

      {/* ── Issues & Recommendations ──────────────────────────────────────────── */}
      <IssuesPanel />

      {/* ── CI Health Digest ──────────────────────────────────────────────────── */}
      <CIHealthDigest />

      {/* ── SLO Tracker ───────────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <SectionDivider icon={Target} title="SLO Tracker" subtitle="Service Level Objectives · 30-day error budgets" />
        <SloTracker />
      </section>

      {/* ── DevOps Intelligence ───────────────────────────────────────────────── */}
      <DevOpsIntelligence
        buildStats={buildStats}
        dora={doraData}
        allRunsList={allRunsList}
        runners={runners}
        gateOverview={gateOverview}
        summary={summary}
        nightlyStreak={summary?.nightly?.consecutive_failures ?? 0}
        nightlyOk={nightlyOk}
      />

      {/* ── DORA Metrics ──────────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <SectionDivider icon={Activity} title="DORA Metrics" subtitle="Deploy frequency, lead time, MTTR, change failure rate" />
        <DoraTab />
      </section>

      {/* ── CI Pipeline Flow (horizontal) ────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden card-appear">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border card-head">
          <div className="flex items-center gap-2">
            <GitMerge size={14} className="text-accent-teal" />
            <h2 className="text-sm font-semibold text-white">CI Pipeline</h2>
            <span className="text-[10px] text-gray-500">DevOps workflow</span>
          </div>
          <p className="text-[10px] text-gray-500 font-mono">{activeRepo?.active?.slug ?? ''}</p>
        </div>
        <div className="px-5 py-5">
          {flowStages.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-gray-500">
              {wfStatus ? 'No GitHub Actions workflows detected for this repo.' : 'Loading workflows…'}
            </div>
          ) : (
          <div className="flex items-stretch gap-0">
            {flowStages.map((stage, i) => {
              const Icon = stage.icon
              const isLast = i === flowStages.length - 1
              return (
                <div key={stage.id} className="flex items-stretch flex-1 min-w-0">
                  {/* Stage card */}
                  <div className="flex-1 flex flex-col items-center gap-2.5 px-3 py-3 rounded-xl bg-surface-2 border border-border hover:border-gray-500/60 transition-colors group min-w-0">
                    {/* Step number */}
                    <span className="text-[9px] font-mono text-gray-500 self-end leading-none">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {/* Icon */}
                    <div className={clsx(
                      'w-9 h-9 rounded-xl flex items-center justify-center border border-border bg-surface-1 transition-colors',
                      'group-hover:border-gray-500/50',
                    )}>
                      <Icon size={16} className={stage.accent} />
                    </div>
                    {/* Label + sub */}
                    <div className="text-center min-w-0 w-full">
                      <p className={clsx('text-[11px] font-semibold leading-tight truncate', stage.accent)}>
                        {stage.label}
                      </p>
                      <p className="text-[9px] text-gray-500 font-mono mt-0.5 leading-tight truncate">
                        {stage.sub}
                      </p>
                    </div>
                    {/* Status dot */}
                    <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', stage.dot)} />
                  </div>

                  {/* Arrow connector */}
                  {!isLast && (
                    <div className="flex items-center flex-shrink-0 px-1.5">
                      <svg width="16" height="10" viewBox="0 0 16 10" fill="none" className="text-gray-600">
                        <path d="M0 5h13M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          )}
        </div>
      </div>

      {/* ── PR Status + Build Status matrix ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* PR Status */}
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden card-appear card-appear-1">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border card-head">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-accent-blue" />
              <h2 className="text-base font-bold text-white">PR Status</h2>
            </div>
            <NavLink to="/prs" className="text-[10px] text-gray-500 hover:text-accent-blue flex items-center gap-1">
              PR Hub <ChevronRight size={10} />
            </NavLink>
          </div>
          <div className="p-4 space-y-3">

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
              <div className="py-4 text-center text-gray-400 text-[11px]">Evaluating gates…</div>
            )}
          </div>

          <NavLink
            to="/prs"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-accent-blue/10 border border-accent-blue/20 text-[11px] text-accent-blue hover:bg-accent-blue/20 transition-colors font-medium"
          >
            <GitPullRequest size={11} /> Open PR Hub
          </NavLink>
          </div>
        </div>

        {/* Build Status — Extension × Isaac Sim Version */}
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border card-head">
            <h2 className="text-base font-bold text-white">
              Build Status
              <span className="text-xs text-gray-500 font-normal ml-2">· image build matrix</span>
            </h2>
            {imageMatrix?.run_date && (
              <a href={imageMatrix.run_url} target="_blank" rel="noreferrer"
                className="text-[10px] text-gray-500 hover:text-accent-blue flex items-center gap-1">
                {imageMatrix.run_date} <ExternalLink size={10} />
              </a>
            )}
          </div>
          <div className="p-4 space-y-3">

          {!hasImgMatrix ? (
            <div className="py-6 text-center text-[11px] text-gray-500">
              No image build matrix published for this repo.
            </div>
          ) : (
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
                {imgExts.map((ext, r) => (
                  <tr key={ext} className="hover:bg-surface-2 transition-colors">
                    <td className="py-2.5 pr-6 text-gray-300 font-mono font-medium"
                        style={{ animation: anim(`fade-in 0.2s ease-out ${r * 45}ms both`) }}>{ext}</td>
                    {simVersions.map((v, c) => {
                      const cell = imgMatrixData[ext]?.[v]
                      const s = cell?.status
                      const cellStatus: CellStatus =
                        s === 'success' ? 'success'
                        : s === 'failure' ? 'failure'
                        : s === 'in_progress' || s === 'queued' ? 'in_progress'
                        : s === 'skipped' ? 'skipped'
                        : null
                      return (
                        <td key={v} className="py-2.5 text-center px-4"
                            style={{ animation: anim(`fade-in 0.2s ease-out ${(r * simVersions.length + c) * 35}ms both`) }}>
                          <MatrixCell status={cellStatus} url={cell?.url} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          <div className="flex items-center gap-4 text-[9px] text-gray-400 pt-1">
            <span className="flex items-center gap-1"><CheckCircle size={10} className="text-accent-green" /> pass</span>
            <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-accent-yellow" /> warn</span>
            <span className="flex items-center gap-1"><XCircle size={10} className="text-accent-red" /> fail</span>
            <span className="flex items-center gap-1"><Circle size={10} className="text-accent-blue" /> running</span>
            <span className="flex items-center gap-1"><Minus size={10} className="text-gray-400" /> skipped</span>
          </div>

          <NavLink
            to="/nightly"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface-2 border border-border text-[11px] text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
          >
            View nightly runs <ChevronRight size={10} />
          </NavLink>
          </div>
        </div>
      </div>

      {/* Failure Triage, Pipeline Performance, and Runner Health used to be
          re-hosted here in full. They duplicated the dedicated /monitoring,
          /builds, and /infra pages, and the DevOps Intelligence KPI strip above
          already summarizes them. Removed to declutter the overview; use the
          "Detailed views" links below or the sidebar for the full pages. */}

      {/* ── Detailed views ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { to: '/monitoring', icon: AlertTriangle, title: 'Failure Triage', sub: 'Infra vs product vs flaky', accent: 'text-accent-red' },
          { to: '/builds',     icon: Timer,         title: 'Pipeline Performance', sub: 'Duration trends & P95 latency', accent: 'text-accent-blue' },
          { to: '/infra',      icon: Cpu,           title: 'Runner Health', sub: 'GPU utilization & live status', accent: 'text-nvidia' },
        ].map(({ to, icon: Icon, title, sub, accent }) => (
          <NavLink key={to} to={to}
            className="flex items-center gap-3 bg-surface-1 border border-border rounded-xl px-4 py-3 hover:border-gray-500/60 transition-colors group">
            <Icon size={16} className={accent} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-white truncate">{title}</p>
              <p className="text-[10px] text-gray-500 font-mono truncate">{sub}</p>
            </div>
            <ChevronRight size={13} className="text-gray-600 group-hover:text-gray-300" />
          </NavLink>
        ))}
      </div>

      {/* ── Infrastructure strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* NGC Registry — NVIDIA-specific (nvcr.io/nvidia/…); only for IsaacLab repos */}
        {isIsaacLab && (
        <div className="bg-surface-1 border border-border rounded-xl p-3 flex items-center gap-3 card-appear transition-colors hover:border-border-strong">
          <div className="w-8 h-8 rounded-lg bg-accent-green/10 border border-accent-green/20 flex items-center justify-center flex-shrink-0">
            <Boxes size={14} className="text-accent-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-white">NVIDIA NGC</p>
            <p className="text-[10px] text-gray-400 font-mono truncate">
              {`nvcr.io/nvidia/${(activeRepo?.active?.repo ?? '').toLowerCase().replace(/_/g, '-')}`}
            </p>
          </div>
          {pushStatus?.ngc?.status === 'success' && <span className="flex items-center gap-1 text-[9px] text-accent-green bg-accent-green/10 border border-accent-green/30 px-2 py-0.5 rounded font-semibold flex-shrink-0"><CheckCircle size={9} /> passed</span>}
          {pushStatus?.ngc?.status === 'failure' && <span className="flex items-center gap-1 text-[9px] text-accent-red bg-accent-red/10 border border-accent-red/30 px-2 py-0.5 rounded font-semibold flex-shrink-0"><XCircle size={9} /> failed</span>}
          {(!pushStatus?.ngc?.status || pushStatus?.ngc?.status === 'unavailable') && <span className="text-[9px] text-gray-500 bg-surface-3 border border-border px-2 py-0.5 rounded flex-shrink-0">—</span>}
        </div>
        )}

        {/* GHCR */}
        <div className="bg-surface-1 border border-border rounded-xl p-3 flex items-center gap-3 card-appear card-appear-1 transition-colors hover:border-border-strong">
          <div className="w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center flex-shrink-0">
            <Package size={14} className="text-accent-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-white">GHCR</p>
            <p className="text-[10px] text-gray-400 font-mono truncate">
              {`ghcr.io/${(activeRepo?.active?.owner ?? '').toLowerCase()}/${(activeRepo?.active?.repo ?? '').toLowerCase()}`}
            </p>
          </div>
          {pushStatus?.ghcr?.status === 'success' && <span className="flex items-center gap-1 text-[9px] text-accent-green bg-accent-green/10 border border-accent-green/30 px-2 py-0.5 rounded font-semibold flex-shrink-0"><CheckCircle size={9} /> passed</span>}
          {pushStatus?.ghcr?.status === 'failure' && <span className="flex items-center gap-1 text-[9px] text-accent-red bg-accent-red/10 border border-accent-red/30 px-2 py-0.5 rounded font-semibold flex-shrink-0"><XCircle size={9} /> failed</span>}
          {(!pushStatus?.ghcr?.status || pushStatus?.ghcr?.status === 'unavailable') && <span className="text-[9px] text-gray-500 bg-surface-3 border border-border px-2 py-0.5 rounded flex-shrink-0">—</span>}
        </div>

        {/* GPU Runners */}
        <div className="bg-surface-1 border border-border rounded-xl p-3 flex items-center gap-3 card-appear card-appear-2 transition-colors hover:border-border-strong">
          <div className="w-8 h-8 rounded-lg bg-nvidia/10 border border-nvidia/20 flex items-center justify-center flex-shrink-0">
            <Cpu size={14} className="text-nvidia" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-white">GPU Runners</p>
            <p className="text-[10px] text-gray-400">
              {runners.length > 0
                ? `${runners.filter((r: any) => r.status === 'online').length}/${runners.length} online`
                : 'SLURM · PBS · macOS'}
            </p>
          </div>
          <NavLink to="/infra" className="text-[9px] text-gray-500 hover:text-accent-blue flex items-center gap-0.5 flex-shrink-0">
            details <ChevronRight size={9} />
          </NavLink>
        </div>
      </div>

    </div>
  )
}
