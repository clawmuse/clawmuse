# ClawMuse Tasks and Goals

Use the task board to collect development work across linked hosts, group tasks under a Goal,
and review results on the phone. Tasks share the Goals record, execution leases and review state
machine. Hosts keep their existing providers, workspaces and permission checks. A Goal can be
created by the owner or proposed by a planner; neither a completed process nor an agent's report
accepts the result on the owner's behalf.

Read this with [clawmuse-status.md](clawmuse-status.md), which owns the host session, enrollment,
and the phone's link to the service. Goals ride that session; nothing here works without it.

Hosted-service scope, cost assumptions, and paid-user validation live in
[clawmuse-commercialization.md](clawmuse-commercialization.md).

## Parts and ownership

| Part                                    | Owning source                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Service state, leases and relationships | `services/clawmuse-status/src/goals/`                                                                                        |
| HTTP and database contracts             | `services/clawmuse-status/docs/api-contract.md#goals`, `services/clawmuse-status/docs/database-contract.md#goals`            |
| Host inventory, runner and tools        | `packages/server/src/server/clawmuse-status/`                                                                                |
| CLI                                     | `packages/cli/src/commands/task/`; [command reference](../public-docs/cli.md#development-tasks)                              |
| App                                     | `packages/app/src/clawmuse-status/goals/`, `packages/app/src/components/goals/`, `packages/app/src/screens/goals-screen.tsx` |

## The loop

```
host publishes repos ──► service ──► plan run queued ("Suggest now" on the phone, or the per-repo daily pass once switched on)
                                        │
host leases plan run, planner agent reads repo, calls clawmuse_goal_propose
                                        │
                              cards appear as "suggested" ──► phone: accept / discard
                                        │ accept
                              execute run queued ──► host with the repo leases it
                                        │
executor agent works on a branch, opens a PR, calls clawmuse_goal_report once
                                        │
                     progress + budget left ──► next run queued automatically
                     done / blocked / needs_decision / nothing_to_do / failed ──► needs_review
                                        │
                              phone: approve / continue (with instruction) / discard
```

The service decides transitions from the run's last report (`goal-transitions.ts`); the host never
sets a goal status. Budgets bound the unattended loop: a goal with `budgetRuns: 3` gets at most
three runs before it comes back for review, and "continue" explicitly grants one more when exhausted, up to 50 total runs. Canceled leased
and expired runs also consume a round. A successful process without a report returns for review;
it does not continue. Round budgets do not cap model charges.

## Why it is shaped this way

- **Host and model are chosen per goal and remembered per project.** Every form that starts work
  (new goal, accept, continue, suggest) shows the host and the model, prefilled with the project's
  remembered choice, and the service stores whatever is sent. A pinned goal waits for its host
  instead of moving, because a run on the wrong machine is worse than a late one. The model list
  comes from the chosen host's provider snapshot over this client's paired connection
  (`components/goals/goal-target-fields.tsx`), so the service never has to know which models a
  host has; a host that is not paired with this client offers only its default model.
- **Hosts execute, the service orchestrates.** The planner and executor are ordinary daemon agents,
  so they have the repository, `gh`, the owner's credentials, and the configured providers. The
  service holds only card text, the repository identity, and the structured reports. That keeps the
  status service's privacy boundary (`services/clawmuse-status/docs/security-and-privacy.md`)
  mostly intact: tasks add owner-supplied intent, source URLs and selected verification evidence. Schedule ingestion sends the schedule name and execution identity, never its prompt, output or transcript.
- **Repository identity is the daemon project key.** `remote:github.com/org/repo` is what two hosts
  have in common; a filesystem path is not. Local-only checkouts are not eligible (`repo-inventory.ts`).
  The service rejects anything that is not a `remote:` key.
- **Leases ride the heartbeat.** The host lists its active run ids in `/v1/host/heartbeat`; the
  reply carries `queuedCount` and `canceledRunIds`. No second timer, no second connection, and a
  host that disappears loses its leases within `GOAL_RUN_LEASE_SECONDS` so the goal is parked as
  `needs_review / failed` instead of hanging.
- **The run is found through the runner's active agent mapping, not tool input.** `clawmuse_goal_report` resolves the calling agent through `goal-runner.ts`. An agent cannot report on another run,
  and the tools are only registered for agents that carry the label.
- **Planners read in the checkout; executors get a worktree.** A plan run creates a directory
  workspace on the repository root and archives it afterwards. An execute run creates a Paseo
  worktree (unless `isolation: local`) and leaves it: the owner may want to look at it, and
  auto-archive-on-merge reclaims it once the PR lands.
- **Execution keeps provider permissions.** Goals use Codex `auto` or Claude `acceptEdits` (falling back to its asking `default`), never
  `full-access`, `bypassPermissions`, or an unknown unattended mode. Only the goal's own report
  or proposal tool is preapproved on `clawmuse_goals`; file, shell and other tools retain provider
  checks. An extra permission request interrupts the run and creates a decision report. A continue
  instruction does not grant a provider permission. Providers without a supported mode fail closed.
- **Automatic rounds reuse the goal workspace.** The host records its workspace id under
  `PASEO_HOME/clawmuse-goals/`. A missing or archived workspace requires review instead of starting
  from a fresh checkout and losing previous work. Continuation instructions carry into automatic
  rounds. A different host still relies on structured reports and repository history; uncommitted
  files are not transferred between hosts.
- **Planning is opt-in per repository.** Publishing a repository never starts a planner on its
  own; the owner taps "Suggest now" or switches on the daily pass for that repository (migration
  010 flipped the 009 default). Prompts, cards, and reports are in Simplified Chinese because that
  is what the owner reads on the phone (`goal-prompts.ts`).
- **Off by default per host.** `clawmuse status goals set --enable` is required; the planner and
  executor models are chosen there too. Settings persist under `clawmuseStatus.goals` in
  `config.json` and survive `clawmuse status disconnect`, which is why `clawmuseStatus.url` became
  optional in the persisted schema.

## Host setup

```
clawmuse status goals set --enable --planner <cheap provider[/model]> --executor <strong provider[/model]>
clawmuse status goals show
```

`--isolation local|worktree` and `--max-concurrent <n>` are the only other knobs. A running daemon
picks the change up on its next lease; no restart. `clawmuse.status.get` reports the runner state
under `goals` so the phone and CLI can show whether a host takes runs.

## Phone and desktop

The `/goals` route is labelled **Tasks & Goals**. Its Board view shows Suggested / In progress /
Review / Closed across hosts, with a project filter. Desktop uses columns; compact screens stack
them. The Board follows the service's pagination. Detail shows the parent, children, dependencies,
source, reports and execution links. Save a draft before adding subtasks if the parent must not
start yet. Continue the draft after decomposition; its execution waits for unfinished children.
"Suggest goals" queues a plan run for one project and toggles its daily automatic pass (off until toggled).

The screen talks to the status service directly through the one `ClawMuseStatusApiClient` the
feature root owns (`api-access.ts`), so it needs the client to be enrolled; otherwise it shows the
not-enrolled empty state. The iOS app and the Electron desktop both enroll (see the mode table in
[clawmuse-status.md](clawmuse-status.md#app-behaviour-packagesapp)); each is its own installation,
and both see the same owner-wide goals. The summary the capsule polls carries `goals` counts for the same reason.

## Relationships and sources

A parent and all prerequisites must belong to the same owner and repository. Dependencies are
fixed at creation. A prerequisite unlocks work only after owner acceptance (`done`); discarding it
does not satisfy the dependency. Parent completion waits for children to be accepted or discarded.
The service rejects cycles involving either dependencies or parent/child edges. Existing leased
execution is not retroactively stopped when a child is added; decompose a draft before starting.

Use `task import-issue` to import one GitHub issue as a draft. Import is one-way, with no GitHub
writes. Reimport returns the existing task; it does not overwrite local task text. Use `task attach`
to track an existing session on its original host. Attachment observes that session without sending
a prompt or creating another agent. Continue observes it again; host/model changes and continuation
instructions are rejected. Give instructions in the original session. Pausing a running observation
also interrupts that session through the existing runner cancellation path.

Enabled Goals hosts record retained completed schedule runs on heartbeat. The source identity is
host + schedule + run, so retries and reconnects do not create another execution or reopen accepted
work. A schedule with no remote-backed workspace cannot enter the board. An archived or missing
session still leaves its record, but cannot be observed again; a run with no session cannot be
continued from the task. This backfill covers retained schedule history, not deleted runs.

The runner's existing lease is the task claim. Do not add a separate CLI lock around it. Lost hosts
still require the execution-stop confirmation described below; tasks do not transfer dirty worktrees.

## Rollout

Apply status-service migration 018 before deploying the service, then update hosts and clients.
Host sessions advertise `tasksVersion: 1`; new hosts send the attachment capability and structured
evidence only to a supporting service. Older hosts cannot lease attached sessions. The new board,
relationships and owner evidence submission require the updated service. The existing round limits
remain; this change adds no token or monetary budget.

## Review notifications and evidence

Reports can carry a commit/artifact revision, named checks with passed/failed/not-run results and
artifact links. These are supplied evidence, not service-executed verification. The owner can
submit passed checks for the current completed run from the detail sheet or `task report`; this
changes the review reason to completed and leaves the task awaiting a separate acceptance action.
Stale run IDs, empty owner checks, failed checks and unfinished children block acceptance as
applicable. Legacy reports without structured evidence keep their existing review flow.

The run history links to its actual managed Agent on the paired host, so the owner can inspect
messages, checks and workspace files before acceptance. Resolve it from the run's Agent reference
and relay host identity against this installation's bindings; a matching host display name is
not enough. Archived/deleted sessions remain subject to the host's existing access rules.

Migration 014 captures every transition into review in the same database transaction, including
lease expiration. The maintenance loop fans those events into the existing push outbox. Collapse
and supersession are per installation and goal, separate from aggregate Agent alerts. No progress
push is generated. Pending alerts for handled goals are suppressed; already displayed OS alerts
open the current server state.

The Review filter remains the durable inbox without push permission, an endpoint, or APNs
credentials. APNs `delivered` in the existing outbox means provider accepted. Device `observed`
and `opened` are separate authenticated receipts; opening does not infer observation or acceptance.
`acted_at` records leaving review through an owner action. Push bodies contain identifiers and a
review reason, never goal text. Android uses the same event outbox through FCM; platform prerequisites are in [Status](clawmuse-status.md#app-behaviour-packagesapp). Taps use `notification-open`, then `/goals` checks the installation
before fetching with the current authenticated owner. A changed account shows an account mismatch;
it never switches accounts from notification data. Account changes clear the Status session and
in-flight clients before another account can read goal data.

See [the platform scope](clawmuse-status.md#app-behaviour-packagesapp) and
[2026-10-29 verification evidence](qa-evidence/2026-10-29-personal-pro.md). A real user must still
review the files, reports and actual checks before accepting. Test-controller acceptance is QA,
not a paid-user acceptance or commercial validation result.

## Gotchas

- The goal tools are attached when the agent's tool catalog is built, which happens while the agent
  is being created and before `AgentManager` registers it. The runner therefore assigns the agent id
  itself (`createAgent({ kind: "mcp", agentId })`) and resolves the run from that id, never from
  `getAgent(id).labels`. Resolving through labels left planners without `clawmuse_goal_propose`; they
  wrote their proposals as plain text and the run still reported success.
- A plan run that ends without calling the propose tool finishes as `failed` with a reason, so
  "Suggest now" never silently produces nothing.

- A fresh host session is not live until it has published a snapshot and heartbeated once. Tests
  that drive the API by hand must do both before expecting the host to receive runs.
- `goal_runs.host_id` is an assignment hint, not ownership: the worker reassigns unpinned queued runs whose
  host went offline, and any host that published the repository may lease an unassigned run.
- A failed run never retries by itself. The owner's "continue" is the retry, and it also grows an
  exhausted budget by one, capped at 50. Lease expiry is uncertain execution, never proof that an
  external side effect did not happen. Review results before retrying.
- Canceled and expired executors fence replacement leases until the same observing host session
  confirms exit. An empty replacement session cannot do so. A runner that retained its active map
  can rebind and then confirm exit; lost process state requires an explicit owner check of the
  original host before continue. This does not promise exactly-once external effects.
- Manual creation retries reuse `requestId` (scoped to owner). Only one open execute run per goal
  is allowed by the database. `approve` accepts completed/nothing-to-do reports; failures and budget
  exhaustion cannot be marked accepted through that action.
- Proposals are deduplicated by title per repository across every status, so a discarded suggestion
  is not re-proposed tomorrow under the same name.
