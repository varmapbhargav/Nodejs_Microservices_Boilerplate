FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci --only=production && npm cache clean --force

COPY src ./src

RUN npm run build

FROM node:18-alpine AS runtime

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
