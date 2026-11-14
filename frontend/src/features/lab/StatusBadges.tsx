import type { LabStageStatus } from '@/api/lab'
import { Badge } from '@/components/ui/badge'

const STAGE_STATUS: Record<
  LabStageStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  ok: { label: 'OK', variant: 'success' },
  warning: { label: 'Avertissement', variant: 'warning' },
  error: { label: 'Erreur', variant: 'destructive' },
  skipped: { label: 'Ignoré', variant: 'secondary' },
}

export function StageStatusBadge({ status }: { status: LabStageStatus }) {
  const { label, variant } = STAGE_STATUS[status] ?? STAGE_STATUS.error
  return <Badge variant={variant}>{label}</Badge>
}

interface PassBadgeProps {
  passed: boolean
  /** Feminine agreement, for « Gouvernance : passée ». */
  feminine?: boolean
}

export function PassBadge({ passed, feminine = false }: PassBadgeProps) {
  const suffix = feminine ? 'e' : ''
  return (
    <Badge variant={passed ? 'success' : 'destructive'}>
      {passed ? `Passé${suffix}` : `Échoué${suffix}`}
    </Badge>
  )
}
