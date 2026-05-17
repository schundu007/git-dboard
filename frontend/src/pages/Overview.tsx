import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  GitPullRequest, Container, Moon, Server, Layers,
  Star, GitFork, AlertCircle, CheckCircle2, Clock,
  TrendingUp, Activity, Zap, RefreshCw, ExternalLink,
  XCircle, AlertTriangle, Users, GitBranch, ChevronDown,
  ChevronUp, Terminal, RotateCcw, Package,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getOverviewSummary, getFailureSummary, getActiveRepo } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import clsx from 'clsx'

// ── Failure summary expander ──────────────────────────────────────────────────

function FailureDetail({ runId }: { runId: number }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['failure-summary', runId],
    queryFn: () => getFailureSummary(runId),
    enabled: open,
    staleTime: 300_000,
  })

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-accent-red hover:text-red-400 transition-colors"
      >
        <Terminal size={9} />
        {open ? 'Hide error' : 'Show error'}
        {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>
      {open && (
        <div className="mt-1.5 bg-black/40 rounded border border-red-900/40 p-2 space-y-2">
          {isLoading && <p className="text-[10px] text-gray-400">Fetching logs…</p>}
          {data?.summaries?.map((s: any, i: number) => (
            <div key={i} className="space-y-1">
              <p className="text-[10px] font-semibold text-accent-red flex items-center gap-1">
                <XCircle size={9} /> {s.job}
                {s.runner && <span className="text-gray-400 font-normal ml-1">on {s.runner}</span>}
              </p>
              {s.failed_steps?.map((step: any) => (
                <p key={step.number} className="text-[10px] text-orange-400 pl-3 flex items-center gap-1">
                  <AlertTriangle size={8} /> Step {step.number}: {step.name}
                </p>
              ))}
              {s.error_lines?.length > 0 && (
                <div className="bg-black/60 rounded p-1.5 font-mono max-h-28 overflow-y-auto">
                  {s.error_lines.map((line: string, li: number) => (
                    <p key={li} className={clsx(
                      'text-[9px] leading-4 break-all',
                      line.toLowerCase().includes('error') || line.includes('##[error]')
                        ? 'text-accent-red'
                        : line.toLowerCase().includes('traceback') || line.toLowerCase().includes('exception')
                        ? 'text-orange-400'
                        : 'text-gray-400',
                    )}>
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {data?.failed_jobs === 0 && (
            <p className="text-[10px] text-gray-400">No failed jobs found in this run.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── PR attention panel ────────────────────────────────────────────────────────

function PRPanel({ prs }: { prs: any }) {
  const nav = useNavigate()
  if (!prs) return null
  const attention: any[] = prs.attention ?? []

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 border-b border-border card-head cursor-pointer hover:bg-surface-2 transition-colors"
        onClick={() => nav('/prs')}
      >
        <div className="flex items-center gap-2">
          <GitPullRequest size={14} className="text-neutral-400" />
          <span className="text-xs font-semibold text-gray-300">Open PRs</span>
          <span className="text-[10px] bg-surface-2 text-neutral-400 ring-1 ring-border px-1.5 py-0.5 rounded-full">{prs.open}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="text-accent-green">{prs.ready} ready</span>
          <span className="text-gray-400">{prs.draft} draft</span>
          {prs.review_requested > 0 && (
            <span className="text-neutral-400 flex items-center gap-0.5">
              <Users size={9} /> {prs.review_requested} need review
            </span>
          )}
        </div>
      </div>

      {/* PR list */}
      <div className="divide-y divide-border/40">
        {attention.slice(0, 6).map((pr: any) => (
          <div key={pr.number} className="px-3.5 py-2 flex items-start gap-3 hover:bg-surface-2/50 transition-colors">
            <img src={pr.avatar} className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" alt={pr.author} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 font-mono">#{pr.number}</span>
                {pr.draft && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-gray-800 text-gray-400">DRAFT</span>
                )}
                {pr.labels.map((l: string) => (
                  <span key={l} className="text-[9px] px-1 py-0.5 rounded bg-surface-3 text-gray-400">{l}</span>
                ))}
              </div>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gray-200 hover:text-neutral-100 truncate block"
              >
                {pr.title}
              </a>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                <span className="text-neutral-500 font-mono truncate max-w-[120px]">{pr.branch}</span>
                <span>→ {pr.base}</span>
                {pr.reviewers_requested > 0 && (
                  <span className="text-neutral-400">⟳ {pr.reviewers_requested} reviewer{pr.reviewers_requested > 1 ? 's' : ''}</span>
                )}
                <span>{pr.updated_at && formatDistanceToNow(new Date(pr.updated_at), { addSuffix: true })}</span>
              </div>
            </div>
            <a href={pr.url} target="_blank" rel="noreferrer" className="flex-shrink-0">
              <ExternalLink size={10} className="text-gray-400 hover:text-neutral-200" />
            </a>
          </div>
        ))}
        {attention.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400">No open PRs.</p>
        )}
      </div>

      <div
        className="px-3.5 py-1.5 border-t border-border text-[10px] text-gray-400 hover:text-neutral-200 cursor-pointer transition-colors"
        onClick={() => nav('/prs')}
      >
        View all {prs.open} PRs →
      </div>
    </div>
  )
}

// ── Build failures panel ──────────────────────────────────────────────────────

function BuildPanel({ builds }: { builds: any }) {
  const nav = useNavigate()
  if (!builds) return null
  const failures: any[] = builds.recent_failures ?? []
  const recent: any[] = builds.recent ?? []

  const successRate = builds.success_rate_last10
  const rateColor =
    successRate >= 80 ? 'text-accent-green' :
    successRate >= 50 ? 'text-accent-yellow' :
    'text-accent-red'

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 border-b border-border card-head cursor-pointer hover:bg-surface-2 transition-colors"
        onClick={() => nav('/builds')}
      >
        <div className="flex items-center gap-2">
          <Container size={14} className="text-neutral-400" />
          <span className="text-xs font-semibold text-gray-300">Build Runs</span>
          <span className="text-[10px] bg-surface-2 text-neutral-400 ring-1 ring-border px-1.5 py-0.5 rounded-full">
            {builds.total?.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className={clsx(rateColor, 'font-semibold')}>{successRate ?? '—'}% success</span>
          {builds.in_progress > 0 && (
            <span className="text-nvidia animate-pulse flex items-center gap-0.5">
              <Zap size={9} /> {builds.in_progress} running
            </span>
          )}
        </div>
      </div>

      {/* Recent failures */}
      {failures.length > 0 && (
        <div>
          <p className="px-4 pt-2.5 pb-1 text-[10px] font-semibold text-accent-red uppercase tracking-wider">
            Recent Failures
          </p>
          <div className="divide-y divide-border/40">
            {failures.slice(0, 5).map((b: any) => (
              <div key={b.id} className="px-3.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-red flex-shrink-0" />
                      <span className="text-[10px] text-gray-400 font-mono truncate max-w-[120px]">{b.branch}</span>
                      <span className="text-[10px] text-gray-400">{b.workflow}</span>
                      {b.duration_label && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Clock size={8} /> {b.duration_label}
                        </span>
                      )}
                    </div>
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-200 hover:text-neutral-100 block truncate"
                    >
                      {b.title || b.branch}
                    </a>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                      {b.actor_avatar && (
                        <img src={b.actor_avatar} className="w-3 h-3 rounded-full" alt="" />
                      )}
                      {b.actor && <span>{b.actor}</span>}
                      {b.created_at && (
                        <span>{formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}</span>
                      )}
                    </div>
                    {/* Inline failure detail */}
                    <FailureDetail runId={b.id} />
                  </div>
                  <a href={b.url} target="_blank" rel="noreferrer" className="flex-shrink-0 mt-0.5">
                    <ExternalLink size={10} className="text-gray-400 hover:text-neutral-200" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent passing runs (if no failures, show recent) */}
      {failures.length === 0 && (
        <div className="divide-y divide-border/40">
          {recent.slice(0, 5).map((b: any) => (
            <div key={b.id} className="px-3.5 py-2 flex items-center gap-3">
              <StatusBadge status={b.status} />
              <span className="text-xs text-gray-300 truncate flex-1">{b.title || b.branch}</span>
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                {b.created_at && formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
              </span>
              <a href={b.url} target="_blank" rel="noreferrer">
                <ExternalLink size={10} className="text-gray-400 hover:text-neutral-200" />
              </a>
            </div>
          ))}
        </div>
      )}

      <div
        className="px-3.5 py-1.5 border-t border-border text-[10px] text-gray-400 hover:text-neutral-200 cursor-pointer transition-colors"
        onClick={() => nav('/builds')}
      >
        View all builds →
      </div>
    </div>
  )
}

// ── Nightly health panel ──────────────────────────────────────────────────────

function NightlyPanel({ nightly }: { nightly: any }) {
  const nav = useNavigate()
  if (!nightly) return null

  const { consecutive_failures: fails, last_status, last_date, failed_jobs = [], last_run_id } = nightly
  const isHealthy = last_status === 'success'
  const isCritical = fails >= 3

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5 border-b border-border card-head cursor-pointer hover:bg-surface-2/50 transition-colors"
        onClick={() => nav('/nightly')}
      >
        <div className="flex items-center gap-2">
          <Moon size={14} className={isCritical ? 'text-accent-red' : isHealthy ? 'text-accent-green' : 'text-accent-yellow'} />
          <span className="text-xs font-semibold text-gray-300">Nightly Health</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={last_status} size="md" />
          {fails > 0 && (
            <span className="text-xs text-accent-red font-semibold">
              {fails} consecutive failure{fails > 1 ? 's' : ''}
            </span>
          )}
          {isHealthy && <span className="text-xs text-accent-green font-semibold">Healthy</span>}
        </div>
      </div>

      {last_date && (
        <p className="px-4 pt-2 text-[10px] text-gray-500">Last run: {last_date}</p>
      )}

      {/* Failed jobs */}
      {failed_jobs.length > 0 && (
        <div className="px-4 pb-3 pt-2 space-y-2">
          <p className="text-[10px] font-semibold text-accent-red uppercase tracking-wider mb-1.5">
            Failed Jobs
          </p>
          {failed_jobs.map((j: any, i: number) => (
            <div key={i} className="bg-black/30 rounded-lg p-2.5 border border-red-900/30">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-200 flex items-center gap-1.5">
                  <XCircle size={10} className="text-accent-red flex-shrink-0" />
                  {j.job}
                </p>
                {j.url && (
                  <a href={j.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={10} className="text-gray-400 hover:text-neutral-200" />
                  </a>
                )}
              </div>
              {j.failed_steps?.map((step: string, si: number) => (
                <p key={si} className="text-[10px] text-neutral-400 mt-1 pl-5 flex items-center gap-1">
                  <AlertTriangle size={8} /> {step}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {isHealthy && (
        <div className="px-4 pb-3 pt-2">
          <p className="text-xs text-accent-green flex items-center gap-1.5">
            <CheckCircle2 size={12} /> All nightly jobs passing
          </p>
        </div>
      )}

      <div
        className="px-3.5 py-1.5 border-t border-border text-[10px] text-gray-400 hover:text-neutral-200 cursor-pointer transition-colors"
        onClick={() => nav('/nightly')}
      >
        View nightly matrix →
      </div>
    </div>
  )
}

// ── Runners panel ─────────────────────────────────────────────────────────────

function RunnersPanel({ runners }: { runners: any }) {
  const nav = useNavigate()
  if (!runners) return null
  const list: any[] = runners.list ?? []
  const accessDenied: boolean = runners.access_denied ?? false

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-3.5 py-2.5 border-b border-border card-head cursor-pointer hover:bg-surface-2 transition-colors"
        onClick={() => nav('/infra')}
      >
        <div className="flex items-center gap-2">
          <Server size={14} className="text-neutral-400" />
          <span className="text-xs font-semibold text-gray-300">Runners</span>
          <span className={clsx(
            'text-[10px] px-1.5 py-0.5 rounded-full',
            accessDenied ? 'bg-surface-2 text-gray-500' :
            runners.online > 0 ? 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25' : 'bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25',
          )}>
            {accessDenied ? 'scope limited' : `${runners.online}/${runners.total} online`}
          </span>
        </div>
        {runners.busy > 0 && (
          <span className="text-[10px] text-nvidia animate-pulse flex items-center gap-0.5">
            <Zap size={9} /> {runners.busy} busy
          </span>
        )}
      </div>

      {list.length > 0 ? (
        <div className="divide-y divide-border/40">
          {list.map((r: any) => (
            <div key={r.name} className="px-3.5 py-1.5 flex items-center gap-3">
              <div className={clsx(
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                r.status === 'online' && r.busy ? 'bg-nvidia' :
                r.status === 'online' ? 'bg-nvidia' : 'bg-gray-600',
              )} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 truncate">{r.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>{r.os}</span>
                  {r.labels.slice(0, 2).map((l: string) => (
                    <span key={l} className="bg-surface-3 px-1 rounded">{l}</span>
                  ))}
                </div>
              </div>
              <span className={clsx(
                'text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0',
                r.busy ? 'bg-[#76b900]/[.07] text-nvidia ring-1 ring-[#76b900]/25' :
                r.status === 'online' ? 'bg-[#76b900]/[.07] text-nvidia ring-1 ring-[#76b900]/25' : 'bg-surface-3 text-gray-500',
              )}>
                {r.busy ? 'busy' : r.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-4 text-xs text-gray-400 text-center">
          {accessDenied
            ? <><span className="text-gray-500">PAT lacks <code className="text-[10px] bg-surface-3 px-1 rounded">manage_runners:repo</code> scope</span><p className="mt-1 text-gray-400">Visit Infra page for job-history runner data.</p></>
            : <><span>No self-hosted runners registered.</span><p className="text-[10px] mt-1 text-gray-400">GitHub-hosted runners are used.</p></>
          }
        </div>
      )}

      <div
        className="px-3.5 py-1.5 border-t border-border text-[10px] text-gray-400 hover:text-neutral-200 cursor-pointer transition-colors"
        onClick={() => nav('/infra')}
      >
        View infra →
      </div>
    </div>
  )
}

// ── Repo card ─────────────────────────────────────────────────────────────────

function RepoCard({ repo }: { repo: any }) {
  if (!repo?.name) return null
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-white">Repository</span>
        <a href={`https://github.com/${repo.name}`} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-neutral-200">
          <ExternalLink size={12} />
        </a>
      </div>
      <p className="text-sm font-medium text-white mb-3">{repo.name}</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Star, label: 'Stars', val: repo.stars?.toLocaleString() },
          { icon: GitFork, label: 'Forks', val: repo.forks?.toLocaleString() },
          { icon: AlertCircle, label: 'Issues', val: repo.open_issues?.toLocaleString() },
        ].map(({ icon: Icon, label, val }) => (
          <div key={label} className="bg-surface-2 rounded-lg p-2 text-center">
            <Icon size={11} className="mx-auto text-gray-500 mb-1" />
            <p className="text-sm font-semibold text-white">{val ?? '—'}</p>
            <p className="text-[9px] text-gray-400">{label}</p>
          </div>
        ))}
      </div>
      {repo.updated_at && (
        <p className="text-[10px] text-gray-400 mt-2">
          Updated {formatDistanceToNow(new Date(repo.updated_at), { addSuffix: true })}
        </p>
      )}
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ items }: { items: any[] }) {
  if (!items?.length) return null
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4">
      <div className="section-head">
        <Activity size={13} className="text-neutral-400 flex-shrink-0" />
        Recent Activity
      </div>
      <div className="space-y-0">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
            <span className={clsx(
              'text-[9px] px-1.5 py-0.5 rounded font-medium uppercase flex-shrink-0',
              'bg-surface-2 text-neutral-500 ring-1 ring-border'
            )}>
              {item.type}
            </span>
            <StatusBadge status={item.status} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-300 truncate">{item.title}</p>
              {item.branch && <p className="text-[10px] text-neutral-500 font-mono truncate">{item.branch}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {item.at && (
                <span className="text-[10px] text-gray-400">
                  {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                </span>
              )}
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={10} className="text-gray-400 hover:text-neutral-200" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Overview() {
  const nav = useNavigate()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['overview'],
    queryFn: getOverviewSummary,
    refetchInterval: 60_000,
  })
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''

  const prs = data?.prs
  const builds = data?.builds
  const nightly = data?.nightly
  const runners = data?.runners
  const repo = data?.repo
  const isCritical = (nightly?.consecutive_failures ?? 0) >= 3
  const buildHealthy = (builds?.success_rate_last10 ?? 100) >= 70

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap size={18} className="text-neutral-400" />
          <h1 className="text-lg font-semibold">Control Plane</h1>
          <span className="text-[10px] text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
            {repoSlug}
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-gray-500 text-sm">Loading dashboard…</div>
      )}

      {!isLoading && isError && (
        <div className="text-center py-12 text-[12px] text-gray-500">
          Dashboard data unavailable —{' '}
          <button onClick={() => refetch()} className="text-neutral-300 hover:underline">retry</button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Alert banners */}
          {isCritical && (
            <div className="flex items-center gap-3 bg-red-500/[.06] ring-1 ring-red-500/20 rounded-xl px-4 py-3">
              <AlertTriangle size={14} className="text-accent-red flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-accent-red">
                  Nightly CI in critical state — {nightly.consecutive_failures} consecutive failures
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Last run: {nightly.last_date} · {nightly.failed_jobs?.length ?? 0} jobs failing
                </p>
              </div>
              <button
                onClick={() => nav('/nightly')}
                className="ml-auto text-xs text-accent-red border border-red-800 px-2.5 py-1 rounded hover:bg-red-900 transition-colors flex-shrink-0"
              >
                Investigate →
              </button>
            </div>
          )}
          {!buildHealthy && builds?.recent_failures?.length > 0 && (
            <div className="flex items-center gap-3 bg-accent-yellow/[.05] border border-accent-yellow/20 rounded-xl px-4 py-2.5">
              <XCircle size={13} className="text-accent-yellow flex-shrink-0" />
              <p className="text-xs text-neutral-300">
                Build success rate: <span className="font-semibold">{builds.success_rate_last10}%</span> (last 10 runs) ·{' '}
                {builds.recent_failures.length} recent failure{builds.recent_failures.length > 1 ? 's' : ''}
              </p>
              <button
                onClick={() => nav('/builds')}
                className="ml-auto text-xs text-accent-yellow border border-accent-yellow/30 px-2.5 py-1 rounded hover:bg-accent-yellow/10 transition-colors flex-shrink-0"
              >
                View builds →
              </button>
            </div>
          )}

          {/* Main grid: PRs + Builds side-by-side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <PRPanel prs={prs} />
            <BuildPanel builds={builds} />
          </div>

          {/* Nightly + Runners */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <NightlyPanel nightly={nightly} />
            <RunnersPanel runners={runners} />
          </div>

          {/* Repo + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <RepoCard repo={repo} />
            <div className="lg:col-span-2">
              <ActivityFeed items={data?.recent_activity ?? []} />
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-surface-1 border border-border rounded-xl p-4">
            <div className="section-head">
              <Zap size={13} className="text-neutral-400 flex-shrink-0" />
              Quick Actions
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'PR Hub', path: '/prs' },
                { label: 'Builds', path: '/builds' },
                { label: 'Nightly', path: '/nightly' },
                { label: 'Analytics', path: '/analytics' },
                { label: 'Logs', path: '/logs' },
                { label: 'Infra', path: '/infra' },
                { label: 'Registry', path: '/registry' },
              ].map(({ label, path }) => (
                <button
                  key={label}
                  onClick={() => nav(path)}
                  className="px-3 py-1.5 rounded border border-border text-xs text-neutral-400 bg-surface-2 hover:bg-surface-3 hover:text-neutral-200 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
