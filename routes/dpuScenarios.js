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
import {
    createProjectSchema,
    deleteProjectSchema,
    getScenarioContentSchema,
    createScenarioSchema,
    runScenarioSchema,
    runBatchSchema,
    createUserSchema,
    updateUserSchema
} from '../schemas/scenarioSchemas.js';
import { checkProjectOwnership } from '../utils/projectGuard.js';

const router = express.Router();

// Yardımcı Fonksiyon: Playwright testini dinamik dosya yoluyla çalıştırma 🎭
const runPlaywrightTest = (stepsFilePath) => {
    return new Promise((resolve) => {
        console.log(`🔥 Playwright motoru asenkron olarak tetikleniyor... (Dosya: ${stepsFilePath})`);
        
        const env = { ...process.env, RUNTIME_STEPS_PATH: stepsFilePath };

        exec('npx playwright test tests/ai-security.spec.ts', { env }, (error, stdout, stderr) => {
            // 🔍 Playwright çıktısını ve hatasını terminale basalım
            if (error) {
                console.error("❌ Playwright Test Hatası (stdout):", stdout);
                console.error("❌ Playwright Test Hatası (stderr):", stderr);
            } else {
                console.log("✅ Playwright Testi Başarıyla Tamamlandı.");
            }

            try {
                if (fs.existsSync(stepsFilePath)) fs.unlinkSync(stepsFilePath);
            } catch (e) {
                console.error("Geçici dosya silinemedi:", e.message);
            }

            resolve({
                isSuccess: !error,
                logContent: stdout + (stderr ? `\n--- Hatalar ---\n${stderr}` : '')
            });
        });
    });
};

// ─── 1. API: PROJELERİ LİSTELEME ───
router.get('/projects/list', requireAuth, async (req, res, next) => {
    const userRole = req.user.role;
    const username = req.user.username;

    try {
        const result = await dpu.selectAll('projeler');
        if (!result.success) {
            return res.status(500).json({ error: "DPU Base listeleme hatası", details: result });
        }

        let projectNames = result.data.map(p => p.proje_adi);

        if (userRole !== 'ADMIN' && username) {
            // 🚀 DB-LEVEL FILTER: Tüm tablo yerine sadece kullanıcıya ait izinler çekiliyor
            const permissionsRes = await dpu.selectWhere('kullanici_projeleri', {
                kullanici_adi: { eq: username.toLowerCase() }
            });

            if (permissionsRes.success && permissionsRes.data) {
                const allowedProjects = permissionsRes.data.map(p => p.proje_adi);
                projectNames = projectNames.filter(name => allowedProjects.includes(name));
            } else {
                projectNames = [];
            }
        }
        
        if (projectNames.length === 0 && userRole === 'ADMIN') {
            await dpu.insert('projeler', { proje_adi: 'Varsayılan Proje' });
            return res.json({ success: true, projects: ['Varsayılan Proje'] });
        }
        
        return res.json({ success: true, projects: projectNames });
    } catch (error) {
        next(error);
    }
});

// ─── 2. API: YENİ PROJE OLUŞTURMA (Sadece ADMIN Yetkili) ───
router.post('/projects/create', requireAuth, requireAdmin, validate(createProjectSchema), async (req, res, next) => {
    const { projectName } = req.body;

    const sanitizedProjName = projectName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    if (!sanitizedProjName) return res.status(400).json({ error: "Geçersiz proje adı!" });

    try {
        const checkExist = await dpu.selectWhere('projeler', {
            proje_adi: { eq: sanitizedProjName }
        });

        if (checkExist.success && checkExist.data && checkExist.data.length > 0) {
            return res.status(400).json({ error: "Bu isimde bir proje zaten mevcut!" });
        }

        const result = await dpu.insert('projeler', { proje_adi: sanitizedProjName });
        if (result.success) {
            return res.json({ success: true, projectName: sanitizedProjName });
        }
        return res.status(500).json({ error: "DPU Base proje kayıt hatası", details: result });
    } catch (error) {
        next(error);
    }
});

