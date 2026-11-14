import type { ScoreIndicator, SubScore } from '@/api/stocks'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { formatIndicator, formatPoints, formatScore, formatWeight } from './format'

const BETTER_LABELS: Record<ScoreIndicator['better'], string> = {
  higher: 'Plus haut, mieux',
  lower: 'Plus bas, mieux',
}

interface SubScoreListProps {
  subScores: SubScore[]
}

/**
 * The six sub-scores of a title: for each, its weight, its score 0-100 and
 * what it adds to the final score; opening one shows the raw indicators behind it.
 */
export function SubScoreList({ subScores }: SubScoreListProps) {
  return (
    <Accordion type="multiple" className="rounded-none border-x-0 border-y">
      {subScores.map((subScore) => (
        <AccordionItem key={subScore.id} value={subScore.id} className="data-open:bg-transparent">
          <AccordionTrigger className="items-center gap-4 px-0 py-3.5 hover:no-underline">
            <SubScoreRow subScore={subScore} />
          </AccordionTrigger>
          <AccordionContent className="px-0">
            <IndicatorTable subScore={subScore} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function SubScoreRow({ subScore }: { subScore: SubScore }) {
  const missing = subScore.score === null
  const redistributed = Math.abs(subScore.effective_weight - subScore.weight) > 0.0005

  return (
    <span className="grid flex-1 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
      <span className="min-w-0">
        <span className="block font-medium">{subScore.label}</span>
        <span className="block text-xs font-normal text-muted-foreground">
          Poids {formatWeight(subScore.weight)}
          {redistributed && !missing && ` · ${formatWeight(subScore.effective_weight)} après redistribution`}
        </span>
      </span>
      {/* Decorative: the figures on the right say the same thing. */}
      <span
        aria-hidden="true"
        className="col-span-2 row-start-2 block h-1.5 overflow-hidden rounded-full bg-muted sm:col-span-1 sm:row-start-auto"
      >
        {!missing && (
          <svg viewBox="0 0 100 1" preserveAspectRatio="none" className="block size-full text-foreground">
            <rect width={subScore.score ?? 0} height="1" fill="currentColor" />
          </svg>
        )}
      </span>
      <span className="text-right tabular-nums">
        {missing ? (
          <span className="text-sm font-normal text-muted-foreground">Non disponible</span>
        ) : (
          <>
            <span className="block font-semibold">
              {formatScore(subScore.score ?? 0)}
              <span className="font-normal text-muted-foreground"> / 100</span>
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              +{formatPoints(subScore.contribution)} pts
            </span>
          </>
        )}
      </span>
    </span>
  )
}

function IndicatorTable({ subScore }: { subScore: SubScore }) {
  if (subScore.score === null) {
    return (
      <p className="text-muted-foreground">
        Données manquantes pour ce sous-score : son poids est redistribué sur les autres.
      </p>
    )
  }
  if (subScore.indicators.length === 0) {
    return <p className="text-muted-foreground">Aucun indicateur brut publié pour ce sous-score.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Indicateurs bruts : {subScore.label}</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-4 font-medium">Indicateur</th>
            <th scope="col" className="py-1.5 pr-4 text-right font-medium">Valeur</th>
            <th scope="col" className="py-1.5 pr-4 text-right font-medium">Rang / 100</th>
            <th scope="col" className="py-1.5 font-medium">Lecture</th>
          </tr>
        </thead>
        <tbody>
          {subScore.indicators.map((indicator) => (
            <tr key={indicator.id} className="border-t border-border align-top">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                {indicator.label}
                {indicator.note && (
                  <span className="block text-xs text-muted-foreground">{indicator.note}</span>
                )}
              </th>
              <td className="py-2 pr-4 text-right font-medium whitespace-nowrap">
                {formatIndicator(indicator.value, indicator.unit)}
              </td>
              <td className="py-2 pr-4 text-right whitespace-nowrap">
                {indicator.rank === null ? '—' : formatScore(indicator.rank)}
              </td>
              <td className="py-2 text-xs whitespace-nowrap text-muted-foreground">
                {BETTER_LABELS[indicator.better]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
