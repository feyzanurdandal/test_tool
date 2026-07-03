# Yapay Zeka Destekli Test Otomasyon Aracı
## Proje Ne Yapar?
Bu proje; modern yazılım geliştirme süreçlerinde Yapay Zeka Destekli Keşif (Autonomous Crawler) ve Kalite Güvence (QA / Test Otomasyonu) süreçlerini tek bir çatı altında birleştiren yeni nesil bir test altyapısıdır.

Sistem, test senaryolarını yazarken manuel kodlama veya statik locator (CSS/XPath) bağımlılıklarını tamamen ortadan kaldırır. Yapay zeka ajanları vasıtasıyla dinamik olarak sitenin arayüzünü gözlemler ve insan dilinde yazılmış test adımlarını tarayıcı üzerinde otonom olarak koşturur. Klasik loglama sistemlerinin aksine, test esnasında üretilen karmaşık terminal çıktılarını anlamlı mikro işlem adımlarına bölerek web arayüzü üzerinden kronolojik bir zaman akışı halinde gözlemlenebilir kılar.

## Hangi Teknolojileri Kullanır?
Sistem, birbirine entegre çalışan yüksek performanslı ve modern bir teknoloji yığını üzerine inşa edilmiştir:

- Stagehand (Yapay Zeka Otomasyon Motoru): Sayfadaki elementleri insan gibi gözlemleyen, otomatik anlamlandıran ve bütçe dostu LLM modelleri (gpt-4o-mini) ile çalışan otonom web ajanı.

- Playwright (TypeScript): Modern, hızlı, paralel ve izole tarayıcı otomasyon altyapısı.

- TSX (TypeScript Execute): TypeScript dosyalarının runtime üzerinde derlenmeden, havada anlık olarak çözümlenip koşturulmasını sağlayan modern motor altyapısı.

- Express.js: Test tetiklemelerini, senaryo kayıtlarını ve üretilen .txt raporlarının web paneli üzerinden analiz edilmesini sağlayan modüler backend katmanı.

- Zod: Yapay zekadan dönen verilerin doğruluğunu ve tip güvenliğini denetleyen veri şeması kütüphanesi.

## Ön Gereksinimler (Sıfırdan Kurulum Rehberi)
Bilgisayarınızda daha önce hiçbir yazılım aracı veya kodlama ortamı kurulu değilse, projeyi çalıştırabilmek için öncelikle aşağıdaki iki temel programı kurmanız gerekir.

1. Node.js Kurulumu:
- Node.js, bu projenin arka planda çalışmasını sağlayan ana motor sistemidir.
- Node.js Resmi Sitesi adresine gidin.
- Ekranda görünen "LTS" (Uzun Süreli Destek) sürümünü bilgisayarınıza indirin.
- İnen kurulum dosyasını açıp ileri (Next) adımlarını takip ederek standart bir program gibi bilgisayarınıza kurun.

2. Git Kurulumu:
- Git, projenin kaynak kodlarını indirmenizi ve yönetmenizi sağlayan sistemdir.
- Git Resmi Sitesi adresine gidin.
- Bilgisayarınızın işletim sistemine uygun (Windows/Mac/Linux) olan kurulum dosyasını indirin ve kurun.

## Kurulum ve Konfigürasyon
1. Proje Klasörünün Açılması ve Bağımlılıkların Kurulumu
Projenin indirildiği klasörün içerisine girin. Klasörün boş bir yerinde sağ tıklayarak terminali (Windows için Komut İstemi / PowerShell veya Git Bash, Mac için Terminal) açın ve gerekli kütüphaneleri yüklemek üzere şu komutu koşturun:

```Bash
npm install
```
2. Playwright Tarayıcı Çekirdeklerinin Kurulması
Yapay zekanın testleri tarayıcıda koşturabilmesi için bilgisayarınıza izole tarayıcı motorlarının indirilmesi gerekir. Bunun için terminalde şu komutu çalıştırın:

```Bash
npx playwright install
```
3. Çevre Değişkenlerinin Yapılandırması (.env)
Projenin güvenlik sebebiyle GitHub gibi açık ortamlara yüklenmeyen, gizli tutulması gereken bir yapılandırma dosyasına ihtiyacı vardır.

Projenin kök dizininde (ana klasörde) .env adında yeni bir dosya oluşturun.

Dosyanın içerisine aşağıdaki şablonu yapıştırın ve kendi API anahtarınızı tanımlayın:

```JavaScript
PORT=3000
OPENAI_API_KEY=sk-proj-BURAYA_KENDI_OPENAI_API_KEYINIZI_YAZIN
N8N_BASE_URL=http://localhost:5678
NODE_FUNCTION_ALLOW_BUILTIN=fs,path
N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false
```
Not: Bu dosya .gitignore tarafından korunmaktadır ve kesinlikle harici ortamlara sızdırılmamalıdır. Sistemdeki constants mimarisi verileri doğrudan bu dosyadan çeker.

