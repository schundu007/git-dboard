import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard, ExternalLink, GitFork, Star, AlertCircle,
  GitPullRequest, Users, GitBranch, Building2, Globe,
} from 'lucide-react'
import { getActiveRepo, getOverviewSummary, getInsightsContributors } from '../lib/api'
import { cn } from '../lib/cn'

function DashboardChip() {
  return (
    <Link
      to="/dashboard"
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
        'bg-surface-2 border border-border text-[12px] font-medium text-neutral-300',
        'hover:border-nvidia/50 hover:text-white hover:bg-surface-3 transition-all',
      )}
    >
      <LayoutDashboard size={12} className="text-nvidia" />
      Dashboard
    </Link>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number | undefined }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-xl border border-border bg-surface-1">
      <div className="flex items-center gap-1.5 text-neutral-500">
        <Icon size={12} />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="text-[22px] font-bold text-white leading-none tabular-nums">
        {value ?? <span className="text-[14px] text-neutral-600">—</span>}
      </p>
    </div>
  )
}

function ContributorRow({ login, contributions, avatar_url }: { login: string; contributions: number; avatar_url?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <img
        src={avatar_url ?? `https://github.com/${login}.png?size=32`}
        alt={login}
        className="w-7 h-7 rounded-full bg-surface-3 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-white truncate">{login}</p>
      </div>
      <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
        {contributions.toLocaleString()} commits
      </span>
      <a
        href={`https://github.com/${login}`}
        target="_blank"
        rel="noreferrer"
        className="text-neutral-600 hover:text-neutral-300 transition-colors"
      >
        <ExternalLink size={11} />
      </a>
    </div>
  )
}

export default function Profile() {
  const { data: activeData } = useQuery({
    queryKey: ['active-repo'],
    queryFn: getActiveRepo,
    staleTime: 30_000,
  })

  const { data: overview } = useQuery({
    queryKey: ['overview-summary'],
    queryFn: getOverviewSummary,
    staleTime: 60_000,
  })

  const { data: contributorsData } = useQuery({
    queryKey: ['insights-contributors'],
    queryFn: getInsightsContributors,
    staleTime: 120_000,
  })

  const repo = activeData?.active
  const owner = repo?.owner ?? repo?.slug?.split('/')?.[0] ?? ''
  const repoName = repo?.repo ?? repo?.slug?.split('/')?.[1] ?? ''
  const slug = repo?.slug ?? (owner && repoName ? `${owner}/${repoName}` : '')

  const contributors: any[] = contributorsData?.contributors ?? contributorsData ?? []
  const topContributors = Array.isArray(contributors) ? contributors.slice(0, 8) : []

  const stats = overview?.repo ?? {}

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <DashboardChip />
        <span className="text-neutral-600 text-[12px]">/</span>
        <span className="text-[12px] text-neutral-400">Profile</span>
      </div>

      {/* Hero */}
      <div className="flex items-start gap-5 p-5 rounded-xl border border-border bg-surface-1">
        <img
          src={`https://github.com/${owner}.png?size=96`}
          alt={owner}
          className="w-[72px] h-[72px] rounded-xl bg-surface-3 flex-shrink-0 ring-1 ring-border"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[20px] font-bold text-white leading-none">{repoName || 'Select a repo'}</h1>
            {slug && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-border text-neutral-500">
                {slug}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {owner && (
              <span className="flex items-center gap-1 text-[12px] text-neutral-400">
                <Building2 size={11} />
                {owner}
              </span>
            )}
            {slug && (
              <a
                href={`https://github.com/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[12px] text-neutral-400 hover:text-nvidia transition-colors"
              >
                <Globe size={11} />
                github.com/{slug}
                <ExternalLink size={9} />
              </a>
            )}
          </div>
          {!slug && (
            <p className="text-[12px] text-neutral-500 mt-2">
              No repository active. Add one via the sidebar repo switcher.
            </p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Star}          label="Stars"      value={stats.stargazers_count ?? overview?.stars} />
        <StatCard icon={GitFork}       label="Forks"      value={stats.forks_count ?? overview?.forks} />
        <StatCard icon={AlertCircle}   label="Open Issues" value={stats.open_issues_count ?? overview?.open_issues} />
        <StatCard icon={GitPullRequest} label="Open PRs"  value={overview?.open_prs} />
      </div>

      {/* Repo details */}
      {(stats.default_branch || stats.language || stats.visibility) && (
        <div className="flex flex-wrap gap-2">
          {stats.default_branch && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-[11px] text-neutral-400">
              <GitBranch size={10} />
              {stats.default_branch}
            </span>
          )}
          {stats.language && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-[11px] text-neutral-400">
              {stats.language}
            </span>
          )}
          {stats.visibility && (
            <span className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px]',
              stats.visibility === 'public'
                ? 'bg-nvidia/[.06] border-nvidia/20 text-nvidia'
                : 'bg-surface-2 border-border text-neutral-400',
            )}>
              {stats.visibility}
            </span>
          )}
        </div>
      )}

      {/* Contributors */}
      <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Users size={13} className="text-neutral-400" />
          <h2 className="text-[13px] font-semibold text-white">Top Contributors</h2>
        </div>
        <div className="divide-y divide-border px-4">
          {topContributors.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-neutral-500">
              {slug ? 'No contributor data — backend may be offline' : 'Connect a repository to see contributors'}
            </p>
          ) : (
            topContributors.map((c: any) => (
              <ContributorRow
                key={c.login}
                login={c.login}
                contributions={c.contributions ?? c.total ?? 0}
                avatar_url={c.avatar_url}
              />
            ))
          )}
        </div>
      </div>

      {/* Back to dashboard — bottom chip */}
      <div className="flex justify-center pb-2">
        <Link
          to="/dashboard"
          className={cn(
            'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl',
            'bg-nvidia/10 border border-nvidia/25 text-nvidia text-[13px] font-semibold',
            'hover:bg-nvidia/20 hover:border-nvidia/40 transition-all',
          )}
        >
          <LayoutDashboard size={14} />
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
