FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npm run prisma:generate

COPY nest-cli.json tsconfig*.json ./
COPY src ./src
COPY test ./test
COPY scripts ./scripts
RUN node scripts/prepare-goods-photo-ocr-models.mjs --fetch
RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Native OCR is provisioned at image build time. Language assets are separately pinned.
RUN apk add --no-cache tesseract-ocr

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/ocr-assets ./ocr-assets
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tsconfig.scripts.json ./
COPY .env.example ./
RUN node scripts/prepare-goods-photo-ocr-models.mjs --verify

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node --enable-source-maps dist/src/main.js"]
