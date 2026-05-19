import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ExternalLink, Clock, Activity, TrendingUp, BarChart2,
  GitPullRequest, Container, Moon, Server, Star, GitFork, AlertCircle,
  CheckCircle2, XCircle, AlertTriangle, Zap,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { getActiveRepo, getBuildPerformance, getOverviewSummary, getIssueStats, getPRs } from '../lib/api'
import GitPulseLogo from '../components/GitPulseLogo'
import { TargetArchSVG } from '../components/CICDArchitectures'
import StatusBadge from '../components/StatusBadge'
import { cn } from '../lib/cn'

const FINDINGS = [
  { severity: 'CRIT', stat: '≤30%',   statColor: '#f59e0b',
    title: 'Cache Miss Crisis',
    sub: 'Layer cache rebuilt from scratch on every PR. No BuildKit layer reuse or remote cache backend. Contributors wait 35–45 min for CI feedback on trivial changes.' },
  { severity: 'CRIT', stat: '10+ GB', statColor: '#ef4444',
    title: 'Dockerfile Layer Bloat',
    sub: 'No multi-stage builds or .dockerignore pruning. The full CUDA base image (~10 GB) is pulled and pushed on every commit, even when only Python source changed.' },
  { severity: 'CRIT', stat: '90 min', statColor: '#ef4444',
    title: 'ECR Bandwidth Bottleneck',
    sub: 'Multi-arch manifest lists pushed and pulled over WAN with no regional pull-through cache. ARM64 + x86_64 + CUDA transfers add up to 90-min image operations.' },
  { severity: 'CRIT', stat: '4 PRs',  statColor: '#ef4444',
    title: 'Fork-PR Attack Surface',
    sub: 'Privileged GitHub-hosted runner with write-scoped GITHUB_TOKEN exposed to fork workflows. Four open fork PRs have direct access to secrets and artifact upload.' },
  { severity: 'CRIT', stat: 'none',   statColor: '#ef4444',
    title: 'Supply-Chain Blind Spots',
    sub: 'No Dependabot config, actions pinned by tag not SHA, no SBOM generation, no cosign image signing. Zero provenance verification in the release pipeline.' },
  { severity: 'WARN', stat: '7',      statColor: '#f59e0b',
    title: 'Test Flakiness Backlog',
    sub: 'Seven tests marked @pytest.mark.skip with no resolution ticket. CI stays green while correctness degrades silently, masking real regressions.' },
  { severity: 'WARN', stat: 'zero',   statColor: '#f59e0b',
    title: 'No Observability Layer',
    sub: 'No Prometheus metrics, no Grafana dashboards, no Loki log aggregation, no PagerDuty alerting. Incidents are discovered by end users, not the team.' },
  { severity: 'WARN', stat: 'blind',  statColor: '#f59e0b',
    title: 'No Infra / Product Triage',
    sub: 'Runner environment failures and app build failures are indistinguishable in current logs. Ops cannot determine if a failure is infrastructure or developer code.' },
  { severity: 'CRIT', stat: '429/500', statColor: '#ef4444',
    title: 'Image Download Request Failures',
    sub: 'Container registry pull requests hitting rate limits (HTTP 429) and intermittent server errors (HTTP 500) cause non-deterministic pipeline failures. No retry logic, exponential backoff, or pull-through cache to absorb burst traffic.' },
  { severity: 'CRIT', stat: 'absent', statColor: '#ef4444',
    title: 'No Multi-Stage Pipeline Orchestration',
    sub: 'No cross-repo or monorepo-multiproject pipeline coordination. Multi-repo dependencies are resolved manually; monorepo subprojects share a single pipeline with no isolation between packages. Upstream artifact unavailability fails the entire graph silently.' },
  { severity: 'WARN', stat: 'gaps',  statColor: '#f59e0b',
    title: 'Infrastructure Best Practices',
    sub: 'No Infrastructure-as-Code for runner environments, no config drift detection, no resource quotas or cost controls on ephemeral compute, and no network policy enforcement isolating build workloads from production traffic paths.' },
]

const IMPACT = [
  { label: 'Cost Savings',       value: '↓65%', sub: 'infra + compute spend'   },
  { label: 'Operational Effort', value: '↓75%', sub: 'manual toil eliminated'  },
  { label: 'Developer Velocity', value: '↑60%', sub: 'faster feedback loops'   },
]

const TECH_METRICS = [
  { label: 'PR Pipeline',  from: '35–45 min',  to: '<15 min'  },
  { label: 'Build',        from: '8–15 min',   to: '<3 min'   },
  { label: 'Cache',        from: '~30%',       to: '>90%'     },
  { label: 'Dev Feedback', from: '>30 min',    to: '<5 min'   },
  { label: 'Flaky Tests',  from: '7 skips',    to: '<3'       },
  { label: 'Supply-Chain', from: 'Unverified', to: 'SLSA L3'  },
]

const PHASES = [
  {
    phase: '01', label: 'Immediate', timeframe: '0 – 4 weeks',
    items: [
      'Enable BuildKit layer cache + remote registry-cache backend',
      'Multi-stage Dockerfile + .dockerignore for CUDA base isolation',
      'Pin all GitHub Actions to full commit SHAs',
      'Restrict GITHUB_TOKEN to read-only scope on fork workflows',
    ],
  },
  {
    phase: '02', label: 'Short-term', timeframe: '1 – 3 months',
    items: [
      'Deploy Prometheus + Grafana + Loki + PagerDuty observability',
      'ECR pull-through cache in us-east-1 and eu-west-1 regions',
      'Dependabot for Actions and Python package dependencies',
      'SBOM generation (syft) attached to every image build',
    ],
  },
  {
    phase: '03', label: 'Long-term', timeframe: '3 – 12 months',
    items: [
      'SLSA Level 3 attestation + cosign signing in release pipeline',
      'SLO dashboards with error-budget burn alerts in PagerDuty',
      'Global CDN for ROS 2 package distribution (ARM64 + x86_64)',
      'Automated flaky-test quarantine with resolution SLA tracking',
    ],
  },
]

const ARCH_STAGES = [
  {
    label: 'Pre-merge',
    color: '#9ca3af', fill: '#080808', border: '#374151',
    items: [
      { icon: '#ic-gh',    name: 'GitHub PR',   sub: 'Event Trigger'   },
      { icon: '#ic-ruff',  name: 'ruff + mypy', sub: 'Lint + Types'    },
      { icon: '#ic-flask', name: 'pytest',       sub: 'Unit + Coverage' },
      { icon: '#ic-trivy', name: 'Trivy Scan',  sub: 'SAST + Deps'    },
    ],
  },
  {
    label: 'Build',
    color: '#f59e0b', fill: '#0d0600', border: '#78350f',
    items: [
      { icon: '#ic-docker',   name: 'Docker Buildx',    sub: 'ARM64 · x86_64 · C++' },
      { icon: '#ic-docker',   name: 'CUDA + C++ Image', sub: 'Multi-arch Build'      },
      { icon: '#ic-buildkit', name: 'BuildKit',          sub: 'Layer Cache'           },
      { icon: '#ic-docker',   name: 'Artifact',          sub: 'OCI Image'             },
    ],
  },
  {
    label: 'Integration',
    color: '#34d399', fill: '#001208', border: '#065f46',
    items: [
      { icon: '#ic-docker', name: 'Compose Stack',  sub: 'Service Up'       },
      { icon: '#ic-gh',     name: 'Multi-repo',     sub: 'Dependency Graph' },
      { icon: '#ic-flask',  name: 'Smoke Tests',    sub: 'ROS 2 e2e'        },
      { icon: '#ic-helm',   name: 'Staging Deploy', sub: 'Helm + Argo'      },
    ],
  },
  {
    label: 'Nightly',
    color: '#c084fc', fill: '#0d001a', border: '#6b21a8',
    items: [
      { icon: '#ic-flask', name: 'Full Regression', sub: 'Suite'        },
      { icon: '#ic-ros',   name: 'Isaac ROS',        sub: 'GPU Benchmark'},
      { icon: '#ic-perf',  name: 'Performance',      sub: 'Benchmarks'  },
      { icon: '#ic-chaos', name: 'Chaos / Soak',     sub: 'Stability'   },
    ],
  },
  {
    label: 'Release (Prod)',
    color: '#60a5fa', fill: '#000814', border: '#1e3a8a',
    items: [
      { icon: '#ic-cosign', name: 'cosign',     sub: 'Keyless Signing'  },
      { icon: '#ic-syft',   name: 'syft',        sub: 'SBOM Generation' },
      { icon: '#ic-ngc',    name: 'ECR Push',    sub: 'nvcr.io + ECR'   },
      { icon: '#ic-globe',  name: 'CloudFront',  sub: 'Prod CDN'        },
    ],
  },
]

