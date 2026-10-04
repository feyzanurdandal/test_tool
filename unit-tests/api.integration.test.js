// Uçtan uca API testi: gerçek server.js ayrı süreçte, sahte bir DPU Base'e karşı çalışır.
// Sahte DPU, WHERE filtrelerini KASITLI OLARAK yok sayar;
// sunucunun yine de doğru kayıtlarla çalıştığı doğrulanır.
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

// ─── SAHTE DPU BASE ───
let nextId = 100;
const db = {
    kullanicilar: [
        { id: 1, kullanici_adi: 'admin', sifre: bcrypt.hashSync('admin123', 4), rol: 'ADMIN' },
        { id: 2, kullanici_adi: 'ayse', sifre: bcrypt.hashSync('ayse123', 4), rol: 'USER' },
    ],
    projeler: [
        { id: 1, proje_adi: 'Alfa', hata_anahtar_kelimeleri: '' },
        { id: 2, proje_adi: 'Beta', hata_anahtar_kelimeleri: '' },
    ],
    kullanici_projeleri: [
        { id: 10, kullanici_adi: 'ayse', proje_adi: 'Alfa' },
    ],
    senaryolar: [
        {
            id: 20,
            project_id: 1,
            senaryo_adi: 'login',
            hedef_url: 'http://127.0.0.1:9999/',
            test_tipi: 'UI',
            adimlar_tr: 'Giriş yap',
            adimlar: JSON.stringify({
                targetUrl: 'http://169.254.169.254/',
                steps: [{ type: 'act', instruction: 'x' }],
            }),
        },
        {
            id: 21,
            project_id: 1,
            senaryo_adi: 'cevrilmemis',
            hedef_url: 'https://1.1.1.1/',
            test_tipi: 'UI',
            adimlar_tr: 'a',
            adimlar: '',
        },
        {
            id: 22,
            project_id: 2,
            senaryo_adi: 'login',
            hedef_url: 'https://1.1.1.1/',
            test_tipi: 'UI',
            adimlar_tr: 'b',
            adimlar: '{}',
        },
    ],
    raporlar: [
        {
            id: 30,
            project_id: 2,
            scenario_name: 'login',
            test_tipi: 'UI',
            status: 'SUCCESS',
            log_content: '',
            created_at: new Date().toISOString(),
        },
    ],
    ayarlar: [
        { id: 40, ayar_anahtar: 'test_runner_api', ayar_deger: 'openai', ayar_model: null },
        { id: 41, ayar_anahtar: 'translator_api', ayar_deger: 'openai', ayar_model: null },
        {
            id: 42,
            ayar_anahtar: 'openai',
            ayar_deger: encrypt('sk-cok-gizli-anahtar-1234'),
            ayar_model: 'gpt-4o-mini',
        },
    ],
};

function readBody(req) {
    return new Promise(resolve => {
        let data = '';
        req.on('data', c => { data += c; });
        req.on('end', () => resolve(data ? JSON.parse(data) : {}));
    });
}

const dpu = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (obj, code = 200) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
    };
    const parts = url.pathname.replace('/api/v1/', '').split('/');

    if (url.pathname === '/api/v1/auth/token') {
        return send({
            success: true,
            data: {
                token: 't',
                expires_at: new Date(Date.now() + 3600e3).toISOString(),
            },
        });
    }

    const table = db[parts[0]];
    if (!table) return send({ success: false, error: 'tablo yok' }, 404);

    if (req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') || 100);
        const page = Number(url.searchParams.get('page') || 1);
        return send({
            success: true,
            data: table.slice((page - 1) * limit, page * limit),
        });
    }

    if (req.method === 'POST') {
        const row = { id: nextId++, ...(await readBody(req)) };
        table.push(row);
        return send({ success: true, data: row });
    }

    const idx = table.findIndex(r => String(r.id) === decodeURIComponent(parts[1]));
    if (idx < 0) return send({ success: false, error: 'yok' }, 404);

    if (req.method === 'PATCH') {
        Object.assign(table[idx], await readBody(req));
        return send({ success: true, data: table[idx] });
    }

    if (req.method === 'DELETE') {
        table.splice(idx, 1);
        return send({ success: true });
    }

    send({ success: false }, 405);
});

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-test-'));
let server;
let base;

