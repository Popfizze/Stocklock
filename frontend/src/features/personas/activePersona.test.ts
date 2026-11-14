import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStoredPersonaId, storePersonaId } from './activePersona'

describe('active profile storage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stores, reads back and clears the profile id', () => {
    expect(readStoredPersonaId()).toBeNull()

    storePersonaId('robert')
    expect(readStoredPersonaId()).toBe('robert')

    storePersonaId(null)
    expect(readStoredPersonaId()).toBeNull()
  })

  it('never throws when storage is unavailable', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied)

    expect(readStoredPersonaId()).toBeNull()
    expect(() => storePersonaId('amira')).not.toThrow()
    expect(() => storePersonaId(null)).not.toThrow()
  })
})
