import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Network, Loader2, Play, ExternalLink, ShieldCheck, Sparkles,
  CheckCircle2, AlertTriangle, X,
} from 'lucide-react'
import { getRepos, getActiveRepo, generateGraph, getGraphStatus, auditRepo, graphDataBase } from '../lib/api'
import { cn } from '../lib/cn'

/**
 * Knowledge Graph — git-graph inside GitPulser.
 *
 * Reuses the Understand Anything dashboard (served from /git-graph/viewer.html)
 * and the /understand/* backend to: build a file-level knowledge graph for any
 * tracked repo, open it visually, and — the key capability — audit the EXISTING
 * system against best practices, producing prioritised recommendations that feed
 * the Action Plan.
 */

const SEV: Record<string, string> = {
  critical: 'bg-accent-red/15 text-accent-red border-accent-red/30',
  high: 'bg-accent-red/10 text-accent-red border-accent-red/25',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
}

export default function KnowledgeGraph() {
  const { data: reposData, isLoading } = useQuery({ queryKey: ['repos'], queryFn: getRepos })
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repos: any[] = reposData?.repos ?? []
  const activeId = activeRepoData?.active?.id

  const [gen, setGen] = useState<Record<string, any>>({})
  const [auditFor, setAuditFor] = useState<any | null>(null)
  const [audit, setAudit] = useState<any | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)

  const openViewer = (r: any) => {
    const base = graphDataBase(r.owner, r.repo)
    window.open(`/git-graph/viewer.html?base=${encodeURIComponent(base)}`, '_blank')
  }

  const analyze = async (r: any) => {
    const slug = r.slug ?? `${r.owner}/${r.repo}`
    setGen(g => ({ ...g, [slug]: { running: true, done: 0, total: 0 } }))
    try {
      await generateGraph(r.owner, r.repo)
      for (let i = 0; i < 240; i++) {
        await new Promise(res => setTimeout(res, 2500))
        const s = await getGraphStatus(r.owner, r.repo)
        setGen(g => ({ ...g, [slug]: s }))
        if (!s.running) break
      }
    } catch (e: any) {
      setGen(g => ({ ...g, [slug]: { running: false, error: e.message } }))
    }
  }

  const runAudit = async (r: any) => {
    setAuditFor(r); setAudit(null); setAuditLoading(true)
    try { setAudit(await auditRepo(r.owner, r.repo)) }
    catch (e: any) { setAudit({ error: e.message }) }
    finally { setAuditLoading(false) }
  }

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand/15 flex items-center justify-center flex-shrink-0">
          <Network size={18} className="text-brand" />
        </div>
        <div>
          <h1 className="text-[20px] font-semibold text-neutral-900 dark:text-white tracking-[-0.02em]">Knowledge Graph</h1>
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-0.5 max-w-[640px]">
            Build a knowledge graph of any tracked repo, explore it visually, and audit the
            existing system against best practices — recommendations feed your <span className="text-brand">Action Plan</span>.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-[13px] text-neutral-400"><Loader2 size={14} className="animate-spin" /> Loading repositories…</div>
      )}

      {!isLoading && repos.length === 0 && (
        <div className="border border-border rounded-xl p-8 text-center bg-surface-1">
          <p className="text-[13px] text-neutral-400">No repositories tracked yet. Add one from the repo switcher or Settings.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {repos.map((r: any) => {
          const slug = r.slug ?? `${r.owner}/${r.repo}`
          const st = gen[slug]
          const isActive = r.id === activeId
          return (
            <div key={r.id} className={cn(
              'border rounded-xl p-4 bg-surface-1 transition-colors',
              isActive ? 'border-brand/40' : 'border-border hover:border-neutral-600',
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-neutral-900 dark:text-white truncate">{r.name ?? slug}</p>
                  <p className="text-[11px] text-neutral-500 font-mono mt-0.5">{slug}</p>
                </div>
                {isActive && <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand/15 text-brand border border-brand/25">active</span>}
              </div>

              {st && (
                <div className="mt-3 text-[12px] rounded-lg border border-border bg-surface-2/50 px-3 py-2">
                  {st.error
                    ? <span className="text-accent-red flex items-center gap-1.5"><AlertTriangle size={12} /> {st.error}</span>
                    : st.running
                      ? <span className="text-neutral-300 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin text-brand" /> summarised {st.done ?? 0}/{st.total ?? 0} files…</span>
                      : <span className="text-brand flex items-center gap-1.5"><CheckCircle2 size={12} /> graph ready — {st.nodes ?? 0} nodes / {st.edges ?? 0} edges</span>}
                  {st.truncated && <span className="text-neutral-500 ml-1">(capped at {st.total})</span>}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  onClick={() => analyze(r)}
                  disabled={st?.running}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-brand/15 border border-brand/25 text-brand hover:bg-brand/25 disabled:opacity-40 transition-colors"
                >
                  {st?.running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Analyze
                </button>
                <button
                  onClick={() => openViewer(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border border-border bg-surface-2 text-neutral-300 hover:border-neutral-500 transition-colors"
                >
                  <ExternalLink size={12} /> Open graph
                </button>
                <button
                  onClick={() => runAudit(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border border-border bg-surface-2 text-neutral-300 hover:border-neutral-500 transition-colors"
                >
                  <ShieldCheck size={12} /> Audit
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Audit panel */}
      {auditFor && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 md:p-10 overflow-auto" onClick={() => setAuditFor(null)}>
          <div className="w-full max-w-[760px] bg-surface-1 border border-border rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-brand" />
                <h2 className="text-[16px] font-semibold text-white">Best-practices audit — <span className="font-mono text-[13px] text-neutral-400">{auditFor.slug}</span></h2>
              </div>
              <button onClick={() => setAuditFor(null)} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-neutral-400 hover:text-white"><X size={14} /></button>
            </div>

            {auditLoading && <div className="flex items-center gap-2 text-[13px] text-neutral-400 py-8 justify-center"><Loader2 size={16} className="animate-spin text-brand" /> Auditing the system from its graph…</div>}

            {!auditLoading && audit?.error && (
              <div className="text-[13px] text-accent-red border border-accent-red/25 bg-accent-red/10 rounded-lg p-3">
                {audit.error}{/No graph/i.test(audit.error) ? ' — click Analyze first to generate the graph.' : ''}
              </div>
            )}

            {!auditLoading && audit && !audit.error && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {audit.score != null && (
                    <div className="flex-shrink-0 w-16 h-16 rounded-xl border border-border bg-surface-2 flex flex-col items-center justify-center">
                      <span className="text-[20px] font-bold text-brand leading-none">{audit.score}</span>
                      <span className="text-[9px] text-neutral-500 mt-0.5">/ 100</span>
                    </div>
                  )}
                  {audit.summary && <p className="text-[13px] text-neutral-300">{audit.summary}</p>}
                </div>

                {audit.strengths?.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Strengths</h3>
                    <ul className="space-y-1">
                      {audit.strengths.map((s: string, i: number) => (
                        <li key={i} className="text-[12.5px] text-neutral-300 flex gap-2"><CheckCircle2 size={13} className="text-brand flex-shrink-0 mt-0.5" /> {s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {audit.gaps?.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Gaps &amp; recommendations</h3>
                    <div className="space-y-2">
                      {audit.gaps.map((g: any, i: number) => (
                        <div key={i} className="border border-border rounded-lg p-3 bg-surface-2/40">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn('text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border', SEV[g.severity] ?? SEV.medium)}>{g.severity}</span>
                            <span className="text-[12.5px] font-semibold text-white">{g.area}</span>
                          </div>
                          <p className="text-[12.5px] text-neutral-300">{g.finding}</p>
                          <p className="text-[12.5px] text-brand mt-1">→ {g.recommendation}</p>
                          {g.evidence?.length > 0 && <p className="text-[10.5px] text-neutral-500 font-mono mt-1">{g.evidence.join(', ')}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {audit.quick_wins?.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Quick wins</h3>
                    <ul className="space-y-1">
                      {audit.quick_wins.map((s: string, i: number) => (
                        <li key={i} className="text-[12.5px] text-neutral-300 flex gap-2"><Sparkles size={12} className="text-amber-400 flex-shrink-0 mt-0.5" /> {s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[10.5px] text-neutral-500 border-t border-border pt-2">Claude's analysis from the knowledge graph — not a substitute for a human review.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
