<p align="center">
  <img src="https://clawmuse.com/brand/clawmuse-mark.svg" width="72" height="72" alt="ClawMuse logo">
</p>

<h1 align="center">ClawMuse</h1>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/clawmuse/clawmuse/stargazers">
    <img src="https://img.shields.io/github/stars/clawmuse/clawmuse?style=flat-square&logo=github" alt="GitHub stars">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-Apache_2.0-5eead4?style=flat-square" alt="Apache-2.0 License">
  </a>
  <a href="https://clawmuse.com">
    <img src="https://img.shields.io/badge/Website-clawmuse.com-102827?style=flat-square" alt="ClawMuse Website">
  </a>
  <a href="https://apps.apple.com/app/clawmuse/id6810076165">
    <img src="https://img.shields.io/badge/iOS-App_Store-0ea5e9?style=flat-square&logo=apple" alt="Download on the App Store">
  </a>
  <a href="https://clawmuse.com/download/">
    <img src="https://img.shields.io/badge/Platforms-macOS_%7C_Windows_%7C_Linux_%7C_iOS_%7C_Android_%7C_Web-2ea44f?style=flat-square" alt="Supported Platforms">
  </a>
</p>

<p align="center">
  <strong>Control Claude Code, Codex, Copilot, OpenCode, Pi, Antigravity, and Muse Code on your own computer — from desktop, iPhone, Android, web, voice, or CLI. Your code never leaves your machine.</strong>
</p>

<p align="center">
  <a href="https://clawmuse.com/"><strong>Website</strong></a>
  ·
  <a href="https://clawmuse.com/download/"><strong>Download</strong></a>
  ·
  <a href="https://clawmuse.com/docs/"><strong>Docs</strong></a>
  ·
  <a href="https://clawmuse.com/plugins/"><strong>Plugins</strong></a>
</p>

<p align="center">
  <img src="https://clawmuse.com/screenshots/en-wide-diff.webp" alt="ClawMuse desktop three-pane workspace with side-by-side code diff and agent stream" width="100%">
</p>

<table>
  <tr>
    <td width="50%" align="center">
      <img src="https://clawmuse.com/screenshots/en-phone-chat.webp" alt="ClawMuse mobile chat and tool verification" width="280">
      <br><sub>Mobile chat, tool checks, and voice dispatch</sub>
    </td>
    <td width="50%" align="center">
      <img src="https://clawmuse.com/screenshots/en-phone-diff.webp" alt="ClawMuse mobile diff review" width="280">
      <br><sub>Compact line-by-line code diff review on iOS & Android</sub>
    </td>
  </tr>
</table>

---

## Why ClawMuse

ClawMuse is an open-source, local-first control plane for AI coding agents. A daemon runs on your Mac, Linux, or Windows machine, manages agent processes and isolated Git worktrees, and streams structured timelines, diffs, files, and persistent terminals to every device you use.

