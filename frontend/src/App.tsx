import { lazy, Suspense, Component } from 'react'
import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getActiveRepo, getRepos } from './lib/api'
import Layout from './components/Layout'
import RepoWelcome from './components/RepoWelcome'

const ControlPlane    = lazy(() => import('./pages/ControlPlane'))
const PRHub           = lazy(() => import('./pages/PRHub'))
const BuildPipeline   = lazy(() => import('./pages/BuildPipeline'))
const ReleaseNotes    = lazy(() => import('./pages/ReleaseNotes'))
const Failures        = lazy(() => import('./pages/Failures'))
const BumpPRs         = lazy(() => import('./pages/BumpPRs'))
const Sanitizers      = lazy(() => import('./pages/Sanitizers'))
const InfraAssignment = lazy(() => import('./pages/InfraAssignment'))
const RegistryManager = lazy(() => import('./pages/RegistryManager'))
const ImprovementPlan = lazy(() => import('./pages/ImprovementPlan'))
const InfraGap        = lazy(() => import('./pages/InfraGap'))
const Provisioning    = lazy(() => import('./pages/Provisioning'))
const ErrorMonitor    = lazy(() => import('./pages/ErrorMonitor'))
const Analytics       = lazy(() => import('./pages/Analytics'))
const SecurityAudit   = lazy(() => import('./pages/SecurityAudit'))
const Settings        = lazy(() => import('./pages/Settings'))
const ScriptPlayground   = lazy(() => import('./pages/ScriptPlayground'))
const ScriptBrowser      = lazy(() => import('./pages/ScriptBrowser'))
const GroupDashboard     = lazy(() => import('./pages/GroupDashboard'))

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
            onClick={() => this.setState({ error: null })}
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
