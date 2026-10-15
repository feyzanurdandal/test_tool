# JSON form adımları ve değişken test verisi — 14 Ekim 2026

## Kullanım

1. Senaryo oluşturma ekranında login ve formu açma adımlarını ekleyin.
2. **JSON’dan Adım Oluştur** ile dosya yükleyin veya JSON yapıştırın. Konsoldaki nesneye sağ tıklayıp **Copy object / Nesneyi kopyala** kullanın. Konsolun düz metin dökümü ve JavaScript kodu kabul edilmez.
3. **JSON’u Önizle** düğmesine basın. Kullanılacak alanları, formdaki görünen adlarını, değerlerini ve işlem türlerini kontrol edin. Gerekirse bölüm/pencere adını girin.
4. **Ayarları Uygula ve Adımları Ekle** düğmesiyle seçili alanlar senaryonun sonuna eklenir. Sonra Kaydet’e basma gibi normal adımları ekleyin. JSON alanındaki **Ayarlar** düğmesiyle yeniden düzenleyebilirsiniz.
5. Normal adımlardaki çift tırnaklı yazılacak değerleri değiştirmek için **Değişecek Değerleri Seç** kullanın. Alan adları değişken olarak önerilmez; yazılacak veri değeri seçilir.
6. **Her çalıştırmada farklı değer kullan** işaretli olduğunda sabit dışındaki kurallar uygulanır. İşareti kapatırsanız tüm değerler temelde kaydedilmiş haliyle kullanılır.

Aynı pencere UI ve Güvenlik senaryolarında kullanılır. JSON alanları, değişkenler ve kurallar düzenleme/yeniden açma ve senaryo içe aktarma sırasında korunur. İçe aktarılan senaryonun sabit verileri, hedef senaryoda değişim açık olsa bile sabit kalır.

## JSON biçimi

Kök bir nesne olmalıdır. İç içe alanlar noktalarla gösterilir; en fazla 80 yaprak alan, 8 iç içe seviye ve 64 KB JSON kabul edilir. null alanları ve boş nesneler atlanır. Başlangıçta id/userId teknik alanları seçili değildir. Key/alan adı önerileri sadece yardımcıdır; herhangi bir projeye sabit eşleme yoktur.

Uzun numaraları ve başında sıfır olan değerleri JSON’da metin olarak belirtin. Örneğin:

```json
{
  "productName": "Deneme ürün",
  "code": "000123",
  "email": "test@example.com",
  "enabled": true,
  "categoryId": "gercek-secenek-kimligi"
}
```

JSON form verisini sağlar; hedef sayfa, login, gezinme ve formun kaydedilmesi kullanıcı adımlarında belirtilir. JSON’dan form alanları doğrudan derlenir; AI bu alanların değerlerini veya sırasını çevirmeye çalışmaz.

## Açılır kutu yöntemleri

- **Görünen metin:** Açık ilgili listede normalize edilmiş tam metin eşleştirilir. Birden fazla aynı seçenek varsa açıklamalı hata oluşur; daha ayrıntılı etiket/bölüm veya ID kullanın.
- **Seçenek değeri / ID:** Native option.value veya özel kontrollerde DOM’a yansıtılan data-value/value/data-id eşleştirilir. Uygulama ID’yi yalnız kendi belleğinde tutuyorsa erişilemez; görünen metni kullanın. UUID sıra numarası kabul edilmez.
- **Sıra:** Sıfırdan başlar. Native select için boş değerli seçim yer tutucusu sayılmaz; diğer gerçek seçeneklerin sırası korunur. Devre dışı seçenek seçilmez; sıra dışı numara hata verir.
- **Rastgele:** Etkin ve yüklenmiş seçeneklerden biri seçilir. Başlangıç yer tutucusu ve devre dışı seçenekler atlanır. Seçilen metin ve erişilebiliyorsa değer raporun ham logunda `[JSON_SECIMI]` olarak bulunur.

Kutuyu açma ve seçeneği tıklama ayrı işlemlerdir. Açık liste ve bağlı native listelerde yüklenme/kararlılık beklenir. Özel listelerde role=listbox/option ve yaygın PrimeNG overlay yapıları desteklenir. Seçenekleri DOM’a yüklemeyen, sanal kaydırmalı veya özel erişilebilirlik yapısı olmayan kontrollerde tüm liste üzerinden sıra/rastgele seçim garanti edilmez; mevcut yüklenmiş seçeneklerle çalışılır veya açıklamalı hata verilir. Böyle kontroller için normal doğal dil adımları kullanılabilir.

## Tarih ve işaretleme kutusu

Metin olarak düzenlenebilir tarihler, belirtilen biçimde doldurulur. Native input[type=date] için YYYY-MM-DD gerekir. ISO timestamp kopyalandıysa istediğiniz takvim gününü önizlemede düzenleyin; saat dilimi dönüşümüyle gün değiştirilmez. Yalnız takvim tıklaması kabul eden, readonly tarihler için mevcut normal takvim açma/gün seçme adımlarını kullanın. Native/ARIA işaretleme kutusunda true veya false kullanılır.

