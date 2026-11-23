import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { JobQueue, UserQueueFullError } = await import('../services/jobQueue.js');
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
async function waitUntil(fn, timeoutMs = 3000) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > timeoutMs) throw new Error('Koşul zaman aşımına uğradı');
        await tick(2);
    }
}

test('adil sıralama: boş slotta en az testi koşan kullanıcının işi seçilir', async () => {
    const q = new JobQueue({ concurrency: 1, maxQueued: 50 });
    const order = [];
    let release;
    const gate = new Promise(r => { release = r; });
    const first = q.enqueue({ owner: 'ali', task: async () => { order.push('ali1'); await gate; return {}; } });
    await waitUntil(() => q.get(first.id).status === 'running');
    // Ali 3 iş daha atıyor, sonra Ayşe 1 iş ekliyor; Ayşe araya girmeli.
    for (const n of ['ali2', 'ali3', 'ali4']) q.enqueue({ owner: 'ali', task: async () => { order.push(n); return {}; } });
    const ayse = q.enqueue({ owner: 'ayse', task: async () => { order.push('ayse1'); return {}; } });
    assert.equal(q.view(q.get(ayse.id)).position, 1, 'Ayşe sıranın başında görünmeli');
    release();
    await waitUntil(() => q.get(ayse.id).status === 'completed');
    assert.equal(order[1], 'ayse1');
    await waitUntil(() => order.length === 5);
    clearInterval(q.cleanupTimer);
});

test('kullanıcı başına sınır uygulanır', async () => {
    const q = new JobQueue({ concurrency: 1, maxQueued: 50, maxPerUser: 2 });
    const never = new Promise(() => {});
    q.enqueue({ owner: 'ali', task: () => never });
    q.enqueue({ owner: 'ali', task: () => never });
    assert.throws(() => q.enqueue({ owner: 'ali', task: () => never }), UserQueueFullError);
    assert.doesNotThrow(() => q.enqueue({ owner: 'ayse', task: () => never }));
    clearInterval(q.cleanupTimer);
});

test('sıradaki iş iptal edilir, koşan işe abort sinyali gider', async () => {
    const q = new JobQueue({ concurrency: 1, maxQueued: 10 });
    let aborted = false;
    const running = q.enqueue({ owner: 'u', task: ({ signal }) => new Promise((_, reject) => { signal.addEventListener('abort', () => { aborted = true; reject(new Error('abort')); }); }) });
    const queued = q.enqueue({ owner: 'u', task: async () => ({ status: 'SUCCESS' }) });
    await waitUntil(() => q.get(running.id).status === 'running');
    q.cancel(queued.id);
    assert.equal(q.get(queued.id).status, 'cancelled');
    assert.equal(q.pending.length, 0);
    q.cancel(running.id);
    await waitUntil(() => q.get(running.id).status === 'cancelled');
    assert.equal(aborted, true);
    assert.equal(q.running, 0);
    clearInterval(q.cleanupTimer);
});

test('paralel çalışma: concurrency kadar iş aynı anda koşar', async () => {
    const q = new JobQueue({ concurrency: 3, maxQueued: 50 });
    let now = 0, peak = 0;
    const jobs = Array.from({ length: 8 }, (_, i) => q.enqueue({ owner: 'u' + (i % 4), task: async () => { now++; peak = Math.max(peak, now); await tick(25); now--; return {}; } }));
    await waitUntil(() => jobs.every(j => q.get(j.id).status === 'completed'), 5000);
    assert.equal(peak, 3);
    clearInterval(q.cleanupTimer);
});

test('kapatma: yeni iş alınmaz, koşan iş beklenir', async () => {
    const q = new JobQueue({ concurrency: 1, maxQueued: 10 });
    let release;
    const gate = new Promise(r => { release = r; });
    const job = q.enqueue({ owner: 'u', task: async () => { await gate; return {}; } });
    await waitUntil(() => q.get(job.id).status === 'running');
    const down = q.shutdown(2000);
    assert.throws(() => q.enqueue({ owner: 'u', task: async () => ({}) }), /yeniden başlatılıyor/);
    release();
    const result = await down;
    assert.equal(result.stillRunning, 0);
    clearInterval(q.cleanupTimer);
});
