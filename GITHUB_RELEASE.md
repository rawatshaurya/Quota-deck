# Quota Deck v0.2.0 — Public Alpha

Turn a spare phone, tablet, or iPad into a live usage display for Claude and Codex.

Quota Deck runs a small companion service on your Windows PC and shows current allowance usage, remaining capacity, reset countdowns, and context-window tokens on another screen. Only detected providers appear.

## Highlights

- Live Claude Desktop, Claude Code, and Codex usage
- Five-hour and weekly allowance windows with reset countdowns
- Current context usage and tokens remaining when available
- Private six-digit device pairing
- Automatic startup and a one-click per-user Windows installer
- Responsive phone and tablet dashboard
- Optional hardened Docker deployment for the dashboard relay
- No AI credentials, prompts, or conversations sent to the display device

## Install on Windows

1. Download `QuotaDeck-0.2.0-win-x64.zip` below.
2. Verify the SHA-256 checksum if desired.
3. Extract the complete ZIP.
4. Double-click `Install-QuotaDeck.cmd`.
5. Open Quota Deck from the desktop or Start menu.
6. Select **Pair device**, open the displayed address on a phone or tablet, and enter the six-digit code.

The release bundles Node.js. End users do not need Node, npm, Git, administrator access, or a terminal.

## Supported environment

- Windows 10 or Windows 11
- x64 Intel/AMD computers
- Claude Desktop, Claude Code, or Codex installed and signed in
- Phone/tablet and PC on the same trusted private network

## Privacy and security

Quota Deck shares only usage percentages, reset times, plan labels, connection state, and token counts. Viewer APIs require pairing, collector publishing uses a separate random secret, failed pairing attempts are rate-limited, and restrictive browser security headers are enabled.

## Known alpha limitations

- The Windows package is not yet Authenticode-signed, so SmartScreen may warn.
- Default local-network traffic uses HTTP. Use it only on a trusted private network.
- The Windows package currently supports x64, not ARM64 or 32-bit Windows.
- Claude Desktop collection depends on a local cache format that may change in future Claude releases.
- This is a source-available alpha under the included license, not an open-source release.

## Release artifact

`QuotaDeck-0.2.0-win-x64.zip`

SHA-256:

```text
c97091c822fd336b011a5662d1d42d640b6658ae1c43c9f105346a96b9e93fde
```

Quota Deck is an independent project and is not affiliated with, endorsed by, or sponsored by Anthropic or OpenAI.
