# Arkom (claude_codeco) — Next.js 16 standalone → Railway.
# Multi-stage. O passo-chave no runner: além de standalone+static, copiamos o
# .next/server INTEIRO (traz os page_client-reference-manifest.js dos route
# groups (aluno), que o output:standalone não empacota → senão 500 em runtime).

FROM node:24-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# cache-bust: força rebuild fresco quando bumpado (evita .next cacheado stale)
ARG BUILD_REV=2026-07-11-02-consolidado
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# ---- runner ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# fix dos manifests de route group:
COPY --from=builder /app/.next/server ./.next/server
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
