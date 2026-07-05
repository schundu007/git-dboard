const DIM  = '#4b5563'
const DASH = '#1f2937'

// ── Current (as-is) CI/CD Architecture ───────────────────────────────────────

export function CurrentArchSVG() {
  const W = 1000
  const SVG_H = 480

  const Z1_X = 0,   Z1_W = 168
  const Z2_X = 176, Z2_W = 570
  const Z3_X = 754, Z3_W = 246
  const MAIN_H = 388
  const Z4_Y = 394, Z4_H = 86

  const R1_Y = 22, R1_H = 142, R1_CW = 184
  const R2_Y = R1_Y + R1_H + 8
  const R2_H = 104, R2_CW = 281
  const R3_Y = R2_Y + R2_H + 8
  const R3_H = 56,  R3_CW = 136

  const CA_CW = Z3_W - 10
  const CA_CH = Math.floor((MAIN_H - 20 - 2 * 8) / 3)

  const OUT_CW = 158

  return (
    <svg viewBox={`0 0 ${W} ${SVG_H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <defs>
        <marker id="ah" markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L8,3.5 z" fill={DIM} />
        </marker>
        <symbol id="ic-gh" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#24292F" />
          <path fillRule="evenodd" clipRule="evenodd"
            d="M16 3.5C9.1 3.5 3.5 9.1 3.5 16c0 5.5 3.58 10.17 8.56 11.82.63.12.86-.27.86-.6v-2.09c-3.48.76-4.22-1.68-4.22-1.68-.57-1.44-1.38-1.82-1.38-1.82-1.13-.77.09-.75.09-.75 1.25.08 1.9 1.28 1.9 1.28 1.11 1.9 2.9 1.35 3.61 1.03.11-.8.43-1.35.78-1.66-2.77-.31-5.68-1.38-5.68-6.27 0-1.38.49-2.51 1.3-3.4-.13-.32-.56-1.6.12-3.34 0 0 1.06-.34 3.48 1.3a12.1 12.1 0 0 1 6.32 0c2.41-1.64 3.47-1.3 3.47-1.3.68 1.74.25 3.02.12 3.34.81.89 1.3 2.02 1.3 3.4 0 4.9-2.98 5.96-5.81 6.27.46.4.86 1.17.86 2.36v3.5c0 .33.22.72.87.6C24.93 26.16 28.5 21.48 28.5 16 28.5 9.1 22.9 3.5 16 3.5Z"
            fill="white" />
        </symbol>
        <symbol id="ic-docker" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#2496ED" />
          <rect x="4"  y="12.5" width="5" height="4.5" rx="0.8" fill="white" />
          <rect x="11" y="12.5" width="5" height="4.5" rx="0.8" fill="white" />
          <rect x="18" y="12.5" width="5" height="4.5" rx="0.8" fill="white" />
          <rect x="11" y="7"    width="5" height="4.5" rx="0.8" fill="white" />
          <rect x="18" y="7"    width="5" height="4.5" rx="0.8" fill="white" />
          <path d="M2 18.5 Q4 16.5 8 17.5 L26 17.5 Q30 18 30 21 Q28 25.5 19 26 Q10 26.5 4 24 Q1 22.5 2 18.5Z" fill="white" />
          <path d="M24 15.5 C25.5 12.5 27.5 12 29 13.5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-moon" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#1e1b4b" />
          <path d="M21 6.5C14.5 8 10 12.5 10 18.5 10 24 14 28.5 20 29.5 12 29.5 6.5 24 6.5 18 6.5 12 12 6 21 6.5Z" fill="#c4b5fd" />
          <circle cx="23" cy="9" r="2" fill="#fde68a" />
          <circle cx="26" cy="15" r="1.2" fill="#fde68a" opacity="0.65" />
        </symbol>
        <symbol id="ic-clock" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#1a1000" />
          <circle cx="16" cy="16" r="11" fill="none" stroke="#f59e0b" strokeWidth="2" />
          <line x1="16" y1="8" x2="16" y2="16" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="16" x2="22" y2="20" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="16" r="1.5" fill="#f59e0b" />
        </symbol>
        <symbol id="ic-dispatch" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0d0d1e" />
          <path d="M12 8 L26 16 L12 24 Z" fill="#818cf8" />
        </symbol>
        <symbol id="ic-fork" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0f0f1a" />
          <circle cx="10" cy="8"  r="3" fill="none" stroke="#60a5fa" strokeWidth="2" />
          <circle cx="22" cy="8"  r="3" fill="none" stroke="#60a5fa" strokeWidth="2" />
          <circle cx="10" cy="24" r="3" fill="none" stroke="#60a5fa" strokeWidth="2" />
          <line x1="10" y1="11" x2="10" y2="21" stroke="#60a5fa" strokeWidth="1.5" />
          <path d="M10 18 Q10 21 16 21 Q22 21 22 18 L22 11" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-book" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0a0d14" />
          <rect x="7" y="5" width="14" height="18" rx="1.5" fill="none" stroke="#94a3b8" strokeWidth="2" />
          <path d="M7 23 Q7 28 21 28 L21 23" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
          <line x1="10" y1="10" x2="18" y2="10" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <line x1="10" y1="14" x2="18" y2="14" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <line x1="10" y1="18" x2="15" y2="18" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </symbol>
        <symbol id="ic-tag" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0f080a" />
          <path d="M6 6 L18 6 L28 16 L18 26 L6 26 Z" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.5" fill="#f472b6" />
        </symbol>
        <symbol id="ic-flask" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0c1a0c" />
          <path d="M12 4 L12 14 L6 26 Q5 28 8 28 L24 28 Q27 28 26 26 L20 14 L20 4 Z" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinejoin="round" />
          <line x1="10" y1="17" x2="22" y2="17" stroke="#4ade80" strokeWidth="1.5" opacity="0.4" />
          <circle cx="14" cy="22" r="1.5" fill="#4ade80" opacity="0.7" />
          <circle cx="18" cy="24" r="1" fill="#4ade80" opacity="0.5" />
          <line x1="12" y1="4" x2="20" y2="4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-merge" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0a0f1a" />
          <line x1="8" y1="8" x2="16" y2="16" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
          <line x1="24" y1="8" x2="16" y2="16" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="16" x2="16" y2="26" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
          <circle cx="8" cy="8" r="2.5" fill="#60a5fa" />
          <circle cx="24" cy="8" r="2.5" fill="#60a5fa" />
          <circle cx="16" cy="26" r="2.5" fill="#60a5fa" />
        </symbol>
        <symbol id="ic-globe" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0a0d0f" />
          <circle cx="16" cy="16" r="11" fill="none" stroke="#38bdf8" strokeWidth="1.8" />
          <ellipse cx="16" cy="16" rx="5" ry="11" fill="none" stroke="#38bdf8" strokeWidth="1.8" />
          <line x1="5" y1="16" x2="27" y2="16" stroke="#38bdf8" strokeWidth="1.8" />
          <line x1="7" y1="10" x2="25" y2="10" stroke="#38bdf8" strokeWidth="1.2" opacity="0.5" />
          <line x1="7" y1="22" x2="25" y2="22" stroke="#38bdf8" strokeWidth="1.2" opacity="0.5" />
        </symbol>
        <symbol id="ic-ngc" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#060d1e" />
          <text x="16" y="13" textAnchor="middle" fontSize="5" fontFamily="sans-serif" fontWeight="700" fill="#6b7280">NVIDIA</text>
          <text x="16" y="21" textAnchor="middle" fontSize="8" fontFamily="sans-serif" fontWeight="700" fill="#76b900">NGC</text>
          <path d="M8 26 Q16 31 24 26" fill="none" stroke="#76b900" strokeWidth="1.8" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-comment" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0d0a1a" />
          <path d="M5 7 Q5 5 7 5 L25 5 Q27 5 27 7 L27 19 Q27 21 25 21 L11 21 L6 27 L6 21 Q5 21 5 19 Z" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinejoin="round" />
          <line x1="10" y1="11" x2="22" y2="11" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <line x1="10" y1="15" x2="18" y2="15" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </symbol>
        <symbol id="ic-gitcommit" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#050d05" />
          <circle cx="16" cy="16" r="5" fill="none" stroke="#4ade80" strokeWidth="2" />
          <line x1="3"  y1="16" x2="11" y2="16" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
          <line x1="21" y1="16" x2="29" y2="16" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="ic-xml" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#0f0a1a" />
          <path d="M8 4 L20 4 L26 10 L26 28 L8 28 Z" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinejoin="round" />
          <path d="M19 4 L19 11 L26 11" fill="none" stroke="#a78bfa" strokeWidth="1.5" />
          <text x="17" y="22" textAnchor="middle" fontSize="6" fontFamily="monospace" fontWeight="700" fill="#a78bfa">XML</text>
        </symbol>
      </defs>

      {/* Zone 1: Triggers */}
      <rect x={Z1_X} y={0} width={Z1_W} height={MAIN_H} rx="7"
        fill="#090600" stroke="#92400e" strokeOpacity="0.4" strokeWidth="1" />
      <text x={Z1_X + Z1_W / 2} y="13" textAnchor="middle"
        fill="#f59e0b" fontSize="6.5" fontWeight="700" letterSpacing="2.5" fontFamily="monospace">TRIGGERS</text>

      {([
        { id: '#ic-gh',       label: 'Pull Request',        sub: 'main · devel · release'  },
        { id: '#ic-clock',    label: 'Schedule (cron)',      sub: '4AM / 5AM UTC'           },
        { id: '#ic-dispatch', label: 'workflow_dispatch',    sub: 'manual trigger'           },
        { id: '#ic-fork',     label: 'pull_request_target',  sub: 'fork PR isolation'        },
      ] as const).map((t, i) => {
        const ty = 18 + i * 92
        const tcx = Z1_X + Z1_W / 2
        return (
          <g key={t.label}>
            <rect x={Z1_X + 5} y={ty} width={Z1_W - 10} height={84} rx="5"
              fill="#0d0900" stroke="#92400e" strokeOpacity="0.25" strokeWidth="0.8" />
            <use href={t.id} x={tcx - 13} y={ty + 6} width="26" height="26" />
            <text x={tcx} y={ty + 46} textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="600" fontFamily="sans-serif">{t.label}</text>
            <text x={tcx} y={ty + 58} textAnchor="middle" fill={DIM} fontSize="6.5" fontFamily="monospace">{t.sub}</text>
          </g>
        )
      })}

      <line x1={Z1_X + Z1_W} y1={MAIN_H / 2} x2={Z2_X - 2} y2={MAIN_H / 2}
        stroke={DIM} strokeWidth="1.5" markerEnd="url(#ah)" />

      {/* Zone 2: GitHub Actions Workflows */}
      <rect x={Z2_X} y={0} width={Z2_W} height={MAIN_H} rx="7"
        fill="#020407" stroke="#1e3a5f" strokeOpacity="0.4" strokeWidth="1" />
      <use href="#ic-gh" x={Z2_X + 8} y="4" width="15" height="15" />
      <text x={Z2_X + 27} y="13" fill="#60a5fa" fontSize="6.5" fontWeight="700"
        letterSpacing="2.5" fontFamily="monospace">GITHUB ACTIONS WORKFLOWS</text>

      {([
        { icon: '#ic-gh',     badge: 'CI · TEST',    bc: '#60a5fa',
          title: 'PR Build & Test',
          l1: 'on: pull_request → main / devel / release',
          l2: 'Jobs: test-isaaclab-tasks · test-general · comb…',
          l3: 'Runs on: [self-hosted, gpu]' },
        { icon: '#ic-clock',  badge: 'SCHEDULED',    bc: '#f59e0b',
          title: 'Daily Compatibility Matrix',
          l1: 'on: schedule (4 AM UTC) · workflow_dispatch',
          l2: 'Matrix: IsaacSim 4.5.0, 5.0.0 → compat tests',
          l3: 'Jobs: setup-versions · tests · combine · notify' },
        { icon: '#ic-docker', badge: 'BUILD · PUSH', bc: '#2496ED',
          title: 'Post-merge Build & Push',
          l1: 'on: push → main / devel / release',
          l2: 'Builds multi-arch Docker images (ARM64 + x86_64)',
          l3: 'Pushes to NGC Container Registry' },
      ] as const).map((w, i) => {
        const wx = Z2_X + i * (R1_CW + 8)
        return (
          <g key={w.title}>
            <rect x={wx} y={R1_Y} width={R1_CW} height={R1_H} rx="5"
              fill="#030b1c" stroke="#1e3a5f" strokeOpacity="0.6" strokeWidth="1" />
            <use href={w.icon} x={wx + 7} y={R1_Y + 7} width="22" height="22" />
            <rect x={wx + R1_CW - 58} y={R1_Y + 5} width={54} height={13} rx="3"
              fill={w.bc + '18'} stroke={w.bc + '40'} strokeWidth="0.7" />
            <text x={wx + R1_CW - 31} y={R1_Y + 13.5} textAnchor="middle"
              fill={w.bc} fontSize="6" fontWeight="700" fontFamily="monospace">{w.badge}</text>
            <text x={wx + 7} y={R1_Y + 42} fill="white" fontSize="8.5" fontWeight="700" fontFamily="sans-serif">{w.title}</text>
            <text x={wx + 7} y={R1_Y + 57} fill="#4d7ba6" fontSize="7" fontFamily="monospace">{w.l1}</text>
            <text x={wx + 7} y={R1_Y + 71} fill="#3a5a73" fontSize="6.5" fontFamily="monospace">{w.l2}</text>
            <text x={wx + 7} y={R1_Y + 84} fill="#2a3f52" fontSize="6.5" fontFamily="monospace">{w.l3}</text>
          </g>
        )
      })}

      {([
        { icon: '#ic-book',  badge: 'DOCS',    bc: '#94a3b8',
          title: 'Documentation',
          l1: 'on: push / pull_request',
          l2: 'Latest OR multi-version → deploy to GitHub Pages' },
        { icon: '#ic-moon',  badge: 'NIGHTLY', bc: '#c4b5fd',
          title: 'Nightly Changelog',
          l1: 'on: schedule (5 AM UTC) · workflow_dispatch',
          l2: 'Compile changelog fragments · bump version · push to develop' },
      ] as const).map((w, i) => {
        const wx = Z2_X + i * (R2_CW + 8)
        return (
          <g key={w.title}>
            <rect x={wx} y={R2_Y} width={R2_CW} height={R2_H} rx="5"
              fill="#020409" stroke="#1e3a5f" strokeOpacity="0.35" strokeWidth="1" />
            <use href={w.icon} x={wx + 7} y={R2_Y + 7} width="20" height="20" />
            <rect x={wx + R2_CW - 52} y={R2_Y + 5} width={48} height={12} rx="3"
              fill={w.bc + '18'} stroke={w.bc + '40'} strokeWidth="0.7" />
            <text x={wx + R2_CW - 28} y={R2_Y + 13} textAnchor="middle"
              fill={w.bc} fontSize="6" fontWeight="700" fontFamily="monospace">{w.badge}</text>
            <text x={wx + 7} y={R2_Y + 38} fill="white" fontSize="8.5" fontWeight="600" fontFamily="sans-serif">{w.title}</text>
            <text x={wx + 7} y={R2_Y + 53} fill="#4d7ba6" fontSize="7" fontFamily="monospace">{w.l1}</text>
            <text x={wx + 7} y={R2_Y + 67} fill="#3a5a73" fontSize="6.5" fontFamily="monospace">{w.l2}</text>
          </g>
        )
      })}

      {([
        { label: 'Link Check',        sub: 'Lychee link check',   clr: '#60a5fa' },
        { label: 'License Audit',     sub: 'pip-licenses + exc',   clr: '#f59e0b' },
        { label: 'Lint Gate',         sub: 'PR linters',           clr: '#a3e635' },
        { label: 'PR Auto-Labels',    sub: 'pull_request_target',  clr: '#f472b6' },
      ] as const).map((w, i) => {
        const wx = Z2_X + i * (R3_CW + 8)
        return (
          <g key={w.label}>
            <rect x={wx} y={R3_Y} width={R3_CW} height={R3_H} rx="4"
              fill="#020407" stroke="#1e3a5f" strokeOpacity="0.25" strokeWidth="0.8" />
            <text x={wx + R3_CW / 2} y={R3_Y + 19} textAnchor="middle"
              fill={w.clr} fontSize="6.5" fontWeight="600" fontFamily="monospace">{w.label}</text>
            <text x={wx + R3_CW / 2} y={R3_Y + 33} textAnchor="middle"
              fill={DIM} fontSize="6" fontFamily="monospace">{w.sub}</text>
          </g>
        )
      })}

      {[R1_Y + 60, R1_Y + 60 + (CA_CH + 8), R1_Y + 60 + 2*(CA_CH + 8)].map((y, i) => (
        <line key={i} x1={Z2_X + Z2_W} y1={y} x2={Z3_X} y2={20 + i * (CA_CH + 8) + CA_CH / 2}
          stroke={DASH} strokeWidth="1.2" strokeDasharray="4 2" markerEnd="url(#ah)" />
      ))}
      <text x={Z2_X + Z2_W + 4} y={R1_Y + 55} fill={DIM} fontSize="6" fontFamily="monospace">uses</text>

      {/* Zone 3: Composite Actions */}
      <rect x={Z3_X} y={0} width={Z3_W} height={MAIN_H} rx="7"
        fill="#030a03" stroke="#365314" strokeOpacity="0.4" strokeWidth="1" />
      <text x={Z3_X + Z3_W / 2} y="13" textAnchor="middle"
        fill="#76b900" fontSize="6.5" fontWeight="700" letterSpacing="2.5" fontFamily="monospace">COMPOSITE ACTIONS</text>

      {([
        { icon: '#ic-docker', name: '.github/actions/docker-build',
          d1: 'NGC login + buildx lcache (ghs)', d2: 'Builds isaac-lab-dev image' },
        { icon: '#ic-flask',  name: '.github/actions/run-tests',
          d1: 'docker run --gpus all → pytest', d2: 'Copies JUnit XML from container' },
        { icon: '#ic-merge',  name: '.github/actions/combine-results',
          d1: 'Merges JUnit XMLs → combined.xml', d2: 'Fallback XML if artifact missing' },
      ] as const).map((a, i) => {
        const ay = 20 + i * (CA_CH + 8)
        const ax = Z3_X + 5
        return (
          <g key={a.name}>
            <rect x={ax} y={ay} width={CA_CW} height={CA_CH} rx="5"
              fill="#040d04" stroke="#365314" strokeOpacity="0.4" strokeWidth="1" />
            <use href={a.icon} x={ax + 7} y={ay + 7} width="24" height="24" />
            <text x={ax + 7} y={ay + 44} fill="white" fontSize="7.5" fontWeight="600" fontFamily="monospace">{a.name}</text>
            <text x={ax + 7} y={ay + 58} fill={DIM} fontSize="7" fontFamily="monospace">{a.d1}</text>
            <text x={ax + 7} y={ay + 70} fill="#374151" fontSize="7" fontFamily="monospace">{a.d2}</text>
          </g>
        )
      })}

      {/* Zone 4: Outputs & Targets */}
      <rect x={0} y={Z4_Y} width={W} height={Z4_H} rx="7"
        fill="#08050d" stroke="#4c1d95" strokeOpacity="0.4" strokeWidth="1" />
      <text x={W / 2} y={Z4_Y + 12} textAnchor="middle"
        fill="#a78bfa" fontSize="6.5" fontWeight="700" letterSpacing="2.5" fontFamily="monospace">OUTPUTS & TARGETS</text>

      {([
        { icon: '#ic-xml',       label: 'JUnit XML',    sub: 'Test artifacts',   clr: '#a78bfa' },
        { icon: '#ic-globe',     label: 'GitHub Pages', sub: 'docs deploy',      clr: '#38bdf8' },
        { icon: '#ic-ngc',       label: 'NGC Registry', sub: 'Container images', clr: '#76b900' },
        { icon: '#ic-comment',   label: 'PR Checks',    sub: 'Comments + CI',    clr: '#c084fc' },
        { icon: '#ic-gitcommit', label: 'Auto-commit',  sub: 'to develop',       clr: '#4ade80' },
        { icon: '#ic-tag',       label: 'PR Labels',    sub: 'PR auto-labels',   clr: '#f472b6' },
      ] as const).map((o, i) => {
        const ox = i * (OUT_CW + 10) + 2
        const cx = ox + OUT_CW / 2
        const oy = Z4_Y + 14
        return (
          <g key={o.label}>
            <use href={o.icon} x={cx - 11} y={oy} width="22" height="22" />
            <text x={cx} y={oy + 30} textAnchor="middle" fill={o.clr} fontSize="8" fontWeight="600" fontFamily="sans-serif">{o.label}</text>
            <text x={cx} y={oy + 42} textAnchor="middle" fill={DIM} fontSize="6.5" fontFamily="monospace">{o.sub}</text>
          </g>
        )
      })}

      <line x1={Z2_X + R1_CW / 2}                   y1={R1_Y + R1_H} x2={506 + OUT_CW/2} y2={Z4_Y} stroke={DASH} strokeWidth="0.9" strokeDasharray="3 2" />
      <line x1={Z2_X + 2*(R1_CW+8) + R1_CW/2}       y1={R1_Y + R1_H} x2={338 + OUT_CW/2} y2={Z4_Y} stroke={DASH} strokeWidth="0.9" strokeDasharray="3 2" />
      <line x1={Z2_X + R2_CW/2}                      y1={R2_Y + R2_H} x2={170 + OUT_CW/2} y2={Z4_Y} stroke={DASH} strokeWidth="0.9" strokeDasharray="3 2" />
      <line x1={Z2_X + R2_CW + 8 + R2_CW/2}          y1={R2_Y + R2_H} x2={674 + OUT_CW/2} y2={Z4_Y} stroke={DASH} strokeWidth="0.9" strokeDasharray="3 2" />
      <line x1={Z3_X + Z3_W/2}                        y1={MAIN_H}      x2={2   + OUT_CW/2} y2={Z4_Y} stroke={DASH} strokeWidth="0.9" strokeDasharray="3 2" />
      <line x1={Z2_X + R3_CW * 3 + 8*3 + R3_CW/2}    y1={R3_Y + R3_H} x2={842 + OUT_CW/2} y2={Z4_Y} stroke={DASH} strokeWidth="0.9" strokeDasharray="3 2" />
    </svg>
  )
}

// ── Target Architecture ───────────────────────────────────────────────────────

export function TargetArchSVG() {
  const W = 1200, H = 560

  // ── Band A (top): Sources + Observability ─────────────
  const A_H = 112                  // tightly fitted to content
  const SRC_W = 298
  const OBS_X = 310
  const OBS_W = W - OBS_X         // 890

  // ── Band B (middle): K8s Runner Cluster ───────────────
  const B_Y = A_H + 24            // 136 — 24px gap lets cross-band arrows route cleanly
  const B_H = 248
  const B_HDR = 34
  const COL_Y = B_Y + B_HDR + 6  // 164
  const COL_H = B_H - B_HDR - 12 // 410
  const COL_W = 224, COL_GAP = 11
  const COL_XS = [8, 8 + COL_W + COL_GAP, 8 + 2*(COL_W + COL_GAP),
                  8 + 3*(COL_W + COL_GAP), 8 + 4*(COL_W + COL_GAP)] as const

  const ROW_H     = 90
  const ICON_SIZE = 28
  const ITEM_Y0   = COL_Y + 34

  // ── Band C (bottom): 4 infrastructure boxes ───────────
  const C_Y = B_Y + B_H + 24     // wider gap for staggered arrows
  const C_H = 114                  // tightly fitted to content
  const C_BOX_W = 291, C_GAP = 9
  const C_XS = [0, C_BOX_W + C_GAP, 2*(C_BOX_W + C_GAP), 3*(C_BOX_W + C_GAP)] as const

  // ── Legend ────────────────────────────────────────────
  const LEG_Y = C_Y + C_H + 8    // 714

  // Color palette
  // 3 structural colors — very muted, professional dark-theme
  const GRN = '#4a7055'  // slate sage green
  const BLU = '#365e82'  // steel slate blue
  const AMB = '#7a5028'  // muted bronze
  // icon-internal alias (not used as structural accent)
  const GRY = '#8898a8'
  // legacy aliases so icon symbols that capture these variables keep their look
  const ORG = AMB, TEA = GRN, FUS = GRN, RED = AMB, OBS_BLU = BLU, GPU = GRN

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}
      role="img" aria-label="Target CI/CD architecture — sources, observability, K8s runner cluster pipeline, and distribution">
      <title>Target CI/CD architecture</title>

      <defs>
        {/* Arrowhead markers */}
        <marker id="ta-gray" markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L8,3.5 z" fill={GRY} />
        </marker>
        <marker id="ta-grn" markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L8,3.5 z" fill={GRN} />
        </marker>
        <marker id="ta-org" markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L8,3.5 z" fill={ORG} />
        </marker>
        <marker id="ta-red" markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L8,3.5 z" fill={RED} />
        </marker>
        <marker id="ta-blu" markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L8,3.5 z" fill={BLU} />
        </marker>
        <marker id="ta-obs" markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L8,3.5 z" fill={OBS_BLU} />
        </marker>
        <marker id="ta-col-gray" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0.5 L0,4.5 L6,2.5 z" fill={GRY} opacity="0.6" />
        </marker>
        <marker id="ta-col-org" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0.5 L0,4.5 L6,2.5 z" fill={ORG} opacity="0.6" />
        </marker>
        <marker id="ta-col-tea" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0.5 L0,4.5 L6,2.5 z" fill={TEA} opacity="0.6" />
        </marker>
        <marker id="ta-col-fus" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0.5 L0,4.5 L6,2.5 z" fill={FUS} opacity="0.6" />
        </marker>
        <marker id="ta-col-blu" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0.5 L0,4.5 L6,2.5 z" fill={BLU} opacity="0.6" />
        </marker>
        <marker id="ta-gpu" markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
          <path d="M0,0.5 L0,6.5 L8,3.5 z" fill={GPU} />
        </marker>
        <marker id="ta-col-grn" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0.5 L0,4.5 L6,2.5 z" fill={GRN} opacity="0.7" />
        </marker>
        <marker id="ta-col-amb" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0.5 L0,4.5 L6,2.5 z" fill={AMB} opacity="0.7" />
        </marker>

        {/* ── GitHub ── */}
        <symbol id="ta-gh" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#24292F" />
          <path fillRule="evenodd" clipRule="evenodd"
            d="M20 4C11.16 4 4 11.16 4 20c0 7.08 4.6 13.08 11 15.22.8.14 1.1-.34 1.1-.76v-2.68c-4.48.98-5.42-2.16-5.42-2.16-.74-1.86-1.8-2.36-1.8-2.36-1.46-.98.1-.96.1-.96 1.6.1 2.44 1.64 2.44 1.64 1.42 2.44 3.74 1.74 4.66 1.32.14-1.02.56-1.74 1.02-2.14-3.56-.4-7.3-1.78-7.3-8.06 0-1.78.64-3.24 1.68-4.38-.16-.4-.72-2.06.16-4.3 0 0 1.36-.44 4.48 1.68 1.3-.36 2.68-.54 4.06-.54 1.38 0 2.78.18 4.08.54 3.1-2.12 4.46-1.68 4.46-1.68.88 2.24.32 3.9.16 4.3 1.04 1.14 1.68 2.6 1.68 4.38 0 6.28-3.84 7.66-7.48 8.06.58.52 1.1 1.52 1.1 3.06v4.52c0 .44.3.94 1.12.78C31.4 33.06 36 27.06 36 20c0-8.84-7.16-16-16-16Z"
            fill="white" />
        </symbol>

        {/* ── PR Webhook / branching arrows ── */}
        <symbol id="ta-webhook" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#151b26" />
          <circle cx="10" cy="20" r="3" fill={GRY} />
          <circle cx="30" cy="12" r="3" fill={GRY} />
          <circle cx="30" cy="28" r="3" fill={GRY} />
          <line x1="13" y1="20" x2="22" y2="13" stroke={GRY} strokeWidth="2" strokeLinecap="round" />
          <line x1="13" y1="20" x2="22" y2="27" stroke={GRY} strokeWidth="2" strokeLinecap="round" />
          <path d="M22 13 L27 12" stroke={GRY} strokeWidth="2" strokeLinecap="round" />
          <path d="M22 27 L27 28" stroke={GRY} strokeWidth="2" strokeLinecap="round" />
        </symbol>

        {/* ── Nightly Cron / clock ── */}
        <symbol id="ta-clock" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a1000" />
          <circle cx="20" cy="20" r="13" fill="none" stroke={ORG} strokeWidth="2.2" />
          <line x1="20" y1="10" x2="20" y2="20" stroke={ORG} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="20" y1="20" x2="27" y2="25" stroke={ORG} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="20" cy="20" r="2" fill={ORG} />
        </symbol>

        {/* ── Prometheus flame ── */}
        <symbol id="ta-prom" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a0a00" />
          <path d="M20 6C14 12 10 16 10 22c0 5.5 4.5 10 10 10s10-4.5 10-10c0-3-1.5-5.5-3-7-0.5 2-1.5 3-2.5 3C25 14 23 8 20 6Z" fill="#e5531a" />
          <path d="M18 26c0 2 1 3 2 3s2-1 2-3c0-1.5-.8-3-2-4-1.2 1-2 2.5-2 4Z" fill="#fbbf24" />
        </symbol>

        {/* ── Grafana G hexagon ── */}
        <symbol id="ta-grafana" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#130e00" />
          <path d="M20 5 L32 12 L32 28 L20 35 L8 28 L8 12 Z" fill="none" stroke="#f46800" strokeWidth="2" />
          <text x="20" y="24" textAnchor="middle" fontSize="12" fontWeight="800" fontFamily="sans-serif" fill="#f46800">G</text>
        </symbol>

        {/* ── Loki log lines ── */}
        <symbol id="ta-loki" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#130e00" />
          <line x1="9" y1="13" x2="31" y2="13" stroke="#f46800" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="9" y1="20" x2="26" y2="20" stroke="#f46800" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="9" y1="27" x2="20" y2="27" stroke="#f46800" strokeWidth="2.5" strokeLinecap="round" />
        </symbol>

        {/* ── OpenTelemetry circles ── */}
        <symbol id="ta-otel" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#001520" />
          <circle cx="16" cy="20" r="8"  fill="none" stroke="#4fc3f7" strokeWidth="2.2" />
          <circle cx="24" cy="20" r="8"  fill="none" stroke="#4fc3f7" strokeWidth="2.2" opacity="0.7" />
          <circle cx="20" cy="14" r="6"  fill="none" stroke="#4fc3f7" strokeWidth="1.5" opacity="0.4" />
        </symbol>

        {/* ── PagerDuty P ── */}
        <symbol id="ta-pd" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#001a06" />
          <rect x="13" y="8"  width="6" height="26" rx="2" fill="#06ac38" />
          <rect x="13" y="8"  width="14" height="14" rx="4" fill="#06ac38" />
          <rect x="13" y="14" width="14" height="8"  rx="0" fill="#06ac38" />
        </symbol>

        {/* ── Docker whale ── */}
        <symbol id="ta-docker" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#2496ED" />
          <rect x="6"  y="16" width="6" height="5.5" rx="1" fill="white" />
          <rect x="14" y="16" width="6" height="5.5" rx="1" fill="white" />
          <rect x="22" y="16" width="6" height="5.5" rx="1" fill="white" />
          <rect x="14" y="9"  width="6" height="5.5" rx="1" fill="white" />
          <rect x="22" y="9"  width="6" height="5.5" rx="1" fill="white" />
          <path d="M3 23 Q5 21 10 22 L32 22 Q37 22.5 37 26 Q35 31 24 31.5 Q12 32 6 29 Q2 27 3 23Z" fill="white" />
          <path d="M30 19 C32 15.5 35 15 37 17" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </symbol>

        {/* ── Python coil/logo ── */}
        <symbol id="ta-python" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#0c160c" />
          <path d="M20 8C14 8 12 11 12 14v3h8v1H10c-3 0-6 2-6 8s2.5 7 6 7h2v-4c0-3.5 3-6 8-6s8 2.5 8 6v8c0 3-2.5 5-8 5s-8-2-8-5" fill="none" stroke="#4B8BBE" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M20 32C26 32 28 29 28 26v-3h-8v-1h10c3 0 6-2 6-8s-2.5-7-6-7h-2v4c0 3.5-3 6-8 6" fill="none" stroke="#FFD43B" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="16" cy="14" r="1.5" fill="#4B8BBE" />
          <circle cx="24" cy="26" r="1.5" fill="#FFD43B" />
        </symbol>

        {/* ── Kubernetes 7-spoke wheel ── */}
        <symbol id="ta-k8s" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#000f1e" />
          <circle cx="20" cy="20" r="12" fill="none" stroke="#326CE5" strokeWidth="2.2" />
          <circle cx="20" cy="20" r="3.5" fill="#326CE5" />
          {[0,51.4,102.9,154.3,205.7,257.1,308.6].map((deg, i) => {
            const rad = (deg - 90) * Math.PI / 180
            const x1 = 20 + 3.5 * Math.cos(rad), y1 = 20 + 3.5 * Math.sin(rad)
            const x2 = 20 + 12  * Math.cos(rad), y2 = 20 + 12  * Math.sin(rad)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#326CE5" strokeWidth="2" />
          })}
        </symbol>

        {/* ── Shield with checkmark (Trivy / SLSA) ── */}
        <symbol id="ta-shield" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#0a0019" />
          <path d="M20 5 L33 10 L33 22 Q33 31 20 36 Q7 31 7 22 L7 10 Z" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinejoin="round" />
          <polyline points="14,20 18,24 26,15" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>

        {/* ── Helm steering wheel ── */}
        <symbol id="ta-helm" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#000a1f" />
          <circle cx="20" cy="20" r="5" fill="none" stroke="#0f62fe" strokeWidth="2.2" />
          <circle cx="20" cy="20" r="12" fill="none" stroke="#0f62fe" strokeWidth="1.8" />
          {[0,60,120,180,240,300].map((deg, i) => {
            const rad = (deg - 90) * Math.PI / 180
            const ix = 20 + 5 * Math.cos(rad), iy = 20 + 5 * Math.sin(rad)
            const ox = 20 + 12 * Math.cos(rad), oy = 20 + 12 * Math.sin(rad)
            return <g key={i}>
              <line x1={ix} y1={iy} x2={ox} y2={oy} stroke="#0f62fe" strokeWidth="1.8" />
              <circle cx={ox} cy={oy} r="2.5" fill="#0f62fe" />
            </g>
          })}
        </symbol>

        {/* ── Compose stack / layers ── */}
        <symbol id="ta-compose" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#001914" />
          <rect x="8"  y="11" width="24" height="6" rx="2" fill="none" stroke={TEA} strokeWidth="2" />
          <rect x="8"  y="20" width="24" height="6" rx="2" fill="none" stroke={TEA} strokeWidth="2" />
          <rect x="8"  y="29" width="24" height="6" rx="2" fill="none" stroke={TEA} strokeWidth="2" />
        </symbol>

        {/* ── Multi-repo / dependency graph ── */}
        <symbol id="ta-multirepo" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#001914" />
          <circle cx="20" cy="10" r="4" fill="none" stroke={TEA} strokeWidth="2" />
          <circle cx="10" cy="28" r="4" fill="none" stroke={TEA} strokeWidth="2" />
          <circle cx="30" cy="28" r="4" fill="none" stroke={TEA} strokeWidth="2" />
          <line x1="17" y1="13" x2="13" y2="24" stroke={TEA} strokeWidth="1.8" />
          <line x1="23" y1="13" x2="27" y2="24" stroke={TEA} strokeWidth="1.8" />
          <line x1="14" y1="28" x2="26" y2="28" stroke={TEA} strokeWidth="1.8" />
        </symbol>

        {/* ── Check circle (Staging Deploy) ── */}
        <symbol id="ta-check" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#001914" />
          <circle cx="20" cy="20" r="12" fill="none" stroke={TEA} strokeWidth="2.2" />
          <polyline points="13,20 18,25 28,14" fill="none" stroke={TEA} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>

        {/* ── Speedometer (Performance) ── */}
        <symbol id="ta-perf" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a0a00" />
          <path d="M8 28 A14 14 0 0 1 32 28" fill="none" stroke="#fb923c" strokeWidth="2.2" />
          <line x1="20" y1="28" x2="26" y2="17" stroke="#fb923c" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="20" cy="28" r="2.5" fill="#fb923c" />
        </symbol>

        {/* ── Chaos lightning (Chaos/Soak) ── */}
        <symbol id="ta-chaos" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a000d" />
          <path d="M23 5 L13 21 L20 21 L17 35 L28 18 L21 18 Z" fill="#f43f5e" />
        </symbol>

        {/* ── Warning triangle (Chaos/Soak alt) ── */}
        <symbol id="ta-warn" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a000d" />
          <path d="M20 8 L35 32 L5 32 Z" fill="none" stroke="#f43f5e" strokeWidth="2.2" strokeLinejoin="round" />
          <line x1="20" y1="17" x2="20" y2="25" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="20" cy="29" r="1.8" fill="#f43f5e" />
        </symbol>

        {/* ── cosign padlock ── */}
        <symbol id="ta-cosign" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#0d0019" />
          <path d="M13 19 L13 15 A7 7 0 0 1 27 15 L27 19" fill="none" stroke="#c084fc" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="10" y="19" width="20" height="14" rx="3" fill="none" stroke="#c084fc" strokeWidth="2.2" />
          <circle cx="20" cy="26" r="2.5" fill="#c084fc" />
        </symbol>

        {/* ── syft document / SBOM ── */}
        <symbol id="ta-syft" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#001a0f" />
          <path d="M10 5 L26 5 L33 12 L33 35 L10 35 Z" fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M25 5 L25 13 L33 13" fill="none" stroke="#34d399" strokeWidth="1.8" />
          <line x1="15" y1="20" x2="28" y2="20" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
          <line x1="15" y1="25" x2="24" y2="25" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
        </symbol>

        {/* ── ECR container registry ── */}
        <symbol id="ta-ecr" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#0a0a1f" />
          <rect x="8" y="12" width="24" height="16" rx="3" fill="none" stroke={BLU} strokeWidth="2.2" />
          <line x1="8" y1="20" x2="32" y2="20" stroke={BLU} strokeWidth="1.5" opacity="0.5" />
          <circle cx="14" cy="16" r="1.5" fill={BLU} opacity="0.8" />
          <circle cx="14" cy="24" r="1.5" fill={BLU} opacity="0.8" />
          <text x="22" y="18" fontSize="5" fontFamily="monospace" fontWeight="700" fill={BLU}>REG</text>
        </symbol>

        {/* ── CloudFront globe ── */}
        <symbol id="ta-cf" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#000a1f" />
          <circle cx="20" cy="20" r="13" fill="none" stroke={BLU} strokeWidth="2" />
          <ellipse cx="20" cy="20" rx="6" ry="13" fill="none" stroke={BLU} strokeWidth="2" />
          <line x1="7" y1="20" x2="33" y2="20" stroke={BLU} strokeWidth="1.8" />
          <line x1="9" y1="13" x2="31" y2="13" stroke={BLU} strokeWidth="1.2" opacity="0.5" />
          <line x1="9" y1="27" x2="31" y2="27" stroke={BLU} strokeWidth="1.2" opacity="0.5" />
        </symbol>

        {/* ── Multi-arch manifests ── */}
        <symbol id="ta-multiarch" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#000a1f" />
          <path d="M20 8 L32 15 L32 25 L20 32 L8 25 L8 15 Z" fill="none" stroke={BLU} strokeWidth="2" />
          <text x="20" y="23" textAnchor="middle" fontSize="8" fontFamily="monospace" fontWeight="700" fill={BLU}>M</text>
        </symbol>

        {/* ── BuildKit stacked diamonds ── */}
        <symbol id="ta-buildkit" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#00111a" />
          <rect x="14" y="22" width="12" height="12" rx="1" transform="rotate(45 20 28)" fill="none" stroke="#00b4d8" strokeWidth="2" />
          <rect x="14" y="14" width="12" height="12" rx="1" transform="rotate(45 20 20)" fill="none" stroke="#0096b0" strokeWidth="2" />
          <rect x="14" y="6"  width="12" height="12" rx="1" transform="rotate(45 20 12)" fill="none" stroke="#007090" strokeWidth="2" />
        </symbol>

        {/* ── PT Mirror disc (pull-through cache) ── */}
        <symbol id="ta-ptmirror" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a0f00" />
          <circle cx="20" cy="20" r="12" fill="none" stroke={ORG} strokeWidth="2.2" />
          <circle cx="20" cy="20" r="5"  fill="none" stroke={ORG} strokeWidth="2.2" />
          <circle cx="20" cy="20" r="1.5" fill={ORG} />
          <line x1="20" y1="8"  x2="20" y2="15" stroke={ORG} strokeWidth="1.8" />
          <line x1="20" y1="25" x2="20" y2="32" stroke={ORG} strokeWidth="1.8" />
        </symbol>

        {/* ── SLSA L3 attestation ── */}
        <symbol id="ta-slsa" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a0000" />
          <path d="M20 5 L33 10 L33 22 Q33 31 20 36 Q7 31 7 22 L7 10 Z" fill="none" stroke={RED} strokeWidth="2.2" strokeLinejoin="round" />
          <text x="20" y="24" textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="700" fill={RED}>L3</text>
        </symbol>

        {/* ── Dependabot robot ── */}
        <symbol id="ta-bot" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#00061a" />
          <rect x="10" y="16" width="20" height="16" rx="4" fill="none" stroke="#58a6ff" strokeWidth="2.2" />
          <circle cx="15" cy="23" r="2.5" fill="#58a6ff" />
          <circle cx="25" cy="23" r="2.5" fill="#58a6ff" />
          <line x1="15" y1="27" x2="25" y2="27" stroke="#58a6ff" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="20" y1="16" x2="20" y2="11" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="20" cy="9" r="2" fill="#58a6ff" />
        </symbol>

        {/* ── OCI artifact / package ── */}
        <symbol id="ta-artifact" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#001914" />
          <rect x="8" y="16" width="24" height="18" rx="2" fill="none" stroke={TEA} strokeWidth="2" />
          <path d="M8 20 L32 20" stroke={TEA} strokeWidth="1.5" opacity="0.5" />
          <rect x="15" y="8" width="10" height="10" rx="2" fill="none" stroke={TEA} strokeWidth="2" />
          <line x1="20" y1="18" x2="20" y2="20" stroke={TEA} strokeWidth="2" />
        </symbol>

        {/* ── Isaac ROS / ROS 2 node graph ── */}
        <symbol id="ta-ros2" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a0019" />
          <circle cx="20" cy="20" r="6" fill="none" stroke={FUS} strokeWidth="2.2" />
          {[0,60,120,180,240,300].map((deg, i) => {
            const rad = (deg - 90) * Math.PI / 180
            const x = 20 + 13 * Math.cos(rad), y = 20 + 13 * Math.sin(rad)
            return <g key={i}>
              <circle cx={x} cy={y} r="2.5" fill={FUS} opacity="0.7" />
              <line x1={20 + 6 * Math.cos(rad)} y1={20 + 6 * Math.sin(rad)} x2={x} y2={y} stroke={FUS} strokeWidth="1.5" opacity="0.5" />
            </g>
          })}
        </symbol>

        {/* ── Full Regression / Kubernetes wheel ── */}
        <symbol id="ta-fullreg" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a0019" />
          <circle cx="20" cy="20" r="12" fill="none" stroke={FUS} strokeWidth="2" />
          <circle cx="20" cy="20" r="3.5" fill={FUS} />
          {[0,51.4,102.9,154.3,205.7,257.1,308.6].map((deg, i) => {
            const rad = (deg - 90) * Math.PI / 180
            const x1 = 20 + 3.5 * Math.cos(rad), y1 = 20 + 3.5 * Math.sin(rad)
            const x2 = 20 + 12  * Math.cos(rad), y2 = 20 + 12  * Math.sin(rad)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={FUS} strokeWidth="2" />
          })}
        </symbol>

        {/* ── SLURM workload scheduler ── */}
        <symbol id="ta-slurm" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#0a1a00" />
          <rect x="7"  y="9"  width="26" height="5" rx="1.5" fill={GPU} opacity="0.9" />
          <rect x="7"  y="18" width="20" height="5" rx="1.5" fill={GPU} opacity="0.65" />
          <rect x="7"  y="27" width="14" height="5" rx="1.5" fill={GPU} opacity="0.4" />
          <path d="M30 20 L35 20 L32 16 M35 20 L32 24" fill="none" stroke={GPU} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>

        {/* ── Slinky (SLURM K8s operator) ── */}
        <symbol id="ta-slinky" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#0a1a00" />
          <circle cx="20" cy="20" r="10" fill="none" stroke={GPU} strokeWidth="2" />
          <circle cx="20" cy="20" r="4"  fill={GPU} />
          {[0, 60, 120, 180, 240, 300].map((deg, i) => {
            const rad = (deg - 90) * Math.PI / 180
            const x1 = 20 + 4  * Math.cos(rad), y1 = 20 + 4  * Math.sin(rad)
            const x2 = 20 + 10 * Math.cos(rad), y2 = 20 + 10 * Math.sin(rad)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GPU} strokeWidth="1.8" />
          })}
        </symbol>

        {/* ── MIG multi-instance GPU ── */}
        <symbol id="ta-mig" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#0a1a00" />
          <rect x="5"  y="12" width="30" height="16" rx="3" fill="none" stroke={GPU} strokeWidth="2" />
          <line x1="15" y1="12" x2="15" y2="28" stroke={GPU} strokeWidth="1.5" />
          <line x1="25" y1="12" x2="25" y2="28" stroke={GPU} strokeWidth="1.5" />
          <text x="10" y="23" textAnchor="middle" fontSize="5" fontFamily="monospace" fontWeight="700" fill={GPU}>M1</text>
          <text x="20" y="23" textAnchor="middle" fontSize="5" fontFamily="monospace" fontWeight="700" fill={GPU}>M2</text>
          <text x="30" y="23" textAnchor="middle" fontSize="5" fontFamily="monospace" fontWeight="700" fill={GPU}>M3</text>
          <rect x="5"  y="31" width="30" height="4" rx="1.5" fill={GPU} opacity="0.35" />
        </symbol>

        {/* ── Multistage Dockerfile (Build Cache) ── */}
        <symbol id="ta-multistage" viewBox="0 0 40 40">
          <rect width="40" height="40" rx="8" fill="#1a0f00" />
          <path d="M10 5 L22 5 L30 13 L30 35 L10 35 Z" fill="none" stroke={ORG} strokeWidth="2" strokeLinejoin="round" />
          <path d="M21 5 L21 14 L30 14" fill="none" stroke={ORG} strokeWidth="1.5" />
          <text x="20" y="26" textAnchor="middle" fontSize="6" fontFamily="monospace" fontWeight="700" fill={ORG}>MULTI</text>
        </symbol>
      </defs>

      {/* ══════════════════════════════════════════════════════════════
          BAND A — Source & Triggers (left) + Observability Layer (right)
      ══════════════════════════════════════════════════════════════ */}

      {/* Source & Triggers box */}
      <rect x={0} y={0} width={SRC_W} height={A_H} rx="8"
        fill="#0e0904" stroke={AMB} strokeOpacity="0.7" strokeWidth="1" />
      <use href="#ta-gh" x="6" y="6" width="18" height="18" />
      <text x="30" y="18" fill={AMB} fontSize="8.5" fontWeight="700" letterSpacing="1.5" fontFamily="monospace">SOURCE &amp; TRIGGERS</text>

      {([
        { id: '#ta-gh',      label: 'GitHub',       sub: 'Monorepo + PRs'  },
        { id: '#ta-webhook', label: 'PR Webhook',    sub: 'Actions Trigger' },
        { id: '#ta-clock',   label: 'Nightly Cron',  sub: 'Scheduled'       },
      ] as const).map((t, i) => {
        const cx = 50 + i * 83
        return (
          <g key={t.label}>
            <use href={t.id} x={cx - 16} y={22} width="32" height="32" />
            <text x={cx} y={66} textAnchor="middle" fill="#e5e7eb" fontSize="8.5" fontWeight="600" fontFamily="sans-serif">{t.label}</text>
            <text x={cx} y={78} textAnchor="middle" fill={DIM} fontSize="7" fontFamily="monospace">{t.sub}</text>
          </g>
        )
      })}

      {/* Observability Layer box */}
      <rect x={OBS_X} y={0} width={OBS_W} height={A_H} rx="8"
        fill="#060810" stroke={OBS_BLU} strokeOpacity="0.55" strokeWidth="1" />
      <text x={OBS_X + 10} y="18" fill={OBS_BLU} fontSize="8.5" fontWeight="700" letterSpacing="1.5" fontFamily="monospace">OBSERVABILITY LAYER</text>

      {([
        { id: '#ta-prom',    label: 'Prometheus',   sub: 'Metrics + Alerts'   },
        { id: '#ta-grafana', label: 'Grafana',       sub: 'Dashboards + SLOs'  },
        { id: '#ta-loki',    label: 'Loki',          sub: 'Log Aggregation'    },
        { id: '#ta-otel',    label: 'OpenTelemetry', sub: 'Traces + Spans'     },
        { id: '#ta-pd',      label: 'PagerDuty',     sub: 'On-call Routing'    },
      ] as const).map((t, i) => {
        const cx = OBS_X + 80 + i * 162
        return (
          <g key={t.label}>
            <use href={t.id} x={cx - 18} y={18} width="36" height="36" />
            <text x={cx} y={66} textAnchor="middle" fill="#e5e7eb" fontSize="8.5" fontWeight="600" fontFamily="sans-serif">{t.label}</text>
            <text x={cx} y={78} textAnchor="middle" fill={DIM} fontSize="7" fontFamily="monospace">{t.sub}</text>
          </g>
        )
      })}

      {/* Band A ↔ Band B: perfectly vertical arrows through the 24px gap */}
      {/* trigger: Pre-merge column x, down from Sources bottom to K8s top */}
      <line x1={COL_XS[0] + COL_W / 2} y1={A_H}
            x2={COL_XS[0] + COL_W / 2} y2={B_Y}
        stroke={AMB} strokeWidth="1" strokeOpacity="0.7" markerEnd="url(#ta-org)" />
      {/* pod telemetry: up from K8s top to Observability bottom (dashed blue) */}
      <line x1={OBS_X + 600} y1={B_Y}
            x2={OBS_X + 600} y2={A_H}
        stroke={BLU} strokeWidth="1" strokeOpacity="0.7" strokeDasharray="5 3" markerEnd="url(#ta-obs)" />
      {/* alerts: up to PagerDuty area (dashed amber) */}
      <line x1={OBS_X + OBS_W - 42} y1={B_Y}
            x2={OBS_X + OBS_W - 42} y2={A_H}
        stroke={AMB} strokeWidth="1" strokeOpacity="0.7" strokeDasharray="5 3" markerEnd="url(#ta-org)" />

      {/* ══════════════════════════════════════════════════════════════
          BAND B — K8s Runner Cluster (ARC) — Dev Environment
      ══════════════════════════════════════════════════════════════ */}
      <rect x={0} y={B_Y} width={W} height={B_H} rx="8"
        fill="#04090a" stroke={GRN} strokeOpacity="0.55" strokeWidth="1" />
      <use href="#ta-k8s" x="8" y={B_Y + 6} width="24" height="24" />
      <text x="38" y={B_Y + 22} fill={GRN} fontSize="9" fontWeight="700" letterSpacing="1.5" fontFamily="monospace">K8s Runner Cluster (ARC)</text>

      {/* Stage columns */}
      {([
        {
          label: 'Pre-merge', clr: GRN, fill: '#091a07', arrowMark: 'url(#ta-col-grn)',
          items: [
            { id: '#ta-gh',      name: 'GitHub PR',   sub: 'Event Trigger'   },
            { id: '#ta-python',  name: 'ruff + mypy', sub: 'Lint + Types'    },
            { id: '#ta-python',  name: 'pytest',       sub: 'Unit + Coverage' },
            { id: '#ta-shield',  name: 'Trivy Scan',  sub: 'SAST + Deps'    },
          ],
        },
        {
          label: 'Build', clr: GRN, fill: '#091a07', arrowMark: 'url(#ta-col-grn)',
          items: [
            { id: '#ta-docker',    name: 'Docker Buildx',    sub: 'ARM64 · x86_64 · C++' },
            { id: '#ta-docker',    name: 'Container Image', sub: 'Multi-arch Build'      },
            { id: '#ta-buildkit',  name: 'BuildKit',          sub: 'Layer Cache'           },
            { id: '#ta-syft',      name: 'Artifact',          sub: 'OCI Image'             },
          ],
        },
        {
          label: 'Integration (Staging)', clr: GRN, fill: '#091a07', arrowMark: 'url(#ta-col-grn)',
          items: [
            { id: '#ta-compose',    name: 'Compose Stack',  sub: 'Service Up'       },
            { id: '#ta-multirepo',  name: 'Multi-repo',     sub: 'Dependency Graph' },
            { id: '#ta-python',     name: 'Smoke Tests',    sub: 'e2e tests'        },
            { id: '#ta-check',      name: 'Staging Deploy', sub: 'Helm + Argo'      },
          ],
        },
        {
          label: 'Nightly', clr: GRN, fill: '#091a07', arrowMark: 'url(#ta-col-grn)',
          items: [
            { id: '#ta-fullreg', name: 'Full Regression', sub: 'Suite'        },
            { id: '#ta-ros2',    name: 'Integration',      sub: 'Benchmark'},
            { id: '#ta-perf',    name: 'Performance',      sub: 'Benchmarks'  },
            { id: '#ta-chaos',   name: 'Chaos / Soak',     sub: 'Stability'   },
          ],
        },
        {
          label: 'Release (Prod)', clr: GRN, fill: '#091a07', arrowMark: 'url(#ta-col-grn)',
          items: [
            { id: '#ta-cosign',  name: 'cosign',     sub: 'Keyless Signing'  },
            { id: '#ta-syft',    name: 'syft',        sub: 'SBOM Generation' },
            { id: '#ta-ecr',     name: 'Registry Push', sub: 'GHCR + Registry' },
            { id: '#ta-cf',      name: 'CloudFront',  sub: 'Prod CDN'        },
          ],
        },
      ] as const).map((stage, si) => {
        const cx = COL_XS[si]
        return (
          <g key={stage.label}>
            {/* Column frame */}
            <rect x={cx} y={COL_Y} width={COL_W} height={COL_H} rx="6"
              fill="#06100a" stroke={stage.clr} strokeOpacity="0.45" strokeWidth="0.8" />
            {/* Column header label */}
            <rect x={cx + 4} y={COL_Y + 4} width={COL_W - 8} height={22} rx="4"
              fill={stage.clr + '14'} stroke={stage.clr + '55'} strokeWidth="0.8" />
            <text x={cx + COL_W / 2} y={COL_Y + 19} textAnchor="middle"
              fill={stage.clr} fontSize="9.5" fontWeight="700" fontFamily="sans-serif">{stage.label}</text>

            {/* Tool items — 2 × 2 grid */}
            {stage.items.map((item, ii) => {
              const row = Math.floor(ii / 2)
              const col = ii % 2
              const icx = cx + (col === 0 ? Math.round(COL_W / 4) : Math.round(3 * COL_W / 4))
              const iy  = ITEM_Y0 + row * ROW_H
              return (
                <g key={item.name + ii}>
                  <use href={item.id} x={icx - ICON_SIZE / 2} y={iy} width={ICON_SIZE} height={ICON_SIZE} />
                  <text x={icx} y={iy + ICON_SIZE + 9} textAnchor="middle"
                    fill="#e5e7eb" fontSize="8" fontWeight="600" fontFamily="sans-serif">{item.name}</text>
                  <text x={icx} y={iy + ICON_SIZE + 20} textAnchor="middle"
                    fill={DIM} fontSize="7" fontFamily="monospace">{item.sub}</text>
                </g>
              )
            })}
            {/* Row 0: [0] →→ [1] */}
            <line
              x1={cx + Math.round(COL_W / 4) + ICON_SIZE / 2 + 2}
              y1={ITEM_Y0 + ICON_SIZE / 2}
              x2={cx + Math.round(3 * COL_W / 4) - ICON_SIZE / 2 - 7}
              y2={ITEM_Y0 + ICON_SIZE / 2}
              stroke={stage.clr} strokeWidth="0.8" strokeOpacity="0.5" markerEnd={stage.arrowMark} />
            {/* [1] → [2]: Z-path — down from right cell, left, down into left cell */}
            <path
              d={`M ${cx + Math.round(3 * COL_W / 4)} ${ITEM_Y0 + ICON_SIZE + 23}
                  L ${cx + Math.round(3 * COL_W / 4)} ${ITEM_Y0 + ROW_H - 22}
                  L ${cx + Math.round(COL_W / 4)}     ${ITEM_Y0 + ROW_H - 22}
                  L ${cx + Math.round(COL_W / 4)}     ${ITEM_Y0 + ROW_H - 2}`}
              fill="none" stroke={stage.clr} strokeWidth="0.8" strokeOpacity="0.5"
              markerEnd={stage.arrowMark} />
            {/* Row 1: [2] →→ [3] */}
            <line
              x1={cx + Math.round(COL_W / 4) + ICON_SIZE / 2 + 2}
              y1={ITEM_Y0 + ROW_H + ICON_SIZE / 2}
              x2={cx + Math.round(3 * COL_W / 4) - ICON_SIZE / 2 - 7}
              y2={ITEM_Y0 + ROW_H + ICON_SIZE / 2}
              stroke={stage.clr} strokeWidth="0.8" strokeOpacity="0.5" markerEnd={stage.arrowMark} />
          </g>
        )
      })}

      {/* Inter-column flow indicators — chevron + label above the gap */}
      {([
        { lbl: 'PR merged',   clr: GRN },
        { lbl: 'image built', clr: GRN },
        { lbl: 'smoke pass',  clr: GRN },
        { lbl: 'suite pass',  clr: GRN },
      ] as const).map(({ lbl, clr }, i) => {
        const gx = COL_XS[i] + COL_W + Math.floor(COL_GAP / 2)
        const ty = COL_Y - 14  // just above the column cards, inside K8s frame header band
        return (
          <g key={lbl}>
            <text x={gx} y={ty} textAnchor="middle"
              fill={clr} fontSize="7" fontWeight="600" fontFamily="monospace" opacity="0.9">{lbl}</text>
            <line x1={gx} y1={ty + 2} x2={gx} y2={COL_Y}
              stroke={clr} strokeWidth="1" strokeOpacity="0.35" />
          </g>
        )
      })}

      {/* ══════════════════════════════════════════════════════════════
          BAND C — Three infrastructure boxes below K8s cluster
      ══════════════════════════════════════════════════════════════ */}

      {/* Band C → Band B: perfectly vertical arrows from each box center straight up */}
      {(() => {
        const bBotY = B_Y + B_H
        return <>
          {/* Build Cache → K8s (vertical at box center x) */}
          <line x1={C_XS[0] + C_BOX_W / 2} y1={C_Y}
                x2={C_XS[0] + C_BOX_W / 2} y2={bBotY}
            stroke={AMB} strokeWidth="1" strokeOpacity="0.7" markerEnd="url(#ta-org)" />
          {/* Security Gate → K8s */}
          <line x1={C_XS[1] + C_BOX_W / 2} y1={C_Y}
                x2={C_XS[1] + C_BOX_W / 2} y2={bBotY}
            stroke={AMB} strokeWidth="1" strokeOpacity="0.7" markerEnd="url(#ta-org)" />
          {/* ECR + CDN → K8s */}
          <line x1={C_XS[2] + C_BOX_W / 2} y1={C_Y}
                x2={C_XS[2] + C_BOX_W / 2} y2={bBotY}
            stroke={BLU} strokeWidth="1" strokeOpacity="0.7" markerEnd="url(#ta-blu)" />
        </>
      })()}

      {/* Build Cache + Image Scaling (orange) */}
      <rect x={C_XS[0]} y={C_Y} width={C_BOX_W} height={C_H} rx="8"
        fill="#0e0904" stroke={ORG} strokeOpacity="0.55" strokeWidth="1" />
      <text x={C_XS[0] + 8} y={C_Y + 13} fill={ORG} fontSize="7" fontWeight="700" letterSpacing="1.2" fontFamily="monospace">BUILD CACHE + IMAGE SCALING</text>
      <text x={C_XS[0] + 8} y={C_Y + 23} fill={ORG} fontSize="6.5" fontFamily="monospace" opacity="0.65">↑ layer cache → Build column</text>
      {([
        { id: '#ta-multistage', label: 'Multi-stage',  sub: 'Dockerfile'      },
        { id: '#ta-buildkit',   label: 'Buildx Cache', sub: 'Layer Dedup'     },
        { id: '#ta-ptmirror',   label: 'PT Mirror',     sub: 'ARM64 + x86' },
      ] as const).map((item, i) => {
        const cx = C_XS[0] + 42 + i * 97
        return (
          <g key={item.label}>
            <use href={item.id} x={cx - 16} y={C_Y + 27} width="32" height="32" />
            <text x={cx} y={C_Y + 71} textAnchor="middle" fill="#e5e7eb" fontSize="8.5" fontWeight="600" fontFamily="sans-serif">{item.label}</text>
            <text x={cx} y={C_Y + 82} textAnchor="middle" fill={DIM} fontSize="7" fontFamily="monospace">{item.sub}</text>
          </g>
        )
      })}

      {/* Security Gate (red) */}
      <rect x={C_XS[1]} y={C_Y} width={C_BOX_W} height={C_H} rx="8"
        fill="#0e0904" stroke={RED} strokeOpacity="0.55" strokeWidth="1" />
      <text x={C_XS[1] + 8} y={C_Y + 13} fill={RED} fontSize="7" fontWeight="700" letterSpacing="1.2" fontFamily="monospace">SECURITY GATE</text>
      <text x={C_XS[1] + 8} y={C_Y + 23} fill={RED} fontSize="6.5" fontFamily="monospace" opacity="0.65">↑ sign + SBOM → Release column</text>
      {([
        { id: '#ta-slsa',   label: 'SLSA L3',    sub: 'Attestation'   },
        { id: '#ta-cosign', label: 'cosign',      sub: 'Image Signing' },
        { id: '#ta-bot',    label: 'Dependabot',  sub: 'SHA-pinned'    },
        { id: '#ta-syft',   label: 'SBOM',        sub: 'Every Release' },
      ] as const).map((item, i) => {
        const cx = C_XS[1] + 36 + i * 72
        return (
          <g key={item.label}>
            <use href={item.id} x={cx - 16} y={C_Y + 27} width="32" height="32" />
            <text x={cx} y={C_Y + 71} textAnchor="middle" fill="#e5e7eb" fontSize="8.5" fontWeight="600" fontFamily="sans-serif">{item.label}</text>
            <text x={cx} y={C_Y + 82} textAnchor="middle" fill={DIM} fontSize="7" fontFamily="monospace">{item.sub}</text>
          </g>
        )
      })}

      {/* ECR + CDN Distribution (blue) */}
      <rect x={C_XS[2]} y={C_Y} width={C_BOX_W} height={C_H} rx="8"
        fill="#060810" stroke={BLU} strokeOpacity="0.55" strokeWidth="1" />
      <text x={C_XS[2] + 8} y={C_Y + 13} fill={BLU} fontSize="7" fontWeight="700" letterSpacing="1.2" fontFamily="monospace">REGISTRY + CDN DISTRIBUTION</text>
      <text x={C_XS[2] + 8} y={C_Y + 23} fill={BLU} fontSize="6.5" fontFamily="monospace" opacity="0.65">↑ push + distribute → Release column</text>
      {([
        { id: '#ta-ecr',       label: 'Registry Cache', sub: 'multi-region'          },
        { id: '#ta-cf',        label: 'CloudFront',     sub: 'Global CDN'             },
        { id: '#ta-multiarch', label: 'Multi-arch',     sub: 'Manifests'              },
      ] as const).map((item, i) => {
        const cx = C_XS[2] + 42 + i * 97
        return (
          <g key={item.label}>
            <use href={item.id} x={cx - 16} y={C_Y + 27} width="32" height="32" />
            <text x={cx} y={C_Y + 71} textAnchor="middle" fill="#e5e7eb" fontSize="8.5" fontWeight="600" fontFamily="sans-serif">{item.label}</text>
            <text x={cx} y={C_Y + 82} textAnchor="middle" fill={DIM} fontSize="7" fontFamily="monospace">{item.sub}</text>
          </g>
        )
      })}

      {/* Compute / runner autoscaling */}
      <rect x={C_XS[3]} y={C_Y} width={C_BOX_W} height={C_H} rx="8"
        fill="#06100a" stroke={GPU} strokeOpacity="0.55" strokeWidth="1" />
      <text x={C_XS[3] + 8} y={C_Y + 13} fill={GPU} fontSize="7" fontWeight="700" letterSpacing="1.2" fontFamily="monospace">COMPUTE · RUNNERS</text>
      <text x={C_XS[3] + 8} y={C_Y + 23} fill={GPU} fontSize="6.5" fontFamily="monospace" opacity="0.65">Autoscaling · GPU · spot fallback</text>
      {([
        { id: '#ta-slurm',  label: 'Autoscale', sub: 'Runner pool'    },
        { id: '#ta-slinky', label: 'K8s Ops',   sub: 'Operator'       },
        { id: '#ta-mig',    label: 'Spot',      sub: 'Cost fallback'  },
      ] as const).map((item, i) => {
        const cx = C_XS[3] + 42 + i * 97
        return (
          <g key={item.label}>
            <use href={item.id} x={cx - 16} y={C_Y + 27} width="32" height="32" />
            <text x={cx} y={C_Y + 71} textAnchor="middle" fill="#e5e7eb" fontSize="8.5" fontWeight="600" fontFamily="sans-serif">{item.label}</text>
            <text x={cx} y={C_Y + 82} textAnchor="middle" fill={DIM} fontSize="7" fontFamily="monospace">{item.sub}</text>
          </g>
        )
      })}

      {/* ══════════════════════════════════════════════════════════════
          LEGEND
      ══════════════════════════════════════════════════════════════ */}
      <rect x={0} y={LEG_Y} width={W} height={30} rx="6"
        fill="#080a0d" stroke="#1f2937" strokeWidth="1" />
      <text x="16" y={LEG_Y + 11} fill="#4b5563" fontSize="8" fontWeight="700" fontFamily="monospace">LEGEND</text>
      {([
        { clr: GRN, dash: false, label: 'Pipeline compute (K8s / GPU)'  },
        { clr: BLU, dash: true,  label: 'Observability + distribution'  },
        { clr: AMB, dash: false, label: 'Build infra + security'        },
      ] as const).map((leg, i) => {
        const lx = 120 + i * 360
        return (
          <g key={leg.label}>
            <rect x={lx} y={LEG_Y + 8} width={22} height={8} rx="2"
              fill={leg.clr + '25'} stroke={leg.clr} strokeWidth="1.2"
              strokeDasharray={leg.dash ? '4 2' : undefined} />
            <text x={lx + 28} y={LEG_Y + 18} fill="#6b7280" fontSize="7.5" fontFamily="monospace">{leg.label}</text>
          </g>
        )
      })}

    </svg>
  )
}
