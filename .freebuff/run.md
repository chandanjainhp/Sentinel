# Sentinel — Run doc (Preview tab)

Goal: viewable app at **http://localhost:3000** (Next.js client), backed by the Express API at
**http://localhost:8000**. Both processes run detached and must keep running after this
conversation ends.

Working directory for everything below: the repo root
`/home/chandanjainhp/coding/javascript/Project/Sentinel` (same as the thread workspace — this
checkout IS the main checkout, so no cross-worktree copying is needed).

Runtime: **Bun** (1.4.x) for both `server/` and `client/`. Databases run in Docker.

## 1. Reproduce artifacts (fresh checkout)

This workspace already satisfies all of the following; each step lists the check to re-run if
you are starting from a clean clone.

### 1.1 Environment files

- `server/.env` — REQUIRED. Secrets + JWT + Google client id + mail + Cloudinary + tunnel
  token. It is gitignored, so a fresh checkout needs it copied from the main checkout:
  ```bash
  cp /home/chandanjainhp/coding/javascript/Project/Sentinel/server/.env server/.env
  ```
  IMPORTANT — as of 2026-10-18 this file is **compose-shaped**: it carries
  `MONGO_ROOT_USER` / `MONGO_ROOT_PASSWORD` / `MONGO_DB` / `REDIS_PASSWORD` but **no**
  `MONGODB_URL`, `REDIS_URL`, or `ML_SERVICE_URL`. Those three are only interpolated by
  `docker-compose.yml`, so a host-run backend (`bun src/index.js`) must be handed them
  **explicitly on the command line** — `db/mongo.js` throws `MONGODB_URL environment
  variable not set` and the port never opens otherwise (see §2.1).
  Non-secret values that matter: `PORT=8000`, `NODE_ENV=development`,
  `CLIENT_URL=http://localhost:3000`. Note `CORS_ORIGIN` may hold the **production**
  tunnel origin — harmless here, because the browser stays same-origin on the Next proxy
  and never calls `:8000` cross-origin. Secret values are never reproduced here.
- `client/.env` — REQUIRED (only two keys): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
  Copy from the main checkout the same way if missing.
- NOTE: the file-editing tool refuses paths matching `.env*` — create/copy env files with
  terminal commands (`cp`/`sed`/`perl`), never with write/str_replace tools.

### 1.2 Dependencies

```bash
cd server && bun install   # already installed (node_modules present)
cd client && bun install   # already installed (node_modules present)
```

### 1.3 Database containers (Mongo + Redis)

The server requires BOTH to be reachable at boot (`connectDatabases()` throws otherwise and
the port never opens).

- Mongo: container `sentinel-test-mongo`, host port **28017**, auth
  `sentinel` / `sentinel-test` (a fixed test credential, **not** the prod
  `MONGO_ROOT_PASSWORD`). Preview data lives in the **`sentinel_preview`** database.
- Redis: container `sentinel-test-redis`, host port **26379**, no auth. The server's default
  is `redis://localhost:6379`, so `REDIS_URL=redis://localhost:26379/8` must be passed
  explicitly (see launch commands below).

```bash
docker start sentinel-test-mongo sentinel-test-redis   # no-ops if already running
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep sentinel-test
```

The containers persist across restarts/reboots in a **stopped** state, so plain `docker
start` is enough. Only if they are missing entirely (`docker ps -a` shows nothing) recreate
them:

```bash
docker run -d --name sentinel-test-mongo -p 28017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=sentinel -e MONGO_INITDB_ROOT_PASSWORD=sentinel-test mongo:7.0
docker run -d --name sentinel-test-redis -p 26379:6379 redis:7-alpine
```

### 1.4 Verify readiness

```bash
curl -fsS http://localhost:8000/api/v1/health   # {"status":"ok","mongo":"connected","redis":"connected"}
```

## 2. Run the server

### 2.1 Backend (Express, port 8000)

CRITICAL: the Freebuff command runner exports `PORT=0` into every shell. The server would bind
an ephemeral port and the preview would never work — **always pass `PORT=8000` explicitly**.

```bash
cd server
LOGDIR=/home/chandanjainhp/coding/javascript/Project/Sentinel/.freebuff
{ setsid nohup env PORT=8000 \
    MONGODB_URL="mongodb://sentinel:sentinel-test@localhost:28017/sentinel_preview?authSource=admin" \
    REDIS_URL="redis://localhost:26379/8" \
    ML_SERVICE_URL="http://localhost:9000" \
    bun src/index.js > "$LOGDIR/<thread>-backend.log" 2>&1 < /dev/null & echo "backend pid=$!"; disown; }
```

`MONGODB_URL` / `REDIS_URL` / `ML_SERVICE_URL` are **mandatory here** — `server/.env` no
longer supplies them (see §1.1). `dotenv` loads `./.env` relative to cwd but never overrides
vars already set, so these explicit values win. Point the log at this thread's
`.freebuff/preview-<threadId>-backend.log`.

