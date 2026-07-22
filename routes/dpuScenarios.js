import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dpu from '../config/dpuService.js';
import bcrypt from 'bcryptjs';
import { translateScenario, validateTargetUrl } from '../services/scenarioService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Yardımcı Fonksiyon: Playwright testini asenkron Promise ile sarmalayıp koşturur  🎭
const runPlaywrightTest = () => {
    return new Promise((resolve) => {
        console.log(`🔥 Playwright motoru asenkron olarak tetikleniyor...`);
        exec('npx playwright test tests/ai-security.spec.ts', (error, stdout, stderr) => {
            resolve({
                isSuccess: !error,
                logContent: stdout + (stderr ? `\n--- Hatalar ---\n${stderr}` : '')
            });
        });
    });
};

// ─── 1. API: PROJELERİ LİSTELEME (ROL BAZLI FİLTRELİ!) ───
router.get('/projects/list', requireAuth, async (req, res) => {
    const userRole = req.user.role;
    const username = req.user.username;

    try {
        const result = await dpu.select('projeler', 100);
        if (!result.success) {
            return res.status(500).json({ error: "DPU Base listeleme hatası", details: result });
        }

        let projectNames = result.data.map(p => p.proje_adi);

        if (userRole !== 'ADMIN' && username) {
            const permissionsRes = await dpu.select('kullanici_projeleri', 100);
            if (permissionsRes.success && permissionsRes.data) {
                const allowedProjects = permissionsRes.data
                    .filter(p => p.kullanici_adi.toLowerCase() === username.toLowerCase())
                    .map(p => p.proje_adi);

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
        return res.status(500).json({ error: error.message });
    }
});

// ─── 2. API: YENİ PROJE OLUŞTURMA (Sadece ADMIN Yetkili) ───
router.post('/projects/create', requireAuth, requireAdmin, async (req, res) => {
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: "Proje adı boş olamaz!" });

    const sanitizedProjName = projectName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    if (!sanitizedProjName) return res.status(400).json({ error: "Geçersiz proje adı!" });

    try {
        const checkExist = await dpu.select('projeler', 1, `proje_adi:eq:${sanitizedProjName}`);
        if (checkExist.success && checkExist.data.length > 0) {
            return res.status(400).json({ error: "Bu isimde bir proje zaten mevcut!" });
        }

        const result = await dpu.insert('projeler', { proje_adi: sanitizedProjName });
        if (result.success) {
            return res.json({ success: true, projectName: sanitizedProjName });
        }
        return res.status(500).json({ error: "DPU Base proje kayıt hatası", details: result });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 3. API: PROJE BAZLI SENARYOLARI LİSTELEME ───
router.get('/list', requireAuth, async (req, res) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();
    const userRole = req.user.role;
    const username = req.user.username;

    if (!selectedProj) return res.json({ scenarios: [] });

    try {
        if (userRole !== 'ADMIN' && username) {
            const permissionsRes = await dpu.select('kullanici_projeleri', 100);
            if (permissionsRes.success && permissionsRes.data) {
                const allowedProjects = permissionsRes.data
                    .filter(p => p.kullanici_adi.toLowerCase() === username.toLowerCase())
                    .map(p => p.proje_adi.toLowerCase());

                if (!allowedProjects.includes(selectedProj.toLowerCase())) {
                    return res.json({ scenarios: [] });
                }
            } else {
                return res.json({ scenarios: [] });
            }
        }

        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) return res.json({ scenarios: [] });

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) return res.json({ scenarios: [] });
        
        const projectId = foundProj.id;
        const scenariosRes = await dpu.select('senaryolar', 100);
        
        if (scenariosRes.success && scenariosRes.data) {
            const filteredScenarios = scenariosRes.data
                .filter(s => String(s.project_id) === String(projectId))
                .map(s => s.senaryo_adi);
            
            return res.json({ scenarios: filteredScenarios });
        }
        
        return res.json({ scenarios: [] });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 4. API: SENARYO JSON İÇERİĞİNİ OKUMA ───
router.get('/content', requireAuth, async (req, res) => {
    const { scenarioName, project } = req.query;
    const selectedProj = (project || 'Varsayılan Proje').trim();

    if (!scenarioName) return res.status(400).json({ error: "scenarioName parametresi zorunlu!" });

    try {
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) return res.status(404).json({ error: "Proje bulunamadı." });
        const projectId = foundProj.id;

        const scenarioRes = await dpu.select('senaryolar', 100);
        if (scenarioRes.success && scenarioRes.data) {
            const scenario = scenarioRes.data.find(s => 
                String(s.project_id) === String(projectId) && 
                s.senaryo_adi === scenarioName
            );

            if (scenario) {
                const adimlarContent = typeof scenario.adimlar === 'string' 
                    ? JSON.parse(scenario.adimlar) 
                    : scenario.adimlar;

                return res.json({ success: true, content: adimlarContent });
            }
        }
        return res.status(404).json({ error: "Senaryo bulunamadı." });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 5. API: SENARYO KAYDETME VE MANTIKLI ÇEVİRİSİ ───
router.post('/create-and-save', requireAuth, async (req, res) => {
    const { scenarioName, turkishInstructions, targetUrl, projectName } = req.body;
    const selectedProj = (projectName || 'Varsayılan Proje').trim();

    if (!scenarioName || !turkishInstructions || !targetUrl) {
        return res.status(400).json({ error: "Eksik alanlar var!" });
    }

    // 🛡️ SSRF & URL FORMAT DOĞRULAMASI
    const urlValidation = validateTargetUrl(targetUrl);
    if (!urlValidation.isValid) {
        return res.status(400).json({ error: urlValidation.reason });
    }

    try {
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) return res.status(404).json({ error: "İlgili proje bulunamadı!" });
        const projectId = foundProj.id;

        const checkScenario = await dpu.select('senaryolar', 100);
        if (checkScenario.success && checkScenario.data) {
            const isDuplicate = checkScenario.data.some(s => 
                String(s.project_id) === String(projectId) && 
                s.senaryo_adi === scenarioName
            );
            if (isDuplicate) return res.status(400).json({ error: "Bu proje altında bu senaryo adı zaten mevcut!" });
        }

        const stagehandJson = await translateScenario(turkishInstructions, targetUrl);
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
            return res.status(200).json({ success: true, status: "SUCCESS", message: "Senaryo başarıyla buluta mühürlendi!" });
        }
        return res.status(500).json({ error: "DPU Base senaryo kayıt hatası", details: result });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 6. API: SENARYO SİLME ───
router.post('/delete', requireAuth, async (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioName || !selectedProj) return res.status(400).json({ error: "Eksik parametre var!" });

    try {
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) return res.status(404).json({ error: "Proje bulunamadı." });
        const projectId = foundProj.id;

        const scenarioRes = await dpu.select('senaryolar', 100);
        if (!scenarioRes.success || !scenarioRes.data) return res.status(404).json({ error: "Senaryolar tablosuna erişilemedi." });

        const foundScenario = scenarioRes.data.find(s => 
            String(s.project_id) === String(projectId) && 
            s.senaryo_adi === scenarioName
        );

        if (!foundScenario) return res.status(404).json({ error: "Silinecek senaryo bulunamadı." });

        const deleteResult = await dpu.delete('senaryolar', foundScenario.id);
        if (deleteResult.success) {
            return res.status(200).json({ success: true, message: "Senaryo başarıyla silindi!" });
        }
        return res.status(500).json({ error: "Silme işlemi başarısız.", details: deleteResult });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 7. API: TEKİL TESTİ PLAYWRIGHT İLE KOŞTURMA ───
router.post('/run', requireAuth, async (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioName || !selectedProj) return res.status(400).json({ error: "Eksik parametre var! Senaryo veya proje adı gelmedi." });

    try {
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) return res.status(404).json({ error: "Proje bulunamadı." });
        const projectId = foundProj.id;

        const scenariosRes = await dpu.select('senaryolar', 100);
        if (!scenariosRes.success || !scenariosRes.data) return res.status(500).json({ error: "Senaryolar tablosuna erişilemedi." });

        const foundScenario = scenariosRes.data.find(s => 
            String(s.project_id) === String(projectId) && 
            s.senaryo_adi === scenarioName
        );

        if (!foundScenario) return res.status(404).json({ error: "Çalıştırılacak senaryo veritabanında bulunamadı." });

        const rawSteps = foundScenario.adimlar;
        const cacheDir = path.join(process.cwd(), 'cache');
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        
        const runtimeStepsPath = path.join(cacheDir, 'runtime_steps.json');
        const stepsString = typeof rawSteps === 'string' ? rawSteps : JSON.stringify(rawSteps, null, 2);
        fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');

        const testResult = await runPlaywrightTest();

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
            return res.status(500).json({ success: false, error: "Test koşturulurken bir hata patladı!", output: testResult.logContent });
        }

        return res.status(200).json({ success: true, message: "Test başarıyla koşturuldu ve tamamlandı!" });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 8. API: PROJE BAZLI RAPORLARI LİSTELEME ───
router.get('/reports/list', requireAuth, async (req, res) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();

    if (!selectedProj) return res.json({ reports: [] });

    try {
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || projectRes.data.length === 0) return res.json({ reports: [] });

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) return res.json({ reports: [] });
        const projectId = foundProj.id;

        const reportsRes = await dpu.select('raporlar', 100);
        if (reportsRes.success && reportsRes.data) {
            const filteredReports = reportsRes.data
                .filter(r => String(r.project_id) === String(projectId))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return res.json({ success: true, reports: filteredReports });
        }
        return res.json({ reports: [] });
    } catch (error) {
        return res.json({ reports: [] });
    }
});

// ─── 9. API: SIRALI TOPLU TEST KOŞTURMA (BATCH PIPELINE) ───
router.post('/run-batch', requireAuth, async (req, res) => {
    const { scenarioNames, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioNames || !Array.isArray(scenarioNames) || scenarioNames.length === 0 || !selectedProj) {
        return res.status(400).json({ error: "Eksik veya hatalı parametre!" });
    }

    try {
        const projectRes = await dpu.select('projeler', 1, `proje_adi:eq:${selectedProj}`);
        if (!projectRes.success || projectRes.data.length === 0) return res.status(404).json({ error: "Proje bulunamadı." });
        const projectId = projectRes.data[0].id;

        const scenariosRes = await dpu.select('senaryolar', 100, `project_id:eq:${projectId}`);
        if (!scenariosRes.success || !scenariosRes.data) return res.status(500).json({ error: "Senaryolar tablosuna erişilemedi." });

        const batchScenarios = scenariosRes.data.filter(s => scenarioNames.includes(s.senaryo_adi));
        if (batchScenarios.length === 0) return res.status(404).json({ error: "Kuyruktaki hiçbir senaryo bulunamadı!" });

        res.status(202).json({ success: true, message: "Toplu test pipeline akışı arka planda başlatıldı!" });

        (async () => {
            for (const scenario of batchScenarios) {
                const cacheDir = path.join(process.cwd(), 'cache');
                if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

                const runtimeStepsPath = path.join(cacheDir, 'runtime_steps.json');
                const stepsString = typeof scenario.adimlar === 'string' ? scenario.adimlar : JSON.stringify(scenario.adimlar, null, 2);
                fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');

                const testResult = await runPlaywrightTest();

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
        if (!res.headersSent) return res.status(500).json({ error: error.message });
    }
});

// ─── 10. API: AYARLARI GETİRME ───
router.get('/settings/get', requireAuth, requireAdmin, async (req, res) => {
    try {
        const dbResult = await dpu.select('ayarlar', 100);
        const settings = { testRunnerApi: "openai", translatorApi: "gemini", apiKeys: {} };

        if (dbResult.success && dbResult.data && dbResult.data.length > 0) {
            const testRunnerRow = dbResult.data.find(r => r.ayar_anahtar === 'test_runner_api');
            const translatorRow = dbResult.data.find(r => r.ayar_anahtar === 'translator_api');

            if (testRunnerRow) settings.testRunnerApi = testRunnerRow.ayar_deger;
            if (translatorRow) settings.translatorApi = translatorRow.ayar_deger;

            dbResult.data.forEach(row => {
                if (row.ayar_anahtar !== 'test_runner_api' && row.ayar_anahtar !== 'translator_api') {
                    settings.apiKeys[row.ayar_anahtar] = {
                        key: row.ayar_deger || "",
                        model: row.ayar_model || ""
                    };
                }
            });
        }
        return res.json({ success: true, settings });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─── 11. API: AYARLARI KAYDETME ───
router.post('/settings/save', requireAuth, requireAdmin, async (req, res) => {
    const { testRunnerApi, translatorApi, apiKeys } = req.body;
    
    try {
        const nowIso = new Date().toISOString();
        const currentDb = await dpu.select('ayarlar', 100);
        const existingRows = currentDb.success && currentDb.data ? currentDb.data : [];

        const targetSettings = {
            'test_runner_api': { val: testRunnerApi || 'openai', model: null },
            'translator_api': { val: translatorApi || 'gemini', model: null }
        };

        if (apiKeys && typeof apiKeys === 'object') {
            Object.entries(apiKeys).forEach(([provider, details]) => {
                targetSettings[provider] = {
                    val: details.key || "",
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
        return res.status(500).json({ error: err.message });
    }
});

// ─── 12. API: TEKİL TEST RAPORUNU SİLME ───
router.post('/reports/delete', requireAuth, async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Eksik parametre! Rapor ID değeri gelmedi." });

    try {
        const deleteResult = await dpu.delete('raporlar', id);
        if (deleteResult.success) {
            return res.status(200).json({ success: true, message: "Test raporu başarıyla silindi!" });
        }
        return res.status(500).json({ error: "Silme işlemi veritabanında başarısız oldu.", details: deleteResult });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── KULLANICI YÖNETİMİ ───

// 1. Kullanıcıları Listeleme
router.get('/users/list', requireAuth, requireAdmin, async (req, res) => {
    try {
        const usersRes = await dpu.select('kullanicilar', 100);
        const projectsRes = await dpu.select('projeler', 100);
        const permsRes = await dpu.select('kullanici_projeleri', 100);

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
        return res.status(500).json({ error: err.message });
    }
});

// 2. Yeni Kullanıcı Oluşturma
router.post('/users/create', requireAuth, requireAdmin, async (req, res) => {
    const { username, password, role, selectedProjects } = req.body;
    if (!username || !password || !role) return res.status(400).json({ error: "Eksik alanlar var!" });

    try {
        const usersCheck = await dpu.select('kullanicilar', 100);
        if (usersCheck.success && usersCheck.data.some(u => u.kullanici_adi.toLowerCase() === username.toLowerCase())) {
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
        return res.status(500).json({ error: err.message });
    }
});

// 3. Kullanıcı Silme
router.post('/users/delete', requireAuth, requireAdmin, async (req, res) => {
    const { id, username } = req.body;

    try {
        const deleteUser = await dpu.delete('kullanicilar', id);
        if (deleteUser.success) {
            const permsRes = await dpu.select('kullanici_projeleri', 100);
            if (permsRes.success && permsRes.data) {
                const userPerms = permsRes.data.filter(p => p.kullanici_adi.toLowerCase() === username.toLowerCase());
                for (const perm of userPerms) {
                    await dpu.delete('kullanici_projeleri', perm.id);
                }
            }
            return res.json({ success: true, message: "Kullanıcı ve yetkileri silindi!" });
        }
        return res.status(500).json({ error: "Kullanıcı silinemedi." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// 4. Kullanıcı Güncelleme
router.post('/users/update', requireAuth, requireAdmin, async (req, res) => {
    const { id, username, password, role, selectedProjects } = req.body;
    if (!id || !username) return res.status(400).json({ error: "Eksik parametre!" });

    try {
        const usersRes = await dpu.select('kullanicilar', 100);
        if (!usersRes.success || !usersRes.data) return res.status(500).json({ error: "Veritabanı erişim hatası." });

        const existingUser = usersRes.data.find(u => String(u.id) === String(id));
        if (!existingUser) return res.status(404).json({ error: "Güncellenecek kullanıcı bulunamadı." });

        let finalPassword = existingUser.sifre;
        if (password && password.trim() !== '') {
            finalPassword = await bcrypt.hash(password, 10);
        }

        const finalRole = role ? role.toUpperCase() : existingUser.rol;

        await dpu.delete('kullanicilar', existingUser.id);
        const insertUserRes = await dpu.insert('kullanicilar', {
            kullanici_adi: username,
            sifre: finalPassword,
            rol: finalRole
        });

        if (!insertUserRes.success) return res.status(500).json({ error: "Kullanıcı bilgileri güncellenemedi." });

        const permsRes = await dpu.select('kullanici_projeleri', 100);
        if (permsRes.success && permsRes.data) {
            const oldUserPerms = permsRes.data.filter(p => p.kullanici_adi.toLowerCase() === username.toLowerCase());
            for (const perm of oldUserPerms) {
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
        return res.status(500).json({ error: err.message });
    }
});

export default router;