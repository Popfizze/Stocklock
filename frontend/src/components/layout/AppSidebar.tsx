import { Link, useLocation } from 'react-router-dom'
import { FlaskConical, Home, Landmark, PieChart } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { ProfileSwitcher } from './ProfileSwitcher'
import { SIDEBAR_ID } from './sidebarState'

interface NavigationItem {
  title: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  /** Other paths that belong to this entry (a stock's page under the dashboard). */
  matches?: string
}

const NAVIGATION: NavigationItem[] = [
  { title: 'Tableau de bord', path: '/', icon: Home, matches: '/titres/' },
  { title: 'Mon portefeuille', path: '/portefeuille', icon: PieChart },
  { title: 'Comptes', path: '/comptes', icon: Landmark },
  { title: 'Labo', path: '/labo', icon: FlaskConical, matches: '/labo/' },
]

/** Quiet sidebar: the wordmark, the destinations, the active profile. */
export function AppSidebar() {
  const location = useLocation()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  // Navigation uses <Link> (real anchors: middle-click, cmd-click, a11y all
  // work). Only the mobile-drawer close stays behind onClick.
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon" id={SIDEBAR_ID}>
      <SidebarHeader>
        <div className="flex h-9 items-center px-2 group-data-[collapsible=icon]:hidden">
          <span className="text-lg font-semibold tracking-tight">StockLock</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Navigation principale">
              <SidebarMenu>
                {NAVIGATION.map((item) => {
                  const isActive =
                    location.pathname === item.path ||
                    (item.matches !== undefined && location.pathname.startsWith(item.matches))
                  const Icon = item.icon

                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={isCollapsed ? item.title : undefined}
                        className="h-9 text-muted-foreground data-[active=true]:text-foreground group-data-[collapsible=icon]:mx-auto"
                      >
                        <Link
                          to={item.path}
                          onClick={closeMobileSidebar}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <Icon className="size-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <ProfileSwitcher />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
