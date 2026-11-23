import crypto from 'crypto';
import { env } from '../config/env.js';

// ─── TEST ÇALIŞTIRMA KUYRUĞU ───
// HTTP isteği testin bitmesini beklemez: iş kuyruğa eklenir, istemciye
// hemen bir iş ID'si döner, istemci durumu /jobs/:id ile sorgular.
//
//  • En fazla `concurrency` test AYNI ANDA koşar (RUN_CONCURRENCY).
//  • ADİL SIRALAMA: boş slot açıldığında, o an en az testi koşan kullanıcının en eski işi
//    seçilir. Bir kullanıcı 50 iş atsa bile diğerlerinin işi araya girer.
//  • ÖNCELİK: tek (etkileşimli/canlı) çalıştırmalar, toplu işlerden önce slot alır; böylece toplu
//    çalıştıran kullanıcılar, sistemi aktif kullanan diğerlerinin testlerini bekletmez.
//  • Kullanıcı başına sınır (MAX_QUEUED_PER_USER): bekleyen + koşan toplamı.
//  • Kuyruktaki ve koşan işler iptal edilebilir (abort sinyaliyle).
//  • Tahmini bekleme süresi, tamamlanan işlerin ortalama süresinden hesaplanır.
// Not: Kuyruk bellektedir; sunucu yeniden başlarsa bekleyen işler kaybolur
// (tamamlanan işlerin raporları zaten veritabanındadır).

const FINISHED_TTL_MS = 60 * 60 * 1000;
const DEFAULT_AVG_MS = 120_000;

export class QueueFullError extends Error {
    constructor() {
        super('Test kuyruğu dolu. Lütfen mevcut testlerin bitmesini bekleyin.');
        this.statusCode = 429;
    }
}

export class UserQueueFullError extends Error {
    constructor(limit) {
        super(`Aynı anda en fazla ${limit} testiniz sırada/çalışır durumda olabilir. Biri bitince yenisini ekleyin.`);
        this.statusCode = 429;
    }
}

export class JobQueue {
    constructor({ concurrency = 1, maxQueued = 50, maxPerUser = Infinity } = {}) {
        this.concurrency = concurrency;
        this.maxQueued = maxQueued;
        this.maxPerUser = maxPerUser;
        this.jobs = new Map();
        this.pending = [];
        this.running = 0;
        this.runningByOwner = new Map();
        this.lastServed = new Map();   // kullanıcı -> en son slot aldığı sıra no (dönüşümlü adalet)
        this.serveCounter = 0;
        this.avgDurationMs = DEFAULT_AVG_MS;

        this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
        this.cleanupTimer.unref?.();
    }

    get activeCount() {
        return this.running + this.pending.length;
    }

    ownerLoad(owner) {
        return (this.runningByOwner.get(owner) || 0) + this.pending.filter(j => j.owner === owner).length;
    }

