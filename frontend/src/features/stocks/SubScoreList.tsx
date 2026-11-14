import type { SubScore } from '@/api/stocks'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { formatPoints, formatScore, formatWeight } from './format'
import { IndicatorList } from './IndicatorList'
import { SUB_SCORE_SWATCH } from './scoreMeta'
import { TileStrip } from './TileStrip'

interface SubScoreListProps {
  subScores: SubScore[]
  /** The sub-score whose indicators are shown (the one the 3D scene is opened on), or `null`. */
  focus: string | null
  onFocus: (subScoreId: string | null) => void
}

/**
 * The six sub-scores of a title: for each, its weight, its score 0-100 and
 * what it adds to the final score; opening one shows the raw indicators behind
 * it. The keyboard and screen-reader way through what the 3D scene shows.
 */
export function SubScoreList({ subScores, focus, onFocus }: SubScoreListProps) {
  return (
    <Accordion
      type="single"
      collapsible
      value={focus ?? ''}
      onValueChange={(value) => onFocus(value || null)}
      className="rounded-none border-x-0 border-y"
    >
      {subScores.map((subScore, index) => (
        <AccordionItem key={subScore.id} value={subScore.id} className="data-open:bg-transparent">
          <AccordionTrigger className="items-center gap-4 px-0 py-3.5 hover:no-underline">
            <SubScoreRow subScore={subScore} swatch={SUB_SCORE_SWATCH[index % SUB_SCORE_SWATCH.length]} />
          </AccordionTrigger>
          <AccordionContent className="px-0">
            <IndicatorList subScore={subScore} />
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
          {/* The sub-score's step in the gauge and the 3D scene. */}
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
