import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'
import {
  TrendingUp, Users, GitCommit, Clock, AlertTriangle,
  ExternalLink, RefreshCw, BarChart2, Calendar, Trophy,
  GitMerge, Zap, Star, DollarSign, Lightbulb, Eye, GitFork, Code, AlertCircle,
} from 'lucide-react'
import { formatDistanceToNow, fromUnixTime, format } from 'date-fns'
import {
  getOverviewSummary, getUserMetrics, getActiveRepo, getBuildPerformance,
  getInsightsPulse, getInsightsParticipation, getInsightsContributors,
  getInsightsCodeFrequency, getInsightsForks, getInsightsCommitActivity,
} from '../lib/api'
import clsx from 'clsx'

const BASE = 'http://localhost:8000'
const req = (path: string) => fetch(`${BASE}${path}`).then((r) => r.json())

// ── API helpers ───────────────────────────────────────────────────────────────
const useCommitActivity = (days: number) =>
  useQuery({ queryKey: ['commit-activity', days], queryFn: () => req(`/analytics/commit-activity?days=${days}`), staleTime: 300_000 })

const useBuildTrends = (days: number) =>
  useQuery({ queryKey: ['build-trends', days], queryFn: () => req(`/analytics/build-trends?days=${days}`), staleTime: 120_000 })

const useFailureAnalysis = (runs: number) =>
  useQuery({ queryKey: ['failure-analysis', runs], queryFn: () => req(`/analytics/failure-analysis?runs=${runs}`), staleTime: 120_000 })

const usePRVelocity = () =>
  useQuery({ queryKey: ['pr-velocity'], queryFn: () => req('/analytics/pr-velocity?limit=100'), staleTime: 300_000 })

const useCommits = () =>
  useQuery({ queryKey: ['commits'], queryFn: () => req('/analytics/commits?per_page=30'), staleTime: 120_000 })


const useErrorPatterns = () =>
  useQuery({ queryKey: ['error-patterns'], queryFn: () => req('/analytics/error-patterns'), staleTime: 120_000 })

