// Infra & Security Gap — current (repo + live AWS) vs target. Repo target
// toggles between the live active repo and a custom/fork. Scores the delta and
// lets you provision the gaps via the CI dispatch path.
import { useState, useEffect, type ReactNode } from 'react'
import { Gauge, Loader2, AlertTriangle, Cloud, ShieldCheck } from 'lucide-react'
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

const sevDot = (sev: string) =>
  sev === 'high' ? 'bg-accent-red' : sev === 'medium' ? 'bg-accent-yellow' : 'bg-gray-600'

type Run = { id: number; status: string; conclusion: string; event: string; created: string; url: string }
const conc = (c: string) =>
  c === 'success' ? 'text-accent-green' : c === 'failure' ? 'text-accent-red' : 'text-accent-yellow'

function ReadinessGauge({ pct }: { pct: number }) {
  const R = 40, C = 2 * Math.PI * R
  const stroke = pct >= 80 ? '#76b900' : pct >= 50 ? '#d97706' : '#c1442a'
  return (
    <div className="relative flex-shrink-0" style={{ width: 104, height: 104 }}>
      <svg width="104" height="104" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={R} fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-3" />
        <circle cx="52" cy="52" r={R} fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 52 52)"
          style={{ transition: 'stroke-dasharray .9s cubic-bezier(0.22,1,0.36,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-bold tabular-nums text-white leading-none" style={{ color: stroke }}>{pct}%</span>
        <span className="text-[8px] uppercase tracking-[0.12em] text-gray-500 mt-1">ready</span>
      </div>
    </div>
  )
}

function KpiTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone: 'green' | 'yellow' | 'red' | 'muted' }) {
  const c = tone === 'green' ? 'text-accent-green' : tone === 'yellow' ? 'text-accent-yellow' : tone === 'red' ? 'text-accent-red' : 'text-white'
  return (
    <div className="bg-surface-2/40 border border-border rounded-lg px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wider text-gray-500 truncate">{label}</p>
      <p className={clsx('text-[19px] font-bold tabular-nums leading-none mt-1.5', c)}>{value}</p>
      {sub && <p className="text-[9px] text-gray-600 mt-1 truncate">{sub}</p>}
    </div>
  )
}

