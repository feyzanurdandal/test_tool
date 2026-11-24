// Yapay zeka yorumunu yeniden yorumlatma: gerçek server.js + sahte DPU + OpenAI uyumlu sahte yapay zeka (gerçek servislere dokunulmaz).
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
const { withAnalysisBlock } = await import('../services/analysisBlock.js');

const hazir = (senaryoSonucu) => ({ durum: 'hazir', ozet: 'x', degerlendirme: 'tutarli', senaryoSonucu, hataliAdim: '', sayfaMesaji: '', neden: '', oneriler: [], guven: 'orta' });
const rep = (id, projectId, analysis, status = 'SUCCESS') => ({ id, project_id: projectId, scenario_name: 'giris', test_tipi: 'UI', status, created_at: new Date().toISOString(),
    log_content: analysis ? withAnalysisBlock('[ÇÖZÜM] adım 1: yapay zeka (1. deneme) — toplam 1.0 sn\n  1 passed', analysis) : '[ÇÖZÜM] adım 1: yapay zeka (1. deneme) — toplam 1.0 sn\n  1 passed' });

const db = {
    kullanicilar: [
        { id: 1, kullanici_adi: 'admin', sifre: bcrypt.hashSync('admin-parola-123', 4), rol: 'ADMIN' },
        { id: 2, kullanici_adi: 'veli', sifre: bcrypt.hashSync('veli-parola-1234', 4), rol: 'USER' },
    ],
    projeler: [{ id: 1, proje_adi: 'Alfa', hata_anahtar_kelimeleri: '' }, { id: 2, proje_adi: 'Beta', hata_anahtar_kelimeleri: '' }],
    kullanici_projeleri: [{ id: 1, kullanici_adi: 'veli', proje_adi: 'Beta' }],
    senaryolar: [{ id: 10, project_id: 1, senaryo_adi: 'giris', hedef_url: 'https://1.1.1.1/', test_tipi: 'UI', beklenen_sonuc: 'SUCCESS_EXPECTED',
        adimlar: JSON.stringify({ targetUrl: 'https://1.1.1.1/', steps: [{ type: 'act', instruction: 'Click on the button labeled "kaydet-dugmesi"' }] }) }],
    raporlar: [
        rep(1, 1, { durum: 'uretilemedi', neden: 'Yapay zeka sağlayıcısının kotası/limiti doldu.' }),
        rep(2, 1, hazir('basarili')),
        rep(3, 1, null),
        rep(4, 1, hazir('belirsiz')),
        rep(5, 1, { durum: 'bekliyor', baslangic: new Date().toISOString() }),
        rep(6, 1, { durum: 'bekliyor', baslangic: new Date(Date.now() - 20 * 60e3).toISOString() }),
        rep(7, 1, { durum: 'uretilemedi' }),
        rep(8, 1, { durum: 'uretilemedi' }),
    ],
    ayarlar: [
        { id: 1, ayar_anahtar: 'translator_api', ayar_deger: 'openai', ayar_model: null },
        { id: 2, ayar_anahtar: 'openai', ayar_deger: encrypt('sk-test-anahtar'), ayar_model: 'gpt-4o-mini' },
    ],
};
const readBody = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });
const dpu = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const parts = url.pathname.replace('/api/v1/', '').split('/');
    if (url.pathname === '/api/v1/auth/token') return send({ success: true, data: { token: 't', expires_at: new Date(Date.now() + 36e5).toISOString() } });
    const table = db[parts[0]]; if (!table) return send({ success: false }, 404);
    if (req.method === 'GET') { const l = Number(url.searchParams.get('limit') || 100), p = Number(url.searchParams.get('page') || 1); return send({ success: true, data: table.slice((p - 1) * l, p * l) }); }
    if (req.method === 'POST') { const row = { id: 'uid_' + Math.random().toString(36).slice(2, 8), ...(await readBody(req)) }; table.push(row); return send({ success: true, data: row }); }
    const i = table.findIndex(r => String(r.id) === decodeURIComponent(parts[1])); if (i < 0) return send({ success: false }, 404);
    if (req.method === 'PATCH') { Object.assign(table[i], await readBody(req)); return send({ success: true, data: table[i] }); }
    if (req.method === 'DELETE') { table.splice(i, 1); return send({ success: true }); }
    send({ success: false }, 405);
});