// ── Shared components ─────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className="section-head">
      <Icon size={13} className={clsx('flex-shrink-0', color)} />
      {title}
    </div>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-surface-1 border border-border rounded-xl p-4', className)}>
      {children}
    </div>
  )
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 6, fontSize: 11 },
  labelStyle: { color: '#56687a' },
}

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatRow({ items }: { items: { label: string; value: string | number; color?: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map(({ label, value, color, sub }) => (
        <Card key={label}>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
          <p className={clsx('text-2xl font-semibold tabular-nums', color ?? 'text-white')}>{value}</p>
          {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
        </Card>
      ))}
    </div>
  )
}

// ── Commit activity chart ─────────────────────────────────────────────────────

function CommitActivityChart() {
  const [days, setDays] = useState(14)
  const { data, isLoading, isError } = useCommitActivity(days)
  const series = data?.series ?? []
  const nonZero = series.filter((d: any) => d.commits > 0)
  const maxVal = Math.max(...series.map((d: any) => d.commits), 1)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={GitCommit} title="Commit Activity" color="text-accent-blue" />
        <div className="flex items-center gap-1 text-[10px]">
          {[1, 3, 7, 14, 130].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={clsx('px-1.5 py-0.5 rounded', days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-6">Loading…</p>
      ) : isError ? (
        <p className="text-[12px] text-gray-500 text-center py-6">Failed to load — <button onClick={() => window.location.reload()} className="text-accent-blue hover:underline">retry</button></p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={series} barSize={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#86939e', fontSize: 9 }}
              tickFormatter={(v: string) => v.slice(5)}
              interval={Math.floor(series.length / 8)}
            />
            <YAxis tick={{ fill: '#86939e', fontSize: 9 }} allowDecimals={false} width={20} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [v, 'commits']} />
            <Bar dataKey="commits" radius={[2, 2, 0, 0]}>
              {series.map((entry: any, i: number) => (
                <Cell
                  key={i}
                  fill={entry.commits === 0 ? '#27272a' : entry.commits === maxVal ? '#0b5cff' : '#0b5cff88'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      {!isLoading && (
        <p className="text-[10px] text-gray-400 mt-1">
          {data?.total_commits ?? 0} commits total · {nonZero.length} active days
        </p>
      )}
    </Card>
  )
}

// ── Build success trend ───────────────────────────────────────────────────────

function BuildTrendChart() {
  const [days, setDays] = useState(14)
  const { data, isLoading } = useBuildTrends(days)
  const series = (data?.series ?? []).filter((d: any) => d.total > 0)
  const summary = data?.summary

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={TrendingUp} title="Build Success Rate Trend" color="text-accent-green" />
        <div className="flex items-center gap-1 text-[10px]">
          {[1, 3, 7, 14, 130].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={clsx('px-1.5 py-0.5 rounded', days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {summary && (
        <div className="flex items-center gap-4 mb-3 text-xs">
          <span className="text-accent-green font-semibold">{summary.success_rate ?? '—'}% success</span>
          <span className="text-gray-500">{summary.total_runs} runs</span>
          <span className="text-accent-red">{summary.failed} failed</span>
        </div>
      )}
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-6">Loading…</p>
      ) : series.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">No build data in this window.</p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#84cc16" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff1b2d" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff1b2d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" />
            <XAxis dataKey="date" tick={{ fill: '#86939e', fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
            <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={20} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="success" stroke="#84cc16" fill="url(#successGrad)" strokeWidth={2} name="success" />
            <Area type="monotone" dataKey="failure" stroke="#ff1b2d" fill="url(#failGrad)" strokeWidth={2} name="failure" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// ── Failure rate by job ───────────────────────────────────────────────────────

function FailureRateChart() {
  const [runs, setRuns] = useState(30)
  const { data, isLoading } = useFailureAnalysis(runs)
  const jobs: any[] = data?.jobs ?? []

  const chartData = jobs.map((j) => ({
    name: j.name.replace('test-', '').replace('-compat', ''),
    failure_rate: j.failure_rate,
    failed: j.failed,
    total: j.total,
    streak: j.consecutive_failures,
  }))

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={AlertTriangle} title="Nightly Failure Rate by Job" color="text-accent-red" />
        <div className="flex items-center gap-1 text-[10px]">
          {[14, 30, 60].map((r) => (
            <button
              key={r}
              onClick={() => setRuns(r)}
              className={clsx('px-1.5 py-0.5 rounded', runs === r ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}
            >
              {r} runs
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-6">Loading — fetching {runs} runs' job data…</p>
      ) : jobs.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">No data.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(jobs.length * 36, 120)}>
            <BarChart data={chartData} layout="vertical" barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#86939e', fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#86939e', fontSize: 9 }} width={160} />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, _: any, props: any) => [
                  `${v}% (${props.payload.failed}/${props.payload.total})`,
                  'failure rate',
                ]}
              />
              <Bar dataKey="failure_rate" radius={[0, 3, 3, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.failure_rate >= 50 ? '#ff1b2d' :
                      entry.failure_rate >= 20 ? '#ff1b2d' :
                      entry.failure_rate > 0  ? '#a1a1aa' : '#84cc16'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Detail table */}
          <div className="mt-3 border-t border-border pt-3 space-y-1">
            {jobs.map((j) => (
              <div key={j.name} className="flex items-center justify-between text-[10px]">
                <span className="text-gray-400 truncate max-w-[220px]">{j.name}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={clsx(
                    'font-semibold',
                    j.failure_rate >= 50 ? 'text-accent-red' :
                    j.failure_rate >= 20 ? 'text-accent-orange' :
                    j.failure_rate > 0 ? 'text-accent-yellow' : 'text-accent-green'
                  )}>
                    {j.failure_rate}%
                  </span>
                  <span className="text-gray-400">{j.failed}/{j.total} runs</span>
                  {j.consecutive_failures > 0 && (
                    <span className="text-accent-red">streak: {j.consecutive_failures}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

// ── PR velocity ───────────────────────────────────────────────────────────────

function PRVelocityCard() {
  const { data, isLoading } = usePRVelocity()
  const summary = data?.summary
  const dist = data?.distribution
  const topAuthors: any[] = data?.top_authors ?? []
  const weeklyTrend: any[] = data?.weekly_trend ?? []

  const distData = dist ? [
    { name: '<1h', value: dist.lt_1h },
    { name: '1-8h', value: dist['1_to_8h'] },
    { name: '8-24h', value: dist['8_to_24h'] },
    { name: '1-3d', value: dist['1_to_3d'] },
    { name: '>3d', value: dist.gt_3d },
  ] : []

  const PIE_COLORS = ['#84cc16', '#0b5cff', '#a1a1aa', '#ff1b2d', '#ff1b2d']

  return (
    <Card>
      <SectionTitle icon={Clock} title="PR Velocity & Merge Time" color="text-accent-purple" />
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-6">Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Avg merge', value: summary?.avg_hours != null ? `${summary.avg_hours}h` : '—' },
              { label: 'Median', value: summary?.median_hours != null ? `${summary.median_hours}h` : '—' },
              { label: 'p90', value: summary?.p90_hours != null ? `${summary.p90_hours}h` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface rounded p-2 text-center">
                <p className="text-sm font-semibold text-white">{value}</p>
                <p className="text-[9px] text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Distribution pie */}
          {distData.length > 0 && (
            <div className="flex items-center gap-4">
              <PieChart width={100} height={100}>
                <Pie data={distData} dataKey="value" cx={46} cy={46} innerRadius={28} outerRadius={46}>
                  {distData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
              </PieChart>
              <div className="space-y-1">
                {distData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-[10px]">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: PIE_COLORS[i] }} />
                    <span className="text-gray-400">{d.name}</span>
                    <span className="text-white font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly open vs merged */}
          {weeklyTrend.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Weekly: opened vs merged</p>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={weeklyTrend} barSize={6} barGap={2}>
                  <XAxis dataKey="week" tick={{ fill: '#86939e', fontSize: 8 }} tickFormatter={(v: string) => v.slice(5)} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="opened" fill="#0b5cff" name="opened" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="merged" fill="#84cc16" name="merged" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Computing notice ──────────────────────────────────────────────────────────

function ComputingNotice() {
  return (
    <div className="text-center py-8 space-y-1">
      <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-nvidia animate-pulse" />
        GitHub is computing stats — auto-retrying…
      </div>
      <p className="text-[11px] text-gray-500">Can take up to 60 seconds for large repos</p>
    </div>
  )
}

// ── Top contributors (enhanced with sparklines) ───────────────────────────────

function ContributorsCard() {
  const [sortBy, setSortBy] = useState<'total' | 'recent'>('total')
  const { data, isLoading } = useQuery({
    queryKey: ['insights-contributors'],
    queryFn: getInsightsContributors,
    staleTime: 300_000,
    refetchInterval: (query: any) => query.state.data?.computing ? 12_000 : false,
  })

  const contributors: any[] = data?.contributors ?? []
  const sorted = [...contributors].sort((a, b) => {
    if (sortBy === 'recent') {
      const aR = (a.weeks ?? []).slice(-4).reduce((s: number, w: any) => s + w.c, 0)
      const bR = (b.weeks ?? []).slice(-4).reduce((s: number, w: any) => s + w.c, 0)
      return bR - aR
    }
    return b.total - a.total
  })

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <SectionTitle icon={Users} title="Top Contributors" color="text-accent-orange" />
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
          {([['total', 'All time'], ['recent', '4w']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)}
              className={clsx('px-2 py-0.5 rounded text-[10px] transition-colors',
                sortBy === key ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-6 flex-1">Loading…</p>
      ) : data?.computing ? (
        <ComputingNotice />
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {!data?.has_weekly && (
            <span className="flex items-center gap-1 text-[10px] text-neutral-400 mb-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-nvidia animate-pulse" />
              weekly data computing…
            </span>
          )}
          {sorted.slice(0, 15).map((c, idx) => {
            const hasWeekly = c.weeks && c.weeks.length > 0
            const recentCommits = hasWeekly ? c.weeks.slice(-4).reduce((s: number, w: any) => s + w.c, 0) : 0
            const chartData = hasWeekly ? c.weeks.map((w: any, i: number) => ({ w: i, c: w.c })) : []
            const maxContrib = Math.max(1, ...sorted.slice(0, 1).map((x: any) => x.total))
            const pct = Math.round((c.total / maxContrib) * 100)
            return (
              <div key={c.login} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-5 text-right flex-shrink-0">#{idx + 1}</span>
                {c.avatar_url && <img src={c.avatar_url} className="w-5 h-5 rounded-full flex-shrink-0" alt="" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-gray-300 truncate">{c.login}</span>
                    <div className="flex items-center gap-2 text-[10px] flex-shrink-0 ml-1">
                      <span className="text-gray-500">{c.total}</span>
                      {recentCommits > 0 && <span className="text-accent-green">+{recentCommits}</span>}
                    </div>
                  </div>
                  <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                    <div className="h-full bg-nvidia rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {hasWeekly && (
                  <div className="w-14 h-5 flex-shrink-0">
                    <ResponsiveContainer width="100%" height={20}>
                      <BarChart data={chartData} barSize={2}>
                        <Bar dataKey="c" fill="#0b5cff" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })}
          {data?.source === 'raw_commits_90d' && (
            <p className="text-[9px] text-gray-400 mt-2">Based on last 90 days of commits</p>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Recent commits ─────────────────────────────────────────────────────────────

function RecentCommitsCard() {
  const [limit, setLimit] = useState(6)
  const { data, isLoading } = useCommits()
  const commits: any[] = data?.commits ?? []
  const visible = commits.slice(0, limit)
  const hasMore = limit < commits.length

  return (
    <Card className="h-full flex flex-col">
      <SectionTitle icon={GitCommit} title="Recent Commits" color="text-accent-blue" />
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-6 flex-1">Loading…</p>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto space-y-0">
            {visible.map((c) => (
              <div
                key={c.full_sha}
                className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0"
              >
                {c.author_avatar ? (
                  <img src={c.author_avatar} alt="" className="w-5 h-5 rounded-full mt-0.5 flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-surface-3 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 truncate">{c.message}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                    <span className="text-accent-blue font-mono">{c.sha}</span>
                    <span>{c.author_login || c.author}</span>
                    <span>{formatDistanceToNow(new Date(c.date), { addSuffix: true })}</span>
                  </div>
                </div>
                <a href={c.url} target="_blank" rel="noreferrer" className="flex-shrink-0 mt-0.5">
                  <ExternalLink size={10} className="text-gray-400 hover:text-accent-blue" />
                </a>
              </div>
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => setLimit((l) => Math.min(l + 8, commits.length))}
              className="mt-2 w-full text-center text-[10px] text-gray-500 hover:text-gray-300 py-1.5 border border-border/40 rounded-lg hover:bg-surface-2 transition-colors"
            >
              Load more ({commits.length - limit} remaining)
            </button>
          )}
          {!hasMore && commits.length > 6 && (
            <button
              onClick={() => setLimit(6)}
              className="mt-2 w-full text-center text-[10px] text-gray-400 hover:text-gray-400 py-1"
            >
              Collapse
            </button>
          )}
        </>
      )}
    </Card>
  )
}

// ── Error patterns ────────────────────────────────────────────────────────────

function ErrorPatternsCard() {
  const { data, isLoading } = useErrorPatterns()
  const patterns: any[] = data?.patterns ?? []

  if (!isLoading && patterns.length === 0) {
    return (
      <Card>
        <SectionTitle icon={AlertTriangle} title="Error Patterns" color="text-accent-red" />
        <p className="text-gray-400 text-sm text-center py-4">
          No errors in log store yet. Ingest a GHA run from the Logs page.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <SectionTitle icon={AlertTriangle} title={`Top Error Patterns (${data?.total_errors ?? 0} total errors)`} color="text-accent-red" />
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-4">Loading…</p>
      ) : (
        <div className="space-y-2">
          {patterns.map((p, i) => (
            <div key={i} className="bg-surface rounded p-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-mono text-accent-red truncate flex-1">{p.pattern}</p>
                <span className="flex-shrink-0 text-[10px] font-semibold text-white bg-red-950 px-1.5 py-0.5 rounded">
                  ×{p.count}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-400">
                <span>sources: {(p.sources as string[]).join(', ')}</span>
                {p.last_seen && <span>last: {p.last_seen.slice(0, 10)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── User metrics leaderboard ──────────────────────────────────────────────────

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' }

function UserMetricsCard() {
  const [days, setDays] = useState(30)
  const [limit, setLimit] = useState(8)
  const [selected, setSelected] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['user-metrics', days],
    queryFn: () => getUserMetrics(days),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  const users: any[] = data?.users ?? []
  const visible = users.slice(0, limit)
  const hasMore = limit < users.length
  const selectedUser = users.find((u) => u.login === selected)

  const radarData = selectedUser
    ? [
        { metric: 'Commits', value: selectedUser.commits },
        { metric: 'PRs Open', value: selectedUser.prs_open },
        { metric: 'PRs Merged', value: selectedUser.prs_merged },
        { metric: 'CI Triggers', value: selectedUser.ci_triggers },
      ]
    : []

  const maxScore = users[0]?.score ?? 1

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <SectionTitle icon={Trophy} title="User Activity Leaderboard" color="text-accent-yellow" />
        <div className="flex items-center gap-1">
          <Calendar size={11} className="text-gray-500" />
          {[1, 3, 7, 14, 130].map((d) => (
            <button
              key={d}
              onClick={() => { setDays(d); setLimit(8) }}
              className={clsx('px-1.5 py-0.5 rounded text-[10px]', days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm flex-1">Loading user data…</div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm flex-1">No activity data in this window.</div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Leaderboard table */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Header */}
            <div className="grid grid-cols-[1.5rem_1fr_4rem_4rem_4rem_4rem] gap-2 text-[9px] text-gray-400 uppercase tracking-wider px-2 pb-1 border-b border-border flex-shrink-0">
              <span>#</span>
              <span>User</span>
              <span className="text-center flex items-center justify-center gap-0.5"><GitCommit size={8} /> Commits</span>
              <span className="text-center flex items-center justify-center gap-0.5"><GitMerge size={8} /> Merged</span>
              <span className="text-center flex items-center justify-center gap-0.5"><Zap size={8} /> CI Runs</span>
              <span className="text-center flex items-center justify-center gap-0.5"><Star size={8} /> Score</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 py-1">
              {visible.map((u, i) => {
                const scorePct = Math.round((u.score / maxScore) * 100)
                const isSelected = selected === u.login
                return (
                  <button
                    key={u.login}
                    onClick={() => setSelected(isSelected ? null : u.login)}
                    className={clsx(
                      'w-full grid grid-cols-[1.5rem_1fr_4rem_4rem_4rem_4rem] gap-2 items-center px-2 py-1.5 rounded-lg text-left transition-colors',
                      isSelected ? 'bg-surface-3 ring-1 ring-accent-yellow/30' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="text-[10px] text-gray-500 text-center">
                      {MEDAL[i] ?? <span className="text-gray-400">{i + 1}</span>}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.login} className="w-5 h-5 rounded-full flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-surface-3 flex-shrink-0 flex items-center justify-center text-[9px] text-gray-400">
                          {u.login[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-200 truncate">{u.login}</p>
                        {u.avg_merge_hours != null && (
                          <p className="text-[9px] text-gray-400">avg merge {u.avg_merge_hours}h</p>
                        )}
                      </div>
                    </div>
                    <span className={clsx('text-center text-xs tabular-nums', u.commits > 0 ? 'text-accent-blue' : 'text-gray-400')}>
                      {u.commits}
                    </span>
                    <span className={clsx('text-center text-xs tabular-nums', u.prs_merged > 0 ? 'text-accent-green' : 'text-gray-400')}>
                      {u.prs_merged}
                    </span>
                    <span className={clsx('text-center text-xs tabular-nums', u.ci_triggers > 0 ? 'text-accent-purple' : 'text-gray-400')}>
                      {u.ci_triggers}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent-yellow transition-all"
                          style={{ width: `${scorePct}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-500 w-6 text-right">{u.score}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            {/* Load more / footer */}
            <div className="flex-shrink-0 pt-1 border-t border-border">
              {hasMore ? (
                <button
                  onClick={() => setLimit((l) => Math.min(l + 5, users.length))}
                  className="w-full text-center text-[10px] text-gray-500 hover:text-gray-300 py-1.5 hover:bg-surface-2 rounded-lg transition-colors"
                >
                  Load more ({users.length - limit} remaining)
                </button>
              ) : (
                <p className="text-[9px] text-gray-400 py-1 px-2">
                  Score = commits×3 + PRs merged×5 + CI triggers · {data?.total_users ?? 0} contributors
                </p>
              )}
            </div>
          </div>

          {/* Radar chart for selected user */}
          {selectedUser && radarData.length > 0 && (
            <div className="w-44 flex-shrink-0">
              <div className="flex items-center gap-1.5 mb-2">
                <img src={selectedUser.avatar} alt="" className="w-5 h-5 rounded-full" />
                <span className="text-xs text-gray-300 truncate">{selectedUser.login}</span>
                <a href={selectedUser.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={10} className="text-gray-400 hover:text-accent-blue" />
                </a>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <RadarChart data={radarData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <PolarGrid stroke="#e5e4e2" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#86939e', fontSize: 8 }} />
                  <Radar dataKey="value" stroke="#86939e" fill="rgba(224,255,79,0.12)" fillOpacity={1} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Open PRs</span>
                  <span className="text-white">{selectedUser.prs_open}</span>
                </div>
                {selectedUser.avg_merge_hours != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Avg merge</span>
                    <span className="text-white">{selectedUser.avg_merge_hours}h</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Pipeline Cost Analytics ───────────────────────────────────────────────────

// GitHub-hosted runner rates (USD per minute)
const RUNNER_RATES: Record<string, number> = {
  ubuntu:       0.008,
  macos:        0.080,
  windows:      0.016,
  'self-hosted': 0,
}

const COST_TIPS = [
  { icon: '🖥️', tip: 'Use self-hosted runners for GPU/long jobs — they run at no per-minute cost' },
  { icon: '📦', tip: 'Cache dependencies (actions/cache) to reduce build time significantly' },
  { icon: '✅', tip: 'Skip re-running fully-passing jobs with path filters and concurrency groups' },
  { icon: '⚡', tip: 'Use matrix strategy to parallelize tests instead of sequential job chains' },
]

interface WorkflowCostRow {
  workflow: string
  file: string
  avgDurationMin: number
  runsPerDay: number
  monthlyCostGH: number
}

function PipelineCostAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['build-perf-cost'],
    queryFn: () => getBuildPerformance(30),
    staleTime: 300_000,
  })

  const workflows: any[] = data?.workflows ?? []

  const rows: WorkflowCostRow[] = workflows.map((wf) => {
    const avgDurationMin: number = wf.avg_min ?? 0
    const sampleCount: number = wf.sample_count ?? 0
    const runsPerDay = Math.round((sampleCount / 30) * 10) / 10  // 1 decimal
    const dailyCost = avgDurationMin * runsPerDay * RUNNER_RATES.ubuntu
    const monthlyCostGH = Math.round(dailyCost * 30 * 100) / 100
    return {
      workflow: wf.workflow ?? wf.file,
      file: wf.file,
      avgDurationMin,
      runsPerDay,
      monthlyCostGH,
    }
  }).sort((a, b) => b.monthlyCostGH - a.monthlyCostGH)

  const totalMonthlyGH = rows.reduce((sum, r) => sum + r.monthlyCostGH, 0)
  const topWorkflow = rows[0]

  if (isLoading) {
    return (
      <Card>
        <SectionTitle icon={DollarSign} title="Pipeline Cost Estimate" color="text-accent-yellow" />
        <div className="flex items-center justify-center py-8 gap-2 text-gray-500 text-sm">
          <RefreshCw size={13} className="animate-spin" />
          Computing cost estimates…
        </div>
      </Card>
    )
  }

  if (workflows.length === 0) {
    return (
      <Card>
        <SectionTitle icon={DollarSign} title="Pipeline Cost Estimate" color="text-accent-yellow" />
        <p className="text-gray-400 text-sm text-center py-6">No workflow performance data available.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Headline cost card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <SectionTitle icon={DollarSign} title="Monthly Cost Estimate" color="text-accent-yellow" />
          <p className="text-3xl font-bold font-mono text-accent-yellow mt-1">
            ${totalMonthlyGH.toFixed(2)}
            <span className="text-sm font-normal text-gray-500 ml-1">/mo estimated</span>
          </p>
          <div className="mt-3 space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-500">GitHub-hosted (Linux)</span>
              <span className="text-white font-mono">${totalMonthlyGH.toFixed(2)}/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Self-hosted runners</span>
              <span className="text-accent-green font-mono font-semibold">$0.00/mo</span>
            </div>
            {topWorkflow && (
              <div className="pt-1 border-t border-border flex justify-between">
                <span className="text-gray-400 truncate max-w-[160px]">Costliest: {topWorkflow.workflow}</span>
                <span className="text-accent-red font-mono font-semibold">${topWorkflow.monthlyCostGH.toFixed(2)}</span>
              </div>
            )}
          </div>
          <p className="text-[9px] text-gray-400 mt-3">
            Assumes ubuntu-latest @ $0.008/min · actual costs vary by runner type and billing plan
          </p>
        </Card>

        {/* Per-workflow cost table */}
        <Card className="lg:col-span-2">
          <SectionTitle icon={BarChart2} title="Per-Workflow Cost Breakdown" color="text-accent-blue" />
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-gray-500 font-medium">Workflow</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">Avg Duration</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">Runs/Day</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">Est. Cost/Mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, i) => (
                  <tr
                    key={row.file}
                    className={clsx('transition-colors', i === 0 ? 'bg-accent-red/5' : 'hover:bg-surface-2')}
                  >
                    <td className="py-2 pr-4">
                      <p className={clsx('font-medium truncate max-w-[180px]', i === 0 ? 'text-white' : 'text-gray-300')}>
                        {row.workflow}
                      </p>
                      <p className="text-[9px] text-gray-400 font-mono">{row.file}</p>
                    </td>
                    <td className="py-2 text-right font-mono text-gray-300">
                      {row.avgDurationMin}m
                    </td>
                    <td className="py-2 text-right font-mono text-gray-400">
                      {row.runsPerDay}
                    </td>
                    <td className="py-2 text-right">
                      <span className={clsx(
                        'font-mono font-semibold',
                        i === 0 ? 'text-accent-red' : row.monthlyCostGH > 5 ? 'text-accent-yellow' : 'text-gray-400'
                      )}>
                        ${row.monthlyCostGH.toFixed(2)}
                      </span>
                      {i === 0 && (
                        <span className="ml-1 text-[9px] text-accent-red border border-accent-red/30 rounded px-1">
                          highest
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Cost-saving tips */}
      <Card>
        <SectionTitle icon={Lightbulb} title="Cost-Saving Tips" color="text-accent-green" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {COST_TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5 p-3 bg-surface-2 rounded-lg border border-border">
              <span className="text-base flex-shrink-0">{tip.icon}</span>
              <p className="text-[11px] text-gray-400 leading-relaxed">{tip.tip}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Repository Pulse ──────────────────────────────────────────────────────────

function RepoPulseCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['insights-pulse'],
    queryFn: getInsightsPulse,
    staleTime: 120_000,
    refetchInterval: 300_000,
  })
  const { data: participation } = useQuery({
    queryKey: ['insights-participation'],
    queryFn: getInsightsParticipation,
    staleTime: 300_000,
  })

  const partData = (participation?.all ?? []).map((v: number, i: number) => ({
    week: `W${26 - i}`,
    all: v,
    owner: (participation?.owner ?? [])[i] ?? 0,
  })).reverse()

  if (isLoading || !data) return null

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-4">
      <SectionTitle icon={Zap} title="Repository Pulse" color="text-nvidia" />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Stars',        value: (data.stars        ?? 0).toLocaleString(), icon: Star,        color: 'text-neutral-400' },
          { label: 'Forks',        value: (data.forks        ?? 0).toLocaleString(), icon: GitFork,     color: 'text-neutral-300' },
          { label: 'Watchers',     value: (data.watchers     ?? 0).toLocaleString(), icon: Eye,         color: 'text-neutral-400' },
          { label: 'Open Issues',  value: (data.open_issues  ?? 0).toLocaleString(), icon: AlertCircle, color: 'text-accent-green' },
          { label: 'Commits (4w)', value: data.recent_commits ?? 0,                  icon: GitCommit,   color: 'text-white'        },
          { label: 'Opened (30d)', value: data.new_issues_30d   ?? 0,                icon: AlertCircle, color: 'text-accent-red'   },
          { label: 'Closed (30d)', value: data.closed_issues_30d ?? 0,               icon: AlertCircle, color: 'text-accent-green' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-surface-2 border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</p>
              <Icon size={10} className={color} />
            </div>
            <p className={clsx('text-xl font-semibold tabular-nums', color)}>{value}</p>
          </div>
        ))}
      </div>

      {data.description && (
        <div className="flex items-center gap-2 text-sm text-gray-300 flex-wrap">
          {data.language && <span className="text-[10px] bg-surface-2 px-2 py-0.5 rounded text-gray-400 flex-shrink-0">{data.language}</span>}
          <p className="flex-1 min-w-0 leading-relaxed">{data.description}</p>
          {data.size_kb && <span className="text-[10px] text-gray-500 flex-shrink-0">{(data.size_kb / 1024).toFixed(1)} MB</span>}
        </div>
      )}

      {partData.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Commit Participation — Last 26 Weeks</p>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={partData} barSize={6}>
              <XAxis dataKey="week" tick={{ fill: '#86939e', fontSize: 8 }} interval={4} />
              <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={25} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="all"   name="All commits" fill="#0b5cff" opacity={0.6} />
              <Bar dataKey="owner" name="Owner"        fill="#76b900" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── 52-week commit history ────────────────────────────────────────────────────

function WeeklyCommitCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['insights-commit-activity'],
    queryFn: getInsightsCommitActivity,
    staleTime: 300_000,
    refetchInterval: (query: any) => query.state.data?.computing ? 12_000 : false,
  })

  const weeks: any[] = data?.weeks ?? []
  const chartData = weeks.slice(-52).map((w: any) => ({
    label: format(fromUnixTime(w.week), 'MMM d'),
    total: w.total,
  }))
  const totalYear  = chartData.reduce((s, w) => s + w.total, 0)
  const maxWeek    = Math.max(...chartData.map((w) => w.total), 0)
  const avgWeek    = chartData.length ? Math.round(totalYear / chartData.length) : 0

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={GitCommit} title="52-Week Commit History" color="text-accent-blue" />
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span><span className="text-white font-semibold">{totalYear.toLocaleString()}</span> total</span>
          <span><span className="text-neutral-300 font-semibold">{avgWeek}</span> avg/wk</span>
          <span><span className="text-accent-green font-semibold">{maxWeek}</span> best</span>
        </div>
      </div>
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-6">Loading…</p>
      ) : data?.computing ? (
        <ComputingNotice />
      ) : chartData.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} barSize={7}>
            <XAxis dataKey="label" tick={{ fill: '#86939e', fontSize: 8 }} interval={7} />
            <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={30} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [v, 'Commits']} />
            <Bar dataKey="total" fill="#0b5cff" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// ── Code frequency ────────────────────────────────────────────────────────────

function CodeFrequencyCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['insights-code-frequency'],
    queryFn: getInsightsCodeFrequency,
    staleTime: 300_000,
    refetchInterval: (query: any) => query.state.data?.computing ? 12_000 : false,
  })

  const weeks: any[] = data?.weeks ?? []
  const chartData = weeks.slice(-52).map((w: any) => ({
    label:     format(fromUnixTime(w.week), 'MMM d'),
    additions: w.additions,
    deletions: -w.deletions,
  }))
  const totalAdded   = weeks.reduce((s: number, w: any) => s + w.additions, 0)
  const totalDeleted = weeks.reduce((s: number, w: any) => s + w.deletions, 0)
  const netChange    = totalAdded - totalDeleted

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={Code} title="Code Frequency (52w)" color="text-accent-teal" />
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-accent-green">+{totalAdded.toLocaleString()}</span>
          <span className="text-accent-red">-{totalDeleted.toLocaleString()}</span>
          <span className={clsx('font-semibold', netChange >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {netChange >= 0 ? '+' : ''}{netChange.toLocaleString()} net
          </span>
        </div>
      </div>
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-6">Loading…</p>
      ) : data?.computing ? (
        <ComputingNotice />
      ) : chartData.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="label" tick={{ fill: '#86939e', fontSize: 8 }} interval={7} />
            <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={45}
              tickFormatter={(v) => {
                const abs = Math.abs(v)
                return abs >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }} />
            <Tooltip {...TOOLTIP_STYLE}
              formatter={(v: any, name: string) => [
                Math.abs(v).toLocaleString(),
                name === 'additions' ? 'Added' : 'Deleted',
              ]} />
            <Area type="monotone" dataKey="additions" name="additions" stroke="#76b900" fill="#76b900" fillOpacity={0.3} strokeWidth={1.5} />
            <Area type="monotone" dataKey="deletions" name="deletions" stroke="#ff1b2d" fill="#ff1b2d" fillOpacity={0.3} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// ── Forks ─────────────────────────────────────────────────────────────────────

function ForksCard() {
  const [sort, setSort] = useState<'newest' | 'oldest' | 'stargazers' | 'watchers'>('newest')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights-forks', sort, page],
    queryFn: () => getInsightsForks(sort, page),
    staleTime: 120_000,
  })

  const forks: any[] = data?.forks ?? []

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={GitFork} title="Repository Forks" color="text-neutral-400" />
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
          {(['newest', 'oldest', 'stargazers', 'watchers'] as const).map((key) => (
            <button key={key} onClick={() => { setSort(key); setPage(1) }}
              className={clsx('px-2 py-0.5 rounded text-[10px] capitalize transition-colors',
                sort === key ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {key}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-gray-500 text-sm text-center py-6">Loading forks…</p>}
      {isError  && <p className="text-accent-red text-sm text-center py-6">Failed to load forks.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {forks.map((f) => (
          <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-lg hover:border-gray-600 transition-colors">
            <img src={f.owner.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0" alt="" />
            <div className="flex-1 min-w-0">
              <a href={f.html_url} target="_blank" rel="noreferrer"
                className="text-[11px] font-medium text-white hover:text-neutral-300 truncate block">
                {f.full_name}
              </a>
              <div className="flex items-center gap-2 text-[9px] text-gray-400">
                <span className="flex items-center gap-0.5"><Star size={7} /> {f.stars}</span>
                <span className="flex items-center gap-0.5"><GitFork size={7} /> {f.forks}</span>
                {f.pushed_at && (
                  <span>{formatDistanceToNow(new Date(f.pushed_at), { addSuffix: true })}</span>
                )}
              </div>
            </div>
            <a href={f.html_url} target="_blank" rel="noreferrer">
              <ExternalLink size={9} className="text-gray-400 hover:text-neutral-300 flex-shrink-0" />
            </a>
          </div>
        ))}
      </div>

      {(forks.length === 30 || page > 1) && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded text-xs bg-surface-2 text-gray-300 hover:bg-surface-3 disabled:opacity-40">
            ← Prev
          </button>
          <span className="text-xs text-gray-500">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={forks.length < 30}
            className="px-3 py-1.5 rounded text-xs bg-surface-2 text-gray-300 hover:bg-surface-3 disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { data: overview } = useQuery({
    queryKey: ['overview'],
    queryFn: () => req('/overview/summary'),
    staleTime: 60_000,
  })
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''
  const { data: ca } = useCommitActivity(30)
  const { data: bt } = useBuildTrends(30)
  const { data: pv } = usePRVelocity()

  const statItems = [
    {
      label: 'Commits (30d)',
      value: ca?.total_commits ?? ca?.total_30d ?? '—',
      color: 'text-accent-blue',
      sub: `${ca?.top_authors?.[0]?.login ?? '—'} leads`,
    },
    {
      label: 'Build success rate',
      value: bt?.summary?.success_rate != null ? `${bt.summary.success_rate}%` : '—',
      color: bt?.summary?.success_rate >= 80 ? 'text-accent-green' : 'text-accent-red',
      sub: `${bt?.summary?.total_runs ?? 0} total builds`,
    },
    {
      label: 'Avg PR merge time',
      value: pv?.summary?.avg_hours != null ? `${pv.summary.avg_hours}h` : '—',
      color: 'text-accent-purple',
      sub: `median ${pv?.summary?.median_hours ?? '—'}h`,
    },
    {
      label: 'Open PRs',
      value: overview?.prs?.open ?? '—',
      color: 'text-white',
      sub: `${overview?.prs?.draft ?? 0} drafts`,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 size={18} className="text-accent-blue" />
          <h1 className="text-lg font-semibold">Analytics & Insights</h1>
          <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
            {repoSlug}
          </span>
        </div>
      </div>

      {/* Key metrics */}
      <StatRow items={statItems} />

      {/* Repository Pulse */}
      <RepoPulseCard />

      {/* Charts row 1: daily commit activity + build trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CommitActivityChart />
        <BuildTrendChart />
      </div>

      {/* Charts row 2: failure rates + PR velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FailureRateChart />
        <PRVelocityCard />
      </div>

      {/* GitHub Stats: 52-week commit history + code frequency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WeeklyCommitCard />
        <CodeFrequencyCard />
      </div>

      {/* Leaderboard + Contributors + Recent Commits — single row, equal height */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
        <div className="lg:col-span-2 flex flex-col">
          <UserMetricsCard />
        </div>
        <div className="flex flex-col">
          <ContributorsCard />
        </div>
        <div className="lg:col-span-2 flex flex-col">
          <RecentCommitsCard />
        </div>
      </div>

      {/* Error patterns + Forks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ErrorPatternsCard />
        <ForksCard />
      </div>

      {/* Pipeline Cost Analytics */}
      <div>
        <div className="section-head">
          <DollarSign size={13} className="text-accent-yellow flex-shrink-0" />
          Pipeline Cost Estimate
        </div>
        <PipelineCostAnalytics />
      </div>
    </div>
  )
}
