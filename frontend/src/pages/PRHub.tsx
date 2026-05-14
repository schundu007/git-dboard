import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitPullRequest, ExternalLink, RefreshCw, ChevronDown, ChevronUp,
  Play, Lock, CheckCircle2, XCircle, Clock, AlertTriangle, Search,
  MessageSquare, FileText, AlertCircle, Users, Calendar, ShieldCheck,
  Zap, Cpu, ToggleLeft, ToggleRight, Server,
} from 'lucide-react'
import { formatDistanceToNow, differenceInDays } from 'date-fns'
import {
  getPRs, getPRSummary, getPRReviews, getPRFiles,
  getRepoPermissions, getPRStats, triggerPRCI,
  getPRGate, getPRGateOverview,
  getAutomationStatus, triggerAutomationRun, updateAutomationConfig,
  getRunnerRecommendations, getActiveRepo,
} from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import type { PR } from '../lib/types'
import clsx from 'clsx'

// ── Classification chip ───────────────────────────────────────────────────────

const CLASS_STYLE: Record<string, string> = {
  docs:   'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
  tests:  'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
  source: 'bg-[#76b900]/[.07] text-nvidia ring-1 ring-[#76b900]/25',
  ci:     'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
  mixed:  'bg-surface-3 text-gray-400',
}

function ClassChip({ cls }: { cls: string }) {
  return (
    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-semibold', CLASS_STYLE[cls] ?? CLASS_STYLE.mixed)}>
      {cls}
    </span>
  )
}

// ── Gate verdict chip ─────────────────────────────────────────────────────────

function GateChip({ verdict }: { verdict: string }) {
  if (verdict === 'success')
    return <span className="flex items-center gap-1 text-[10px] text-accent-green font-semibold"><CheckCircle2 size={10} />Gate pass</span>
  if (verdict === 'failure')
    return <span className="flex items-center gap-1 text-[10px] text-accent-red font-semibold"><XCircle size={10} />Gate fail</span>
  if (verdict === 'skipped')
    return <span className="flex items-center gap-1 text-[10px] text-gray-500 font-semibold"><ShieldCheck size={10} />Skipped</span>
  return <span className="flex items-center gap-1 text-[10px] text-gray-500 font-semibold"><Clock size={10} />Gate pending</span>
}

// ── Gate overview bar ─────────────────────────────────────────────────────────

function GateOverviewBar({ days }: { days?: number }) {
  const { data } = useQuery({
    queryKey: ['pr-gate-overview', days ?? null],
    queryFn: () => getPRGateOverview(days),
    staleTime: 60_000,
    refetchInterval: 90_000,
  })
  if (!data?.summary) return null
  const { success, failure, pending, skipped } = data.summary
  const total = (success ?? 0) + (failure ?? 0) + (pending ?? 0) + (skipped ?? 0)
  if (total === 0) return null
  return (
    <div className="flex items-center gap-3 bg-surface-1 border border-border rounded-lg px-4 py-2.5 text-[11px]">
      <ShieldCheck size={12} className="text-gray-500 flex-shrink-0" />
      <span className="text-gray-500">Gate overview</span>
      <div className="flex items-center gap-3 ml-1">
        {success > 0 && <span className="flex items-center gap-1 text-nvidia"><CheckCircle2 size={9} />{success} passing</span>}
        {failure > 0 && <span className="flex items-center gap-1 text-accent-red"><XCircle size={9} />{failure} failing</span>}
        {pending > 0 && <span className="flex items-center gap-1 text-neutral-400"><Clock size={9} />{pending} pending</span>}
        {skipped > 0 && <span className="flex items-center gap-1 text-gray-400">{skipped} skipped</span>}
      </div>
      <span className="ml-auto text-gray-600">{total} PRs evaluated</span>
    </div>
  )
}

// ── Gate analysis panel (inside expanded view) ────────────────────────────────

const CAT_ICON: Record<string, string> = { success: '✓', failure: '✗', pending: '●', missing: '○' }
const CAT_COLOR: Record<string, string> = {
  success: 'text-accent-green', failure: 'text-accent-red',
  pending: 'text-neutral-400', missing: 'text-gray-600',
}

