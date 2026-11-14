import type { BiasIntent } from '@/api/bias'
import type { HypeSignal } from '@/api/persona'
import { formatPercent } from './format'

export interface BiasPrefill {
  intent: BiasIntent
  message: string
}

/**
 * What the « Prendre du recul » form proposes while the hype signal is high:
 * the temptation to buy, worded with the signal's own figure. `null` when the
 * signal is not high (or not known): the form then starts empty.
 */
export function biasPrefill(hype: HypeSignal | undefined): BiasPrefill | null {
  if (!hype || hype.level !== 'eleve') return null
  const rise = hype.return_1m !== null && hype.return_1m > 0 ? hype.return_1m : null
  return {
    intent: 'buy',
    message:
      rise !== null
        ? `Le titre a pris ${formatPercent(rise)} en un mois et on en parle partout : j’ai peur de manquer la hausse si je n’achète pas maintenant.`
        : 'On parle beaucoup de ce titre en ce moment : je me demande si je devrais en acheter avant qu’il ne remonte.',
  }
}
