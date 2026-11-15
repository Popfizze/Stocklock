import { Pause, Play } from 'lucide-react'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { chooseMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface MotionToggleProps {
  /** Shows the words next to the icon (the deployed sidebar); icon only otherwise. */
  withLabel?: boolean
  className?: string
}

/**
 * « Animations : activées / réduites » — the 3D scenes move and the pages animate by default;
 * this switch reduces them to still frames, and the choice is kept for the next visits.
 */
export function MotionToggle({ withLabel = false, className }: MotionToggleProps) {
  const reduced = usePrefersReducedMotion()
  const label = reduced ? 'Animations : réduites' : 'Animations : activées'
  const Icon = reduced ? Play : Pause

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!reduced}
      aria-label="Animations"
      title={`${label} — cliquez pour ${reduced ? 'les activer' : 'les réduire'}`}
      onClick={() => chooseMotion(reduced ? 'full' : 'reduced')}
      className={cn(
        'inline-flex h-10 min-w-10 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {withLabel && <span className="truncate">{label}</span>}
    </button>
  )
}
