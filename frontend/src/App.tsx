import { lazy, Suspense, Component } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getActiveRepo, getRepos } from './lib/api'
import Layout from './components/Layout'
import RepoWelcome from './components/RepoWelcome'

// A failed dynamic import is almost always a stale chunk: the browser is holding
// an old index.html that references hashed chunk filenames purged by a newer
// deploy. Reload once (guarded so we never loop) to fetch the fresh index.html
// and its new chunk hashes. Any success clears the guard so a future deploy can
// recover the same way.
const CHUNK_RELOAD_KEY = 'chunk-reload-attempt'

function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory()
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      return mod
    } catch (err) {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return new Promise<{ default: T }>(() => {}) // hold render until reload
      }
      throw err
    }
  })
}

const ControlPlane    = lazyWithReload(() => import('./pages/ControlPlane'))
const PRHub           = lazyWithReload(() => import('./pages/PRHub'))
const BuildPipeline   = lazyWithReload(() => import('./pages/BuildPipeline'))
const ReleaseNotes    = lazyWithReload(() => import('./pages/ReleaseNotes'))
const Failures        = lazyWithReload(() => import('./pages/Failures'))
const BumpPRs         = lazyWithReload(() => import('./pages/BumpPRs'))
const Sanitizers      = lazyWithReload(() => import('./pages/Sanitizers'))
const InfraAssignment = lazyWithReload(() => import('./pages/InfraAssignment'))
const RegistryManager = lazyWithReload(() => import('./pages/RegistryManager'))
const ImprovementPlan = lazyWithReload(() => import('./pages/ImprovementPlan'))
const InfraGap        = lazyWithReload(() => import('./pages/InfraGap'))
const Provisioning    = lazyWithReload(() => import('./pages/Provisioning'))
const ErrorMonitor    = lazyWithReload(() => import('./pages/ErrorMonitor'))
const Analytics       = lazyWithReload(() => import('./pages/Analytics'))
const SecurityAudit   = lazyWithReload(() => import('./pages/SecurityAudit'))
const Settings        = lazyWithReload(() => import('./pages/Settings'))
const ScriptPlayground   = lazyWithReload(() => import('./pages/ScriptPlayground'))
const ScriptBrowser      = lazyWithReload(() => import('./pages/ScriptBrowser'))
const GroupDashboard     = lazyWithReload(() => import('./pages/GroupDashboard'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-48">
      <span className="w-5 h-5 rounded-full border-2 border-border border-t-accent-green animate-spin" />
    </div>
  )
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <p className="text-[13px] font-semibold text-accent-red">Page failed to load</p>
          <p className="text-[11px] text-gray-500 font-mono max-w-sm truncate">{(this.state.error as Error).message}</p>
          <button
            onClick={() => {
              // Full reload recovers stale chunks (fresh index.html + new hashes)
              // as well as transient render errors — clearing state alone would
              // just re-run the same cached, failed dynamic import.
              sessionStorage.removeItem(CHUNK_RELOAD_KEY)
              window.location.reload()
            }}
            className="text-[11px] text-gray-400 hover:text-white border border-border rounded-lg px-3 py-1.5 hover:bg-surface-2 transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function RepoChangeWatcher() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['active-repo'],
    queryFn: getActiveRepo,
    staleTime: 5_000,
    refetchInterval: 8_000,
  })
  const prevSlug = useRef<string | null>(null)

  useEffect(() => {
    const slug = data?.active?.slug
    if (!slug) return
    if (prevSlug.current === null) {
      prevSlug.current = slug
      const storedSlug = localStorage.getItem('active-repo-slug')
      localStorage.setItem('active-repo-slug', slug)
      if (storedSlug && storedSlug !== slug) {
        qc.removeQueries({ predicate: q => q.queryKey[0] !== 'active-repo' })
      }
      return
    }
    if (prevSlug.current !== slug) {
      prevSlug.current = slug
      localStorage.setItem('active-repo-slug', slug)
      // Remove all non-active-repo queries so pages fetch fresh data for the new project
      qc.removeQueries({ predicate: q => q.queryKey[0] !== 'active-repo' })
    }
  }, [data?.active?.slug, qc])

  return null
}

function useShowWelcome() {
  const onboarded = localStorage.getItem('repo-onboarded')
  const { data: activeData, isSuccess: activeLoaded } = useQuery({
    queryKey: ['active-repo'],
    queryFn: getActiveRepo,
    staleTime: 30_000,
  })
  const { data: reposData, isSuccess: reposLoaded } = useQuery({
    queryKey: ['repos'],
    queryFn: getRepos,
    staleTime: 30_000,
  })
  if (onboarded) return false
  if (!activeLoaded || !reposLoaded) return false
  const repos: any[] = reposData?.repos ?? []
  // Show welcome if no manually saved repos and no manually activated one
  return repos.length === 0 && activeData?.source === 'env'
}

function ScriptsPage() {
  return <ScriptBrowser />
}

export default function App() {
  const showWelcome = useShowWelcome()
  if (showWelcome) return <RepoWelcome />

  return (
    <Layout>
      <RepoChangeWatcher />
      <PageErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/"            element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"   element={<ControlPlane />} />
          <Route path="/prs"         element={<PRHub />} />
          <Route path="/builds"      element={<BuildPipeline />} />
          <Route path="/release-notes" element={<ReleaseNotes />} />
          <Route path="/failures"    element={<Failures />} />
          <Route path="/bumps"       element={<BumpPRs />} />
          <Route path="/sanitizers"  element={<Sanitizers />} />
          <Route path="/action-plan" element={<ImprovementPlan />} />
          <Route path="/infra-gap"   element={<InfraGap />} />
          <Route path="/provisioning" element={<Provisioning />} />
          <Route path="/infra"       element={<InfraAssignment />} />
          <Route path="/registry"    element={<RegistryManager />} />
          <Route path="/monitoring"  element={<ErrorMonitor />} />
          <Route path="/analytics"   element={<Analytics />} />
          <Route path="/security"    element={<SecurityAudit />} />
          <Route path="/settings"    element={<Settings />} />
          <Route path="/scripts"     element={<ScriptsPage />} />
          <Route path="/playground"  element={<ScriptPlayground />} />
          <Route path="/groups/:slug" element={<GroupDashboard />} />
          {/* Legacy redirects */}
          <Route path="/improvement" element={<Navigate to="/action-plan" replace />} />
          <Route path="/health"      element={<Navigate to="/dashboard" replace />} />
          <Route path="/nightly"     element={<Navigate to="/builds" replace />} />
          <Route path="/branches"    element={<Navigate to="/prs" replace />} />
          <Route path="/issues"      element={<Navigate to="/prs" replace />} />
          <Route path="/insights"    element={<Navigate to="/analytics" replace />} />
          <Route path="/logs"        element={<Navigate to="/monitoring" replace />} />
          <Route path="/tags"        element={<Navigate to="/registry" replace />} />
        </Routes>
      </Suspense>
      </PageErrorBoundary>
    </Layout>
  )
}
