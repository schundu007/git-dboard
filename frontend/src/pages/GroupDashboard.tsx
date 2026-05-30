import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getGroupSummary } from '../lib/api'
import {
  GitPullRequest, CheckCircle2, XCircle, Clock, Moon,
  ChevronRight, Loader2, AlertTriangle, ExternalLink,
} from 'lucide-react'
import { cn } from '../lib/cn'

function StatusDot({ status }: { status: string | null }) {
  if (!status) return <span className="w-2 h-2 rounded-full bg-surface-3 border border-border" />
  if (status === 'success') return <span className="w-2 h-2 rounded-full bg-accent-green" />
  if (status === 'failure' || status === 'timed_out') return <span className="w-2 h-2 rounded-full bg-accent-red" />
  if (status === 'in_progress') return <span className="w-2 h-2 rounded-full bg-nvidia animate-pulse" />
  return <span className="w-2 h-2 rounded-full bg-yellow-500" />
}

function StatusChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-[10px] text-gray-500">—</span>
  const map: Record<string, string> = {
    success: 'text-accent-green',
    failure: 'text-accent-red',
    timed_out: 'text-accent-red',
    in_progress: 'text-nvidia',
    cancelled: 'text-gray-400',
    skipped: 'text-gray-400',
  }
  return (
    <span className={cn('text-[11px] font-medium capitalize', map[status] ?? 'text-gray-400')}>
      {status.replace('_', ' ')}
    </span>
  )
}

function RateBar({ rate, color = 'nvidia' }: { rate: number | null; color?: string }) {
  if (rate === null) return <span className="text-[11px] text-gray-500">N/A</span>
  const cls = rate >= 80 ? 'bg-accent-green' : rate >= 60 ? 'bg-yellow-500' : 'bg-accent-red'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', cls)} style={{ width: `${rate}%` }} />
      </div>
      <span className={cn('text-[12px] font-semibold tabular-nums', rate >= 80 ? 'text-accent-green' : rate >= 60 ? 'text-yellow-400' : 'text-accent-red')}>
        {rate}%
      </span>
    </div>
  )
}

function AggregateStat({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: any; color: string
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4 flex items-start gap-3">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-400 font-medium">{label}</p>
        <p className="text-[22px] font-bold text-white leading-none mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function RepoCard({ r }: { r: any }) {
  const ghUrl = `https://github.com/${r.slug}`
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-3 hover:border-border/80 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-semibold text-white truncate">{r.repo}</p>
            <a href={ghUrl} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-300 flex-shrink-0">
              <ExternalLink size={10} />
            </a>
          </div>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">{r.owner}</p>
        </div>
        {r.language && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 border border-border text-gray-400 font-mono flex-shrink-0">
            {r.language}
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
        {/* Open PRs */}
        <div className="text-center">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Open PRs</p>
          <div className="flex items-center justify-center gap-1">
            <GitPullRequest size={10} className="text-gray-400" />
            <span className="text-[15px] font-bold text-white tabular-nums">{r.open_prs}</span>
          </div>
        </div>

        {/* CI health */}
        <div className="text-center">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">CI</p>
          <div className="flex items-center justify-center gap-1">
            <StatusDot status={r.last_ci_status} />
            <span className="text-[12px] font-semibold text-white tabular-nums">
              {r.ci_rate !== null ? `${r.ci_rate}%` : '—'}
            </span>
          </div>
        </div>

        {/* Nightly */}
        <div className="text-center">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Nightly</p>
          <div className="flex items-center justify-center gap-1">
            <Moon size={10} className={cn(
              r.nightly_status === 'success' ? 'text-accent-green' :
              r.nightly_status === 'failure' ? 'text-accent-red' : 'text-gray-500'
            )} />
            <StatusChip status={r.nightly_status} />
          </div>
        </div>
      </div>

      {/* CI pass rate bar */}
      {r.ci_rate !== null && (
        <div className="pt-1">
          <RateBar rate={r.ci_rate} />
        </div>
      )}
    </div>
  )
}

export default function GroupDashboard() {
  const { slug } = useParams<{ slug: string }>()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['group-summary', slug],
    queryFn: () => getGroupSummary(slug!),
    enabled: !!slug,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-[13px]">Loading group data…</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <AlertTriangle size={20} className="text-accent-red" />
        <p className="text-[13px] text-white font-semibold">Failed to load group</p>
        <p className="text-[11px] text-gray-400 font-mono">{(error as Error).message}</p>
        <Link to="/settings" className="text-[11px] text-nvidia hover:underline mt-1">
          Check Settings →
        </Link>
      </div>
    )
  }

  const group = data?.group ?? {}
  const agg = data?.aggregate ?? {}
  const repos: any[] = data?.repos ?? []

  const nightlyHealth = agg.nightly_pass_rate !== null && agg.nightly_pass_rate !== undefined
    ? agg.nightly_pass_rate >= 80 ? 'Healthy' : agg.nightly_pass_rate >= 50 ? 'Degraded' : 'Critical'
    : null

  return (
    <div className="space-y-6">
      {/* Header breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-gray-500">
        <Link to="/groups" className="hover:text-gray-300 transition-colors">Business Units</Link>
        <ChevronRight size={12} />
        <span className="text-white font-semibold">{group.name}</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border">
          {group.repo_count} {group.repo_count === 1 ? 'repo' : 'repos'}
        </span>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AggregateStat
          label="Open PRs"
          value={agg.total_open_prs ?? 0}
          sub="across all repos"
          icon={GitPullRequest}
          color="bg-blue-500/10 text-blue-400"
        />
        <AggregateStat
          label="CI Pass Rate"
          value={agg.ci_pass_rate !== null && agg.ci_pass_rate !== undefined ? `${agg.ci_pass_rate}%` : '—'}
          sub="avg across repos"
          icon={CheckCircle2}
          color={agg.ci_pass_rate >= 80 ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}
        />
        <AggregateStat
          label="Nightly Health"
          value={agg.nightly_pass_rate !== null && agg.nightly_pass_rate !== undefined ? `${agg.nightly_pass_rate}%` : '—'}
          sub={agg.repos_with_nightly ? `${agg.repos_with_nightly} repos tracked` : 'no nightly data'}
          icon={Moon}
          color={agg.nightly_pass_rate >= 80 ? 'bg-accent-green/10 text-accent-green' : 'bg-yellow-500/10 text-yellow-400'}
        />
        <AggregateStat
          label="Status"
          value={nightlyHealth ?? '—'}
          sub={agg.nightly_pass_rate !== null ? `${agg.nightly_pass_rate}% nightly pass` : 'awaiting data'}
          icon={Clock}
          color="bg-surface-2 text-gray-400"
        />
      </div>

      {/* Per-repo grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-white">Repositories</h2>
          <span className="text-[11px] text-gray-500">{repos.length} repos in {group.name}</span>
        </div>
        {repos.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-1 p-8 text-center">
            <p className="text-[13px] text-gray-400">No repos in this group.</p>
            <Link to="/settings" className="mt-2 inline-block text-[11px] text-nvidia hover:underline">
              Assign repos in Settings →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {repos.map((r: any) => <RepoCard key={r.slug} r={r} />)}
          </div>
        )}
      </div>

      {/* Settings hint */}
      <p className="text-[11px] text-gray-500 text-center">
        Assign more repos to this group in{' '}
        <Link to="/settings" className="text-nvidia hover:underline">Settings → Repositories</Link>
      </p>
    </div>
  )
}
