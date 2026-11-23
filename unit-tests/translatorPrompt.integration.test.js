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

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-sessions-trans-'));
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

test('çeviri isteği: sistem istemi yer/kapsam kuralını içerir, kullanıcı mesajı Türkçe konum ifadesini aynen taşır', async () => {
    const headers = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: 'admin', password: 'admin-parola-123' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const line = 'sayfanın en üstündeki "detay" isimli butona tıkla';
    const res = await fetch(base + '/api/scenarios/create-and-save', { method: 'POST', headers: { ...headers, Cookie: cookie },
        body: JSON.stringify({ scenarioName: 'konum', projectName: 'Alfa', targetUrl: 'https://1.1.1.1/', turkishInstructions: line, testType: 'UI' }) });
    const json = await res.json();
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.equal(received.length, 1, 'tek çeviri isteği gitti');
    const system = received[0].messages.find(m => m.role === 'system').content;
    const user = received[0].messages.find(m => m.role === 'user').content;
    assert.match(system, /LOCATION \/ SCOPE QUALIFIERS \(MUST PRESERVE\)/);
    assert.match(system, /located at the very top of the page/);
    assert.match(system, /STEP TYPE \("act" vs "extract"\)/);
    assert.match(system, /"extract" ONLY READS data and NEVER clicks/);
    assert.ok(user.includes(line), 'konum ifadesi içeren Türkçe satır modele aynen gitti');
    const saved = db.senaryolar.find(s => s.senaryo_adi === 'konum');
    assert.match(JSON.parse(saved.adimlar).steps[0].instruction, /very top of the page/, 'modelin cevabı senaryoya kaydedildi');
});
