import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RunSummary } from '@/api/runs'
import { Tile3D } from '@/components/three'
import { runPath } from '../labRoutes'
import { timelineLabel, timelineScene } from './runModel'

interface RunTimelineProps {
  runs: RunSummary[]
}

// 3D — the history of the pipelines as a frieze: one column per run, newest on the left, one lane per pipeline,
// taller when it processed more titles, shaded by its status, with tiles hopping over a run still going.
export function RunTimeline({ runs }: RunTimelineProps) {
  const navigate = useNavigate()
  const { tiles, flows } = useMemo(() => timelineScene(runs), [runs])

  return (
    <Tile3D
      tiles={tiles}
      flows={flows}
      view="iso"
      // A tile is a shortcut: every run is also a link in the list below.
      onSelect={(tile) => tile.id && navigate(runPath(tile.id))}
      label={timelineLabel(runs)}
      className="h-56 sm:h-72"
    />
  )
}
