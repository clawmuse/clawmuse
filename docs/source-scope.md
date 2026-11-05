# Source boundaries

The public repository starts with a new source snapshot. It does not import private
Git history, branches, tags, Actions logs, audit screenshots or deployment files.

| Included                                 | Excluded                                        |
| ---------------------------------------- | ----------------------------------------------- |
| Mobile, browser and Electron clients     | Hosted cloud and status backends                |
| Local daemon, CLI and SDK                | Billing and production deployment configuration |
| Wire protocol and device-side encryption | Cloudflare relay adapters and workers           |
| Built-in plugins and development tools   | Internal research, costs and QA evidence        |
| User-facing documentation and licenses   | Store review files and signing credentials      |

`packages/relay` contains device-side cryptography and transport only. The package
name is retained because the SDK and daemon depend on it. Cloud endpoints in client
configuration are public service addresses, not credentials or backend implementations.
Hosted account, status, voice and relay features still depend on their remote services.

Public desktop builds disable automatic updates and use no production signing keys.
Keep publishing, store submission and production deployment outside this repository's CI.
Run external pull requests only on GitHub-hosted runners with a read-only token.

For future synchronization, export only approved files from a reviewed source commit
into a separate checkout, review the diff, scan the result, and run the public CI.
Commit the resulting changes on top of this repository's history. Never mirror-push
private refs or copy a working directory containing local state.
