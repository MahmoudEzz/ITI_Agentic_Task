FROM node:22-slim

# Native deps for Puppeteer (PDF generation) only — OCR rasterization is pure
# JS (pdfjs-dist + @napi-rs/canvas, see ADR-0004's amendment), no poppler/pdftoppm needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: --omit=dev skips devDependencies, but npm ci still runs
# the "prepare" lifecycle script (husky) by default, which fails with exit
# 127 since husky itself was just omitted. Git hooks have no meaning inside
# a container anyway (no .git directory here) — this was a real bug, found
# by an actual clean-clone `docker compose build` before submission, not a
# preemptive guess.
RUN npm ci --omit=dev --ignore-scripts

COPY . .

EXPOSE 3000

CMD ["node", "src/adapters/http/server.js"]
