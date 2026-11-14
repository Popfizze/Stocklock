import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { TaxProfile } from '@/api/accounts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { AccountLabel } from './AccountLabel'
import { ACCOUNTS } from './accountMeta'
import { formatMoney, formatPercent } from './format'

const CONFIG: ChartConfig = {
  celi: { label: 'CELI', color: ACCOUNTS.CELI.color },
  reer: { label: 'REER', color: ACCOUNTS.REER.color },
}

const AMOUNT = 1000
const YEARS = 15
const RETURN = 0.05

interface BreakEvenChartProps {
  profile: TaxProfile
}

/**
 * REER vs CELI for 1 000 $ of pre-tax income: the CELI is flat (taxed now),
 * the REER falls with the retirement rate; they cross at today's rate.
 */
export function BreakEvenChart({ profile }: BreakEvenChartProps) {
  const growth = (1 + RETURN) ** YEARS
  const celi = AMOUNT * (1 - profile.rate_now) * growth
  const data = Array.from({ length: 56 }, (_, i) => {
    const rate = i / 100
    return { rate, celi, reer: AMOUNT * growth * (1 - rate) }
  })
  const reerAtProfile = AMOUNT * growth * (1 - profile.rate_retirement)
  const gap = reerAtProfile - celi
  const verdict =
    Math.abs(gap) < 1
      ? `Pour ${profile.name}, le taux ne change pas à la retraite : REER et CELI font jeu égal.`
      : gap > 0
        ? `Pour ${profile.name} (${formatPercent(profile.rate_now)} aujourd'hui, ${formatPercent(profile.rate_retirement)} prévu à la retraite) : le REER laisse ${formatMoney(gap)} de plus.`
        : `Pour ${profile.name}, le CELI laisse ${formatMoney(-gap)} de plus : le taux prévu à la retraite est plus élevé.`

  return (
    <figure className="space-y-3">
      <p className="font-medium">{verdict}</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Légende">
        <li className="flex items-center gap-2">
          <AccountLabel account="CELI" />
          <span className="text-muted-foreground">impôt payé avant : ne dépend pas du taux futur</span>
        </li>
        <li className="flex items-center gap-2">
          <AccountLabel account="REER" />
          <span className="text-muted-foreground">impôt payé au retrait : baisse si le taux monte</span>
        </li>
      </ul>
      <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full">
        <LineChart data={data} margin={{ top: 20, right: 24, left: 8, bottom: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="rate"
            type="number"
            domain={[0, 0.55]}
            ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5]}
            tickFormatter={(value: number) => formatPercent(value, 0)}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Taux marginal à la retraite', position: 'insideBottom', offset: -4, className: 'fill-muted-foreground text-xs' }}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatMoney(value)}
            domain={[0, 'auto']}
            allowDecimals={false}
          />
          <ReferenceLine
            x={profile.rate_now}
            stroke="var(--muted-foreground)"
            label={{ value: `Taux actuel : ${formatPercent(profile.rate_now)}`, position: 'top', className: 'fill-muted-foreground text-xs' }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) =>
                  `Taux à la retraite : ${formatPercent(Number(payload?.[0]?.payload?.rate ?? 0), 0)}`
                }
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{String(name).toUpperCase()}</span>
                    <span className="font-medium tabular-nums">{formatMoney(Number(value))}</span>
                  </span>
                )}
              />
            }
          />
          <Line dataKey="celi" type="linear" stroke="var(--color-celi)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="reer" type="linear" stroke="var(--color-reer)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <ReferenceDot
            x={profile.rate_retirement}
            y={reerAtProfile}
            r={5}
            fill="var(--color-reer)"
            stroke="var(--background)"
            strokeWidth={2}
          />
        </LineChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">
        {formatMoney(AMOUNT)} de revenu avant impôt, placés {YEARS} ans à {formatPercent(RETURN, 0)} par an. Le point
        marque le taux prévu à la retraite de {profile.name}. Les deux droites se croisent au taux actuel.
      </figcaption>
    </figure>
  )
}
