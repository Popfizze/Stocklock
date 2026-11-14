/**
 * App Layout — the frame of every page reached once a profile is chosen:
 * the sidebar, a slim top bar on small screens (to open it), and the page.
 */

import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />

        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center gap-3 border-b border-border px-4 md:hidden">
            <SidebarTrigger aria-label="Ouvrir le menu" />
            <span className="font-semibold tracking-tight">StockLock</span>
          </div>
          <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
