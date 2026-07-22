# Yapay Zeka Destekli Test Otomasyon Aracı

## Proje Ne Yapar?
Bu proje; modern yazılım geliştirme süreçlerinde Yapay Zeka Destekli Keşif (Autonomous Crawler) ve Kalite Güvence (QA / Test Otomasyonu) süreçlerini tek bir çatı altında birleştiren yeni nesil bir test altyapısıdır.

Sistem, test senaryolarını yazarken manuel kodlama veya statik locator (CSS/XPath) bağımlılıklarını tamamen ortadan kaldırır. Yapay zeka ajanları vasıtasıyla dinamik olarak sitenin arayüzünü gözlemler ve insan dilinde yazılmış test adımlarını tarayıcı üzerinde otonom olarak koşturur. Klasik loglama sistemlerinin aksine, test esnasında üretilen tüm çıktıları ve test raporlarını **DPU Base** veritabanında saklayarak web arayüzü üzerinden kronolojik bir zaman akışı halinde izlenebilir kılar.

---

## Hangi Teknolojileri Kullanır?
Sistem, birbirine entegre çalışan yüksek performanslı ve modern bir teknoloji yığını üzerine inşa edilmiştir:

- **Stagehand (Yapay Zeka Otomasyon Motoru):** Sayfadaki elementleri insan gibi gözlemleyen, otomatik anlamlandıran ve bütçe dostu LLM modelleri (`gpt-4o-mini`, `gemini-1.5-flash`) ile çalışan otonom web ajanı.
- **Playwright (TypeScript):** Modern, hızlı, paralel ve izole tarayıcı otomasyon altyapısı.
- **DPU Base:** Projelerin, test senaryolarının, kullanıcı yetkilerinin (ADMIN/PM) ve test raporlarının bulut ortamında güvenle saklandığı ana veritabanı katmanı.
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
.env dosyasını açıp DPU Base bağlantı ve yetki bilgilerinizi tanımlayın (Yapay Zeka API anahtarlarınızı uygulama içi Ayarlar/Settings panelinden dinamik olarak yönetebilirsiniz):

```
PORT=3000

# ─── DPU BASE BAĞLANTI AYARLARI ───
DPU_BASE_URL=[https://dpubase.dpu.edu.tr](https://dpubase.dpu.edu.tr)
DPU_PROJECT_CODE=test_otomasyonu
DPU_USER_EMAIL=user+test_otomasyonu@base.dpu.edu.tr

# Kendi DPU Base API key ve şifrenizi girin
DPU_API_KEY=your_dpu_api_key_here
DPU_USER_PASSWORD=your_dpu_user_password_here

# ─── BACKEND GÜVENLİK ───
JWT_SECRET=your_jwt_secret_key_here
```

## Projeyi Çalıştırma Yöntemleri
### Docker İle Çalıştırma (Sıfır Kurulum & Önerilen)
Bilgisayarınıza Node.js veya npm paketleri kurmanıza gerek kalmadan, tüm bağımlılıkları konteyner içinde izole çalıştırmak için:

1. Konteynırı Ayağa Kaldırın:
```Bash
docker compose up --build
```
2. Durdurmak İstediğinizde:
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

## Veritabanı Mimarisi (DPU Base)
Projedeki hiçbir senaryo veya rapor yerel dosya sisteminde saklanmaz. Tüm veriler DPU Base üzerindeki şu tablolarda dinamik olarak yönetilir:

- **projeler:** Proje isimlerini ve ID eşleşmelerini tutar.

- **senaryolar:** Proje bazlı senaryo adlarını, hedef URL'leri ve AI tarafından çevrilmiş Stagehand JSON adımlarını saklar.

- **raporlar:** Koşturulan testlerin başarı/başarısızlık durumlarını ve detaylı log çıktılarını saklar.

- **kullanıcılar & ayarlar:** Sistem kullanıcılarını, rol yetkilerini (ADMIN/PM) ve aktif AI sağlayıcı (Gemini, OpenAI vb.) konfigürasyonlarını yönetir.
