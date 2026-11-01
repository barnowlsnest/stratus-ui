# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-alpine AS deps
# ts-stratus is a git dependency; npm needs git to fetch it and then runs its
# `prepare` script (tsc) to build dist/.
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The console has no authentication: publish it on loopback only (-p 127.0.0.1:3000:3000).
# Saved connections live in /app/.data; mount a volume there to keep them.
RUN mkdir .data && chown node:node .data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
VOLUME /app/.data
CMD ["node", "server.js"]
