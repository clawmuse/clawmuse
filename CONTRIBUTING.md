# Contributing

Use Node.js 22 and `npm ci`. Read the relevant subject document in `docs/` before
changing behavior. Keep wire protocol changes backward-compatible.

Run `npm run build:server` and `npm run build:app-deps` before diagnosing types that
come from another workspace. Run `npm run typecheck`, `npm run lint` and
`npm run format` before committing. Run only the affected test files locally.
Do not restart an existing daemon on port 6767.

Open pull requests against `main`. Keep cloud implementations, credentials, local
state, screenshots containing personal data and production deployment details out of
this repository. See [source boundaries](docs/source-scope.md).
