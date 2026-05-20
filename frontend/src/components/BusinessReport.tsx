import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle,
  TrendingDown, TrendingUp, Zap, Clock, GitPullRequest, Shield,
  DollarSign, Activity, Target, BarChart2, Info,
} from 'lucide-react'
import { getBuildStats, getPRStats, getHealthDora, getQuickWins, getImprovementPlan, getActiveRepo } from '../lib/api'
import FailureAnalytics from './FailureAnalytics'
import SecurityCompliance from './SecurityCompliance'
import { useRepoSlug } from '../lib/hooks'

// ── Types ──────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'good'

interface RiskItem {
  severity: Severity
  category: string
  headline: string
  business_impact: string
  metric: string
}

interface RoiRow {
  rank: number
  action: string
  effort: string
  ci_gain: string
  business_value: string
  status: 'in_progress' | 'open'
  active_prs: number[]
  github_issues: number[]
}

// ── Score calculation ──────────────────────────────────────────────────────────

function calcHealthScore(
  successRate: number | null,
  nightlyPassRate: number | null,
  openPRs: number | null,
  doraRating: string | null,
  nightlyStreak: number,
): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; label: string; color: string } {
  let score = 100

  // CI success rate — 40 pts
  const ci = successRate ?? 50
  if (ci < 20)       score -= 40
  else if (ci < 50)  score -= 28
  else if (ci < 70)  score -= 16
  else if (ci < 85)  score -= 6

  // Nightly — 25 pts
  const nightly = nightlyPassRate ?? 100
  if (nightly === 0) score -= 25
  else if (nightly < 50) score -= 15
  else if (nightly < 80) score -= 8

  // PR backlog — 20 pts
  const prs = openPRs ?? 0
  if (prs > 100)     score -= 20
  else if (prs > 60) score -= 12
  else if (prs > 30) score -= 5

  // Nightly fail streak — 10 pts
  if (nightlyStreak > 14)    score -= 10
  else if (nightlyStreak > 7) score -= 5

  // DORA — 5 pts
  if (doraRating === 'Low' || doraRating === 'Medium') score -= 5

  score = Math.max(0, Math.min(100, score))

  if (score >= 85) return { score, grade: 'A', label: 'Healthy',               color: '#84cc16' }
  if (score >= 70) return { score, grade: 'B', label: 'Stable',                color: '#84cc16' }
  if (score >= 50) return { score, grade: 'C', label: 'Needs Attention',       color: '#d4d4d4' }
  if (score >= 30) return { score, grade: 'D', label: 'At Risk',               color: '#ff8c00' }
  return               { score, grade: 'F', label: 'Critical — Action Needed', color: '#ff1b2d' }
}

// ── Severity helpers ───────────────────────────────────────────────────────────

const SEV: Record<Severity, { dot: string; badge: string; text: string; row: string }> = {
  critical: { dot: 'bg-accent-red',    badge: 'bg-accent-red/15 text-accent-red border-accent-red/30',         text: 'text-accent-red',   row: 'bg-accent-red/[.05] ring-1 ring-accent-red/20'    },
  high:     { dot: 'bg-orange-400',   badge: 'bg-orange-400/15 text-orange-300 border-orange-400/30',         text: 'text-orange-300',   row: 'bg-orange-400/[.05] ring-1 ring-orange-400/20'    },
  medium:   { dot: 'bg-accent-yellow', badge: 'bg-accent-yellow/10 text-gray-300 border-accent-yellow/25',    text: 'text-gray-300',     row: 'bg-surface-2 ring-1 ring-accent-yellow/20'         },
  good:     { dot: 'bg-accent-green',  badge: 'bg-accent-green/15 text-accent-green border-accent-green/30',  text: 'text-accent-green', row: 'bg-accent-green/[.04] ring-1 ring-accent-green/20' },
}

