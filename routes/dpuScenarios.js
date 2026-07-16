import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dpu from '../config/dpuService.js';
import { CONSTANTS } from '../config/constants.js';
// routes/dpuScenarios.js dosyasının en üstündeki importlar arasına ekle :
import { translateScenario } from '../server.js';


const router = express.Router();
const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER || 'reports');

// ─── 1. API: PROJELERİ LİSTELEME ───
// Eskiden diskteki 'scenarios' klasörünün içindeki dizinleri okuyorduk.
// Artık doğrudan DPU Base 'projeler' tablosundan çekiyoruz !
router.get('/projects/list', async (req, res) => {
    try {
        const result = await dpu.select('projeler');
        if (result.success) {
            // Arayüze uyumluluk için sadece proje adlarından oluşan bir dizi (array) dönüyoruz
            const projectNames = result.data.map(p => p.proje_adi);
            
            // Eğer veritabanında hiç proje yoksa, varsayılan bir tane ekleyelim
            if (projectNames.length === 0) {
                await dpu.insert('projeler', { proje_adi: 'Varsayılan Proje' });
                return res.json({ success: true, projects: ['Varsayılan Proje'] });
            }
            
            return res.json({ success: true, projects: projectNames });
        } else {
            return res.status(500).json({ error: "DPU Base listeleme hatası", details: result });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 2. API: YENİ PROJE OLUŞTURMA (Sadece Sistem Yöneticisi yetkisinde olacak) ───
router.post('/projects/create', async (req, res) => {
    const userRole = req.headers['x-user-role']; // Gelen rolü yakalıyoruz 

    if (userRole !== 'ADMIN') {
        return res.status(403).json({ error: "Bu işlem için yetkiniz yok ! Sadece ADMIN yeni proje ekleyebilir." });
    }

    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: "Proje adı boş olamaz !" });

    const sanitizedProjName = projectName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    if (!sanitizedProjName) return res.status(400).json({ error: "Geçersiz proje adı!" });

    try {
        const checkExist = await dpu.select('projeler', 100, `proje_adi:eq:${sanitizedProjName}`);
        if (checkExist.success && checkExist.data.length > 0) {
            return res.status(400).json({ error: "Bu isimde bir proje zaten mevcut!" });
        }

        const result = await dpu.insert('projeler', { proje_adi: sanitizedProjName });
        if (result.success) {
            return res.json({ success: true, projectName: sanitizedProjName });
        } else {
            return res.status(500).json({ error: "DPU Base proje kayıt hatası", details: result });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});


// ─── 3. API: PROJE BAZLI SENARYOLARI LİSTELEME ───
router.get('/list', async (req, res) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();

    if (!selectedProj) {
        return res.json({ scenarios: [] });
    }

    try {
        console.log(`=========================================`);
        console.log(`🔍 LİSTELEME SORGUSU BAŞLADI !`);
        console.log(`Aranan Proje Adı: "${selectedProj}"`);
        
        // 1. Önce projeleri buluttan çekelim
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            console.log("❌ DPU Base 'projeler' tablosuna erişemedi!");
            return res.json({ scenarios: [] });
        }

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            console.log(`⚠️ "${selectedProj}" isimli proje veritabanında yok.`);
            console.log("Mevcut Projeler:", projectRes.data.map(p => p.proje_adi));
            return res.json({ scenarios: [] });
        }
        
        const projectId = foundProj.id;
        console.log(`🎯 Eşleşen Proje ID: ${projectId}`);

        // 2. Senaryoları buluttan çekelim
        const scenariosRes = await dpu.select('senaryolar', 100);
        if (scenariosRes.success && scenariosRes.data) {
            console.log(`📂 Toplam Senaryo Kayıt Sayısı: ${scenariosRes.data.length}`);
            
            // Proje ID'sine göre filtreleme yapıyoruz 
            const filteredScenarios = scenariosRes.data
                .filter(s => {
                    // Veritabanındaki project_id ve bizim bulduğumuz ID eşleşiyor mu kontrol ediyoruz
                    return String(s.project_id) === String(projectId);
                })
                .map(s => s.senaryo_adi);

            console.log(`✅ Eşleşen ve Gönderilen Senaryolar:`, filteredScenarios);
            console.log(`=========================================`);
            return res.json({ scenarios: filteredScenarios });
        } else {
            console.log("❌ Senaryolar tablosundan veri çekilemedi:", scenariosRes);
            return res.status(500).json({ error: "Senaryolar yüklenemedi" });
        }
    } catch (error) {
        console.error("💥 Senaryo listeleme fonksiyonunda hata patladı:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// ─── 4. API: SENARYO JSON İÇERİĞİNİ OKUMA (AKORDEON İÇİN) ───
router.get('/content', async (req, res) => {
    const { scenarioName, project } = req.query;
    const selectedProj = project || 'Varsayılan Proje';

    if (!scenarioName) return res.status(400).json({ error: "scenarioName parametresi zorunlu!" });

    try {
        // 1. Projenin ID'sini bulalım
        const projectRes = await dpu.select('projeler', 1, `proje_adi:eq:${selectedProj}`);
        if (!projectRes.success || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = projectRes.data[0].id;

        // 2. Senaryoyu 'senaryolar' tablosundan çekelim
        const scenarioRes = await dpu.select('senaryolar', 1, `project_id:eq:${projectId}&senaryo_adi:eq:${scenarioName}`);
        if (scenarioRes.success && scenarioRes.data.length > 0) {
            const scenario = scenarioRes.data[0];
            
            // Veritabanında JSON tipi string olarak saklanıyor olabilir, onu nesneye çeviriyoruz 
            const adimlarContent = typeof scenario.adimlar === 'string' 
                ? JSON.parse(scenario.adimlar) 
                : scenario.adimlar;

            return res.json({ success: true, content: adimlarContent });
        } else {
            return res.status(404).json({ error: "Senaryo bulunamadı." });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 💾 5. API: SENARYO KAYDETME VE GERÇEK GEMINI ÇEVİRİSİ (DPU BASE) ───
router.post('/create-and-save', async (req, res) => {
    const { scenarioName, turkishInstructions, targetUrl, projectName } = req.body;
    
    // Gelen proje adını temizleyip boşluklarını alıyoruz 
    const selectedProj = (projectName || 'Varsayılan Proje').trim();

    if (!scenarioName || !turkishInstructions || !targetUrl) {
        return res.status(400).json({ error: "Eksik alanlar var !" });
    }

    try {
        console.log(`🔍 DPU Base: "${selectedProj}" isimli proje sorgulanıyor...`);
        
        // 1. Adım: Projeleri listeyip kod tarafında eşleştirme yapıyoruz (Filtreleme hatasını bypass etmek için en garanti yol )
        const allProjectsRes = await dpu.select('projeler', 100);
        let projectId = null;

        if (allProjectsRes.success && allProjectsRes.data) {
            // Gelen tüm projelerin adını arayüzden gelenle küçük/büyük harf bakmaksızın eşleştiriyoruz
            const foundProj = allProjectsRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
            if (foundProj) {
                projectId = foundProj.id;
            }
        }

        // Eğer veritabanında bu isimde proje bulunamazsa, hemen otomatik ilk projeyi seçelim ki sistem kırılmasın!
        if (!projectId) {
            console.log(`⚠️ Proje tam eşleşmeyle bulunamadı, mevcut ilk proje atanıyor.`);
            const fallbackRes = await dpu.select('projeler', 1);
            if (fallbackRes.success && fallbackRes.data.length > 0) {
                projectId = fallbackRes.data[0].id;
            } else {
                return res.status(404).json({ error: "Veritabanında hiç proje tanımlı değil !" });
            }
        }

        console.log(`🎯 Proje ID Başarıyla Bulundu: ${projectId}. Çift kayıt kontrolü yapılıyor...`);

        // 2. Adım: Çift kayıt kontrolü
        const checkScenario = await dpu.select('senaryolar', 100);
        if (checkScenario.success && checkScenario.data) {
            const isDuplicate = checkScenario.data.some(s => s.project_id === projectId && s.senaryo_adi === scenarioName);
            if (isDuplicate) {
                return res.status(400).json({ error: "Bu proje altında bu senaryo adı zaten mevcut!" });
            }
        }

        console.log(`🧠 Gemini: "${scenarioName}" için Türkçe talimatlar çözümleniyor...`);
        
        // 3. Adım: Gemini çevirisi
        const stagehandJson = await translateScenario(turkishInstructions, targetUrl);

        // 4. Adım: Tamamen DPU Base kolonlarıyla eşleşen temiz veri modeli
        const nowIso = new Date().toISOString();
        const insertData = {
            project_id: projectId,
            senaryo_adi: scenarioName,
            hedef_url: targetUrl,
            adimlar: JSON.stringify(stagehandJson), // ⚠️ Kolon adı 'adimlar' (i harfiyle)
            created_at: nowIso,
            updated_at: nowIso
        };

        console.log("💾 DPU Base'e gönderilen ham veri:", insertData);
        const result = await dpu.insert('senaryolar', insertData);

        if (result.success) {
            console.log(`✅ Senaryo "${scenarioName}" başarıyla DPU Base'e yazıldı.`);
            return res.status(200).json({ success: true, status: "SUCCESS", message: "Senaryo başarıyla DPU Base'e mühürlendi!" });
        } else {
            console.error("❌ DPU Base kayıt hatası detayı:", result);
            return res.status(500).json({ error: "DPU Base senaryo kayıt hatası", details: result });
        }

    } catch (error) {
        console.error("💥 Senaryo kaydında büyük hata patladı:", error.message);
        return res.status(500).json({ error: error.message });
    }
});


// ─── 🗑️ 4. API: SENARYO SİLME (DPU BASE) ───
router.post('/delete', async (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioName || !selectedProj) {
        return res.status(400).json({ error: "Eksik parametre var ! Proje veya senaryo adı gelmedi." });
    }

    try {
        console.log(`=========================================`);
        console.log(`🗑️ SİLME İSTEĞİ GELDİ!`);
        console.log(`Gelen Proje Adı: "${selectedProj}" | Senaryo: "${scenarioName}"`);

        // 1. Projeleri çekip kod tarafında eşleştiriyoruz
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.status(500).json({ error: "Buluttan projeler tablosuna erişilemedi." });
        }

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            console.log(`❌ HATA: "${selectedProj}" isimli proje bulunamadı.`);
            return res.status(404).json({ error: "Proje bulunamadı." }); // 💥 Arayüzdeki hata mesajı
        }
        const projectId = foundProj.id;
        console.log(`🎯 Bulunan Proje ID: ${projectId}`);

        // 2. Senaryoyu bulalım
        const scenariosRes = await dpu.select('senaryolar', 100);
        if (!scenariosRes.success || !scenariosRes.data) {
            return res.status(500).json({ error: "Buluttan senaryolar tablosuna erişilemedi." });
        }

        const foundScenario = scenariosRes.data.find(s => 
            String(s.project_id) === String(projectId) && 
            s.senaryo_adi === scenarioName
        );

        if (!foundScenario) {
            return res.status(404).json({ error: "Silinecek senaryo bulunamadı ." });
        }

        const scenarioId = foundScenario.id;
        console.log(`🎯 Silinecek Senaryo ID: ${scenarioId}`);

        // 3. DPU Base'den silme işlemi
        const deleteResult = await dpu.delete('senaryolar', scenarioId);

        if (deleteResult.success) {
            console.log(`✅ Senaryo "${scenarioName}" başarıyla buluttan uçuruldu.`);
            console.log(`=========================================`);
            return res.status(200).json({ success: true, message: "Senaryo başarıyla silindi!" });
        } else {
            console.error("❌ Silme işlemi başarısız:", deleteResult);
            return res.status(500).json({ error: "Silme işlemi başarısız.", details: deleteResult });
        }

    } catch (error) {
        console.error("💥 Silme işleminde hata patladı:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// ─── 🚀 5. API: TEKİL TESTİ PLAYWRIGHT İLE KOŞTURMA (EXEC RUNNER) ───
router.post('/run', async (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioName || !selectedProj) {
        return res.status(400).json({ error: "Eksik parametre var ! Proje veya senaryo adı gelmedi." });
    }

    try {
        console.log(`=========================================`);
        console.log(`🚀 PLAYWRIGHT TEST ÇALIŞTIRMA İSTEĞİ GELDİ!`);
        console.log(`Senaryo: "${scenarioName}" | Proje: "${selectedProj}"`);

        // 1. DPU Base'den projenin ID'sini alıyoruz
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });
        }
        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            return res.status(404).json({ error: "İlgili proje bulunamadı." });
        }
        const projectId = foundProj.id;

        // 2. Senaryolar tablosundan adımları (adimlar) çekiyoruz 
        const scenariosRes = await dpu.select('senaryolar', 100);
        if (!scenariosRes.success || !scenariosRes.data) {
            return res.status(500).json({ error: "Senaryolar tablosuna erişilemedi." });
        }

        const foundScenario = scenariosRes.data.find(s => 
            String(s.project_id) === String(projectId) && 
            s.senaryo_adi === scenarioName
        );

        if (!foundScenario) {
            return res.status(404).json({ error: "Çalıştırılacak senaryo bulutta bulunamadı." });
        }

        // Adımları alıyoruz (Stagehand JSON instruct verileri)
        const rawSteps = foundScenario.adimlar; // ⚠️ Kolon adı 'adimlar'
        console.log(`📦 Çekilen Ham Adımlar:`, rawSteps);

        // 3. Playwright testinin okuyabilmesi için adımları geçici bir dosyaya yazıyoruz 
        const cacheDir = path.join(process.cwd(), 'cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        const runtimeStepsPath = path.join(cacheDir, 'runtime_steps.json');
        
        // Eğer veritabanından string geldiyse doğrudan yaz, nesneyse string'e çevir 
        const stepsString = typeof rawSteps === 'string' ? rawSteps : JSON.stringify(rawSteps, null, 2);
        fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');
        console.log(`💾 Geçici test adımları yazıldı: ${runtimeStepsPath}`);

        // 4. Playwright'ı arka planda tetikliyoruz! (Headless/Arka planda koşturacak şekilde )
        // 4. Playwright'ı arka planda tetikliyoruz!
        console.log(`🔥 Playwright motoru ateşleniyor...`);
        
        exec('npx playwright test tests/ai-security.spec.ts', async (error, stdout, stderr) => {
            console.log(`--- Playwright Çıktısı (STDOUT) --- \n${stdout}`);
            
            const isSuccess = !error;
            const nowIso = new Date().toISOString();

            // 📝 Rapor verisini hazırlıyoruz 
            const reportData = {
                project_id: projectId,
                scenario_name: scenarioName,
                status: isSuccess ? "SUCCESS" : "FAILED",
                log_content: stdout + (stderr ? `\n--- Hatalar ---\n${stderr}` : ''),
                created_at: nowIso
            };

            try {
                // 🔒 DPU Base üzerindeki 'raporlar' tablosuna sonucu mühürlüyoruz!
                console.log("💾 Test raporu DPU Base'e kaydediliyor...");
                await dpu.insert('raporlar', reportData);
                console.log("✅ Rapor başarıyla mühürlendi!");
            } catch (dbErr) {
                console.error("⚠️ Rapor veritabanına yazılırken hata oluştu :", dbErr.message);
            }

            if (error) {
                console.error(`❌ Test başarısız bitti :`, error.message);
                return res.status(500).json({ 
                    success: false, 
                    error: "Test koşturulurken bir hata patladı!", 
                    details: error.message,
                    output: stdout 
                });
            }

            console.log(`✅ Test başarıyla tamamlandı!`);
            return res.status(200).json({ 
                success: true, 
                message: "Test başarıyla koşturuldu ve tamamlandı!",
                output: stdout
            });
        });

    } catch (error) {
        console.error("💥 Test koşturma endpoint'inde büyük hata:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

// ─── 📊 6. API: PROJE BAZLI RAPORLARI LİSTELEME ───
router.get('/reports/list', async (req, res) => {
    const { project } = req.query;
    const selectedProj = (project || '').trim();

    if (!selectedProj) {
        return res.json({ reports: [] });
    }

    try {
        console.log(`🔍 DPU Base: "${selectedProj}" projesine ait raporlar aranıyor...`);
        
        // 1. Projeyi bulalım
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.json({ reports: [] });
        }

        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            return res.json({ reports: [] });
        }
        const projectId = foundProj.id;

        // 2. Raporları çekip filtreleyelim 
        const reportsRes = await dpu.select('raporlar', 100);
        if (reportsRes.success && reportsRes.data) {
            // Sadece bu projeye ait raporları alıp tarihe göre yeniden eskiye sıralıyoruz
            const filteredReports = reportsRes.data
                .filter(r => String(r.project_id) === String(projectId))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return res.json({ success: true, reports: filteredReports });
        } else {
            // Eğer henüz tablo yoksa veya boşsa boş dizi dönüyoruz , çökmesin
            return res.json({ reports: [] });
        }
    } catch (error) {
        console.error("💥 Rapor listelemede hata:", error.message);
        return res.json({ reports: [] });
    }
});

// ─── ⚡ 7. API: SIRALI TOPLU TEST KOŞTURMA (BATCH PIPELINE RUNNER) ───
router.post('/run-batch', async (req, res) => {
    const { scenarioNames, projectName } = req.body;
    const selectedProj = (projectName || '').trim();

    if (!scenarioNames || !Array.isArray(scenarioNames) || scenarioNames.length === 0 || !selectedProj) {
        return res.status(400).json({ error: "Eksik veya hatalı parametre !" });
    }

    try {
        console.log(`=========================================`);
        console.log(`⚡ TOPLU TEST KUYRUĞU BAŞLATILDI!`);
        console.log(`Proje: "${selectedProj}" | Kuyruk Sırası:`, scenarioNames);

        // 1. Projenin ID'sini bulalım
        const projectRes = await dpu.select('projeler', 100);
        if (!projectRes.success || !projectRes.data) {
            return res.status(404).json({ error: "Projeler tablosuna erişilemedi." });
        }
        const foundProj = projectRes.data.find(p => p.proje_adi.toLowerCase() === selectedProj.toLowerCase());
        if (!foundProj) {
            return res.status(404).json({ error: "İlgili proje bulunamadı." });
        }
        const projectId = foundProj.id;

        // 2. Senaryolar tablosundan projeye ait tüm senaryoları çekelim
        const scenariosRes = await dpu.select('senaryolar', 100);
        if (!scenariosRes.success || !scenariosRes.data) {
            return res.status(500).json({ error: "Senaryolar tablosuna erişilemedi." });
        }

        // Kuyruktaki senaryoların detaylarını tek tek hazırlayalım
        const batchScenarios = [];
        scenarioNames.forEach(name => {
            const found = scenariosRes.data.find(s => 
                String(s.project_id) === String(projectId) && 
                s.senaryo_adi === name
            );
            if (found) {
                batchScenarios.push(found);
            }
        });

        if (batchScenarios.length === 0) {
            return res.status(404).json({ error: "Kuyruktaki hiçbir senaryo veritabanında bulunamadı!" });
        }

        // 3. Sıralı Çocuk Proses Tetikleme Fonksiyonu (Helper)
        const runSingleTestPromise = (scenario) => {
            return new Promise((resolve) => {
                const rawSteps = scenario.adimlar;
                const cacheDir = path.join(process.cwd(), 'cache');
                if (!fs.existsSync(cacheDir)) {
                    fs.mkdirSync(cacheDir, { recursive: true });
                }
                
                const runtimeStepsPath = path.join(cacheDir, 'runtime_steps.json');
                const stepsString = typeof rawSteps === 'string' ? rawSteps : JSON.stringify(rawSteps, null, 2);
                
                // 🔒 Geçici dosyaya sıradaki testin adımlarını mühürlüyoruz
                fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');
                console.log(`[Batch] "${scenario.senaryo_adi}" geçici adımları yazıldı.`);

                console.log(`[Batch] Playwright "${scenario.senaryo_adi}" için tetikleniyor...`);
                
                exec('npx playwright test tests/ai-security.spec.ts', async (error, stdout, stderr) => {
                    const isSuccess = !error;
                    const nowIso = new Date().toISOString();

                    // Raporu DPU Base'e yazalım
                    const reportData = {
                        project_id: projectId,
                        scenario_name: scenario.senaryo_adi,
                        status: isSuccess ? "SUCCESS" : "FAILED",
                        log_content: stdout + (stderr ? `\n--- Hatalar ---\n${stderr}` : ''),
                        created_at: nowIso
                    };

                    try {
                        await dpu.insert('raporlar', reportData);
                        console.log(`[Batch] ✅ "${scenario.senaryo_adi}" raporu mühürlendi.`);
                    } catch (dbErr) {
                        console.error(`[Batch] ⚠️ Rapor yazma hatası:`, dbErr.message);
                    }

                    resolve({ scenarioName: scenario.senaryo_adi, success: isSuccess });
                });
            });
        };

        // 4. Kuyruğu asenkron sırayla (Sequential) koşturuyoruz !
        // Express isteğini bloklamamak için testi arka planda asenkron çalıştıracağız
        res.status(202).json({ 
            success: true, 
            message: "Toplu test pipeline akışı arka planda başlatıldı! Sonuçları Raporlar sekmesinden takip edebilirsin ." 
        });

        // Arka plan sıralı döngüsü:
        (async () => {
            for (const scenario of batchScenarios) {
                console.log(`\n➡️ Pipeline Sıradaki Test: "${scenario.senaryo_adi}"`);
                await runSingleTestPromise(scenario);
            }
            console.log(`\n⚡ BATCH PIPELINE BAŞARIYLA TAMAMLANDI!`);
            console.log(`=========================================`);
        })();

    } catch (error) {
        console.error("💥 Toplu test endpoint'inde hata:", error.message);
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
    }
});

// ─── ⚙️ 8. API: DPU BASE'DEN İLİŞKİSEL AYARLARI GETİRME (GET) ───
router.get('/settings/get', async (req, res) => {
    try {
        console.log("🔄 DPU Base: Tüm ayar satırları ilişkisel olarak sorgulanıyor...");
        const dbResult = await dpu.select('ayarlar', 100);

        const settings = {
            testRunnerApi: "openai",
            translatorApi: "gemini",
            apiKeys: {}
        };

        if (dbResult.success && dbResult.data && dbResult.data.length > 0) {
            // 1. Önce aktif sağlayıcı seçimlerini alalım 
            const testRunnerRow = dbResult.data.find(r => r.ayar_anahtar === 'test_runner_api');
            const translatorRow = dbResult.data.find(r => r.ayar_anahtar === 'translator_api');

            if (testRunnerRow) settings.testRunnerApi = testRunnerRow.ayar_deger;
            if (translatorRow) settings.translatorApi = translatorRow.ayar_deger;

            // 2. Sağlayıcı satırlarını (Key & Model tek satırda!) çözüyoruz  🔒
            dbResult.data.forEach(row => {
                if (row.ayar_anahtar !== 'test_runner_api' && row.ayar_anahtar !== 'translator_api') {
                    settings.apiKeys[row.ayar_anahtar] = {
                        key: row.ayar_deger || "",
                        model: row.ayar_model || "" // 🌟 İşte o efsane yeni kolonumuz!
                    };
                }
            });
        }

        return res.json({ success: true, settings });

    } catch (err) {
        console.error("❌ Ayarlar çekilirken hata oluştu:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── ⚙️ 9. API: DPU BASE ÜZERİNE İLİŞKİSEL AYARLARI KAYDETME (POST) ───
router.post('/settings/save', async (req, res) => {
    const userRole = req.headers['x-user-role']; // Rol kontrolü yapıyoruz 

    if (userRole !== 'ADMIN') {
        return res.status(403).json({ error: "Bu işlem için yetkiniz yok ! Sadece ADMIN sistem ayarlarını değiştirebilir." });
    }

    const { testRunnerApi, translatorApi, apiKeys } = req.body;
    
    try {
        console.log("💾 DPU Base: Ayarlar yeni şema ile kaydediliyor...");
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
                    console.log(`🧹 DPU Base: Silinmiş eski sağlayıcı temizleniyor -> ${row.ayar_anahtar}`);
                    await dpu.delete('ayarlar', row.id);
                }
            }
        }

        console.log("✅ Tüm ayarlar ilişkisel olarak başarıyla mühürlendi !");
        return res.json({ success: true, message: "Ayarlar başarıyla veritabanına mühürlendi!" });

    } catch (err) {
        console.error("❌ Ayarlar kaydedilirken hata oluştu:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── 🗑️ 6.5. API: TEKİL TEST RAPORUNU SİLME (DPU BASE) ───
router.post('/reports/delete', async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ error: "Eksik parametre ! Rapor ID değeri gelmedi." });
    }

    try {
        console.log(`=========================================`);
        console.log(`🗑️ RAPOR SİLME İSTEĞİ GELDİ !`);
        console.log(`Silinecek Rapor ID: "${id}"`);

        // DPU Base 'raporlar' tablosundan ilgili id'li satırı tamamen siliyoruz ! 🔒
        const deleteResult = await dpu.delete('raporlar', id);

        if (deleteResult.success) {
            console.log(`✅ Rapor (ID: ${id}) başarıyla buluttan temizlendi.`);
            console.log(`=========================================`);
            return res.status(200).json({ success: true, message: "Test raporu başarıyla silindi!" });
        } else {
            console.error("❌ Rapor silme işlemi başarısız:", deleteResult);
            return res.status(500).json({ error: "Silme işlemi veritabanında başarısız oldu.", details: deleteResult });
        }

    } catch (error) {
        console.error("💥 Rapor silme endpoint'inde hata patladı:", error.message);
        return res.status(500).json({ error: error.message });
    }
});

export default router;