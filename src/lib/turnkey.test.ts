import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecoveryKit } from './kit'
import { classifyWalletGroup, networkLabel } from './turnkey'

const KIT: RecoveryKit = {
  version: 1,
  entity_id: 'ent_1',
  turnkey_suborg_id: 'suborg_1',
  user_id: 'user_1',
  public_key: '03abcdef',
  private_key: 'beef',
}

describe('networkLabel', () => {
  it('maps known Turnkey address formats to friendly names', () => {
    expect(networkLabel('ADDRESS_FORMAT_ETHEREUM')).toBe('EVM')
    expect(networkLabel('ADDRESS_FORMAT_SOLANA')).toBe('Solana')
    expect(networkLabel('ADDRESS_FORMAT_COSMOS')).toBe('Cosmos')
    expect(networkLabel('ADDRESS_FORMAT_TRON')).toBe('Tron')
    expect(networkLabel('ADDRESS_FORMAT_BITCOIN_MAINNET_P2WPKH')).toBe('Bitcoin')
  })

  it('falls back to a de-prefixed, space-separated label for unknown formats', () => {
    expect(networkLabel('ADDRESS_FORMAT_APTOS_ED25519')).toBe('APTOS ED25519')
  })
})

describe('classifyWalletGroup', () => {
  const entity = '8f3a1b2c-0000-4d5e-9f10-abcdef012345'

  it('classifies backend banking settlement wallets', () => {
    expect(classifyWalletGroup(`${entity}-banking-settlement-wallet`)).toBe('banking')
    // backend variant uses an underscore in the suffix
    expect(classifyWalletGroup(`${entity}-banking_settlement-wallet`)).toBe('banking')
  })

  it('classifies backend treasury wallets (name ends with -treasury-wallet-<unix>)', () => {
    expect(classifyWalletGroup(`${entity}-treasury-wallet-1717000000`)).toBe('treasury')
  })

  it('treats everything else as a user wallet', () => {
    expect(classifyWalletGroup('Wallet1')).toBe('user')
    expect(classifyWalletGroup('Wallet1-1717000000')).toBe('user')
    expect(classifyWalletGroup('Safe{Wallet} My Multisig')).toBe('user')
    expect(classifyWalletGroup('My Treasury')).toBe('user')
    expect(classifyWalletGroup('banking')).toBe('user')
    expect(classifyWalletGroup('')).toBe('user')
  })

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(classifyWalletGroup(`  ${entity.toUpperCase()}-BANKING-SETTLEMENT-WALLET  `)).toBe('banking')
  })
})

describe('Turnkey lib in mock mode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('./mock', async () => {
      const actual = await vi.importActual<typeof import('./mock')>('./mock')
      return { ...actual, IS_MOCK: true, mockDelay: () => Promise.resolve() }
    })
  })
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('./mock')
  })

  it('validateKit echoes the kit identity as a mock whoami', async () => {
    const { validateKit } = await import('./turnkey')
    const who = await validateKit(KIT)
    expect(who).toMatchObject({ organizationId: 'suborg_1', organizationName: 'Mock Entity', userId: 'user_1' })
    expect(who.username).toMatch(/^owner-/)
  })

  it('checkKitCoverage requires two distinct approvals (never sole-sufficient)', async () => {
    const { checkKitCoverage } = await import('./turnkey')
    const cov = await checkKitCoverage(KIT)
    expect(cov.threshold).toBe(2)
    expect(cov.soleSufficient).toBe(false)
    expect(cov.coveredUserIds).toEqual(['user_1'])
    expect(cov.quorumUserIds).toHaveLength(2)
  })

  it('listWalletAccounts returns user, banking, and treasury accounts', async () => {
    const { listWalletAccounts, classifyWalletGroup } = await import('./turnkey')
    const accounts = await listWalletAccounts(KIT)
    expect(accounts.map((a) => a.addressFormat)).toEqual([
      'ADDRESS_FORMAT_ETHEREUM',
      'ADDRESS_FORMAT_SOLANA',
      'ADDRESS_FORMAT_ETHEREUM',
      'ADDRESS_FORMAT_ETHEREUM',
    ])
    expect(accounts.map((a) => classifyWalletGroup(a.walletName))).toEqual([
      'user',
      'user',
      'banking',
      'treasury',
    ])
  })

  it('exportWalletAccountPrivateKey returns a hex key for EVM and a distinct one for Solana', async () => {
    const { exportWalletAccountPrivateKey, listWalletAccounts } = await import('./turnkey')
    const [evm, sol] = await listWalletAccounts(KIT)
    const evmKey = await exportWalletAccountPrivateKey([KIT], evm)
    const solKey = await exportWalletAccountPrivateKey([KIT], sol)
    expect(evmKey).toMatch(/^0x[0-9a-f]+$/)
    expect(solKey).not.toBe(evmKey)
  })

  it('exportWalletAccountPrivateKey rejects when no kits are provided', async () => {
    const { exportWalletAccountPrivateKey, listWalletAccounts } = await import('./turnkey')
    const [evm] = await listWalletAccounts(KIT)
    await expect(exportWalletAccountPrivateKey([], evm)).rejects.toThrow(/No recovery kits/)
  })
})
