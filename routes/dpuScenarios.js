import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dpu from '../config/dpuService.js';
import { translateScenario } from '../server.js';

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

// routes/dpuScenarios.js dosyasının en üstüne ekle :
import crypto from 'crypto';
const SECRET_KEY = process.env.JWT_SECRET || 'fallback_secret_key_dpu';

// Token'ı çözen ve imza doğruluğunu kontrol eden sihirli fonksiyonumuz 🔒
function getRoleFromToken(token) {
    if (!token) return 'GUEST';
    try {
        const [username, role, signature] = token.split(':');
        
        // Gelen bilgilerle sunucu tarafında yeniden imza hesaplıyoruz
        const expectedSignature = crypto.createHmac('sha256', SECRET_KEY)
                                        .update(`${username}:${role}`)
                                        .digest('hex');

        // Eğer imzalar uyuşuyorsa rol güvenlidir!
        if (signature === expectedSignature) {
            return role;
        }
    } catch (e) {
        console.error("Güvenlik Duvarı: Token doğrulanamadı!", e.message);
    }
    return 'GUEST';
}

// Kullanıcının adını token'dan güvenle çıkaran fonksiyon 🔒
function getUsernameFromToken(token) {
    if (!token) return null;
    try {
        const [username, role, signature] = token.split(':');
        return username;
    } catch (e) {
        return null;
    }
}

