import express from 'express';
import dpu from '../config/dpuService.js';
import { requireAuth } from '../middleware/auth.js';
import { withAiCapacity } from '../middleware/aiCapacity.js';
import { aiCallLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { requireProjectAccess } from '../utils/projectGuard.js';
import { isSafeUrl } from '../utils/ipGuard.js';
import { translateToStagehandJsonStrict } from '../utils/translator.js';
import { compileScenarioData } from '../utils/scenarioData.js';
import { runtimeStepsSchema } from '../schemas/runtimeSteps.js';
import { stripImportMarkers } from '../utils/stepGroups.js';
import {
    listScenariosSchema, getScenarioContentSchema, createScenarioSchema, updateScenarioSchema, deleteScenarioSchema
} from '../schemas/scenarioSchemas.js';
import { getProjectByName, getScenario } from '../services/projectService.js';
import { z } from 'zod';
import { invalidateReports } from '../services/reportService.js';

// Kullanıcının düzeltebileceği çeviri/veri hataları (eksik [[FORM:..]] anahtarı, geçersiz test verisi vb.)
// 500 yerine anlaşılır 400 olarak döner; böylece kayıt yarım kalmaz.
async function translateOrFail(res, ...args) {
    try {
        return { ok: true, value: await translateScenario(...args) };
    } catch (err) {
        const message = err instanceof z.ZodError ? 'Test verisi veya adımlar geçersiz. Alanları kontrol edin.' : (err?.message || 'Senaryo çevirisi tamamlanamadı.');
        res.status(400).json({ error: message });
        return { ok: false };
    }
}

const router = express.Router();

const projectFromQuery = (req) => String(req.query.project || req.query.projectName || '').trim();

const toInstructionText = (turkishInstructions) =>
    typeof turkishInstructions === 'string' ? turkishInstructions : JSON.stringify(turkishInstructions);

// Türkçe adımları yapay zekaya çevirtir. İçe aktarma işaretçileri yalnızca
// arayüz içindir; çeviriye düz adımlar gider. Hedef URL her zaman kullanıcının
// girdiği ve doğrulanan değerdir, modelin ürettiği değer kullanılmaz.
async function translateScenario(turkishInstructions, targetUrl, expectedErrorText = '', testData = {}) {
    const input = typeof turkishInstructions === 'string' ? stripImportMarkers(turkishInstructions) : turkishInstructions;
    const stagehandJson = await compileScenarioData(input, testData, translateToStagehandJsonStrict, targetUrl);
    if (!stagehandJson || typeof stagehandJson !== 'object') return null;
    const checked = runtimeStepsSchema.safeParse({ ...stagehandJson, targetUrl, expectedErrorText });
    return checked.success ? checked.data : null;
}

// ─── PROJE BAZLI SENARYOLARI LİSTELEME ───
router.get('/list', requireAuth, validate(listScenariosSchema), requireProjectAccess, async (req, res, next) => {
    const selectedProj = projectFromQuery(req);
    const testType = String(req.query.testType || 'UI').toUpperCase();
    if (!selectedProj) return res.json({ scenarios: [] });

    try {
        const project = await getProjectByName(selectedProj);
        if (!project) return res.json({ scenarios: [] });

        const scenariosRes = await dpu.selectWhere('senaryolar', { project_id: { eq: project.id } });
        if (!scenariosRes.success || !scenariosRes.data) return res.json({ scenarios: [] });

        const scenarios = scenariosRes.data
            .filter(s => (s.test_tipi || 'UI').toUpperCase() === testType)
            .map(s => s.senaryo_adi);
        return res.json({ scenarios });
    } catch (error) {
        next(error);
    }
});

// ─── SENARYO İÇERİĞİNİ OKUMA ───
router.get('/content', requireAuth, validate(getScenarioContentSchema), requireProjectAccess, async (req, res, next) => {
    const scenarioName = req.query.scenarioName;
    const selectedProj = projectFromQuery(req) || 'Varsayılan Proje';

    try {
        const project = await getProjectByName(selectedProj);
        if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

        const scenario = await getScenario(project.id, scenarioName);
        if (!scenario) return res.status(404).json({ error: 'Senaryo bulunamadı.' });

        let content = null;
        if (scenario.adimlar) {
            try {
                content = typeof scenario.adimlar === 'string' ? JSON.parse(scenario.adimlar) : scenario.adimlar;
            } catch {
                content = null;
            }
        }
        // Gösterilen hedef URL her zaman kayıtlı değerdir
        if (content && typeof content === 'object' && scenario.hedef_url) {
            content = { ...content, targetUrl: scenario.hedef_url };
        }

        return res.json({
            success: true,
            content,
            contentTr: scenario.adimlar_tr || null,
            testType: scenario.test_tipi || 'UI',
            expectedOutcome: scenario.beklenen_sonuc || 'SUCCESS_EXPECTED'
        });
    } catch (error) {
        next(error);
    }
});

// ─── SENARYO KAYDETME VE AI ÇEVİRİSİ ───
router.post('/create-and-save', requireAuth, aiCallLimiter, validate(createScenarioSchema), requireProjectAccess, withAiCapacity(async (req, res, next) => {
    const { scenarioName, turkishInstructions, targetUrl, projectName, testType, expectedOutcome, expectedErrorText, testData } = req.body;

    const urlCheck = await isSafeUrl(targetUrl);
    if (!urlCheck.safe) return res.status(400).json({ error: `Güvenlik Engeli: ${urlCheck.reason}` });

    try {
        const project = await getProjectByName(projectName || 'Varsayılan Proje');
        if (!project) return res.status(404).json({ error: 'İlgili proje bulunamadı!' });

        if (await getScenario(project.id, scenarioName)) {
            return res.status(400).json({ error: 'Bu proje altında bu senaryo adı zaten mevcut!' });
        }

        // Önce çevir, sonra tek seferde kaydet: çeviri hata verirse veritabanında yarım kayıt kalmaz.
        const translated = await translateOrFail(res, turkishInstructions, targetUrl, expectedErrorText, testData);
        if (!translated.ok) return;
        const stagehandJson = translated.value;

        const nowIso = new Date().toISOString();
        const insertResult = await dpu.insert('senaryolar', {
            project_id: project.id,
            senaryo_adi: scenarioName,
            hedef_url: targetUrl,
            adimlar_tr: toInstructionText(turkishInstructions),
            adimlar: stagehandJson ? JSON.stringify(stagehandJson) : '',
            test_tipi: (testType || 'UI').toUpperCase(),
            beklenen_sonuc: (expectedOutcome || 'SUCCESS_EXPECTED').toUpperCase(),
            created_at: nowIso,
            updated_at: nowIso
        });
        if (!insertResult.success) {
            return res.status(500).json({ error: 'Senaryo veritabanına eklenemedi.' });
        }

        if (stagehandJson) {
            return res.json({ success: true, status: 'SUCCESS', message: 'Senaryo başarıyla oluşturuldu ve yapay zeka çevirisi tamamlandı.' });
        }

        return res.json({
            success: true,
            status: 'WARNING',
            message: 'Senaryo kaydedildi ancak yapay zeka çevirisi tamamlanamadı. Adımları düzenleyip tekrar kaydedebilirsiniz.'
        });
    } catch (error) {
        next(error);
    }
}));

// ─── SENARYO GÜNCELLEME ───
router.post('/update', requireAuth, aiCallLimiter, validate(updateScenarioSchema), requireProjectAccess, withAiCapacity(async (req, res, next) => {
    const { scenarioName, originalScenarioName, turkishInstructions, targetUrl, projectName, testType, expectedOutcome, expectedErrorText, testData } = req.body;

    const urlCheck = await isSafeUrl(targetUrl);
    if (!urlCheck.safe) return res.status(400).json({ error: `Güvenlik Engeli: ${urlCheck.reason}` });

    try {
        const project = await getProjectByName(projectName || 'Varsayılan Proje');
        if (!project) return res.status(404).json({ error: 'İlgili proje bulunamadı!' });

        const existing = await getScenario(project.id, originalScenarioName);
        if (!existing) return res.status(404).json({ error: 'Düzenlenecek senaryo bulunamadı.' });

        // testType/expectedOutcome gönderilmediyse kayıtlı değer korunur (varsayılan üzerine yazılmaz).
        const effectiveOutcome = (expectedOutcome || existing.beklenen_sonuc || 'SUCCESS_EXPECTED').toUpperCase();
        if (effectiveOutcome === 'ERROR_EXPECTED' && String(expectedErrorText || '').trim().length < 3) {
            return res.status(400).json({ error: 'Beklenen engelleme mesajını en az 3 karakterle belirtin.' });
        }

        const isRename = scenarioName !== originalScenarioName;
        if (isRename) {
            const conflict = await getScenario(project.id, scenarioName);
            if (conflict && String(conflict.id) !== String(existing.id)) {
                return res.status(400).json({ error: 'Bu proje altında bu senaryo adı zaten mevcut!' });
            }
        }

        // Önce çevir; çeviri başarısızsa eski adımlar yeni hedefte çalıştırılmasın diye adimlar boşaltılır.
        const translated = await translateOrFail(res, turkishInstructions, targetUrl, expectedErrorText, testData);
        if (!translated.ok) return;
        const stagehandJson = translated.value;

        const updateRes = await dpu.update('senaryolar', existing.id, {
            senaryo_adi: scenarioName,
            hedef_url: targetUrl,
            adimlar_tr: toInstructionText(turkishInstructions),
            adimlar: stagehandJson ? JSON.stringify(stagehandJson) : '',
            test_tipi: testType ? testType.toUpperCase() : (existing.test_tipi || 'UI'),
            beklenen_sonuc: effectiveOutcome,
            updated_at: new Date().toISOString()
        });
        if (!updateRes.success) {
            return res.status(500).json({ error: 'Senaryo güncellenirken veritabanı hatası oluştu.' });
        }

        // Raporlar senaryoya adıyla bağlı; yeniden adlandırmada geçmiş raporlar da taşınır
        if (isRename) {
            const reportsRes = await dpu.selectWhere('raporlar', {
                project_id: { eq: project.id },
                scenario_name: { eq: originalScenarioName }
            });
            if (reportsRes.success && reportsRes.data) {
                for (const report of reportsRes.data) {
                    await dpu.update('raporlar', report.id, { scenario_name: scenarioName });
                }
            }
            invalidateReports(project.id);
        }

        if (stagehandJson) {
            return res.json({ success: true, status: 'SUCCESS', message: 'Senaryo ve çevirisi başarıyla güncellendi.' });
        }

        return res.json({ success: true, status: 'WARNING', message: 'Senaryo güncellendi ancak yapay zeka çevirisi tamamlanamadı.' });
    } catch (error) {
        next(error);
    }
}));

// ─── SENARYO SİLME ───
router.post('/delete', requireAuth, validate(deleteScenarioSchema), requireProjectAccess, async (req, res, next) => {
    const { scenarioName, projectName } = req.body;

    try {
        const project = await getProjectByName(projectName);
        if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

        const scenario = await getScenario(project.id, scenarioName);
        if (!scenario) return res.status(404).json({ error: 'Silinecek senaryo bulunamadı.' });

        const deleteResult = await dpu.delete('senaryolar', scenario.id);
        if (deleteResult.success) return res.json({ success: true, message: 'Senaryo başarıyla silindi!' });
        return res.status(500).json({ error: 'Senaryo silinirken veritabanı hatası oluştu.' });
    } catch (error) {
        next(error);
    }
});

export default router;
