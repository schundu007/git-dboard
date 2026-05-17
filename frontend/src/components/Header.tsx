import { useLocation } from 'react-router-dom'
import { Search, RefreshCw, Bell, ExternalLink, Sun, Moon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../lib/cn'

import { useTheme } from '../contexts/ThemeContext'
import { getActiveRepo } from '../lib/api'
import GitPulseLogo from './GitPulseLogo'

const ROUTE_META: Record<string, string> = {
  '/':            'Home',
  '/dashboard':   'Dashboard',
  '/prs':         'Source Control',
  '/builds':      'CI Pipeline',
  '/infra':       'Infrastructure',
  '/registry':    'Registry',
  '/action-plan': 'Action Plan',
  '/improvement': 'Action Plan',
  '/monitoring':  'Diagnostics',
  '/analytics':   'Analytics',
  '/security':    'Security',
  '/settings':    'Settings',
  '/scripts':     'Scripts',
  '/playground':  'Playground',
}

interface HeaderProps {
  onOpenPalette?: () => void
}

export default function Header({ onOpenPalette }: HeaderProps) {
  const { pathname } = useLocation()

  const { theme, toggle } = useTheme()
  const { data: activeRepoData } = useQuery({ queryKey: ['active-repo'], queryFn: getActiveRepo, staleTime: 30_000 })
  const repoSlug = activeRepoData?.active?.slug ?? ''
  const pageTitle = ROUTE_META[pathname] ?? repoSlug.split('/')[1] ?? 'GitPulse'

  return (
    <header className={cn(
      'h-[52px] flex-shrink-0 flex items-center gap-3 px-5',
      'border-b border-border bg-surface-1/90 backdrop-blur-sm z-10 sticky top-0',
    )}>

      {/* Mobile logo */}
      <div className="flex-shrink-0 text-nvidia sm:hidden">
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

      {/* Search — LinkedIn pill style */}
      <button
        onClick={onOpenPalette}
        className={cn(
          'hidden sm:flex items-center gap-2.5 h-8 px-3.5 rounded-full',
          'bg-surface-2 border border-border',
          'text-neutral-500 hover:text-neutral-200 hover:border-accent-blue/40',
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
          aria-label="Open command palette"
          className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-surface-2 hover:text-neutral-200 transition-all"
        >
          <Search size={14} />
        </button>

        {/* Bell */}
        <button aria-label="Notifications" className="relative flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-surface-2 hover:text-neutral-200 transition-all">
          <Bell size={14} />
          <span className="absolute top-1.5 right-1.5 w-[5px] h-[5px] rounded-full bg-neutral-500" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-surface-2 hover:text-neutral-200 transition-all"
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Refresh */}
        <button
          onClick={() => window.location.reload()}
          aria-label="Reload page"
          className="flex items-center justify-center w-8 h-8 rounded-full text-neutral-500 hover:bg-surface-2 hover:text-neutral-200 transition-all"
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
    </header>
  )
}
