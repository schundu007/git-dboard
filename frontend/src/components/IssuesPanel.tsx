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

          {/* ── Left: Active Issues (dense table) ───────────────────────── */}
          <div>
            <div className="section-head px-4 pt-3 mb-0">Active Issues</div>
            {(liveAlerts.length + shownIssues.length) === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-8 justify-center">
                <CheckCircle size={20} className="text-accent-green mb-0.5" />
                <p className="text-[12px] font-semibold text-accent-green">All systems clean</p>
                <p className="text-[10px] text-gray-400">No critical or high-priority issues</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {liveAlerts.map((alert, i) => {
                    const s = SEV[alert.severity]
                    return (
                      <tr key={`live-${i}`} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40 transition-colors"
                          style={{ animation: anim(`fade-up 0.25s cubic-bezier(0.22, 1, 0.36, 1) ${i * 45}ms both`) }}>
                        <td className="pl-4 pr-2 py-2 align-top w-0">
                          <span className={clsx('inline-block text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase', s.badge)}>{s.label}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className={clsx('block text-[11px] font-medium leading-snug', s.text)}>{alert.headline}</span>
                          <span className="block text-[9px] text-gray-500 font-mono">{alert.category}</span>
                        </td>
                        <td className="pr-4 pl-2 py-2 text-right align-top">
                          <span className={clsx('text-[10px] font-mono font-bold whitespace-nowrap', s.text)}>{alert.metric}</span>
                        </td>
                      </tr>
                    )
                  })}
                  {shownIssues.map((item: any, i: number) => {
                    const sev: keyof typeof SEV = item.priority === 'critical' ? 'critical' : item.priority === 'high' ? 'high' : 'medium'
                    const s = SEV[sev]
                    return (
                      <tr key={item.id ?? i} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40 transition-colors"
                          style={{ animation: anim(`fade-up 0.25s cubic-bezier(0.22, 1, 0.36, 1) ${(liveAlerts.length + i) * 45}ms both`) }}>
                        <td className="pl-4 pr-2 py-2 align-top w-0">
                          <span className={clsx('inline-block text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase', s.badge)}>{s.label}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className={clsx('block text-[11px] font-medium leading-snug', s.text)}>{item.title}</span>
                          <span className="block text-[9px] text-gray-500 font-mono capitalize">{item.category} · {item.scope}</span>
                        </td>
                        <td className="pr-4 pl-2 py-2 text-right align-top">
                          <span className={clsx('text-[10px] font-mono font-bold whitespace-nowrap', s.text)}>{ciGain(item)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {issueItems.length > issueSlots && (
              <p className="text-[10px] text-gray-400 text-center py-2">
                +{issueItems.length - issueSlots} more — see Improvement Plan
              </p>
            )}
          </div>

          {/* ── Right: Recommended Actions (dense table) ────────────────── */}
          <div>
            <div className="section-head px-4 pt-3 mb-0">Recommended Actions</div>
            {recommendations.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-gray-400">No improvement data yet — backend still analyzing</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {recommendations.map((item: any, i: number) => {
                    const effortStyle = EFFORT_STYLE[item.effort] ?? EFFORT_STYLE.medium
                    const catStyle    = CAT_STYLE[item.category]  ?? 'text-gray-400 bg-surface-3 border-border'
                    const pr  = ghBase ? (item.active_prs ?? [])[0] : null
                    const iss = ghBase ? (item.github_issues ?? [])[0] : null
                    return (
                      <tr key={item.id ?? i} className="border-b border-border/40 last:border-0 hover:bg-surface-2/40 transition-colors"
                          style={{ animation: anim(`fade-up 0.2s cubic-bezier(0.22, 1, 0.36, 1) ${i * 35}ms both`) }}>
                        <td className="pl-4 pr-1 py-2 text-[10px] text-gray-500 font-mono align-top w-0">{i + 1}</td>
                        <td className="px-2 py-2">
                          <span className="block text-[11px] text-gray-100 font-medium leading-snug">{item.title}</span>
                          <span className="block text-[9.5px] text-gray-500 mt-0.5">{shortBenefit(item)}</span>
                        </td>
                        <td className="px-1.5 py-2 align-top">
                          <span className={clsx('inline-block text-[8.5px] font-bold px-1.5 py-0.5 rounded border capitalize whitespace-nowrap', effortStyle)}>{item.effort}</span>
                        </td>
                        <td className="px-1.5 py-2 align-top hidden md:table-cell">
                          <span className={clsx('inline-block text-[8.5px] font-semibold px-1.5 py-0.5 rounded border capitalize whitespace-nowrap', catStyle)}>{item.category}</span>
                        </td>
                        <td className="px-1.5 py-2 text-right align-top">
                          <span className="text-[10px] font-mono font-bold text-accent-green whitespace-nowrap">{ciGain(item)}</span>
                        </td>
                        <td className="pr-4 pl-1 py-2 text-right align-top w-0">
                          {pr ? (
                            <a href={`${ghBase}/pull/${pr}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[9px] font-mono text-accent-blue hover:underline whitespace-nowrap">#{pr}<ExternalLink size={7} /></a>
                          ) : iss ? (
                            <a href={`${ghBase}/issues/${iss}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[9px] font-mono text-gray-500 hover:text-white whitespace-nowrap">#{iss}<ExternalLink size={7} /></a>
                          ) : item.in_progress ? (
                            <span className="text-[9px] text-accent-blue font-semibold">active</span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
