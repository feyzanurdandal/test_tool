# Yazılım Test Aracı

## Proje Ne Yapar?
Bu proje; modern yazılım geliştirme süreçlerinde **Yapay Zeka Destekli Keşif (Autonomous Crawler)** ve **Kalite Güvence (QA / Test Otomasyonu)** süreçlerini tek bir çatı altında birleştiren yeni nesil bir test altyapısıdır.

Sistem, test senaryolarını yazarken manuel kodlama veya statik locator (CSS/XPath) bağımlılıklarını tamamen ortadan kaldırır. Yapay zeka ajanları vasıtasıyla dinamik olarak sitenin arayüzünü gözlemler ve insan dilinde yazılmış test adımlarını (`ai-prompts.json`) tarayıcı üzerinde otonom olarak koşturur.

## Hangi Teknolojileri Kullanır?
Sistem, birbirine entegre çalışan yüksek performanslı ve modern bir teknoloji yığını üzerine inşa edilmiştir:
* **Stagehand (Yapay Zeka Otomasyon Motoru):** Sayfadaki elementleri insan gibi gözlemleyen (`observe`), otomatik anlamlandıran ve bütçe dostu LLM modelleri (`gpt-4o-mini`) ile çalışan otonom web ajanı.
* **Playwright (TypeScript):** Modern, hızlı, paralel ve izole tarayıcı otomasyon altyapısı.
* **Zod:** Yapay zekadan dönen verilerin doğruluğunu ve tip güvenliğini (Type Safety) denetleyen veri şeması kütüphanesi.
* **Docker & Docker Compose:** Tüm test ve tarayıcı ortamını yerel bağımlılıklardan izole ederek her işletim sisteminde tek tıkla çalıştırılabilir kılan konteynerizasyon teknolojisi.

---
## Ön Gereksinimler

Projeyi bilgisayarınızda sorunsuz çalıştırabilmek için aşağıdaki araçların yüklü olması gerekir:
* **Node.js** (v18 veya üzeri)
* **Git** (Depoyu klonlamak veya yönetmek için)
---
## Canlıya Çıkmamış/Lokal Siteleri Test Ederken Dikkat Edilmesi Gerekenler:
1. Önce Siteyi Ayağa Kaldırın: Test motorunu (npm run test:ai-local) çalıştırmadan önce, test etmek istediğiniz kendi lokal projenizin (örneğin React, Vue veya .NET projenizin) bilgisayarda aktif olarak çalışıyor olması gerekir. Sistem boş bir porta istek atamaz.

2. URL Tanımlaması: config/constants.js dosyasındaki BASE_URL kısmına canlı site adresi yerine projenizin yerel adresini yazmalısınız.
   Örnek: export const BASE_URL = 'http://localhost:3000/';

3. Eğer site canlıdaysa doğrudan BASE_URL kısmına site URLi yazmak yeterlidir.

# Nasıl Kullanılır?
### 1. Proje Bağımlılıklarının Kurulumu
Terminali açın, projenin ana dizinine gelin ve Node.js paketlerini yüklemek için şu komutu çalıştırın:
```bash
npm install
```
### 2. Playwright Tarayıcı Çekirdeklerinin Kurulması
Playwright'ın testleri koşturabilmesi için bilgisayarınıza gerekli tarayıcı motorlarını (Chromium, WebKit, Firefox) indirmesi gerekir. Bunun için terminalde şu komutu çalıştırın:
```bash
npx playwright install
```
### 3. Konfigürasyon ve API Anahtarı Yapılandırması
Projenin güvenlik sebebiyle GitHub'a yüklenmeyen (gizli tutulan) bir yapılandırma dosyasına ihtiyacı vardır. Projenin kök dizininde yer alan config/ klasörünün içerisine constants.js adında bir dosya oluşturun ve içerisine aşağıdaki şablonu yapıştırarak test etmek istediğiniz hedef siteyi ve kendi API anahtarınızı tanımlayın:
```javascript
// config/constants.js

// Test etmek istediğiniz web sitesinin ana adresi (Örn: '[https://example.com/](https://example.com/)')
export const BASE_URL = process.env.BASE_URL || 'https://test-etmek-istediginiz-site-adresi/';

// Sistem içi otomatik entegrasyon ve API yapılandırmaları
export const ZAP_API_URL = process.env.ZAP_API_URL || 'http://localhost:8080';
export const ZAP_API_KEY = process.env.ZAP_API_KEY || 'zap-automation-secret-key-123';

// Stagehand motorunun arkada OpenAI GPT modelleriyle konuşabilmesi için gerekli anahtar
export const STAGEHAND_API_KEY = process.env.AI_STAGEHAND_API_KEY || 'BURAYA_KENDİ_OPENAI_API_KEYİNİZİ_YAZIN';

// Not: Bu dosya .gitignore tarafından korunmaktadır ve asla GitHub'a sızdırılmamalıdır.
```
STAGEHAND_API_KEY değişkeni, Stagehand motorunun arkada OpenAI GPT modelleriyle konuşabilmesi için zorunludur.

### 4. Test Adımlarının Belirlenmesi (ai-prompts.json Formatı)
Yapay zeka ajanının web sitesinde hangi adımları izleyeceğini ve neyi doğrulayacağını belirlemek için projenin kök dizinindeki config/ai-prompts.json dosyasını kullanırız. Yapay zekaya tamamen insan dilinde komutlar verebilirsiniz.

Dosyayı açın ve test senaryonuza göre şu formatta düzenleyin:
```JSON
{
  "targetUrl": "https://test-etmek-istediginiz-site-adresi.com",
  "steps": [
    { 
      "type": "act", 
      "instruction": "Focus and click on the input text field with placeholder 'Arama' or search icon." 
    },
    { 
      "type": "act", 
      "instruction": "Type the text 'Yazılım Mühendisliği' into that active input search box." 
    },
    { 
      "type": "act", 
      "instruction": "Press the 'Enter' key on your keyboard to submit the form." 
    },
    { 
      "type": "extract", 
      "instruction": "Verify if the text 'Sonuçlar' or relevant content appears anywhere in the main content area.", 
      "field": "hasResults" 
    }
  ]
}
```
Adım Tipleri Açıklaması:

- act: Yapay zekanın sayfada bir aksiyon almasını (tıklama, yazı yazma, tuşa basma) sağlar. instruction kısmına ne yapmasını istediğinizi İngilizce veya Türkçe net bir şekilde yazmanız yeterlidir.

- extract: Sayfadan veri çekme veya doğrulama adımıdır. Belirttiğiniz durumun gerçekleşip gerçekleşmediğini kontrol eder ve sonucu field kısmında verdiğiniz değişkene atayarak testin başarılı/başarısız olduğuna karar verir.

### 5. Yapay Zeka Test Motorunu Koşturma
config/ai-prompts.json dosyasındaki insan dilinde yazılmış adımları otonom olarak test etmek için şu komutu çalıştırmanız yeterlidir:
```bash
npm run test:ai-local
```
Test motoru tarayıcıyı açar, yapay zeka ajanları ai-prompts.json içindeki adımları tek tek analiz ederek sayfada otonom olarak simüle eder. Son aşamada ise beklenen sonuçların sayfada görünüp görünmediğini yapay zekanın extract metodu ile doğrulayarak testi tamamlar.
