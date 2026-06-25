import { test, expect } from '@playwright/test';

// 💡 MÜHENDİSLİK DÜZELTMESİ: Node16 ortamı için tür dönüşümü (Type Casting) uyguladık
const TEST_MODE = (process as any).env.TEST_MODE || 'UI';

test.describe('Saf Backend API Test Katmanı', () => {
  
  test.beforeAll(async () => {
    if (TEST_MODE !== 'API') {
      test.skip(); // Mod API değilse bu dosyayı komple es geç kanka
    }
    console.log('🤖 API Modu Aktif: Saf Backend entegrasyon testleri başlatılıyor...');
  });

  test('GET /posts - Veri listeleme ve Şema Doğrulama', async ({ request }) => {
    const response = await request.get('https://jsonplaceholder.typicode.com/posts/1');
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    console.log('📥 Gelen API Yanıtı:', responseBody);

    expect(responseBody).toHaveProperty('id', 1);
    expect(responseBody).toHaveProperty('userId');
    expect(responseBody).toHaveProperty('title');
  });

  test('POST /posts - Yeni Veri Ekleme ve Durum Kontrolü', async ({ request }) => {
    const response = await request.post('https://jsonplaceholder.typicode.com/posts', {
      data: {
        title: 'CTI Hub Test Başlığı',
        body: 'Mühendislik test otomasyonu hatları tıkır tıkır çalışıyor.',
        userId: 44
      }
    });

    expect(response.status()).toBe(201);
    
    const responseBody = await response.json();
    console.log('📤 API Ekleme Sonucu:', responseBody);

    expect(responseBody.title).toBe('CTI Hub Test Başlığı');
  });
});