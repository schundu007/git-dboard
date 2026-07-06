// Provisioning — two execution paths: CI dispatch (default, auditable) and
// break-glass direct apply (opt-in). Repo target toggles between the live
// active repo and a custom/fork. Shows provision.yml run status.
import { useEffect, useState } from 'react'
import { Rocket, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { useRepoSlug } from '../lib/hooks'

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

type Run = { id: number; status: string; conclusion: string; event: string; created: string; url: string }

const conc = (c: string) =>
  c === 'success' ? 'text-accent-green' : c === 'failure' ? 'text-accent-red' : 'text-accent-yellow'

export default function Provisioning() {
  const activeSlug = useRepoSlug()
  const [mode, setMode] = useState<'active' | 'custom'>('active')
  const [custom, setCustom] = useState('schundu007/rocm-ci')
  const repo = mode === 'active' ? activeSlug : custom

  const [runs, setRuns] = useState<Run[]>([])
  const [buildAmis, setBuildAmis] = useState(false)
  const [enableK8s, setEnableK8s] = useState(false)
  const [bg, setBg] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pf, setPf] = useState<{ ok: boolean; message: string } | null>(null)

  async function loadRuns() {
    if (!repo) return
    try {
      const r = await fetch(`${API}/provision/runs?repo=${encodeURIComponent(repo)}`)
      if (r.ok) setRuns(await r.json())
    } catch { /* ignore */ }
  }
  async function checkPreflight() {
    if (!repo) { setPf(null); return }
    try {
      const r = await fetch(`${API}/provision/preflight?repo=${encodeURIComponent(repo)}`)
      setPf(await r.json())
    } catch { setPf(null) }
  }
  useEffect(() => { loadRuns(); checkPreflight(); const t = setInterval(loadRuns, 15000); return () => clearInterval(t) }, [repo])

  async function dispatch(action: string) {
    setBusy(action); setMsg(null)
    // preflight: verify repo + provision.yml before dispatching (avoids raw 404)
    try {
      const pr = await (await fetch(`${API}/provision/preflight?repo=${encodeURIComponent(repo)}`)).json()
      setPf(pr)
      if (!pr.ok) { setBusy(''); setMsg({ ok: false, text: pr.message }); return }
    } catch { /* fall through to dispatch */ }
    const r = await fetch(`${API}/provision/dispatch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, action, build_amis: buildAmis, enable_k8s: enableK8s }),
    })
    setBusy('')
    setMsg({ ok: r.ok, text: r.ok ? `Dispatched provision.yml (${action}) → ${repo}` : `Failed: ${await r.text()}` })
    loadRuns()
  }

  async function breakGlass() {
    if (!adminToken) { setMsg({ ok: false, text: 'Admin token required for break-glass (X-Admin-Token / PROVISION_ADMIN_TOKEN).' }); return }
    if (!confirm('BREAK-GLASS: run terraform apply directly on the server, bypassing CI approval. Continue?')) return
    setBusy('bg-apply'); setMsg(null)
    const authHeaders = { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken }
    const p = await fetch(`${API}/provision/plan`, { method: 'POST', headers: authHeaders, body: JSON.stringify({}) })
    if (!p.ok) { setBusy(''); setMsg({ ok: false, text: `plan failed: ${await p.text()}` }); return }
    const a = await fetch(`${API}/provision/apply`, {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ confirm: true, var_enable_k8s: enableK8s }),
    })
    setBusy('')
    setMsg({ ok: a.ok, text: a.ok ? 'Applied (break-glass).' : `apply failed: ${await a.text()}` })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Rocket size={18} className="text-nvidia" />
        <h1 className="text-lg font-semibold text-white">Provisioning</h1>
        <span className="text-[11px] text-gray-500 ml-1">CI dispatch (OIDC + OPA/Trivy/AI gates + approval) · break-glass direct apply</span>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
        {/* repo target toggle — both options */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Target repo</span>
          <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5">
            {(['active', 'custom'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={clsx('px-2.5 py-0.5 rounded text-[10px] transition-colors', mode === m ? 'bg-surface-3 text-white' : 'text-gray-500 hover:text-gray-300')}>
                {m === 'active' ? 'Active repo' : 'Custom / fork'}
              </button>
            ))}
          </div>
          {mode === 'active' ? (
            <span className="font-mono text-[12px] text-gray-300 bg-surface-2 border border-border rounded-lg px-3 py-1.5">{activeSlug || '—'}</span>
          ) : (
            <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="owner/repo"
              className="flex-1 min-w-[220px] bg-surface-2 border border-border rounded-lg px-3 py-1.5 font-mono text-[12px] text-white placeholder-gray-600 focus:outline-none focus:border-nvidia/50" />
          )}
          {pf && (
            <span className={clsx('text-[10px] font-medium', pf.ok ? 'text-accent-green' : 'text-accent-red')}>
              {pf.ok ? '✓ provision.yml ready' : '✗ not dispatchable'}
            </span>
          )}
        </div>
        {pf && !pf.ok && <p className="text-[10px] text-accent-red/80 leading-snug">{pf.message}</p>}

        <div className="flex gap-4 text-[11px] text-gray-400">
          <label className="flex gap-1.5 items-center cursor-pointer"><input type="checkbox" checked={buildAmis} onChange={e => setBuildAmis(e.target.checked)} /> build AMIs first</label>
          <label className="flex gap-1.5 items-center cursor-pointer"><input type="checkbox" checked={enableK8s} onChange={e => setEnableK8s(e.target.checked)} /> enable EKS + cache</label>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => dispatch('plan')} disabled={!!busy || !repo}
            className="flex items-center gap-1.5 bg-nvidia text-black font-medium rounded-lg px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-40">
            {busy === 'plan' ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />} Dispatch Plan
          </button>
          <button onClick={() => dispatch('apply')} disabled={!!busy || !repo}
            className="border border-accent-yellow/50 text-accent-yellow rounded-lg px-3 py-1.5 text-xs hover:bg-accent-yellow/10 disabled:opacity-40">
            {busy === 'apply' ? '…' : 'Dispatch Apply (needs approval)'}
          </button>
          <button onClick={() => setBg(!bg)} className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 underline">
            {bg ? 'hide' : 'show'} break-glass
          </button>
        </div>

        {bg && (
          <div className="border border-accent-red/30 bg-accent-red/[0.05] rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-accent-red text-[11px] font-semibold"><AlertTriangle size={12} /> Break-glass (direct apply)</div>
            <p className="text-[10px] text-gray-500">Bypasses CI approval. Runs server-side terraform plan (with AI risk gate) then apply. Demos / urgent fixes only.</p>
            <input type="password" value={adminToken} onChange={e => setAdminToken(e.target.value)}
              placeholder="X-Admin-Token (PROVISION_ADMIN_TOKEN)"
              className="w-full bg-surface-2 border border-accent-red/30 rounded-lg px-3 py-1.5 font-mono text-[11px] text-white placeholder-gray-600 focus:outline-none" />
            <button onClick={breakGlass} disabled={!!busy}
              className="bg-accent-red text-white rounded-lg px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-40">
              {busy === 'bg-apply' ? 'applying…' : 'Plan + Apply directly'}
            </button>
          </div>
        )}

        {msg && <p className={clsx('text-[11px]', msg.ok ? 'text-accent-green' : 'text-accent-red')}>{msg.text}</p>}
      </div>

      {/* runs */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">provision.yml runs</span>
          <span className="ml-auto text-[10px] text-gray-500 font-mono">{repo}</span>
        </div>
        {runs.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-500">No provision runs yet.</div>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40">
                  <td className="px-4 py-2 text-[10px] font-mono text-gray-500">{r.event}</td>
                  <td className="px-2 py-2 text-[10px] text-gray-500">{new Date(r.created).toLocaleString()}</td>
                  <td className="px-2 py-2 text-right"><span className={clsx('text-[11px] font-mono font-semibold', conc(r.conclusion))}>{r.conclusion || r.status}</span></td>
                  <td className="px-4 py-2 text-right"><a href={r.url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-nvidia inline-flex"><ExternalLink size={11} /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
