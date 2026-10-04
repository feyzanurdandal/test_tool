# Microsoft'un resmi Playwright Linux imajı (Chromium & Node.js hazır gelir)
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
ENV CHROME_PATH=/ms-playwright/chromium-1228/chrome-linux64/chrome

# Bağımlılıklar kilit dosyasına göre birebir kurulur.
# @playwright/test test koşarken, tailwindcss ise derlemede gerektiği için
# geliştirme bağımlılıkları da kurulur.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Arayüz stilleri derlenir (Tailwind CDN artık kullanılmıyor)
RUN npm run build:css

RUN npm prune --omit=dev --no-audit --no-fund

RUN mkdir -p /app/cache/ai-security /app/runtime /app/sessions && chown -R pwuser:pwuser /app

ENV DOCKER_ENV=true
ENV NODE_ENV=production
ENV PORT=3000

USER pwuser

EXPOSE 3000

CMD ["node", "server.js"]
