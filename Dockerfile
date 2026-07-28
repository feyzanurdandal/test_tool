# Microsoft'un resmi Playwright Linux imajı
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
ENV CHROME_PATH=/ms-playwright/chromium-1228/chrome-linux64/chrome

# Bağımlılık dosyalarını kopyala ve yükle
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Tüm proje kodlarını konteynere kopyala
COPY . .

# Cache klasörünün varlığından emin ol ve yetkileri pwuser kullanıcısına ver
RUN mkdir -p /app/cache && touch /app/database.sqlite && chown -R pwuser:pwuser /app

ENV DOCKER_ENV=true
ENV PORT=3000

USER pwuser

EXPOSE 3000

# Express sunucumuzu başlatıyoruz
CMD ["npm", "start"]