import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dpu from '../config/dpuService.js';
import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { aiCallLimiter, testRunLimiter } from '../middleware/rateLimit.js';
import { isSafeUrl } from '../utils/ipGuard.js';
import { translateToStagehandJson } from '../utils/translator.js';
import { encrypt, decrypt } from '../utils/cryptoHelper.js';
import { validate } from '../middleware/validate.js';
import { requireProjectAccess } from '../utils/projectGuard.js';
import {
    createProjectSchema,
    updateProjectSchema,
    deleteProjectSchema,
    getScenarioContentSchema,
    createScenarioSchema,
    updateScenarioSchema,
    runScenarioSchema,
    runBatchSchema,
    createUserSchema,
    updateUserSchema
} from '../schemas/scenarioSchemas.js';

const router = express.Router();

// Playwright testini Dinamik Dosya Yolu ve TIMEOUT Mekanizmasıyla Çalıştırma
const runPlaywrightTest = (stepsFilePath, timeoutMs = 300000) => {
    return new Promise((resolve) => {
        console.log(`🔥 Playwright motoru asenkron olarak tetikleniyor... (Dosya: ${stepsFilePath})`);
        
        const env = { ...process.env, RUNTIME_STEPS_PATH: stepsFilePath };

        const childProcess = exec('npx playwright test tests/ai-security.spec.ts', { env, timeout: timeoutMs }, (error, stdout, stderr) => {
            if (error) {
                if (error.killed) {
                    console.error(`Playwright Testi Zaman Aşımına Uğradı (${timeoutMs / 1000}sn) ve Öldürüldü!`);
                } else {
                    console.error("Playwright Test Hatası (stdout):", stdout);
                    console.error("Playwright Test Hatası (stderr):", stderr);
                }
            } else {
                console.log("Playwright Testi Başarıyla Tamamlandı.");
            }

            try {
                if (fs.existsSync(stepsFilePath)) fs.unlinkSync(stepsFilePath);
            } catch (e) {
                console.error("Geçici dosya silinemedi:", e.message);
            }

            resolve({
                isSuccess: !error,
                logContent: stdout + (stderr ? `\n--- Hatalar ---\n${stderr}` : '') + (error?.killed ? '\n[HATA]: Test zaman aşımına uğradı.' : '')
            });
        });
    });
};

//  DİNAMİK VE PROJE BAZLI HATA / GÜVENLİK DEĞERLENDİRİCİ
const evaluateTestOutcome = (logContent, customKeywordsRaw = '', expectedOutcome = 'SUCCESS_EXPECTED', isExecutionSuccess = true) => {
    if (!logContent) return isExecutionSuccess ? "SUCCESS" : "FAILED";
    const lowerLog = logContent.toLowerCase();

    // 1. Genel Sistem Seviyesi Motor Hataları
    const baseErrorKeywords = [
        'error:', 'exception:', 'cannot find element',
        'incorrect api key', 'failed to launch', 'timeout',
        'execution context was destroyed', 'alert:', 'modal-error'
    ];

    // 2. Proje Sahibinin Arayüzden Girdiği Özel Hata / Engelleme Kalıpları
    const projectCustomKeywords = (customKeywordsRaw || '')
        .split('\n')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);

    const allKeywords = [...baseErrorKeywords, ...projectCustomKeywords];
    const detectedKeyword = allKeywords.find(kw => lowerLog.includes(kw));

    // 3. Beklenen Sonuca Göre Karar Verme (Ters Mantık / Güvenlik Desteği)
    if (expectedOutcome === 'ERROR_EXPECTED') {
        // Siber güvenlik testi: Sistem engelledi veya beklenen hata mesajını fırlattıysa TEST BAŞARILIDIR
        return (detectedKeyword || !isExecutionSuccess) ? "SUCCESS" : "FAILED";
    } else {
        // Standart UI veya normal geçiş testi: Hata mesajı varsa BAŞARISIZDIR
        return (isExecutionSuccess && !detectedKeyword) ? "SUCCESS" : "FAILED";
    }
};

