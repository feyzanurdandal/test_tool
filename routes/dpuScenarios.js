import express from 'express';
import { exec } from 'child_process';
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

// ─── 5. API: SENARYO SİLME ───
router.post('/delete', async (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = projectName || 'Varsayılan Proje';

    try {
        // 1. Projenin ID'sini bulalım
        const projectRes = await dpu.select('projeler', 1, `proje_adi:eq:${selectedProj}`);
        if (!projectRes.success || projectRes.data.length === 0) {
            return res.status(404).json({ error: "Proje bulunamadı." });
        }
        const projectId = projectRes.data[0].id;

        // 2. İlgili senaryoyu bulalım
        const scenarioRes = await dpu.select('senaryolar', 1, `project_id:eq:${projectId}&senaryo_adi:eq:${scenarioName}`);
        if (scenarioRes.success && scenarioRes.data.length > 0) {
            const scenarioId = scenarioRes.data[0].id;
            
            // 3. Bulunan senaryo ID'sini DPU Base'den silelim
            const deleteRes = await dpu.delete('senaryolar', scenarioId);
            if (deleteRes.success) {
                return res.status(200).json({ success: true, status: "SUCCESS" });
            }
        }
        return res.status(404).json({ error: "Senaryo dosyası veritabanında bulunamadı" });
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

export default router;