(An optional 4th process, the ML service, is started in §2.4; the backend degrades
gracefully without it. Launch the backend first so the client's `/api/v1` proxy has an
upstream, then confirm aliveness with `kill -0 <pid>` a few seconds later; expect "Server
listening on http://localhost:8000" in the log.)

### 2.2 Client (Next.js, port 3000)

```bash
cd client
LOGDIR=/home/chandanjainhp/coding/javascript/Project/Sentinel/.freebuff
{ setsid nohup env PORT=3000 NODE_ENV=development NEXT_TELEMETRY_DISABLED=1 \
    ./node_modules/.bin/next dev --port 3000 > "$LOGDIR/<thread>.log" 2>&1 < /dev/null & echo "client pid=$!"; disown; }
```

(`client/.env` supplies `NEXT_PUBLIC_API_URL`; `next.config.mjs` rewrites `/api/v1/*` to
that upstream, falling back to `http://localhost:8000`. Point the log at this thread's
`.freebuff/preview-<threadId>.log` — this is the canonical preview log.)

Verify:
```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/login                    # 200
curl -fsS http://localhost:3000/api/v1/health                                             # proxied 200 JSON
```

The very first page compile can take 30–90s on a cold cache, so a single `curl` right after
launch may time out even though the server is fine — poll in a loop before concluding failure.

### 2.3 Logs

- Client: `.freebuff/preview-<threadId>.log` (the canonical preview log)
- Backend: `.freebuff/preview-<threadId>-backend.log`
- ML service: `/tmp/preview-ml.log`

### 2.4 ML service (optional, port 9000)

Backs `/predict` and the coverage gate. The backend reports degraded (503 on `/predict`)
without it, but a full demo wants it up:

```bash
cd ml-service
setsid nohup .venv/bin/python -m app > /tmp/preview-ml.log 2>&1 < /dev/null & echo "ml pid=$!"
# model loads from ml-service/models/*.pt; /health returns 200 once ready
```

### 2.5 Top up demo data

If the dashboard looks empty (e.g. after `bun test` wiped collections — see §5):

```bash
bun scripts/seed-preview.mjs        # idempotent: creates demo site/machines/sensors + readings
```

## 3. Detaching gotchas (learned the hard way — do not skip)

1. **Plain `nohup ... &` gets reaped** by the runner's process-group cleanup: the pid vanishes
   within seconds and the log file stays empty (the process died before writing anything).
   Use `setsid` (own session) as shown. Recipe source: Freebuff preview activation notes.
2. **`PORT=0` is exported by the runner.** Always override with `PORT=8000` / `PORT=3000`.
3. Launch and the first `kill -0` / log check in the SAME command — a pid that died tells you
   nothing from an empty log; the in-command check is the only reliable signal.
4. If a pid dies again with an empty log: reproduce the command in the FOREGROUND (with
   `timeout 25 ...`) to see the actual error, fix, then re-detach.
5. `bun run dev` (package-script indirection) failed to survive detaching even under setsid;
   invoking the binary directly (`bun src/index.js`, `./node_modules/.bin/next dev`) works.

## 4. Current live state (2026-10-18, thread 0d812a50)

- ML service pid **217530** → http://localhost:9000 (`generic_motor` model loaded)
- Backend pid **217598** → http://localhost:8000 (`/api/v1/health` = 200, mongo+redis connected,
  workers up) — DBs passed explicitly: `sentinel_preview` on :28017, redis `/8` on :26379
- Client pid **220883** → http://localhost:3000 (registered as this thread's preview)
- Containers `sentinel-test-mongo` (28017) and `sentinel-test-redis` (26379) running
- The registered preview is the Next.js client; the browser stays same-origin on `/api/v1`,
  rewritten to `http://localhost:8000` (client/next.config.mjs rewrites,
  `NEXT_PUBLIC_API_URL` / `API_UPSTREAM_URL` / default fallback chain).
- Verified end-to-end this session: landing page renders, console clean (HMR + `[API]
  baseURL /api/v1`, no errors), and a real login as `ops.demo@sentinel.local` walks
  `/login → /overview` showing the 3-machine demo fleet with live incidents.

## 5. Notes for other tasks

- Tests (`bun test` in `server/`) use the SAME containers on 28017/26379 — running the test
suite will drop collections in the dev database it's pointed at. Prefer seeding the preview
via `bun scripts/seed-preview.mjs` (repo root) after tests if the dashboard looks empty.
- Uncommitted work in this tree: the 13+ age-verification feature (server gate + client mirror)
  and tests — register/registerWithGoogle endpoints expect `ageConfirmed` and optional
  `dateOfBirth` (YYYY-MM-DD). The register page in the client carries the matching checkbox.
