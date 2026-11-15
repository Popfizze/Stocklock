import { useState, type ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface DataSourceHintProps {
  /** A concise name of the historical claim the hint documents. */
  label: string
  children: ReactNode
  /** Optional anchor to the full list of sources, hypotheses and limits. */
  sourceTarget?: string
}

/** A compact, keyboard-accessible provenance hint for historical statements. */
export function DataSourceHint({ label, children, sourceTarget }: DataSourceHintProps) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Voir la source des données : ${label}`}
          className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => setOpen(true)}
        >
          <CircleHelp aria-hidden="true" className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="max-w-sm space-y-2 leading-relaxed">
        {children}
        {sourceTarget && (
          <a href={`#${sourceTarget}`} className="block font-medium underline underline-offset-2">
            Voir toutes les sources plus bas
          </a>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
