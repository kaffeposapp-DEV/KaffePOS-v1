FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
  && node -e "const fs=require('fs'); const s=fs.readFileSync('dist/payments/providers/duitku.provider.js','utf8'); if(!s.includes('createHash') || s.includes('createHmac') || !s.includes(\"qris: 'SP'\")) { console.error('Duitku provider build output is stale.'); process.exit(1); }"

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-8787}/health" >/dev/null || exit 1
CMD ["sh", "-c", "node scripts/run-migrations.mjs && node dist/index.js"]
