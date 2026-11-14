import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts'
import type { TaxProfile, TaxRules } from '@/api/accounts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney, formatPercent } from './format'

// The non-registered account's color: this chart is about that account.
const CONFIG: ChartConfig = { tax: { label: 'Impôt', color: 'var(--account-taxable)' } }

interface IncomeTaxChartProps {
  profile: TaxProfile
  rules: TaxRules
}

/** Tax on 1 000 $ of investment income held outside any registered account, by kind of income. */
export function IncomeTaxChart({ profile, rules }: IncomeTaxChartProps) {
  const data = [
    { kind: 'Intérêts (obligations)', tax: 1000 * profile.rate_now, note: 'Imposés en entier, chaque année.' },
    {
      kind: 'Dividendes américains',
      tax: 1000 * profile.rate_now,
      note: `Retenue de ${formatPercent(rules.us_dividend_withholding.rate, 0)} récupérée par crédit, puis taux marginal.`,
    },
    {
      kind: 'Gains en capital',
      tax: 1000 * rules.capital_gains.inclusion_rate * profile.rate_now,
      note: `${formatPercent(rules.capital_gains.inclusion_rate, 0)} imposés, et seulement à la vente.`,
    },
    {
      kind: 'Dividendes canadiens',
      tax: 1000 * profile.eligible_dividend_rate,
      note: "Majorés puis réduits par le crédit d'impôt pour dividendes.",
    },
  ].sort((a, b) => b.tax - a.tax)
  const best = data[data.length - 1]

  return (
    <figure className="space-y-3">
      <p className="font-medium">
        Au taux de {profile.name}, 1 000 $ d'intérêts coûtent {formatMoney(data[0].tax)} d'impôt, contre{' '}
        {formatMoney(best.tax)} pour des {best.kind.toLowerCase()}.
      </p>
      <ChartContainer config={CONFIG} className="aspect-auto h-48 w-full">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} accessibilityLayer>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="kind" width={160} tickLine={false} axisLine={false} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(_, __, item) => {
                  const row = item.payload as (typeof data)[number]
                  return (
                    <span className="grid gap-1">
                      <span className="font-medium">{row.kind}</span>
                      <span className="tabular-nums">Impôt : {formatMoney(row.tax)} sur 1 000 $</span>
                      <span className="text-muted-foreground">{row.note}</span>
                    </span>
                  )
                }}
              />
            }
          />
          <Bar dataKey="tax" fill="var(--color-tax)" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="tax"
              position="right"
              offset={8}
              className="fill-foreground text-sm font-medium"
              formatter={(value) => formatMoney(Number(value))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">
        Hors compte enregistré, au taux marginal actuel de {profile.name} ({formatPercent(profile.rate_now)}). Dans un
        CELI ou un CELIAPP : 0 $. Dans un REER : rien maintenant, tout est imposé au retrait.
      </figcaption>
    </figure>
  )
}
