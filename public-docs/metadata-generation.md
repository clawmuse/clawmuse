---
title: Auxiliary models
description: Choose shared models for prompt predictions, workspace titles, commit messages, and pull request text.
nav: Auxiliary models
order: 42
category: Configuration
---

# Auxiliary models {#metadata-generation}

Paseo asks a language model to write short pieces of text for you so you don't have to. This is separate from the agent you're talking to: it's a small, one-shot call made in the background.

The shared auxiliary model chain generates:

- **Next-message predictions** — a suggested follow-up for the conversation input.
- **Workspace titles** — a short, task-shaped label for a workspace, shown in the sidebar.
- **Worktree branch names** — a slug for a new worktree-isolated workspace's branch.
- **Commit messages** — a concise message for the changes you're committing.
- **Pull request title and body** — drafted from the diff when you open a PR.

A workspace title and its branch name are produced together from the same prompt, but you configure their wording independently (see below).

## How a model is chosen

Paseo has two modes. **Automatic** is the default and needs no configuration. **Manual** uses only the models you choose.

In Automatic mode, Paseo builds an ordered list of candidates and tries each one until a generation succeeds, so a slow or unavailable model falls through to the next:

1. **Built-in defaults**, matched against the models of the providers you have enabled:
   1. a `haiku` model
   2. `gpt-5.4-mini` (low reasoning)
   3. `minimax-m3`
   4. `nemotron-3-super`
2. **The model currently selected** for that agent or draft, as a last resort.

Each default is a match on the model id or name, so the first enabled provider that ships a matching model wins. Defaults with no match are skipped. Duplicates are removed, then generation tries the list top to bottom. The default order prefers small, fast, cheap models for these short tasks before falling back to whatever you have selected.

In Manual mode, Paseo tries only your configured models, in your order. It never adds the built-in defaults or the selected model, so your prompts and diffs only go to providers you chose. If every configured model fails, generation fails: workspace titles and branch names are not generated, and commits and pull requests get placeholder text. Pick a model that works for these tasks.

Every failure is written to `$PASEO_HOME/daemon.log` (`~/.paseo/daemon.log` by default) with the provider, the model and the error. Look there when a manual model doesn't produce titles, branch names, commit messages or pull request text.

## Choose a model

Open **Settings → Host → Auxiliary models** and select **Automatic** or **Manual**. In Manual mode, choose a primary model and add up to two fallback models. Paseo tries them in the displayed order. You can change or remove each fallback. Switching back to Automatic clears the list. Changes are saved on the host and synchronized to connected clients.

## Configure a custom fallback order

You can also configure the ordered chain in `agents.metadataGeneration.providers` in `~/.paseo/config.json`. Paseo tries your entries in order and nothing else. An empty list means Automatic.

```json
{
  "agents": {
    "metadataGeneration": {
      "promptPredictions": true,
      "providers": [
        { "provider": "claude", "model": "claude-haiku-4-5-20251001", "thinkingOptionId": "low" },
        { "provider": "opencode" }
      ]
    }
  }
}
```

Each entry accepts:

- `provider` (required) — the provider id. Built-in ids are `claude`, `codex`, `copilot`, `opencode`, and `pi`; custom providers use the id you gave them.
- `model` (optional) — a specific model id. Omit it to use that provider's default model.
- `thinkingOptionId` (optional) — a reasoning/thinking level for models that support one. Falls back to the model's default if the value isn't valid for that model.

The Settings screen preserves longer chains already configured in the file. After a direct file edit, reload the host configuration.

## Next-message predictions

Enable **Next-message predictions** in Auxiliary models to suggest a follow-up after an agent finishes a reply. Predictions use the same model chain for Codex, Claude Code, and other supported agent conversations. They are enabled by default and consume the selected provider’s normal usage allowance.

Click a suggestion or press **Tab** in an empty input to turn it into an editable draft. On mobile, tap it. Send the draft when you are ready. Dismiss a suggestion with its close button or **Escape**.

Opening historical conversations only reuses cached suggestions; it does not start a new model call. Predictions stay hidden while you type, attach files, dictate, or use voice mode. Failed predictions show no suggestion. The host shares each prediction across clients so opening the same conversation on two devices does not duplicate generation.

The implementation reuses [Cindy’s open source prediction code](https://github.com/makecindy/cindy) under Apache-2.0; see the repository’s `NOTICE` for attribution.

## Per-project instructions

You can steer the wording of each kind of metadata per repository with a `paseo.json` file at your repo root. Paseo reads it from the committed version of the base branch, the same way it reads worktree config.

```json
{
  "metadataGeneration": {
    "title": { "instructions": "Keep titles to a few words, no leading verb." },
    "branchName": { "instructions": "Use the format <type>/<scope>-<short-desc>." },
    "commitMessage": { "instructions": "Follow Conventional Commits." },
    "pullRequest": { "instructions": "Include a Testing section in the body." }
  }
}
```

Each key is optional; only the ones you set are affected. Your instructions **replace** the default style for that metadata type — they are not appended to it — so your wording never competes with Paseo's defaults. The functional requirements (what to produce and the output format) always apply and cannot be overridden.
