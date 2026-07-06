// Infra & Security Gap — current (repo + live AWS) vs target. Repo target
// toggles between the live active repo and a custom/fork. Scores the delta and
// lets you provision the gaps via the CI dispatch path.
import { useState, useEffect } from 'react'
import { Gauge, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { useRepoSlug } from '../lib/hooks'

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

type Check = {
  id: string; category: string; title: string; target: string; fix: string
  severity: 'low' | 'medium' | 'high'; status: 'OK' | 'PARTIAL' | 'GAP'
  in_repo: boolean | null; in_aws: boolean | null
}
type GapReport = {
  aws: { reachable: boolean; account?: string; error?: string }
  score: { ok: number; partial: number; total: number; pct: number }
  by_category: Record<string, { ok: number; total: number }>
  checks: Check[]
  actions: { id: string; title: string; fix: string; severity: string; status: string }[]
}

const chip = (s: string) =>
  s === 'OK' ? 'bg-accent-green/15 text-accent-green'
  : s === 'PARTIAL' ? 'bg-accent-yellow/15 text-accent-yellow'
  : 'bg-accent-red/15 text-accent-red'

export default function InfraGap() {
  const repo = useRepoSlug()  // part of gitpulse: always the live active repo
  const [prefix, setPrefix] = useState('myrock')
  const [data, setData] = useState<GapReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pf, setPf] = useState<{ ok: boolean; message: string; reason?: string } | null>(null)
  const [enabling, setEnabling] = useState(false)

  function checkPreflight() {
    if (!repo) { setPf(null); return }
    fetch(`${API}/provision/preflight?repo=${encodeURIComponent(repo)}`)
      .then(r => r.json()).then(setPf).catch(() => setPf(null))
  }
  useEffect(() => { checkPreflight() }, [repo])

  async function enableViaFork() {
    setEnabling(true); setMsg(null)
    try {
      const r = await fetch(`${API}/provision/scaffold?repo=${encodeURIComponent(repo)}&to_default=true`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j.detail || 'Failed to enable provisioning' }); return }
      setMsg({ ok: true, text: j.message || `Provisioning enabled on ${j.repo}.` })
      checkPreflight()
    } catch (e: any) { setMsg({ ok: false, text: String(e.message || e) }) }
    finally { setEnabling(false) }
  }

  async function analyze() {
    setLoading(true); setErr(''); setMsg(null)
    try {
      const r = await fetch(`${API}/gap/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, prefix }),
      })
      if (!r.ok) throw new Error(await r.text())
      setData(await r.json())
    } catch (e: any) { setErr(String(e.message || e)) }
    finally { setLoading(false) }
  }

  async function provision(action: string) {
    setBusy(action); setMsg(null)
    // Backend tries the live repo then falls back to your fork; returns a clear
    // message if neither is dispatchable — so no hard block here.
    const r = await fetch(`${API}/provision/dispatch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, action }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setMsg({ ok: false, text: j.detail || 'dispatch failed' }); return }
    setMsg({ ok: true, text: `Dispatched ${action} → ${j.repo || repo}${j.via_fork ? ' · via your fork' : ''}. Check Actions.` })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Gauge size={18} className="text-brand" />
        <h1 className="text-lg font-semibold text-white">Infra &amp; Security Gap</h1>
        <span className="text-[11px] text-gray-500 ml-1">current (repo + live AWS) vs target · scores the infra/security delta</span>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Repo</span>
          <span className="font-mono text-[12px] text-gray-300 bg-surface-2 border border-border rounded-lg px-3 py-1.5">{repo || '—'}</span>
          <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="aws prefix"
            className="w-36 bg-surface-2 border border-border rounded-lg px-3 py-1.5 font-mono text-[12px] text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
          {pf && (
            <span className={clsx('text-[10px] font-medium', pf.ok ? 'text-accent-green' : 'text-accent-red')}>
              {pf.ok ? '✓ provision.yml ready' : '✗ not dispatchable'}
            </span>
          )}
        </div>
        {pf && !pf.ok && <p className="text-[10px] text-accent-red/80 leading-snug">{pf.message}</p>}
        {pf && !pf.ok && (pf.reason === 'workflow_missing' || pf.reason === 'no_write') && (
          <button onClick={enableViaFork} disabled={enabling}
            className="flex items-center gap-1.5 bg-brand text-black font-medium rounded-lg px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-40 w-fit">
            {enabling ? <Loader2 size={12} className="animate-spin" /> : <Gauge size={12} />} Enable provisioning via fork
          </button>
        )}
        <div className="flex gap-2 flex-wrap">
          <button onClick={analyze} disabled={loading || !repo}
            className="flex items-center gap-1.5 bg-brand text-black font-medium rounded-lg px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-40">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Gauge size={12} />} Analyze
          </button>
          <button onClick={() => provision('plan')} disabled={!!busy || !repo}
            className="border border-border text-gray-300 rounded-lg px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-40">Plan (CI)</button>
          <button onClick={() => provision('apply')} disabled={!!busy || !repo}
            className="border border-accent-yellow/50 text-accent-yellow rounded-lg px-3 py-1.5 text-xs hover:bg-accent-yellow/10 disabled:opacity-40">Apply (CI)</button>
        </div>
        {err && <p className="text-[11px] text-accent-red break-words">{err}</p>}
        {msg && <p className={clsx('text-[11px] break-words', msg.ok ? 'text-accent-green' : 'text-accent-red')}>{msg.text}</p>}
      </div>

      {data && (
        <>
          {/* score strip */}
          <div className="bg-surface-1 border border-border rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
            <div className="text-[20px] font-bold tabular-nums text-white leading-none">{data.score.ok}<span className="text-gray-500 text-sm font-normal">/{data.score.total}</span></div>
            <div className="flex-1 min-w-[180px] h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full', data.score.pct >= 80 ? 'bg-accent-green' : data.score.pct >= 50 ? 'bg-accent-yellow' : 'bg-accent-red')} style={{ width: `${data.score.pct}%` }} />
            </div>
            <div className="font-mono text-[10px] text-gray-500">
              {data.score.pct}% ready · {data.score.partial} partial · AWS {data.aws.reachable ? <span className="text-accent-green">✓ {data.aws.account}</span> : <span className="text-accent-red">✗ unreachable</span>}
            </div>
          </div>

          {/* checks grouped by category — tables */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
            {Object.keys(data.by_category).map(cat => (
              <div key={cat} className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{cat}</span>
                  <span className="text-[10px] font-mono text-gray-500">{data.by_category[cat].ok}/{data.by_category[cat].total}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {data.checks.filter(c => c.category === cat).map(c => (
                      <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40 align-top">
                        <td className="pl-4 pr-2 py-2 w-0"><span className={clsx('inline-block text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded', chip(c.status))}>{c.status}</span></td>
                        <td className="px-2 py-2">
                          <span className="block text-[11px] text-gray-200 leading-snug">{c.title}</span>
                          <span className="block text-[9px] text-gray-600 font-mono mt-0.5">repo:{c.in_repo === null ? 'n/a' : c.in_repo ? 'yes' : 'no'} · aws:{c.in_aws === null ? 'n/a' : c.in_aws ? 'yes' : 'no'}</span>
                          {c.status !== 'OK' && <span className="block text-[10px] text-accent-yellow/80 mt-0.5">→ {c.fix}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
