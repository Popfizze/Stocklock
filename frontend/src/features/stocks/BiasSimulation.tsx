import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { BiasResult } from '@/api/bias'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { DataSourceHint } from './DataSourceHint'

const config: ChartConfig = {
  hold: { label: 'Conservation', color: 'var(--chart-1)' },
  panic: { label: 'Vente au creux', color: 'var(--chart-2)' },
}
const money = (value: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value)

/** The 2022 example of a « Prendre du recul » analysis: holding the title against selling it at the bottom. */
export function BiasSimulation({ simulation }: { simulation: BiasResult['simulation'] }) {
  if (!simulation) {
    return <p className="text-sm text-muted-foreground">Simulation historique indisponible pour ce titre.</p>
  }
  return (
    <section className="space-y-3" aria-labelledby="simulation-heading">
      <div className="flex items-center gap-1.5">
        <h4 id="simulation-heading" className="font-display text-lg font-medium">
          Exemple historique : vendre ou conserver en 2022
        </h4>
        <DataSourceHint label="simulation historique" sourceTarget="bias-sources">
          <p><strong>Cours :</strong> AlphaForge starter kit, <em>prices_daily.csv</em>.</p>
          <p><strong>Après la vente :</strong> produit placé dans ZST.TO, avec le taux de change du jeu de données lorsque nécessaire.</p>
        </DataSourceHint>
      </div>
      <p className="text-sm text-muted-foreground">
        Simulation fictive, indépendante de votre intention actuelle. Pour {simulation.ticker},{' '}
        {money(simulation.initial)} investis le {simulation.start} ;
        {simulation.sell_date ? ` vente le ${simulation.sell_date}` : ' aucune vente déclenchée'}. Valeurs au{' '}
        {simulation.end}, en dollars canadiens.
      </p>
      <dl className="grid grid-cols-2 gap-x-6 border-y border-border py-4">
        <div>
          <dt className="eyebrow">Conservation</dt>
          <dd className="display mt-1.5 text-3xl">{money(simulation.hold_final)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Vente au creux</dt>
          <dd className="display mt-1.5 text-3xl">{money(simulation.panic_final)}</dd>
        </div>
      </dl>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <LineChart data={simulation.points} accessibilityLayer margin={{ left: 8, right: 16 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(0, 4)} minTickGap={30} />
          <YAxis width={64} tickFormatter={(value: number) => `${Math.round(value / 1000)} k$`} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line dataKey="hold" name="Conservation" stroke="var(--color-hold)" dot={false} isAnimationActive={false} />
          <Line
            dataKey="panic"
            name="Vente au creux"
            stroke="var(--color-panic)"
            strokeDasharray="5 3"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Vendre exactement au creux est un cas extrême connu après coup. Le produit de la vente est placé dans ZST.TO,
        sans réinvestissement dans le titre. Cette simulation historique ne prédit pas les rendements futurs.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer">Tableau des valeurs</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-4 font-medium">Date</th>
                <th scope="col" className="py-1.5 pr-4 font-medium">Conservation</th>
                <th scope="col" className="py-1.5 font-medium">Vente au creux</th>
              </tr>
            </thead>
            <tbody>
              {simulation.points.map((point) => (
                <tr key={point.date} className="border-t border-border">
                  <td className="py-1.5 pr-4">{point.date}</td>
                  <td className="py-1.5 pr-4">{money(point.hold)}</td>
                  <td className="py-1.5">{money(point.panic)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
