import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { GitBranch, ExternalLink, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { getWorkflowsWithStatus } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

// ── Live, repo-aware CI/CD pipeline ───────────────────────────────────────────
// Replaces the hardcoded IsaacLab architecture SVG for the "Current State" view.
// Renders the ACTIVE repo's real GitHub Actions workflows, grouped into pipeline
// stages inferred from workflow name/filename, with each workflow's latest run
// status. Because the query is keyed by the active repo slug, it refetches and
// re-renders whenever the user switches repositories.

type WorkflowStatus = {
  id: number
  name: string
  filename: string
  state: string
  pinned: boolean
  last_status: string | null   // success | failure | in_progress | queued | cancelled | skipped | null
  last_run_at: string | null   // ISO-8601 UTC
  last_branch: string | null
  html_url: string
}

type Stage = {
  id: string
  label: string
  hint: string
  match: (s: string) => boolean
}

// Order matters: first matching stage wins.
const STAGES: Stage[] = [
  { id: 'premerge', label: 'Pre-merge', hint: 'PR checks · lint · format',
    match: (s) => /\b(pr|pull|lint|pre-?commit|format|check|license|links?)\b/.test(s) },
  { id: 'test', label: 'Test', hint: 'unit · integration · coverage',
    match: (s) => /\b(test|tests|pytest|unit|integration|e2e|coverage|install)\b/.test(s) },
  { id: 'build', label: 'Build', hint: 'compile · image · wheel',
    match: (s) => /\b(build|wheel|docker|image|package|compile|bazel)\b/.test(s) },
  { id: 'nightly', label: 'Nightly / Scheduled', hint: 'cron · daily · compat',
    match: (s) => /\b(nightly|daily|schedule[d]?|cron|compat|compatibility)\b/.test(s) },
  { id: 'release', label: 'Release / Publish', hint: 'publish · deploy · CD',
    match: (s) => /\b(publish|release|deploy|cd|wheel-publish)\b/.test(s) },
]

const OTHER: Stage = { id: 'other', label: 'Other', hint: 'unclassified workflows', match: () => true }

// Canonical stage order, shared with the dashboard CI-flow so both derive stages
// from the active repo's real workflows instead of a hardcoded pipeline.
export const WORKFLOW_STAGE_ORDER = ['premerge', 'test', 'build', 'nightly', 'release'] as const

/** Classify a workflow into a canonical CI stage id from its filename + display name. */
export function classifyWorkflowStage(filename: string, name: string): string {
  const hay = `${filename} ${name}`.toLowerCase()
  for (const st of STAGES) {
    if (st.match(hay)) return st.id
  }
  return OTHER.id
}

function classify(wf: WorkflowStatus): string {
  return classifyWorkflowStage(wf.filename, wf.name)
}

// ── Status → colour token ─────────────────────────────────────────────────────
function statusStyle(status: string | null): { dot: string; text: string; label: string; pulse?: boolean } {
  switch (status) {
    case 'success':
      return { dot: 'bg-accent-green', text: 'text-accent-green', label: 'passing' }
    case 'failure':
    case 'timed_out':
      return { dot: 'bg-accent-red', text: 'text-accent-red', label: 'failing' }
    case 'in_progress':
    case 'queued':
    case 'pending':
      return { dot: 'bg-accent-yellow', text: 'text-accent-yellow', label: 'running', pulse: true }
    case 'cancelled':
    case 'skipped':
      return { dot: 'bg-gray-500', text: 'text-gray-400', label: status }
    default:
      return { dot: 'bg-gray-600', text: 'text-gray-500', label: 'no runs' }
  }
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return '—'
  }
}

function WorkflowChip({ wf }: { wf: WorkflowStatus }) {
  const st = statusStyle(wf.last_status)
  return (
    <a
      href={wf.html_url || undefined}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3 py-2 transition-colors hover:border-gray-600"
      title={`${wf.name} · ${wf.filename}`}
    >
      <span className={clsx('h-2 w-2 shrink-0 rounded-full', st.dot, st.pulse && 'animate-pulse')} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-white">{wf.name}</span>
        <span className="block truncate font-mono text-[9px] text-gray-500">{wf.filename}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className={clsx('text-[9px] font-mono uppercase tracking-wider', st.text)}>{st.label}</span>
        <span className="text-[9px] text-gray-600">{relTime(wf.last_run_at)}</span>
      </span>
      <ExternalLink className="h-3 w-3 shrink-0 text-gray-700 group-hover:text-gray-400" />
    </a>
  )
}

function StageColumn({ stage, workflows }: { stage: Stage; workflows: WorkflowStatus[] }) {
  return (
    <div className="flex min-w-[220px] flex-1 flex-col rounded-xl border border-border bg-surface-2/60 p-2.5">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">{stage.label}</span>
        <span className="font-mono text-[10px] text-gray-600">{workflows.length}</span>
      </div>
      <p className="mb-2 px-1 font-mono text-[9px] uppercase tracking-wider text-gray-600">{stage.hint}</p>
      <div className="flex flex-col gap-1.5">
        {workflows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[10px] text-gray-600">
            no workflows
          </div>
        ) : (
          workflows.map((wf) => <WorkflowChip key={wf.id} wf={wf} />)
        )}
      </div>
    </div>
  )
}

export default function LiveCICDPipeline() {
  const slug = useRepoSlug()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [slug, 'cicd-live-pipeline'],
    queryFn: getWorkflowsWithStatus,
    enabled: !!slug,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[12px]">Loading pipeline for {slug || 'repo'}…</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-[12px] text-accent-red">
        Couldn’t load workflows for {slug || 'this repo'}. {(error as Error)?.message ?? ''}
      </div>
    )
  }

  const workflows: WorkflowStatus[] = data?.workflows ?? []

  if (workflows.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-1 text-center text-gray-500">
        <span className="text-[13px] font-medium text-gray-300">No GitHub Actions workflows found</span>
        <span className="text-[11px]">
          {slug ? <><span className="font-mono">{slug}</span> has no <span className="font-mono">.github/workflows</span> files.</> : 'Select a repository to view its pipeline.'}
        </span>
      </div>
    )
  }

  // Bucket workflows into stages.
  const grouped: Record<string, WorkflowStatus[]> = {}
  for (const wf of workflows) {
    const id = classify(wf)
    ;(grouped[id] ??= []).push(wf)
  }
  // Only show stages that actually have workflows, so a small repo doesn't show empty columns.
  const allStages = [...STAGES, OTHER]
  const visible = allStages.filter((st) => (grouped[st.id]?.length ?? 0) > 0)
  const shown = visible.length > 0 ? visible : allStages

  const running = workflows.filter((w) => ['in_progress', 'queued', 'pending'].includes(w.last_status ?? '')).length
  const failing = workflows.filter((w) => w.last_status === 'failure').length

  return (
    <div className="flex h-full min-h-[280px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <span className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[11px] text-gray-300">
          <GitBranch className="h-3 w-3 text-brand" />
          {slug || '—'}
        </span>
        <span className="font-mono text-[10px] text-gray-500">{workflows.length} workflows</span>
        {failing > 0 && <span className="font-mono text-[10px] text-accent-red">{failing} failing</span>}
        {running > 0 && <span className="font-mono text-[10px] text-accent-yellow">{running} running</span>}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-gray-600">
          live · stages inferred from workflow names
        </span>
      </div>
      <div className="flex flex-1 flex-wrap gap-2.5 overflow-x-auto lg:flex-nowrap">
        {shown.map((stage) => (
          <StageColumn key={stage.id} stage={stage} workflows={grouped[stage.id] ?? []} />
        ))}
      </div>
    </div>
  )
}
