import { useQuery } from '@tanstack/react-query'
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Lock,
  Key, Eye, GitBranch, Zap, TrendingUp, ExternalLink,
  AlertCircle, Info, Activity,
} from 'lucide-react'
import { getSecurityOverview, getActiveRepo } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

// ── Helpers ────────────────────────────────────────────────────────────────────

const SEV_STYLE: Record<string, { text: string; bg: string; border: string; dot: string }> = {
  critical: { text: 'text-accent-red',   bg: 'bg-accent-red/10',   border: 'border-accent-red/25',   dot: 'bg-accent-red'   },
  high:     { text: 'text-orange-300',   bg: 'bg-orange-400/10',   border: 'border-orange-400/25',   dot: 'bg-orange-400'   },
  medium:   { text: 'text-gray-300',     bg: 'bg-surface-3',       border: 'border-border',           dot: 'bg-gray-400'     },
  low:      { text: 'text-gray-500',     bg: 'bg-surface-2',       border: 'border-border',           dot: 'bg-gray-600'     },
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle size={12} className="text-accent-green flex-shrink-0" />,
  warn: <AlertTriangle size={12} className="text-orange-300 flex-shrink-0" />,
  fail: <XCircle size={12} className="text-accent-red flex-shrink-0" />,
}

const STATUS_ROW: Record<string, string> = {
  pass: 'bg-accent-green/[.04] ring-1 ring-accent-green/20',
  warn: 'bg-orange-400/[.04] ring-1 ring-orange-400/20',
  fail: 'bg-accent-red/[.05] ring-1 ring-accent-red/20',
}

function scoreColor(score: number): string {
  if (score >= 80) return '#E0FF4F'
  if (score >= 60) return '#E0FF4F'
  if (score >= 40) return '#ff8c00'
  return '#ff1b2d'
}

function gradientStops(score: number): [string, string] {
  if (score >= 70) return ['#E0FF4F', '#c8e63d']
  if (score >= 45) return ['#ff8c00', '#ffd000']
  return ['#ff1b2d', '#ff6b00']
}

// ── Score ring ─────────────────────────────────────────────────────────────────

