# syntax=docker/dockerfile:1.7

# ---- base --------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=development
RUN apk add --no-cache libc6-compat dumb-init

# ---- deps (install all deps, cached on package manifests) --------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# ---- dev (used by docker-compose api + worker services) ----------------------
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "run", "dev"]

# ---- build (compile TS) ------------------------------------------------------
FROM base AS build
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- prod-deps (install only production deps) --------------------------------
FROM base AS prod-deps
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- prod (final runtime image) ----------------------------------------------
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init \
  && addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER app
EXPOSE 4000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
