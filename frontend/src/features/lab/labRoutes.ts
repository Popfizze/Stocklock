/** The Labo's addresses. */

export const LAB_PATH = '/labo'
export const LAUNCH_PATH = '/labo/lancer'
export const COMPARE_PATH = '/labo/comparer'

export function runPath(runId: string): string {
  return `/labo/executions/${encodeURIComponent(runId)}`
}

export function comparePath(left: string, right: string): string {
  return `${COMPARE_PATH}?a=${encodeURIComponent(left)}&b=${encodeURIComponent(right)}`
}

/** `pipeline`: `score_pipeline` or a Labo step id. `from`: a run to start again, with its group and settings. */
export function launchPath(pipeline?: string, from?: string): string {
  const query = [pipeline ? `pipeline=${encodeURIComponent(pipeline)}` : null, from ? `depuis=${encodeURIComponent(from)}` : null]
    .filter(Boolean)
    .join('&')
  return query ? `${LAUNCH_PATH}?${query}` : LAUNCH_PATH
}
