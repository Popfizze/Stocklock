import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDuration, type LabRunRecord } from './labForm'
import { PassBadge } from './StatusBadges'

interface RunsTableProps {
  /** Newest first. */
  runs: LabRunRecord[]
}

/** This session's runs, to compare choices. Lives in page state only. */
export function RunsTable({ runs }: RunsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Exécutions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Étape</TableHead>
              <TableHead>Options modifiées</TableHead>
              <TableHead>Durée</TableHead>
              <TableHead>Résultat clé</TableHead>
              <TableHead>Gouvernance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Aucune exécution pour l'instant.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow key={run.runId}>
                  <TableCell>{run.stepLabel}</TableCell>
                  <TableCell className="whitespace-normal">
                    {run.changedOptions.length === 0 ? (
                      <span className="text-muted-foreground">Aucune (défauts)</span>
                    ) : (
                      <ul>
                        {run.changedOptions.map((option) => (
                          <li key={option}>{option}</li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>{formatDuration(run.durationMs)}</TableCell>
                  <TableCell>{run.keyResult}</TableCell>
                  <TableCell>
                    <PassBadge passed={run.governancePassed} feminine />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
