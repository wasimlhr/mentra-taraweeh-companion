FROM oven/bun:1.3

WORKDIR /app

# Install root + backend deps before copying full source.
# Ignore postinstall — it needs backend/ which isn't fully present yet.
COPY package.json bun.lock ./
COPY backend/package.json backend/package-lock.json ./backend/
RUN bun install --frozen-lockfile --ignore-scripts
RUN cd backend && npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "src/index.ts"]
