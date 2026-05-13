import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, GitCommit, Users, Code, GitFork,
  Star, Eye, AlertCircle, Zap, ExternalLink, Calendar,
} from 'lucide-react'
import { formatDistanceToNow, fromUnixTime, format } from 'date-fns'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts'
import {
  getInsightsPulse, getInsightsContributors, getInsightsCommitActivity,
  getInsightsCodeFrequency, getInsightsForks, getInsightsParticipation,
} from '../lib/api'
import clsx from 'clsx'

type InsightTab = 'pulse' | 'contributors' | 'commit-activity' | 'code-frequency' | 'forks'

// ── Pulse tab ─────────────────────────────────────────────────────────────────

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
            <Star size={12} className="text-accent-yellow" />
          </div>
          <p className="text-2xl font-semibold text-accent-yellow tabular-nums">
            {(data.stars ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Forks</p>
            <GitFork size={12} className="text-accent-blue" />
          </div>
          <p className="text-2xl font-semibold text-accent-blue tabular-nums">
            {(data.forks ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Watchers</p>
            <Eye size={12} className="text-accent-purple" />
          </div>
          <p className="text-2xl font-semibold text-accent-purple tabular-nums">
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
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 8 }} interval={4} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={25} />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3d', fontSize: 11 }}
                itemStyle={{ color: '#d1d5db' }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="all" name="All commits" fill="#3b82f6" opacity={0.7} />
              <Bar dataKey="owner" name="Owner" fill="#a855f7" />
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
        <span className="inline-block w-2 h-2 rounded-full bg-accent-yellow animate-pulse" />
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
            <span className="flex items-center gap-1 text-[10px] text-accent-yellow">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />
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
                    <div className="h-full bg-accent-blue rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Mini sparkline — only when weekly stats are available */}
                {hasWeekly ? (
                  <div className="w-24 h-6 flex-shrink-0">
                    <ResponsiveContainer width="100%" height={24}>
                      <BarChart data={chartData} barSize={3}>
                        <Bar dataKey="c" fill="#3b82f6" />
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
          <p className="text-2xl font-semibold text-accent-blue tabular-nums">{avgWeek}</p>
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
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 8 }} interval={7} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={30} />
            <Tooltip
              contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3d', fontSize: 11 }}
              formatter={(v: any) => [v, 'Commits']}
            />
            <Bar dataKey="total" fill="#3b82f6" radius={[2, 2, 0, 0]} />
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
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 8 }} interval={7} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={45}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip
              contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3d', fontSize: 11 }}
              formatter={(v: any, name: string) => [Math.abs(v).toLocaleString(), name === 'additions' ? 'Additions' : 'Deletions']}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="additions" name="Additions" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} strokeWidth={1.5} />
            <Area type="monotone" dataKey="deletions" name="Deletions" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} strokeWidth={1.5} />
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
                className="text-xs font-medium text-white hover:text-accent-blue transition-colors truncate block">
                {f.full_name}
              </a>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
                <span className="flex items-center gap-0.5"><Star size={8} className="text-accent-yellow" /> {f.stars}</span>
                <span className="flex items-center gap-0.5"><GitFork size={8} /> {f.forks}</span>
                {f.pushed_at && (
                  <span>pushed {formatDistanceToNow(new Date(f.pushed_at), { addSuffix: true })}</span>
                )}
              </div>
            </div>
            <a href={f.html_url} target="_blank" rel="noreferrer">
              <ExternalLink size={11} className="text-gray-600 hover:text-accent-blue flex-shrink-0" />
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

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS: { key: InsightTab; icon: any; label: string }[] = [
  { key: 'pulse', icon: Zap, label: 'Pulse' },
  { key: 'contributors', icon: Users, label: 'Contributors' },
  { key: 'commit-activity', icon: GitCommit, label: 'Commit Activity' },
  { key: 'code-frequency', icon: Code, label: 'Code Frequency' },
  { key: 'forks', icon: GitFork, label: 'Forks' },
]

export default function RepoInsights() {
  const [tab, setTab] = useState<InsightTab>('pulse')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp size={18} className="text-accent-blue" />
        <h1 className="text-lg font-semibold">Repository Insights</h1>
        <a href="https://github.com/isaac-sim/IsaacLab/graphs" target="_blank" rel="noreferrer"
          className="text-[10px] text-gray-500 hover:text-accent-blue flex items-center gap-1 ml-auto">
          View on GitHub <ExternalLink size={10} />
        </a>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border pb-3 flex-wrap">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              tab === key ? 'bg-accent-blue text-white' : 'bg-surface-2 text-gray-400 hover:bg-surface-3 hover:text-gray-200')}>
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'pulse' && <PulseTab />}
      {tab === 'contributors' && <ContributorsTab />}
      {tab === 'commit-activity' && <CommitActivityTab />}
      {tab === 'code-frequency' && <CodeFrequencyTab />}
      {tab === 'forks' && <ForksTab />}
    </div>
  )
}
