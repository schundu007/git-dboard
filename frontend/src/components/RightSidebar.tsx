import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Star, GitFork, Eye, AlertCircle, GitPullRequest,
  Play, Moon, Activity, Zap, GitCommit, TrendingUp,
} from 'lucide-react'
import {
  getInsightsPulse, getActiveRepo, triggerBuild, triggerNightly,
  getPRStats, getBuildStats,
} from '../lib/api'
import { useCountUp } from '../hooks/useCountUp'

export default function RightSidebar() {
  const navigate = useNavigate()

  const { data: pulse } = useQuery({
    queryKey: ['insights-pulse'],
    queryFn: getInsightsPulse,
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  const { data: active } = useQuery({
    queryKey: ['active-repo'],
    queryFn: getActiveRepo,
    staleTime: 30_000,
  })

  const { data: prStats } = useQuery({
    queryKey: ['pr-stats'],
    queryFn: getPRStats,
    staleTime: 60_000,
  })

  const { data: buildStats } = useQuery({
    queryKey: ['build-stats-sidebar'],
    queryFn: () => getBuildStats('', 7),
    staleTime: 60_000,
  })

  const buildMutation = useMutation({
    mutationFn: () => triggerBuild('main'),
    onSuccess: () => toast.success('Build triggered on main'),
    onError: () => toast.error('Failed to trigger build'),
  })

  const nightlyMutation = useMutation({
    mutationFn: () => triggerNightly('main'),
    onSuccess: () => toast.success('Nightly run triggered'),
    onError: () => toast.error('Failed to trigger nightly'),
  })

  const repo = active?.active

  return (
    <aside className="w-[200px] flex-shrink-0 flex flex-col border-l border-border bg-surface-1 overflow-y-auto">

      {/* Active repo */}
      <div className="px-3 pt-4 pb-3">
        <p className="section-title mb-2.5">Active Repo</p>
        {repo ? (
          <div>
            <p className="text-xs font-semibold text-white truncate">{repo.repo}</p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">{repo.owner}</p>
            {pulse?.language && (
              <span className="inline-block mt-1.5 text-[9px] bg-surface-3 border border-border px-1.5 py-0.5 rounded text-gray-400">
                {pulse.language}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-gray-400">No repo active</p>
        )}
      </div>

      <Divider />

      {/* Repo stats */}
      <div className="px-3 py-3">
        <p className="section-title mb-2.5">Repo Stats</p>
        <div className="space-y-2">
          <StatRow icon={<Star size={11} />} label="Stars"       value={pulse?.stars} />
          <StatRow icon={<GitFork size={11} />} label="Forks"    value={pulse?.forks} />
          <StatRow icon={<Eye size={11} />} label="Watchers"     value={pulse?.watchers} />
          <StatRow icon={<AlertCircle size={11} />} label="Open Issues" value={pulse?.open_issues} accent="red" />
          <StatRow icon={<GitCommit size={11} />} label="Commits (4w)"  value={pulse?.recent_commits} accent="green" />
          <StatRow icon={<TrendingUp size={11} />} label="Issues closed 30d" value={pulse?.closed_issues_30d} accent="green" />
        </div>
      </div>

      <Divider />

      {/* Pipeline stats */}
      <div className="px-3 py-3">
        <p className="section-title mb-2.5">Pipeline · 7d</p>
        <div className="space-y-2">
          <StatRow icon={<Zap size={11} />} label="Runs"         value={buildStats?.total_count} accent="blue" />
          <StatRow icon={<Activity size={11} />} label="Success rate"
            value={buildStats?.success_rate != null ? Math.round(buildStats.success_rate) : undefined}
            suffix="%" accent={buildStats?.success_rate >= 80 ? 'green' : 'red'} />
          <StatRow icon={<GitPullRequest size={11} />} label="Open PRs" value={prStats?.open} accent="blue" />
          <StatRow icon={<GitPullRequest size={11} />} label="Merged PRs" value={prStats?.merged_30d} />
        </div>
      </div>

      <Divider />

      {/* Quick actions */}
      <div className="px-3 py-3">
        <p className="section-title mb-2.5">Quick Actions</p>
        <div className="space-y-1.5">
          <ActionBtn icon={<Play size={10} />} label="Trigger Build"  color="green" loading={buildMutation.isPending}  onClick={() => buildMutation.mutate()} />
          <ActionBtn icon={<Moon size={10} />} label="Run Nightly"    color="blue"  loading={nightlyMutation.isPending} onClick={() => nightlyMutation.mutate()} />
          <ActionBtn icon={<GitPullRequest size={10} />} label="Open PRs"       onClick={() => navigate('/prs')} />
          <ActionBtn icon={<AlertCircle size={10} />}   label="Issues"          onClick={() => navigate('/issues')} />
          <ActionBtn icon={<Zap size={10} />}           label="Build Pipeline"  onClick={() => navigate('/builds')} />
          <ActionBtn icon={<Activity size={10} />}      label="Health"          onClick={() => navigate('/health')} />
          <ActionBtn icon={<TrendingUp size={10} />}    label="Insights"        onClick={() => navigate('/insights')} />
        </div>
      </div>

      {pulse?.size_kb && (
        <p className="px-3 pb-3 text-[9px] text-gray-400">
          {(pulse.size_kb / 1024).toFixed(1)} MB repo size
        </p>
      )}
    </aside>
  )
}

function Divider() {
  return <div className="h-px bg-border mx-0 opacity-60" />
}

function StatRow({
  icon, label, value, suffix = '', accent,
}: {
  icon: React.ReactNode
  label: string
  value?: number
  suffix?: string
  accent?: 'green' | 'red' | 'blue'
}) {
  const counted = useCountUp(value ?? null)
  const valueCls = accent === 'green' ? 'text-accent-green bg-accent-green/10'
    : accent === 'red'   ? 'text-accent-red bg-accent-red/10'
    : accent === 'blue'  ? 'text-accent-blue bg-accent-blue/10'
    : 'text-gray-400 bg-surface-3'
  return (
    <div className="flex items-center justify-between gap-1 py-0.5">
      <div className="flex items-center gap-1.5 min-w-0 text-gray-500">
        <span className="opacity-60">{icon}</span>
        <span className="text-[10px] truncate">{label}</span>
      </div>
      {value != null ? (
        <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${valueCls}`}>
          {counted.toLocaleString()}{suffix}
        </span>
      ) : (
        <span className="text-[10px] text-gray-400">—</span>
      )}
    </div>
  )
}

function ActionBtn({
  icon, label, color, loading, onClick,
}: {
  icon: React.ReactNode
  label: string
  color?: 'green' | 'blue' | 'red'
  loading?: boolean
  onClick: () => void
}) {
  const map = {
    green: { wrap: 'text-accent-green border-accent-green/20 hover:bg-accent-green/10', chip: 'bg-accent-green/12' },
    blue:  { wrap: 'text-accent-blue  border-accent-blue/20  hover:bg-accent-blue/10',  chip: 'bg-accent-blue/12'  },
    red:   { wrap: 'text-accent-red   border-accent-red/20   hover:bg-accent-red/10',   chip: 'bg-accent-red/12'   },
  }
  const s = color ? map[color] : { wrap: 'text-gray-400 border-border hover:bg-surface-2', chip: 'bg-surface-3' }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-[11px] font-medium transition-all hover:translate-y-[-1px] hover:shadow-sm disabled:opacity-40 cursor-pointer ${s.wrap}`}
    >
      <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${s.chip}`}>
        {loading
          ? <span className="w-[9px] h-[9px] border border-current border-t-transparent rounded-full animate-spin" />
          : icon
        }
      </span>
      {label}
    </button>
  )
}
