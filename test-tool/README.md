# Yapay Zeka Destekli Test Otomasyon Aracı

## Proje Ne Yapar?
Bu araç, doğal dille yazılan UI ve güvenlik senaryolarını Playwright ile çalıştırır.
AI çevirisi hedefi, bölümü ve konumu yapılandırılmış adımlara dönüştürür. Koşucu görünür
kontrolleri bulur; belirsiz hedeflerde Stagehand.observe önerisini gerçek adaylarla doğrular.
Senaryolar ve sonuç logları DPU Base’de saklanır. Hata tanısı kısa süreli ve şifreli tutulur.
İş sonucunu kanıtlamak için senaryoya açık beklenen sonuç doğrulaması eklenmelidir.

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
- **Lokalde çalıştıracaksanız:** **Node.js** (v22 veya üzeri; önerilen v24 LTS) ve **Git** gereklidir.

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
# AES-256-GCM: 32 byte = 64 hex karakter. JWT için ayrı rastgele anahtar üretin.
#encryption key için terminalde 
#        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 
#yazıyoruz çıkan değeri buraya koyuyoruz
ENCRYPTION_KEY=encryption_key
```

## Projeyi Çalıştırma Yöntemleri
### Docker İle Çalıştırma (Production)
`.env` içinde güçlü ve ayrı JWT_SECRET / ENCRYPTION_KEY ile gerçek DPU bilgilerini tanımlayın.
Production, zayıf JWT veya HTTPS olmayan DPU_BASE_URL ile başlamaz.
Dışarıya yalnızca nginx açılır (80/443). Node sunucusu (3000) dış ağa kapalıdır.
`certs/` klasöründe `fullchain.pem` ve `privkey.pem` bulunmalıdır. `nginx.conf` içindeki alan adı ve sertifika yollarını kendi kurulumunuza göre ayarlayın.

```Bash
docker compose up --build -d
docker compose logs --tail=100 node-backend
docker compose down
```
- Testler **arka planda (headless)** koşturulur. Panel: https://alan-adiniz

### Docker İle Yerel Geliştirme (Sertifikasız)
```Bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build node-backend
```
- Panel: http://localhost:3000 (port yalnızca bu bilgisayara açılır)

### Lokalde Çalıştırma (Canlı Tarayıcı Penceresi İle)
`.env` içinde `NODE_ENV=development`, `DOCKER_ENV=false`, `HEADLESS=false` kullanın.
PowerShell’de örnek dosyayı kopyalamak için `Copy-Item .env.example .env` çalıştırabilirsiniz.
JWT_SECRET ve ENCRYPTION_KEY zorunludur; örnek yer tutucuları gerçek değerlerle değiştirin.
JWT için de ayrı olmak üzere şu komutu iki kez çalıştırın:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Mevcut kurulumda ENCRYPTION_KEY’i koruyun: değiştirmek saklanan API anahtarlarını ve tanı kayıtlarını okunamaz yapar.

```Bash
npm ci
npx playwright install chromium
npm run build:css      # arayüz stillerini derler (stil değiştirirken: npm run watch:css)
npm start              # veya geliştirme için: npm run dev
```
- Web Paneli: http://localhost:3000

## Senaryo hedef seçimi ve doğrulama
Çeviri, talimattaki bölüm/pencere adını ve konumu `scope` / `position` alanlarında korur.
Önce görünür ve kullanılabilir kontrollerin erişilebilir adları/etiketleri eşleştirilir.
Simgeler ve boşluklar normalleştirilir; tam eşleşme yoksa bütün kelime içeren adlar değerlendirilir.
Aktif pencere, son açılan liste, belirtilen bölüm ve konum adayları daraltır.
Birden fazla aday kalırsa veya ad eşleşmesi bulunamazsa Stagehand.observe hedef önerir.
Öneri yalnızca gerçek adaylardan birine karşılık geliyorsa kabul edilir; AI bu aşamada işlem yapmaz.
Sayfa yeniden render edilip seçilen düğüm kaldırılırsa başka düğüme kaymadan test durur.

Açılır liste açma/seçme ayrı işlemlerdir. Yazılan değer ve seçilen seçenek kontrol edilir.
Kaydet gibi işlemler bir kez yapılır. Son mesajı döndürmek iş sonucunu kanıtlamaz.
Örneğin son adıma **“Kaydedildi mesajının görünür olduğunu doğrula”** ekleyin:

```json
{"type":"assert","instruction":"Verify saved message","expect":{"kind":"visible","target":"Kaydedildi"}}
```

Desteklenen açık doğrulamalar: visible, hidden, text, value, selected ve tam URL eşitliği.
Eski çevrilmiş adımların desteklenen kalıpları okunur; bağlam alanlarının eklenmesi için
senaryoyu düzenleyip yeniden kaydedin. Desteklenmeyen serbest işlemler, yanlış yere tıklanmasını
önlemek için durdurulur; çeviriyi yenileyin. iframe ve Shadow DOM için bu sürümde özel çözüm yoktur.

## Hata tanısı
Hata oluşan adımda URL (query/hash hariç), hedef, bölüm, aday özeti ve maskelenmiş ekran görüntüsü alınır.
Rapor detayındaki **“Hata tanısını ve ekran görüntüsünü göster”** düğmesinden açılır.
Tanı kaydı, raporun projesine erişimi olan oturumlara ve ADMIN’e açıktır; genel dosya URL’si yoktur.
Kayıtlar AES-256-GCM ile şifrelenir; 24 saat sonunda erişilemez. Saatlik temizlik ve kayıt alma
sırasında fiziksel silme yapılır. En fazla 100 kayıt / toplam 100 MiB tutulur; eski kayıtlar erken silinebilir.
Yerelde `diagnostics/`, Docker’da `test-diagnostics` volume kullanılır. İsterseniz `DIAGNOSTIC_DIR` belirleyin.
Giriş alanları ekran görüntüsünde maskelenir; sayfanın diğer içerikleri hassas olabilir.
Bu nedenle tanı yetkisi ve kısa saklama süresi uygulanır. Standart video/trace/screenshot çıktıları kapalıdır.
Koşucudaki yazılan değerler loglarda maskelenir; ham AI yanıtları loglanmaz.

## Testler
```Bash
npm test
npm run test:ui        # gerçek Chromium üzerinde kontrollü UI regresyonları
npm run test:network   # HTTP/WS ağ koruması
npm run test:runner    # gerçek Playwright/Stagehand süreci, yerel sahte hedef/DPU
```
- Tarayıcı testleri için önce `npx playwright install chromium` gerekir. İsteğe bağlı `CHROME_PATH` özel Chromium yoludur.
- Testler gerçek DPÜ sitesinde kayıt oluşturmaz, gerçek AI çağrısı yapmaz.
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
  değişirse eski oturumlar iptal edilir. Oturum kayıtları kalıcıdır; çıkış sunucuda da oturumu iptal eder.
- **SSRF:** Testin hedef URL'si her zaman veritabanındaki `hedef_url` alanından alınır ve çalıştırma
  anında yeniden denetlenir. Test sırasında tarayıcının yaptığı her istek de filtrelenir; iç ağ
  adresleri (IPv4/IPv6, gömülü IPv4 yazımları dahil) engellenir. Bilinçli istisnalar için
  `ALLOWED_PRIVATE_HOSTS` kullanılır.
- **API anahtarları:** Ayarlar ekranına maskelenmiş olarak gelir; alan değiştirilmezse mevcut
  şifreli anahtar korunur.

## Veritabanı Mimarisi (DPU Base)
Senaryolar ve rapor logları DPU Base üzerindeki tablolarda saklanır. Çalıştırma sırasında geçici adım dosyaları oluşturulup silinir. Hata tanısı, 24 saat erişilebilir olacak şekilde yerelde şifrelenir; Docker’da ayrı kalıcı volume kullanılır:

- **projeler:** Proje isimlerini ve ID eşleşmelerini tutar.

- **senaryolar:** Proje bazlı senaryo adlarını, hedef URL'leri ve AI tarafından çevrilmiş Stagehand JSON adımlarını saklar.

- **raporlar:** Koşturulan testlerin başarı/başarısızlık durumlarını ve detaylı log çıktılarını saklar.

- **kullanıcılar & ayarlar:** Sistem kullanıcılarını, rol yetkilerini (ADMIN/PM/USER) ve aktif AI sağlayıcı (Gemini, OpenAI vb.) konfigürasyonlarını yönetir.

> **Not:** Tablolar arası ilişkilerin bir kısmı ID yerine isim üzerinden kuruludur
> (`kullanici_projeleri.proje_adi`, `raporlar.scenario_name`). Yeniden adlandırmalar ilgili
> tablolara yayılır; kalıcı çözüm için bu alanların ID'ye taşınması (DPU Base şema değişikliği) önerilir.
