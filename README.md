# Yazılım Test Aracı

## Proje Ne Yapar?
Bu proje; modern yazılım geliştirme süreçlerinde **Kalite Güvence (QA)**, **Saf Backend Entegrasyon** ve **Dynamic Application Security Testing (DAST - Dinamik Siber Güvenlik Taraması)** süreçlerini tek bir çatı altında toplayan kurumsal bir test otomasyon altyapıdır. 

Geliştirilen hedef sistemin hem arayüz fonksiyonelliğini doğrular, hem backend API uç noktalarını milisaniyeler içinde test eder, hem de arka planda akan tüm trafiği siber güvenlik süzgecinden geçirerek kritik zafiyetleri (SQL Injection, XSS, CSRF vb.) otomatik olarak yakalar.

## Hangi Teknolojileri Kullanır?
Sistem, birbirine entegre çalışan teknoloji yığını üzerine inşa edilmiştir:
* **Playwright (TypeScript):** Modern, hızlı ve paralel test koşturabilen arayüz ve API otomasyon motoru.
* **OWASP ZAP (ZED Attack Proxy):** Açık kaynaklı siber güvenlik tarama ve proxy aracı.
* **Docker & Docker Compose:** Tüm test araçlarını yerel bağımlılıklardan izole ederek her işletim sisteminde (Windows/Linux/macOS) tek tıkla çalıştırılabilir kılan konteynerizasyon teknolojisi.
* **Lighthouse:** Arayüz performansını, erişilebilirliğini ve SEO kriterlerini test eden analiz motoru.

---

# Nasıl Kullanılır?
## CANLI ORTAM (PRODUCTION) TESTi İÇİN
Bu test aracı, internet üzerinde canlıda (yayında) çalışan herhangi bir web uygulamasını, **hedef sitenin kaynak kodlarına zerre dokunmadan ve içine hiçbir dosya yüklemeden** dışarıdan bir siber güvenlik müfettişi gibi tarayabilir.

Canlı ortam testlerinde yerel ağ kısıtlamaları (`localhost`, `host.docker.internal` vb.) tamamen ortadan kalktığı için kurulum ve test süreci çok daha hızlıdır.

### Adım Adım Kullanımı:

1. **Test Aracının İçinde Kalın:** Hedef canlı sitenin kodlarında hiçbir değişiklik yapmanıza gerek yoktur. Tüm işlemleri sadece bu `test-tool` klasörünün içinde yürüteceksiniz.

### 2- Playwright Codegen (Otomatik Kod Kaydedici) Çalıştırma

Bu özellik Docker'ın içinden değil, kendi yerel bilgisayarınızdan (Windows/Linux) bir tarayıcı fırlatarak çalışır. Siz yereldeki projenizin adresinde gezinirken test kodları otomatik olarak arkada üretilir.

#### Nasıl Çalışır?

1. Projenin terminalindeyken şu komutu çalıştırın:
    
    ```
    npx playwright codegen
    ```
    
2. Karşınıza iki tane pencere açılacak:
    - **Birincisi:** Boş bir Chromium tarayıcı penceresi.
    - **İkincisi:** "Playwright Inspector" adında, siz hareket ettikçe kodları canlı yazacak olan kod penceresi.
3. Tarayıcının adres çubuğuna test etmek istediğiniz yerel veya canlı sitenin URL'ini yazın (Örn: `http://localhost:3000`) ve Enter'a basın.
4. Sitede normal bir kullanıcı gibi butonlara tıklayın, formları doldurun. Sağ taraftaki Inspector penceresinde kodların TypeScript formatında oluştuğunu göreceksiniz.
5. İşlem bittiğinde Inspector penceresindeki **Copy** butonuna basarak oluşan ham kodları kopyalayın.

### 3- Yapay Zeka ile 3 Katmanlı Mimari Ayrıştırması

Kopyaladığınız ham kodları, sistemi bozmadan **UI, GÜVENLİK ve API** katmanlarına kusursuzca bölebilmesi için herhangi bir yapay zekaya aşağıdaki prompt ile birlikte gönderin:

