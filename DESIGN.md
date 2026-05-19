---
name: GitPulse DevOps Dashboard
description: Self-hosted CI/CD intelligence for GitHub-backed pipelines.
colors:
  pipeline-green: "#76b900"
  signal-blue: "#0a66c2"
  incident-red: "#b24020"
  amber-warn: "#d97706"
  void: "#09090b"
  console-dark: "#18181b"
  panel-mid: "#27272a"
  instrument-rim: "#3f3f46"
  readout-white: "#fafafa"
  secondary-readout: "#a1a1aa"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, Inter, -apple-system, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, Inter, -apple-system, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Plus Jakarta Sans, Inter, -apple-system, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Plus Jakarta Sans, Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.06em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, Cascadia Code, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sharp: "2px"
  element: "3px"
  overlay: "4px"
  floating: "10px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.pipeline-green}"
    textColor: "#0f1a00"
    rounded: "{rounded.sharp}"
    padding: "7px 12px"
  button-primary-hover:
    backgroundColor: "#82cf00"
  button-secondary:
    backgroundColor: "{colors.panel-mid}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.sharp}"
    padding: "7px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.secondary-readout}"
    rounded: "{rounded.sharp}"
    padding: "7px 12px"
  button-danger:
    backgroundColor: "rgba(178,64,32,0.08)"
    textColor: "#f87171"
    rounded: "{rounded.sharp}"
    padding: "7px 12px"
  card-default:
    backgroundColor: "{colors.console-dark}"
    rounded: "{rounded.element}"
    padding: "{spacing.md}"
  card-inset:
    backgroundColor: "{colors.panel-mid}"
    rounded: "{rounded.sharp}"
    padding: "{spacing.md}"
---

# Design System: GitPulse

## 1. Overview

**Creative North Star: "The Instrument Panel"**

GitPulse's visual language is built on one principle: every pixel is paid rent by the information it carries. The system draws from physical instrument panels, not from web software convention. Controls are where you expect them. Readouts are legible at a glance. Color is a signal, not a decoration.

The density is intentional. DevOps engineers read data tables for a living; they triage failures at 2am under pressure; they need to scan and dismiss, not be guided through flows. The UI trusts the user to be competent and returns that trust with information, not reassurance.

The sharp-edged aesthetic enforces authority. All UI surfaces use 2-3px corner radii, reflecting a deliberate technical-document aesthetic: the precision of a hardware specification sheet, not a consumer app. Floating overlays (command palette, tooltips) retain enough rounding to signal elevation without softening the underlying instrument character.

**Key Characteristics:**
- Near-zero border-radius on all interactive surfaces (2-3px globally overridden)
- Tonal surface layering as the primary depth mechanism; decorative shadows are prohibited
- Pipeline Green is the sole accent; it appears only on live states, confirmations, and primary actions
- Monospace type for all data values, IDs, hashes, paths, and machine-readable content
- Status always carries dual indicators (dot plus label) independent of color

## 2. Colors: The Instrument Palette

A restrained void-black palette where color is reserved for status, not structure. Nine surface tones, one accent, three functional signals.

