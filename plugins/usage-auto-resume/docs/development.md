# Development

This directory is a ClawMuse fork of the installed Usage Auto Resume plugin. Its source pin and license are in [README](../README.md). It remains an explicitly installed directory plugin; do not add it to the built-in registry. The installed plugin id stays `usage-auto-resume`, so existing provider settings and resume jobs keep their paths.

Run dependency installation and typechecking from the ClawMuse repository root. Imported upstream files retain their original local style rules through an explicit file list in `.oxlintrc.json`; new queue files use the repository rules. The existing `@getpaseo/builtin-plugins` test script runs the upstream Node tests after the Vitest suites in CI. For local work, run only the changed test file:

```bash
node --import tsx --test plugins/usage-auto-resume/server/resumer.test.ts
npm run typecheck --workspace=@getpaseo/builtin-plugins
```

Reload an installed directory source with `paseo plugin reload usage-auto-resume`. Reloading only this plugin leaves agents running; do not restart the daemon. A reload during an uncertain delivery pauses that queue for explicit review.

[Behavior](behavior.md) owns ordering, persistence, and delivery limits.