function ArchSVG() {
  const W = 1200
  const H  = 700

  // Row 1
  const R1_H   = 128
  const TRIG_W = 270
  const OBS_X  = 278
  const OBS_W  = W - OBS_X   // 922

  // K8s cluster
  const K8S_Y  = 138
  const K8S_H  = 344          // ends at y=482
  const K8S_HDR = 22          // zone header height
  const K8S_INNER_Y = K8S_Y + K8S_HDR   // 160 — stages start here

  // Pipeline stages inside K8s
  const STAGE_W   = 228
  const STAGE_GAP = 12
  const STAGE_XS: number[] = [6, 246, 486, 726, 966]
  // stage boxes: y=160, h=316, bottom=476
  const STAGE_H      = K8S_Y + K8S_H - 6 - K8S_INNER_Y  // 316
  const ITEM_HDR_H   = 16
  const ITEM_BODY_H  = STAGE_H - ITEM_HDR_H               // 300
  const ITEM_CELL_H  = ITEM_BODY_H / 4                    // 75
  const ITEM_BODY_Y  = K8S_INNER_Y + ITEM_HDR_H           // 176

  // Row 3 infrastructure
  const R3_Y   = 490
  const R3_H   = H - R3_Y    // 210
  const CACHE_W = 366
  const SEC_X   = 374,  SEC_W = 452
  const ECR_X   = 834,  ECR_W = W - ECR_X   // 366

  const DIM  = '#374151'
  const DDIM = '#1e2d3d'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <defs>
        {/* Arrow markers */}
        <marker id="ah"      markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill={DIM}/></marker>
        <marker id="ah-obs"  markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#1e3a5f"/></marker>
        <marker id="ah-red"  markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#7f1d1d"/></marker>
        <marker id="ah-amb"  markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#78350f"/></marker>
        <marker id="ah-blu"  markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#1e3a8a"/></marker>

        {/* GitHub */}
        <symbol id="ic-gh" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#24292F"/>
          <path fillRule="evenodd" clipRule="evenodd"
            d="M16 3.5C9.1 3.5 3.5 9.1 3.5 16c0 5.5 3.58 10.17 8.56 11.82.63.12.86-.27.86-.6v-2.09c-3.48.76-4.22-1.68-4.22-1.68-.57-1.44-1.38-1.82-1.38-1.82-1.13-.77.09-.75.09-.75 1.25.08 1.9 1.28 1.9 1.28 1.11 1.9 2.9 1.35 3.61 1.03.11-.8.43-1.35.78-1.66-2.77-.31-5.68-1.38-5.68-6.27 0-1.38.49-2.51 1.3-3.4-.13-.32-.56-1.6.12-3.34 0 0 1.06-.34 3.48 1.3a12.1 12.1 0 0 1 6.32 0c2.41-1.64 3.47-1.3 3.47-1.3.68 1.74.25 3.02.12 3.34.81.89 1.3 2.02 1.3 3.4 0 4.9-2.98 5.96-5.81 6.27.46.4.86 1.17.86 2.36v3.5c0 .33.22.72.87.6C24.93 26.16 28.5 21.48 28.5 16 28.5 9.1 22.9 3.5 16 3.5Z"
            fill="white"/>
        </symbol>

        {/* Docker */}
        <symbol id="ic-docker" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#2496ED"/>
          <rect x="4"  y="12.5" width="5" height="4.5" rx="0.8" fill="white"/>
          <rect x="11" y="12.5" width="5" height="4.5" rx="0.8" fill="white"/>
          <rect x="18" y="12.5" width="5" height="4.5" rx="0.8" fill="white"/>
          <rect x="11" y="7"    width="5" height="4.5" rx="0.8" fill="white"/>
          <rect x="18" y="7"    width="5" height="4.5" rx="0.8" fill="white"/>
          <path d="M2 18.5 Q4 16.5 8 17.5 L26 17.5 Q30 18 30 21 Q28 25.5 19 26 Q10 26.5 4 24 Q1 22.5 2 18.5Z" fill="white"/>
          <path d="M24 15.5 C25.5 12.5 27.5 12 29 13.5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </symbol>

        {/* Flask / pytest */}
        <symbol id="ic-flask" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0c1a0c"/>
          <path d="M12 4 L12 14 L6 26 Q5 28 8 28 L24 28 Q27 28 26 26 L20 14 L20 4 Z" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinejoin="round"/>
          <line x1="10" y1="17" x2="22" y2="17" stroke="#4ade80" strokeWidth="1.5" opacity="0.4"/>
          <circle cx="14" cy="22" r="1.5" fill="#4ade80" opacity="0.7"/>
          <circle cx="18" cy="24" r="1"   fill="#4ade80" opacity="0.5"/>
          <line x1="12" y1="4"  x2="20" y2="4"  stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/>
        </symbol>

        {/* Globe / CloudFront */}
        <symbol id="ic-globe" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0a0d0f"/>
          <circle cx="16" cy="16" r="11" fill="none" stroke="#38bdf8" strokeWidth="1.8"/>
          <ellipse cx="16" cy="16" rx="5" ry="11" fill="none" stroke="#38bdf8" strokeWidth="1.8"/>
          <line x1="5"  y1="16" x2="27" y2="16" stroke="#38bdf8" strokeWidth="1.8"/>
          <line x1="7"  y1="10" x2="25" y2="10" stroke="#38bdf8" strokeWidth="1.2" opacity="0.5"/>
          <line x1="7"  y1="22" x2="25" y2="22" stroke="#38bdf8" strokeWidth="1.2" opacity="0.5"/>
        </symbol>

        {/* NGC / ECR */}
        <symbol id="ic-ngc" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#060d1e"/>
          <text x="16" y="13" textAnchor="middle" fontSize="5"  fontFamily="sans-serif" fontWeight="700" fill="#6b7280">NVIDIA</text>
          <text x="16" y="21" textAnchor="middle" fontSize="8"  fontFamily="sans-serif" fontWeight="700" fill="#76b900">NGC</text>
          <path d="M8 26 Q16 31 24 26" fill="none" stroke="#76b900" strokeWidth="1.8" strokeLinecap="round"/>
        </symbol>

        {/* Prometheus */}
        <symbol id="ic-prom" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#1a0800"/>
          <path d="M16 5 C13 9 11 12 12 15 C13 17 15 18 14 21 C12 19 11 17 11 15 C9 12 9 8 13 5 Q14.5 4 16 5Z" fill="#e5531a"/>
          <path d="M16 5 C19 9 21 12 20 15 C19 17 17 18 18 21 C20 19 21 17 21 15 C23 12 23 8 19 5 Q17.5 4 16 5Z" fill="#e5531a"/>
          <circle cx="16" cy="24" r="4"   fill="none" stroke="#e5531a" strokeWidth="2"/>
          <path d="M13 24 Q16 21 19 24" fill="none" stroke="#e5531a" strokeWidth="1.5"/>
        </symbol>

        {/* Grafana */}
        <symbol id="ic-grafana" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0d0900"/>
          <path d="M16 4 L24.9 9 L24.9 19 L16 24 L7.1 19 L7.1 9 Z" fill="none" stroke="#f46800" strokeWidth="1.8"/>
          <text x="16" y="20" textAnchor="middle" fontSize="12" fontFamily="sans-serif" fontWeight="700" fill="#f46800">G</text>
        </symbol>

        {/* Loki */}
        <symbol id="ic-loki" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0d0900"/>
          <line x1="6"  y1="9"  x2="26" y2="9"  stroke="#f46800" strokeWidth="2" strokeLinecap="round"/>
          <line x1="6"  y1="14" x2="22" y2="14" stroke="#f46800" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
          <line x1="6"  y1="19" x2="24" y2="19" stroke="#f46800" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
          <line x1="6"  y1="24" x2="18" y2="24" stroke="#f46800" strokeWidth="2" strokeLinecap="round" opacity="0.35"/>
          <circle cx="27" cy="24" r="3" fill="#f46800" opacity="0.4"/>
        </symbol>

        {/* OpenTelemetry */}
        <symbol id="ic-otel" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#030811"/>
          <circle cx="16" cy="11" r="5"   fill="none" stroke="#4fc3f7" strokeWidth="1.8"/>
          <circle cx="11" cy="20" r="5"   fill="none" stroke="#4fc3f7" strokeWidth="1.8"/>
          <circle cx="21" cy="20" r="5"   fill="none" stroke="#4fc3f7" strokeWidth="1.8"/>
          <circle cx="16" cy="16" r="2.5" fill="#4fc3f7"/>
        </symbol>

        {/* PagerDuty */}
        <symbol id="ic-pd" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#060d06"/>
          <text x="16" y="23" textAnchor="middle" fontSize="19" fontFamily="sans-serif" fontWeight="900" fill="#06ac38">P</text>
          <rect x="8" y="26" width="16" height="2.5" rx="1" fill="#06ac38" opacity="0.5"/>
        </symbol>

        {/* Kubernetes */}
        <symbol id="ic-k8s" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#030d1a"/>
          <circle cx="16" cy="16" r="10"  fill="none" stroke="#326CE5" strokeWidth="1.8"/>
          <circle cx="16" cy="16" r="3.5" fill="none" stroke="#326CE5" strokeWidth="2"/>
          <g stroke="#326CE5" strokeWidth="1.5" transform="translate(16,16)">
            <line x1="0" y1="-3.5" x2="0" y2="-10"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(51.4)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(102.9)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(154.3)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(205.7)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(257.1)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(308.6)"/>
          </g>
        </symbol>

        {/* Ruff linter */}
        <symbol id="ic-ruff" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0d0800"/>
          <path d="M18 4 L10 18 L16 18 L14 28 L22 14 L16 14 Z" fill="#f97316"/>
        </symbol>

        {/* Trivy */}
        <symbol id="ic-trivy" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#06000d"/>
          <path d="M16 4 L27 8 L27 18 Q27 25 16 29 Q5 25 5 18 L5 8 Z" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinejoin="round"/>
          <line x1="10" y1="13" x2="22" y2="13" stroke="#a78bfa" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
          <line x1="10" y1="17" x2="22" y2="17" stroke="#a78bfa" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
          <circle cx="21" cy="21" r="2.5" fill="none" stroke="#a78bfa" strokeWidth="1.5"/>
          <line x1="23" y1="23" x2="26" y2="26" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
        </symbol>

        {/* BuildKit — stacked layers */}
        <symbol id="ic-buildkit" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#001219"/>
          <path d="M16 6  L28 11.5 L16 17 L4 11.5 Z" fill="#00b4d8" opacity="0.9"/>
          <path d="M16 13 L28 18.5 L16 24 L4 18.5 Z" fill="#0077b6" opacity="0.8"/>
          <path d="M16 20 L28 25.5 L16 31 L4 25.5 Z" fill="#023e8a" opacity="0.7"/>
        </symbol>

        {/* Helm */}
        <symbol id="ic-helm" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#00051a"/>
          <circle cx="16" cy="16" r="10"  fill="none" stroke="#0f62fe" strokeWidth="1.8"/>
          <circle cx="16" cy="16" r="3.5" fill="none" stroke="#0f62fe" strokeWidth="2"/>
          <g stroke="#0f62fe" strokeWidth="1.8" strokeLinecap="round" transform="translate(16,16)">
            <line x1="0" y1="-3.5" x2="0" y2="-10"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(60)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(120)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(180)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(240)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-10" transform="rotate(300)"/>
          </g>
          <g fill="#0f62fe" transform="translate(16,16)">
            <circle cx="0"     cy="-10" r="2"/>
            <circle cx="8.66"  cy="-5"  r="2"/>
            <circle cx="8.66"  cy="5"   r="2"/>
            <circle cx="0"     cy="10"  r="2"/>
            <circle cx="-8.66" cy="5"   r="2"/>
            <circle cx="-8.66" cy="-5"  r="2"/>
          </g>
        </symbol>

        {/* cosign */}
        <symbol id="ic-cosign" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0a000d"/>
          <rect x="9" y="14" width="14" height="12" rx="2" fill="none" stroke="#c084fc" strokeWidth="2"/>
          <path d="M11 14 L11 10 Q11 5 16 5 Q21 5 21 10 L21 14" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="16" cy="20" r="2" fill="#c084fc"/>
          <line x1="16" y1="22" x2="16" y2="24" stroke="#c084fc" strokeWidth="1.5" strokeLinecap="round"/>
        </symbol>

        {/* syft / SBOM */}
        <symbol id="ic-syft" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#001a0a"/>
          <path d="M7 4 L21 4 L27 10 L27 28 L7 28 Z" fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M20 4 L20 11 L27 11" fill="none" stroke="#34d399" strokeWidth="1.5"/>
          <line x1="11" y1="16" x2="23" y2="16" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
          <line x1="11" y1="20" x2="23" y2="20" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          <text x="17" y="27" textAnchor="middle" fontSize="5" fontFamily="monospace" fontWeight="700" fill="#34d399">SBOM</text>
        </symbol>

        {/* SLSA */}
        <symbol id="ic-slsa" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0d0000"/>
          <path d="M16 4 L27 8 L27 18 Q27 25 16 29 Q5 25 5 18 L5 8 Z" fill="none" stroke="#f87171" strokeWidth="2" strokeLinejoin="round"/>
          <text x="16" y="22" textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="700" fill="#f87171">L3</text>
        </symbol>

        {/* Dependabot */}
        <symbol id="ic-dependabot" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#000d1a"/>
          <rect x="8" y="9" width="16" height="13" rx="3" fill="none" stroke="#58a6ff" strokeWidth="1.8"/>
          <circle cx="12" cy="15" r="2"   fill="#58a6ff"/>
          <circle cx="20" cy="15" r="2"   fill="#58a6ff"/>
          <path d="M12 19.5 Q16 22 20 19.5" fill="none" stroke="#58a6ff" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="16" y1="4"  x2="16" y2="9"  stroke="#58a6ff" strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="16" cy="3.5" r="1.5" fill="#58a6ff"/>
          <line x1="16" y1="22" x2="16" y2="27" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round"/>
          <line x1="10" y1="27" x2="22" y2="27" stroke="#58a6ff" strokeWidth="1.8" strokeLinecap="round"/>
        </symbol>

        {/* ROS 2 */}
        <symbol id="ic-ros" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0d0005"/>
          <circle cx="16" cy="16" r="9"   fill="none" stroke="#e879f9" strokeWidth="1.8"/>
          <circle cx="16" cy="16" r="3.5" fill="none" stroke="#e879f9" strokeWidth="1.5"/>
          <g stroke="#e879f9" strokeWidth="1.5" transform="translate(16,16)">
            <line x1="0" y1="-3.5" x2="0" y2="-9"/>
            <line x1="0" y1="-3.5" x2="0" y2="-9" transform="rotate(60)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-9" transform="rotate(120)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-9" transform="rotate(180)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-9" transform="rotate(240)"/>
            <line x1="0" y1="-3.5" x2="0" y2="-9" transform="rotate(300)"/>
          </g>
          <g fill="#e879f9" transform="translate(16,16)">
            <circle cx="0"     cy="-9"  r="1.8"/>
            <circle cx="7.79"  cy="-4.5" r="1.8"/>
            <circle cx="7.79"  cy="4.5"  r="1.8"/>
            <circle cx="0"     cy="9"   r="1.8"/>
            <circle cx="-7.79" cy="4.5"  r="1.8"/>
            <circle cx="-7.79" cy="-4.5" r="1.8"/>
          </g>
        </symbol>

        {/* Speedometer / perf */}
        <symbol id="ic-perf" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0a0500"/>
          <path d="M5 23 A11 11 0 0 1 27 23" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round"/>
          <path d="M16 23 L21 13" stroke="#fb923c" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="16" cy="23" r="2.5" fill="#fb923c"/>
          <line x1="7"  y1="23" x2="9"  y2="23" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          <line x1="23" y1="23" x2="25" y2="23" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          <line x1="8"  y1="16" x2="10" y2="17.5" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
          <line x1="24" y1="16" x2="22" y2="17.5" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
        </symbol>

        {/* Chaos / lightning */}
        <symbol id="ic-chaos" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0d0005"/>
          <path d="M18 4 L10 18 L16 18 L14 28 L22 14 L16 14 Z" fill="#f43f5e"/>
        </symbol>

        {/* Clock / cron */}
        <symbol id="ic-clock" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#1a1000"/>
          <circle cx="16" cy="16" r="11" fill="none" stroke="#f59e0b" strokeWidth="2"/>
          <line x1="16" y1="8"  x2="16" y2="16" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
          <line x1="16" y1="16" x2="22" y2="20" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="16" cy="16" r="1.5" fill="#f59e0b"/>
        </symbol>

        {/* PR branch / webhook */}
        <symbol id="ic-branch" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#1a1000"/>
          <circle cx="10" cy="8"  r="3" fill="none" stroke="#fbbf24" strokeWidth="2"/>
          <circle cx="22" cy="8"  r="3" fill="none" stroke="#fbbf24" strokeWidth="2"/>
          <circle cx="10" cy="24" r="3" fill="none" stroke="#fbbf24" strokeWidth="2"/>
          <line x1="10" y1="11" x2="10" y2="21" stroke="#fbbf24" strokeWidth="1.5"/>
          <path d="M10 16 Q10 22 22 22 L22 11" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
        </symbol>
      </defs>

      {/* ══ ROW 1: SOURCE & TRIGGERS ══════════════════════════════════ */}
      <rect x={0} y={0} width={TRIG_W} height={R1_H} rx="7"
        fill="#080706" stroke="#374151" strokeWidth="1"/>
      <text x={TRIG_W / 2} y={14} textAnchor="middle"
        fill="#6b7280" fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="monospace">SOURCE &amp; TRIGGERS</text>

      {([
        { icon: '#ic-gh',     label: 'GitHub',       sub: 'Monorepo + PRs'  },
        { icon: '#ic-branch', label: 'PR Webhook',   sub: 'Actions Trigger' },
        { icon: '#ic-clock',  label: 'Nightly Cron', sub: 'Scheduled'       },
      ] as const).map((t, i) => {
        const tcx = (i + 0.5) * TRIG_W / 3
        return (
          <g key={t.label}>
            <use href={t.icon} x={tcx - 13} y={22} width="26" height="26"/>
            <text x={tcx} y={62} textAnchor="middle" fill="#d1d5db" fontSize="10" fontWeight="600" fontFamily="sans-serif">{t.label}</text>
            <text x={tcx} y={76} textAnchor="middle" fill="#6b7280" fontSize="8.5" fontFamily="monospace">{t.sub}</text>
          </g>
        )
      })}

      {/* ══ ROW 1: OBSERVABILITY LAYER ════════════════════════════════ */}
      <rect x={OBS_X} y={0} width={OBS_W} height={R1_H} rx="7"
        fill="#020609" stroke="#1e3a5f" strokeWidth="1"/>
      <text x={OBS_X + OBS_W / 2} y={14} textAnchor="middle"
        fill="#60a5fa" fontSize="9" fontWeight="700" letterSpacing="2.5" fontFamily="monospace">OBSERVABILITY LAYER</text>

      {([
        { icon: '#ic-prom',    label: 'Prometheus',    sub: 'Metrics + Alerts'  },
        { icon: '#ic-grafana', label: 'Grafana',       sub: 'Dashboards + SLOs' },
        { icon: '#ic-loki',    label: 'Loki',           sub: 'Log Aggregation'   },
        { icon: '#ic-otel',    label: 'OpenTelemetry', sub: 'Traces + Spans'    },
        { icon: '#ic-pd',      label: 'PagerDuty',     sub: 'On-call Routing'   },
      ] as const).map((o, i) => {
        const ocx = OBS_X + (i + 0.5) * OBS_W / 5
        return (
          <g key={o.label}>
            <use href={o.icon} x={ocx - 14} y={20} width="28" height="28"/>
            <text x={ocx} y={62} textAnchor="middle" fill="#d1d5db" fontSize="10" fontWeight="600" fontFamily="sans-serif">{o.label}</text>
            <text x={ocx} y={76} textAnchor="middle" fill="#6b7280" fontSize="8.5" fontFamily="monospace">{o.sub}</text>
          </g>
        )
      })}

      {/* Alerts dashed red: Grafana → PagerDuty (inside obs zone) */}
      {(() => {
        const x1 = OBS_X + 1.5 * OBS_W / 5
        const x2 = OBS_X + 4.5 * OBS_W / 5
        const y  = R1_H / 2
        return (
          <>
            <line x1={x1} y1={y} x2={x2} y2={y}
              stroke="#7f1d1d" strokeWidth="1" strokeDasharray="4 2" markerEnd="url(#ah-red)"/>
            <text x={(x1 + x2) / 2} y={y - 5} textAnchor="middle"
              fill="#7f1d1d" fontSize="8" fontFamily="monospace">alerts</text>
          </>
        )
      })()}

      {/* Trigger → K8s arrow */}
      <line x1={TRIG_W / 2} y1={R1_H + 1} x2={TRIG_W / 2} y2={K8S_Y - 1}
        stroke={DIM} strokeWidth="1.5" markerEnd="url(#ah)"/>
      <text x={TRIG_W / 2 + 5} y={R1_H + 8} fill="#4b5563" fontSize="8" fontFamily="monospace">trigger</text>

      {/* K8s → Obs dashed (pod telemetry) */}
      <line x1={486 + STAGE_W / 2} y1={K8S_Y - 1} x2={OBS_X + 2 * OBS_W / 5} y2={R1_H + 1}
        stroke={DDIM} strokeWidth="1" strokeDasharray="4 2" markerEnd="url(#ah-obs)"/>
      <text x={OBS_X + 2 * OBS_W / 5 - 36} y={R1_H - 5} fill="#1e3a5f" fontSize="8" fontFamily="monospace">pod telemetry</text>

      {/* ══ K8s RUNNER CLUSTER (ARC) ══════════════════════════════════ */}
      <rect x={0} y={K8S_Y} width={W} height={K8S_H} rx="7"
        fill="#020a02" stroke="#166534" strokeWidth="1.2"/>
      <use href="#ic-k8s" x={8} y={K8S_Y + 4} width="15" height="15"/>
      <text x={27} y={K8S_Y + 14} fill="#4ade80" fontSize="9" fontWeight="700"
        letterSpacing="2" fontFamily="monospace">K8s RUNNER CLUSTER (ARC) — DEV ENVIRONMENT</text>

      {/* Pipeline stage flow arrows in gap */}
      {[0, 1, 2, 3].map(i => {
        const gx = STAGE_XS[i] + STAGE_W + STAGE_GAP / 2
        const gy = K8S_INNER_Y + STAGE_H / 2
        return (
          <text key={i} x={gx} y={gy + 3} textAnchor="middle"
            fill="#374151" fontSize="9" fontFamily="monospace">›</text>
        )
      })}


      {/* 5 pipeline stages */}
      {ARCH_STAGES.map((stage, si) => {
        const sx  = STAGE_XS[si]
        const scx = sx + STAGE_W / 2
        const bodyY = ITEM_BODY_Y

        return (
          <g key={stage.label}>
            {/* Stage box */}
            <rect x={sx} y={K8S_INNER_Y} width={STAGE_W} height={STAGE_H} rx="5"
              fill={stage.fill} stroke={stage.border} strokeWidth="1"/>
            {/* Stage header */}
            <rect x={sx} y={K8S_INNER_Y} width={STAGE_W} height={ITEM_HDR_H} rx="5"
              fill={stage.border} fillOpacity="0.25"/>
            <rect x={sx} y={K8S_INNER_Y + ITEM_HDR_H - 1} width={STAGE_W} height={1}
              fill={stage.border} opacity="0.4"/>
            <text x={scx} y={K8S_INNER_Y + 12} textAnchor="middle"
              fill={stage.color} fontSize="11" fontWeight="700" fontFamily="sans-serif">{stage.label}</text>

            {/* Stage items */}
            {stage.items.map((item, ii) => {
              const itemY = bodyY + ii * ITEM_CELL_H
              return (
                <g key={item.name}>
                  <use href={item.icon} x={scx - 10} y={itemY + 6} width="20" height="20"/>
                  <text x={scx} y={itemY + 39} textAnchor="middle"
                    fill="#e5e7eb" fontSize="10" fontWeight="600" fontFamily="sans-serif">{item.name}</text>
                  <text x={scx} y={itemY + 52} textAnchor="middle"
                    fill="#6b7280" fontSize="8.5" fontFamily="monospace">{item.sub}</text>
                  {ii < 3 && (
                    <line x1={scx} y1={itemY + 60} x2={scx} y2={itemY + 71}
                      stroke={stage.border} strokeWidth="0.8" strokeDasharray="2 1"
                      markerEnd="url(#ah)" opacity="0.35"/>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* ══ CONNECTOR LABELS (gap between K8s and Row 3) ══════════════ */}
      {/* layer cache (Build stage → Build Cache) */}
      <line x1={STAGE_XS[1] + STAGE_W / 2} y1={K8S_Y + K8S_H}
            x2={CACHE_W / 2}               y2={R3_Y}
        stroke="#78350f" strokeWidth="1" strokeDasharray="3 2" markerEnd="url(#ah-amb)"/>
      <text x={(STAGE_XS[1] + STAGE_W / 2 + CACHE_W / 2) / 2 + 8}
            y={(K8S_Y + K8S_H + R3_Y) / 2}
        fill="#78350f" fontSize="8" fontFamily="monospace">layer cache</text>

      {/* sign + SBOM (Nightly/Release → Security Gate) */}
      <line x1={STAGE_XS[3] + STAGE_W / 2} y1={K8S_Y + K8S_H}
            x2={SEC_X + SEC_W / 2}          y2={R3_Y}
        stroke="#7f1d1d" strokeWidth="1" strokeDasharray="3 2" markerEnd="url(#ah-red)"/>
      <text x={(STAGE_XS[3] + STAGE_W / 2 + SEC_X + SEC_W / 2) / 2}
            y={(K8S_Y + K8S_H + R3_Y) / 2 - 2}
        fill="#7f1d1d" fontSize="8" fontFamily="monospace">sign + SBOM</text>

      {/* push + distribute (Release → ECR+CDN) */}
      <line x1={STAGE_XS[4] + STAGE_W / 2} y1={K8S_Y + K8S_H}
            x2={ECR_X + ECR_W / 2}          y2={R3_Y}
        stroke="#1e3a8a" strokeWidth="1" strokeDasharray="3 2" markerEnd="url(#ah-blu)"/>
      <text x={(STAGE_XS[4] + STAGE_W / 2 + ECR_X + ECR_W / 2) / 2}
            y={(K8S_Y + K8S_H + R3_Y) / 2 - 2}
        fill="#1e3a8a" fontSize="8" fontFamily="monospace">push + distribute</text>

      {/* ══ ROW 3: BUILD CACHE ════════════════════════════════════════ */}
      <rect x={0} y={R3_Y} width={CACHE_W} height={R3_H} rx="7"
        fill="#0d0700" stroke="#78350f" strokeWidth="1.2"/>
      <text x={CACHE_W / 2} y={R3_Y + 16} textAnchor="middle"
        fill="#f59e0b" fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="monospace">BUILD CACHE + IMAGE SCALING</text>

      {([
        { icon: '#ic-docker',   label: 'Multi-stage',  sub: 'Dockerfile'     },
        { icon: '#ic-buildkit', label: 'Buildx Cache', sub: 'Layer Dedup'    },
        { icon: '#ic-globe',    label: 'PT Mirror',    sub: 'ARM64+x86+CUDA' },
      ] as const).map((item, i) => {
        const cx = (i + 0.5) * CACHE_W / 3
        return (
          <g key={item.label}>
            <use href={item.icon} x={cx - 22} y={R3_Y + 62} width="44" height="44"/>
            <text x={cx} y={R3_Y + 120} textAnchor="middle" fill="#d1d5db" fontSize="11" fontWeight="600" fontFamily="sans-serif">{item.label}</text>
            <text x={cx} y={R3_Y + 136} textAnchor="middle" fill="#6b7280" fontSize="9" fontFamily="monospace">{item.sub}</text>
          </g>
        )
      })}

      {/* ══ ROW 3: SECURITY GATE ══════════════════════════════════════ */}
      <rect x={SEC_X} y={R3_Y} width={SEC_W} height={R3_H} rx="7"
        fill="#0d0000" stroke="#7f1d1d" strokeWidth="1.2"/>
      <text x={SEC_X + SEC_W / 2} y={R3_Y + 16} textAnchor="middle"
        fill="#f87171" fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="monospace">SECURITY GATE</text>

      {([
        { icon: '#ic-slsa',       label: 'SLSA L3',    sub: 'Attestation'  },
        { icon: '#ic-cosign',     label: 'cosign',     sub: 'Image Signing' },
        { icon: '#ic-dependabot', label: 'Dependabot', sub: 'SHA-pinned'   },
        { icon: '#ic-syft',       label: 'SBOM',       sub: 'Every Release' },
      ] as const).map((item, i) => {
        const cx = SEC_X + (i + 0.5) * SEC_W / 4
        return (
          <g key={item.label}>
            <use href={item.icon} x={cx - 22} y={R3_Y + 62} width="44" height="44"/>
            <text x={cx} y={R3_Y + 120} textAnchor="middle" fill="#d1d5db" fontSize="11" fontWeight="600" fontFamily="sans-serif">{item.label}</text>
            <text x={cx} y={R3_Y + 136} textAnchor="middle" fill="#6b7280" fontSize="9" fontFamily="monospace">{item.sub}</text>
          </g>
        )
      })}

      {/* ══ ROW 3: ECR + CDN DISTRIBUTION ════════════════════════════ */}
      <rect x={ECR_X} y={R3_Y} width={ECR_W} height={R3_H} rx="7"
        fill="#00040d" stroke="#1e3a8a" strokeWidth="1.2"/>
      <text x={ECR_X + ECR_W / 2} y={R3_Y + 14} textAnchor="middle"
        fill="#60a5fa" fontSize="6.5" fontWeight="700" letterSpacing="2" fontFamily="monospace">ECR + CDN DISTRIBUTION</text>

      {([
        { icon: '#ic-ngc',    label: 'ECR PT Cache', sub: 'us-east-1 · eu-west-1' },
        { icon: '#ic-globe',  label: 'CloudFront',   sub: 'Global CDN'             },
        { icon: '#ic-docker', label: 'Multi-arch',   sub: 'Manifests'              },
      ] as const).map((item, i) => {
        const cx = ECR_X + (i + 0.5) * ECR_W / 3
        return (
          <g key={item.label}>
            <use href={item.icon} x={cx - 22} y={R3_Y + 62} width="44" height="44"/>
            <text x={cx} y={R3_Y + 120} textAnchor="middle" fill="#d1d5db" fontSize="11" fontWeight="600" fontFamily="sans-serif">{item.label}</text>
            <text x={cx} y={R3_Y + 136} textAnchor="middle" fill="#6b7280" fontSize="9" fontFamily="monospace">{item.sub}</text>
          </g>
        )
      })}

    </svg>
  )
}

// ── Generic repo home (shown when active repo is not IsaacLab) ───────────────

function buildInsights(data: any, repoSlug: string) {
  const findings: { severity: 'CRIT' | 'WARN'; stat: string; statColor: string; title: string; sub: string }[] = []
  const prs     = data?.prs
  const builds  = data?.builds
  const nightly = data?.nightly
  const runners = data?.runners
  const repo    = data?.repo

  const failRate = builds?.success_rate_last10 != null ? Math.round(100 - builds.success_rate_last10) : null
  if (failRate != null && failRate >= 30) {
    findings.push({
      severity: 'CRIT', stat: `${failRate}%`, statColor: '#ef4444',
      title: 'CI Build Failure Rate',
      sub: `${failRate}% of the last 10 workflow runs failed. Investigate flaky tests, dependency changes, or infrastructure instability on self-hosted runners.`,
    })
  } else if (failRate != null && failRate >= 10) {
    findings.push({
      severity: 'WARN', stat: `${failRate}%`, statColor: '#f59e0b',
      title: 'CI Build Failure Rate',
      sub: `${failRate}% failure rate over the last 10 runs. Monitor for regressions — consider adding required status checks to block merges on failure.`,
    })
  }

  if (nightly?.consecutive_failures >= 3) {
    findings.push({
      severity: 'CRIT', stat: `${nightly.consecutive_failures}x`, statColor: '#ef4444',
      title: 'Consecutive Nightly Failures',
      sub: `The nightly build has failed ${nightly.consecutive_failures} times in a row. Nightly instability indicates unreleased breakage or environment drift not caught by pre-merge CI.`,
    })
  } else if (nightly?.consecutive_failures >= 1) {
    findings.push({
      severity: 'WARN', stat: `${nightly.consecutive_failures}x`, statColor: '#f59e0b',
      title: 'Nightly Build Failing',
      sub: `Nightly last ran as: ${nightly.last_status}. Recurring failures here suggest flaky scheduled jobs or untracked dependency updates.`,
    })
  }

  if (prs?.review_requested > 5) {
    findings.push({
      severity: 'CRIT', stat: `${prs.review_requested}`, statColor: '#ef4444',
      title: 'PRs Blocked on Review',
      sub: `${prs.review_requested} open pull requests have review explicitly requested but no approval. Review queue depth slows down the development cycle.`,
    })
  } else if (prs?.review_requested > 0) {
    findings.push({
      severity: 'WARN', stat: `${prs.review_requested}`, statColor: '#f59e0b',
      title: 'PRs Pending Review',
      sub: `${prs.review_requested} PRs are waiting for reviewer attention. Consider assigning reviewers or using CODEOWNERS to auto-assign on open.`,
    })
  }

  if (runners && !runners.access_denied && runners.total > 0) {
    const offline = runners.total - runners.online
    if (offline > 0) {
      findings.push({
        severity: offline > runners.total / 2 ? 'CRIT' : 'WARN',
        stat: `${offline}/${runners.total}`, statColor: offline > runners.total / 2 ? '#ef4444' : '#f59e0b',
        title: 'Self-Hosted Runners Offline',
        sub: `${offline} of ${runners.total} registered runners are offline. Jobs may queue or fall back to GitHub-hosted runners with different environments.`,
      })
    }
  }

  if (builds?.in_progress > 3) {
    findings.push({
      severity: 'WARN', stat: `${builds.in_progress}`, statColor: '#f59e0b',
      title: 'High Concurrent Build Load',
      sub: `${builds.in_progress} workflow runs are currently in progress. Runner contention may cause queuing and longer wait times.`,
    })
  }

  if (repo?.open_issues > 200) {
    findings.push({
      severity: 'WARN', stat: `${repo.open_issues}`, statColor: '#f59e0b',
      title: 'Issue Backlog Growth',
      sub: `${repo.open_issues} open issues — a large backlog may indicate triage is not keeping pace with incoming reports. Consider using automation or stale-issue management.`,
    })
  }

  if (findings.length === 0) {
    findings.push({
      severity: 'WARN', stat: 'ok', statColor: '#76b900',
      title: 'No Active Alerts',
      sub: `All tracked health signals for ${repoSlug} are within normal thresholds. Continue monitoring build rate, PR queue depth, and nightly run stability.`,
    })
  }

  return {
    findings,
    crits: findings.filter(f => f.severity === 'CRIT').length,
    warns: findings.filter(f => f.severity === 'WARN').length,
  }
}

function GenericRepoHome({ repoSlug }: { repoSlug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: getOverviewSummary,
    staleTime: 60_000,
  })

  const prs    = data?.prs
  const builds = data?.builds
  const repo   = data?.repo

  const { findings, crits, warns } = data
    ? buildInsights(data, repoSlug)
    : { findings: [], crits: 0, warns: 0 }

  const buildSuccessColor =
    (builds?.success_rate_last10 ?? 100) >= 80 ? '#76b900' :
    (builds?.success_rate_last10 ?? 100) >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex gap-4 items-start">

      {/* LEFT: Repo Insights + breakdown cards */}
      <div className="w-[460px] flex-shrink-0 flex flex-col gap-3">
        <div className="rounded-xl border border-border bg-surface-1">

          {/* Panel header */}
          <div className="px-4 py-2.5 border-b border-border bg-surface-2 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
              <span className="text-[11px] font-semibold text-white tracking-[0.18em] uppercase">Repo Insights</span>
            </div>
            <div className="flex items-center gap-1.5">
              {crits > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20">
                  {crits} CRIT
                </span>
              )}
              {warns > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
                  {warns} WARN
                </span>
              )}
            </div>
          </div>

          {/* Scan target meta */}
          <div className="px-4 py-1.5 border-b border-border/40 bg-surface-2/30 flex items-center gap-2 flex-shrink-0">
            <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Target</span>
            <span className="text-[9px] font-mono text-neutral-500">{repoSlug}</span>
            <span className="ml-auto text-[9px] font-mono text-neutral-600">ci/cd · builds · prs · runners</span>
          </div>

          {/* Findings list */}
          {isLoading ? (
            <div className="px-4 py-8 flex items-center justify-center">
              <span className="w-4 h-4 rounded-full border-2 border-border border-t-nvidia animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {findings.map((f) => (
                <div key={f.title} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider flex-shrink-0',
                      f.severity === 'CRIT'
                        ? 'bg-[#ef4444]/10 text-[#ef4444]'
                        : 'bg-[#f59e0b]/10 text-[#f59e0b]',
                    )}>{f.severity}</span>
                    <span className="text-[13px] font-semibold text-white leading-tight flex-1 min-w-0">{f.title}</span>
                    <span className="text-[12px] font-bold tabular-nums font-mono flex-shrink-0"
                      style={{ color: f.statColor }}>{f.stat}</span>
                  </div>
                  <p className="text-[11px] leading-[1.55] text-neutral-500">{f.sub}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Issue + PR breakdown cards */}
        <IssueBreakdownCard repoSlug={repoSlug} />
        <PRBreakdownCard repoSlug={repoSlug} />
      </div>

      {/* RIGHT: Stats bar + Cross-Workflow Performance */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        {/* Stats bar */}
        <div className="flex-shrink-0 rounded-lg border border-border bg-surface-1 flex items-stretch divide-x divide-border">

          {/* Repo stats */}
          <div className="flex items-center gap-5 pl-4 pr-5 py-3 flex-shrink-0">
            <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.18em] text-neutral-600 whitespace-nowrap">REPO</span>
            {[
              { label: 'stars',  value: repo?.stars  != null ? String(repo.stars)  : '—' },
              { label: 'forks',  value: repo?.forks  != null ? String(repo.forks)  : '—' },
              { label: 'issues', value: repo?.open_issues != null ? String(repo.open_issues) : '—' },
            ].map(m => (
              <div key={m.label} className="flex items-end gap-1">
                <span className="text-[18px] font-black font-mono leading-none tabular-nums text-neutral-200">{m.value}</span>
                <span className="text-[9px] text-neutral-600 leading-tight pb-[2px]">{m.label}</span>
              </div>
            ))}
          </div>

          {/* CI health */}
          <div className="flex-1 flex items-center gap-5 pl-5 pr-4 py-3 min-w-0">
            <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.18em] text-neutral-600 whitespace-nowrap">CI</span>
            {[
              {
                label: 'build rate',
                from: '100%',
                to: builds?.success_rate_last10 != null ? `${builds.success_rate_last10}%` : '—',
                color: buildSuccessColor,
              },
              {
                label: 'open prs',
                from: '0',
                to: prs?.open != null ? String(prs.open) : '—',
                color: '#e5e5e5',
              },
              {
                label: 'need review',
                from: '0',
                to: prs?.review_requested != null ? String(prs.review_requested) : '—',
                color: (prs?.review_requested ?? 0) > 0 ? '#f59e0b' : '#76b900',
              },
            ].map(m => (
              <div key={m.label} className="flex flex-col gap-0.5 min-w-0 flex-shrink-0">
                <span className="text-[9px] text-neutral-600 font-mono leading-none truncate">{m.label}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[13px] font-bold font-mono leading-none whitespace-nowrap" style={{ color: m.color }}>{m.to}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Live badge */}
          <div className="flex-shrink-0 flex items-center px-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-nvidia animate-pulse" />
              <span className="text-[9px] font-mono font-semibold text-nvidia tracking-widest">LIVE</span>
            </div>
          </div>
        </div>

        {/* Cross-Workflow Performance */}
        <CrossWorkflowPerf />

        {/* Recent builds */}
        {builds?.recent?.length > 0 && (
          <div className="rounded-xl border border-border bg-surface-1">
            <div className="px-4 py-2.5 border-b border-border bg-surface-2/60 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
              <span className="text-[11px] font-semibold text-neutral-300">Recent Runs</span>
            </div>
            <div className="divide-y divide-border/40">
              {(builds.recent as any[]).slice(0, 6).map((b: any) => (
                <div key={b.id} className="px-4 py-2 flex items-center gap-3">
                  <StatusBadge status={b.status} />
                  <span className="text-[11px] text-neutral-300 flex-1 truncate">{b.title || b.branch}</span>
                  <span className="text-[10px] text-neutral-500 font-mono flex-shrink-0">
                    {b.created_at && formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                  </span>
                  {b.url && (
                    <a href={b.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={10} className="text-neutral-500 hover:text-neutral-200" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Cross-workflow performance ────────────────────────────────────────────────

const WINDOW_DAYS: Record<string, number> = { '1d': 1, '3d': 3, '7d': 7, '14d': 14, '130d': 130 }

type TableTab = 'duration' | 'failures' | 'runs'
const TABLE_TABS: { key: TableTab; label: string }[] = [
  { key: 'failures', label: 'Job Failures' },
  { key: 'duration', label: 'Duration' },
  { key: 'runs',     label: 'Runs' },
]

// ── Categorise labels into display buckets ────────────────────────────────
function categoriseLabels(labels: { name: string; count: number; color?: string }[], mode: 'issues' | 'prs') {
  const buckets = mode === 'issues'
    ? [
        { key: 'bugs',     label: 'Product Bugs',      color: '#f97316', terms: ['bug', 'defect', 'crash', 'regression', 'broken'] },
        { key: 'infra',    label: 'Infrastructure',    color: '#eab308', terms: ['infra', 'ci', 'cd', 'docker', 'build', 'deploy', 'runner', 'pipeline'] },
        { key: 'features', label: 'Feature Requests',  color: '#a855f7', terms: ['feature', 'enhancement', 'request', 'proposal', 'rfe'] },
      ]
    : [
        { key: 'docs',     label: 'Documentation',     color: '#3b82f6', terms: ['doc', 'docs', 'readme', 'changelog', 'wiki'] },
        { key: 'infra',    label: 'Infrastructure',    color: '#eab308', terms: ['infra', 'ci', 'cd', 'docker', 'build', 'deploy', 'runner', 'pipeline'] },
        { key: 'bugs',     label: 'Bug Fixes',         color: '#f97316', terms: ['bug', 'fix', 'defect', 'crash', 'regression'] },
        { key: 'features', label: 'Features',          color: '#a855f7', terms: ['feature', 'enhancement', 'proposal'] },
        { key: 'refactor', label: 'Refactor / Deps',   color: '#6b7280', terms: ['refactor', 'deps', 'dependency', 'chore', 'maintenance', 'upgrade', 'cleanup'] },
      ]

  const totals: Record<string, number> = {}
  for (const b of buckets) totals[b.key] = 0
  let other = 0

  for (const lbl of labels) {
    const lower = lbl.name.toLowerCase()
    const bucket = buckets.find(b => b.terms.some(t => lower.includes(t)))
    if (bucket) totals[bucket.key] += lbl.count
    else other += lbl.count
  }

  const rows = buckets
    .map(b => ({ label: b.label, count: totals[b.key], color: b.color }))
    .filter(r => r.count > 0)

  if (mode === 'issues' && other > 0) rows.push({ label: 'Other', count: other, color: '#52525b' })
  if (mode === 'prs' && other > 0) {
    const refactorRow = rows.find(r => r.label === 'Refactor / Deps')
    if (refactorRow) refactorRow.count += other
    else rows.push({ label: 'Other', count: other, color: '#52525b' })
  }

  return rows
}

function BreakdownCard({
  title, subtitle, githubUrl, rows, total,
}: {
  title: string; subtitle: string; githubUrl: string
  rows: { label: string; count: number; color: string }[]; total: number
}) {
  const max = Math.max(...rows.map(r => r.count), 1)
  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <div className="px-4 py-3 border-b border-border/40 flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold text-white">{title}</p>
          <p className="text-[10px] font-mono text-neutral-500 mt-0.5">{subtitle}</p>
        </div>
        <a href={githubUrl} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-[10px] text-nvidia hover:underline font-mono mt-0.5 flex-shrink-0">
          GitHub <ExternalLink size={9} />
        </a>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {rows.map(row => (
          <div key={row.label} className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
            <span className="text-[11px] text-neutral-400 w-[120px] flex-shrink-0 truncate">{row.label}</span>
            <div className="flex-1 h-[5px] bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(row.count / max) * 100}%`, background: row.color }} />
            </div>
            <span className="text-[11px] font-mono text-neutral-300 w-6 text-right flex-shrink-0">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function IssueBreakdownCard({ repoSlug }: { repoSlug: string }) {
  const { data } = useQuery({ queryKey: ['issue-stats'], queryFn: getIssueStats, staleTime: 120_000 })
  if (!data) return null
  const rows = categoriseLabels(data.top_labels ?? [], 'issues')
  const githubUrl = `https://github.com/${repoSlug}/issues`
  const date = new Date().toISOString().slice(0, 10)
  return (
    <BreakdownCard
      title={`${data.open_count} Open Issues`}
      subtitle={`${repoSlug} · ${date}`}
      githubUrl={githubUrl}
      rows={rows}
      total={data.open_count}
    />
  )
}

function PRBreakdownCard({ repoSlug }: { repoSlug: string }) {
  const { data: prsData } = useQuery({
    queryKey: ['prs-open'],
    queryFn: () => getPRs('open', 1),
    staleTime: 120_000,
  })
  const prs: any[] = Array.isArray(prsData) ? prsData : []
  if (!prs.length) return null

  // Aggregate labels across all open PRs
  const labelMap: Record<string, number> = {}
  for (const pr of prs) {
    for (const lbl of (pr.labels ?? [])) {
      labelMap[lbl.name] = (labelMap[lbl.name] ?? 0) + 1
    }
  }
  const labels = Object.entries(labelMap).map(([name, count]) => ({ name, count }))
  const rows = categoriseLabels(labels, 'prs')
  // If no labels found, show by draft/ready
  const displayRows = rows.length > 0 ? rows : [
    { label: 'Ready', count: prs.filter(p => !p.draft).length, color: '#76b900' },
    { label: 'Draft', count: prs.filter(p => p.draft).length, color: '#52525b' },
  ]
  const githubUrl = `https://github.com/${repoSlug}/pulls`
  return (
    <BreakdownCard
      title={`${prs.length} Open PRs`}
      subtitle="Active development breakdown"
      githubUrl={githubUrl}
      rows={displayRows}
      total={prs.length}
    />
  )
}

function CrossWorkflowPerf() {
  const [timeWindow, setTimeWindow] = useState('14d')
  const [tab, setTab] = useState<TableTab>('duration')
  const days = WINDOW_DAYS[timeWindow] ?? 14

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-performance', days],
    queryFn: () => getBuildPerformance(days),
    staleTime: 120_000,
  })

  // Normalise API response → internal shape
  const workflows = ((data?.workflows ?? []) as any[]).map(w => ({
    name:      w.workflow as string,
    chartName: w.workflow.length > 20 ? w.workflow.slice(0, 19) + '…' : w.workflow,
    runs:      (w.total ?? 0) as number,
    failRate:  w.success_rate != null ? Math.round(100 - w.success_rate) : 0,
    avgMin:    w.avg_seconds != null ? +(w.avg_seconds / 60).toFixed(2) : 0,
    p50Min:    w.p50_seconds != null ? +(w.p50_seconds / 60).toFixed(2) : 0,
    p90Min:    w.p90_seconds != null ? +(w.p90_seconds / 60).toFixed(2) : 0,
    avgLabel:  (w.avg_label ?? '—') as string,
    p50Label:  (w.p50_label ?? '—') as string,
    p90Label:  (w.p90_label ?? '—') as string,
    success:   (w.success_rate ?? 0) as number,
  }))

  // Stat card derivations
  const bestSuccessWf  = workflows.reduce((b, w) => w.success  > b.success  ? w : b, { success: -1,       name: '—', avgLabel: '—' } as any)
  const fastestWf      = workflows.filter(w => w.avgMin > 0)
                                  .reduce((b, w) => w.avgMin   < b.avgMin   ? w : b, { avgMin: Infinity,   name: '—', avgLabel: '—' } as any)
  const mostActiveWf   = workflows.reduce((b, w) => w.runs     > b.runs     ? w : b, { runs: -1,           name: '—' } as any)

  const chartData = workflows.map(w => ({
    name: w.chartName,
    Avg: w.avgMin,
    'p50 (median)': w.p50Min,
    p90: w.p90Min,
  }))

  const tableRows = tab === 'failures' ? [...workflows].sort((a, b) => b.failRate - a.failRate)
                  : tab === 'runs'     ? [...workflows].sort((a, b) => b.runs     - a.runs)
                  : workflows

  const successColor = (s: number) => s >= 95 ? 'text-nvidia' : s < 60 ? 'text-accent-red' : 'text-neutral-400'
  const failColor    = (r: number) => r === 0  ? 'text-nvidia' : r >= 30 ? 'text-accent-red' : 'text-neutral-400'

  const chartH = Math.max(180, workflows.length * 36)

  return (
    <div className="flex flex-col gap-3">

      {/* Header + time window selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-neutral-500" />
          <span className="text-[13px] font-semibold text-neutral-200">Cross-Workflow Performance</span>
        </div>
        <div className="flex items-center gap-0.5 bg-surface-2 border border-border p-0.5">
          {Object.keys(WINDOW_DAYS).map(w => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={cn(
                'px-2 py-0.5 text-[10px] font-mono transition-colors',
                timeWindow === w ? 'bg-surface-3 text-white font-semibold' : 'text-neutral-500 hover:text-neutral-300',
              )}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: 'Best Success Rate',
            value: bestSuccessWf.success >= 0 ? `${bestSuccessWf.success}%` : '—',
            sub:   bestSuccessWf.name,
            icon: TrendingUp,
            vc: bestSuccessWf.success >= 95 ? 'text-nvidia' : 'text-neutral-100',
          },
          {
            label: 'Fastest Avg Duration',
            value: fastestWf.avgMin < Infinity ? fastestWf.avgLabel : '—',
            sub:   fastestWf.name,
            icon: Clock,
            vc: 'text-neutral-100',
          },
          {
            label: 'Most Active',
            value: mostActiveWf.runs > 0 ? String(mostActiveWf.runs) : '—',
            sub:   mostActiveWf.runs > 0 ? `${mostActiveWf.name} · ${timeWindow}` : '—',
            icon: Activity,
            vc: 'text-neutral-100',
          },
          {
            label: 'Workflows Analysed',
            value: isLoading ? '…' : String(workflows.length),
            sub:   `${timeWindow} window`,
            icon: BarChart2,
            vc: 'text-neutral-100',
          },
        ].map(({ label, value, sub, icon: Icon, vc }) => (
          <div key={label} className="border border-border bg-surface-1 p-3">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] text-neutral-500">{label}</span>
              <Icon size={12} className="text-neutral-600 flex-shrink-0" />
            </div>
            <div className={cn('text-[22px] font-bold font-mono leading-none', vc)}>{value}</div>
            <div className="text-[10px] text-neutral-500 mt-1.5 truncate">{sub}</div>
          </div>
        ))}
      </div>

      {/* Horizontal bar chart */}
      <div className="border border-border bg-surface-1 p-4">
        <p className="text-[10px] text-neutral-500 mb-4">
          Avg Run Duration by Workflow (minutes) — {timeWindow} window
        </p>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center text-[11px] text-neutral-600 font-mono">
            Loading…
          </div>
        ) : workflows.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-[11px] text-neutral-600 font-mono">
            No data for this window
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 134, bottom: 0 }}
              barCategoryGap="34%"
              barGap={1}
            >
              <CartesianGrid horizontal={false} stroke="rgba(63,63,70,0.5)" strokeDasharray="4 3" />
              <XAxis
                type="number"
                tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(v) => `${v}m`}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={132}
                tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  // Look up formatted labels from workflows
                  const wf = workflows.find(w => w.chartName === label)
                  return (
                    <div style={{ background: '#18181b', border: '1px solid #3f3f46', padding: '8px 12px', fontSize: 11, fontFamily: 'JetBrains Mono', borderRadius: 3 }}>
                      <p style={{ color: '#e4e4e7', marginBottom: 4 }}>{wf?.name ?? label}</p>
                      {payload.map((p: any) => {
                        const fmtLabel = p.dataKey === 'Avg' ? wf?.avgLabel
                                       : p.dataKey === 'p50 (median)' ? wf?.p50Label
                                       : wf?.p90Label
                        return (
                          <p key={p.name} style={{ color: p.fill, lineHeight: 1.7 }}>
                            {p.name}: {fmtLabel ?? `${Number(p.value).toFixed(1)}m`}
                          </p>
                        )
                      })}
                    </div>
                  )
                }}
              />
              <Legend
                iconType="square"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: '#71717a', fontSize: 10, fontFamily: 'JetBrains Mono' }}>{value}</span>
                )}
              />
              <Bar dataKey="Avg"          fill="#76b900" barSize={5} />
              <Bar dataKey="p50 (median)" fill="#52525b" barSize={5} />
              <Bar dataKey="p90"          fill="#737373" barSize={5} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-workflow details table */}
      <div className="border border-border bg-surface-1">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-[11px] font-semibold text-neutral-300">Per-Workflow Details</span>
          <div className="flex items-center gap-1">
            {TABLE_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'px-2.5 py-1 text-[11px] transition-colors',
                  tab === key ? 'bg-surface-3 text-white font-semibold' : 'text-neutral-500 hover:text-neutral-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Workflow</th>
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Runs</th>
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Failures %</th>
              {tab === 'duration' && (
                <>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Avg</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>p50</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>p90</th>
                </>
              )}
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Success</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={tab === 'duration' ? 7 : 4} className="text-center py-6 text-[11px] text-neutral-600 font-mono">Loading…</td></tr>
            ) : tableRows.length === 0 ? (
              <tr><td colSpan={tab === 'duration' ? 7 : 4} className="text-center py-6 text-[11px] text-neutral-600 font-mono">No data for this window</td></tr>
            ) : tableRows.map((w) => (
              <tr key={w.name}>
                <td className="font-semibold text-neutral-200">{w.name}</td>
                <td className="text-right font-mono whitespace-nowrap">{w.runs}</td>
                <td className="text-right font-mono whitespace-nowrap">
                  <span className={failColor(w.failRate)}>{w.failRate}%</span>
                </td>
                {tab === 'duration' && (
                  <>
                    <td className="text-right font-mono whitespace-nowrap text-neutral-300">{w.avgLabel}</td>
                    <td className="text-right font-mono whitespace-nowrap text-neutral-400">{w.p50Label}</td>
                    <td className="text-right font-mono whitespace-nowrap text-neutral-500">{w.p90Label}</td>
                  </>
                )}
                <td className="text-right font-mono whitespace-nowrap">
                  <span className={cn('font-semibold', successColor(w.success))}>
                    {w.success > 0 ? `${w.success}%` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}

// ── CI/CD Analysis data ──────────────────────────────────────────────────────

const CI_KPIS = [
  { value: '16%',  label: 'Postmerge CI Pass Rate', note: '84% failing — image build step accounts for 96% of failures', color: '#c9210e', borderColor: '#f5bbb6' },
  { value: '0%',   label: 'Nightly Pass Rate',       note: 'Nightly compatibility check at 0% for 14+ consecutive days',   color: '#c9210e', borderColor: '#f5bbb6' },
  { value: '70%',  label: 'CI Checks Skipped',       note: '70% of checks skipped per PR but GPU runners still spin up and bill', color: '#b35b00', borderColor: '#f5d9aa' },
  { value: '49',   label: 'Open Install Issues',     note: '33% of all 150 open issues are Docker / pip / installation failures', color: '#b35b00', borderColor: '#f5d9aa' },
]

const CI_FAILURES = [
  {
    num: 1, color: '#c9210e', borderColor: '#f5bbb6', severity: 'CRITICAL',
    title: 'ECR Push Failures — Nightly Dead',
    bullets: [
      'OIDC token TTL exceeded during long GPU builds → credential expires mid-push to ECR',
      'isaacsim-core pins packaging==23.0, conflicts with pip internals',
      'No retry logic — single network blip kills the entire nightly job, no fallback',
      'Open fix PRs are pending merge but root ECR credential fix is not yet landed',
    ],
  },
  {
    num: 2, color: '#c9210e', borderColor: '#f5bbb6', severity: 'CRITICAL',
    title: 'Blackwell GPU — Zero Support',
    bullets: [
      'RTX 5090 / 5070 Ti crashes — sm_120 (Blackwell) absent from CUDA arch list',
      'TiledCamera CUDA kernel hangs on Blackwell silicon (GB202/GB203)',
      'Driver 595.79 exposes new GPU init path that crashes headless GUI',
      'No Blackwell runner in CI matrix — regressions ship to users, not caught in CI',
    ],
  },
  {
    num: 3, color: '#b35b00', borderColor: '#f5d9aa', severity: 'HIGH',
    title: 'Dependency Hell — 49 Open Issues',
    bullets: [
      'No single source of truth for dep versions — each package pins independently',
      'Install script fails silently with exit code 0 on conflicts',
      'CloudXR extension not published in Isaac Sim 6.0 pip index',
      'Multiple fix PRs still in DRAFT after weeks — not landed',
    ],
  },
  {
    num: 4, color: '#b35b00', borderColor: '#f5d9aa', severity: 'HIGH',
    title: 'Wasteful PR Matrix — 60% Redundant GPU',
    bullets: [
      '32% of open PRs are docs-only — all trigger A100-80GB GPU runners unnecessarily',
      'Full 10-cell matrix (3 Isaac Sim versions × 4 extensions) runs on every PR',
      'No path-filter gate — ci-only changes spin GPU builds with zero value',
      'Isaac Sim 6.0 compat gaps mean old-version runs mask real failures',
    ],
  },
]

const CI_WORKFLOWS = [
  {
    name: 'Post-Merge CI',
    statLabel: 'Pass rate', pct: 16, pctLabel: '16%', color: '#c9210e',
    rows: [
      { dot: '#c9210e', strong: 'Image push step', rest: ' — OIDC token expires during multi-hour GPU build; 96% of all failures trace here' },
      { dot: '#c9210e', strong: 'Packaging version conflict', rest: ' — isaacsim-core pin breaks pip vendored module inside Docker container' },
      { dot: '#c9210e', strong: 'Silent source failures', rest: ' — install script exits 0 on conflict; CI marks green, job fails later' },
      { dot: '#b35b00', strong: 'Full 10-cell matrix', rest: ' — all 3 Isaac Sim × 4 extensions on every push; no post-merge vs PR split' },
    ],
  },
  {
    name: 'Nightly Compatibility',
    statLabel: 'Pass rate', pct: 0, pctLabel: '0% (14d)', color: '#c9210e',
    rows: [
      { dot: '#c9210e', strong: 'ECR credential expiry', rest: ' — OIDC token issued at job start, expires before multi-hour GPU build finishes' },
      { dot: '#c9210e', strong: 'Matrix resolver bug', rest: ' — unknown version input silently falls back to ALL versions; re-run → 12-job full matrix' },
      { dot: '#c9210e', strong: 'Output variable risk', rest: ' — output env var unset silently discards all 11 outputs; "tag not found" downstream' },
      { dot: '#b35b00', strong: 'Deprecated workflow trigger', rest: ' — scheduled-workflow syntax deprecated, breaking nightly trigger' },
    ],
  },
  {
    name: 'PR Build Pipeline',
    statLabel: 'Skipped checks', pct: 70, pctLabel: '70%', color: '#b35b00',
    rows: [
      { dot: '#b35b00', strong: 'No PR classification', rest: ' — 32% of PRs are docs-only; still trigger A100-80GB runner; 23 of 33 checks skip immediately' },
      { dot: '#b35b00', strong: 'Full matrix on every PR', rest: ' — 3 Isaac Sim versions × 4 extensions; 60% of GPU work is redundant per PR' },
      { dot: '#b35b00', strong: 'Isaac Sim 6.0 gaps', rest: ' — compat breakages; old-version cells mask which version is actually broken' },
      { dot: '#1d59c4', strong: 'No Blackwell runner', rest: ' — sm_120 absent from CUDA arch; RTX 5090 regressions never caught in CI' },
    ],
  },
]

const CI_ISSUE_REFS = [
  { id: 'DEP CONFLICT',  color: '#c9210e', borderColor: '#f5bbb6', title: 'packaging==23.0 pin conflict',    note: 'isaacsim-core conflicts with pip vendored module; breaks Docker pip install' },
  { id: 'GPU ARCH',      color: '#c9210e', borderColor: '#f5bbb6', title: 'NVRTC arch error — Blackwell',    note: 'sm_120 (RTX 5090) missing from CUDA arch list; NVRTC fails' },
  { id: 'SILENT EXIT',   color: '#c9210e', borderColor: '#f5bbb6', title: 'Silent install failure',          note: 'Install script exits 0 on dependency conflict; no error surfaced' },
  { id: 'DOCKER PIP',    color: '#c9210e', borderColor: '#f5bbb6', title: 'Broken pip in Docker',            note: 'Missing vendored packaging module inside IsaacLab Docker image' },
  { id: 'BUILD SILENT',  color: '#b35b00', borderColor: '#f5d9aa', title: 'Silent build from source',        note: 'Build step exits 0 despite source compile failure; CI marked green' },
  { id: 'IS6 COMPAT',    color: '#b35b00', borderColor: '#f5d9aa', title: 'Isaac Sim 6.0 compat gaps',       note: 'API breakages with IS 6.0 not caught by current PR CI matrix' },
  { id: 'MISSING PKG',   color: '#b35b00', borderColor: '#f5d9aa', title: 'CloudXR missing in IS 6.0',       note: 'isaacsim.kit.xr.teleop.bridge not published in IS 6.0 pip index' },
  { id: 'RAM LIMIT',     color: '#1d59c4', borderColor: '#b0c8f5', title: 'Docker RAM overconsumption',      note: 'Isaac Sim overconsumes RAM; no --memory limits set in docker run flags' },
]

const CI_PHASES = [
  {
    num: 1, color: '#c9210e', borderColor: '#f5bbb6',
    badge: 'Targets issues #1 + #3 — restores nightly to 100%',
    title: 'Fix ECR + Dependency Failures',
    timeframe: 'Weeks 1–3',
    items: [
      'Rotate ECR OIDC credentials — fix IAM trust policy; add retry (3×, 60s backoff) to ECR push step',
      'Centralize all external pins in a shared deps file; resolves packaging version conflict',
      'Fix install script exit codes — add post-install smoke test; propagate real exit code',
      'Fix matrix resolver fallback — unknown input → hard failure, not silent all-matrix fallback',
      'Guard output variable in nightly script — fail fast in CI if unset; prevents silent discards',
      'Fix deprecated nightly trigger — scheduled-workflow syntax fix restoring daily-compatibility',
    ],
  },
  {
    num: 2, color: '#b35b00', borderColor: '#f5d9aa',
    badge: 'Targets issue #4 — −60% GPU runner cost',
    title: 'Smart PR Gating — Eliminate GPU Waste',
    timeframe: 'Weeks 4–7',
    items: [
      'Add path-filter action — classify PR as docs / tests / source / ci-config before any GPU runner is assigned',
      'Gate GPU matrix in PR build workflow — docs PRs → ubuntu-latest only, no GPU runner',
      'Reduce PR matrix to 4 cells — latest Isaac Sim × 4 extensions; full 10-cell only on merge and nightly',
      'BuildKit cache mounts — type=cache for pip; reorder Dockerfile: requirements first, source after',
      'Base image deduplication — build base once per Isaac Sim version; fan-out to extensions from cache',
      'Add install test suite — conda/uv installation tests in CI; catch regressions before reaching users',
    ],
  },
  {
    num: 3, color: '#1d59c4', borderColor: '#b0c8f5',
    badge: 'Targets issue #2 — unblocks RTX 5090 / 5070 Ti users',
    title: 'Blackwell GPU Support + Elite Observability',
    timeframe: 'Weeks 8–12',
    items: [
      'Add sm_90a + sm_120 to CUDA arch list — fix NVRTC arch error; update CMakeLists / setup.py for Blackwell',
      'Recompile TiledCamera kernel — add sm_120 target for Blackwell silicon; resolves hang on RTX 5090',
      'Add Blackwell runner to nightly matrix — RTX 5090 (GB202) cell in daily compatibility check from Week 8',
      'Resolve Isaac Sim 6.0 compat gaps — fix API breakages; make IS 6.0 the primary version in PR CI',
      'ECR push health check — hourly credential verification workflow; alert on first failure before nightly runs',
      'DORA metrics baseline — track deployment freq, lead time, MTTR, CFR; target Elite band by end of Q3',
    ],
  },
]

const CI_OUTCOMES = [
  { value: '+80%', label: 'Postmerge Pass Rate', note: 'ECR fix + retry logic → 16% → ~96%; Phase 1 alone achieves this', color: '#5a9e00' },
  { value: '100%', label: 'Nightly Restored',    note: '0% → daily green; credential fix + deprecation patch in Phase 1',  color: '#5a9e00' },
  { value: '−60%', label: 'GPU Runner Cost',     note: 'Smart gating + matrix reduction; ~40 GPU-hours/week saved',         color: '#5a9e00' },
  { value: '49→0', label: 'Install Issues',       note: 'Centralized pins + smoke tests close all open install issues',      color: '#5a9e00' },
]

function SlideHeader({ eyebrow, title, accent, sub, tag, tagColor = '#a6d43a' }: {
  eyebrow: string; title: string; accent: string; sub: string; tag: string; tagColor?: string
}) {
  return (
    <div className="bg-[#0d0d0f] px-5 py-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[9px] font-semibold tracking-[0.14em] uppercase text-neutral-600 mb-1">{eyebrow}</div>
        <div className="text-[20px] font-black text-white leading-tight">
          {title} <span style={{ color: tagColor }}>{accent}</span>
        </div>
        <div className="text-[9px] text-neutral-500 mt-1 max-w-2xl leading-relaxed">{sub}</div>
      </div>
      <div className="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1.5 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tagColor, boxShadow: `0 0 5px ${tagColor}` }} />
        <span className="text-[9px] font-mono uppercase tracking-wide text-neutral-500">{tag}</span>
      </div>
    </div>
  )
}

function SectionRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-500 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function CIAnalysisSlides() {
  return (
    <div className="flex flex-col gap-4">

      {/* ── Slide 1: Current State ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <SlideHeader
          eyebrow="isaac-sim/IsaacLab · GitHub Actions · Current State · May 2026"
          title="CI/CD Pipeline Is"
          accent="Critically Broken"
          sub="Analysis of 150+ open issues and 100+ open PRs. Nightly and post-merge CI are the primary failure surfaces with measurable impact on every contributor."
          tag="isaac-sim/IsaacLab"
        />
        <div className="p-4 bg-surface flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-2">
            {CI_KPIS.map(k => (
              <div key={k.label} className="bg-surface-1 border-2 p-3"
                style={{ borderColor: k.borderColor, borderLeftColor: k.color, borderLeftWidth: 4 }}>
                <div className="text-[26px] font-black font-mono leading-none" style={{ color: k.color }}>{k.value}</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-neutral-500 mt-1 mb-0.5">{k.label}</div>
                <div className="text-[8px] text-neutral-500 leading-snug">{k.note}</div>
              </div>
            ))}
          </div>

          <SectionRow label="4 Critical Failure Categories" />

          <div className="grid grid-cols-2 gap-3">
            {[CI_FAILURES.slice(0, 2), CI_FAILURES.slice(2, 4)].map((col, ci) => (
              <div key={ci} className="flex flex-col gap-2">
                {col.map(f => (
                  <div key={f.num} className="bg-surface-1 border-2 p-3"
                    style={{ borderColor: f.borderColor, borderLeftColor: f.color, borderLeftWidth: 4 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-[22px] h-[22px] flex items-center justify-center text-[10px] font-black font-mono border-2 flex-shrink-0"
                        style={{ color: f.color, borderColor: f.color }}>{f.num}</div>
                      <div className="text-[12px] font-bold text-white flex-1 leading-tight">{f.title}</div>
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 border flex-shrink-0"
                        style={{ color: f.color, background: f.borderColor, borderColor: f.borderColor }}>{f.severity}</span>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {f.bullets.map((b, bi) => (
                        <li key={bi} className="flex items-start gap-2">
                          <span className="w-1 h-1 rounded-full bg-border/60 flex-shrink-0 mt-[5px]" />
                          <span className="text-[8.5px] text-neutral-500 leading-snug">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-[8px] font-mono text-neutral-600">CI/CD Analysis — IsaacLab Repository</span>
            <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-600">IsaacLab / IsaacSim CI Review · May 2026</span>
          </div>
        </div>
      </div>

      {/* ── Slide 2: Workflow Deep Dive ─────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <SlideHeader
          eyebrow="Workflow Analysis — File-Level Breakdown"
          title="Three Workflows,"
          accent="Exact Failure Points"
          sub="Mapped to specific workflow files and confirmed by analysis. Every item below is reproducible from the open issue tracker."
          tag=".github/workflows"
          tagColor="#ff6b6b"
        />
        <div className="p-4 bg-surface flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {CI_WORKFLOWS.map(wf => (
              <div key={wf.name} className="bg-surface-1 border-2 p-3"
                style={{
                  borderColor: wf.color === '#c9210e' ? '#f5bbb6' : '#f5d9aa',
                  borderTopColor: wf.color, borderTopWidth: 4,
                }}>
                <div className="text-[9.5px] font-bold font-mono text-white mb-2">{wf.name}</div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[8px] font-semibold text-neutral-500 whitespace-nowrap">{wf.statLabel}</span>
                  <div className="flex-1 h-1.5 bg-border">
                    <div className="h-1.5" style={{ width: `${wf.pct}%`, background: wf.color }} />
                  </div>
                  <span className="text-[11px] font-bold font-mono min-w-[44px] text-right" style={{ color: wf.color }}>{wf.pctLabel}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {wf.rows.map((row, ri) => (
                    <div key={ri} className="flex items-start gap-1.5">
                      <span className="w-[5px] h-[5px] rounded-full flex-shrink-0 mt-[4px]" style={{ background: row.dot }} />
                      <span className="text-[8px] text-neutral-500 leading-snug">
                        <strong className="text-neutral-200 font-semibold">{row.strong}</strong>{row.rest}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <SectionRow label="Key Failure Areas — Confirmed by Analysis" />

          <div className="grid grid-cols-4 gap-2">
            {CI_ISSUE_REFS.map(ref => (
              <div key={ref.id} className="bg-surface-1 border-2 p-2.5"
                style={{ borderColor: ref.borderColor, borderLeftColor: ref.color, borderLeftWidth: 3 }}>
                <div className="text-[8px] font-bold font-mono mb-1 tracking-wider" style={{ color: ref.color }}>{ref.id}</div>
                <div className="text-[8.5px] font-semibold text-white mb-0.5">{ref.title}</div>
                <div className="text-[7.5px] text-neutral-500 leading-snug">{ref.note}</div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-[8px] font-mono text-neutral-600">Source: isaac-sim/IsaacLab — 150+ open issues · 100+ open PRs</span>
            <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-600">IsaacLab / IsaacSim CI Review · May 2026</span>
          </div>
        </div>
      </div>

      {/* ── Slide 3: Improvement Roadmap ────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <SlideHeader
          eyebrow="Improvement Roadmap — 3-Phase Plan"
          title="From 16% Pass Rate to"
          accent="Elite CI/CD"
          sub="Ordered by impact-to-effort ratio. Phase 1 alone restores nightly CI and unblocks post-merge. Each phase maps directly to a root cause identified above."
          tag="Roadmap 2026"
          tagColor="#6ea8fe"
        />
        <div className="p-4 bg-surface flex flex-col gap-3">
          {CI_PHASES.map(ph => (
            <div key={ph.num} className="bg-surface-1 border-2 flex gap-3 p-3"
              style={{ borderColor: ph.borderColor, borderLeftColor: ph.color, borderLeftWidth: 4 }}>
              <div className="w-[28px] h-[28px] flex items-center justify-center text-[11px] font-black font-mono border-2 flex-shrink-0 mt-0.5"
                style={{ color: ph.color, borderColor: ph.color }}>{ph.num}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[12px] font-bold text-white">{ph.title}</span>
                  <span className="text-[8px] font-mono text-neutral-500 bg-surface-2 border border-border px-1.5 py-0.5">{ph.timeframe}</span>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 border"
                    style={{ color: ph.color, background: ph.borderColor, borderColor: ph.borderColor }}>{ph.badge}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {ph.items.map((item, ii) => (
                    <div key={ii} className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full flex-shrink-0 mt-[5px]" style={{ background: ph.color }} />
                      <span className="text-[8.5px] text-neutral-500 leading-snug">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div>
            <SectionRow label="Expected Outcomes After All 3 Phases" />
            <div className="grid grid-cols-4 gap-2 mt-3">
              {CI_OUTCOMES.map(o => (
                <div key={o.label} className="bg-surface-1 border-2 p-3"
                  style={{ borderColor: '#bfdf7a', borderLeftColor: o.color, borderLeftWidth: 4 }}>
                  <div className="text-[26px] font-black font-mono leading-none" style={{ color: o.color }}>{o.value}</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-neutral-500 mt-1 mb-0.5">{o.label}</div>
                  <div className="text-[8px] text-neutral-500 leading-snug">{o.note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-[8px] font-mono text-neutral-600">Implementation Timeline — Q2/Q3 2026</span>
            <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-600">IsaacLab / IsaacSim CI Review · May 2026</span>
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Profile / Portfolio section ───────────────────────────────────────────────

const PROFILE_LINKS = [
  { label: 'GitHub',    href: 'https://github.com/schundu007/',                          sub: 'schundu007 — open-source projects & contributions',   color: '#e5e5e5' },
  { label: 'LinkedIn',  href: 'https://www.linkedin.com/in/schundu',                     sub: 'Professional profile & work history',                 color: '#0a66c2' },
  { label: 'Portfolio', href: 'https://www.sudhakarchundu.org/',                          sub: 'Personal site — projects, blog, contact',              color: '#76b900' },
  { label: 'DevOps Blog', href: 'https://www.sudhakarchundu.org/blog/NVIDIA_Isaac_ROS_DevOps.html', sub: 'NVIDIA Isaac ROS DevOps Reference — engineering guide', color: '#f59e0b' },
]

const SKILLS = [
  { area: 'CI/CD & DevOps',     items: ['GitHub Actions', 'Docker', 'Kubernetes', 'ArgoCD', 'Helm', 'BuildKit'] },
  { area: 'Cloud & Infra',      items: ['AWS ECR / S3 / IAM', 'NVIDIA NGC', 'Railway', 'Vercel', 'Terraform'] },
  { area: 'Languages',          items: ['Python', 'TypeScript / React', 'Bash', 'C++', 'SQL'] },
  { area: 'Robotics / AI',      items: ['Isaac Sim', 'IsaacLab', 'ROS 2', 'CUDA', 'PyTorch'] },
]

function ProfileSection() {
  return (
    <div className="flex gap-4 items-start">

      {/* LEFT: Bio + links */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-3">

        {/* Bio card */}
        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="bg-[#0d0d0f] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-600 mb-1">Engineer Profile</div>
            <div className="text-[18px] font-black text-white leading-tight">Sudhakar Babu <span className="text-nvidia">Chundu</span></div>
            <div className="text-[9px] text-neutral-500 mt-1">Senior DevOps Engineer · Robotics CI/CD · Platform Infrastructure</div>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] leading-[1.7] text-neutral-400">
              12+ years of CI/CD infrastructure ownership across multi-cloud and hardware-accelerated workloads.
              Targeting <span className="text-nvidia font-semibold">NVIDIA Senior DevOps Engineer — Robotics (JR2014821)</span>.
              Deep expertise in GitLab CI, GitHub Actions, multi-arch Docker (x86-64 + ARM64), release engineering,
              and ROS 2 development workflow automation.
            </p>
          </div>
        </div>

        {/* Links */}
        <div className="rounded-xl border border-border bg-surface-1">
          <div className="px-4 py-2.5 border-b border-border bg-surface-2/60 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-neutral-300">Links</span>
          </div>
          <div className="divide-y divide-border/40">
            {PROFILE_LINKS.map(link => (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/40 transition-colors group">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: link.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-neutral-200 group-hover:text-white transition-colors">{link.label}</div>
                  <div className="text-[10px] text-neutral-500 truncate">{link.sub}</div>
                </div>
                <ExternalLink size={10} className="text-neutral-600 group-hover:text-neutral-400 flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>

      </div>

      {/* RIGHT: Skills */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        <div className="rounded-xl border border-border bg-surface-1">
          <div className="px-4 py-2.5 border-b border-border bg-surface-2/60 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-nvidia" />
            <span className="text-[11px] font-semibold text-neutral-300">Skills & Stack</span>
          </div>
          <div className="p-4 grid grid-cols-2 gap-4">
            {SKILLS.map(s => (
              <div key={s.area}>
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-500 mb-2">{s.area}</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.items.map(item => (
                    <span key={item}
                      className="inline-flex items-center px-2 py-0.5 bg-surface-2 border border-border text-[10px] font-mono text-neutral-400">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Current focus */}
        <div className="rounded-xl border border-border bg-surface-1">
          <div className="px-4 py-2.5 border-b border-border bg-surface-2/60 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
            <span className="text-[11px] font-semibold text-neutral-300">Current Focus</span>
          </div>
          <div className="p-4 flex flex-col gap-2.5">
            {[
              { title: 'Isaac ROS CI/CD Patterns',     sub: 'Pre-merge validation, nightly testing, and release pipelines for ROS 2 — Isaac ROS and IsaacLab workflows' },
              { title: 'Multi-arch Docker Builds',      sub: 'x86-64 + ARM64 (Jetson Orin/Thor) via QEMU buildx; registry-backed cache; CUDA arch list hardening' },
              { title: 'ROS 2 Workflow Automation',     sub: 'Multi-repo colcon/vcstool builds, complex dependency graphs, platform-specific targets for embedded + cloud' },
              { title: 'NVIDIA JR2014821 Interview',    sub: 'Preparing for Senior DevOps Engineer — Robotics role at NVIDIA Santa Clara; targeting offer' },
            ].map(f => (
              <div key={f.title} className="flex items-start gap-2.5">
                <span className="w-1 h-1 rounded-full bg-nvidia flex-shrink-0 mt-[5px]" />
                <div>
                  <div className="text-[12px] font-semibold text-neutral-200">{f.title}</div>
                  <div className="text-[10px] text-neutral-500 leading-relaxed">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Main Home export ──────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<'dashboard' | 'profile'>('dashboard')
  const { data } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = data?.active?.slug ?? ''
  const isIsaacLab = repoSlug === 'isaac-sim/IsaacLab'

  return (
    <div className="flex flex-col gap-3">

      {/* Hero + tabs */}
      <div className="flex items-center justify-between flex-shrink-0">
        <GitPulseLogo size={22} withText textSize="text-[15px]" className="text-nvidia" />
        <div className="flex items-center gap-3">
          {/* Tab bar */}
          <div className="flex items-center gap-0.5 bg-surface-2 border border-border p-0.5">
            {(['dashboard', 'profile'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                  tab === t ? 'bg-surface-3 text-white' : 'text-neutral-500 hover:text-neutral-300',
                )}>
                {t === 'dashboard' ? 'Dashboard' : 'Profile'}
              </button>
            ))}
          </div>
          {repoSlug && tab === 'dashboard' && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-nvidia" />
              <a href={`https://github.com/${repoSlug}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[11px] font-mono text-neutral-500 hover:text-nvidia transition-colors">
                {repoSlug}<ExternalLink size={9} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'profile' ? (
        <ProfileSection />
      ) : !data ? null : isIsaacLab ? (
      <div className="flex flex-col gap-4">
      <div className="flex gap-4 items-start">

        {/* LEFT: Improvements Requested + breakdown cards */}
        <div className="w-[460px] flex-shrink-0 flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-surface-1">

            {/* Panel header */}
            <div className="px-4 py-2.5 border-b border-border bg-surface-2 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                <span className="text-[11px] font-semibold text-white tracking-[0.18em] uppercase">Improvements Requested</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20">
                  7 CRIT
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
                  4 WARN
                </span>
              </div>
            </div>

            {/* Scan target meta */}
            <div className="px-4 py-1.5 border-b border-border/40 bg-surface-2/30 flex items-center gap-2 flex-shrink-0">
              <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">Target</span>
              <span className="text-[9px] font-mono text-neutral-500">isaac-sim/IsaacLab</span>
              <span className="ml-auto text-[9px] font-mono text-neutral-600">ci/cd · docker · supply-chain · ops</span>
            </div>

            {/* Findings list */}
            <div className="divide-y divide-border/40">
              {FINDINGS.map((f) => (
                <div key={f.title} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider flex-shrink-0',
                      f.severity === 'CRIT'
                        ? 'bg-[#ef4444]/10 text-[#ef4444]'
                        : 'bg-[#f59e0b]/10 text-[#f59e0b]',
                    )}>{f.severity}</span>
                    <span className="text-[13px] font-semibold text-white leading-tight flex-1 min-w-0">{f.title}</span>
                    <span className="text-[12px] font-bold tabular-nums font-mono flex-shrink-0"
                      style={{ color: f.statColor }}>{f.stat}</span>
                  </div>
                  <p className="text-[11px] leading-[1.55] text-neutral-500">{f.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Issue + PR breakdown cards */}
          <IssueBreakdownCard repoSlug={repoSlug} />
          <PRBreakdownCard repoSlug={repoSlug} />
        </div>

        {/* RIGHT: Stats + Architecture + Roadmap */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">

          {/* ── Stats bar ── */}
          <div className="flex-shrink-0 rounded-lg border border-border bg-surface-1 flex items-stretch divide-x divide-border">
            {/* Impact section */}
            <div className="flex items-center gap-5 pl-4 pr-5 py-3 flex-shrink-0">
              <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.18em] text-neutral-600 whitespace-nowrap">IMPACT</span>
              {IMPACT.map((item) => (
                <div key={item.label} className="flex items-end gap-1.5">
                  <span className="text-[20px] font-black font-mono leading-none tabular-nums text-nvidia">{item.value}</span>
                  <span className="text-[10px] text-neutral-500 leading-tight pb-[2px] max-w-[72px]">{item.sub}</span>
                </div>
              ))}
            </div>

            {/* Targets section */}
            <div className="flex-1 flex items-center gap-0 overflow-hidden pl-5 pr-4 py-3 min-w-0">
              <span className="text-[9px] font-mono font-semibold uppercase tracking-[0.18em] text-neutral-600 whitespace-nowrap mr-5">TARGETS</span>
              {TECH_METRICS.map((m) => (
                <div key={m.label} className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-[9px] text-neutral-600 font-mono leading-none truncate">{m.label}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[9px] text-neutral-700 line-through font-mono whitespace-nowrap">{m.from}</span>
                    <span className="text-[13px] font-bold font-mono leading-none whitespace-nowrap text-nvidia">{m.to}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Live badge */}
            <div className="flex-shrink-0 flex items-center px-4">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nvidia animate-pulse" />
                <span className="text-[9px] font-mono font-semibold text-nvidia tracking-widest">LIVE</span>
              </div>
            </div>
          </div>

          {/* Section label */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-nvidia" />
            <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Target Architecture</span>
          </div>

          {/* Target architecture diagram */}
          <div className="flex-shrink-0 rounded-xl overflow-hidden w-full border border-border"
               style={{ aspectRatio: '1200 / 560' }}>
            <TargetArchSVG />
          </div>

          {/* Remediation Roadmap */}
          <div className="grid grid-cols-3 gap-3">
            {PHASES.map((ph) => (
              <div key={ph.phase} className="rounded-xl border border-border bg-surface-1 flex flex-col">
                <div className="px-4 py-2 border-b border-border bg-surface-2/60 flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold tracking-widest text-neutral-500">PHASE {ph.phase}</span>
                  <span className="text-[11px] font-semibold text-neutral-200">{ph.label}</span>
                  <span className="ml-auto text-[9px] font-mono text-neutral-600 whitespace-nowrap">{ph.timeframe}</span>
                </div>
                <div className="px-4 py-3 flex flex-col gap-2.5">
                  {ph.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] font-mono mt-px flex-shrink-0 text-neutral-600">→</span>
                      <span className="text-[10px] leading-[1.5] text-neutral-400">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Cross-workflow performance */}
          <CrossWorkflowPerf />

        </div>
      </div>

      {/* CI/CD Analysis — presentation slides */}
      <CIAnalysisSlides />

      </div>
      ) : (
        <GenericRepoHome repoSlug={repoSlug} />
      )}

    </div>
  )
}
