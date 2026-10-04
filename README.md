# Yapay Zekâ Destekli Test Otomasyon Aracı

Doğal dilde yazılan UI ve güvenlik senaryolarını AI ile Playwright/Stagehand adımlarına dönüştürür, kuyruğa alır ve çalıştırır. Projeler, kullanıcılar, senaryolar, ayarlar ve raporlar DPU Base üzerinde tutulur. Oturum kayıtları yerel kalıcı oturum deposunda saklanır; test sırasında geçici dosyalar ve AI cache kullanılır.

## Teknolojiler ve gereksinimler

- Node.js **22 veya üzeri**, Express, Playwright ve Stagehand
- OpenAI / Gemini / yapılandırılmış diğer AI sağlayıcıları
- DPU Base
- Tailwind CSS 3: yerelde derlenen stiller ve yerel ikonlar
- Docker ve Docker Compose: backend + nginx

Docker kullanıyorsanız Docker Desktop'ın Linux konteynerleriyle çalışır durumda olması gerekir. Host bilgisayara Node.js kurmak Docker çalıştırması için zorunlu değildir. Docker dışı kullanımda Node.js 22+ gerekir. Git yalnızca depoyla çalışmak için gereklidir.

## Yapılandırma

Proje kökünde `.env.example` dosyasını `.env` olarak kopyalayın. Mevcut `.env` dosyanız varsa üzerine yazmayın.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```sh
cp .env.example .env
```

`.env` içindeki DPU bağlantı bilgilerini gerçek değerlerle doldurun:

```dotenv
PORT=3000
DPU_BASE_URL=https://dpubase.dpu.edu.tr
DPU_PROJECT_CODE=test_otomasyonu
DPU_USER_EMAIL=user+test_otomasyonu@base.dpu.edu.tr
DPU_API_KEY=KENDI_DPU_API_ANAHTARINIZ
DPU_USER_PASSWORD=KENDI_DPU_PAROLANIZ
JWT_SECRET=AYRI_RASTGELE_GIZLI_DEGER
ENCRYPTION_KEY=64_HEX_KARAKTERLIK_ANAHTAR
RUN_CONCURRENCY=1
MAX_QUEUED_RUNS=50
ALLOWED_PRIVATE_HOSTS=
ALLOWED_TEST_HOSTS=
ALLOWED_TEST_PORTS=80,443
NODE_ENV=production
```

Bu bloktaki anahtar/parola değerleri yer tutucudur; doğrudan kullanılamaz. `.env` dosyasını Git'e eklemeyin ve içeriğini paylaşmayın.

### JWT ve şifreleme anahtarları

Node.js kuruluysa iki komutu **ayrı ayrı** çalıştırın:

```sh
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

İlk çıktıyı `JWT_SECRET`, ikinci çıktıyı `ENCRYPTION_KEY` olarak kullanın. ENCRYPTION_KEY **32 bayt = 64 hex karakter** olmalıdır. Üretimde zayıf/örnek JWT değerleri kabul edilmez. Host'ta Node yoksa Docker ile anahtar üretebilirsiniz:

```sh
docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Mevcut şifreli AI ayarları varsa ENCRYPTION_KEY'i koruyun.** Değiştirirseniz eski ayarlar çözülemez. JWT_SECRET değişikliği mevcut oturumları geçersiz kılar.

AI anahtarları yönetici Ayarlar panelinden yönetilebilir. Docker yapılandırması OPENAI_API_KEY ve GEMINI_API_KEY ortam değişkenlerini de aktarır. Gerçek bir AI testi için seçilen sağlayıcının anahtarı/modeli geçerli olmalıdır.

## Docker ile yerel test — sertifikasız

Bu yöntem yalnızca backend'i başlatır ve portu **127.0.0.1:3000** üzerinde açar. Docker içindeki Chromium headless çalışır. nginx/TLS bu yöntemle test edilmez.

Docker Desktop'ı açın. Aynı portu kullanan `npm start` sürecini durdurun. Proje kökünde:

```powershell
docker version
docker compose version
docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d node-backend
docker compose ps
docker compose logs --tail=100 node-backend
```

Geliştirme Compose dosyası NODE_ENV değerini `development` olarak değiştirir. Panel: **http://localhost:3000**.

PowerShell sağlık kontrolü:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Linux/macOS:

```sh
curl --fail http://localhost:3000/api/health
```

Beklenen sonuç `status: UP`, sunucu ve veritabanı durumları `HEALTHY`. Konteyner `Up` olmalı; sürekli `Restarting` görünmesi başlangıç hatasına işaret eder.

### İşlevsel doğrulama

