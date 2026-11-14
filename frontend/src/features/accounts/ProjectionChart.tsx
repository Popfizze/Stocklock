import { CartesianGrid, Line, LineChart, ReferenceArea, XAxis, YAxis } from 'recharts'
import type { AccountId, AccountOutcome, SeriesPoint } from '@/api/accounts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AccountLabel, AccountSwatch } from './AccountLabel'
import { ACCOUNTS } from './accountMeta'
import { formatCompactMoney, formatMoney } from './format'

const CONFIG: ChartConfig = Object.fromEntries(
  Object.values(ACCOUNTS).map((meta) => [meta.key, { label: meta.short, color: meta.color }]),
)

const KEY_TO_ACCOUNT: Record<string, AccountId> = Object.fromEntries(
  Object.values(ACCOUNTS).map((meta) => [meta.key, meta.id]),
)

interface ProjectionChartProps {
  series: SeriesPoint[]
  accounts: AccountOutcome[]
  /** The profile's horizon, shaded when shorter than the simulation. */
  horizon?: { label: string; from: number; to: number }
}

/** After-tax value of each account, year by year (2px lines, hover crosshair). */
export function ProjectionChart({ series, accounts, horizon }: ProjectionChartProps) {
  const eligible = accounts.filter((account) => account.eligible)
  const years = series.length
  const data = series.map((point) => ({
    year: point.year,
    ...Object.fromEntries(eligible.map((a) => [ACCOUNTS[a.account].key, point[a.account]])),
  }))
  const showHorizon = horizon && horizon.to < years

  return (
    <figure className="space-y-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Légende">
        {eligible.map((account) => (
          <li key={account.account} className="flex items-center gap-2">
            <AccountLabel account={account.account} />
            <span className="font-semibold tabular-nums">{formatMoney(account.after_tax)}</span>
          </li>
        ))}
      </ul>
      <ChartContainer config={CONFIG} className="aspect-auto h-72 w-full sm:h-80">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(year: number) => `${year} an${year > 1 ? 's' : ''}`}
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(value: number) => formatCompactMoney(value)}
          />
          {showHorizon && (
            <ReferenceArea
              x1={horizon.from}
              x2={horizon.to}
              fill="var(--muted)"
              fillOpacity={0.8}
              label={{ value: horizon.label, position: 'insideTop', className: 'fill-muted-foreground text-xs' }}
            />
          )}
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const year = Number(payload?.[0]?.payload?.year ?? 0)
                  return `Retrait après ${year} an${year > 1 ? 's' : ''}`
                }}
                formatter={(value, name) => (
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <AccountSwatch account={KEY_TO_ACCOUNT[String(name)]} />
                      {ACCOUNTS[KEY_TO_ACCOUNT[String(name)]].short}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMoney(Number(value))}
                    </span>
                  </span>
                )}
              />
            }
          />
          {eligible.map((account) => {
            const key = ACCOUNTS[account.account].key
            return (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
                isAnimationActive={false}
              />
            )
          })}
        </LineChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">
        Ce qui resterait si tout était retiré à la fin de chaque année, impôt payé. Survolez le
        graphique pour lire les valeurs.
      </figcaption>
    </figure>
  )
}
