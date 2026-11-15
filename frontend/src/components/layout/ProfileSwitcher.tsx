import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown } from 'lucide-react'
import { usePersonas } from '@/api/personas'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useActivePersona } from '@/features/personas/activePersona'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { chooseMotion } from '@/lib/motion'
import { chooseTheme, currentTheme } from '@/lib/theme'

interface ProfileSwitcherProps {
  /**
   * Also offers the display settings (animations, theme) in the menu: the sidebar reduced to a
   * rail keeps this one button at its foot instead of three.
   */
  withSettings?: boolean
}

/**
 * The active investor profile, at the foot of the sidebar. Its menu switches
 * straight to another profile, or goes back to the full « Choisir un profil »
 * page (which forgets the current one). In the rail it is also where the display
 * settings are.
 */
export function ProfileSwitcher({ withSettings = false }: ProfileSwitcherProps) {
  const navigate = useNavigate()
  const { data: personas = [] } = usePersonas()
  const { persona, personaId, choosePersona, forgetPersona } = useActivePersona()
  const name = persona?.name ?? ''
  const reducedMotion = usePrefersReducedMotion()
  // Read again each time the menu opens: the theme may have been changed from the deployed sidebar.
  const [dark, setDark] = useState(() => currentTheme() === 'dark')

  const handleChangePersona = () => {
    forgetPersona()
    navigate('/choisir-profil')
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={(open) => open && setDark(currentTheme() === 'dark')}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={`Profil actif : ${name}`}
              tooltip={withSettings ? `${name} · profil et affichage` : undefined}
              className="group-data-[collapsible=icon]:mx-auto"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium"
              >
                {name.charAt(0)}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">Profil d'investisseur</span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Profils
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={personaId ?? ''} onValueChange={choosePersona}>
              {personas.map((candidate) => (
                <DropdownMenuRadioItem key={candidate.id} value={candidate.id}>
                  <span className="flex-1">{candidate.name}</span>
                  <span className="text-xs text-muted-foreground">{candidate.age} ans</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleChangePersona}>Changer de profil</DropdownMenuItem>
            {withSettings && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Affichage</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={!reducedMotion}
                  onCheckedChange={(checked) => chooseMotion(checked ? 'full' : 'reduced')}
                >
                  Animations
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={dark}
                  onCheckedChange={(checked) => {
                    chooseTheme(checked ? 'dark' : 'light')
                    setDark(checked)
                  }}
                >
                  Thème sombre
                </DropdownMenuCheckboxItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
