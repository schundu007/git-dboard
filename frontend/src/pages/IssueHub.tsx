import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CircleDot, XCircle, Tag, Milestone, Search, Filter,
  MessageSquare, Calendar, ExternalLink, ChevronDown, ChevronUp,
  AlertCircle, Clock, User,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getIssues, getIssueStats, getIssueLabels, getIssueMilestones } from '../lib/api'
import clsx from 'clsx'

// ── Label badge ───────────────────────────────────────────────────────────────

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

// ── Milestone progress bar ────────────────────────────────────────────────────

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
      <div className="flex items-center justify-between text-[9px] text-gray-600">
        <span>{m.closed_issues} closed · {m.open_issues} open</span>
        {m.due_on && (
          <span className={clsx('flex items-center gap-0.5', overdue ? 'text-accent-red' : 'text-gray-600')}>
            <Clock size={8} />
            {overdue ? 'Overdue' : formatDistanceToNow(new Date(m.due_on), { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Issue row ─────────────────────────────────────────────────────────────────

function IssueRow({ issue, onLabelClick }: { issue: any; onLabelClick: (label: string) => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2/30 transition-colors border-b border-border last:border-0">
      {/* State icon */}
      <div className="flex-shrink-0 mt-0.5">
        {issue.state === 'open'
          ? <CircleDot size={14} className="text-accent-green" />
          : <XCircle size={14} className="text-accent-purple" />
        }
      </div>

      {/* Main content */}
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

      {/* Right side */}
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

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: any }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Open Issues</p>
        <p className="text-2xl font-semibold text-accent-green tabular-nums">{stats.open_count}</p>
        <p className="text-[10px] text-gray-600">currently open</p>
      </div>
      <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Closed Issues</p>
        <p className="text-2xl font-semibold text-accent-purple tabular-nums">{stats.closed_count}</p>
        <p className="text-[10px] text-gray-600">resolved</p>
      </div>
      <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Labels</p>
        <p className="text-2xl font-semibold text-white tabular-nums">{stats.label_count}</p>
        <p className="text-[10px] text-gray-600">defined</p>
      </div>
      <div className="bg-surface-1 border border-border rounded-lg p-3 space-y-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Resolution Rate</p>
        {stats.open_count + stats.closed_count > 0 ? (
          <p className="text-2xl font-semibold text-accent-blue tabular-nums">
            {Math.round(stats.closed_count / (stats.open_count + stats.closed_count) * 100)}%
          </p>
        ) : <p className="text-2xl font-semibold text-gray-600">—</p>}
        <p className="text-[10px] text-gray-600">of tracked issues</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IssueHub() {
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

  const { data: labels = [] } = useQuery({
    queryKey: ['issue-labels'],
    queryFn: getIssueLabels,
    staleTime: 300_000,
  })

  const { data: issues = [], isLoading, isError } = useQuery({
    queryKey: ['issues', state, labelFilter, assigneeFilter, page],
    queryFn: () => getIssues({
      state,
      labels: labelFilter || undefined,
      assignee: assigneeFilter || undefined,
      per_page: 30,
      page,
    }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: milestones = [] } = useQuery({
    queryKey: ['issue-milestones'],
    queryFn: () => getIssueMilestones('open'),
    staleTime: 120_000,
  })

  const filtered = search
    ? issues.filter((i: any) =>
        i.title.toLowerCase().includes(search.toLowerCase()) ||
        String(i.number).includes(search))
    : issues

  const hasFilters = labelFilter || assigneeFilter || search

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CircleDot size={18} className="text-accent-green" />
          <h1 className="text-lg font-semibold">Issues</h1>
          {!statsLoading && stats && (
            <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
              {stats.open_count} open · {stats.closed_count} closed
            </span>
          )}
        </div>
        <a href="https://github.com/isaac-sim/IsaacLab/issues/new/choose"
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-accent-green text-black font-medium hover:bg-green-400 transition-colors">
          <AlertCircle size={11} /> New Issue ↗
        </a>
      </div>

      {/* Stats */}
      {stats && <StatsBar stats={stats} />}

      {/* Milestones collapsible */}
      {milestones.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowMilestones((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Milestone size={13} className="text-accent-blue" />
              <span className="text-sm font-medium">Milestones</span>
              <span className="text-[10px] text-gray-500 bg-surface-2 px-1.5 py-0.5 rounded-full">{milestones.length}</span>
            </div>
            {showMilestones ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
          </button>
          {showMilestones && (
            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(milestones as any[]).map((m: any) => (
                <MilestoneCard key={m.number} m={m} />
              ))}
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
        {/* Controls */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-wrap">
          {/* State toggle */}
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

          {/* Label filter */}
          <div className="relative">
            <Tag size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={labelFilter} onChange={(e) => { setLabelFilter(e.target.value); setPage(1) }}
              placeholder="Label filter"
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-32 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
          </div>

          {/* Assignee filter */}
          <div className="relative">
            <User size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={assigneeFilter} onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1) }}
              placeholder="Assignee"
              className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-28 text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-32 max-w-xs">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues…"
              className="w-full bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue" />
          </div>

          {hasFilters && (
            <button onClick={() => { setLabelFilter(''); setAssigneeFilter(''); setSearch(''); setPage(1) }}
              className="text-[10px] text-gray-600 hover:text-gray-400 px-1.5">
              ✕ Clear
            </button>
          )}

          <span className="text-[10px] text-gray-600 ml-auto">{filtered.length} issues</span>
        </div>

        {/* Issue list */}
        {isLoading && (
          <div className="text-center py-12 text-gray-500 text-sm">Loading issues…</div>
        )}
        {isError && (
          <div className="text-center py-12 text-accent-red text-sm">Failed to load issues.</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">No issues found.</div>
        )}

        <div>
          {filtered.map((issue: any) => (
            <IssueRow key={issue.number} issue={issue} onLabelClick={(l) => setLabelFilter(l)} />
          ))}
        </div>

        {/* Pagination */}
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
