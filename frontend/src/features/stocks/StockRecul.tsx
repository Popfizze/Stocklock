import { useState } from 'react'
import { useHype, type FitResult, type HypeComponentId } from '@/api/persona'
import { HYPE_RULES, reasonsFor } from './fitMeta'
import { StockBias } from './StockBias'
import { StockHype } from './StockHype'
import { StockSection } from './StockSection'

interface StockReculProps {
  ticker: string
  personaName: string
  /** The profile's verdict, for what it says about the hype. */
  fit: FitResult | undefined
}

/**
 * « Prendre du recul » (step 4): the title's hype signal, then the analysis of
 * the investor's own intention — proposed with the tempted buyer's case while
 * the signal is high.
 */
export function StockRecul({ ticker, personaName, fit }: StockReculProps) {
  const hype = useHype(ticker)
  // What the investor points at in the hype field: it words the intention examined below.
  const [picked, setPicked] = useState<HypeComponentId | null>(null)

  return (
    <StockSection
      id="prendre-du-recul"
      eyebrow="Étape 4 · Battage et biais"
      title="Prendre"
      accent="du recul"
      description="Le titre est-il emporté par un engouement, et votre envie d’agir tient-elle à l’émotion du moment ? Le signal d’abord, votre décision ensuite."
    >
      <StockHype
        hype={hype.data}
        error={hype.error}
        isPending={hype.isPending}
        onRetry={() => hype.refetch()}
        personaName={personaName}
        reasons={reasonsFor(fit, HYPE_RULES)}
        picked={picked}
        onPick={setPicked}
      />
      <div className="border-t border-border pt-6">
        <StockBias ticker={ticker} hype={hype.data} picked={picked} />
      </div>
    </StockSection>
  )
}
