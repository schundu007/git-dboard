import { type ReactNode } from 'react'
import { cn } from '../lib/cn'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import Sidebar from './Sidebar'
import Header from './Header'
import { SidebarProvider } from '../contexts/SidebarContext'
import { useSidebar } from '../contexts/SidebarContext'
import { useTheme } from '../contexts/ThemeContext'

function LayoutInner({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const { mobileOpen, closeMobile, collapsed } = useSidebar()

  return (
    <RadixTooltip.Provider delayDuration={200} skipDelayDuration={100}>
      {/*
       * Sidebar is rendered OUTSIDE the flex container so it is never
       * treated as a flex item. On iOS Safari, position:fixed flex children
       * still participate in flex sizing — moving it out avoids that bug.
       * Desktop layout is preserved by a zero-content spacer div below.
       */}
      <Sidebar />

      <div className="flex h-screen overflow-hidden bg-surface">
        {/* Desktop spacer — mirrors sidebar width so main content shifts right */}
        <div className={cn(
          'hidden md:block flex-shrink-0 sidebar-transition',
          collapsed ? 'md:w-[60px]' : 'md:w-[220px]',
        )} />

        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] md:hidden"
            onClick={closeMobile}
            aria-hidden="true"
          />
        )}

        {/* Main column */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 flex flex-col">
            <div className="w-full md:w-[82%] lg:w-[75%] mx-auto flex flex-col flex-1 min-h-0">
              {children}
            </div>
          </main>
        </div>
      </div>

      <Toaster
        position="bottom-right"
        theme={theme}
        toastOptions={{
          style:
            theme === 'dark'
              ? { background: '#111113', border: '1px solid #27272a', color: '#fafafa', fontSize: '13px', borderRadius: '8px' }
              : { background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)', color: '#1d2226', fontSize: '13px', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
        }}
      />
    </RadixTooltip.Provider>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  )
}
