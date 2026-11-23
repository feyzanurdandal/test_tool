// Çeviri isteği: yer/kapsam kuralı modele GERÇEKTEN iletiliyor mu, Türkçe satırdaki konum ifadesi kullanıcı mesajında korunuyor mu?
// Gerçek server.js + sahte DPU + OpenAI uyumlu sahte yapay zeka (OPENAI_BASE_URL). Modelin davranışını DEĞİL, istemin içeriğini doğrular.
import './setup-env.js';
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

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-sres-'));
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


const { withAnalysisBlock, resolveScenarioResult } = await import('../services/analysisBlock.js');
const hazir = (senaryoSonucu) => ({ durum: 'hazir', ozet: 'x', degerlendirme: 'tutarli', senaryoSonucu, hataliAdim: '', sayfaMesaji: '', neden: '', oneriler: [], guven: 'orta' });
const headers = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };
const rep = (id, name, tip, status, analysis) => ({ id, project_id: 1, scenario_name: name, test_tipi: tip, status, created_at: new Date(Date.now() - id * 1000).toISOString(),
    log_content: analysis ? withAnalysisBlock('log satırı', analysis) : 'log satırı' });

test('resolveScenarioResult: adım hatası başarılıya çevrilemez; güvenlikte yapay zeka sonucu belirlemez; UI testinde yapay zeka karar verir', () => {
    const r = (status, testType, analysis) => resolveScenarioResult({ status, testType, analysis });
    assert.deepEqual(r('FAILED', 'UI', hazir('basarili')), { sonuc: 'basarisiz', kaynak: 'adim' });
    assert.deepEqual(r('SUCCESS', 'SECURITY', hazir('basarisiz')), { sonuc: 'basarili', kaynak: 'beklenen_sonuc' });
    assert.deepEqual(r('FAILED', 'SECURITY', hazir('basarili')), { sonuc: 'basarisiz', kaynak: 'beklenen_sonuc' });
    assert.equal(r('SUCCESS', 'UI', null), null);
    assert.deepEqual(r('SUCCESS', 'UI', { durum: 'bekliyor' }), { sonuc: 'degerlendiriliyor', kaynak: 'yapay_zeka' });
    assert.deepEqual(r('SUCCESS', 'UI', { durum: 'uretilemedi' }), { sonuc: 'belirsiz', kaynak: 'yapay_zeka' });
    assert.deepEqual(r('SUCCESS', 'UI', hazir('basarisiz')), { sonuc: 'basarisiz', kaynak: 'yapay_zeka' });
    assert.deepEqual(r('SUCCESS', 'UI', hazir('basarili')), { sonuc: 'basarili', kaynak: 'yapay_zeka' });
    assert.deepEqual(r('SUCCESS', 'UI', { durum: 'hazir', ozet: 'x' }), { sonuc: 'belirsiz', kaynak: 'yapay_zeka' }, 'eski yorum (alan yok) belirsiz');
    assert.deepEqual(r('SUCCESS', undefined, hazir('basarisiz')), { sonuc: 'basarisiz', kaynak: 'yapay_zeka' }, 'test türü yoksa UI sayılır');
});

test('rapor listesi ve detay: adım durumu (status) aynı kalır, senaryo sonucu ayrı alan olarak gelir', async () => {
    db.raporlar.push(
        rep(1, 'ui-yz-basarisiz', 'UI', 'SUCCESS', hazir('basarisiz')),
        rep(2, 'ui-yz-basarili', 'UI', 'SUCCESS', hazir('basarili')),
        rep(3, 'ui-bekliyor', 'UI', 'SUCCESS', { durum: 'bekliyor', baslangic: new Date().toISOString() }),
        rep(4, 'ui-adim-hatasi', 'UI', 'FAILED', hazir('basarili')),
        rep(5, 'ui-eski-rapor', 'UI', 'SUCCESS', null),
        rep(6, 'guvenlik-basarili', 'SECURITY', 'SUCCESS', hazir('basarisiz')),
        rep(7, 'guvenlik-basarisiz', 'SECURITY', 'FAILED', null),
    );
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: 'admin', password: 'admin-parola-123' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const get = async (type) => (await (await fetch(`${base}/api/scenarios/reports/list?project=Alfa&testType=${type}`, { headers: { ...headers, Cookie: cookie } })).json()).reports;
    const ui = Object.fromEntries((await get('UI')).map(r => [r.scenario_name, r]));
    assert.equal(ui['ui-yz-basarisiz'].status, 'SUCCESS', 'adım durumu değişmez');
    assert.equal(ui['ui-yz-basarisiz'].senaryo_sonucu, 'basarisiz');
    assert.equal(ui['ui-yz-basarisiz'].senaryo_kaynagi, 'yapay_zeka');
    assert.equal(ui['ui-yz-basarili'].senaryo_sonucu, 'basarili');
    assert.equal(ui['ui-bekliyor'].senaryo_sonucu, 'degerlendiriliyor');
    assert.equal(ui['ui-adim-hatasi'].senaryo_sonucu, 'basarisiz');
    assert.equal(ui['ui-adim-hatasi'].senaryo_kaynagi, 'adim');
    assert.equal(ui['ui-eski-rapor'].senaryo_sonucu, null);
    assert.ok(!('log_content' in ui['ui-yz-basarisiz']), 'liste log içermez');
    const sec = Object.fromEntries((await get('SECURITY')).map(r => [r.scenario_name, r]));
    assert.equal(sec['guvenlik-basarili'].senaryo_sonucu, 'basarili', 'yapay zeka güvenlik sonucunu belirlemez');
    assert.equal(sec['guvenlik-basarisiz'].senaryo_sonucu, 'basarisiz');
    const detail = await (await fetch(`${base}/api/scenarios/reports/detail?id=1`, { headers: { ...headers, Cookie: cookie } })).json();
    assert.equal(detail.report.senaryo_sonucu, 'basarisiz');
    assert.equal(detail.report.log_content, 'log satırı', 'yorum bloğu günlükten ayrılır');
});