// ─── 2.1 API: PROJE SİLME (Sadece ADMIN Yetkili) ───
router.post('/projects/delete', requireAuth, requireAdmin, validate(deleteProjectSchema), async (req, res, next) => {
    const { projectName } = req.body;

    try {
        // 🚀 DB-LEVEL FILTER
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

// ─── 3. API: PROJE BAZLI SENARYOLARI LİSTELEME ───
router.get('/list', requireAuth, async (req, res, next) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();

    if (!selectedProj) return res.json({ scenarios: [] });

    try {
        // 🚀 DB-LEVEL FILTER
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
            const filteredScenarios = scenariosRes.data.map(s => s.senaryo_adi);
            return res.json({ scenarios: filteredScenarios });
        }
        
        return res.json({ scenarios: [] });
    } catch (error) {
        next(error);
    }
});

// ─── 4. API: SENARYO JSON İÇERİĞİNİ OKUMA ───
router.get('/content', requireAuth, validate(getScenarioContentSchema), async (req, res, next) => {
    const { scenarioName, project } = req.query;
    const selectedProj = (project || 'Varsayılan Proje').trim();

    // 🔒 IDOR Koruması
    const hasAccess = await checkProjectOwnership(req.user, selectedProj);
    if (!hasAccess) {
        return res.status(403).json({ error: "Yetkisiz Erişim: Bu projeye erişim izniniz bulunmuyor!" });
    }

    try {
        // 🚀 DB-LEVEL FILTER
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
            const adimlarContent = typeof scenario.adimlar === 'string' 
                ? JSON.parse(scenario.adimlar) 
                : scenario.adimlar;

            return res.json({ success: true, content: adimlarContent });
        }

        return res.status(404).json({ error: "Senaryo bulunamadı." });
    } catch (error) {
        next(error);
    }
});

// ─── 5. API: SENARYO KAYDETME VE AI ÇEVİRİSİ ───
router.post('/create-and-save', aiCallLimiter, requireAuth, validate(createScenarioSchema), async (req, res, next) => {
    const { scenarioName, turkishInstructions, targetUrl, projectName } = req.body;
    const selectedProj = (projectName || 'Varsayılan Proje').trim();

    // 🛡️ SSRF / IP Koruması
    const urlCheck = await isSafeUrl(targetUrl);
    if (!urlCheck.safe) {
        return res.status(400).json({ error: `Güvenlik Engeli: ${urlCheck.reason}` });
    }

    try {
        // 🚀 DB-LEVEL FILTER
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

        // 🤖 Modüler AI Çeviricisi
        const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
        if (!stagehandJson) return res.status(500).json({ error: "Senaryo çevirisi esnasında yapay zeka hata döndürdü." });

        const nowIso = new Date().toISOString();
        const insertData = {
            project_id: projectId,
            senaryo_adi: scenarioName,
            hedef_url: targetUrl,
            adimlar: JSON.stringify(stagehandJson),
            created_at: nowIso,
            updated_at: nowIso
        };

        const result = await dpu.insert('senaryolar', insertData);
        if (result.success) {
            return res.status(200).json({ success: true, status: "SUCCESS", message: "Senaryo başarıyla buluta kaydedildi." });
        }
        return res.status(500).json({ error: "Senaryo kaydedilirken bir veritabanı hatası oluştu." });
    } catch (error) {
        next(error);
    }
});

// ─── 6. API: SENARYO SİLME ───
router.post('/delete', requireAuth, async (req, res, next) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    // 🔒 IDOR Koruması
    const hasAccess = await checkProjectOwnership(req.user, selectedProj);
    if (!hasAccess) {
        return res.status(403).json({ error: "Yetkisiz Erişim: Bu projeden senaryo silme yetkiniz yok!" });
    }

    if (!scenarioName || !selectedProj) return res.status(400).json({ error: "Eksik parametre var!" });

    try {
        // 🚀 DB-LEVEL FILTER
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

// ─── 7. API: TEKİL TESTİ PLAYWRIGHT İLE KOŞTURMA ───
router.post('/run', testRunLimiter, requireAuth, validate(runScenarioSchema), async (req, res, next) => {
    const { scenarioName, targetUrl, projectName } = req.body;

    // 🛡️ SSRF / IP Koruması
    if (targetUrl) {
        const urlCheck = await isSafeUrl(targetUrl);
        if (!urlCheck.safe) {
            return res.status(400).json({ error: `Güvenlik Engeli: ${urlCheck.reason}` });
        }
    }

    const selectedProj = (projectName || '').trim();

    // 🔒 IDOR Koruması
    const hasAccess = await checkProjectOwnership(req.user, selectedProj);
    if (!hasAccess) {
        return res.status(403).json({ error: "Yetkisiz Erişim: Bu projede test koşturma yetkiniz bulunmuyor!" });
    }

    try {
        // 🚀 DB-LEVEL FILTER
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = projectRes.data[0].id;

        const scenariosRes = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId },
            senaryo_adi: { eq: scenarioName }
        });

        if (!scenariosRes.success || !scenariosRes.data || scenariosRes.data.length === 0) {
            return res.status(404).json({ error: "Çalıştırılacak senaryo veritabanında bulunamadı." });
        }

        const foundScenario = scenariosRes.data[0];

        const rawSteps = foundScenario.adimlar;
        const cacheDir = path.join(process.cwd(), 'cache');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

        const uniqueFileName = `runtime_steps_${Date.now()}_${Math.random().toString(36).substring(7)}.json`;
        const runtimeStepsPath = path.join(cacheDir, uniqueFileName);

        const stepsString = typeof rawSteps === 'string' ? rawSteps : JSON.stringify(rawSteps, null, 2);
        fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');

        const testResult = await runPlaywrightTest(runtimeStepsPath);

        const reportData = {
            project_id: projectId,
            scenario_name: scenarioName,
            status: testResult.isSuccess ? "SUCCESS" : "FAILED",
            log_content: testResult.logContent,
            created_at: new Date().toISOString()
        };

        try {
            await dpu.insert('raporlar', reportData);
        } catch (dbErr) {
            console.error("⚠️ Rapor veritabanına yazılırken hata oluştu:", dbErr.message);
        }

        if (!testResult.isSuccess) {
            return res.status(500).json({ success: false, error: "Test koşturulurken bir hata oluştu!", output: testResult.logContent });
        }

        return res.status(200).json({ success: true, message: "Test başarıyla koşturuldu ve tamamlandı!" });
    } catch (error) {
        next(error);
    }
});

