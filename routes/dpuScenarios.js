import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dpu from '../config/dpuService.js';
import { CONSTANTS } from '../config/constants.js';
// routes/dpuScenarios.js dosyasının en üstündeki importlar arasına ekle kanka:
import { translateScenario } from '../server.js';


const router = express.Router();
const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER || 'reports');

// ─── 1. API: PROJELERİ LİSTELEME ───
// Eskiden diskteki 'scenarios' klasörünün içindeki dizinleri okuyorduk.
// Artık doğrudan DPU Base 'projeler' tablosundan çekiyoruz kanka!
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
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: "Proje adı boş olamaz kanka!" });

    const sanitizedProjName = projectName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    if (!sanitizedProjName) return res.status(400).json({ error: "Geçersiz proje adı!" });

    try {
        // Öncelikle bu isimde bir proje var mı diye kontrol edelim
        const checkExist = await dpu.select('projeler', 100, `proje_adi:eq:${sanitizedProjName}`);
        if (checkExist.success && checkExist.data.length > 0) {
            return res.status(400).json({ error: "Bu isimde bir proje zaten mevcut!" });
        }

        // DPU Base 'projeler' tablosuna yeni satır ekliyoruz
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
        console.log(`🔍 LİSTELEME SORGUSU BAŞLADI kanka!`);
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
            
            // Proje ID'sine göre filtreleme yapıyoruz kanka
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
            
            // Veritabanında JSON tipi string olarak saklanıyor olabilir, onu nesneye çeviriyoruz kanka
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
    
    // Gelen proje adını temizleyip boşluklarını alıyoruz kanka
    const selectedProj = (projectName || 'Varsayılan Proje').trim();

    if (!scenarioName || !turkishInstructions || !targetUrl) {
        return res.status(400).json({ error: "Eksik alanlar var kanka!" });
    }

    try {
        console.log(`🔍 DPU Base: "${selectedProj}" isimli proje sorgulanıyor...`);
        
        // 1. Adım: Projeleri listeyip kod tarafında eşleştirme yapıyoruz (Filtreleme hatasını bypass etmek için en garanti yol kanka)
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
                return res.status(404).json({ error: "Veritabanında hiç proje tanımlı değil kanka!" });
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
        return res.status(400).json({ error: "Eksik parametre var kanka! Proje veya senaryo adı gelmedi." });
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
            return res.status(404).json({ error: "Silinecek senaryo bulunamadı kanka." });
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
        return res.status(400).json({ error: "Eksik parametre var kanka! Proje veya senaryo adı gelmedi." });
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

        // 2. Senaryolar tablosundan adımları (adimlar) çekiyoruz kanka
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

        // 3. Playwright testinin okuyabilmesi için adımları geçici bir dosyaya yazıyoruz kanka
        const cacheDir = path.join(process.cwd(), 'cache');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        const runtimeStepsPath = path.join(cacheDir, 'runtime_steps.json');
        
        // Eğer veritabanından string geldiyse doğrudan yaz, nesneyse string'e çevir kanka
        const stepsString = typeof rawSteps === 'string' ? rawSteps : JSON.stringify(rawSteps, null, 2);
        fs.writeFileSync(runtimeStepsPath, stepsString, 'utf-8');
        console.log(`💾 Geçici test adımları yazıldı: ${runtimeStepsPath}`);

        // 4. Playwright'ı arka planda tetikliyoruz! (Headless/Arka planda koşturacak şekilde kanka)
        // 4. Playwright'ı arka planda tetikliyoruz!
        console.log(`🔥 Playwright motoru ateşleniyor...`);
        
        exec('npx playwright test tests/ai-security.spec.ts', async (error, stdout, stderr) => {
            console.log(`--- Playwright Çıktısı (STDOUT) --- \n${stdout}`);
            
            const isSuccess = !error;
            const nowIso = new Date().toISOString();

            // 📝 Rapor verisini hazırlıyoruz kanka
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
                console.error("⚠️ Rapor veritabanına yazılırken hata oluştu kanka:", dbErr.message);
            }

            if (error) {
                console.error(`❌ Test başarısız bitti kanka:`, error.message);
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

        // 2. Raporları çekip filtreleyelim kanka
        const reportsRes = await dpu.select('raporlar', 100);
        if (reportsRes.success && reportsRes.data) {
            // Sadece bu projeye ait raporları alıp tarihe göre yeniden eskiye sıralıyoruz
            const filteredReports = reportsRes.data
                .filter(r => String(r.project_id) === String(projectId))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return res.json({ success: true, reports: filteredReports });
        } else {
            // Eğer henüz tablo yoksa veya boşsa boş dizi dönüyoruz kanka, çökmesin
            return res.json({ reports: [] });
        }
    } catch (error) {
        console.error("💥 Rapor listelemede hata:", error.message);
        return res.json({ reports: [] });
    }
});

export default router;