## Değişim kuralları ve sayaç

- **Sabit:** Değer değişmez. Login ve şifrelerde bunu kullanın.
- **Sayıyı artır:** Yalnız rakam; baştaki sıfırlar korunur. Örneğin temel 000123, ilk koşuda 000124 olur. Uzunluk taşarsa sessizce kısaltılmaz; hata verilir.
- **Metin sonuna numara:** Sonundaki sayı artırılır; sayı yoksa koşu numarası eklenir.
- **E-posta:** Koşu numarası @ işaretinin önüne eklenir.

Kimlik/şifre adlı JSON alanları otomatik değiştirilemez. Normal adımlarda özel doğrulaması olan kimlik, telefon vb. değerleri değişken yapmayın. Aynı değişkenin tekrarlanan kullanımları bir koşuda aynı değeri alır. Temel senaryo değiştirilmez; çalışma anındaki dosyada değerler uygulanır.

Sayaç senaryo kimliği başına **run-data/** dizininde tutulur. Numara atomik dosya oluşturmayla ayrılır; aynı dizini paylaşan eşzamanlı işletim sistemi süreçleri aynı numarayı alamaz. Başarısız koşu numarası geri verilmez. Yerel sunucu yeniden başlatılması ve önbellek temizliği sayacı sıfırlamaz. Yeni makineye geçerken run-data dizinini taşıyın/yedekleyin. Docker’da **test-run-data** volume’u kullanılır; `docker compose down -v` sayaçları da silebilir.

Birden fazla sunucu örneği kullanılırsa aynı kalıcı dizin/volume paylaşılmalıdır; ayrı makinelerde ayrı sayaç alanları merkezi numaralandırma sağlamaz. Bu uygulama mevcut tek sunuculu kurulum içindir. Yeni senaryo farklı sayaçla başlar. Sayaç, hedef sistemde önceden var olan kayıtların veya farklı senaryolardaki aynı temel değerlerin çakışmasını tek başına garanti edemez.

## Kurulum

- Mevcut sürümü commit veya yedek olarak saklayın. ZIP’i yeni klasöre çıkarın.
- Kendi .env dosyanızı taşıyın; ENCRYPTION_KEY değerini koruyun. Gerçek anahtar ve çalışma verileri ZIP’e eklenmemiştir.
- Node.js 22+ ile proje kökünde `npm ci`, ardından `npm start` çalıştırın.
- Yeni npm bağımlılığı veya DPU Base tablo değişikliği yoktur. Ayarlar mevcut senaryonun adimlar JSON alanında tutulur. Eski senaryolar eskisi gibi çalışır.
- Docker kullanıyorsanız yeni Dockerfile ve docker-compose.yml ile yeniden build edin; README’deki uygun yerel/üretim komutunu kullanın. Kalıcı sayaç alanı otomatik bağlanır.

## Korunan akış / kapsam

Normal act adımlarının çalışan Stagehand observe → tek action akışı korunmuştur. Önceki ağ, oturum ve proje erişimi korumaları korunur. Beklenen başarı sonucu doğrulaması bu değişikliğe eklenmemiştir; adımların tamamlanması hâlâ kayıt işleminin başarıyla oluştuğunu kanıtlamaz.

## Doğrulama

64 birim/API testi ve 8 Chromium testi geçti. Eşzamanlı numara ayırma aynı süreçte 30 çağrı, ayrı işletim sistemi süreçlerinde 8 çağrı ile doğrulandı. Gerçek panelde JSON/normal adım değişkeni kaydetme ve yeniden açma kontrol edildi; API’de JSON senaryosunun saklanması ve güncellenmesi sahte DPU Base ile test edildi. Native ve özel overlay listelerinde seçim, bağlı liste yüklenmesi, metin/tarih/kutu doldurma ve güvenlik ağ testleri geçti. Playwright koşucusu dosyayı yükleyip listeledi; CSS derlemesi geçti.

AI hedef önerisi ve backend veri servisi kontrollü testlerde taklit edildi. Gerçek DPÜ sitesinde gerçek AI sağlayıcısıyla veya Docker içinde uçtan uca koşum yapılmadı. Böyle bir denemede ilk olarak ayrı bir test hesabı/verisiyle kısa bir JSON form senaryosu kullanın.

## Değişen ve yeni dosyalar

- `public/index.html`
- `public/js/app.js`
- `public/js/test-data-editor.js`
- `public/css/app.css`
- `routes/scenarios.js`
- `schemas/runtimeSteps.js`
- `schemas/scenarioSchemas.js`
- `schemas/testData.js`
- `services/testRunner.js`
- `services/runSequence.js`
- `utils/scenarioData.js`
- `utils/formActions.js`
- `utils/translator.js`
- `tests/ai-security.spec.ts`
- `Dockerfile`
- `docker-compose.yml`
- `.gitignore`
- `.dockerignore`
- `unit-tests/scenario-data.test.js`
- `unit-tests/api.integration.test.js`
- `security-tests/json-data-browser.test.js`
- `README.md`
