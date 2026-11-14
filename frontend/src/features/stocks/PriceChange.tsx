import { cn } from '@/lib/utils'
import { TREND_TEXT, formatSignedPercent, formatSignedPrice, trendOf } from './format'

interface PriceChangeProps {
  changeAbs: number
  changePct: number
  currency: string
  className?: string
}

/** Day change in $ and %, green up and red down. */
export function PriceChange({ changeAbs, changePct, currency, className }: PriceChangeProps) {
  return (
    <span className={cn('tabular-nums', TREND_TEXT[trendOf(changeAbs)], className)}>
      {formatSignedPrice(changeAbs, currency)} ({formatSignedPercent(changePct)})
    </span>
  )
}
