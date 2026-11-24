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
RUN_CONCURRENCY=2
MAX_QUEUED_RUNS=200
MAX_QUEUED_PER_USER=50
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
3. RUN_CONCURRENCY kadar iş aynı anda çalışır; varsayılan 2'dir. Sıra kullanıcılar arasında adil dağıtılır (aşağıdaki "Kapasite" bölümüne bakın).
4. Rapor DPU Base'e yazılır; geçici çalışma dosyaları temizlenir.

## Güvenlik ve geçiş notları

- Oturum JWT'si httpOnly + SameSite=Strict çerezde; üretimde Secure kullanılır. Sunucu tarafındaki kalıcı kayıt ve güncel hesap bilgileri doğrulanır. Çıkış, parola/rol/kullanıcı adı değişimi ve hesap silme eski oturumları geçersiz kılar.
- Değişiklik yapan API çağrıları X-Requested-With: fetch başlığı gerektirir.
- Yeni/değiştirilen parolalar en az 12 karakter, en fazla 72 UTF-8 bayttır. Eski kısa parolalar giriş uyumluluğu için kabul edilir; canlı öncesinde güncelleyin.
- ERROR_EXPECTED senaryolarında ayırt edici beklenen engelleme metni (en az 3 karakter) zorunludur. Altyapı/AI hatası beklenen engelleme başarısı sayılmaz. Eski güvenlik senaryolarını bu alanla yeniden kaydedin.
- Hedef URL ve HTTP/HTTPS/WebSocket bağlantıları denetlenir; bağlantı kontrol edilmiş numeric IP'ye yapılır. **Test hedefleri yalnızca yöneticinin Ayarlar > "Test İzinli Adresler" listesine eklediği adresler olabilir** (liste boşsa hiçbir hedef kabul edilmez). ALLOWED_TEST_HOSTS/ALLOWED_PRIVATE_HOSTS ortam değişkenleri bu listeye EK olarak eklenir. ALLOWED_TEST_PORTS varsayılan 80,443'tür. İç ağ (özel IP) adreslerine yalnızca listede "iç-ağ" işaretli host'lar çözülebilir; loopback ve bulut metadata (169.254.x.x) adresleri hiçbir koşulda açılmaz.
- Test süreci ve Chromium'a JWT_SECRET, ENCRYPTION_KEY, DPU ve AI anahtarları geçirilmez; AI ayarları ana süreçte çözülüp yalnızca o koşunun geçici dosyasıyla (0600) verilir. Rapor loglarındaki şifre benzeri değerler kaydedilmeden maskelenir.
- Docker backend salt okunur kök, yazılabilir geçici alanlar, kaynak sınırları, healthcheck, log rotasyonu ve kalıcı cache/session volume'leri kullanır. Eski host cache klasörü named volume'e otomatik taşınmaz.
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


## JSON form adımları ve değişken test verisi

Senaryo ekranındaki **JSON’dan Adım Oluştur** ve **Değişecek Değerleri Seç** düğmeleri ile bu özellikleri kullanabilirsiniz. Ayrıntılı kullanım, sayaç yedekleme, seçim yöntemleri ve sınırlar için [JSON_VERI_DEGISIKLIKLERI.md](JSON_VERI_DEGISIKLIKLERI.md) dosyasını okuyun.


## Tarayıcıdan senaryo kaydı ve canlı izleme

Bu sürümde görüntü, mevcut panel bağlantısından yaklaşık saniyede bir alınır.
noVNC, VNC portu, sanal masaüstü veya WebSocket reverse proxy ayarı gerekmez.
Docker'da tarayıcı headless çalışır; gerçek sayfa görüntüsü panelde gösterilir ve
paneldeki tıklama/klavye komutları Playwright üzerinden bu tarayıcıya iletilir.
Bu, akıcı masaüstü videosu değildir. Yeni npm bağımlılığı eklenmedi.

### Local kullanım

1. Proje kökünde `.env` dosyanızı koruyun. Bu pakete gerçek ayarlar dahil edilmez.
2. İlk kurulumda `npm ci`, ardından `npx playwright install chromium` çalıştırın.
3. `npm start` ile başlatın. Tarayıcıda Ctrl+F5 yapın.
4. Proje seçip Yeni Senaryo ekranında hedef URL girin ve **Tarayıcıdan Kaydet** seçin.
5. Açılan sağ panelde görüntüye tıklayıp klavyenizle yazın. Yapılan işlemler sağ panelin
   altındaki kayıt listesinde görünür. Türkçe karakterler veya çok uzun metin için
   seçili alan aracını kullanabilirsiniz. Tarih/maskeli alanlarda klavye yöntemi korunur.
6. Native HTML select için önce görüntüde kutuya tıklayın; sonra panelde görünen
   seçenek listesinden seçim yapın. Özel web listelerinde görüntüdeki seçeneğe tıklayın.
7. Görünmesi gereken sonuç mesajını yazıp **Metni Doğrula ve Ekle** kullanabilirsiniz.
   Kayıt sırasında bu metnin gerçekten görünmesi kontrol edilir; sonraki koşuda da
   görünmesi zorunludur. Değişken isim içeren mesajlarda sabit mesaj bölümünü kullanın.
