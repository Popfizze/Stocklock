import type { FitSeverity } from '@/api/persona'

/** Dot colour of a reason or a finding, by severity. */
export const SEVERITY_DOT: Record<FitSeverity, string> = {
  ok: 'bg-success',
  info: 'bg-muted-foreground/50',
  attention: 'bg-warning',
  bloquant: 'bg-destructive',
}

export const SEVERITY_LABELS: Record<FitSeverity, string> = {
  ok: 'Conforme',
  info: 'À noter',
  attention: 'Attention',
  bloquant: 'Bloquant',
}
