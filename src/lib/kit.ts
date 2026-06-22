// Recovery-kit decoding, re-implemented standalone (the tool must not import any
// reah-web code). Legacy v1 kits are `reah_rk_` + base64url(JSON). Compact v2 kits
// are `reah_rk_` + base64url(version | turnkey sub-org UUID | owner private scalar |
// recovery-user private scalar | CRC32). Public keys are derived locally.

import { p256 } from '@noble/curves/p256'
import { IS_MOCK, mockId } from './mock'

export const RECOVERY_KIT_STRING_PREFIX = 'reah_rk_'
const RECOVERY_KIT_COMPACT_VERSION = 2
const RECOVERY_KIT_COMPACT_PAYLOAD_BYTES = 1 + 16 + 32 + 32
const RECOVERY_KIT_COMPACT_BYTES = RECOVERY_KIT_COMPACT_PAYLOAD_BYTES + 4

export type RecoveryKit = {
  version: number
  entity_id?: string
  /** The entity's Turnkey sub-organization id. */
  turnkey_suborg_id: string
  user_id?: string
  /** Owner recovery key — P-256 compressed public key, hex (33 bytes). */
  public_key: string
  /** Owner recovery private scalar, hex (32 bytes). */
  private_key: string
  /** Dedicated "Recovery User" key — present only for a single-owner break-glass kit. */
  recovery_user_public_key?: string
  recovery_user_private_key?: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(withPad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('Invalid Turnkey sub-organization id')
  const hex = bytesToHex(bytes)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function readPrivateKeyBytes(value: string): Uint8Array {
  const bytes = hexToBytes(value)
  if (bytes.length !== 32) throw new Error('Invalid recovery private key')
  return bytes
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

export function deriveRecoveryPublicKey(privateKeyHex: string): string {
  return bytesToHex(p256.getPublicKey(readPrivateKeyBytes(privateKeyHex), true))
}

function decodeCompactRecoveryKit(payload: Uint8Array): RecoveryKit {
  if (payload.length !== RECOVERY_KIT_COMPACT_BYTES) {
    throw new Error('Recovery Kit string is corrupted or incomplete.')
  }
  const expectedChecksum = readUint32BE(payload, RECOVERY_KIT_COMPACT_PAYLOAD_BYTES)
  const actualChecksum = crc32(payload.slice(0, RECOVERY_KIT_COMPACT_PAYLOAD_BYTES))
  if (expectedChecksum !== actualChecksum) {
    throw new Error('Recovery Kit string is corrupted or incomplete.')
  }
  const privateKey = bytesToHex(payload.slice(17, 49))
  const recoveryUserPrivateKey = bytesToHex(payload.slice(49, 81))
  return {
    version: RECOVERY_KIT_COMPACT_VERSION,
    turnkey_suborg_id: bytesToUuid(payload.slice(1, 17)),
    public_key: deriveRecoveryPublicKey(privateKey),
    private_key: privateKey,
    recovery_user_public_key: deriveRecoveryPublicKey(recoveryUserPrivateKey),
    recovery_user_private_key: recoveryUserPrivateKey,
  }
}

export function decodeRecoveryKit(value: string): RecoveryKit {
  const trimmed = value.trim()
  if (IS_MOCK) {
    // Any non-empty string becomes a deterministic fake kit (distinct input → distinct
    // owner), so the flow can be exercised without a real Recovery Kit.
    const id = mockId(trimmed)
    return {
      version: 1,
      entity_id: 'mock-entity',
      turnkey_suborg_id: 'mock-suborg',
      user_id: `mock-user-${id}`,
      public_key: `mockpub_${id}`,
      private_key: `mockpriv_${id}`,
    }
  }
  if (!trimmed.startsWith(RECOVERY_KIT_STRING_PREFIX)) {
    throw new Error('Not a Reah Recovery Kit string (missing reah_rk_ prefix).')
  }
  const encoded = trimmed.slice(RECOVERY_KIT_STRING_PREFIX.length)
  const bytes = base64UrlToBytes(encoded)
  if (bytes[0] === RECOVERY_KIT_COMPACT_VERSION) {
    return decodeCompactRecoveryKit(bytes)
  }

  let kit: RecoveryKit
  try {
    kit = JSON.parse(new TextDecoder().decode(bytes)) as RecoveryKit
  } catch {
    throw new Error('Recovery Kit string is corrupted or incomplete.')
  }
  if (!kit.private_key || !kit.public_key || !kit.turnkey_suborg_id) {
    throw new Error('Recovery Kit is missing required key material.')
  }
  return kit
}

/** A short, human-readable fingerprint of the kit's public key for de-duping the UI. */
export function kitFingerprint(kit: RecoveryKit): string {
  const pk = kit.public_key
  return `${pk.slice(0, 6)}…${pk.slice(-4)}`
}
