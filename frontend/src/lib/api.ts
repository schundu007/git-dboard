const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
const WS_BASE = BASE.replace(/^http/, 'ws')

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── PRs ─────────────────────────────────────────────────────────────────────
export const getPRs = (state = 'open', page = 1) =>
  request<any[]>(`/prs?state=${state}&per_page=30&page=${page}`)

export const getPR = (n: number) => request<any>(`/prs/${n}`)

export const getPRChecks = (n: number) => request<any>(`/prs/${n}/checks`)

export const mergePR = (n: number, method = 'squash') =>
  request<any>(`/prs/${n}/merge?merge_method=${method}`, { method: 'POST' })

// ── Builds ───────────────────────────────────────────────────────────────────
export const getBuildRuns = (
  workflow = '',
  page = 1,
  branch?: string,
  status?: string,
) => {
  const p = new URLSearchParams({ workflow, per_page: '25', page: String(page) })
  if (branch) p.set('branch', branch)
  if (status) p.set('status', status)
  return request<any>(`/builds/runs?${p}`)
}

export const getBuildRun = (id: number) => request<any>(`/builds/runs/${id}`)

export const getBuildJobs = (id: number) => request<any>(`/builds/runs/${id}/jobs`)

export const getBuildArtifacts = (id: number) => request<any>(`/builds/runs/${id}/artifacts`)

export const getFailureSummary = (id: number) => request<any>(`/builds/runs/${id}/failure-summary`)

export const getBuildStats = (workflow = '', days = 14) =>
  request<any>(`/builds/stats?workflow=${encodeURIComponent(workflow)}&days=${days}&limit=100`)

export const triggerBuild = (ref = 'main', workflow = '') =>
  request<any>(`/builds/trigger?ref=${encodeURIComponent(ref)}&workflow=${encodeURIComponent(workflow)}`, { method: 'POST' })

export const rerunBuild = (id: number) =>
  request<any>(`/builds/runs/${id}/rerun`, { method: 'POST' })

export const rerunFailedJobs = (id: number) =>
  request<any>(`/builds/runs/${id}/rerun-failed`, { method: 'POST' })

export const cancelBuild = (id: number) =>
  request<any>(`/builds/runs/${id}/cancel`, { method: 'POST' })

export const getWorkflows = () => request<any>('/builds/workflows')

// ── Nightly ──────────────────────────────────────────────────────────────────
export const getNightlyRuns = (page = 1) =>
  request<any>(`/nightly/runs?per_page=30&page=${page}`)

export const getNightlyMatrix = (days = 14) =>
  request<any>(`/nightly/matrix?days=${days}`)

export const getNightlyTrend = (days = 30) =>
  request<any>(`/nightly/trend?days=${days}`)

export const getNightlyJobs = (runId: number) =>
  request<any>(`/nightly/runs/${runId}/jobs`)

export const triggerNightly = (ref = 'main') =>
  request<any>(`/nightly/trigger?ref=${ref}`, { method: 'POST' })

export const getNightlyImageMatrix = () =>
  request<any>('/nightly/image-matrix')

export const getNightlyYaml = () =>
  request<any>('/nightly/yaml')

// ── Logs ─────────────────────────────────────────────────────────────────────
export const getLogs = (params: Record<string, string | number> = {}) => {
  const qs = new URLSearchParams(params as Record<string, string>).toString()
  return request<any[]>(`/logs?${qs}`)
}

export const ingestLogs = (runId: number) =>
  request<any>(`/logs/ingest/gha/${runId}`, { method: 'POST' })

export const purgeLogs = (days = 30) =>
  request<any>(`/logs/purge?days=${days}`, { method: 'DELETE' })

// ── Infra ────────────────────────────────────────────────────────────────────
export const getRunners = () => request<any>('/infra/runners')

export const getClusterQueue = (scheduler = 'slurm', user?: string) => {
  const u = user ? `&user=${encodeURIComponent(user)}` : ''
  return request<any>(`/infra/cluster/queue?scheduler=${scheduler}${u}`)
}

export const getClusterNodes = () => request<any>('/infra/cluster/nodes')

