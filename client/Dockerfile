# syntax=docker/dockerfile:1.7

# ---- build (Vite static build) ----------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- prod (nginx static-serve) ----------------------------------------------
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -q -O - http://localhost/ >/dev/null 2>&1 || exit 1
