import { CircleAlert, CircleCheck, CircleMinus, type LucideIcon } from 'lucide-react'
import type { Tone } from './comparison'

/** How a tax treatment reads: an icon and its label, never color alone. */
export const TONES: Record<Tone, { icon: LucideIcon; iconClass: string; box: string; label: string }> = {
  advantage: {
    icon: CircleCheck,
    iconClass: 'text-success',
    box: 'border-success/30 bg-success/5',
    label: 'Avantage fiscal',
  },
  neutral: {
    icon: CircleMinus,
    iconClass: 'text-muted-foreground',
    box: 'border-border bg-muted/40',
    label: 'Neutre ou reporté',
  },
  tax: {
    icon: CircleAlert,
    iconClass: 'text-warning',
    box: 'border-warning/30 bg-warning/5',
    label: 'Impôt ou perte',
  },
}

export const TONE_ORDER: Tone[] = ['advantage', 'neutral', 'tax']
