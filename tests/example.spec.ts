import { test, expect } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';

test('Evrensel UI, Performans, Güvenlik ve API Testi', async ({ page }, testInfo) => {
  test.setTimeout(120000);

  // 1. Hedef Sayfaya Git
  await page.goto('https://demo.playwright.dev/todomvc');

  // [MÜHENDİSLİK ÇÖZÜMÜ] Eğer ortamda ZAP Proxy (HTTP_PROXY) varsa Lighthouse'u es geç.
  // Çünkü ZAP'ın siber güvenlik sertifikası Lighthouse'un ölçüm yapmasını engeller.
  const hasProxy = process.env.HTTP_PROXY ? true : false;

  if (testInfo.project.name === 'chromium' && !hasProxy) {
    console.log('📊 Performans Katmanı: Lighthouse analizi başlatılıyor...');
    await playAudit({
      page: page,
      thresholds: { performance: 50, accessibility: 50, 'best-practices': 50 },
      port: 9222,
    });
  } else {
    console.log('🛡️ Siber Güvenlik Modu Aktif: Trafik OWASP ZAP üzerinden filtreleniyor, Lighthouse güvenli sertifika koruması sebebiyle bypass edildi.');
  }

  // 3. [FRONTEND KATMANI] UI İşlemleri
  const todoInput = page.locator('.new-todo');
  await todoInput.fill('Keploy ve OWASP ZAP Entegre Edildi');
  await todoInput.press('Enter');

  // 4. [TASARIM KATMANI] Görsel Doğrulama
  await expect(page).toHaveScreenshot('todomvc-ana-ekran.png');
});