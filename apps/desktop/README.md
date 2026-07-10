# TikTokMonitor Desktop

Tauri v2 + React + TypeScript desktop client for the centralized
TikTokMonitor server.

## Requirements

- Node.js LTS
- Rust stable toolchain
- Platform build dependencies required by Tauri

## Development

```powershell
npm install
npm run tauri dev
```

The client stores the server URL in browser local storage inside the WebView.

## Build

```powershell
npm run build
npx tauri build --bundles msi
```

GitHub Actions builds Windows, macOS, and Linux packages from this directory.

## Current Features

- Server URL configuration
- Cookie-based JSON login
- Dashboard metrics
- Account list
- Add account
- Sync all accounts
- Sync one account
- Alerts list
- Sync logs
- Provider health
