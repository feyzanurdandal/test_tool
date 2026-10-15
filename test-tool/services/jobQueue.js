import crypto from 'crypto';
import { env } from '../config/env.js';

// ─── TEST ÇALIŞTIRMA KUYRUĞU ───
// HTTP isteği testin bitmesini beklemez: iş kuyruğa eklenir, istemciye
// hemen bir iş ID'si döner, istemci durumu /jobs/:id ile sorgular.
// Aynı anda en fazla RUN_CONCURRENCY test koşar.
// Not: Kuyruk bellektedir; sunucu yeniden başlarsa bekleyen işler kaybolur
// (tamamlanan işlerin raporları zaten veritabanındadır).

const FINISHED_TTL_MS = 60 * 60 * 1000;

export class QueueFullError extends Error {
    constructor() {
        super('Test kuyruğu dolu. Lütfen mevcut testlerin bitmesini bekleyin.');
        this.statusCode = 429;
    }
}

export class JobQueue {
    constructor({ concurrency = 1, maxQueued = 50 } = {}) {
        this.concurrency = concurrency;
        this.maxQueued = maxQueued;
        this.jobs = new Map();
        this.pending = [];
        this.running = 0;

        this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
        this.cleanupTimer.unref?.();
    }

    get activeCount() {
        return this.running + this.pending.length;
    }

    /**
     * @param {{ owner: string, meta: object, task: () => Promise<object> }} options
     */
    enqueue({ owner, meta = {}, task }) {
        if (this.pending.length >= this.maxQueued) throw new QueueFullError();

        const job = {
            id: crypto.randomUUID(),
            owner,
            meta,
            status: 'queued',
            result: null,
            error: null,
            queuedAt: new Date().toISOString(),
            startedAt: null,
            finishedAt: null,
            task,
        };
        this.jobs.set(job.id, job);
        this.pending.push(job);
        setImmediate(() => this.drain());
        return this.view(job);
    }

    get(id) {
        return this.jobs.get(id) || null;
    }

    view(job) {
        const position = job.status === 'queued' ? this.pending.indexOf(job) + 1 : 0;
        return {
            id: job.id,
            status: job.status,
            position,
            ...job.meta,
            result: job.result,
            error: job.error,
            queuedAt: job.queuedAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
        };
    }

    drain() {
        while (this.running < this.concurrency && this.pending.length > 0) {
            const job = this.pending.shift();
            this.running++;
            job.status = 'running';
            job.startedAt = new Date().toISOString();

            Promise.resolve()
                .then(() => job.task())
                .then((result) => {
                    job.status = 'completed';
                    job.result = result;
                })
                .catch((err) => {
                    console.error(`[JobQueue] İş başarısız (${job.id}):`, err);
                    job.status = 'failed';
                    job.error = err?.message || 'Bilinmeyen hata';
                })
                .finally(() => {
                    job.finishedAt = new Date().toISOString();
                    job.task = null;
                    this.running--;
                    this.drain();
                });
        }
    }

    cleanup() {
        const cutoff = Date.now() - FINISHED_TTL_MS;
        for (const [id, job] of this.jobs) {
            if (job.finishedAt && new Date(job.finishedAt).getTime() < cutoff) this.jobs.delete(id);
        }
    }
}

export const runQueue = new JobQueue({
    concurrency: env.RUN_CONCURRENCY,
    maxQueued: env.MAX_QUEUED_RUNS,
});
