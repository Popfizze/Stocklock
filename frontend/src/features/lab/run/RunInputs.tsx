import { formatValue } from '../labForm'
import { formatCount } from '../runs/runModel'
import { Figures, PanelBlock } from './panelParts'
import type { RunView } from './runView'

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (typeof value === 'number') return formatValue(value)
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ')
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const SCORE_PARAM_LABELS: Record<string, string> = {
  max_titles: 'Titres demandés',
  ca_share: 'Part TSX',
  etf_share: 'Part FNB',
  news_per_title: 'Articles par titre',
  max_llm_articles: 'Articles envoyés à Bedrock (max.)',
}

function Tickers({ label, tickers }: { label: string; tickers: string[] }) {
  return (
    <PanelBlock title={`${label} (${formatCount(tickers.length)})`}>
      <ul className="flex flex-wrap gap-1.5">
        {tickers.map((ticker) => (
          <li key={ticker} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
            {ticker}
          </li>
        ))}
      </ul>
    </PanelBlock>
  )
}

/** « Entrées » : what the run was asked — its group of titles, its inputs and its options. */
export function RunInputs({ view }: { view: RunView }) {
  const run = view.registry
  const score = view.score
  const params = score?.params ?? run?.params
  const scoreGroup = score?.group ?? score?.summary?.group ?? run?.summary?.group
  const inputs = Object.entries(run?.inputs ?? {}).map(([name, value]): [string, string] => [name, text(value)])
  const options = Object.entries(run?.options ?? {}).map(([name, value]): [string, string] => [name, text(value)])

  return (
    <div className="space-y-6">
      <h3 className="text-xl">Entrées du run</h3>
      {run?.group && (
        <>
          <p>
            <span className="font-medium">{run.group.label}</span>
            <span className="text-muted-foreground">
              {' '}
              — {run.group.source}
              {run.group.truncated && ` · ${formatCount(run.group.tickers.length)} titres gardés sur ${formatCount(run.group.total)}`}
            </span>
          </p>
          <Tickers label="Titres du groupe" tickers={run.group.tickers} />
        </>
      )}
      {scoreGroup && (
        <>
          <p className="font-medium">{scoreGroup.label}</p>
          {scoreGroup.requested && <Tickers label="Titres demandés" tickers={scoreGroup.requested} />}
          {scoreGroup.resolved && <Tickers label="Titres notés" tickers={scoreGroup.resolved} />}
          {scoreGroup.unknown.length > 0 && <Tickers label="Inconnus de l'univers, non notés" tickers={scoreGroup.unknown} />}
        </>
      )}
      {params && (
        <PanelBlock title="Paramètres">
          <Figures
            entries={Object.entries(params)
              .filter(([name]) => name in SCORE_PARAM_LABELS)
              .map(([name, value]): [string, string] => [
                SCORE_PARAM_LABELS[name],
                name.endsWith('_share') && typeof value === 'number' ? `${Math.round(value * 100)} %` : text(value),
              ])}
          />
        </PanelBlock>
      )}
      {inputs.length > 0 && (
        <PanelBlock title="Entrées">
          <Figures entries={inputs} />
        </PanelBlock>
      )}
      {options.length > 0 && (
        <PanelBlock title="Options des étapes">
          <Figures entries={options} />
        </PanelBlock>
      )}
    </div>
  )
}
