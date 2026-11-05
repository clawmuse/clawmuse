# Daemon permissions

The daemon authorizes principals with semantic permissions. RPC names and protocol namespaces are not authority.

## Model

```text
principal -> grants
    |
    +-- authenticated by a device or service credential
    `-- opens a session with equal or narrower authority
```

A principal is the durable identity the daemon authorizes. A credential proves that a device or service represents it. Keep them separate so you can rotate credentials, attach more than one device, and revoke a Hub user without inventing daemon user accounts.

A pairing invitation is neither. It is an expiring, single-use exchange that creates a principal and credential with the permissions selected by its issuer.

## Permissions

| Permission          | Authority                                                                  |
| ------------------- | -------------------------------------------------------------------------- |
| `daemon.read`       | Daemon status, diagnostics, configuration, and provider information        |
| `daemon.manage`     | Restart, update, configuration changes, providers, skills, and plugins     |
| `tunnel.manage`     | Relay, Hub, service tunnel, and public endpoint relationships              |
| `access.manage`     | Pairing invitations, principals, credentials, grants, and revocation       |
| `workspace.read`    | Projects, workspaces, agents, timelines, files, diffs, and terminal output |
| `workspace.write`   | Prompts, agent control, files, terminals, git operations, and scripts      |
| `workspace.manage`  | Create, rename, archive, and remove projects and workspaces                |
| `automation.manage` | Schedules, heartbeats, and loops                                           |
| `hub.execute`       | Agent lifecycle, workspace titling, observation, and recovery              |

Agents and terminals use workspace authority. Both can execute code and mutate the workspace, so separate write permissions would claim an isolation boundary the daemon cannot enforce.

Connected-host management uses `tunnel.manage`; source-owned connection and metadata replacement
requires the producer or `access.manage`. Routed operations retain both caller and link authority,
see [Connected hosts](connected-hosts.md#ownership-and-authority).

Owner, operator, and viewer are UI presets expanded into explicit permissions. Do not persist them as roles. Adding a permission must not silently widen an existing principal.

Settings use the active session's `server_info.permissions` to decide which management controls to
show. Feature flags describe host support, not the caller's authority. For plugins, a connection
without `daemon.manage` must show authorization guidance before requesting the installed list or
mounting configuration and installation controls.

Permissions are additive allows. Missing authority denies the operation. Do not add deny precedence.

## Remote controllers

Initialize managed remote access on the host through its local desktop credential or
`paseo access link --controlled-only`. Keep the desktop account signed out on a controlled-only host.
The manager pairs from another device, then the host approves the matching verification code.
An unfinished first-manager pairing can be replaced locally; an established manager cannot.

Personal hosts can also authorize controllers through their bound ClawMuse account. See
[Account trust and storage](clawmuse-accounts.md#trust-and-storage) for that path. Invitation
approval remains required for controllers that do not use the bound account.

Relay links carry ten-minute, single-use invitations in the URL fragment. They require protected
endpoint security. Approval selects one-hour or persistent access; management access is persistent.
The controller keeps its own credential, pinned to the host's public key. The host stores only
credential and invitation digests, with explicit permission snapshots. A link or account-directory
entry never gives the host reverse access to its controller.

Controlled-only mode blocks daemon-owned outbound links, routed operations, and agent delegation.
The desktop discards other host connections before restoring them at startup, blocks further imports,
and refuses account login. Local workspace and daemon configuration remain usable. Only a paired
manager can lift the outbound restriction or revoke controllers; the local host can pause receiving
connections without changing grants. Revocation, expiration, and pausing close affected sessions.
Existing shared-password and credential-free sessions cannot enter managed hosts.

This is a product authorization boundary. Agents, terminals, plugins, and OS administrators run with
the daemon user's filesystem and network authority; this mode does not sandbox that user.

## Resources

Permissions are daemon-wide today. Future grants may select workspaces or agents, but operation classification remains inside the authorization module:

```ts
type Grant = {
  permission: Permission;
  resource: { kind: "daemon" } | { kind: "workspace"; ids: string[] };
};
```

A delegating principal can grant only authority it already possesses. A session may attenuate its principal's grants but cannot widen them.

Workspace-scoped grants require every resource-bearing operation and outbound observation to enforce the same workspace boundary. File preview currently accepts any daemon-readable regular file, so it must gain resource enforcement before workspace-specific access ships.

## Hub

The Hub authenticates as a service principal. Its locally selected grants decide whether it may execute agents, manage the daemon, manage tunnels, or manage access.

Hub user and role identifiers remain opaque external subjects. The Hub may create and revoke linked daemon principals when granted `access.manage`; the daemon does not interpret accounts, organizations, or roles.

Hub enrollment and permission updates exchange these semantic permissions directly. Legacy persisted Hub relationships that contain `hub.execution.*` migrate once to `hub.execute` when the daemon loads them; new relationships never persist or emit transport scopes as authority.
