FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --chown=nodejs:nodejs healthcheck.js ./

USER nodejs

EXPOSE 3001

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "dist/index.js"]
