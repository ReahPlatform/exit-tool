import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  decodeRecoveryKit,
  deriveRecoveryPublicKey,
  kitFingerprint,
  RECOVERY_KIT_STRING_PREFIX,
  type RecoveryKit,
} from './kit'

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

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'))
}

function uuidToBytes(uuid: string): Uint8Array {
  return hexToBytes(uuid.replace(/-/g, ''))
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff
  bytes[offset + 1] = (value >>> 16) & 0xff
  bytes[offset + 2] = (value >>> 8) & 0xff
  bytes[offset + 3] = value & 0xff
}

function encodeCompactKit({
  turnkeySuborgId,
  ownerPrivateKey,
  recoveryUserPrivateKey,
}: {
  turnkeySuborgId: string
  ownerPrivateKey: string
  recoveryUserPrivateKey: string
}): string {
  const payload = new Uint8Array(85)
  payload[0] = 2
  payload.set(uuidToBytes(turnkeySuborgId), 1)
  payload.set(hexToBytes(ownerPrivateKey), 17)
  payload.set(hexToBytes(recoveryUserPrivateKey), 49)
  writeUint32BE(payload, 81, crc32(payload.slice(0, 81)))
  return RECOVERY_KIT_STRING_PREFIX + bytesToBase64Url(payload)
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

  it('decodes compact v2 kits without entity id, user id, or public keys', () => {
    const turnkeySuborgId = '018f00a2-3f5a-73b2-bb7e-0f1111111111'
    const ownerPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001'
    const recoveryUserPrivateKey = '0000000000000000000000000000000000000000000000000000000000000002'

    const encoded = encodeCompactKit({ turnkeySuborgId, ownerPrivateKey, recoveryUserPrivateKey })
    expect(encoded).toHaveLength(122)

    expect(decodeRecoveryKit(encoded)).toEqual({
      version: 2,
      turnkey_suborg_id: turnkeySuborgId,
      public_key: deriveRecoveryPublicKey(ownerPrivateKey),
      private_key: ownerPrivateKey,
      recovery_user_public_key: deriveRecoveryPublicKey(recoveryUserPrivateKey),
      recovery_user_private_key: recoveryUserPrivateKey,
    })
  })

  it('derives compressed P-256 public keys from private scalars', () => {
    expect(deriveRecoveryPublicKey('0000000000000000000000000000000000000000000000000000000000000001')).toBe(
      '036b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',
    )
  })

  it('rejects a compact v2 kit with a bad checksum', () => {
    const encoded = encodeCompactKit({
      turnkeySuborgId: '018f00a2-3f5a-73b2-bb7e-0f1111111111',
      ownerPrivateKey: '0000000000000000000000000000000000000000000000000000000000000001',
      recoveryUserPrivateKey: '0000000000000000000000000000000000000000000000000000000000000002',
    })
    const tamperIndex = RECOVERY_KIT_STRING_PREFIX.length + 20
    const replacement = encoded[tamperIndex] === 'A' ? 'B' : 'A'
    const tampered = `${encoded.slice(0, tamperIndex)}${replacement}${encoded.slice(tamperIndex + 1)}`
    expect(() => decodeRecoveryKit(tampered)).toThrow(/corrupted or incomplete/)
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
