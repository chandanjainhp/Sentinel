# Multi-stage Next.js production image (standalone output).
# Base tags verified for linux/arm64 on Docker Hub (node:20-alpine).
# Build: docker build -t sentinel-client ./client
# Target platforms: linux/arm64 (Pi 5), linux/amd64

# --- deps ---
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Do not bake a browser-facing API host (no NEXT_PUBLIC_API_URL).
# Rewrites are resolved at build time into routes-manifest — set Docker-network
# upstream here so /api/v1 → http://server:8000 (see next.config.mjs).
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    API_UPSTREAM_URL=http://server:8000

RUN npm run build

# --- runtime ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_UPSTREAM_URL=http://server:8000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "server.js"]
