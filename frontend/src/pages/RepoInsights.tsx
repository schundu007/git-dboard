import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, GitCommit, Users, Code, GitFork,
  Star, Eye, AlertCircle, Zap, ExternalLink, Calendar,
  BarChart2, Clock, Activity,
} from 'lucide-react'
import { formatDistanceToNow, fromUnixTime, format } from 'date-fns'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import {
  getInsightsPulse, getInsightsContributors, getInsightsCommitActivity,
  getInsightsCodeFrequency, getInsightsForks, getInsightsParticipation,
  getActiveRepo,
} from '../lib/api'
import clsx from 'clsx'

const BASE = 'http://localhost:8000'
const req = (path: string) => fetch(`${BASE}${path}`).then(r => r.json())
const TOOLTIP_STYLE = {
  contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 6, fontSize: 11 },
  labelStyle: { color: '#56687a' },
}

// ── Pulse ─────────────────────────────────────────────────────────────────────

function PulseTab() {
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
    week: `W-${26 - i}`,
    all: v,
    owner: (participation?.owner ?? [])[i] ?? 0,
  })).reverse()

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Loading pulse data…</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      {/* Repo summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Stars</p>
            <Star size={12} className="text-neutral-400" />
          </div>
          <p className="text-2xl font-semibold text-neutral-400 tabular-nums">
            {(data.stars ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Forks</p>
            <GitFork size={12} className="text-neutral-300" />
          </div>
          <p className="text-2xl font-semibold text-neutral-300 tabular-nums">
            {(data.forks ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Watchers</p>
            <Eye size={12} className="text-neutral-400" />
          </div>
          <p className="text-2xl font-semibold text-neutral-400 tabular-nums">
            {(data.watchers ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Open Issues</p>
            <AlertCircle size={12} className="text-accent-green" />
          </div>
          <p className="text-2xl font-semibold text-accent-green tabular-nums">
            {(data.open_issues ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Activity stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Commits (4 weeks)</p>
          <p className="text-2xl font-semibold text-white tabular-nums">{data.recent_commits ?? 0}</p>
          <p className="text-[10px] text-gray-600">across all branches</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Issues Opened (30d)</p>
          <p className="text-2xl font-semibold text-accent-red tabular-nums">{data.new_issues_30d ?? 0}</p>
          <p className="text-[10px] text-gray-600">new issues opened</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Issues Closed (30d)</p>
          <p className="text-2xl font-semibold text-accent-green tabular-nums">{data.closed_issues_30d ?? 0}</p>
          <p className="text-[10px] text-gray-600">resolved recently</p>
        </div>
      </div>

      {/* Repo description */}
      {data.description && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-start gap-3">
            {data.language && (
              <span className="text-[10px] bg-surface-2 px-2 py-0.5 rounded text-gray-400 flex-shrink-0">{data.language}</span>
            )}
            <p className="text-sm text-gray-300">{data.description}</p>
          </div>
          {data.size_kb && (
            <p className="text-[10px] text-gray-600 mt-2">Repository size: {(data.size_kb / 1024).toFixed(1)} MB</p>
          )}
        </div>
      )}

      {/* Commit participation chart */}
      {partData.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-4">Weekly Commit Activity — Last 26 Weeks</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={partData} barSize={8}>
              <XAxis dataKey="week" tick={{ fill: '#86939e', fontSize: 8 }} interval={4} />
              <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={25} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 }}
                itemStyle={{ color: '#1d2226' }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="all" name="All commits" fill="#0b5cff" opacity={0.7} />
              <Bar dataKey="owner" name="Owner" fill="#0b5cff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Contributors tab ──────────────────────────────────────────────────────────

function ComputingNotice() {
  return (
    <div className="text-center py-12 space-y-2">
      <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-nvidia animate-pulse" />
        GitHub is computing stats — auto-retrying…
      </div>
      <p className="text-[11px] text-gray-600">This can take up to 60 seconds for large repos</p>
    </div>
  )
}

function ContributorsTab() {
  const [sortBy, setSortBy] = useState<'total' | 'recent'>('total')

  const { data, isLoading } = useQuery({
    queryKey: ['insights-contributors'],
    queryFn: getInsightsContributors,
    staleTime: 300_000,
    refetchInterval: (query) => query.state.data?.computing ? 12_000 : false,
  })

  const contributors: any[] = data?.contributors ?? []
  const sorted = [...contributors].sort((a, b) => {
    if (sortBy === 'recent') {
      const aRecent = a.weeks.slice(-4).reduce((s: number, w: any) => s + w.c, 0)
      const bRecent = b.weeks.slice(-4).reduce((s: number, w: any) => s + w.c, 0)
      return bRecent - aRecent
    }
    return b.total - a.total
  })

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Loading contributor data…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-400">{data?.total ?? 0} contributors</p>
          {!data?.has_weekly && (
            <span className="flex items-center gap-1 text-[10px] text-neutral-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-nvidia animate-pulse" />
              weekly data computing…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
          {([['total', 'All time'], ['recent', 'Recent (4w)']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)}
              className={clsx('px-2.5 py-0.5 rounded text-[10px] transition-colors',
                sortBy === key ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {sorted.slice(0, 20).map((c, idx) => {
          const hasWeekly = c.weeks && c.weeks.length > 0
          const recentCommits = hasWeekly ? c.weeks.slice(-4).reduce((s: number, w: any) => s + w.c, 0) : 0
          const chartData = hasWeekly ? c.weeks.map((w: any, i: number) => ({ w: i, c: w.c })) : []
          const maxContrib = Math.max(1, ...sorted.slice(0, 1).map((x: any) => x.total))
          const pct = Math.round((c.total / maxContrib) * 100)

          return (
            <div key={c.login} className="bg-surface-1 border border-border rounded-xl p-3">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-600 w-5 text-right flex-shrink-0">#{idx + 1}</span>
                {c.avatar_url && <img src={c.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0" alt="" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white">{c.login}</span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-gray-500">{c.total.toLocaleString()} commits</span>
                      {recentCommits > 0 && (
                        <span className="text-accent-green">+{recentCommits} recent</span>
                      )}
                    </div>
                  </div>
                  <div className="h-1 bg-surface-3 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-nvidia rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Mini sparkline — only when weekly stats are available */}
                {hasWeekly ? (
                  <div className="w-24 h-6 flex-shrink-0">
                    <ResponsiveContainer width="100%" height={24}>
                      <BarChart data={chartData} barSize={3}>
                        <Bar dataKey="c" fill="#0b5cff" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="w-24 h-6 flex-shrink-0 flex items-center justify-end">
                    <span className="text-[9px] text-gray-700">no weekly data</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Commit activity tab ───────────────────────────────────────────────────────

function CommitActivityTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['insights-commit-activity'],
    queryFn: getInsightsCommitActivity,
    staleTime: 300_000,
    refetchInterval: (query) => query.state.data?.computing ? 12_000 : false,
  })

  const weeks: any[] = data?.weeks ?? []
  const chartData = weeks.slice(-52).map((w: any) => ({
    label: format(fromUnixTime(w.week), 'MMM d'),
    total: w.total,
  }))
  const totalYear = chartData.reduce((s, w) => s + w.total, 0)
  const maxWeek = Math.max(...chartData.map((w) => w.total))
  const avgWeek = chartData.length ? Math.round(totalYear / chartData.length) : 0

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Loading commit activity…</div>
  if (data?.computing) return <ComputingNotice />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Commits (52w)</p>
          <p className="text-2xl font-semibold text-white tabular-nums">{totalYear.toLocaleString()}</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Weekly Avg</p>
          <p className="text-2xl font-semibold text-neutral-300 tabular-nums">{avgWeek}</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Best Week</p>
          <p className="text-2xl font-semibold text-accent-green tabular-nums">{maxWeek}</p>
        </div>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-4">Commits per Week — Last 52 Weeks</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} barSize={7}>
            <XAxis dataKey="label" tick={{ fill: '#86939e', fontSize: 8 }} interval={7} />
            <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={30} />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 }}
              formatter={(v: any) => [v, 'Commits']}
            />
            <Bar dataKey="total" fill="#0b5cff" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Code frequency tab ────────────────────────────────────────────────────────

function CodeFrequencyTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['insights-code-frequency'],
    queryFn: getInsightsCodeFrequency,
    staleTime: 300_000,
    refetchInterval: (query) => query.state.data?.computing ? 12_000 : false,
  })

  const weeks: any[] = data?.weeks ?? []
  const chartData = weeks.slice(-52).map((w: any) => ({
    label: format(fromUnixTime(w.week), 'MMM d'),
    additions: w.additions,
    deletions: -w.deletions,
  }))

  const totalAdded = weeks.reduce((s: number, w: any) => s + w.additions, 0)
  const totalDeleted = weeks.reduce((s: number, w: any) => s + w.deletions, 0)
  const netChange = totalAdded - totalDeleted

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Loading code frequency…</div>
  if (data?.computing) return <ComputingNotice />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Lines Added</p>
          <p className="text-2xl font-semibold text-accent-green tabular-nums">+{totalAdded.toLocaleString()}</p>
          <p className="text-[10px] text-gray-600">last 52 weeks</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Lines Deleted</p>
          <p className="text-2xl font-semibold text-accent-red tabular-nums">-{totalDeleted.toLocaleString()}</p>
          <p className="text-[10px] text-gray-600">last 52 weeks</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Net Change</p>
          <p className={clsx('text-2xl font-semibold tabular-nums', netChange >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {netChange >= 0 ? '+' : ''}{netChange.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-600">lines of code</p>
        </div>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-4">Code Additions & Deletions — Last 52 Weeks</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="label" tick={{ fill: '#86939e', fontSize: 8 }} interval={7} />
            <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={45}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 11 }}
              formatter={(v: any, name: string) => [Math.abs(v).toLocaleString(), name === 'additions' ? 'Additions' : 'Deletions']}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="additions" name="Additions" stroke="#76b900" fill="#76b900" fillOpacity={0.3} strokeWidth={1.5} />
            <Area type="monotone" dataKey="deletions" name="Deletions" stroke="#ff1b2d" fill="#ff1b2d" fillOpacity={0.3} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Forks tab ─────────────────────────────────────────────────────────────────

function ForksTab() {
  const [sort, setSort] = useState<'newest' | 'oldest' | 'stargazers' | 'watchers'>('newest')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights-forks', sort, page],
    queryFn: () => getInsightsForks(sort, page),
    staleTime: 120_000,
  })

  const forks: any[] = data?.forks ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Showing public forks</p>
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
          {([['newest', 'Newest'], ['oldest', 'Oldest'], ['stargazers', 'Stars'], ['watchers', 'Watchers']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setSort(key); setPage(1) }}
              className={clsx('px-2 py-0.5 rounded text-[10px] transition-colors',
                sort === key ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Loading forks…</div>}
      {isError && <div className="text-center py-12 text-accent-red text-sm">Failed to load forks.</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {forks.map((f) => (
          <div key={f.id} className="bg-surface-1 border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-gray-600 transition-colors">
            <img src={f.owner.avatar_url} className="w-8 h-8 rounded-full flex-shrink-0" alt="" />
            <div className="flex-1 min-w-0">
              <a href={f.html_url} target="_blank" rel="noreferrer"
                className="text-xs font-medium text-white hover:text-neutral-300 transition-colors truncate block">
                {f.full_name}
              </a>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
                <span className="flex items-center gap-0.5"><Star size={8} className="text-neutral-400" /> {f.stars}</span>
                <span className="flex items-center gap-0.5"><GitFork size={8} /> {f.forks}</span>
                {f.pushed_at && (
                  <span>pushed {formatDistanceToNow(new Date(f.pushed_at), { addSuffix: true })}</span>
                )}
              </div>
            </div>
            <a href={f.html_url} target="_blank" rel="noreferrer">
              <ExternalLink size={11} className="text-gray-600 hover:text-neutral-300 flex-shrink-0" />
            </a>
          </div>
        ))}
      </div>

      {(forks.length === 30 || page > 1) && (
        <div className="flex items-center justify-center gap-3">
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
    </div>
  )
}

// ── Build Trends tab ──────────────────────────────────────────────────────────

function BuildTrendsTab() {
  const [days, setDays] = useState(30)
  const { data: bt, isLoading: btLoading } = useQuery({
    queryKey: ['insight-build-trends', days],
    queryFn: () => req(`/analytics/build-trends?days=${days}`),
    staleTime: 120_000,
  })
  const series = (bt?.series ?? []).filter((d: any) => d.total > 0)
  const summary = bt?.summary

  return (
    <div className="space-y-4">
      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Build Success Rate Trend</p>
          <div className="flex items-center gap-1 text-[10px]">
            {[14, 30, 60].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={clsx('px-1.5 py-0.5 rounded', days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        {summary && (
          <div className="flex items-center gap-4 mb-3 text-xs">
            <span className="text-nvidia font-semibold">{summary.success_rate ?? '—'}% success</span>
            <span className="text-gray-500">{summary.total_runs} runs</span>
            <span className="text-accent-red">{summary.failed} failed</span>
          </div>
        )}
        {btLoading ? <p className="text-gray-600 text-sm text-center py-6">Loading…</p>
          : series.length === 0 ? <p className="text-gray-600 text-sm text-center py-6">No data in window.</p>
          : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="btSucc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#76b900" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#76b900" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="btFail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff1b2d" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff1b2d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" />
              <XAxis dataKey="date" tick={{ fill: '#86939e', fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={20} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="success" stroke="#76b900" fill="url(#btSucc)" strokeWidth={2} name="success" />
              <Area type="monotone" dataKey="failure" stroke="#ff1b2d" fill="url(#btFail)" strokeWidth={2} name="failure" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── PR Velocity tab ───────────────────────────────────────────────────────────

function PRVelocityTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['insight-pr-velocity'],
    queryFn: () => req('/analytics/pr-velocity?limit=100'),
    staleTime: 300_000,
  })
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
  const PIE_COLORS = ['#76b900', '#484848', '#2c2c2c', '#2c2c2c', '#ff1b2d']

  if (isLoading) return <p className="text-gray-500 text-sm text-center py-12">Loading PR velocity data…</p>
  if (!data) return null

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'PRs Analysed', value: summary.total_prs },
            { label: 'Avg Merge Time', value: summary.avg_merge_time_label },
            { label: 'Median Merge', value: summary.median_merge_time_label },
            { label: 'Merged Today', value: summary.merged_today ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface-1 border border-border rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-xl font-semibold tabular-nums text-neutral-200">{value ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {distData.length > 0 && (
          <div className="bg-surface-1 border border-border rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Merge Time Distribution</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={distData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                  {distData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {topAuthors.length > 0 && (
          <div className="bg-surface-1 border border-border rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Top Contributors by PRs Merged</p>
            <div className="space-y-2">
              {topAuthors.slice(0, 8).map((a: any) => (
                <div key={a.login} className="flex items-center gap-2 text-[11px]">
                  <img src={a.avatar_url} className="w-4 h-4 rounded-full flex-shrink-0" alt="" />
                  <span className="text-gray-300 truncate flex-1">{a.login}</span>
                  <span className="text-nvidia font-semibold tabular-nums">{a.merged}</span>
                  <span className="text-gray-600">merged</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {weeklyTrend.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Weekly PR Activity</p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={weeklyTrend} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" />
              <XAxis dataKey="week" tick={{ fill: '#86939e', fontSize: 9 }} />
              <YAxis tick={{ fill: '#86939e', fontSize: 9 }} width={20} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="opened" name="Opened" fill="#bab9b6" />
              <Bar dataKey="merged" name="Merged" fill="#76b900" />
              <Bar dataKey="closed" name="Closed" fill="#a19f9a" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Failure Analysis tab ──────────────────────────────────────────────────────

function FailureAnalysisTab() {
  const [runs, setRuns] = useState(30)
  const { data, isLoading } = useQuery({
    queryKey: ['insight-failure-analysis', runs],
    queryFn: () => req(`/analytics/failure-analysis?runs=${runs}`),
    staleTime: 120_000,
  })
  const jobs: any[] = data?.ranked ?? data?.jobs ?? []
  const chartData = jobs.map(j => ({
    name: j.name.replace('test-', '').replace('-compat', '').slice(0, 30),
    failure_rate: j.failure_rate,
    failed: j.failed,
    total: j.total,
  }))

  return (
    <div className="space-y-4">
      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Nightly Job Failure Rate</p>
          <div className="flex items-center gap-1 text-[10px]">
            {[14, 30, 60].map(r => (
              <button key={r} onClick={() => setRuns(r)}
                className={clsx('px-1.5 py-0.5 rounded', runs === r ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}>
                {r} runs
              </button>
            ))}
          </div>
        </div>
        {isLoading ? <p className="text-gray-600 text-sm text-center py-6">Loading…</p>
          : jobs.length === 0 ? <p className="text-gray-600 text-sm text-center py-6">No data.</p>
          : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(jobs.length * 30, 120)}>
              <BarChart data={chartData} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#86939e', fontSize: 9 }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#86939e', fontSize: 9 }} width={160} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, _: any, props: any) => [`${v}% (${props.payload.failed}/${props.payload.total})`, 'failure rate']} />
                <Bar dataKey="failure_rate" radius={[0, 3, 3, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.failure_rate >= 50 ? '#ff1b2d' : entry.failure_rate >= 20 ? '#bab9b6' : entry.failure_rate > 0 ? '#a19f9a' : '#76b900'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 border-t border-border pt-3 space-y-1">
              {jobs.slice(0, 10).map(j => (
                <div key={j.name} className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400 truncate max-w-[220px]">{j.name}</span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={clsx('font-semibold', j.failure_rate >= 50 ? 'text-accent-red' : j.failure_rate >= 20 ? 'text-neutral-300' : j.failure_rate > 0 ? 'text-neutral-400' : 'text-nvidia')}>
                      {j.failure_rate}%
                    </span>
                    <span className="text-gray-600">{j.failed}/{j.total}</span>
                    {j.consecutive_failures > 0 && <span className="text-accent-red">streak: {j.consecutive_failures}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function InsightSection({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Icon size={13} className="text-neutral-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-white">{label}</h2>
      </div>
      {children}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RepoInsights() {
  const { data: arData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = arData?.active?.slug ?? ''

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-end">
        <a href={`https://github.com/${repoSlug}/graphs`} target="_blank" rel="noreferrer"
          className="text-[10px] text-gray-500 hover:text-neutral-300 flex items-center gap-1">
          View on GitHub <ExternalLink size={10} />
        </a>
      </div>

      <InsightSection icon={Zap}      label="Pulse">            <PulseTab />          </InsightSection>
      <InsightSection icon={Users}    label="Contributors">     <ContributorsTab />   </InsightSection>
      <InsightSection icon={GitCommit} label="Commit Activity"> <CommitActivityTab /> </InsightSection>
      <InsightSection icon={Code}     label="Code Frequency">   <CodeFrequencyTab />  </InsightSection>
      <InsightSection icon={GitFork}  label="Forks">            <ForksTab />          </InsightSection>
      <InsightSection icon={BarChart2} label="Build Trends">    <BuildTrendsTab />    </InsightSection>
      <InsightSection icon={Clock}    label="PR Velocity">      <PRVelocityTab />     </InsightSection>
      <InsightSection icon={Activity} label="Failure Analysis"> <FailureAnalysisTab /></InsightSection>
    </div>
  )
}
