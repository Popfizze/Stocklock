import { Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { PricePoint, StockRange } from '@/api/stocks'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import {
  TREND_COLOR,
  TREND_TEXT,
  formatLongDate,
  formatPrice,
  formatSignedPercent,
  trendOf,
} from './format'

const RANGES: Array<{ value: StockRange; label: string; name: string }> = [
  { value: '1W', label: '1S', name: '1 semaine' },
  { value: '1M', label: '1M', name: '1 mois' },
  { value: '3M', label: '3M', name: '3 mois' },
  { value: '1Y', label: '1A', name: '1 an' },
  { value: 'MAX', label: 'Max', name: 'tout l’historique' },
]

interface PriceChartProps {
  points: PricePoint[]
  currency: string
  range: StockRange
  onRangeChange: (range: StockRange) => void
  /** The previous period stays drawn while the selected one loads. */
  isUpdating?: boolean
}

/**
 * Closing price over the selected period, green when it ended up and red when
 * it ended down, with the period's change and a dotted line at its first close.
 */
export function PriceChart({ points, currency, range, onRangeChange, isUpdating }: PriceChartProps) {
  const closes = points.map((point) => point.close)
  const first = closes[0]
  const last = closes[closes.length - 1]
  const drawable = closes.length > 1
  const trend = drawable ? trendOf(last - first) : 'flat'
  const config: ChartConfig = { close: { label: 'Clôture', color: TREND_COLOR[trend] } }
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const pad = (max - min) * 0.05 || max * 0.01
  const rangeName = RANGES.find((candidate) => candidate.value === range)?.name ?? range

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm tabular-nums">
          {drawable && first !== 0 && (
            <span className={cn('font-medium', TREND_TEXT[trend])}>
              {formatSignedPercent(((last - first) / first) * 100)}{' '}
            </span>
          )}
          <span className="text-muted-foreground">sur {rangeName}</span>
        </p>
        <div role="group" aria-label="Période du graphique" className="flex flex-wrap gap-1">
          {RANGES.map((candidate) => (
            <Button
              key={candidate.value}
              type="button"
              size="sm"
              variant={candidate.value === range ? 'secondary' : 'ghost'}
              aria-pressed={candidate.value === range}
              title={candidate.name}
              onClick={() => onRangeChange(candidate.value)}
            >
              {candidate.label}
            </Button>
          ))}
        </div>
      </div>

      {drawable ? (
        <ChartContainer
          config={config}
          aria-label={`Cours de clôture sur ${rangeName}`}
          className={cn('aspect-auto h-64 w-full transition-opacity sm:h-80', isUpdating && 'opacity-60')}
        >
          <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} accessibilityLayer>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={[min - pad, max + pad]} />
            <ReferenceLine y={first} stroke="var(--border)" strokeDasharray="3 4" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const date = payload?.[0]?.payload?.date
                    return typeof date === 'string' ? formatLongDate(date) : ''
                  }}
                  formatter={(value) => (
                    <span className="font-medium tabular-nums text-foreground">
                      {formatPrice(Number(value), currency)}
                    </span>
                  )}
                />
              }
            />
            <Line
              dataKey="close"
              type="monotone"
              stroke="var(--color-close)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      ) : (
        <p className="flex h-40 items-center justify-center rounded-xl border border-border text-sm text-muted-foreground">
          Pas assez de cours sur cette période pour tracer une courbe.
        </p>
      )}
    </div>
  )
}
