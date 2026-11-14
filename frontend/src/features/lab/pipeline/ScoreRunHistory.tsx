import { useState } from 'react'
import { useScoreRun, type ScoreRun, type ScoreRunInfo } from '@/api/pipeline'
import { formatScore } from '@/features/stocks/format'
import type { CompareRun } from '../flow/flowModel'
import { RunCompare } from '../RunCompare'
import { RunHistory, type HistoryItem } from '../RunHistory'
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  TRIGGER_LABELS,
  formatCount,
  formatDateTime,
  formatSeconds,
  formatShare,
} from './pipelineFormat'

function historyItem(run: ScoreRunInfo): HistoryItem {
  return {
    id: run.run_id,
    statusLabel: STATUS_LABELS[run.status],
    statusVariant: STATUS_VARIANTS[run.status],
    when: formatDateTime(run.started_at),
    summary:
      run.summary?.titles_scored == null
        ? `${formatCount(run.params.max_titles)} titres demandés`
        : `${formatCount(run.summary.titles_scored)} titres notés`,
    detail: `${TRIGGER_LABELS[run.trigger]} · ${formatSeconds(run.duration_s)}`,
  }
}

function compareRun(run: ScoreRun): CompareRun {
  const decisions: Record<string, string> = {}
  for (const stage of run.stages) {
    for (const decision of stage.decisions) {
      decisions[`${stage.label} · ${decision.message}`] = formatCount(decision.count)
    }
  }
  const { params, summary } = run
  return {
    id: run.run_id,
    title: formatDateTime(run.started_at),
    params: {
      'Nombre de titres': formatCount(params.max_titles),
      'Actions canadiennes': formatShare(params.ca_share),
      FNB: formatShare(params.etf_share),
      'Articles par titre': formatCount(params.news_per_title),
      'Articles envoyés à Haiku (max.)': formatCount(params.max_llm_articles),
    },
    results: {
      Statut: STATUS_LABELS[run.status],
      'Titres notés': formatCount(summary?.titles_scored),
      'Scores partiels': formatCount(summary?.partial),
      'Appels Bedrock': formatCount(summary?.bedrock_calls),
      Durée: formatSeconds(run.duration_s),
      'Meilleurs scores':
        summary?.top?.map((row) => `${row.symbol} ${formatScore(row.score)}`).join(', ') || '—',
    },
    decisions,
  }
}

interface ScoreRunHistoryProps {
  runs: ScoreRunInfo[]
  shownId: string | null
  onShow: (id: string) => void
}

/** The score runs (manual or daily), with the side-by-side comparison of two of them. */
export function ScoreRunHistory({ runs, shownId, onShow }: ScoreRunHistoryProps) {
  const [compareIds, setCompareIds] = useState<string[]>([])
  // The comparison needs each run's stages (decisions), which the list does not carry.
  const { data: left } = useScoreRun(compareIds[0] ?? null)
  const { data: right } = useScoreRun(compareIds[1] ?? null)

  const toggle = (id: string) =>
    setCompareIds((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id].slice(0, 2),
    )

  return (
    <RunHistory
      items={runs.map(historyItem)}
      shownId={shownId}
      onShow={onShow}
      compareIds={compareIds}
      onToggleCompare={toggle}
    >
      {compareIds.length === 2 &&
        (left && right ? (
          <RunCompare left={compareRun(left)} right={compareRun(right)} />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Chargement des deux runs…
          </p>
        ))}
    </RunHistory>
  )
}
