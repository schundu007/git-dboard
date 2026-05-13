import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Moon, Play, RefreshCw, ExternalLink, AlertTriangle, Zap,
  ChevronDown, ChevronUp, XCircle, Clock, Terminal,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import { getNightlyMatrix, getNightlyRuns, getNightlyTrend, triggerNightly, getFailureSummary } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import clsx from 'clsx'
import type { WorkflowRun } from '../lib/types'

// ── Cell colour ──────────────────────────────────────────────────────────────

function cellStyle(status: string | undefined) {
  if (!status) return { bg: 'bg-surface-2', text: 'text-gray-700', sym: '—' }
  const s = status.toLowerCase()
  if (s === 'success') return { bg: 'bg-green-950 border border-green-800', text: 'text-accent-green', sym: '✓' }
  if (s === 'failure') return { bg: 'bg-red-950 border border-red-800', text: 'text-accent-red', sym: '✗' }
  if (['in_progress', 'queued'].includes(s))
    return { bg: 'bg-blue-950 border border-blue-800 animate-pulse', text: 'text-accent-blue', sym: '~' }
  if (s === 'skipped') return { bg: 'bg-gray-800', text: 'text-gray-500', sym: '⊘' }
  return { bg: 'bg-gray-800', text: 'text-gray-500', sym: '?' }
}

// ── Job-level matrix ─────────────────────────────────────────────────────────

