// Provisioning — two execution paths: CI dispatch (default, auditable) and
// break-glass direct apply (opt-in). Repo target toggles between the live
// active repo and a custom/fork. Shows provision.yml run status.
import { useEffect, useState } from 'react'
import { Rocket, ExternalLink, AlertTriangle, Loader2, Copy, Check } from 'lucide-react'
import clsx from 'clsx'
import { useRepoSlug } from '../lib/hooks'

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

// Copy-paste starter to drop into a repo at .github/workflows/provision.yml.
// Inputs match /provision/dispatch. \${ is escaped so the YAML keeps ${{ }}.
const STARTER_YAML = `name: provision
on:
  workflow_dispatch:
    inputs:
      action: { description: "terraform action", type: choice, options: [plan, apply], default: plan }
      build_amis: { description: "build AMIs first", type: boolean, default: false }
      enable_k8s: { description: "enable EKS + cache", type: boolean, default: false }
permissions: { id-token: write, contents: read }
jobs:
  provision:
    runs-on: ubuntu-latest
    environment: \${{ inputs.action == 'apply' && 'production' || '' }}
    env:
      TF_WORKDIR: infra/env/prod        # TODO: your terraform root
      AWS_REGION: us-east-1             # TODO
      TF_VAR_enable_k8s: \${{ inputs.enable_k8s }}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_PROVISION_ROLE_ARN }}   # TODO
          aws-region: \${{ env.AWS_REGION }}
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -backend-config=backend.hcl
        working-directory: \${{ env.TF_WORKDIR }}
      - run: terraform plan -out=tfplan
        working-directory: \${{ env.TF_WORKDIR }}
      - if: \${{ inputs.action == 'apply' }}
        run: terraform apply -auto-approve tfplan
        working-directory: \${{ env.TF_WORKDIR }}
`

type Run = { id: number; status: string; conclusion: string; event: string; created: string; url: string }

const conc = (c: string) =>
  c === 'success' ? 'text-accent-green' : c === 'failure' ? 'text-accent-red' : 'text-accent-yellow'

