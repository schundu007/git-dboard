import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield, AlertTriangle, CheckCircle, XCircle, AlertCircle,
  Lock, Key, Eye, GitBranch, Zap, Info, ExternalLink,
  ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronRight,
} from 'lucide-react'
import { getSecurityOverview } from '../lib/api'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComplianceCheck {
  id: string
  name: string
  status: 'pass' | 'warn' | 'fail'
  severity: 'critical' | 'high' | 'medium' | 'low'
  details: string
}

interface DependabotItem {
  pkg: string
  severity: string
  summary: string
  cve: string
  url: string
}

interface BranchProtection {
  branch: string
  enabled: boolean
  required_approvals: number
  require_status_checks: boolean
  allow_force_push: boolean
  dismiss_stale_reviews: boolean
  require_code_owner_reviews: boolean
  required_checks: string[]
}

interface Recommendation {
  priority: 'critical' | 'high' | 'medium'
  action: string
  why: string
  effort: 'low' | 'medium' | 'high'
}

interface SecurityData {
  score: number
  grade: string
  label: string
  compliance: {
    passed: number
    warned: number
    failed: number
    total: number
    checks: ComplianceCheck[]
  }
  dependabot: {
    total: number
    enabled: boolean
    counts: { critical: number; high: number; medium: number; low: number }
    items: DependabotItem[]
  }
  code_scanning: {
    total: number
    enabled: boolean
    counts: { critical?: number; high?: number; medium?: number; low?: number }
  }
  secret_scanning: {
    total: number
    enabled: boolean
    types: string[]
  }
  branch_protection: BranchProtection[]
  workflow_security: {
    default_permissions: string
    can_approve_pr_reviews: boolean
    oidc_configured: boolean
    workflow_count: number
  }
  features: Record<string, boolean>
  recommendations: Recommendation[]
}

// ── Meta maps ─────────────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/30',
  medium:   'bg-surface-2 text-neutral-400 border-border',
  low:      'bg-surface-2 text-neutral-600 border-border',
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/30',
  medium:   'bg-surface-2 text-neutral-400 border-border',
}

const EFFORT_BADGE: Record<string, string> = {
  low:    'bg-accent-green/10 text-accent-green border-accent-green/30',
  medium: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30',
  high:   'bg-accent-red/10 text-accent-red border-accent-red/30',
}

// ── Helper components ─────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize', cls)}>
      {label}
    </span>
  )
}

function SectionDivider() {
  return <div className="h-px bg-border my-6" />
}

function SectionTitle({ icon: Icon, title, iconCls }: { icon: React.ElementType; title: string; iconCls?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={14} className={clsx('flex-shrink-0', iconCls ?? 'text-neutral-400')} />
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
    </div>
  )
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const R = 40
  const STROKE = 6
  const circumference = 2 * Math.PI * R
  const filled = (score / 100) * circumference
  const gap = circumference - filled

  const ringColor =
    score >= 80 ? '#22c55e' :
    score >= 60 ? '#eab308' :
    '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={100} height={100} className="-rotate-90">
        <circle cx={50} cy={50} r={R} fill="none" strokeWidth={STROKE} className="stroke-border" />
        <circle
          cx={50} cy={50} r={R}
          fill="none"
          strokeWidth={STROKE}
          stroke={ringColor}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${gap}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center rotate-0">
        <span className="text-[26px] font-bold font-display leading-none" style={{ color: ringColor }}>
          {grade}
        </span>
      </div>
    </div>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <span className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border', cls)}>
      <span className="tabular-nums">{value}</span>
      <span className="font-normal opacity-80">{label}</span>
    </span>
  )
}

// ── Section 1: Score Header ───────────────────────────────────────────────────

