import { CartesianGrid, Line, LineChart, ReferenceDot, XAxis, YAxis } from 'recharts'
import type { StockMovesResult } from '@/api/moves'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatLongDate } from './format'
import { signedRatio } from './movesMeta'

interface MovesChartProps {
  result: StockMovesResult
}

/**
 * Cumulative return of the title and of its index over the period, from 0 at
 * the start; a dot marks each session where the title moved beyond 2 σ of what
 * its index predicts.
 */
export function MovesChart({ result }: MovesChartProps) {
  const benchmark = result.benchmark ?? 'Indice'
  const config: ChartConfig = {
    asset: { label: result.ticker, color: 'var(--chart-1)' },
    benchmark: { label: benchmark, color: 'var(--chart-2)' },
  }
  const byDate = new Map(result.series.map((point) => [point.date, point.asset]))
  const dots = result.moves.flatMap((move) => {
    const y = byDate.get(move.date)
    return y === undefined || y === null ? [] : [{ date: move.date, y }]
  })

  return (
    <figure className="space-y-2">
      <ChartContainer
        config={config}
        aria-label={`Rendement cumulé de ${result.ticker} et de ${benchmark} du ${formatLongDate(result.window.start)} au ${formatLongDate(result.window.end)}`}
        className="aspect-auto h-64 w-full sm:h-72"
      >
        <LineChart data={result.series} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tickFormatter={(date: string) => date.slice(0, 7)}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${Math.round(value * 100)} %`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const date = payload?.[0]?.payload?.date
                  return typeof date === 'string' ? formatLongDate(date) : ''
                }}
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
                    <span className="font-medium tabular-nums text-foreground">{signedRatio(Number(value))}</span>
                  </span>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="benchmark" type="monotone" stroke="var(--color-benchmark)" strokeWidth={1.5}
            strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line dataKey="asset" type="monotone" stroke="var(--color-asset)" strokeWidth={2}
            dot={false} isAnimationActive={false} />
          {dots.map((dot) => (
            <ReferenceDot key={dot.date} x={dot.date} y={dot.y} r={4} fill="var(--color-asset)"
              stroke="var(--background)" strokeWidth={2} ifOverflow="extendDomain" />
          ))}
        </LineChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">
        Les points marquent les {dots.length} séance{dots.length > 1 ? 's' : ''} où l’écart avec ce que prévoit l’indice dépasse 2 σ.
        Rendements ajustés des dividendes, calculés sur les séances communes au titre et à l’indice.
      </figcaption>
    </figure>
  )
}