export default function Provisioning() {
  const repo = useRepoSlug()  // part of gitpulse: always the live active repo

  const [runs, setRuns] = useState<Run[]>([])
  const [buildAmis, setBuildAmis] = useState(false)
  const [enableK8s, setEnableK8s] = useState(false)
  const [bg, setBg] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pf, setPf] = useState<{ ok: boolean; message: string; reason?: string; repo?: string; via_fork?: boolean } | null>(null)
  const [showStarter, setShowStarter] = useState(false)
  const [copiedYaml, setCopiedYaml] = useState(false)
  const [scaffolding, setScaffolding] = useState(false)
  const [prereqs, setPrereqs] = useState<{ checks: Record<string, boolean>; ready: boolean } | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [roleArn, setRoleArn] = useState('')
  const [awsRegion, setAwsRegion] = useState('us-east-2')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [configuring, setConfiguring] = useState(false)
  const [conn, setConn] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [testing, setTesting] = useState('')

  async function createPR() {
    setScaffolding(true); setMsg(null)
    try {
      const r = await fetch(`${API}/provision/scaffold?repo=${encodeURIComponent(repo)}`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j.detail || 'Failed to create PR' }); return }
      const link = j.pr_url || j.compare_url
      const forkNote = j.via_fork ? 'No write on the live repo — opened a PR from your fork. ' : ''
      setMsg({ ok: true, text: forkNote + (link ? `PR ready → ${link}` : 'Branch pushed.') })
      if (j.pr_url) window.open(j.pr_url, '_blank')
      checkPreflight()
    } catch (e: any) { setMsg({ ok: false, text: String(e.message || e) }) }
    finally { setScaffolding(false) }
  }

  async function enableViaFork() {
    setScaffolding(true); setMsg(null)
    try {
      // commit provision.yml straight to the (fork's) default branch → dispatchable now
      const r = await fetch(`${API}/provision/scaffold?repo=${encodeURIComponent(repo)}&to_default=true`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j.detail || 'Failed to enable provisioning' }); return }
      setMsg({ ok: true, text: j.message || `Provisioning enabled on ${j.repo}.` })
      checkPreflight()
    } catch (e: any) { setMsg({ ok: false, text: String(e.message || e) }) }
    finally { setScaffolding(false) }
  }

  async function loadRuns() {
    // Runs execute on the effective repo — the fork when dispatch falls back there.
    const target = pf?.repo || repo
    if (!target) return
    try {
      const r = await fetch(`${API}/provision/runs?repo=${encodeURIComponent(target)}`)
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
  async function loadPrereqs() {
    const t = pf?.repo || repo
    if (!t) return
    try { const r = await fetch(`${API}/provision/prereqs?repo=${encodeURIComponent(t)}`); if (r.ok) setPrereqs(await r.json()) } catch { /* ignore */ }
  }
  async function configureRepo() {
    const t = pf?.repo || repo
    if (!t) return
    setConfiguring(true); setMsg(null)
    try {
      const r = await fetch(`${API}/provision/configure`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: t, role_arn: roleArn || undefined, aws_region: awsRegion || undefined, anthropic_key: anthropicKey || undefined, create_prod_env: true }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j.detail || 'configure failed' }); return }
      const done = Object.entries(j.results || {}).filter(([, v]) => v).map(([k]) => k)
      setMsg({ ok: true, text: `Configured on ${t}: ${done.join(', ') || 'nothing to set'}` })
      setAnthropicKey('')  // don't keep the secret in state
      loadPrereqs()
    } catch (e: any) { setMsg({ ok: false, text: String(e.message || e) }) }
    finally { setConfiguring(false) }
  }
  async function testConn(kind: 'aws' | 'github' | 'ai') {
    setTesting(kind)
    const url = kind === 'ai' ? `${API}/ai/test` : `${API}/provision/${kind}-test`
    try {
      const r = await fetch(url); const j = await r.json().catch(() => ({}))
      const text = j.ok
        ? (kind === 'aws' ? `✓ ${j.account}` : kind === 'github' ? `✓ ${j.login}${j.has_workflow ? ' · workflow✓' : ' · no workflow scope'}` : `✓ ${j.reply || 'ok'}`)
        : `✗ ${j.error || 'failed'}`
      setConn(c => ({ ...c, [kind]: { ok: !!j.ok, text } }))
    } catch (e: any) { setConn(c => ({ ...c, [kind]: { ok: false, text: String(e.message || e) } })) }
    finally { setTesting('') }
  }
  const hasActive = runs.some(r => r.status !== 'completed')
  useEffect(() => { checkPreflight() }, [repo])
  useEffect(() => { loadPrereqs() }, [repo, pf?.repo])
  // Adaptive polling: fast (3s) while a run is queued/in-progress, relaxed (15s) when idle.
  useEffect(() => { loadRuns(); const t = setInterval(loadRuns, hasActive ? 3000 : 15000); return () => clearInterval(t) }, [repo, pf?.repo, hasActive])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t) }, [msg])

  async function dispatch(action: string) {
    setBusy(action); setMsg(null)
    // Backend tries the live repo, then falls back to your fork; it returns a
    // clear message if neither is dispatchable — so we don't hard-block here.
    const r = await fetch(`${API}/provision/dispatch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, action, build_amis: buildAmis, enable_k8s: enableK8s }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setMsg({ ok: false, text: j.detail || 'dispatch failed' }); return }
    setMsg({ ok: true, text: `Dispatched ${action} → ${j.repo || repo}` })
    // burst-refresh so the freshly-dispatched run surfaces promptly (GitHub lags a few s)
    loadRuns(); [1500, 4000, 8000].forEach(d => setTimeout(loadRuns, d))
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
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-brand/10 ring-1 ring-brand/25 flex items-center justify-center">
          <Rocket size={17} className="text-brand" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white leading-tight">Provisioning</h1>
          <p className="text-[11px] text-gray-500">CI dispatch (OIDC · OPA/Trivy/AI gates · approval) · break-glass direct apply</p>
        </div>
      </div>

      {/* Connections — backend integrations; add keys in Settings, verify them live here */}
      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">Connections</span>
        <div className="flex flex-wrap gap-2">
          {(['aws', 'github', 'ai'] as const).map(k => (
            <div key={k} className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
              <button onClick={() => testConn(k)} disabled={testing === k}
                className="flex items-center gap-1 text-[11px] font-medium text-brand hover:underline disabled:opacity-40">
                {testing === k ? <Loader2 size={11} className="animate-spin" /> : null}
                Test {k === 'ai' ? 'Claude' : k.toUpperCase()}
              </button>
              {conn[k] && <span className={clsx('text-[10px] font-mono max-w-[220px] truncate', conn[k].ok ? 'text-accent-green' : 'text-accent-red')}>{conn[k].text}</span>}
            </div>
          ))}
        </div>
        <p className="text-[9px] text-gray-600">Add keys in Settings → AI Provider (Claude) and the repo switcher (GitHub PAT); AWS via backend creds. Test verifies each is live.</p>
      </div>

      {/* Prerequisites — GitPulse sets them on the target repo via the GitHub API (no dashboards) */}
      {prereqs && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">Prerequisites</span>
            <span className={clsx('text-[10px] font-medium', prereqs.ready ? 'text-accent-green' : 'text-accent-yellow')}>
              {prereqs.ready ? '✓ all set' : 'incomplete'}
            </span>
            <button onClick={() => setShowSetup(v => !v)} className="ml-auto text-[10px] text-brand hover:underline">
              {showSetup ? 'hide' : 'configure'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {Object.entries(prereqs.checks).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 text-[10px]">
                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', v ? 'bg-accent-green' : 'bg-accent-red')} />
                <span className="text-gray-400 truncate">{k.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
          {showSetup && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[10px] text-gray-500">GitPulse sets these on <span className="font-mono">{pf?.repo || repo}</span> for you — no GitHub settings needed.</p>
              <input value={roleArn} onChange={e => setRoleArn(e.target.value)} placeholder="AWS_PROVISION_ROLE_ARN (arn:aws:iam::…:role/…)"
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 font-mono text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
              <div className="flex gap-2 flex-wrap">
                <input value={awsRegion} onChange={e => setAwsRegion(e.target.value)} placeholder="AWS_REGION"
                  className="w-32 bg-surface-2 border border-border rounded-lg px-3 py-1.5 font-mono text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
                <input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="ANTHROPIC_API_KEY (agent secret)"
                  className="flex-1 min-w-[180px] bg-surface-2 border border-border rounded-lg px-3 py-1.5 font-mono text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
              </div>
              <button onClick={configureRepo} disabled={configuring}
                className="flex items-center gap-1.5 bg-brand text-black font-semibold rounded-lg px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-40">
                {configuring ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Configure repo
              </button>
              <p className="text-[9px] text-gray-600">Secrets are encrypted (libsodium) before storage in the repo's Actions secrets; also creates the <span className="font-mono">production</span> environment.</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
        {/* active repo — part of gitpulse, no separate repo picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Repo</span>
          <span className="font-mono text-[12px] text-gray-300 bg-surface-2 border border-border rounded-lg px-3 py-1.5">{repo || '—'}</span>
          {pf && !pf.ok && (
            <span className="text-[10px] font-medium text-accent-red">✗ not dispatchable</span>
          )}
        </div>
        {pf && !pf.ok && <p className="text-[10px] text-accent-red/80 leading-snug">{pf.message}</p>}
        {pf && !pf.ok && (pf.reason === 'workflow_missing' || pf.reason === 'no_write') && (
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={enableViaFork} disabled={scaffolding}
                className="flex items-center gap-1.5 bg-brand text-black font-medium rounded-lg px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-40">
                {scaffolding ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />} Enable provisioning via fork
              </button>
              <button onClick={() => setShowStarter(v => !v)} className="text-[10px] text-brand hover:underline">
                {showStarter ? 'hide' : 'show'} starter provision.yml
              </button>
            </div>
            {showStarter && (
              <div className="mt-1.5 border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2 border-b border-border">
                  <span className="text-[10px] font-mono text-gray-500">.github/workflows/provision.yml</span>
                  <div className="flex items-center gap-3">
                    <button onClick={createPR} disabled={scaffolding}
                      className="flex items-center gap-1 text-[10px] font-medium text-brand hover:underline disabled:opacity-50">
                      {scaffolding ? <Loader2 size={11} className="animate-spin" /> : <Rocket size={11} />}{scaffolding ? 'Creating PR…' : 'Create via PR'}
                    </button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(STARTER_YAML).then(() => { setCopiedYaml(true); setTimeout(() => setCopiedYaml(false), 1500) }) }}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white">
                      {copiedYaml ? <Check size={11} className="text-accent-green" /> : <Copy size={11} />}{copiedYaml ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <pre className="text-[10px] leading-4 text-gray-300 font-mono p-3 overflow-x-auto max-h-64 overflow-y-auto">{STARTER_YAML}</pre>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-4 text-[11px] text-gray-400">
          <label className="flex gap-1.5 items-center cursor-pointer"><input type="checkbox" checked={buildAmis} onChange={e => setBuildAmis(e.target.checked)} /> build AMIs first</label>
          <label className="flex gap-1.5 items-center cursor-pointer"><input type="checkbox" checked={enableK8s} onChange={e => setEnableK8s(e.target.checked)} /> enable EKS + cache</label>
        </div>

        {pf !== null && !pf.ok && (
          <p className="text-[10px] text-accent-yellow/90 leading-snug">
            Provisioning can only target a repo you own or a fork — <span className="font-mono">{repo}</span> isn't dispatchable, so Dispatch is disabled.
            {pf.reason === 'no_write'
              ? ' Your token is read-only on it (needs a PAT with write + workflow scope).'
              : ' Use "Create via PR" above to fork it and add provision.yml,'} or switch your active repo (sidebar) to one you control.
          </p>
        )}
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => dispatch('plan')} disabled={!!busy || !repo || (pf !== null && !pf.ok)}
            title={pf !== null && !pf.ok ? 'Not dispatchable — see note above' : undefined}
            className="flex items-center gap-1.5 bg-brand text-black font-medium rounded-lg px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-40">
            {busy === 'plan' ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />} Dispatch Plan
          </button>
          <button onClick={() => dispatch('apply')} disabled={!!busy || !repo || (pf !== null && !pf.ok)}
            title={pf !== null && !pf.ok ? 'Not dispatchable — see note above' : undefined}
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
          {pf?.via_fork && <span className="text-[9px] text-gray-500 font-mono">on fork</span>}
          {hasActive && (
            <span className="inline-flex items-center gap-1 text-[9px] font-medium text-accent-yellow">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />live
            </span>
          )}
          <span className="ml-auto text-[10px] text-gray-500 font-mono">{pf?.repo || repo}</span>
        </div>
        {runs.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-500">No provision runs yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-4 py-2">Event</th>
                <th className="text-left text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-2">Started</th>
                <th className="text-right text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-2">Status</th>
                <th className="px-4 py-2 w-0"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40">
                  <td className="px-4 py-2 text-[10px] font-mono text-gray-500">{r.event}</td>
                  <td className="px-2 py-2 text-[10px] text-gray-500">{new Date(r.created).toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">
                    {r.status !== 'completed'
                      ? <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-accent-yellow"><Loader2 size={10} className="animate-spin" />{r.status === 'queued' ? 'queued' : 'running'}</span>
                      : <span className={clsx('text-[11px] font-mono font-semibold', conc(r.conclusion))}>{r.conclusion || 'done'}</span>}
                  </td>
                  <td className="px-4 py-2 text-right"><a href={r.url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-brand inline-flex"><ExternalLink size={11} /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
