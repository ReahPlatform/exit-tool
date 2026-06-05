// Direct-to-Turnkey client. Every call is signed (X-Stamped) with a recovery-kit
// P-256 key. Nothing here touches Reah — only api.turnkey.com.
import { ApiKeyStamper } from '@turnkey/api-key-stamper'
import { decryptExportBundle, generateP256KeyPair } from '@turnkey/crypto'
import { TurnkeyClient } from '@turnkey/http'

import type { RecoveryKit } from './kit'

const TURNKEY_BASE_URL = 'https://api.turnkey.com'

function clientForKey(publicKeyHex: string, privateKeyHex: string): TurnkeyClient {
  const stamper = new ApiKeyStamper({ apiPublicKey: publicKeyHex, apiPrivateKey: privateKeyHex })
  return new TurnkeyClient({ baseUrl: TURNKEY_BASE_URL }, stamper)
}

function clientForKit(kit: RecoveryKit): TurnkeyClient {
  return clientForKey(kit.public_key, kit.private_key)
}

export type WhoAmI = {
  organizationId: string
  organizationName: string
  userId: string
  username: string
}

/** Validates that the kit's key is accepted by Turnkey for its sub-org. */
export async function validateKit(kit: RecoveryKit): Promise<WhoAmI> {
  const client = clientForKit(kit)
  const resp = await client.getWhoami({ organizationId: kit.turnkey_suborg_id })
  return {
    organizationId: resp.organizationId,
    organizationName: resp.organizationName,
    userId: resp.userId,
    username: resp.username,
  }
}

export type KitCoverage = {
  /** Distinct approvals the root quorum requires to approve an export. */
  threshold: number
  /** All quorum member user IDs. */
  quorumUserIds: string[]
  /**
   * The quorum members THIS kit can actually vote as — i.e. members whose live
   * credential matches a key carried by the kit. A kit always carries the owner key; a
   * single-owner break-glass kit also carries the recovery-user key. A key only counts
   * if Turnkey still recognises it as that member's credential (a rotated/stale recovery
   * key contributes nothing).
   */
  coveredUserIds: string[]
  /** True when this one kit alone covers enough distinct quorum members (a sole owner). */
  soleSufficient: boolean
}

type QuorumMap = {
  threshold: number
  quorumUserIds: string[]
  /** Quorum member user IDs (a Set view of quorumUserIds). */
  quorum: Set<string>
  /** Lower-cased credential public key → the user that currently owns it. */
  pubKeyToUser: Map<string, string>
}

/**
 * Reads the sub-org's root quorum (threshold + members) and a map from every live
 * credential public key to its owning user. This is the single source of truth for "which
 * keys can actually vote": a key only counts if it appears here as a current credential of
 * a quorum member.
 */
async function loadQuorumMap(client: TurnkeyClient, organizationId: string): Promise<QuorumMap> {
  const cfg = await client.getOrganizationConfigs({ organizationId })
  const threshold = cfg.configs.quorum?.threshold ?? 1
  const quorumUserIds = cfg.configs.quorum?.userIds ?? []

  const usersResp = await client.getUsers({ organizationId })
  const pubKeyToUser = new Map<string, string>()
  for (const user of usersResp.users) {
    for (const apiKey of user.apiKeys ?? []) {
      const pub = apiKey.credential?.publicKey
      if (pub) pubKeyToUser.set(pub.toLowerCase(), user.userId)
    }
  }

  return { threshold, quorumUserIds, quorum: new Set(quorumUserIds), pubKeyToUser }
}

/**
 * Resolves, against live Turnkey state, which root-quorum members this kit can vote as.
 *
 * A kit always carries the owner key; a single-owner break-glass kit also carries the
 * recovery-user key. Each key counts only if it is a current credential of a quorum
 * member — a stale recovery key that Turnkey no longer recognises contributes nothing, so
 * the kit falls short of the threshold and a second kit is required.
 */
export async function checkKitCoverage(kit: RecoveryKit): Promise<KitCoverage> {
  const organizationId = kit.turnkey_suborg_id
  const { threshold, quorumUserIds, quorum, pubKeyToUser } = await loadQuorumMap(clientForKit(kit), organizationId)

  const covered = new Set<string>()
  const kitKeys = [kit.public_key, kit.recovery_user_public_key].filter(Boolean) as string[]
  for (const pub of kitKeys) {
    const userId = pubKeyToUser.get(pub.toLowerCase())
    if (userId && quorum.has(userId)) covered.add(userId)
  }

  const coveredUserIds = [...covered]
  return { threshold, quorumUserIds, coveredUserIds, soleSufficient: coveredUserIds.length >= threshold }
}

type ApproverKey = { pub: string; priv: string; userId: string }

/**
 * From the entered kits, builds the ordered list of keys that can actually approve an
 * export — one working key per distinct quorum member. Every candidate key (each kit's
 * owner key, plus any bundled recovery-user key) is checked against live Turnkey state and
 * dropped unless it is a current credential of a quorum member not already covered. This
 * is what lets a sole owner use [owner key, recovery-user key] while a multi-owner export
 * uses [owner-A key, owner-B key] — and never tries a stale key that would 404.
 */