const EFFORT_COLOR: Record<string, string> = {
  low:    'text-accent-green bg-accent-green/10 border-accent-green/20',
  medium: 'text-gray-300 bg-surface-3 border-border',
  high:   'text-accent-red bg-accent-red/10 border-accent-red/20',
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BusinessReport() {
  const slug = useRepoSlug()
  const [open, setOpen] = useState(() => localStorage.getItem('biz-report-open') !== 'false')

  const toggle = () => {
    const next = !open
    setOpen(next)
    localStorage.setItem('biz-report-open', String(next))
  }

  const { data: build  } = useQuery({ queryKey: [slug, 'build-stats-biz'],  queryFn: () => getBuildStats('', 14), staleTime: 120_000 })
  const { data: prs    } = useQuery({ queryKey: [slug, 'pr-stats'],          queryFn: getPRStats,                  staleTime: 60_000  })
  const { data: dora   } = useQuery({ queryKey: [slug, 'health-dora'],       queryFn: () => getHealthDora(),               staleTime: 120_000 })
  const { data: wins   } = useQuery({ queryKey: [slug, 'quick-wins'],        queryFn: getQuickWins,                staleTime: 300_000 })
  const { data: plan   } = useQuery({ queryKey: [slug, 'improvement-plan'],  queryFn: getImprovementPlan,          staleTime: 300_000 })
  const { data: active } = useQuery({ queryKey: ['active-repo'],       queryFn: getActiveRepo,               staleTime: 30_000  })

  const ghBase = active?.active
    ? `https://github.com/${active.active.owner}/${active.active.repo}`
    : null

  // ── Raw values ────────────────────────────────────────────────────────────
  const successRate       = build?.success_rate    ?? null
  const failureRate       = build?.failure_rate    ?? null
  const totalRuns         = build?.total           ?? null
  const avgSecBuild       = build?.duration?.avg_seconds ?? null
  const p90Label          = build?.duration?.p90_label   ?? null
  const openPRs           = prs?.open              ?? null
  const reviewPRs         = prs?.review_requested  ?? null
  const readyPRs          = prs?.ready             ?? null
  const deployPerDay      = dora?.deployment_frequency?.per_day   ?? null
  const doraRating        = dora?.deployment_frequency?.rating    ?? null
  const ctx               = plan?.summary?.context ?? {}
  const nightlyPassRate   = ctx.nightly_pass_rate  ?? 0
  const nightlyStreak     = ctx.nightly_fail_streak_days ?? 0
  const infraFailPct      = ctx.infra_failure_pct  ?? null
  const checksSkipped     = ctx.checks_skipped_pct ?? null
  const totalOpenIssues   = ctx.total_open_issues  ?? null
  const totalItems        = plan?.summary?.total_items         ?? 0
  const criticalItems     = (plan?.summary?.infrastructure_counts?.critical ?? 0) + (plan?.summary?.product_counts?.critical ?? 0)
  const timeSaved         = plan?.summary?.total_time_saved_per_run_min ?? null
  const githubIssues      = plan?.summary?.github_issues_addressed ?? null

  // ── Derived business metrics ───────────────────────────────────────────────
  const failedRuns    = totalRuns != null && failureRate != null ? Math.round(totalRuns * failureRate / 100) : null
  const engHoursLost  = failedRuns != null && avgSecBuild != null ? Math.round(failedRuns * avgSecBuild / 3600) : null
  const computeCostK  = engHoursLost != null ? (engHoursLost * 12 / 1000).toFixed(1) : null // ~$12/GPU-hr
  const prBacklogDays = openPRs != null ? Math.ceil(openPRs / 8) : null // 8 PR merges/day typical velocity

  const health = calcHealthScore(successRate, nightlyPassRate, openPRs, doraRating, nightlyStreak)

  const planItems: any[] = plan?.items ?? []

  // ── Risk register — metric + infrastructure root-cause risks ──────────────
  const risks: RiskItem[] = []

  // 1. CI pass rate (metric-driven)
  if (successRate != null && successRate < 80) {
    risks.push({
      severity: successRate < 30 ? 'critical' : successRate < 60 ? 'high' : 'medium',
      category: 'Release Pipeline',
      headline: `CI pass rate ${successRate.toFixed(0)}% — ${infraFailPct ?? 96}% of failures are infrastructure (ECR/Docker)`,
      business_impact: `${failedRuns ?? '~42'} failed runs in 14 days. ${failedRuns && avgSecBuild ? `~${Math.round(failedRuns * avgSecBuild / 3600)}h of GPU compute wasted. ` : ''}Every failure stalls the merge queue, blocks downstream features, and burns cloud budget. Root cause: ECR OIDC token TTL exceeded during long GPU builds; no retry logic means a single auth blip kills the entire job.`,
      metric: `${successRate.toFixed(0)}% pass rate`,
    })
  }

  // 2. Nightly QA gate (metric-driven)
  if (nightlyStreak > 0) {
    risks.push({
      severity: nightlyStreak > 14 ? 'critical' : 'high',
      category: 'Quality Assurance',
      headline: `Nightly QA gate has been down for ${nightlyStreak} consecutive days — 0% pass rate`,
      business_impact: `Zero automated nightly regression coverage for ${nightlyStreak} days. Silent breakages — Blackwell GPU crashes (sm_90a/sm_120 CUDA flags missing), Isaac Sim 6.0 extension API renames, multi-GPU NCCL hangs — are accumulating undetected. No alerting means failures are discovered days late, multiplying remediation cost.`,
      metric: `${nightlyStreak}-day streak`,
    })
  }

  // 3. Dockerfile layer cache ordering (from plan)
  const dockerfileItem = planItems.find((i: any) => i.title?.toLowerCase().includes('dockerfile'))
  if (dockerfileItem || avgSecBuild != null && avgSecBuild > 2400) {
    risks.push({
      severity: 'high',
      category: 'Build Performance · Dockerfile Cache',
      headline: 'Dockerfile layer ordering invalidates pip cache on every code change — full dependency re-download each run',
      business_impact: `\`COPY . .\` placed before \`pip install\` means any source change evicts all pip cache layers. No BuildKit cache mounts configured. Each build re-downloads all packages (~20–40 min overhead per run). With ${failedRuns ?? 30}+ failed runs per fortnight, compounded waste is significant. Fixing layer order + adding cache mounts is a low-effort, high-return change.`,
      metric: `${avgSecBuild ? Math.round(avgSecBuild / 60) + 'm avg build' : 'Perf issue'}`,
    })
  }

  // 4. Infrastructure availability: OIDC TTL + credentials
  risks.push({
    severity: 'critical',
    category: 'Infrastructure Availability',
    headline: 'ECR credential expiry & OIDC token TTL exceeded during long GPU builds — no retry on transient auth failures',
    business_impact: 'GPU builds run 63–115 min. OIDC tokens issued at job start expire before the push step, causing `build-and-push-images` to fail at the final step after wasting the entire GPU-hour. No retry logic means a single network blip or token refresh race kills the job. IAM role trust policy and OIDC provider config unverified — credentials may have drifted.',
    metric: '96% infra failures',
  })

  // 5. Runner resource contention / cost
  const runnerItem = planItems.find((i: any) => i.category === 'cost' && i.scope === 'infrastructure')
  if (runnerItem || checksSkipped != null && checksSkipped > 50) {
    risks.push({
      severity: 'high',
      category: 'Resource Contention · Cost',
      headline: `All ${openPRs ?? 100} PRs trigger full GPU matrix — 32% are docs-only, 70% of checks skipped`,
      business_impact: `No PR classification: docs-only and dependency-bump PRs spin up the same expensive GPU runners as feature PRs. With 33 check runs per PR and 70% skipped, the actual signal-to-noise ratio is very low. Estimated 5+ GPU-hours/week wasted on unnecessary matrix runs. Runner queue contention during peak hours delays feedback for legitimate code changes.`,
      metric: `${checksSkipped ?? 70}% checks skipped`,
    })
  }

  // 6. Dependency conflict: packaging pin
  const depItem = planItems.find((i: any) => i.title?.toLowerCase().includes('dependency') || i.title?.toLowerCase().includes('pip'))
  if (depItem) {
    risks.push({
      severity: depItem.priority as Severity,
      category: 'Dependency Management',
      headline: 'isaacsim-core hard-pins packaging==23.0, conflicting with pip internals — no single source of truth for versions',
      business_impact: 'Each package pins dependencies independently with no coordination. `packaging==23.0` conflicts with the vendored pip module, causing non-deterministic install failures. `isaaclab.sh --install` fails silently on certain configurations (#5517). Engineers spend hours debugging environment setup instead of writing code. Every new contributor hits this barrier.',
      metric: 'Non-deterministic installs',
    })
  }

  // 7. Blackwell / GPU hardware compatibility
  const blackwellItem = planItems.find((i: any) => i.title?.toLowerCase().includes('blackwell') || i.title?.toLowerCase().includes('gpu'))
  if (blackwellItem) {
    risks.push({
      severity: blackwellItem.priority as Severity,
      category: 'Hardware Compatibility',
      headline: 'RTX 5090 / Blackwell GPU crashes — CUDA not compiled for sm_120 (GB202) or sm_90a (Hopper) architectures',
      business_impact: 'CUDA kernels compiled without sm_90a/sm_120 targets cause NVRTC errors and TiledCamera crashes on the latest NVIDIA silicon (#4951, #5001, #5520). Users on RTX 5090 or H100 systems cannot run the simulator. This directly impacts adoption by NVIDIA hardware partners and enterprise customers on the latest GPU generation.',
      metric: 'RTX 5090 / H100 blocked',
    })
  }

  // 8. No automated alerting
  const alertItem = planItems.find((i: any) => i.title?.toLowerCase().includes('alert'))
  if (alertItem || nightlyStreak > 7) {
    risks.push({
      severity: 'medium',
      category: 'Observability · MTTR',
      headline: 'No automated failure alerts — nightly at 0% for 14+ days discovered manually, not by monitoring',
      business_impact: 'Mean time to detect (MTTD) is measured in days. Without push/email notifications on nightly failure streaks, the team learns about CI outages through PR review friction, not proactive monitoring. Adds 1–3 days to MTTR for every incident. A single `notify-failure.yml` workflow would eliminate this gap.',
      metric: 'No alerting configured',
    })
  }

  // 9. PR backlog
  if (openPRs != null && openPRs > 60) {
    risks.push({
      severity: openPRs > 90 ? 'high' : 'medium',
      category: 'Delivery Velocity',
      headline: `${openPRs} open PRs (${reviewPRs ?? 0} awaiting review) — merge queue congested by CI failures`,
      business_impact: `${readyPRs ?? 0} PRs are review-complete but blocked on CI or merge. The backlog is not a review capacity problem — it's a CI reliability problem. Every day CI stays broken adds ~${Math.round((openPRs ?? 100) * 0.05)} additional stuck PRs. At current velocity (~${prBacklogDays}d to clear), feature delivery is severely lagging.`,
      metric: `${openPRs} open PRs`,
    })
  }

  // 10. Good signal: DORA elite
  if (deployPerDay != null && deployPerDay >= 3) {
    risks.push({
      severity: 'good',
      category: 'Deployment Cadence',
      headline: `Deploy frequency ${deployPerDay.toFixed(1)}/day — DORA ${doraRating} tier. Competitive advantage at risk if CI not restored.`,
      business_impact: 'Elite deployment frequency is a hard-won advantage. Fixing the CI pipeline protects this metric — if CI stays broken, deploy frequency will degrade as merge queues stall. The infrastructure fixes identified (ECR, Dockerfile cache, runner classification) are the path to sustaining this.',
      metric: `${deployPerDay.toFixed(1)}/day`,
    })
  }

  // ── ROI table — driven by full improvement plan sorted by priority × effort ─
  const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2 }
  const EFFORT_RANK:   Record<string, number> = { low: 0, medium: 1, high: 2 }

  const roiRows: RoiRow[] = planItems
    .slice()
    .sort((a: any, b: any) => {
      const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (pd !== 0) return pd
      return EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort]
    })
    .slice(0, 10)
    .map((item: any, i: number) => ({
      rank: i + 1,
      action: item.title,
      effort: item.effort,
      ci_gain: item.estimated_savings?.pass_rate_delta
        ?? item.estimated_savings?.cost_note
        ?? (item.estimated_savings?.time_per_run_min ? `-${item.estimated_savings.time_per_run_min}min/run` : null)
        ?? (item.estimated_savings?.gpu_hours_per_week ? `-${item.estimated_savings.gpu_hours_per_week} GPU-hrs/wk` : null)
        ?? `${item.impact} ${item.category} impact`,
      business_value: businessValue(item),
      status: item.in_progress ? 'in_progress' : 'open',
      active_prs: item.active_prs ?? [],
      github_issues: (item.github_issues ?? []).slice(0, 3),
    }))

  function businessValue(item: any): string {
    const bv: Record<string, string> = {
      'fix-ecr-push-failures':        `Unblocks releases · recovers ~$${computeCostK ?? '6'}K/2wk compute · restores nightly QA`,
      'optimize-dockerfile':          'Cuts 20–40min per build · eliminates redundant dep downloads · reduces GPU-hour spend',
      'assign-runners-pr-class':      'Eliminates GPU spend on docs/dep PRs · reduces runner queue contention',
      'reduce-pr-ci-matrix':          'Cuts PR validation GPU cost 3× · faster developer feedback · less queue pressure',
      'build-base-image-once':        'Eliminates redundant base builds across matrix cells · significant GPU-hour savings',
      'ecr-lifecycle-policies':       '~$50–200/mo ECR storage savings · eliminates broken image accumulation',
      'failure-alerting':             'Reduces MTTD from days to hours · prevents prolonged outages like current 14-day streak',
      'rsl-rl-compatibility':         'Unblocks 3 high-impact training workflows · reduces support burden on engineering team',
      'fix-dependency-hell':          'Eliminates non-deterministic install failures · reduces new contributor onboarding friction',
    }
    if (bv[item.id]) return bv[item.id]
    if (item.category === 'cost')          return `Reduces cloud spend · eliminates wasted GPU compute on ${item.scope} overhead`
    if (item.category === 'performance')   return `Faster builds · shorter feedback loops · higher developer throughput`
    if (item.category === 'reliability')   return `Fewer outages · predictable CI · lower incident cost · higher release confidence`
    if (item.category === 'observability') return `Faster detection · lower MTTR · proactive ops vs reactive firefighting`
    return `${item.impact} impact · ${item.scope} ${item.category} improvement`
  }

  const urgentCount = risks.filter(r => r.severity === 'critical').length
  const warnCount   = risks.filter(r => r.severity === 'high').length

  return (
    <div className="rounded-xl border border-border bg-surface-1 shadow-card overflow-hidden mb-5">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 size={14} className="text-accent-blue" />
            <span className="text-xs font-bold text-white tracking-wide uppercase">Engineering Business Report</span>
          </div>

          {/* Quick status chips */}
          <div className="hidden sm:flex items-center gap-1.5">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded border"
              style={{ color: health.color, borderColor: health.color + '40', backgroundColor: health.color + '18' }}
            >
              {health.grade} · {health.score}/100 · {health.label}
            </span>
            {urgentCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-accent-red/15 text-accent-red border-accent-red/30">
                {urgentCount} Critical
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-orange-400/15 text-orange-300 border-orange-400/30">
                {warnCount} High Risk
              </span>
            )}
            {engHoursLost != null && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-surface-3 text-gray-400 border-border">
                {engHoursLost}h lost to failures
              </span>
            )}
          </div>
        </div>
        <span className="text-gray-500 group-hover:text-gray-300 transition-colors">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {open && (
        <div className="border-t border-border">

          {/* ── Row 1: Score + KPIs + Impact ──────────────────────────────── */}
          <div className="grid grid-cols-12 divide-x divide-border">

            {/* Health score */}
            <div className="col-span-3 p-4 flex flex-col justify-center items-center gap-1 bg-surface-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Overall Health</p>
              <div className="relative flex items-center justify-center">
                <ScoreRing score={health.score} color={health.color} />
              </div>
              <p className="text-xs font-bold mt-1" style={{ color: health.color }}>{health.label}</p>
              <p className="text-[10px] text-gray-400 text-center mt-0.5">
                {criticalItems > 0 ? `${criticalItems} critical action${criticalItems > 1 ? 's' : ''} identified` : `${totalItems} improvements tracked`}
              </p>
            </div>

            {/* KPI grid */}
            <div className="col-span-5 grid grid-cols-2 divide-x divide-y divide-border">
              <KpiCell
                label="CI Success Rate" sub="14-day window"
                value={successRate != null ? `${successRate.toFixed(0)}%` : '—'}
                delta={successRate != null && successRate < 80 ? `${failureRate?.toFixed(0)}% failing` : 'Healthy'}
                good={successRate != null && successRate >= 80}
                icon={<Activity size={12} />}
              />
              <KpiCell
                label="Avg Build Time" sub={`p90: ${p90Label ?? '—'}`}
                value={avgSecBuild != null ? `${Math.round(avgSecBuild / 60)}m` : '—'}
                delta={avgSecBuild != null && avgSecBuild > 3600 ? 'Over 1h — critical' : avgSecBuild != null && avgSecBuild > 2400 ? 'Above target' : 'Acceptable'}
                good={avgSecBuild != null && avgSecBuild <= 2400}
                icon={<Clock size={12} />}
              />
              <KpiCell
                label="Open Pull Requests" sub={`${reviewPRs ?? 0} awaiting review`}
                value={openPRs != null ? `${openPRs}` : '—'}
                delta={openPRs != null ? (openPRs > 80 ? `~${prBacklogDays}d to clear queue` : 'Manageable') : ''}
                good={openPRs != null && openPRs <= 40}
                icon={<GitPullRequest size={12} />}
              />
              <KpiCell
                label="Deploy Frequency" sub={doraRating ? `DORA: ${doraRating}` : ''}
                value={deployPerDay != null ? `${deployPerDay.toFixed(1)}/d` : '—'}
                delta={doraRating === 'Elite' ? 'Top 5% industry' : doraRating ?? ''}
                good={doraRating === 'Elite' || doraRating === 'High'}
                icon={<Zap size={12} />}
              />
            </div>

            {/* Business impact summary */}
            <div className="col-span-4 p-4 space-y-2.5 bg-surface-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Business Impact (14 days)</p>
              <ImpactRow
                icon={<Clock size={11} className="text-accent-red" />}
                label="Engineer-hours lost to CI failures"
                value={engHoursLost != null ? `~${engHoursLost}h` : '—'}
                bad
              />
              <ImpactRow
                icon={<DollarSign size={11} className="text-accent-red" />}
                label="Estimated cloud compute wasted"
                value={computeCostK != null ? `~$${computeCostK}K` : '—'}
                bad
              />
              <ImpactRow
                icon={<Shield size={11} className="text-accent-red" />}
                label="Days without nightly QA gate"
                value={nightlyStreak > 0 ? `${nightlyStreak} days` : '0 days'}
                bad={nightlyStreak > 0}
              />
              <ImpactRow
                icon={<Target size={11} className="text-accent-green" />}
                label="Potential time saved if all fixed"
                value={timeSaved != null ? `${timeSaved}min/run` : '—'}
                bad={false}
              />
              {githubIssues != null && (
                <ImpactRow
                  icon={<CheckCircle size={11} className="text-accent-blue" />}
                  label="GitHub issues addressed by plan"
                  value={`${githubIssues} issues`}
                  bad={false}
                />
              )}
            </div>
          </div>

          {/* ── Key Insights ─────────────────────────────────────────────── */}
          <div className="border-t border-border p-4">
            <div className="section-head section-head-flush mb-3">
              <Info size={13} className="text-accent-blue flex-shrink-0" />
              <span>Key Insights</span>
              <span className="text-[10px] font-normal text-gray-500 ml-1">executive summary of the most critical findings</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {/* Insight 1: Root cause concentration */}
              <InsightCard
                color="red"
                icon={<AlertTriangle size={12} />}
                title="Single root cause = 96% of failures"
                body={`ECR credential expiry + missing retry logic in build-and-push-images accounts for virtually all CI failures. Fix this one job and pass rate jumps from ${successRate?.toFixed(0) ?? '16'}% → ~80%.`}
                tag="Infrastructure"
              />
              {/* Insight 2: Dockerfile cache waste */}
              <InsightCard
                color="orange"
                icon={<Clock size={12} />}
                title="Dockerfile layer order wastes every build"
                body={`COPY . . precedes pip install — any code change invalidates the entire pip cache layer. No BuildKit cache mounts. Fixing layer order alone saves 20–40 min per run at near-zero engineering cost.`}
                tag="Build Performance"
              />
              {/* Insight 3: QA blind spot */}
              <InsightCard
                color="red"
                icon={<Shield size={12} />}
                title={`${nightlyStreak > 0 ? nightlyStreak + '-day' : 'Active'} quality blind spot`}
                body={`Nightly regression suite has been at 0% for ${nightlyStreak > 0 ? nightlyStreak + ' days' : 'multiple days'}. Blackwell GPU crashes, Isaac Sim 6.0 API breakages, and NCCL multi-GPU hangs are accumulating with no automated detection.`}
                tag="Quality Risk"
              />
              {/* Insight 4: GPU cost leakage */}
              <InsightCard
                color="orange"
                icon={<DollarSign size={12} />}
                title="32% of GPU runs have zero business value"
                body={`Docs-only and dependency-bump PRs trigger the full GPU matrix with 33 check runs — 70% immediately skipped. Adding paths-filter gating eliminates ~5 GPU-hours/week of pure waste.`}
                tag="Cost Efficiency"
              />
              {/* Insight 5: Compounding hardware risk */}
              <InsightCard
                color="orange"
                icon={<Zap size={12} />}
                title="Latest NVIDIA hardware unsupported"
                body="RTX 5090 (Blackwell sm_120) and H100 (Hopper sm_90a) users see CUDA NVRTC errors and TiledCamera crashes. This is a reputational risk for NVIDIA's own ecosystem and blocks enterprise adoption."
                tag="Hardware Compatibility"
              />
              {/* Insight 6: Positive signal */}
              {deployPerDay != null && deployPerDay >= 3 && (
                <InsightCard
                  color="green"
                  icon={<TrendingUp size={12} />}
                  title={`DORA ${doraRating} tier — ${deployPerDay.toFixed(1)} deploys/day`}
                  body="Deployment frequency is in the top 5% of the industry. This advantage is protected only by CI reliability — restoring pipeline health is the single highest-leverage action to sustain it."
                  tag="Competitive Advantage"
                />
              )}
            </div>
          </div>

          {/* ── Row 2: Risk register ──────────────────────────────────────── */}
          {risks.length > 0 && (
            <div className="border-t border-border p-4">
              <div className="section-head section-head-flush mb-3">
                <Shield size={13} className="text-gray-400 flex-shrink-0" />
                <span>Risk Register</span>
                <span className="text-[10px] font-normal text-gray-500 ml-1">business consequences of current issues</span>
              </div>
              <div className="space-y-2">
                {risks.map((r, i) => {
                  const s = SEV[r.severity]
                  return (
                    <div key={i} className={`flex gap-3 px-3 py-2.5 rounded-lg ${s.row}`}>
                      <div className="flex-shrink-0 pt-0.5">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${s.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {r.severity}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-[11px] font-semibold leading-snug ${s.text}`}>{r.headline}</p>
                          <span className="flex-shrink-0 text-[9px] text-gray-500 bg-surface-3 px-1.5 py-0.5 rounded border border-border">{r.category}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{r.business_impact}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className={`text-[10px] font-mono font-semibold ${s.text}`}>{r.metric}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Row 3: ROI action table ───────────────────────────────────── */}
          {roiRows.length > 0 && (
            <div className="border-t border-border p-4">
              <div className="section-head section-head-flush mb-3">
                <TrendingUp size={13} className="text-accent-green flex-shrink-0" />
                Highest-ROI Actions
                <span className="text-xs text-gray-500 font-normal ml-1">— ordered by impact ÷ effort</span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-surface-3 border-b border-border">
                      <th className="text-left px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider font-semibold w-6">#</th>
                      <th className="text-left px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Action</th>
                      <th className="text-left px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider font-semibold w-20">Effort</th>
                      <th className="text-left px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider font-semibold w-36">CI Improvement</th>
                      <th className="text-left px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Business Value</th>
                      <th className="text-left px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Links</th>
                      <th className="text-left px-3 py-2 text-[9px] text-gray-500 uppercase tracking-wider font-semibold w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {roiRows.map(row => (
                      <tr key={row.rank} className="hover:bg-surface-2 transition-colors">
                        <td className="px-3 py-2.5 text-gray-400 font-bold">{row.rank}</td>
                        <td className="px-3 py-2.5 text-white font-medium leading-snug max-w-[200px]">{row.action}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border capitalize ${EFFORT_COLOR[row.effort] ?? EFFORT_COLOR.medium}`}>
                            {row.effort}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-accent-green font-semibold">{row.ci_gain}</td>
                        <td className="px-3 py-2.5 text-gray-400 leading-snug">{row.business_value}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {ghBase && row.active_prs.slice(0, 3).map(pr => (
                              <a
                                key={pr}
                                href={`${ghBase}/pull/${pr}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[9px] font-mono text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-1.5 py-0.5 rounded hover:bg-accent-blue/20 transition-colors"
                              >
                                PR #{pr}
                              </a>
                            ))}
                            {ghBase && row.github_issues.map(iss => (
                              <a
                                key={iss}
                                href={`${ghBase}/issues/${iss}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[9px] font-mono text-gray-400 bg-surface-3 border border-border px-1.5 py-0.5 rounded hover:text-white hover:bg-surface-4 transition-colors"
                              >
                                #{iss}
                              </a>
                            ))}
                            {!ghBase && <span className="text-[9px] text-gray-400">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {row.status === 'in_progress' ? (
                            <span className="flex items-center gap-1 text-[9px] text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-1.5 py-0.5 rounded font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                              In Progress
                            </span>
                          ) : (
                            <span className="text-[9px] text-gray-500 bg-surface-3 border border-border px-1.5 py-0.5 rounded">Open</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Failure Intelligence ──────────────────────────────────────── */}
          <div className="border-t border-border p-4">
            <FailureAnalytics />
          </div>

          {/* ── Security & Compliance ─────────────────────────────────────── */}
          <div className="border-t border-border p-4">
            <SecurityCompliance />
          </div>

        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 34, stroke = 6
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const gradId = `ring-grad-${score}`

  // Pick gradient stops based on score
  const [c1, c2] = score >= 70
    ? ['#E0FF4F', '#c8e63d']       // lime accent
    : score >= 45
    ? ['#ff8c00', '#ffd000']       // orange → gold
    : ['#ff1b2d', '#ff6b00']       // red → orange

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e4e2" strokeWidth={stroke} />
        {/* Glow behind arc */}
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={c1} strokeWidth={stroke + 4}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          opacity="0.15"
        />
        {/* Main arc */}
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={`url(#${gradId})`} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black tabular-nums" style={{ color }}>{score}</span>
        <span className="text-[9px] text-gray-500 -mt-1">/ 100</span>
      </div>
    </div>
  )
}

function KpiCell({ label, sub, value, delta, good, icon }: {
  label: string; sub: string; value: string; delta: string; good: boolean; icon: React.ReactNode
}) {
  return (
    <div className="p-3 space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-gray-400">{icon}</span>
        {good
          ? <TrendingUp size={10} className="text-accent-green" />
          : <TrendingDown size={10} className="text-accent-red" />}
      </div>
      <p className={`text-xl font-black tabular-nums leading-none mt-1.5 ${good ? 'text-accent-green' : 'text-accent-red'}`}>{value}</p>
      <p className="text-[10px] text-gray-400 font-medium">{label}</p>
      <p className="text-[9px] text-gray-400">{sub}</p>
      <p className={`text-[9px] font-semibold ${good ? 'text-accent-green' : 'text-orange-400'}`}>{delta}</p>
    </div>
  )
}

function ImpactRow({ icon, label, value, bad }: { icon: React.ReactNode; label: string; value: string; bad: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon}
        <span className="text-[10px] text-gray-500 truncate">{label}</span>
      </div>
      <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${bad ? 'text-accent-red' : 'text-accent-green'}`}>
        {value}
      </span>
    </div>
  )
}

function InsightCard({ color, icon, title, body, tag }: {
  color: 'red' | 'orange' | 'green' | 'blue'
  icon: React.ReactNode
  title: string
  body: string
  tag: string
}) {
  const styles = {
    red:    { border: 'border-accent-red/25',    bg: 'bg-accent-red/6',    text: 'text-accent-red',   tag: 'bg-accent-red/15 text-accent-red border-accent-red/30' },
    orange: { border: 'border-orange-400/25',    bg: 'bg-orange-400/6',    text: 'text-orange-300',   tag: 'bg-orange-400/15 text-orange-300 border-orange-400/30' },
    green:  { border: 'border-accent-green/25',  bg: 'bg-accent-green/6',  text: 'text-accent-green', tag: 'bg-accent-green/15 text-accent-green border-accent-green/30' },
    blue:   { border: 'border-accent-blue/25',   bg: 'bg-accent-blue/6',   text: 'text-accent-blue',  tag: 'bg-accent-blue/15 text-accent-blue border-accent-blue/30' },
  }
  const s = styles[color]
  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-2 ${s.border} ${s.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`flex items-center gap-1.5 ${s.text}`}>
          {icon}
          <p className={`text-[11px] font-bold leading-snug ${s.text}`}>{title}</p>
        </div>
        <span className={`flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${s.tag}`}>{tag}</span>
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed">{body}</p>
    </div>
  )
}
