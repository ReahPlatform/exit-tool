// Recovery-kit decoding, re-implemented standalone (the tool must not import any
// reah-web code). A kit string is `reah_rk_` + base64url(JSON). The JSON carries the
// owner's recovery P-256 keypair (and, for a sole owner, a second "recovery user" key)
// plus the Turnkey sub-organization id — everything needed to talk to Turnkey directly.

export const RECOVERY_KIT_STRING_PREFIX = 'reah_rk_'

export type RecoveryKit = {
  version: number
  entity_id: string
  /** The entity's Turnkey sub-organization id. */
  turnkey_suborg_id: string
  user_id: string
  /** Owner recovery key — P-256 compressed public key, hex (33 bytes). */
  public_key: string
  /** Owner recovery private scalar, hex (32 bytes). */
  private_key: string
  /** Dedicated "Recovery User" key — present only for a single-owner break-glass kit. */
  recovery_user_public_key?: string
  recovery_user_private_key?: string
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(withPad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function decodeRecoveryKit(value: string): RecoveryKit {
  const trimmed = value.trim()
  if (!trimmed.startsWith(RECOVERY_KIT_STRING_PREFIX)) {
    throw new Error('Not a Reah Recovery Kit string (missing reah_rk_ prefix).')
  }
  const encoded = trimmed.slice(RECOVERY_KIT_STRING_PREFIX.length)
  let kit: RecoveryKit
  try {
    kit = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as RecoveryKit
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
