import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { JobQueue, QueueFullError } = await import('../services/jobQueue.js');
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
// Sabit süre beklemek yük altında kırılgan; koşul sağlanana kadar bekle
async function waitUntil(fn, timeoutMs = 2000) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > timeoutMs) throw new Error('Koşul zaman aşımına uğradı');
        await tick(2);
    }
}

test('eşzamanlılık sınırına uyulur ve sıra korunur', async () => {
    const q = new JobQueue({ concurrency: 1, maxQueued: 10 });
    const order = [];
    let release;
    const gate = new Promise(r => { release = r; });

    const a = q.enqueue({ owner: 'u', task: async () => { order.push('a:start'); await gate; order.push('a:end'); return { status: 'SUCCESS' }; } });
    const b = q.enqueue({ owner: 'u', task: async () => { order.push('b'); return { status: 'FAILED' }; } });

    await waitUntil(() => q.get(a.id).status === 'running');
    assert.equal(q.get(b.id).status, 'queued');
    assert.equal(q.view(q.get(b.id)).position, 1);

    release();
    await waitUntil(() => q.get(b.id).status === 'completed');
    assert.deepEqual(order, ['a:start', 'a:end', 'b']);
    assert.equal(q.get(a.id).status, 'completed');
    assert.deepEqual(q.get(b.id).result, { status: 'FAILED' });
    clearInterval(q.cleanupTimer);
});

test('hata veren iş kuyruğu durdurmaz', async () => {
    const q = new JobQueue({ concurrency: 1 });
    const bad = q.enqueue({ owner: 'u', task: async () => { throw new Error('patladı'); } });
    const good = q.enqueue({ owner: 'u', task: async () => ({ status: 'SUCCESS' }) });
    await waitUntil(() => q.get(good.id).status === 'completed');
    assert.equal(q.get(bad.id).status, 'failed');
    assert.equal(q.get(bad.id).error, 'patladı');
    assert.equal(q.get(good.id).status, 'completed');
    clearInterval(q.cleanupTimer);
});

test('kuyruk doluysa QueueFullError fırlatılır', async () => {
    const q = new JobQueue({ concurrency: 1, maxQueued: 1 });
    const never = new Promise(() => {});
    const first = q.enqueue({ owner: 'u', task: () => never });
    await waitUntil(() => q.get(first.id).status === 'running');
    q.enqueue({ owner: 'u', task: () => never });
    assert.throws(() => q.enqueue({ owner: 'u', task: () => never }), QueueFullError);
    clearInterval(q.cleanupTimer);
});
