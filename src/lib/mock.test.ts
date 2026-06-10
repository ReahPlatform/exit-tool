import { describe, expect, it } from 'vitest'

import { IS_MOCK, mockId } from './mock'

describe('mockId', () => {
  it('is deterministic for the same seed', () => {
    expect(mockId('reah_rk_owner_one')).toBe(mockId('reah_rk_owner_one'))
  })

  it('maps distinct seeds to distinct ids (so each kit looks like a different owner)', () => {
    const ids = ['a', 'b', 'reah_rk_owner_one', 'reah_rk_owner_two', ''].map(mockId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('produces a compact base36 string', () => {
    expect(mockId('anything')).toMatch(/^[0-9a-z]+$/)
  })
})

describe('IS_MOCK', () => {
  it('is off by default in the test/node environment (no window, no VITE_MOCK)', () => {
    // The whole point of the gate: nothing turns mock data on unless explicitly requested
    // via dev. A plain import must never short-circuit the real Turnkey path.
    expect(IS_MOCK).toBe(false)
  })
})
