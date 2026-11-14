import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { BiasResult } from '@/api/bias'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const config: ChartConfig = {
  hold: { label: 'Conservation', color: 'var(--chart-1)' },
  panic: { label: 'Vente au creux', color: 'var(--chart-2)' },
}
const money = (value: number) => new Intl.NumberFormat('fr-CA', {
  style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
}).format(value)

export function BiasSimulation({ simulation }: { simulation: BiasResult['simulation'] }) {
  if (!simulation) return <p className="text-sm text-muted-foreground">Simulation historique indisponible pour ce titre.</p>
  return (
    <section className="space-y-3" aria-labelledby="simulation-heading">
      <h3 id="simulation-heading" className="font-semibold">Exemple historique : vendre ou conserver en 2022</h3>
      <p className="text-sm text-muted-foreground">
        Simulation fictive, indépendante de votre intention actuelle. Pour {simulation.ticker}, {money(simulation.initial)} investis le {simulation.start} ;
        {simulation.sell_date ? ` vente le ${simulation.sell_date}` : ' aucune vente déclenchée'}.
        Valeurs au {simulation.end}, en dollars canadiens.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-muted p-3"><p className="text-sm">Conservation</p><p className="text-xl font-semibold">{money(simulation.hold_final)}</p></div>
        <div className="rounded-lg bg-muted p-3"><p className="text-sm">Vente au creux</p><p className="text-xl font-semibold">{money(simulation.panic_final)}</p></div>
      </div>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <LineChart data={simulation.points} accessibilityLayer margin={{ left: 8, right: 16 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(0, 4)} minTickGap={30} />
          <YAxis width={64} tickFormatter={(value: number) => `${Math.round(value / 1000)} k$`} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line dataKey="hold" name="Conservation" stroke="var(--color-hold)" dot={false} isAnimationActive={false} />
          <Line dataKey="panic" name="Vente au creux" stroke="var(--color-panic)" strokeDasharray="5 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">Vendre exactement au creux est un cas extrême connu après coup. Le produit de la vente est placé dans ZST.TO, sans réinvestissement dans le titre. Cette simulation historique ne prédit pas les rendements futurs.</p>
      <details className="text-sm"><summary className="cursor-pointer">Tableau des valeurs</summary>
        <div className="overflow-x-auto"><table className="mt-2 w-full text-left"><thead><tr><th>Date</th><th>Conservation</th><th>Vente au creux</th></tr></thead><tbody>
          {simulation.points.map((point) => <tr key={point.date}><td>{point.date}</td><td>{money(point.hold)}</td><td>{money(point.panic)}</td></tr>)}
        </tbody></table></div>
      </details>
    </section>
  )
}
