import type { ReactNode } from 'react'
import type { LabResult } from '@/api/lab'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatValue } from './labForm'
import { SourceList } from './SourceList'
import { PassBadge } from './StatusBadges'

interface FinalResultProps {
  result: LabResult
}

export function FinalResult({ result }: FinalResultProps) {
  const sourceTitle = (id: string | undefined) =>
    id === undefined ? '—' : (result.sources.find((source) => source.id === id)?.title ?? id)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Résultat final</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="whitespace-pre-line">{result.answer}</p>

        {result.factors.length > 0 && (
          <Section title="Facteurs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facteur</TableHead>
                  <TableHead>Valeur</TableHead>
                  <TableHead>Effet</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.factors.map((factor, index) => (
                  <TableRow key={index}>
                    <TableCell>{factor.name}</TableCell>
                    <TableCell>
                      {formatValue(factor.value)}
                      {factor.unit ? ` ${factor.unit}` : ''}
                    </TableCell>
                    <TableCell>{factor.effect ?? '—'}</TableCell>
                    <TableCell>{sourceTitle(factor.source_id)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        )}

        {result.sources.length > 0 && (
          <Section title="Sources">
            <SourceList sources={result.sources} />
          </Section>
        )}

        {result.assumptions.length > 0 && (
          <Section title="Hypothèses">
            <TextList items={result.assumptions} />
          </Section>
        )}

        {result.limits.length > 0 && (
          <Section title="Limites">
            <TextList items={result.limits} />
          </Section>
        )}

        <Section
          title="Gouvernance"
          badge={<PassBadge passed={result.governance.passed} feminine />}
        >
          <ul className="space-y-2 text-sm">
            {result.governance.checks.map((check, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-2">
                <PassBadge passed={check.passed} />
                <span className="font-medium">{check.name}</span>
                {check.note && <span className="text-muted-foreground">— {check.note}</span>}
              </li>
            ))}
          </ul>
        </Section>
      </CardContent>
    </Card>
  )
}

interface SectionProps {
  title: string
  badge?: ReactNode
  children: ReactNode
}

function Section({ title, badge, children }: SectionProps) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 font-medium">
        {title}
        {badge}
      </h3>
      {children}
    </section>
  )
}

function TextList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}