// ─── 1. API: PROJELERİ LİSTELEME ───
router.get('/projects/list', requireAuth, async (req, res, next) => {
    const userRole = req.user.role;
    const username = req.user.username;

    try {
        const result = await dpu.selectAll('projeler');
        if (!result.success) {
            return res.status(500).json({ 
                error: "DPU Base listeleme hatası", 
                ...(process.env.NODE_ENV === 'production' ? {} : { details: result }) 
            });
        }

        let allProjects = result.data;

        if (userRole !== 'ADMIN' && username) {
            const permissionsRes = await dpu.selectWhere('kullanici_projeleri', {
                kullanici_adi: { eq: username.toLowerCase() }
            });

            if (permissionsRes.success && permissionsRes.data) {
                const allowedProjects = permissionsRes.data.map(p => p.proje_adi.toLowerCase());
                allProjects = allProjects.filter(p => allowedProjects.includes(p.proje_adi.toLowerCase()));
            } else {
                allProjects = [];
            }
        }
        
        if (allProjects.length === 0 && userRole === 'ADMIN') {
            await dpu.insert('projeler', { proje_adi: 'Varsayılan Proje', hata_anahtar_kelimeleri: '' });
            return res.json({ 
                success: true, 
                projects: ['Varsayılan Proje'],
                projectDetails: [{ proje_adi: 'Varsayılan Proje', hata_anahtar_kelimeleri: '' }]
            });
        }
        
        return res.json({ 
            success: true, 
            projects: allProjects.map(p => p.proje_adi),
            projectDetails: allProjects.map(p => ({
                id: p.id,
                proje_adi: p.proje_adi,
                hata_anahtar_kelimeleri: p.hata_anahtar_kelimeleri || ''
            }))
        });
    } catch (error) {
        next(error);
    }
});

// ─── 2. API: YENİ PROJE OLUŞTURMA (Sadece ADMIN Yetkili) ───
router.post('/projects/create', requireAuth, requireAdmin, validate(createProjectSchema), async (req, res, next) => {
    const { projectName, customErrorKeywords } = req.body;

    const sanitizedProjName = projectName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    if (!sanitizedProjName) return res.status(400).json({ error: "Geçersiz proje adı!" });

    try {
        const checkExist = await dpu.selectWhere('projeler', {
            proje_adi: { eq: sanitizedProjName }
        });

        if (checkExist.success && checkExist.data && checkExist.data.length > 0) {
            return res.status(400).json({ error: "Bu isimde bir proje zaten mevcut!" });
        }

        const insertPayload = {
            proje_adi: sanitizedProjName,
            hata_anahtar_kelimeleri: customErrorKeywords || ''
        };

        const result = await dpu.insert('projeler', insertPayload);
        if (result.success) {
            return res.json({ success: true, projectName: sanitizedProjName });
        }
        return res.status(500).json({ 
            error: "DPU Base proje kayıt hatası", 
            ...(process.env.NODE_ENV === 'production' ? {} : { details: result }) 
        });
    } catch (error) {
        next(error);
    }
});

// ─── 2.1 API: PROJE SİLME (Sadece ADMIN Yetkili) ───
router.post('/projects/delete', requireAuth, requireAdmin, validate(deleteProjectSchema), async (req, res, next) => {
    const { projectName } = req.body;

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: projectName.trim() }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Silinecek proje bulunamadı!" });
        }

        const foundProj = projectRes.data[0];

        const deleteRes = await dpu.delete('projeler', foundProj.id);
        if (!deleteRes.success) {
            return res.status(500).json({ error: "Proje silinirken veritabanı hatası oluştu." });
        }

        const permsRes = await dpu.selectWhere('kullanici_projeleri', {
            proje_adi: { eq: projectName.trim() }
        });

        if (permsRes.success && permsRes.data) {
            for (const perm of permsRes.data) {
                await dpu.delete('kullanici_projeleri', perm.id);
            }
        }

        return res.json({ success: true, message: `"${projectName}" projesi ve bağlı tüm kullanıcı yetkileri silindi.` });
    } catch (error) {
        next(error);
    }
});

// ─── 2.2 API: PROJE GÜNCELLEME (İsim & Hata Kelimeleri) ───
router.post('/projects/update', requireAuth, requireAdmin, validate(updateProjectSchema), async (req, res, next) => {
    const { oldProjectName, newProjectName, customErrorKeywords } = req.body;

    if (oldProjectName.trim() === 'Varsayılan Proje' && newProjectName.trim() !== 'Varsayılan Proje') {
        return res.status(400).json({ error: "Varsayılan projenin adı değiştirilemez!" });
    }

    const sanitizedNewName = newProjectName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    if (!sanitizedNewName) {
        return res.status(400).json({ error: "Geçersiz yeni proje adı!" });
    }

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: oldProjectName.trim() }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Güncellenecek proje bulunamadı!" });
        }

        const foundProj = projectRes.data[0];

        if (oldProjectName.trim() !== sanitizedNewName) {
            const checkExist = await dpu.selectWhere('projeler', {
                proje_adi: { eq: sanitizedNewName }
            });

            if (checkExist.success && checkExist.data && checkExist.data.length > 0) {
                return res.status(400).json({ error: "Bu isimde bir proje zaten mevcut!" });
            }
        }

        const updatePayload = {
            proje_adi: sanitizedNewName,
            hata_anahtar_kelimeleri: customErrorKeywords || ''
        };

        const updateRes = await dpu.update('projeler', foundProj.id, updatePayload);
        if (!updateRes.success) {
            return res.status(500).json({ error: "Proje güncellenirken veritabanı hatası oluştu." });
        }

        if (oldProjectName.trim() !== sanitizedNewName) {
            const permsRes = await dpu.selectWhere('kullanici_projeleri', {
                proje_adi: { eq: oldProjectName.trim() }
            });

            if (permsRes.success && permsRes.data) {
                for (const perm of permsRes.data) {
                    await dpu.update('kullanici_projeleri', perm.id, { proje_adi: sanitizedNewName });
                }
            }
        }

        return res.json({ 
            success: true, 
            projectName: sanitizedNewName, 
            message: `Proje bilgileri başarıyla güncellendi.` 
        });
    } catch (error) {
        next(error);
    }
});

