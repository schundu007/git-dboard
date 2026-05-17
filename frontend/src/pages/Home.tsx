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
import { getActiveRepo, getBuildPerformance, getOverviewSummary } from '../lib/api'
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

function GenericRepoHome({ repoSlug }: { repoSlug: string }) {
  const nav = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: getOverviewSummary,
    staleTime: 60_000,
  })

  const prs     = data?.prs
  const builds  = data?.builds
  const nightly = data?.nightly
  const runners = data?.runners
  const repo    = data?.repo

  const buildRateColor =
    (builds?.success_rate_last10 ?? 100) >= 80 ? 'text-nvidia' :
    (builds?.success_rate_last10 ?? 100) >= 50 ? 'text-accent-yellow' : 'text-accent-red'

  const nightlyColor =
    nightly?.last_status === 'success' ? 'text-nvidia' :
    nightly?.consecutive_failures > 0  ? 'text-accent-red' : 'text-neutral-400'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

      {/* Repo card */}
      <div className="border border-border bg-surface-1 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold text-neutral-300">Repository</span>
          <a href={`https://github.com/${repoSlug}`} target="_blank" rel="noreferrer" className="text-neutral-500 hover:text-neutral-300">
            <ExternalLink size={11} />
          </a>
        </div>
        {isLoading ? (
          <div className="text-[11px] text-neutral-600 font-mono">Loading…</div>
        ) : repo ? (
          <>
            <p className="text-[13px] font-semibold text-white mb-3">{repo.name}</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { icon: Star,        label: 'Stars',  val: repo.stars?.toLocaleString()       },
                { icon: GitFork,     label: 'Forks',  val: repo.forks?.toLocaleString()       },
                { icon: AlertCircle, label: 'Issues', val: repo.open_issues?.toLocaleString() },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="border border-border bg-surface-2 p-2 text-center">
                  <Icon size={10} className="mx-auto text-neutral-500 mb-1" />
                  <p className="text-[13px] font-semibold text-white">{val ?? '—'}</p>
                  <p className="text-[9px] text-neutral-500">{label}</p>
                </div>
              ))}
            </div>
            {repo.updated_at && (
              <p className="text-[10px] text-neutral-600">
                Updated {formatDistanceToNow(new Date(repo.updated_at), { addSuffix: true })}
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-neutral-600">No repo data</p>
        )}

        <div className="mt-4 pt-3 border-t border-border/40 flex flex-col gap-1">
          {[
            { label: 'Dashboard Overview', path: '/dashboard' },
            { label: 'CI Pipeline',        path: '/builds'    },
            { label: 'Pull Requests',      path: '/prs'       },
            { label: 'Nightly Monitor',    path: '/nightly'   },
            { label: 'Analytics',          path: '/analytics' },
          ].map(({ label, path }) => (
            <button
              key={path}
              onClick={() => nav(path)}
              className="text-left text-[11px] text-neutral-500 hover:text-neutral-200 py-0.5 transition-colors"
            >
              {label} →
            </button>
          ))}
        </div>
      </div>

      {/* Health tiles */}
      <div className="xl:col-span-2 flex flex-col gap-3">

        {/* PRs + Builds */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="border border-border bg-surface-1 p-4 cursor-pointer hover:bg-surface-2/40 transition-colors"
            onClick={() => nav('/prs')}
          >
            <div className="flex items-center gap-2 mb-2">
              <GitPullRequest size={13} className="text-neutral-500" />
              <span className="text-[11px] font-semibold text-neutral-300">Open PRs</span>
            </div>
            {isLoading ? <div className="text-[11px] text-neutral-600 font-mono">…</div> : prs ? (
              <>
                <p className="text-[28px] font-bold font-mono leading-none text-neutral-100 mb-1">{prs.open}</p>
                <p className="text-[10px] text-neutral-500">
                  {prs.ready} ready · {prs.draft} draft
                  {prs.review_requested > 0 && <span className="text-nvidia ml-2">{prs.review_requested} need review</span>}
                </p>
              </>
            ) : <p className="text-[11px] text-neutral-600">—</p>}
          </div>

          <div
            className="border border-border bg-surface-1 p-4 cursor-pointer hover:bg-surface-2/40 transition-colors"
            onClick={() => nav('/builds')}
          >
            <div className="flex items-center gap-2 mb-2">
              <Container size={13} className="text-neutral-500" />
              <span className="text-[11px] font-semibold text-neutral-300">Build Health</span>
            </div>
            {isLoading ? <div className="text-[11px] text-neutral-600 font-mono">…</div> : builds ? (
              <>
                <p className={cn('text-[28px] font-bold font-mono leading-none mb-1', buildRateColor)}>
                  {builds.success_rate_last10 ?? '—'}%
                </p>
                <p className="text-[10px] text-neutral-500">
                  success rate · last 10 runs
                  {builds.in_progress > 0 && (
                    <span className="text-nvidia ml-2 animate-pulse">{builds.in_progress} running</span>
                  )}
                </p>
              </>
            ) : <p className="text-[11px] text-neutral-600">—</p>}
          </div>
        </div>

        {/* Nightly + Runners */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="border border-border bg-surface-1 p-4 cursor-pointer hover:bg-surface-2/40 transition-colors"
            onClick={() => nav('/nightly')}
          >
            <div className="flex items-center gap-2 mb-2">
              <Moon size={13} className="text-neutral-500" />
              <span className="text-[11px] font-semibold text-neutral-300">Nightly</span>
            </div>
            {isLoading ? <div className="text-[11px] text-neutral-600 font-mono">…</div> : nightly ? (
              <>
                <p className={cn('text-[14px] font-semibold font-mono mb-1', nightlyColor)}>
                  {nightly.last_status ?? '—'}
                </p>
                {nightly.consecutive_failures > 0 ? (
                  <p className="text-[10px] text-accent-red flex items-center gap-1">
                    <AlertTriangle size={9} /> {nightly.consecutive_failures} consecutive failure{nightly.consecutive_failures > 1 ? 's' : ''}
                  </p>
                ) : (
                  <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <CheckCircle2 size={9} className="text-nvidia" /> All jobs passing
                  </p>
                )}
                {nightly.last_date && <p className="text-[10px] text-neutral-600 mt-1">Last run: {nightly.last_date}</p>}
              </>
            ) : <p className="text-[11px] text-neutral-600">—</p>}
          </div>

          <div
            className="border border-border bg-surface-1 p-4 cursor-pointer hover:bg-surface-2/40 transition-colors"
            onClick={() => nav('/infra')}
          >
            <div className="flex items-center gap-2 mb-2">
              <Server size={13} className="text-neutral-500" />
              <span className="text-[11px] font-semibold text-neutral-300">Runners</span>
            </div>
            {isLoading ? <div className="text-[11px] text-neutral-600 font-mono">…</div> : runners ? (
              <>
                <p className="text-[28px] font-bold font-mono leading-none text-neutral-100 mb-1">
                  {runners.access_denied ? '—' : `${runners.online}/${runners.total}`}
                </p>
                <p className="text-[10px] text-neutral-500">
                  {runners.access_denied ? 'scope limited' : 'online'}
                  {runners.busy > 0 && <span className="text-nvidia ml-2">{runners.busy} busy</span>}
                </p>
              </>
            ) : <p className="text-[11px] text-neutral-600">—</p>}
          </div>
        </div>

        {/* Recent builds */}
        {builds?.recent?.length > 0 && (
          <div className="border border-border bg-surface-1">
            <div className="px-4 py-2.5 border-b border-border">
              <span className="text-[11px] font-semibold text-neutral-300">Recent Runs</span>
            </div>
            <div className="divide-y divide-border/40">
              {(builds.recent as any[]).slice(0, 5).map((b: any) => (
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

export default function Home() {
  const { data } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = data?.active?.slug ?? ''
  const isIsaacLab = repoSlug === 'isaac-sim/IsaacLab'

  return (
    <div className="flex flex-col gap-3">

      {/* Hero */}
      <div className="flex items-center justify-between flex-shrink-0">
        <GitPulseLogo size={22} withText textSize="text-[15px]" className="text-nvidia" />
        {repoSlug && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-nvidia" />
            <a href={`https://github.com/${repoSlug}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[11px] font-mono text-neutral-500 hover:text-nvidia transition-colors">
              {repoSlug}<ExternalLink size={9} />
            </a>
          </div>
        )}
      </div>

      {/* Main content — conditional on active repo */}
      {!data ? null : isIsaacLab ? (
      <div className="flex gap-4 items-start">

        {/* LEFT: Audit Findings */}
        <div className="w-[460px] flex-shrink-0">
          <div className="rounded-xl border border-border bg-surface-1">

            {/* Panel header */}
            <div className="px-4 py-2.5 border-b border-border bg-surface-2 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                <span className="text-[11px] font-semibold text-white tracking-[0.18em] uppercase">Audit Findings</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20">
                  5 CRIT
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
                  3 WARN
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

        </div>
      </div>
      ) : (
        <GenericRepoHome repoSlug={repoSlug} />
      )}

      {/* Cross-workflow performance */}
      <CrossWorkflowPerf />

    </div>
  )
}
