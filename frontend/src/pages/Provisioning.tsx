// frontend/src/pages/Provisioning.tsx
// Two execution paths: CI dispatch (default, auditable) and break-glass direct
// apply (opt-in). Shows provision.yml run status.
import { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

type Run = { id: number; status: string; conclusion: string; event: string; created: string; url: string };

export default function Provisioning() {
  const [repo, setRepo] = useState("schundu007/rocm-ci");
  const [runs, setRuns] = useState<Run[]>([]);
  const [buildAmis, setBuildAmis] = useState(false);
  const [enableK8s, setEnableK8s] = useState(false);
  const [bg, setBg] = useState(false);        // break-glass panel
  const [adminToken, setAdminToken] = useState(""); // X-Admin-Token for break-glass
  const [busy, setBusy] = useState("");

  async function loadRuns() {
    try {
      const r = await fetch(`${API}/provision/runs?repo=${encodeURIComponent(repo)}`);
      if (r.ok) setRuns(await r.json());
    } catch {}
  }
  useEffect(() => { loadRuns(); const t = setInterval(loadRuns, 15000); return () => clearInterval(t); }, [repo]);

  async function dispatch(action: string) {
    setBusy(action);
    const r = await fetch(`${API}/provision/dispatch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, action, build_amis: buildAmis, enable_k8s: enableK8s }),
    });
    setBusy("");
    alert(r.ok ? `Dispatched (${action})` : `Failed: ${await r.text()}`);
    loadRuns();
  }

  async function breakGlass() {
    if (!adminToken) { alert("Admin token required for break-glass (X-Admin-Token / PROVISION_ADMIN_TOKEN)."); return; }
    if (!confirm("BREAK-GLASS: run terraform apply directly on the server, bypassing CI approval. Continue?")) return;
    setBusy("bg-apply");
    const authHeaders = { "Content-Type": "application/json", "X-Admin-Token": adminToken };
    // plan first (runs AI risk gate), then apply with confirm (apply re-runs the gate server-side)
    const p = await fetch(`${API}/provision/plan`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({}),
    });
    if (!p.ok) { setBusy(""); alert(`plan failed: ${await p.text()}`); return; }
    const a = await fetch(`${API}/provision/apply`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ confirm: true, var_enable_k8s: enableK8s }),
    });
    setBusy("");
    alert(a.ok ? "Applied (break-glass)." : `apply failed: ${await a.text()}`);
  }

  const conc = (c: string) =>
    c === "success" ? "text-emerald-400" : c === "failure" ? "text-rose-400" : "text-amber-400";

  return (
    <div className="p-6 max-w-5xl mx-auto text-slate-200">
      <h1 className="text-xl font-semibold">Provisioning</h1>
      <p className="text-sm text-slate-400 mb-4">
        Default path = dispatch the CI pipeline (OIDC + OPA/Trivy/AI gates + environment approval). Break-glass = direct apply.
      </p>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
        <input className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm mb-3"
               value={repo} onChange={e => setRepo(e.target.value)} />
        <div className="flex gap-4 text-sm mb-3">
          <label className="flex gap-2 items-center"><input type="checkbox" checked={buildAmis} onChange={e => setBuildAmis(e.target.checked)} /> build AMIs first</label>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={enableK8s} onChange={e => setEnableK8s(e.target.checked)} /> enable EKS+cache</label>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => dispatch("plan")} disabled={!!busy}
                  className="bg-cyan-500 text-slate-900 font-semibold rounded-lg px-4 py-2">
            {busy === "plan" ? "…" : "Dispatch Plan"}
          </button>
          <button onClick={() => dispatch("apply")} disabled={!!busy}
                  className="border border-amber-600 text-amber-300 rounded-lg px-4 py-2">
            {busy === "apply" ? "…" : "Dispatch Apply (needs approval)"}
          </button>
          <button onClick={() => setBg(!bg)} className="ml-auto text-xs text-slate-500 underline">
            {bg ? "hide" : "show"} break-glass
          </button>
        </div>
        {bg && (
          <div className="mt-3 border border-rose-800 bg-rose-950/30 rounded-lg p-3">
            <div className="text-rose-300 text-sm font-semibold mb-1">Break-glass (direct apply)</div>
            <div className="text-xs text-slate-400 mb-2">
              Bypasses CI approval. Runs server-side terraform plan (with AI risk gate) then apply. Use only for demos/urgent fixes.
            </div>
            <input type="password" value={adminToken} onChange={e => setAdminToken(e.target.value)}
                   placeholder="X-Admin-Token (PROVISION_ADMIN_TOKEN)"
                   className="w-full bg-slate-950 border border-rose-800 rounded-lg px-3 py-2 font-mono text-xs mb-2" />
            <button onClick={breakGlass} disabled={!!busy}
                    className="bg-rose-600 text-white rounded-lg px-4 py-2 text-sm">
              {busy === "bg-apply" ? "applying…" : "Plan + Apply directly"}
            </button>
          </div>
        )}
      </div>

      <h2 className="text-sm font-mono uppercase tracking-wide text-slate-400 mb-2">provision.yml runs</h2>
      <div className="space-y-2">
        {runs.map(r => (
          <a key={r.id} href={r.url} target="_blank" rel="noreferrer"
             className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm hover:border-slate-600">
            <span className="font-mono text-xs text-slate-500">{r.event} · {new Date(r.created).toLocaleString()}</span>
            <span className={`font-mono text-xs ${conc(r.conclusion)}`}>{r.conclusion || r.status}</span>
          </a>
        ))}
        {runs.length === 0 && <div className="text-slate-600 text-sm">no runs yet</div>}
      </div>
    </div>
  );
}
