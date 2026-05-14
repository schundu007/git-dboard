import { Routes, Route } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getActiveRepo, getRepos } from './lib/api'
import Layout from './components/Layout'
import RepoWelcome from './components/RepoWelcome'
import ControlPlane from './pages/ControlPlane'
import PRHub from './pages/PRHub'
import BuildPipeline from './pages/BuildPipeline'
import NightlyMonitor from './pages/NightlyMonitor'
import LogMonitor from './pages/LogMonitor'
import InfraAssignment from './pages/InfraAssignment'
import RegistryManager from './pages/RegistryManager'
import BranchMonitor from './pages/BranchMonitor'
import IssueHub from './pages/IssueHub'
import RepoInsights from './pages/RepoInsights'
import Analytics from './pages/Analytics'
import HealthAnalysis from './pages/HealthAnalysis'
import ImprovementPlan from './pages/ImprovementPlan'
import ImageTags from './pages/ImageTags'
import ErrorMonitor from './pages/ErrorMonitor'
import Settings from './pages/Settings'
import SecurityAudit from './pages/SecurityAudit'

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
        qc.invalidateQueries({ predicate: q => q.queryKey[0] !== 'active-repo' })
      }
      return
    }
    if (prevSlug.current !== slug) {
      prevSlug.current = slug
      localStorage.setItem('active-repo-slug', slug)
      // Invalidate every query except active-repo itself so all pages refetch
      qc.invalidateQueries({ predicate: q => q.queryKey[0] !== 'active-repo' })
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

export default function App() {
  const showWelcome = useShowWelcome()
  if (showWelcome) return <RepoWelcome />

  return (
    <Layout>
      <RepoChangeWatcher />
      <Routes>
        <Route path="/" element={<ControlPlane />} />
        <Route path="/prs" element={<PRHub />} />
        <Route path="/builds" element={<BuildPipeline />} />
        <Route path="/nightly" element={<NightlyMonitor />} />
        <Route path="/branches" element={<BranchMonitor />} />
        <Route path="/issues" element={<IssueHub />} />
        <Route path="/insights" element={<RepoInsights />} />
        <Route path="/logs" element={<LogMonitor />} />
        <Route path="/infra" element={<InfraAssignment />} />
        <Route path="/registry" element={<RegistryManager />} />
        <Route path="/health" element={<HealthAnalysis />} />
        <Route path="/improvement" element={<ImprovementPlan />} />
        <Route path="/tags" element={<ImageTags />} />
        <Route path="/monitoring" element={<ErrorMonitor />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/security" element={<SecurityAudit />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}
