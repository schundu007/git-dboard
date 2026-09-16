# GitPulse — DESIGN.md

register: product

The design system of record for gitpulse. When a page and this document disagree,
this document wins. Its job is consistency: one button, one badge, one table, one
set of tokens, everywhere. Density is a feature; every element earns its place.

## Register & scene

A dense DevOps command surface for infra/ML engineers who keep it open 8+ hours a
day and glance at status between other work. Default theme is **dark** (operators
in dim rooms watching live CI); a **light** theme exists and every token must work
in both. Not a marketing surface. No onboarding UX, no hand-holding copy.

## Color

Strategy: **Restrained.** Tinted-neutral surfaces (zinc ramp) + a single brand
accent used sparingly, plus three semantic status hues. Never `#000` / `#fff` as
literals in components; use the tokens.

Dark (default), from `index.css` `:root`:
- `--color-bg #09090b` · `surface-1 #18181b` · `surface-2 #27272a` · `surface-3 ~#343438`
- `--color-border #3f3f46` · text `#fafafa` · muted `#a1a1aa`

Accent & semantic (Tailwind tokens):
- `brand` / `accent-green` `#76b900` — success, active, live, confirmed. The only
  decorative-eligible accent, and it must stay ≤10% of any view.
- `accent-blue #0a66c2` — info, links, secondary. `accent-red #b24020` — error /
  critical. `accent-yellow #d97706` — warning / queued / caution only.

Rules:
- Status is **color + icon + text** (triple redundancy). Never color alone — no
  bare colored dot, no width-only bar, without an adjacent label or `aria-label`.
- One green. Do not introduce `emerald-*`, `lime`, `#84cc16`; they alias to brand
  and only create drift. Same for using raw `blue-500`/`red-500` where an
  `accent-*` token exists.
- Light theme is token-driven in `index.css` under `[data-theme="light"]`. New
  components should read `surface-*` / `border` / `accent-*`; avoid hardcoded hex
  so light mode needs no new `!important` override.

## Typography

- Sans/display: **Plus Jakarta Sans**. Mono: **JetBrains Mono** (metrics, IDs,
  code, timestamps — always with `tabular-nums`). These are the only two families;
  `tailwind.config` `fontFamily` must name them (it previously named unloaded
  fonts — do not regress).
- Body 15px / line-height 1.55. Headings via the global `h1–h6` scale in
  `index.css`; aim for ≥1.25 ratio between adjacent levels.
- Type **scale**, not arbitrary px. Target steps: 11 / 12 / 13 / 15 / 17 / 21.
  New code should use these; the sea of `text-[9.5px]`/`text-[10.5px]` arbitrary
  sizes is legacy debt being retired (a temporary `!important` lift in `index.css`
  floors sub-12px sizes for legibility — do not add a second such block).
- No ALL-CAPS + wide tracking except deliberate section labels / status badges.

## Layout, spacing, shape

- Page shell: fixed sidebar + sticky **solid** header (no glass/backdrop-blur) +
  right rail. Content max width is generous; density over whitespace.
- Vary spacing for rhythm; don't pad everything identically. Standard card body
  inset is `p-3.5`; sections separate with `space-y-5`, not manual dividers.
- **Shape:** rectangles are sharp (1px). **Circular/pill elements stay round** —
  status dots, spinners, avatars, badges, progress-bar ends use `rounded-full`.
  (A global rule in `index.css` enforces both; don't reintroduce squared circles.)
- Cards are not the default answer. Prefer dense tables and hairline-divided stat
  strips over boxed metric-card grids. Never nest cards.

## Motion

- Short, ease-out (`cubic-bezier(0.16,1,0.3,1)` / expo). Buttons `active:scale-0.98`.
  Respect `prefers-reduced-motion` (already wired globally).
- No bounce/elastic, no count-up animated KPIs, no infinite pulsing glows.

## Component vocabulary (single source)

Use the primitives in `src/components/ui/` and the shared status components. Do not
re-invent these inline per page:
- **Button** (`ui/Button`) for every action. (Adoption in progress: many raw
  `<button className="bg-brand…">` remain and must migrate.)
- **Badge** / **StatusBadge** for every status / severity pill. One geometry, one
  tone API. No ad-hoc `bg-x/[.07] ring-1 ring-x/25` pills.
- **Card** for panels; one radius + border convention.
- **TabBar** (`ui/TabBar`) for tab groups — flat, solid, no gradient/glow.
- **PageHeader** (to be extracted): icon + `text-lg` title + optional context pill
  + right-aligned actions. Every page needs a title; several currently lack one.
- **chartTheme** (to be extracted): one Recharts tooltip/grid/series token set,
  theme-aware. No white tooltips on dark; no per-page palettes.

## Absolute bans (match-and-refuse)

- Colored side-stripe borders (`border-l/r` >1px as accent). Use a badge/dot/tint.
- Gradient text (`bg-clip-text`), decorative gradient surfaces.
- Glassmorphism / `backdrop-blur` as chrome (functional modal scrims excepted).
- Decorative glow shadows (the `glow-*` tokens were removed; keep them gone).
- The hero-metric template (giant colored number + label + supporting stats).
- Identical repeated icon+heading+text card grids.
- Emoji as UI/status (use lucide glyphs). Em dashes in copy (use `.`/`:`/`(`).
- Modal as first thought; pure-white/pure-black literals.

## Known debt / roadmap (tracked, being worked)

Consolidation, not redesign. In priority order:
1. Adopt `<Button>` app-wide (0 uses vs ~241 raw buttons — largest consistency win).
2. One `StatusBadge`/`Chip` and one `Stat`/`MetricCell`; delete per-page reinvented
   `StatusDot`/`RatingBadge`/`PriorityBadge`/`KpiTile`/`StatCard` variants.
3. Extract `PageHeader` + `chartTheme`; apply to all pages.
4. Single nav source (`nav.ts`) feeding Sidebar + CommandPalette + Header ROUTE_META
   (palette currently can't reach ~6 real routes; labels drift; `startsWith`
   active-match double-highlights).
5. De-duplicate copy-pasted modules: Issues/Branches (IssueHub≡BranchMonitor),
   Registry (ImageTags≡RegistryManager), Logs (ErrorMonitor≡LogMonitor), nightly
   matrix (BuildPipeline≡NightlyMonitor).
6. Retire arbitrary `text-[Npx]` sizes onto the type scale; then delete the
   `!important` size-lift block.
7. A11y: `focus-visible` ring on every control; `aria-label` on icon-only buttons
   and unlabeled inputs; real `<button>`/`role` + Escape/focus-trap on clickable
   rows and modal overlays; virtualize the 2,000-row log tables; route the
   hardcoded `localhost:8000` in ErrorMonitor through the configured API base.
