import type { ScoreIndicator, SubScore } from '@/api/stocks'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { formatIndicator, formatPoints, formatScore, formatWeight } from './format'
import { SUB_SCORE_SWATCH } from './scoreMeta'
import { TileStrip } from './TileStrip'

const BETTER_LABELS: Record<ScoreIndicator['better'], string> = {
  higher: 'Plus haut, mieux',
  lower: 'Plus bas, mieux',
}

interface SubScoreListProps {
  subScores: SubScore[]
  /** Ids of the sub-scores whose indicators are shown. */
  open: string[]
  onOpenChange: (open: string[]) => void
}

/**
 * The six sub-scores of a title: for each, its weight, its score 0-100 and
 * what it adds to the final score; opening one shows the raw indicators behind it.
 */
export function SubScoreList({ subScores, open, onOpenChange }: SubScoreListProps) {
  return (
    <Accordion type="multiple" value={open} onValueChange={onOpenChange} className="rounded-none border-x-0 border-y">
      {subScores.map((subScore, index) => (
        <AccordionItem key={subScore.id} value={subScore.id} className="data-open:bg-transparent">
          <AccordionTrigger className="items-center gap-4 px-0 py-3.5 hover:no-underline">
            <SubScoreRow subScore={subScore} swatch={SUB_SCORE_SWATCH[index % SUB_SCORE_SWATCH.length]} />
          </AccordionTrigger>
          <AccordionContent className="px-0">
            <IndicatorTable subScore={subScore} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function SubScoreRow({ subScore, swatch }: { subScore: SubScore; swatch: string }) {
  const missing = subScore.score === null
  const redistributed = Math.abs(subScore.effective_weight - subScore.weight) > 0.0005

  return (
    <span className="grid flex-1 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-medium">
          {/* The sub-score's step in the composition bar above. */}
          <span
            aria-hidden="true"
            className={cn('size-2.5 shrink-0', missing ? 'border border-border' : swatch)}
          />
          {subScore.label}
        </span>
        <span className="block pl-4.5 text-xs font-normal text-muted-foreground">
          Poids {formatWeight(subScore.weight)}
          {redistributed && !missing && ` · ${formatWeight(subScore.effective_weight)} après redistribution`}
        </span>
      </span>
      {/* Decorative: the figures on the right say the same thing. */}
      <TileStrip
        value={(subScore.score ?? 0) / 100}
        tiles={20}
        className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
      />
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
