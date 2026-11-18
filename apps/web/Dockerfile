# The website. Next.js builds it, then serves it.
FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root

COPY apps/web apps/web
RUN npm run build --workspace apps/web

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/web --include-workspace-root && npm cache clean --force

COPY --from=build /repo/apps/web/.next apps/web/.next
COPY apps/web/next.config.mjs apps/web/

USER node
EXPOSE 3000

WORKDIR /repo/apps/web
CMD ["npx", "next", "start"]
