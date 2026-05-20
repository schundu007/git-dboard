import { useQuery } from '@tanstack/react-query'
import { Shield, CheckCircle, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { getImprovementPlan, getBuildStats, getOverviewSummary, getActiveRepo } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const anim = (v: string) => prefersReducedMotion ? undefined : v

const SEV = {
  critical: {
    bg:    'bg-accent-red/[.06] ring-1 ring-accent-red/20',
    badge: 'bg-accent-red/15 text-accent-red border-accent-red/30',
    text:  'text-accent-red',
    label: 'CRITICAL',
  },
  high: {
    bg:    'bg-orange-400/[.06] ring-1 ring-orange-400/20',
    badge: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
    text:  'text-orange-300',
    label: 'HIGH',
  },
  medium: {
    bg:    'bg-accent-yellow/[.04] ring-1 ring-accent-yellow/15',
    badge: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/25',
    text:  'text-gray-300',
    label: 'MED',
  },
} as const

const EFFORT_STYLE: Record<string, string> = {
  low:    'text-accent-green bg-accent-green/10 border-accent-green/20',
  medium: 'text-gray-300 bg-surface-3 border-border',
  high:   'text-accent-red bg-accent-red/10 border-accent-red/20',
}

const CAT_STYLE: Record<string, string> = {
  reliability:   'text-accent-red bg-accent-red/10 border-accent-red/20',
  performance:   'text-accent-blue bg-accent-blue/10 border-accent-blue/20',
  cost:          'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20',
  observability: 'text-accent-teal bg-accent-teal/10 border-accent-teal/20',
  security:      'text-accent-purple bg-accent-purple/10 border-accent-purple/20',
}

function ciGain(item: any): string {
  const s = item.estimated_savings ?? {}
  if (s.pass_rate_delta) return s.pass_rate_delta
  if (s.time_per_run_min) return `-${s.time_per_run_min}min/run`
  if (s.gpu_hours_per_week) return `-${s.gpu_hours_per_week} GPU-hrs/wk`
  if (s.cost_note) return s.cost_note
  return `${item.impact ?? 'high'} impact`
}

function shortBenefit(item: any): string {
  const map: Record<string, string> = {
    'fix-ecr-push-failures':   'Unblocks releases · recovers compute budget',
    'optimize-dockerfile':     'Cuts 20–40min per build · reduces GPU spend',
    'assign-runners-pr-class': 'Eliminates GPU spend on docs/dep PRs',
    'reduce-pr-ci-matrix':     'Cuts PR validation cost 3× · faster feedback',
    'build-base-image-once':   'Eliminates redundant matrix base builds',
    'ecr-lifecycle-policies':  '$50–200/mo ECR storage savings',
    'failure-alerting':        'MTTD: days → hours · prevents prolonged outages',
    'rsl-rl-compatibility':    'Unblocks 3 high-impact training workflows',
    'fix-dependency-hell':     'Eliminates non-deterministic install failures',
  }
  if (map[item.id]) return map[item.id]
  const cat = item.category
  if (cat === 'cost')          return 'Reduces cloud spend · eliminates wasted GPU compute'
  if (cat === 'performance')   return 'Faster builds · shorter feedback loops'
  if (cat === 'reliability')   return 'Fewer outages · higher release confidence'
  if (cat === 'observability') return 'Faster detection · lower MTTR'
  return `${item.impact ?? 'high'} impact improvement`
}

export default function IssuesPanel() {
  const slug = useRepoSlug()
  const { data: plan }    = useQuery({ queryKey: [slug, 'improvement-plan'],  queryFn: getImprovementPlan,        staleTime: 300_000 })
  const { data: build }   = useQuery({ queryKey: [slug, 'build-stats-biz'],   queryFn: () => getBuildStats('', 14), staleTime: 120_000 })
  const { data: summary } = useQuery({ queryKey: [slug, 'overview'],          queryFn: getOverviewSummary,        staleTime: 60_000  })
  const { data: active }  = useQuery({ queryKey: ['active-repo'],       queryFn: getActiveRepo,             staleTime: 30_000  })

  const ghBase = active?.active
    ? `https://github.com/${active.active.owner}/${active.active.repo}`
    : null

  const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2 }
  const EFFORT_RANK: Record<string, number>   = { low: 0, medium: 1, high: 2 }

  const planItems: any[] = (plan?.items ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      return pd !== 0 ? pd : EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort]
    })

  // ── Live-metric alerts (highest priority, always shown) ──────────────────
  const successRate: number | null = build?.success_rate ?? null
  const nightlyStreak: number = summary?.nightly?.consecutive_failures ?? 0

  const liveAlerts: Array<{ severity: 'critical' | 'high'; category: string; headline: string; metric: string }> = []

  if (successRate != null && successRate < 60) {
    liveAlerts.push({
      severity: successRate < 30 ? 'critical' : 'high',
      category: 'CI Pipeline',
      headline: `CI pass rate ${successRate.toFixed(0)}% — infrastructure failures blocking releases`,
      metric: `${successRate.toFixed(0)}% pass rate`,
    })
  }
  if (nightlyStreak >= 2) {
    liveAlerts.push({
      severity: nightlyStreak >= 7 ? 'critical' : 'high',
      category: 'Nightly QA',
      headline: `Nightly gate down ${nightlyStreak} consecutive day${nightlyStreak !== 1 ? 's' : ''} — regressions accumulating undetected`,
      metric: `${nightlyStreak}-day streak`,
    })
  }

  // ── Issues: critical + high first, then medium to fill remaining space ──────
  const critHighItems = planItems.filter(i => i.priority === 'critical' || i.priority === 'high')
  const mediumItems   = planItems.filter(i => i.priority === 'medium')
  const issueItems    = [...critHighItems, ...mediumItems]
  const issueSlots    = Math.max(0, 8 - liveAlerts.length)
  const shownIssues   = issueItems.slice(0, issueSlots)

  // ── Recommendations: top 6, all priorities ───────────────────────────────
  const recommendations = planItems.slice(0, 6)

  const critCount = liveAlerts.filter(a => a.severity === 'critical').length
    + critHighItems.filter(i => i.priority === 'critical').length
  const highCount = liveAlerts.filter(a => a.severity === 'high').length
    + critHighItems.filter(i => i.priority === 'high').length

  const loading = !plan && !build

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border card-head">
        <div className="flex items-center gap-2.5">
          <Shield size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-white">Issues & Recommendations</span>
        </div>
        <div className="flex items-center gap-1.5">
          {critCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-accent-red/15 text-accent-red border-accent-red/30">
              {critCount} Critical
            </span>
          )}
          {highCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-orange-400/15 text-orange-300 border-orange-400/30">
              {highCount} High
            </span>
          )}
          {plan?.summary?.total_items != null && (
            <span className="text-[10px] text-gray-500 bg-surface-3 px-2 py-0.5 rounded border border-border">
              {plan.summary.total_items} tracked
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="py-10 text-center text-[12px] text-gray-400">Loading issues…</div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">

          {/* ── Left: Active Issues ─────────────────────────────────────── */}
          <div className="p-4 space-y-2">
            <div className="section-head">Active Issues</div>

            {liveAlerts.map((alert, i) => {
              const s = SEV[alert.severity]
              return (
                <div key={`live-${i}`} className={clsx('flex items-start gap-3 px-3 py-2.5 rounded-lg', s.bg)}
                     style={{ animation: anim(`fade-up 0.25s cubic-bezier(0.22, 1, 0.36, 1) ${i * 55}ms both`) }}>
                  <span className={clsx('flex-shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase', s.badge)}>
                    {s.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-[11px] font-semibold leading-snug', s.text)}>{alert.headline}</p>
                    <p className="text-[9px] text-gray-500 font-mono mt-0.5">{alert.category}</p>
                  </div>
                  <span className={clsx('flex-shrink-0 text-[10px] font-mono font-bold whitespace-nowrap', s.text)}>
                    {alert.metric}
                  </span>
                </div>
              )
            })}

            {shownIssues.map((item: any, i: number) => {
              const sev: keyof typeof SEV = item.priority === 'critical' ? 'critical' : item.priority === 'high' ? 'high' : 'medium'
              const s = SEV[sev]
              return (
                <div key={item.id ?? i} className={clsx('flex items-start gap-3 px-3 py-2.5 rounded-lg', s.bg)}
                     style={{ animation: anim(`fade-up 0.25s cubic-bezier(0.22, 1, 0.36, 1) ${(liveAlerts.length + i) * 55}ms both`) }}>
                  <span className={clsx('flex-shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase', s.badge)}>
                    {s.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-[11px] font-semibold leading-snug', s.text)}>{item.title}</p>
                    <p className="text-[9px] text-gray-500 font-mono mt-0.5 capitalize">
                      {item.category} · {item.scope}
                    </p>
                  </div>
                  <span className={clsx('flex-shrink-0 text-[10px] font-mono font-bold whitespace-nowrap', s.text)}>
                    {ciGain(item)}
                  </span>
                </div>
              )
            })}

            {issueItems.length === 0 && liveAlerts.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 py-8 justify-center">
                <CheckCircle size={20} className="text-accent-green mb-0.5" />
                <p className="text-[12px] font-semibold text-accent-green">All systems clean</p>
                <p className="text-[10px] text-gray-400">No critical or high-priority issues</p>
              </div>
            )}

            {/* Overflow hint */}
            {issueItems.length > issueSlots && (
              <p className="text-[10px] text-gray-400 text-center pt-1">
                +{issueItems.length - issueSlots} more issues — see Improvement Plan
              </p>
            )}
          </div>

          {/* ── Right: Recommended Actions ──────────────────────────────── */}
          <div className="p-4">
            <div className="section-head">Recommended Actions</div>

            <div className="space-y-0">
              {recommendations.map((item: any, i: number) => {
                const effortStyle = EFFORT_STYLE[item.effort] ?? EFFORT_STYLE.medium
                const catStyle    = CAT_STYLE[item.category]  ?? 'text-gray-400 bg-surface-3 border-border'
                const gain        = ciGain(item)
                const benefit     = shortBenefit(item)
                return (
                  <div
                    key={item.id ?? i}
                    className="flex items-start gap-3 py-2.5 border-b border-border/60 last:border-0"
                    style={{ animation: anim(`fade-up 0.2s cubic-bezier(0.22, 1, 0.36, 1) ${i * 40}ms both`) }}
                  >
                    {/* Rank */}
                    <span className="text-[11px] text-gray-400 font-mono w-4 flex-shrink-0 pt-0.5">{i + 1}</span>

                    {/* Action + tags */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-100 font-medium leading-snug">{item.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded border capitalize', effortStyle)}>
                          {item.effort} effort
                        </span>
                        <span className={clsx('text-[9px] font-semibold px-1.5 py-0.5 rounded border capitalize', catStyle)}>
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 leading-snug">{benefit}</p>
                    </div>

                    {/* Right column: gain + links */}
                    <div className="flex-shrink-0 text-right space-y-1 min-w-[80px]">
                      <p className="text-[10px] font-mono font-bold text-accent-green">{gain}</p>
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        {ghBase && (item.active_prs ?? []).slice(0, 1).map((pr: number) => (
                          <a
                            key={pr}
                            href={`${ghBase}/pull/${pr}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-0.5 text-[9px] font-mono text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-1.5 py-0.5 rounded hover:bg-accent-blue/20 transition-colors"
                          >
                            PR #{pr} <ExternalLink size={7} />
                          </a>
                        ))}
                        {ghBase && (item.github_issues ?? []).slice(0, 1).map((iss: number) => (
                          <a
                            key={iss}
                            href={`${ghBase}/issues/${iss}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-0.5 text-[9px] font-mono text-gray-500 bg-surface-3 border border-border px-1.5 py-0.5 rounded hover:text-white transition-colors"
                          >
                            #{iss} <ExternalLink size={7} />
                          </a>
                        ))}
                        {item.in_progress && (
                          <span className="text-[9px] text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-1.5 py-0.5 rounded font-semibold">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {recommendations.length === 0 && (
                <p className="py-6 text-center text-[11px] text-gray-400">
                  No improvement data yet — backend still analyzing
                </p>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
