import { useEffect, useMemo, useState } from 'react'

import brand from './assets/brand.png'
import { Icon } from './icons'
import { decodeRecoveryKit, kitFingerprint, type RecoveryKit } from './lib/kit'
import {
  checkKitCoverage,
  classifyWalletGroup,
  exportWalletAccountPrivateKey,
  listWalletAccounts,
  networkLabel,
  validateKit,
  type WalletAccount,
  type WalletGroup,
  type WhoAmI,
} from './lib/turnkey'

// Display order + headers for the three wallet groups. Backend-created banking and
// treasury wallets are detected by name (classifyWalletGroup); everything else is "user".
const WALLET_GROUPS: { key: WalletGroup; label: string }[] = [
  { key: 'user', label: 'User wallets' },
  { key: 'banking', label: 'Banking' },
  { key: 'treasury', label: 'Treasury' },
]

type StepId = 'keys' | 'wallet' | 'export' | 'reveal'
const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'keys', label: 'Enter kits' },
  { id: 'wallet', label: 'Select wallet' },
  { id: 'export', label: 'Export key' },
  { id: 'reveal', label: 'Private key' },
]

export function App() {
  const [step, setStep] = useState<StepId>('keys')
  const [kits, setKits] = useState<RecoveryKit[]>([])
  const [selected, setSelected] = useState<WalletAccount | null>(null)
  const [privateKey, setPrivateKey] = useState<string | null>(null)
  const stepIdx = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="gh-shell">
      <Topbar />
      <div className="gh-main">
        <Sidebar idx={stepIdx} onGo={setStep} />
        <div className="gh-content">
          {step === 'keys' && <StepKeys onChange={setKits} onNext={() => setStep('wallet')} />}
          {step === 'wallet' && (
            <StepWallet
              kit={kits[0]}
              selected={selected}
              onSelect={setSelected}
              onBack={() => setStep('keys')}
              onNext={() => setStep('export')}
            />
          )}
          {step === 'export' && selected && (
            <StepExport
              kits={kits}
              account={selected}
              onDone={(pk) => {
                setPrivateKey(pk)
                setStep('reveal')
              }}
              onBack={() => setStep('wallet')}
            />
          )}
          {step === 'reveal' && selected && privateKey && (
            <StepReveal account={selected} privateKey={privateKey} onBack={() => setStep('wallet')} />
          )}
        </div>
      </div>
    </div>
  )
}

function Topbar() {
  return (
    <div className="gh-topbar">
      <img className="brand-logo" src={brand} alt="Reah" width={66} height={18} />
      <span className="brand-divider" />
      <div className="title">Reah Exit Tool</div>
      <div className="repo">
        <Icon.Github size={12} /> github.com/ReahPlatform/exit-tool
      </div>
      <div className="status">
        <span className="dot" />
        Running offline · in your browser
      </div>
      <div className="topright">
        <a
          className="gh-btn"
          href="https://github.com/ReahPlatform/exit-tool#readme"
          target="_blank"
          rel="noreferrer"
        >
          <Icon.HelpCircle size={14} /> Docs
        </a>
        <a
          className="gh-btn"
          href="https://github.com/ReahPlatform/exit-tool"
          target="_blank"
          rel="noreferrer"
        >
          <Icon.Branch size={14} /> Source
        </a>
      </div>
    </div>
  )
}

