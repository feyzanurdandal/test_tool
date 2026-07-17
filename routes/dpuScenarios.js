import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dpu from '../config/dpuService.js';
import { translateScenario } from '../server.js';

const router = express.Router();

// Yardımcı Fonksiyon: Playwright testini asenkron Promise ile sarmalayıp koşturur kanka 🎭
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

// ─── 1. API: PROJELERİ LİSTELEME (DPU BASE) ───
router.get('/projects/list', async (req, res) => {
    try {
        const result = await dpu.select('projeler', 100);
        if (!result.success) {
            return res.status(500).json({ error: "DPU Base listeleme hatası", details: result });
        }

        const projectNames = result.data.map(p => p.proje_adi);
        
        // Veritabanı tamamen boşsa ilk varsayılan projeyi güvenle ekliyoruz
        if (projectNames.length === 0) {
            await dpu.insert('projeler', { proje_adi: 'Varsayılan Proje' });
            return res.json({ success: true, projects: ['Varsayılan Proje'] });
        }
        
        return res.json({ success: true, projects: projectNames });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 2. API: YENİ PROJE OLUŞTURMA (Sadece ADMIN Yetkili) ───
router.post('/projects/create', async (req, res) => {
    const userRole = req.headers['x-user-role'];

    if (userRole !== 'ADMIN') {
        return res.status(403).json({ error: "Bu işlem için yetkiniz yok! Sadece ADMIN yeni proje ekleyebilir." });
    }

    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: "Proje adı boş olamaz!" });

    const sanitizedProjName = projectName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    if (!sanitizedProjName) return res.status(400).json({ error: "Geçersiz proje adı!" });

    try {
        // Bellekte dönmek yerine doğrudan DPU Base filtreleme sorgusu atıyoruz! 🔑
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

// ─── 3. API: PROJE BAZLI SENARYOLARI LİSTELEME (BELLEKTE GÜVENLİ FİLTRELEME! 🔒) ───
router.get('/list', async (req, res) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();

    if (!selectedProj) return res.json({ scenarios: [] });

    try {
        console.log(`=========================================`);
        console.log(`🔍 LİSTELEME SORGUSU BAŞLADI !`);
        console.log(`Aranan Proje Adı: "${selectedProj}"`);
        
        // 1. Önce projeleri filtresiz çekelim (API tıkanmasın diye)
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            console.log("❌ DPU Base 'projeler' tablosuna erişemedi!");
            return res.json({ scenarios: [] });
        }

        // Bellekte küçük/büyük harfe duyarsız eşleştirme yapıyoruz
        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            console.log(`⚠️ "${selectedProj}" isimli proje veritabanında yok.`);
            console.log("Mevcut Projeler:", projectRes.data.map(p => p.proje_adi));
            return res.json({ scenarios: [] });
        }
        
        const projectId = foundProj.id;
        console.log(`🎯 Eşleşen Proje ID: ${projectId}`);

        // 2. Senaryoları da filtresiz çekip bellekte filtreliyoruz! 🚀
        const scenariosRes = await dpu.select('senaryolar', 100);
        
        if (scenariosRes.success && scenariosRes.data) {
            console.log(`📂 Toplam Senaryo Kayıt Sayısı: ${scenariosRes.data.length}`);
            
            // API filtresi yerine güvenli Javascript filtrelemesi kilit! 🔑
            const filteredScenarios = scenariosRes.data
                .filter(s => String(s.project_id) === String(projectId))
                .map(s => s.senaryo_adi);
            
            console.log(`✅ Eşleşen ve Gönderilen Senaryolar:`, filteredScenarios);
            console.log(`=========================================`);
            return res.json({ scenarios: filteredScenarios });
        }
        
        console.log("❌ Senaryolar tablosundan veri çekilemedi:", scenariosRes);
        return res.status(500).json({ error: "Senaryolar yüklenemedi" });
    } catch (error) {
        console.error("💥 Senaryo listeleme hatası:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// // ─── 4. API: SENARYO JSON İÇERİĞİNİ OKUMA ───
// router.get('/content', async (req, res) => {
//     const { scenarioName, project } = req.query;
//     const selectedProj = project || 'Varsayılan Proje';

//     if (!scenarioName) return res.status(400).json({ error: "scenarioName parametresi zorunlu!" });

//     try {
//         const projectRes = await dpu.select('projeler', 1, `proje_adi:eq:${selectedProj}`);
//         if (!projectRes.success || projectRes.data.length === 0) {
//             return res.status(404).json({ error: "Proje bulunamadı." });
//         }
//         const projectId = projectRes.data[0].id;

//         const scenarioRes = await dpu.select('senaryolar', 1, `project_id:eq:${projectId}&senaryo_adi:eq:${scenarioName}`);
//         if (scenarioRes.success && scenarioRes.data.length > 0) {
//             const scenario = scenarioRes.data[0];
//             const adimlarContent = typeof scenario.adimlar === 'string' 
//                 ? JSON.parse(scenario.adimlar) 
//                 : scenario.adimlar;

//             return res.json({ success: true, content: adimlarContent });
//         }
//         return res.status(404).json({ error: "Senaryo bulunamadı." });
//     } catch (error) {
//         return res.status(500).json({ error: error.message });
//     }
// });

// ─── 4. API: SENARYO JSON İÇERİĞİNİ OKUMA (BELLEKTE GÜVENLİ FİLTRELEME! 🔒) ───
router.get('/content', async (req, res) => {
    const { scenarioName, project } = req.query;
    const selectedProj = (project || 'Varsayılan Proje').trim();

    if (!scenarioName) return res.status(400).json({ error: "scenarioName parametresi zorunlu!" });

    try {
        console.log(`🔍 [Content] "${scenarioName}" senaryosunun içeriği buluttan talep ediliyor...`);

        // 1. Projeleri filtresiz çekip bellekte eşleştiriyoruz kanka!
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });
        }

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = foundProj.id;

        // 2. Senaryoları da filtresiz çekip bellekte tam eşleşme arıyoruz 🚀
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
        console.error("💥 Senaryo içeriği okunurken hata patladı:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// ─── 5. API: SENARYO KAYDETME VE MANTIKLI ÇEVİRİSİ (BELLEKTE GÜVENLİ FİLTRELEME! 🔒) ───
router.post('/create-and-save', async (req, res) => {
    const { scenarioName, turkishInstructions, targetUrl, projectName } = req.body;
    const selectedProj = (projectName || 'Varsayılan Proje').trim();

    if (!scenarioName || !turkishInstructions || !targetUrl) {
        return res.status(400).json({ error: "Eksik alanlar var!" });
    }

    try {
        console.log(`🔍 [Create] Projeler çekiliyor...`);
        
        // 1. Projeleri filtresiz çekip bellekte esnek (case-insensitive) olarak aratıyoruz kanka!
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });
        }

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            return res.status(404).json({ error: "İlgili proje bulunamadı!" });
        }
        const projectId = foundProj.id;

        console.log(`🎯 Proje ID Başarıyla Bulundu: ${projectId}. Çift kayıt kontrolü yapılıyor...`);

        // 2. Çift kayıt kontrolünü bellekte yapıyoruz (API filtresi tıkandığı için!)
        const checkScenario = await dpu.select('senaryolar', 100);
        if (checkScenario.success && checkScenario.data) {
            const isDuplicate = checkScenario.data.some(s => 
                String(s.project_id) === String(projectId) && 
                s.senaryo_adi === scenarioName
            );
            if (isDuplicate) {
                return res.status(400).json({ error: "Bu proje altında bu senaryo adı zaten mevcut!" });
            }
        }

        console.log(`🧠 AI Translator: Türkçe talimatlar çözümleniyor...`);
        const stagehandJson = await translateScenario(turkishInstructions, targetUrl);

        if (!stagehandJson) {
            return res.status(500).json({ error: "Senaryo çevirisi esnasında yapay zeka hata döndürdü." });
        }

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
            console.log(`✅ Senaryo "${scenarioName}" başarıyla DPU Base'e yazıldı.`);
            return res.status(200).json({ success: true, status: "SUCCESS", message: "Senaryo başarıyla buluta mühürlendi!" });
        }
        return res.status(500).json({ error: "DPU Base senaryo kayıt hatası", details: result });
    } catch (error) {
        console.error("💥 Senaryo kaydında hata:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// ─── 6. API: SENARYO SİLME (BELLEKTE GÜVENLİ FİLTRELEME! 🔒) ───
router.post('/delete', async (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioName || !selectedProj) {
        return res.status(400).json({ error: "Eksik parametre var!" });
    }

    try {
        // 1. Projeleri bellekte esnek aratıyoruz kanka!
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });
        }

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = foundProj.id;

        // 2. Senaryoyu da bellekte buluyoruz
        const scenarioRes = await dpu.select('senaryolar', 100);
        if (!scenarioRes.success || !scenarioRes.data) {
            return res.status(404).json({ error: "Senaryolar tablosuna erişilemedi." });
        }

        const foundScenario = scenarioRes.data.find(s => 
            String(s.project_id) === String(projectId) && 
            s.senaryo_adi === scenarioName
        );

        if (!foundScenario) {
            return res.status(404).json({ error: "Silinecek senaryo bulunamadı." });
        }

        const deleteResult = await dpu.delete('senaryolar', foundScenario.id);
        if (deleteResult.success) {
            return res.status(200).json({ success: true, message: "Senaryo başarıyla silindi!" });
        }
        return res.status(500).json({ error: "Silme işlemi başarısız.", details: deleteResult });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 7. API: TEKİL TESTİ PLAYWRIGHT İLE KOŞTURMA (MODERN & ESNEK ASYNC YAPIDA!) ───
router.post('/run', async (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioName || !selectedProj) {
        return res.status(400).json({ error: "Eksik parametre var! Senaryo veya proje adı gelmedi." });
    }

    try {
        console.log(`=========================================`);
        console.log(`🚀 PLAYWRIGHT TEST ÇALIŞTIRMA İSTEĞİ GELDİ!`);
        console.log(`Senaryo: "${scenarioName}" | Proje: "${selectedProj}"`);

        // 1. Projeleri filtresiz çekip bellekte esnek (case-insensitive) olarak aratıyoruz kanka! 🔑
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });
        }

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            console.log(`❌ HATA: "${selectedProj}" isimli proje veritabanında bulunamadı.`);
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = foundProj.id;
        console.log(`🎯 Bulunan Proje ID: ${projectId}`);

        // 2. Senaryolar tablosundan adımları (adimlar) filtresiz çekip bellekte ayıklıyoruz
        const scenariosRes = await dpu.select('senaryolar', 100);
        if (!scenariosRes.success || !scenariosRes.data) {
            return res.status(500).json({ error: "Senaryolar tablosuna erişilemedi." });
        }

        const foundScenario = scenariosRes.data.find(s => 
            String(s.project_id) === String(projectId) && 
            s.senaryo_adi === scenarioName
        );

        if (!foundScenario) {
            return res.status(404).json({ error: "Çalıştırılacak senaryo veritabanında bulunamadı." });
        }

        // Adımları alıyoruz (Stagehand JSON)
        const rawSteps = foundScenario.adimlar;
        console.log(`📦 Çekilen Ham Adımlar:`, rawSteps);

        // 3. Playwright testinin okuyabilmesi için adımları geçici bir dosyaya yazıyoruz
        const cacheDir = path.join(process.cwd(), 'cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        const runtimeStepsPath = path.join(cacheDir, 'runtime_steps.json');
        const stepsString = typeof rawSteps === 'string' ? rawSteps : JSON.stringify(rawSteps, null, 2);
        fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');
        console.log(`💾 Geçici test adımları yazıldı: ${runtimeStepsPath}`);

        // 4. Playwright'ı asenkron olarak arka planda ateşliyoruz 🚀
        const testResult = await runPlaywrightTest();

        // 📝 Rapor verisini hazırlayıp DPU Base'e mühürlüyoruz
        const reportData = {
            project_id: projectId,
            scenario_name: scenarioName,
            status: testResult.isSuccess ? "SUCCESS" : "FAILED",
            log_content: testResult.logContent,
            created_at: new Date().toISOString()
        };

        try {
            console.log("💾 Test raporu DPU Base'e kaydediliyor...");
            await dpu.insert('raporlar', reportData);
            console.log("✅ Rapor başarıyla mühürlendi!");
        } catch (dbErr) {
            console.error("⚠️ Rapor veritabanına yazılırken hata oluştu:", dbErr.message);
        }

        if (!testResult.isSuccess) {
            return res.status(500).json({ 
                success: false, 
                error: "Test koşturulurken bir hata patladı!", 
                output: testResult.logContent 
            });
        }

        return res.status(200).json({ 
            success: true, 
            message: "Test başarıyla koşturuldu ve tamamlandı!"
        });

    } catch (error) {
        console.error("💥 Test koşturma endpoint'inde büyük hata:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// ─── 8. API: PROJE BAZLI RAPORLARI LİSTELEME (BELLEKTE GÜVENLİ FİLTRELEME! 🔒) ───
router.get('/reports/list', async (req, res) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();

    if (!selectedProj) return res.json({ reports: [] });

    try {
        console.log(`🔍 [Reports] "${selectedProj}" projesi için raporlar sorgulanıyor...`);
        
        // 1. Projeyi filtresiz çekip bellekte eşleştiriyoruz (API tıkanmasın diye)
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || projectRes.data.length === 0) return res.json({ reports: [] });

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) return res.json({ reports: [] });
        
        const projectId = foundProj.id;

        // 2. Raporları da filtresiz çekip bellekte proje_id'ye göre ayıklıyoruz! 🚀
        const reportsRes = await dpu.select('raporlar', 100);
        
        if (reportsRes.success && reportsRes.data) {
            // API filtresi yerine güvenli JS filtrelemesi kilit! 🔑
            const filteredReports = reportsRes.data
                .filter(r => String(r.project_id) === String(projectId))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Yeniden eskiye sıralama

            console.log(`📊 [Reports] Eşleşen ${filteredReports.length} adet rapor listelendi.`);
            return res.json({ success: true, reports: filteredReports });
        }
        
        return res.json({ reports: [] });
    } catch (error) {
        console.error("💥 Rapor listeleme hatası:", error.message);
        return res.json({ reports: [] });
    }
});

// ─── 9. API: SIRALI TOPLU TEST KOŞTURMA (BATCH PIPELINE) ───
router.post('/run-batch', async (req, res) => {
    const { scenarioNames, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioNames || !Array.isArray(scenarioNames) || scenarioNames.length === 0 || !selectedProj) {
        return res.status(400).json({ error: "Eksik veya hatalı parametre!" });
    }

    try {
        const projectRes = await dpu.select('projeler', 1, `proje_adi:eq:${selectedProj}`);
        if (!projectRes.success || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = projectRes.data[0].id;

        const scenariosRes = await dpu.select('senaryolar', 100, `project_id:eq:${projectId}`);
        if (!scenariosRes.success || !scenariosRes.data) {
            return res.status(500).json({ error: "Senaryolar tablosuna erişilemedi." });
        }

        const batchScenarios = scenariosRes.data.filter(s => scenarioNames.includes(s.senaryo_adi));
        if (batchScenarios.length === 0) {
            return res.status(404).json({ error: "Kuyruktaki hiçbir senaryo bulunamadı!" });
        }

        // Express istemcisini bekletmeden kuyruk emrini kabul ediyoruz
        res.status(202).json({ 
            success: true, 
            message: "Toplu test pipeline akışı arka planda başlatıldı! Raporlar sekmesinden takip edebilirsiniz." 
        });

        // Arka planda sıralı (sequential) asenkron döngü koşturuyoruz kanka! ⚡
        (async () => {
            for (const scenario of batchScenarios) {
                console.log(`\n➡️ Pipeline Sıradaki Test: "${scenario.senaryo_adi}"`);
                
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
            console.log(`\n⚡ BATCH PIPELINE BAŞARIYLA TAMAMLANDI!`);
        })();

    } catch (error) {
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
    }
});

// ─── 10. API: DPU BASE'DEN İLİŞKİSEL AYARLARI GETİRME ───
router.get('/settings/get', async (req, res) => {
    try {
        const dbResult = await dpu.select('ayarlar', 100);

        const settings = {
            testRunnerApi: "openai",
            translatorApi: "gemini",
            apiKeys: {}
        };

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

// ─── 11. API: DPU BASE ÜZERİNE İLİŞKİSEL AYARLARI KAYDETME ───
router.post('/settings/save', async (req, res) => {
    const userRole = req.headers['x-user-role'];

    if (userRole !== 'ADMIN') {
        return res.status(403).json({ error: "Bu işlem için yetkiniz yok! Sadece ADMIN sistem ayarlarını değiştirebilir." });
    }

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
router.post('/reports/delete', async (req, res) => {
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

export default router;