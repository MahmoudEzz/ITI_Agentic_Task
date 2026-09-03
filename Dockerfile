FROM node:26-slim

# Native deps for OCR (tesseract.js still needs a rasterizer for scanned PDFs) and Puppeteer (PDF generation).
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    chromium \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/adapters/http/server.js"]
