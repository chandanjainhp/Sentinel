#!/usr/bin/env bash
# Start the full Sentinel preview stack after a reboot / Freebuff restart.
#   bash scripts/start-preview.sh
#
# Services (all detached with setsid, logs in /tmp):
#   - sentinel-test containers (mongo :28017, redis :26379)
#   - ml-service  :9000  (FastAPI + generic_motor model)
#   - API server  :8000  (DB: sentinel_preview, Redis index 8)
#   - Next client :3000  (preview tab)
#
# Demo login: ops.demo@sentinel.local / Sentinel#Demo2026
# Top up fresh sensor readings any time: bun scripts/seed-preview.mjs

set -u
cd "$(dirname "$0")/.."

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
start() { printf '  \033[36m…\033[0m %s\n' "$1"; }

# 1. Test containers
if ! docker ps --format '{{.Names}}' | grep -qx sentinel-test-mongo; then
  start "starting sentinel-test containers"
  docker start sentinel-test-mongo sentinel-test-redis >/dev/null 2>&1 || true
  sleep 4
fi
docker ps --format '{{.Names}}' | grep -qx sentinel-test-mongo \
  && ok "mongo :28017" || warn "mongo :28017 NOT running"
docker ps --format '{{.Names}}' | grep -qx sentinel-test-redis \
  && ok "redis :26379" || warn "redis :26379 NOT running"

# 2. ml-service :9000
if ! curl -sf -m 3 http://localhost:9000/health >/dev/null 2>&1; then
  start "starting ml-service :9000"
  (cd ml-service && setsid .venv/bin/python -m app > /tmp/preview-ml.log 2>&1 < /dev/null &)
  for _ in $(seq 1 30); do
    curl -sf -m 2 http://localhost:9000/health >/dev/null 2>&1 && break
    sleep 1
  done
fi
curl -sf -m 3 http://localhost:9000/health >/dev/null 2>&1 \
  && ok "ml-service :9000" || warn "ml-service :9000 NOT healthy (see /tmp/preview-ml.log)"

# 3. API server :8000
if ! curl -sf -m 3 http://localhost:8000/api/v1/health >/dev/null 2>&1; then
  start "starting API server :8000"
  setsid env PORT=8000 \
    MONGODB_URL="mongodb://sentinel:sentinel-test@localhost:28017/sentinel_preview?authSource=admin" \
    REDIS_URL="redis://localhost:26379/8" \
    ML_SERVICE_URL="http://localhost:9000" \
    bun server/src/index.js > /tmp/preview-server.log 2>&1 < /dev/null &
  for _ in $(seq 1 20); do
    curl -sf -m 2 http://localhost:8000/api/v1/health >/dev/null 2>&1 && break
    sleep 1
  done
fi
curl -sf -m 3 http://localhost:8000/api/v1/health >/dev/null 2>&1 \
  && ok "API server :8000 (sentinel_preview DB, redis /8)" \
  || warn "API server :8000 NOT healthy (see /tmp/preview-server.log)"

# 4. Next client :3000
if ! curl -sf -m 5 http://localhost:3000 >/dev/null 2>&1; then
  start "starting Next client :3000"
  (cd client && setsid bun run dev > /tmp/preview-client.log 2>&1 < /dev/null &)
  for _ in $(seq 1 30); do
    curl -sf -m 2 http://localhost:3000 >/dev/null 2>&1 && break
    sleep 1
  done
fi
curl -sf -m 5 http://localhost:3000 >/dev/null 2>&1 \
  && ok "Next client :3000" || warn "Next client :3000 NOT up (see /tmp/preview-client.log)"

echo
echo "Preview ready → http://localhost:3000  (login: ops.demo@sentinel.local / Sentinel#Demo2026)"
