First public release of Sentinel — the industrial machinery monitoring platform (Next.js client, Bun/Express API, Python ML service).

## Highlights

- **CI/CD pipelines** — GitHub Actions CI runs the full server test suite (Bun + Mongo/Redis services), the Next.js production build, and ML pytest on every push and PR; CD builds and pushes the three Docker images to Docker Hub, gated on credential presence.
- **Argus LLM explanations** — Sarvam added as an LLM provider option alongside the existing providers, with provider-selection logic and dedicated tests.
- **Age gate & analytics privacy** — new age-gate utility with tests, consent handling, and privacy documentation (`docs/analytics-privacy.md`).
- **Design refresh** — full visual update (~85% of the product surface), new Sentinel brand mark components, rewritten README matching the current codebase.
- **Demo environment** — repeatable demo setup for walkthrough recordings.

## Fixes

- Refresh-token verification now uses the same secret fallback as signing (previously 401'd whenever `REFRESH_TOKEN_SECRET` was unset).
- Legacy `POST /settings/api-key` restores replace semantics instead of accumulating keys.
- `zod` declared as an explicit server dependency (was resolving only from stale local `node_modules`).
- Client `package-lock.json` regenerated so `npm ci` succeeds in CI and Docker builds.
- CI/CD workflows rewritten to pass GitHub's workflow validation (secrets in job outputs, correct branch triggers, valid artifact paths).

## Verification

- Server: **186/186 tests pass** (fresh database)
- Client: production build passes
- ML service: **87 tests pass**

**Full Changelog**: https://github.com/chandanjainhp/Sentinel/commits/v1.0.0
