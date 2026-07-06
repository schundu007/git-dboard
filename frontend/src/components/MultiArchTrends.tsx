import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import clsx from 'clsx'
import { getMultiArchTrends } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

type P = { date: string; build: number; test: number }

function OsChart({ title, data }: { title: string; data: P[] }) {
  const rows = data.map(p => ({ ...p, label: p.date.slice(5) }))
  const total = data.reduce((s, p) => s + p.build + p.test, 0)
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{title}</span>
        <span className="text-[9px] text-gray-600">{total} failures</span>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#26262c" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#86939e', fontSize: 8 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#86939e', fontSize: 8 }} allowDecimals={false} width={24} />
          <Tooltip contentStyle={{ background: '#141417', border: '1px solid #26262c', borderRadius: 6, fontSize: 11 }} labelStyle={{ color: '#a1a1aa' }} />
          <Legend wrapperStyle={{ fontSize: 9 }} />
          <Line type="monotone" dataKey="build" name="build" stroke="#d97706" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="test" name="test" stroke="#c1442a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function MultiArchTrends() {
  const slug = useRepoSlug()
  const [days, setDays] = useState<14 | 30 | 60>(30)
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'multiarch-trends', days],
    queryFn: () => getMultiArchTrends(days),
    refetchInterval: 300_000,
  })
  const linux: P[] = data?.linux ?? []
  const windows: P[] = data?.windows ?? []
  const hasData = linux.length > 0 || windows.length > 0

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <TrendingUp size={14} className="text-brand" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">Multi-Arch Trends</span>
        <span className="text-[10px] text-gray-500">build vs test failures / day</span>
        <div className="ml-auto flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5">
          {([14, 30, 60] as const).map(v => (
            <button key={v} onClick={() => setDays(v)}
              className={clsx('px-1.5 py-0.5 rounded text-[10px] transition-colors', days === v ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {v}d
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="py-10 text-center text-[12px] text-gray-500">Loading trends…</div>
      ) : !hasData ? (
        <div className="py-10 text-center text-[12px] text-gray-500">No nightly runs in this window.</div>
      ) : (
        <div className="p-4 flex flex-col lg:flex-row gap-5">
          <OsChart title="ROCm Linux" data={linux} />
          <OsChart title="ROCm Windows" data={windows} />
        </div>
      )}
    </div>
  )
}
