import { useState, useEffect, type ReactNode } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { Toaster, toast } from 'sonner'
import Sidebar from './Sidebar'
import Header from './Header'
import CommandPalette from './CommandPalette'
import { SidebarProvider } from '../contexts/SidebarContext'
import { useTheme } from '../contexts/ThemeContext'

export default function Layout({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { theme } = useTheme()

  // Konami code Easter egg
  useEffect(() => {
    const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']
    let pos = 0
    const handler = (e: KeyboardEvent) => {
      pos = e.key === seq[pos] ? pos + 1 : (e.key === seq[0] ? 1 : 0)
      if (pos === seq.length) {
        toast('↑↑↓↓←→←→ BA — robot.sim(universe="perfect") 🤖', {
          duration: 4000,
          style: { fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' },
        })
        pos = 0
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <SidebarProvider>
      <RadixTooltip.Provider delayDuration={200} skipDelayDuration={100}>
        <div className="flex h-screen overflow-hidden bg-surface">
          <Sidebar />

          {/* Main column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header onOpenPalette={() => setPaletteOpen(true)} />
            <main className="flex-1 overflow-y-auto p-4 flex flex-col">
              <div className="w-[75%] mx-auto flex flex-col flex-1 min-h-0">
                {children}
              </div>
            </main>
          </div>
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
