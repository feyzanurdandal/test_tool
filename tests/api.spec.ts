import { test, expect, request } from '@playwright/test';
import { BASE_URL } from '../config/constants.js';

test.skip(
process.env.TEST_MODE !== 'API',
'API entegrasyon testleri sadece API modunda aktif olur.'
);

test('Backend API Entegrasyon ve Kontrol Testi', async () => {
/* 🚨 [TODO]: CRITICAL ARCHITECTURAL NOTE 🚨
Ham codegen çıktısı sadece tarayıcı etkileşimlerini kaydettiği için arka planda fırlatılan
HTTP isteklerinin ham gövdesi (Request Body), tam URL'i ve Header detayları tespit edilememiştir.

Ucu uydurma endpoint yazmamak adına buraya mimari bir TODO bırakılmıştır.
Gerçek API uç noktasını entegre etmek için şu adımları izleyin:
1. Tarayıcıda F12 Geliştirici Araçları -> Network (Ağ) sekmesini açın.
2. Arama kutusuna basıldığında giden saf HTTP paketini yakalayın (Method, Payload, URL).
3. Elde edilen verileri aşağıdaki şablona giydirerek testi tamamlayın.
*/

// Kurumsal API Test Bağlamı (Context) Doğru Yapılandırması
// Kurumsal API Test Bağlamı (Context) Doğru Yapılandırması
    const apiContext = await request.newContext({
        baseURL: BASE_URL,
        extraHTTPHeaders: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Automation-Source': 'Playwright-API-Agent'
        }
    });

// Temsili Şablon İstek Yapısı (Gerçek endpoint analiz edildikten sonra güncellenmelidir)
const response = await apiContext.get('/level1/frame', {
    params: {
        'query': 'test test test' 
    }
});

// Kurumsal API Assertion Katmanı
expect(response.status()).toBeLessThan(500); 
expect(response.ok()).toBeTruthy(); 

const responseBody = await response.text();
expect(responseBody.length).toBeGreaterThan(0);

// İşlem bittikten sonra context'i temiz bir şekilde kapatıyoruz
await apiContext.dispose();
});