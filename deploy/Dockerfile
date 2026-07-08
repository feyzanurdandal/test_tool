# Resmi Node.js imajını kullan
FROM node:18-slim

# Uygulamanın çalışacağı klasörü oluştur
WORKDIR /app

# Bağımlılıkları kopyala ve kur
COPY package*.json ./
RUN npm install

# Proje dosyalarının tamamını kopyala
COPY . .

# Uygulamanın hangi portu kullanacağını belirt
EXPOSE 3000

# Uygulamayı başlat
CMD ["npm", "start"]