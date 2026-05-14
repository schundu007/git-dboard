import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  GitBranch, Shield, ChevronDown, ChevronUp, ExternalLink,
  GitPullRequest, GitCommit, CheckCircle2, XCircle, Clock,
  Activity, RefreshCw, Search, Filter,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import StatusBadge from '../components/StatusBadge'

// Lazy-loaded from api (avoid circular dep chain)
const fetchBranches = () =>
  fetch('http://localhost:8000/analytics/branches?limit=30').then((r) => r.json())

const fetchCommits = (branch: string) =>
  fetch(`http://localhost:8000/analytics/branches/${encodeURIComponent(branch)}/commits?per_page=10`).then((r) =>
    r.json(),
  )

// ── Commit mini list ──────────────────────────────────────────────────────────

function CommitList({ branch }: { branch: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['branch-commits', branch],
    queryFn: () => fetchCommits(branch),
    staleTime: 120_000,
  })
  const commits: any[] = data?.commits ?? []

  if (isLoading)
    return <p className="text-[10px] text-gray-600 py-1">Loading commits…</p>
  if (!commits.length)
    return <p className="text-[10px] text-gray-600 py-1">No commits found.</p>

  return (
    <div className="space-y-1.5">
      {commits.map((c) => (
        <div key={c.sha} className="flex items-start gap-2 text-[10px]">
          {c.avatar ? (
            <img src={c.avatar} className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5" alt="" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-surface-3 flex-shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-gray-200 truncate leading-snug">{c.message}</p>
            <div className="flex items-center gap-1.5 text-gray-600 mt-0.5">
              <span className="font-mono text-accent-blue">{c.sha}</span>
              <span>·</span>
              <span>{c.author}</span>
              {c.date && (
                <>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(c.date), { addSuffix: true })}</span>
                </>
              )}
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={8} className="text-gray-600 hover:text-accent-blue" />
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── PR mini list ──────────────────────────────────────────────────────────────

function PRMiniList({ prs, label }: { prs: any[]; label: string }) {
  if (!prs.length) return null
  return (
    <div className="space-y-1">
      <p className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</p>
      {prs.map((pr) => (
        <div key={pr.number} className="flex items-center gap-1.5 text-[10px] text-gray-300">
          <GitPullRequest size={9} className="text-accent-blue flex-shrink-0" />
          <span className="text-gray-500">#{pr.number}</span>
          <span className="truncate">{pr.title}</span>
        </div>
      ))}
    </div>
  )
}

// ── Changelog list ────────────────────────────────────────────────────────────

function ChangelogList({ items }: { items: any[] }) {
  if (!items.length)
    return <p className="text-[10px] text-gray-600">No recent merges into this branch.</p>
  return (
    <div className="space-y-1.5">
      {items.map((p) => (
        <div key={p.number} className="flex items-start gap-2 text-[10px]">
          {p.avatar ? (
            <img src={p.avatar} className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5" alt="" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-surface-3 flex-shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-gray-200 truncate">#{p.number} {p.title}</p>
            <div className="flex items-center gap-1.5 text-gray-600 mt-0.5">
              <span>{p.author}</span>
              {p.merged_at && (
                <>
                  <span>·</span>
                  <span>merged {formatDistanceToNow(new Date(p.merged_at), { addSuffix: true })}</span>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Branch row ────────────────────────────────────────────────────────────────

type TabKey = 'commits' | 'prs' | 'changelog'

function BranchRow({ b }: { b: any }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<TabKey>('commits')

  const prCount = (b.prs_from?.length ?? 0) + (b.prs_to?.length ?? 0)

  return (
    <div className={clsx(
      'bg-surface-1 border rounded-xl overflow-hidden transition-colors',
      b.active ? 'border-border' : 'border-border/50',
    )}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-2 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* CI status dot */}
        <div className="flex-shrink-0">
          {b.ci_status ? (
            <StatusBadge status={b.ci_status} />
          ) : (
            <div className="w-2 h-2 rounded-full bg-surface-3" />
          )}
        </div>

        {/* Branch name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <GitBranch size={12} className="text-accent-blue flex-shrink-0" />
            <span className="text-sm font-mono font-medium text-white truncate">{b.branch}</span>
            {b.protected && (
              <Shield size={10} className="text-accent-yellow flex-shrink-0" aria-label="Protected branch" />
            )}
            {b.active && (
              <span className="text-[9px] bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25 px-1.5 py-0.5 rounded-full">
                active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-600">
            <span className="font-mono">{b.sha}</span>
            {b.ci_url && (
              <a
                href={b.ci_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hover:text-accent-blue"
              >
                <ExternalLink size={9} />
              </a>
            )}
          </div>
        </div>

        {/* Counters */}
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-shrink-0">
          {prCount > 0 && (
            <span className="flex items-center gap-0.5 text-accent-blue">
              <GitPullRequest size={9} /> {prCount} PR{prCount !== 1 ? 's' : ''}
            </span>
          )}
          {b.changelog?.length > 0 && (
            <span className="flex items-center gap-0.5 text-accent-green">
              <GitCommit size={9} /> {b.changelog.length} merged
            </span>
          )}
        </div>

        {/* Chevron */}
        <div className="flex-shrink-0 text-gray-600">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Tabs */}
          <div className="flex gap-1">
            {(['commits', 'prs', 'changelog'] as TabKey[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-2.5 py-1 rounded text-[10px] font-medium capitalize transition-colors',
                  tab === t ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2',
                )}
              >
                {t === 'prs' ? `PRs (${prCount})` : t === 'changelog' ? `Changelog (${b.changelog?.length ?? 0})` : 'Commits'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'commits' && <CommitList branch={b.branch} />}
          {tab === 'prs' && (
            <div className="space-y-3">
              <PRMiniList prs={b.prs_from ?? []} label="PRs from this branch" />
              <PRMiniList prs={b.prs_to ?? []} label="PRs targeting this branch" />
              {!prCount && (
                <p className="text-[10px] text-gray-600">No open PRs for this branch.</p>
              )}
            </div>
          )}
          {tab === 'changelog' && <ChangelogList items={b.changelog ?? []} />}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BranchMonitor() {
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const qc_invalidate = () => refetch()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  const branches: any[] = (data?.branches ?? []).filter((b: any) => {
    if (activeOnly && !b.active) return false
    if (search && !b.branch.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
              {data.total} branches
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter branches…"
            className="bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs w-52 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={() => setActiveOnly((v) => !v)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            activeOnly
              ? 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25 border-green-900'
              : 'bg-surface-1 text-gray-400 border-border hover:bg-surface-2',
          )}
        >
          <Activity size={11} />
          Active only
        </button>

        <span className="text-xs text-gray-600 ml-auto">
          {branches.length} branch{branches.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Summary stats */}
      {data && !isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Total branches',
              value: data.total,
              color: 'text-white',
              icon: GitBranch,
            },
            {
              label: 'Active (with PRs/CI)',
              value: (data.branches ?? []).filter((b: any) => b.active).length,
              color: 'text-accent-green',
              icon: Activity,
            },
            {
              label: 'Protected',
              value: (data.branches ?? []).filter((b: any) => b.protected).length,
              color: 'text-accent-yellow',
              icon: Shield,
            },
            {
              label: 'With open PRs',
              value: (data.branches ?? []).filter((b: any) => b.prs_from?.length > 0).length,
              color: 'text-accent-blue',
              icon: GitPullRequest,
            },
          ].map((card) => (
            <div key={card.label} className="bg-surface-1 border border-border rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{card.label}</p>
                <card.icon size={12} className="text-gray-600" />
              </div>
              <p className={clsx('text-2xl font-semibold tabular-nums', card.color)}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Branch list */}
      {isLoading && (
        <div className="text-center py-16 text-gray-500 text-sm">Loading branches…</div>
      )}
      {isError && (
        <div className="text-center py-16 text-accent-red text-sm">Failed to load branches.</div>
      )}
      {!isLoading && branches.length === 0 && (
        <div className="text-center py-16 text-gray-500 text-sm">
          No branches found{search ? ` matching "${search}"` : ''}.
        </div>
      )}

      <div className="space-y-2">
        {branches.map((b: any) => (
          <BranchRow key={b.branch} b={b} />
        ))}
      </div>
    </div>
  )
}
