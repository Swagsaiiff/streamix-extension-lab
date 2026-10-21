# Streamix Desktop Extension Integration Specification

This specification outlines the future integration pathway for connecting the **Streamix Extension SDK** into the core Streamix Desktop application (`packages/server`, `packages/desktop`, and `packages/client`).

> **Note**: As per architectural constraints, no application integration was performed during this task. This document serves as the implementation blueprint for the subsequent integration phase.

---

## 1. System Integration Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                   Streamix Client (UI)                      │
│   - Extension Manager view in Settings                      │
│   - Community Repository browsing & 1-click install         │
│   - Provider selection in search & player                   │
└──────────────────────────────┬──────────────────────────────┘
                               │ REST / SSE
┌──────────────────────────────▼──────────────────────────────┐
│                   Streamix Server (Express)                 │
│   - /api/extensions (list installed, enable, disable)       │
│   - /api/extensions/repositories (manage repos)             │
│   - /api/extensions/install (download & verify SHA-256)     │
│   - ExtensionHostManager (dispatches search/resolve to SDK) │
└──────────────────────────────┬──────────────────────────────┘
                               │ Stream URL & Headers
┌──────────────────────────────▼──────────────────────────────┐
│           Playback Pipeline (FFmpeg / MPV)                  │
│   - Receives resolved stream URL + required HTTP headers    │
│   - Transcodes to HLS (server) or direct mpv (desktop)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Server Architecture: `ExtensionHostManager`

Inside `packages/server/src/extensions/`:
1. **`ExtensionLoader`**:
   - Reads installed extension directories from the persistent user directory (`appDataDir/extensions/installed/`).
   - Verifies `manifest.json` against `validateManifest` and `checkApiCompatibility`.
   - Instantiates the `ExtensionRunner` for each active extension.
2. **`ProviderRegistry` Adaptor**:
   - Adapts the `StreamixExtension` interface to the server's internal provider format:
     - Maps `extension.search()` to `server.provider.search()`.
     - Maps `extension.getDetails()` to `server.provider.getDetails()`.
     - Maps `extension.resolveSources()` to `server.provider.resolveSources()`.
   - Injects the resolved streams into the existing FFmpeg HLS remuxing pipeline.

---

## 3. Desktop Application Architecture (Electron)

In `packages/desktop/src/`:
1. **Persistent Storage Location**:
   - Extensions and local cache are stored in Electron's `app.getPath('userData')/extensions/`.
2. **IPC Channels**:
   - `extensions:list`: Returns installed extensions and active state.
   - `extensions:install`: Downloads package from repository, verifies SHA-256 hash, extracts to user folder.
   - `extensions:uninstall`: Removes extension directory.
   - `extensions:toggle`: Enables or disables a provider.

---

## 4. Client UI (Settings Panel)

In `packages/client/src/pages/Settings.jsx`:
- **Repositories Tab**:
  - Allows users to add repository URLs (e.g. `https://raw.githubusercontent.com/.../plugins.json`).
  - Fetches repository index and lists available plugins.
  - Shows plugin description, version, author, and declared permissions.
- **Installed Extensions Tab**:
  - Displays currently installed extensions.
  - Displays status badges, update notifications, and toggle switches.

---

## 5. Security Checklist Before Production Deployment

- [ ] Ensure package SHA-256 verification is mandatory before extracting any `.streamix-ext` package.
- [ ] Enforce strict domain allowlisting on `context.fetch()` based on the provider's known API hosts.
- [ ] Implement hard timeouts (e.g. 10s max per request) to prevent hung scrapers from blocking playback.
- [ ] Sandbox execution via a child process with restricted permissions.
