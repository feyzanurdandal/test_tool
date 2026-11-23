// Uçtan uca: yönetici izinli adres listesi, rapor listesi/detayı, iş uç noktaları ve login limiti.
// Gerçek server.js ayrı süreçte, kontrollü sahte DPU Base'e karşı çalışır (WHERE filtrelerini yok sayar).
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

let nextId = 100;
const db = {
    kullanicilar: [
        { id: 1, kullanici_adi: 'admin', sifre: bcrypt.hashSync('admin-parola-123', 4), rol: 'ADMIN' },
        { id: 2, kullanici_adi: 'ayse', sifre: bcrypt.hashSync('ayse-parola-123', 4), rol: 'USER' },
    ],
    projeler: [{ id: 1, proje_adi: 'Alfa', hata_anahtar_kelimeleri: '' }],
    kullanici_projeleri: [{ id: 10, kullanici_adi: 'ayse', proje_adi: 'Alfa' }],
    senaryolar: [],
    raporlar: [
        { id: 30, project_id: 1, scenario_name: 's', test_tipi: 'UI', status: 'SUCCESS', log_content: 'LOG-ICERIGI-' + 'x'.repeat(5000), created_at: new Date().toISOString() },
    ],
    ayarlar: [{ id: 40, ayar_anahtar: 'test_runner_api', ayar_deger: 'openai', ayar_model: null },
              { id: 41, ayar_anahtar: 'translator_api', ayar_deger: 'openai', ayar_model: null }],
};
const readBody = req => new Promise(resolve => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => resolve(d ? JSON.parse(d) : {})); });
const dpu = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const parts = url.pathname.replace('/api/v1/', '').split('/');
    if (url.pathname === '/api/v1/auth/token') return send({ success: true, data: { token: 't', expires_at: new Date(Date.now() + 3600e3).toISOString() } });
    const table = db[parts[0]];
    if (!table) return send({ success: false }, 404);
    if (req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') || 100), page = Number(url.searchParams.get('page') || 1);
        return send({ success: true, data: table.slice((page - 1) * limit, page * limit) });
    }
    if (req.method === 'POST') { const row = { id: nextId++, ...(await readBody(req)) }; table.push(row); return send({ success: true, data: row }); }
    const idx = table.findIndex(r => String(r.id) === decodeURIComponent(parts[1]));
    if (idx < 0) return send({ success: false }, 404);
    if (req.method === 'PATCH') { Object.assign(table[idx], await readBody(req)); return send({ success: true, data: table[idx] }); }
    if (req.method === 'DELETE') { table.splice(idx, 1); return send({ success: true }); }
    send({ success: false }, 405);
});

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-hosts-'));
let server, base;

before(async () => {
    await new Promise(r => dpu.listen(0, '127.0.0.1', r));
    const port = 41000 + Math.floor(Math.random() * 8000);
    base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), DPU_BASE_URL: `http://127.0.0.1:${dpu.address().port}`, NODE_ENV: 'test', SESSION_DIR: sessionDir };
    delete env.ALLOWED_TEST_HOSTS;   // yalnızca yönetici listesi geçerli olsun
    server = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    server.stderr.on('data', d => { output += d; });
    await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Sunucu başlamadı:\n' + output)), 10000);
        server.once('error', err => { clearTimeout(t); reject(err); });
        server.stdout.on('data', d => { output += d; if (String(d).includes('aktif')) { clearTimeout(t); resolve(); } });
    });
});
after(() => { server?.kill(); dpu.close(); server?.once('exit', () => fs.rmSync(sessionDir, { recursive: true, force: true })); });

async function api(p, { method = 'GET', body, cookie, ip } = {}) {
    const headers = { 'X-Requested-With': 'fetch' };
    if (body) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    if (ip) headers['X-Forwarded-For'] = ip;
    const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, json, headers: res.headers };
}
async function login(username, password, ip) {
    const r = await api('/api/auth/login', { method: 'POST', body: { username, password }, ip });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return r.headers.get('set-cookie').split(';')[0];
}

