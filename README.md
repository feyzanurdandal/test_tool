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

## SİBER GÜVENLİK MODU VE MANUEL RAPOR ALMA REHBERİ

Eğer sistemi Siber Güvenlik modunda çalıştırıyorsanız (`npm run test:security`), arka planda ayağa kalkan OWASP ZAP Proxy'nin tarayıcı trafiğini nasıl işlediğini canlı izleyebilir ve test sonunda kurumsal siber güvenlik raporunuzu manuel olarak yerel bilgisayarınıza indirebilirsiniz.

### Rapor Kaydetme Adımları:

1. Terminalde `npm run test:security` komutunu koşturun ve Playwright tarayıcısının işlemleri tamamlamasını bekleyin.
2. İşlemler bitince kendi bilgisayarınızdaki herhangi bir tarayıcıyı açın ve şu adrese gidin:
   **`http://localhost:8082/zap/`**
3. Karşınıza siber güvenlik uzmanlarının kullandığı **OWASP ZAP Webswing Kontrol Paneli** gelecektir.
4. Sol üstteki menüden sırasıyla şu adımları takip edin:
   * **Report (Rapor)** ➔ **Generate Report (Rapor Üret)** seçeneğine tıklayın.
5. **Açılan pencerede dosya yolu (File Path) kısmı EN KRİTİK yerdir:**
   * Raporun yerel bilgisayarınızdaki `security-reports` klasörüne otomatik düşebilmesi için kayıt dizini başına mutlaka **`/zap/wrk/`** yazmalısınız!
   * *Örnek Kayıt Yolu:* `/zap/wrk/security_report.html`
6. **Generate Report** butonuna bastığınız an, Docker köprüsü sayesinde rapor saniyeler içinde kendi yerel projenizdeki `security-reports/` klasörünün altında belirecektir!

---

## Nasıl Kullanılır?

### ÖN KOŞUL: 
Testleri veya 'codegen' aracını başlatmadan önce, test etmek istediğiniz ana projenizin (web sitenizin) yerelde veya bir sunucuda aktif olarak ÇALIŞIYOR olması gerekmektedir. Test aracı boş bir porta istek atamaz; hedef sitenin açık olması gerekir.

### 1- Mevcut projenin ana dizinindeyken terminalden şu komutu koşturarak TypeScript ve gerekli kütüphane tiplerini projeye kur:
bash
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

Hedef projenizin `package.json` dosyasını açın ve içerisindeki `scripts` bölümüne şu otomasyon komutlarını ekleyin:bash
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

1. Projenin terminalindeyken şu komutu çalıştırın:Bash
    
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

Artık sistemi kullanan diğer kişilerin tek yapması gereken, neyi test etmek istiyorlarsa terminale şu komutlardan birini yazmaktır:
bash
```
npm run test:ui        # Sadece Arayüz ve Tasarım testi yapar
npm run test:security  # ZAP Proxy'yi açar ve Siber Güvenlik Raporu üretir (Rapor UI üzerinden manuel indirilecek)
npm run test:api       # Tarayıcıyı açmadan saf Backend API'lerini test eder
```