# ── Build-Stage: Vite-Produktionsbuild ──────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci

COPY apps/web apps/web
RUN cd apps/web && npx vite build

# ── Runtime-Stage: nginx statisch + API-Proxy ────────────────
FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80