// ─── 3. API: PROJE BAZLI SENARYOLARI LİSTELEME ───
router.get('/list', requireAuth, requireProjectAccess, async (req, res, next) => {
    const project = req.query.project || req.query.projectName;
    const testType = (req.query.testType || 'UI').toUpperCase();
    const selectedProj = (project || '').trim();

    if (!selectedProj) return res.json({ scenarios: [] });

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.json({ scenarios: [] });
        }

        const projectId = projectRes.data[0].id;

        const scenariosRes = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId }
        });
        
        if (scenariosRes.success && scenariosRes.data) {
            const filteredScenarios = scenariosRes.data
                .filter(s => (s.test_tipi || 'UI').toUpperCase() === testType)
                .map(s => s.senaryo_adi);

            return res.json({ scenarios: filteredScenarios });
        }
        
        return res.json({ scenarios: [] });
    } catch (error) {
        next(error);
    }
});

// ─── 4. API: SENARYO İÇERİĞİNİ OKUMA ───
router.get('/content', requireAuth, validate(getScenarioContentSchema), requireProjectAccess, async (req, res, next) => {
    const scenarioName = req.query.scenarioName;
    const selectedProj = (req.query.project || req.query.projectName || 'Varsayılan Proje').trim();

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }

        const projectId = projectRes.data[0].id;

        const scenarioRes = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId },
            senaryo_adi: { eq: scenarioName }
        });

        if (scenarioRes.success && scenarioRes.data && scenarioRes.data.length > 0) {
            const scenario = scenarioRes.data[0];
            let adimlarContent = null;
            
            if (scenario.adimlar) {
                try {
                    adimlarContent = typeof scenario.adimlar === 'string' ? JSON.parse(scenario.adimlar) : scenario.adimlar;
                } catch {
                    adimlarContent = scenario.adimlar;
                }
            }

            return res.json({ 
                success: true, 
                content: adimlarContent,
                contentTr: scenario.adimlar_tr || null,
                testType: scenario.test_tipi || 'UI',
                expectedOutcome: scenario.beklenen_sonuc || 'SUCCESS_EXPECTED'
            });
        }

        return res.status(404).json({ error: "Senaryo bulunamadı." });
    } catch (error) {
        next(error);
    }
});

// ─── 5. API: SENARYO KAYDETME VE AI ÇEVİRİSİ ───
router.post('/create-and-save', aiCallLimiter, requireAuth, validate(createScenarioSchema), requireProjectAccess, async (req, res, next) => {
    const { scenarioName, turkishInstructions, targetUrl, projectName, testType, expectedOutcome } = req.body;
    const selectedProj = (projectName || 'Varsayılan Proje').trim();
    const finalTestType = (testType || 'UI').toUpperCase();
    const finalExpectedOutcome = (expectedOutcome || 'SUCCESS_EXPECTED').toUpperCase();

    const urlCheck = await isSafeUrl(targetUrl);
    if (!urlCheck.safe) {
        return res.status(400).json({ error: `Güvenlik Engeli: ${urlCheck.reason}` });
    }

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "İlgili proje bulunamadı!" });
        }
        const projectId = projectRes.data[0].id;

        const checkScenario = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId },
            senaryo_adi: { eq: scenarioName }
        });

        if (checkScenario.success && checkScenario.data && checkScenario.data.length > 0) {
            return res.status(400).json({ error: "Bu proje altında bu senaryo adı zaten mevcut!" });
        }

        const nowIso = new Date().toISOString();
        const rawTrText = typeof turkishInstructions === 'string' 
            ? turkishInstructions 
            : JSON.stringify(turkishInstructions);

        const insertPayload = {
            project_id: projectId,
            senaryo_adi: scenarioName,
            hedef_url: targetUrl,
            adimlar_tr: rawTrText,
            adimlar: "", 
            test_tipi: finalTestType,
            beklenen_sonuc: finalExpectedOutcome,
            created_at: nowIso,
            updated_at: nowIso
        };

        const insertResult = await dpu.insert('senaryolar', insertPayload);
        if (!insertResult.success) {
            return res.status(500).json({ error: "Senaryo veritabanına eklenemedi." });
        }

        let createdScenarioId = null;
        if (insertResult.data && (insertResult.data.id || insertResult.data.insertId)) {
            createdScenarioId = insertResult.data.id || insertResult.data.insertId;
        } else {
            const findCreated = await dpu.selectWhere('senaryolar', {
                project_id: { eq: projectId },
                senaryo_adi: { eq: scenarioName }
            });
            if (findCreated.success && findCreated.data && findCreated.data.length > 0) {
                createdScenarioId = findCreated.data[0].id;
            }
        }

        const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);

        if (stagehandJson && createdScenarioId) {
            await dpu.update('senaryolar', createdScenarioId, {
                adimlar: JSON.stringify(stagehandJson),
                updated_at: new Date().toISOString()
            });

            return res.status(200).json({ 
                success: true, 
                status: "SUCCESS", 
                message: "Senaryo başarıyla oluşturuldu ve yapay zeka çevirisi tamamlandı." 
            });
        } else {
            return res.status(200).json({ 
                success: true, 
                status: "WARNING", 
                message: "Senaryo kaydedildi ancak yapay zeka çevirisi tamamlanamadı. Adımları düzenleyip tekrar kaydedebilirsiniz." 
            });
        }
    } catch (error) {
        next(error);
    }
});

