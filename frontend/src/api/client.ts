/**
 * Minimal JSON client for the StockLock backend.
 *
 * No authentication: the backend is open and the investor profile is picked
 * on the front end, so there are no cookies, no CSRF token and no refresh.
 * Every failure is thrown as an `ApiError`.
 */

import { API_BASE_URL } from '@/lib/env'

export interface ApiError {
  message: string
  /** HTTP status, or 0 when the server could not be reached. */
  status: number
  /** Raw response body, when there is one. Narrow it at the use site. */
  details?: unknown
}

/** The user-facing message of an error body: `detail` first, then `message`. */
function extractErrorMessage(body: unknown): string {
  if (body && typeof body === 'object') {
    const fields = body as Record<string, unknown>
    if (typeof fields.detail === 'string') return fields.detail
    if (typeof fields.message === 'string') return fields.message
  }
  return 'Request failed'
}

/** The response body parsed as JSON, the raw text if it is not JSON, `null` if empty. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers })
  } catch (error) {
    const networkError: ApiError = {
      message: error instanceof Error ? error.message : 'Network error',
      status: 0,
    }
    throw networkError
  }

  const body = await readBody(response)
  if (!response.ok) {
    const httpError: ApiError = {
      message: extractErrorMessage(body),
      status: response.status,
      details: body,
    }
    throw httpError
  }
  return body as T
}

export const apiClient = { request }
