// Senaryo grupları: gerçek server.js + sahte DPU (gerçek DPU'ya dokunulmaz).
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

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-grp-'));
let server, base, shuttingDown = false;
before(async () => {
    await new Promise(r => dpu.listen(0, '127.0.0.1', r));
    const port = 42000 + Math.floor(Math.random() * 7000);
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port), NODE_ENV: 'test', SESSION_DIR: sessionDir, DPU_BASE_URL: `http://127.0.0.1:${dpu.address().port}`, ALLOWED_TEST_HOSTS: '1.1.1.1' } });
    let out = '';
    server.stderr.on('data', d => { out += d; });
    server.on('exit', (code, sig) => { if (!shuttingDown) console.log('[SUNUCU BEKLENMEDEN KAPANDI]', code, sig, out.slice(-1500)); });
    await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Sunucu başlamadı:\n' + out)), 15000);
        server.stdout.on('data', d => { out += d; if (String(d).includes('aktif')) { clearTimeout(t); resolve(); } });
    });
});
after(() => { shuttingDown = true; server?.kill(); dpu.close(); server?.once('exit', () => fs.rmSync(sessionDir, { recursive: true, force: true })); });

const H = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };
async function login(username, password) {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ username, password }) });
    assert.equal(r.status, 200, `${username} girişi`);
    return r.headers.get('set-cookie').split(';')[0];
}
const call = async (cookie, method, p, body) => {
    const r = await fetch(base + '/api/scenarios' + p, { method, headers: { ...H, Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json() };
};
const P = { projectName: 'Alfa', testType: 'UI' };
const nameOf = (snap, id) => snap.scenarios.find(s => s.id === id)?.name;
const orderOf = (snap, groupId) => snap.groups.find(g => g.id === groupId).scenarioIds.map(id => nameOf(snap, id));

let admin, ayse, veli;
test('hazırlık: girişler', async () => { admin = await login('admin', 'admin-parola-123'); ayse = await login('ayse', 'ayse-parola-1234'); veli = await login('veli', 'veli-parola-1234'); });

test('/list: ad listesi aynen, ek olarak items {id,name}', async () => {
    const r = await call(ayse, 'GET', '/list?project=Alfa&testType=UI');
    assert.deepEqual(r.json.scenarios, ['giris', 'cikis', 'kayit', 'arama', 'profil']);
    assert.deepEqual(r.json.items[0], { id: '10', name: 'giris' });
});

let gid;
test('grup oluştur: proje erişimi olan kullanıcı oluşturabilir; yeni satır DPU tablosuna doğru alanlarla yazılır', async () => {
    const r = await call(ayse, 'POST', '/groups/create', { ...P, name: 'Giriş testleri', scenarioNames: ['giris', 'cikis'] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    gid = r.json.groupId;
    assert.match(gid, /^uid_/);
    assert.deepEqual(orderOf(r.json, gid), ['giris', 'cikis']);
    const row = db.senaryo_gruplari.find(x => x.id === gid);
    assert.equal(row.project_id, '1'); assert.equal(row.test_tipi, 'UI'); assert.equal(row.grup_adi, 'Giriş testleri');
    assert.deepEqual(row.senaryo_idleri, ['10', '11']);
});

test('aynı ad (büyük/küçük harf ve Türkçe i/İ duyarsız) reddedilir; farklı proje/tür serbest', async () => {
    const dup = await call(ayse, 'POST', '/groups/create', { ...P, name: 'GİRİŞ TESTLERİ' });
    assert.equal(dup.status, 400); assert.match(dup.json.error, /zaten var/);
    const otherType = await call(admin, 'POST', '/groups/create', { projectName: 'Alfa', testType: 'SECURITY', name: 'Giriş testleri' });
    assert.equal(otherType.status, 200, 'tür bazında ayrı');
    const otherProject = await call(veli, 'POST', '/groups/create', { projectName: 'Beta', testType: 'UI', name: 'Giriş testleri' });
    assert.equal(otherProject.status, 200, 'proje bazında ayrı');
});

test('doğrulama: zararlı karakter, boş ad, geçersiz grup kimliği', async () => {
    assert.equal((await call(ayse, 'POST', '/groups/create', { ...P, name: '<b>x</b>' })).status, 400);
    assert.equal((await call(ayse, 'POST', '/groups/create', { ...P, name: '   ' })).status, 400);
    assert.equal((await call(ayse, 'POST', '/groups/delete', { ...P, groupId: '../x' })).status, 400);
});

test('yetki: projeye erişimi olmayan kullanıcı başka projenin gruplarını göremez/değiştiremez', async () => {
    assert.equal((await call(veli, 'GET', '/groups?project=Alfa&testType=UI')).status, 403);
    assert.equal((await call(veli, 'POST', '/groups/create', { ...P, name: 'x' })).status, 403);
    assert.equal((await call(veli, 'POST', '/groups/delete', { ...P, groupId: gid })).status, 403);
    // Beta kullanıcısı kendi projesinde Alfa'nın grup kimliğini kullanamaz
    assert.equal((await call(veli, 'POST', '/groups/delete', { projectName: 'Beta', testType: 'UI', groupId: gid })).status, 404);
    assert.ok(db.senaryo_gruplari.some(x => x.id === gid), 'grup silinmedi');
});

test('liste: yalnızca o proje+tür grupları ve senaryoları', async () => {
    const r = await call(ayse, 'GET', '/groups?project=Alfa&testType=UI');
    assert.deepEqual(r.json.groups.map(g => g.name), ['Giriş testleri']);
    assert.deepEqual(r.json.scenarios.map(s => s.name), ['giris', 'cikis', 'kayit', 'arama', 'profil']);
    const sec = await call(admin, 'GET', '/groups?project=Alfa&testType=SECURITY');
    assert.deepEqual(sec.json.scenarios.map(s => s.name), ['sec-xss']);
});

test('üye ekle/çıkar: sona eklenir, tekrar etmez; bilinmeyen ad atlanır', async () => {
    const r = await call(ayse, 'POST', '/groups/members', { ...P, groupId: gid, add: ['kayit', 'giris', 'yok-boyle-senaryo'], remove: [] });
    assert.deepEqual(orderOf(r.json, gid), ['giris', 'cikis', 'kayit']);
    assert.deepEqual(r.json.skipped, ['yok-boyle-senaryo']);
    const r2 = await call(ayse, 'POST', '/groups/members', { ...P, groupId: gid, add: [], remove: ['cikis'] });
    assert.deepEqual(orderOf(r2.json, gid), ['giris', 'kayit']);
    // başka türün senaryosu UI grubuna eklenemez (bilinmeyen sayılır)
    const x = await call(ayse, 'POST', '/groups/members', { ...P, groupId: gid, add: ['sec-xss'], remove: [] });
    assert.deepEqual(x.json.skipped, ['sec-xss']);
});

test('grup içi sıra değiştirilir; eksik/fazla üyeli liste 409 ile reddedilir', async () => {
    await call(ayse, 'POST', '/groups/members', { ...P, groupId: gid, add: ['cikis'] });
    const ok = await call(ayse, 'POST', '/groups/reorder', { ...P, groupId: gid, scenarioNames: ['cikis', 'kayit', 'giris'] });
    assert.equal(ok.status, 200);
    assert.deepEqual(orderOf(ok.json, gid), ['cikis', 'kayit', 'giris']);
    assert.deepEqual(db.senaryo_gruplari.find(x => x.id === gid).senaryo_idleri, ['11', '12', '10']);
    const bad = await call(ayse, 'POST', '/groups/reorder', { ...P, groupId: gid, scenarioNames: ['cikis', 'kayit'] });
    assert.equal(bad.status, 409);
    const dupl = await call(ayse, 'POST', '/groups/reorder', { ...P, groupId: gid, scenarioNames: ['cikis', 'cikis', 'kayit'] });
    assert.equal(dupl.status, 409);
});

test('eşzamanlı üye ekleme: hiçbir ekleme kaybolmaz (grup başına sıralı işlem)', async () => {
    const g = (await call(ayse, 'POST', '/groups/create', { ...P, name: 'Yarış' })).json.groupId;
    const names = ['giris', 'cikis', 'kayit', 'arama', 'profil'];
    await Promise.all(names.map(n => call(ayse, 'POST', '/groups/members', { ...P, groupId: g, add: [n] })));
    const row = db.senaryo_gruplari.find(x => x.id === g);
    assert.deepEqual([...row.senaryo_idleri].sort(), ['10', '11', '12', '13', '14']);
});

test('senaryo formu: assign seçilen gruplara ekler, seçilmeyenlerden çıkarır', async () => {
    const g2 = (await call(ayse, 'POST', '/groups/create', { ...P, name: 'Duman' })).json.groupId;
    const r = await call(ayse, 'POST', '/groups/assign', { ...P, scenarioName: 'profil', groupIds: [gid, g2] });
    assert.equal(r.status, 200);
    assert.ok(r.json.groups.find(g => g.id === gid).scenarioIds.includes('14'));
    assert.deepEqual(orderOf(r.json, g2), ['profil']);
    const r2 = await call(ayse, 'POST', '/groups/assign', { ...P, scenarioName: 'profil', groupIds: [g2] });
    assert.ok(!r2.json.groups.find(g => g.id === gid).scenarioIds.includes('14'));
    assert.equal((await call(ayse, 'POST', '/groups/assign', { ...P, scenarioName: 'profil', groupIds: ['uid_yok'] })).status, 404);
    assert.equal((await call(ayse, 'POST', '/groups/assign', { ...P, scenarioName: 'olmayan', groupIds: [] })).status, 404);
});

test('yeniden adlandır: yalnızca ad değişir; çakışma reddedilir', async () => {
    const r = await call(ayse, 'POST', '/groups/rename', { ...P, groupId: gid, name: 'Oturum' });
    assert.equal(r.status, 200);
    assert.equal(r.json.groups.find(g => g.id === gid).name, 'Oturum');
    const clash = await call(ayse, 'POST', '/groups/rename', { ...P, groupId: gid, name: 'duman' });
    assert.equal(clash.status, 400);
    assert.equal((await call(ayse, 'POST', '/groups/rename', { ...P, groupId: gid, name: 'OTURUM' })).status, 200, 'kendi adının büyük/küçük harf değişimi serbest');
});

test('senaryo silinince tüm gruplardan çıkar; silinmiş kimlik veritabanında kalsa bile yanıtta görünmez', async () => {
    const del = await call(admin, 'POST', '/delete', { scenarioName: 'arama', projectName: 'Alfa' });
    assert.equal(del.status, 200);
    for (const row of db.senaryo_gruplari.filter(x => x.project_id === '1')) assert.ok(!row.senaryo_idleri.includes('13'), 'gruplardan çıkarıldı');
    // elle bozulmuş kayıt: yanıt süzer
    db.senaryo_gruplari.find(x => x.id === gid).senaryo_idleri.push('9999');
    const r = await call(ayse, 'GET', '/groups?project=Alfa&testType=UI');
    assert.ok(!r.json.groups.find(g => g.id === gid).scenarioIds.includes('9999'));
});

test('grup silinince senaryolar silinmez', async () => {
    const before = db.senaryolar.length;
    const r = await call(ayse, 'POST', '/groups/delete', { ...P, groupId: gid });
    assert.equal(r.status, 200);
    assert.ok(!db.senaryo_gruplari.some(x => x.id === gid));
    assert.equal(db.senaryolar.length, before, 'senaryolar duruyor');
    assert.equal((await call(ayse, 'POST', '/groups/delete', { ...P, groupId: gid })).status, 404, 'ikinci silme 404');
});

test('grup sayısı sınırı (50)', async () => {
    const existing = db.senaryo_gruplari.filter(x => x.project_id === '1' && x.test_tipi === 'UI').length;
    for (let i = existing; i < 50; i++) assert.equal((await call(ayse, 'POST', '/groups/create', { ...P, name: 'g' + i })).status, 200);
    const over = await call(ayse, 'POST', '/groups/create', { ...P, name: 'fazla' });
    assert.equal(over.status, 400); assert.match(over.json.error, /en fazla 50/);
});

test('proje silinince grupları da silinir', async () => {
    assert.ok(db.senaryo_gruplari.some(x => x.project_id === '2'));
    const r = await call(admin, 'POST', '/projects/delete', { projectName: 'Beta' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(!db.senaryo_gruplari.some(x => x.project_id === '2'));
});

test('JSON alanı metin olarak dönse bile okunur (parseIds)', async () => {
    const { parseIds } = await import('../services/scenarioGroups.js');
    assert.deepEqual(parseIds('["1","2","1"]'), ['1', '2']);
    assert.deepEqual(parseIds([1, 2, null, '']), ['1', '2']);
    assert.deepEqual(parseIds({ key: 'value' }), []);
    assert.deepEqual(parseIds('bozuk'), []);
    assert.deepEqual(parseIds(null), []);
});
