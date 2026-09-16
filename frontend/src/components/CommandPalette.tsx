import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import {
  LayoutDashboard, GitPullRequest, Container, Moon, ScrollText,
  Server, Layers, BarChart2, GitBranch, CircleDot, TrendingUp,
  ShieldCheck, Tag, Lightbulb, Search, ArrowRight, BookOpen,
  Gauge, Rocket, Boxes, FileText, ShieldAlert, Shield, Flame,
  AlertTriangle, Terminal,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'

interface NavEntry {
  group: string
  label: string
  description?: string
  path: string
  icon: LucideIcon
  keywords?: string
}

// Mirrors the sidebar nav (canonical) plus the secondary routes reachable in
// App.tsx, so Cmd+K can reach every page. Keep in sync with Sidebar.tsx.
const NAV_ENTRIES: NavEntry[] = [
  { group: 'Overview',       label: 'Dashboard',       description: 'System overview',                    path: '/dashboard',    icon: LayoutDashboard, keywords: 'home main' },
  { group: 'Overview',       label: 'Action Plan',     description: 'CI/CD improvement plan & target state', path: '/action-plan', icon: Lightbulb,       keywords: 'improvement optimize target state roadmap plan' },
  { group: 'Overview',       label: 'Infra Gap',       description: 'Infra & security posture vs target', path: '/infra-gap',    icon: Gauge,           keywords: 'gap readiness aws security posture analyze' },
  { group: 'Overview',       label: 'Provisioning',    description: 'Provision infra via CI dispatch',    path: '/provisioning', icon: Rocket,          keywords: 'provision terraform apply plan dispatch fork' },

  { group: 'Source Control', label: 'Source Control',  description: 'Pull requests & gate automation',    path: '/prs',          icon: GitPullRequest,  keywords: 'pr pull request review merge' },
  { group: 'Source Control', label: 'Bump PRs',        description: 'Dependency bump PRs',                path: '/bumps',        icon: Boxes,           keywords: 'dependency bump submodule update bot' },
  { group: 'Source Control', label: 'Issues',          description: 'Open issues & milestones',           path: '/issues',       icon: CircleDot,       keywords: 'bug task ticket milestone' },
  { group: 'Source Control', label: 'Branch Monitor',  description: 'Branch CI status',                   path: '/branches',     icon: GitBranch,       keywords: 'git branch' },

  { group: 'CI / CD',        label: 'CI Pipeline',     description: 'Workflow runs',                      path: '/builds',       icon: Container,       keywords: 'build ci workflow actions pipeline' },
  { group: 'CI / CD',        label: 'Release Notes',   description: 'Generate release notes',             path: '/release-notes', icon: FileText,       keywords: 'release notes changelog compare' },
  { group: 'CI / CD',        label: 'Sanitizers',      description: 'ASAN / TSAN / UBSAN runs',           path: '/sanitizers',   icon: ShieldAlert,     keywords: 'asan tsan ubsan msan lsan sanitizer' },
  { group: 'CI / CD',        label: 'Registry',        description: 'Container image management',         path: '/registry',     icon: Layers,          keywords: 'docker image container ecr ghcr' },
  { group: 'CI / CD',        label: 'Nightly Monitor', description: 'Nightly build matrix',               path: '/nightly',      icon: Moon,            keywords: 'nightly cron schedule matrix' },
  { group: 'CI / CD',        label: 'Image Tags',      description: 'Tag naming & lifecycle',             path: '/tags',         icon: Tag,             keywords: 'tag docker ghcr registry lifecycle' },

  { group: 'Infrastructure', label: 'Infrastructure',  description: 'Self-hosted runners & cluster',      path: '/infra',        icon: Server,          keywords: 'runner gpu server slurm cluster' },
  { group: 'Infrastructure', label: 'Security',        description: 'Security posture & compliance',      path: '/security',     icon: Shield,          keywords: 'security compliance audit vulnerability' },
  { group: 'Infrastructure', label: 'Health & DORA',   description: 'DORA metrics & pipeline health',     path: '/health',       icon: ShieldCheck,     keywords: 'dora metrics health slo performance' },

  { group: 'Observability',  label: 'Failures',        description: 'Failure patterns & analytics',       path: '/failures',     icon: Flame,           keywords: 'failure error flaky pattern' },
  { group: 'Observability',  label: 'Error Monitor',   description: 'Errors, failing runs, diagnostics',  path: '/monitoring',   icon: AlertTriangle,   keywords: 'error diagnostics logs failing' },
  { group: 'Observability',  label: 'Analytics',       description: 'Commit & build trends',              path: '/analytics',    icon: BarChart2,       keywords: 'analytics charts trends stats' },
  { group: 'Observability',  label: 'Repo Insights',   description: 'GitHub repository analytics',        path: '/insights',     icon: TrendingUp,      keywords: 'contributors forks pulse commits' },
  { group: 'Observability',  label: 'Log Monitor',     description: 'Centralised log search',             path: '/logs',         icon: ScrollText,      keywords: 'logs errors warning search' },

  { group: 'Tools',          label: 'Scripts',         description: 'Bash/Python script analysis & Q&A',  path: '/scripts',      icon: BookOpen,        keywords: 'automations bash python yaml scripts bugs' },
  { group: 'Tools',          label: 'Playground',      description: 'Script analysis playground',         path: '/playground',   icon: Terminal,        keywords: 'playground paste analyze lint' },
]

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const runItem = useCallback((path: string) => {
    navigate(path)
    onOpenChange(false)
    setSearch('')
  }, [navigate, onOpenChange])

  // Cmd+K global shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open, onOpenChange])

  // Group entries
  const groups = Array.from(new Set(NAV_ENTRIES.map(e => e.group)))

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />

        {/* Panel */}
        <Dialog.Content
          className={cn(
            'fixed top-[18%] left-1/2 -translate-x-1/2 z-50 w-full max-w-[560px] px-4',
            'animate-scale-in',
          )}
          aria-label="Command palette"
        >
          <Command
            className="rounded-xl overflow-hidden shadow-palette border border-border bg-surface-1"
            loop
            shouldFilter={true}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 border-b border-border">
              <Search size={15} className="text-gray-400 flex-shrink-0" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search pages, features…"
                className="flex-1 h-14 bg-transparent text-[15px] text-gray-200 placeholder:text-gray-400 outline-none border-none"
              />
              <kbd className="flex-shrink-0 text-[10px] font-mono text-gray-400 bg-surface-3 border border-border rounded px-1.5 py-0.5">
                ESC
              </kbd>
            </div>

            <Command.List className="max-h-[380px] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center space-y-1">
                <p className="text-sm text-gray-400">No match for &ldquo;{search}&rdquo;</p>
                <p className="text-[11px] text-gray-400 font-mono">try: builds · nightly · runners · logs</p>
              </Command.Empty>

              {groups.map((group) => {
                const entries = NAV_ENTRIES.filter(e => e.group === group)
                return (
                  <Command.Group key={group} heading={group}>
                    {entries.map((entry) => (
                      <Command.Item
                        key={entry.path}
                        value={`${entry.label} ${entry.description} ${entry.keywords ?? ''}`}
                        onSelect={() => runItem(entry.path)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 group-aria-selected:bg-accent-blue/10 group-aria-selected:border-accent-blue/25 transition-colors">
                          <entry.icon size={13} className="text-gray-500 group-aria-selected:text-accent-blue" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-300 group-aria-selected:text-white truncate">
                            {entry.label}
                          </p>
                          {entry.description && (
                            <p className="text-[11px] text-gray-400 truncate">{entry.description}</p>
                          )}
                        </div>
                        <ArrowRight size={12} className="text-gray-400 group-aria-selected:text-accent-blue flex-shrink-0 opacity-0 group-aria-selected:opacity-100 transition-all" />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )
              })}
            </Command.List>

            {/* Footer */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border bg-surface-2/50">
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <kbd className="font-mono bg-surface-3 border border-border rounded px-1 py-0.5">↑↓</kbd> navigate
              </span>
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <kbd className="font-mono bg-surface-3 border border-border rounded px-1 py-0.5">↵</kbd> open
              </span>
              <span className="text-[10px] text-gray-400 flex items-center gap-1 ml-auto">
                <kbd className="font-mono bg-surface-3 border border-border rounded px-1 py-0.5">ESC</kbd> close
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
