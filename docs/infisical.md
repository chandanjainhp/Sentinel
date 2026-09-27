# Moving Sentinel's secrets to Infisical

This runbook replaces the per-developer `.env` files with secrets delivered at
process start by the [Infisical](https://infisical.com) CLI. The application
code does not change: `process.env` is still `process.env`, it is just populated
by the wrapper instead of by a file on disk.

Nothing here is automated. Steps 1–4 need a human (account, project, login);
the repository side is already prepared.

---

## What exists in the repo today

| Location | File | Tracked in git? | Notes |
| --- | --- | --- | --- |
| `server/` | `.env` | no (ignored) | the real secret store today |
| `server/` | `.env.test` | no (ignored) | points at the disposable test containers |
| `server/` | `.env.example` | **no** (ignored) | exists only on machines where someone created it — `server/.gitignore` ignores `.env.example`, overriding the root negation |
| `client/` | `.env` | no (ignored) | `NEXT_PUBLIC_*` only — no secrets |
| `client/` | `.env.example` | yes | template |

Note that there is no committed server-side template at all: onboarding currently
depends on someone handing over a `.env`, which is exactly the situation this
migration removes. Keep `server/.gitignore` as it is — a template whose contents
nobody has verified should stay out of git — and let Infisical be the handover
mechanism instead.

There is **no** secrets manager, vault, or CI configuration in this repository
yet, and no `.env` value is committed. The only secret material that has ever
been committed is the pair of throwaway passwords baked into
[`server/docker-compose.local.yml`](../server/docker-compose.local.yml)
(`StrongMongoPass@123` / `StrongRedisPass@123`) — that file is tracked, so those
two strings live in git history forever. See [Step 8](#step-8--clean-up).

### Which environment variables the app reads

Names only — never values. `server/src/index.js` loads `.env` with `dotenv`,
and Bun/Next also auto-load `.env` files, so today every one of these comes from
disk.

**Carry real secrets — these are the point of the migration**

```
ACCESS_TOKEN_SECRET          REFRESH_TOKEN_SECRET        SENTRY_DSN
MONGODB_URL                  REDIS_URL                   CLOUDFLARE_TUNNEL_TOKEN
EMAIL_PASSWORD               MONGO_ROOT_PASSWORD         REDIS_PASSWORD
ANTHROPIC_API_KEY            OPENAI_API_KEY              OPENROUTER_API_KEY
MISTRAL_API_KEY
```

**Configuration, not secrets** (still fine to keep in Infisical so there is one
source of truth)

```
server/  NODE_ENV PORT APP_URL CLIENT_URL CORS_ORIGIN LOG_LEVEL ML_SERVICE_URL ML_TIMEOUT_MS
         MOCK_AI LLM_PROVIDER USE_LOCAL_LLM LOCAL_LLM_MODEL LMSTUDIO_MODEL LMSTUDIO_MAX_TOKENS
         OPENAI_BASE_URL OPENROUTER_BASE_URL OPENROUTER_MODEL OPENROUTER_HTTP_REFERER
         OPENROUTER_X_TITLE MISTRAL_BASE_URL MISTRAL_MODEL EMAIL_HOST EMAIL_PORT EMAIL_USER
         EMAIL_FROM_EMAIL EMAIL_FROM_NAME ACCESS_TOKEN_EXPIRY REFRESH_TOKEN_EXPIRY
         PREDICTION_QUEUE_NAME ARGUS_EXPLAIN_QUEUE_NAME MAX_SENSORS CHANNEL_MAX_AGE_SEC
         COVERAGE_RECENCY_WINDOW_SEC DEBUG_BASE MONGO_ROOT_USER MONGO_DB
client/  API_UPSTREAM_URL NEXT_PUBLIC_API_URL NEXT_PUBLIC_SUPPORT_EMAIL NEXT_PUBLIC_DEBUG_API
         NEXT_PUBLIC_SEED_NIGHT_DATE
ml/      ML_PORT ML_MODELS_DIR ML_LOG_LEVEL
```

`server/.env.test` is deliberately left out of scope: it holds disposable
credentials for the local test containers and no production value.

---

## Step 1 — Decide the scope

| Scope | Delivery method | Covered here |
| --- | --- | --- |
| Local development | `infisical run` with an interactive login | yes — prepared in the repo |
| CI/CD | `infisical run` / the Infisical action with a machine identity | yes — see [Step 6](#step-6--ci-cd-and-production) |
| Kubernetes | Infisical Kubernetes Operator | out of scope (no cluster in this repo) |
| Production (Raspberry Pi + Cloudflare Tunnel) | machine identity, secrets fetched at container start | yes — see [Step 6](#step-6--ci-cd-and-production) |

The repository changes in this pass cover **local development** only. The
production compose stack is the live Pi deployment, so
[`docker-compose.yml`](../docker-compose.yml) was intentionally not rewritten;
Step 6 shows the exact change when you want to cut it over.

---

## Step 2 — Create the project(s)

1. Sign up / sign in at <https://app.infisical.com>.
2. **Secrets Management → + Add New Project.**
3. This repo is a three-service monorepo, so use one project per service, named
   after the service. At minimum create `sentinel-server`; add `sentinel-client`
   and `sentinel-ml-service` if you want one home for everything.
4. Every new project already has **Development**, **Staging**, and **Production**.
5. On the **Development → Secrets Overview** page, drag and drop `server/.env`
   straight onto it (or use **Paste Secrets**) and confirm the upload. Repeat
   into **Staging** / **Production** for the environments you actually run, with
   environment-appropriate values (a different `MONGODB_URL`, different token
   secrets, a real `CLOUDFLARE_TUNNEL_TOKEN`, and so on).

> Do not paste secret values into chat, tickets, or commits — Infisical is now
> the only place they should live.

## Step 3 — Install and authenticate the CLI

```bash
# macOS
brew install infisical/get-cli/infisical

# Windows
winget install infisical

# Linux (deb example; see the install docs for rpm/apk/Arch)
curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical

# any platform with Node
npm install -g @infisical/cli
```

Then link this machine to your account:

```bash
infisical login
```

On WSL 2, a Codespace, or a remote SSH session with no browser, use the
interactive-token flow instead:

```bash
infisical login -i
```

In production pin the CLI to a specific version so reinstalls cannot drift.

## Step 4 — Link the codebase

Run this **inside each service directory**, not at the repo root, so each
service points at its own project:

```bash
cd server && infisical init     # writes server/.infisical.json
cd ../client && infisical init  # optional, if you created sentinel-client
```

`infisical init` writes `.infisical.json`, roughly:

```json
{
  "workspace": "<project-id>",
  "defaultEnvironment": "dev",
  "gitIgnore": []
}
```

It holds local project settings only — **no secrets** — so it is safe to commit
and should be, so every teammate gets the same wiring. It is not gitignored
today; keep it that way.

> A single `.infisical.json` per service is the monorepo-friendly setup.
> If you would rather run one project with `/server`, `/client`, `/ml-service`
> folders, keep one `.infisical.json` at the root and add
> `--path=/server` (or `--project-config-dir=./server`) to the commands below.

## Step 5 — Inject secrets at runtime

Already done in `server/package.json`:

```json
"dev":   "infisical run --env=dev -- bun --watch src/index.js",
"start": "infisical run --env=dev -- bun src/index.js",
```

So the team's default command is unchanged:

```bash
cd server && bun run dev        # secrets are injected by the wrapper
```

The unwrapped commands are kept as `dev:dotenv` / `start:dotenv` so people can
still boot during rollout. **Delete both, and `server/.env`, at cutover** —
otherwise the escape hatch keeps secrets on disk.

Add `--watch` while developing if you want the process to restart when a secret
changes in Infisical:

```bash
infisical run --watch --env=dev -- bun src/index.js
```

Why no code changes are needed:

- `dotenv.config()` and Bun's automatic `.env` loading only fill in variables
  that are **not already set**, so an injected value always wins over the file.
- `server/src/index.js` keeps reading `process.env` exactly as before.

Other entry points, same pattern (not modified in this pass):

```bash
# full-stack verification scripts
infisical run --env=dev -- bun scripts/e2e-smoke.js
infisical run --env=dev -- bun scripts/e2e-failure-paths.js

# ML service (no secrets today, but keeps the pattern consistent)
infisical run --env=dev -- python -m app
```

## Step 6 — CI/CD and production

Interactive login is for laptops only. For anything automated, create a
**machine identity** with **Universal Auth**:

1. **Access Control → Machine Identities → Create** (project-scoped is enough).
2. Configure Universal Auth; set a sensible Access Token TTL and add the
   identity to only the project and environment it needs (e.g. read-only on
   `sentinel-server` / `prod`).
3. **Add Client Secret**, then store the Client ID and Client Secret in the
   platform's own secret store — GitHub Actions secrets, the Pi's root-owned
   env file, systemd credentials. Never in the repo, never in compose.

Then authenticate the workload instead of a person:

```bash
# Non-interactive: exchange the identity for a short-lived token (or use --silent --plain)
export INFISICAL_TOKEN=$(infisical login --method=universal-auth \
  --client-id="$INFISICAL_CLIENT_ID" \
  --client-secret="$INFISICAL_CLIENT_SECRET" --silent --plain)

# Fetch a specific project strongly recommended for identities
infisical run --token="$INFISICAL_TOKEN" --projectId="$INFISICAL_PROJECT_ID" \
  --env=prod -- bun src/index.js
```

Also export `INFISICAL_DISABLE_UPDATE_CHECK=true` in automated environments.

**Raspberry Pi / production compose.** The stack currently reads
`server/.env` through compose `env_file` and `--env-file`. Two ways to cut over:

- *Target:* give the `server`/`client`/`ml-service` containers the CLI and make
  `CMD` `infisical run --env=prod --token=$INFISICAL_TOKEN --projectId=$INFISICAL_PROJECT_ID -- <original command>`,
  with the identity credentials supplied by the Pi's own secret store. Then
  compose no longer needs `env_file` or `--env-file` for application secrets.
- *Smaller first step:* materialise the file at deploy time from Infisical
  instead of hand-copying `.env` onto the Pi —
  `infisical export --env=prod --format=dotenv --token=… --projectId=… > server/.env`
  (root-owned, `chmod 600`) before `docker compose --env-file server/.env up -d --build`.
  Secrets stay central, the Pi keeps a generated, disposable copy.

**CI.** There is no CI in this repository yet (`.github` does not exist). When
one lands, inject with the identity rather than storing a second copy of every
secret:

```yaml
- run: |
    export INFISICAL_TOKEN=$(infisical login --method=universal-auth \
      --client-id="${{ secrets.INFISICAL_CLIENT_ID }}" \
      --client-secret="${{ secrets.INFISICAL_CLIENT_SECRET }}" --silent --plain)
    infisical run --token="$INFISICAL_TOKEN" --projectId="${{ vars.INFISICAL_PROJECT_ID }}" \
      --env=staging -- bun test
```

## Step 7 — Verify it works

`server/src/scripts/secret-source-check.mjs` prints, for every tracked variable,
its presence, its **length**, and whether the in-process value is identical to
the copy in `.env` on disk. It never prints a value.

```bash
cd server
bun run secrets:check        # == infisical run --env=dev -- bun src/scripts/secret-source-check.mjs
```

Expect the secret-bearing rows to read `injected (absent from env file)` or
`injected (differs from env file)` — not `matches-disk`.

Then prove the disk is not the source:

```bash
cd server
mv .env .env.backup
bun run dev                  # or: infisical run --env=dev -- bun src/index.js
bun run secrets:check        # every row should now read `injected`
```

Confirm the app starts and the API answers (`GET /api/v1/health`), then keep the
backup until you are satisfied and delete it. Add `--strict` to make the check
exit non-zero if a tracked variable is missing, which is handy as a CI gate.

> `server/.env.test` is unaffected: run `bun test` as usual, it only needs the
> disposable test containers.

## Step 8 — Clean up

1. `.gitignore` already covers this: the root file ignores `.env` and `.env.*`
   (`!.env.example` keeps templates tracked), and `server/.gitignore` ignores
   `.env`, `.env.*` and `.env.example`. Run `git status` before committing and
   confirm it never lists an env file. If you ever do want the server template
   in git, change that one line in `server/.gitignore` deliberately, after
   checking the file really holds placeholders and not real values.
2. Rotate anything that was ever committed, because git history keeps it.
   In this repo that is the two passwords in
   `server/docker-compose.local.yml`; replace them with values generated at
   container start, or accept them as throwaway local-dev credentials and say so
   in the file. Any secret pasted into a ticket, chat, or CI log counts too.
3. Scan for leaks before and after the migration:

   ```bash
   infisical scan                       # full git history
   infisical scan --verbose             # show the findings in detail
   infisical scan git-changes --staged  # pre-commit style check
   infisical scan install --pre-commit-hook   # block future leaks locally
   ```

   For this repo a baseline is useful, since the known compose passwords are old
   findings: `infisical scan --report-path leaks-report.json`, then rerun with
   `--baseline-path leaks-report.json` to see only *new* leaks.
4. Never commit, echo, or paste a real secret value — including into this
   codebase's docs, tests, or fixtures.

---

## Rollback

Everything here is additive:

- `git checkout server/package.json` restores the unwrapped `dev`/`start`
  scripts (or just use `dev:dotenv` / `start:dotenv`).
- `server/.infisical.json` is inert without the CLI — delete it if you stop
  using Infisical.
- No application code, queue, model, or test was changed by this migration.

## Still open

- `client/package.json` is intentionally **not** wrapped: its `.env` holds only
  `NEXT_PUBLIC_*` build-time values and no secrets, and the Docker build reads
  `API_UPSTREAM_URL` from the builder stage. Wrap it the same way if a real
  client-side secret ever appears.
- `docker-compose.yml` (the Pi stack) still uses `env_file: server/.env`; the
  cutover in Step 6 is the last piece.