export const cancelJob = (id: string, scheduler: string) =>
  request<any>(`/infra/cluster/jobs/${encodeURIComponent(id)}?scheduler=${scheduler}`, {
    method: 'DELETE',
  })

export const getJobOutput = (id: string) =>
  request<any>(`/infra/cluster/jobs/${encodeURIComponent(id)}/output`)

export const getInfraStatus = () => request<any>('/infra/status')

// ── Registry ─────────────────────────────────────────────────────────────────
export const getECRImages = (max = 50) =>
  request<any>(`/registry/ecr/images?max_results=${max}`)

export const getECRAuth = () => request<any>('/registry/ecr/auth')

export const getECRUri = () => request<any>('/registry/ecr/uri')

export const deleteECRImage = (tag: string) =>
  request<any>(`/registry/ecr/images/${encodeURIComponent(tag)}`, { method: 'DELETE' })

export const getRegistryPushStatus = () => request<any>('/registry/push-status')

export const getActiveRunners = () => request<any>('/infra/active-runners')
export const getLiveRuns = () => request<any>('/infra/live-runs')

// ── Overview ─────────────────────────────────────────────────────────────────
export const getOverviewSummary = () => request<any>('/overview/summary')

// ── User metrics ──────────────────────────────────────────────────────────────
export const getUserMetrics = (days = 30) => request<any>(`/analytics/user-metrics?days=${days}`)

// ── PR extras ────────────────────────────────────────────────────────────────
export const getRepoPermissions = () => request<any>('/prs/repo-permissions')
export const getPRStats = () => request<any>('/prs/stats')
export const getPRSummary = (n: number) => request<any>(`/prs/${n}/summary`)
export const getPRReviews = (n: number) => request<any>(`/prs/${n}/reviews`)
export const getPRFiles = (n: number) => request<any>(`/prs/${n}/files`)
export const getPRGate = (n: number) => request<any>(`/prs/${n}/gate`)
export const getPRGateOverview = (days?: number) =>
  request<any>(`/prs/gate-overview${days != null ? `?days=${days}` : ''}`)

// ── PR Automation ─────────────────────────────────────────────────────────────
export const getAutomationStatus = () => request<any>('/automation/status')
export const triggerAutomationRun = () => request<any>('/automation/run', { method: 'POST' })
export const updateAutomationConfig = (body: { enabled?: boolean; interval_minutes?: number }) =>
  request<any>('/automation/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export const getRunnerRecommendations = () => request<any>('/automation/runner-recommendations')

export type ScriptError = { line: number | null; title: string; description: string; severity: 'high' | 'medium' | 'low' }
export type ScriptEnhancement = { title: string; description: string; example: string | null }
export type ScriptAnalysis = { errors: ScriptError[]; enhancements: ScriptEnhancement[]; explanation: string; corrected_script: string }

export const analyzeScript = (script: string, language: string) =>
  request<ScriptAnalysis>('/automation/analyze-script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, language }),
  })
export const triggerPRCI = (n: number) =>
  request<any>(`/prs/${n}/trigger-ci`, { method: 'POST' })

// ── All-workflow runs (cross-workflow unified view) ───────────────────────────
export const getAllRuns = (params: {
  per_page?: number; page?: number; branch?: string
  event?: string; status?: string; actor?: string
} = {}) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)) })
  return request<any>(`/builds/runs/all?${p}`)
}

// ── Caches ────────────────────────────────────────────────────────────────────
export const getCaches = (ref?: string, key?: string) => {
  const p = new URLSearchParams()
  if (ref) p.set('ref', ref)
  if (key) p.set('key', key)
  return request<any>(`/builds/caches?${p}`)
}

export const deleteCache = (id: number) =>
  request<any>(`/builds/caches/${id}`, { method: 'DELETE' })

// ── Deployments ───────────────────────────────────────────────────────────────
export const getDeployments = (environment?: string, ref?: string, page = 1, per_page = 30) => {
  const p = new URLSearchParams()
  if (environment) p.set('environment', environment)
  if (ref) p.set('ref', ref)
  p.set('page', String(page))
  p.set('per_page', String(per_page))
  return request<any>(`/builds/deployments?${p}`)
}

export const getEnvironments = () => request<any>('/builds/environments')

