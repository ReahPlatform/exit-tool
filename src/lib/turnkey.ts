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
 * Export is a root-quorum activity. The first kit submits it; if Turnkey reports
 * CONSENSUS_NEEDED, the remaining kits approve until the threshold is met. A sole
 * owner provides one kit that carries BOTH the owner key and the recovery-user key,
 * which together meet a threshold-2 quorum — both are used to approve here.
 */
export async function exportWalletAccountPrivateKey(
  kits: RecoveryKit[],
  walletAccount: WalletAccount,
): Promise<string> {
  if (kits.length === 0) throw new Error('No recovery kits provided.')

  // Ephemeral target keypair: Turnkey encrypts the export bundle to this public key,
  // and we decrypt it locally with the matching private key.
  const target = generateP256KeyPair()
  const organizationId = kits[0].turnkey_suborg_id

  const submitter = clientForKit(kits[0])
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

  // Build the full set of approver keys: every owner kit's key, plus the sole-owner
  // recovery-user key when present.
  const approverKeys: Array<{ pub: string; priv: string }> = []
  for (const kit of kits) {
    approverKeys.push({ pub: kit.public_key, priv: kit.private_key })
    if (kit.recovery_user_public_key && kit.recovery_user_private_key) {
      approverKeys.push({ pub: kit.recovery_user_public_key, priv: kit.recovery_user_private_key })
    }
  }

  // Approve with the remaining keys until the activity completes.
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
