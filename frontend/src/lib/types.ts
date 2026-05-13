export interface PR {
  number: number
  title: string
  state: string
  user: { login: string; avatar_url: string }
  head: { sha: string; ref: string }
  base: { ref: string }
  labels: Array<{ name: string; color: string }>
  requested_reviewers: Array<{ login: string; avatar_url: string }>
  created_at: string
  updated_at: string
  html_url: string
  mergeable: boolean | null
  mergeable_state: string | null
  draft: boolean
  body: string | null
  additions: number
  deletions: number
  changed_files: number
  comments: number
  review_comments: number
}

export interface CheckRun {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: string | null
  html_url: string
  started_at: string | null
  completed_at: string | null
  app: { name: string; slug: string }
}

export interface WorkflowRun {
  id: number
  name: string
  path: string
  status: string
  conclusion: string | null
  head_branch: string
  head_sha: string
  created_at: string
  updated_at: string
  run_started_at: string | null
  html_url: string
  actor: { login: string; avatar_url: string }
  triggering_actor: { login: string; avatar_url: string } | null
  run_number: number
  display_title: string
  event: string
  duration_seconds: number | null
  duration_label: string
  workflow_label: string
}

export interface Job {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
  runner_name: string | null
  steps: Array<{
    name: string
    status: string
    conclusion: string | null
    number: number
    started_at: string | null
    completed_at: string | null
  }>
}

export interface Runner {
  id: number
  name: string
  os: string
  status: string // online | offline
  busy: boolean
  labels: Array<{ id: number; name: string; type: string }>
}

export interface ClusterJob {
  job_id: string
  name: string
  user: string
  state: string
  time: string
  time_limit: string
  reason: string
  partition: string
  scheduler: string
}

export interface ClusterNode {
  name: string
  state: string
  cpus: string
  memory_mb: string
  gres: string
  partition: string
  scheduler: string
}

export interface ECRImage {
  digest: string
  tags: string[]
  pushed_at: string
  size_mb: number
  repository: string
  registry: string
}

export interface LogEntry {
  id: number
  source: string
  run_id: string
  level: string
  message: string
  timestamp: string
  meta: Record<string, string>
}

export interface NightlyMatrixCell {
  status: string
  run_id: number
  url: string
}

export type StatusColor = 'green' | 'yellow' | 'red' | 'blue' | 'gray'
