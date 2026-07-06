import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Copy, Check, Flame, Cpu, AlertTriangle, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { getNightlyDigest } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

type Hotspot = { job: string; failures: number; days: number; url?: string }
type Arch = { arch: string; failures: number; pct: number }
type Attn = { job: string; streak: number }
type Digest = {
  days: number; dates_covered: number; total_jobs: number; total_failures: number
  failure_rate: number; hotspots: Hotspot[]; top_architectures: Arch[]; needs_attention: Attn[]; flaky_jobs: string[]
}

function toMarkdown(d: Digest): string {
  const l = [`## CI Health Digest — last ${d.days}d`, '',
    `${d.total_failures} failures across ${d.total_jobs} jobs · ${d.failure_rate}% failure rate`, '', '### Top failure hotspots']
  d.hotspots.forEach(h => l.push(`- ${h.job} — ${h.failures} failures (${h.days}d)`))
  l.push('', '### Most affected architectures')
  d.top_architectures.forEach(a => l.push(`- ${a.arch}: ${a.failures} (${a.pct}%)`))
  if (d.needs_attention.length) {
    l.push('', '### Needs immediate attention')
    d.needs_attention.forEach(a => l.push(`- ${a.job} — failing ${a.streak}d straight`))
  }
  return l.join('\n')
}

export default function CIHealthDigest() {
  const slug = useRepoSlug()
  const [days, setDays] = useState<1 | 7 | 14>(7)
  const [copied, setCopied] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'nightly-digest', days],
    queryFn: () => getNightlyDigest(days),
    refetchInterval: 300_000,
  })
  const d = data as Digest | undefined

  const copy = () => {
    if (!d) return
    navigator.clipboard.writeText(toMarkdown(d)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <FileText size={14} className="text-nvidia" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">CI Health Digest</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5">
            {([1, 7, 14] as const).map(v => (
              <button key={v} onClick={() => setDays(v)}
                className={clsx('px-1.5 py-0.5 rounded text-[10px] transition-colors', days === v ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
                {v}d
              </button>
            ))}
          </div>
          {d && (
            <button onClick={copy} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white">
              {copied ? <Check size={11} className="text-accent-green" /> : <Copy size={11} />}{copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-[12px] text-gray-500">Computing digest…</div>
      ) : !d || d.total_jobs === 0 ? (
        <div className="py-8 text-center text-[12px] text-gray-500">No nightly job data in this window.</div>
      ) : (
        <>
          {/* summary line */}
          <div className="px-4 py-2.5 border-b border-border/60 flex items-baseline gap-2 flex-wrap">
            <span className={clsx('text-[20px] font-semibold tabular-nums leading-none', d.failure_rate >= 20 ? 'text-accent-red' : d.failure_rate > 0 ? 'text-accent-yellow' : 'text-accent-green')}>
              {d.failure_rate}%
            </span>
            <span className="text-[11px] text-gray-400">failure rate · {d.total_failures} failures across {d.total_jobs} jobs · {d.dates_covered} nights</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/60">
            {/* hotspots */}
            <div className="p-0">
              <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                <Flame size={11} className="text-accent-red" />
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Top failure hotspots</span>
              </div>
              {d.hotspots.length === 0 ? (
                <p className="px-4 pb-3 text-[11px] text-gray-500">None</p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {d.hotspots.map((h, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40">
                        <td className="pl-4 pr-2 py-1.5">
                          {h.url ? (
                            <a href={h.url} target="_blank" rel="noreferrer" className="text-[11px] text-gray-300 hover:text-nvidia inline-flex items-center gap-1">
                              <span className="truncate max-w-[240px] inline-block align-bottom">{h.job}</span><ExternalLink size={8} className="flex-shrink-0" />
                            </a>
                          ) : <span className="text-[11px] text-gray-300 truncate max-w-[240px] inline-block">{h.job}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[10px] text-gray-500 whitespace-nowrap">{h.days}d</td>
                        <td className="pr-4 pl-2 py-1.5 text-right text-[11px] font-mono font-bold text-accent-red whitespace-nowrap">{h.failures}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* architectures */}
            <div className="p-0">
              <div className="flex items-center gap-1.5 px-4 pt-3 pb-1.5">
                <Cpu size={11} className="text-accent-blue" />
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Most affected architectures</span>
              </div>
              {d.top_architectures.length === 0 ? (
                <p className="px-4 pb-3 text-[11px] text-gray-500">None</p>
              ) : (
                <div className="px-4 pb-3 space-y-1.5 pt-1">
                  {d.top_architectures.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-[11px] text-gray-300 w-28 truncate flex-shrink-0">{a.arch}</span>
                      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-accent-red/70" style={{ width: `${a.pct}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 w-16 text-right flex-shrink-0">{a.failures} · {a.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* needs attention */}
          {d.needs_attention.length > 0 && (
            <div className="border-t border-border/60 bg-accent-red/[0.04] px-4 py-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle size={11} className="text-accent-red" />
                <span className="text-[10px] uppercase tracking-wider text-accent-red font-semibold">Needs immediate attention — failing 3+ days</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {d.needs_attention.map((a, i) => (
                  <span key={i} className="text-[11px] text-gray-300">
                    <span className="truncate max-w-[280px] inline-block align-bottom">{a.job}</span>
                    <span className="text-accent-red font-mono font-bold ml-1.5">{a.streak}d</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
