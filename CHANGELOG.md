# Changelog

## 0.2.0 - 2026-07-11

### Added

- Persistent per-install collector and viewer secrets
- Six-digit phone pairing with HttpOnly sessions and rate limiting
- Protected status and live-event APIs
- Local-only pairing details and detected LAN addresses
- Security headers and optional TLS certificate support
- One-click per-user Windows installer, automatic startup, shortcuts, and uninstaller
- Self-contained Windows x64 release builder with bundled Node.js runtime and SHA-256 checksum
- PNG, Apple touch, and maskable PWA icons
- Hardened Linux container image and Docker Compose deployment
- Single-provider layout and automatic hiding of unavailable services

### Changed

- The Windows installer now allows up to 60 seconds for first launch and reports slow startup as a warning instead of a failed installation
- Consumer releases no longer require a separate Node.js installation
- External web fonts were removed for privacy and offline reliability
- Runtime package contents explicitly exclude tests and diagnostic tools

### Known limitations

- The Windows alpha package is unsigned.
- Default LAN traffic uses HTTP and should be limited to trusted private networks.
- Claude Desktop collection depends on a local cache format that may change between Claude releases.
