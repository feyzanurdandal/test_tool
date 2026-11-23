// server.js
// env.js ilk import olmalı: diğer modüller process.env'i yükleme anında okur.
import './config/env.js';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env.js';
import dpu from './config/dpuService.js';
import { requireCsrfHeader } from './middleware/auth.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/index.js';
import { registerHostPolicy } from './services/hostPolicyService.js';
import { runQueue } from './services/jobQueue.js';
import { browserSessions } from './services/browserSessions.js';

process.umask(0o077);
// Yönetici "Test İzinli Adresler" listesi ana süreçte DPU ayarlarından okunur.
registerHostPolicy();

// Beklenmeyen hatalar sürecin sessizce çökmesine yol açmasın: kaydedilir.
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    // Durum belirsiz: Docker (restart: always) temiz bir süreç başlatsın.
    setTimeout(() => process.exit(1), 100).unref();
});
const app = express();

// Yalnızca önündeki tek nginx'e güvenilir (docker-compose'da Node dışarıya kapalı)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Helmet & CSP: tüm betikler ve stiller artık yerelden sunuluyor
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
        },
    },
}));

app.use(express.json({ limit: '1mb' }));

// ─── HEALTH-CHECK (kimlik doğrulama gerektirmez, iç ayrıntı sızdırmaz) ───
// /api/live  : yalnızca süreç ayakta mı (Docker healthcheck için; DPU'ya bağımlı DEĞİL)
// /api/health: DPU bağlantısını da denetler; sonuç 5 sn önbelleklenir (her çağrı DPU'ya gitmesin)
app.get('/api/live', (req, res) => res.status(200).json({ status: 'UP' }));

let healthCache = { at: 0, code: 200, body: null };
app.get('/api/health', async (req, res) => {
    if (healthCache.body && Date.now() - healthCache.at < 5000) {
        return res.status(healthCache.code).json(healthCache.body);
    }
    const health = { status: 'UP', timestamp: new Date().toISOString(), services: { server: 'HEALTHY', database: 'UNKNOWN' } };
    let code = 200;
    try {
        const dbCheck = await dpu.select('projeler', 1);
        if (dbCheck && dbCheck.success) {
            health.services.database = 'HEALTHY';
        } else {
            health.status = 'DEGRADED';
            health.services.database = 'UNHEALTHY';
            code = 503;
        }
    } catch {
        health.status = 'DOWN';
        health.services.database = 'DOWN';
        code = 503;
    }
    healthCache = { at: Date.now(), code, body: health };
    return res.status(code).json(health);
});

// ─── API ROTALARI ───
app.use('/api', requireCsrfHeader);
app.use('/api/auth', authRouter);
app.use('/api/scenarios', apiRouter);
app.use('/api', notFoundHandler);

// ─── STATİK DOSYALAR & SPA ───
const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir, { index: 'index.html' }));
app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

const server = app.listen(env.PORT, () => {
    const q = runQueue.stats();
    console.log(`Sunucu http://localhost:${env.PORT} üzerinde aktif (eşzamanlı test: ${q.concurrency}, kuyruk sınırı: ${q.maxQueued})`);
});
// Uzun süren istekler (AI çeviri) için Node'un varsayılan zaman aşımları yeterlidir; nginx tarafı ayarlıdır.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// ─── GÜVENLİ KAPATMA (docker stop / yeniden dağıtım) ───
// Yeni bağlantı/iş alınmaz, çalışan testlerin bitmesi beklenir (en fazla SHUTDOWN_GRACE_SECONDS),
// ardından tarayıcı oturumları kapatılır. Aksi halde her dağıtım koşan testleri öldürürdü.
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${signal}] Kapatma başladı: yeni iş alınmıyor, çalışan testler bekleniyor...`);
    server.close();
    const graceMs = (Number(process.env.SHUTDOWN_GRACE_SECONDS) || 90) * 1000;
    const result = await runQueue.shutdown(graceMs);
    if (result.stillRunning) console.warn(`Süre doldu: ${result.stillRunning} test yarıda kesildi, ${result.queued} bekleyen iş kaybedildi.`);
    await browserSessions.closeAll().catch(() => {});
    process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