// ─── 5.1 API: SENARYO GÜNCELLEME ───
router.post('/update', aiCallLimiter, requireAuth, validate(updateScenarioSchema), requireProjectAccess, async (req, res, next) => {
    const { scenarioName, originalScenarioName, turkishInstructions, targetUrl, projectName, testType, expectedOutcome } = req.body;
    const selectedProj = (projectName || 'Varsayılan Proje').trim();

    const urlCheck = await isSafeUrl(targetUrl);
    if (!urlCheck.safe) {
        return res.status(400).json({ error: `Güvenlik Engeli: ${urlCheck.reason}` });
    }

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "İlgili proje bulunamadı!" });
        }
        const projectId = projectRes.data[0].id;

        const existingRes = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId },
            senaryo_adi: { eq: originalScenarioName }
        });

        if (!existingRes.success || !existingRes.data || existingRes.data.length === 0) {
            return res.status(404).json({ error: "Düzenlenecek senaryo bulunamadı." });
        }
        const existingScenario = existingRes.data[0];

        if (scenarioName !== originalScenarioName) {
            const conflictRes = await dpu.selectWhere('senaryolar', {
                project_id: { eq: projectId },
                senaryo_adi: { eq: scenarioName }
            });

            if (conflictRes.success && conflictRes.data && conflictRes.data.length > 0) {
                return res.status(400).json({ error: "Bu proje altında bu senaryo adı zaten mevcut!" });
            }
        }

        const rawTrText = typeof turkishInstructions === 'string' 
            ? turkishInstructions 
            : JSON.stringify(turkishInstructions);

        const updatePayload = {
            senaryo_adi: scenarioName,
            hedef_url: targetUrl,
            adimlar_tr: rawTrText,
            test_tipi: testType ? testType.toUpperCase() : (existingScenario.test_tipi || 'UI'),
            beklenen_sonuc: expectedOutcome ? expectedOutcome.toUpperCase() : (existingScenario.beklenen_sonuc || 'SUCCESS_EXPECTED'),
            updated_at: new Date().toISOString()
        };

        await dpu.update('senaryolar', existingScenario.id, updatePayload);

        const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
        if (stagehandJson) {
            await dpu.update('senaryolar', existingScenario.id, {
                adimlar: JSON.stringify(stagehandJson),
                updated_at: new Date().toISOString()
            });

            return res.status(200).json({ success: true, status: "SUCCESS", message: "Senaryo ve çevirisi başarıyla güncellendi." });
        }

        return res.status(200).json({ 
            success: true, 
            status: "WARNING", 
            message: "Senaryo güncellendi ancak yapay zeka çevirisi tamamlanamadı." 
        });
    } catch (error) {
        next(error);
    }
});

// ─── 6. API: SENARYO SİLME ───
router.post('/delete', requireAuth, requireProjectAccess, async (req, res, next) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioName || !selectedProj) return res.status(400).json({ error: "Eksik parametre var!" });

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = projectRes.data[0].id;

        const scenarioRes = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId },
            senaryo_adi: { eq: scenarioName }
        });

        if (!scenarioRes.success || !scenarioRes.data || scenarioRes.data.length === 0) {
            return res.status(404).json({ error: "Silinecek senaryo bulunamadı." });
        }

        const foundScenario = scenarioRes.data[0];

        const deleteResult = await dpu.delete('senaryolar', foundScenario.id);
        if (deleteResult.success) {
            return res.status(200).json({ success: true, message: "Senaryo başarıyla silindi!" });
        }
        return res.status(500).json({ error: "Senaryo silinirken veritabanı hatası oluştu." });
    } catch (error) {
        next(error);
    }
});

