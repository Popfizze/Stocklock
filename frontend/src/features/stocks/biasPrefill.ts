import type { BiasIntent } from '@/api/bias'
import type { HypeComponentId, HypeSignal } from '@/api/persona'
import { formatPercent } from './format'

export interface BiasPrefill {
  intent: BiasIntent
  message: string
  /** The component of the hype signal the proposal starts from. */
  trigger: HypeComponentId
}

/** Which component leads when the investor has not pointed at one: the run-up first, then the talk, then the volume. */
const LEAD_ORDER: HypeComponentId[] = ['run_up', 'news', 'volume']

const MULTIPLE = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 1 })

function proposal(hype: HypeSignal, trigger: HypeComponentId): BiasPrefill {
  const moved = hype.return_1m
  if (trigger === 'run_up' && moved !== null && moved < 0) {
    return {
      trigger,
      intent: 'sell',
      message: `Le titre a perdu ${formatPercent(Math.abs(moved))} en un mois : j’ai peur que la baisse continue et je pense vendre avant de perdre davantage.`,
    }
  }
  if (trigger === 'run_up' && moved !== null && moved > 0) {
    return {
      trigger,
      intent: 'buy',
      message: `Le titre a pris ${formatPercent(moved)} en un mois et on en parle partout : j’ai peur de manquer la hausse si je n’achète pas maintenant.`,
    }
  }
  if (trigger === 'volume') {
    const ratio = hype.components.find((component) => component.id === 'volume')?.ratio
    return {
      trigger,
      intent: 'buy',
      message:
        ratio != null
          ? `Le volume échangé est à ${MULTIPLE.format(ratio)} fois sa moyenne : tout le monde semble se positionner et je ne veux pas rester à l’écart.`
          : 'Le titre s’échange beaucoup en ce moment : tout le monde semble se positionner et je ne veux pas rester à l’écart.',
    }
  }
  return {
    trigger,
    intent: 'buy',
    message: 'On parle beaucoup de ce titre en ce moment : je me demande si je devrais en acheter avant qu’il ne remonte.',
  }
}

/**
 * What the « Prendre du recul » form proposes: the temptation the investor
 * pointed at in the hype field (`picked`), or — while the signal is high and
 * nothing is picked — its strongest component, worded with the signal's own
 * figures. `null` otherwise: the form then starts empty.
 */
export function biasPrefill(hype: HypeSignal | undefined, picked: HypeComponentId | null = null): BiasPrefill | null {
  if (!hype) return null
  if (picked) return proposal(hype, picked)
  if (hype.level !== 'eleve') return null
  const scored = (id: HypeComponentId) => hype.components.find((component) => component.id === id)?.points ?? 0
  const lead = [...LEAD_ORDER].sort((a, b) => scored(b) - scored(a))[0]
  return proposal(hype, lead)
}
