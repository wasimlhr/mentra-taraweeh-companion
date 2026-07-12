FROM oven/bun:1.3

WORKDIR /app

# Root deps (Mentra SDK)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Backend deps (Quran pipeline)
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "src/index.ts"]
