import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { chooseTheme, currentTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  /** Shows the words next to the icon (the deployed sidebar); icon only otherwise. */
  withLabel?: boolean
  className?: string
}

/** Switches between the light and the dark theme; the choice is kept for the next visits. */
export function ThemeToggle({ withLabel = false, className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? 'Passer au thème sombre' : 'Passer au thème clair'
  const Icon = next === 'dark' ? Moon : Sun

  return (
    <button
      type="button"
      onClick={() => {
        chooseTheme(next)
        setTheme(next)
      }}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 min-w-10 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {withLabel && <span className="truncate">{next === 'dark' ? 'Thème sombre' : 'Thème clair'}</span>}
    </button>
  )
}
