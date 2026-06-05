# Reah Exit Tool

A standalone, **offline-first break-glass recovery tool**. It lets the owners of a Reah
entity export their wallets' **private keys directly from Turnkey**, using their Recovery
Kits — with **no Reah backend involved**. If Reah is ever unavailable, you can still get
your keys out.

Everything runs in your browser. The only network calls are to `api.turnkey.com`; nothing
is sent to Reah.

## How it works

1. **Enter kits** — paste one Recovery Kit string per participating owner (a sole owner
   needs one). Each kit is decoded locally and verified against Turnkey.
2. **Select wallet** — your wallets and accounts are read directly from Turnkey.
3. **Export key** — the export activity is signed with your kit key(s); the root-quorum
   consensus is met with the second kit (or, for a sole owner, the bundled recovery-user
   key).
4. **Private key** — the encrypted export bundle is decrypted **locally** with an
   ephemeral key. The plaintext private key never leaves your browser.

## Running it

The safest way is to **run a local copy** so you never have to trust a hosted instance
with your keys.

```sh
npm install
npm run dev       # http://localhost:5173
```

### Build an offline, single-file copy

```sh
npm run build     # produces dist/index.html — a single self-contained file
```

`dist/index.html` has all JS and CSS inlined. Download it, disconnect from the network
if you like, and open it — it works fully offline except for the calls to Turnkey.

## Security

- Exports and decrypts **live wallet private keys** entirely client-side.
- No telemetry, no analytics, no third-party script CDNs — only Turnkey.
- Open-source: verify the code, build it yourself, and (ideally) run the local/offline
  copy rather than a hosted one.

## License

MIT