// ── Usage ─────────────────────────────────────────────────────────────────────
export const getBuildUsage = () => request<any>('/builds/usage')

// ── Performance & workflow status ─────────────────────────────────────────────
export const getBuildPerformance = (days = 14) =>
  request<any>(`/builds/performance?days=${days}`)

export const getWorkflowsWithStatus = () => request<any>('/builds/workflows/status')

// ── Issues ────────────────────────────────────────────────────────────────────
export const getIssues = (params: {
  state?: string; labels?: string; assignee?: string; milestone?: string
  per_page?: number; page?: number
} = {}) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') p.set(k, String(v)) })
  return request<any[]>(`/issues?${p}`)
}
export const getIssueStats = () => request<any>('/issues/stats')
export const getIssueLabels = () => request<any[]>('/issues/labels')
export const getIssueMilestones = (state = 'open') => request<any[]>(`/issues/milestones?state=${state}`)

// ── Insights ──────────────────────────────────────────────────────────────────
export const getInsightsContributors = () => request<any>('/insights/contributors')
export const getInsightsCommitActivity = () => request<any>('/insights/commit-activity')
export const getInsightsCodeFrequency = () => request<any>('/insights/code-frequency')
export const getInsightsParticipation = () => request<any>('/insights/participation')
export const getInsightsForks = (sort = 'newest', page = 1) => request<any>(`/insights/forks?sort=${sort}&page=${page}`)
export const getInsightsPulse = () => request<any>('/insights/pulse')

// ── Health Analysis (DORA + CI Triage + Pipeline Perf + Runner Health) ────────
export const getHealthDora = (days = 14) => request<any>(`/health-analysis/dora?days=${days}`)
export const getHealthCiTriage = () => request<any>('/health-analysis/ci-triage')
export const getHealthPipelinePerf = () => request<any>('/health-analysis/pipeline-perf')
export const getHealthRunnerHealth = () => request<any>('/health-analysis/runner-health')

// ── Security & Compliance ─────────────────────────────────────────────────────
export const getSecurityOverview = () => request<any>('/security/overview')

// ── Improvement Plan ──────────────────────────────────────────────────────────
export const getImprovementPlan = () => request<any>('/improvement/plan')
export const getIssuesAnalysis = () => request<any>('/improvement/issues-analysis')
export const getQuickWins = () => request<any>('/improvement/quick-wins')

// ── Image Tags ────────────────────────────────────────────────────────────────
export const getTagsMatrix = () => request<any>('/tags/matrix')

export const getTagsLifecycle = () => request<any>('/tags/lifecycle')

export const getTagsCompute = (params: {
  mode?: string; build_date?: string; release_version?: string
  short_sha?: string; image_ext?: string; sim_version?: string
}) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v) })
  return request<any>(`/tags/compute?${p}`)
}

// ── Business unit groups ──────────────────────────────────────────────────────
export const getGroups = () => request<any>('/groups')
export const getGroupSummary = (slug: string) => request<any>(`/groups/${encodeURIComponent(slug)}/summary`)
export const setRepoBusinessUnit = (id: number, business_unit: string | null) =>
  request<any>(`/repos/${id}/business-unit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_unit }),
  })

// ── Repo management ───────────────────────────────────────────────────────────
export const getRepos = () => request<any>('/repos')
export const getActiveRepo = () => request<any>('/repos/active')
export const addRepo = (body: { name: string; owner: string; repo: string; gh_pat?: string }) =>
  request<any>('/repos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export const deleteRepo = (id: number) =>
  request<any>(`/repos/${id}`, { method: 'DELETE' })
export const activateRepo = (id: number) =>
  request<any>(`/repos/${id}/activate`, { method: 'POST' })
export const deactivateRepo = () =>
  request<any>('/repos/deactivate', { method: 'POST' })
export const testRepoConnection = (body: { name: string; owner: string; repo: string; gh_pat?: string }) =>
  request<any>('/repos/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// ── WebSockets ────────────────────────────────────────────────────────────────
export const buildLogsWS = (runId: number) =>
  new WebSocket(`${WS_BASE}/builds/runs/${runId}/logs/stream`)

export const liveLogsWS = (runId: number) =>
  new WebSocket(`${WS_BASE}/logs/stream?run_id=${runId}`)