// ─── 1. API: PROJELERİ LİSTELEME (ROL BAZLI FİLTRELİ!) ───
router.get('/projects/list', async (req, res) => {
    const userToken = req.headers['x-user-token'];
    const userRole = getRoleFromToken(userToken);
    const username = getUsernameFromToken(userToken);

    try {
        const result = await dpu.select('projeler', 100);
        if (!result.success) {
            return res.status(500).json({ error: "DPU Base listeleme hatası", details: result });
        }

        let projectNames = result.data.map(p => p.proje_adi);

        //  SİBER GÜVENLİK FİLTRESİ: Eğer kullanıcı ADMIN değilse sadece atandığı projeleri görebilir!
        if (userRole !== 'ADMIN' && username) {
            const permissionsRes = await dpu.select('kullanici_projeleri', 100);
            if (permissionsRes.success && permissionsRes.data) {
                // Sadece bu kullanıcıya atanan proje adlarını filtreliyoruz  🔑
                const allowedProjects = permissionsRes.data
                    .filter(p => p.kullanici_adi.toLowerCase() === username.toLowerCase())
                    .map(p => p.proje_adi);

                projectNames = projectNames.filter(name => allowedProjects.includes(name));
            } else {
                projectNames = []; // Atanmış izin tablosu yoksa hiçbir projeyi göremez!
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
router.post('/projects/create', async (req, res) => {
    const userToken = req.headers['x-user-token'];
    const userRole = getRoleFromToken(userToken);

    if (userRole !== 'ADMIN') {
        return res.status(403).json({ error: "Bu işlem için yetkiniz yok! Sadece ADMIN yetkilidir." });
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

// // ─── 3. API: PROJE BAZLI SENARYOLARI LİSTELEME (BELLEKTE GÜVENLİ FİLTRELEME! 🔒) ───
// router.get('/list', async (req, res) => {
//     const { project } = req.query;
//     const selectedProj = (project || '').trim();

//     if (!selectedProj) return res.json({ scenarios: [] });

//     try {
//         console.log(`=========================================`);
//         console.log(`🔍 LİSTELEME SORGUSU BAŞLADI !`);
//         console.log(`Aranan Proje Adı: "${selectedProj}"`);
        
//         // 1. Önce projeleri filtresiz çekelim (API tıkanmasın diye)
//         const projectRes = await dpu.select('projeler', 100);
//         if (!projectRes.success || !projectRes.data) {
//             console.log("❌ DPU Base 'projeler' tablosuna erişemedi!");
//             return res.json({ scenarios: [] });
//         }

//         // Bellekte küçük/büyük harfe duyarsız eşleştirme yapıyoruz
//         const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
//         if (!foundProj) {
//             console.log(`⚠️ "${selectedProj}" isimli proje veritabanında yok.`);
//             console.log("Mevcut Projeler:", projectRes.data.map(p => p.proje_adi));
//             return res.json({ scenarios: [] });
//         }
        
//         const projectId = foundProj.id;
//         console.log(`🎯 Eşleşen Proje ID: ${projectId}`);

//         // 2. Senaryoları da filtresiz çekip bellekte filtreliyoruz! 🚀
//         const scenariosRes = await dpu.select('senaryolar', 100);
        
//         if (scenariosRes.success && scenariosRes.data) {
//             console.log(`📂 Toplam Senaryo Kayıt Sayısı: ${scenariosRes.data.length}`);
            
//             // API filtresi yerine güvenli Javascript filtrelemesi kilit! 🔑
//             const filteredScenarios = scenariosRes.data
//                 .filter(s => String(s.project_id) === String(projectId))
//                 .map(s => s.senaryo_adi);
            
//             console.log(`✅ Eşleşen ve Gönderilen Senaryolar:`, filteredScenarios);
//             console.log(`=========================================`);
//             return res.json({ scenarios: filteredScenarios });
//         }
        
//         console.log("❌ Senaryolar tablosundan veri çekilemedi:", scenariosRes);
//         return res.status(500).json({ error: "Senaryolar yüklenemedi" });
//     } catch (error) {
//         console.error("💥 Senaryo listeleme hatası:", error.message);
//         return res.status(500).json({ error: error.message });
//     }
// });

// ─── 3. API: PROJE BAZLI SENARYOLARI LİSTELEME (GÜVENLİK & YETKİ FİLTRELİ! 🔒) ───
router.get('/list', async (req, res) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();

    // 🌟 GÜVENLİK: İstekten kullanıcı token'ını alıyoruz
    const userToken = req.headers['x-user-token'];
    const userRole = getRoleFromToken(userToken);
    const username = getUsernameFromToken(userToken);

    if (!selectedProj) return res.json({ scenarios: [] });

    try {
        console.log(`=========================================`);
        console.log(`🔍 LİSTELEME SORGUSU BAŞLADI (Kullanıcı: ${username || 'Anonim'}, Rol: ${userRole})`);
        console.log(`Aranan Proje Adı: "${selectedProj}"`);
        
        // 1. Kullanıcı ADMIN değilse bu projeye erişim yetkisi var mı kontrol et!
        if (userRole !== 'ADMIN' && username) {
            const permissionsRes = await dpu.select('kullanici_projeleri', 100);
            if (permissionsRes.success && permissionsRes.data) {
                const allowedProjects = permissionsRes.data
                    .filter(p => p.kullanici_adi.toLowerCase() === username.toLowerCase())
                    .map(p => p.proje_adi.toLowerCase());

                if (!allowedProjects.includes(selectedProj.toLowerCase())) {
                    console.log(`⛔ YETKİSİZ ERİŞİM: "${username}" kullanıcısının "${selectedProj}" projesine yetkisi yok!`);
                    return res.json({ scenarios: [] });
                }
            } else {
                return res.json({ scenarios: [] });
            }
        }

        // 2. Projeleri filtresiz çekip bellekte eşleştiriyoruz
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.json({ scenarios: [] });
        }

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            return res.json({ scenarios: [] });
        }
        
        const projectId = foundProj.id;

        // 3. Senaryoları çek ve sadece ilgili projenin senaryolarını dön!
        const scenariosRes = await dpu.select('senaryolar', 100);
        
        if (scenariosRes.success && scenariosRes.data) {
            const filteredScenarios = scenariosRes.data
                .filter(s => String(s.project_id) === String(projectId))
                .map(s => s.senaryo_adi);
            
            return res.json({ scenarios: filteredScenarios });
        }
        
        return res.json({ scenarios: [] });
    } catch (error) {
        console.error("💥 Senaryo listeleme hatası:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// ─── 4. API: SENARYO JSON İÇERİĞİNİ OKUMA (BELLEKTE GÜVENLİ FİLTRELEME! 🔒) ───
router.get('/content', async (req, res) => {
    const { scenarioName, project } = req.query;
    const selectedProj = (project || 'Varsayılan Proje').trim();

    if (!scenarioName) return res.status(400).json({ error: "scenarioName parametresi zorunlu!" });

    try {
        console.log(`🔍 [Content] "${scenarioName}" senaryosunun içeriği buluttan talep ediliyor...`);

        // 1. Projeleri filtresiz çekip bellekte eşleştiriyoruz !
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
        
        // 1. Projeleri filtresiz çekip bellekte esnek (case-insensitive) olarak aratıyoruz !
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
        // 1. Projeleri bellekte esnek aratıyoruz !
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

        // 1. Projeleri filtresiz çekip bellekte esnek (case-insensitive) olarak aratıyoruz ! 🔑
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

        // Arka planda sıralı (sequential) asenkron döngü koşturuyoruz ! ⚡
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
    const userToken = req.headers['x-user-token'];
    const userRole = getRoleFromToken(userToken);


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

// ─── 👨‍💼 KULLANICI YÖNETİMİ API ENDPOINT'LERİ (Sadece ADMIN Yetkili) ───

// 1. Kullanıcıları Listeleme
router.get('/users/list', async (req, res) => {
    const userToken = req.headers['x-user-token'];
    if (getRoleFromToken(userToken) !== 'ADMIN') return res.status(403).json({ error: "Yetkisiz işlem!" });

    try {
        const usersRes = await dpu.select('kullanicilar', 100);
        const projectsRes = await dpu.select('projeler', 100);
        const permsRes = await dpu.select('kullanici_projeleri', 100);

        if (usersRes.success) {
            // Kullanıcıları ve atandıkları projeleri birleştirip gönderiyoruz 
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

// 2. Yeni Kullanıcı Oluşturma & Proje Atama
router.post('/users/create', async (req, res) => {
    const userToken = req.headers['x-user-token'];
    if (getRoleFromToken(userToken) !== 'ADMIN') return res.status(403).json({ error: "Yetkisiz işlem!" });

    const { username, password, role, selectedProjects } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: "Eksik alanlar var!" });
    }

    try {
        // Çift kayıt kontrolü
        const usersCheck = await dpu.select('kullanicilar', 100);
        if (usersCheck.success && usersCheck.data.some(u => u.kullanici_adi.toLowerCase() === username.toLowerCase())) {
            return res.status(400).json({ error: "Bu kullanıcı adı zaten mevcut!" });
        }

        // Kullanıcıyı ekle
        const userInsert = await dpu.insert('kullanicilar', {
            kullanici_adi: username,
            sifre: password,
            rol: role.toUpperCase()
        });

        if (userInsert.success) {
            // Proje yetkilerini ekle
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
router.post('/users/delete', async (req, res) => {
    const userToken = req.headers['x-user-token'];
    if (getRoleFromToken(userToken) !== 'ADMIN') return res.status(403).json({ error: "Yetkisiz işlem!" });

    const { id, username } = req.body;

    try {
        // 1. Kullanıcıyı sil
        const deleteUser = await dpu.delete('kullanicilar', id);
        if (deleteUser.success) {
            // 2. Kullanıcının proje ilişkilerini temizle
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

// 4. Kullanıcı Bilgilerini ve Proje Yetkilerini Güncelleme (Sadece ADMIN Yetkili) 🔒
router.post('/users/update', async (req, res) => {
    const userToken = req.headers['x-user-token'];
    
    // 🛡️ 1. ZIRH: Admin Yetki Kontrolü
    if (getRoleFromToken(userToken) !== 'ADMIN') {
        return res.status(403).json({ error: "Yetkisiz işlem! Sadece ADMIN kullanıcıları güncelleyebilir." });
    }

    const { id, username, password, role, selectedProjects } = req.body;

    if (!id || !username) {
        return res.status(400).json({ error: "Eksik parametre! Kullanıcı ID ve Kullanıcı Adı zorunludur." });
    }

    try {
        // 1. Mevcut kullanıcıyı veritabanından bul
        const usersRes = await dpu.select('kullanicilar', 100);
        if (!usersRes.success || !usersRes.data) {
            return res.status(500).json({ error: "Veritabanı erişim hatası." });
        }

        const existingUser = usersRes.data.find(u => String(u.id) === String(id));
        if (!existingUser) {
            return res.status(404).json({ error: "Güncellenecek kullanıcı bulunamadı." });
        }

        // 2. Yeni Şifre / Eski Şifre Mantığı
        const finalPassword = (password && password.trim() !== '') ? password : existingUser.sifre;
        const finalRole = role ? role.toUpperCase() : existingUser.rol;

        console.log(`🔄 [User Update] "${username}" kullanıcısı yenileniyor...`);

        // 3. Garanti Çözüm: Eski kullanıcı kaydını sil ve güncel verilerle yeniden ekle!
        await dpu.delete('kullanicilar', existingUser.id);
        
        const insertUserRes = await dpu.insert('kullanicilar', {
            kullanici_adi: username,
            sifre: finalPassword,
            rol: finalRole
        });

        if (!insertUserRes.success) {
            console.error("❌ Kullanıcı yeniden eklenirken hata verdi:", insertUserRes);
            return res.status(500).json({ error: "Kullanıcı bilgileri güncellenemedi." });
        }

        // 4. Proje Yetkilerini Atomik Olarak Yenile (Eskileri sil, yenileri bas)
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

        console.log(`✅ [User Update] "${username}" kullanıcısı ve yetkileri başarıyla güncellendi!`);
        return res.json({ success: true, message: "Kullanıcı bilgileri ve yetkileri başarıyla güncellendi!" });

    } catch (err) {
        console.error("Kullanıcı güncelleme hatası:", err);
        return res.status(500).json({ error: err.message });
    }
});


export default router;