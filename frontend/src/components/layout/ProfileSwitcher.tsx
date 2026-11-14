import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown } from 'lucide-react'
import { usePersonas } from '@/api/personas'
import {
  DropdownMenu,
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

/**
 * The active investor profile, at the foot of the sidebar. Its menu switches
 * straight to another profile, or goes back to the full « Choisir un profil »
 * page (which forgets the current one).
 */
export function ProfileSwitcher() {
  const navigate = useNavigate()
  const { data: personas = [] } = usePersonas()
  const { persona, personaId, choosePersona, forgetPersona } = useActivePersona()
  const name = persona?.name ?? ''

  const handleChangePersona = () => {
    forgetPersona()
    navigate('/choisir-profil')
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={`Profil actif : ${name}`}>
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
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
