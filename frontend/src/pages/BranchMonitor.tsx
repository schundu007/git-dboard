import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  GitBranch, Shield, ChevronDown, ChevronUp, ExternalLink,
  GitPullRequest, GitCommit, CheckCircle2, XCircle, Clock,
  Activity, RefreshCw, Search, Filter,
  CircleDot, Tag, Milestone, MessageSquare, Calendar,
  AlertCircle, User,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import StatusBadge from '../components/StatusBadge'
import { getIssues, getIssueStats, getIssueLabels, getIssueMilestones, getActiveRepo } from '../lib/api'
import { EmptyState } from '../components/ui/EmptyState'

// ── Branch API ────────────────────────────────────────────────────────────────

const fetchBranches = (limit: number) =>
  fetch(`http://localhost:8000/analytics/branches?limit=${limit}`).then((r) => r.json())

const fetchCommits = (branch: string) =>
  fetch(`http://localhost:8000/analytics/branches/${encodeURIComponent(branch)}/commits?per_page=10`).then((r) =>
    r.json(),
  )

// ── Branch sub-components ─────────────────────────────────────────────────────

function CommitList({ branch }: { branch: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['branch-commits', branch],
    queryFn: () => fetchCommits(branch),
    staleTime: 120_000,
  })
  const commits: any[] = data?.commits ?? []

  if (isLoading) return <p className="text-[10px] text-gray-400 py-1">Loading commits…</p>
  if (!commits.length) return <p className="text-[10px] text-gray-400 py-1">No commits found.</p>

  return (
    <div className="space-y-1.5">
      {commits.map((c) => (
        <div key={c.sha} className="flex items-start gap-2 text-[10px]">
          {c.avatar
            ? <img src={c.avatar} className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5" alt="" />
            : <div className="w-4 h-4 rounded-full bg-surface-3 flex-shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <p className="text-gray-200 truncate leading-snug">{c.message}</p>
            <div className="flex items-center gap-1.5 text-gray-400 mt-0.5">
              <span className="font-mono text-accent-blue">{c.sha}</span>
              <span>·</span>
              <span>{c.author}</span>
              {c.date && <><span>·</span><span>{formatDistanceToNow(new Date(c.date), { addSuffix: true })}</span></>}
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={8} className="text-gray-400 hover:text-accent-blue" />
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PRMiniList({ prs, label }: { prs: any[]; label: string }) {
  if (!prs.length) return null
  return (
    <div className="space-y-1">
      <p className="text-[9px] text-gray-400 uppercase tracking-wider">{label}</p>
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

function ChangelogList({ items }: { items: any[] }) {
  if (!items.length) return <p className="text-[10px] text-gray-400">No recent merges into this branch.</p>
  return (
    <div className="space-y-1.5">
      {items.map((p) => (
        <div key={p.number} className="flex items-start gap-2 text-[10px]">
          {p.avatar
            ? <img src={p.avatar} className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5" alt="" />
            : <div className="w-4 h-4 rounded-full bg-surface-3 flex-shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <p className="text-gray-200 truncate">#{p.number} {p.title}</p>
            <div className="flex items-center gap-1.5 text-gray-400 mt-0.5">
              <span>{p.author}</span>
              {p.merged_at && <><span>·</span><span>merged {formatDistanceToNow(new Date(p.merged_at), { addSuffix: true })}</span></>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

type BranchTabKey = 'commits' | 'prs' | 'changelog'

function BranchRow({
  b,
  expanded: controlledExpanded,
  onToggle,
  className: extraClass,
}: {
  b: any
  expanded?: boolean
  onToggle?: () => void
  className?: string
}) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const expanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded
  const toggle = onToggle ?? (() => setInternalExpanded((v) => !v))
  const [tab, setTab] = useState<BranchTabKey>('commits')
  const prCount = (b.prs_from?.length ?? 0) + (b.prs_to?.length ?? 0)

  return (
    <div className={clsx('bg-surface-1 border rounded-xl overflow-hidden transition-colors flex flex-col', b.active ? 'border-border' : 'border-border/50', extraClass)}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-2 transition-colors text-left"
        onClick={toggle}
        aria-expanded={expanded}
      >
        <div className="flex-shrink-0">
          {b.ci_status ? <StatusBadge status={b.ci_status} /> : <div className="w-2 h-2 rounded-full bg-surface-3" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <GitBranch size={12} className="text-accent-blue flex-shrink-0" />
            <span className="text-sm font-mono font-medium text-white truncate">{b.branch}</span>
            {b.protected && <Shield size={10} className="text-accent-yellow flex-shrink-0" aria-label="Protected branch" />}
            {b.active && (
              <span className="text-[9px] bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25 px-1.5 py-0.5 rounded-full">active</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
            <span className="font-mono">{b.sha}</span>
            {b.ci_url && (
              <a href={b.ci_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-accent-blue">
                <ExternalLink size={9} />
              </a>
            )}
          </div>
        </div>
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
        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="flex gap-1">
            {(['commits', 'prs', 'changelog'] as BranchTabKey[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx('px-2.5 py-1 rounded text-[10px] font-medium capitalize transition-colors',
                  tab === t ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}
              >
                {t === 'prs' ? `PRs (${prCount})` : t === 'changelog' ? `Changelog (${b.changelog?.length ?? 0})` : 'Commits'}
              </button>
            ))}
          </div>
          {tab === 'commits' && <CommitList branch={b.branch} />}
          {tab === 'prs' && (
            <div className="space-y-3">
              <PRMiniList prs={b.prs_from ?? []} label="PRs from this branch" />
              <PRMiniList prs={b.prs_to ?? []} label="PRs targeting this branch" />
              {!prCount && <p className="text-[10px] text-gray-400">No open PRs for this branch.</p>}
            </div>
          )}
          {tab === 'changelog' && <ChangelogList items={b.changelog ?? []} />}
        </div>
      )}
    </div>
  )
}

// ── Issues sub-components ─────────────────────────────────────────────────────

function LabelBadge({ name, color }: { name: string; color: string }) {
  const hex = `#${color}`
  const r = parseInt(color.slice(0, 2), 16)
  const g = parseInt(color.slice(2, 4), 16)
  const b = parseInt(color.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const textColor = luminance > 0.5 ? '#000000' : '#ffffff'
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0"
      style={{ background: hex, color: textColor }}
    >
      {name}
    </span>
  )
}

function MilestoneCard({ m }: { m: any }) {
  const overdue = m.due_on && new Date(m.due_on) < new Date()
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <a href={m.html_url} target="_blank" rel="noreferrer"
          className="text-xs font-medium text-white hover:text-accent-blue transition-colors truncate">
          {m.title}
        </a>
        <span className={clsx('text-[9px] flex-shrink-0 ml-2 font-semibold',
          m.pct === 100 ? 'text-accent-green' : m.pct > 50 ? 'text-accent-blue' : 'text-gray-400')}>
          {m.pct}%
        </span>
      </div>
      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', m.pct === 100 ? 'bg-accent-green' : 'bg-accent-blue')}
          style={{ width: `${m.pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] text-gray-400">
        <span>{m.closed_issues} closed · {m.open_issues} open</span>
        {m.due_on && (
          <span className={clsx('flex items-center gap-0.5', overdue ? 'text-accent-red' : 'text-gray-400')}>
            <Clock size={8} />
            {overdue ? 'Overdue' : formatDistanceToNow(new Date(m.due_on), { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  )
}

function IssueRow({ issue, onLabelClick }: { issue: any; onLabelClick: (label: string) => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors border-b border-border last:border-0">
      <div className="flex-shrink-0 mt-0.5">
        {issue.state === 'open'
          ? <CircleDot size={14} className="text-accent-green" />
          : <XCircle size={14} className="text-accent-purple" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap mb-0.5">
          <a href={issue.html_url} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-white hover:text-accent-blue transition-colors leading-snug">
            {issue.title}
          </a>
          {issue.labels.map((l: any) => (
            <button key={l.name} onClick={() => onLabelClick(l.name)}>
              <LabelBadge name={l.name} color={l.color} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
          <span>#{issue.number}</span>
          {issue.user && (
            <span className="flex items-center gap-1">
              <img src={issue.user.avatar_url} className="w-3 h-3 rounded-full" alt="" />
              {issue.user.login}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Calendar size={9} />
            {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
          </span>
          {issue.milestone && (
            <span className="flex items-center gap-0.5 text-accent-blue">
              <Milestone size={9} />
              {issue.milestone.title}
            </span>
          )}
          {issue.state === 'closed' && issue.closed_at && (
            <span className="text-accent-purple">
              Closed {formatDistanceToNow(new Date(issue.closed_at), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {issue.assignees.length > 0 && (
          <div className="flex -space-x-1">
            {issue.assignees.slice(0, 3).map((a: any) => (
              <img key={a.login} src={a.avatar_url} className="w-4 h-4 rounded-full border border-surface-2" alt={a.login} title={a.login} />
            ))}
          </div>
        )}
        {issue.comments > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
            <MessageSquare size={9} />
            {issue.comments}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Section components ────────────────────────────────────────────────────────

export function BranchesTab() {
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [activeRowExpanded, setActiveRowExpanded] = useState(false)
  const [limit, setLimit] = useState(30)

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['branches', limit],
    queryFn: () => fetchBranches(limit),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  const activeBranches: any[] = (data?.branches ?? []).filter((b: any) => b.active)

  const branches: any[] = (data?.branches ?? []).filter((b: any) => {
    if (b.active) return false  // shown in the 3-col grid above
    if (activeOnly) return false
    if (search && !b.branch.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter branches…"
            className="bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs w-52 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-400">✕</button>
          )}
        </div>
        <button
          onClick={() => setActiveOnly((v) => !v)}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            activeOnly
              ? 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25 border-green-900'
              : 'bg-surface-1 text-gray-400 border-border hover:bg-surface-2')}
        >
          <Activity size={11} />
          Active only
        </button>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors ml-auto"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
        <span className="text-xs text-gray-400">{activeBranches.length + branches.length} branch{activeBranches.length + branches.length !== 1 ? 'es' : ''}</span>
      </div>

      {/* Summary stats */}
      {data && !isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total branches',     value: data.total,                                                                           color: 'text-white',        icon: GitBranch    },
            { label: 'Active (with PRs/CI)',value: (data.branches ?? []).filter((b: any) => b.active).length,                           color: 'text-accent-green', icon: Activity     },
            { label: 'Protected',           value: (data.branches ?? []).filter((b: any) => b.protected).length,                        color: 'text-accent-yellow',icon: Shield       },
            { label: 'With open PRs',       value: (data.branches ?? []).filter((b: any) => b.prs_from?.length > 0).length,             color: 'text-accent-blue',  icon: GitPullRequest},
          ].map((card) => (
            <div key={card.label} className="bg-surface-1 border border-border rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{card.label}</p>
                <card.icon size={12} className="text-gray-400" />
              </div>
              <p className={clsx('text-2xl font-semibold tabular-nums', card.color)}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading && <div className="text-center py-16 text-gray-500 text-sm">Loading branches…</div>}
      {isError && <div className="text-center py-16 text-accent-red text-sm">Failed to load branches.</div>}
      {!isLoading && activeBranches.length === 0 && branches.length === 0 && (
        <div className="text-center py-16 text-gray-500 text-sm">
          No branches found{search ? ` matching "${search}"` : ''}.
        </div>
      )}

      {/* Active branches — 3-column grid, synchronized expand */}
      {!isLoading && activeBranches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-stretch">
          {activeBranches
            .filter((b: any) => !search || b.branch.toLowerCase().includes(search.toLowerCase()))
            .map((b: any) => (
              <BranchRow
                key={b.branch}
                b={b}
                expanded={activeRowExpanded}
                onToggle={() => setActiveRowExpanded((v) => !v)}
                className="h-full"
              />
            ))}
        </div>
      )}

      <div className="space-y-2">
        {branches.map((b: any) => <BranchRow key={b.branch} b={b} />)}
      </div>

      {/* Load more */}
      {!isLoading && (data?.total ?? 0) > limit && (
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setLimit((l) => l + 30)}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs bg-surface-2 border border-border text-gray-400 hover:text-white hover:bg-surface-3 disabled:opacity-50 transition-colors"
          >
            {isFetching
              ? <><span className="w-3 h-3 rounded-full border border-border border-t-accent-blue animate-spin" /> Loading…</>
              : <>Load more branches ({(data?.total ?? 0) - limit} remaining)</>}
          </button>
        </div>
      )}
    </div>
  )
}

export function IssuesTab() {
  const [state, setState] = useState<'open' | 'closed'>('open')
  const [labelFilter, setLabelFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showMilestones, setShowMilestones] = useState(false)
  const [showLabels, setShowLabels] = useState(false)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['issue-stats'],
    queryFn: getIssueStats,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const { data: arData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = arData?.active?.slug ?? ''

  const { data: issues = [], isLoading, isError } = useQuery({
    queryKey: ['issues', state, labelFilter, assigneeFilter, page],
    queryFn: () => getIssues({ state, labels: labelFilter || undefined, assignee: assigneeFilter || undefined, per_page: 30, page }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: milestones = [] } = useQuery({
    queryKey: ['issue-milestones'],
    queryFn: () => getIssueMilestones('open'),
    staleTime: 120_000,
  })

  const filtered = search
    ? issues.filter((i: any) => i.title.toLowerCase().includes(search.toLowerCase()) || String(i.number).includes(search))
    : issues

  const hasFilters = labelFilter || assigneeFilter || search

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!statsLoading && stats && (
            <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
              {stats.open_count} open · {stats.closed_count} closed
            </span>
          )}
        </div>
        <a href={`https://github.com/${repoSlug}/issues/new/choose`}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-accent-green text-black font-medium hover:bg-green-400 transition-colors">
          <AlertCircle size={11} /> New Issue ↗
        </a>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Open Issues</p>
            <p className="text-2xl font-semibold text-accent-green tabular-nums">{stats.open_count}</p>
            <p className="text-[10px] text-gray-400">currently open</p>
          </div>
          <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Closed Issues</p>
            <p className="text-2xl font-semibold text-accent-purple tabular-nums">{stats.closed_count}</p>
            <p className="text-[10px] text-gray-400">resolved</p>
          </div>
          <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Labels</p>
            <p className="text-2xl font-semibold text-white tabular-nums">{stats.label_count}</p>
            <p className="text-[10px] text-gray-400">defined</p>
          </div>
          <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Resolution Rate</p>
            {stats.open_count + stats.closed_count > 0
              ? <p className="text-2xl font-semibold text-accent-blue tabular-nums">{Math.round(stats.closed_count / (stats.open_count + stats.closed_count) * 100)}%</p>
              : <p className="text-2xl font-semibold text-gray-400">—</p>}
            <p className="text-[10px] text-gray-400">of tracked issues</p>
          </div>
        </div>
      )}

      {/* Milestones collapsible */}
      {(milestones as any[]).length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowMilestones((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Milestone size={13} className="text-accent-blue" />
              <span className="text-sm font-medium">Milestones</span>
              <span className="text-[10px] text-gray-500 bg-surface-2 px-1.5 py-0.5 rounded-full">{(milestones as any[]).length}</span>
            </div>
            {showMilestones ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
          </button>
          {showMilestones && (
            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(milestones as any[]).map((m: any) => <MilestoneCard key={m.number} m={m} />)}
            </div>
          )}
        </div>
      )}

      {/* Label cloud collapsible */}
      {stats?.top_labels?.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowLabels((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Tag size={13} className="text-accent-yellow" />
              <span className="text-sm font-medium">Label Activity</span>
              <span className="text-[10px] text-gray-500 bg-surface-2 px-1.5 py-0.5 rounded-full">all {stats?.label_count ?? stats?.top_labels?.length ?? 0}</span>
            </div>
            {showLabels ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
          </button>
          {showLabels && (
            <div className="px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {stats.top_labels.map((l: any) => (
                  <button
                    key={l.name}
                    onClick={() => setLabelFilter(labelFilter === l.name ? '' : l.name)}
                    className={clsx('flex items-center gap-1.5 rounded-full text-[10px] px-2.5 py-1 transition-all',
                      labelFilter === l.name ? 'ring-2 ring-white/30' : 'opacity-80 hover:opacity-100')}
                  >
                    <LabelBadge name={l.name} color={l.color} />
                    <span className="text-gray-500">{l.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter bar + issue list */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border card-head flex-wrap">
          <div className="flex items-center bg-surface-2 border border-border rounded-lg p-0.5">
            <button onClick={() => { setState('open'); setPage(1) }}
              className={clsx('flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors',
                state === 'open' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              <CircleDot size={10} className="text-accent-green" />
              Open {stats ? `(${stats.open_count})` : ''}
            </button>
            <button onClick={() => { setState('closed'); setPage(1) }}
              className={clsx('flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors',
                state === 'closed' ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              <XCircle size={10} className="text-accent-purple" />
              Closed {stats ? `(${stats.closed_count})` : ''}
            </button>
          </div>
          <div className="relative">
            <Tag size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={labelFilter} onChange={(e) => { setLabelFilter(e.target.value); setPage(1) }}
              placeholder="Label filter"
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-32 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue" />
          </div>
          <div className="relative">
            <User size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={assigneeFilter} onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1) }}
              placeholder="Assignee"
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-28 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue" />
          </div>
          <div className="relative flex-1 min-w-32 max-w-xs">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues…"
              className="w-full bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue" />
          </div>
          {hasFilters && (
            <button onClick={() => { setLabelFilter(''); setAssigneeFilter(''); setSearch(''); setPage(1) }}
              className="text-[10px] text-gray-400 hover:text-gray-400 px-1.5">
              ✕ Clear
            </button>
          )}
          <span className="text-[10px] text-gray-400 ml-auto">{filtered.length} issues</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2 text-[12px] text-gray-500">
            <span className="w-3.5 h-3.5 rounded-full border border-border border-t-accent-blue animate-spin" />
            Loading issues…
          </div>
        )}
        {isError && <EmptyState icon={<AlertCircle size={16} />} title="Failed to load issues" size="sm" className="py-12" />}
        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState icon={<CircleDot size={16} />} title="No issues found" description="Try adjusting the filters" size="sm" className="py-12" />
        )}

        <div>
          {filtered.map((issue: any) => (
            <IssueRow key={issue.number} issue={issue} onLabelClick={(l) => setLabelFilter(l)} />
          ))}
        </div>

        {(issues.length === 30 || page > 1) && (
          <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-border">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 rounded text-xs bg-surface-2 text-gray-300 hover:bg-surface-3 disabled:opacity-40">
              ← Prev
            </button>
            <span className="text-xs text-gray-500">Page {page}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={issues.length < 30}
              className="px-3 py-1.5 rounded text-xs bg-surface-2 text-gray-300 hover:bg-surface-3 disabled:opacity-40">
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BranchMonitor() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <GitBranch size={15} className="text-accent-blue" />
          <h2 className="text-sm font-semibold text-white">Branches</h2>
        </div>
        <BranchesTab />
      </div>

      <div className="border-t border-border" />

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CircleDot size={15} className="text-accent-green" />
          <h2 className="text-sm font-semibold text-white">Issues</h2>
        </div>
        <IssuesTab />
      </div>
    </div>
  )
}