function ScoreHeader({ data }: { data: SecurityData }) {
  const { score, grade, label, compliance } = data
  const scoreColor =
    score >= 80 ? 'text-accent-green' :
    score >= 60 ? 'text-accent-yellow' :
    'text-accent-red'

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-6 flex flex-col sm:flex-row items-center gap-6">
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <ScoreRing score={score} grade={grade} />
        <span className={clsx('text-[13px] font-semibold mt-1', scoreColor)}>{label}</span>
        <span className="text-[11px] text-neutral-500">{score}/100</span>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div>
          <h1 className="text-[18px] font-bold font-display text-neutral-100">Security Overview</h1>
          <p className="text-[12px] text-neutral-500 mt-0.5">Compliance, vulnerabilities and branch protection analysis</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatPill
            label="passed"
            value={compliance.passed}
            cls="text-accent-green border-accent-green/30 bg-accent-green/10"
          />
          <StatPill
            label="warnings"
            value={compliance.warned}
            cls="text-accent-yellow border-accent-yellow/30 bg-accent-yellow/10"
          />
          <StatPill
            label="failed"
            value={compliance.failed}
            cls="text-accent-red border-accent-red/30 bg-accent-red/10"
          />
          <StatPill
            label={`/ ${compliance.total} checks`}
            value={compliance.total}
            cls="text-neutral-400 border-border bg-surface-2"
          />
        </div>
      </div>
    </div>
  )
}

// ── Section 2: Compliance Checks ─────────────────────────────────────────────

function StatusIcon({ status }: { status: 'pass' | 'warn' | 'fail' }) {
  if (status === 'pass') return <CheckCircle size={14} className="text-accent-green flex-shrink-0" />
  if (status === 'warn') return <AlertCircle size={14} className="text-accent-yellow flex-shrink-0" />
  return <XCircle size={14} className="text-accent-red flex-shrink-0" />
}

function CheckRow({ check }: { check: ComplianceCheck }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <StatusIcon status={check.status} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-[13px] font-medium text-neutral-200 truncate">{check.name}</span>
          <Badge label={check.severity} cls={SEVERITY_BADGE[check.severity] ?? SEVERITY_BADGE.low} />
        </div>
        <p className="text-[11px] text-neutral-500 leading-relaxed">{check.details}</p>
      </div>
      <span className="text-[10px] font-mono text-neutral-600 flex-shrink-0 mt-0.5">{check.id}</span>
    </div>
  )
}