export default function InfraGap() {
  const repo = useRepoSlug()  // part of gitpulse: always the live active repo
  const [prefix, setPrefix] = useState('myrock')
  const [data, setData] = useState<GapReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pf, setPf] = useState<{ ok: boolean; message: string; reason?: string; repo?: string; via_fork?: boolean } | null>(null)
  const [enabling, setEnabling] = useState(false)
  const [guide, setGuide] = useState<{ check_id: string; title: string; guide?: string } | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])

  function checkPreflight() {
    if (!repo) { setPf(null); return }
    fetch(`${API}/provision/preflight?repo=${encodeURIComponent(repo)}`)
      .then(r => r.json()).then(setPf).catch(() => setPf(null))
  }
  async function loadRuns() {
    const t = pf?.repo || repo  // runs execute on the fork when dispatch falls back there
    if (!t) return
    try { const r = await fetch(`${API}/provision/runs?repo=${encodeURIComponent(t)}`); if (r.ok) setRuns(await r.json()) } catch { /* ignore */ }
  }
  const hasActive = runs.some(r => r.status !== 'completed')
  useEffect(() => { checkPreflight() }, [repo])
  useEffect(() => { loadRuns(); const t = setInterval(loadRuns, hasActive ? 3000 : 20000); return () => clearInterval(t) }, [repo, pf?.repo, hasActive])
  useEffect(() => { if (!msg && !err) return; const t = setTimeout(() => { setMsg(null); setErr('') }, 4000); return () => clearTimeout(t) }, [msg, err])

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
    setMsg({ ok: true, text: `Dispatched ${action} → ${j.repo || repo}` })
    // burst-refresh so the new run surfaces in the strip below within seconds
    loadRuns(); [1500, 4000, 8000].forEach(d => setTimeout(loadRuns, d))
  }

  async function askGuide(c: Check) {
    setGuide({ check_id: c.id, title: c.title }); setGuideLoading(true)
    try {
      const r = await fetch(`${API}/gap/guide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, check_id: c.id, prefix, in_repo: c.in_repo, in_aws: c.in_aws }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setGuide({ check_id: c.id, title: c.title, guide: `⚠ ${j.detail || 'Could not generate guidance.'}` }); return }
      setGuide({ check_id: c.id, title: j.title || c.title, guide: j.guide })
    } catch (e: any) { setGuide({ check_id: c.id, title: c.title, guide: `⚠ ${String(e.message || e)}` }) }
    finally { setGuideLoading(false) }
  }

  const gaps = data ? data.score.total - data.score.ok - data.score.partial : 0

  return (
    <div className="space-y-5">
      {/* Header + toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand/10 ring-1 ring-brand/25 flex items-center justify-center">
            <Gauge size={17} className="text-brand" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white leading-tight">Infra &amp; Security Gap</h1>
            <p className="text-[11px] text-gray-500">current (repo + live AWS) vs target · infra/security delta</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-gray-300 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">{repo || '—'}</span>
          <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="aws prefix"
            className="w-32 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 font-mono text-[12px] text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
          <button onClick={analyze} disabled={loading || !repo}
            className="flex items-center gap-1.5 bg-brand text-black font-semibold rounded-lg px-3.5 py-1.5 text-xs hover:opacity-90 disabled:opacity-40 shadow-sm">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Gauge size={13} />} Analyze
          </button>
        </div>
      </div>

      {/* Provisioning status banner */}
      {pf && (
        <div className={clsx('flex items-center gap-3 rounded-xl px-4 py-2.5 border',
          pf.ok ? 'bg-accent-green/[0.06] border-accent-green/20' : 'bg-accent-red/[0.06] border-accent-red/20')}>
          {pf.ok
            ? <ShieldCheck size={15} className="text-accent-green flex-shrink-0" />
            : <AlertTriangle size={15} className="text-accent-red flex-shrink-0" />}
          <span className="text-[11px] text-gray-300 flex-1 min-w-0">{pf.message || (pf.ok ? 'Provisioning ready' : 'Not dispatchable')}</span>
          {pf.ok ? (
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => provision('plan')} disabled={!!busy || !data} title={!data ? 'Run Analyze first' : undefined} className="border border-border text-gray-300 rounded-lg px-3 py-1 text-xs hover:bg-surface-2 disabled:opacity-40">Plan (CI)</button>
              <button onClick={() => provision('apply')} disabled={!!busy || !data} title={!data ? 'Run Analyze first' : undefined} className="border border-accent-yellow/50 text-accent-yellow rounded-lg px-3 py-1 text-xs hover:bg-accent-yellow/10 disabled:opacity-40">Apply (CI)</button>
            </div>
          ) : (pf.reason === 'workflow_missing' || pf.reason === 'no_write') && (
            <button onClick={enableViaFork} disabled={enabling}
              className="flex items-center gap-1.5 bg-brand text-black font-semibold rounded-lg px-3 py-1 text-xs hover:opacity-90 disabled:opacity-40 flex-shrink-0">
              {enabling ? <Loader2 size={12} className="animate-spin" /> : <Gauge size={12} />} Enable via fork
            </button>
          )}
        </div>
      )}
      {err && <p className="text-[11px] text-accent-red break-words">{err}</p>}
      {msg && <p className={clsx('text-[11px] break-words', msg.ok ? 'text-accent-green' : 'text-accent-red')}>{msg.text}</p>}

      {/* live provision runs — polls the effective (fork) repo; status stays in-UI */}
      {runs.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">provision runs</span>
            {hasActive && (
              <span className="inline-flex items-center gap-1 text-[9px] font-medium text-accent-yellow">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />live
              </span>
            )}
            <span className="ml-auto text-[9px] text-gray-500 font-mono">{pf?.repo || repo}</span>
          </div>
          <table className="w-full text-xs"><tbody>
            {runs.slice(0, 5).map(r => (
              <tr key={r.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-1.5 text-[10px] font-mono text-gray-500">{r.event}</td>
                <td className="px-2 py-1.5 text-[10px] text-gray-500">{new Date(r.created).toLocaleString()}</td>
                <td className="px-4 py-1.5 text-right">
                  {r.status !== 'completed'
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-accent-yellow"><Loader2 size={9} className="animate-spin" />{r.status === 'queued' ? 'queued' : 'running'}</span>
                    : <span className={clsx('text-[10px] font-mono font-semibold', conc(r.conclusion))}>{r.conclusion || 'done'}</span>}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {data ? (
        <>
          {/* Hero: readiness gauge + KPI tiles */}
          <div className="bg-surface-1 border border-border rounded-xl p-5 flex items-center gap-6 flex-wrap">
            <ReadinessGauge pct={data.score.pct} />
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-[280px]">
              <KpiTile label="Ready" value={data.score.ok} sub={`of ${data.score.total} checks`} tone="green" />
              <KpiTile label="Partial" value={data.score.partial} tone="yellow" />
              <KpiTile label="Gaps" value={gaps} tone="red" />
              <KpiTile label="AWS" value={data.aws.reachable ? '✓' : '✗'} sub={data.aws.reachable ? (data.aws.account ?? 'connected') : 'unreachable'} tone={data.aws.reachable ? 'green' : 'red'} />
            </div>
          </div>

          {/* Category panels — health-colored, with progress */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(360px,1fr))' }}>
            {Object.entries(data.by_category).map(([cat, s]) => {
              const pct = s.total ? Math.round(s.ok / s.total * 100) : 0
              const bar = pct === 100 ? 'bg-accent-green' : pct > 0 ? 'bg-accent-yellow' : 'bg-accent-red'
              const edge = pct === 100 ? 'border-l-accent-green/60' : pct > 0 ? 'border-l-accent-yellow/60' : 'border-l-accent-red/60'
              return (
                <div key={cat} className={clsx('bg-surface-1 border border-border border-l-2 rounded-xl overflow-hidden', edge)}>
                  <div className="px-4 py-2.5 border-b border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">{cat}</span>
                      <span className="text-[10px] font-mono text-gray-500">{s.ok}/{s.total}</span>
                    </div>
                    <div className="h-1 bg-surface-2 rounded-full overflow-hidden mt-1.5">
                      <div className={clsx('h-full rounded-full transition-all duration-700', bar)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {data.checks.filter(c => c.category === cat).map(c => (
                        <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40 align-top">
                          <td className="pl-4 pr-1 py-2 w-0"><span className={clsx('inline-block w-1.5 h-1.5 rounded-full mt-1', sevDot(c.severity))} title={`${c.severity} severity`} /></td>
                          <td className="pr-2 py-2 w-0"><span className={clsx('inline-block text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded', chip(c.status))}>{c.status}</span></td>
                          <td className="px-2 py-2">
                            <span className="block text-[11px] text-gray-200 leading-snug">{c.title}</span>
                            <span className="block text-[9px] text-gray-600 font-mono mt-0.5">repo:{c.in_repo === null ? 'n/a' : c.in_repo ? 'yes' : 'no'} · aws:{c.in_aws === null ? 'n/a' : c.in_aws ? 'yes' : 'no'}</span>
                            {c.status !== 'OK' && (
                              <div className="mt-0.5 flex items-start gap-2">
                                <span className="block text-[10px] text-accent-yellow/80 flex-1">→ {c.fix}</span>
                                <button onClick={() => askGuide(c)} className="flex-shrink-0 text-[9px] font-medium text-brand hover:underline">Guide me →</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="bg-surface-1 border border-border rounded-xl py-14 flex flex-col items-center justify-center gap-2 text-center">
          <div className="w-11 h-11 rounded-full bg-brand/10 ring-1 ring-brand/20 flex items-center justify-center"><Cloud size={20} className="text-brand" /></div>
          <p className="text-[13px] font-semibold text-gray-200">Score your infra &amp; security posture</p>
          <p className="text-[11px] text-gray-500 max-w-xs">Compares the repo + live AWS against the target and pinpoints exactly which gaps to close.</p>
          <button onClick={analyze} disabled={loading || !repo} className="mt-1 flex items-center gap-1.5 bg-brand text-black font-semibold rounded-lg px-4 py-1.5 text-xs hover:opacity-90 disabled:opacity-40">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Gauge size={13} />} Run Analysis
          </button>
        </div>
      )}

      {/* AI guided setup — one integration at a time */}
      {guide && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setGuide(null)}>
          <div className="bg-surface-1 border border-border rounded-xl w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <ShieldCheck size={15} className="text-brand flex-shrink-0" />
              <span className="text-[13px] font-semibold text-white flex-1 min-w-0 truncate">Configure: {guide.title}</span>
              <button onClick={() => setGuide(null)} className="text-gray-500 hover:text-white text-[18px] leading-none">×</button>
            </div>
            <div className="p-4 overflow-y-auto">
              {guideLoading
                ? <div className="flex items-center gap-2 text-[12px] text-gray-400"><Loader2 size={14} className="animate-spin" /> Generating step-by-step guidance…</div>
                : <pre className="text-[11px] leading-5 text-gray-200 whitespace-pre-wrap font-mono">{guide.guide}</pre>}
            </div>
            <div className="px-4 py-2.5 border-t border-border flex items-center gap-2">
              <button onClick={() => { setGuide(null); analyze() }} disabled={loading}
                className="flex items-center gap-1.5 bg-brand text-black font-semibold rounded-lg px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-40">
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Gauge size={12} />} Re-analyze to verify
              </button>
              <button onClick={() => setGuide(null)} className="text-[11px] text-gray-400 hover:text-white ml-auto">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