1. DPU Base'de tanımlı bir hesapla giriş yapın. Otomatik varsayılan yönetici hesabı oluşturulmaz.
2. AI sağlayıcısı/modeli ve anahtarını kontrol edin.
3. Test etmeye yetkili olduğunuz bir hedef için basit UI senaryosu kaydedin; AI çevirisinin oluştuğunu doğrulayın.
4. Senaryoyu çalıştırın; kuyruğun ilerlediğini ve raporun oluştuğunu kontrol edin. Panelin açılması tek başına Chromium'un çalıştığını kanıtlamaz.
5. Güvenlik testinde beklenen engelleme mesajını tanımlayın; hedefte bu mesaj doğrulanmadan SUCCESS olmamalıdır.
6. Senaryo içe aktarma, grup açma/düzenleme ve düzenlendi göstergesini kontrol edin.
7. Çıkış, tekrar giriş ve USER hesabının başka projeye erişemediğini kontrol edin.
8. `docker compose restart node-backend` sonrasında yeniden test yapın. Kalıcı oturum deposu ve cache named volume üzerinde tutulur; bekleyen işler bellektedir ve restart sırasında kaybolur.

Yerel testi kapatmak için:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

`down -v` kullanmayın: named volume'leri ve kalıcı oturum/cache verilerini siler.

## Docker ile üretim — nginx ve HTTPS

Üretimde yalnızca nginx'in 80/443 portları yayımlanır. Backend'in 3000 portu host'a açılmaz.

Başlatmadan önce:

- DPU_BASE_URL **HTTPS** olmalıdır; DPU kimlik bilgileri ve güçlü JWT_SECRET doldurulmalıdır.
- `certs/fullchain.pem` ve `certs/privkey.pem` bulunmalıdır. Sertifika alan adınız için geçerli olmalıdır.
- `nginx.conf` içindeki **iki** `server_name localhost;` satırını gerçek alan adınızla değiştirin.
- Alan adı/DNS, güvenlik duvarı ve 80/443 erişimini sunucuya göre ayarlayın.
- Sertifika yenilemesini ayrıca kurun. Compose otomatik sertifika üretmez/yenilemez; yalnızca ACME challenge dizinini sunar.
- Yerel geliştirme konteyneri çalışıyorsa önce önceki bölümdeki `down` komutuyla kapatın.

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 node-backend nginx
docker compose exec nginx nginx -t
```

Panel: **https://alan-adiniz**. Tarayıcıda sertifika uyarısı olmamalı. `http://alan-adiniz` HTTPS'e yönlenmelidir. `docker compose ps` çıktısında backend için `3000/tcp` görülebilir; **host port eşlemesi** görünmemelidir. nginx için 80/443 eşlemeleri beklenir.

Gerçek alan adınızı yazarak kontrol edin:

```sh
curl -I http://alan-adiniz
curl --fail https://alan-adiniz/api/health
```

Windows PowerShell'de aynı kontroller için `curl` yerine `curl.exe` kullanın. HTTPS kontrolünde sertifika hatasını gizleyen `-k` kullanmayın.

Üretimde işlevsel doğrulama listesini gerçek DPU/AI bağlantılarıyla tekrar uygulayın. Konteynerin başlaması tek başına canlıya hazır olduğunun kanıtı değildir.

Kapatma ve yeniden dağıtım:

```sh
docker compose down
docker compose up --build -d
```

`.env`/Compose değişikliklerini uygulamak için `up -d` ile konteynerleri yeniden oluşturun; yalnızca `restart` yeni ortam değişkenlerini uygulamaz.

## Docker dışında yerel çalıştırma

Yerel HTTP paneli için `.env` içinde **NODE_ENV=development** kullanın. Üretim modunda oturum çerezi Secure olduğundan HTTP kullanımına uygun değildir.

```sh
npm ci
npx playwright install chromium
npm run build:css
npm start
```

Panel: **http://localhost:3000**. Docker dışında koşucu görünür tarayıcı kullanır. Sunucu geliştirme modu için `npm run dev`, CSS değişikliklerini izlemek için ayrı terminalde `npm run watch:css` kullanılabilir.

## Otomatik testler

Host üzerinde geliştirme bağımlılıkları kurulu olduğunda:

```sh
npm test
```

`unit-tests/` içinde ağ/IP, DNS pinleme, kuyruk, DPU filtreleri, parola, sonuç doğrulama, oturum/CSRF ve API regresyon testleri bulunur. API testleri ayrı sunucu süreçleri ve kontrollü sahte DPU kullanır; gerçek veritabanını değiştirmez.

Chromium ile ek kontroller:

```sh
node --test security-tests/browser-network.test.js
node security-tests/stagehand-smoke.js
```

Alternatif Chromium yolu `AUDIT_CHROMIUM_PATH` ile belirtilebilir. Stagehand smoke testi tarayıcı başlatma/proxy/navigasyonu doğrular; gerçek AI çağrısını doğrulamaz. Tam AI çalıştırması panelden gerçek sağlayıcıyla yapılmalıdır.

Bağımlılık taraması:

```sh
npm audit --omit=dev
npm audit
```

