# GitPulse ← TheRock HUD gap analysis + ClickHouse plan (handoff)

> Carry this file into the GitPulse repo (`cp ~/clickhouse_plan.md .`) and tell the
> new Claude session: "read clickhouse_plan.md and continue Phase 0."
> Written 2026-07-06 from the `camora` session (analysis done black-box via the deployed API).
> UPDATED 2026-07-06 (git-dboard session): AMD column re-analyzed against the LIVE HUD SOURCE
> (fetched https://therock-hud-dev.amd.com/). Matrix expanded from 12→18 rows; 6 capabilities
> that were invisible to the black-box API pass are now surfaced (Sanitizers, CI HUD, Multi-Arch
> Trends, deep Bump PR Insights, component-classification engine, shareable URLs, period selectors).
> Chronic + flake definitions corrected to AMD's exact rules. See "Verified HUD inventory" below.

## Context / what this is
GitPulse (https://gitpulser.vercel.app, backend https://gitpulser.up.railway.app) is a
generalized DevOps dashboard, currently pointed at the SAME repos as **AMD's TheRock HUD**
(https://therock-hud-dev.amd.com/, repo ROCm/TheRock). Goal: close the gaps vs AMD's HUD.

- GitPulse stack: **React/Vite SPA + FastAPI backend on Railway** (135 endpoints, verified via /openapi.json).
- AMD HUD stack: **single 168 KB server-rendered HTML + clickhouse.js querying ClickHouse directly**.

## Verdict (the honest read)
GitPulse is NOT missing breadth — it is BROADER than AMD (infra provisioning, AWS OIDC,
ECR registry, business units, automations, security, playground). What it lacks is **DEPTH
in the CI failure-intelligence core** — the primitives that make a HUD indispensable to
on-call/release engineers. The deepest gap is architectural: AMD pre-computes analytics over
historical CI events in ClickHouse; GitPulse queries the live GitHub API (rate-limited, no cheap history).

## DECISION (locked with user)
- **Datastore: ClickHouse, self-hosted on Railway.** (Note: my engineering rec was Postgres+Timescale
  first — cheaper, no new ops, sufficient at single-repo scale — but user chose ClickHouse to match
  AMD and avoid a later migration. Build behind an `AnalyticsStore` interface either way.)
- ClickHouse is Apache-2.0 open source → **no subscription needed**; self-hosting on Railway costs
  only Railway compute/storage. (A "subscription" only applies to ClickHouse Cloud, which we are NOT using.)
- **First build target after foundation: Failure Intelligence** (flakes → chronic → slowest → clustering).

## Capability gap matrix (✅ present · 🟡 partial · ❌ missing · ❓ unverified)
> AMD column VERIFIED against live HUD source (2026-07-06). GitPulse column still verify against /openapi.json.
| Capability | AMD HUD | GitPulse | Notes |
|---|---|---|---|
| Flake detection (per-attempt ✓/✗/○ sequence, keyed by commit_sha) | ✅ | ❌ | HUD "Triage" tab: job × arch × attempt-sequence symbols + logs link; GitPulse only has rerun ACTIONS |
| Chronic-failure / quarantine (**3+ consecutive days, 0 success, within last 14d**) | ✅ | ❌ | HUD "Failures" tab; exact criteria now verified — silent CI cost burner |
| Slowest-jobs leaderboard (median wall time, **top 15**) | ✅ | 🟡 | data in /builds/performance,/builds/usage; not a top-15 leaderboard |
| Failure clustering (job pattern × workflow × arch × repo, last-seen) | ✅ | 🟡 | HUD "Triage" tab; /analytics/failure-analysis=jobs+runs, /error-patterns=log buckets |
| **Sanitizers: separate ASAN + TSAN pipelines, per-arch status + queue/run time** | ✅ | ❌ | HUD "Sanitizers" tab (PASS/FAIL/SKIPPED/IN PROGRESS/CANCELLED/PENDING); NOT in GitPulse |
| **CI HUD: post-merge commit status, job-level drilldown, GitHub links** | ✅ | 🟡 | /overview/* partial; no per-commit job expansion |
| Multi-arch pipeline TREE (12-lane matrix, per-arch dot expansion, py×torch sub-cells) | ✅ | 🟡 | /nightly/multiarch = days/lanes/rows matrix, no tree/drill-down |
| **Multi-arch TRENDS (failures/day bucketed build-vs-test phase, dual-OS, drilldown)** | ✅ | 🟡 | /nightly/* has data; not phase-bucketed trend charts |
| Download pinning (exact-build install cmd per nightly) | ✅ | ❌ | consumer-facing "grab this exact good build" |
| Issues pivot (**GPU arch × framework [PyTorch/JAX] grid, clickable cells**) | ✅ | ❌ | /issues/stats = counts/labels only |
| Deep bump insights (upstream-span quantiles, AI root-cause+quotes, .gitmodules "behind upstream" 10+/1-9/0) | ✅ | 🟡 | /prs/bumps = total/by_submodule/oldest_days |
| **Bump PR Insights tab (component×category tables, submodule scatter+weekly, merge-latency w/ GPU-runner-event overlay, actionable backlog)** | ✅ | 🟡 | deeper 2nd bump tab; GitPulse has none of the overlays |
| PR insights (throughput, backlog-by-age, author × category matrix) | ✅ | 🟡 | /prs/stats,/analytics/pr-velocity exist |
| Presubmit / in-flight PR gate quality (draft toggle, per-job presubmit) | ✅ | ✅ | /prs/gate-overview,/prs/{n}/gate — FINE |
| Release notes: SHA-range gen + **5-tier categorization** + copy/download .md | ✅ | ✅ | /release-notes/generate — verify 5-tier depth (label→conv-commit→bracket→verb→fallback) |
| Weekly AI digest (repo-wide, copy/markdown) | ✅ | 🟡 | only /nightly/digest (nightly-scoped) |
| **Component/category classification engine (regex ISSUE_COMPONENT_RULES; code-regression→test-infra→test-flaky→infra-machine→infra-timeout→misc)** | ✅ | ❌ | cross-cutting; powers issues + bumps + release-notes |
| **Shareable stateful URLs (?from=SHA&to=SHA&repos=)** | ✅ | ❓ | deep-link a triage/range view; verify GitPulse SPA support |
| **Cross-cutting period / date-range selectors (24h/7d/30d; 7/30/60/90/180d/1y)** | ✅ | 🟡 | every analytics endpoint needs a time-window param |

## Verified HUD inventory (live source, 2026-07-06)
Ground truth from fetching the rendered HUD — supersedes the black-box tab-id guess.

**13 tabs:** Summary · Failures · Multi-Arch Release (Nightly) · Multi-Arch Trends · CI HUD ·
In-Flight PRs · Sanitizers · Submodule Bump PRs · GitHub Issues · Triage · Release Notes ·
PR Insights · Bump PR Insights.

**Per-tab specifics worth cloning:**
- **Failures**: failure timeline, hotspot filters (with "Clear"), arch/workflow breakdowns,
  slowest jobs (top 15), chronically-broken jobs (3+ consecutive days, 0 success, last 14d).
- **Triage** (the failure-intelligence core): failure clusters (job pattern × workflow × arch ×
  repo × last-seen) + flake detection (per-attempt ✓/✗/○ sequence, keyed by commit) + logs links.
- **Sanitizers**: separate ASAN & TSAN pipelines, per-arch status
  (PASS/FAIL/SKIPPED/IN PROGRESS/CANCELLED/PENDING), queue time + run time.
- **Multi-Arch Release**: 12-lane pipeline matrix (ROCm Linux/Windows builds → packaging →
  publish → tests → PyTorch builds/tests), "passed/total" badges, per-arch dot expansion,
  pipeline **tree** viewer, per-(py × torch) sub-cells, ⬇ Downloads with pinned install cmds.
- **Multi-Arch Trends**: dual-OS charts, failures/day bucketed by **build vs test phase**, drilldown.
- **GitHub Issues**: total/open/closed, label leaderboard, contributor leaderboard,
  **GPU-arch × framework (PyTorch/JAX) pivot** (clickable cells), per-repo list
  (Issue · title · status · labels · assignee · author · created · updated).
- **Submodule Bump PRs**: in-progress table (PR · submodule · upstream-span · title · author ·
  status · CI checks · age · updated), AI-synthesized root cause + comment quotes, historical
  tracking, current .gitmodules "behind upstream" quantiles (10+ / 1–9 / 0 commits).
- **Bump PR Insights**: merged-bump count, issue/regression/infra breakdown, component × category
  tables, submodule trends (rocm-systems / rocm-libraries / Extras) w/ scatter + weekly breakdown,
  bump-merge-latency overlay with GPU-runner events, actionable backlog.
- **Release Notes**: commit-SHA range gen, 5-tier categorization
  (GitHub label → conventional commit → bracket prefix → verb heuristic → fallback),
  Copy markdown + Download .md, Share link (?from=SHA&to=SHA&repos=).

**Cross-cutting UI primitives** (needed on GitPulse endpoints too): period toggles (24h/7d/30d),
date-range presets (7/30/60/90/180d/1y), multi-select filters (status/label/assignee/author),
"Expand all / Collapse all", "Click ▸" row/column expansion, shareable query-param URLs.

**Methodology (verified):** source = ClickHouse, webhook-driven ingestion of GitHub Actions.
Chronic = "3+ consecutive days with zero successful runs in last 14 days". Slowest = median wall
time. Component detection = priority-ordered regex `ISSUE_COMPONENT_RULES` on title/body/labels.
Category taxonomy = code-regression → test-infra → test-flaky → infra-machine → infra-timeout →
miscellaneous. → **Confirms the ClickHouse+webhook architecture in this plan is the right target.**

## Phase 0 — ClickHouse on Railway (foundation)
1. **Railway service**: deploy `clickhouse/clickhouse-server` (Docker/template). Volume at
   `/var/lib/clickhouse`. Connect FastAPI over Railway PRIVATE network, HTTP :8123.
   Env: CLICKHOUSE_DB / CLICKHOUSE_USER / CLICKHOUSE_PASSWORD.
   ⚠️ MUST mount a low-memory profile (config.d/low-mem.xml: max_server_memory_usage,
   mark_cache_size, per-query max_memory_usage) or it OOM-restarts on small Railway plans. Give ≥2–4 GB.
2. **Schema (event-sourced, columnar)**:
   - ci_workflow_runs(run_id, repo, workflow, branch, event, arch, status, conclusion, commit_sha,
     actor, created_at, started_at, updated_at, run_attempt)
   - ci_jobs(job_id, run_id, repo, workflow, job_name, arch, runner, conclusion, started_at,
     completed_at, duration_ms, attempt)   — ReplacingMergeTree(updated_at)
   - pull_requests, issues, bump_prs (see gaps above)
   - Materialized views = the missing features:
     * job_daily_status(day, repo, job_name, arch, runs, passes, fails)  → chronic/quarantine
       (AMD rule: 3+ CONSECUTIVE days with 0 passes, within last 14d — check consecutiveness AND zero-pass)
     * job_perf_daily(day, repo, job_name, quantileState(0.5)(duration_ms)) → slowest-jobs (top 15)
     * job_attempts(commit_sha, job_name, groupArray((attempt,conclusion))) → flake sequences
       (render per-attempt ✓/✗/○; a flake = same commit_sha+job flipping pass↔fail across attempts)
     * failure_clusters(job_name, workflow, arch, fails, last_seen) → arch×workflow clustering
3. **Ingestion** (replace live-GitHub-per-request):
   - POST /webhooks/github — verify X-Hub-Signature-256 HMAC; handle workflow_run, workflow_job,
     check_run, pull_request, issues, push → insert with async_insert=1.
   - Backfill worker — on repo activation, paginate Actions API 90–180d; idempotent via ReplacingMergeTree.
4. **Keep API stable**: add an `AnalyticsStore` interface + `ClickHouseStore` impl; existing endpoints
   change SOURCE (GitHub-live → ClickHouse), not their contract → no frontend rewrite.

## Phase 1 — Failure Intelligence (first target)
New/upgraded endpoints reading Phase 0 tables:
- GET /ci/flakes    — per-attempt ✓/✗/○ sequences keyed by commit_sha (job_attempts)
- GET /ci/chronic   — 3+ CONSECUTIVE days, 0 passes, within last 14d (job_daily_status) = quarantine list
- GET /ci/slowest   — median wall-time leaderboard, top 15 (job_perf_daily)
- upgrade /analytics/failure-analysis → true job×workflow×arch×repo clustering + last-seen (failure_clusters)

## Phase 2 — Release & bump depth
Nightly pipeline TREE + download pinning on /nightly/multiarch; bump intelligence (upstream-span,
latency scatter, runner-event overlay, AI root-cause) on /prs/bumps.

## Phase 3 — Insight surfaces
Weekly AI digest (repo-wide) + Issues pivot (GPU-arch × PyTorch/JAX, clickable cells) +
PR author×category / aging matrices + Multi-Arch Trends (failures/day bucketed build-vs-test phase).

## Phase 4 — Newly surfaced from live-source re-analysis (were invisible to black-box API pass)
- **Sanitizers surface**: ingest ASAN + TSAN as separate pipelines; per-arch status matrix
  (PASS/FAIL/SKIPPED/IN PROGRESS/CANCELLED/PENDING) + queue/run time. New event source + table.
- **Component/category classification engine**: port AMD's priority-ordered regex
  (`ISSUE_COMPONENT_RULES`) + category taxonomy; it powers Issues pivot, Bump Insights, Release Notes.
  Build once as a shared classifier, not per-feature.
- **Cross-cutting time-window params**: add period/date-range args (24h/7d/30d; 7/30/60/90/180d/1y)
  to every analytics endpoint — ClickHouse MVs make this cheap; live-GitHub made it impossible.
- **Shareable stateful URLs**: SPA deep-linking (?from=SHA&to=SHA&repos=) for triage/range views.
- **Bump PR Insights depth**: merge-latency + GPU-runner-event overlay, submodule scatter, backlog.

## First steps in the new session
1. Explore repo: backend framework layout, current data-access layer, how analytics endpoints
   fetch from GitHub today, requirements/pyproject, frontend nav.
2. Add ClickHouse client dep (clickhouse-connect) + connection config from env.
3. Write schema migrations (raw tables + MVs).
4. Build /webhooks/github receiver + backfill worker.
5. Introduce AnalyticsStore interface; port ONE endpoint (failure-analysis) as the vertical slice.
6. Add /ci/flakes, /ci/chronic, /ci/slowest.
Recommend TDD + a docker-compose ClickHouse for local dev before touching Railway.

## Evidence sources (reproducible)
- GitPulse OpenAPI: https://gitpulser.up.railway.app/openapi.json (135 paths)
- GitPulse live sample: /overview/summary returns ROCm PR data
- AMD HUD: single HTML at https://therock-hud-dev.amd.com/ (fetched + verified 2026-07-06).
  VERIFIED 13 tabs: Summary, Failures, Multi-Arch Release (Nightly), Multi-Arch Trends, CI HUD,
  In-Flight PRs, Sanitizers, Submodule Bump PRs, GitHub Issues, Triage, Release Notes,
  PR Insights, Bump PR Insights. Features: flakes (per-attempt ✓/✗/○), quarantine (3+ consec/0-pass/14d),
  slowest-jobs (top15), failure clusters, ASAN+TSAN, Issues Pivot (arch×PyTorch/JAX), 12-lane pipeline
  tree, pinned Downloads, AI bump root-cause, component/category regex classifier, ClickHouse backend.
  (See "Verified HUD inventory" section above for full per-tab column detail.)