function Sidebar({ idx, onGo }: { idx: number; onGo: (s: StepId) => void }) {
  return (
    <aside className="gh-side">
      <div className="gh-session-card">
        <div className="gh-session-head">
          <div className="gh-session-icon">
            <Icon.ShieldCheck size={16} />
          </div>
          <div>
            <div className="gh-session-title">Recovery session</div>
            <div className="gh-session-sub">Offline · no Reah connection</div>
          </div>
        </div>
        <div className="gh-session-copy">
          Open-source and offline-first. Every operation happens in your browser; nothing is uploaded to Reah.
        </div>
      </div>
      <div className="step-group">Recover</div>
      <nav className="rk-stepper" aria-label="Progress">
        {STEPS.map((s, i) => {
          const status = i < idx ? 'done' : i === idx ? 'current' : 'todo'
          const isLast = i === STEPS.length - 1
          const clickable = i <= idx
          return (
            <div key={s.id} className="rk-step">
              {!isLast && <span className="rk-step-line" />}
              {clickable ? (
                <button type="button" className="rk-step-row is-clickable" onClick={() => onGo(s.id)}>
                  <span className={`rk-badge is-${status}`}>
                    {status === 'done' ? <Icon.Check size={14} /> : i + 1}
                  </span>
                  <span className={`rk-step-label is-${status}`}>{s.label}</span>
                </button>
              ) : (
                <div className="rk-step-row">
                  <span className={`rk-badge is-${status}`}>{i + 1}</span>
                  <span className={`rk-step-label is-${status}`}>{s.label}</span>
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

// ── Step 1: paste recovery kits, each verified against Turnkey's live quorum ──
type KitSlot = {
  value: string
  status: 'empty' | 'checking' | 'valid' | 'invalid'
  whoami?: WhoAmI
  kit?: RecoveryKit
  // Distinct quorum members this kit can actually vote as (live-verified).
  covered?: string[]
  error?: string
}
const EMPTY_SLOT: KitSlot = { value: '', status: 'empty' }
// A recovery needs at most two kits: a sole owner's single kit (owner + recovery-user
// votes), or two owners' kits for a two-of-N quorum.
const MAX_KITS = 2

// Distinct quorum members covered across every verified kit = the export votes in hand.
function countVotes(slots: KitSlot[]): number {
  const members = new Set<string>()
  for (const s of slots) if (s.status === 'valid' && s.covered) s.covered.forEach((u) => members.add(u))
  return members.size
}

function StepKeys({ onChange, onNext }: { onChange: (k: RecoveryKit[]) => void; onNext: () => void }) {
  const [slots, setSlots] = useState<KitSlot[]>([{ ...EMPTY_SLOT }])
  // Distinct approvals the entity's root quorum requires, learned once the first kit
  // verifies. Whether one kit is enough is decided by live coverage, not by the kit's shape.
  const [threshold, setThreshold] = useState<number | null>(null)
  const [mode, setMode] = useState<'sole' | 'multi' | null>(null)

  // Surface the de-duplicated set of valid kits to the parent for the later steps.
  useEffect(() => {
    const seen = new Set<string>()
    const kits: RecoveryKit[] = []
    for (const s of slots) {
      if (s.status === 'valid' && s.kit) {
        const f = kitFingerprint(s.kit)
        if (!seen.has(f)) {
          seen.add(f)
          kits.push(s.kit)
        }
      }
    }
    onChange(kits)
  }, [slots, onChange])

  // Open a second box (and never more than two) while the quorum is not yet met; trim a
  // spare empty box once it is. Returning the same array reference when nothing changes
  // avoids re-render loops.
  useEffect(() => {
    if (threshold === null) return
    const votes = countVotes(slots)
    setSlots((prev) => {
      if (votes < threshold) {
        if (prev.length >= MAX_KITS || prev.some((s) => s.value.trim() === '')) return prev
        return [...prev, { ...EMPTY_SLOT }]
      }
      let end = prev.length
      while (end > 1 && prev[end - 1].value.trim() === '' && prev[end - 1].status !== 'valid') end -= 1
      return end === prev.length ? prev : prev.slice(0, end)
    })
  }, [slots, threshold])

  const patch = (index: number, p: Partial<KitSlot>) =>
    setSlots((s) => s.map((sl, i) => (i === index ? { ...sl, ...p } : sl)))

  const verify = async (index: number, raw: string) => {
    const value = raw.trim()
    if (!value) {
      if (index === 0) {
        // Clearing the first kit resets the whole determination.
        setThreshold(null)
        setMode(null)
        setSlots([{ ...EMPTY_SLOT }])
        return
      }
      patch(index, { value, status: 'empty', kit: undefined, whoami: undefined, covered: undefined, error: undefined })
      return
    }
    patch(index, { value, status: 'checking' })
    try {
      const kit = decodeRecoveryKit(value)
      const whoami = await validateKit(kit)
      // Ask Turnkey which quorum members this kit can really vote as — a stale recovery
      // key contributes nothing, so a "sole owner" must be earned, not assumed.
      const cov = await checkKitCoverage(kit)
      if (index === 0) {
        setThreshold(cov.threshold)
        setMode(cov.soleSufficient ? 'sole' : 'multi')
      }
      patch(index, { value, status: 'valid', whoami, kit, covered: cov.coveredUserIds, error: undefined })
    } catch (err) {
      patch(index, {
        value,
        status: 'invalid',
        kit: undefined,
        whoami: undefined,
        covered: undefined,
        error: errMsg(err),
      })
    }
  }

  const votes = countVotes(slots)
  const canProceed = threshold !== null && votes >= threshold
  const remaining = threshold !== null ? Math.max(0, threshold - votes) : 0

  return (
    <div className="gh-card">
      <div className="head">
        <h1>Enter Owner Recovery Kits</h1>
        <p>
          A single-owner entity requires one Recovery Kit. Multi-owner entities require at least two Recovery Kits.
        </p>
      </div>
      <div className="body">
        {slots.map((slot, i) => (
          <div key={i} className="exit-kit-field">
            <div className="exit-kit-label">
              Recovery Kit {i + 1}
              {i > 0 && <span className="exit-kit-optional"> · additional owner kit</span>}
            </div>
            <textarea
              className={`exit-kit-input ${slot.status === 'invalid' ? 'is-invalid' : ''} ${
                slot.status === 'valid' ? 'is-valid' : ''
              }`}
              placeholder="reah_rk_…"
              spellCheck={false}
              value={slot.value}
              onChange={(e) => patch(i, { value: e.target.value })}
              onBlur={(e) => void verify(i, e.target.value)}
            />
            {slot.status === 'checking' && <div className="exit-kit-note">Verifying with Turnkey…</div>}
            {slot.status === 'valid' && i === 0 && mode === 'sole' && (
              <div className="exit-kit-note ok">
                Verified · sole owner — this kit meets the quorum on its own
              </div>
            )}
            {slot.status === 'valid' && !(i === 0 && mode === 'sole') && (
              <div className="exit-kit-note ok">
                Verified · counts as {slot.covered?.length ?? 1} approval
                {(slot.covered?.length ?? 1) === 1 ? '' : 's'}
              </div>
            )}
            {slot.status === 'invalid' && <div className="exit-kit-note err">{slot.error}</div>}
          </div>
        ))}

        {mode === 'multi' && threshold !== null && (
          <div className={`gh-callout ${remaining === 0 ? 'ok' : 'warn'}`} style={{ marginTop: 6 }}>
            <span className="ic">
              {remaining === 0 ? <Icon.CheckF size={20} /> : <Icon.AlertF size={20} />}
            </span>
            <div>
              <strong>
                {remaining === 0 ? 'Signing quorum met' : 'More owner kits required'} — {votes} of {threshold} approvals
              </strong>
              {remaining === 0
                ? 'These kits meet the entity’s signing quorum. You can continue.'
                : slots.length >= MAX_KITS
                  ? `Two recovery kits still fall short of this entity’s signing quorum (${threshold} approvals needed). Use kits from the required owners.`
                  : `This entity needs ${threshold} approvals to export. Add ${remaining} more owner Recovery Kit${
                      remaining > 1 ? 's' : ''
                    } from another owner.`}
            </div>
          </div>
        )}
        {mode === 'sole' && canProceed && (
          <div className="gh-callout ok" style={{ marginTop: 6 }}>
            <span className="ic">
              <Icon.CheckF size={20} />
            </span>
            <div>
              <strong>Sole owner verified</strong>
              This Recovery Kit meets the signing quorum on its own — no second kit needed.
            </div>
          </div>
        )}
      </div>
      <div className="foot">
        <span style={{ flex: 1 }} />
        <button className="gh-btn gh-btn-amber" disabled={!canProceed} onClick={onNext}>
          Continue
        </button>
      </div>
    </div>
  )
}

// ── Step 2: list wallet accounts from Turnkey (no balance) ────────────────────
function StepWallet({
  kit,
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  kit: RecoveryKit | undefined
  selected: WalletAccount | null
  onSelect: (a: WalletAccount) => void
  onBack: () => void
  onNext: () => void
}) {
  const [accounts, setAccounts] = useState<WalletAccount[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Group accounts by their wallet's classification, preserving Turnkey's order within
  // each group. A wallet's accounts (EVM, Solana, …) all share the same wallet name.
  const grouped = useMemo(() => {
    const map: Record<WalletGroup, WalletAccount[]> = { user: [], banking: [], treasury: [] }
    for (const account of accounts ?? []) {
      map[classifyWalletGroup(account.walletName)].push(account)
    }
    return map
  }, [accounts])

  useEffect(() => {
    if (!kit) return
    let cancelled = false
    setAccounts(null)
    setError(null)
    listWalletAccounts(kit)
      .then((accts) => !cancelled && setAccounts(accts))
      .catch((err) => !cancelled && setError(errMsg(err)))
    return () => {
      cancelled = true
    }
  }, [kit])

  return (
    <div className="gh-card">
      <div className="head">
        <h1>Choose a wallet to recover</h1>
        <p>
          Pick one account at a time. After recovery, move the funds to a new wallet under your control, then come back
          for the next one.
        </p>
      </div>
      <div className="body">
        {accounts === null && !error && <div className="exit-kit-note">Loading wallets from Turnkey…</div>}
        {error && <div className="gh-callout err">{error}</div>}
        {accounts && accounts.length === 0 && <div className="exit-kit-note">No wallet accounts found.</div>}
        {WALLET_GROUPS.map(({ key, label }) => {
          const groupAccounts = grouped[key]
          if (groupAccounts.length === 0) return null
          return (
            <div key={key} className="gh-wallet-group">
              <div className="gh-wallet-group-head">{label}</div>
              <div className="gh-wallet-list">
                {groupAccounts.map((a) => (
                  <button
                    key={a.accountId}
                    className={`gh-owner-row gh-wallet-row ${selected?.accountId === a.accountId ? 'is-selected' : ''}`}
                    onClick={() => onSelect(a)}
                  >
                    <div className="gh-wallet-icon">
                      <Icon.WalletL size={18} />
                    </div>
                    <div className="gh-owner-main">
                      <div className="n" style={{ fontFamily: 'var(--font-mono)' }}>
                        {a.address}
                      </div>
                      <div className="r">{networkLabel(a.addressFormat)}</div>
                    </div>
                    <div className="gh-wallet-check">
                      <Icon.CheckF size={20} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        <div className="gh-callout warn" style={{ marginTop: 10 }}>
          <span className="ic">
            <Icon.AlertF size={20} />
          </span>
          <div>
            <strong>You'll see the wallet's private key next</strong>
            Once revealed, anyone with that key can move funds. Have a new wallet ready and plan to transfer
            immediately.
          </div>
        </div>
      </div>
      <div className="foot">
        <span style={{ flex: 1 }} />
        <button className="gh-btn" onClick={onBack}>
          ← Back
        </button>
        <button className="gh-btn gh-btn-amber" disabled={!selected} onClick={onNext}>
          <Icon.LockOpen size={14} /> Decrypt this wallet
        </button>
      </div>
    </div>
  )
}

// ── Step 3: run the real Turnkey export + local decrypt ───────────────────────
function StepExport({
  kits,
  account,
  onDone,
  onBack,
}: {
  kits: RecoveryKit[]
  account: WalletAccount
  onDone: (privateKey: string) => void
  onBack: () => void
}) {
  const [lines, setLines] = useState<Array<{ tone: string; text: string }>>([])
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const log = (tone: string, text: string) => !cancelled && setLines((l) => [...l, { tone, text }])
    log('info', '› Generating ephemeral target keypair…')
    log('info', `› Requesting Turnkey export for ${account.address}…`)
    exportWalletAccountPrivateKey(kits, account)
      .then((pk) => {
        if (cancelled) return
        log('ok', '✓ Turnkey returned encrypted bundle')
        log('ok', '✓ Decrypted locally. Private key recovered.')
        setTimeout(() => !cancelled && onDone(pk), 500)
      })
      .catch((err) => {
        if (cancelled) return
        log('err', `✗ ${errMsg(err)}`)
        setFailed(errMsg(err))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="gh-card">
      <div className="head">
        <h1>Decrypting private key</h1>
        <p>
          The export request is composed and sent to Turnkey, then decrypted locally with the ephemeral target key. This
          runs entirely in your browser.
        </p>
      </div>
      <div className="body">
        <div className="gh-log">
          {lines.map((l, i) => (
            <div key={i}>
              <span className={l.tone}>{l.text}</span>
            </div>
          ))}
          {!failed && (
            <div>
              <span className="info">▍</span>
            </div>
          )}
        </div>
      </div>
      {failed && (
        <div className="foot">
          <button className="gh-btn gh-btn-ghost" onClick={onBack}>
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}

// ── Step 4: reveal the real private key ───────────────────────────────────────
function StepReveal({
  account,
  privateKey,
  onBack,
}: {
  account: WalletAccount
  privateKey: string
  onBack: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="gh-card">
      <div className="head">
        <h1 className="gh-danger-title">Private key revealed</h1>
        <p>
          This is the live private key for the <b>{networkLabel(account.addressFormat)}</b> account{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{account.address}</span>. Treat it like cash.
        </p>
      </div>
      <div className="body">
        <div className="gh-callout err" style={{ marginBottom: 20 }}>
          <span className="ic">
            <Icon.AlertF size={20} />
          </span>
          <div>
            <strong>Anyone with this key can control this wallet</strong>
            Move funds to a new wallet as soon as possible. Do not share this key, paste it into a website, or
            screenshot it.
          </div>
        </div>

        <div className="gh-key-meta">
          <span>
            {networkLabel(account.addressFormat)} · {maskAddress(account.address)}
          </span>
          <span style={{ flex: 1 }} />
          <button
            className="gh-key-eye"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide private key' : 'Show private key'}
          >
            {revealed ? <Icon.HideL size={18} /> : <Icon.ShowL size={18} />}
          </button>
        </div>

        <div className="gh-key-block">
          <div className={revealed ? '' : 'blur'}>{privateKey}</div>
          {!revealed && (
            <div className="reveal-overlay" onClick={() => setRevealed(true)}>
              <span className="pill">
                <Icon.ShowL size={16} /> Click to reveal private key
              </span>
            </div>
          )}
        </div>

        <div className="gh-action-row">
          <button className="gh-btn" onClick={() => void navigator.clipboard?.writeText(privateKey)}>
            <Icon.Copy size={14} /> Copy to clipboard
          </button>
          <button className="gh-btn" onClick={() => downloadKey(account, privateKey)}>
            <Icon.Download size={14} /> Download (.json)
          </button>
          <button className="gh-btn" onClick={() => window.print()}>
            <Icon.Printer size={14} /> Print (no clipboard)
          </button>
        </div>

        <div className="gh-next-block">
          <div className="gh-next-title">Next steps — in this order</div>
          <ol className="gh-next-list">
            <StepLine n={1}>
              Import this key into a fresh wallet you control — MetaMask, Rabby, Phantom, or a hardware device.
            </StepLine>
            <StepLine n={2}>Move the entire balance to a new address. Do not leave funds behind.</StepLine>
            <StepLine n={3}>Discard this key, then come back and recover the next wallet if needed.</StepLine>
          </ol>
        </div>

        <div className="gh-callout warn" style={{ marginTop: 20 }}>
          <span className="ic">
            <Icon.AlertF size={20} />
          </span>
          <div>
            <strong>Each wallet must be recovered separately</strong>
            Go back to recover another wallet in this Entity. The verified kits are held only in this browser tab —
            closing or wiping the tab clears them.
          </div>
        </div>
      </div>
      <div className="foot">
        <span style={{ flex: 1 }} />
        <button className="gh-btn" onClick={onBack}>
          ← Recover another wallet
        </button>
        <button className="gh-btn gh-btn-amber" onClick={() => window.location.reload()}>
          <Icon.Trash size={14} /> End session & wipe
        </button>
      </div>
    </div>
  )
}

function StepLine({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="gh-next-line">
      <div className="gh-next-num">{n}</div>
      <div>{children}</div>
    </li>
  )
}

function downloadKey(account: WalletAccount, privateKey: string) {
  const payload = {
    address: account.address,
    network: networkLabel(account.addressFormat),
    addressFormat: account.addressFormat,
    privateKey,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `exit-${account.address.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Mask an address to its first 6 and last 4 characters: 0x71C7…976F. */
function maskAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
