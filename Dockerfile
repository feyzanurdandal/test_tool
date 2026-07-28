# Microsoft'un resmi Playwright Linux imajı (Chromium & Node.js hazır gelir)
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
ENV CHROME_PATH=/ms-playwright/chromium-1228/chrome-linux64/chrome

# Bağımlılık dosyalarını kopyala ve yükle
COPY package*.json ./
RUN npm install

# Tüm proje kodlarını konteynere kopyala
COPY . .

# Cache klasörünün varlığından emin ol
RUN mkdir -p /app/cache && chown -R node:node /app

# Docker ortam değişkenini aktifleştir

ENV DOCKER_ENV=true
ENV PORT=3000

USER node

EXPOSE 3000

# Express sunucumuzu başlatıyoruz
CMD ["npm", "start"]