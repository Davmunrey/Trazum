# The web app, as one container.
#
# Built from the monorepo root because @trazum/web depends on @trazum/core by
# workspace version — the build stage installs the workspace, builds the core,
# then lets Next's `output: 'standalone'` trace exactly the modules the server
# imports. The runtime stage carries that trace and nothing else: no compiler,
# no dev dependencies, no sibling packages.
#
# The CLI, the gateway and `serve` are deliberately NOT in this image. They
# are loopback-only by design (a cost oracle on a network interface is an
# attack surface), and they belong on the machines where the agents run.

FROM node:22-alpine AS build
WORKDIR /repo

# Dependency manifests first, for layer caching: a source edit must not
# re-run npm ci.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/mcp/package.json packages/mcp/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages/core packages/core
COPY apps/web apps/web

# Analytics keys are NEXT_PUBLIC_* and bake into the bundle at build time.
# Empty defaults keep the build working with no analytics configured.
ARG NEXT_PUBLIC_POSTHOG_KEY=""
ARG NEXT_PUBLIC_POSTHOG_HOST=""

RUN npm run build --workspace @trazum/core \
 && npm run build --workspace @trazum/web

FROM node:22-alpine
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /repo

# The standalone trace keeps the monorepo layout: the server entry lands at
# apps/web/server.js with its own pruned node_modules beside it. Static
# assets are not traced and ride along explicitly.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
# 0.0.0.0, never localhost: Alpine's musl resolves localhost to ::1 and the
# server listens on IPv4.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://0.0.0.0:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
