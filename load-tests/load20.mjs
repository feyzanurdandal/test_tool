// 20 eşzamanlı kullanıcı yük simülasyonu: gerçek server.js + sahte (gecikmeli) DPU. Proje dosyalarına yazmaz.
// Kullanım: node load-tests/load20.mjs [DPU_gecikme_ms=60] [rapor_log_KB=5] [rapor_sayısı=300]
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const bcrypt = (await import(pathToFileURL(PROJ + '/node_modules/bcryptjs/index.js').href)).default;
const DPU_LATENCY = Number(process.argv[2] || 60);
const LOG_KB = Number(process.argv[3] || 5);
const REPORTS = Number(process.argv[4] || 300);

const hash = bcrypt.hashSync('Parola-123456', 10);
const db = {
    kullanicilar: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, kullanici_adi: 'user' + i, sifre: hash, rol: i === 0 ? 'ADMIN' : 'USER' })),
    projeler: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, proje_adi: 'Proje' + i, hata_anahtar_kelimeleri: '' })),
    kullanici_projeleri: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, kullanici_adi: 'user' + i, proje_adi: 'Proje' + (i % 5) })),
    senaryolar: Array.from({ length: 200 }, (_, i) => ({ id: i + 1, project_id: (i % 5) + 1, senaryo_adi: 'sen' + i, hedef_url: 'https://1.1.1.1/', test_tipi: 'UI', adimlar_tr: 'a\nb', adimlar: JSON.stringify({ targetUrl: 'https://1.1.1.1/', steps: [{ type: 'act', instruction: 'x' }] }) })),
    raporlar: Array.from({ length: REPORTS }, (_, i) => ({ id: i + 1, project_id: (i % 5) + 1, scenario_name: 'sen' + (i % 40), test_tipi: 'UI', status: 'SUCCESS', log_content: 'x'.repeat(LOG_KB * 1024), created_at: new Date(Date.now() - i * 1000).toISOString() })),
    ayarlar: [],
};
let dpuCalls = 0;
const dpu = http.createServer((req, res) => {
    dpuCalls++;
    const url = new URL(req.url, 'http://x');
    setTimeout(() => {
        const send = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
        if (url.pathname === '/api/v1/auth/token') return send({ success: true, data: { token: 't', expires_at: new Date(Date.now() + 3600e3).toISOString() } });
        const table = db[url.pathname.replace('/api/v1/', '').split('/')[0]];
        if (!table) return send({ success: false });
        const limit = Number(url.searchParams.get('limit') || 100), page = Number(url.searchParams.get('page') || 1);
        send({ success: true, data: table.slice((page - 1) * limit, page * limit) }); // filtre yok = en kötü durum
    }, DPU_LATENCY);
});
await new Promise(r => dpu.listen(0, '127.0.0.1', r));
const port = 41000 + Math.floor(Math.random() * 5000);
const base = `http://127.0.0.1:${port}`;
const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-load-'));
const server = spawn(process.execPath, ['server.js'], {
    cwd: PROJ,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', SESSION_DIR: sessionDir, RUN_DATA_DIR: sessionDir + '-rd', ALLOWED_TEST_HOSTS: '1.1.1.1',
        JWT_SECRET: 'x'.repeat(40), ENCRYPTION_KEY: 'a'.repeat(64), DPU_BASE_URL: `http://127.0.0.1:${dpu.address().port}`,
        DPU_API_KEY: 'x', DPU_PROJECT_CODE: 'x', DPU_USER_EMAIL: 'x@x', DPU_USER_PASSWORD: 'x' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((res, rej) => { setTimeout(() => rej(new Error('başlamadı')), 10000); server.stdout.on('data', d => String(d).includes('aktif') && res()); server.stderr.on('data', d => process.stderr.write(d)); });

const H = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };

// ── Senaryo A: 20 kullanıcı AYNI IP'den giriş
const sameIp = await Promise.all(Array.from({ length: 20 }, (_, i) => fetch(base + '/api/auth/login', { method: 'POST', headers: { ...H, 'X-Forwarded-For': '10.9.9.9' }, body: JSON.stringify({ username: 'user' + i, password: 'Parola-123456' }) }).then(r => r.status)));
const okSame = sameIp.filter(s => s === 200).length, blocked = sameIp.filter(s => s === 429).length;
console.log(`[A] Aynı IP'den 20 eşzamanlı giriş: başarılı=${okSame}, 429 engellenen=${blocked}  (beklenen: 20/0 — limit kullanıcı başınadır)`);

// ── Senaryo B: 20 farklı IP, eşzamanlı giriş + 20 sn kullanım
const t0 = Date.now();
const cookies = await Promise.all(Array.from({ length: 20 }, async (_, i) => {
    const s = Date.now();
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { ...H, 'X-Forwarded-For': `10.1.0.${i + 1}` }, body: JSON.stringify({ username: 'user' + i, password: 'Parola-123456' }) });
    return { i, status: r.status, ms: Date.now() - s, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}));
console.log(`[B] 20 farklı IP eşzamanlı giriş: durumlar=${[...new Set(cookies.map(c => c.status))]}, süre p50=${pct(cookies.map(c => c.ms), .5)}ms max=${Math.max(...cookies.map(c => c.ms))}ms`);

const lat = {}, codes = {};
const rec = (name, ms, status) => { (lat[name] ||= []).push(ms); codes[name + ':' + status] = (codes[name + ':' + status] || 0) + 1; };
const dpuBefore = dpuCalls; let reqCount = 0;
const end = Date.now() + 20000;
await Promise.all(cookies.filter(c => c.status === 200).map(async ({ i, cookie }) => {
    const h = { 'X-Requested-With': 'fetch', Cookie: cookie, 'X-Forwarded-For': `10.1.0.${i + 1}` };
    const proj = 'Proje' + (i % 5);
    const calls = [
        ['projects', `/api/scenarios/projects/list`],
        ['scenarios', `/api/scenarios/list?project=${proj}&testType=UI`],
        ['content', `/api/scenarios/content?scenarioName=sen${(i % 5)}&project=${proj}`],
        ['reports', `/api/scenarios/reports/list?project=${proj}&testType=UI`],
        ['me', `/api/auth/me`],
    ];
    while (Date.now() < end) {
        for (const [n, u] of calls) {
            const s = Date.now();
            try { const r = await fetch(base + u, { headers: h }); const b = await r.arrayBuffer(); rec(n, Date.now() - s, r.status + (n === 'reports' ? `(${Math.round(b.byteLength / 1024)}KB)` : '')); } catch (e) { rec(n, Date.now() - s, 'ERR'); }
            reqCount++;
            await new Promise(r => setTimeout(r, 300)); // kullanıcı düşünme süresi
        }
    }
}));
const secs = (Date.now() - t0) / 1000;
console.log(`[B] ${reqCount} istek, ~${(reqCount / 20).toFixed(1)} istek/sn, DPU çağrısı=${dpuCalls - dpuBefore} (istek başına ${((dpuCalls - dpuBefore) / reqCount).toFixed(1)}), DPU gecikmesi=${DPU_LATENCY}ms`);
for (const [n, a] of Object.entries(lat)) console.log(`   ${n.padEnd(10)} n=${a.length} p50=${pct(a, .5)}ms p95=${pct(a, .95)}ms max=${Math.max(...a)}ms`);
console.log('   durum kodları:', JSON.stringify(Object.fromEntries(Object.entries(codes).map(([k, v]) => [k, v])).valueOf()).slice(0, 600));
server.kill(); dpu.close(); fs.rmSync(sessionDir, { recursive: true, force: true });
process.exit(0);
