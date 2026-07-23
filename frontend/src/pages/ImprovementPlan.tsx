import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Zap, TrendingUp, Clock, Cpu, DollarSign, Eye,
  ChevronDown, ChevronRight, CheckCircle, AlertTriangle,
  Terminal, RefreshCw, Shield, GitPullRequest, Package,
  Bug, Lightbulb, ExternalLink, BarChart2,
  ShieldCheck, Sparkles, Loader2, Play,
} from 'lucide-react'
import clsx from 'clsx'
import { getImprovementPlan, getIssuesAnalysis, getActiveRepo, auditRepo, generateGraph, getGraphStatus } from '../lib/api'
import { useRepoSlug } from '../lib/hooks'
import BusinessReport from '../components/BusinessReport'
import { TabBar } from '../components/ui/TabBar'
import { TargetArchSVG } from '../components/CICDArchitectures'
import LiveCICDPipeline from '../components/LiveCICDPipeline'

// ── Shared helpers ─────────────────────────────────────────────────────────────

const PRIORITY_META: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'text-accent-red border-accent-red/30 bg-accent-red/10',    dot: 'bg-accent-red' },
  high:     { label: 'High',     color: 'text-accent-yellow border-accent-yellow/30 bg-accent-yellow/10', dot: 'bg-accent-yellow' },
  medium:   { label: 'Medium',   color: 'text-accent-blue border-accent-blue/30 bg-accent-blue/10', dot: 'bg-accent-blue' },
  low:      { label: 'Low',      color: 'text-gray-400 border-gray-700 bg-gray-800',                dot: 'bg-gray-500' },
}

const SEVERITY_META: Record<string, { color: string; dot: string }> = {
  critical: { color: 'text-accent-red',    dot: 'bg-accent-red' },
  high:     { color: 'text-accent-yellow', dot: 'bg-accent-yellow' },
  medium:   { color: 'text-accent-blue',   dot: 'bg-accent-blue' },
  low:      { color: 'text-gray-400',      dot: 'bg-gray-600' },
}

const DEMAND_LABEL: Record<string, string> = {
  very_high: 'Very High Demand',
  high:      'High Demand',
  medium:    'Medium Demand',
  low:       'Low Demand',
}
const DEMAND_COLOR: Record<string, string> = {
  very_high: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  high:      'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30',
  medium:    'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  low:       'bg-gray-800 text-gray-400 border-gray-700',
}

const EFFORT_LABEL: Record<string, string> = { low: 'Low effort', medium: 'Medium effort', high: 'High effort' }
const IMPACT_LABEL: Record<string, string> = { low: 'Low impact', medium: 'Medium impact', high: 'High impact' }
const EFFORT_COLOR: Record<string, string> = {
  low:    'bg-accent-green/10 text-accent-green border-accent-green/30',
  medium: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30',
  high:   'bg-accent-red/10 text-accent-red border-accent-red/30',
}
const IMPACT_COLOR: Record<string, string> = {
  low:    'bg-gray-800 text-gray-400 border-gray-700',
  medium: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  high:   'bg-accent-green/10 text-accent-green border-accent-green/30',
}

const CATEGORY_META: Record<string, { icon: any; color: string }> = {
  reliability:   { icon: Shield,     color: 'text-accent-red' },
  cost:          { icon: DollarSign, color: 'text-accent-green' },
  performance:   { icon: Zap,        color: 'text-accent-yellow' },
  observability: { icon: Eye,        color: 'text-accent-blue' },
}

function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-semibold tracking-widest uppercase', meta.color)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

function Pill({ label, color }: { label: string; color: string }) {
  return <span className={clsx('inline-block px-2 py-0.5 rounded border text-[10px] font-medium', color)}>{label}</span>
}

