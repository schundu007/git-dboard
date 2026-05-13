import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ControlPlane from './pages/ControlPlane'
import Analytics from './pages/Analytics'
import PRHub from './pages/PRHub'
import BuildPipeline from './pages/BuildPipeline'
import NightlyMonitor from './pages/NightlyMonitor'
import LogMonitor from './pages/LogMonitor'
import InfraAssignment from './pages/InfraAssignment'
import RegistryManager from './pages/RegistryManager'
import BranchMonitor from './pages/BranchMonitor'
import IssueHub from './pages/IssueHub'
import RepoInsights from './pages/RepoInsights'
import HealthAnalysis from './pages/HealthAnalysis'
import ImprovementPlan from './pages/ImprovementPlan'
import ImageTags from './pages/ImageTags'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ControlPlane />} />
        <Route path="/analytics" element={<Analytics />} />
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
      </Routes>
    </Layout>
  )
}