8. **Kaydı Bitir ve Adımları Ekle**: tarayıcı kapanır, kaydedilmiş adımlar senaryoya
   eklenir. **Kaydı İptal Et**: kayıt senaryoya eklenmeden oturum kapatılır.
9. **Veri Ayarları** ile form değerlerini, yazma yöntemini ve değişim kurallarını
   düzenleyin; ardından senaryoyu kaydedin. Şifreler önizlemede maskelenir ve sabittir.

Kaydedilmiş adımlar marker+metadata olarak mevcut `adimlar_tr` ve `adimlar` alanlarına
yazılır; DPU Base tablo değişikliği gerekmez. Saf kayıt senaryosu AI çevirisine girmez.
Doğal dil adımlarıyla karışık senaryolarda yalnızca doğal dil kısımları çevrilir.
Mevcut koşucu başlangıcında AI sağlayıcı ayarlarını yine okur; kayıt özelliği kendi
başına AI çağrısı yapmaz. Hedef bozulursa rastgele tıklama/AI tekrar denemesi yapılmaz.

### Çalışan testi izleme

Senaryo listesinin üstünde **Testi canlı izle (tekil koşu)** seçimini açıp normal
Çalıştır düğmesini kullanın. Kuyruktayken bekleme mesajı, çalışırken tarayıcı görüntüsü
görünür. Görüntü salt okunurdur. Görüntüyü kapatmak testi durdurmaz. Toplu koşular
bu ilk sürümde canlı ekran açmaz. Son görüntü test sonuna kadar gösterilir ve geçici
dosyalar tamamlandıktan yaklaşık iki dakika sonra temizlenir.

### Docker

Mevcut Dockerfile/Compose kurulumu kullanılır. Chromium yolu zaten imajdaki sürümle
eşleştirilmiştir. Güncel kodla `docker compose up --build -d` gerekir. Yerel
sertifikasız Docker denemesinde README'deki dev override komutunu kullanın.

Ek dış port açmayın. Görüntü ve kontrol API'leri mevcut oturum çerezi ve proje
yetkisiyle korunur; başka kullanıcının görüntüsü ADMIN hesabına da açılmaz.
URL ve ağ istekleri mevcut SSRF proxy politikasından geçer. Local hedef gerekli ise
yalnızca ilgili host/portu mevcut izin ayarlarıyla tanımlayın. Docker'da localhost
konteynerin kendisidir; Windows'taki uygulama için uygun host adresi gerekir.

Kayıt oturumu kullanıcı başına 1, toplamda RECORD_MAX (varsayılan 2) tane açılabilir;
limit dolunca diğer kullanıcıya beklemesi söylenir. Kayıt 2 dakika bağlantısızlıkta veya 15 dakika toplam sürede
kapanır; en fazla 100 adım kaydedilir. Kayıt sırasında gerçek Kaydet/Sil işlemleri
hedef sistemde uygulanır. Kayıtlar kullanıcı kaydedene kadar yalnızca bellektedir.

Tek Node replikasıyla kullanın; çoklu replica için oturum yönlendirme ve paylaşılan
oturum yönetimi ayrıca gerekir. RUN_CONCURRENCY=1 başlangıç için önerilir.

### Destek sınırları ve doğrulama

- Tek sekmeli HTTP/HTTPS akışları, metin/tarih, checkbox/radio, native select,
  normal DOM ve iframe hedefleri desteklenir. Özel listeler tıklama olarak kaydolur.
- Yeni sekme ilk sürümde kapatılır ve uyarı gösterilir. Dosya yükleme, sürükle-bırak,
  canvas ve kapalı shadow DOM hedefleri bu sürümün kapsamı dışındadır.
- Tarayıcının alert/confirm/prompt penceresi kapatılır ve panelde uyarı gösterilir;
  bu tür akışlar kayıt üzerinden güvenilir tekrar oynatma kapsamında değildir.
- Kaydedilen hedef tek olarak belirlenemezse adım hata verir. Site DOM'u değişirse
  hedef güncellemesi veya yeniden kayıt gerekebilir. Kaydedilmiş adımın açıklaması
  salt okunurdur; form değerleri Veri Ayarları'ndan değiştirilir.
- Sonuç doğrulaması eklenmemiş senaryolarda mevcut başarı değerlendirme sınırı
  devam eder: adımların tamamlanması iş kuralının başarıyla gerçekleştiğini kanıtlamaz.
- Kontrollü test: `npm test`, `npm run test:recorder`. Sistem Chromium yolu kullanılıyorsa
  test komutuna `AUDIT_CHROMIUM_PATH` ortam değişkeni verilebilir.
- Bu teslimde gerçek DPÜ sitesi veya Docker daemon üzerinde uçtan uca test yapılmadı.

## Klasör temizliği

Eski ZIP'teki `test-tool/test-tool` ikinci proje kopyası kaldırılmıştır. Güncel dış
sürüm temel alınmıştır. Eski iç kopyadaki `.env` dosyanızı kendi bilgisayarınızda
koruyup yeni projenin köküne koyun. `node_modules`, geçici koşu dosyaları ve oturum
verileri teslim paketinde yoktur. Mevcut `run-data` veya Docker `test-run-data`
volume'ünü silmeyin; artan veri sayacınız oradadır.


