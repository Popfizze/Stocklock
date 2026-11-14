import type { Traveller } from '../run/flowModel'
import { draftTickers, groupSize, type GroupDraft } from './launchModel'

/** Titles drawn at most at the conveyor's entrance. */
const MAX_PREVIEW = 48

/** The group as it waits at the conveyor's entrance: its tickers when known, else one tile per title asked. */
export function previewTravellers(draft: GroupDraft, portfolio: string[], cap: number, running: boolean): Traveller[] {
  const tickers = draftTickers(draft, portfolio, cap)
  const size = Math.min(MAX_PREVIEW, groupSize(draft, portfolio, cap))
  return Array.from({ length: size }, (_, index) => ({
    label: tickers?.[index] ?? `Titre ${index + 1} du groupe`,
    status: running ? 'running' : 'pending',
    column: 'entrees',
    runId: null,
  }))
}