// ─── 7. API: TEKİL TESTİ PLAYWRIGHT İLE KOŞTURMA (Dinamik Hata Değerlendirmesiyle) ───
router.post('/run', testRunLimiter, requireAuth, validate(runScenarioSchema), requireProjectAccess, async (req, res, next) => {
    const { scenarioName, targetUrl, projectName } = req.body;

    if (targetUrl) {
        const urlCheck = await isSafeUrl(targetUrl);
        if (!urlCheck.safe) {
            return res.status(400).json({ error: `Güvenlik Engeli: ${urlCheck.reason}` });
        }
    }

    const selectedProj = (projectName || '').trim();

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        
        const projectObj = projectRes.data[0];
        const projectId = projectObj.id;
        const customKeywords = projectObj.hata_anahtar_kelimeleri || '';

        const scenariosRes = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId },
            senaryo_adi: { eq: scenarioName }
        });

        if (!scenariosRes.success || !scenariosRes.data || scenariosRes.data.length === 0) {
            return res.status(404).json({ error: "Çalıştırılacak senaryo veritabanında bulunamadı." });
        }

        const foundScenario = scenariosRes.data[0];
        const scenarioTestType = (foundScenario.test_tipi || 'UI').toUpperCase();
        const expectedOutcome = (foundScenario.beklenen_sonuc || 'SUCCESS_EXPECTED').toUpperCase();

        if (!foundScenario.adimlar) {
            return res.status(400).json({ error: "Bu senaryonun yapay zeka adımları henüz çevrilmemiş. Lütfen senaryoyu düzenleyip tekrar kaydedin." });
        }

        const cacheDir = path.join(process.cwd(), 'cache');
        const aiSecurityDir = path.join(cacheDir, 'ai-security');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        if (!fs.existsSync(aiSecurityDir)) fs.mkdirSync(aiSecurityDir, { recursive: true });

        const uniqueFileName = `runtime_steps_${Date.now()}_${Math.random().toString(36).substring(7)}.json`;
        const runtimeStepsPath = path.join(cacheDir, uniqueFileName);

        const rawSteps = foundScenario.adimlar;
        const stepsString = typeof rawSteps === 'string' ? rawSteps : JSON.stringify(rawSteps, null, 2);
        fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');

        const testResult = await runPlaywrightTest(runtimeStepsPath);

        const safeLogContent = testResult.logContent && testResult.logContent.length > 50000 
            ? testResult.logContent.slice(-50000) 
            : (testResult.logContent || '');

        //  DİNAMİK STATÜ HESABI (Proje özel hata kelimeleri + Beklenen Sonuç Mantığı)
        const finalStatus = evaluateTestOutcome(safeLogContent, customKeywords, expectedOutcome, testResult.isSuccess);

        const reportData = {
            project_id: projectId,
            scenario_name: scenarioName,
            test_tipi: scenarioTestType,
            status: finalStatus,
            log_content: safeLogContent,
            created_at: new Date().toISOString()
        };

        try {
            await dpu.insert('raporlar', reportData);
        } catch (dbErr) {
            console.error("Rapor veritabanına yazılırken istisna oluştu:", dbErr.message);
        }

        if (finalStatus === "FAILED" && !testResult.isSuccess) {
            return res.status(500).json({ success: false, error: "Test koşturulurken hata tespit edildi!", output: testResult.logContent });
        }

        return res.status(200).json({ 
            success: true, 
            status: finalStatus,
            message: `Test tamamlandı. Sonuç: ${finalStatus}` 
        });
    } catch (error) {
        next(error);
    }
});

// ─── 8. API: PROJE BAZLI RAPORLARI LİSTELEME ───
router.get('/reports/list', requireAuth, requireProjectAccess, async (req, res, next) => {
    const project = req.query.project || req.query.projectName;
    const testType = (req.query.testType || 'UI').toUpperCase();
    const selectedProj = (project || '').trim();

    if (!selectedProj) return res.json({ reports: [] });

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.json({ reports: [] });
        }
        
        const projectId = projectRes.data[0].id;

        let reportsRes = await dpu.selectWhere('raporlar', {
            project_id: { eq: projectId }
        }, { limit: 1000 });

        if ((!reportsRes.success || !reportsRes.data || reportsRes.data.length === 0) && typeof projectId === 'number') {
            reportsRes = await dpu.selectWhere('raporlar', {
                project_id: { eq: String(projectId) }
            }, { limit: 1000 });
        }

        if (reportsRes.success && reportsRes.data) {
            const filteredReports = reportsRes.data
                .filter(r => (r.test_tipi || 'UI').toUpperCase() === testType)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return res.json({ success: true, reports: filteredReports });
        }

        return res.json({ reports: [] });
    } catch (error) {
        next(error);
    }
});

