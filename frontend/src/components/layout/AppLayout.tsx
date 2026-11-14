/**
 * App Layout — wrapper for every page reached once a profile is chosen,
 * with the sidebar navigation.
 */

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />

        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          {/* Main content area */}
          <div className="flex-1 overflow-y-auto">
            <main className="container mx-auto p-6">{children}</main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
