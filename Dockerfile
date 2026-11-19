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
# The documentation, changelog, roadmap and brand pages are built from the
# repository's own files, so the build stage carries them and the scripts that
# turn them into pages: the documents, the changelog, the roadmap and the
# milestones file, the design document the brand page reads its voice and its
# rules from, and the scripts that read the catalogue's source, the list of
# models left unpriced on purpose and the brand files' list and typeface. They
# go no further: the runtime stage below holds only what was built.
COPY README.md CONTRIBUTING.md VERSIONING.md CHANGELOG.md ROADMAP.md DESIGN.md ./
COPY docs docs
COPY .github/milestones.json .github/
COPY scripts/build-docs-site.mjs scripts/docs-markdown.mjs scripts/build-site-pages.mjs scripts/milestones.mjs scripts/ruleset.mjs scripts/price-drift.mjs scripts/brand.mjs scripts/brand-files.mjs scripts/wordmark.mjs scripts/

# Analytics keys are NEXT_PUBLIC_* and bake into the bundle at build time.
# Empty defaults keep the build working with no analytics configured.
ARG NEXT_PUBLIC_POSTHOG_KEY=""
ARG NEXT_PUBLIC_POSTHOG_HOST=""
# Vercel Speed Insights, off unless this is exactly 1. It needs a Vercel
# deployment to do anything, so a container build leaves it empty.
ARG NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS=""

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
# `public/` is not part of the standalone trace either: the app's icons and
# the documentation's images are served from it.
COPY --from=build /repo/apps/web/public ./apps/web/public

# The base image's unprivileged `node` user, by number: the node image's own
# Dockerfile creates it as uid 1000 in group 1000. A name is resolved inside
# the image, so a runtime that must check the user is not root before it
# starts the container (Kubernetes' runAsNonRoot) can check a number and
# cannot check a name.
USER 1000:1000
EXPOSE 3000
# 0.0.0.0, never localhost: Alpine's musl resolves localhost to ::1 and the
# server listens on IPv4.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://0.0.0.0:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
