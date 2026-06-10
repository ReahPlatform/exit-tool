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

## Use it

The exit tool ships as a **single, self-contained HTML file** with all JS and CSS inlined.
You don't need to install anything or build it yourself.

1. Go to the [**latest release**](https://github.com/ReahPlatform/exit-tool/releases/latest).
2. Download the **`exit-tool.html`** asset, or grab it directly:

   ```sh
   curl -L -o exit-tool.html \
     https://github.com/ReahPlatform/exit-tool/releases/latest/download/exit-tool.html
   ```

3. Open `exit-tool.html` in your browser (double-click it, or `File → Open`).

That's it. The page runs entirely from that one file — you can disconnect from the
network first if you like; the only requests it ever makes are to `api.turnkey.com` while
you export. Nothing is sent to Reah.

> Prefer to trust your own copy? Verify the file's checksum against the release, or
> build it from source (below) and compare — the build is deterministic.

## Build from source (optional)

If you'd rather build the single-file copy yourself instead of downloading the release:

```sh
pnpm install
pnpm run build     # produces dist/index.html — the same single self-contained file
```

`dist/index.html` is byte-for-byte the artifact attached to each release. Open it the same
way as above.

To run it as a live dev server while hacking on the code:

```sh
pnpm run dev       # http://localhost:5173
pnpm run dev:mock  # same, but with deterministic fake data — no real Recovery Kit needed
pnpm test          # unit tests for the core lib (src/lib)
```

## Security

- Exports and decrypts **live wallet private keys** entirely client-side.
- No telemetry, no analytics, no third-party script CDNs — only Turnkey.
- Open-source: verify the code, build it yourself, and (ideally) run the local/offline
  copy rather than a hosted one.

## License

MIT
