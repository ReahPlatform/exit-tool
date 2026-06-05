import { useEffect, useState } from 'react'

import { Icon } from './icons'
import { decodeRecoveryKit, kitFingerprint, type RecoveryKit } from './lib/kit'
import {
  exportWalletAccountPrivateKey,
  listWalletAccounts,
  networkLabel,
  validateKit,
  type WalletAccount,
  type WhoAmI,
} from './lib/turnkey'

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
          {step === 'keys' && <StepKeys kits={kits} onChange={setKits} onNext={() => setStep('wallet')} />}
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
      <div className="logo-dot">
        <Icon.Shield size={14} />
      </div>
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
          className="gh-btn gh-btn-ghost"
          href="https://github.com/ReahPlatform/exit-tool#readme"
          target="_blank"
          rel="noreferrer"
        >
          <Icon.HelpCircle size={14} /> Docs
        </a>
        <a
          className="gh-btn gh-btn-ghost"
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
            <Icon.Shield size={16} />
          </div>
          <div>
            <div className="gh-session-title">Recovery session</div>
            <div className="gh-session-sub">Direct to Turnkey · no Reah connection</div>
          </div>
        </div>
        <div className="gh-session-copy">
          Open-source and offline-first. Every operation happens in your browser and goes straight to Turnkey; nothing
          is sent to Reah.
        </div>
      </div>
      <div className="step-group">Recover</div>
      {STEPS.map((s, i) => {
        const cls = i < idx ? 'is-done' : i === idx ? 'is-current' : 'is-locked'
        return (
          <div key={s.id} className={`gh-step ${cls}`} onClick={() => i <= idx && onGo(s.id)}>
            <span className="num">{i < idx ? <Icon.CheckCircle size={12} /> : i + 1}</span>
            {s.label}
          </div>
        )
      })}
    </aside>
  )
}

// ── Step 1: paste up to two recovery kits, validated against Turnkey ──────────
type KitSlot = {
  value: string
  status: 'empty' | 'checking' | 'valid' | 'invalid'
  whoami?: WhoAmI
  error?: string
}
const EMPTY_SLOT: KitSlot = { value: '', status: 'empty' }

