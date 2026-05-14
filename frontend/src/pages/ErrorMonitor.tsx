import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  XCircle, Bug, RefreshCw, ExternalLink,
  Clock, Activity, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getAllRuns, getIssues, getIssueStats } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import clsx from 'clsx'

const BASE = 'http://localhost:8000'
const req = (path: string) => fetch(`${BASE}${path}`).then(r => r.json())

// ── CI Failures ───────────────────────────────────────────────────────────────

function CIFailuresPanel() {
  const [expanded, setExpanded] = useState<number | null>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['monitor-ci-failures'],
    queryFn: () => getAllRuns({ per_page: 30, page: 1 }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const failures = (data?.workflow_runs ?? []).filter(
    (r: any) => r.conclusion === 'failure' || r.conclusion === 'timed_out',
  ).slice(0, 15)

  if (isLoading) return <p className="text-[11px] text-gray-500 py-4 text-center">Loading…</p>
  if (isError)   return <p className="text-[11px] text-accent-red py-4 text-center">Failed to load CI failures</p>
  if (!failures.length) return <p className="text-[11px] text-gray-500 py-4 text-center">No recent CI failures</p>

  return (
    <div className="space-y-1.5">
      {failures.map((r: any) => {
        const isOpen = expanded === r.id
        return (
          <div key={r.id} className="bg-surface-2 border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-3 transition-colors"
              onClick={() => setExpanded(isOpen ? null : r.id)}
            >
              <XCircle size={12} className="text-accent-red flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white truncate font-medium">{r.display_title || r.head_branch}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                  <span className="font-mono">{r.head_branch}</span>
                  <span>·</span>
                  <span>{r.name}</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Clock size={8} />
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={r.conclusion} size="sm" />
                <a href={r.html_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                  <ExternalLink size={11} className="text-gray-600 hover:text-neutral-300" />
                </a>
                {isOpen ? <ChevronUp size={11} className="text-gray-500" /> : <ChevronDown size={11} className="text-gray-500" />}
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border px-3 py-2 text-[10px] text-gray-500">
                <span className="font-mono">#{r.run_number}</span>
                <span className="mx-2">·</span>
                <span>sha: {r.head_sha?.slice(0, 7)}</span>
                {r.duration_label && r.duration_label !== '—' && (
                  <span className="ml-2">· {r.duration_label}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Nightly Job Failures ──────────────────────────────────────────────────────

function NightlyFailuresPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['failure-analysis-monitor'],
    queryFn: () => req('/analytics/failure-analysis?runs=20'),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })
  const jobs: any[] = (data?.ranked ?? []).filter((j: any) => j.failure_rate > 0).slice(0, 12)

  if (isLoading) return <p className="text-[11px] text-gray-500 py-4 text-center">Loading…</p>
  if (!jobs.length) return <p className="text-[11px] text-gray-500 py-4 text-center">No nightly job failures</p>

  return (
    <div className="space-y-1.5">
      {jobs.map((j) => (
        <div key={j.name} className="bg-surface-2 border border-border rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-white truncate font-medium flex-1">{j.name}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {j.consecutive_failures > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25">
                  {j.consecutive_failures} streak
                </span>
              )}
              <span className={clsx(
                'text-[11px] font-semibold tabular-nums',
                j.failure_rate >= 50 ? 'text-accent-red' : j.failure_rate >= 20 ? 'text-neutral-300' : 'text-neutral-400',
              )}>
                {j.failure_rate}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[9px] text-gray-600">
            <span>{j.failed} / {j.total} failed</span>
            {j.trend === 'worsening' && <span className="text-accent-red">↑ worsening</span>}
            {j.trend === 'improving' && <span className="text-nvidia">↓ improving</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Error Patterns ────────────────────────────────────────────────────────────

function ErrorPatternsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['error-patterns'],
    queryFn: () => req('/analytics/error-patterns'),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })
  const patterns: any[] = data?.patterns ?? []

  if (isLoading) return <p className="text-[11px] text-gray-500 py-4 text-center">Loading…</p>
  if (!patterns.length) return <p className="text-[11px] text-gray-500 py-4 text-center">No error patterns recorded</p>

  return (
    <div className="space-y-1.5">
      {patterns.slice(0, 12).map((p, i) => (
        <div key={i} className="bg-surface-2 border border-border rounded-lg px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-mono text-red-400 break-all leading-4 flex-1">{p.pattern}</p>
            <span className="text-[11px] font-semibold tabular-nums text-neutral-300 flex-shrink-0">×{p.count}</span>
          </div>
          {p.sources?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {p.sources.slice(0, 3).map((s: string) => (
                <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-gray-500 font-mono">{s}</span>
              ))}
            </div>
          )}
          {p.last_seen && (
            <p className="text-[9px] text-gray-600 mt-1">
              Last seen {formatDistanceToNow(new Date(p.last_seen), { addSuffix: true })}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Bug Issues ────────────────────────────────────────────────────────────────

function BugIssuesPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['monitor-bugs'],
    queryFn: () => getIssues({ state: 'open', labels: 'bug', per_page: 20 }),
    staleTime: 120_000,
    refetchInterval: 300_000,
  })
  const issues: any[] = Array.isArray(data) ? data : ((data as any)?.issues ?? [])

  if (isLoading) return <p className="text-[11px] text-gray-500 py-4 text-center">Loading…</p>
  if (!issues.length) return <p className="text-[11px] text-gray-500 py-4 text-center">No open bug issues</p>

  return (
    <div className="space-y-1.5">
      {issues.slice(0, 15).map((issue: any) => (
        <div key={issue.number} className="bg-surface-2 border border-border rounded-lg px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white font-medium truncate">{issue.title}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                <span className="font-mono">#{issue.number}</span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <img src={issue.user?.avatar_url} className="w-3 h-3 rounded-full" alt="" />
                  {issue.user?.login}
                </span>
                <span>·</span>
                <span>{formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}</span>
              </div>
            </div>
            <a href={issue.html_url} target="_blank" rel="noreferrer">
              <ExternalLink size={11} className="text-gray-600 hover:text-neutral-300 flex-shrink-0" />
            </a>
          </div>
          {issue.labels?.filter((l: any) => l.name !== 'bug').slice(0, 3).map((l: any) => (
            <span
              key={l.name}
              className="inline-block mr-1 mt-1 text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: `#${l.color}22`, color: `#${l.color}` }}
            >
              {l.name}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ErrorMonitor() {
  const qc = useQueryClient()

  const { data: issueStats } = useQuery({
    queryKey: ['issue-stats-monitor'],
    queryFn: getIssueStats,
    staleTime: 300_000,
  })
  const { data: ciData } = useQuery({
    queryKey: ['monitor-ci-failures'],
    queryFn: () => getAllRuns({ per_page: 30, page: 1 }),
    staleTime: 30_000,
  })
  const { data: epData } = useQuery({
    queryKey: ['error-patterns'],
    queryFn: () => req('/analytics/error-patterns'),
    staleTime: 120_000,
  })

  const failureCount = (ciData?.workflow_runs ?? []).filter(
    (r: any) => r.conclusion === 'failure' || r.conclusion === 'timed_out',
  ).length
  const bugCount = issueStats?.by_label?.bug
  const errorCount = epData?.total_errors ?? 0

  function refresh() {
    qc.invalidateQueries({ queryKey: ['monitor-ci-failures'] })
    qc.invalidateQueries({ queryKey: ['monitor-bugs'] })
    qc.invalidateQueries({ queryKey: ['error-patterns'] })
    qc.invalidateQueries({ queryKey: ['failure-analysis-monitor'] })
    qc.invalidateQueries({ queryKey: ['issue-stats-monitor'] })
  }

  return (
    <div className="space-y-4">
      {/* Refresh */}
      <div className="flex justify-end">
        <button onClick={refresh} className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* All 4 panels in a 2×2 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CI Failures */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={13} className="text-accent-red" />
            <h2 className="text-xs font-semibold text-white">CI Failures</h2>
            {failureCount > 0 && (
              <span className="ml-auto text-[10px] font-semibold tabular-nums text-accent-red bg-red-500/10 px-1.5 py-0.5 rounded ring-1 ring-red-500/20">
                {failureCount}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5 pr-0.5">
            <CIFailuresPanel />
          </div>
        </div>

        {/* Bug Issues */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Bug size={13} className="text-accent-red" />
            <h2 className="text-xs font-semibold text-white">Bug Issues</h2>
            {bugCount !== '—' && bugCount > 0 && (
              <span className="ml-auto text-[10px] font-semibold tabular-nums text-accent-red bg-red-500/10 px-1.5 py-0.5 rounded ring-1 ring-red-500/20">
                {bugCount}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5 pr-0.5">
            <BugIssuesPanel />
          </div>
        </div>

        {/* Nightly Job Failures */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={13} className="text-neutral-400" />
            <h2 className="text-xs font-semibold text-white">Nightly Job Failures</h2>
          </div>
          <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5 pr-0.5">
            <NightlyFailuresPanel />
          </div>
        </div>

        {/* Error Patterns */}
        <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={13} className="text-neutral-400" />
            <h2 className="text-xs font-semibold text-white">Error Patterns</h2>
            {errorCount > 0 && (
              <span className="ml-auto text-[10px] font-semibold tabular-nums text-neutral-400 bg-surface-3 px-1.5 py-0.5 rounded">
                {errorCount} total
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto max-h-80 space-y-1.5 pr-0.5">
            <ErrorPatternsPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
