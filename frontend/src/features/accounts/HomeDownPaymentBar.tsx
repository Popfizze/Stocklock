import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import type { TaxRules } from '@/api/accounts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { AccountSwatch } from './AccountLabel'
import { ACCOUNTS } from './accountMeta'
import { formatMoney, formatPercent } from './format'

const CONFIG: ChartConfig = {
  fhsa: { label: 'CELIAPP', color: ACCOUNTS.CELIAPP.color },
  hbp: { label: 'RAP (REER)', color: ACCOUNTS.REER.color },
}

interface HomeDownPaymentBarProps {
  rules: TaxRules
}

/** One whole split in two: the CELIAPP and the RAP add up for a first home. */
export function HomeDownPaymentBar({ rules }: HomeDownPaymentBarProps) {
  const fhsa = rules.fhsa.lifetime_limit
  const hbp = rules.home_buyers_plan.withdrawal_limit
  const total = fhsa + hbp
  const parts = [
    { account: 'CELIAPP' as const, label: 'CELIAPP', amount: fhsa, detail: 'retiré sans impôt, rien à rembourser' },
    {
      account: 'REER' as const,
      label: 'RAP du REER',
      amount: hbp,
      detail: `à rembourser au REER sur ${rules.home_buyers_plan.repayment_years} ans`,
    },
  ]

  return (
    <figure className="space-y-3">
      <p className="font-medium">
        Jusqu'à {formatMoney(total)} par personne pour une première maison, {formatMoney(total * 2)} pour un couple.
      </p>
      <ChartContainer
        config={CONFIG}
        className="aspect-auto h-7 w-full"
        role="img"
        aria-label={`CELIAPP ${formatMoney(fhsa)} plus RAP ${formatMoney(hbp)}`}
      >
        <BarChart data={[{ name: 'Mise de fonds', fhsa, hbp }]} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barCategoryGap={0}>
          <XAxis type="number" hide domain={[0, total]} />
          <YAxis type="category" dataKey="name" hide />
          <Bar dataKey="fhsa" stackId="home" fill="var(--color-fhsa)" stroke="var(--card)" strokeWidth={2} radius={[4, 0, 0, 4]} isAnimationActive={false} />
          <Bar dataKey="hbp" stackId="home" fill="var(--color-hbp)" stroke="var(--card)" strokeWidth={2} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {parts.map((part) => (
          <li key={part.label} className="flex items-start gap-2">
            <AccountSwatch account={part.account} className="mt-1.5" />
            <span>
              <span className="font-semibold">
                {part.label} : {formatMoney(part.amount)}
              </span>{' '}
              <span className="text-muted-foreground">
                ({formatPercent(part.amount / total, 0)}), {part.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
