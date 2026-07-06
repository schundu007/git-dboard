// frontend/src/pages/InfraGap.tsx
// Current-vs-target infra/security gap analysis for a connected repo.
// Repo status is sourced upstream (GitPulse/GitHub); this page shows the
// INFRA/SECURITY delta and lets you provision the gaps. No repo re-analysis.
import { useState } from "react";

type Check = {
  id: string; category: string; title: string; target: string; fix: string;
  severity: "low" | "medium" | "high"; status: "OK" | "PARTIAL" | "GAP";
  in_repo: boolean | null; in_aws: boolean | null;
};
type GapReport = {
  aws: { reachable: boolean; account?: string; error?: string };
  score: { ok: number; partial: number; total: number; pct: number };
  by_category: Record<string, { ok: number; total: number }>;
  checks: Check[];
  actions: { id: string; title: string; fix: string; severity: string; status: string }[];
};

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
const chip = (s: string) =>
  s === "OK" ? "bg-emerald-900/40 text-emerald-300 border-emerald-700"
  : s === "PARTIAL" ? "bg-amber-900/40 text-amber-300 border-amber-700"
  : "bg-rose-900/40 text-rose-300 border-rose-700";

export default function InfraGap() {
  const [repo, setRepo] = useState("schundu007/rocm-ci");
  const [prefix, setPrefix] = useState("myrock");
  const [data, setData] = useState<GapReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function analyze() {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/gap/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, prefix }),
      });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e: any) { setErr(String(e.message || e)); }
    finally { setLoading(false); }
  }

  async function provision(action: string) {
    const r = await fetch(`${API}/provision/dispatch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo, action }),
    });
    alert(r.ok ? `Dispatched provision.yml (${action}). Check Actions.` : `Failed: ${await r.text()}`);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto text-slate-200">
      <h1 className="text-xl font-semibold">Infra & Security Gap</h1>
      <p className="text-sm text-slate-400 mb-4">
        Current (repo + live AWS) vs target (rocm-ci). Repo status comes from GitPulse; this scores the infra/security delta.
      </p>

      <div className="flex flex-wrap gap-2 items-center bg-slate-900 border border-slate-700 rounded-xl p-3 mb-4">
        <input className="flex-1 min-w-[220px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm"
               value={repo} onChange={e => setRepo(e.target.value)} placeholder="owner/repo" />
        <input className="w-40 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm"
               value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="aws prefix" />
        <button onClick={analyze} className="bg-cyan-500 text-slate-900 font-semibold rounded-lg px-4 py-2">
          {loading ? "Analyzing…" : "Analyze"}
        </button>
        <button onClick={() => provision("plan")} className="border border-slate-600 rounded-lg px-3 py-2 text-sm">Plan (CI)</button>
        <button onClick={() => provision("apply")} className="border border-amber-600 text-amber-300 rounded-lg px-3 py-2 text-sm">Apply (CI)</button>
      </div>

      {err && <div className="text-rose-400 text-sm mb-3">{err}</div>}

      {data && (
        <>
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="text-3xl font-bold">{data.score.ok}/{data.score.total}</div>
            <div className="flex-1 min-w-[180px] h-2 bg-slate-800 rounded overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${data.score.pct}%` }} />
            </div>
            <div className="font-mono text-xs text-slate-400">
              {data.score.pct}% ready · {data.score.partial} partial ·
              AWS {data.aws.reachable ? `✓ ${data.aws.account}` : "✗ unreachable"}
            </div>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
            {Object.keys(data.by_category).map(cat => (
              <div key={cat} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-mono text-xs uppercase tracking-wide text-slate-400">{cat}</span>
                  <span className="font-mono text-xs text-slate-500">
                    {data.by_category[cat].ok}/{data.by_category[cat].total}
                  </span>
                </div>
                {data.checks.filter(c => c.category === cat).map(c => (
                  <div key={c.id} className="border border-slate-800 rounded-lg p-2.5 mb-2 bg-slate-950/50">
                    <div className="flex gap-2 items-start">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${chip(c.status)}`}>{c.status}</span>
                      <span className="text-sm break-words">{c.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-mono">
                      repo:{c.in_repo === null ? "n/a" : c.in_repo ? "yes" : "no"} · aws:{c.in_aws === null ? "n/a" : c.in_aws ? "yes" : "no"}
                    </div>
                    {c.status !== "OK" && <div className="text-xs text-amber-300/80 mt-1 break-words">→ {c.fix}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
