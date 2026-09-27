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
app.get('/api/health', async (req, res) => {
    const health = { status: 'UP', timestamp: new Date().toISOString(), services: { server: 'HEALTHY', database: 'UNKNOWN' } };
    try {
        const dbCheck = await dpu.select('projeler', 1);
        if (dbCheck && dbCheck.success) {
            health.services.database = 'HEALTHY';
            return res.status(200).json(health);
        }
        health.status = 'DEGRADED';
        health.services.database = 'UNHEALTHY';
        return res.status(503).json(health);
    } catch {
        health.status = 'DOWN';
        health.services.database = 'DOWN';
        return res.status(503).json(health);
    }
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

app.listen(env.PORT, () => {
    console.log(`Sunucu http://localhost:${env.PORT} üzerinde aktif`);
});