## Kapasite, eşzamanlılık ve izinli adresler

### Eşzamanlı kullanıcı davranışı

| İşlem | Davranış |
|---|---|
| Gezinme, senaryo/rapor/ayar işlemleri | Eşzamanlı kullanıcı sayısıyla doğrusal ölçeklenir; yavaşlığı esas olarak DPU Base'in hızı belirler. Kimlik doğrulama için kullanıcı bilgisi 15 sn önbelleğe alınır. |
| Test çalıştırma | En fazla `RUN_CONCURRENCY` test aynı anda koşar, kalanı **adil** sırada bekler: boş slot açılınca o an en az testi koşan kullanıcının işi alınır. Kullanıcı başına en fazla `MAX_QUEUED_PER_USER` (varsayılan 50; sırada + çalışan) iş. Tek (etkileşimli) çalıştırmalar toplu işlerden önce slot alır; birden fazla kullanıcının toplu işi dönüşümlü ilerler, biri diğerini bekletmez. "Testlerim" kutusundaki "Sıradakileri iptal et" toplu işi yarıda bırakır. Sıra no ve tahmini bekleme arayüzde (sol alttaki "Testlerim" kutusu) görünür; kuyruktaki veya çalışan test iptal edilebilir. |
| Canlı izleme | Kullanıcı "Testi canlı izle" kutusunu işaretlerse kendi testinin görüntüsünü izler, işaretlemezse test arka planda çalışır. Sekme kapatılırsa test devam eder. Çok sayıda izleyici varsa kare sıklığı otomatik düşürülür. |
| Tarayıcıdan kayıt | Kullanıcı başına 1, toplamda `RECORD_MAX` oturum. |
| Senaryo kaydetme (AI çeviri) | `AI_CONCURRENCY` çeviri aynı anda çalışır, fazlası 40 sn'ye kadar **sırada bekler** (anında hata vermez). Kullanıcı başına aynı anda 1 çeviri. Dakikalık istek sayısı `AI_TRANSLATE_RPM` ile sağlayıcı kotasına göre sınırlanır; 429/503 yanıtında bir kez yeniden denenir. |

### Sunucu boyutlandırma

Her eşzamanlı test ≈ 0,7-1 GB RAM ve ≈ 0,5-1 çekirdek kullanır (Chromium + Stagehand + Playwright). Varsayılan ayar (`RUN_CONCURRENCY=2`, `APP_MEM_LIMIT=3g`, `APP_CPUS=2.0`) 2 çekirdek / 4 GB'lık küçük bir sunucuya uygundur. Büyütmek için `.env` içinde üç değeri birlikte artırın (kural: `APP_MEM_LIMIT ≈ 1 GB + RUN_CONCURRENCY × 1 GB`, `APP_CPUS ≈ RUN_CONCURRENCY`). Örnek:

| Sunucu | RUN_CONCURRENCY | APP_MEM_LIMIT | APP_CPUS |
|---|---|---|---|
| 2 çekirdek / 4 GB | 2 | 3g | 2.0 |
| 4 çekirdek / 8 GB | 4 | 6g | 4.0 |
| 8 çekirdek / 16 GB | 8 | 10g | 8.0 |

Çok sayıda kullanıcı aynı anda test başlatsa bile sistem çökmez; kapasiteyi aşan işler sırada bekler. Bekleme süresi ≈ (sıra no ÷ RUN_CONCURRENCY) × ortalama test süresidir. Tek sunucu yetmezse sonraki adım ayrı "test işçisi" konteynerleri ve paylaşımlı kuyruktur (şu an tek sunucu içindir).

### Yapay zeka sağlayıcı kotası

Sağlayıcı kotaları hesaba/katmana göre değişir; yaklaşık değerler: Gemini ücretsiz katman ≈ 10 istek/dk (günlük sınırlı), ücretli Tier 1 ≈ 1000 istek/dk; OpenAI Tier 1 ≈ 500 istek/dk (gpt-4o-mini). Kesin değerleri sağlayıcı panelinizden kontrol edin. Ücretsiz katmanda `AI_TRANSLATE_RPM=8` ve `RUN_CONCURRENCY=1-2` kullanın; her test adım başına AI çağrısı yaptığı için eşzamanlı testler dakikalık kotayı hızla doldurabilir.

### Test izinli adresler (yönetici)

Yönetici **Ayarlar > Test İzinli Adresler** bölümüne satır satır adres ekler:

```
ornek.dpu.edu.tr            # yalnızca bu host
*.dpu.edu.tr                # tüm alt alan adları (dpu.edu.tr'nin kendisi hariç)
test.dpu.edu.tr:8443        # varsayılan dışı port
intranet.dpu.edu.tr iç-ağ   # özel (RFC1918) IP'ye çözümlenmesine izin verilir
```

Bu liste dışındaki adresler senaryo kaydında, test çalıştırmada, tarayıcıdan kayıtta ve test sırasındaki sayfa yönlendirmelerinde (ana çerçeve gezintisi) reddedilir. Sayfanın alt kaynakları (CDN, font, iframe) serbesttir ama SSRF proxy'sinden geçer. **Liste boşsa hiçbir test çalışmaz**; canlıya alırken ilk işiniz hedef adresleri eklemek olmalıdır. Sayfa yönlendirme kısıtını kapatmak için `ENFORCE_NAV_ALLOWLIST=false` kullanılabilir (önerilmez).

