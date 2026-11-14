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

/** `pipeline`: `score_pipeline` or a Labo step id. */
export function launchPath(pipeline?: string): string {
  return pipeline ? `${LAUNCH_PATH}?pipeline=${encodeURIComponent(pipeline)}` : LAUNCH_PATH
}