// ─── 9. API: SIRALI TOPLU TEST KOŞTURMA (Dinamik Hata Değerlendirmesiyle) ───
router.post('/run-batch', testRunLimiter, requireAuth, validate(runBatchSchema), requireProjectAccess, async (req, res, next) => {
    const { scenarioNames, projectName, testType } = req.body;
    const selectedProj = (projectName || '').trim();

    try {
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        
        const projectObj = projectRes.data[0];
        const projectId = projectObj.id;
        const customKeywords = projectObj.hata_anahtar_kelimeleri || '';

        const scenariosRes = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId }
        });

        if (!scenariosRes.success || !scenariosRes.data) return res.status(500).json({ error: "Senaryolar tablosuna erişilemedi." });

        const batchScenarios = scenariosRes.data.filter(s => scenarioNames.includes(s.senaryo_adi));
        if (batchScenarios.length === 0) return res.status(404).json({ error: "Kuyruktaki hiçbir senaryo bulunamadı!" });

        res.status(202).json({ success: true, message: "Toplu test pipeline akışı başlatıldı!" });

        (async () => {
            for (const scenario of batchScenarios) {
                if (!scenario.adimlar) continue;

                const cacheDir = path.join(process.cwd(), 'cache');
                if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

                const uniqueFileName = `runtime_steps_${Date.now()}_${Math.random().toString(36).substring(7)}.json`;
                const runtimeStepsPath = path.join(cacheDir, uniqueFileName);

                const stepsString = typeof scenario.adimlar === 'string' ? scenario.adimlar : JSON.stringify(scenario.adimlar, null, 2);
                fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');

                const testResult = await runPlaywrightTest(runtimeStepsPath);

                const safeLogContent = testResult.logContent && testResult.logContent.length > 50000 
                    ? testResult.logContent.slice(-50000) 
                    : (testResult.logContent || '');

                const expectedOutcome = (scenario.beklenen_sonuc || 'SUCCESS_EXPECTED').toUpperCase();
                const finalStatus = evaluateTestOutcome(safeLogContent, customKeywords, expectedOutcome, testResult.isSuccess);

                const reportData = {
                    project_id: projectId,
                    scenario_name: scenario.senaryo_adi,
                    test_tipi: scenario.test_tipi || 'UI',
                    status: finalStatus,
                    log_content: safeLogContent,
                    created_at: new Date().toISOString()
                };

                await dpu.insert('raporlar', reportData);
            }
        })();
    } catch (error) {
        next(error);
    }
});

// ─── 10. API: AYARLARI GETİRME ───
router.get('/settings/get', requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const dbResult = await dpu.selectAll('ayarlar');
        const settings = { testRunnerApi: "openai", translatorApi: "gemini", apiKeys: {} };

        if (dbResult.success && dbResult.data && dbResult.data.length > 0) {
            const testRunnerRow = dbResult.data.find(r => r.ayar_anahtar === 'test_runner_api');
            const translatorRow = dbResult.data.find(r => r.ayar_anahtar === 'translator_api');

            if (testRunnerRow) settings.testRunnerApi = testRunnerRow.ayar_deger;
            if (translatorRow) settings.translatorApi = translatorRow.ayar_deger;

            dbResult.data.forEach(row => {
                if (row.ayar_anahtar !== 'test_runner_api' && row.ayar_anahtar !== 'translator_api') {
                    const rawKey = row.ayar_deger || "";
                    settings.apiKeys[row.ayar_anahtar] = {
                        key: decrypt(rawKey),
                        model: row.ayar_model || ""
                    };
                }
            });
        }
        return res.json({ success: true, settings });
    } catch (err) {
        next(err);
    }
});

// ─── 11. API: AYARLARI KAYDETME ───
router.post('/settings/save', requireAuth, requireAdmin, async (req, res, next) => {
    const { testRunnerApi, translatorApi, apiKeys } = req.body;
    
    try {
        const nowIso = new Date().toISOString();
        const currentDb = await dpu.selectAll('ayarlar');
        const existingRows = currentDb.success && currentDb.data ? currentDb.data : [];

        const targetSettings = {
            'test_runner_api': { val: testRunnerApi || 'openai', model: null },
            'translator_api': { val: translatorApi || 'gemini', model: null }
        };

        if (apiKeys && typeof apiKeys === 'object') {
            Object.entries(apiKeys).forEach(([provider, details]) => {
                const encryptedKey = details.key ? encrypt(details.key) : "";
                targetSettings[provider] = {
                    val: encryptedKey,
                    model: details.model || ""
                };
            });
        }

        for (const [key, details] of Object.entries(targetSettings)) {
            const matchedRow = existingRows.find(row => row.ayar_anahtar === key);
            const insertData = {
                ayar_anahtar: key,
                ayar_deger: details.val,
                ayar_model: details.model,
                updated_at: nowIso
            };

            if (matchedRow) {
                if (matchedRow.ayar_deger !== details.val || matchedRow.ayar_model !== details.model) {
                    await dpu.delete('ayarlar', matchedRow.id);
                    await dpu.insert('ayarlar', { ...insertData, created_at: matchedRow.created_at || nowIso });
                }
            } else {
                await dpu.insert('ayarlar', { ...insertData, created_at: nowIso });
            }
        }

        for (const row of existingRows) {
            if (row.ayar_anahtar !== 'test_runner_api' && row.ayar_anahtar !== 'translator_api') {
                if (!(row.ayar_anahtar in targetSettings)) {
                    await dpu.delete('ayarlar', row.id);
                }
            }
        }

        return res.json({ success: true, message: "Ayarlar başarıyla veritabanına mühürlendi!" });
    } catch (err) {
        next(err);
    }
});

