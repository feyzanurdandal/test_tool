// Senaryo grupları: gerçek server.js + sahte DPU (gerçek DPU'ya dokunulmaz).
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

let nextId = 100;
const db = {
    kullanicilar: [
        { id: 1, kullanici_adi: 'admin', sifre: bcrypt.hashSync('admin-parola-123', 4), rol: 'ADMIN' },
        { id: 2, kullanici_adi: 'ayse', sifre: bcrypt.hashSync('ayse-parola-1234', 4), rol: 'USER' },
        { id: 3, kullanici_adi: 'veli', sifre: bcrypt.hashSync('veli-parola-1234', 4), rol: 'USER' },
    ],
    projeler: [{ id: 1, proje_adi: 'Alfa', hata_anahtar_kelimeleri: '' }, { id: 2, proje_adi: 'Beta', hata_anahtar_kelimeleri: '' }],
    kullanici_projeleri: [{ id: 1, kullanici_adi: 'ayse', proje_adi: 'Alfa' }, { id: 2, kullanici_adi: 'veli', proje_adi: 'Beta' }],
    senaryolar: [
        ...['giris', 'cikis', 'kayit', 'arama', 'profil'].map((n, i) => ({ id: 10 + i, project_id: 1, senaryo_adi: n, hedef_url: 'https://1.1.1.1/', adimlar: '{"steps":[]}', test_tipi: 'UI', beklenen_sonuc: 'SUCCESS_EXPECTED' })),
        { id: 20, project_id: 1, senaryo_adi: 'sec-xss', hedef_url: 'https://1.1.1.1/', adimlar: '{"steps":[]}', test_tipi: 'SECURITY', beklenen_sonuc: 'SUCCESS_EXPECTED' },
        { id: 30, project_id: 2, senaryo_adi: 'beta-giris', hedef_url: 'https://1.1.1.1/', adimlar: '{"steps":[]}', test_tipi: 'UI', beklenen_sonuc: 'SUCCESS_EXPECTED' },
    ],
    raporlar: [], ayarlar: [], senaryo_gruplari: [],
};
const readBody = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });
const dpu = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const parts = url.pathname.replace('/api/v1/', '').split('/');
    if (url.pathname === '/api/v1/auth/token') return send({ success: true, data: { token: 't', expires_at: new Date(Date.now() + 36e5).toISOString() } });
    const table = db[parts[0]]; if (!table) return send({ success: false }, 404);
    await new Promise(r => setTimeout(r, 5));            // küçük gecikme: eşzamanlı okuma-yazma yarışları gerçekçi olsun
    if (req.method === 'GET') { const l = Number(url.searchParams.get('limit') || 100), p = Number(url.searchParams.get('page') || 1); return send({ success: true, data: table.slice((p - 1) * l, p * l) }); }
    if (req.method === 'POST') { const row = { id: 'uid_' + (nextId++), ...(await readBody(req)) }; table.push(row); return send({ success: true, data: row }); }
    const i = table.findIndex(r => String(r.id) === decodeURIComponent(parts[1])); if (i < 0) return send({ success: false }, 404);
    if (req.method === 'PATCH') { Object.assign(table[i], await readBody(req)); return send({ success: true, data: table[i] }); }
    if (req.method === 'DELETE') { table.splice(i, 1); return send({ success: true, data: { deleted: true } }); }
    send({ success: false }, 405);
});

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-gui-'));
let server, base;
before(async () => {
    await new Promise(r => dpu.listen(0, '127.0.0.1', r));
    const port = 42000 + Math.floor(Math.random() * 7000);
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port), NODE_ENV: 'test', SESSION_DIR: sessionDir, DPU_BASE_URL: `http://127.0.0.1:${dpu.address().port}`, ALLOWED_TEST_HOSTS: '1.1.1.1' } });
    let out = '';
    server.stderr.on('data', d => { out += d; });
    await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Sunucu başlamadı:\n' + out)), 15000);
        server.stdout.on('data', d => { out += d; if (String(d).includes('aktif')) { clearTimeout(t); resolve(); } });
    });
});
after(() => { server?.kill(); dpu.close(); server?.once('exit', () => fs.rmSync(sessionDir, { recursive: true, force: true })); });

const H = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };

const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return; await new Promise(r => setTimeout(r, 50)); } assert.ok(fn(), 'beklenen durum oluşmadı'); };

import { chromium } from 'playwright-core';

