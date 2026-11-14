import { cn } from '@/lib/utils'
import { compareRows, type CompareRow, type CompareRun } from './flow/flowModel'

interface RunCompareProps {
  left: CompareRun
  right: CompareRun
}

/**
 * Two runs side by side: the parameters that differ, the key results, and
 * the decisions whose answer changed.
 */
export function RunCompare({ left, right }: RunCompareProps) {
  const params = compareRows(left.params, right.params).filter((row) => row.differs)
  const results = compareRows(left.results, right.results)
  const decisions = compareRows(left.decisions, right.decisions).filter((row) => row.differs)

  return (
    <section aria-label="Comparaison de deux runs" className="space-y-5 rounded-xl border border-border p-4">
      <h3 className="font-semibold">Comparaison</h3>
      <CompareTable
        caption="Paramètres qui diffèrent"
        empty="Mêmes paramètres pour les deux runs."
        rows={params}
        left={left.title}
        right={right.title}
      />
      <CompareTable
        caption="Résultats"
        empty="Aucun résultat à comparer."
        rows={results}
        left={left.title}
        right={right.title}
      />
      <CompareTable
        caption="Décisions qui ont changé"
        empty="Les mêmes décisions ont été prises dans les deux runs."
        rows={decisions}
        left={left.title}
        right={right.title}
      />
    </section>
  )
}

interface CompareTableProps {
  caption: string
  empty: string
  rows: CompareRow[]
  left: string
  right: string
}

function CompareTable({ caption, empty, rows, left, right }: CompareTableProps) {
  if (rows.length === 0) {
    return (
      <div className="space-y-1">
        <h4 className="eyebrow">{caption}</h4>
        <p className="text-sm text-muted-foreground">{empty}</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="eyebrow pb-1.5 text-left">{caption}</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="w-1/3 py-1.5 pr-4 font-medium">
              <span className="sr-only">Élément</span>
            </th>
            <th scope="col" className="w-1/3 py-1.5 pr-4 font-medium">{left}</th>
            <th scope="col" className="w-1/3 py-1.5 font-medium">{right}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-border align-top">
              <th scope="row" className="py-2 pr-4 text-left font-normal text-muted-foreground">
                {row.name}
              </th>
              <td className={cn('py-2 pr-4', row.differs && 'font-medium')}>{row.left}</td>
              <td className={cn('py-2', row.differs && 'font-medium')}>{row.right}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