before(async () => {
    await new Promise(r => dpu.listen(0, '127.0.0.1', r));
    const dpuPort = dpu.address().port;
    const port = 40000 + Math.floor(Math.random() * 10000);
    base = `http://127.0.0.1:${port}`;

    server = spawn(process.execPath, ['server.js'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
            ...process.env,
            PORT: String(port),
            DPU_BASE_URL: `http://127.0.0.1:${dpuPort}`,
            NODE_ENV: 'test',
            SESSION_DIR: sessionDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    server.stderr.on('data', d => { output += d; });

    await new Promise((resolve, reject) => {
        const t = setTimeout(
            () => reject(new Error('Sunucu başlamadı:\n' + output)),
            10000,
        );

        server.once('error', err => {
            clearTimeout(t);
            reject(err);
        });

        server.stdout.on('data', d => {
            output += d;
            if (String(d).includes('aktif')) {
                clearTimeout(t);
                resolve();
            }
        });
    });
});

after(() => {
    server?.kill();
    dpu.close();
    server?.once('exit', () => {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    });
});

// ─── İSTEMCİ YARDIMCILARI ───
async function api(path, { method = 'GET', body, cookie, csrf = true } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-Requested-With'] = 'fetch';
    if (cookie) headers.Cookie = cookie;

    const res = await fetch(base + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json = {};
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }

    return { status: res.status, json, headers: res.headers };
}

async function login(username, password) {
    const r = await api('/api/auth/login', {
        method: 'POST',
        body: { username, password },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return r.headers.get('set-cookie').split(';')[0];
}

let adminCookie;
let ayseCookie;

test('sayfa CSP ile sunulur, dış betik kaynağı yok', async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);

    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unpkg|tailwindcss/);

    const html = await res.text();
    assert.doesNotMatch(html, /cdn\.tailwindcss|unpkg\.com/);
});

test('CSRF başlığı olmadan giriş reddedilir', async () => {
    const r = await api('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'admin123' },
        csrf: false,
    });
    assert.equal(r.status, 403);
});

test('yanlış şifre 401, doğru girişte token gövdede değil httpOnly çerezde', async () => {
    assert.equal(
        (await api('/api/auth/login', {
            method: 'POST',
            body: { username: 'admin', password: 'x' },
        })).status,
        401,
    );

    const r = await api('/api/auth/login', {
        method: 'POST',
        body: { username: 'ADMIN', password: 'admin123' },
    });

    assert.equal(r.status, 200);
    assert.equal(r.json.token, undefined);
    assert.equal(r.json.role, 'ADMIN');

    const setCookie = r.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    adminCookie = setCookie.split(';')[0];

    ayseCookie = await login('ayse', 'ayse123');
});

test('oturum doğrulama ve oturumsuz erişim', async () => {
    assert.equal(
        (await api('/api/auth/me', { cookie: adminCookie })).json.username,
        'admin',
    );
    assert.equal((await api('/api/auth/me')).status, 401);
    assert.equal(
        (await api('/api/scenarios/projects/list', {
            cookie: 'tt_session=sahte',
        })).status,
        401,
    );
});

test('USER yalnızca atandığı projeleri görür, diğerine erişemez', async () => {
    const r = await api('/api/scenarios/projects/list', { cookie: ayseCookie });
    assert.deepEqual(r.json.projects, ['Alfa']);

    const scen = await api('/api/scenarios/list?project=Alfa', {
        cookie: ayseCookie,
    });
    assert.equal(scen.status, 200);
    assert.deepEqual(scen.json.scenarios.sort(), ['cevrilmemis', 'login']);

    assert.equal(
        (await api('/api/scenarios/list?project=Beta', {
            cookie: ayseCookie,
        })).status,
        403,
    );
});

test('önbellek temizliği ve yönetim uçları yalnızca ADMIN', async () => {
    assert.equal(
        (await api('/api/scenarios/cache/clear', {
            method: 'POST',
            cookie: ayseCookie,
        })).status,
        403,
    );
    assert.equal(
        (await api('/api/scenarios/settings/get', {
            cookie: ayseCookie,
        })).status,
        403,
    );
    assert.equal(
        (await api('/api/scenarios/users/list', {
            cookie: ayseCookie,
        })).status,
        403,
    );
});

test('çevrilmemiş senaryo çalıştırılamaz', async () => {
    const r = await api('/api/scenarios/run', {
        method: 'POST',
        cookie: ayseCookie,
        body: { scenarioName: 'cevrilmemis', projectName: 'Alfa' },
    });
    assert.equal(r.status, 400);
});