> "Elimde Playwright `codegen` aracından alınmış ham bir test kodu var. Bu kodu kurumsal **Page Object Model (POM)** ve **3 Farklı Test Klasörü (UI, GÜVENLİK, API)** mimarisine göre ayrıştırmanı istiyorum. Banatam olarak şu dosyaları ayrı ayrı üret:
> 
> 
> **1. Sayfa Nesnesi Katmanı (`pages/` klasörü için):**
> 
> - Sadece element tanımlamalarını (`locator`) ve arayüz fonksiyonlarını içersin.
> - Ortam değişkeni `process.env.TEST_MODE === 'API'` ise, buradaki tüm fonksiyonlar otomatik olarak erken dönüş (`return`) yaparak arayüz adımlarını es geçsin.
> 
> **2. Temel Fonksiyonel Arayüz Test Katmanı (`tests/ui.spec.ts` için):**
> 
> - Sadece arayüz senaryosunu barındırsın. Sayfa nesnesini çağırarak adımları yönetsin ve görsel doğrulamaları (`expect`) gerçekleştirsin.
> - `process.env.TEST_MODE === 'API'` veya `SECURITY` ise bu dosya en başta `test.skip()` ile es geçilsin.
> 
> **3. Siber Güvenlik Test Katmanı (`tests/security.spec.ts` için):**
> 
> - Arayüz adımlarını koşturarak arkadaki OWASP ZAP Proxy'nin trafiği dinlemesini ve zafiyet taraması yapmasını sağlasın.
> - Eğer `process.env.TEST_MODE === 'API'` ise bu test dosyası en başta `test.skip()` ile tamamen es geçilsin.
> 
> **4. Saf Backend API Test Katmanı (`tests/api.spec.ts` için):**
> 
> - Tarayıcıyı ve Sayfa Nesnesini ASLA kullanmasın. Playwright'ın saf `request` motorunu kullansın.
> - Ham kodda yapılan işlemlerin (Örn: Bir formu doldurup göndermek) backend API uç noktasına doğrudan HTTP paketi atan saf backend entegrasyon test versiyonunu yazsın.
> - Eğer `process.env.TEST_MODE !== 'API'` ise bu test dosyası en başta `test.skip()` ile es geçilsin.
> 
> **İşte Ham Codegen Çıktısı:**
> [BURAYA CODEGEN'DEN GELEN HAM KODU YAPIŞTIR]"
> 

Yapay zekanın ürettiği bu kodları projenizdeki ilgili klasörlere (`pages/` ve `tests/`) kaydettikten sonra sistem artık kullanıma hazırdır!

4. **Test Dosyasını Güncelleyin:** `tests/security.spec.ts` (veya `ui.spec.ts`) dosyanızı açın ve içerisindeki URL adresini doğrudan test etmek istediğiniz canlı sitenin internet adresiyle aynı olup olmadığını kontrol edin:
   ```typescript
   // Örnek: tests/security.spec.ts
   async gotoLogin() {
     await this.page.goto('[https://site.com/login](https://site.com/login)'); // 👈 Canlı sitenizin tam adresi
   }

Artık sistemi kullanan diğer kişilerin tek yapması gereken, neyi test etmek istiyorlarsa terminale şu komutlardan birini yazmaktır:

```
npm run test:ui        # Sadece Arayüz ve Tasarım testi yapar
npm run test:security  # ZAP Proxy'yi açar ve Siber Güvenlik Raporu üretir (bu kodu çalıştırdıktan sonra http://localhost:8082/zap/ adresine gitmemiz gerek )
npm run test:api       # Tarayıcıyı açmadan saf Backend API'lerini test eder
```
---

### SİBER GÜVENLİK MODU VE MANUEL RAPOR ALMA REHBERİ

Eğer sistemi Siber Güvenlik modunda çalıştırıyorsanız (`npm run test:security`), arka planda ayağa kalkan OWASP ZAP Proxy'nin tarayıcı trafiğini nasıl işlediğini canlı izleyebilir ve test sonunda kurumsal siber güvenlik raporunuzu manuel olarak yerel bilgisayarınıza indirebilirsiniz.

### Rapor Kaydetme Adımları:

1. Terminalde `npm run test:security` komutunu koşturun ve Playwright tarayıcısının işlemleri tamamlamasını bekleyin.
2. İşlemler bitince kendi bilgisayarınızdaki herhangi bir tarayıcıyı açın ve şu adrese gidin:
   **`http://localhost:8082/zap/`**
3. Karşınıza siber güvenlik uzmanlarının kullandığı **OWASP ZAP Webswing Kontrol Paneli** gelecektir.
4. Sol üstteki menüden sırasıyla şu adımları takip edin:
   * **Report (Rapor)** ➔ **Generate Report (Rapor Üret)** seçeneğine tıklayın.
5. **Açılan pencerede dosya yolu (File Path) kısmı önemli:**
   * Raporun yerel bilgisayarınızdaki `security-reports` klasörüne otomatik düşebilmesi için kayıt dizini başına mutlaka **`/zap/wrk/`** yazmalısınız.
   * *Örnek Kayıt Yolu:* `/zap/wrk/security_report.html`
6. **Generate Report** butonuna bastığınız an, Docker köprüsü sayesinde rapor saniyeler içinde kendi yerel projenizdeki `security-reports/` klasörünün altında belirecektir.





## Canlıda Olmayan Bir Projede Çalıştırmak İçin
### ÖN KOŞUL: 
1. Testleri veya 'codegen' aracını başlatmadan önce, test etmek istediğiniz ana projenizin (web sitenizin) yerelde aktif olarak ÇALIŞIYOR olduğundan emin olun.  Test aracı boş bir porta istek atamaz; hedef sitenin açık olması gerekir.

2. [⚠️ EN KRİTİK AYAR]: Bizim test aracımız Docker konteynerleri içinde çalıştığından, test etmek istediğiniz projenin içine yeni açtığımız `tests/` klasöründeki test dosyalarında (`ui.spec.ts`, `security.spec.ts` vb.) geçen `localhost` yazılarını `host.docker.internal` olarak değiştirmeniz gerekir.
   * *Yanlış (tests/ içindeki kod):* await page.goto('http://localhost:5173/login');
   * *Doğru (tests/ içindeki kod):* await page.goto('http://host.docker.internal:5173/login');

3. [Frontend Projeleri İçin Not]: Eğer hedef projeniz Vite, Next.js veya modern bir frontend framework kullanıyorsa, dışarıdan gelen Docker paketlerini kabul etmesi için kendi `package.json` dosyasındaki çalıştırma komutunun sonuna `--host` bayrağını eklemelisiniz (Örn: `"dev": "vite --host"`).

### 1- Mevcut projenin ana dizinindeyken terminalden şu komutu koşturarak TypeScript ve gerekli kütüphane tiplerini projeye kur:

```
npm install --save-dev @playwright/test @types/node typescript playwright-lighthouse cross-env
```

### 2- Ardından,  `test-tool` klasörünün içindeki şu kritik yapılandırma dosyalarını kopyala ve yeni projenin **ana dizinine (root)** yapıştır

- **`docker-compose.test.yml`**
- **`playwright.config.ts`**
- **`tsconfig.json`**

### 3- Yeni projenin ana dizininde şu iki klasörü oluştur

- **`pages/`** (Sayfa nesnelerimiz için)
- **`tests/`** (Test dosyalarımız için)

`test-tool` içindeki **`pages/BasePage.ts`** dosyasını kopyala ve yeni projedeki `pages/` klasörünün içine kopyala. Bu dosya bizim mod yönetim (SECURITY, API, UI) kodumuz olduğu için hiç değişmeden her projede aynen çalışır.

### 4- package.json Scriptlerinin Eklenmesi

Hedef projenizin `package.json` dosyasını açın ve içerisindeki `scripts` bölümüne şu otomasyon komutlarını ekleyin:
```
"scripts": {

"test:ui": "cross-env TEST_MODE=UI docker compose -f docker-compose.test.yml down && cross-env TEST_MODE=UI docker compose -f docker-compose.test.yml up --build",

"test:security": "cross-env TEST_MODE=SECURITY docker compose -f docker-compose.test.yml down --remove-orphans && cross-env TEST_MODE=SECURITY docker compose -f docker-compose.test.yml up --build",

"test:api": "cross-env TEST_MODE=API docker compose -f docker-compose.test.yml down && cross-env TEST_MODE=API docker compose -f docker-compose.test.yml up --build"

},
```

### 5- Playwright Codegen (Otomatik Kod Kaydedici) Çalıştırma

Bu özellik Docker'ın içinden değil, kendi yerel bilgisayarınızdan (Windows/Linux) bir tarayıcı fırlatarak çalışır. Siz yereldeki projenizin adresinde gezinirken test kodları otomatik olarak arkada üretilir.

#### Nasıl Çalışır?

1. Projenin terminalindeyken şu komutu çalıştırın:
    
    ```
    npx playwright codegen
    ```
    
2. Karşınıza iki tane pencere açılacak:
    - **Birincisi:** Boş bir Chromium tarayıcı penceresi.
    - **İkincisi:** "Playwright Inspector" adında, siz hareket ettikçe kodları canlı yazacak olan kod penceresi.
3. Tarayıcının adres çubuğuna test etmek istediğiniz yerel veya canlı sitenin URL'ini yazın (Örn: `http://localhost:3000`) ve Enter'a basın.
4. Sitede normal bir kullanıcı gibi butonlara tıklayın, formları doldurun. Sağ taraftaki Inspector penceresinde kodların TypeScript formatında oluştuğunu göreceksiniz.
5. İşlem bittiğinde Inspector penceresindeki **Copy** butonuna basarak oluşan ham kodları kopyalayın.

### 6- Yapay Zeka ile 3 Katmanlı Mimari Ayrıştırması

Kopyaladığınız ham kodları, sistemi bozmadan **UI, GÜVENLİK ve API** katmanlarına kusursuzca bölebilmesi için herhangi bir yapay zekaya aşağıdaki prompt ile birlikte gönderin:

> "Elimde Playwright codegen aracından alınmış ham bir test senaryosu var. Bu kodu, kurumsal yazılım mimarilerine uygun, esnek, sürdürülebilir ve kurşun geçirmez bir Test & DAST (Siber Güvenlik) otomasyon altyapısına dönüştürmeni istiyorum.

>Sistemi Page Object Model (POM), SOLID ve DRY prensiplerine tam uyumlu şekilde ayrıştırırken şu kurumsal standartlara kesinlikle sadık kalmalısın:
>Üretilen tüm kodlar TypeScript strict mode ve Playwright Best Practices ile uyumlu olmalıdır.
>Dosya isimlerini ayrı başlıklar altında vermeli, hiçbir kod bloğunu "..." veya "kodun devamı" diyerek yarım bırakmamalısın. Tüm dosyalar kopyala-yapıştır yapıldığında doğrudan çalışabilir olmalıdır.

>TABAN SAYFA KATMANI (pages/BasePage.ts)
>Tüm sayfa nesnelerinin türeyeceği bir abstract BasePage sınıfı oluştur.
>Playwright'ın "page" nesnesi korumalı (protected) olarak burada tutulmalıdır.
>İçerisinde isApiMode(), waitUntilLoaded(), takeScreenshot(), safeClick() gibi ortak yardımcı fonksiyonlar ve mod kontrolleri (API, UI, SECURITY) bulunmalıdır.

>HEDEF SAYFA KATMANI (pages/TargetPage.ts)
>BasePage sınıfından extend edilmelidir.
>Locator stratejisinde öncelik sırasıyla Playwright'ın getByRole, getByLabel, getByPlaceholder, getByText ve data-testid motorları kullanılmalıdır. En son çare olarak CSS/XPath locator kullanılmalıdır.
>Sayfa fonksiyonları, process.env.TEST_MODE === 'API' ise otomatik olarak erken dönüş (return) yaparak UI adımlarını işletmemelidir.

>TEMEL FONKSİYONEL ARAYÜZ TEST KATMANI (tests/ui.spec.ts)
>Sadece arayüz fonksiyonelliğini ve görsel doğrulamaları barındırmalıdır.
>TEST_MODE değişkeni 'API' veya 'SECURITY' ise test.skip() ile en başta tamamen es geçilmelidir.

>SİBER GÜVENLİK TEST KATMANI (tests/security.spec.ts)
>UI adımlarını koşturarak arkadaki OWASP ZAP Proxy'nin trafiği dinlemesini (Passive Scan) sağlamalıdır.
>TEST_MODE === 'API' ise test.skip() ile es geçilmelidir.
>Profesyonel Yaklaşım: Test senaryosunun sonuna, ZAP REST API uç noktalarına bağlanarak aktif taramayı tetikleyen, High/Medium seviye bir zafiyet bulunursa testi otomatik olarak "fail" eden ve siber güvenlik raporunu artifacts/security/ klasörü altına html/json olarak kaydeden kurumsal bir otomasyon akışı/taslağı ekle.

>SAF BACKEND API ENTEGRASYON KATMANI (tests/api.spec.ts)
>Tarayıcıyı ve Sayfa Nesnelerini kesinlikle KULLANMAMALIDIR. Playwright'ın saf request motorunu kullanmalıdır.
>TEST_MODE !== 'API' ise test.skip() ile es geçilmelidir.
>KRİTİK KURAL: Ham browser (codegen) kodundan backend API uç noktasının gerçek adresi, istek tipi (GET/POST), Body formatı (JSON/Form-urlencoded) veya Header/Token gereksinimleri kesin olarak çıkarılamıyorsa, kesinlikle sahte/uydurma endpoint'ler yazma! Bunun yerine test fonksiyonunun içine açık bir TODO açıklaması koy, tarayıcı ağ trafiğinden (HAR/DevTools) bu endpoint'in nasıl elde edileceğini yorum satırıyla belirt ve şablon bir request.newContext() yapısı kur (Status code, Response schema validation ve JSON doğrulama adımları şablon olarak bulunmalıdır).

>İşte İşlenecek Ham Codegen Çıktısı:
>[BURAYA CODEGEN'DEN GELEN HAM KODU YAPIŞTIR]


Yapay zekanın ürettiği bu kodları projenizdeki ilgili klasörlere (`pages/` ve `tests/`) kaydettikten sonra sistem artık kullanıma hazırdır!

Artık sistemi kullanan diğer kişilerin tek yapması gereken, neyi test etmek istiyorlarsa terminale şu komutlardan birini yazmaktır:

```
npm run test:ui        # Sadece Arayüz ve Tasarım testi yapar
npm run test:security  # ZAP Proxy'yi açar ve Siber Güvenlik Raporu üretir (bu kodu çalıştırdıktan sonra http://localhost:8082/zap/ adresine gitmemiz gerek )
npm run test:api       # Tarayıcıyı açmadan saf Backend API'lerini test eder
```
---

### SİBER GÜVENLİK MODU VE MANUEL RAPOR ALMA REHBERİ

Eğer sistemi Siber Güvenlik modunda çalıştırıyorsanız (`npm run test:security`), arka planda ayağa kalkan OWASP ZAP Proxy'nin tarayıcı trafiğini nasıl işlediğini canlı izleyebilir ve test sonunda kurumsal siber güvenlik raporunuzu manuel olarak yerel bilgisayarınıza indirebilirsiniz.

### Rapor Kaydetme Adımları:

1. Terminalde `npm run test:security` komutunu koşturun ve Playwright tarayıcısının işlemleri tamamlamasını bekleyin.
2. İşlemler bitince kendi bilgisayarınızdaki herhangi bir tarayıcıyı açın ve şu adrese gidin:
   **`http://localhost:8082/zap/`**
3. Karşınıza siber güvenlik uzmanlarının kullandığı **OWASP ZAP Webswing Kontrol Paneli** gelecektir.
4. Sol üstteki menüden sırasıyla şu adımları takip edin:
   * **Report (Rapor)** ➔ **Generate Report (Rapor Üret)** seçeneğine tıklayın.
5. **Açılan pencerede dosya yolu (File Path) kısmı önemli:**
   * Raporun yerel bilgisayarınızdaki `security-reports` klasörüne otomatik düşebilmesi için kayıt dizini başına mutlaka **`/zap/wrk/`** yazmalısınız.
   * *Örnek Kayıt Yolu:* `/zap/wrk/security_report.html`
6. **Generate Report** butonuna bastığınız an, Docker köprüsü sayesinde rapor saniyeler içinde kendi yerel projenizdeki `security-reports/` klasörünün altında belirecektir.