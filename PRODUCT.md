# Product

## Register

product

## Users

DevOps engineers who own or maintain GitHub-backed CI/CD pipelines. They work across triage (something broke, find it fast), routine health checks (morning sweep, is everything green), and planning (DORA metrics, improvement backlog). They are data-literate, technically fluent, and have no patience for hand-holding. They use this tool under pressure and on schedule, not just when things are interesting.

## Product Purpose

A self-hosted DevOps dashboard that connects to any GitHub repository and replaces the fragmentation of the GitHub UI, external monitoring tools, and ad-hoc scripts with a single authoritative view. Success means a DevOps engineer can open this dashboard, understand their pipeline state in under 10 seconds, drill into any failure, and leave with a clear next action. It covers CI/CD monitoring, DORA metrics, PR gate evaluation, runner management, log search, ECR registry, and a script analysis playground.

## Brand Personality

Powerful · Confident · Technical. The tool that knows what it is doing. Commands authority through information density and precision, not through decorative chrome. It does not explain itself, does not beg for interaction, and does not soften difficult information with friendly copy.

## Anti-references

- **DataDog / Grafana default**: blue-grey enterprise grids with no personality, indistinguishable from a thousand other dashboards.
- **Gaming / RGB aesthetic**: neon-on-black overload, dark mode used for drama rather than function.
- **Overly minimalist**: so stripped down it communicates incompleteness rather than focus.
- **Notion / Linear clone**: pastel, friendly, consumer-product energy — wrong register entirely for infrastructure tooling.

## Design Principles

1. **Density earns its keep.** DevOps engineers read data tables for a living. Compress information intelligently; do not simplify into emptiness. Whitespace is used for separation, not decoration.
2. **Red finds you.** Critical failures must surface without hunting. Status is ambient, visible at a glance, not buried behind interactions. The eye should land on the most important problem first.
3. **Confidence, not reassurance.** The UI assumes the user is competent. No empty states that plead for setup. No success toasts for routine actions. The tool speaks when it has something worth saying.
4. **Every indicator earns its place.** No decorative charts, no filler metrics, no widgets that exist because a dashboard "should" have them. If it is on screen, it is actionable or informative.
5. **Calm under load.** The aesthetic is authoritative and steady, not anxious or excitable. Motion is used sparingly and purposefully. The interface does not perform urgency; it surfaces it when real.

## Accessibility & Inclusion

WCAG 2.1 AA minimum across all pages. Status colors (pass/fail/warning) must always have a secondary indicator (icon, label, or pattern) so they are not dependent on color alone. Keyboard navigation must reach all interactive elements.
