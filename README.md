# Yapay Zeka Destekli Test Otomasyon Aracı

## Proje Ne Yapar?
Bu proje; modern yazılım geliştirme süreçlerinde Yapay Zeka Destekli Keşif (Autonomous Crawler) ve Kalite Güvence (QA / Test Otomasyonu) süreçlerini tek bir çatı altında birleştiren yeni nesil bir test altyapısıdır.

Sistem, test senaryolarını yazarken manuel kodlama veya statik locator (CSS/XPath) bağımlılıklarını tamamen ortadan kaldırır. Yapay zeka ajanları vasıtasıyla dinamik olarak sitenin arayüzünü gözlemler ve insan dilinde yazılmış test adımlarını tarayıcı üzerinde otonom olarak koşturur. Test esnasında üretilen tüm çıktıları ve test raporlarını veritabanında saklayarak web arayüzü üzerinden kronolojik bir zaman akışı halinde izlenebilir kılar.

---

## Hangi Teknolojileri Kullanır?
Sistem, birbirine entegre çalışan yüksek performanslı ve modern bir teknoloji yığını üzerine inşa edilmiştir:

- **Stagehand (Yapay Zeka Otomasyon Motoru):** Sayfadaki elementleri insan gibi gözlemleyen, otomatik anlamlandıran ve bütçe dostu LLM modelleri (`gpt-4o-mini`, `gemini-1.5-flash`) ile çalışan otonom web ajanı.
- **Playwright (TypeScript):** Modern, hızlı, paralel ve izole tarayıcı otomasyon altyapısı.
- **SQLlite:** Projelerin, test senaryolarının, kullanıcı yetkilerinin (ADMIN/PM) ve test raporlarının saklandığı ana veritabanı katmanı.
- **TSX (TypeScript Execute):** TypeScript dosyalarının runtime üzerinde derlenmeden, havada anlık olarak çözümlenip koşturulmasını sağlayan modern motor altyapısı.
- **Express.js:** Rol bazlı yetkilendirme, test tetiklemeleri ve raporlama süreçlerini yöneten modüler backend katmanı.
- **Docker & Docker Compose:** Tüm uygulamanın bağımlılıklarıyla birlikte izole konteyner ortamında ayağa kaldırılmasını sağlayan kapsülleme yapısı.

---

## Ön Gereksinimler
- **Docker ile çalıştıracaksanız:** Sadece **Docker Desktop** kurulu olması yeterlidir.
- **Lokalde çalıştıracaksanız:** **Node.js** (v20+) ve **Git** gereklidir.

---

## Konfigürasyon (.env)

Projenin çalışabilmesi için kök dizindeki `.env.example` dosyasının bir kopyasını alarak `.env` adıyla oluşturun:

```bash
cp .env.example .env
```
.env dosyasını açıp bilgilerinizi tanımlayın (Yapay Zeka API anahtarlarınızı uygulama içi Ayarlar/Settings panelinden dinamik olarak yönetebilirsiniz):

```
PORT=3000
NODE_ENV=production
# ─── BACKEND GÜVENLİK ───
JWT_SECRET=your_jwt_secret_key_here
# AES-256-GCM Şifreleme Anahtarı (Tam 32 Karakter / Hex olmalı)
#encryption key için terminalde 
#        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 
#yazıyoruz çıkan değeri buraya koyuyoruz
ENCRYPTION_KEY=encryption_key
```

## Projeyi Çalıştırma Yöntemleri
### Docker İle Çalıştırma (Sıfır Kurulum & Önerilen)
Bilgisayarınıza Node.js veya npm paketleri kurmanıza gerek kalmadan, tüm bağımlılıkları konteyner içinde izole çalıştırmak için:

1. Konteynırı Ayağa Kaldırın:
```Bash
docker compose up --build -d
```
2. **docker ps** ile kontrol ettiğinizde şöyle görünmeli:
```Bash
PS C:\test-tool> docker ps
CONTAINER ID   IMAGE                    COMMAND                  CREATED          STATUS          PORTS                                       NAMES
d6b3ecfe215e   nginx:alpine             "/docker-entrypoint.…"   35 seconds ago   Up 35 seconds   0.0.0.0:80->80/tcp, [::]:80->80/tcp         test_tool_nginx
f2bb8c968c4d   test-tool-node-backend   "npm start"              35 seconds ago   Up 35 seconds   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp test_tool_backend
PS C:\test-tool>
```
3. Admin için veritabanında kullanıcı oluşturun:
```Bash
docker exec -it test_tool_backend npx tsx createAdmin.js [kullanıcı_adı] [şifre]
```
4. Durdurmak İstediğinizde:
```Bash
docker compose down
```
- Docker ortamında npm install ve playwright sürücüleri otomatik konteyner içine kurulur. Testler **arka planda (headless)** koşturulur. Web paneline http://localhost:3000 adresinden erişebilirsiniz.

### Lokalde Çalıştırma (Canlı Tarayıcı Penceresi İle)
Kendi bilgisayarınızda geliştirme yaparken ve test adımlarını **canlı Chromium penceresinde** izlemek istediğinizde:

1. Bağımlılıkları ve Tarayıcı Motorlarını Kurun:

```Bash
npm install
npx playwright install
```
2. Sunucuyu Başlatın:

```Bash
npx tsx server.js
```
- Web Paneli: http://localhost:3000