// ─── 12. API: TEKİL TEST RAPORUNU SİLME ───
router.post('/reports/delete', requireAuth, async (req, res, next) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Eksik parametre! Rapor ID değeri gelmedi." });

    try {
        const reportRes = await dpu.selectWhere('raporlar', { id: { eq: id } });
        if (!reportRes.success || !reportRes.data || reportRes.data.length === 0) {
            return res.status(404).json({ error: "Silinecek rapor bulunamadı." });
        }

        const report = reportRes.data[0];

        if (req.user.role !== 'ADMIN') {
            const projectRes = await dpu.selectWhere('projeler', { id: { eq: report.project_id } });
            if (projectRes.success && projectRes.data && projectRes.data.length > 0) {
                const projectName = projectRes.data[0].proje_adi;
                const permsRes = await dpu.selectWhere('kullanici_projeleri', { kullanici_adi: { eq: req.user.username.toLowerCase() } });
                const allowed = permsRes.success && permsRes.data ? permsRes.data.some(p => p.proje_adi.toLowerCase() === projectName.toLowerCase()) : false;
                
                if (!allowed) {
                    return res.status(403).json({ error: "Erişim Engellendi: Bu rapora ait projede silme yetkiniz yok!" });
                }
            }
        }

        const deleteResult = await dpu.delete('raporlar', id);
        if (deleteResult.success) {
            return res.status(200).json({ success: true, message: "Test raporu başarıyla silindi!" });
        }
        return res.status(500).json({ error: "Silme işlemi veritabanında başarısız oldu." });
    } catch (error) {
        next(error);
    }
});

// ─── 12.1 API: TOPLU TEST RAPORLARINI SİLME ───
router.post('/reports/delete-batch', requireAuth, async (req, res, next) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Silinecek rapor ID'leri gönderilmedi!" });
    }

    try {
        let deletedCount = 0;
        let userAllowedProjects = null;

        if (req.user.role !== 'ADMIN') {
            const permsRes = await dpu.selectWhere('kullanici_projeleri', { kullanici_adi: { eq: req.user.username.toLowerCase() } });
            userAllowedProjects = permsRes.success && permsRes.data ? permsRes.data.map(p => p.proje_adi.toLowerCase()) : [];
        }

        for (const id of ids) {
            const reportRes = await dpu.selectWhere('raporlar', { id: { eq: id } });
            if (reportRes.success && reportRes.data && reportRes.data.length > 0) {
                const report = reportRes.data[0];

                let isAllowed = true;
                if (req.user.role !== 'ADMIN') {
                    const projectRes = await dpu.selectWhere('projeler', { id: { eq: report.project_id } });
                    if (projectRes.success && projectRes.data && projectRes.data.length > 0) {
                        const projectName = projectRes.data[0].proje_adi.toLowerCase();
                        isAllowed = userAllowedProjects.includes(projectName);
                    } else {
                        isAllowed = false;
                    }
                }

                if (isAllowed) {
                    const deleteResult = await dpu.delete('raporlar', id);
                    if (deleteResult.success) deletedCount++;
                }
            }
        }

        return res.status(200).json({ 
            success: true, 
            message: `${deletedCount} adet rapor başarıyla silindi.` 
        });
    } catch (error) {
        next(error);
    }
});

// ─── API: ÖNBELLEK (CACHE) TEMİZLEME ───
router.post('/cache/clear', requireAuth, async (req, res, next) => {
    try {
        const cacheDir = path.join(process.cwd(), 'cache');
        const aiSecurityDir = path.join(cacheDir, 'ai-security');
        
        if (fs.existsSync(cacheDir)) {
            const files = fs.readdirSync(cacheDir);
            for (const file of files) {
                const curPath = path.join(cacheDir, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    fs.rmSync(curPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(curPath);
                }
            }
        }
        
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        if (!fs.existsSync(aiSecurityDir)) fs.mkdirSync(aiSecurityDir, { recursive: true });

        return res.json({ success: true, message: "Geçici önbellek (cache) dosyaları başarıyla temizlendi!" });
    } catch (error) {
        console.error("Cache temizleme hatası:", error);
        return res.status(500).json({ error: "Önbellek temizlenirken bir sunucu hatası oluştu." });
    }
});

// ─── KULLANICI YÖNETİMİ ───

// 1. Kullanıcıları Listeleme
router.get('/users/list', requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const usersRes = await dpu.selectAll('kullanicilar');
        const projectsRes = await dpu.selectAll('projeler');
        const permsRes = await dpu.selectAll('kullanici_projeleri');

        if (usersRes.success) {
            const formattedUsers = usersRes.data.map(user => {
                const userProjects = permsRes.success && permsRes.data
                    ? permsRes.data.filter(p => p.kullanici_adi.toLowerCase() === user.kullanici_adi.toLowerCase()).map(p => p.proje_adi)
                    : [];

                return {
                    id: user.id,
                    kullanici_adi: user.kullanici_adi,
                    rol: user.rol,
                    projeler: userProjects
                };
            });

            return res.json({ success: true, users: formattedUsers, allProjects: projectsRes.success ? projectsRes.data.map(p => p.proje_adi) : [] });
        }
        return res.status(500).json({ error: "Kullanıcılar yüklenemedi." });
    } catch (err) {
        next(err);
    }
});