const received = []; let llmMode = 200;
const llm = http.createServer(async (req, res) => {
    const body = await readBody(req); received.push(body);
    if (llmMode !== 200) { res.writeHead(llmMode, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-anahtar', type: 'invalid_request_error' } })); }
    const content = JSON.stringify({ ozet: 'Yeniden yorumlandı.', degerlendirme: 'tutarli', senaryoSonucu: 'basarili', hataliAdim: '', sayfaMesaji: '', neden: '', oneriler: [], guven: 'orta' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 1, model: 'fake', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
});

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-reui-'));
let server, base;
before(async () => {
    await new Promise(r => dpu.listen(0, '127.0.0.1', r));
    await new Promise(r => llm.listen(0, '127.0.0.1', r));
    const port = 42000 + Math.floor(Math.random() * 7000);
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port), NODE_ENV: 'test', SESSION_DIR: sessionDir, DPU_BASE_URL: `http://127.0.0.1:${dpu.address().port}`,
            OPENAI_BASE_URL: `http://127.0.0.1:${llm.address().port}/v1`, ALLOWED_TEST_HOSTS: '1.1.1.1', AI_ANALYSIS_RETRY_DELAY_MS: '10' } });
    let out = '';
    server.stderr.on('data', d => { out += d; });
    await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Sunucu başlamadı:\n' + out)), 15000);
        server.stdout.on('data', d => { out += d; if (String(d).includes('aktif')) { clearTimeout(t); resolve(); } });
    });
});
after(() => { server?.kill(); dpu.close(); llm.close(); server?.once('exit', () => fs.rmSync(sessionDir, { recursive: true, force: true })); });

const H = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };
import { chromium } from 'playwright-core';

test('rapor penceresi: üretilemeyen yorum için neden + "Yeniden yorumlat"; kesin sonuçta düğme yok (Chromium)', async () => {
    const mk = (id, name, analysis) => ({ id, project_id: 1, scenario_name: name, test_tipi: 'UI', status: 'SUCCESS', created_at: new Date(Date.now() - id * 60000).toISOString(),
        log_content: withAnalysisBlock('[ÇÖZÜM] adım 1: yapay zeka (1. deneme) — toplam 1.0 sn\n  1 passed', analysis) });
    db.raporlar.length = 0;
    db.raporlar.push(
        mk(1, 'uretilemedi-raporu', { durum: 'uretilemedi', neden: 'Yapay zeka sağlayıcısının kotası/limiti doldu (veya bakiye yetersiz).' }),
        mk(2, 'kesin-rapor', hazir('basarili')),
        mk(3, 'belirsiz-rapor', hazir('belirsiz')),
    );
    const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM_PATH || process.env.CHROME_PATH || chromium.executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'] });
    try {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
        const lr = await ctx.request.post(base + '/api/auth/login', { headers: H, data: { username: 'admin', password: 'admin-parola-123' } });
        assert.equal(lr.status(), 200);
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + '/');
        await page.waitForSelector('#project-dropdown option[value="Alfa"]', { state: 'attached', timeout: 10000 });
        await page.selectOption('#project-dropdown', 'Alfa');
        await page.click('button[data-target="view-reports"][data-test-type="UI"]');
        await page.waitForSelector('#reports-list-accordion > div');
        const open = async (name) => { await page.locator('#reports-list-accordion > div', { hasText: name }).click(); await page.waitForSelector('#modal-report-ai-card:not(.hidden)'); };
        const close = async () => { await page.click('#close-report-modal-btn'); };

        // kesin sonuç: düğme yok
        await open('kesin-rapor');
        assert.equal(await page.locator('#modal-report-ai-retry').count(), 0);
        await close();

        // üretilemeyen yorum: neden görünür, düğme var; tıklayınca hazırlanıyor → sonuç
        await open('uretilemedi-raporu');
        assert.match(await page.locator('#modal-report-ai-summary').innerText(), /Yorum üretilemedi/);
        assert.match(await page.locator('#modal-report-ai-cause').innerText(), /kotası\/limiti doldu/);
        await page.click('#modal-report-ai-retry');
        await page.waitForFunction(() => document.getElementById('modal-report-ai-summary').textContent.includes('Yeniden yorumlandı') , null, { timeout: 20000 });
        assert.equal(await page.locator('#modal-report-ai-retry').count(), 0, 'kesin sonuç gelince düğme kalkar');
        assert.match(await page.locator('#modal-report-chips').innerText(), /SENARYO:\s*BAŞARILI/);
        if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/yeniden-yorum.png' });
        await close();
        // liste etiketi de güncellenir
        await page.waitForFunction(() => [...document.querySelectorAll('#reports-list-accordion > div')].find(d => d.innerText.includes('uretilemedi-raporu'))?.innerText.includes('BAŞARILI'), null, { timeout: 15000 });

        // belirsiz yorum: düğme var
        await open('belirsiz-rapor');
        assert.equal(await page.locator('#modal-report-ai-retry').count(), 1);
        assert.deepEqual(errors, [], 'sayfa hatası olmamalı');
    } finally { await browser.close(); }
});
