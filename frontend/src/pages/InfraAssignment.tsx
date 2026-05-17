import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Server, RefreshCw, XCircle, Terminal, Cpu, Wifi,
  WifiOff, Clock, Search, ChevronDown, ChevronRight, ExternalLink,
  GitPullRequest, CheckCircle, AlertTriangle, Zap, Activity, Play,
} from 'lucide-react'
import {
  getRunners, getClusterQueue, getClusterNodes, cancelJob, getJobOutput, getInfraStatus, getActiveRunners,
  getRunnerRecommendations, getLiveRuns,
} from '../lib/api'
import type { Runner, ClusterJob, ClusterNode } from '../lib/types'
import clsx from 'clsx'

// ── Runner card ───────────────────────────────────────────────────────────────

function RunnerCard({ runner }: { runner: Runner }) {
  const isOnline = runner.status === 'online'
  const isBusy = isOnline && runner.busy
  const statusLabel = !isOnline ? 'offline' : isBusy ? 'busy' : 'idle'
  const statusClass = !isOnline
    ? 'bg-gray-800 text-gray-500'
    : isBusy
    ? 'bg-amber-500/[.07] text-amber-400 ring-1 ring-amber-500/25'
    : 'bg-emerald-500/[.07] text-emerald-400 ring-1 ring-emerald-500/25'
  const dotClass = !isOnline ? 'bg-gray-600' : isBusy ? 'bg-yellow-400' : 'bg-accent-green'

  const systemLabels = runner.labels.filter((l) => l.type === 'system').map((l) => l.name)
  const customLabels = runner.labels.filter((l) => l.type !== 'system').map((l) => l.name)

  return (
    <div className={clsx(
      'bg-surface-1 border rounded-lg p-3 space-y-2 transition-colors',
      !isOnline ? 'border-border opacity-60' : isBusy ? 'border-yellow-900/40' : 'border-green-900/30',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-white font-medium truncate" title={runner.name}>{runner.name}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{runner.os}</p>
        </div>
        <span className={clsx('flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full flex-shrink-0', statusClass)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', dotClass, isOnline && !isBusy && 'animate-pulse')} />
          {statusLabel}
        </span>
      </div>

      {customLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {customLabels.map((l) => (
            <span key={l} className="bg-blue-500/[.07] text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-mono">
              {l}
            </span>
          ))}
        </div>
      )}

      {systemLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {systemLabels.slice(0, 4).map((l) => (
            <span key={l} className="bg-surface-2 text-gray-500 px-1.5 py-0.5 rounded text-[9px]">
              {l}
            </span>
          ))}
          {systemLabels.length > 4 && (
            <span className="text-gray-400 text-[9px]">+{systemLabels.length - 4}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Cluster node card ─────────────────────────────────────────────────────────

function NodeCard({ node }: { node: ClusterNode }) {
  const s = node.state.toLowerCase()
  const isIdle = s.includes('idle')
  const isAlloc = s.includes('alloc') || s.includes('mix')
  const isDown = s.includes('down') || s.includes('drain')

  const stateClass = isDown
    ? 'text-red-400 bg-red-500/[.07] ring-1 ring-red-500/25'
    : isAlloc
    ? 'text-amber-400 bg-amber-500/[.07] ring-1 ring-amber-500/25'
    : isIdle
    ? 'text-emerald-400 bg-emerald-500/[.07] ring-1 ring-emerald-500/25'
    : 'text-gray-400 bg-gray-800'

  const gpuMatch = node.gres?.match(/gpu[^:]*:([^:]+):(\d+)/i)
  const gpuModel = gpuMatch?.[1]
  const gpuCount = gpuMatch?.[2]

  return (
    <div className={clsx(
      'bg-surface-1 border rounded-lg p-3 space-y-2',
      isDown ? 'border-red-900/30 opacity-60' : 'border-border',
    )}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-white font-mono truncate" title={node.name}>{node.name}</span>
        <span className={clsx('text-[9px] px-1.5 py-0.5 rounded flex-shrink-0', stateClass)}>
          {node.state}
        </span>
      </div>
      <div className="text-[10px] text-gray-500 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Cpu size={9} className="flex-shrink-0" />
          <span>{node.cpus} CPUs</span>
          {node.memory_mb && (
            <span className="text-gray-400">· {Math.round(Number(node.memory_mb) / 1024)} GB</span>
          )}
        </div>
        {gpuModel && (
          <div className="flex items-center gap-1 text-accent-purple">
            <span className="font-semibold">{gpuCount}×</span>
            <span>{gpuModel}</span>
          </div>
        )}
        <div className="text-gray-400">{node.partition}</div>
      </div>
    </div>
  )
}

// ── Cluster job row ───────────────────────────────────────────────────────────

function ClusterJobRow({
  job, onCancel, onViewOutput,
}: {
  job: ClusterJob; onCancel: (j: ClusterJob) => void; onViewOutput: (j: ClusterJob) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const s = job.state
  const isRunning = s === 'RUNNING' || s === 'R'
  const isPending = s === 'PENDING' || s === 'PD' || s === 'Q'

  const stateClass = isRunning
    ? 'text-emerald-400 bg-emerald-500/[.07] ring-1 ring-emerald-500/25'
    : isPending
    ? 'text-amber-400 bg-amber-500/[.07] ring-1 ring-amber-500/25'
    : 'text-gray-400 bg-gray-800'

  return (
    <tr className="border-b border-border/30 hover:bg-surface-2/40 text-xs transition-colors">
      <td className="px-3 py-2 font-mono text-gray-400">{job.job_id}</td>
      <td className="px-3 py-2 text-white max-w-[160px]">
        <span className="truncate block" title={job.name}>{job.name}</span>
      </td>
      <td className="px-3 py-2 text-gray-400">{job.user}</td>
      <td className="px-3 py-2">
        <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-semibold', stateClass)}>
          {job.state}
        </span>
      </td>
      <td className="px-3 py-2 text-gray-400">{job.partition}</td>
      <td className="px-3 py-2 text-gray-500 font-mono whitespace-nowrap">
        {job.time} / {job.time_limit}
      </td>
      <td className="px-3 py-2 text-gray-400 text-[10px] max-w-[120px]">
        {isPending && job.reason && (
          <span className="truncate block" title={job.reason}>{job.reason}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewOutput(job)}
            className="p-1 rounded hover:bg-surface-2 text-gray-500 hover:text-accent-blue transition-colors"
            title="View output"
          >
            <Terminal size={11} />
          </button>
          {confirming ? (
            <button
              onClick={() => { onCancel(job); setConfirming(false) }}
              className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/[.07] text-red-400 ring-1 ring-red-500/25 hover:bg-accent-red/10 transition-colors"
              onBlur={() => setConfirming(false)}
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="p-1 rounded hover:bg-surface-2 text-gray-500 hover:text-red-400 transition-colors"
              title="Cancel job"
            >
              <XCircle size={11} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Output modal ──────────────────────────────────────────────────────────────

function OutputModal({ jobId, output, onClose }: { jobId: string; output: string; onClose: () => void }) {
  const lines = output.split('\n')
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl bg-surface-1 border border-border rounded-xl flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border card-head flex-shrink-0">
          <div>
            <span className="text-sm font-medium text-white">Job output</span>
            <span className="ml-2 font-mono text-xs text-gray-500">{jobId}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto bg-surface rounded-b-xl">
          {output ? (
            <table className="w-full font-mono text-xs">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-surface-2/30">
                    <td className="pl-3 pr-2 py-0.5 text-gray-400 text-right select-none w-10 tabular-nums">
                      {i + 1}
                    </td>
                    <td className="pr-4 py-0.5 text-gray-300 whitespace-pre-wrap break-all">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">No output available.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-lg px-4 py-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={clsx('text-xl font-semibold mt-1 tabular-nums', accent ?? 'text-white')}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InfraAssignment() {
  const [scheduler, setScheduler] = useState<'slurm' | 'pbs'>('slurm')
  const [queueSearch, setQueueSearch] = useState('')
  const [queueStateFilter, setQueueStateFilter] = useState('')
  const [outputModal, setOutputModal] = useState<{ jobId: string; output: string } | null>(null)
  const [nodesCollapsed, setNodesCollapsed] = useState(false)
  const qc = useQueryClient()

  const { data: statusData } = useQuery({
    queryKey: ['infra-status'],
    queryFn: getInfraStatus,
    refetchInterval: 30_000,
  })

  const { data: runnersData, isLoading: runnersLoading } = useQuery({
    queryKey: ['runners'],
    queryFn: getRunners,
    refetchInterval: 30_000,
  })

  const { data: activeRunnersData } = useQuery({
    queryKey: ['active-runners-infra'],
    queryFn: getActiveRunners,
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  const { data: queueData, isLoading: queueLoading, isError: queueError } = useQuery({
    queryKey: ['cluster-queue', scheduler],
    queryFn: () => getClusterQueue(scheduler),
    refetchInterval: 30_000,
  })

  const { data: nodesData } = useQuery({
    queryKey: ['cluster-nodes'],
    queryFn: getClusterNodes,
    refetchInterval: 60_000,
  })

  const { data: liveRunsData, isLoading: liveRunsLoading } = useQuery({
    queryKey: ['infra-live-runs'],
    queryFn: getLiveRuns,
    refetchInterval: 30_000,
  })

  const { mutate: cancel } = useMutation({
    mutationFn: (j: ClusterJob) => cancelJob(j.job_id, j.scheduler),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cluster-queue'] }),
  })

  const handleViewOutput = async (j: ClusterJob) => {
    const data = await getJobOutput(j.job_id)
    setOutputModal({ jobId: j.job_id, output: data.output ?? '' })
  }

  const runners: Runner[] = runnersData?.runners ?? []
  const historyRunners: any[] = activeRunnersData?.runners ?? []
  const useHistoryFallback = runners.length === 0 && historyRunners.length > 0
  const liveRuns: any[] = liveRunsData?.runs ?? []
  const allJobs: ClusterJob[] = queueData?.jobs ?? []
  const nodes: ClusterNode[] = nodesData?.nodes ?? []

  // Runner stats — prefer live API, fall back to job-history data
  const onlineRunners = runners.filter((r) => r.status === 'online')
  const busyRunners = onlineRunners.filter((r) => r.busy)
  const offlineRunners = runners.filter((r) => r.status !== 'online')

  // Derived stats from history runners when live API unavailable
  const historyOnline = historyRunners.length
  const historyBusy = historyRunners.filter((r: any) => r.busy).length

  const displayOnline = runners.length > 0 ? onlineRunners.length : historyOnline
  const displayTotal = runners.length > 0 ? runners.length : historyOnline
  const displayBusy = runners.length > 0 ? busyRunners.length : historyBusy

  // Job stats & filtering
  const runningJobs = allJobs.filter((j) => j.state === 'RUNNING' || j.state === 'R')
  const pendingJobs = allJobs.filter((j) => j.state === 'PENDING' || j.state === 'PD' || j.state === 'Q')

  const filteredJobs = useMemo(() => {
    let list = allJobs
    if (queueStateFilter) {
      const isRunningFilter = queueStateFilter === 'running'
      list = isRunningFilter
        ? list.filter((j) => j.state === 'RUNNING' || j.state === 'R')
        : list.filter((j) => j.state === 'PENDING' || j.state === 'PD' || j.state === 'Q')
    }
    if (queueSearch) {
      const q = queueSearch.toLowerCase()
      list = list.filter((j) => j.name.toLowerCase().includes(q) || j.user.toLowerCase().includes(q) || j.job_id.includes(q))
    }
    return list
  }, [allJobs, queueStateFilter, queueSearch])

  // Nodes grouped by partition
  const nodesByPartition = useMemo(() => {
    const map = new Map<string, ClusterNode[]>()
    nodes.forEach((n) => {
      if (!map.has(n.partition)) map.set(n.partition, [])
      map.get(n.partition)!.push(n)
    })
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [nodes])

  const clusterConnected = statusData?.cluster === 'connected'
  const clusterLabel = statusData?.cluster ?? '…'

  // When cluster not configured, use live GH Actions runs as job proxy
  const liveJobCount = liveRuns.reduce((acc, r) => acc + (r.active_jobs?.length ?? 0), 0)
  const displayRunning = clusterConnected ? runningJobs.length : liveRuns.length
  const displayPending = pendingJobs.length

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['runners'] })
    qc.invalidateQueries({ queryKey: ['cluster-queue', scheduler] })
    qc.invalidateQueries({ queryKey: ['cluster-nodes'] })
    qc.invalidateQueries({ queryKey: ['infra-status'] })
    qc.invalidateQueries({ queryKey: ['infra-live-runs'] })
    qc.invalidateQueries({ queryKey: ['active-runners-infra'] })
  }

  return (
    <div className="space-y-5">
      {outputModal && (
        <OutputModal
          jobId={outputModal.jobId}
          output={outputModal.output}
          onClose={() => setOutputModal(null)}
        />
      )}

      {/* Refresh */}
      <div className="flex justify-end">
        <button onClick={refresh} className="p-1.5 rounded hover:bg-surface-2 text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Runners online"
          value={`${displayOnline} / ${displayTotal}`}
          sub={displayBusy > 0 ? `${displayBusy} busy` : 'all idle'}
          accent={displayOnline > 0 ? 'text-accent-green' : 'text-gray-500'}
        />
        <StatCard
          label="Runners busy"
          value={displayBusy}
          sub={`${displayOnline - displayBusy} idle`}
          accent={displayBusy > 0 ? 'text-yellow-400' : 'text-gray-500'}
        />
        <StatCard
          label="Cluster"
          value={clusterLabel}
          sub={statusData?.cluster_host ?? ''}
          accent={clusterConnected ? 'text-accent-green' : 'text-gray-500'}
        />
        <StatCard
          label={clusterConnected ? 'Jobs running' : 'Workflows active'}
          value={displayRunning}
          sub={clusterConnected ? 'on cluster' : `${liveJobCount} jobs`}
          accent={displayRunning > 0 ? 'text-accent-blue' : 'text-gray-500'}
        />
        <StatCard
          label="Jobs pending"
          value={displayPending}
          sub="in queue"
          accent={displayPending > 0 ? 'text-yellow-400' : 'text-gray-500'}
        />
      </div>

      {/* Live CI Activity + Runner Analysis — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <LiveActivitySection runs={liveRuns} loading={liveRunsLoading} />
        <RunnerAnalysisSection runners={runners} />
      </div>

      {/* GitHub Runners */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-white">GitHub Runners</h2>
          <div className="flex items-center gap-2 text-[10px]">
            {onlineRunners.length > 0 && (
              <span className="text-accent-green flex items-center gap-1">
                <Wifi size={10} /> {onlineRunners.length} online
              </span>
            )}
            {offlineRunners.length > 0 && (
              <span className="text-gray-500 flex items-center gap-1">
                <WifiOff size={10} /> {offlineRunners.length} offline
              </span>
            )}
          </div>
        </div>

        {runnersLoading && <p className="text-gray-500 text-sm">Loading runners…</p>}

        {runners.length === 0 && !runnersLoading && !useHistoryFallback && (
          <p className="text-gray-400 text-sm">No self-hosted runners configured for this repo.</p>
        )}

        {useHistoryFallback && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
              Showing runners from recent job history — live status requires <span className="font-mono text-gray-500 ml-1">manage_runners:repo</span> PAT scope
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {historyRunners.map((r: any) => {
                const conclusionColor = r.last_conclusion === 'success'
                  ? 'text-accent-green' : r.last_conclusion === 'failure'
                  ? 'text-accent-red' : 'text-gray-500'
                return (
                  <div key={r.name} className="bg-surface-1 border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-white font-medium truncate" title={r.name}>{r.name}</p>
                      <span className={clsx('text-[9px] font-semibold flex-shrink-0', conclusionColor)}>
                        {r.last_conclusion || 'unknown'}
                      </span>
                    </div>
                    {r.labels?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {r.labels.filter((l: string) => !['self-hosted', 'linux', 'x64'].includes(l)).map((l: string) => (
                          <span key={l} className="bg-blue-500/[.07] text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-mono">{l}</span>
                        ))}
                      </div>
                    )}
                    <p className="text-[9px] text-gray-400 truncate">{r.last_job}</p>
                    {r.last_run_url && (
                      <a href={r.last_run_url} target="_blank" rel="noreferrer"
                        className="text-[9px] text-gray-400 hover:text-accent-blue flex items-center gap-1">
                        <ExternalLink size={9} /> {r.last_run_date}
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {runners.length > 0 && (
          <div className="space-y-3">
            {/* Online / busy */}
            {busyRunners.length > 0 && (
              <div className="space-y-2">
                <p className="text-[9px] text-yellow-500 uppercase tracking-wider font-semibold">Busy</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {busyRunners.map((r) => <RunnerCard key={r.id} runner={r} />)}
                </div>
              </div>
            )}

            {/* Online / idle */}
            {onlineRunners.filter((r) => !r.busy).length > 0 && (
              <div className="space-y-2">
                <p className="text-[9px] text-accent-green uppercase tracking-wider font-semibold">Idle</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {onlineRunners.filter((r) => !r.busy).map((r) => <RunnerCard key={r.id} runner={r} />)}
                </div>
              </div>
            )}

            {/* Offline */}
            {offlineRunners.length > 0 && (
              <div className="space-y-2">
                <p className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Offline</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {offlineRunners.map((r) => <RunnerCard key={r.id} runner={r} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cluster nodes */}
      {nodes.length > 0 && (
        <div className="space-y-3">
          <button
            className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors"
            onClick={() => setNodesCollapsed((v) => !v)}
          >
            {nodesCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            Cluster Nodes ({nodes.length})
          </button>

          {!nodesCollapsed && (
            <div className="space-y-4">
              {nodesByPartition.map(([partition, pnodes]) => {
                const idle = pnodes.filter((n) => n.state.toLowerCase().includes('idle')).length
                const alloc = pnodes.filter((n) => n.state.toLowerCase().includes('alloc') || n.state.toLowerCase().includes('mix')).length
                return (
                  <div key={partition} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-gray-400">{partition}</span>
                      <span className="text-[9px] text-gray-400">{pnodes.length} nodes</span>
                      {idle > 0 && <span className="text-[9px] text-accent-green">{idle} idle</span>}
                      {alloc > 0 && <span className="text-[9px] text-yellow-400">{alloc} busy</span>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {pnodes.map((n) => <NodeCard key={n.name} node={n} />)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Cluster queue */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-white">Cluster Queue</h2>

          {/* Scheduler toggle */}
          <div className="flex rounded overflow-hidden border border-border text-[10px]">
            {(['slurm', 'pbs'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScheduler(s)}
                className={clsx('px-2 py-0.5 transition-colors', scheduler === s ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          {/* State filter pills */}
          {!queueError && (
            <div className="flex items-center gap-1">
              {[['', 'All'], ['running', 'Running'], ['pending', 'Pending']].map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setQueueStateFilter(val)}
                  className={clsx(
                    'px-2 py-0.5 rounded text-[9px] font-medium transition-colors',
                    queueStateFilter === val ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  {lbl}
                  {val === 'running' && runningJobs.length > 0 && (
                    <span className="ml-1 text-accent-green">{runningJobs.length}</span>
                  )}
                  {val === 'pending' && pendingJobs.length > 0 && (
                    <span className="ml-1 text-yellow-400">{pendingJobs.length}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          {!queueError && allJobs.length > 0 && (
            <div className="relative ml-auto">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Search job / user…"
                className="bg-surface-2 border border-border rounded-md pl-5 pr-2 py-1 text-[10px] w-40 text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue"
              />
            </div>
          )}
        </div>

        {queueError && (
          <div className="bg-red-500/[.05] ring-1 ring-red-500/15 rounded-lg px-4 py-3 text-sm text-red-400">
            Cluster unreachable — check <code className="font-mono text-[11px]">CLUSTER_HOST</code> in .env
          </div>
        )}

        {!queueError && (
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-2/30">
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {['Job ID', 'Name', 'User', 'State', 'Partition', 'Time', 'Reason', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((j) => (
                  <ClusterJobRow
                    key={j.job_id}
                    job={j}
                    onCancel={cancel}
                    onViewOutput={handleViewOutput}
                  />
                ))}
              </tbody>
            </table>
            {!queueLoading && filteredJobs.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8 flex flex-col items-center gap-1">
                <Clock size={24} className="text-gray-400 mb-1" />
                {allJobs.length === 0 ? 'No jobs in queue.' : 'No jobs match the current filter.'}
              </div>
            )}
            {queueLoading && (
              <p className="text-center text-gray-500 text-sm py-6">Loading queue…</p>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Live CI Activity ──────────────────────────────────────────────────────────

function elapsed(iso: string): string {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function LiveActivitySection({ runs, loading }: { runs: any[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="section-head">
          <Activity size={12} className="flex-shrink-0" />Live CI Activity
        </div>
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (runs.length === 0) return null

  const selfHostedRuns = runs.filter((r) =>
    r.active_jobs?.some((j: any) => j.labels?.includes('self-hosted'))
  )
  const githubHostedRuns = runs.filter((r) =>
    !r.active_jobs?.some((j: any) => j.labels?.includes('self-hosted'))
  )

  return (
    <div className="space-y-3">
      <div className="section-head">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse flex-shrink-0" />
        Live CI Activity
        <span className="text-xs text-gray-500 font-normal ml-1">{runs.length} workflow{runs.length !== 1 ? 's' : ''} in progress</span>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="divide-y divide-border/40">
          {runs.map((run) => {
            const isSelfHosted = run.active_jobs?.some((j: any) => j.labels?.includes('self-hosted'))
            const gpuJobs = run.active_jobs?.filter((j: any) =>
              j.labels?.some((l: string) => l.toLowerCase().includes('gpu'))
            ) ?? []
            const runnerNames = [...new Set(
              run.active_jobs?.map((j: any) => j.runner_name).filter(Boolean) ?? []
            )] as string[]

            return (
              <div key={run.id} className="px-4 py-3 flex items-start gap-3">
                {/* Status dot */}
                <div className="mt-1 flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse block" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-medium text-white truncate">{run.name}</span>
                    {isSelfHosted && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/[.06] text-amber-400 ring-1 ring-amber-500/20 font-mono flex-shrink-0">
                        self-hosted
                      </span>
                    )}
                    {gpuJobs.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950/40 text-accent-purple border border-purple-900/30 font-mono flex-shrink-0">
                        GPU
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 font-mono ml-auto flex-shrink-0">
                      {elapsed(run.created_at)} ago
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {run.branch && (
                      <span className="text-[10px] text-gray-500 font-mono truncate">{run.branch}</span>
                    )}
                    {run.actor && (
                      <span className="text-[10px] text-gray-400">by {run.actor}</span>
                    )}
                    {run.active_jobs?.length > 0 && (
                      <span className="text-[10px] text-accent-blue">
                        <Play size={8} className="inline mr-0.5" />
                        {run.active_jobs.length} job{run.active_jobs.length !== 1 ? 's' : ''} running
                      </span>
                    )}
                  </div>

                  {runnerNames.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {runnerNames.map((name) => (
                        <span key={name} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-gray-400 border border-border">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <a
                  href={run.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-shrink-0 text-gray-400 hover:text-accent-blue transition-colors mt-0.5"
                >
                  <ExternalLink size={11} />
                </a>
              </div>
            )
          })}
        </div>

        {/* Summary footer */}
        <div className="px-4 py-2 border-t border-border bg-surface-2/30 flex items-center gap-4 text-[10px] text-gray-400">
          {selfHostedRuns.length > 0 && (
            <span className="text-yellow-500">{selfHostedRuns.length} on self-hosted</span>
          )}
          {githubHostedRuns.length > 0 && (
            <span>{githubHostedRuns.length} on GitHub-hosted</span>
          )}
          <span className="ml-auto font-mono">
            {runs.reduce((a, r) => a + (r.active_jobs?.length ?? 0), 0)} active jobs total
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Runner Analysis ────────────────────────────────────────────────────────────

function RunnerAnalysisSection({ runners }: { runners: any[] }) {
  const { data } = useQuery({
    queryKey: ['runner-recommendations'],
    queryFn: getRunnerRecommendations,
    staleTime: 5 * 60_000,
  })

  const recommendations: Record<string, any> = data?.recommendations ?? {}
  const bestPractices: any[] = data?.best_practices ?? []

  const gpuRunners = runners.filter((r) =>
    r.labels?.some((l: any) => ['gpu', 'a100', 'cuda'].some((k) => l.name?.toLowerCase().includes(k)))
  )
  const gpuBusy = gpuRunners.filter((r) => r.busy).length
  const gpuIdle = gpuRunners.filter((r) => r.status === 'online' && !r.busy).length

  const CLASS_ORDER = ['docs', 'tests', 'source', 'ci', 'mixed']
  const CLASS_LABELS: Record<string, string> = {
    docs: 'Docs only', tests: 'Tests / CPU', source: 'Source changes', ci: 'CI/CD config', mixed: 'Mixed',
  }
  const CLASS_ICONS: Record<string, any> = {
    docs: GitPullRequest, tests: CheckCircle, source: Zap, ci: Terminal, mixed: AlertTriangle,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-white">Runner Analysis</h2>
        <span className="text-[9px] text-gray-400 bg-surface-1 border border-border px-2 py-0.5 rounded-full">
          Recommendations by PR type
        </span>
      </div>

      {gpuRunners.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <div className="section-head">GPU Runner Utilization</div>
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">
                  {gpuBusy} busy / {gpuRunners.length} GPU runners
                </span>
                <span className={clsx('text-[10px] font-mono', gpuBusy > 0 ? 'text-yellow-400' : 'text-accent-green')}>
                  {gpuRunners.length > 0 ? Math.round((gpuBusy / gpuRunners.length) * 100) : 0}% utilized
                </span>
              </div>
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full transition-all"
                  style={{ width: `${gpuRunners.length > 0 ? (gpuBusy / gpuRunners.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="flex gap-3 text-[10px]">
              <span className="text-accent-green">{gpuIdle} idle</span>
              <span className="text-yellow-400">{gpuBusy} busy</span>
              <span className="text-gray-400">{gpuRunners.filter(r => r.status !== 'online').length} offline</span>
            </div>
          </div>
          {gpuIdle > 0 && (
            <p className="text-[10px] text-gray-400 border-t border-border pt-2">
              <AlertTriangle size={9} className="inline mr-1 text-yellow-500" />
              {gpuIdle} GPU runner{gpuIdle > 1 ? 's' : ''} idle — route docs/ci/tests PRs to hosted runners to free GPU capacity
            </p>
          )}
        </div>
      )}

      {Object.keys(recommendations).length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border card-head">
            <p className="text-sm font-bold text-white">Runner Assignment by PR Type</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Optimal runner selection reduces CI costs and queue wait time</p>
          </div>
          <div className="divide-y divide-border">
            {CLASS_ORDER.map((cls) => {
              const rec = recommendations[cls]
              if (!rec) return null
              const Icon = CLASS_ICONS[cls] ?? GitPullRequest
              return (
                <div key={cls} className="px-4 py-3 flex items-start gap-3">
                  <div className="p-1.5 bg-surface-2 rounded-lg flex-shrink-0 mt-0.5">
                    <Icon size={12} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-white">{CLASS_LABELS[cls] ?? cls}</span>
                      <span className={clsx(
                        'text-[9px] font-mono px-2 py-0.5 rounded border',
                        rec.gpu
                          ? 'bg-amber-500/[.05] text-amber-400 ring-amber-500/20'
                          : 'bg-green-950/30 text-accent-green border-green-900/30',
                      )}>
                        {rec.runner}
                      </span>
                      {rec.gpu
                        ? <span className="text-[9px] text-yellow-500">🖥️ GPU required</span>
                        : <span className="text-[9px] text-accent-green">☁️ Hosted runner</span>
                      }
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{rec.reason}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {bestPractices.length > 0 && (
        <div className="space-y-2">
          <div className="section-head">Best Practices</div>
          {bestPractices.map((bp: any, i: number) => (
            <div key={i} className="bg-surface-1 border border-border rounded-lg px-4 py-3 flex items-start gap-3">
              <CheckCircle size={12} className="text-accent-green mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-white">{bp.rule}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{bp.rationale}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] bg-surface-2 text-gray-400 border border-border px-2 py-0.5 rounded-full font-mono">
                    {bp.classification}
                  </span>
                  <span className="text-[9px] text-gray-400">→</span>
                  <span className="text-[9px] font-mono text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-2 py-0.5 rounded-full">
                    {bp.runner}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