function StepKeys({
  kits,
  onChange,
  onNext,
}: {
  kits: RecoveryKit[]
  onChange: (k: RecoveryKit[]) => void
  onNext: () => void
}) {
  const [slots, setSlots] = useState<KitSlot[]>([EMPTY_SLOT, EMPTY_SLOT])

  const verify = async (index: number, raw: string) => {
    const value = raw.trim()
    setSlots((s) => s.map((sl, i) => (i === index ? { value, status: value ? 'checking' : 'empty' } : sl)))
    if (!value) {
      onChange(buildKits(slots, index, undefined))
      return
    }
    try {
      const kit = decodeRecoveryKit(value)
      const whoami = await validateKit(kit)
      setSlots((s) => s.map((sl, i) => (i === index ? { value, status: 'valid', whoami } : sl)))
      onChange(buildKits(slots, index, kit))
    } catch (err) {
      setSlots((s) => s.map((sl, i) => (i === index ? { value, status: 'invalid', error: errMsg(err) } : sl)))
      onChange(buildKits(slots, index, undefined))
    }
  }

  const validCount = slots.filter((s) => s.status === 'valid').length
  const canProceed = validCount >= 1 && kits.length >= 1

  return (
    <div className="gh-card">
      <div className="head">
        <h1>Enter Owner Recovery Kits</h1>
        <p>
          Paste a Recovery Kit string for each participating Owner. The tool reads the recovery metadata and verifies
          each key directly with Turnkey. <b>If you are the sole owner, one kit is enough.</b>
        </p>
      </div>
      <div className="body">
        {slots.map((slot, i) => (
          <div key={i} className="exit-kit-field">
            <div className="exit-kit-label">
              Recovery Kit {i + 1}
              {i === 1 && <span className="exit-kit-optional"> · optional for a sole owner</span>}
            </div>
            <textarea
              className={`exit-kit-input ${slot.status === 'invalid' ? 'is-invalid' : ''} ${
                slot.status === 'valid' ? 'is-valid' : ''
              }`}
              placeholder="reah_rk_…"
              spellCheck={false}
              value={slot.value}
              onChange={(e) => setSlots((s) => s.map((sl, idx) => (idx === i ? { ...sl, value: e.target.value } : sl)))}
              onBlur={(e) => void verify(i, e.target.value)}
            />
            {slot.status === 'checking' && <div className="exit-kit-note">Verifying with Turnkey…</div>}
            {slot.status === 'valid' && slot.whoami && (
              <div className="exit-kit-note ok">
                <Icon.CheckCircle size={12} /> Verified · {slot.whoami.organizationName || slot.whoami.organizationId}
              </div>
            )}
            {slot.status === 'invalid' && <div className="exit-kit-note err">{slot.error}</div>}
          </div>
        ))}

        {canProceed && (
          <div className="gh-callout ok" style={{ marginTop: 6 }}>
            <span className="ic">
              <Icon.CheckCircle size={16} />
            </span>
            <div>
              <strong>{validCount === 1 ? 'Kit verified' : `${validCount} kits verified`}</strong>
              You can continue. If your wallet needs more signatures than provided, Turnkey will reject the export and
              you can add another kit.
            </div>
          </div>
        )}
      </div>
      <div className="foot">
        <span style={{ flex: 1 }} />
        <button className="gh-btn gh-btn-amber" disabled={!canProceed} onClick={onNext}>
          Continue <Icon.ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

function buildKits(slots: KitSlot[], changedIndex: number, changedKit: RecoveryKit | undefined): RecoveryKit[] {
  // Re-decode the other valid slots (cheap) and combine with the just-changed one,
  // de-duplicated by public key.
  const kits: RecoveryKit[] = []
  slots.forEach((slot, i) => {
    if (i === changedIndex) {
      if (changedKit) kits.push(changedKit)
      return
    }
    if (slot.status === 'valid' && slot.value) {
      try {
        kits.push(decodeRecoveryKit(slot.value))
      } catch {
        /* ignore */
      }
    }
  })
  const seen = new Set<string>()
  return kits.filter((k) => {
    const f = kitFingerprint(k)
    if (seen.has(f)) return false
    seen.add(f)
    return true
  })
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
        <div className="gh-wallet-list">
          {(accounts ?? []).map((a) => (
            <button
              key={a.accountId}
              className={`gh-owner-row gh-wallet-row ${selected?.accountId === a.accountId ? 'is-selected' : ''}`}
              onClick={() => onSelect(a)}
            >
              <div className="gh-wallet-icon">
                <Icon.Wallet size={16} />
              </div>
              <div className="gh-owner-main">
                <div className="n" style={{ fontFamily: 'var(--font-mono)' }}>
                  {a.address}
                </div>
                <div className="r">{networkLabel(a.addressFormat)}</div>
              </div>
              <div className="gh-wallet-check">
                {selected?.accountId === a.accountId ? <Icon.CheckCircle size={20} /> : <Icon.ChevRight size={16} />}
              </div>
            </button>
          ))}
        </div>

        <div className="gh-callout warn" style={{ marginTop: 18 }}>
          <span className="ic">
            <Icon.AlertTri size={16} />
          </span>
          <div>
            <strong>You'll see the wallet's private key next</strong>
            Once revealed, anyone with that key can move funds. Have a new wallet ready and plan to transfer
            immediately.
          </div>
        </div>
      </div>
      <div className="foot">
        <button className="gh-btn gh-btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <span style={{ flex: 1 }} />
        <button className="gh-btn gh-btn-danger" disabled={!selected} onClick={onNext}>
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
          This is the live private key for <b>{account.walletName}</b>. Treat it like cash.
        </p>
      </div>
      <div className="body">
        <div className="gh-callout err" style={{ marginBottom: 14 }}>
          <span className="ic">
            <Icon.AlertTri size={16} />
          </span>
          <div>
            <strong>Anyone with this key can control this wallet</strong>
            Move funds to a new wallet as soon as possible. Do not share this key, paste it into a website, or
            screenshot it.
          </div>
        </div>

        <div className="gh-key-meta">
          <span>
            {account.walletName} · {networkLabel(account.addressFormat)} · {account.address}
          </span>
          <span style={{ flex: 1 }} />
          <button className="gh-btn" onClick={() => setRevealed((r) => !r)}>
            {revealed ? (
              <>
                <Icon.EyeOff size={14} /> Hide
              </>
            ) : (
              <>
                <Icon.Eye size={14} /> Reveal
              </>
            )}
          </button>
        </div>

        <div className="gh-key-block">
          <div className={revealed ? '' : 'blur'}>{privateKey}</div>
          {!revealed && (
            <div className="reveal-overlay" onClick={() => setRevealed(true)}>
              <span className="pill">
                <Icon.Eye size={14} /> Click to reveal private key
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

        <div className="gh-callout warn" style={{ marginTop: 18 }}>
          <span className="ic">
            <Icon.AlertTri size={16} />
          </span>
          <div>
            <strong>Each wallet must be recovered separately</strong>
            Go back to recover another wallet in this Entity. The verified kits are held only in this browser tab —
            closing or wiping the tab clears them.
          </div>
        </div>
      </div>
      <div className="foot">
        <button className="gh-btn gh-btn-ghost" onClick={onBack}>
          ← Recover another wallet
        </button>
        <span style={{ flex: 1 }} />
        <button className="gh-btn gh-btn-danger" onClick={() => window.location.reload()}>
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
    walletName: account.walletName,
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

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
