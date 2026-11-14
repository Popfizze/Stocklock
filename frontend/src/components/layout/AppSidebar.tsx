import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FlaskConical, Home, Landmark, User, Users } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { useActivePersona } from '@/features/personas/activePersona'
import { cn } from '@/lib/utils'

interface NavigationSection {
  title: string
  items: NavigationItem[]
}

interface NavigationItem {
  title: string
  path: string
  icon: React.ComponentType<{ className?: string }>
}

const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    title: 'Principal',
    items: [
      {
        title: 'Menu principal',
        path: '/',
        icon: Home,
      },
      {
        title: 'Comptes',
        path: '/comptes',
        icon: Landmark,
      },
      {
        title: 'Labo',
        path: '/labo',
        icon: FlaskConical,
      },
    ],
  },
]

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { persona, forgetPersona } = useActivePersona()
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar()

  const isCollapsed = state === 'collapsed'
  const personaName = persona?.name ?? ''

  // Navigation uses <Link> (real anchors: middle-click, cmd-click, a11y all
  // work) — the frontend skill's own rule. Only the mobile-drawer close
  // stays behind onClick.
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const handleChangePersona = () => {
    forgetPersona()
    navigate('/choisir-profil')
  }

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader>
        <div className="flex h-8 items-center px-2 pt-1 pb-3 group-data-[collapsible=icon]:hidden">
          <span className="text-lg font-semibold tracking-tight">StockLock</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAVIGATION_SECTIONS.map((section, sectionIndex) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path
                  const Icon = item.icon

                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={isCollapsed ? item.title : undefined}
                        className={cn(
                          'w-full justify-start',
                          isActive &&
                            'bg-primary text-primary-foreground hover:bg-primary/90 font-medium',
                        )}
                      >
                        <Link to={item.path} onClick={closeMobileSidebar}>
                          <Icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
            {sectionIndex < NAVIGATION_SECTIONS.length - 1 && <SidebarSeparator />}
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        {/* Active profile row */}
        <div className="flex items-center gap-3 transition-all duration-200 group-data-[collapsible=icon]:px-0">
          <button
            type="button"
            onClick={isCollapsed ? toggleSidebar : undefined}
            className={cn(
              'relative flex h-8 w-8 shrink-0 items-center justify-center group-data-[collapsible=icon]:mx-auto',
              isCollapsed && 'cursor-pointer hover:opacity-80',
            )}
            title={isCollapsed ? 'Ouvrir le menu' : personaName}
            aria-label={isCollapsed ? 'Ouvrir le menu' : `Profil actif : ${personaName}`}
          >
            {/* Circular background - fades out when collapsed */}
            <div className="absolute inset-0 rounded-full bg-primary transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0" />
            {/* Icon - decorative; the button's aria-label carries the meaning */}
            <User
              aria-hidden="true"
              className="relative h-5 w-5 text-primary-foreground transition-colors duration-200 group-data-[collapsible=icon]:text-sidebar-foreground"
            />
          </button>
          <div className="flex-1 min-w-0 overflow-hidden transition-all duration-200 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
            <p className="text-sm font-medium truncate">{personaName}</p>
          </div>
        </div>
        {/* Change profile button */}
        <div className="overflow-hidden transition-all duration-200 group-data-[collapsible=icon]:h-0 group-data-[collapsible=icon]:opacity-0">
          <Button
            onClick={handleChangePersona}
            variant="outline"
            className="w-full justify-start"
            size="sm"
          >
            <Users className="h-4 w-4 mr-2" />
            Changer de profil
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
