import { Link } from 'react-router-dom'
import { TileGauge } from '@/components/tiles/TileGauge'
import { Badge } from '@/components/ui/badge'
import { formatCount } from '../runs/runModel'
import { FLOW_STATUS_LABELS } from './flowModel'
import { Figures, PanelBlock } from './panelParts'
import type { RunView } from './runView'

const SCORE = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 1 })

/** « Sortie » of a score pipeline run: titles scored, partial scores, the best titles, the Bedrock bill. */
export function ScoreOutcome({ view }: { view: RunView }) {
  const summary = view.score?.summary ?? view.registry?.summary ?? null
  const group = summary?.group ?? view.score?.group ?? null

  if (view.status === 'running') {
    const current = view.nodes.find((node) => node.status === 'running')
    return (
      <div className="space-y-2">
        <h3 className="text-xl">Run en cours</h3>
        <p role="status" className="text-muted-foreground">
          {current ? `Étape en cours : ${current.label} (${FLOW_STATUS_LABELS.running.toLowerCase()}).` : 'Le run démarre.'} Cette
          page se met à jour toute seule ; le résultat s'affichera ici.
        </p>
      </div>
    )
  }
  if (!summary) {
    return <p className="text-muted-foreground">Ce run n'a pas produit de résultat.</p>
  }

  const figures: Array<[string, string]> = [
    ['Titres retenus', formatCount(summary.titles_selected)],
    ['Titres notés', formatCount(summary.titles_scored)],
    ['Scores partiels', formatCount(summary.partial)],
    ['Lignes de la table gold', formatCount(summary.table_rows)],
    ['Appels Bedrock', formatCount(summary.bedrock_calls)],
    ['Tokens en entrée', formatCount(summary.bedrock_input_tokens)],
    ['Tokens en sortie', formatCount(summary.bedrock_output_tokens)],
  ]

  return (
    <div className="space-y-6">
      <h3 className="text-xl">Résultat du run</h3>
      <Figures entries={figures} />
      {summary.top && summary.top.length > 0 && (
        <PanelBlock title="Meilleurs scores du run">
          <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {summary.top.map((title) => (
              <li key={title.symbol}>
                <Link
                  to={`/titres/${encodeURIComponent(title.symbol)}`}
                  className="flex items-center gap-3 rounded-2xl border border-border p-3 outline-none hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <TileGauge value={title.score} label={`Score ${SCORE.format(title.score)} sur 100`} className="w-12" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{title.symbol}</span>
                    <span className="display block text-2xl">{SCORE.format(title.score)}</span>
                    {title.partiel && <Badge variant="warning">Partiel</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </PanelBlock>
      )}
      {group && (group.unknown.length > 0 || group.excluded.length > 0 || Object.keys(group.aliases).length > 0) && (
        <PanelBlock title="Titres du groupe non notés ou réinterprétés">
          <ul className="space-y-1 text-sm">
            {group.unknown.map((symbol) => (
              <li key={symbol}>
                <span className="font-medium">{symbol}</span> — inconnu de l'univers SEC/TMX, non noté.
              </li>
            ))}
            {group.excluded.map((exclusion) => (
              <li key={exclusion.symbol}>
                <span className="font-medium">{exclusion.symbol}</span> — {exclusion.reason}.
              </li>
            ))}
            {Object.entries(group.aliases).map(([asked, read]) => (
              <li key={asked}>
                <span className="font-medium">{asked}</span> lu comme {read}.
              </li>
            ))}
          </ul>
        </PanelBlock>
      )}
      {(summary.comparison ?? group?.comparison) && (
        <PanelBlock title="Comment les rangs sont calculés">
          <p className="text-sm">{summary.comparison ?? group?.comparison}</p>
        </PanelBlock>
      )}
      {summary.table_key && <p className="font-mono text-xs text-muted-foreground">{summary.table_key}</p>}
    </div>
  )
}
