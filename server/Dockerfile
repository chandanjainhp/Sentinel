# Multi-stage production image for Sentinel API (Bun).
# Base tags verified for linux/arm64 on Docker Hub (oven/bun:1-slim).
# Build: docker build -t sentinel-server ./server
# Target platforms: linux/arm64 (Pi 5), linux/amd64

# --- deps: install production node_modules (native bcrypt needs build tools) ---
FROM oven/bun:1-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- runtime ---
FROM oven/bun:1-slim AS runner

WORKDIR /app

RUN groupadd --system --gid 1001 sentinel \
  && useradd --system --uid 1001 --gid sentinel --home-dir /app --shell /usr/sbin/nologin sentinel

ENV NODE_ENV=production \
    PORT=8000

COPY --from=deps --chown=sentinel:sentinel /app/node_modules ./node_modules
COPY --chown=sentinel:sentinel package.json bun.lock ./
COPY --chown=sentinel:sentinel src ./src

USER sentinel

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:8000/api/v1/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["bun", "src/index.js"]