    /**
     * @param {{ owner: string, meta: object, task: (ctx: { signal: AbortSignal }) => Promise<object> }} options
     */
    enqueue({ owner, meta = {}, task, priority = 0 }) {
        if (this.accepting === false) throw Object.assign(new Error('Sunucu yeniden başlatılıyor; birkaç dakika sonra tekrar deneyin.'), { statusCode: 503 });
        if (this.pending.length >= this.maxQueued) throw new QueueFullError();
        if (this.ownerLoad(owner) >= this.maxPerUser) throw new UserQueueFullError(this.maxPerUser);

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
            priority,
            abort: new AbortController(),
        };
        this.jobs.set(job.id, job);
        this.pending.push(job);
        setImmediate(() => this.drain());
        return this.view(job);
    }

    get(id) {
        return this.jobs.get(id) || null;
    }

    // Boş slot açıldığında seçim: (0) yüksek öncelikli iş (tek çalıştırma), (1) o an en az testi koşan
    // kullanıcı, (2) eşitlikte slotu en uzun süredir almamış kullanıcı (dönüşümlü), (3) en eski iş.
    pickFrom(list, running, served) {
        let best = -1;
        let bestPriority = -Infinity;
        let bestRun = Infinity;
        let bestServed = Infinity;
        for (let i = 0; i < list.length; i++) {
            const pr = list[i].priority || 0;
            const r = running.get(list[i].owner) || 0;
            const sv = served.get(list[i].owner) || 0;
            if (pr > bestPriority || (pr === bestPriority && (r < bestRun || (r === bestRun && sv < bestServed)))) {
                best = i; bestPriority = pr; bestRun = r; bestServed = sv;
            }
        }
        return best;
    }

    pickIndex() {
        return this.pickFrom(this.pending, this.runningByOwner, this.lastServed);
    }

    // Bekleyen işlerin tahmini çalışma sırası (seçim politikasının simülasyonu).
    order() {
        const running = new Map(this.runningByOwner);
        const served = new Map(this.lastServed);
        let counter = this.serveCounter;
        const remaining = [...this.pending];
        const ordered = [];
        while (remaining.length) {
            const [job] = remaining.splice(this.pickFrom(remaining, running, served), 1);
            running.set(job.owner, (running.get(job.owner) || 0) + 1);
            served.set(job.owner, ++counter);
            ordered.push(job);
        }
        return ordered;
    }

    view(job) {
        const position = job.status === 'queued' ? this.order().indexOf(job) + 1 : 0;
        const waves = position > 0 ? Math.ceil(position / Math.max(1, this.concurrency)) : 0;
        return {
            id: job.id,
            status: job.status,
            position,
            estimatedWaitSeconds: waves ? Math.round((waves * this.avgDurationMs) / 1000) : 0,
            ...job.meta,
            result: job.result,
            error: job.error,
            queuedAt: job.queuedAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
        };
    }

    /** İşi iptal eder. Bekleyen iş hemen kaldırılır; koşan işe abort sinyali gönderilir. */
    cancel(id) {
        const job = this.jobs.get(id);
        if (!job) return null;
        if (job.status === 'queued') {
            this.pending.splice(this.pending.indexOf(job), 1);
            job.status = 'cancelled';
            job.error = 'Test iptal edildi.';
            job.finishedAt = new Date().toISOString();
            job.abort.abort();
            job.task = null;
            return job;
        }
        if (job.status === 'running') {
            job.cancelRequested = true;
            job.abort.abort();
        }
        return job;
    }

    /** Sahibinin SIRADA bekleyen tüm işlerini iptal eder (koşanlar sürer). Kaç iş iptal edildiğini döner. */
    cancelQueued(owner) {
        const mine = this.pending.filter(j => j.owner === owner);
        for (const job of mine) this.cancel(job.id);
        return mine;
    }

    /** Sahibine ait (veya yönetici için herkese ait) aktif işler. */
    listActive(owner) {
        return [...this.jobs.values()]
            .filter(j => (j.status === 'queued' || j.status === 'running') && (owner === undefined || j.owner === owner))
            .map(j => this.view(j));
    }

    stats() {
        return { running: this.running, queued: this.pending.length, concurrency: this.concurrency, maxQueued: this.maxQueued, avgDurationMs: Math.round(this.avgDurationMs) };
    }

    drain() {
        while (this.running < this.concurrency && this.pending.length > 0) {
            const index = this.pickIndex();
            const [job] = this.pending.splice(index, 1);
            this.running++;
            this.runningByOwner.set(job.owner, (this.runningByOwner.get(job.owner) || 0) + 1);
            this.lastServed.set(job.owner, ++this.serveCounter);
            job.status = 'running';
            job.startedAt = new Date().toISOString();

            Promise.resolve()
                .then(() => job.task({ signal: job.abort.signal }))
                .then((result) => {
                    if (job.cancelRequested) {
                        job.status = 'cancelled';
                        job.error = 'Test iptal edildi.';
                    } else {
                        job.status = 'completed';
                        job.result = result;
                    }
                })
                .catch((err) => {
                    if (job.cancelRequested) {
                        job.status = 'cancelled';
                        job.error = 'Test iptal edildi.';
                        return;
                    }
                    console.error(`[JobQueue] İş başarısız (${job.id}):`, err);
                    job.status = 'failed';
                    job.error = err?.message || 'Bilinmeyen hata';
                })
                .finally(() => {
                    job.finishedAt = new Date().toISOString();
                    job.task = null;
                    this.running--;
                    const left = (this.runningByOwner.get(job.owner) || 1) - 1;
                    if (left <= 0) this.runningByOwner.delete(job.owner); else this.runningByOwner.set(job.owner, left);
                    if (!this.runningByOwner.has(job.owner) && !this.pending.some(j => j.owner === job.owner)) this.lastServed.delete(job.owner);
                    if (job.status === 'completed') {
                        const took = new Date(job.finishedAt) - new Date(job.startedAt);
                        if (Number.isFinite(took) && took > 0) this.avgDurationMs = this.avgDurationMs * 0.7 + took * 0.3;
                    }
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

    /** Kapatma sırasında: yeni iş alma, koşanları belirtilen süre bekle. */
    async shutdown(graceMs = 60_000) {
        this.accepting = false;
        const start = Date.now();
        while (this.running > 0 && Date.now() - start < graceMs) await new Promise(r => setTimeout(r, 500));
        return { stillRunning: this.running, queued: this.pending.length };
    }
}

export const runQueue = new JobQueue({
    concurrency: env.RUN_CONCURRENCY,
    maxQueued: env.MAX_QUEUED_RUNS,
    maxPerUser: env.MAX_QUEUED_PER_USER,
});
