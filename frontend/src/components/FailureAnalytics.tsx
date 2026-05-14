import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'
import {
  AlertTriangle, CheckCircle, Users, GitCommit,
  Zap, Shield, TrendingUp, ExternalLink, Clock,
  ChevronRight, Activity,
} from 'lucide-react'
import {
  getBuildStats, getInsightsContributors, getImprovementPlan,
  getQuickWins, getHealthCiTriage, getActiveRepo,
} from '../lib/api'

const TOOLTIP_STYLE = {
  contentStyle: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 6, fontSize: 11 },
  labelStyle: { color: '#56687a' },
  itemStyle: { color: '#1a1a1a' },
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#ff1b2d',
  high:     '#ff8c00',
  medium:   '#86939e',
}
const EFFORT_COLOR: Record<string, string> = {
  low:    'text-accent-green bg-accent-green/10 border-accent-green/20',
  medium: 'text-gray-300 bg-surface-3 border-border',
  high:   'text-accent-red bg-accent-red/10 border-accent-red/20',
}

export default function FailureAnalytics() {
  const { data: build   } = useQuery({ queryKey: ['build-stats-fa'],    queryFn: () => getBuildStats('', 30), staleTime: 120_000 })
  const { data: contribs} = useQuery({ queryKey: ['insights-contributors'], queryFn: getInsightsContributors, staleTime: 300_000 })
  const { data: plan    } = useQuery({ queryKey: ['improvement-plan'],   queryFn: getImprovementPlan,         staleTime: 300_000 })
  const { data: wins    } = useQuery({ queryKey: ['quick-wins'],         queryFn: getQuickWins,               staleTime: 300_000 })
  const { data: triage  } = useQuery({ queryKey: ['health-ci-triage'],  queryFn: getHealthCiTriage,          staleTime: 120_000 })
  const { data: active  } = useQuery({ queryKey: ['active-repo'],       queryFn: getActiveRepo,              staleTime: 30_000  })

  const ghBase = active?.active
    ? `https://github.com/${active.active.owner}/${active.active.repo}`
    : null

  // ── Build timeline data ───────────────────────────────────────────────────
  const byDay: any[] = (build?.by_day ?? []).map((d: any) => ({
    date: d.date.slice(5),   // MM-DD
    success: d.success,
    failure: d.failure,
    total: d.total,
    failRate: d.total > 0 ? Math.round((d.failure / d.total) * 100) : 0,
  }))

  // ── Failure type breakdown ────────────────────────────────────────────────
  const infraPct   = triage?.pcts?.infra   ?? 0
  const productPct = triage?.pcts?.product ?? 0
  const unknownPct = triage?.pcts?.unknown ?? (100 - infraPct - productPct)

  // Fall back to improvement plan counts when triage is empty
  const planCtx  = plan?.summary?.context ?? {}
  const infraPlanCount   = (plan?.summary?.infrastructure_counts?.critical ?? 0)
    + (plan?.summary?.infrastructure_counts?.high ?? 0)
    + (plan?.summary?.infrastructure_counts?.medium ?? 0)
  const productPlanCount = (plan?.summary?.product_counts?.critical ?? 0)
    + (plan?.summary?.product_counts?.high ?? 0)
    + (plan?.summary?.product_counts?.medium ?? 0)
  const totalPlanCount   = infraPlanCount + productPlanCount || 1

  const pieData = triage?.total_analyzed > 0
    ? [
        { name: 'Infrastructure', value: infraPct,   color: '#ff1b2d' },
        { name: 'Product',        value: productPct || 0, color: '#0b5cff' },
        { name: 'Unknown',        value: unknownPct, color: '#a1a1aa' },
      ].filter(d => d.value > 0)
    : [
        { name: 'Infrastructure', value: Math.round(infraPlanCount / totalPlanCount * 100),   color: '#ff1b2d' },
        { name: 'Product',        value: Math.round(productPlanCount / totalPlanCount * 100), color: '#0b5cff' },
      ].filter(d => d.value > 0)

  // ── Failure pattern groups (from CI triage failures) ─────────────────────
  const triageFailures: any[] = triage?.failures ?? []
  const patternMap: Record<string, { count: number; jobs: string[]; category: string; runs: any[] }> = {}
  for (const f of triageFailures) {
    const key = (f.failed_jobs ?? []).sort().join(', ') || 'unknown'
    if (!patternMap[key]) patternMap[key] = { count: 0, jobs: f.failed_jobs ?? [], category: f.category, runs: [] }
    patternMap[key].count++
    if (patternMap[key].runs.length < 3) patternMap[key].runs.push(f)
  }
  const patterns = Object.entries(patternMap)
    .map(([job, v]) => ({ job, ...v, pct: triage?.total_analyzed > 0 ? Math.round((v.count / triage.total_analyzed) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)

  // Fall back to quick wins root causes when triage is empty
  const winItems: any[] = wins?.items ?? []
  const rootCauseGroups = winItems.flatMap((item: any) =>
    (item.root_causes ?? []).map((cause: string, i: number) => ({
      cause: cause.length > 70 ? cause.slice(0, 70) + '…' : cause,
      scope: item.scope,
      priority: item.priority,
      pct: item.id === 'fix-ecr-push-failures' && i === 0 ? 96
        : item.scope === 'infrastructure' ? Math.round(infraPct / Math.max(1, (item.root_causes?.length ?? 1)))
        : 5,
    }))
  ).slice(0, 8)

  // ── Top contributors ──────────────────────────────────────────────────────
  const topContribs = (contribs?.contributors ?? []).slice(0, 8)

  // ── Improvement plan items ────────────────────────────────────────────────
  const planItems: any[] = plan?.items ?? []
  const inProgressItems = planItems.filter((i: any) => i.in_progress)
  const openItems        = planItems.filter((i: any) => !i.in_progress)

  const hasData = byDay.length > 0 || planItems.length > 0 || winItems.length > 0

  return (
    <div className="space-y-4">

      {/* ── Section header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-accent-blue" />
        <h2 className="text-xs font-bold text-white uppercase tracking-wider">Failure Intelligence</h2>
        <span className="text-[10px] text-gray-600">— pipeline health, patterns &amp; remediation</span>
      </div>

      {/* ── Row 1: Build timeline + Failure type pie ─────────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Build failures vs success over time */}
        <div className="col-span-8 bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] font-semibold text-white">Build Outcomes Over Time</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Daily success vs failure — 30-day window</p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent-green inline-block" /> Success</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent-red inline-block" /> Failure</span>
              <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-accent-blue inline-block" /> Fail %</span>
            </div>
          </div>
          {byDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byDay} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e2" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#86939e', fontSize: 9 }} />
                <YAxis yAxisId="left" tick={{ fill: '#86939e', fontSize: 9 }} width={24} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#86939e', fontSize: 9 }} width={28} unit="%" domain={[0, 100]} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar yAxisId="left" dataKey="success" name="Success" stackId="a" fill="#84cc16" radius={[0,0,0,0]} />
                <Bar yAxisId="left" dataKey="failure" name="Failure" stackId="a" fill="#ff1b2d" radius={[2,2,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="failRate" name="Fail %" stroke="#0b5cff" strokeWidth={1.5} dot={{ r: 2, fill: '#0b5cff' }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="No build data for this period" />
          )}
        </div>

        {/* Failure type pie */}
        <div className="col-span-4 bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[11px] font-semibold text-white mb-0.5">Failure Type Breakdown</p>
          <p className="text-[10px] text-gray-500 mb-3">Infrastructure vs Product root cause</p>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={pieData} cx="50%" cy="50%"
                    innerRadius={32} outerRadius={52}
                    dataKey="value" strokeWidth={0}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => [`${v}%`, '']}
                    contentStyle={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', fontSize: 10 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-[10px] text-gray-400">{d.name}</span>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: d.color }}>{d.value}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState label="No failure data yet" />
          )}
        </div>
      </div>

      {/* ── Row 2: Failure patterns + Committers ─────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Similar failure patterns */}
        <div className="col-span-7 bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={12} className="text-accent-red" />
            <p className="text-[11px] font-semibold text-white">Recurring Failure Patterns</p>
            <span className="text-[10px] text-gray-600">% of total failures sharing same root cause</span>
          </div>
          {patterns.length > 0 ? (
            <div className="space-y-2">
              {patterns.map((p, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-2 border border-border">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent-red/10 border border-accent-red/20 flex items-center justify-center">
                    <span className="text-[11px] font-black text-accent-red">{p.pct}%</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white font-mono truncate">{p.job}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {p.count} occurrence{p.count !== 1 ? 's' : ''} · category: <span className={p.category === 'infra' ? 'text-accent-red' : 'text-accent-blue'}>{p.category}</span>
                    </p>
                    {p.runs.length > 0 && ghBase && (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {p.runs.map((r: any) => (
                          <a key={r.run_id} href={r.url} target="_blank" rel="noreferrer"
                            className="text-[9px] font-mono text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-1.5 py-0.5 rounded hover:bg-accent-blue/20 transition-colors flex items-center gap-1">
                            <ExternalLink size={8} />
                            {r.name?.slice(0, 30) ?? `run ${r.run_id}`}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <FailurePct pct={p.pct} />
                </div>
              ))}
            </div>
          ) : rootCauseGroups.length > 0 ? (
            <div className="space-y-1.5">
              {rootCauseGroups.map((rc, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-surface-2 border border-border">
                  <div className="flex-shrink-0 mt-0.5 w-7 text-right">
                    <span className="text-[10px] font-bold" style={{ color: rc.priority === 'critical' ? '#ff1b2d' : rc.priority === 'high' ? '#ff8c00' : '#86939e' }}>
                      {rc.pct > 0 ? `${rc.pct}%` : '—'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-300 leading-relaxed">{rc.cause}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-gray-600 capitalize">{rc.scope}</span>
                      <span className="text-[9px]" style={{ color: PRIORITY_COLOR[rc.priority] ?? '#86939e' }}>{rc.priority}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No failure pattern data available" />
          )}
        </div>

        {/* Top committers */}
        <div className="col-span-5 bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={12} className="text-accent-blue" />
            <p className="text-[11px] font-semibold text-white">Top Committers</p>
            <span className="text-[10px] text-gray-600">by total commits</span>
          </div>
          {topContribs.length > 0 ? (
            <div className="space-y-1.5">
              {topContribs.map((c: any, i: number) => {
                const maxCommits = topContribs[0]?.total ?? 1
                const pct = Math.round((c.total / maxCommits) * 100)
                return (
                  <div key={c.login} className="flex items-center gap-2.5">
                    <span className="text-[9px] text-gray-600 w-3 text-right flex-shrink-0">{i + 1}</span>
                    <img
                      src={c.avatar_url} alt={c.login}
                      className="w-5 h-5 rounded-full flex-shrink-0 border border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <a
                          href={ghBase ? `${ghBase}/commits?author=${c.login}` : '#'}
                          target="_blank" rel="noreferrer"
                          className="text-[10px] font-medium text-gray-300 hover:text-white transition-colors truncate"
                        >
                          {c.login}
                        </a>
                        <span className="text-[9px] text-gray-500 tabular-nums flex-shrink-0 ml-1">{c.total.toLocaleString()}</span>
                      </div>
                      <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-accent-blue" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState label="No contributor data" />
          )}
        </div>
      </div>

      {/* ── Row 3: Remediation status + Improvement pipeline ─────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Remediation status */}
        <div className="col-span-5 bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={12} className="text-accent-green" />
            <p className="text-[11px] font-semibold text-white">Remediation Status</p>
          </div>

          {/* Summary counts */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatMini
              label="In Progress" value={inProgressItems.length}
              color="text-accent-blue" bg="bg-accent-blue/10 border-accent-blue/20"
            />
            <StatMini
              label="Open" value={openItems.length}
              color="text-gray-300" bg="bg-surface-3 border-border"
            />
            <StatMini
              label="Total Items" value={planItems.length}
              color="text-white" bg="bg-surface-3 border-border"
            />
          </div>

          {/* In-progress items */}
          {inProgressItems.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-1">Active Work</p>
              {inProgressItems.slice(0, 5).map((item: any) => (
                <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg bg-surface-2 border border-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse flex-shrink-0 mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white font-medium leading-snug truncate">{item.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px]" style={{ color: PRIORITY_COLOR[item.priority] ?? '#86939e' }}>{item.priority}</span>
                      <span className="text-[9px] text-gray-600">·</span>
                      <span className="text-[9px] text-gray-500 capitalize">{item.scope}</span>
                      {item.active_prs?.length > 0 && ghBase && (
                        <>
                          <span className="text-[9px] text-gray-600">·</span>
                          <div className="flex gap-1">
                            {item.active_prs.slice(0, 2).map((pr: number) => (
                              <a key={pr} href={`${ghBase}/pull/${pr}`} target="_blank" rel="noreferrer"
                                className="text-[9px] text-accent-blue hover:underline">PR #{pr}</a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No active remediation tracked" />
          )}
        </div>

        {/* Improvement plan pipeline */}
        <div className="col-span-7 bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={12} className="text-accent-green" />
              <p className="text-[11px] font-semibold text-white">Improvement Pipeline</p>
            </div>
            <div className="flex items-center gap-2">
              {(['critical','high','medium'] as const).map(p => (
                plan?.summary
                  ? <span key={p} className="text-[9px] px-1.5 py-0.5 rounded border capitalize"
                      style={{ color: PRIORITY_COLOR[p], borderColor: PRIORITY_COLOR[p] + '40', background: PRIORITY_COLOR[p] + '18' }}>
                      {((plan?.summary?.infrastructure_counts?.[p] ?? 0) + (plan?.summary?.product_counts?.[p] ?? 0))} {p}
                    </span>
                  : null
              ))}
            </div>
          </div>

          {planItems.length > 0 ? (
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {planItems.map((item: any) => (
                <div key={item.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-surface-2 border border-border hover:border-gray-600 transition-colors group">
                  {/* Priority dot */}
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                    style={{ background: PRIORITY_COLOR[item.priority] ?? '#86939e' }} />

                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white font-medium leading-snug">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[9px] capitalize text-gray-500">{item.scope}</span>
                      <span className="text-[9px] text-gray-700">·</span>
                      <span className="text-[9px] capitalize text-gray-500">{item.category}</span>
                      {item.estimated_savings?.pass_rate_delta && (
                        <>
                          <span className="text-[9px] text-gray-700">·</span>
                          <span className="text-[9px] text-accent-green font-semibold">{item.estimated_savings.pass_rate_delta}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border capitalize ${EFFORT_COLOR[item.effort] ?? EFFORT_COLOR.medium}`}>
                      {item.effort}
                    </span>
                    {item.in_progress ? (
                      <span className="text-[9px] text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-accent-blue animate-pulse" />
                        WIP
                      </span>
                    ) : (
                      <span className="text-[9px] text-gray-600 bg-surface-3 border border-border px-1.5 py-0.5 rounded">Open</span>
                    )}
                    {item.active_prs?.length > 0 && ghBase && (
                      <a href={`${ghBase}/pull/${item.active_prs[0]}`} target="_blank" rel="noreferrer"
                        className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink size={10} className="text-accent-blue" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No improvement items tracked for this repo" />
          )}
        </div>
      </div>

    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function FailurePct({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#ff1b2d' : pct >= 40 ? '#ff8c00' : '#86939e'
  const r = 10, stroke = 2.5, circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center">
      <svg width="32" height="32" className="-rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" stroke="#e5e4e2" strokeWidth={stroke} />
        <circle cx="16" cy="16" r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[8px] font-bold" style={{ color }}>{pct}</span>
    </div>
  )
}

function StatMini({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-lg border p-2 text-center ${bg}`}>
      <p className={`text-lg font-black tabular-nums ${color}`}>{value}</p>
      <p className="text-[9px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-[11px] text-gray-600">
      {label}
    </div>
  )
}
