# The site as one container: build with pnpm, run Next's standalone server.
# Used by Coolify on the VPS. Secrets are never baked in: .dockerignore keeps
# every .env file out, and runtime values come from the platform. Only the
# build-time switches below are passed in as build arguments.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.0.9
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY web web
# Read while building: the splash at / and the public RPC baked into the page.
ARG COMING_SOON
ARG NEXT_PUBLIC_RPC_URL
ENV COMING_SOON=$COMING_SOON NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
RUN pnpm --filter @writ-giwa/web build

FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# curl for the health check and the scheduled settlement call.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./web/.next/static
COPY --from=build --chown=node:node /app/web/public ./web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/ping || exit 1
CMD ["node", "web/server.js"]
