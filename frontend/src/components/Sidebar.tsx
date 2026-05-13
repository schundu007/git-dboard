import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, GitPullRequest, Container, Moon, ScrollText,
  Server, Layers, BarChart2, GitBranch, CircleDot, TrendingUp,
  ShieldCheck, Cpu, Tag, Lightbulb, ChevronLeft, ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { useSidebar } from '../contexts/SidebarContext'
import { Tooltip } from './ui/Tooltip'
import * as RadixTooltip from '@radix-ui/react-tooltip'

type NavItem = {
  to: string
  icon: LucideIcon
  label: string
  exact?: boolean
  badge?: string
}
type NavSection = { label: string; items: NavItem[] }

const NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    ],
  },
  {
    label: 'Source Control',
    items: [
      { to: '/prs',      icon: GitPullRequest, label: 'PR Hub' },
      { to: '/issues',   icon: CircleDot,      label: 'Issues' },
      { to: '/branches', icon: GitBranch,      label: 'Branches' },
    ],
  },
  {
    label: 'CI / CD',
    items: [
      { to: '/builds',   icon: Container, label: 'Builds' },
      { to: '/nightly',  icon: Moon,      label: 'Nightly' },
      { to: '/registry', icon: Layers,    label: 'Registry' },
      { to: '/tags',     icon: Tag,       label: 'Image Tags' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/infra',       icon: Server,      label: 'Runners' },
      { to: '/health',      icon: ShieldCheck, label: 'Health' },
      { to: '/improvement', icon: Lightbulb,   label: 'Improvements' },
    ],
  },
  {
    label: 'Observability',
    items: [
      { to: '/logs',      icon: ScrollText, label: 'Logs' },
      { to: '/analytics', icon: BarChart2,  label: 'Analytics' },
      { to: '/insights',  icon: TrendingUp, label: 'Insights' },
    ],
  },
]

function NavItemRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation()
  const isActive = item.exact
    ? location.pathname === item.to
    : location.pathname.startsWith(item.to) && item.to !== '/'

  const iconEl = (
    <item.icon
      size={15}
      className={cn(
        'flex-shrink-0 transition-colors',
        isActive ? 'text-accent-blue' : 'text-gray-500 group-hover:text-gray-300',
      )}
    />
  )

  const linkContent = (
    <NavLink
      to={item.to}
      end={item.exact}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg transition-all duration-150 select-none',
        collapsed ? 'justify-center h-9 w-9 mx-auto' : 'px-2.5 py-1.5 mx-2',
        isActive
          ? 'bg-accent-blue/12 text-accent-blue before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-accent-blue before:rounded-r'
          : 'text-gray-400 hover:text-gray-200 hover:bg-surface-2',
      )}
    >
      {iconEl}
      {!collapsed && (
        <span className="text-[13px] font-medium truncate">{item.label}</span>
      )}
      {!collapsed && item.badge && (
        <span className="ml-auto text-[10px] font-semibold bg-surface-3 text-gray-400 border border-border rounded-full px-1.5 py-0.5 leading-none">
          {item.badge}
        </span>
      )}
    </NavLink>
  )

  if (collapsed) {
    return (
      <Tooltip content={item.label} side="right" delayDuration={100}>
        {linkContent}
      </Tooltip>
    )
  }

  return linkContent
}

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar()

  return (
    <aside
      className={cn(
        'sidebar-transition relative flex-shrink-0 flex flex-col',
        'bg-surface-1 border-r border-border h-screen overflow-hidden',
        collapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      {/* ── Brand ─────────────────────────────────────────────────────── */}
      <div className={cn(
        'flex items-center border-b border-border flex-shrink-0',
        collapsed ? 'justify-center h-[52px]' : 'gap-2.5 px-4 h-[52px]',
      )}>
        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center">
          <Cpu size={13} className="text-accent-blue" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[13px] font-semibold tracking-tight text-white leading-none">IsaacLab</p>
            <p className="text-[10px] text-gray-600 font-mono mt-0.5">DevOps Platform</p>
          </div>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        <RadixTooltip.Provider delayDuration={100}>
          {NAV.map((section) => (
            <div key={section.label} className={cn('mb-1', collapsed ? 'mt-1' : 'mt-2')}>
              {!collapsed && (
                <p className="px-4 pt-2 pb-1 text-[9px] font-bold tracking-[0.1em] text-gray-700 uppercase">
                  {section.label}
                </p>
              )}
              {collapsed && <div className="mx-3 mb-1 h-px bg-border-subtle" />}
              <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center gap-0.5 px-0')}>
                {section.items.map((item) => (
                  <NavItemRow key={item.to} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </RadixTooltip.Provider>
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className={cn(
        'border-t border-border flex-shrink-0',
        collapsed ? 'py-2 flex flex-col items-center gap-1.5' : 'px-3 py-2.5',
      )}>
        {!collapsed && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            <span className="text-[10px] text-gray-600 font-mono">isaac-sim/IsaacLab</span>
          </div>
        )}

        {/* Kbd shortcut hint */}
        {!collapsed && (
          <div className="flex items-center gap-1.5 mb-2">
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-surface-3 border border-border rounded text-gray-600">⌘K</kbd>
            <span className="text-[10px] text-gray-700">command palette</span>
          </div>
        )}

        {/* Collapse toggle */}
        <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right" delayDuration={100}>
          <button
            onClick={toggle}
            className={cn(
              'flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-300 hover:bg-surface-2 transition-all',
              collapsed ? 'w-8 h-8' : 'w-full h-7 gap-1.5 px-2 text-[11px]',
            )}
          >
            {collapsed
              ? <ChevronRight size={13} />
              : <><ChevronLeft size={11} /><span>Collapse</span></>
            }
          </button>
        </Tooltip>
      </div>
    </aside>
  )
}
