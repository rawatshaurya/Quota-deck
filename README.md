# Quota Deck

Quota Deck turns a spare phone, tablet, or iPad into a private live usage display for Claude Desktop, Claude Code, and Codex.

This repository contains the Windows companion service and its installable web dashboard. AI credentials remain inside the official desktop applications. Quota Deck shares only usage percentages, reset times, plan labels, and token counts.

## Install the Windows alpha

1. Download [QuotaDeck-0.2.0-win-x64.zip](https://github.com/rawatshaurya/Quota-deck/releases/download/v0.2.0/QuotaDeck-0.2.0-win-x64.zip) from the GitHub Release assets.
2. Extract the complete ZIP.
3. Double-click Install-QuotaDeck.cmd.
4. Open Quota Deck from the desktop or Start menu.
5. Select Pair device.
6. On a phone or tablet connected to the same trusted network, open one of the displayed addresses and enter the six-digit code.

The release bundles its own Node.js runtime. End users do not need Node, npm, a terminal, or administrator access.

Do not use GitHub's automatically generated **Source code (zip)** download for installation. It is intended for developers and does not contain the bundled Node.js runtime.

Quota Deck installs per user in %LOCALAPPDATA%\Programs\QuotaDeck, starts automatically at sign-in, and stores persistent pairing secrets in %LOCALAPPDATA%\QuotaDeck.

Windows Firewall may ask whether the bundled Node runtime can accept connections. Allow it only on private networks you trust.

## Uninstall

Use Start > Quota Deck > Uninstall Quota Deck.

The uninstaller keeps pairing configuration by default so reinstalling does not disconnect existing screens. To remove configuration and logs too, run Uninstall-QuotaDeck.ps1 with the -RemoveData option.

## Security and privacy

- A phone must pair with a rotating six-digit code before usage APIs or the live event stream are available.
- Paired devices receive an HttpOnly, SameSite session cookie. The long-lived secret is generated locally and remains on the computer and paired browser.
- Five failed pairing attempts from one address trigger a ten-minute lockout.
- Collector publishing uses a separate random bearer secret.
- The computer itself can open the dashboard and pairing details over loopback without pairing.
- Security headers prevent framing, cross-origin scripts, referrer leakage, and unnecessary device permissions.
- Claude Desktop collection reads only the cached response for its usage endpoint. It does not read cookies, prompts, or conversations.
- Codex collection uses its local app-server for plan limits and the latest local token-count event for context usage.

By default, phone traffic uses HTTP on the local network. Pairing prevents casual access but does not encrypt traffic from a network observer. Use Quota Deck only on a trusted private network. Advanced deployments can set TLS_CERT and TLS_KEY to serve HTTPS with a certificate trusted by their devices.

## Supported providers

- Claude Desktop: current five-hour, weekly, and scoped model allowances
- Claude Code: official status-line quota and context fields
- Codex: app-server account limits and current session context

Only detected providers appear in the interface.
## Docker deployment

The secured dashboard and relay can run in a Linux container. Claude Desktop and Codex collection must remain on the Windows host because containers cannot directly use those signed-in desktop applications.

Build and start the relay:

    Copy-Item .env.example .env
    # Set a long random DASHBOARD_SECRET in .env first.
    docker compose up --detach --build

Read the current six-digit pairing code:

    docker compose logs quota-deck

Run the collectors on the Windows host and point them at the container:

    $env:QUOTA_DECK_SECRET = "the DASHBOARD_SECRET from .env"
    $env:QUOTA_DECK_URL = "http://localhost:4173"
    node collector/run.mjs

For a demo without host collectors, set DEMO_MODE=true in .env and restart the Compose service.

The production image runs as the unprivileged node user with a read-only root filesystem, all Linux capabilities dropped, no-new-privileges enabled, a persistent /data volume, and an HTTP health check. The image build runs the complete automated test suite before producing the runtime stage.

## Build a Windows release

Maintainers need Windows x64, Node.js 24 or newer, and PowerShell 5.1 or newer.

Run:

    npm.cmd test
    npm.cmd run build:windows

The release builder copies the active x64 node.exe, includes only runtime files, creates dist\QuotaDeck-VERSION-win-x64.zip, and writes a SHA-256 checksum beside it.

The generated package is unsigned. Public distribution should add Authenticode signing to the ZIP contents or a future MSI before a stable release.

## Developer run

    npm.cmd start

Open http://localhost:4173. The terminal prints local-network addresses and the current phone pairing code.

Claude Desktop needs no setup. Claude Code users can install the status-line bridge once:

    npm.cmd run setup:claude

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 4173 | Dashboard port |
| HOST | 0.0.0.0 | Listening interface |
| DEMO_MODE | false with npm start | Enable sample data |
| LOCAL_COLLECTORS | true | Start built-in collectors |
| COLLECTOR_INTERVAL_MS | 30000 | Collector refresh interval |
| QUOTA_DECK_CONFIG | %LOCALAPPDATA%\QuotaDeck\config.json | Persistent secret configuration |
| DASHBOARD_SECRET | generated and persisted | Override collector bearer secret |
| QUOTA_DECK_VIEW_SECRET | generated and persisted | Override paired-viewer secret |
| QUOTA_DECK_PAIRING_CODE | random per launch | Override six-digit pairing code |
| CODEX_PATH | auto-discovered | Optional Codex executable |
| QUOTA_DECK_CLAUDE_STATE | project data directory | Optional Claude Code state |
| CLAUDE_DESKTOP_CACHE | auto-discovered | Optional Claude Desktop cache |
| TLS_CERT / TLS_KEY | unset | Optional trusted HTTPS certificate and private key |

## Disclaimer

Quota Deck is an independent project and is not affiliated with, endorsed by, or sponsored by Anthropic or OpenAI. Claude and Codex are trademarks of their respective owners.
