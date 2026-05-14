import { useLocation } from 'react-router-dom'
import { Search, RefreshCw, Bell, ExternalLink, Sun, Moon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../lib/cn'
import { useSidebar } from '../contexts/SidebarContext'
import { useTheme } from '../contexts/ThemeContext'
import { getActiveRepo } from '../lib/api'

const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/':            { title: 'Dashboard',        description: 'System overview' },
  '/analytics':   { title: 'Analytics',        description: 'Commit and build trends, team velocity' },
  '/security':    { title: 'Security Audit',   description: 'Compliance, vulnerabilities & branch protection' },
  '/prs':         { title: 'PR Hub',            description: 'Pull requests and gate automation' },
  '/builds':      { title: 'Build Pipeline',    description: 'CI workflow runs' },
  '/nightly':     { title: 'Nightly Monitor',   description: 'Nightly build matrix' },
  '/branches':    { title: 'Branch Monitor',    description: 'Branch CI status' },
  '/issues':      { title: 'Issue Hub',         description: 'Open issues and milestones' },
  '/insights':    { title: 'Repo Insights',     description: 'GitHub repository analytics' },
  '/logs':        { title: 'Log Monitor',       description: 'Centralised log search' },
  '/infra':       { title: 'Infra & Runners',   description: 'Self-hosted runners and cluster' },
  '/registry':    { title: 'Registry',          description: 'Container image management' },
  '/health':      { title: 'Health Analysis',   description: 'DORA metrics and pipeline health' },
  '/improvement': { title: 'Improvement Plan',  description: 'Actionable CI/CD improvements' },
  '/tags':        { title: 'Image Tags',        description: 'Tag naming and lifecycle policy' },
  '/monitoring':  { title: 'Monitoring',        description: 'Errors · Warnings · Issues' },
  '/settings':    { title: 'Settings',          description: 'API, theme and preferences' },
}

interface HeaderProps {
  onOpenPalette?: () => void
}

export default function Header({ onOpenPalette }: HeaderProps) {
  const { pathname } = useLocation()
  const { collapsed } = useSidebar()
  const { theme, toggle } = useTheme()
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''
  const meta = ROUTE_META[pathname] ?? { title: repoSlug.split('/')[1] ?? 'Dashboard', description: '' }

  return (
    <header className={cn(
      'h-[56px] flex-shrink-0 flex items-center gap-3 px-5',
      'border-b border-border bg-surface-1/90 backdrop-blur-sm z-10 sticky top-0',
    )}>

      {/* Page identity */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="min-w-0">
          <h1 className={cn(
            'text-[15px] font-semibold leading-none truncate',
            'text-white',  /* overridden to #1d2226 in light mode */
          )}>
            {meta.title}
          </h1>
          {meta.description && (
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate leading-none hidden sm:block">
              {meta.description}
            </p>
          )}
        </div>

        {repoSlug && (
          <a
            href={`https://github.com/${repoSlug}`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'hidden md:flex items-center gap-1 ml-2',
              'text-[11px] font-mono px-2 py-0.5 rounded-full',
              'bg-surface-2 border border-border text-neutral-500',
              'hover:border-accent-blue/40 hover:text-accent-blue transition-all',
            )}
          >
            {repoSlug}
            <ExternalLink size={9} />
          </a>
        )}
      </div>

      {/* Search — LinkedIn pill style */}
      <button
        onClick={onOpenPalette}
        className={cn(
          'hidden sm:flex items-center gap-2.5 h-8 px-3.5 rounded-full',
          'bg-surface-2 border border-border',
          'text-neutral-500 hover:text-neutral-700 hover:border-accent-blue/40',
          'transition-all text-[12px] min-w-[160px]',
        )}
      >
        <Search size={12} className="flex-shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-surface-3 border border-border rounded-md text-neutral-500">
          ⌘K
        </kbd>
      </button>

      {/* Controls */}
      <div className="flex items-center gap-0.5 flex-shrink-0">

        {/* Mobile search */}
        <button
          onClick={onOpenPalette}
          className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-surface-2 hover:text-neutral-700 transition-all"
        >
          <Search size={14} />
        </button>

        {/* Bell */}
        <button className="relative flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-surface-2 hover:text-neutral-700 transition-all">
          <Bell size={14} />
          <span className="absolute top-1.5 right-1.5 w-[5px] h-[5px] rounded-full bg-accent-blue" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-surface-2 hover:text-neutral-700 transition-all"
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Refresh */}
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-surface-2 hover:text-neutral-700 transition-all"
          title="Reload"
        >
          <RefreshCw size={13} />
        </button>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-border">
          <span className="w-[6px] h-[6px] rounded-full bg-accent-green flex-shrink-0" />
          <span className="text-[11px] text-neutral-500 hidden lg:inline font-medium">Live</span>
        </div>
      </div>
    </header>
  )
}
