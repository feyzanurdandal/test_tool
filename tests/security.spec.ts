import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ZAP_API_URL, ZAP_API_KEY } from '../config/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Haritayı okuyoruz ki ZAP'a hangi URL'lerde neler olduğunu bildirebilelim
const selectorMap = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config/selectors.json'), 'utf-8'));

test('Otonom ZAP Taraması - Tam Otomatik Saldırı', async ({ request }) => {
    const targetUrl = 'https://www.dpu.edu.tr/';
    console.log(`🚀 ZAP Active Scan Motoru başlatılıyor... Hedef: ${targetUrl}`);

    // 1. ZAP'a "Bu siteyi tanı" diyoruz (Spider/Crawler)
    await request.get(`${ZAP_API_URL}/JSON/spider/action/scan/`, {
        params: { apikey: ZAP_API_KEY, url: targetUrl }
    });

    // 2. ZAP'ın gerçek "saldırı" motorunu tetikliyoruz (Active Scan)
    // ZAP bu aşamada kendi içindeki 50+ saldırı yöntemini (SQLi, XSS, RCE, vb.) dener.
    const activeScan = await request.get(`${ZAP_API_URL}/JSON/ascan/action/scan/`, {
        params: { apikey: ZAP_API_KEY, url: targetUrl, recurse: 'true' }
    });

    expect(activeScan.ok(), 'ZAP taraması başlatılamadı!').toBeTruthy();

    // 3. Taramayı izliyoruz (ZAP'ın %100 bitmesini beklemek yerine log atıyoruz)
    console.log("🛡️ ZAP aktif taraması şu an arka planda çalışıyor. Raporu ZAP UI üzerinden alabilirsin.");
});