test('izinli adres listesi: herkes okur, yalnızca ADMIN yazar, geçersiz satırlar reddedilir', async () => {
    const admin = await login('admin', 'admin-parola-123');
    const ayse = await login('ayse', 'ayse-parola-123');

    assert.equal((await api('/api/scenarios/settings/allowed-hosts', { cookie: ayse })).json.count, 0);
    assert.equal((await api('/api/scenarios/settings/allowed-hosts', { method: 'POST', cookie: ayse, body: { hosts: '*.dpu.edu.tr' } })).status, 403);

    const bad = await api('/api/scenarios/settings/allowed-hosts', { method: 'POST', cookie: admin, body: { hosts: '*.dpu.edu.tr\nkötü adres!\n*.com' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.details.length, 2);

    const ok = await api('/api/scenarios/settings/allowed-hosts', { method: 'POST', cookie: admin, body: { hosts: '# yorum\n*.dpu.edu.tr\nhttps://Test.Ornek.com:8443/yol\n1.1.1.1' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const read = await api('/api/scenarios/settings/allowed-hosts', { cookie: ayse });
    assert.equal(read.json.count, 3);
    assert.equal(read.json.hosts, '*.dpu.edu.tr\ntest.ornek.com:8443\n1.1.1.1');
    assert.equal(db.ayarlar.filter(r => r.ayar_anahtar === 'allowed_test_hosts').length, 1);
});

test('izinli adres satırı sağlayıcı olarak görünmez ve ayar kaydında silinmez', async () => {
    const admin = await login('admin', 'admin-parola-123');
    const get = await api('/api/scenarios/settings/get', { cookie: admin });
    assert.equal(get.json.settings.apiKeys.allowed_test_hosts, undefined);

    const save = await api('/api/scenarios/settings/save', { method: 'POST', cookie: admin, body: { testRunnerApi: 'openai', translatorApi: 'openai', apiKeys: { openai: { key: 'sk-yeni-anahtar-123', model: 'gpt-4o-mini' } } } });
    assert.equal(save.status, 200, JSON.stringify(save.json));
    assert.equal(db.ayarlar.filter(r => r.ayar_anahtar === 'allowed_test_hosts').length, 1, 'izinli adres satırı korunmalı');
    const reserved = await api('/api/scenarios/settings/save', { method: 'POST', cookie: admin, body: { testRunnerApi: 'allowed_test_hosts', translatorApi: 'allowed_test_hosts', apiKeys: { allowed_test_hosts: { key: 'x', model: 'y' } } } });
    assert.equal(reserved.status, 400);
});

test('listede olmayan hedef URL ile senaryo kaydedilemez', async () => {
    const ayse = await login('ayse', 'ayse-parola-123');
    const body = { scenarioName: 'yeni', turkishInstructions: 'Giriş yap', projectName: 'Alfa', testType: 'UI' };
    const denied = await api('/api/scenarios/create-and-save', { method: 'POST', cookie: ayse, body: { ...body, targetUrl: 'https://izinsiz.example.org/' } });
    assert.equal(denied.status, 400);
    assert.match(denied.json.error, /izin verilen/);
    const metadata = await api('/api/scenarios/create-and-save', { method: 'POST', cookie: ayse, body: { ...body, targetUrl: 'http://169.254.169.254/' } });
    assert.equal(metadata.status, 400);
});

test('rapor listesi log içermez, detay uç noktası logu yetkiyle verir', async () => {
    const ayse = await login('ayse', 'ayse-parola-123');
    const list = await api('/api/scenarios/reports/list?project=Alfa&testType=UI', { cookie: ayse });
    assert.equal(list.status, 200);
    assert.equal(list.json.reports.length, 1);
    assert.equal(list.json.reports[0].log_content, undefined);
    assert.equal(list.json.reports[0].has_log, true);
    assert.ok(JSON.stringify(list.json).length < 1000);

    const detail = await api('/api/scenarios/reports/detail?id=30', { cookie: ayse });
    assert.equal(detail.status, 200);
    assert.match(detail.json.report.log_content, /^LOG-ICERIGI-/);
    assert.equal((await api('/api/scenarios/reports/detail?id=30')).status, 401);
    // yetkisiz kullanıcı: projeye atanmamış hesap
    db.kullanicilar.push({ id: 3, kullanici_adi: 'veli', sifre: bcrypt.hashSync('veli-parola-123', 4), rol: 'USER' });
    const veli = await login('veli', 'veli-parola-123');
    assert.equal((await api('/api/scenarios/reports/detail?id=30', { cookie: veli })).status, 403);
});

test('iş uç noktaları: boş liste, bilinmeyen iş iptali 404', async () => {
    const ayse = await login('ayse', 'ayse-parola-123');
    const jobs = await api('/api/scenarios/jobs', { cookie: ayse });
    assert.equal(jobs.status, 200);
    assert.deepEqual(jobs.json.jobs, []);
    assert.ok(jobs.json.queue.concurrency >= 1);
    assert.equal((await api('/api/scenarios/jobs/00000000-0000-4000-8000-000000000000/cancel', { method: 'POST', cookie: ayse })).status, 404);
});

test('canlılık uç noktası DPU\'ya bağlı değildir; sağlık sonucu önbelleklenir', async () => {
    assert.equal((await api('/api/live')).json.status, 'UP');
    const a = await api('/api/health');
    const b = await api('/api/health');
    assert.equal(a.status, 200);
    assert.equal(a.json.timestamp, b.json.timestamp, 'ikinci çağrı önbellekten gelir');
});

test('aynı IP den 25 farklı kullanıcının başarılı girişi engellenmez; hatalı denemeler kullanıcı başına sayılır', async () => {
    for (let i = 0; i < 25; i++) db.kullanicilar.push({ id: 200 + i, kullanici_adi: 'toplu' + i, sifre: bcrypt.hashSync('toplu-parola-123', 4), rol: 'USER' });
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => api('/api/auth/login', { method: 'POST', ip: '10.9.9.9', body: { username: 'toplu' + i, password: 'toplu-parola-123' } })));
    assert.equal(results.filter(r => r.status === 200).length, 25);

    // Hatalı şifre: yalnızca o kullanıcı kilitlenir, aynı IP'deki diğerleri etkilenmez
    let last;
    for (let i = 0; i < 9; i++) last = await api('/api/auth/login', { method: 'POST', ip: '10.9.9.9', body: { username: 'toplu0', password: 'yanlis-parola-1' } });
    assert.equal(last.status, 429);
    const other = await api('/api/auth/login', { method: 'POST', ip: '10.9.9.9', body: { username: 'toplu1', password: 'toplu-parola-123' } });
    assert.equal(other.status, 200);
});

test('kullanıcı bulunamasa da şifre doğrulaması gerçek bcrypt süresi harcar (zamanlama sızıntısı yok)', async () => {
    const time = async (u) => { const s = performance.now(); await api('/api/auth/login', { method: 'POST', ip: '10.7.7.' + Math.floor(Math.random() * 250), body: { username: u, password: 'yanlis-parola-1' } }); return performance.now() - s; };
    await time('admin'); await time('yok-kullanici');           // ısınma
    const known = Math.min(await time('admin'), await time('admin'));
    const unknown = Math.min(await time('yok-kullanici'), await time('yok-kullanici'));
    assert.ok(unknown > known * 0.4, `bilinmeyen kullanıcı yanıtı çok hızlı: ${unknown.toFixed(1)}ms / ${known.toFixed(1)}ms`);
});

test('çeviri hatasında veritabanında yarım senaryo kalmaz ve 400 döner', async () => {
    const ayse = await login('ayse', 'ayse-parola-123');
    const before = db.senaryolar.length;
    const r = await api('/api/scenarios/create-and-save', { method: 'POST', cookie: ayse, body: { scenarioName: 'yarim', turkishInstructions: '[[FORM:olmayanAlan]]', targetUrl: 'https://1.1.1.1/', projectName: 'Alfa', testType: 'UI' } });
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.match(r.json.error, /JSON alanı bulunamadı/);
    assert.equal(db.senaryolar.length, before);
});

test('Türkçe karakterli proje adı bozulmaz', async () => {
    const admin = await login('admin', 'admin-parola-123');
    const r = await api('/api/scenarios/projects/create', { method: 'POST', cookie: admin, body: { projectName: 'Öğrenci İşleri Şubat', customErrorKeywords: '' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.projectName, 'Öğrenci İşleri Şubat');
});

test('toplu çalıştırma: 40 senaryo tek istekte kabul edilir, sıradakiler iptal edilebilir', async () => {
    for (let i = 1; i <= 40; i++) db.senaryolar.push({ id: 500 + i, project_id: 1, senaryo_adi: 'toplu' + i, hedef_url: 'https://1.1.1.1/', test_tipi: 'UI', beklenen_sonuc: 'SUCCESS_EXPECTED', adimlar_tr: 'x', adimlar: '{"steps":[]}' });
    const ayse = await login('ayse', 'ayse-parola-123');
    const names = Array.from({ length: 40 }, (_, i) => 'toplu' + (i + 1));
    const r = await api('/api/scenarios/run-batch', { method: 'POST', cookie: ayse, body: { scenarioNames: names, projectName: 'Alfa', testType: 'UI' } });
    assert.equal(r.status, 202, JSON.stringify(r.json));
    assert.equal(r.json.jobs.length, 40);
    const active = await api('/api/scenarios/jobs', { cookie: ayse });
    assert.ok(active.json.jobs.every(j => j.kind === 'batch'), 'toplu işler kind=batch ile işaretlenir');
    const cancel = await api('/api/scenarios/jobs/cancel-queued', { method: 'POST', cookie: ayse });
    assert.equal(cancel.status, 200);
    assert.ok(cancel.json.cancelled >= 0);
});
