/**
 * App Layout — the frame of every page reached once a profile is chosen:
 * the sidebar (deployed, or reduced to an icon rail), the button that
 * switches between the two at the junction with the content, a slim top bar
 * on small screens (to open the menu), and the page.
 */

import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { SIDEBAR_ID, readSidebarOpen, storeSidebarOpen } from './sidebarState'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  // Each page mounts its own layout: the state is read back from storage every time.
  const [open, setOpen] = useState(readSidebarOpen)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    storeSidebarOpen(next)
  }

  return (
    <SidebarProvider open={open} onOpenChange={handleOpenChange}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />

        <SidebarInset className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center gap-3 border-b border-border px-4 md:hidden">
            <SidebarTrigger aria-label="Ouvrir le menu" />
            <span className="font-semibold tracking-tight">StockLock</span>
          </div>
          <SidebarCollapseButton />
          <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-8 md:pl-12 lg:px-12 lg:py-10">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

/** Desktop only: reduces the sidebar to its icon rail, or deploys it again. */
function SidebarCollapseButton() {
  const { open, toggleSidebar } = useSidebar()
  const Icon = open ? PanelLeftClose : PanelLeftOpen
  const label = open ? 'Réduire le menu' : 'Déployer le menu'

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-expanded={open}
      aria-controls={SIDEBAR_ID}
      aria-label={label}
      title={label}
      className="absolute top-3.5 left-2 z-20 hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  )
}