async function resolveApproverKeys(kits: RecoveryKit[], organizationId: string): Promise<ApproverKey[]> {
  const { quorum, pubKeyToUser } = await loadQuorumMap(clientForKit(kits[0]), organizationId)

  const approvers: ApproverKey[] = []
  const seenMembers = new Set<string>()
  for (const kit of kits) {
    const candidates: Array<{ pub: string; priv: string }> = [{ pub: kit.public_key, priv: kit.private_key }]
    if (kit.recovery_user_public_key && kit.recovery_user_private_key) {
      candidates.push({ pub: kit.recovery_user_public_key, priv: kit.recovery_user_private_key })
    }
    for (const c of candidates) {
      const userId = pubKeyToUser.get(c.pub.toLowerCase())
      if (userId && quorum.has(userId) && !seenMembers.has(userId)) {
        seenMembers.add(userId)
        approvers.push({ ...c, userId })
      }
    }
  }
  return approvers
}

export type WalletAccount = {
  walletId: string
  walletName: string
  accountId: string
  address: string
  addressFormat: string
  curve: string
}

/** Lists every wallet account (address + network) in the sub-org. */
export async function listWalletAccounts(kit: RecoveryKit): Promise<WalletAccount[]> {
  const client = clientForKit(kit)
  const organizationId = kit.turnkey_suborg_id
  const walletsResp = await client.getWallets({ organizationId })

  const accounts: WalletAccount[] = []
  for (const wallet of walletsResp.wallets) {
    const accountsResp = await client.getWalletAccounts({
      organizationId,
      walletId: wallet.walletId,
    })
    for (const acct of accountsResp.accounts) {
      accounts.push({
        walletId: wallet.walletId,
        walletName: wallet.walletName,
        accountId: acct.walletAccountId,
        address: acct.address,
        addressFormat: acct.addressFormat,
        curve: acct.curve,
      })
    }
  }
  return accounts
}

/** Maps a Turnkey address format to a friendly network label for display. */
export function networkLabel(addressFormat: string): string {
  if (addressFormat.includes('ETHEREUM')) return 'EVM'
  if (addressFormat.includes('SOLANA')) return 'Solana'
  if (addressFormat.includes('COSMOS')) return 'Cosmos'
  if (addressFormat.includes('TRON')) return 'Tron'
  if (addressFormat.includes('BITCOIN')) return 'Bitcoin'
  return addressFormat.replace('ADDRESS_FORMAT_', '').replace(/_/g, ' ')
}

/**
 * Exports the live private key for a wallet account, decrypted locally.
 *
 * Export is a root-quorum activity. We first resolve which keys can actually vote (one
 * working key per distinct quorum member — stale keys are dropped), then propose the
 * export with the first and approve with the rest until the threshold is met. A sole owner
 * resolves to [owner key, recovery-user key]; a multi-owner export to two owners' keys.
 */
export async function exportWalletAccountPrivateKey(
  kits: RecoveryKit[],
  walletAccount: WalletAccount,
): Promise<string> {
  if (kits.length === 0) throw new Error('No recovery kits provided.')

  const organizationId = kits[0].turnkey_suborg_id

  // Only keys Turnkey still recognises as quorum-member credentials, one per member.
  const approverKeys = await resolveApproverKeys(kits, organizationId)
  if (approverKeys.length === 0) {
    throw new Error('None of the recovery kits carry a key Turnkey recognises for this entity.')
  }

  // Ephemeral target keypair: Turnkey encrypts the export bundle to this public key,
  // and we decrypt it locally with the matching private key.
  const target = generateP256KeyPair()

  // Propose with the first working key.
  const submitter = clientForKey(approverKeys[0].pub, approverKeys[0].priv)
  let activity = (
    await submitter.exportWalletAccount({
      type: 'ACTIVITY_TYPE_EXPORT_WALLET_ACCOUNT',
      timestampMs: String(Date.now()),
      organizationId,
      parameters: {
        address: walletAccount.address,
        targetPublicKey: target.publicKeyUncompressed,
      },
    })
  ).activity

  // Approve with the remaining working keys until the activity completes.
  let approverIndex = 1
  while (activity.status === 'ACTIVITY_STATUS_CONSENSUS_NEEDED' && approverIndex < approverKeys.length) {
    const key = approverKeys[approverIndex]
    const approver = clientForKey(key.pub, key.priv)
    activity = (
      await approver.approveActivity({
        type: 'ACTIVITY_TYPE_APPROVE_ACTIVITY',
        timestampMs: String(Date.now()),
        organizationId,
        parameters: { fingerprint: activity.fingerprint },
      })
    ).activity
    approverIndex += 1
  }

  if (activity.status !== 'ACTIVITY_STATUS_COMPLETED') {
    throw new Error(
      `Export did not complete (status ${activity.status}). The recovery kits may not meet the wallet's signing quorum.`,
    )
  }

  const exportBundle = activity.result.exportWalletAccountResult?.exportBundle
  if (!exportBundle) throw new Error('Turnkey did not return an export bundle.')

  // Decrypt locally — the plaintext private key never leaves the browser.
  return decryptExportBundle({
    exportBundle,
    embeddedKey: target.privateKey,
    organizationId,
    returnMnemonic: false,
    keyFormat: walletAccount.addressFormat.includes('SOLANA') ? 'SOLANA' : 'HEXADECIMAL',
  })
}
