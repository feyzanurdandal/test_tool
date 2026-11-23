// Rapor listesi ve penceresi: ADIM DURUMU + SENARYO SONUCU (gerçek Chromium + sahte DPU). Çalıştırma: node --test security-tests/report-ui.test.js
// Çeviri isteği: yer/kapsam kuralı modele GERÇEKTEN iletiliyor mu, Türkçe satırdaki konum ifadesi kullanıcı mesajında korunuyor mu?
// Gerçek server.js + sahte DPU + OpenAI uyumlu sahte yapay zeka (OPENAI_BASE_URL). Modelin davranışını DEĞİL, istemin içeriğini doğrular.
import '../unit-tests/setup-env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { encrypt } = await import('../utils/cryptoHelper.js');
let nextId = 100;
const db = {
    kullanicilar: [{ id: 1, kullanici_adi: 'admin', sifre: bcrypt.hashSync('admin-parola-123', 4), rol: 'ADMIN' }],
    projeler: [{ id: 1, proje_adi: 'Alfa', hata_anahtar_kelimeleri: '' }],
    kullanici_projeleri: [], senaryolar: [], raporlar: [],
    ayarlar: [{ id: 1, ayar_anahtar: 'test_runner_api', ayar_deger: 'openai', ayar_model: null },
              { id: 2, ayar_anahtar: 'translator_api', ayar_deger: 'openai', ayar_model: null },
              { id: 3, ayar_anahtar: 'openai', ayar_deger: encrypt('sk-test-anahtar'), ayar_model: 'gpt-4o-mini' }],
};
const readBody = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });
const dpu = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const parts = url.pathname.replace('/api/v1/', '').split('/');
    if (url.pathname === '/api/v1/auth/token') return send({ success: true, data: { token: 't', expires_at: new Date(Date.now() + 36e5).toISOString() } });
    const table = db[parts[0]]; if (!table) return send({ success: false }, 404);
    if (req.method === 'GET') { const l = Number(url.searchParams.get('limit') || 100), p = Number(url.searchParams.get('page') || 1); return send({ success: true, data: table.slice((p - 1) * l, p * l) }); }
    if (req.method === 'POST') { const row = { id: nextId++, ...(await readBody(req)) }; table.push(row); return send({ success: true, data: row }); }
    const i = table.findIndex(r => String(r.id) === decodeURIComponent(parts[1])); if (i < 0) return send({ success: false }, 404);
    if (req.method === 'PATCH') { Object.assign(table[i], await readBody(req)); return send({ success: true, data: table[i] }); }
    if (req.method === 'DELETE') { table.splice(i, 1); return send({ success: true }); }
    send({ success: false }, 405);
});

const received = [];
const llm = http.createServer(async (req, res) => {
    const body = await readBody(req);
    received.push(body);
    const content = JSON.stringify({ targetUrl: 'https://1.1.1.1/', steps: [{ type: 'act', instruction: 'Click on the button labeled "detay" located at the very top of the page (in the page header, outside any table row)' }] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 1, model: 'fake', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
});

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-ui-'));
let server, base;
before(async () => {
    await new Promise(r => dpu.listen(0, '127.0.0.1', r));
    await new Promise(r => llm.listen(0, '127.0.0.1', r));
    const port = 42000 + Math.floor(Math.random() * 7000);
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port), NODE_ENV: 'test', SESSION_DIR: sessionDir, DPU_BASE_URL: `http://127.0.0.1:${dpu.address().port}`,
            OPENAI_BASE_URL: `http://127.0.0.1:${llm.address().port}/v1`, ALLOWED_TEST_HOSTS: '1.1.1.1' } });
    let out = '';
    server.stderr.on('data', d => { out += d; });
    await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Sunucu başlamadı:\n' + out)), 10000);
        server.stdout.on('data', d => { out += d; if (String(d).includes('aktif')) { clearTimeout(t); resolve(); } });
    });
});
after(() => { server?.kill(); dpu.close(); llm.close(); server?.once('exit', () => fs.rmSync(sessionDir, { recursive: true, force: true })); });



