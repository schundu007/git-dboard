import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, Zap, GitMerge, Clock, TrendingDown, Server,
  AlertTriangle, XCircle, Timer, Cpu, ExternalLink,
  Activity, RefreshCw, ChevronDown, ChevronRight, Target,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import {
  getHealthDora, getHealthCiTriage, getHealthPipelinePerf, getHealthRunnerHealth,
  getActiveRepo,
} from '../lib/api'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'

// ── Shared components ─────────────────────────────────────────────────────────

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
        {subtitle && <p className="text-[10px] text-gray-600 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── DORA Tab ──────────────────────────────────────────────────────────────────

function DoraTab() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['health-dora'],
    queryFn: getHealthDora,
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  if (isLoading) return <Loading label="Computing DORA metrics…" />
  if (!data) return null

  const df = data.deployment_frequency
  const lt = data.lead_time
  const mttr = data.mttr
  const cfr = data.change_failure_rate

  const tooltipStyle = {
    contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 },
    itemStyle: { color: '#1d2226' },
  }

  return (
    <div className="space-y-5">
      {/* Sub-header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500">
          Industry benchmark · last {data.period_days} days (Google DevOps Research)
        </p>
        <button onClick={() => refetch()}
          className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface-2 text-gray-400 hover:text-gray-200 border border-border transition-colors', isFetching && 'animate-pulse')}>
          <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* 4 Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Deploy Frequency"
          value={df.per_week < 1 ? `${df.total_30d}` : df.per_week}
          unit={df.per_week < 1 ? 'deploys/30d' : '/week'}
          rating={df.rating}
          icon={Zap}
          color="accent-blue"
          subtitle={`${df.total_30d} deployments in 30 days`}
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
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-3">
            Deployment Frequency — Last 14 Days
          </p>
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
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-3">
            Pipeline Pass / Fail — Last 14 Days
          </p>
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
        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-3">
          DORA Performance Benchmarks
        </p>
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
            <span className="text-[10px] text-gray-600 font-mono">{f.workflow?.replace('.yml', '')}</span>
            {f.branch && <span className="text-[10px] text-gray-600">@ {f.branch}</span>}
          </div>
          {f.failed_jobs?.length > 0 && (
            <p className="text-[10px] text-gray-600 mt-0.5 truncate">
              Failed: {f.failed_jobs.join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {f.duration_min && (
            <span className="text-[10px] text-gray-600 font-mono">{f.duration_min}m</span>
          )}
          {f.run_attempt > 1 && (
            <span className="text-[9px] text-accent-yellow border border-accent-yellow/30 px-1.5 py-0.5 rounded">
              Attempt #{f.run_attempt}
            </span>
          )}
          {f.created_at && (
            <span className="text-[10px] text-gray-600">
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
  const [filter, setFilter] = useState<string>('all')
  const { data, isLoading } = useQuery({
    queryKey: ['health-triage'],
    queryFn: getHealthCiTriage,
    staleTime: 120_000,
  })

  if (isLoading) return <Loading label="Analyzing CI failures…" />
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
              <p className="text-[10px] text-gray-600 mt-0.5">{pct}% of failures</p>
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
          <div className="text-center py-8 text-gray-600 text-sm">No failures in this category</div>
        )}
      </div>
    </div>
  )
}

// ── Pipeline Performance Tab ───────────────────────────────────────────────────

function PerfTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['health-perf'],
    queryFn: getHealthPipelinePerf,
    staleTime: 120_000,
  })

  if (isLoading) return <Loading label="Fetching pipeline metrics…" />
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
              <span className="text-[9px] text-gray-600 font-mono">{wf.file}</span>
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
            <p className="text-[10px] text-gray-600">
              Based on {wf.sample_count} recent runs · Red dots = failed runs
            </p>
          </div>
        ))}
      </div>

      {workflows.length === 0 && (
        <div className="text-center py-12 text-gray-600 text-sm">No pipeline data available</div>
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
  const { data, isLoading } = useQuery({
    queryKey: ['health-runners'],
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
          <p className="text-[10px] text-gray-600 mt-1">online</p>
          <div className="h-1.5 bg-surface-3 rounded-full mt-2">
            <div className="h-full bg-accent-green rounded-full" style={{ width: `${s.total ? (s.online / s.total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Utilization</p>
          <p className={clsx('text-2xl font-bold font-mono', utilizationColor(s.utilization_pct))}>{s.utilization_pct}%</p>
          <p className="text-[10px] text-gray-600 mt-1">{s.busy} busy / {s.idle} idle</p>
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
          <p className="text-[10px] text-gray-600 mt-1">online</p>
          <div className="h-1.5 bg-surface-3 rounded-full mt-2">
            <div className="h-full bg-accent-purple rounded-full" style={{ width: `${gpu.total ? (gpu.online / gpu.total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">GPU Utilization</p>
          <p className={clsx('text-2xl font-bold font-mono', utilizationColor(gpu.utilization_pct))}>{gpu.utilization_pct}%</p>
          <p className="text-[10px] text-gray-600 mt-1">{gpu.busy} busy / {gpu.idle} idle</p>
          <div className="h-1.5 bg-surface-3 rounded-full mt-2">
            <div className={clsx('h-full rounded-full', gpu.utilization_pct >= 90 ? 'bg-accent-red' : gpu.utilization_pct >= 70 ? 'bg-accent-yellow' : 'bg-accent-purple')}
              style={{ width: `${gpu.utilization_pct}%` }} />
          </div>
        </div>
      </div>

      {/* Groups breakdown */}
      {groups.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-3">Runner Groups</p>
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
                    <span className={clsx('font-medium', r.status === 'online' ? (r.busy ? 'text-accent-yellow' : 'text-accent-green') : 'text-gray-600')}>
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

// ── SLO Tracker ───────────────────────────────────────────────────────────────

interface SloDefinition {
  id: string
  label: string
  target: number
  unit: string
  good: 'gte' | 'lte'
  description: string
}

const SLO_DEFINITIONS: SloDefinition[] = [
  { id: 'deploy-freq',  label: 'Deploy Frequency',    target: 1,  unit: '/week', good: 'gte', description: 'At least 1 deploy per week' },
  { id: 'lead-time',   label: 'Lead Time',             target: 24, unit: 'hrs',  good: 'lte', description: 'Merge-to-deploy under 24 hours' },
  { id: 'mttr',        label: 'MTTR',                  target: 8,  unit: 'hrs',  good: 'lte', description: 'Recover from incidents within 8 hours' },
  { id: 'change-fail', label: 'Change Failure Rate',   target: 10, unit: '%',    good: 'lte', description: 'Less than 10% of changes fail in production' },
  { id: 'nightly-pass',label: 'Nightly Pass Rate',     target: 90, unit: '%',    good: 'gte', description: 'Nightly builds pass at least 90% of the time' },
  { id: 'build-pass',  label: 'Build Pass Rate',       target: 85, unit: '%',    good: 'gte', description: 'CI build success rate above 85%' },
]

interface SloStatus {
  status: 'MET' | 'BREACHED' | 'PENDING'
  current: number | null
  budgetConsumed: number | null  // 0-100
}

function computeSloStatus(def: SloDefinition, current: number | null): SloStatus {
  if (current === null) return { status: 'PENDING', current: null, budgetConsumed: null }

  const met = def.good === 'gte' ? current >= def.target : current <= def.target
  const status: 'MET' | 'BREACHED' = met ? 'MET' : 'BREACHED'

  // Error budget: for percentage metrics (unit % or /week)
  // Budget total = allowable deviation from target
  let budgetConsumed: number | null = null
  if (def.unit === '%') {
    const totalBudget = def.good === 'gte'
      ? (100 - def.target)   // e.g. 10% can fail for 90% target
      : def.target            // e.g. 10% allowed failures for lte 10%

    if (totalBudget > 0) {
      if (def.good === 'gte') {
        // budget consumed = how much of the allowed failure budget has been used
        const deviation = Math.max(0, def.target - current)
        budgetConsumed = Math.min(100, Math.round((deviation / totalBudget) * 100))
      } else {
        // budget consumed = current/target * 100
        budgetConsumed = Math.min(100, Math.round((current / totalBudget) * 100))
      }
    }
  } else if (def.unit === '/week') {
    // for deploy frequency: if target is 1/week, budget consumed = how far below target
    if (def.good === 'gte' && current < def.target) {
      budgetConsumed = Math.min(100, Math.round(((def.target - current) / def.target) * 100))
    } else {
      budgetConsumed = 0
    }
  } else if (def.unit === 'hrs') {
    // for lead time / mttr: budget consumed based on how far over target
    if (def.good === 'lte') {
      if (current <= def.target) {
        budgetConsumed = Math.round((current / def.target) * 50) // 50% max when at target
      } else {
        const overage = current - def.target
        budgetConsumed = Math.min(100, 50 + Math.round((overage / def.target) * 50))
      }
    }
  }

  return { status, current, budgetConsumed }
}

function SloCard({ def, sloData }: { def: SloDefinition; sloData: SloStatus }) {
  const { status, current, budgetConsumed } = sloData

  const statusCls = {
    MET:      'bg-accent-green/10 text-accent-green border-accent-green/30',
    BREACHED: 'bg-accent-red/10 text-accent-red border-accent-red/30',
    PENDING:  'bg-surface-3 text-gray-500 border-border',
  }[status]

  const budgetColor =
    budgetConsumed == null ? 'bg-gray-600'
    : budgetConsumed > 80  ? 'bg-accent-red'
    : budgetConsumed > 50  ? 'bg-accent-yellow'
    : 'bg-accent-green'

  const currentDisplay =
    current == null ? '—'
    : def.unit === '%' ? `${current}%`
    : def.unit === '/week' ? `${current}/wk`
    : `${current}h`

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-white">{def.label}</p>
          <p className="text-[9px] text-gray-600 mt-0.5">{def.description}</p>
        </div>
        <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider flex-shrink-0', statusCls)}>
          {status}
        </span>
      </div>

      {/* Target vs Current */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-2 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-600 uppercase tracking-wider">Target</p>
          <p className="text-sm font-bold font-mono text-gray-300">
            {def.good === 'gte' ? '≥' : '≤'}{def.target}{def.unit}
          </p>
        </div>
        <div className="bg-surface-2 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-600 uppercase tracking-wider">Current</p>
          <p className={clsx(
            'text-sm font-bold font-mono',
            status === 'MET' ? 'text-accent-green' : status === 'BREACHED' ? 'text-accent-red' : 'text-gray-500'
          )}>{currentDisplay}</p>
        </div>
      </div>

      {/* Error budget bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-gray-600">30-day error budget</span>
          <span className={clsx('text-[9px] font-mono font-semibold',
            budgetConsumed == null ? 'text-gray-600'
            : budgetConsumed > 80 ? 'text-accent-red'
            : budgetConsumed > 50 ? 'text-accent-yellow'
            : 'text-accent-green'
          )}>
            {budgetConsumed == null ? '—' : `${budgetConsumed}%`}
          </span>
        </div>
        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-700', budgetColor)}
            style={{ width: `${budgetConsumed ?? 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function SloTracker() {
  const { data, isLoading } = useQuery({
    queryKey: ['health-dora'],
    queryFn: getHealthDora,
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  if (isLoading) return <Loading label="Loading SLO data…" />

  // Derive metric values from DORA data
  const df = data?.deployment_frequency
  const lt = data?.lead_time
  const mttr = data?.mttr
  const cfr = data?.change_failure_rate

  const metricValues: Record<string, number | null> = {
    'deploy-freq':  df?.per_week   != null ? df.per_week : null,
    'lead-time':    lt?.avg_hours  != null ? lt.avg_hours : null,
    'mttr':         mttr?.avg_hours != null ? mttr.avg_hours : null,
    'change-fail':  cfr?.pct       != null ? cfr.pct : null,
    'nightly-pass': null,   // not directly in DORA; would need nightly trend data
    'build-pass':   cfr?.pct != null ? Math.round(100 - cfr.pct) : null,
  }

  const sloStatuses = SLO_DEFINITIONS.map((def) => ({
    def,
    sloData: computeSloStatus(def, metricValues[def.id] ?? null),
  }))

  const metCount = sloStatuses.filter((s) => s.sloData.status === 'MET').length
  const totalCount = SLO_DEFINITIONS.length

  const summaryColor =
    metCount === totalCount ? 'text-accent-green'
    : metCount >= totalCount * 0.7 ? 'text-accent-yellow'
    : 'text-accent-red'

  return (
    <div className="space-y-5">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-gray-500">30-day SLO summary:</p>
          <span className={clsx('text-sm font-bold font-mono', summaryColor)}>
            {metCount}/{totalCount} SLOs Met
          </span>
        </div>
        <p className="text-[10px] text-gray-600">SLO targets based on industry standards (DORA research)</p>
      </div>

      {/* SLO grid */}
      {!data ? (
        <div className="text-center py-8 text-gray-600 text-sm">
          No DORA data available — SLOs cannot be evaluated.
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {sloStatuses.map(({ def, sloData }) => (
            <SloCard key={def.id} def={def} sloData={sloData} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Loading ───────────────────────────────────────────────────────────────────

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16 gap-3 text-gray-500 text-sm">
      <RefreshCw size={14} className="animate-spin" />
      {label}
    </div>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HealthAnalysis() {
  const { data: arData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = arData?.active?.slug ?? ''

  return (
    <div className="space-y-8">
      {/* Actions row */}
      <div className="flex justify-end">
        <a href={`https://github.com/${repoSlug}/actions`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-accent-blue transition-colors">
          <ExternalLink size={10} /> GitHub Actions
        </a>
      </div>

      {/* DORA Metrics */}
      <section className="space-y-5">
        <SectionDivider icon={Activity} title="DORA Metrics" subtitle="Deploy frequency, lead time, MTTR, change failure rate" />
        <DoraTab />
      </section>

      {/* CI Triage */}
      <section className="space-y-5">
        <SectionDivider icon={AlertTriangle} title="CI Triage" subtitle="Infra vs product vs flaky failures" />
        <TriageTab />
      </section>

      {/* Pipeline Performance */}
      <section className="space-y-5">
        <SectionDivider icon={Timer} title="Pipeline Performance" subtitle="Duration trends & P95 latency per workflow" />
        <PerfTab />
      </section>

      {/* Runner Health */}
      <section className="space-y-5">
        <SectionDivider icon={Cpu} title="Runner Health" subtitle="GPU runner utilization & live status" />
        <RunnersTab />
      </section>

      {/* SLO Tracker */}
      <section className="space-y-5">
        <SectionDivider icon={Target} title="SLO Tracker" subtitle="Service Level Objectives · 30-day error budgets" />
        <SloTracker />
      </section>
    </div>
  )
}
