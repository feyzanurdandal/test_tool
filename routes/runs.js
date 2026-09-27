import express from 'express';
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

function enqueueScenario(req, project, scenario) {
    return runQueue.enqueue({
        owner: req.user.username,
        meta: { scenarioName: scenario.senaryo_adi, projectName: project.proje_adi },
        task: () => executeScenario(project, scenario),
    });
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

        // Kullanıcının seçtiği sıra korunur
        for (const name of scenarioNames) {
            const scenario = byName.get(name);
            if (!scenario) {
                skipped.push({ scenarioName: name, reason: 'Senaryo bulunamadı.' });
            } else if (!scenario.adimlar) {
                skipped.push({ scenarioName: name, reason: 'Yapay zeka adımları çevrilmemiş.' });
            } else {
                jobs.push(enqueueScenario(req, project, scenario));
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
        return res.status(404).json({ error: 'İş bulunamadı veya süresi doldu.' });
    }
    return res.json({ success: true, job: runQueue.view(job) });
});

export default router;
