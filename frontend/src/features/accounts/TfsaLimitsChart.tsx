import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import type { TaxProfile, TaxRules } from '@/api/accounts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney } from './format'

const CONFIG: ChartConfig = { limit: { label: 'Plafond annuel' } }

interface TfsaLimitsChartProps {
  profile: TaxProfile
  rules: TaxRules
}

/** The TFSA annual limit since 2009; the years that count for the profile stand out. */
export function TfsaLimitsChart({ profile, rules }: TfsaLimitsChartProps) {
  const firstYear = Math.max(2009, rules.year - profile.age + rules.tfsa.eligibility_age)
  const data = Object.entries(rules.tfsa.annual_limits)
    .map(([year, limit]) => ({ year: Number(year), limit, counts: Number(year) >= firstYear }))
    .sort((a, b) => a.year - b.year)

  return (
    <figure className="space-y-3">
      <p className="font-medium">
        {profile.name} a cumulé {formatMoney(profile.tfsa_room)} de droits CELI
        {firstYear > 2009 ? ` depuis ${firstYear}, l'année de ses ${rules.tfsa.eligibility_age} ans` : ' depuis 2009'}.
      </p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Légende">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-account-celi" />
          Années comptées pour {profile.name}
        </li>
        {firstYear > 2009 && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-muted-foreground/40" />
            Avant ses {rules.tfsa.eligibility_age} ans
          </li>
        )}
      </ul>
      <ChartContainer config={CONFIG} className="aspect-auto h-56 w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="year" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis width={64} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatMoney(value)} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(_, __, item) => {
                  const row = item.payload as (typeof data)[number]
                  return (
                    <span className="tabular-nums">
                      {row.year} : {formatMoney(row.limit)}
                      {row.counts ? '' : ` (avant les ${rules.tfsa.eligibility_age} ans de ${profile.name})`}
                    </span>
                  )
                }}
              />
            }
          />
          <Bar dataKey="limit" barSize={16} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell
                key={row.year}
                fill={row.counts ? 'var(--account-celi)' : 'var(--muted-foreground)'}
                fillOpacity={row.counts ? 1 : 0.4}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">
        Depuis 2013, le plafond suit l'inflation par tranches de 500 $ ; 2015 fait exception. Record :{formatMoney(Math.max(...data.map((d) => d.limit)))} en{' '}
        {data.reduce((a, b) => (b.limit > a.limit ? b : a)).year}. Total depuis 2009 : {formatMoney(rules.tfsa_total_since_2009)}.
      </figcaption>
    </figure>
  )
}
