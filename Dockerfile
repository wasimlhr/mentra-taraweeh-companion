FROM oven/bun:1.3

WORKDIR /app

# Ignore root postinstall (needs full backend tree).
COPY package.json bun.lock ./
COPY backend/package.json backend/package-lock.json ./backend/
RUN bun install --frozen-lockfile --ignore-scripts
# oven/bun has no npm — use bun for backend deps too
RUN cd backend && bun install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["bun", "src/index.ts"]
