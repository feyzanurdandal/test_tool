import express from 'express';
import { browserSessions } from '../services/browserSessions.js';
import dpu from '../config/dpuService.js';
import { requireAuth } from '../middleware/auth.js';
import { testRunLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { requireProjectAccess } from '../utils/projectGuard.js';
import { runScenarioSchema, runBatchSchema, jobIdSchema } from '../schemas/scenarioSchemas.js';
import { getProjectByName, getScenario } from '../services/projectService.js';
import { executeScenario } from '../services/testRunner.js';
import { runQueue } from '../services/jobQueue.js';

const router = express.Router();

// kind: 'single' (etkileşimli, öncelikli) | 'batch' (toplu, arka plan)
function enqueueScenario(req, project, scenario, kind = 'single') {
    const live=req.body.live?browserSessions.createLive({owner:req.user.id,projectName:project.proje_adi}):null;
    try { return runQueue.enqueue({
        owner: req.user.username,
        priority: kind === 'single' ? 1 : 0,
        meta: { kind, scenarioName: scenario.senaryo_adi, projectName: project.proje_adi, ...(live?{liveId:live.id}:{}) },
        task: async ({ signal }) => {
            try {
                const liveFramePath=live?await browserSessions.prepareLive(live):null;
                // Çok sayıda canlı izleyici varsa kare sıklığı düşürülür (CPU/ağ tasarrufu).
                const liveFrameIntervalMs=live?Math.min(3000,900+300*Math.max(0,browserSessions.liveRunningCount()-1)):0;
                return await executeScenario(project,scenario,{liveFramePath,liveFrameIntervalMs,signal});
            } finally { if(live)browserSessions.finishLive(live); }
        },
    }); } catch(e) {if(live)void browserSessions.close(live);throw e;}
}

// ─── TEKİL TEST: kuyruğa ekler, hemen iş ID'si döner (202) ───
router.post('/run', requireAuth, testRunLimiter, validate(runScenarioSchema), requireProjectAccess, async (req, res, next) => {
    const { scenarioName, projectName } = req.body;

    try {
        const project = await getProjectByName(projectName);
        if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

        const scenario = await getScenario(project.id, scenarioName);
        if (!scenario) return res.status(404).json({ error: 'Çalıştırılacak senaryo veritabanında bulunamadı.' });

        if (!scenario.adimlar) {
            return res.status(400).json({ error: 'Bu senaryonun yapay zeka adımları henüz çevrilmemiş. Lütfen senaryoyu düzenleyip tekrar kaydedin.' });
        }

        const job = enqueueScenario(req, project, scenario);
        return res.status(202).json({ success: true, jobId: job.id, job });
    } catch (error) {
        next(error);
    }
});

// ─── TOPLU TEST: seçilen sırayla kuyruğa ekler ───
router.post('/run-batch', requireAuth, testRunLimiter, validate(runBatchSchema), requireProjectAccess, async (req, res, next) => {
    const { scenarioNames, projectName } = req.body;

    try {
        const project = await getProjectByName(projectName);
        if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

        const scenariosRes = await dpu.selectWhere('senaryolar', { project_id: { eq: project.id } });
        if (!scenariosRes.success || !scenariosRes.data) {
            return res.status(500).json({ error: 'Senaryolar tablosuna erişilemedi.' });
        }

        const byName = new Map(scenariosRes.data.map(s => [s.senaryo_adi, s]));
        const jobs = [];
        const skipped = [];

        const eligible = [...new Set(scenarioNames)].filter(name => byName.get(name)?.adimlar);
        if (eligible.length > runQueue.maxQueued - runQueue.pending.length) {
            return res.status(429).json({ error:'Test kuyruğunda bu toplu işlem için yeterli yer yok.' });
        }
        const userRoom = runQueue.maxPerUser - runQueue.ownerLoad(req.user.username);
        if (eligible.length > userRoom) {
            return res.status(429).json({ error:`Aynı anda en fazla ${runQueue.maxPerUser} testiniz sırada/çalışır durumda olabilir; şu an ${Math.max(0,userRoom)} test daha ekleyebilirsiniz.` });
        }

        // Kullanıcının seçtiği sıra korunur
        for (const name of [...new Set(scenarioNames)]) {
            const scenario = byName.get(name);
            if (!scenario) {
                skipped.push({ scenarioName: name, reason: 'Senaryo bulunamadı.' });
            } else if (!scenario.adimlar) {
                skipped.push({ scenarioName: name, reason: 'Yapay zeka adımları çevrilmemiş.' });
            } else {
                jobs.push(enqueueScenario(req, project, scenario, 'batch'));
            }
        }

        if (jobs.length === 0) {
            return res.status(404).json({ error: 'Kuyruğa eklenebilecek senaryo bulunamadı!', skipped });
        }

        return res.status(202).json({
            success: true,
            jobs: jobs.map(j => ({ jobId: j.id, scenarioName: j.scenarioName })),
            skipped,
        });
    } catch (error) {
        next(error);
    }
});

// ─── İŞ DURUMU ───
router.get('/jobs/:id', requireAuth, validate(jobIdSchema), (req, res) => {
    const job = runQueue.get(req.params.id);
    if (!job || (job.owner !== req.user.username && req.user.role !== 'ADMIN')) {
        return res.status(404).json({ error: 'İş bulunamadı veya süresi doldu. Sunucu yeniden başlatılmış olabilir; testi tekrar başlatın.' });
    }
    return res.json({ success: true, job: runQueue.view(job) });
});

// ─── KULLANICININ SIRADA / ÇALIŞAN TESTLERİ ───
router.get('/jobs', requireAuth, (req, res) => {
    const all = req.user.role === 'ADMIN' && req.query.all === '1';
    return res.json({ success: true, jobs: runQueue.listActive(all ? undefined : req.user.username), queue: runQueue.stats() });
});

// ─── SIRADAKİ TÜM TESTLERİMİ İPTAL ET (toplu çalıştırmayı yarıda bırakmak için) ───
router.post('/jobs/cancel-queued', requireAuth, (req, res) => {
    const cancelled = runQueue.cancelQueued(req.user.username);
    for (const job of cancelled) {
        const liveId = job.meta?.liveId;
        const live = liveId ? browserSessions.sessions.get(liveId) : null;
        if (live) browserSessions.finishLive(live);
    }
    return res.json({ success: true, cancelled: cancelled.length });
});

// ─── İPTAL (sıradaki iş kaldırılır, çalışan test durdurulur) ───
router.post('/jobs/:id/cancel', requireAuth, validate(jobIdSchema), (req, res) => {
    const job = runQueue.get(req.params.id);
    if (!job || (job.owner !== req.user.username && req.user.role !== 'ADMIN')) {
        return res.status(404).json({ error: 'İş bulunamadı veya süresi doldu.' });
    }
    if (!['queued', 'running'].includes(job.status)) {
        return res.status(409).json({ error: 'Bu test zaten tamamlanmış.' });
    }
    runQueue.cancel(job.id);
    const liveId = job.meta?.liveId;
    if (liveId) {
        const live = browserSessions.sessions.get(liveId);
        if (live && job.status === 'cancelled') browserSessions.finishLive(live);
    }
    return res.json({ success: true, job: runQueue.view(job) });
});

export default router;
