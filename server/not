FROM oven/bun:1.2.20-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies using bun
RUN bun install --frozen-lockfile

# Copy application code
COPY src ./src

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
	CMD bun -e "fetch('http://localhost:8000/api/v1/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

# Start server with bun
CMD ["bun", "src/index.js"]
