# ClawMuse

[简体中文](README.zh-CN.md)

ClawMuse lets you monitor and control local AI coding agents from your phone,
browser, or desktop. Your daemon runs in your development environment and keeps
source code on your machine.

Supported agents include Claude Code, Codex, GitHub Copilot, OpenCode, Pi,
Antigravity, and Muse Code.

## Source scope

This repository contains the mobile, browser and Electron clients, local daemon,
CLI, SDK, protocol, built-in plugins and device-side encrypted transport.
Hosted cloud services, relay workers, billing, production deployment configuration
and operational records are not included. Hosted features require the corresponding
service and account. Local daemon connections do not require the private backend
source. See [source boundaries](docs/source-scope.md).

## Development

Use Node.js 22 and npm. On Windows, run development shell scripts in Git Bash.

```sh
npm ci
npm run build:server
npm run build:app-deps
npm run typecheck
npm run lint
npm run dev                 # Local development daemon on port 6768
npm run dev:app             # Run in another terminal
```

```sh
npm run build:web --workspace=@getpaseo/app
npm run dev:desktop
npm run build:apk:arm64     # Requires JDK 17 and Android SDK
npm run ios                # Requires macOS, Xcode and CocoaPods
```

Development commands use `.dev/paseo-home`. Do not restart an existing production
daemon on port 6767 to troubleshoot a development build.

## Community builds

[GitHub Actions](https://github.com/clawmuse/clawmuse/actions) checks the source and
builds Linux, Windows and macOS desktop artifacts on standard hosted runners.
Download artifacts from a successful workflow run. These are development artifacts,
without production signing credentials or notarization. Automatic updates are disabled.
The workflows do not publish npm packages, GitHub releases or store submissions.

To build an unsigned/ad-hoc desktop artifact locally:

```sh
CLAWMUSE_UNSIGNED_BUILD=1 CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:desktop -- --publish never
```

The manual Mobile Builds workflow builds an Android debug APK and an iOS simulator
app without store credentials. An iOS simulator app cannot be installed on a physical
phone. Signed device builds require your own signing setup.

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md). Run focused tests locally; full test suites
belong in CI. Report security issues privately through GitHub's security reporting
feature when available; do not include credentials in issues.

ClawMuse is based on [Paseo](https://github.com/getpaseo/paseo).
The source is licensed under Apache-2.0; retain [LICENSE](LICENSE), [NOTICE](NOTICE)
and third-party notices. The package names retain the upstream `@getpaseo` namespace
for internal workspace compatibility; this repository does not publish to that namespace.
