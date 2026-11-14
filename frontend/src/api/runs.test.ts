import { describe, expect, it } from 'vitest'
import { RUNS_QUERY_KEYS, runsQuery } from './runs'

describe('runs registry contract', () => {
  it('builds the list query from the filters that are set, then the cursor', () => {
    expect(runsQuery({}, null)).toBe('')
    expect(runsQuery({ pipeline: 'lab', persona: 'amira', limit: 50 }, null)).toBe(
      'pipeline=lab&persona=amira&limit=50',
    )
    expect(runsQuery({ status: 'failed', trigger: 'schedule' }, '20261114T060000Z-0f9e8d')).toBe(
      'status=failed&trigger=schedule&cursor=20261114T060000Z-0f9e8d',
    )
  })

  it('nests every key under the run so one invalidation refreshes a run and its parts', () => {
    const detail = RUNS_QUERY_KEYS.detail('r1')
    expect(RUNS_QUERY_KEYS.stage('r1', 'fetch').slice(0, detail.length)).toEqual(detail)
    expect(RUNS_QUERY_KEYS.artifact('r1', 'a', 0, 100).slice(0, detail.length)).toEqual(detail)
    expect(RUNS_QUERY_KEYS.list({ pipeline: 'lab' }).slice(0, 2)).toEqual(RUNS_QUERY_KEYS.lists())
  })
})
