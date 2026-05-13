import { useLocation } from 'react-router-dom'
import { Search, RefreshCw, Bell, ExternalLink } from 'lucide-react'
import { cn } from '../lib/cn'
import { useSidebar } from '../contexts/SidebarContext'

const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/':            { title: 'Dashboard',        description: 'System overview' },
  '/analytics':   { title: 'Analytics',        description: 'Commit & build trends' },
  '/prs':         { title: 'PR Hub',            description: 'Pull requests & gate automation' },
  '/builds':      { title: 'Build Pipeline',    description: 'CI workflow runs' },
  '/nightly':     { title: 'Nightly Monitor',   description: 'Nightly build matrix & trends' },
  '/branches':    { title: 'Branch Monitor',    description: 'Branch CI status' },
  '/issues':      { title: 'Issue Hub',         description: 'Open issues & milestones' },
  '/insights':    { title: 'Repo Insights',     description: 'GitHub repository analytics' },
  '/logs':        { title: 'Log Monitor',       description: 'Centralised log search' },
  '/infra':       { title: 'Infra & Runners',   description: 'Self-hosted runners & cluster' },
  '/registry':    { title: 'Registry',          description: 'Container image management' },
  '/health':      { title: 'Health Analysis',   description: 'DORA metrics & pipeline health' },
  '/improvement': { title: 'Improvement Plan',  description: 'Actionable CI/CD improvements' },
  '/tags':        { title: 'Image Tags',        description: 'Tag naming & lifecycle policy' },
}

interface HeaderProps {
  onOpenPalette?: () => void
}

export default function Header({ onOpenPalette }: HeaderProps) {
  const { pathname } = useLocation()
  const { collapsed } = useSidebar()
  const meta = ROUTE_META[pathname] ?? { title: 'IsaacLab', description: '' }

  return (
    <header className={cn(
      'h-[52px] flex-shrink-0 flex items-center border-b border-border bg-surface-1/80 backdrop-blur-sm z-10',
      'sticky top-0',
    )}>
      <div className="flex-1 flex items-center gap-3 px-5 min-w-0">
        {/* Page title */}
        <div className="min-w-0">
          <h1 className="text-[14px] font-semibold text-white truncate leading-tight">{meta.title}</h1>
          {meta.description && (
            <p className="text-[11px] text-gray-600 truncate leading-tight hidden sm:block">{meta.description}</p>
          )}
        </div>

        {/* Breadcrumb separator */}
        <div className="hidden md:flex items-center gap-2 ml-2 text-gray-700 text-[11px] font-mono">
          <span>/</span>
          <a
            href="https://github.com/isaac-sim/IsaacLab"
            target="_blank"
            rel="noreferrer"
            className="hover:text-accent-blue flex items-center gap-1 transition-colors"
          >
            isaac-sim/IsaacLab
            <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 pr-4 flex-shrink-0">
        {/* Search / command palette trigger */}
        <button
          onClick={onOpenPalette}
          className="flex items-center gap-2 h-8 px-3 rounded-lg bg-surface-2 border border-border text-gray-500 hover:text-gray-300 hover:border-border-strong transition-all text-[12px]"
        >
          <Search size={13} />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-surface-3 border border-border rounded text-gray-700">
            ⌘K
          </kbd>
        </button>

        {/* Notifications */}
        <button className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-2 transition-all relative">
          <Bell size={14} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent-blue" />
        </button>

        {/* Refresh */}
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-surface-2 transition-all"
          title="Reload page"
        >
          <RefreshCw size={13} />
        </button>

        {/* Connection dot */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
          <span className="text-[10px] text-gray-600 hidden lg:inline font-mono">API</span>
        </div>
      </div>
    </header>
  )
}