function ComplianceSection({ checks }: { checks: ComplianceCheck[] }) {
  const [passesOpen, setPassesOpen] = useState(false)

  const failures = checks.filter(c => c.status === 'fail')
  const warnings = checks.filter(c => c.status === 'warn')
  const passes   = checks.filter(c => c.status === 'pass')

  return (
    <div>
      <SectionTitle icon={Shield} title="Compliance Checks" iconCls="text-accent-blue" />
      <div className="bg-surface-1 border border-border rounded-xl divide-y divide-border">

        {/* Failures */}
        {failures.length > 0 && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-red mb-1">
              Failures ({failures.length})
            </p>
            {failures.map(c => <CheckRow key={c.id} check={c} />)}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-yellow mb-1">
              Warnings ({warnings.length})
            </p>
            {warnings.map(c => <CheckRow key={c.id} check={c} />)}
          </div>
        )}

        {/* Passes — collapsible */}
        {passes.length > 0 && (
          <div className="px-4 pt-3 pb-1">
            <button
              onClick={() => setPassesOpen(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-green mb-1 hover:opacity-80 transition-opacity"
            >
              {passesOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Passes ({passes.length})
            </button>
            {passesOpen && passes.map(c => <CheckRow key={c.id} check={c} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section 3: Vulnerability Alerts ──────────────────────────────────────────

const VULN_SEV_COLORS: Record<string, string> = {
  critical: 'bg-accent-red',
  high:     'bg-orange-500',
  medium:   'bg-accent-yellow',
  low:      'bg-neutral-500',
}

function SeverityBar({ counts }: { counts: { critical: number; high: number; medium: number; low: number } }) {
  const total = counts.critical + counts.high + counts.medium + counts.low
  if (total === 0) return <p className="text-[11px] text-neutral-600">No alerts</p>

  return (
    <div className="space-y-1.5 mt-2">
      {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
        const n = counts[sev]
        const pct = total > 0 ? (n / total) * 100 : 0
        return (
          <div key={sev} className="flex items-center gap-2">
            <span className="w-14 text-[10px] text-neutral-500 capitalize">{sev}</span>
            <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className={clsx('h-full rounded-full', VULN_SEV_COLORS[sev])}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-right text-[11px] tabular-nums font-semibold text-neutral-300">{n}</span>
          </div>
        )
      })}
    </div>
  )
}

function DependabotCard({ dep }: { dep: SecurityData['dependabot'] }) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className={dep.enabled ? 'text-accent-yellow' : 'text-neutral-600'} />
          <span className="text-[13px] font-semibold text-neutral-200">Dependabot</span>
        </div>
        <span className={clsx(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          dep.enabled
            ? 'text-accent-green border-accent-green/30 bg-accent-green/10'
            : 'text-neutral-500 border-border bg-surface-2',
        )}>
          {dep.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div>
        <p className="text-[11px] text-neutral-500 mb-1">
          <span className="text-[20px] font-bold text-neutral-100 mr-1 tabular-nums">{dep.total}</span>
          open alerts
        </p>
        <SeverityBar counts={dep.counts} />
      </div>

      {dep.items.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2 max-h-60 overflow-y-auto">
          {dep.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className={clsx(
                'mt-0.5 flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border capitalize',
                SEVERITY_BADGE[item.severity.toLowerCase()] ?? SEVERITY_BADGE.low,
              )}>
                {item.severity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-200 truncate">{item.pkg}</p>
                <p className="text-neutral-500 leading-relaxed">{item.summary}</p>
                {item.cve && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent-blue hover:underline mt-0.5 text-[10px]"
                  >
                    {item.cve}
                    <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CodeScanningCard({ cs }: { cs: SecurityData['code_scanning'] }) {
  const counts = cs.counts ?? {}
  const hasData = Object.values(counts).some(v => v !== undefined && v !== null)
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye size={14} className={cs.enabled ? 'text-accent-blue' : 'text-neutral-600'} />
          <span className="text-[13px] font-semibold text-neutral-200">Code Scanning</span>
        </div>
        <span className={clsx(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          cs.enabled
            ? 'text-accent-green border-accent-green/30 bg-accent-green/10'
            : 'text-neutral-500 border-border bg-surface-2',
        )}>
          {cs.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <p className="text-[11px] text-neutral-500">
        <span className="text-[20px] font-bold text-neutral-100 mr-1 tabular-nums">{cs.total}</span>
        total alerts
      </p>

      {hasData && (
        <div className="space-y-1.5">
          {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
            const n = (counts as Record<string, number>)[sev] ?? 0
            if (!n) return null
            return (
              <div key={sev} className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-500 capitalize">{sev}</span>
                <Badge label={String(n)} cls={SEVERITY_BADGE[sev] ?? SEVERITY_BADGE.low} />
              </div>
            )
          })}
        </div>
      )}

      {!cs.enabled && (
        <p className="text-[11px] text-neutral-600 italic">
          Enable code scanning to detect vulnerabilities in your codebase.
        </p>
      )}
    </div>
  )
}

function SecretScanningCard({ ss }: { ss: SecurityData['secret_scanning'] }) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key size={14} className={ss.enabled ? 'text-accent-green' : 'text-neutral-600'} />
          <span className="text-[13px] font-semibold text-neutral-200">Secret Scanning</span>
        </div>
        <span className={clsx(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          ss.enabled
            ? 'text-accent-green border-accent-green/30 bg-accent-green/10'
            : 'text-neutral-500 border-border bg-surface-2',
        )}>
          {ss.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <p className="text-[11px] text-neutral-500">
        <span className="text-[20px] font-bold text-neutral-100 mr-1 tabular-nums">{ss.total}</span>
        open secrets
      </p>

      {ss.types && ss.types.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Secret Types Detected</p>
          <div className="flex flex-wrap gap-1">
            {ss.types.map(t => (
              <span key={t} className="text-[10px] bg-surface-2 border border-border text-neutral-400 px-2 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {!ss.enabled && (
        <p className="text-[11px] text-neutral-600 italic">
          Enable secret scanning to detect committed credentials.
        </p>
      )}
    </div>
  )
}

function VulnSection({ data }: { data: SecurityData }) {
  return (
    <div>
      <SectionTitle icon={ShieldAlert} title="Vulnerability Alerts" iconCls="text-accent-yellow" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DependabotCard dep={data.dependabot} />
        <CodeScanningCard cs={data.code_scanning} />
        <SecretScanningCard ss={data.secret_scanning} />
      </div>
    </div>
  )
}

// ── Section 4: Branch Protection ─────────────────────────────────────────────

function BranchRow({ bp }: { bp: BranchProtection }) {
  const isGreen = bp.enabled && !bp.allow_force_push && bp.required_approvals > 0 && bp.require_status_checks
  const isRed   = !bp.enabled
  const rowCls = isRed
    ? 'bg-accent-red/5 border-l-2 border-l-accent-red'
    : isGreen
    ? 'bg-accent-green/5 border-l-2 border-l-accent-green'
    : 'bg-accent-yellow/5 border-l-2 border-l-accent-yellow'

  function Bool({ val, invert = false }: { val: boolean; invert?: boolean }) {
    const ok = invert ? !val : val
    return ok
      ? <CheckCircle size={13} className="text-accent-green mx-auto" />
      : <XCircle size={13} className="text-accent-red mx-auto" />
  }

  return (
    <tr className={clsx('border-b border-border text-[12px] transition-colors', rowCls)}>
      <td className="px-4 py-3 font-mono font-semibold text-neutral-200 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <GitBranch size={11} className="text-neutral-500 flex-shrink-0" />
          {bp.branch}
        </div>
      </td>
      <td className="px-3 py-3 text-center">
        <Bool val={bp.enabled} />
      </td>
      <td className="px-3 py-3 text-center tabular-nums text-neutral-300">
        {bp.required_approvals}
      </td>
      <td className="px-3 py-3 text-center">
        <Bool val={bp.require_status_checks} />
      </td>
      <td className="px-3 py-3 text-center">
        <Bool val={bp.allow_force_push} invert />
      </td>
      <td className="px-3 py-3 text-center">
        <Bool val={bp.require_code_owner_reviews} />
      </td>
    </tr>
  )
}

function BranchProtectionSection({ branches }: { branches: BranchProtection[] }) {
  return (
    <div>
      <SectionTitle icon={Lock} title="Branch Protection" iconCls="text-accent-blue" />
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Branch</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Protected</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Approvals</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Status Checks</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Force Push Blocked</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500">CODEOWNERS</th>
              </tr>
            </thead>
            <tbody>
              {branches.map(bp => <BranchRow key={bp.branch} bp={bp} />)}
            </tbody>
          </table>
          {branches.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-neutral-600">
              No branch protection rules found.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Section 5: Workflow Security ──────────────────────────────────────────────

function WorkflowTile({
  label,
  value,
  icon: Icon,
  good,
  sub,
}: {
  label: string
  value: string
  icon: React.ElementType
  good: boolean
  sub?: string
}) {
  return (
    <div className={clsx(
      'bg-surface-1 border rounded-xl p-4 flex flex-col gap-2',
      good ? 'border-accent-green/30' : 'border-accent-yellow/30',
    )}>
      <div className="flex items-center justify-between">
        <Icon size={14} className={good ? 'text-accent-green' : 'text-accent-yellow'} />
        <span className={clsx(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          good
            ? 'text-accent-green border-accent-green/30 bg-accent-green/10'
            : 'text-accent-yellow border-accent-yellow/30 bg-accent-yellow/10',
        )}>
          {good ? 'OK' : 'Review'}
        </span>
      </div>
      <div>
        <p className="text-[20px] font-bold font-display text-neutral-100 leading-none">{value}</p>
        <p className="text-[11px] text-neutral-400 mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-neutral-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function WorkflowSection({ wf }: { wf: SecurityData['workflow_security'] }) {
  const permGood = wf.default_permissions === 'read' || wf.default_permissions === 'read-all'

  return (
    <div>
      <SectionTitle icon={Zap} title="Workflow Security" iconCls="text-accent-yellow" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <WorkflowTile
          label="Default permissions"
          value={wf.default_permissions || 'unknown'}
          icon={Shield}
          good={permGood}
          sub={permGood ? 'Least privilege' : 'Consider read-only'}
        />
        <WorkflowTile
          label="OIDC"
          value={wf.oidc_configured ? 'Configured' : 'Not configured'}
          icon={Key}
          good={wf.oidc_configured}
          sub={wf.oidc_configured ? 'Keyless auth active' : 'Recommend OIDC tokens'}
        />
        <WorkflowTile
          label="Can approve PRs"
          value={wf.can_approve_pr_reviews ? 'Yes' : 'No'}
          icon={GitBranch}
          good={!wf.can_approve_pr_reviews}
          sub={wf.can_approve_pr_reviews ? 'Actions can approve PRs' : 'Actions cannot approve'}
        />
        <WorkflowTile
          label="Workflows"
          value={String(wf.workflow_count)}
          icon={Zap}
          good
          sub="Workflow files"
        />
      </div>
    </div>
  )
}

// ── Section 6: Recommendations ────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2 }

function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge label={rec.priority} cls={PRIORITY_BADGE[rec.priority] ?? PRIORITY_BADGE.medium} />
        <Badge label={`${rec.effort} effort`} cls={EFFORT_BADGE[rec.effort] ?? EFFORT_BADGE.medium} />
      </div>
      <p className="text-[14px] font-semibold text-neutral-100">{rec.action}</p>
      <p className="text-[12px] text-neutral-500 leading-relaxed">{rec.why}</p>
    </div>
  )
}

function RecommendationsSection({ recs }: { recs: Recommendation[] }) {
  const sorted = [...recs].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
  )

  return (
    <div>
      <SectionTitle icon={Info} title="Recommendations" iconCls="text-accent-blue" />
      {sorted.length === 0 ? (
        <div className="bg-surface-1 border border-border rounded-xl px-6 py-8 text-center">
          <ShieldCheck size={24} className="text-accent-green mx-auto mb-2" />
          <p className="text-[13px] text-neutral-400">No recommendations — looking good!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((rec, i) => <RecommendationCard key={i} rec={rec} />)}
        </div>
      )}
    </div>
  )
}

// ── Loading / Error states ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="relative">
        <Shield size={36} className="text-neutral-700" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-accent-blue/40 border-t-accent-blue animate-spin" />
        </div>
      </div>
      <p className="text-[13px] text-neutral-500">Analyzing security posture…</p>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <ShieldX size={32} className="text-accent-red opacity-60" />
      <p className="text-[14px] font-semibold text-neutral-300">Unable to load security data</p>
      <p className="text-[12px] text-neutral-600 max-w-sm text-center">
        {message ?? 'The security overview endpoint returned an error. Check that the backend is running and the repository is configured.'}
      </p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SecurityAudit() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['security-overview'],
    queryFn: getSecurityOverview,
    staleTime: 120_000,
    refetchInterval: 300_000,
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) {
    const msg = error instanceof Error ? error.message : undefined
    return <ErrorState message={msg} />
  }

  const sec = data as SecurityData

  return (
    <div className="p-6 space-y-0 max-w-[1400px] mx-auto">
      {/* Section 1 – Score */}
      <ScoreHeader data={sec} />

      <SectionDivider />

      {/* Section 2 – Compliance */}
      <ComplianceSection checks={sec.compliance?.checks ?? []} />

      <SectionDivider />

      {/* Section 3 – Vulnerabilities */}
      <VulnSection data={sec} />

      <SectionDivider />

      {/* Section 4 – Branch Protection */}
      <BranchProtectionSection branches={sec.branch_protection ?? []} />

      <SectionDivider />

      {/* Section 5 – Workflow Security */}
      <WorkflowSection wf={sec.workflow_security} />

      <SectionDivider />

      {/* Section 6 – Recommendations */}
      <RecommendationsSection recs={sec.recommendations ?? []} />

      {/* bottom breathing room */}
      <div className="h-8" />
    </div>
  )
}