// ─── 8. API: PROJE BAZLI RAPORLARI LİSTELEME ───
router.get('/reports/list', requireAuth, async (req, res, next) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();

    if (!selectedProj) return res.json({ reports: [] });

    try {
        // 🚀 DB-LEVEL FILTER
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.json({ reports: [] });
        }
        
        const projectId = projectRes.data[0].id;

        const reportsRes = await dpu.selectWhere('raporlar', {
            project_id: { eq: projectId }
        });

        if (reportsRes.success && reportsRes.data) {
            const sortedReports = reportsRes.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return res.json({ success: true, reports: sortedReports });
        }

        return res.json({ reports: [] });
    } catch (error) {
        next(error);
    }
});

// ─── 9. API: SIRALI TOPLU TEST KOŞTURMA (BATCH PIPELINE) ───
router.post('/run-batch', requireAuth, validate(runBatchSchema), async (req, res, next) => {
    const { scenarioNames, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    // 🔒 IDOR Koruması
    const hasAccess = await checkProjectOwnership(req.user, selectedProj);
    if (!hasAccess) {
        return res.status(403).json({ error: "Yetkisiz Erişim: Bu projede toplu test başlatma yetkiniz bulunmuyor!" });
    }

    try {
        // 🚀 DB-LEVEL FILTER
        const projectRes = await dpu.selectWhere('projeler', {
            proje_adi: { eq: selectedProj }
        });

        if (!projectRes.success || !projectRes.data || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = projectRes.data[0].id;

        const scenariosRes = await dpu.selectWhere('senaryolar', {
            project_id: { eq: projectId }
        });

        if (!scenariosRes.success || !scenariosRes.data) return res.status(500).json({ error: "Senaryolar tablosuna erişilemedi." });

        const batchScenarios = scenariosRes.data.filter(s => scenarioNames.includes(s.senaryo_adi));
        if (batchScenarios.length === 0) return res.status(404).json({ error: "Kuyruktaki hiçbir senaryo bulunamadı!" });

        res.status(202).json({ success: true, message: "Toplu test pipeline akışı arka planda başlatıldı!" });

        (async () => {
            for (const scenario of batchScenarios) {
                const cacheDir = path.join(process.cwd(), 'cache');
                if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

                const uniqueFileName = `runtime_steps_${Date.now()}_${Math.random().toString(36).substring(7)}.json`;
                const runtimeStepsPath = path.join(cacheDir, uniqueFileName);

                const stepsString = typeof scenario.adimlar === 'string' ? scenario.adimlar : JSON.stringify(scenario.adimlar, null, 2);
                fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');

                const testResult = await runPlaywrightTest(runtimeStepsPath);

                const reportData = {
                    project_id: projectId,
                    scenario_name: scenario.senaryo_adi,
                    status: testResult.isSuccess ? "SUCCESS" : "FAILED",
                    log_content: testResult.logContent,
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
        const deleteResult = await dpu.delete('raporlar', id);
        if (deleteResult.success) {
            return res.status(200).json({ success: true, message: "Test raporu başarıyla silindi!" });
        }
        return res.status(500).json({ error: "Silme işlemi veritabanında başarısız oldu.", details: deleteResult });
    } catch (error) {
        next(error);
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
        // 🚀 DB-LEVEL FILTER
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
        // 🚀 DB-LEVEL FILTER
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
            return res.status(500).json({ error: "Kullanıcı bilgileri güncellenirken veritabanı hatası oluştu.", details: updateRes });
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