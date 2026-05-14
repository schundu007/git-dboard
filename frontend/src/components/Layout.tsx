import { useState, type ReactNode } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import Sidebar from './Sidebar'
import Header from './Header'
import RightSidebar from './RightSidebar'
import CommandPalette from './CommandPalette'
import { SidebarProvider } from '../contexts/SidebarContext'
import { useTheme } from '../contexts/ThemeContext'

export default function Layout({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { theme } = useTheme()

  return (
    <SidebarProvider>
      <RadixTooltip.Provider delayDuration={200} skipDelayDuration={100}>
        <div className="flex h-screen overflow-hidden bg-surface" style={{ width: '80vw', margin: '0 auto' }}>
          <Sidebar />

          {/* Main column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header onOpenPalette={() => setPaletteOpen(true)} />
            <main className="flex-1 overflow-y-auto p-5">
              {children}
            </main>
          </div>

          <RightSidebar />
        </div>

        {/* Global overlays */}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
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
    </SidebarProvider>
  )
}
