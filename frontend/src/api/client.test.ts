import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import { json, mockFetch } from '../test/mockFetch'
import { API_BASE_URL } from '@/lib/env'

const ORIGINAL_FETCH = globalThis.fetch

describe('apiClient.request', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('prefixes the endpoint with the API base URL and parses the JSON body', async () => {
    const calls = mockFetch([json([{ id: 'amira' }])])

    const result = await apiClient.request('/api/personas')

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${API_BASE_URL}/api/personas`)
    expect(result).toEqual([{ id: 'amira' }])
  })

  it('sends no credentials and no CSRF header', async () => {
    const calls = mockFetch([json({})])

    await apiClient.request('/api/anything', { method: 'POST', body: '{}' })

    const headers = calls[0].init.headers as Record<string, string>
    expect(calls[0].init.credentials).toBeUndefined()
    expect(headers['X-CSRFToken']).toBeUndefined()
  })

  it('marks a string body as JSON unless the caller set a Content-Type', async () => {
    const calls = mockFetch([json({}), json({})])

    await apiClient.request('/api/a', { method: 'POST', body: '{}' })
    await apiClient.request('/api/b', {
      method: 'POST',
      body: 'x',
      headers: { 'Content-Type': 'text/plain' },
    })

    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
    expect((calls[1].init.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
  })

  it('resolves to null on an empty body', async () => {
    mockFetch([{ status: 204 }])

    await expect(apiClient.request('/api/empty', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('throws an ApiError carrying `detail` from the error body', async () => {
    mockFetch([json({ detail: 'Profil inconnu' }, 404)])

    await expect(apiClient.request('/api/personas/x')).rejects.toEqual({
      message: 'Profil inconnu',
      status: 404,
      details: { detail: 'Profil inconnu' },
    })
  })

  it('falls back to `message`, then to a generic message', async () => {
    mockFetch([json({ message: 'Bad input' }, 400), { status: 500, body: 'oops' }])

    await expect(apiClient.request('/api/a')).rejects.toMatchObject({
      message: 'Bad input',
      status: 400,
    })
    await expect(apiClient.request('/api/b')).rejects.toMatchObject({
      message: 'Request failed',
      status: 500,
      details: 'oops',
    })
  })

  it('throws an ApiError with status 0 when the server cannot be reached', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch

    await expect(apiClient.request('/api/personas')).rejects.toEqual({
      message: 'Failed to fetch',
      status: 0,
    })
  })
})
