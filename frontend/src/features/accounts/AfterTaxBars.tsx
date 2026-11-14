import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts'
import type { AccountOutcome } from '@/api/accounts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { ACCOUNTS } from './accountMeta'
import { formatMoney } from './format'

const CONFIG: ChartConfig = { value: { label: 'Après impôt' } }

interface AfterTaxBarsProps {
  accounts: AccountOutcome[]
  years: number
}

/** What is left after tax at the horizon, one bar per eligible account, in the accounts' fixed order. */
export function AfterTaxBars({ accounts, years }: AfterTaxBarsProps) {
  const data = accounts
    .filter((account) => account.eligible)
    .map((account) => ({
      name: ACCOUNTS[account.account].short,
      value: Math.round(account.after_tax),
      low: account.after_tax_low,
      high: account.after_tax_high,
      fill: ACCOUNTS[account.account].color,
    }))

  return (
    <figure className="space-y-2">
      {/* 48px per account: a 20px bar and its air. */}
      <ChartContainer
        config={CONFIG}
        className={cn('aspect-auto w-full', data.length > 3 ? 'h-48' : 'h-36')}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 96, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            width={112}
            tickLine={false}
            axisLine={false}
            className="text-sm"
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(_, __, item) => {
                  const row = item.payload as (typeof data)[number]
                  return (
                    <span className="grid gap-1">
                      <span className="font-medium">{row.name}</span>
                      <span className="tabular-nums">Après impôt : {formatMoney(row.value)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        Fourchette : {formatMoney(row.low)} à {formatMoney(row.high)}
                      </span>
                    </span>
                  )
                }}
              />
            }
          />
          <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.name} fill={row.fill} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              className="fill-foreground text-sm font-medium"
              formatter={(value) => formatMoney(Number(value))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">
        Valeur après impôt dans {years} ans, scénario central ; survolez une barre pour la fourchette des
        scénarios pessimiste et optimiste.
      </figcaption>
    </figure>
  )
}
