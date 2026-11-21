FROM node:24-bookworm-slim AS base

# Bootstrap HTTPS apt with Node's built-in CA roots on the slim base.
RUN node -e 'process.stdout.write(require("node:tls").rootCertificates.join("\n"))' > /tmp/debian-cas.pem \
    && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::https::CaInfo=/tmp/debian-cas.pem update \
    && apt-get -o Acquire::https::CaInfo=/tmp/debian-cas.pem install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* /tmp/debian-cas.pem \
    && npm install --global pnpm@12.16.1
WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/ apps/
COPY packages/ packages/
COPY assets/ assets/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile && pnpm build && pnpm --filter api --prod deploy /runtime/apps/api
WORKDIR /runtime/apps/api
# The deployed dependency tree has a separate Prisma client.
RUN node node_modules/prisma/build/index.js generate \
    && node --input-type=module -e 'import sharp from "sharp"; await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).webp().toBuffer()'

FROM base AS runtime

ENV NODE_ENV=production PORT=3000
COPY --from=build /runtime/apps/api /app/apps/api
COPY --from=build /app/apps/web/dist /app/apps/web/dist
COPY docker/start.sh docker/healthcheck.mjs /app/
WORKDIR /app/apps/api
# Keep the deployed package read-only while allowing pnpm to run its operator script.
RUN printf '\nverifyDepsBeforeRun: false\n' >> pnpm-workspace.yaml \
    && chmod 644 pnpm-workspace.yaml pnpm-lock.yaml \
    && mkdir storage && chown node:node storage
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["node", "/app/healthcheck.mjs"]
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "sh", "/app/start.sh"]