function IssueLink({ number }: { number: number }) {
  const { data } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const slug = data?.active?.slug ?? ''
  return (
    <a
      href={`https://github.com/${slug}/issues/${number}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-[10px] font-mono text-accent-blue hover:underline"
    >
      #{number}<ExternalLink size={8} className="ml-0.5" />
    </a>
  )
}

function PRLink({ number }: { number: number }) {
  const { data } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const slug = data?.active?.slug ?? ''
  return (
    <a
      href={`https://github.com/${slug}/pull/${number}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-[10px] font-mono text-accent-green hover:underline"
    >
      PR #{number}<ExternalLink size={8} className="ml-0.5" />
    </a>
  )
}

// ── Plan item card ─────────────────────────────────────────────────────────────

function PlanItemCard({ item }: { item: any }) {
  const [open, setOpen] = useState(false)
  const catMeta = CATEGORY_META[item.category] ?? { icon: Zap, color: 'text-accent-yellow' }
  const CatIcon = catMeta.icon
  const savings = item.estimated_savings ?? {}
  const isInfra = item.scope === 'infrastructure'

  return (
    <div className={clsx(
      'bg-surface-1 border rounded-xl overflow-hidden transition-all',
      item.priority === 'critical' ? 'border-accent-red/40' : 'border-border',
    )}>
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-surface-2/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className={clsx('p-1.5 rounded-lg mt-0.5 flex-shrink-0', `bg-${catMeta.color.replace('text-', '')}/10`)}>
          <CatIcon size={13} className={catMeta.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <PriorityBadge priority={item.priority} />
            <span className={clsx(
              'text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded border',
              isInfra
                ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'
                : 'bg-purple-500/10 text-purple-400 border-purple-500/20',
            )}>
              {isInfra ? 'Infrastructure' : 'Product'}
            </span>
            {item.in_progress && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded border bg-accent-green/10 text-accent-green border-accent-green/30">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                {item.active_prs?.length ?? 0} PRs in flight
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-white leading-tight">{item.title}</p>
          {!open && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{item.problem}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <Pill label={EFFORT_LABEL[item.effort]} color={EFFORT_COLOR[item.effort]} />
          <Pill label={IMPACT_LABEL[item.impact]} color={IMPACT_COLOR[item.impact]} />
          {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-border/50 pt-3">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1">Problem</p>
            <p className="text-[12px] text-gray-300 leading-relaxed">{item.problem}</p>
          </div>

          {item.active_prs?.length > 0 && (
            <div className="bg-accent-green/5 border border-accent-green/20 rounded-lg px-3 py-2">
              <p className="text-[10px] text-accent-green uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                Active PRs — Work Already In Flight
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.active_prs.map((n: number) => <PRLink key={n} number={n} />)}
              </div>
            </div>
          )}

          {item.github_issues?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Related GitHub Issues</p>
              <div className="flex flex-wrap gap-1.5">
                {item.github_issues.map((n: number) => <IssueLink key={n} number={n} />)}
              </div>
            </div>
          )}

          {item.root_causes?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Root Causes</p>
              <ul className="flex flex-col gap-1">
                {item.root_causes.map((c: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-600 flex-shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Actions</p>
            <ul className="flex flex-col gap-1.5">
              {item.actions.map((a: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-gray-300">
                  <CheckCircle size={11} className="text-accent-green mt-0.5 flex-shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[180px]">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Estimated Savings</p>
              <div className="flex flex-col gap-1">
                {savings.pass_rate_delta && (
                  <p className="text-[11px] text-accent-green flex items-center gap-1.5"><TrendingUp size={10} /> {savings.pass_rate_delta}</p>
                )}
                {savings.gpu_hours_per_week && (
                  <p className="text-[11px] text-accent-yellow flex items-center gap-1.5"><Cpu size={10} /> {savings.gpu_hours_per_week}</p>
                )}
                {savings.time_per_run_min && (
                  <p className="text-[11px] text-accent-blue flex items-center gap-1.5"><Clock size={10} /> -{savings.time_per_run_min} min/run</p>
                )}
                {savings.cost_note && (
                  <p className="text-[11px] text-accent-green flex items-center gap-1.5"><DollarSign size={10} /> {savings.cost_note}</p>
                )}
                {!savings.pass_rate_delta && !savings.gpu_hours_per_week && !savings.time_per_run_min && !savings.cost_note && (
                  <p className="text-[11px] text-gray-400">Qualitative improvement</p>
                )}
              </div>
            </div>
            {item.files?.length > 0 && (
              <div className="flex-1 min-w-[180px]">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1.5">Files to Change</p>
                <ul className="flex flex-col gap-1">
                  {item.files.map((f: string) => (
                    <li key={f} className="text-[10px] font-mono text-gray-400 flex items-center gap-1.5">
                      <Terminal size={9} className="text-gray-400 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((t: string) => (
                <span key={t} className="text-[9px] font-mono bg-gray-800 text-gray-500 border border-gray-700 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Issues Analysis tab ────────────────────────────────────────────────────────

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

function IssueRow({ issue, type }: { issue: any; type: 'bug' | 'feature' }) {
  const { data: arData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const slug = arData?.active?.slug ?? ''
  const sev = type === 'bug' ? issue.severity : issue.demand
  const meta = SEVERITY_META[sev ?? 'medium']
  const demandMeta = DEMAND_COLOR[sev ?? 'medium']

  return (
    <tr className="border-b border-border/30 hover:bg-surface-2/40 text-xs transition-colors group">
      <td className="px-3 py-2">
        <a
          href={`https://github.com/${slug}/issues/${issue.number}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-accent-blue hover:underline flex items-center gap-1"
        >
          #{issue.number}
          <ExternalLink size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      </td>
      <td className="px-3 py-2 text-gray-200 max-w-[420px]">
        <span className="line-clamp-1" title={issue.title}>{issue.title}</span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {(issue.labels ?? []).map((l: string) => (
            <span key={l} className="text-[9px] font-mono bg-surface-2 text-gray-400 border border-border px-1.5 py-0.5 rounded">
              {l}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        {type === 'bug' ? (
          <span className={clsx('flex items-center gap-1.5 text-[10px] font-semibold', meta.color)}>
            <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', meta.dot)} />
            {sev}
          </span>
        ) : (
          <span className={clsx('text-[9px] px-2 py-0.5 rounded border', demandMeta)}>
            {DEMAND_LABEL[sev] ?? sev}
          </span>
        )}
      </td>
    </tr>
  )
}

function IssuesAnalysisTab() {
  const slug = useRepoSlug()
  const { data, isLoading, isError } = useQuery({
    queryKey: [slug, 'issues-analysis'],
    queryFn: getIssuesAnalysis,
    staleTime: 10 * 60_000,
  })

  const [activeSection, setActiveSection] = useState<'infra' | 'bugs' | 'features'>('infra')

  if (isLoading) return <div className="text-center py-16 text-gray-500 text-sm">Loading issue analysis…</div>
  if (isError || !data) return <div className="text-center py-16 text-accent-red text-sm">Failed to load issue analysis</div>

  const cc = data.category_counts
  const total = data.total_open

  const pct = (n: number) => Math.round((n / total) * 100)

  const infraBySeveity = [...(data.infrastructure_issues ?? [])].sort(
    (a: any, b: any) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  )
  const bugsBySeverity = [...(data.product_bug_issues ?? [])].sort(
    (a: any, b: any) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  )
  const featuresByDemand = [...(data.product_feature_issues ?? [])].sort(
    (a: any, b: any) => SEVERITY_ORDER.indexOf(a.demand) - SEVERITY_ORDER.indexOf(b.demand),
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Header stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-white">{total} Open Issues</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{data.source} · {data.fetched_at}</p>
            </div>
            <a href={`https://github.com/${slug}/issues`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] text-accent-blue hover:underline">
              GitHub <ExternalLink size={9} />
            </a>
          </div>
          <div className="flex flex-col gap-1.5">
            {[
              { label: 'Product Bugs',     color: 'bg-accent-red',    n: cc.product_bug },
              { label: 'Infrastructure',   color: 'bg-accent-yellow', n: cc.infrastructure },
              { label: 'Feature Requests', color: 'bg-purple-500',    n: cc.product_feature },
              { label: 'Other',            color: 'bg-gray-600',      n: cc.other },
            ].map(({ label, color, n }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', color)} />
                <span className="text-[10px] text-gray-400 w-28 flex-shrink-0">{label}</span>
                <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct(n)}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-white tabular-nums w-6 text-right">{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-white">{data.total_open_prs} Open PRs</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Active development breakdown</p>
            </div>
            <a href={`https://github.com/${slug}/pulls`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] text-accent-blue hover:underline">
              GitHub <ExternalLink size={9} />
            </a>
          </div>
          <div className="flex flex-col gap-1.5">
            {[
              { label: 'Documentation',   color: 'bg-accent-blue',   n: data.pr_category_counts?.documentation ?? 0 },
              { label: 'Infrastructure',  color: 'bg-accent-yellow', n: data.pr_category_counts?.infrastructure ?? 0 },
              { label: 'Bug Fixes',       color: 'bg-accent-red',    n: data.pr_category_counts?.product_bugfix ?? 0 },
              { label: 'Features',        color: 'bg-purple-500',    n: data.pr_category_counts?.product_feature ?? 0 },
              { label: 'Refactor / Deps', color: 'bg-gray-500',      n: (data.pr_category_counts?.refactor ?? 0) + (data.pr_category_counts?.dependency ?? 0) },
            ].map(({ label, color, n }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', color)} />
                <span className="text-[10px] text-gray-400 w-28 flex-shrink-0">{label}</span>
                <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full', color)}
                    style={{ width: `${data.total_open_prs ? Math.round((n / data.total_open_prs) * 100) : 0}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-white tabular-nums w-6 text-right">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active PR Clusters */}
      {(data.active_pr_clusters ?? []).length > 0 && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            Active PR Clusters — Work In Flight
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(data.active_pr_clusters ?? []).map((cluster: any) => (
              <div key={cluster.cluster} className="bg-surface-2/50 border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-semibold text-white">{cluster.cluster}</p>
                  <span className="text-[9px] font-mono bg-accent-green/10 text-accent-green border border-accent-green/20 px-1.5 py-0.5 rounded">
                    {cluster.pr_count} PRs
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mb-2">{cluster.description}</p>
                <div className="flex flex-wrap gap-1">
                  {(cluster.key_prs ?? []).map((n: number) => (
                    <a
                      key={n}
                      href={`https://github.com/${slug}/pull/${n}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] font-mono text-accent-green hover:underline"
                    >
                      #{n}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key insights */}
      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <div className="section-head"><Lightbulb size={13} className="text-accent-yellow flex-shrink-0" />Key Insights</div>
        <ul className="flex flex-col gap-1.5">
          {(data.key_insights ?? []).map((ins: string, i: number) => (
            <li key={i} className="flex items-start gap-2 text-[11px] text-gray-300">
              <Lightbulb size={11} className="text-accent-yellow mt-0.5 flex-shrink-0" />
              {ins}
            </li>
          ))}
        </ul>
      </div>

      {/* Section selector */}
      <div className="flex gap-1">
        {([
          { id: 'infra',    label: `Infrastructure (${data.infrastructure_issues?.length ?? 0})`, icon: Package, color: 'accent-yellow' },
          { id: 'bugs',     label: `Product Bugs (${data.product_bug_issues?.length ?? 0})`,       icon: Bug,     color: 'accent-red' },
          { id: 'features', label: `Feature Requests (${data.product_feature_issues?.length ?? 0})`, icon: Lightbulb, color: 'purple-400' },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all',
              activeSection === id
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'bg-surface-1 text-gray-400 border-border hover:border-gray-600',
            )}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Infrastructure issues */}
      {activeSection === 'infra' && (
        <div className="space-y-3">
          <div className="section-head">
            <Package size={13} className="text-accent-yellow flex-shrink-0" />
            Infrastructure Issues
            <span className="text-xs text-gray-400 font-normal ml-1">— build pipeline, installation, Docker, ECR, CI failures</span>
          </div>
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-2/30">
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {['Issue', 'Title', 'Labels', 'Severity'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {infraBySeveity.map((issue: any) => (
                  <IssueRow key={issue.number} issue={issue} type="bug" />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product bugs */}
      {activeSection === 'bugs' && (
        <div className="space-y-3">
          <div className="section-head">
            <Bug size={13} className="text-accent-red flex-shrink-0" />
            Product Bugs
            <span className="text-xs text-gray-400 font-normal ml-1">— runtime crashes, physics correctness, training failures</span>
          </div>
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-2/30">
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {['Issue', 'Title', 'Labels', 'Severity'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bugsBySeverity.map((issue: any) => (
                  <IssueRow key={issue.number} issue={issue} type="bug" />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Feature requests */}
      {activeSection === 'features' && (
        <div className="space-y-3">
          <div className="section-head">
            <Lightbulb size={13} className="text-purple-400 flex-shrink-0" />
            Feature Requests
            <span className="text-xs text-gray-400 font-normal ml-1">— Newton backend, new algorithms, packaging improvements</span>
          </div>
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-2/30">
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {['Issue', 'Title', 'Labels', 'Demand'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featuresByDemand.map((issue: any) => (
                  <IssueRow key={issue.number} issue={issue} type="feature" />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Plan tab ───────────────────────────────────────────────────────────────────

type PlanScope = 'all' | 'infrastructure' | 'product'
type PlanPriority = 'all' | 'critical' | 'high' | 'medium'

function SummaryCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: any; color: string
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={clsx('p-1.5 rounded-lg', `bg-${color}/10`)}>
          <Icon size={13} className={`text-${color}`} />
        </div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums font-mono">{value}</p>
      {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
    </div>
  )
}

function ContextBar({ ctx }: { ctx: any }) {
  const fmt = (v: any, suffix = '') => v != null && v !== undefined ? `${v}${suffix}` : '—'
  const metrics = [
    { label: 'Postmerge pass',  value: fmt(ctx.postmerge_pass_rate, '%'),     bad: true,  icon: GitPullRequest },
    { label: 'Build CI pass',   value: fmt(ctx.build_pass_rate, '%'),          bad: true,  icon: RefreshCw },
    { label: 'Infra failures',  value: fmt(ctx.infra_failure_pct, '%'),        bad: true,  icon: AlertTriangle },
    { label: 'Fail streak',     value: fmt(ctx.nightly_fail_streak_days, 'd'), bad: ctx.nightly_fail_streak_days > 0, icon: Clock },
    { label: 'Open issues',     value: fmt(ctx.total_open_issues),             bad: false, icon: Bug },
    { label: 'Postmerge runs',  value: fmt(ctx.postmerge_total_runs),          bad: false, icon: BarChart2 },
    { label: 'Build CI runs',   value: fmt(ctx.build_total_runs),              bad: false, icon: Zap },
  ]
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-3">
      <div className="section-head">Live Baseline Metrics</div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {metrics.map(({ label, value, bad, icon: Icon }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Icon size={10} className={bad ? 'text-accent-red' : 'text-accent-blue'} />
            <span className="text-[10px] text-gray-500">{label}:</span>
            <span className={clsx('text-[11px] font-mono font-semibold', bad ? 'text-accent-red' : 'text-accent-blue')}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanTab({ items, summary }: { items: any[]; summary: any }) {
  const [scope, setScope] = useState<PlanScope>('all')
  const [priority, setPriority] = useState<PlanPriority>('all')

  const infraItems = items.filter((i: any) => i.scope === 'infrastructure')
  const productItems = items.filter((i: any) => i.scope === 'product')

  const filtered = items.filter((i: any) => {
    if (scope !== 'all' && i.scope !== scope) return false
    if (priority !== 'all' && i.priority !== priority) return false
    return true
  })

  const quickWins = items.filter((i: any) => i.effort === 'low' && ['high', 'medium'].includes(i.impact))

  const ctx = summary?.context

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Plan Items"         value={summary?.total_items ?? '—'}               sub={`${summary?.in_progress_items ?? 0} in progress`} icon={Lightbulb} color="accent-yellow" />
        <SummaryCard label="Issues Addressed"  value={summary?.github_issues_addressed ?? '—'}   sub="GitHub issues covered"     icon={Bug}    color="accent-red" />
        <SummaryCard label="Active PRs Tracked" value={summary?.active_prs_tracked ?? '—'}       sub="PRs already in flight"     icon={GitPullRequest} color="accent-green" />
        <SummaryCard label="Time Saved / Run"  value={`~${summary?.total_time_saved_per_run_min ?? 0} min`} sub="If all applied" icon={Clock}  color="accent-blue" />
      </div>

      {ctx && <ContextBar ctx={ctx} />}

      {/* Scope breakdown row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-1 border border-accent-yellow/20 rounded-xl p-3 flex items-start gap-3">
          <Package size={16} className="text-accent-yellow mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[11px] font-semibold text-white">Infrastructure</p>
            <p className="text-[10px] text-gray-500 mt-0.5">CI/CD pipeline, runners, Docker, ECR, scripts</p>
            <div className="flex gap-2 mt-2">
              {(['critical','high','medium'] as const).map(p => {
                const n = infraItems.filter((i: any) => i.priority === p).length
                if (!n) return null
                return <Pill key={p} label={`${n} ${p}`} color={PRIORITY_META[p].color} />
              })}
            </div>
          </div>
        </div>
        <div className="bg-surface-1 border border-purple-500/20 rounded-xl p-3 flex items-start gap-3">
          <Bug size={16} className="text-purple-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[11px] font-semibold text-white">Product</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Source bugs, compatibility, features, installation UX</p>
            <div className="flex gap-2 mt-2">
              {(['critical','high','medium'] as const).map(p => {
                const n = productItems.filter((i: any) => i.priority === p).length
                if (!n) return null
                return <Pill key={p} label={`${n} ${p}`} color={PRIORITY_META[p].color} />
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Quick wins */}
      {quickWins.length > 0 && (
        <div className="bg-accent-green/5 border border-accent-green/20 rounded-xl p-3">
          <p className="text-[10px] text-accent-green uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
            <Zap size={10} /> Quick Wins — Low Effort, High/Medium Impact
          </p>
          <div className="flex flex-wrap gap-2">
            {quickWins.map((item: any) => (
              <span key={item.id} className="text-[11px] bg-surface-1 border border-border rounded-lg px-2.5 py-1 text-gray-300 flex items-center gap-1.5">
                <CheckCircle size={10} className="text-accent-green flex-shrink-0" />
                {item.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {(['all', 'infrastructure', 'product'] as PlanScope[]).map(s => {
            // Scope counts reflect the active priority filter
            const scopeCount = s === 'all'
              ? (priority === 'all' ? items.length : items.filter((i: any) => i.priority === priority).length)
              : (priority === 'all'
                  ? items.filter((i: any) => i.scope === s).length
                  : items.filter((i: any) => i.scope === s && i.priority === priority).length)
            return (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all capitalize',
                  scope === s
                    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'bg-surface-1 text-gray-400 border-border hover:border-gray-600',
                )}
              >
                {s === 'all' ? 'All Scopes' : s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="ml-1 text-gray-400">({scopeCount})</span>
              </button>
            )
          })}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex gap-1">
          {(['all', 'critical', 'high', 'medium'] as PlanPriority[]).map(p => {
            // Priority counts reflect the active scope filter
            const scopedItems = scope === 'all' ? items : items.filter((i: any) => i.scope === scope)
            const priorityCount = p === 'all'
              ? scopedItems.length
              : scopedItems.filter((i: any) => i.priority === p).length
            return (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all',
                  priority === p
                    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'bg-surface-1 text-gray-400 border-border hover:border-gray-600',
                )}
              >
                {p === 'all' ? 'All priorities' : PRIORITY_META[p]?.label}
                <span className="ml-1 text-gray-400">({priorityCount})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="text-center py-10 text-gray-500 text-sm">No items match the selected filters</p>
        )}
        {filtered.map((item: any) => <PlanItemCard key={item.id} item={item} />)}
      </div>
    </div>
  )
}

// ── CI/CD Architecture comparison ─────────────────────────────────────────────

type ArchView = 'current' | 'target'

function CICDArchitectureSection() {
  const [view, setView] = useState<ArchView>('current')
  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          <span className="text-[11px] font-semibold text-white tracking-[0.15em] uppercase">CI/CD Pipeline</span>
        </div>
        <div className="flex gap-1">
          {([
            { id: 'current' as ArchView, label: 'Current State',  color: view === 'current' ? 'bg-[#1e3a5f]/60 text-[#60a5fa] border-[#1e3a5f]' : 'bg-surface-2 text-gray-400 border-border hover:border-gray-600' },
            { id: 'target'  as ArchView, label: 'Target State',   color: view === 'target'  ? 'bg-[#0d9488]/15 text-[#0d9488] border-[#0d9488]/40' : 'bg-surface-2 text-gray-400 border-border hover:border-gray-600' },
          ]).map(({ id, label, color }) => (
            <button key={id} onClick={() => setView(id)}
              className={clsx('px-3 py-1 rounded-lg text-[11px] font-medium border transition-all', color)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div
        className={clsx(
          'p-2 w-full',
          view === 'current' ? 'bg-[#060c18] min-h-[320px]' : 'bg-[#060c06]',
        )}
        style={view === 'current' ? undefined : { aspectRatio: '1000 / 480' }}
      >
        {view === 'current' ? <LiveCICDPipeline /> : <TargetArchSVG />}
      </div>
      <div className="px-4 py-2 border-t border-border flex items-center gap-4">
        {view === 'current' ? (
          <>
            <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Live</span>
            <span className="text-[10px] text-gray-500 font-mono">Actual workflows for the selected repo · stages inferred from names · click a workflow to open it on GitHub</span>
          </>
        ) : (
          <>
            <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Improvements</span>
            <span className="text-[10px] text-[#0d9488] font-mono">BuildKit cache · ECR regional · SBOM + cosign · SLSA L3 · Prometheus + Grafana + PagerDuty</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

// ── Best Practices tab (graph-driven audit) ─────────────────────────────────────

const AUDIT_SEV: Record<string, string> = {
  critical: 'text-accent-red', high: 'text-accent-yellow', medium: 'text-accent-blue', low: 'text-gray-400',
}

function BestPracticesTab() {
  const { data: ar } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const owner = ar?.active?.owner ?? ''
  const repo = ar?.active?.repo ?? ''
  const slug = ar?.active?.slug ?? ''
  const [loading, setLoading] = useState(false)
  const [audit, setAudit] = useState<any | null>(null)
  const [gen, setGen] = useState<any | null>(null)

  const run = async () => {
    if (!owner || !repo) return
    setLoading(true); setAudit(null)
    try { setAudit(await auditRepo(owner, repo)) }
    catch (e: any) { setAudit({ error: e.message }) }
    finally { setLoading(false) }
  }
  const analyze = async () => {
    if (!owner || !repo) return
    setGen({ running: true })
    try {
      await generateGraph(owner, repo)
      for (let i = 0; i < 240; i++) {
        await new Promise(r => setTimeout(r, 2500))
        const s = await getGraphStatus(owner, repo)
        setGen(s)
        if (!s.running) break
      }
    } catch (e: any) { setGen({ running: false, error: e.message }) }
  }

  if (!slug) return <div className="text-center py-16 text-gray-500 text-sm">No active repository.</div>

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface-1 border border-border rounded-xl p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white flex items-center gap-2"><ShieldCheck size={14} className="text-brand" /> Best-practices audit</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Evaluate <span className="font-mono text-gray-400">{slug}</span>'s existing system against best practices, from its knowledge graph.</p>
        </div>
        <button onClick={run} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-brand/15 border border-brand/25 text-brand hover:bg-brand/25 disabled:opacity-40 flex-shrink-0">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Run audit
        </button>
      </div>

      {loading && <div className="text-center py-10 text-gray-500 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin text-brand" /> Auditing from the knowledge graph…</div>}

      {audit?.error && (
        <div className="bg-surface-1 border border-border rounded-xl p-4">
          <p className="text-[12px] text-accent-red flex items-center gap-1.5"><AlertTriangle size={12} /> {audit.error}</p>
          {/No graph/i.test(audit.error) && (
            <div className="mt-3">
              <p className="text-[11px] text-gray-400 mb-2">Generate the knowledge graph first, then run the audit.</p>
              <button onClick={analyze} disabled={gen?.running} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border border-border bg-surface-2 text-gray-300 hover:border-gray-500 disabled:opacity-40">
                {gen?.running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Generate graph
              </button>
              {gen && !gen.error && <span className="ml-2 text-[11px] text-gray-400">{gen.running ? `summarised ${gen.done ?? 0}/${gen.total ?? 0}…` : `ready — ${gen.nodes ?? 0} nodes`}</span>}
              {gen?.error && <span className="ml-2 text-[11px] text-accent-red">{gen.error}</span>}
            </div>
          )}
        </div>
      )}

      {audit && !audit.error && (
        <div className="bg-surface-1 border border-border rounded-xl p-4 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {audit.score != null && (
              <div className="flex-shrink-0 w-16 h-16 rounded-xl border border-border bg-surface-2 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-brand leading-none font-mono">{audit.score}</span>
                <span className="text-[9px] text-gray-500 mt-0.5">/ 100</span>
              </div>
            )}
            {audit.summary && <p className="text-[13px] text-gray-300">{audit.summary}</p>}
          </div>
          {audit.strengths?.length > 0 && (
            <div>
              <div className="section-head"><CheckCircle size={13} className="text-accent-green" /> Strengths</div>
              <ul className="flex flex-col gap-1">{audit.strengths.map((s: string, i: number) => (<li key={i} className="text-[12px] text-gray-300 flex gap-2"><CheckCircle size={12} className="text-accent-green flex-shrink-0 mt-0.5" />{s}</li>))}</ul>
            </div>
          )}
          {audit.gaps?.length > 0 && (
            <div>
              <div className="section-head"><AlertTriangle size={13} className="text-accent-yellow" /> Gaps &amp; recommendations</div>
              <div className="flex flex-col gap-2">
                {audit.gaps.map((g: any, i: number) => (
                  <div key={i} className="border border-border rounded-lg p-3 bg-surface-2/40">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx('text-[9px] font-mono uppercase', AUDIT_SEV[g.severity] ?? AUDIT_SEV.medium)}>{g.severity}</span>
                      <span className="text-[12.5px] font-semibold text-white">{g.area}</span>
                    </div>
                    <p className="text-[12px] text-gray-300">{g.finding}</p>
                    <p className="text-[12px] text-brand mt-1">→ {g.recommendation}</p>
                    {g.evidence?.length > 0 && <p className="text-[10px] text-gray-500 font-mono mt-1">{g.evidence.join(', ')}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {audit.quick_wins?.length > 0 && (
            <div>
              <div className="section-head"><Zap size={13} className="text-accent-green" /> Quick wins</div>
              <ul className="flex flex-col gap-1">{audit.quick_wins.map((s: string, i: number) => (<li key={i} className="text-[12px] text-gray-300 flex gap-2"><Zap size={11} className="text-accent-green flex-shrink-0 mt-0.5" />{s}</li>))}</ul>
            </div>
          )}
          <p className="text-[10px] text-gray-500 border-t border-border pt-2">Claude's analysis from the knowledge graph — pairs with the live-metrics plan above.</p>
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

type MainTab = 'plan' | 'issues' | 'audit'

export default function ImprovementPlan() {
  const slug = useRepoSlug()
  const [mainTab, setMainTab] = useState<MainTab>('plan')

  const { data, isLoading } = useQuery({
    queryKey: [slug, 'improvement-plan'],
    queryFn: getImprovementPlan,
    staleTime: 5 * 60_000,
  })

  const summary = data?.summary
  const items: any[] = data?.items ?? []

  return (
    <div className="space-y-5">
      <BusinessReport />

      {/* CI/CD architecture comparison */}
      <CICDArchitectureSection />

      {/* Header */}
      <div className="flex items-start justify-between">
        <p className="text-[11px] text-gray-500">
          Derived from live pipeline metrics + deep analysis of {summary?.context?.total_open_issues ?? 150} open GitHub issues
        </p>
        <div className="flex items-center gap-2">
          <span className={clsx(
            'text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded border',
            'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
          )}>
            {summary?.infrastructure_items ?? '—'} infra
          </span>
          <span className={clsx(
            'text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded border',
            'bg-purple-500/10 text-purple-400 border-purple-500/20',
          )}>
            {summary?.product_items ?? '—'} product
          </span>
        </div>
      </div>

      {/* Main tab switcher */}
      <TabBar
        tabs={[
          { id: 'plan',   label: 'Improvement Plan',      icon: Lightbulb   },
          { id: 'issues', label: 'GitHub Issues Analysis', icon: Bug         },
          { id: 'audit',  label: 'Best Practices',         icon: ShieldCheck },
        ]}
        active={mainTab}
        onChange={setMainTab}
      />

      {isLoading && mainTab !== 'audit' && <div className="text-center py-16 text-gray-500 text-sm">Loading…</div>}

      {!isLoading && mainTab === 'plan' && <PlanTab items={items} summary={summary} />}
      {!isLoading && mainTab === 'issues' && <IssuesAnalysisTab />}
      {mainTab === 'audit' && <BestPracticesTab />}

    </div>
  )
}