import { chromium } from 'playwright-core';
const { withAnalysisBlock } = await import('../services/analysisBlock.js');
const hazir = (senaryoSonucu) => ({ durum: 'hazir', ozet: 'Kaydet sonrası doğrulama hatası çıktı.', degerlendirme: 'tutarli', senaryoSonucu, hataliAdim: '18. adım — Return the message shown in the pop up',
    sayfaMesaji: 'Sözleşme bitiş tarihi zorunludur.', neden: 'Tarih alanları boş (test verisi eksik).', oneriler: ['Tarih adımlarını ekleyin'], guven: 'yuksek' });
const headers = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };

test('rapor listesi ve penceresi iki sonucu gösterir (Chromium)', async () => {
    const baseLog = '[ÇÖZÜM] adım 1: yapay zeka (1. deneme) — toplam 1.0 sn\n  1 passed';
    const mk = (id, name, tip, status, analysis) => ({ id, project_id: 1, scenario_name: name, test_tipi: tip, status, created_at: new Date(Date.now() - id * 60000).toISOString(),
        log_content: analysis ? withAnalysisBlock(baseLog, analysis) : baseLog });
    db.raporlar.push(mk(1, 'kayit-formu', 'UI', 'SUCCESS', hazir('basarisiz')), mk(2, 'giris', 'UI', 'SUCCESS', hazir('basarili')),
        mk(3, 'bekleyen', 'UI', 'SUCCESS', { durum: 'bekliyor', baslangic: new Date().toISOString() }), mk(4, 'eski', 'UI', 'SUCCESS', null), mk(5, 'adim-hatasi', 'UI', 'FAILED', null));
    const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM_PATH || process.env.CHROME_PATH || chromium.executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'] });
    try {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
        const lr = await ctx.request.post(base + '/api/auth/login', { headers, data: { username: 'admin', password: 'admin-parola-123' } });
        assert.equal(lr.status(), 200);
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + '/');
        await page.waitForSelector('#project-dropdown option[value="Alfa"]', { state: 'attached', timeout: 10000 });
        await page.selectOption('#project-dropdown', 'Alfa');
        await page.click('button[data-target="view-reports"][data-test-type="UI"]');
        await page.waitForSelector('#reports-list-accordion > div', { timeout: 10000 });
        const text = await page.locator('#reports-list-accordion').innerText();
        assert.match(text, /kayit-formu/);
        assert.match(text, /Senaryo:\s*BAŞARISIZ/i);
        assert.match(text, /ADIMLAR:\s*TAMAMLANDI/);
        assert.match(text, /Senaryo:\s*DEĞERLENDİRİLİYOR/i);
        if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/liste.png' });
        const stats = await page.evaluate(() => ({ p: document.getElementById('stat-passed-reports').textContent, f: document.getElementById('stat-failed-reports').textContent }));
        assert.deepEqual(stats, { p: '2', f: '2' }, 'başarılı: giris+eski, başarısız: kayit-formu+adim-hatasi');
        await page.locator('#reports-list-accordion > div', { hasText: 'kayit-formu' }).click();
        await page.waitForSelector('#modal-report-chips span', { timeout: 10000 });
        const chips = await page.locator('#modal-report-chips').innerText();
        assert.match(chips, /ADIMLAR:\s*TAMAMLANDI/);
        assert.match(chips, /Senaryo:\s*BAŞARISIZ/i);
        assert.match(await page.locator('#modal-report-ai-step').innerText(), /18\. adım/);
        assert.match(await page.locator('#modal-report-ai-msg').innerText(), /zorunludur/);
        if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/pencere.png' });
        await page.click('#close-report-modal-btn');
        await page.selectOption('#report-filter-status', 'UNKNOWN');
        assert.match(await page.locator('#reports-list-accordion').innerText(), /bekleyen/);
        assert.deepEqual(errors, [], 'sayfa hatası olmamalı');
    } finally { await browser.close(); }
});
