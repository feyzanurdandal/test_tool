# Yapay Zeka Destekli Test Otomasyon Aracı

## Proje Ne Yapar?
Bu proje; modern yazılım geliştirme süreçlerinde Yapay Zeka Destekli Keşif (Autonomous Crawler) ve Kalite Güvence (QA / Test Otomasyonu) süreçlerini tek bir çatı altında birleştiren yeni nesil bir test altyapısıdır.

Sistem, test senaryolarını yazarken manuel kodlama veya statik locator (CSS/XPath) bağımlılıklarını tamamen ortadan kaldırır. Yapay zeka ajanları vasıtasıyla dinamik olarak sitenin arayüzünü gözlemler ve insan dilinde yazılmış test adımlarını tarayıcı üzerinde otonom olarak koşturur. Klasik loglama sistemlerinin aksine, test esnasında üretilen tüm çıktıları ve test raporlarını **DPU Base** veritabanında saklayarak web arayüzü üzerinden kronolojik bir zaman akışı halinde izlenebilir kılar.

---

## Hangi Teknolojileri Kullanır?
Sistem, birbirine entegre çalışan yüksek performanslı ve modern bir teknoloji yığını üzerine inşa edilmiştir:

- **Stagehand (Yapay Zeka Otomasyon Motoru):** Sayfadaki elementleri insan gibi gözlemleyen, otomatik anlamlandıran ve bütçe dostu LLM modelleri (`gpt-4o-mini`, `gemini-1.5-flash`) ile çalışan otonom web ajanı.
- **Playwright (TypeScript):** Modern, hızlı ve izole tarayıcı otomasyon altyapısı. Test dosyası Playwright tarafından derlenir; sunucu düz Node.js ile çalışır.
- **DPU Base:** Projelerin, test senaryolarının, kullanıcı yetkilerinin (ADMIN/PM) ve test raporlarının bulut ortamında güvenle saklandığı ana veritabanı katmanı.
- **Tailwind CSS (derlemeli):** Arayüz stilleri `styles/tailwind.css` kaynağından `public/css/app.css` dosyasına derlenir. İkonlar (lucide) sabit sürümle yerelden sunulur; sayfa hiçbir dış betik yüklemez.
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
DPU_BASE_URL=https://dpubase.dpu.edu.tr
DPU_PROJECT_CODE=test_otomasyonu
DPU_USER_EMAIL=user+test_otomasyonu@base.dpu.edu.tr

# Aşağıdaki alanlara kendi gizli anahtar/şifrelerinizi girin
DPU_API_KEY=your_dpu_api_key_here
DPU_USER_PASSWORD=your_dpu_user_password_here

# ─── BACKEND GÜVENLİK ───
JWT_SECRET=your_jwt_secret_key_here
# AES-256-GCM Şifreleme Anahtarı (Tam 32 Karakter / Hex olmalı)
#encryption key için terminalde 
#        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 
#yazıyoruz çıkan değeri buraya koyuyoruz
ENCRYPTION_KEY=encryption_key
```

## Projeyi Çalıştırma Yöntemleri
### Docker İle Çalıştırma (Production)
Dışarıya yalnızca nginx açılır (80/443). Node sunucusu (3000) dış ağa kapalıdır.
`certs/` klasöründe `fullchain.pem` ve `privkey.pem` bulunmalıdır.

```Bash
docker compose up --build -d
docker compose down
```
- Testler **arka planda (headless)** koşturulur. Panel: https://alan-adiniz

### Docker İle Yerel Geliştirme (Sertifikasız)
```Bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build node-backend
```
- Panel: http://localhost:3000 (port yalnızca bu bilgisayara açılır)

### Lokalde Çalıştırma (Canlı Tarayıcı Penceresi İle)
```Bash
npm install
npx playwright install chromium
npm run build:css      # arayüz stillerini derler (stil değiştirirken: npm run watch:css)
npm start              # veya geliştirme için: npm run dev
```
- Web Paneli: http://localhost:3000

## Testler
```Bash
npm test
```
- `unit-tests/` altında birim testleri (IP koruması, kuyruk, DPU filtreleri, oturum/CSRF, koşucu) ve
  gerçek sunucuyu sahte bir DPU Base'e karşı çalıştıran uçtan uca API testi bulunur.
- Sahte DPU, WHERE filtrelerini bilerek yok sayar; sunucunun bu durumda da doğru kayıtlarla çalıştığı doğrulanır.

## Mimari
```
server.js                 Giriş noktası: helmet/CSP, CSRF kontrolü, rotaların bağlanması
config/                   env.js (ilk yüklenir, zorunlu değişkenleri doğrular), DPU istemcisi
routes/                   auth, projects, scenarios, runs, reports, settings, users, maintenance
services/                 İş mantığı: proje/kullanıcı/ayar erişimi (kısa TTL önbellekli),
                          testRunner (çalıştırma + raporlama), jobQueue (test kuyruğu)
