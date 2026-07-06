import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Rocket, Download } from 'lucide-react'
import clsx from 'clsx'
import { getMultiArch } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

type Cell = { passed: number; failed: number; running: number; total: number; url?: string }
type Lane = { key: string; os: string; stage: string; label: string }
type Row = { date: string; cells: Record<string, Cell> }

function cellStyle(c?: Cell) {
  if (!c || c.total === 0) return { bg: '', text: 'text-gray-600', txt: '·', title: 'no run' }
  if (c.running > 0) return { bg: 'bg-accent-blue/15 border border-accent-blue/30 animate-pulse', text: 'text-accent-blue', txt: `${c.passed}/${c.total}`, title: 'running' }
  if (c.failed > 0) return { bg: 'bg-accent-red/12 border border-accent-red/30', text: 'text-accent-red', txt: `${c.passed}/${c.total}`, title: `${c.failed} failed` }
  if (c.passed === c.total) return { bg: 'bg-accent-green/12 border border-accent-green/25', text: 'text-accent-green', txt: `${c.passed}/${c.total}`, title: 'all passed' }
  return { bg: 'bg-surface-2 border border-border', text: 'text-gray-400', txt: `${c.passed}/${c.total}`, title: 'partial' }
}

const OS_TINT: Record<string, string> = { Linux: 'text-accent-blue', Windows: 'text-accent-yellow', '': 'text-gray-400' }

export default function MultiArchMatrix() {
  const slug = useRepoSlug()
  const [days, setDays] = useState<7 | 14 | 30>(14)
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'multiarch', days],
    queryFn: () => getMultiArch(days),
    refetchInterval: 180_000,
  })
  const lanes: Lane[] = data?.lanes ?? []
  const rows: Row[] = data?.rows ?? []

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <Rocket size={14} className="text-nvidia" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">Multi-Arch Release — Nightly</span>
        <div className="ml-auto flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5">
          {([7, 14, 30] as const).map(v => (
            <button key={v} onClick={() => setDays(v)}
              className={clsx('px-1.5 py-0.5 rounded text-[10px] transition-colors', days === v ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
              {v}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-[12px] text-gray-500">Loading lanes…</div>
      ) : lanes.length === 0 || rows.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-gray-500">No nightly runs in this window.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left align-bottom px-4 py-2 text-[9px] uppercase tracking-wider text-gray-500 font-semibold whitespace-nowrap sticky left-0 bg-surface-1">Run</th>
                {lanes.map(l => (
                  <th key={l.key} className="align-bottom px-1.5 py-2 text-center whitespace-nowrap">
                    <span className={clsx('block text-[8px] uppercase tracking-wide', OS_TINT[l.os])}>{l.os || '—'}</span>
                    <span className="block text-[9px] text-gray-400 font-medium">{l.stage}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Get</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const anyUrl = Object.values(r.cells).find(c => c.url)?.url
                return (
                  <tr key={r.date} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40 transition-colors">
                    <td className="px-4 py-1.5 whitespace-nowrap font-mono text-[11px] text-gray-300 sticky left-0 bg-surface-1">{r.date}</td>
                    {lanes.map(l => {
                      const c = r.cells[l.key]
                      const s = cellStyle(c)
                      return (
                        <td key={l.key} className="px-1.5 py-1.5 text-center">
                          {c && c.total > 0 ? (
                            c.url ? (
                              <a href={c.url} target="_blank" rel="noreferrer" title={s.title}>
                                <span className={clsx('inline-flex items-center justify-center min-w-[34px] h-5 px-1 rounded text-[10px] font-mono font-semibold', s.bg, s.text)}>{s.txt}</span>
                              </a>
                            ) : (
                              <span className={clsx('inline-flex items-center justify-center min-w-[34px] h-5 px-1 rounded text-[10px] font-mono font-semibold', s.bg, s.text)}>{s.txt}</span>
                            )
                          ) : (
                            <span className="text-gray-700">·</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-1.5 text-center">
                      {anyUrl ? (
                        <a href={anyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-nvidia">
                          <Download size={10} />
                        </a>
                      ) : <span className="text-gray-700">·</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-2 border-t border-border/60 text-[10px] text-gray-500">
        Each cell shows <span className="text-gray-400 font-mono">passed / total</span> jobs in that stage · green = all passed · red = failures · click a cell to open its run.
      </div>
    </div>
  )
}