### Güvenli kapatma ve yeniden dağıtım

`docker compose up --build -d` konteyneri `SIGTERM` ile kapatır: yeni iş alınmaz, çalışan testler en fazla `SHUTDOWN_GRACE_SECONDS` (varsayılan 90 sn) beklenir. Sırada bekleyen işler bellektedir ve yeniden başlatmada kaybolur; kullanıcı arayüzde "sunucu yeniden başlatılmış olabilir, testi tekrar başlatın" mesajını görür. Mümkünse düşük yoğunluklu saatte dağıtın.

### Sağlık uç noktaları

`/api/live` yalnızca süreç ayakta mı kontrol eder (Docker healthcheck bunu kullanır). `/api/health` DPU bağlantısını da denetler; sonuç 5 sn önbelleklenir.


### Yapay zeka adımlarının çözümü (çerçeveden bağımsız)

Doğal dille yazılan her adım (`act`) şu sırayla çözülür; hiçbir arayüz kütüphanesine (PrimeNG, MUI, Ant...) özel kural kullanılmaz, yalnızca web standartlarına (ARIA rolleri, etiketler, görünürlük) dayanılır:

1. **Seçici önbelleği:** önceki başarılı koşuda bulunan eleman aynı sayfada hâlâ varsa ve parmak izi (etiket, tür, ad, metin) uyuyorsa yapay zekaya hiç gidilmez (hızlı ve kota harcamaz). Sayfa değişmişse önbellek geçersiz sayılır ve yenilenir. Yalnızca seçici ve parmak izi saklanır, **yazılan değerler saklanmaz**. Dosyalar `cache/selectors/` altındadır; adımlar düzenlenince yeni anahtar kullanılır; 30 günden eski dosyalar silinir; `SELECTOR_CACHE=off` ile kapatılır, "Önbelleği Temizle" düğmesi de siler.
2. **Yapay zeka + geri bildirimli yeniden deneme:** seçilen eleman sayfada çözümlenemezse veya eylemin hiçbir etkisi olmadıysa (alan boş kaldı, onay kutusu değişmedi) model nedenini söyleyen bir düzeltmeyle en çok 3 kez yeniden sorulur.
3. **Anlamsal yedek (yapay zekasız):** yapay zeka sonuç vermezse (veya kota/ağ hatası olursa) talimattaki tırnak içi metin, rol/etiket/yer tutucu/satır metniyle Playwright'ın standart yöntemleriyle çözülür. Tam olarak **1 görünür eşleşme** yoksa tahmin edilmez, adım hata verir.

Önbelleğe yalnızca **testin tamamı başarılı bitince** yazılır; başarısız bir koşunun (ör. giriş olmadığı için yanlış sayfada yapılan) tıklamaları kalıcı olmaz.

Güvenlik önlemleri: (a) tıklama/seçme adımında modelin seçtiği elemanın görünen adı adımdaki etiketle hiç örtüşmüyorsa (ör. "devam et" için "Giriş Yap" düğmesi) **tıklanmaz**; alan, açılır liste ve onay kutusu adımlarında denetim uygulanmaz (etiketleri elemanın kendi metni değildir). (b) Model "eleman yok" derse (sayfa beklenen durumda olmayabilir) zorlanmaz; iki kez üst üste boş cevap gelirse üçüncü çağrı harcanmadan anlamsal yedeğe geçilir. (c) Tıklama sonrası ekranda görünen uyarı/durum metinleri loga `[BİLGİ] adım N sonrası ekranda görünen uyarı/durum: "..."` olarak yazılır (ör. "hesap bilgileri yanlış"). Bu metinler proje "hata anahtar kelimeleri" taramasına girer. (d) Adım başarısız olunca `[TEŞHİS]` satırları sayfa adresini (sorgusuz), başlığı, ekrandaki uyarıları ve geçersiz/zorunlu alanları yazar.

**Önemli:** sonucu doğrulayan bir adım (ör. "Tarayıcıdan Kaydet" ile eklenen "Metni Doğrula" veya giriş sonrası görünen bir metnin kontrolü) olmayan senaryo, adımların hepsi tamamlanınca başarılı sayılır; giriş başarısız olsa bile. Senaryolarınızın sonuna mutlaka bir doğrulama adımı ekleyin.

**Süre ve gecikme yönetimi:** bir testin süre sınırı adım sayısına göre otomatik ayarlanır: `max(5 dk, 90 sn + 30 sn × adım)`, en çok 30 dk (`RUN_TIMEOUT_SECONDS` ile sabitlenebilir). Tek bir yapay zeka çağrısı `AI_CALL_TIMEOUT_SECONDS` (varsayılan 25 sn) içinde yanıt vermezse aynı soru yeniden sorulur (deneme hakkından yemez, en çok 2 ek hak). Her adımın logunda toplam süre ve yapay zekayı bekleme süresi, test sonunda `[SÜRE]` özeti yazılır. Ekran uyarıları yalnızca gerçek uyarı rollerinden (`role=alert`, `alertdialog`) alınır ve aynı uyarı tekrarlanmaz.

