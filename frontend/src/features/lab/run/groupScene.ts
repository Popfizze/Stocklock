import type { RunSummary } from '@/api/runs'
import type { SceneTile } from '@/components/three'
import { formatKeyResult, STATUS_LABELS, STATUS_TONES } from '../runs/runModel'

/** One column per title: as tall as its key result (against the group's best), shaded by its status. */
export function groupScene(children: RunSummary[]): SceneTile[] {
  const values = children.map((child) => (typeof child.key_result?.value === 'number' ? Math.abs(child.key_result.value) : null))
  const top = Math.max(1e-9, ...values.map((value) => value ?? 0))
  // A small group stands in one row; a larger one wraps.
  const perRow = children.length <= 16 ? Math.max(1, children.length) : Math.ceil(Math.sqrt(children.length * 2.5))
  return children.map((child, index) => ({
    id: child.run_id,
    x: index % perRow,
    z: Math.floor(index / perRow),
    h: values[index] === null ? 0.15 : 0.3 + ((values[index] ?? 0) / top) * 2.7,
    tone: STATUS_TONES[child.status],
    label: [child.title, formatKeyResult(child.key_result), STATUS_LABELS[child.status]].filter(Boolean).join(' · '),
  }))
}