function ScoreRing({ score, grade, label }: { score: number; grade: string; label: string }) {
  const r = 30, stroke = 5, circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = scoreColor(score)
  const [c1, c2] = gradientStops(score)
  const gid = `sec-ring-${score}`
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg width="80" height="80" className="-rotate-90">
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor={c1} />
              <stop offset="100%" stopColor={c2} />
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e4e2" strokeWidth={stroke} />
          <circle cx="40" cy="40" r={r} fill="none"
            stroke={c1} strokeWidth={stroke + 3} strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round" opacity="0.15" />
          <circle cx="40" cy="40" r={r} fill="none"
            stroke={`url(#${gid})`} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.16,1,0.3,1)' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black" style={{ color }}>{score}</span>
          <span className="text-[9px] text-gray-400 -mt-0.5">/ 100</span>
        </div>
      </div>
      <p className="text-[11px] font-bold" style={{ color }}>{grade} · {label}</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SecurityCompliance() {
  const slug = useRepoSlug()
  const { data, isLoading, isError } = useQuery({
    queryKey: [slug, 'security-overview'],
    queryFn: getSecurityOverview,
    staleTime: 300_000,
    refetchInterval: 600_000,
  })
  const { data: active } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })

  const ghBase = active?.active
    ? `https://github.com/${active.active.owner}/${active.active.repo}`
    : null

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded-full border border-accent-blue border-t-transparent animate-spin" />
        Loading security data…
      </div>
    )
  }

  if (isError) return <p className="text-[11px] text-accent-red py-4">Failed to load security data</p>

  if (!data) return null

  const { score, grade, label, compliance, dependabot, code_scanning,
          secret_scanning, branch_protection, workflow_security, features, recommendations } = data

  const failedChecks = compliance.checks.filter((c: any) => c.status === 'fail')
  const warnChecks   = compliance.checks.filter((c: any) => c.status === 'warn')
  const passChecks   = compliance.checks.filter((c: any) => c.status === 'pass')

  return (
    <div className="space-y-4">

      {/* ── Section header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Shield size={14} className="text-accent-blue" />
        <h2 className="text-xs font-bold text-white uppercase tracking-wider">Security &amp; Compliance</h2>
        <span className="text-[10px] text-gray-400">— posture score, vulnerability alerts &amp; hardening roadmap</span>
      </div>

      {/* ── Row 1: Score + Compliance summary + Vulnerability counts ──────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Score + grade */}
        <div className="col-span-3 bg-surface-1 border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Security Score</p>
          <ScoreRing score={score} grade={grade} label={label} />
          <div className="grid grid-cols-3 gap-1 w-full text-center">
            <div className="bg-accent-red/10 border border-accent-red/20 rounded p-1.5">
              <p className="text-sm font-black text-accent-red">{compliance.failed}</p>
              <p className="text-[9px] text-gray-500">Failed</p>
            </div>
            <div className="bg-orange-400/10 border border-orange-400/20 rounded p-1.5">
              <p className="text-sm font-black text-orange-300">{compliance.warned}</p>
              <p className="text-[9px] text-gray-500">Warned</p>
            </div>
            <div className="bg-accent-green/10 border border-accent-green/20 rounded p-1.5">
              <p className="text-sm font-black text-accent-green">{compliance.passed}</p>
              <p className="text-[9px] text-gray-500">Passed</p>
            </div>
          </div>
        </div>

        {/* Vulnerability alert counts */}
        <div className="col-span-4 bg-surface-1 border border-border rounded-xl p-4 space-y-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Vulnerability Alerts</p>

          <AlertBlock
            icon={<Key size={13} />}
            label="Dependabot (open)"
            total={dependabot.total}
            counts={dependabot.counts}
            enabled={dependabot.enabled}
          />
          <AlertBlock
            icon={<Eye size={13} />}
            label="Code Scanning (CodeQL)"
            total={code_scanning.total}
            counts={code_scanning.counts}
            enabled={code_scanning.enabled}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock size={13} className={secret_scanning.total > 0 ? 'text-accent-red' : 'text-gray-500'} />
              <span className="text-[11px] text-gray-300">Secret Scanning</span>
              {!secret_scanning.enabled && (
                <span className="text-[9px] text-orange-300 bg-orange-400/10 border border-orange-400/20 px-1.5 py-0.5 rounded">Not enabled</span>
              )}
            </div>
            <span className={`text-[13px] font-black tabular-nums ${secret_scanning.total > 0 ? 'text-accent-red' : 'text-accent-green'}`}>
              {secret_scanning.total > 0 ? `${secret_scanning.total} open` : 'Clean'}
            </span>
          </div>
          {secret_scanning.total > 0 && (
            <p className="text-[10px] text-accent-red ml-5">Types: {secret_scanning.types.join(', ')}</p>
          )}
        </div>

        {/* Security features + workflow */}
        <div className="col-span-5 bg-surface-1 border border-border rounded-xl p-4 space-y-2.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Security Features</p>
          <FeatureRow label="GitHub Advanced Security"           on={features.advanced_security} />
          <FeatureRow label="Secret Scanning"                    on={features.secret_scanning} />
          <FeatureRow label="Secret Scanning Push Protection"    on={features.secret_scanning_push_protect} />
          <FeatureRow label="Private Vulnerability Reporting"    on={features.private_vulnerability_reporting} />
          <div className="border-t border-border my-1" />
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Workflow Security</p>
          <FeatureRow
            label="Default permissions: read-only"
            on={workflow_security.default_permissions === 'read'}
            warn={workflow_security.default_permissions === 'write'}
          />
          <FeatureRow label="OIDC token auth configured"        on={workflow_security.oidc_configured} warn={!workflow_security.oidc_configured} />
          <FeatureRow label="Fork PR approval required"         on={!workflow_security.can_approve_pr_reviews} />
          <div className="mt-1 text-[10px] text-gray-400">
            {workflow_security.workflow_count} workflow{workflow_security.workflow_count !== 1 ? 's' : ''} configured
          </div>
        </div>
      </div>

      {/* ── Row 2: Branch protection + Compliance checks ──────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Branch protection */}
        <div className="col-span-4 bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch size={12} className="text-accent-blue" />
            <p className="text-[11px] font-semibold text-white">Branch Protection</p>
          </div>
          <div className="space-y-3">
            {branch_protection.map((bp: any) => (
              <div key={bp.branch} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-semibold text-white">{bp.branch}</span>
                  {bp.enabled
                    ? <span className="text-[9px] text-accent-green bg-accent-green/10 border border-accent-green/20 px-1.5 py-0.5 rounded font-semibold">Protected</span>
                    : <span className="text-[9px] text-accent-red bg-accent-red/10 border border-accent-red/20 px-1.5 py-0.5 rounded font-semibold">Unprotected</span>
                  }
                </div>
                <div className="grid grid-cols-2 gap-1 ml-0.5">
                  {[
                    ['PR reviews required',      bp.require_pr_reviews],
                    [`${bp.required_approvals} approver(s)`, bp.required_approvals > 0],
                    ['Stale reviews dismissed',  bp.dismiss_stale_reviews],
                    ['Status checks required',   bp.require_status_checks],
                    ['Enforce admins',           bp.enforce_admins],
                    ['Force push blocked',       !bp.allow_force_push],
                  ].map(([name, ok]) => (
                    <div key={String(name)} className="flex items-center gap-1">
                      {ok
                        ? <CheckCircle size={9} className="text-accent-green flex-shrink-0" />
                        : <XCircle    size={9} className="text-accent-red flex-shrink-0"   />}
                      <span className={`text-[9px] ${ok ? 'text-gray-400' : 'text-gray-400'}`}>{name as string}</span>
                    </div>
                  ))}
                </div>
                {ghBase && (
                  <a href={`${ghBase}/settings/branches`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[9px] text-accent-blue hover:underline mt-1">
                    <ExternalLink size={8} /> Configure branch rules
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Compliance check list */}
        <div className="col-span-8 bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-accent-blue" />
              <p className="text-[11px] font-semibold text-white">Compliance Checks</p>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1 text-accent-red"><XCircle size={10} /> {compliance.failed} failed</span>
              <span className="flex items-center gap-1 text-orange-300"><AlertTriangle size={10} /> {compliance.warned} warned</span>
              <span className="flex items-center gap-1 text-accent-green"><CheckCircle size={10} /> {compliance.passed} passed</span>
            </div>
          </div>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
            {[...failedChecks, ...warnChecks, ...passChecks].map((c: any) => {
              const sev = SEV_STYLE[c.severity] ?? SEV_STYLE.medium
              return (
                <div key={c.id} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${STATUS_ROW[c.status] ?? ''}`}>
                  {STATUS_ICON[c.status]}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white leading-snug">{c.name}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{c.details}</p>
                  </div>
                  <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border capitalize ${sev.bg} ${sev.text} ${sev.border}`}>
                    {c.severity}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Row 3: Dependabot alerts + Recommendations ───────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Dependabot detail */}
        {dependabot.items?.length > 0 && (
          <div className="col-span-5 bg-surface-1 border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={12} className="text-accent-red" />
              <p className="text-[11px] font-semibold text-white">Open Dependabot Alerts</p>
            </div>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {dependabot.items.map((item: any, i: number) => {
                const sev = SEV_STYLE[item.severity] ?? SEV_STYLE.medium
                return (
                  <div key={i} className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${sev.bg} ${sev.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${sev.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[10px] font-semibold text-white font-mono">{item.pkg}</p>
                        {item.cve && <span className="text-[9px] text-gray-500 font-mono">{item.cve}</span>}
                      </div>
                      <p className="text-[9px] text-gray-500 mt-0.5 leading-snug">{item.summary}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-[9px] font-bold capitalize ${sev.text}`}>{item.severity}</span>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={9} className="text-accent-blue hover:text-white transition-colors" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recommendations / improvement plan */}
        <div className={`${dependabot.items?.length > 0 ? 'col-span-7' : 'col-span-12'} bg-surface-1 border border-border rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={12} className="text-accent-green" />
            <p className="text-[11px] font-semibold text-white">Security Hardening Roadmap</p>
            <span className="text-[10px] text-gray-400">— ordered by risk reduction impact</span>
          </div>
          {recommendations.length > 0 ? (
            <div className="space-y-2">
              {recommendations.map((rec: any, i: number) => {
                const sev = SEV_STYLE[rec.priority] ?? SEV_STYLE.medium
                return (
                  <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${sev.bg} ${sev.border}`}>
                    <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border capitalize mt-0.5 ${sev.bg} ${sev.text} ${sev.border}`}>
                      {rec.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-semibold leading-snug ${sev.text}`}>{rec.action}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{rec.why}</p>
                    </div>
                    <span className={`flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded border capitalize
                      ${rec.effort === 'low'
                        ? 'text-accent-green bg-accent-green/10 border-accent-green/20'
                        : 'text-gray-300 bg-surface-3 border-border'}`}>
                      {rec.effort} effort
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-6 justify-center text-accent-green text-[11px]">
              <CheckCircle size={14} /> No critical security actions required
            </div>
          )}
          {ghBase && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-3 text-[10px] text-gray-500">
              <a href={`${ghBase}/security`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white transition-colors">
                <ExternalLink size={10} /> GitHub Security tab
              </a>
              <a href={`${ghBase}/security/dependabot`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white transition-colors">
                <ExternalLink size={10} /> Dependabot alerts
              </a>
              <a href={`${ghBase}/settings/security_analysis`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white transition-colors">
                <ExternalLink size={10} /> Security settings
              </a>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function AlertBlock({ icon, label, total, counts, enabled }: {
  icon: React.ReactNode; label: string; total: number; counts: Record<string,number>; enabled: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-gray-400">
          {icon}
          <span className="text-[11px]">{label}</span>
          {!enabled && <span className="text-[9px] text-orange-300 bg-orange-400/10 border border-orange-400/20 px-1 py-0.5 rounded">Unavailable</span>}
        </div>
        <span className={`text-[13px] font-black tabular-nums ${total > 0 ? 'text-accent-red' : 'text-accent-green'}`}>
          {enabled ? (total > 0 ? total : 'Clean') : '—'}
        </span>
      </div>
      {enabled && total > 0 && (
        <div className="flex gap-1.5 ml-5 flex-wrap">
          {(['critical','high','medium','low'] as const).map(s => counts[s] > 0 && (
            <span key={s} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border capitalize ${SEV_STYLE[s].bg} ${SEV_STYLE[s].text} ${SEV_STYLE[s].border}`}>
              {counts[s]} {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function FeatureRow({ label, on, warn }: { label: string; on: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-gray-400 truncate">{label}</span>
      {on
        ? <CheckCircle size={11} className="text-accent-green flex-shrink-0" />
        : warn
        ? <AlertTriangle size={11} className="text-orange-300 flex-shrink-0" />
        : <XCircle size={11} className="text-accent-red flex-shrink-0" />}
    </div>
  )
}