// 2. Yeni Kullanıcı Oluşturma
router.post('/users/create', requireAuth, requireAdmin, validate(createUserSchema), async (req, res, next) => {
    const { username, password, role, selectedProjects } = req.body;

    try {
        const usersCheck = await dpu.selectWhere('kullanicilar', {
            kullanici_adi: { eq: username.toLowerCase() }
        });

        if (usersCheck.success && usersCheck.data && usersCheck.data.length > 0) {
            return res.status(400).json({ error: "Bu kullanıcı adı zaten mevcut!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userInsert = await dpu.insert('kullanicilar', {
            kullanici_adi: username,
            sifre: hashedPassword,
            rol: role.toUpperCase()
        });

        if (userInsert.success) {
            if (Array.isArray(selectedProjects)) {
                for (const proj of selectedProjects) {
                    await dpu.insert('kullanici_projeleri', {
                        kullanici_adi: username,
                        proje_adi: proj
                    });
                }
            }
            return res.json({ success: true, message: "Kullanıcı başarıyla oluşturuldu!" });
        }
        return res.status(500).json({ error: "Kullanıcı eklenemedi." });
    } catch (err) {
        next(err);
    }
});

// 3. Kullanıcı Silme
router.post('/users/delete', requireAuth, requireAdmin, async (req, res, next) => {
    const { id, username } = req.body;
    if (!id || !username) return res.status(400).json({ error: "Eksik parametre!" });

    try {
        const deleteUser = await dpu.delete('kullanicilar', id);
        if (deleteUser.success) {
            const permsRes = await dpu.selectWhere('kullanici_projeleri', {
                kullanici_adi: { eq: username.toLowerCase() }
            });

            if (permsRes.success && permsRes.data) {
                for (const perm of permsRes.data) {
                    await dpu.delete('kullanici_projeleri', perm.id);
                }
            }
            return res.json({ success: true, message: "Kullanıcı ve yetkileri silindi!" });
        }
        return res.status(500).json({ error: "Kullanıcı silinemedi." });
    } catch (err) {
        next(err);
    }
});

// 4. Kullanıcı Güncelleme
router.post('/users/update', requireAuth, requireAdmin, validate(updateUserSchema), async (req, res, next) => {
    const { id, username, password, role, selectedProjects } = req.body;

    try {
        const usersRes = await dpu.selectWhere('kullanicilar', {
            id: { eq: id }
        });

        if (!usersRes.success || !usersRes.data || usersRes.data.length === 0) {
            return res.status(404).json({ error: "Güncellenecek kullanıcı bulunamadı." });
        }

        const existingUser = usersRes.data[0];

        let finalPassword = existingUser.sifre;
        if (password && password.trim() !== '') {
            finalPassword = await bcrypt.hash(password, 10);
        }

        const finalRole = role ? role.toUpperCase() : existingUser.rol;

        const updatePayload = {
            kullanici_adi: username,
            sifre: finalPassword,
            rol: finalRole
        };

        const updateRes = await dpu.update('kullanicilar', existingUser.id, updatePayload);
        
        if (!updateRes || !updateRes.success) {
            return res.status(500).json({ 
                error: "Kullanıcı bilgileri güncellenirken veritabanı hatası oluştu.", 
                ...(process.env.NODE_ENV === 'production' ? {} : { details: updateRes }) 
            });
        }

        const permsRes = await dpu.selectWhere('kullanici_projeleri', {
            kullanici_adi: { eq: username.toLowerCase() }
        });

        if (permsRes.success && permsRes.data) {
            for (const perm of permsRes.data) {
                await dpu.delete('kullanici_projeleri', perm.id);
            }
        }

        if (Array.isArray(selectedProjects)) {
            for (const proj of selectedProjects) {
                await dpu.insert('kullanici_projeleri', {
                    kullanici_adi: username,
                    proje_adi: proj
                });
            }
        }

        return res.json({ success: true, message: "Kullanıcı bilgileri ve yetkileri başarıyla güncellendi!" });
    } catch (err) {
        next(err);
    }
});

export default router;