middleware/               Oturum (httpOnly çerez), yetki, doğrulama, hata yakalama, rate limit
utils/                    ipGuard (SSRF), translator (AI çeviri), stepGroups, şifreleme
public/js/lib/            utils (kaçış, adım grupları), api (fetch sarmalayıcı, kuyruk takibi), notify
tests/ai-security.spec.ts Playwright + Stagehand koşucusu (ağ korumalı)
unit-tests/               node:test testleri
```

### Test Çalıştırma Akışı
1. `POST /api/scenarios/run` senaryoyu kuyruğa ekler ve hemen bir iş ID'si döner (202).
2. Arayüz `GET /api/scenarios/jobs/:id` ile durumu takip eder (sırada / çalışıyor / tamamlandı).
3. Aynı anda en fazla `RUN_CONCURRENCY` test koşar (varsayılan 1). Kuyruk bellektedir; sunucu
   yeniden başlarsa bekleyen işler kaybolur, tamamlananların raporları veritabanındadır.

### Güvenlik Notları
- **Oturum:** JWT httpOnly + SameSite=Strict çerezde tutulur, JavaScript erişemez. Durum değiştiren
  her API isteği `X-Requested-With: fetch` başlığı ister (CSRF). Kullanıcı silinir veya rolü
  değişirse en geç 30 saniye içinde etkili olur.
- **SSRF:** Testin hedef URL'si her zaman veritabanındaki `hedef_url` alanından alınır ve çalıştırma
  anında yeniden denetlenir. Test sırasında tarayıcının yaptığı her istek de filtrelenir; iç ağ
  adresleri (IPv4/IPv6, gömülü IPv4 yazımları dahil) engellenir. Bilinçli istisnalar için
  `ALLOWED_PRIVATE_HOSTS` kullanılır.
- **API anahtarları:** Ayarlar ekranına maskelenmiş olarak gelir; alan değiştirilmezse mevcut
  şifreli anahtar korunur.

## Veritabanı Mimarisi (DPU Base)
Projedeki hiçbir senaryo veya rapor yerel dosya sisteminde saklanmaz. Tüm veriler DPU Base üzerindeki şu tablolarda dinamik olarak yönetilir:

- **projeler:** Proje isimlerini ve ID eşleşmelerini tutar.

- **senaryolar:** Proje bazlı senaryo adlarını, hedef URL'leri ve AI tarafından çevrilmiş Stagehand JSON adımlarını saklar.

- **raporlar:** Koşturulan testlerin başarı/başarısızlık durumlarını ve detaylı log çıktılarını saklar.

- **kullanıcılar & ayarlar:** Sistem kullanıcılarını, rol yetkilerini (ADMIN/PM/USER) ve aktif AI sağlayıcı (Gemini, OpenAI vb.) konfigürasyonlarını yönetir.

> **Not:** Tablolar arası ilişkilerin bir kısmı ID yerine isim üzerinden kuruludur
> (`kullanici_projeleri.proje_adi`, `raporlar.scenario_name`). Yeniden adlandırmalar ilgili
> tablolara yayılır; kalıcı çözüm için bu alanların ID'ye taşınması (DPU Base şema değişikliği) önerilir.