function GatePanel({ prNumber }: { prNumber: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pr-gate', prNumber],
    queryFn: () => getPRGate(prNumber),
    staleTime: 45_000,
  })

  if (isLoading) return <p className="text-[10px] text-gray-600">Evaluating gate…</p>
  if (!data) return null

  const { classification, gate, file_count, check_count, head_sha } = data
  const { verdict, required_categories, category_results, matched_checks, reason, auto_merge, skip_tests } = gate

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={11} className="text-gray-400" />
        <p className="text-xs font-semibold text-gray-500">Gate Analysis</p>
        <ClassChip cls={classification} />
        <GateChip verdict={verdict} />
        {auto_merge && <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25 font-semibold">AUTO-MERGE</span>}
        {skip_tests && <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-gray-400">skip-tests</span>}
      </div>

      {reason && <p className="text-[10px] text-gray-500 mb-2 italic">{reason}</p>}

      {required_categories?.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {required_categories.map((cat: string) => {
            const result = category_results?.[cat] ?? 'missing'
            const hits: string[] = matched_checks?.[cat] ?? []
            return (
              <div key={cat} className="flex items-start gap-1.5 bg-surface-2 rounded px-2 py-1.5">
                <span className={clsx('text-[11px] font-bold flex-shrink-0 mt-0.5', CAT_COLOR[result])}>
                  {CAT_ICON[result]}
                </span>
                <div className="min-w-0">
                  <p className={clsx('text-[10px] font-semibold capitalize', CAT_COLOR[result])}>{cat}</p>
                  {hits.length > 0 ? (
                    <p className="text-[9px] text-gray-600 truncate" title={hits.join(', ')}>{hits[0]}{hits.length > 1 ? ` +${hits.length - 1}` : ''}</p>
                  ) : (
                    <p className="text-[9px] text-gray-700">no check matched</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[9px] text-gray-700 font-mono">
        {file_count} files · {check_count} check runs · SHA {head_sha}
      </p>
    </div>
  )
}

// ── Size badge ────────────────────────────────────────────────────────────────

function sizeBadge(total: number): { label: string; cls: string } {
  if (total < 10) return { label: 'XS', cls: 'bg-surface-3 text-gray-500' }
  if (total < 100) return { label: 'S', cls: 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25' }
  if (total < 500) return { label: 'M', cls: 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25' }
  if (total < 1000) return { label: 'L', cls: 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25' }
  return { label: 'XL', cls: 'bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25' }
}

function SizeBadge({ additions, deletions }: { additions: number; deletions: number }) {
  const total = (additions ?? 0) + (deletions ?? 0)
  if (!total) return null
  const { label, cls } = sizeBadge(total)
  return (
    <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-bold', cls)} title={`+${additions} -${deletions}`}>
      {label}
    </span>
  )
}

// ── Permission banner ─────────────────────────────────────────────────────────

function PermissionBanner({ canPush, repoSlug }: { canPush: boolean; repoSlug: string }) {
  if (canPush) return null
  return (
    <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs">
      <Lock size={11} className="text-neutral-500 flex-shrink-0" />
      <span className="text-gray-500">
        Read-only on <span className="font-medium text-gray-700">{repoSlug}</span> —
        merges and reviews must be performed on{' '}
        <a href={`https://github.com/${repoSlug}`} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">
          GitHub ↗
        </a>
        . CI triggers and check viewing are available here.
      </span>
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: any }) {
  if (!stats) return null
  const items = [
    { label: 'Open', value: stats.open, color: 'text-white' },
    { label: 'Ready', value: stats.ready, color: 'text-nvidia' },
    { label: 'Draft', value: stats.draft, color: 'text-gray-400' },
    { label: 'Review Req.', value: stats.review_requested, color: 'text-neutral-300' },
    { label: 'Conflicts', value: stats.has_conflicts, color: 'text-accent-red' },
  ]
  return (
    <div className="grid grid-cols-5 gap-2">
      {items.map(({ label, value, color }) => (
        <div key={label} className="bg-surface-1 border border-border rounded-lg px-3 py-2.5 text-center">
          <p className={clsx('text-xl font-semibold tabular-nums', color)}>{value ?? '—'}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Repetitive PR detector ────────────────────────────────────────────────────

function detectRepetitivePRs(prs: PR[]): string[] {
  const prefixCount: Record<string, number> = {}
  prs.forEach((pr) => {
    const prefix = pr.title.replace(/\s*#?\d+\s*$/, '').replace(/\s+$/, '').toLowerCase().slice(0, 40)
    prefixCount[prefix] = (prefixCount[prefix] ?? 0) + 1
  })
  return Object.entries(prefixCount)
    .filter(([, count]) => count >= 2)
    .map(([prefix]) => prefix)
}

// ── Review dots ───────────────────────────────────────────────────────────────

function ReviewDots({ reviews }: { reviews: any[] }) {
  if (!reviews?.length) return null
  return (
    <div className="flex items-center gap-0.5">
      {reviews.map((r: any) => (
        <img
          key={r.login}
          src={r.avatar}
          title={`${r.login}: ${r.state}`}
          className={clsx(
            'w-4 h-4 rounded-full ring-1',
            r.state === 'APPROVED' && 'ring-accent-green',
            r.state === 'CHANGES_REQUESTED' && 'ring-accent-red',
            r.state === 'COMMENTED' && 'ring-gray-500',
            r.state !== 'APPROVED' && r.state !== 'CHANGES_REQUESTED' && r.state !== 'COMMENTED' && 'ring-gray-700',
          )}
          alt={r.login}
        />
      ))}
    </div>
  )
}

// ── Expanded panel ────────────────────────────────────────────────────────────

function ExpandedPanel({ pr }: { pr: PR }) {
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['pr-summary', pr.number],
    queryFn: () => getPRSummary(pr.number),
    staleTime: 30_000,
  })

  const { data: reviewsData } = useQuery({
    queryKey: ['pr-reviews', pr.number],
    queryFn: () => getPRReviews(pr.number),
    staleTime: 30_000,
  })

  const { data: filesData } = useQuery({
    queryKey: ['pr-files', pr.number],
    queryFn: () => getPRFiles(pr.number),
    staleTime: 60_000,
  })

  const checks = summary?.checks
  const fullPR = summary?.pr
  const reviews: any[] = reviewsData?.reviews ?? []
  const files: any[] = filesData?.files ?? []

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-4">
      {/* Description */}
      {pr.body && (
        <div className="bg-surface-2 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Description</p>
          <p className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-6">{pr.body}</p>
        </div>
      )}

      {/* Size + mergeable_state from full PR */}
      {fullPR && (
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">Size:</span>
          <SizeBadge additions={fullPR.additions} deletions={fullPR.deletions} />
          <span className="text-accent-green">+{fullPR.additions}</span>
          <span className="text-accent-red">-{fullPR.deletions}</span>
          <span className="text-gray-500">{fullPR.changed_files} files</span>
          {fullPR.mergeable_state && fullPR.mergeable_state !== 'unknown' && (
            <span className={clsx(
              'text-[10px] px-2 py-0.5 rounded',
              fullPR.mergeable_state === 'clean' && 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25',
              fullPR.mergeable_state === 'dirty' && 'bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25',
              !['clean','dirty'].includes(fullPR.mergeable_state) && 'bg-surface-2 text-gray-400',
            )}>
              {fullPR.mergeable_state}
            </span>
          )}
        </div>
      )}

      {/* Check runs */}
      {summaryLoading ? (
        <p className="text-[10px] text-gray-600">Loading checks…</p>
      ) : checks ? (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">CI Checks</p>
          <div className="flex items-center gap-4 mb-2 text-[10px]">
            {checks.passed > 0 && <span className="flex items-center gap-1 text-accent-green"><CheckCircle2 size={10} />{checks.passed} passed</span>}
            {checks.failed > 0 && <span className="flex items-center gap-1 text-accent-red"><XCircle size={10} />{checks.failed} failed</span>}
            {checks.pending > 0 && <span className="flex items-center gap-1 text-neutral-400"><Clock size={10} />{checks.pending} pending</span>}
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {(checks.runs ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between text-xs bg-surface-2 rounded px-2 py-1">
                <span className="text-gray-300 truncate max-w-sm">{c.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={c.conclusion ?? c.status} />
                  <a href={c.html_url} target="_blank" rel="noreferrer">
                    <ExternalLink size={10} className="text-gray-600 hover:text-neutral-300" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Reviews */}
      {reviews.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
            Reviews — {reviewsData?.approved ?? 0} approved, {reviewsData?.changes_requested ?? 0} changes requested
          </p>
          <div className="space-y-1.5">
            {reviews.map((r: any) => (
              <div key={r.login} className="flex items-center gap-2 text-xs">
                <img src={r.avatar} className="w-5 h-5 rounded-full" alt={r.login} />
                <span className="text-gray-300 w-28 truncate">{r.login}</span>
                <span className={clsx(
                  'text-[9px] px-1.5 py-0.5 rounded font-semibold',
                  r.state === 'APPROVED' && 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25',
                  r.state === 'CHANGES_REQUESTED' && 'bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25',
                  r.state === 'COMMENTED' && 'bg-surface-3 text-gray-400',
                )}>
                  {r.state.replace('_', ' ')}
                </span>
                {r.submitted_at && (
                  <span className="text-gray-600 text-[10px]">{formatDistanceToNow(new Date(r.submitted_at), { addSuffix: true })}</span>
                )}
                {r.body && <span className="text-gray-500 text-[10px] truncate max-w-xs italic">"{r.body}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gate analysis */}
      <GatePanel prNumber={pr.number} />

      {/* Files changed */}
      {files.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
            Files Changed ({files.length})
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {files.map((f: any) => (
              <div key={f.filename} className="flex items-center justify-between text-[10px] bg-surface-2 rounded px-2 py-1">
                <span className="text-gray-300 truncate max-w-xs font-mono">{f.filename}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={clsx(
                    'text-[9px] px-1 rounded',
                    f.status === 'added' && 'text-accent-green',
                    f.status === 'removed' && 'text-accent-red',
                    f.status === 'modified' && 'text-neutral-400',
                    f.status === 'renamed' && 'text-neutral-400',
                  )}>
                    {f.status}
                  </span>
                  <span className="text-accent-green">+{f.additions}</span>
                  <span className="text-accent-red">-{f.deletions}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Inline gate badge (lightweight, shown on card without expanding) ──────────

function InlineGateBadge({ prNumber }: { prNumber: number }) {
  const { data } = useQuery({
    queryKey: ['pr-gate', prNumber],
    queryFn: () => getPRGate(prNumber),
    staleTime: 45_000,
    enabled: false,  // only loads when ExpandedPanel triggers it; avoids N requests on load
  })
  if (!data) return null
  return (
    <>
      <ClassChip cls={data.classification} />
      <GateChip verdict={data.gate?.verdict ?? 'pending'} />
    </>
  )
}

// ── PR card ───────────────────────────────────────────────────────────────────

function PRCard({ pr, canPush, repetitive }: { pr: PR; canPush: boolean; repetitive: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const qc = useQueryClient()

  const { mutate: triggerCI, isPending: triggering } = useMutation({
    mutationFn: () => triggerPRCI(pr.number),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pr-summary', pr.number] }),
  })

  const agedays = differenceInDays(new Date(), new Date(pr.created_at))
  const isStale = agedays >= 7
  const hasConflict = (pr as any).mergeable_state === 'dirty'
  const requestedReviewers: Array<{ login: string; avatar_url: string }> = (pr as any).requested_reviewers ?? []

  return (
    <div className={clsx(
      'bg-surface-1 border rounded-lg p-4 transition-colors',
      repetitive ? 'border-neutral-600' : 'border-border',
    )}>
      <div className="flex items-start gap-3">
        {/* Left: gate indicator */}
        <div className="flex-shrink-0 mt-0.5">
          {pr.draft ? (
            <div className="w-3 h-3 rounded-full bg-gray-700 mt-0.5" title="Draft" />
          ) : (
            <GitPullRequest size={14} className="text-accent-green" />
          )}
        </div>

        {/* Center: main content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-[10px] text-gray-600 font-mono">#{pr.number}</span>
            <InlineGateBadge prNumber={pr.number} />
            {pr.draft && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-semibold">DRAFT</span>
            )}
            {repetitive && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25 font-semibold" title="Similar title to another open PR">
                SIMILAR
              </span>
            )}
            {hasConflict && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25 font-semibold flex items-center gap-0.5">
                <AlertTriangle size={8} /> CONFLICT
              </span>
            )}
            {isStale && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-neutral-500" title={`Open for ${agedays} days`}>
                {agedays}d old
              </span>
            )}
            {pr.labels.map((l) => (
              <span
                key={l.name}
                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                style={{ backgroundColor: `#${l.color}22`, color: `#${l.color}` }}
              >
                {l.name}
              </span>
            ))}
          </div>

          {/* Row 2: title */}
          <a
            href={pr.html_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-white hover:text-neutral-300 font-medium block truncate"
          >
            {pr.title}
          </a>

          {/* Row 3: meta */}
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <img src={pr.user.avatar_url} className="w-3 h-3 rounded-full" alt="" />
              {pr.user.login}
            </span>
            <span className="text-gray-500 font-mono">{pr.head.ref}</span>
            <span>→ {pr.base.ref}</span>
            <span className="flex items-center gap-0.5">
              <Calendar size={9} />
              {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
            </span>
            {(pr.comments ?? 0) + (pr.review_comments ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageSquare size={9} />
                {(pr.comments ?? 0) + (pr.review_comments ?? 0)}
              </span>
            )}
            {(pr.changed_files ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <FileText size={9} />
                {pr.changed_files}
              </span>
            )}
            {/* Requested reviewers */}
            {requestedReviewers.length > 0 && (
              <span className="flex items-center gap-1">
                <Users size={9} />
                {requestedReviewers.map((r) => (
                  <img key={r.login} src={r.avatar_url} title={r.login} className="w-3.5 h-3.5 rounded-full ring-1 ring-gray-600" alt={r.login} />
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => triggerCI()}
            disabled={triggering}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-surface-2 text-gray-300 hover:bg-surface-3 disabled:opacity-50 transition-colors"
            title="Trigger build.yml"
          >
            <Play size={9} />
            {triggering ? '…' : 'CI'}
          </button>
          <a
            href={pr.html_url}
            target="_blank"
            rel="noreferrer"
            className="px-2 py-1 rounded text-[10px] bg-surface-2 text-gray-300 hover:bg-surface-3 transition-colors flex items-center gap-1"
          >
            <ExternalLink size={9} /> GitHub
          </a>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-surface-2 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && <ExpandedPanel pr={pr} />}
    </div>
  )
}

// ── Sort / filter bar ─────────────────────────────────────────────────────────

type SortKey = 'newest' | 'oldest' | 'updated' | 'most-changed' | 'most-comments'
type AgeFilter = 'all' | '7d' | '30d' | '90d'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'most-changed', label: 'Most changed' },
  { value: 'most-comments', label: 'Most comments' },
]

const AGE_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

// ── Automation tab ────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  labeled: 'Labeled',
  'triggered-ci': 'Triggered CI',
  commented: 'Gate comment posted',
  merged: 'Auto-merged',
}

function AutomationTab() {
  const qc = useQueryClient()

  const { data: status, isLoading } = useQuery({
    queryKey: ['automation-status'],
    queryFn: getAutomationStatus,
    refetchInterval: 5_000,
  })

  const { mutate: runNow, isPending: running } = useMutation({
    mutationFn: triggerAutomationRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-status'] }),
  })

  const { mutate: toggleEnabled } = useMutation({
    mutationFn: (enabled: boolean) => updateAutomationConfig({ enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-status'] }),
  })

  const { mutate: setInterval } = useMutation({
    mutationFn: (interval_minutes: number) => updateAutomationConfig({ interval_minutes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-status'] }),
  })

  const enabled = status?.enabled ?? false
  const results: any[] = status?.last_run_results ?? []

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={14} className={enabled ? 'text-accent-green' : 'text-gray-500'} />
            <h2 className="text-sm font-semibold text-white">PR Automation</h2>
            <span className={clsx('text-[9px] px-2 py-0.5 rounded font-bold', enabled ? 'bg-accent-green/10 text-accent-green border border-accent-green/20' : 'bg-surface-3 text-gray-500 border border-border')}>
              {enabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>
          <button
            onClick={() => toggleEnabled(!enabled)}
            className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors"
          >
            {enabled ? <ToggleRight size={18} className="text-accent-green" /> : <ToggleLeft size={18} className="text-gray-500" />}
            {enabled ? 'Disable' : 'Enable'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div className="bg-surface-2 rounded-lg p-3 border border-border">
            <p className="text-gray-500 mb-1">Interval</p>
            <div className="flex items-center gap-2">
              <select
                value={status?.interval_minutes ?? 10}
                onChange={(e) => setInterval(Number(e.target.value))}
                className="bg-surface-3 border border-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-neutral-500"
              >
                {[1, 5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
              <span className="text-gray-600">polling interval</span>
            </div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3 border border-border">
            <p className="text-gray-500 mb-1">Stats</p>
            <p className="text-white font-semibold">{status?.total_runs ?? 0} runs · {status?.actions_taken ?? 0} actions</p>
            <p className="text-gray-600 text-[10px]">{status?.last_run_at ? `Last: ${formatDistanceToNow(new Date(status.last_run_at), { addSuffix: true })}` : 'Never run'}</p>
          </div>
        </div>

        {/* What automation does */}
        <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">What it does each pass</p>
          {[
            { icon: '🏷️', label: 'Auto-label', desc: 'Adds classification label (documentation, testing, enhancement, ci/cd) based on changed files' },
            { icon: '▶️', label: 'Auto-trigger CI', desc: 'Dispatches build.yml for PRs with missing lint/test check runs' },
            { icon: '💬', label: 'Auto-comment', desc: 'Posts/updates a gate-status comment showing classification, required checks, and runner recommendation' },
            { icon: '🔀', label: 'Auto-merge', desc: 'Merges PRs with auto-merge label when all required checks pass and no conflicts' },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="flex items-start gap-2 text-[11px]">
              <span className="flex-shrink-0 mt-0.5">{icon}</span>
              <div>
                <span className="text-white font-medium">{label}</span>
                <span className="text-gray-500"> — {desc}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => runNow()}
          disabled={running || status?.running}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-nvidia/10 border border-nvidia/20 text-[12px] text-nvidia font-semibold hover:bg-nvidia/20 transition-colors disabled:opacity-50"
        >
          <Play size={12} />
          {status?.running ? 'Running…' : running ? 'Starting…' : 'Run Now'}
        </button>
      </div>

      {/* Last run results */}
      {results.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Last run — {results.length} PRs processed
          </p>
          <div className="space-y-2">
            {results.map((r: any) => (
              <div key={r.pr_number} className="bg-surface-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-gray-500">#{r.pr_number}</span>
                  <span className={clsx(
                    'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase',
                    r.classification === 'docs' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                    r.classification === 'source' && 'bg-[#76b900]/[.07] text-nvidia ring-1 ring-[#76b900]/25',
                    r.classification === 'tests' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                    r.classification === 'ci' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                    r.classification === 'mixed' && 'bg-surface-3 text-gray-400',
                  )}>{r.classification}</span>
                  <p className="flex-1 text-[11px] text-gray-300 truncate">{r.title}</p>
                  <span className={clsx(
                    'text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0',
                    r.gate_verdict === 'success' && 'text-nvidia bg-[#76b900]/10',
                    r.gate_verdict === 'failure' && 'text-accent-red bg-accent-red/10',
                    r.gate_verdict === 'pending' && 'text-neutral-400 bg-neutral-500/10',
                    r.gate_verdict === 'skipped' && 'text-gray-400 bg-surface-3',
                  )}>{r.gate_verdict}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(r.actions ?? []).map((a: any, i: number) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-neutral-400 border border-border">
                      {ACTION_LABELS[a.type] ?? a.type}{a.detail ? `: ${a.detail}` : ''}
                    </span>
                  ))}
                  {(r.errors ?? []).map((e: string, i: number) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-accent-red/10 text-accent-red border border-accent-red/20">
                      ⚠ {e.slice(0, 40)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && results.length === 0 && (
        <div className="text-center py-8 text-gray-600 text-sm">
          No runs yet — click <span className="text-white">Run Now</span> to process open PRs
        </div>
      )}
    </div>
  )
}

// ── Runners tab ───────────────────────────────────────────────────────────────

function RunnersTab() {
  const { data } = useQuery({
    queryKey: ['runner-recommendations'],
    queryFn: getRunnerRecommendations,
    staleTime: 300_000,
  })

  const recs: Record<string, any> = data?.recommendations ?? {}
  const practices: any[] = data?.best_practices ?? []
  const classifications = ['docs', 'tests', 'source', 'ci', 'mixed']

  return (
    <div className="space-y-4">
      {/* Runner assignment matrix */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Cpu size={14} className="text-neutral-500" />
          <h2 className="text-sm font-semibold text-white">Runner Assignment by PR Type</h2>
        </div>
        <div className="space-y-2">
          {classifications.map((cls) => {
            const rec = recs[cls]
            if (!rec) return null
            return (
              <div key={cls} className="flex items-start gap-3 bg-surface-2 rounded-lg border border-border p-3">
                <span className={clsx(
                  'text-[9px] px-2 py-1 rounded font-bold uppercase flex-shrink-0 mt-0.5',
                  cls === 'docs' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                  cls === 'tests' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                  cls === 'source' && 'bg-[#76b900]/[.07] text-nvidia ring-1 ring-[#76b900]/25',
                  cls === 'ci' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                  cls === 'mixed' && 'bg-surface-3 text-gray-400',
                )}>{cls}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-mono text-white">{rec.runner}</span>
                    {rec.gpu
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-nvidia/10 text-nvidia border border-nvidia/20 font-semibold">GPU</span>
                      : <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-gray-400 border border-border">Hosted</span>
                    }
                  </div>
                  <p className="text-[10px] text-gray-500">{rec.reason}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Best practices */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Server size={14} className="text-neutral-500" />
          <h2 className="text-sm font-semibold text-white">Best Practices</h2>
        </div>
        <div className="space-y-2">
          {practices.map((p: any, i: number) => (
            <div key={i} className="bg-surface-2 rounded-lg border border-border p-3 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={11} className="text-accent-green flex-shrink-0" />
                <p className="text-[11px] text-white font-medium">{p.rule}</p>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <span className={clsx(
                  'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase',
                  p.classification === 'docs' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                  p.classification === 'tests' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                  p.classification === 'source' && 'bg-[#76b900]/[.07] text-nvidia ring-1 ring-[#76b900]/25',
                  p.classification === 'ci' && 'bg-neutral-500/[.07] text-neutral-400 ring-1 ring-neutral-500/25',
                  p.classification === 'mixed' && 'bg-surface-3 text-gray-400',
                )}>{p.classification}</span>
                <span className="text-[10px] font-mono text-gray-300">→ {p.runner}</span>
              </div>
              <p className="text-[10px] text-gray-500 pl-4">{p.rationale}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page tabs ─────────────────────────────────────────────────────────────────

type Tab = 'prs' | 'automation' | 'runners'

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PRHub() {
  const [activeTab, setActiveTab] = useState<Tab>('prs')
  const [prState, setPrState] = useState<'open' | 'closed'>('open')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all')
  const qc = useQueryClient()

  const { data: permsData } = useQuery({
    queryKey: ['repo-permissions'],
    queryFn: getRepoPermissions,
    staleTime: 300_000,
  })
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''

  const { data: statsData } = useQuery({
    queryKey: ['pr-stats'],
    queryFn: getPRStats,
    refetchInterval: 60_000,
  })

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['prs', prState],
    queryFn: () => getPRs(prState),
    refetchInterval: 60_000,
  })

  const allPRs: PR[] = Array.isArray(data) ? data : []
  const canPush = permsData?.can_push ?? false

  // Repetitive PR detection
  const repetitivePrefixes = useMemo(() => detectRepetitivePRs(allPRs), [allPRs])

  const ageCutoff: Record<AgeFilter, number> = { all: Infinity, '7d': 7, '30d': 30, '90d': 90 }

  const prs = useMemo(() => {
    let filtered = allPRs
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (pr) =>
          pr.title.toLowerCase().includes(q) ||
          pr.user.login.toLowerCase().includes(q) ||
          pr.head.ref.toLowerCase().includes(q) ||
          String(pr.number).includes(q),
      )
    }
    if (ageFilter !== 'all') {
      const cutoff = ageCutoff[ageFilter]
      filtered = filtered.filter((pr) => differenceInDays(new Date(), new Date(pr.created_at)) <= cutoff)
    }
    return [...filtered].sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sort === 'updated') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      if (sort === 'most-changed') return (b.changed_files ?? 0) - (a.changed_files ?? 0)
      if (sort === 'most-comments') return ((b.comments ?? 0) + (b.review_comments ?? 0)) - ((a.comments ?? 0) + (a.review_comments ?? 0))
      return 0
    })
  }, [allPRs, search, sort, ageFilter])

  const repetitiveSet = useMemo(() => {
    const s = new Set<number>()
    allPRs.forEach((pr) => {
      const prefix = pr.title.replace(/\s*#?\d+\s*$/, '').replace(/\s+$/, '').toLowerCase().slice(0, 40)
      if (repetitivePrefixes.includes(prefix)) s.add(pr.number)
    })
    return s
  }, [allPRs, repetitivePrefixes])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTab === 'prs' && (
            <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
              {prs.length} shown · {allPRs.length} {prState}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-md overflow-hidden border border-border text-xs">
            {([
              { id: 'prs', label: 'PRs', icon: GitPullRequest },
              { id: 'automation', label: 'Automation', icon: Zap },
              { id: 'runners', label: 'Runners', icon: Cpu },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
                  activeTab === id ? 'bg-surface-3 text-white' : 'text-gray-400 hover:bg-surface-2',
                )}
              >
                <Icon size={11} />{label}
              </button>
            ))}
          </div>
          {activeTab === 'prs' && (
            <div className="flex rounded-md overflow-hidden border border-border text-xs">
              {(['open', 'closed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPrState(s)}
                  className={clsx(
                    'px-3 py-1.5 transition-colors capitalize',
                    prState === s ? 'bg-surface-3 text-white' : 'text-gray-400 hover:bg-surface-2',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['prs'] })}
            className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {activeTab === 'automation' && <AutomationTab />}
      {activeTab === 'runners' && <RunnersTab />}

      {activeTab === 'prs' && <>
      <PermissionBanner canPush={canPush} repoSlug={repoSlug} />
      <StatsBar stats={statsData} />
      <GateOverviewBar days={ageFilter === 'all' ? undefined : parseInt(ageFilter)} />

      {/* Repetitive PR alert */}
      {repetitivePrefixes.length > 0 && (
        <div className="flex items-start gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs">
          <AlertCircle size={12} className="text-neutral-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-neutral-300 font-medium">Possible duplicate PRs detected</span>
            <p className="text-gray-400 mt-0.5">
              PRs with similar titles: {repetitivePrefixes.slice(0, 3).map((p) => `"${p}…"`).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filter / search bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, branch…"
            className="w-full bg-surface-2 border border-border rounded-md pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-neutral-500"
          />
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={11} className="text-gray-500" />
          <select
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value as AgeFilter)}
            className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-neutral-500"
          >
            {AGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-neutral-500"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-center py-12 text-gray-500 text-sm">Loading PRs…</div>}
      {isError && (
        <div className="text-center py-12 text-accent-red text-sm">
          Failed to load PRs — check GH_PAT in backend/.env
        </div>
      )}
      {!isLoading && prs.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">No PRs match your filters.</div>
      )}

      <div className="space-y-2.5">
        {prs.map((pr) => (
          <PRCard key={pr.number} pr={pr} canPush={canPush} repetitive={repetitiveSet.has(pr.number)} />
        ))}
      </div>
      </>}
    </div>
  )
}
