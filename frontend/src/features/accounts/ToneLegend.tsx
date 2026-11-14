import { cn } from '@/lib/utils'
import { TONE_ORDER, TONES } from './tones'

/** The key of the tax-treatment icons. */
export function ToneLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground', className)} aria-label="Légende">
      {TONE_ORDER.map((tone) => {
        const { icon: Icon, iconClass, label } = TONES[tone]
        return (
          <li key={tone} className="flex items-center gap-1.5">
            <Icon aria-hidden="true" className={cn('size-3.5', iconClass)} />
            {label}
          </li>
        )
      })}
    </ul>
  )
}