**Adım türü denetimi:** "yaz" adımına model "tıkla" önerirse (veya tersi) eylem uygulanmaz, düzeltmeyle yeniden sorulur; iki kez ısrar ederse yapay zekasız yedeğe geçilir. Yazılacak değer her zaman adım metnindeki tırnak içi değerdir (model uydurma/değiştirilmiş değer döndürse bile). Stagehand'in kendi "onarma" denemesi (self-heal) kapalıdır, böylece başarısız eylemde modelin uydurduğu bir değer (örn. `your_password`) yazılamaz.

**Yer/kapsam ifadeleri:** çeviri talimatı, Türkçe satırdaki konum ifadelerini ("sayfanın en üstündeki", "tablodaki satırdaki", "sol paneldeki", "X bölümündeki") İngilizce adımda KORUMAYA zorlar; aynı etiketli birden çok eleman olan sayfalarda doğru olanı seçmek için gerekir. Kural yalnızca senaryo **kaydedilirken/yeniden kaydedilirken** çeviriye uygulanır; mevcut senaryoların adımlarını yenilemek için senaryoyu düzenleyip tekrar kaydedin. Hata anında `[TEŞHİS]` satırları ekranda görünen düğme/bağlantı adlarını da yazar. Testin başında `[SÜRE] başlatma: tarayıcı açılışı X sn | ilk sayfa yüklemesi Y sn` yazılır.

