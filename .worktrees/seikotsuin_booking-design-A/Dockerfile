# syntax=docker/dockerfile:1

# Stage 1 - install production dependencies
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2 - build application
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3 - production runtime image
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# Install minimal tooling used by health checks
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Copy built artifacts and production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY package.json package.json
COPY package-lock.json package-lock.json

# Ensure cache directory exists for ISR when running read-only
RUN mkdir -p .next/cache

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
