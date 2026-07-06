import { useQuery } from '@tanstack/react-query'
import { GitPullRequest, Package, Clock, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { getBumpPRs } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

type BumpPR = { number: number; title: string; url: string; author: string; submodule: string; draft: boolean; age_days: number | null; created_at: string }
type Data = { total: number; oldest_days: number; by_submodule: Record<string, number>; prs: BumpPR[] }

export default function BumpPRs() {
  const slug = useRepoSlug()
  const { data, isLoading } = useQuery({
    queryKey: [slug, 'bump-prs'],
    queryFn: () => getBumpPRs(),
    refetchInterval: 120_000,
  })
  const d = data as Data | undefined
  const subs = Object.entries(d?.by_submodule ?? {})

  const metrics = [
    { k: 'Open bump PRs', v: d?.total ?? '—', c: 'text-white' },
    { k: 'Oldest open', v: d ? `${d.oldest_days}d` : '—', c: (d?.oldest_days ?? 0) > 7 ? 'text-accent-yellow' : 'text-white' },
    { k: 'Submodules', v: subs.length, c: 'text-white' },
    { k: 'Bot-authored', v: d?.prs.filter(p => (p.author ?? '').endsWith('[bot]')).length ?? '—', c: 'text-white' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <GitPullRequest size={18} className="text-brand" />
        <h1 className="text-lg font-semibold text-white">Bump PRs</h1>
        <span className="text-[11px] text-gray-500 ml-1">submodule &amp; dependency bumps awaiting merge</span>
      </div>

      {/* metric strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 bg-surface-1 border border-border rounded-xl overflow-hidden">
        {metrics.map((m, i) => (
          <div key={i} className="px-3.5 py-2.5 border-r border-border/50 last:border-r-0 min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-gray-500 truncate">{m.k}</p>
            <p className={clsx('text-[18px] font-semibold tabular-nums leading-none mt-1', m.c)}>{m.v}</p>
          </div>
        ))}
      </div>

      {/* by submodule */}
      {subs.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
            <Package size={13} className="text-accent-blue" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">By submodule</span>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {subs.map(([name, count]) => (
              <span key={name} className="inline-flex items-center gap-1.5 bg-surface-2 border border-border rounded-full px-2.5 py-1 text-[11px]">
                <span className="font-mono text-gray-300">{name}</span>
                <span className="text-brand font-semibold tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* bump PR table */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">Open bump PRs</span>
          <span className="ml-auto text-[10px] text-gray-500">{d?.total ?? 0} total</span>
        </div>
        {isLoading ? (
          <div className="py-10 text-center text-[12px] text-gray-500">Loading…</div>
        ) : !d || d.prs.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-gray-500">No open bump PRs.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-4 py-2">PR</th>
                  <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-2">Submodule</th>
                  <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-2">Title</th>
                  <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-2 hidden md:table-cell">Author</th>
                  <th className="text-center text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-2">Status</th>
                  <th className="text-right text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-4 py-2">Age</th>
                </tr>
              </thead>
              <tbody>
                {d.prs.map(p => (
                  <tr key={p.number} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40 transition-colors">
                    <td className="px-4 py-1.5">
                      <a href={p.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-gray-400 hover:text-brand inline-flex items-center gap-0.5">#{p.number}<ExternalLink size={8} /></a>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[11px] text-accent-blue whitespace-nowrap">{p.submodule}</td>
                    <td className="px-2 py-1.5 text-[11px] text-gray-200 truncate max-w-[360px]">{p.title}</td>
                    <td className="px-2 py-1.5 text-[10px] text-gray-500 whitespace-nowrap hidden md:table-cell">{p.author}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={clsx('inline-block text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase', p.draft ? 'bg-surface-3 text-gray-400' : 'bg-accent-green/15 text-accent-green')}>
                        {p.draft ? 'draft' : 'open'}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">
                      <span className={clsx('inline-flex items-center gap-1 text-[10px] font-mono tabular-nums', (p.age_days ?? 0) > 7 ? 'text-accent-yellow' : 'text-gray-500')}>
                        <Clock size={9} />{p.age_days ?? '—'}d
                      </span>
                    </td>
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