test('çalıştırma kuyruğa girer; iç ağ hedefi çalıştırma anında engellenir ve raporlanır', async () => {
    const r = await api('/api/scenarios/run', {
        method: 'POST',
        cookie: ayseCookie,
        body: { scenarioName: 'login', projectName: 'Alfa' },
    });
    assert.equal(r.status, 202, JSON.stringify(r.json));
    assert.ok(r.json.jobId);

    let job;
    for (let i = 0; i < 50; i++) {
        job = (await api(`/api/scenarios/jobs/${r.json.jobId}`, {
            cookie: ayseCookie,
        })).json.job;

        if (job.status === 'completed' || job.status === 'failed') break;
        await new Promise(res => setTimeout(res, 100));
    }

    assert.equal(job.status, 'completed');
    assert.equal(job.result.status, 'FAILED');
    assert.match(job.result.message, /Güvenlik Engeli/);

    const report = db.raporlar.find(
        x => x.project_id === 1 && x.scenario_name === 'login',
    );
    assert.ok(report, 'rapor yazılmalı');
    assert.equal(report.status, 'FAILED');

    assert.equal(
        (await api(`/api/scenarios/jobs/${r.json.jobId}`, {
            cookie: adminCookie,
        })).status,
        200,
    );
    assert.equal(
        (await api('/api/scenarios/jobs/gecersiz', {
            cookie: adminCookie,
        })).status,
        400,
    );
});

test('başka projenin raporu silinemez', async () => {
    const r = await api('/api/scenarios/reports/delete', {
        method: 'POST',
        cookie: ayseCookie,
        body: { id: 30 },
    });
    assert.equal(r.status, 403);
    assert.ok(db.raporlar.some(x => x.id === 30));
});

test('API anahtarı maskeli gelir; maske geri gönderilirse mevcut anahtar korunur', async () => {
    const before = db.ayarlar.find(
        r => r.ayar_anahtar === 'openai',
    ).ayar_deger;

    const g = await api('/api/scenarios/settings/get', {
        cookie: adminCookie,
    });
    const masked = g.json.settings.apiKeys.openai.key;
    assert.match(masked, /^••••••••1234$/);
    assert.doesNotMatch(JSON.stringify(g.json), /cok-gizli/);

    const s = await api('/api/scenarios/settings/save', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            testRunnerApi: 'openai',
            translatorApi: 'openai',
            apiKeys: {
                openai: { key: masked, model: 'gpt-4o' },
            },
        },
    });
    assert.equal(s.status, 200, JSON.stringify(s.json));

    const row = db.ayarlar.find(r => r.ayar_anahtar === 'openai');
    assert.equal(row.ayar_deger, before);
    assert.equal(row.ayar_model, 'gpt-4o');
});

test('admin kendini silemez; kullanıcı adı değişince yetkiler taşınır ve eski oturum düşer', async () => {
    assert.equal(
        (await api('/api/scenarios/users/delete', {
            method: 'POST',
            cookie: adminCookie,
            body: { id: 1 },
        })).status,
        400,
    );

    const u = await api('/api/scenarios/users/update', {
        method: 'POST',
        cookie: adminCookie,
        body: {
            id: 2,
            username: 'ayse.k',
            role: 'USER',
            selectedProjects: ['Alfa'],
        },
    });
    assert.equal(u.status, 200, JSON.stringify(u.json));
    assert.deepEqual(
        db.kullanici_projeleri.map(p => p.kullanici_adi),
        ['ayse.k'],
    );

    assert.equal(
        (await api('/api/auth/me', { cookie: ayseCookie })).status,
        401,
    );
});

test('çıkış çerezi temizler', async () => {
    const r = await api('/api/auth/logout', {
        method: 'POST',
        cookie: adminCookie,
    });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('set-cookie'), /tt_session=;/);
});

test('regresyon: çelişkili proje query/body ile başka projede silme ve koşum yapılamaz', async () => {
    adminCookie = await login('admin', 'admin123');
    ayseCookie = await login('ayse.k', 'ayse123');

    for (const route of ['delete', 'run', 'run-batch', 'update', 'create-and-save']) {
        let body = { scenarioName: 'login', projectName: 'Beta' };

        if (route === 'run-batch') {
            body = { scenarioNames: ['login'], projectName: 'Beta' };
        }

        if (['update', 'create-and-save'].includes(route)) {
            body = {
                ...body,
                originalScenarioName: 'login',
                turkishInstructions: 'Butona tıkla',
                targetUrl: 'https://1.1.1.1/',
            };
        }

        const r = await api(`/api/scenarios/${route}?project=Alfa`, {
            method: 'POST',
            cookie: ayseCookie,
            body,
        });
        assert.ok([400, 403].includes(r.status), JSON.stringify(r.json));
    }

    assert.ok(db.senaryolar.some(x => x.id === 22));
});

