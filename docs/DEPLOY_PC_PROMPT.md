# Prompt: Build & host Sentinel with Docker on this PC

> Copy everything below the line into an AI agent on the target machine
> (or follow it by hand). It is fully self-contained.

---

You are setting up the Sentinel project (industrial machinery monitoring:
Next.js client :3000, Bun/Express API :8000, Python ML service :9000,
MongoDB, Redis) to run with Docker on this PC. The repo's `docker-compose.yml`
was written for a Raspberry Pi 5 behind a Cloudflare tunnel: it publishes NO
host ports and always starts `cloudflared`. Follow these steps exactly.

## Step 0 — Prerequisites
Verify Docker Engine + Compose v2 work: `docker compose version`. The repo
must be cloned locally.

## Step 1 — Create the only env file: `server/.env`

```bash
cp server/.env.example server/.env
```

Fill it with exactly these variables.

**Required (compose hard-fails without them):**

- `MONGO_ROOT_USER=sentinel`
- `MONGO_ROOT_PASSWORD=` → generate: `openssl rand -hex 16`
- `MONGO_DB=sentinel`
- `REDIS_PASSWORD=` → generate: `openssl rand -hex 16`
- `CLIENT_URL=http://localhost:3000`
- `CORS_ORIGIN=http://localhost:3000`
- `CLOUDFLARE_TUNNEL_TOKEN=disabled-on-pc`
  (dummy value — compose interpolation demands the key exist even though
  cloudflared is disabled on the PC; a real token is only needed on the Pi)
- `NODE_ENV=production`
- `PORT=8000`

**Auth secrets (generate each with `openssl rand -hex 32`):**

- `ACCESS_TOKEN_SECRET=` — JWT access tokens
- `REFRESH_TOKEN_SECRET=` — JWT refresh tokens
- `WEBHOOK_SECRET=` — drone/webhook ingestion signing

Note: `MONGODB_URL` / `REDIS_URL` in the file are ignored by compose — it
computes Docker-network URLs itself.

**Optional (leave unset; stack runs on deterministic fallbacks):**

- LLM/Argus: `LLM_PROVIDER` (`anthropic | local | mistral | sarvam`) plus
  `ANTHROPIC_API_KEY`, or `SARVAM_API_KEY`/`SARVAM_MODEL`/`SARVAM_BASE_URL`,
  or for LM Studio running on this PC: `USE_LOCAL_LLM=true` and
  `OPENAI_BASE_URL=http://host.docker.internal:1234/v1` (compose already
  maps host.docker.internal). `MOCK_AI=true` for fully offline.
- Email/SMTP: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`,
  `EMAIL_FROM_EMAIL`, `EMAIL_FROM_NAME`
- Google login: `GOOGLE_CLIENT_ID`
- Misc: `LOG_LEVEL`, `MAX_SENSORS`, `ML_TIMEOUT_MS`, `SENTRY_DSN`

The client needs NO .env in Docker — compose sets `API_UPSTREAM_URL`.

## Step 2 — Create the PC override `docker-compose.pc.yml` (repo root)

```yaml
# PC override: publish the app on localhost, disable cloudflared.
# Pi/tunnel: don't use this file (or enable with --profile tunnel).
services:
  cloudflared:
    profiles: ["tunnel"]
  client:
    ports:
      - "3000:3000"
  server:
    ports:
      - "8000:8000"
```

## Step 3 — Build & start

```bash
docker compose -f docker-compose.yml -f docker-compose.pc.yml \
  --env-file server/.env up -d --build
```

## Step 4 — Verify (do not trust "up" alone)

```bash
docker compose ps                                     # services healthy
curl -sf http://localhost:8000/api/v1/health          # API
curl -sf http://localhost:9000/health                 # ML service
curl -sf -o /dev/null -w '%{http_code}\n' http://localhost:3000  # UI → 200
docker compose logs -f server | grep -i error         # clean startup
```

Then open http://localhost:3000 and register the first account.

## Troubleshooting

- ML /predict returns 503 → `./ml-service/models/` has no checkpoint
  (`generic_motor.pt` + `.meta.json`); service starts degraded by design,
  rest of the stack is unaffected.
- `env_file ... required: true` error → `server/.env` is missing.
- cloudflared crash-looping → override not applied or a real-but-invalid
  tunnel token; harmless to the app.
- Data lives in Docker volumes `mongodb_data` / `redis_data`;
  `docker compose down -v` wipes it.
- Dev without Docker for app code:
  `docker compose -f docker-compose.dev.yml up -d` (Mongo+Redis only), then
  `cd server && bun run dev` and `cd client && npm run dev`.
- The `deploy: resources:` limits target an 8 GB Pi; delete those blocks on
  a normal PC for unlimited CPU/RAM.
