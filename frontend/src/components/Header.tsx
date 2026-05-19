import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, Bell, ExternalLink, Sun, Moon, Menu, X, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../lib/cn'

import { useTheme } from '../contexts/ThemeContext'
import { useSidebar } from '../contexts/SidebarContext'
import { getActiveRepo } from '../lib/api'
import GitPulseLogo from './GitPulseLogo'
import CommandPalette from './CommandPalette'

const ROUTE_META: Record<string, string> = {
  '/':            'Home',
  '/dashboard':   'Dashboard',
  '/prs':         'Source Control',
  '/builds':      'CI Pipeline',
  '/infra':       'Infrastructure',
  '/registry':    'Registry',
  '/action-plan': 'Action Plan',
  '/improvement': 'Action Plan',
  '/monitoring':  'Error Monitor',
  '/analytics':   'Analytics',
  '/security':    'Security',
  '/settings':    'Settings',
  '/scripts':     'Scripts',
  '/playground':  'Playground',
}

export default function Header() {
  const { pathname } = useLocation()
  const [cmdOpen, setCmdOpen] = useState(false)

  const { theme, toggle } = useTheme()
  const { mobileOpen, toggleMobile } = useSidebar()
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''
  const pageTitle = ROUTE_META[pathname] ?? repoSlug.split('/')[1] ?? 'GitPulse'

  return (
    <header className={cn(
      'h-[52px] flex-shrink-0 flex items-center gap-3 px-4',
      'border-b border-border bg-surface-1/90 backdrop-blur-sm z-10 sticky top-0',
    )}>

      {/* Mobile hamburger */}
      <button
        className="flex md:hidden items-center justify-center w-9 h-9 -ml-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-surface-2 transition-all"
        onClick={toggleMobile}
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
      >
        {mobileOpen ? <X size={16} /> : <Menu size={16} />}
      </button>

      {/* Mobile logo */}
      <div className="flex-shrink-0 text-nvidia md:hidden">
        <GitPulseLogo size={18} />
      </div>

      {/* Page title */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <h1 className="text-[15px] font-semibold leading-none truncate text-white">
          {pageTitle}
        </h1>

        {repoSlug && (
          <a
            href={`https://github.com/${repoSlug}`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'hidden md:flex items-center gap-1 ml-2',
              'text-[11px] font-mono px-2 py-0.5 rounded-full',
              'bg-surface-2 border border-border text-neutral-500',
              'hover:border-border-strong hover:text-neutral-200 transition-all',
            )}
          >
            {repoSlug}
            <ExternalLink size={9} />
          </a>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-0.5 flex-shrink-0">

        {/* Command palette trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          aria-label="Open command palette"
          className="hidden sm:flex items-center gap-2 h-9 md:h-8 px-2.5 rounded-md text-neutral-500 hover:bg-surface-2 hover:text-neutral-300 transition-all border border-transparent hover:border-border"
          title="Search (⌘K)"
        >
          <Search size={13} />
          <kbd className="hidden lg:inline text-[9px] font-mono text-neutral-600 bg-surface-2 border border-border rounded px-1">⌘K</kbd>
        </button>

        {/* Bell */}
        <button aria-label="Notifications" className="relative flex items-center justify-center w-9 h-9 md:w-8 md:h-8 rounded-md text-neutral-500 hover:bg-surface-2 hover:text-neutral-200 transition-all">
          <Bell size={14} />
          <span className="absolute top-2 right-2 md:top-1.5 md:right-1.5 w-[5px] h-[5px] rounded-full bg-neutral-500" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center w-9 h-9 md:w-8 md:h-8 rounded-md text-neutral-500 hover:bg-surface-2 hover:text-neutral-200 transition-all"
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Refresh */}
        <button
          onClick={() => window.location.reload()}
          aria-label="Reload page"
          className="flex items-center justify-center w-9 h-9 md:w-8 md:h-8 rounded-md text-neutral-500 hover:bg-surface-2 hover:text-neutral-200 transition-all"
          title="Reload"
        >
          <RefreshCw size={13} />
        </button>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-border">
          <span className="relative flex-shrink-0 w-[6px] h-[6px]">
            <span className="block w-full h-full rounded-full bg-accent-green" />
            <span className="absolute inset-0 rounded-full bg-accent-green animate-ping opacity-40"
                  style={{ animationDuration: '2.5s' }} />
          </span>
          <span className="text-[11px] text-neutral-500 hidden lg:inline font-medium">Live</span>
        </div>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </header>
  )
}