4 Ekim 2026 kontrolünde üretim taraması 0 açık, tam tarama Tailwind 3/braces derleme zincirinde 5 yüksek uyarı verdi. Docker imajı CSS derlemesinden sonra `npm prune --omit=dev` uygular. Bu sonuç tüm uygulamanın güvenli olduğu garantisi değildir. Tailwind 4 geçişi uyumluluk çalışması gerektirir; `npm audit fix --force` komutunu körlemesine çalıştırmayın.

## Mimari

| Konum | Görev |
|---|---|
| server.js | Express, güvenlik başlıkları, sağlık kontrolü ve rotalar |
| config/ | Ortam doğrulaması ve DPU istemcisi |
| routes/ | Kimlik doğrulama, projeler, senaryolar, kullanıcılar, raporlar ve ayarlar |
| services/ | İş mantığı, kalıcı oturum deposu, test koşucusu ve kuyruk |
| middleware/ | Yetki, CSRF, doğrulama, rate limit ve AI kapasitesi |
| schemas/ | Senaryo ve çalışma adımlarının doğrulaması |
| utils/ | Ağ/IP kontrolü, numeric IP proxy, AI çeviri, sonuç doğrulama ve şifreleme |
| public/ | Yerel arayüz dosyaları |
| tests/ai-security.spec.ts | Playwright/Stagehand koşucusu |
| unit-tests/, security-tests/ | Otomatik regresyonlar ve tarayıcı kontrolleri |

### Test akışı

1. POST /api/scenarios/run işi kuyruğa ekler ve 202 + iş kimliği döner.
2. Arayüz GET /api/scenarios/jobs/:id ile sonucu izler.
3. RUN_CONCURRENCY kadar iş çalışır; varsayılan 1'dir. Kaynak kullanımını ölçmeden artırmayın.
4. Rapor DPU Base'e yazılır; geçici çalışma dosyaları temizlenir.

## Güvenlik ve geçiş notları

- Oturum JWT'si httpOnly + SameSite=Strict çerezde; üretimde Secure kullanılır. Sunucu tarafındaki kalıcı kayıt ve güncel hesap bilgileri doğrulanır. Çıkış, parola/rol/kullanıcı adı değişimi ve hesap silme eski oturumları geçersiz kılar.
- Değişiklik yapan API çağrıları X-Requested-With: fetch başlığı gerektirir.
- Yeni/değiştirilen parolalar en az 12 karakter, en fazla 72 UTF-8 bayttır. Eski kısa parolalar giriş uyumluluğu için kabul edilir; canlı öncesinde güncelleyin.
- ERROR_EXPECTED senaryolarında ayırt edici beklenen engelleme metni (en az 3 karakter) zorunludur. Altyapı/AI hatası beklenen engelleme başarısı sayılmaz. Eski güvenlik senaryolarını bu alanla yeniden kaydedin.
- Hedef URL ve HTTP/HTTPS/WebSocket bağlantıları denetlenir; bağlantı kontrol edilmiş numeric IP'ye yapılır. ALLOWED_TEST_HOSTS isteğe bağlı tam host izin listesidir. ALLOWED_TEST_PORTS varsayılan 80,443'tür. ALLOWED_PRIVATE_HOSTS yalnızca açıkça yetkili iç ağ hedefleri için kullanılmalıdır.
- Docker backend salt okunur kök, yazılabilir geçici alanlar, kaynak sınırları ve kalıcı cache/session volume'leri kullanır. Eski host cache klasörü named volume'e otomatik taşınmaz.
- Oturum deposu tek sunucu içindir. Ayrı sunuculara ölçekleme ortak oturum deposu gerektirir.
- Chromium Docker'da no-sandbox ve backend ile aynı konteynerde çalışır. Ağ proxy'si tarayıcı/işletim sistemi izolasyonunun yerini tutmaz; üretim altyapısında ayrı test işçisi ve egress firewall değerlendirilmelidir.
- Yetkili hedefler dışında test çalıştırmayın. Canlı öncesinde staging, gerçek servis entegrasyonu, yük, TLS ve dış erişim kontrollerini tamamlayın.
- Ayrıntılı kod değişiklikleri GUVENLIK_DEGISIKLIKLERI.md dosyasındadır. Oradaki eski Git anahtar adayı bulgusu geri çekilmiştir: README geçmişindeki değer **örnek yer tutucudur**, gerçek anahtar olduğuna dair bulgu yoktur.

## DPU Base tabloları

- projeler: proje adları ve kimlikleri
- senaryolar: hedef URL, Türkçe talimatlar ve çevrilmiş adımlar
- raporlar: test durumu ve loglar
- kullanicilar, kullanici_projeleri: hesaplar ve proje yetkileri
- ayarlar: AI sağlayıcı/model bilgileri ve şifreli API anahtarları

Bazı ilişkiler kimlik yerine isim kullanır (ör. kullanici_projeleri.proje_adi, raporlar.scenario_name). Yeniden adlandırmalar ilgili kayıtlara yayılır; ID ilişkilerine geçiş ayrıca DPU şema çalışması gerektirir.