Her eylemden sonra sonuç doğrulanır. Loglarda hangi yolun kullanıldığı `[ÇÖZÜM] adım N: ...` satırıyla görünür. Farklı arayüz yapılarına karşı sınama: `npm run test:resolution` (düz HTML, gizli input'lu özel onay kutusu, ARIA, belirsiz eşleşme, özel açılır liste, shadow DOM).


## Rapor durum kararı ve yapay zeka yorumu

**Durum kararı:** Başarı/başarısızlık anahtar kelime taramasında Stagehand'in kendi iç kayıt blokları (`[tarih] INFO: ...` ve altındaki girintili satırlar) ve `AI SDK Warning:` satırları **taranmaz**; çünkü kurtarılmış iç hatalar (ör. bayat eleman yolu, ikinci denemede çözülen adım) testi yanlışlıkla FAILED yapıyordu. Tam günlük yine kaydedilir. Çıkış kodu 0 olduğu halde FAILED verilirse günlüğün sonuna `[DEĞERLENDİRME]: ...` satırı eklenir (hangi anahtar kelime, temel kural mı proje anahtar kelimesi mi, hangi satır); rapor detayındaki "Hata Detayı" kartı bu satırı gösterir.

**Yapay zeka yorumu:** Her rapor kaydedildikten sonra (başarılı/başarısız) arka planda çeviri sağlayıcısına kısa bir yorum isteği gider ve yalnızca **rapor detay penceresinde**, "Hata Detayı" kartının üstünde "Yapay Zeka Yorumu" bloğu olarak görünür (Türkçe; özet, tutarlı/şüpheli/sorunlu etiketi, muhtemel neden, en çok 3 öneri). Yorum **yalnızca tavsiyedir, test durumunu değiştirmez**. Modele yalnızca araç satırları ve test hata satırları gider (yazılan değerler maskelenir, Stagehand blokları ve ham sayfa verisi gitmez, ~7000 karakter sınırı). Yorum, raporun günlük alanının sonuna işaretli bir blok olarak saklanır (ek sütun gerekmez); API ve arayüz günlüğü bundan ayırır. Üretilemezse "Yorum üretilemedi" görünür. Yönetici ayarı yoktur; acil kapatma: `AI_REPORT_ANALYSIS=off`. Tek işçili sınırlı kuyruk (en çok 100 bekleyen) kullanır; test koşusunu geciktirmez.

### Eylem sonrası ağ beklemesi ve rapor adım listesi

- **Eylem sonrası bekleme:** tıklama/seçme gibi eylemler (yazma adımları hariç) bir ağ isteği (xhr/fetch/sayfa) başlatırsa, o istekler bitene kadar (en çok `AI_POST_ACTION_WAIT_SECONDS`, varsayılan 8 sn; `0` kapatır) beklenir; istek başlamazsa en çok ~0,5 sn eklenir. Yavaş sitelerde "Giriş Yap"tan sonraki adımın panel gelmeden başlayıp "eleman bulunamadı" demesini önler.
- **Rapor penceresi adım listesi:** adımlar Stagehand'in iç satırlarından değil `Current test step` başlıklarından ve `[ÇÖZÜM] adım N` satırlarından üretilir; yeniden denemeler tek adımda toplanır, başlatma günlükleri "Başlatma ve Hazırlık" altında numarasız görünür. İşaret içermeyen eski raporlar eski ayrıştırıcıyla gösterilir.
- `[KOŞUCU_HATASI]: ... güvenlik engeli sayılmaz` notu yalnızca "hata/engel beklenen" senaryolarda yazılır.

### "Bul" adımları eylemsizdir

"... bul" adımları (çeviride `Find/Locate/Look for ...`) yalnızca elemanın sayfada **var ve görünür** olduğunu doğrular; tıklama/yazma gibi hiçbir eylem uygulamaz. Önce yapay zekasız etiket/metin denetimi yapılır (en çok `AI_FIND_WAIT_SECONDS`, varsayılan 5 sn yoklanır), bulunamazsa yalnızca gözlem yapan yapay zeka (en çok 2 deneme) kullanılır; eleman yoksa adım `ACTION_FAILED` ile düşer. Cümlede eylem fiili varsa ("Find X **and click** it") eskisi gibi eylem sayılır. Önceden "giriş yap düğmesini bul" adımı düğmeye tıklayıp girişi yapıyor, sonraki "tıkla" adımı da düğmeyi bulamıyordu.

### Sağlayıcı adları ve çeviri hata mesajları

- Ayarlar panelinde sağlayıcıya serbest ad verebilirsiniz (ör. `openai_api_key2`, `openai_yedek`). Hem test koşucusu hem çeviri (ve yapay zeka yorumcusu) adı **aynı kuralla** tanır: adda `openai` geçiyorsa OpenAI, `gemini` geçiyorsa Gemini, `qwen`/`local`/`dpu` geçiyorsa DPU AI. Hiçbirine uymayan ad reddedilir (anahtar yanlış servise gönderilmez). Önceden çeviri yalnızca tam `openai`/`openai_api_key` adlarını kabul ediyordu.
- Senaryo kaydederken çeviri başarısız olursa arayüz artık gerçek nedeni gösterir (anahtar reddedildi, model bulunamadı, kota/bakiye, zaman aşımı, desteklenmeyen sağlayıcı adı, 400'de sağlayıcının parametre mesajı). Mesajlar anahtar değeri içermez; tam ayrıntı sunucu günlüğündedir (`[Translator Gateway Error]`).

### Adım türü: act / extract

- Çeviri talimatına **adım türü kuralı** eklendi: `extract` yalnızca bir değeri/mesajı OKUMA/döndürme içindir ve hiçbir şeye tıklamaz/yazmaz; tıklama, kapatma, açma, yazma, seçme, "bul", "varsa kapat" gibi her etkileşim `act`'tir. Kural yalnızca senaryo **kaydedilirken/yeniden kaydedilirken** çeviriye uygulanır.
- **Çalışma anı güvenlik ağı** (`utils/stepKind.js`): kayıtlı senaryoda bir `extract` adımının talimatı eylem fiili içeriyor (close/click/open/type/select...) ve okuma fiili içermiyorsa (return/read/get/verify...) adım `act` olarak çalıştırılır; günlüğe `[BİLGİ] adım N: "extract" olarak çevrilmiş ama eylem içeriyor...` yazılır. Okuma adımları (hata/engel mesajı döndürme dahil) değişmez. Mevcut senaryoları yeniden çevirmeye gerek yoktur.
- Not: pop up "her zaman çıkmayabilir" durumları için isteğe bağlı adım ("varsa" → yoksa atla) henüz yoktur; pop up yoksa tıklama/kapatma adımı hata verir.

### Yazma ve seçim adımlarında ek korumalar

- **Hedef yazı kutusu değilse yazılmaz:** "yaz" adımında model bir kap (div/bileşen sarmalayıcı) önerirse, kabın içinde **tek görünür ve yazılabilir** kutu varsa doğrudan ona yazılır; yoksa eylem uygulanmaz, düzeltmeyle yeniden sorulur, ısrar edilirse yapay zekasız yedeğe geçilir. Gizli erişilebilirlik girdileri (`p-hidden-accessible`), salt-okunur/devre dışı kutular sayılmaz. Önceki hata: model kabı seçip `type` önerince Stagehand yazıyı odaktaki ALAN'a (e-posta kutusuna) yazıyor ve adım başarılı görünüyordu.
- **"type" her zaman "fill" olarak uygulanır** (yazma adımlarında); `fill` uygun olmayan hedefte hata verir, körlemesine yazmaz. Yazdıktan sonra hedef yazılabilir bir kutu değilse (değer okunamıyorsa) sonuç doğrulaması başarısız sayılır.
- **`selectOptionFromDropdown`:** hedef gerçek bir `<select>`/`<option>` değilse (örn. PrimeNG liste öğesi `<li>`) sıradan tıklamaya çevrilir; gerçek `<select>` kutularında yöntem korunur.

### Yapay zeka yorumu: hatalı adım, sayfa mesajı ve neden

Başarısız raporlarda yorum artık genel bir cümle yerine şunları verir: **hatalı adım**, sayfadan gelen **hata/uyarı mesajı (aynen alıntı)**, **muhtemel neden** (örn. uygulama "zorunludur" diyorsa büyük olasılıkla eksik test verisi/senaryo adımı; eleman yoksa sayfa beklenen durumda değil) ve nedene bağlı **somut öneriler**. Hata süre kaynaklı değilse performans önerisi verilmez. Uygulamanın doğrulama mesajı testin işini doğru yaptığını gösterir; bu durumda değerlendirme "Tutarlı" olur ama neden test verisi olarak yazılır.

- Modele giden kanıt: çok satırlı sayfa mesajları (pop up metni) devam satırlarıyla alınır, aynı mesajın tekrarları tek sefer yazılır (~600 karakter sınırı), `[HATA TESPİT EDİLDİ]` satırları tanınır, "Hata veren adım: N. adım — ..." satırı eklenir.
- Maskeleme: yalnızca "Type ... into" ile yazılan değerler `•••` olur (kanıtın her yerinde). Düğme adları, sayfa başlığı ve etiketler okunur kalır.
- Modelin alıntıladığı sayfa mesajı kanıtta geçmiyorsa (uydurma) kartta gösterilmez. Kart "Hatalı adım" ve sayfa mesajı satırlarını ayrı gösterir. Yorum yine yalnızca tavsiyedir, durumu değiştirmez.

### "Önbelleği Temizle" (Docker)

Düğme artık `cache/` klasörünün **kendisini silmez**, yalnızca içindekileri (seçici önbelleği, `ai-security` vb.) boşaltır. Docker'da `/app/cache` bir volume bağlama noktası ve kök dosya sistemi salt-okunur olduğundan eski yöntem (klasörü sil + yeniden oluştur) `EROFS: rmdir '/app/cache'` ile düşüyordu. Silme yine başarısız olursa arayüze anlaşılır bir hata (kod ile) döner. Çalışan/sıradaki test varsa yine 409 ile reddedilir.

### Rapor sonuçları: "Adım durumu" ve "Senaryo sonucu"

Her rapor iki ayrı sonuç gösterir:

| Alan | Anlamı | Kim belirler |
|---|---|---|
| **Adımlar** (Tamamlandı / Hata) | Adımlar teknik olarak sorunsuz çalıştı mı (`status` alanı, önceki mantık aynen) | Koşucu + sert kurallar |
| **Senaryo** (Başarılı / Başarısız / Belirsiz / Değerlendiriliyor) | Senaryo amacına ulaştı mı | Aşağıdaki kurallar |

Senaryo sonucu kuralları:
1. Adım durumu **Hata** ise senaryo **Başarısız**; yapay zeka bunu başarılıya çeviremez (yalnızca aşağı yönlü etki; sayfadaki metinle sonuç iyileştirilemez).
2. **Güvenlik (SECURITY) testleri:** sonuç yapay zekaya bırakılmaz; "beklenen sonuç" (başarı/hata beklenir) mantığıyla sistemin verdiği durumdur. Yapay zeka yalnızca yorum yapar.
3. **UI/fonksiyonel testler**, adımlar sorunsuz tamamlandıysa: yapay zeka yorumundaki `senaryoSonucu` (uygulama "zorunludur/geçersiz/hata" gibi bir mesaj gösterdiyse, işlem reddedildiyse veya giriş/kayıt tamamlanmadıysa Başarısız). Yorum hazırlanırken "Değerlendiriliyor…", üretilemediyse "Belirsiz" (nötr gri) görünür. Yorum hiç yoksa (eski rapor / `AI_REPORT_ANALYSIS=off`) yalnızca adım durumu gösterilir.

Rapor listesinde iki etiket, istatistik kartları ve filtre (Başarılı / Başarısız / Belirsiz-Değerlendiriliyor) senaryo sonucuna göre çalışır; "Değerlendiriliyor…" olan raporlar varken liste birkaç saniyede bir yenilenir. Sonuç, yorum bloğunun içinde saklanır (DPU tablosuna yeni sütun gerekmez); liste servisi bloğu okuyup `senaryo_sonucu` / `senaryo_kaynagi` alanlarını satıra ekler. Yapay zeka kartındaki etiket (Kanıtla uyumlu / Kanıt yetersiz / Kanıtla çelişkili) yorumun kanıtla uyumunu anlatır, senaryo sonucundan ayrıdır.

## Senaryo grupları

Senaryoları gruplayıp listeyi filtreleyebilir ve toplu testte bir grubu tek tıkla seçebilirsiniz.

- **Grup:** proje + test türü (UI / Güvenlik) bazında adlandırılmış, **sıralı** senaryo listesi. Bir senaryo birden fazla gruba girebilir. Aynı projede/türde aynı ad (büyük/küçük harf ve Türkçe i/İ duyarsız) iki kez kullanılamaz; en çok 50 grup, grup başına en çok 200 senaryo.
- **Yetki:** projeye erişimi olan herkes grup oluşturabilir, düzenleyebilir, senaryo atayabilir. Grup silmek onay sorar ve **senaryoları silmez**.
- **Senaryo listesi:** "Grup" filtresi (tümü / bir grup / grupsuz), satırlarda grup etiketleri (etikete tıklayınca grubun içeriği açılır), satırları seçip "Gruba ekle" / "Bu gruptan çıkar" (veya yeni grup oluşturma). Filtreden **bir grup seçilince** "Grupları Yönet"in yanında o gruba özel bölüm belirir: **Senaryo ekle ▾ + Ekle** ve **Grup içeriği (n)**. Bir grup seçiliyken liste grup sırasıyla gelir. Senaryo oluştururken/düzenlerken formda "Gruplar" alanı vardır (satır içinde yeni grup da açılabilir).
- **Grupları Yönet** penceresi yalnızca grup işleri içindir: oluştur, **adı değiştir**, **sil** (onaylı). Bir grubun adına tıklayınca içeriği açılır.
- **Grup içeriği** penceresi: grubun senaryoları çalışma sırasıyla; ↑ ↓ ile sıra değiştirilir, ✕ ile gruptan çıkarılır.
- **Toplu test:** grup seçici; "Görünenleri seç (grup sırasıyla)" seçimi grubun sırasıyla yapar (tek seferde en çok 50). Grup seçiliyken her satırda ↑ ↓ ile grup sırası değiştirilir ve seçili testler yeni sırayla numaralanır; "Grup sırasını düzenle" grup içeriği penceresini açar.
- **Senaryo silinince** tüm gruplardan çıkarılır; senaryoyu yeniden adlandırmak grup üyeliğini etkilemez (üyelik kimlikle tutulur). Proje silinince grupları da silinir.

**DPU Base tablosu `senaryo_gruplari`** (uygulamanın DPU kullanıcısının bu tabloda okuma/ekleme/güncelleme/silme yetkisi olmalıdır):

| Kolon | Tip | Anlamı |
|---|---|---|
| `id` | Plain text (sistem) | Grup kimliği |
| `project_id` | Plain text | Projenin kimliği (metin olarak) |
| `test_tipi` | Plain text | `UI` veya `SECURITY` |
| `grup_adi` | Plain text | Grup adı |
| `senaryo_idleri` | JSON | Sıralı senaryo kimlikleri, örn. `["12","7","31"]` |

Tablo yoksa veya yetki eksikse senaryo listesi ve toplu test normal çalışır; yalnızca grup alanlarında "Gruplar kullanılamıyor: ..." uyarısı görünür. API: `GET /api/scenarios/groups`, `POST /api/scenarios/groups/{create,rename,delete,members,reorder,assign}`; `GET /api/scenarios/list` yanıtına ad listesinin yanında `items: [{id, name}]` eklenmiştir (eski alan aynen durur). Grup işlemleri tek sunucu sürecinde grup başına sıralı yürütülür (eşzamanlı eklemeler birbirini ezmez); birden fazla sunucu örneği çalıştırılırsa DPU tarafında kilit yoktur.

### Yapay zeka yorumunu yeniden yorumlatma

Yorum üretilemezse ("Yorum üretilemedi"), yorum hiç yoksa (eski rapor) veya senaryo sonucu **Belirsiz** kaldıysa rapor penceresindeki yapay zeka kartında **"Yeniden yorumlat"** düğmesi çıkar. Tıklayınca yorum yeniden kuyruğa alınır ("Yorum hazırlanıyor…" görünür, sonuç gelince hem pencere hem rapor listesi güncellenir). Kesin sonuçlar (Başarılı/Başarısız) ve güvenlik testleri için düğme çıkmaz; sunucu da reddeder (409). Aynı rapor için 15 sn içinde ikinci istek 429 alır; yorum kapalıysa (`AI_REPORT_ANALYSIS=off`) 409. Yeniden yorum, senaryonun **güncel** adımlarını ve beklenen sonucunu kullanır (senaryo silinmişse yalnızca günlük kanıtı).

- **Neden üretilemedi?** Kart artık nedeni yazar (anahtar reddedildi, model bulunamadı, kota/bakiye, zaman aşımı, biçim hatası...) ve sunucu günlüğüne `[Rapor yorumu] rapor N için yorum üretilemedi: ...` satırı düşer (gizli anahtar değerleri maskelenir). Önceden neden hiç görünmüyordu.
- **Otomatik yeniden deneme:** geçici hatalarda (kota 429, 5xx, ağ/zaman aşımı) en çok 3 deneme, artan bekleme (`AI_ANALYSIS_RETRY_DELAY_MS`, varsayılan 3000); kalıcı hatalarda (anahtar/model/ayar) yeniden denenmez; biçim hatasında hemen yeniden denenir.
- **Toplu koşular:** yorumlar tek işçili kuyrukta ve çeviri sağlayıcısının dakikalık sınırıyla (`AI_TRANSLATE_RPM`, varsayılan 20) üretilir; çok sayıda rapor birikirse kota beklemesi uzar. "Hazırlanıyor" durumu artık 10 dk sonra (eskiden 4 dk) "üretilemedi" sayılır. Toplu testlerde sık "üretilemedi" görüyorsanız `AI_TRANSLATE_RPM` değerini sağlayıcı kotanıza göre yükseltin.

**Yorumun cevap biçimi:** yapay zekanın cevabı şemaya sokulmadan önce toleranslı hâle getirilir: Türkçe karakterli/büyük harfli değerler ("şüpheli", "Başarılı", "yüksek"), İngilizce eş anlamlılar, 3'ten fazla öneri (ilk 3 alınır), çok uzun metinler (kısaltılır), tek metin olarak gelen öneri ve tek seviye sarmalayıcı nesne kabul edilir; tanınmayan etiketler güvenli varsayılana düşer (şüpheli / belirsiz / orta). Yalnızca `özet` zorunludur. Yine de kullanılamayan cevapta kart "Yapay zekanın cevabı beklenen biçimde değildi (alan: sorun)" ve sunucu günlüğü hangi alanın tutmadığını yazar. Önceden bu farklılıkların hepsi yorumu "üretilemedi" yapıyordu.
