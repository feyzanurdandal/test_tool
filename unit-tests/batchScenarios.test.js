import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { JobQueue } = await import('../services/jobQueue.js');
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
async function waitUntil(fn, timeoutMs = 5000) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > timeoutMs) throw new Error('Koşul zaman aşımına uğradı');
        await tick(2);
    }
}
// Her iş çalışmaya başladığında kaydedilir; testin süresi ms cinsinden verilir.
function recorder(q, ms = 40) {
    const started = [];
    const spec = (owner, name, kind) => ({ owner, priority: kind === 'single' ? 1 : 0, meta: { kind, name },
        task: async () => { started.push(name); await tick(ms); return {}; } });
    return { started, add: (owner, name, kind) => q.enqueue(spec(owner, name, kind)) };
}

test('iki kullanıcı 40\'ar testlik toplu iş atabilir (varsayılan kullanıcı sınırı 50) ve dönüşümlü ilerler', async () => {
    const { env } = await import('../config/env.js');
    assert.ok(env.MAX_QUEUED_PER_USER >= 50, `varsayılan sınır toplu çalıştırmaya yetmeli (şu an ${env.MAX_QUEUED_PER_USER})`);
    const q = new JobQueue({ concurrency: 2, maxQueued: 200, maxPerUser: env.MAX_QUEUED_PER_USER });
    const r = recorder(q, 5);
    for (let i = 1; i <= 40; i++) r.add('A', 'A' + i, 'batch');
    for (let i = 1; i <= 40; i++) r.add('B', 'B' + i, 'batch');
    assert.equal(q.pending.length + q.running, 80 - 0, 'hiçbiri reddedilmedi');
    await waitUntil(() => r.started.length === 80, 8000);
    // Dönüşümlü: ilk 20 başlangıçta iki kullanıcıdan eşit sayıda iş var
    const firstTwenty = r.started.slice(0, 20);
    const a = firstTwenty.filter(n => n.startsWith('A')).length;
    assert.ok(Math.abs(a - 10) <= 1, `A ${a}, B ${20 - a}: biri diğerini bekletmemeli`);
    clearInterval(q.cleanupTimer);
});

test('3 kullanıcı: ikisi toplu çalıştırırken üçüncünün tek testi ilk boşalan slota girer', async () => {
    const q = new JobQueue({ concurrency: 2, maxQueued: 200, maxPerUser: 50 });
    const r = recorder(q, 60);
    for (let i = 1; i <= 10; i++) r.add('A', 'A' + i, 'batch');
    for (let i = 1; i <= 10; i++) r.add('B', 'B' + i, 'batch');
    await waitUntil(() => r.started.length === 2);        // A1, B1 koşuyor
    const c = r.add('C', 'C1', 'single');
    assert.equal(q.view(q.get(c.id)).position, 1, 'tek test kuyruğun başında görünmeli');
    await waitUntil(() => r.started.includes('C1'));
    assert.equal(r.started.indexOf('C1'), 2, 'A1 ve B1\'den hemen sonra, hiçbir toplu işin arkasında değil');
    clearInterval(q.cleanupTimer);
});

test('tek test, kullanıcı yakın zamanda slot almış olsa bile toplu işlerin önüne geçer', async () => {
    const q = new JobQueue({ concurrency: 2, maxQueued: 200, maxPerUser: 50 });
    const r = recorder(q, 40);
    r.add('C', 'C0', 'single');                            // C az önce çalıştı (lastServed yüksek)
    for (let i = 1; i <= 8; i++) r.add('A', 'A' + i, 'batch');
    for (let i = 1; i <= 8; i++) r.add('B', 'B' + i, 'batch');
    await waitUntil(() => r.started.length >= 2);
    r.add('C', 'C1', 'single');
    r.add('C', 'C2', 'single');
    await waitUntil(() => r.started.includes('C2'), 3000);
    const lastBatchBeforeC2 = Math.max(...r.started.slice(0, r.started.indexOf('C2')).map(n => n[0] === 'C' ? -1 : Number(n.slice(1))));
    assert.ok(lastBatchBeforeC2 <= 2, `C1/C2 toplu işlerin (en çok 2. testlerin) önünde çalışmalı: ${r.started.join(' ')}`);
    clearInterval(q.cleanupTimer);
});

test('"sıradakileri iptal et" yalnızca o kullanıcının bekleyen işlerini iptal eder, koşanlar sürer', async () => {
    const q = new JobQueue({ concurrency: 1, maxQueued: 200, maxPerUser: 50 });
    const r = recorder(q, 80);
    for (let i = 1; i <= 5; i++) r.add('A', 'A' + i, 'batch');
    for (let i = 1; i <= 3; i++) r.add('B', 'B' + i, 'batch');
    await waitUntil(() => r.started.length === 1);
    const cancelled = q.cancelQueued('A');
    assert.equal(cancelled.length, 4, 'A\'nın koşmayan 4 işi iptal edildi');
    assert.ok(cancelled.every(j => j.status === 'cancelled'));
    await waitUntil(() => r.started.filter(n => n[0] === 'B').length === 3, 3000);
    assert.equal(r.started.filter(n => n[0] === 'A').length, 1, 'A\'nın koşan işi dışında başka iş çalışmadı');
    clearInterval(q.cleanupTimer);
});

test('öncelik tahmini sıra numarasına yansır', async () => {
    const q = new JobQueue({ concurrency: 1, maxQueued: 200, maxPerUser: 50 });
    let release; const gate = new Promise(res => { release = res; });
    q.enqueue({ owner: 'A', task: () => gate });
    await waitUntil(() => q.running === 1);
    const batch = [1, 2, 3].map(i => q.enqueue({ owner: 'B', priority: 0, meta: { kind: 'batch' }, task: async () => ({}) }));
    const single = q.enqueue({ owner: 'C', priority: 1, meta: { kind: 'single' }, task: async () => ({}) });
    assert.equal(q.view(q.get(single.id)).position, 1);
    assert.equal(q.view(q.get(batch[0].id)).position, 2);
    release();
    clearInterval(q.cleanupTimer);
});
