import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, ExternalLink, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { getSanitizers } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

type Job = { name: string; arch: string; status: string; url?: string }
type Suite = { kind: string; full?: string; desc?: string; workflow: string | null; configured?: boolean; run: { number: number; url: string; created_at: string; status: string } | null; jobs: Job[] }

function statusStyle(s: string) {
  const v = (s || '').toLowerCase()
  if (v === 'success') return { bg: 'bg-accent-green/15 text-accent-green', label: 'PASS' }
  if (v === 'failure') return { bg: 'bg-accent-red/15 text-accent-red', label: 'FAIL' }
  if (['in_progress', 'queued'].includes(v)) return { bg: 'bg-accent-blue/15 text-accent-blue', label: 'RUNNING' }
  if (v === 'skipped') return { bg: 'bg-surface-3 text-gray-400', label: 'SKIPPED' }
  return { bg: 'bg-surface-3 text-gray-400', label: (s || '—').toUpperCase() }
}

function SuiteCard({ s }: { s: Suite }) {
  if (!s.configured) {
    return (
      <div className="bg-surface-1 border border-border/60 rounded-xl px-4 py-2.5 flex items-center gap-2 opacity-60">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{s.kind}</span>
        {s.full && <span className="text-[10px] text-gray-600">{s.full}</span>}
        <span className="ml-auto text-[9px] uppercase tracking-wider text-gray-600 bg-surface-2 border border-border rounded px-1.5 py-0.5">not configured</span>
      </div>
    )
  }
  const fails = s.jobs.filter(j => (j.status || '').toLowerCase() === 'failure').length
  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">{s.kind}</span>
            {s.full && <span className="text-[10px] text-gray-500">{s.full}</span>}
            {s.run && (
              <a href={s.run.url} target="_blank" rel="noreferrer" className="text-[10px] text-gray-500 hover:text-nvidia font-mono inline-flex items-center gap-0.5">
                #{s.run.number}<ExternalLink size={8} />
              </a>
            )}
          </div>
          {s.desc && <p className="text-[10px] text-gray-600 mt-0.5 truncate">{s.desc}</p>}
        </div>
        <span className="ml-auto text-[10px] text-gray-500 flex-shrink-0">{s.run?.created_at?.slice(0, 10) ?? '—'}</span>
      </div>
      {fails > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 bg-accent-red/[0.06] border-b border-accent-red/20">
          <AlertTriangle size={11} className="text-accent-red" />
          <span className="text-[10px] text-accent-red font-medium">{s.kind} regression — {fails} failing job{fails > 1 ? 's' : ''} in latest run</span>
        </div>
      )}
      {s.jobs.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-gray-500">No jobs in latest run.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-4 py-2">Job</th>
                <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-2">Arch</th>
                <th className="text-right text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {s.jobs.map((j, i) => {
                const st = statusStyle(j.status)
                return (
                  <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40">
                    <td className="px-4 py-1.5">
                      {j.url ? (
                        <a href={j.url} target="_blank" rel="noreferrer" className="text-[11px] text-gray-300 hover:text-nvidia truncate max-w-[420px] inline-block align-bottom">{j.name}</a>
                      ) : <span className="text-[11px] text-gray-300 truncate max-w-[420px] inline-block">{j.name}</span>}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-accent-blue whitespace-nowrap">{j.arch || '—'}</td>
                    <td className="px-4 py-1.5 text-right">
                      <span className={clsx('inline-block text-[8.5px] font-bold px-1.5 py-0.5 rounded', st.bg)}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Sanitizers() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'sanitizers'],
    queryFn: () => getSanitizers(),
    refetchInterval: 300_000,
  })
  const suites: Suite[] = data?.suites ?? []
  const configuredCount: number = data?.configured ?? suites.filter(s => s.configured).length

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} className="text-nvidia" />
        <h1 className="text-lg font-semibold text-white">Sanitizers</h1>
        <span className="text-[11px] text-gray-500 ml-1">ASAN &amp; TSAN build/test pipelines</span>
      </div>
      {isLoading ? (
        <div className="py-10 text-center text-[12px] text-gray-500">Loading sanitizer runs…</div>
      ) : configuredCount === 0 ? (
        <div className="bg-surface-1 border border-border rounded-xl py-10 text-center text-[12px] text-gray-500">
          No sanitizer workflows (ASan / TSan / MSan / UBSan / HWASan) detected for this repo.
        </div>
      ) : (
        <>
          <p className="text-[10px] text-gray-500">{configuredCount} of 5 sanitizers configured</p>
          {suites.map(s => <SuiteCard key={s.kind} s={s} />)}
        </>
      )}
    </div>
  )
}
