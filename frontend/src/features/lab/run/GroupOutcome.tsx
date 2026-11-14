import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { LabBatchTable, LabCell } from '@/api/lab'
import type { RunStatus } from '@/api/runs'
import { Tile3D } from '@/components/three'
import { DataGrid } from '../artifacts/DataGrid'
import { launchPath, runPath } from '../labRoutes'
import { groupScene } from './groupScene'
import { PanelBlock } from './panelParts'
import type { RunView } from './runView'

const PERCENT = new Intl.NumberFormat('fr-CA', { style: 'percent', maximumFractionDigits: 1 })

function tableRows(table: LabBatchTable): { columns: string[]; rows: LabCell[][] } {
  return {
    columns: table.columns.map((column) => column.label),
    rows: table.rows.map((row) =>
      table.columns.map((column) => {
        const cell = row[column.key] ?? null
        return column.kind === 'percent' && typeof cell === 'number' ? PERCENT.format(cell) : cell
      }),
    ),
  }
}

/** « Sortie » of a group run: every title side by side, the ones that did not finish, and the table across titles. */
export function GroupOutcome({ view }: { view: RunView }) {
  const navigate = useNavigate()
  const children = useMemo(() => view.registry?.children ?? [], [view.registry])
  const table = view.registry?.table ?? null
  const tiles = useMemo(() => groupScene(children), [children])
  const count = (status: RunStatus) => children.filter((child) => child.status === status).length
  const failed = children.filter((child) => child.status === 'failed')
  const runByTicker = new Map(children.map((child) => [child.title, child.run_id]))
  const grid = table ? tableRows(table) : null
  const tickerLabel = table?.columns.find((column) => column.key === 'ticker')?.label

  return (
    <div className="space-y-6">
      <h3 className="text-xl">Résultat du groupe</h3>
      <p className="tabular-nums">
        {children.length} titres : {count('succeeded')} réussis, {count('warning')} avec avertissements, {failed.length} non
        terminés ou en échec.
      </p>

      {children.length > 0 && (
        // 3D — the group at a glance: one column per title, as tall as its result, red when it failed; click one to open its run.
        <Tile3D
          tiles={tiles}
          view="iso"
          onSelect={(tile) => tile.id && navigate(runPath(tile.id))}
          label={`Résultat du groupe en 3D : une colonne par titre (${children.length}), haute selon son résultat, teintée selon son statut. Les mêmes valeurs sont dans le tableau qui suit.`}
          className="h-56"
        />
      )}

      {failed.length > 0 && (
        <PanelBlock title={`Titres non terminés ou en échec (${failed.length})`}>
          <ul className="divide-y divide-border border-y border-border text-sm">
            {failed.map((child) => (
              <li key={child.run_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{child.title}</span>
                  {child.error && <span className="text-destructive"> — {child.error}</span>}
                </span>
                <Link to={`${launchPath(view.pipelineId)}&titres=${encodeURIComponent(child.title)}`} className="link">
                  Relancer ce titre seul
                </Link>
              </li>
            ))}
          </ul>
        </PanelBlock>
      )}

      {grid && (
        <PanelBlock title="Tableau du groupe (un titre par ligne)">
          <DataGrid
            label="Tableau du groupe"
            columns={grid.columns}
            rows={grid.rows}
            renderCell={(cell, column) => {
              const runId = column === tickerLabel && typeof cell === 'string' ? runByTicker.get(cell) : undefined
              return runId ? (
                <Link to={runPath(runId)} className="link font-medium">
                  {cell}
                </Link>
              ) : undefined
            }}
          />
        </PanelBlock>
      )}
    </div>
  )
}
