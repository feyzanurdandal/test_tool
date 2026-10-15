# Onaylanan genel UI akışı — 4 Ekim 2026

Gönderilen `test-tool-baglam-duzeltilmis(1).zip` üzerine uygulanmıştır. Hedef siteye veya Angular sınıflarına özel seçici eklenmemiştir. Veritabanı şeması değişmez.

## Davranış

1. Çeviri; işlem, hedef, değer, bölüm ve konumu ayrı alanlarda korur. Yalnızca kullanıcı açıkça istediğinde iş sonucu doğrulaması üretir.
2. Görünür/kullanılabilir kontroller önce tam ad, sonra normalize edilmiş bütün kelime içeren adla aranır. `<i>+</i> Ekle` gibi dekoratif simgeler eşleşmeyi bozmaz. Aktif pencere, açık liste, bölüm ve konum değerlendirilir.
3. Birden fazla aday veya ad eşleşmesi olmayan durumda AI yalnızca hedef önerir. Önerilen selector gerçek adaylarla karşılaştırılır. Tek bir aday doğrulanırsa işlem yapılır. AI’ın işlem yöntemini/argümanlarını çalıştırmayız.
4. İşlem seçilen gerçek DOM düğümünde bir kez uygulanır. Sayfa yeniden render edip düğümü kaldırırsa başka düğüme kaymaz. Kaydet/sil gibi işlemler, sonuç görünmedi diye tekrarlanmaz.
5. Yazılan değer ve seçilen seçenek doğrulanır. Sadece listenin kapanması seçim kanıtı değildir. Kaydetmenin iş sonucunu doğrulamak için senaryoda örneğin “Kaydedildi mesajının görünür olduğunu doğrula” bulunmalıdır. Extract, assertion değildir.
6. Adım hatasında hedef, bölüm, URL, aday özeti ve maskelenmiş ekran görüntüsü alınır. Rapor detayından proje yetkisiyle açılır. Geçici düz dosyalar koşu sonunda silinir.

## Dosya bazında değişiklikler

| Dosya | Değişiklik |
| --- | --- |
| `utils/uiActions.js` | Genel kontrol seçimi; ad normalizasyonu/kelime eşleşmesi; sıkı bölüm/pencere bağlamı; konum; AI aday doğrulaması; native/custom dropdown; DOM düğümünü sabitleme; işlem ve açık beklenti doğrulamaları. |
| `utils/translator.js` | Framework sınıfı kuralları kaldırıldı; action/target/control/value/scope/position/expect alanları; açma ve seçmenin ayrılması; otomatik Enter kaldırıldı; bağlam koruma ve kullanıcı tarafından belirtilen assertion kuralları. |
| `schemas/runtimeSteps.js` | Yeni alanları koruyan, uzunlukları/türleri doğrulayan şema; assert türü; eski instruction kayıtlarıyla uyum. |
| `tests/ai-security.spec.ts` | Her act hedef seçimi katmanından geçer. Serbest ve doğrulanmamış Stagehand.act kaldırıldı. Observe yalnızca önerir. Açık assertion çalıştırılır; hata yakalama/tanı ve değer maskeleme eklendi. Ham AI logları ve action cache kullanılmaz. HEADLESS/CHROME_PATH dikkate alınır; Linux/Docker Chromium kaynak bayrakları eklendi. |
| `utils/runDiagnostics.js` (yeni) | Senaryo değerlerini/anahtarları maskeleme; adım hatası metadata ve giriş alanları maskeli ekran görüntüsü yakalama. |
| `services/diagnosticService.js` (yeni) | AES-256-GCM şifreli tanı; proje kimliği; 24 saat erişim; 100 kayıt/100 MiB sınırı; otomatik temizlik; path traversal ve bozulmuş şifreli kayıt reddi. |
| `services/testRunner.js` | Çocuk süreç tanısını şifreli depoya aktarır, düz geçici kayıtları siler, logları maskeler, rapora tanı kimliği ekler. Rapor kaydedilemezse tanı silinir. |
| `routes/reports.js` | Tanı metadata/görüntü GET uçları, oturum ve mevcut raporun proje yetkisi kontrolü; no-store; rapor silinirken tanıyı silme. |
| `public/js/app.js` | Yapılandırılmış adım loglarını okuma; rapor detayında tanıyı ve görüntüyü açma düğmesi. Metinler DOM textContent ile gösterilir. |
| `public/css/app.css` | Yeni arayüz sınıfları için Tailwind yeniden derlendi. |
| `playwright.config.ts` | Hassas veriyi sınırsız standart video/trace/screenshot dosyalarında bırakmamak için bu otomatik çıktılar kapatıldı. Kontrollü tanı görüntüsü kullanılır. |
| `Dockerfile` | Tanı dizini oluşturulur ve pwuser’a verilir. |
| `docker-compose.yml` | Şifreli tanı için `test-diagnostics` kalıcı volume; boş OpenAI/Gemini env değişkenleri için varsayılan. |
| `.gitignore`, `.dockerignore` | Yerel tanı kayıtları Git ve imaj bağlamı dışında. |
| `.env.example`, `README.md` | Node gereksinimi, npm ci, yerel env, anahtar uzunluğu, yeni akış, doğrulama örneği, tanı erişimi/saklama ve test komutları güncellendi. |
| `package.json` | test:ui, test:network, test:runner komutları. Bağımlılıklar ve package-lock değişmedi. |
| `security-tests/ui-actions.test.js` | 32 gerçek Chromium regresyonu. Simgeli buton, bağlam/konum, gecikmeli render, AI adayları, DOM sırası/kaldırılan düğüm, seçim ve assertion, maskelenmiş görüntü; link/JavaScript kontrolleri ve combobox değeri. |
| `security-tests/runner-flow.test.js` (yeni) | Gerçek Playwright/Stagehand çocuk süreciyle kontrollü başarı/başarısızlık; tek işlem, iş sonucu ve şifreli tanı aktarımı. |
| `unit-tests/diagnostics.test.js` (yeni) | Şifreleme/bozulma, proje/süre/path sınırları, log maskeleme, şema bağlamı. |
| `unit-tests/api.integration.test.js` | Tanı ve görüntü için oturumsuz/proje dışı erişim reddi, admin erişimi ve başka projeye ait tanı kimliğinin reddi. |
| `UI_DUZELTME_NOTLARI.md`, `DEGISIKLIK_NOTLARI.md` | Bu sürümün güncel açıklaması. |

