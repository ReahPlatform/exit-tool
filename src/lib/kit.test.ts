import { afterEach, describe, expect, it, vi } from 'vitest'

import { decodeRecoveryKit, kitFingerprint, RECOVERY_KIT_STRING_PREFIX, type RecoveryKit } from './kit'

const VALID_KIT: RecoveryKit = {
  version: 1,
  entity_id: 'ent_123',
  turnkey_suborg_id: 'suborg_abc',
  user_id: 'user_xyz',
  public_key: '03a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
  private_key: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef0',
}

/** base64url-encode raw bytes and attach the kit prefix. */
function rawEncode(text: string): string {
  const b64 = Buffer.from(text, 'utf8').toString('base64')
  const url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return RECOVERY_KIT_STRING_PREFIX + url
}

/** Encode a kit object the same way the producer does: reah_rk_ + base64url(JSON). */
function encodeKit(obj: unknown): string {
  return rawEncode(JSON.stringify(obj))
}

describe('kitFingerprint', () => {
  it('shortens the public key to first-6…last-4', () => {
    expect(kitFingerprint(VALID_KIT)).toBe('03a1b2…8f90')
  })
})

describe('decodeRecoveryKit (real path)', () => {
  it('round-trips a valid encoded kit', () => {
    expect(decodeRecoveryKit(encodeKit(VALID_KIT))).toEqual(VALID_KIT)
  })

  it('trims surrounding whitespace before decoding', () => {
    expect(decodeRecoveryKit(`  ${encodeKit(VALID_KIT)}\n`)).toEqual(VALID_KIT)
  })

  it('preserves optional recovery-user keys', () => {
    const sole = { ...VALID_KIT, recovery_user_public_key: '02ff', recovery_user_private_key: 'cafe' }
    expect(decodeRecoveryKit(encodeKit(sole))).toEqual(sole)
  })

  it('rejects a string without the reah_rk_ prefix', () => {
    expect(() => decodeRecoveryKit('not_a_kit')).toThrow(/missing reah_rk_ prefix/)
  })

  it('rejects a payload that is not valid JSON', () => {
    expect(() => decodeRecoveryKit(rawEncode('{ not json'))).toThrow(/corrupted or incomplete/)
  })

  it('rejects a kit missing required key material', () => {
    const { private_key: _omit, ...missing } = VALID_KIT
    void _omit
    expect(() => decodeRecoveryKit(encodeKit(missing))).toThrow(/missing required key material/)
  })
})

describe('decodeRecoveryKit (mock path)', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('./mock')
  })

  it('turns any non-empty string into a deterministic fake kit, distinct per input', async () => {
    vi.resetModules()
    vi.doMock('./mock', async () => {
      const actual = await vi.importActual<typeof import('./mock')>('./mock')
      return { ...actual, IS_MOCK: true }
    })
    const { decodeRecoveryKit: decodeMock } = await import('./kit')

    const a = decodeMock('whatever-owner-a')
    const b = decodeMock('whatever-owner-b')
    expect(a.turnkey_suborg_id).toBe('mock-suborg')
    expect(a.user_id).toMatch(/^mock-user-/)
    expect(decodeMock('whatever-owner-a')).toEqual(a) // deterministic
    expect(a.user_id).not.toBe(b.user_id) // distinct input → distinct owner
  })
})
