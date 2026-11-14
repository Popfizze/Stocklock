import type { FitReason } from '@/api/persona'
import { cn } from '@/lib/utils'
import { SEVERITY_LABELS } from './fitMeta'
import { SeverityPicto } from './TilePicto'
import { TileStrip } from './TileStrip'

/** Tiles of the volatility strip, and how far past the larger of the two figures it runs. */
const METER_TILES = 24
const HEADROOM = 1.1

interface FitReasonListProps {
  reasons: FitReason[]
  /** Accessible name of the list: « Raisons du verdict ». */
  label: string
  className?: string
}

/**
 * The reasons of a profile verdict in plain French, each with its severity as
 * a tile pictogram and a spoken label (never colour alone). The volatility
 * reason also draws the measure against the profile's maximum.
 */
export function FitReasonList({ reasons, label, className }: FitReasonListProps) {
  return (
    <ul aria-label={label} className={cn('space-y-3.5 text-sm', className)}>
      {reasons.map((reason, index) => {
        const metered = reason.rule === 'volatility' && reason.value !== null && reason.limit !== null
        const scale = Math.max(reason.value ?? 0, reason.limit ?? 0) * HEADROOM || 1
        return (
          <li key={`${reason.rule}-${index}`} className="flex gap-3">
            <SeverityPicto severity={reason.severity} className="mt-1" />
            <div className="min-w-0 flex-1 space-y-2">
              <p>
                <span className="sr-only">{SEVERITY_LABELS[reason.severity]} : </span>
                {reason.message}
              </p>
              {/* The strip is the measure, the tick the profile's maximum. */}
              {metered && (
                <TileStrip
                  value={(reason.value ?? 0) / scale}
                  mark={(reason.limit ?? 0) / scale}
                  tiles={METER_TILES}
                  tone={(reason.value ?? 0) > (reason.limit ?? 0) ? 'fill-destructive' : 'fill-tile-1'}
                />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
