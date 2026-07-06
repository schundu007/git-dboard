import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import clsx from 'clsx'
import { getNightlyFailures } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

type Point = { date: string; failures: number; passed: number; total: number }
type Slow = { job: string; median_sec: number; runs: number }

function fmtDur(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${Math.round(s % 60)}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export default function Failures() {
  const slug = useRepoSlug()
  const [days, setDays] = useState<7 | 14 | 30>(14)
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'nightly-failures', days],
    queryFn: () => getNightlyFailures(days),
    refetchInterval: 300_000,
  })
  const timeline: (Point & { label: string })[] = (data?.timeline ?? []).map((p: Point) => ({ ...p, label: p.date.slice(5) }))
  const slowest: Slow[] = data?.slowest ?? []
  const totalFails = timeline.reduce((s, p) => s + p.failures, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame size={18} className="text-accent-red" />
          <h1 className="text-lg font-semibold text-white">Failures</h1>
        </div>
        <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5">
          {([7, 14, 30] as const).map(v => (
            <button key={v} onClick={() => setDays(v)}
              className={clsx('px-2 py-0.5 rounded text-[10px] transition-colors', days === v ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {v}d
            </button>
          ))}
        </div>
      </div>

      {/* Failures over time */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">Failures over time</span>
          <span className="ml-auto text-[10px] text-gray-500">{totalFails} failures · {days}d</span>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-[12px] text-gray-500">Loading…</div>
        ) : timeline.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-gray-500">No nightly runs in this window.</div>
        ) : (
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={timeline} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#26262c" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#86939e', fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#86939e', fontSize: 9 }} allowDecimals={false} width={28} />
                <Tooltip contentStyle={{ background: '#141417', border: '1px solid #26262c', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: '#a1a1aa' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="passed" name="passed" stackId="a" fill="#4a7400" />
                <Bar dataKey="failures" name="failed" stackId="a" fill="#c1442a" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Slowest jobs */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <Clock size={13} className="text-accent-yellow" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">Slowest jobs</span>
          <span className="ml-auto text-[10px] text-gray-500">top 15 by median wall-time</span>
        </div>
        {slowest.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-500">No timing data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-4 py-2">Job</th>
                  <th className="text-right text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-2">Runs</th>
                  <th className="text-right text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-4 py-2">Median</th>
                </tr>
              </thead>
              <tbody>
                {slowest.map((s, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40">
                    <td className="px-4 py-1.5 text-[11px] text-gray-300 font-mono truncate max-w-[420px]">{s.job}</td>
                    <td className="px-3 py-1.5 text-right text-[10px] text-gray-500 tabular-nums">{s.runs}</td>
                    <td className="px-4 py-1.5 text-right text-[11px] font-mono font-semibold text-accent-yellow tabular-nums whitespace-nowrap">{fmtDur(s.median_sec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