### Primary
- **Pipeline Green** (#76b900): The go signal. Used for live/active states (pulsing status dots, running CI), primary action buttons, active navigation states, confirmed/success outcomes, and the brand mark. Its rarity is the point; Pipeline Green appearing on screen means something is either live or confirmed good.

### Secondary
- **Signal Blue** (#0a66c2): Informational telemetry. Info badges, hyperlinks, the deployment-frequency DORA metric, and secondary data-role coloring in charts. Never competes with Pipeline Green for urgency; blue is information, green is action.

### Tertiary
- **Incident Red** (#b24020): Alert state only. Failures, danger button variants, error rates, change-failure-rate metrics. It finds you before you find it.
- **Amber Warning** (#d97706): Pre-failure states. Queued runs, warning thresholds, time-elapsed caution indicators, amber-600 grade severity.

### Neutral
- **Void** (#09090b): The deepest surface. Page background.
- **Console Dark** (#18181b): Primary card and sidebar surface. Sits on Void.
- **Panel Mid** (#27272a): Secondary surfaces, form inputs, inset containers. Sits on Console Dark.
- **Instrument Rim** (#3f3f46): Borders, dividers, structural outlines via `ring-border`.
- **Readout White** (#fafafa): Primary text on dark surfaces. Not pure white; slightly off to ease sustained reading.
- **Secondary Readout** (#a1a1aa): Labels, timestamps, supplementary metadata, muted text.

### Named Rules
**The One Voice Rule.** Pipeline Green appears on at most 10% of any given screen. It marks live activity, pipeline confirmations, and primary actions. Using it decoratively, as a brand flourish, or as a structural color destroys its signal value.

**The Red Finds You Rule.** Incident Red is never used for branding, decoration, or information. It appears only when a failure state demands attention. If red is present on screen, something is broken.

## 3. Typography

**Display/Body Font:** Plus Jakarta Sans (fallback: Inter, -apple-system, sans-serif)
**Monospace Font:** JetBrains Mono (fallback: Fira Code, Cascadia Code, ui-monospace)

**Character:** A contemporary geometric-humanist sans paired with a legible engineering mono. The display face carries tight negative tracking at large sizes for technical authority; the mono face handles all data values, run IDs, file paths, durations, and log output. The pairing is intentional: proportional type for human language, monospace for machine language.

### Hierarchy
- **Display** (700, 21px / 1.3125rem, -0.025em tracking, lh 1.3): Page-level titles rendered in the header bar. One per screen.
- **Headline** (600, 17px / 1.0625rem, -0.015em tracking, lh 1.35): Section headings, panel titles, dialog headers.
- **Title** (600, 15px / 0.9375rem, -0.01em tracking, lh 1.4): Card titles, sub-panel headers, named metric groups.
- **Body** (400, 14px / 0.875rem, lh 1.5): Primary reading text, descriptions, PR body previews, log summaries.
- **Label** (700, 11px / 0.6875rem, +0.06em tracking, uppercase): Section labels, data table column headers, status category chips. All-caps only at this weight and size combination.
- **Mono** (JetBrains Mono, 14px / 0.875rem, lh 1.5): All data values, commit hashes, run IDs, file paths, log lines, timestamps, percentages from CI metrics, API endpoints, environment variable names.

### Named Rules
**The Mono Rule.** Any value that could appear in a terminal uses monospace. Mixing proportional and monospace type within a data column creates misalignment and visual noise. Every cell in a given data column must use the same font family.

## 4. Elevation

This system uses tonal surface layering as its primary depth mechanism. Shadows exist in the vocabulary but serve structural, not decorative, roles.

The depth hierarchy is fixed: Void (#09090b) as page background, Console Dark (#18181b) as primary card surface, Panel Mid (#27272a) as inset/secondary surface, Instrument Rim (#3f3f46) as border. Each level is a discrete surface, not a gradient blend. Cards sit at Console Dark on Void; inset containers sit at Panel Mid inside Console Dark cards.

### Shadow Vocabulary
- **Card ambient** (`0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)`): Default card shadow. Extremely subtle; distinguishes cards from the void background without lifting them.
- **Card hover** (`0 6px 24px rgba(0,0,0,0.11), 0 0 0 1px rgba(0,0,0,0.05)`): Interactive card on hover. Still understated; the border change carries most of the hover signal.
- **Floating** (`0 8px 32px rgba(0,0,0,0.7)`): Command palette, overlays. Strong shadow communicates above-surface placement; the high opacity is intentional on a dark theme.

### Named Rules
**The Ring Rule.** Cards use `ring-1 ring-border` (1px structural outline at `#3f3f46`) as the primary boundary. Border and outline are inconsistent across flex and grid contexts; the ring utility is canonical.

**The Flat-By-Default Rule.** Surfaces are flat at rest. The card ambient shadow is 1-pixel grade; it establishes the surface plane without lifting it. Elevation is earned through interaction state, not assumed by component type.

## 5. Components

### Buttons
Compact by design. Buttons are tools, not calls-to-action. They should not dominate a data-dense screen.

- **Shape:** Near-flat (2px radius via global override). No soft rounding anywhere.
- **Primary** (Pipeline Green background, #0f1a00 text, `ring-1 ring-nvidia/40`): Trigger CI, activate a repo, run automation. Not used for navigation or settings.
- **Secondary** (Panel Mid background, neutral-200 text, `ring-1 ring-border`): Default action variant. Filters, configuration, bulk operations.
- **Ghost** (transparent background, neutral-400 text): Low-hierarchy actions in dense rows; icon-only buttons in toolbars.
- **Danger** (Incident Red at 8% opacity background, red-400 text, `ring-1 ring-red-500/25`): Destructive actions only. Deletion, force-merge, cancellation.
- **Press state:** `active:scale-[0.98]` on all variants. Subtle physical feedback; no bounce.
- **Focus ring:** `ring-2 ring-nvidia/60 ring-offset-1 ring-offset-surface`. Keyboard focus is always Pipeline Green.
- **Sizes:** xs (24px tall), sm (28px), md (32px), lg (36px). sm is the default in data rows; md in toolbars.

### Cards
The primary grouping container. Used only when related content needs a visual boundary.

- **Corner Style:** 3px visual radius (Tailwind `rounded-lg` overridden globally).
- **Default** (`bg-surface-1 ring-1 ring-border shadow-card`): Primary data panels, metric groups, log containers, infra sections.
- **Inset** (`bg-surface-2 ring-1 ring-border-subtle rounded-md`): Secondary content nested within a default card. Never nest a default card inside an inset card.
- **Interactive** (default plus `card-interactive cursor-pointer`): Clickable cards. Border shifts to #52525b on hover; no scale or shadow lift.
- **Padding:** 14px (`p-3.5`) standard on all variants.

### Status Badges
The system's signature component. Every CI/CD state is expressed as a dot plus monospace label plus tinted background ring. Never color alone.

- **Shape:** `rounded-full` (pill). The only component where curvature is maximal; its roundness distinguishes it from all other elements.
- **Anatomy:** 6px filled dot (animated pulse on active states), 10-11px monospace text label, `ring-1` tinted outline at 25% opacity.
- **States:** success (emerald-400), failed (red-400), in_progress (Pipeline Green, pulsing), queued (neutral-400, pulsing), cancelled (neutral-400 static), skipped (neutral-500 faded), timed_out (red-400).
- **Rule:** All three badge elements (dot, label, tint) must agree. A green dot with a grey tint, or a red label without a red dot, is a broken badge.

### Data Tables
The primary presentation layer for all pipeline, PR, registry, and log data.

- **Header:** 12px uppercase, +0.04em tracking, neutral-500 color, `border-bottom` separator.
- **Row:** 14px body, neutral-300. Divider `border-bottom border-[#1a1a1a]`. Hover: `bg-white/[.03]` (barely perceptible tint).
- **Cell padding:** `0.5625rem 1rem`. Compact variant (`data-table-xs`): `0.3125rem 0.625rem`.
- **Alignment:** Text cells left-aligned. Numeric/status cells right-aligned or centered by explicit choice.

### Inputs / Fields
- **Style:** `bg-surface-3 border border-border` at 3px visual radius. Placeholder text in neutral-500.
- **Focus:** Border shifts to `border-nvidia/50` (Pipeline Green at 50% opacity). No glow; crisp boundary shift.
- **Error:** `border-accent-red/50`.
- **Font rule:** Monospace for IDs, URLs, tokens, paths, and PATs. Proportional for labels, names, and free text.

### Navigation (Sidebar)
- **Default state:** text-neutral-400, no background.
- **Hover:** `bg-surface-2/60`, text-neutral-100. Transition 150ms.
- **Active:** `bg-surface-3 text-white font-semibold`. Surface elevation signals active state, not Pipeline Green; green is reserved for live data.
- **Icon:** 14px, matches text color state.
- **Collapsed desktop:** 60px wide, icons only with Radix tooltips on hover.
- **Mobile:** 280px overlay drawer, full labels always visible, closes on navigation.

### Rating Chips
Used for DORA and runner quality classifications.

- **Elite** (Pipeline Green text, 8% opacity green background, green ring): Top quartile.
- **High** (Signal Blue text, 8% opacity blue background, blue ring): Second quartile.
- **Medium** (neutral-300 text, 5% white background, white/10 ring): Third quartile.
- **Low** (Incident Red text, 8% opacity red background, red ring): Bottom quartile / failing.
- **Shape:** `rounded-full px-2 py-0.5 text-[11px]`. Same pill form as status badges; the category association is intentional.

## 6. Do's and Don'ts

### Do:
- **Do** use Pipeline Green only for live states, confirmed outcomes, and primary actions. Its signal value depends entirely on its rarity.
- **Do** display all data values, hashes, timestamps, durations, IDs, and paths in JetBrains Mono. Proportional numbers in a monospace column break visual alignment.
- **Do** use `ring-1 ring-border` as the canonical card boundary. Border, outline, and box-shadow produce inconsistent results across layout contexts.
- **Do** ensure every status color has a secondary indicator (dot, label, or icon pattern) for color-blind users.
- **Do** keep corner radii at 2-3px on all interactive surfaces. The sharp aesthetic is a deliberate engineering-tool identity; rounding reads as consumer-friendly.
- **Do** compress information intelligently. Whitespace separates groups; it does not pad individual elements. DevOps engineers read dense tables professionally.
- **Do** use `active:scale-[0.98]` on all interactive elements that benefit from press feedback.

### Don't:
- **Don't** replicate DataDog or Grafana's blue-grey enterprise grid aesthetic. This tool has a distinct identity built around the Instrument Panel north star; do not collapse it into category convention.
- **Don't** use neon-on-black or RGB multi-accent schemes (gaming aesthetic). Pipeline Green is the single accent. Introducing purple, cyan, or additional accent colors fragments the status signal hierarchy.
- **Don't** strip the UI to emptiness in the name of minimalism. Information density is a feature; under-informing an engineer in triage is a product failure.
- **Don't** use Notion or Linear visual language (pastel surfaces, soft rounding, consumer-app whitespace, friendly copy). This is infrastructure tooling.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards, list items, or callouts. Use full-border cards, background tints, or leading icons.
- **Don't** use gradient text (`background-clip: text` with gradient background). Use Pipeline Green as a solid color, or weight and size for emphasis.
- **Don't** add decorative charts or filler metric widgets. Every data element on screen must be actionable or directly informative.
- **Don't** use modal dialogs as the first solution for any interaction. Exhaust inline expansion, drawer panels, and progressive disclosure before interrupting context.
- **Don't** use success toasts or confirmation dialogs for routine actions. The tool speaks when it has something worth saying.
