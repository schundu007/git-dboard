import { useState, type ReactNode } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import Sidebar from './Sidebar'
import Header from './Header'
import CommandPalette from './CommandPalette'
import { SidebarProvider } from '../contexts/SidebarContext'

export default function Layout({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  return (
    <SidebarProvider>
      <RadixTooltip.Provider delayDuration={200} skipDelayDuration={100}>
        <div className="flex h-screen overflow-hidden bg-surface">
          <Sidebar />

          {/* Main column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header onOpenPalette={() => setPaletteOpen(true)} />
            <main className="flex-1 overflow-y-auto p-5">
              {children}
            </main>
          </div>
        </div>

        {/* Global overlays */}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: '#0d1117',
              border: '1px solid #1e2d45',
              color: '#e2e8f0',
              fontSize: '13px',
              borderRadius: '10px',
            },
          }}
        />
      </RadixTooltip.Provider>
    </SidebarProvider>
  )
}
