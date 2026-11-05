# Repository guidance

Read README.md, CONTRIBUTING.md and relevant docs before changing code.
Run npm run typecheck and npm run lint after changes; npm run format before committing.
Build workspace dependencies before diagnosing generated declaration errors.
Run only focused test files locally, never the full suite.
Never restart the production daemon on port 6767 without permission.
Keep cloud services, credentials and deployment records out of this repository.
Use GitHub-hosted runners only, with no production credentials in pull request jobs.
