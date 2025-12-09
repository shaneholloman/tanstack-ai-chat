# Build stage
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
ENV NODE_ENV=production
RUN bun run build

# Production stage
FROM oven/bun:1
WORKDIR /app

ENV NODE_ENV=production

# Copy built app and dependencies (including drizzle-kit for migrations)
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/drizzle ./drizzle

# Port is configurable via environment variable
ENV PORT=3000
EXPOSE ${PORT}

# Run migrations then start server
CMD ["sh", "-c", "bun run db:push && PORT=${PORT:-3000} bun .output/server/index.mjs"]
