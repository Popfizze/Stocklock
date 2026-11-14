import type { FitReason, FitResult, FitRuleId, FitSeverity, FitVerdict } from '@/api/persona'

/** Dot colour of a verdict. */
export const VERDICT_DOT: Record<FitVerdict, string> = {
  compatible: 'bg-success',
  a_surveiller: 'bg-warning',
  hors_profil: 'bg-destructive',
}

/** Dot colour of a reason or a finding, by severity. */
export const SEVERITY_DOT: Record<FitSeverity, string> = {
  ok: 'bg-success',
  info: 'bg-muted-foreground/50',
  attention: 'bg-warning',
  bloquant: 'bg-destructive',
}

/** Icon colour of a reason, by severity (the icon's shape carries the meaning too). */
export const SEVERITY_TEXT: Record<FitSeverity, string> = {
  ok: 'text-success',
  info: 'text-muted-foreground',
  attention: 'text-warning',
  bloquant: 'text-destructive',
}

export const SEVERITY_LABELS: Record<FitSeverity, string> = {
  ok: 'Conforme',
  info: 'À noter',
  attention: 'Attention',
  bloquant: 'Bloquant',
}

/** The rules a section of the stock page repeats next to its own data. */
export const HYPE_RULES: FitRuleId[] = ['hype']
export const ESG_RULES: FitRuleId[] = ['esg_controversy', 'esg_risk', 'esg_unknown']

/** The reasons of a verdict that belong to `rules`, in the verdict's order. */
export function reasonsFor(fit: FitResult | undefined, rules: FitRuleId[]): FitReason[] {
  return (fit?.reasons ?? []).filter((reason) => rules.includes(reason.rule))
}

/** Whether one of the reasons calls for attention or blocks the title. */
export function needsAttention(reasons: FitReason[]): boolean {
  return reasons.some((reason) => reason.severity === 'attention' || reason.severity === 'bloquant')
}
