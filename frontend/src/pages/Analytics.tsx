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
  GitMerge, Zap, Star,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  getOverviewSummary, getUserMetrics,
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

const useContributors = () =>
  useQuery({ queryKey: ['contributors'], queryFn: () => req('/analytics/contributors'), staleTime: 600_000 })

const useErrorPatterns = () =>
  useQuery({ queryKey: ['error-patterns'], queryFn: () => req('/analytics/error-patterns'), staleTime: 120_000 })

// ── Shared components ─────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={13} className={color} />
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h2>
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
  contentStyle: { background: '#161b27', border: '1px solid #2d3748', borderRadius: 6, fontSize: 11 },
  labelStyle: { color: '#9ca3af' },
}

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatRow({ items }: { items: { label: string; value: string | number; color?: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map(({ label, value, color, sub }) => (
        <Card key={label}>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
          <p className={clsx('text-2xl font-semibold tabular-nums', color ?? 'text-white')}>{value}</p>
          {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
        </Card>
      ))}
    </div>
  )
}

// ── Commit activity chart ─────────────────────────────────────────────────────

function CommitActivityChart() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useCommitActivity(days)
  const series = data?.series ?? []
  const nonZero = series.filter((d: any) => d.commits > 0)
  const maxVal = Math.max(...series.map((d: any) => d.commits), 1)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={GitCommit} title="Commit Activity" color="text-accent-blue" />
        <div className="flex items-center gap-1 text-[10px]">
          {[14, 30, 60, 90].map((d) => (
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
        <p className="text-gray-600 text-sm text-center py-6">Loading…</p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={series} barSize={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 9 }}
              tickFormatter={(v: string) => v.slice(5)}
              interval={Math.floor(series.length / 8)}
            />
            <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} allowDecimals={false} width={20} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [v, 'commits']} />
            <Bar dataKey="commits" radius={[2, 2, 0, 0]}>
              {series.map((entry: any, i: number) => (
                <Cell
                  key={i}
                  fill={entry.commits === 0 ? '#1c2333' : entry.commits === maxVal ? '#3b82f6' : '#2563eb88'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      {!isLoading && (
        <p className="text-[10px] text-gray-600 mt-1">
          {data?.total_commits ?? 0} commits total · {nonZero.length} active days
        </p>
      )}
    </Card>
  )
}

// ── Build success trend ───────────────────────────────────────────────────────

function BuildTrendChart() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useBuildTrends(days)
  const series = (data?.series ?? []).filter((d: any) => d.total > 0)
  const summary = data?.summary

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={TrendingUp} title="Build Success Rate Trend" color="text-accent-green" />
        <div className="flex items-center gap-1 text-[10px]">
          {[14, 30, 60].map((d) => (
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
        <p className="text-gray-600 text-sm text-center py-6">Loading…</p>
      ) : series.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-6">No build data in this window.</p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={20} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="success" stroke="#22c55e" fill="url(#successGrad)" strokeWidth={2} name="success" />
            <Area type="monotone" dataKey="failure" stroke="#ef4444" fill="url(#failGrad)" strokeWidth={2} name="failure" />
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
        <p className="text-gray-600 text-sm text-center py-6">Loading — fetching {runs} runs' job data…</p>
      ) : jobs.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-6">No data.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(jobs.length * 36, 120)}>
            <BarChart data={chartData} layout="vertical" barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 9 }} width={160} />
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
                      entry.failure_rate >= 50 ? '#ef4444' :
                      entry.failure_rate >= 20 ? '#f97316' :
                      entry.failure_rate > 0  ? '#eab308' : '#22c55e'
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
                  <span className="text-gray-600">{j.failed}/{j.total} runs</span>
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

  const PIE_COLORS = ['#22c55e', '#3b82f6', '#eab308', '#f97316', '#ef4444']

  return (
    <Card>
      <SectionTitle icon={Clock} title="PR Velocity & Merge Time" color="text-accent-purple" />
      {isLoading ? (
        <p className="text-gray-600 text-sm text-center py-6">Loading…</p>
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
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 8 }} tickFormatter={(v: string) => v.slice(5)} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="opened" fill="#3b82f6" name="opened" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="merged" fill="#22c55e" name="merged" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Top contributors ──────────────────────────────────────────────────────────

function ContributorsCard() {
  const { data, isLoading } = useContributors()
  const contributors: any[] = data?.contributors ?? []

  return (
    <Card className="h-full flex flex-col">
      <SectionTitle icon={Users} title="Top Contributors" color="text-accent-orange" />
      {isLoading ? (
        <p className="text-gray-600 text-sm text-center py-6 flex-1">Loading…</p>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {contributors.slice(0, 10).map((c, i) => {
            const max = contributors[0]?.total ?? 1
            const pct = Math.round((c.total / max) * 100)
            return (
              <div key={c.login} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 w-4 text-right">{i + 1}</span>
                {c.avatar ? (
                  <img src={c.avatar} alt="" className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center text-[8px] text-gray-400">
                    {c.login[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-300 hover:text-accent-blue truncate"
                    >
                      {c.login}
                    </a>
                    <span className="text-[10px] text-gray-500 flex-shrink-0 ml-2">{c.total}</span>
                  </div>
                  <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-orange"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
          {data?.source === 'raw_commits_90d' && (
            <p className="text-[9px] text-gray-700 mt-2">Based on last 90 days of commits (GitHub stats API warming up)</p>
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
        <p className="text-gray-600 text-sm text-center py-6 flex-1">Loading…</p>
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
                  <ExternalLink size={10} className="text-gray-600 hover:text-accent-blue" />
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
              className="mt-2 w-full text-center text-[10px] text-gray-600 hover:text-gray-400 py-1"
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
        <p className="text-gray-600 text-sm text-center py-4">
          No errors in log store yet. Ingest a GHA run from the Logs page.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <SectionTitle icon={AlertTriangle} title={`Top Error Patterns (${data?.total_errors ?? 0} total errors)`} color="text-accent-red" />
      {isLoading ? (
        <p className="text-gray-600 text-sm text-center py-4">Loading…</p>
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
              <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-600">
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
          {[7, 14, 30, 60, 90].map((d) => (
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
        <div className="text-center py-8 text-gray-600 text-sm flex-1">Loading user data…</div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm flex-1">No activity data in this window.</div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Leaderboard table */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Header */}
            <div className="grid grid-cols-[1.5rem_1fr_4rem_4rem_4rem_4rem] gap-2 text-[9px] text-gray-600 uppercase tracking-wider px-2 pb-1 border-b border-border flex-shrink-0">
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
                      {MEDAL[i] ?? <span className="text-gray-600">{i + 1}</span>}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.login} className="w-5 h-5 rounded-full flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-surface-3 flex-shrink-0 flex items-center justify-center text-[8px] text-gray-400">
                          {u.login[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-gray-200 truncate">{u.login}</p>
                        {u.avg_merge_hours != null && (
                          <p className="text-[9px] text-gray-600">avg merge {u.avg_merge_hours}h</p>
                        )}
                      </div>
                    </div>
                    <span className={clsx('text-center text-xs tabular-nums', u.commits > 0 ? 'text-accent-blue' : 'text-gray-700')}>
                      {u.commits}
                    </span>
                    <span className={clsx('text-center text-xs tabular-nums', u.prs_merged > 0 ? 'text-accent-green' : 'text-gray-700')}>
                      {u.prs_merged}
                    </span>
                    <span className={clsx('text-center text-xs tabular-nums', u.ci_triggers > 0 ? 'text-accent-purple' : 'text-gray-700')}>
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
                <p className="text-[9px] text-gray-700 py-1 px-2">
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
                  <ExternalLink size={10} className="text-gray-600 hover:text-accent-blue" />
                </a>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <RadarChart data={radarData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <PolarGrid stroke="#2d3748" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 8 }} />
                  <Radar dataKey="value" stroke="#eab308" fill="#eab308" fillOpacity={0.25} />
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { data: overview } = useQuery({
    queryKey: ['overview'],
    queryFn: () => req('/overview/summary'),
    staleTime: 60_000,
  })
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
            isaac-sim/IsaacLab
          </span>
        </div>
      </div>

      {/* Key metrics */}
      <StatRow items={statItems} />

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CommitActivityChart />
        <BuildTrendChart />
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FailureRateChart />
        <PRVelocityCard />
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

      {/* Error patterns */}
      <ErrorPatternsCard />
    </div>
  )
}