- **Multi-Agent Structured Workspace** — Native adapters for **Claude Code**, **Codex**, **GitHub Copilot**, **OpenCode**, **Pi / OMP**, **Antigravity**, and **Muse Code**, plus ACP agents including **Cursor**, **Kimi**, **Kiro**, and **TRAE**. Thinking steps, tool calls, diffs, and permission requests normalize into one clear timeline alongside detached persistent terminals.
- **Desktop, Native Mobile, Web & CLI** — Start at your desk in the Electron desktop app, follow progress from native **iOS** ([App Store](https://apps.apple.com/app/clawmuse/id6810076165)) and **Android**, open **Web** (`app.clawmuse.com`), or automate workflows from the CLI (`clawmuse` / `paseo`).
- **Realtime Voice Assistant & Dictation** — Talk hands-free across active tasks on a host: hear what is running, needs approval, or finished, archive completed sessions, and dispatch new tasks without touching a keyboard.
- **Tasks & Goals Board (`localGoals`)** — Let a planner propose goals for a repository, approve them from your phone or desktop, run unattended rounds inside isolated Git worktrees with path-scope guards and SHA-pinned verification, and merge PRs cleanly when ready.
- **Quota Tracking & 30-Day Usage History** — Monitor 5h / 7d provider quotas and merged 30-day token usage across connected machines (including iOS Lock Screen Live Activities and home-screen widgets when paired with a status endpoint).
- **Daemon-Hosted Plugin System & SDK** — Install plugins once on the daemon (`conversation-translation`, `capacity-retry`, `device-preview`, custom providers, usage sources) and their UI surfaces appear automatically on desktop, mobile, and web.
- **Local-First Boundaries** — Repositories, agent credentials, MCP configs, and command execution stay on your own host.

---

## Getting Started

### Prerequisites

Install and authenticate at least one supported agent CLI on the machine running your code:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://github.com/openai/codex)
- [GitHub Copilot CLI](https://github.com/features/copilot/cli/)
- [OpenCode](https://github.com/anomalyco/opencode)
- [Pi](https://pi.dev)
- Antigravity CLI / Muse Code / ACP-compatible CLIs (Cursor, Kimi, Kiro, TRAE)

### 1. Official Installers (Fastest)

- **Desktop & Android**: Download signed installers for macOS (Apple Silicon & Intel), Windows, Linux (`.deb`, `.rpm`, `.tar.gz`, `AppImage`), and Android APK from [clawmuse.com/download](https://clawmuse.com/download/).
- **iOS & iPadOS**: Download from the [App Store](https://apps.apple.com/app/clawmuse/id6810076165).

### 2. Build & Run from This Open-Source Repository

> **Open-source snapshot scope:** This public repository contains the full open-source desktop client, mobile/web app, daemon, CLI, protocol, client SDK, relay package, and built-in plugins under **Apache-2.0**. ClawMuse's hosted services (managed relay endpoints, account hub, hosted status service, and cloud containers) are excluded.
>
> Self-hosted setups connect directly over **LAN**, **SSH tunnel**, **Tailscale / WireGuard**, or your own self-hosted relay instance from `packages/relay` configured via `PASEO_RELAY_ENDPOINT`.

Requires **Node.js 22+** and **npm**:

```bash
git clone https://github.com/clawmuse/clawmuse.git
cd clawmuse
npm ci

# Build protocol, client SDK, server daemon, and CLI declarations
npm run build:server

# Start the local dev daemon (uses checkout-local .dev/paseo-home on port 6768)
npm run dev

# In another terminal, launch the Electron desktop app or CLI
npm run dev:desktop
npm run cli -- ls -a -g
```

To build app dependencies (for Expo mobile / web):

```bash
npm run build:app-deps
npm run web
```

---

## CLI Quick Reference

Every operation in the desktop or mobile UI works through the CLI against the same WebSocket daemon:

```bash
# Run agents in isolated worktrees or directories
npm run cli -- run --provider claude/sonnet-4.6 "review auth middleware and add unit tests"
npm run cli -- run --provider codex/gpt-5.4 --worktree feat-cache "implement cache eviction"

# Inspect, stream, follow up, or handle permissions
npm run cli -- ls
npm run cli -- logs <agent-id>
npm run cli -- send <agent-id> "run the vitest suite and summarize"
npm run cli -- permit allow <request-id>

# Persistent terminals & cron schedules
npm run cli -- terminal ls
npm run cli -- schedule ls

# Connect to a remote daemon directly over LAN / Tailscale / SSH tunnel
npm run cli -- --host my-workstation.ts.net:6768 ls
```

---

## Repository Structure

| Path                                | Description                                                                                                                                         |
| :---------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/server`                   | Local Node.js daemon: agent lifecycle, WebSocket API, MCP tools, Git/worktree orchestration, local Goals, detached terminal worker                  |
| `packages/app`                      | Cross-platform Expo / React Native client for iOS, Android, Web, and Desktop UI                                                                     |
| `packages/desktop`                  | Electron desktop wrapper managing the local daemon, native menus, multi-window, and built-in browser                                                |
| `packages/cli`                      | Commander.js CLI (`clawmuse` / `paseo`) for headless servers, scripting, and daemon control                                                         |
| `packages/protocol`                 | Append-only Zod wire schemas and binary terminal/file stream codecs                                                                                 |
| `packages/client`                   | TypeScript SDK (`PaseoClient` / `PaseoApi`) shared across clients and plugins                                                                       |
| `packages/relay`                    | Noise `NK` zero-knowledge E2EE relay transport and legacy Cloudflare worker reference                                                               |
| `packages/plugin`                   | Plugin runtime, manifest contracts, and host IPC facade                                                                                             |
| `packages/highlight`                | Syntax highlighting and diff tokenization engine                                                                                                    |
| `packages/expo-agent-live-activity` | Native iOS ActivityKit / WidgetKit module for Lock Screen capsules and quota widgets                                                                |
| `packages/expo-two-way-audio`       | Native duplex audio module for iOS/Android realtime voice                                                                                           |
| `packages/website`                  | Website source powering [clawmuse.com](https://clawmuse.com)                                                                                        |
| `plugins/`                          | Built-in plugins (`antigravity-provider`, `conversation-translation`, `capacity-retry`, `device-preview`, `usage-auto-resume`, usage sources, etc.) |

---

## License & Acknowledgments

- **License**: Licensed under the [Apache License, Version 2.0](./LICENSE). See [NOTICE](./NOTICE) for full copyright and attribution details.
- **Upstream & Attributions**:
  - Derived from [Paseo](https://github.com/getpaseo/paseo) (Copyright (c) 2025-present Mohamed Boudra, Apache-2.0).
  - Includes prompt recommendation components adapted from [Cindy](https://github.com/makecindy/cindy) (Copyright 2026 XD Inc., Apache-2.0).

## Feedback & Contact

- Bug reports & feature requests: [GitHub Issues](https://github.com/clawmuse/clawmuse/issues)
- Email: [hello@clawmuse.com](mailto:hello@clawmuse.com)
- Website: [clawmuse.com](https://clawmuse.com)