function MatrixTable() {
  const [days, setDays] = useState(14)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['nightly-matrix', days],
    queryFn: () => getNightlyMatrix(days),
    refetchInterval: 120_000,
  })

  if (isLoading) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        Loading matrix — fetching job data for each run…
      </div>
    )
  }

  const dates: string[] = data?.dates ?? []
  const matrix: Record<string, Record<string, any>> = data?.matrix ?? {}
  const jobNames: string[] = data?.job_names ?? []
  const flaky: string[] = data?.flaky_jobs ?? []
  const consecutive: Record<string, number> = data?.consecutive_failures ?? {}

  if (dates.length === 0) {
    return <p className="text-gray-600 text-sm text-center py-6">No nightly runs found.</p>
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Window:</span>
          {[7, 14, 21, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={clsx(
                'px-2 py-0.5 rounded transition-colors',
                days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2'
              )}
            >
              {d}d
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          {[
            { sym: '✓', cls: 'text-accent-green', label: 'pass' },
            { sym: '✗', cls: 'text-accent-red', label: 'fail' },
            { sym: '~', cls: 'text-accent-blue', label: 'running' },
            { sym: '—', cls: 'text-gray-600', label: 'no run' },
          ].map(({ sym, cls, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className={cls}>{sym}</span> {label}
            </span>
          ))}
          <button onClick={() => refetch()} className="p-1 rounded hover:bg-surface-2 text-gray-400 hover:text-white ml-1">
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Flaky alerts */}
      {flaky.length > 0 && (
        <div className="flex items-start gap-2 bg-yellow-950/40 border border-yellow-800 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="text-accent-yellow mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-medium text-accent-yellow">Flaky jobs detected</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{flaky.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-normal pb-2 pr-4 whitespace-nowrap min-w-[220px]">
                Job
              </th>
              {dates.map((d) => (
                <th
                  key={d}
                  className="text-[9px] text-gray-600 font-normal pb-2 px-0.5 text-center whitespace-nowrap"
                >
                  {d.slice(5)}
                </th>
              ))}
              <th className="text-[9px] text-gray-600 font-normal pb-2 px-2 text-center whitespace-nowrap">
                Streak
              </th>
            </tr>
          </thead>
          <tbody>
            {jobNames.map((name) => {
              const isFlaky = flaky.includes(name)
              const streak = consecutive[name] ?? 0
              return (
                <tr key={name} className={isFlaky ? 'bg-yellow-950/10' : ''}>
                  <td className="pr-4 py-1 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isFlaky && (
                        <Zap size={9} className="text-accent-yellow flex-shrink-0" />
                      )}
                      <span className={clsx('text-gray-300 truncate max-w-[200px]', isFlaky && 'text-accent-yellow')}>
                        {name}
                      </span>
                    </div>
                  </td>
                  {dates.map((d) => {
                    const cell = matrix[d]?.[name]
                    const { bg, text, sym } = cellStyle(cell?.status)
                    return (
                      <td key={d} className="px-0.5 py-1 text-center">
                        {cell ? (
                          <a href={cell.url} target="_blank" rel="noreferrer">
                            <span
                              className={clsx(
                                'inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold cursor-pointer transition-opacity hover:opacity-70',
                                bg, text
                              )}
                              title={`${name}\n${d}: ${cell.status}`}
                            >
                              {sym}
                            </span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center justify-center w-7 h-5 rounded text-[10px] text-gray-700">
                            —
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-1 text-center">
                    {streak > 0 ? (
                      <span className="text-[10px] text-accent-red font-semibold">{streak}×</span>
                    ) : (
                      <span className="text-[10px] text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Trend chart ───────────────────────────────────────────────────────────────

function TrendChart() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useQuery({
    queryKey: ['nightly-trend', days],
    queryFn: () => getNightlyTrend(days),
    refetchInterval: 300_000,
  })

  const trend = [...(data?.trend ?? [])].reverse()

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Pass Rate Trend
        </h2>
        <div className="flex items-center gap-1 text-[10px]">
          {[14, 30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={clsx('px-1.5 py-0.5 rounded', days === d ? 'bg-surface-3 text-white' : 'text-gray-500 hover:bg-surface-2')}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {isLoading && <div className="h-[120px] flex items-center justify-center text-gray-600 text-xs">Loading…</div>}
      {!isLoading && trend.length === 0 && <div className="h-[120px] flex items-center justify-center text-gray-600 text-xs">No data in this window.</div>}
      {!isLoading && trend.length > 0 && <ResponsiveContainer width="100%" height={120}>
        <LineChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b7280', fontSize: 9 }}
            tickFormatter={(v) => v.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#6b7280', fontSize: 9 }}
            tickFormatter={(v) => `${v}%`}
            width={32}
          />
          <Tooltip
            contentStyle={{ background: '#161b27', border: '1px solid #2d3748', borderRadius: 6, fontSize: 11 }}
            formatter={(v: any) => [`${v}%`, 'Pass rate']}
            labelFormatter={(l) => `Date: ${l}`}
          />
          <Line
            type="monotone"
            dataKey="pass_rate"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e' }}
          />
        </LineChart>
      </ResponsiveContainer>}
    </div>
  )
}

// ── Failure detail (lazy-loaded per run) ─────────────────────────────────────

function NightlyFailureDetail({ runId }: { runId: number }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['failure-summary', runId],
    queryFn: () => getFailureSummary(runId),
    enabled: open,
    staleTime: 300_000,
  })

  return (
    <div className="mt-2 border-t border-red-900/20 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-accent-red hover:text-red-400 transition-colors"
      >
        <Terminal size={9} />
        {open ? 'Hide error detail' : 'Show error detail'}
        {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>

      {open && (
        <div className="mt-2 bg-black/40 rounded border border-red-900/40 p-2.5 space-y-3">
          {isLoading && <p className="text-[10px] text-gray-600">Fetching job logs…</p>}
          {data?.summaries?.length === 0 && !isLoading && (
            <p className="text-[10px] text-gray-600">No failed jobs found in this run.</p>
          )}
          {data?.summaries?.map((s: any, i: number) => (
            <div key={i} className="space-y-1">
              <p className="text-[10px] font-semibold text-accent-red flex items-center gap-1">
                <XCircle size={9} /> {s.job}
                {s.runner && <span className="text-gray-600 font-normal ml-1">on {s.runner}</span>}
              </p>
              {s.failed_steps?.map((step: any) => (
                <p key={step.number} className="text-[10px] text-orange-400 pl-3 flex items-center gap-1">
                  <AlertTriangle size={8} /> Step {step.number}: {step.name}
                </p>
              ))}
              {s.error_lines?.length > 0 && (
                <div className="bg-black/60 rounded p-1.5 font-mono max-h-40 overflow-y-auto">
                  {s.error_lines.map((line: string, li: number) => (
                    <p key={li} className={clsx(
                      'text-[9px] leading-4 break-all whitespace-pre-wrap',
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
        </div>
      )}
    </div>
  )
}

// ── Recent runs list ──────────────────────────────────────────────────────────

function RecentRuns() {
  const { data, isLoading } = useQuery({
    queryKey: ['nightly-runs'],
    queryFn: () => getNightlyRuns(),
    refetchInterval: 60_000,
  })
  const runs: WorkflowRun[] = data?.workflow_runs ?? []
  if (isLoading || runs.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Runs</h2>
      {runs.slice(0, 15).map((r) => {
        const isFailed = r.conclusion === 'failure' || r.conclusion === 'timed_out'
        const isRunning = r.status === 'in_progress' || r.status === 'queued'
        const dur = (r as any).duration_label

        return (
          <div
            key={r.id}
            className={clsx(
              'bg-surface-1 border rounded-xl px-4 py-3',
              isFailed ? 'border-red-900/40' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <StatusBadge status={r.conclusion ?? r.status} />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate font-medium">
                    {r.display_title || r.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 flex-wrap">
                    <span className="text-accent-blue font-mono">{r.head_branch}</span>
                    <span className="font-mono">{r.head_sha?.slice(0, 7)}</span>
                    <span>{r.created_at.slice(0, 10)}</span>
                    <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                    {dur && dur !== '—' && (
                      <span className="flex items-center gap-0.5">
                        <Clock size={9} /> {dur}
                      </span>
                    )}
                    {isRunning && (
                      <span className="flex items-center gap-1 text-accent-blue">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                        {r.status === 'queued' ? 'Queued' : 'Running'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <a href={r.html_url} target="_blank" rel="noreferrer" className="flex-shrink-0 ml-3">
                <ExternalLink size={12} className="text-gray-500 hover:text-accent-blue" />
              </a>
            </div>

            {/* Inline failure detail for failed runs */}
            {isFailed && <NightlyFailureDetail runId={r.id} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NightlyMonitor() {
  const [ref, setRef] = useState('main')
  const { mutate: trigger, isPending } = useMutation({
    mutationFn: () => triggerNightly(ref),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Moon size={18} className="text-accent-yellow" />
          <h1 className="text-lg font-semibold">Nightly Monitor</h1>
          <span className="text-xs text-gray-500 bg-surface-2 px-2 py-0.5 rounded-full">
            daily-compatibility.yml
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className="bg-surface-2 border border-border rounded px-2 py-1 text-xs w-24 text-white"
            placeholder="ref"
          />
          <button
            onClick={() => trigger()}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-accent-yellow text-black hover:opacity-90 disabled:opacity-50 font-medium transition-colors"
          >
            <Play size={11} />
            {isPending ? 'Triggering…' : 'Run Now'}
          </button>
        </div>
      </div>

      <TrendChart />

      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Isaac Sim Compatibility Matrix
        </h2>
        <MatrixTable />
      </div>

      <RecentRuns />
    </div>
  )
}
