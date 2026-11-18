# The API, built once and run from the compiled output.
#
# Two stages on purpose: the first needs the TypeScript sources, the compiler
# and every development package; the second needs none of them. What ships is
# the compiled JavaScript, the runtime packages and the SQL schema the server
# applies at start-up.
FROM node:22-alpine AS build
WORKDIR /repo

# Only the manifests first, so a change to the source does not throw away the
# cached install of the packages.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --include-workspace-root

COPY apps/api apps/api
RUN npm run build --workspace apps/api

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root && npm cache clean --force

COPY --from=build /repo/apps/api/dist apps/api/dist
# Read at start-up: the server applies the schema itself, so it has to travel with it.
COPY apps/api/sql apps/api/sql

# Not root: a process that is broken into should not own the filesystem it runs on.
USER node
EXPOSE 3001

# The container is unhealthy when the database is unreachable, not merely when
# the process has died: an API that cannot read anything is of no use in a pool.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /repo/apps/api
CMD ["node", "dist/main.js"]
