// Yapay zeka yorumunu yeniden yorumlatma: gerçek server.js + sahte DPU + OpenAI uyumlu sahte yapay zeka (gerçek servislere dokunulmaz).
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

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-rean-'));
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
const login = async (u, p) => (await fetch(base + '/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ username: u, password: p }) })).headers.get('set-cookie').split(';')[0];
let admin, veli;
const reanalyze = async (cookie, id) => { const r = await fetch(base + '/api/scenarios/reports/reanalyze', { method: 'POST', headers: { ...H, Cookie: cookie }, body: JSON.stringify({ id }) }); return { status: r.status, json: await r.json() }; };
const detail = async (cookie, id) => (await (await fetch(`${base}/api/scenarios/reports/detail?id=${id}`, { headers: { ...H, Cookie: cookie } })).json()).report;
const waitDone = async (id) => { for (let i = 0; i < 100; i++) { const d = await detail(admin, id); if (d.analysis?.durum && d.analysis.durum !== 'bekliyor') return d; await new Promise(r => setTimeout(r, 50)); } throw new Error('yorum tamamlanmadı'); };

test('hazırlık', async () => { admin = await login('admin', 'admin-parola-123'); veli = await login('veli', 'veli-parola-1234'); });

test('üretilemeyen yorum yeniden yorumlatılır: önce "hazırlanıyor", sonra sonuç; senaryo adımları kanıta girer', async () => {
    received.length = 0; llmMode = 200;
    const r = await reanalyze(admin, '1');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.analysis.durum, 'bekliyor');
    const d = await waitDone('1');
    assert.equal(d.analysis.durum, 'hazir');
    assert.equal(d.analysis.senaryoSonucu, 'basarili');
    assert.equal(d.senaryo_sonucu, 'basarili');
    assert.equal(d.log_content.includes('YZ_YORUMU'), false, 'yorum bloğu günlükten ayrılır');
    const user = received[0].messages.find(m => m.role === 'user').content;
    assert.match(user, /kaydet-dugmesi/, 'güncel senaryonun adımları kanıta eklendi');
});

test('kesin sonuç (başarılı/başarısız) yeniden yorumlatılamaz; hazırlanan yorum için 409', async () => {
    assert.equal((await reanalyze(admin, '2')).status, 409);
    assert.equal((await reanalyze(admin, '5')).status, 409, 'taze "bekliyor"');
});

test('yorumu olmayan eski rapor, belirsiz yorum ve 10 dakikadan eski "bekliyor" yeniden yorumlatılabilir', async () => {
    llmMode = 200;
    for (const id of ['3', '4', '6']) {
        const r = await reanalyze(admin, id);
        assert.equal(r.status, 200, `${id}: ${JSON.stringify(r.json)}`);
        assert.equal((await waitDone(id)).analysis.durum, 'hazir');
    }
});

test('kalıcı hata (anahtar reddi): yeniden denenmez, neden kullanıcıya yazılır', async () => {
    received.length = 0; llmMode = 401;
    const r = await reanalyze(admin, '7');
    assert.equal(r.status, 200);
    const d = await waitDone('7');
    assert.equal(d.analysis.durum, 'uretilemedi');
    assert.match(d.analysis.neden, /anahtarını reddetti/);
    assert.equal(received.length, 1, 'kalıcı hatada tekrar denenmez');
    assert.doesNotMatch(JSON.stringify(d.analysis), /sk-test-anahtar/);
    assert.equal(d.senaryo_sonucu, 'belirsiz');
});

test('geçici hata (500): üç denemeye kadar yeniden denenir; sonunda neden yazılır', async () => {
    received.length = 0; llmMode = 500;
    const r = await reanalyze(admin, '8');
    assert.equal(r.status, 200);
    const d = await waitDone('8');
    assert.equal(d.analysis.durum, 'uretilemedi');
    assert.equal(received.length, 3, 'üç deneme');
    assert.ok(d.analysis.neden && d.analysis.neden.length > 5);
});

test('yetki ve doğrulama: başka projenin raporu 403, olmayan rapor 404, geçersiz kimlik 400', async () => {
    llmMode = 200;
    assert.equal((await reanalyze(veli, '1')).status, 403);
    assert.equal((await reanalyze(admin, 'uid_yok')).status, 404);
    assert.equal((await reanalyze(admin, '../x')).status, 400);
});