test('regresyon: kısa şifre güncellemesi reddedilir; geçerli değişim eski oturumu kapatır', async () => {
    assert.equal(
        (await api('/api/scenarios/users/update', {
            method: 'POST',
            cookie: adminCookie,
            body: { id: 2, username: 'ayse.k', password: 'x' },
        })).status,
        400,
    );

    assert.equal(
        (await api('/api/scenarios/users/update', {
            method: 'POST',
            cookie: adminCookie,
            body: {
                id: 2,
                username: 'ayse.k',
                password: 'new-password-for-audit',
            },
        })).status,
        200,
    );

    assert.equal(
        (await api('/api/auth/me', { cookie: ayseCookie })).status,
        401,
    );
    ayseCookie = await login('ayse.k', 'new-password-for-audit');
    assert.equal(
        (await api('/api/auth/me', { cookie: ayseCookie })).status,
        200,
    );
});

test('regresyon: logout kopyalanmış çerezi sunucuda da iptal eder', async () => {
    assert.equal(
        (await api('/api/auth/logout', {
            method: 'POST',
            cookie: ayseCookie,
        })).status,
        200,
    );
    assert.equal(
        (await api('/api/auth/me', { cookie: ayseCookie })).status,
        401,
    );
    ayseCookie = await login('ayse.k', 'new-password-for-audit');
});

test('regresyon: eski kullanıcı adı yeni admin hesaba eski oturumu taşımaz', async () => {
    const oldCookie = ayseCookie;

    assert.equal(
        (await api('/api/scenarios/users/delete', {
            method: 'POST',
            cookie: adminCookie,
            body: { id: 2 },
        })).status,
        200,
    );

    assert.equal(
        (await api('/api/scenarios/users/create', {
            method: 'POST',
            cookie: adminCookie,
            body: {
                username: 'ayse.k',
                password: 'different-new-password',
                role: 'ADMIN',
                selectedProjects: [],
            },
        })).status,
        200,
    );

    assert.equal(
        (await api('/api/auth/me', { cookie: oldCookie })).status,
        401,
    );
});

test('regresyon: kalıcı oturum kayıtları yeniden başlatınca çalışır; silinen kayıt geri gelmez', async () => {
    const user = db.kullanicilar.find(x => x.kullanici_adi === 'admin');
    const records = fs.readdirSync(sessionDir).map(
        n => JSON.parse(fs.readFileSync(path.join(sessionDir, n), 'utf8')),
    );

    assert.ok(records.some(r => r.userId === String(user.id)));
    assert.ok(records.every(
        r => typeof r.fingerprint === 'string'
            && r.fingerprint.length === 64
            && !('password' in r),
    ));

    const extraPort = 50000 + Math.floor(Math.random() * 10000);
    const extra = spawn(process.execPath, ['server.js'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
            ...process.env,
            PORT: String(extraPort),
            DPU_BASE_URL: `http://127.0.0.1:${dpu.address().port}`,
            NODE_ENV: 'test',
            SESSION_DIR: sessionDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('Restart test sunucusu başlayamadı')),
                5000,
            );

            extra.once('error', err => {
                clearTimeout(timer);
                reject(err);
            });

            extra.stdout.on('data', d => {
                if (String(d).includes('aktif')) {
                    clearTimeout(timer);
                    resolve();
                }
            });
        });

        const r = await fetch(`http://127.0.0.1:${extraPort}/api/auth/me`, {
            headers: { Cookie: adminCookie },
        });
        assert.equal(r.status, 200);

        assert.equal(
            (await api('/api/auth/logout', {
                method: 'POST',
                cookie: adminCookie,
            })).status,
            200,
        );

        assert.equal(
            (await fetch(`http://127.0.0.1:${extraPort}/api/auth/me`, {
                headers: { Cookie: adminCookie },
            })).status,
            401,
        );
    } finally {
        extra.kill();
    }
});