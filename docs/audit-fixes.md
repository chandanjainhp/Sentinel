# Verified audit fixes

Status of the defects found in the audit, re-checked against the working tree.
Items marked **fixed** have regression tests; items marked **proposed** were
deliberately not implemented (they need a product decision or a reviewed
migration).

## Secrets

- `server/.env` and `server/.env.test` exist on disk, are git-ignored, and have
  **never** been committed (`git log --diff-filter=A --name-only | grep .env`
  returns only `.env.example`). No high-confidence credential pattern appears
  anywhere in history.
- Rotation is still required **if** the shared archive was built from the
  working tree instead of from Git: it would have included `server/.env`, which
  holds live-looking values for `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`,
  `MONGODB_URL` credentials, `REDIS_PASSWORD`, `SARVAM_API_KEY`,
  `EMAIL_PASSWORD`, `SENTRY_DSN`, `GOOGLE_CLIENT_ID` and
  `CLOUDFLARE_TUNNEL_TOKEN`. Rotate those at the provider; nothing in this
  repository can revoke them.
- `client/.next/standalone/client/.env` is a build artifact copy containing only
  `NEXT_PUBLIC_*` values. It is ignored by Git; keep it out of any archive.

## Fixed

| Issue | Files | Test |
| --- | --- | --- |
| `debug-key.mjs` dropped the whole database unconditionally | `server/src/tests/debug-key.mjs` | n/a (manual probe) — now refuses any database whose name lacks `test`, never drops, and deletes only the account it created |
| Migration found no collections without registered models, mis-reported counts, dropped `organizations` automatically | `server/src/scripts/migrate-org-to-user.js` | `src/tests/migrate-org-to-user.test.js` |
| `dotenv` ran after imports, so modules reading `process.env` at import time saw an empty env | `server/src/index.js` (`import 'dotenv/config'` first) | startup check below |
| `demo-run.js` dropped caller-supplied headers, so `Idempotency-Key` never arrived | `server/scripts/demo-run.js`, `server/scripts/demo-api.js` | `src/tests/demo-run-api.test.js` |
| Event ingestion bypassed the global limiter with no replacement | `server/src/routes/event.routes.js`, `server/src/middlewares/rateLimit.middleware.js` | `src/tests/event-rate-limit.test.js` |
| Refresh tokens minted in the same second were identical, so rotation could not invalidate the old one | `server/src/models/user.model.js` (`jti`), `server/src/controllers/auth.controller.js` (compare-and-swap) | `src/tests/refresh-rotation.test.js` |
| Investigation producer hardcoded `'investigations'` while the worker read `INVESTIGATION_QUEUE_NAME`, so setting the env var enqueued jobs nobody consumed | `server/src/queues/investigation.queue.js` (single resolver), `server/src/queues/investigation.worker.js`, `server/src/queues/worker.js` (startup log) | `src/tests/investigation-queue-name.test.js` |
| Production signed JWTs with public fallback secrets | `server/src/config/secrets.js` (new), `server/src/models/user.model.js`, `server/src/controllers/auth.controller.js`, `server/src/index.js` | `src/tests/env-secrets.test.js` |

Already correct in the working tree, verified but not changed:

- `src/tests/v1-backend-acceptance.test.js` imports `createHash` from
  `node:crypto`; no `require()` remains in the test suite.
- `src/middlewares/idempotency.middleware.js` imports `../db/redis.js`, which is
  the right path. It is **not mounted**: event idempotency lives in
  `event.service.js` and the unique `{ userId, idempotencyKey }` index.

## Proposed — needs review before implementation

### Incident uniqueness across replicas

`incident.service.js` serialises create-vs-update per machine with an in-process
promise chain. That closes the race inside one Node process only; two replicas
can both see "no open incident" and create one each.

Proposal:

```js
incidentSchema.index(
  { machineId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["open", "reviewed"] } } }
);
```

Before adding it:

1. Check for existing duplicates:
   `db.incidents.aggregate([{ $match: { status: { $in: ["open", "reviewed"] } } }, { $group: { _id: "$machineId", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])`
2. Close the extras (or leave one per machine) before building the index.
3. Create the index in a maintenance window; the build fails on duplicates and
   is not rolled back automatically.
4. Make `createIncidentIfEligible` catch `E11000` and retry as an update, or the
   losing writer now errors instead of merging.

No index was added here: it changes write behaviour for every incident path and
needs the duplicate check above against real data.

### Email scaffolding

`server/email/` (`email.config.js`, `emails.js`, `emailTemplates.js`) is not
imported by anything: `emails.js` imports `email.config.js`, and nothing imports
`emails.js` or the folder. Its `EMAIL_PASS` variable is therefore a dead-code
inconsistency with the canonical `EMAIL_PASSWORD` used by the live path
(`src/utils/mail.js`) — do not "fix" it in place, because that would make dead
code look maintained. Keep the folder for now; removing it is safe but belongs
in a cleanup commit that also changes nothing else.

### Webhooks and unused dependencies

- `src/queues/webhook.queue.js` (`getWebhookQueue`, `dispatchWebhook`) and
  `src/models/webhookDelivery.model.js` are referenced by nothing. The worker
  no longer registers a webhook handler (the old one called a non-existent
  `Site.getSite()`). This is unfinished feature scaffolding, not a bug: decide
  whether webhooks are in scope before deleting.
- `joi` is declared in `server/package.json` and imported nowhere (`zod` is the
  validation library). Removing the dependency is a separate, low-risk cleanup.
- `email/` and `webhookDelivery.model.js` are the only other candidates; no
  models or queues were deleted here.