## Kontroller

- `npm test`: 60/60 başarılı (birim ve gerçek sunucu/sahte DPU API testleri).
- `npm run test:ui`: 32/32 başarılı (gerçek Chromium, kontrollü HTML/DOM örnekleri).
- `npm run test:network`: 3/3 başarılı (HTTP/WS koruması).
- `npm run test:runner`: 1/1 başarılı; içinde biri başarılı, biri bilerek başarısız iki gerçek koşu vardır.
- Stagehand başlatma + proxy + izinli navigasyon smoke kontrolü başarılı.
- Playwright test dosyası yükleme/listeme ve Tailwind derlemesi başarılı; değişen JS dosyaları syntax kontrolünden geçti. Bağımlılık listesi kilit dosyasıyla tutarlı.

Toplam 96 otomatik test başarılı. AI seçimi kontrollü cevaplarla test edildi; gerçek sağlayıcının karar kalitesi bu sayıyla kanıtlanmaz. Gerçek DPÜ sitesinde veri oluşturulmadı ve gerçek AI çağrıları yapılmadı. Docker imajı/Compose bu ortamda çalıştırılmadı. Bu sonuçlar “hiç güvenlik açığı yok” veya her sitenin her kontrolü desteklenir garantisi değildir.

## Güncelleme

1. ZIP içindeki kaynak dosyaları mevcut proje klasörünüze aktarın; kendi `.env`, `.git`, sertifikalar, oturum ve cache dizinlerini koruyun. Özellikle mevcut ENCRYPTION_KEY’i değiştirmeyin.
2. Yerelde `.env`: NODE_ENV=development, DOCKER_ENV=false, HEADLESS=false. Ardından `npm ci`, `npx playwright install chromium`, `npm test`, `npm start`.
3. Yeni çeviri alanları için mevcut senaryoları düzenleyip yeniden kaydedin. Açık sonuç doğrulaması ekleyin; yalnızca pop-up metnini döndürmekle yetinmeyin.
4. Docker’da kaynak güncellemesinden sonra rebuild gerekir: `docker compose up --build -d`. Sertifikasız yerel Docker için README’deki dev override komutunu kullanın.
5. Hata raporunda tanı düğmesini açıp başarısız adım ve görüntüyü inceleyin. Tanı 24 saatten sonra erişilemez; kota dolunca daha erken silinebilir.

## Bilinen sınırlar

- Çözüm tarayıcı semantiğine dayanır. DOM’da hiçbir etiket/rol veya açık liste ilişkisi olmayan, iframe/Shadow DOM içindeki ya da alışılmadık bileşenlerde ek destek gerekebilir. Böyle durumlarda gelişi güzel div/span tıklanmaz.
- Konum eşleşmesi bir tercihtir; bölüm adı sıkı sınırdır. Model açık bölüm ve hedef adını korumalıdır. Eski çeviri bağlamı kaybettiyse yeni çeviri gerekir.
- AI, doğrulanmış adaylar arasından yanlış semantik aday seçebilir. Sonuç doğrulaması ve doğru bölüm talimatı bu riski azaltır; ortadan kaldırmaz.
- Görüntüde giriş alanları maskelenir, diğer sayfa içeriği hassas olabilir. Kayıtlar şifreli ve proje yetkisiyle erişilir. Saatlik fiziksel temizlik 24 saatlik erişim süresinden sonra yapılabilir; süresi dolan kayıt okunamaz.
- Koşu altyapısı başlatılamazsa veya süreç zorla kapanırsa görüntü alınamayabilir. Bu bir beklenen güvenlik engeli başarısı sayılmaz.
- Önceki Git anahtar adayı bulgusu geri çekilmiştir: README’deki örnek yer tutucu gerçek anahtar değildir.

ZIP; node_modules, gerçek .env, .git, cache, runtime, sessions, diagnostics, sertifikalar ve test çıktıları içermez.
