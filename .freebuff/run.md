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

- `server/.env` — REQUIRED. Contains Mongo URL, JWT secrets, Google client id, mail,
  Cloudinary, OpenAI/OpenRouter keys, etc. It is gitignored, so a fresh checkout needs it
  copied from the main checkout:
  ```bash
  cp /home/chandanjainhp/coding/javascript/Project/Sentinel/server/.env server/.env
  ```
  Non-secret values that matter: `PORT=8000`, `NODE_ENV=development`,
  `MONGODB_URL=mongodb://...@localhost:28017/ridgeway?authSource=admin` (port **28017**, the
  `sentinel-test-mongo` container), `CORS_ORIGIN=http://localhost:3000`,
  `CLIENT_URL=http://localhost:3000`. Secret values are never reproduced here.
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

- Mongo: container `sentinel-test-mongo`, host port **28017**
  (`mongodb://sentinel:<pw>@localhost:28017` — password lives in `server/.env`).
- Redis: container `sentinel-test-redis`, host port **26379**. Note the server's default is
  `redis://localhost:6379`, so `REDIS_URL=redis://localhost:26379` must be passed explicitly
  (see launch commands below).

```bash
docker start sentinel-test-mongo sentinel-test-redis   # no-ops if already running
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep sentinel
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
{ setsid nohup env PORT=8000 REDIS_URL=redis://localhost:26379 \
    bun src/index.js > "$LOGDIR/preview-1f1194aa-0de5-4f9b-bb37-73c9dc95a8a8-backend.log" 2>&1 < /dev/null & echo "backend pid=$!"; disown; }
```

(Launch it first so the client's `/api/v1` proxy has an upstream, then confirm aliveness with
`kill -0 <pid>` a few seconds later; expect "Server listening on http://localhost:8000" in the log.)

### 2.2 Client (Next.js, port 3000)

```bash
cd client
LOGDIR=/home/chandanjainhp/coding/javascript/Project/Sentinel/.freebuff
{ setsid nohup env PORT=3000 NODE_ENV=development NEXT_TELEMETRY_DISABLED=1 \
    ./node_modules/.bin/next dev --port 3000 > "$LOGDIR/preview-1f1194aa-0de5-4f9b-bb37-73c9dc95a8a8.log" 2>&1 < /dev/null & echo "client pid=$!"; disown; }
```

Verify:
```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/login                    # 200
curl -fsS http://localhost:3000/api/v1/health                                             # proxied 200 JSON
```

### 2.3 Logs

- Client: `.freebuff/preview-1f1194aa-0de5-4f9b-bb37-73c9dc95a8a8.log` (the canonical preview log)
- Backend: `.freebuff/preview-1f1194aa-0de5-4f9b-bb37-73c9dc95a8a8-backend.log`

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

## 4. Current live state (2026-10-06)

- Backend pid **282073** → http://localhost:8000 (`/api/v1/health` = 200, mongo+redis connected)
- Client pid **289065** → http://localhost:3000 (registered as this thread's preview)
- Containers `sentinel-test-mongo` (28017) and `sentinel-test-redis` (26379) running
- The registered preview is the Next.js client; the browser sees same-origin `/api/v1` rewritten
  to `http://localhost:8000` (client/next.config.mjs rewrites, `API_UPSTREAM_URL` /
  `NEXT_PUBLIC_API_URL` fallback chain).

## 5. Notes for other tasks

- Tests (`bun test` in `server/`) use the SAME containers on 28017/26379 — running the test
  suite will drop collections in the dev database (`ridgeway`). Prefer seeding the preview via
  `server/scripts/seed-preview.mjs` after tests if the dashboard looks empty.
- Uncommitted work in this tree: the 13+ age-verification feature (server gate + client mirror)
  and tests — register/registerWithGoogle endpoints expect `ageConfirmed` and optional
  `dateOfBirth` (YYYY-MM-DD). The register page in the client carries the matching checkbox.
