import { test, expect } from '@playwright/test';
import { DpuPage } from '../pages/DpuPage.js'; // Dosya adını değiştirmediysen burası aynı kalır kanka

test.skip(
process.env.TEST_MODE === 'API' || process.env.TEST_MODE === 'SECURITY' || process.env.TEST_MODE === 'AI',
'Sadece UI modunda DPÜ arayüz testleri koşturulur.'
);

test('DPÜ Kurumsal Portal Arayüz ve Navigasyon Testi', async ({ page }) => {
const dpu = new DpuPage(page);

console.log('DPÜ Ana Sayfasına gidiliyor...');
await dpu.gotoMainPage();

// 1. Doğrulama: Kurumsal logonun görünürlüğü
await expect(dpu.logo).toBeVisible({ timeout: 10000 });

console.log('Duyurular sekmesine geçiş yapılıyor...');
await dpu.clickDuyurular();

console.log('Haberler sekmesine geçiş yapılıyor...');
await dpu.clickHaberler();

console.log('Kurumsal arama motoru test ediliyor...');
await dpu.kurumsalAramaYap('Yazılım Mühendisliği');

// Başarılı durumun kurumsal kanıtı için ekran görüntüsü alıyoruz
await dpu.takeScreenshot('dpu_ui_test_success');
console.log('DPÜ UI Testi başarıyla tamamlandı, kanıt kaydedildi.');
});