## Olası Kurulum Hataları ve Çözümleri
Projeyi ilk kez çalıştırırken terminalde TypeScript veya modül bulunamadı hataları alırsanız, sistemi ayağa kaldırmadan önce ilgili terminal penceresinde aşağıdaki komutları koşturun:

- Cannot find package 'dotenv' veya ERR_MODULE_NOT_FOUND hatası alırsanız:

```Bash
npm install dotenv
```
- from 'dotenv' altında kırmızı çizgi yanarsa veya TypeScript tip hatası alırsanız:

```Bash
npm install @types/node --save-dev
```
- Node.js ortamında TypeScript dosyalarını havada çalıştırmak için gerekli ana motor eksikse:

```Bash
npm install tsx --save-dev
```
## İlk Defa Çalıştıracaklar İçin Adım Adım İşletim Rehberi
Projenin entegre yapısını (Express backend ve n8n workflow motoru) lokal ortamda sorunsuz koşturmak için aşağıdaki sıralamayı birebir takip edin:

### Adım 1: Express Sunucusunu Başlatma
Önce test adımlarını kaydedecek ve raporları sunacak olan ana backend sunucumuzu ayağa kaldırıyoruz. Projenin ana klasöründe bir terminal açın ve şu komutu çalıştırın:

```Bash
npx tsx server.js
```
Terminalde ** Sunucu `http://localhost:3000/create` üzerinde aktif ** onay yazısını gördüğünüzde sunucunuz hazır demektir. Bu terminal penceresini kapatmayın, arka planda açık kalmalıdır.

### Adım 2: n8n Otomasyon Motorunu Başlatma
Sistemde n8n'i küresel olarak kurmakla uğraşmamak ve proje için optimize edilmiş çevre değişkenleriyle ayağa kaldırmak için package.json içerisine özel bir kısayol scripti eklenmiştir.

Proje ana klasöründe yeni bir terminal penceresi açın ve doğrudan şu komutu çalıştırın:

```Bash
npm run n8n:start
```
Bu komut, .env dosyasındaki n8n izinlerini ve özel yapılandırmaları arkaya alarak otomasyon motorunu `http://localhost:5678` adresi üzerinde tetikleyecektir.

### Adım 3: Workflow Dosyalarının n8n İçerisine Aktarılması
Proje klasörünün içerisinde yer alan n8n/ klasörünün altında hazır otomasyon senaryoları .json formatında yer almaktadır.

1. Tarayıcınızda `http://localhost:5678` adresine giderek n8n arayüzünü açın.

2. Sağ üst köşedeki menüden "Import from File" (Dosyadan Aktar) seçeneğini seçin.

3. Proje klasörünüzün içindeki n8n/ klasöründe yer alan workflow dosyalarını tek tek içeri aktarın. n8n tuvali üzerinde tüm test düğümleri otomatik olarak belirecektir.

### Adım 4: Rapor Webhook Workflow'unu Canlıya (Active) Alma
İçeri aktardığınız workflow'lardan Raporları Okumak/İşlemek için yazılmış ve içinde Webhook node'u barındıran workflow'un sürekli dinlemede kalması şarttır. Diğer senaryo oluşturma veya tetikleme workflow'larını canlıya almanıza gerek yoktur; onlar zaten Express backend üzerinden anlık tetiklenecektir.

1. İçinde Webhook düğümü olan raporlama workflow'unu n8n üzerinde açın.

2. Sağ üst köşede yer alan "Active" (veya "On") anahtarını açık konuma getirin.

* Bu işlem yapılmazsa, ilk istek dışındaki ardışık rapor talepleri havada kalacak ve Express paneli n8n'den gelen analiz loglarını yakalayamayacaktır.

### Adım 5: Senaryoların n8n Üzerinden Başlatılması ve Rapor İzleme
Sistemde test senaryolarını n8n arayüzü üzerinden tetiklemek çok daha temiz ve izlenebilir bir akış sağlar:

- n8n tuvali üzerindeki tetikleyici node'u kullanarak test otomasyonunu başlatın.

Arka planda Playwright/Stagehand motoru otonom olarak adımları koştururken, n8n üzerinden akışı canlı izleyebilirsiniz.

Test tamamlandığında `http://localhost:3000/api/scenarios/reports-panel` adresine giderek üretilen temiz logları ve mikro işlem adımlarını web arayüzünden analiz edin.

## Test Senaryolarının Belirlenmesi (Senaryo JSON Formatı)
Sistem, test adımlarını ve hedef web sitesini scenarios/ klasörü altında JSON formatında saklar. Bu dosyalar n8n entegrasyonu üzerinden otomatik oluşturulabileceği gibi, manuel olarak da şu yapıda hazırlanabilir veya düzenlenebilir:

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

act: Yapay zekanın sayfada bir aksiyon almasını (tıklama, yazı yazma, tuşa basma) sağlar. instruction kısmına ne yapmasını istediğinizi net bir şekilde yazmanız yeterlidir.

extract: Sayfadan veri çekme veya doğrulama adımıdır. Belirttiğiniz durumun gerçekleşip gerçekleşmediğini kontrol eder, sonucu field kısmında verdiğiniz değişkene atayarak testin doğruluğunu denetler.