test('senaryo grupları arayüzü (Chromium): yönetim (oluştur/ad/sil), araç çubuğundan ekleme, grup içeriği penceresi, filtre, toplu test, form', async () => {
    const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM_PATH || process.env.CHROME_PATH || chromium.executablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'] });
    try {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
        const lr = await ctx.request.post(base + '/api/auth/login', { headers: H, data: { username: 'admin', password: 'admin-parola-123' } });
        assert.equal(lr.status(), 200);
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => d.accept());                     // silme onayı
        await page.goto(base + '/');
        await page.waitForSelector('#project-dropdown option[value="Alfa"]', { state: 'attached', timeout: 10000 });
        await page.selectOption('#project-dropdown', 'Alfa');
        await page.click('button[data-target="view-scenarios"][data-test-type="UI"]');
        await page.waitForSelector('#scenarios-list tr', { timeout: 10000 });
        const shot = async (name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }); };
        const rowCount = (sel) => page.waitForFunction(([s, n]) => document.querySelectorAll(s).length === n, [sel, 0]);

        // 1) araç çubuğu: grup seçili değilken ekleme bölümü yok
        await page.waitForSelector('#sg-filter');
        assert.equal(await page.locator('#sg-group-actions').count(), 0);

        // 2) "Grupları Yönet" YALNIZCA grup oluştur / adlandır / sil: senaryo ekleme alanı yok
        await page.click('#sg-manage');
        await page.fill('#sg-new-name', 'Giriş akışı');
        await page.click('#sg-create');
        await page.waitForSelector('#sg-group-list .sg-open');
        assert.equal(await page.locator('#sg-manager #sg-add-select').count(), 0, 'yönetim penceresinde senaryo ekleme yok');
        assert.equal(await page.locator('#sg-manager #sg-members').count(), 0, 'yönetim penceresinde üye listesi yok');
        const gid = db.senaryo_gruplari[0].id;
        // ad değiştir
        await page.click('#sg-group-list .sg-rename-btn');
        await page.fill('#sg-rename-input', 'Giriş akışları');
        await page.click('#sg-rename');
        await until(() => db.senaryo_gruplari[0].grup_adi === 'Giriş akışları');
        await page.waitForFunction(() => document.querySelector('#sg-group-list .sg-open')?.innerText.includes('Giriş akışları'));
        await shot('yonetim');
        await page.click('#sg-manager button[aria-label="Kapat"]');

        // 3) grup seçilince araç çubuğunda "Senaryo ekle" + "Grup içeriği"
        await page.waitForSelector('#sg-filter');
        await page.selectOption('#sg-filter', gid);
        await page.waitForSelector('#sg-group-actions');
        for (const [i, n] of ['giris', 'cikis', 'kayit'].entries()) {
            await page.selectOption('#sg-add-select', n);
            await page.click('#sg-add');
            await until(() => db.senaryo_gruplari[0].senaryo_idleri.length === i + 1);
            await page.waitForFunction((k) => document.getElementById('sg-open-content')?.innerText.includes(`(${k})`), i + 1);
        }
        assert.deepEqual(db.senaryo_gruplari[0].senaryo_idleri, ['10', '11', '12']);
        await shot('arac-cubugu');

        // 4) grup içeriği penceresi: sıra + ↑ ↓ + ✕
        await page.click('#sg-open-content');
        await page.waitForSelector('#sg-content #sg-members [data-name]');
        const order = async () => page.locator('#sg-content #sg-members [data-name]').evaluateAll(els => els.map(e => e.dataset.name));
        assert.deepEqual(await order(), ['giris', 'cikis', 'kayit']);
        assert.match(await page.locator('#sg-content h3').innerText(), /Giriş akışları · 3 senaryo/);
        await page.locator('#sg-content [data-name="kayit"] button[aria-label="Yukarı taşı"]').click();
        await until(() => db.senaryo_gruplari[0].senaryo_idleri.join() === '10,12,11');
        await page.waitForFunction(() => document.querySelector('#sg-content #sg-members [data-name]:nth-of-type(3)')?.dataset.name === 'cikis');
        assert.deepEqual(await order(), ['giris', 'kayit', 'cikis']);
        await shot('grup-icerigi');
        await page.click('#sg-content button[aria-label="Kapat"]');

        // 5) liste: grup sırası, etiket tıklayınca içerik penceresi, filtreler
        await page.waitForFunction(() => [...document.querySelectorAll('#scenarios-list tr[data-target] .sg-row-check')].map(e => e.value).join() === 'giris,kayit,cikis');   // içerik penceresi kapanınca liste yenilenir
        const listed = await page.locator('#scenarios-list tr[data-target] .sg-row-check').evaluateAll(els => els.map(e => e.value));
        assert.deepEqual(listed, ['giris', 'kayit', 'cikis']);
        assert.match(await page.locator('.scenario-count').first().innerText(), /3\/5/);
        await page.locator('#scenarios-list tr[data-target] .sg-chip').first().click();
        await page.waitForSelector('#sg-content #sg-members [data-name]');
        assert.equal(await page.locator('#scenarios-list tr[data-target] >> nth=0').getAttribute('class').then(c => c.includes('hidden')), false);
        await page.click('#sg-content button[aria-label="Kapat"]');
        await page.selectOption('#sg-filter', '__none__');
        await page.waitForFunction(() => document.querySelectorAll('#scenarios-list tr[data-target]').length === 2);
        assert.equal(await page.locator('#sg-group-actions').count(), 0, 'grupsuz filtresinde ekleme bölümü yok');
        await page.selectOption('#sg-filter', '');
        await page.waitForFunction(() => document.querySelectorAll('#scenarios-list tr[data-target]').length === 5);

        // 6) toplu gruba ekleme (satır seçimi)
        await page.locator('#scenarios-list tr[data-target]', { hasText: 'arama' }).locator('.sg-row-check').check();
        await page.waitForSelector('#sg-bulk', { state: 'visible' });
        await page.selectOption('#sg-bulk-target', gid);
        await page.click('#sg-bulk-add');
        await until(() => db.senaryo_gruplari[0].senaryo_idleri.includes('13'));

        // 7) toplu test ekranı: grup seç, grup sırasıyla seç, grup sırası penceresi, ↑ ↓ ile sıra
        await page.click('button[data-target="view-batch"][data-test-type="UI"]');
        await page.waitForSelector('#batch-list tr');
        await page.selectOption('#sg-batch-group', gid);
        await page.waitForFunction(() => document.querySelectorAll('#batch-list tr').length === 4);
        const batchOrder = async () => page.locator('#batch-list .batch-checkbox').evaluateAll(els => els.map(e => e.value));
        assert.deepEqual(await batchOrder(), ['giris', 'kayit', 'cikis', 'arama']);
        await page.click('#sg-batch-select-all');
        await page.waitForFunction(() => document.getElementById('selected-batch-count').textContent === '4');
        await page.locator('#batch-list tr').nth(1).locator('button[aria-label="Aşağı taşı"]').click();
        await page.waitForFunction(() => [...document.querySelectorAll('#batch-list .batch-checkbox')].map(e => e.value).join() === 'giris,cikis,kayit,arama');
        assert.equal(await page.locator('#selected-batch-count').innerText(), '4', 'sıra değişince seçim korunur');
        assert.deepEqual(await page.locator('#batch-list .batch-order-cell').allInnerTexts(), ['01', '02', '03', '04'], 'seçili senaryolar yeni grup sırasıyla numaralanır');
        await page.getByRole('button', { name: 'Grup sırasını düzenle' }).click();
        await page.waitForSelector('#sg-content #sg-members [data-name]');
        assert.deepEqual(await order(), ['giris', 'cikis', 'kayit', 'arama']);
        await page.click('#sg-content button[aria-label="Kapat"]');
        await shot('toplu');

        // 8) senaryo formu: Gruplar alanı + satır içi grup oluşturma
        await page.click('button[data-target="view-scenarios"][data-test-type="UI"]');
        await page.click('#open-new-scenario-btn');
        await page.waitForSelector('#sg-form-chips');
        assert.match(await page.locator('#sg-form-chips').innerText(), /Giriş akışları/);
        await page.fill('#sg-form-new', 'Yeni form grubu');
        await page.click('#sg-form-create');
        await page.waitForFunction(() => document.querySelectorAll('#sg-form-chips input[type=checkbox]:checked').length === 1);
        assert.ok(db.senaryo_gruplari.some(g => g.grup_adi === 'Yeni form grubu'));
        await page.click('#cancel-scenario-btn');

        // 9) grup sil (yönetim penceresinden, onay kabul) — senaryolar kalır
        await page.click('#sg-manage');
        const scenariosBefore = db.senaryolar.length;
        await page.locator('#sg-group-list > div', { hasText: 'Giriş akışları' }).locator('.sg-delete-btn').click();
        await page.waitForFunction(() => !document.querySelector('#sg-group-list')?.innerText.includes('Giriş akışları'));
        assert.ok(!db.senaryo_gruplari.some(g => g.grup_adi === 'Giriş akışları'));
        assert.equal(db.senaryolar.length, scenariosBefore);
        assert.deepEqual(errors, [], 'sayfa hatası olmamalı');
    } finally { await browser.close(); }
});
