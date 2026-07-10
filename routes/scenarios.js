// import express from 'express';
// import { exec } from 'child_process';
// import fs from 'fs';
// import path from 'path';
// import { CONSTANTS } from '../config/constants.js';
// import db from '../config/database.js';
// import { processAndSaveScenario } from '../server.js';

// const router = express.Router();
// const targetFolder = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER);
// const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER);

// router.post('/create-and-save', async (req, res) => {
//     // Console'a gelen veriyi bastıralım, hatayı hemen görelim
//     console.log("📥 Gelen Veri:", req.body); 
    
//     const { scenarioName, turkishInstructions, targetUrl } = req.body;
    
//     // Validasyonları genişletelim
//     if (!scenarioName || !turkishInstructions || !targetUrl) {
//         console.error("❌ Eksik veri hatası!");
//         return res.status(400).json({ error: "scenarioName, turkishInstructions veya targetUrl eksik!" });
//     }

//     try {
//         const filePath = await processAndSaveScenario(scenarioName, turkishInstructions, targetUrl);
//         res.status(200).json({ status: "SUCCESS", message: "Senaryo oluşturuldu", path: filePath });
//     } catch (error) {
//         console.error("❌ İşlem Hatası:", error);
//         res.status(500).json({ error: error.message });
//     }
// });

// /**
//  * 🛠️ Yardımcı Fonksiyon: Testi çalıştıran ortak mantık
//  */
// const executeTest = (scenarioName, callback) => {
//     // 🛡️ GÜVENLİK ADIMI: scenarioName içerisindeki özel karakterleri temizle (Sadece harf, rakam, alt çizgi ve tireye izin ver)
//     const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    
//     // Eğer isim temizlendikten sonra boş kalıyorsa hata döndür
//     if (!sanitizedName) {
//         return callback("BAŞARISIZ (Geçersiz isim)");
//     }

//     const command = `npm run test:ai-local`;
//     // 🛡️ GÜVENLİK ADIMI: İşletim sistemi komutuna temizlenmiş ismi gönder
//     const options = { env: { ...process.env, SCENARIO_NAME: sanitizedName } };

//     let targetUrl = 'Bilinmiyor';
//     try {
//         // Dosya okurken de yine temizlenmiş ismi kullan
//         const scenarioFilePath = path.join(targetFolder, `${sanitizedName}.json`);
//         if (fs.existsSync(scenarioFilePath)) {
//             const scenarioRaw = JSON.parse(fs.readFileSync(scenarioFilePath, 'utf-8'));
//             targetUrl = scenarioRaw.targetUrl || 'Bilinmiyor';
//         }
//     } catch (readErr) {
//         console.warn('⚠️ Senaryo okunurken hata:', readErr.message);
//     }

//     exec(command, options, (error, stdout, stderr) => {
//         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//         if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

//         const logFileName = `REPORT-${sanitizedName}-${timestamp}.txt`;
//         const logContent = error 
//             ? `❌ [TEST FAILED] - ${sanitizedName}\n================\n${stderr}\n\n${stdout}` 
//             : `✅ [TEST SUCCESS] - ${sanitizedName}\n================\n${stdout}`;
        
//         fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');
//         const status = error ? 'FAILED' : 'SUCCESS';

//         const insertQuery = `INSERT INTO reports (scenario_name, target_url, status, log_file_name) VALUES (?, ?, ?, ?)`;
//         db.run(insertQuery, [sanitizedName, targetUrl, status, logFileName], (err) => {
//             if (err) console.error('🚨 Veritabanı hatası:', err.message);
//             callback(error ? "BAŞARISIZ" : "BAŞARILI");
//         });
//     });
// };

// // 🏠 Dashboard'a Yönlendirme
// router.get('/', (req, res) => {
//     res.redirect('/'); 
// });

// // 💾 Senaryo Kaydetme
// router.post('/save', (req, res) => {
//     const { scenarioName, targetUrl, steps } = req.body;
//     // 🛡️ GÜVENLİK ADIMI: Kaydederken de ismi temizle ki dosya sistemi karmaşası olmasın
//     const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    
//     if (!sanitizedName || !targetUrl || !steps) return res.status(400).json({ error: "Eksik veya geçersiz veri!" });

//     try {
//         if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
//         fs.writeFileSync(path.join(targetFolder, `${sanitizedName}.json`), JSON.stringify({ targetUrl, steps }, null, 2));
//         res.status(200).json({ status: "SUCCESS" });
//     } catch (error) { res.status(500).json({ error: error.message }); }
// });

// // 🔍 Senaryo Listeleme
// router.get('/list', (req, res) => {
//     try {
//         if (!fs.existsSync(targetFolder)) return res.json({ scenarios: [] });
//         const scenarios = fs.readdirSync(targetFolder).filter(f => f.endsWith('.json')).map(f => path.basename(f, '.json'));
//         res.json({ scenarios });
//     } catch (error) { res.status(500).json({ error: error.message }); }
// });

// // 🚀 Testi Çalıştıran Uç Noktalar
// router.post('/run-single', (req, res) => {
//     const { scenarioName } = req.body;
//     if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli" });
//     executeTest(scenarioName, (result) => res.json({ scenario: scenarioName, status: result }));
// });

// router.post('/run-single-sync', (req, res) => {
//     const { scenarioName } = req.body;
//     if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli" });
//     executeTest(scenarioName, (result) => res.json({ scenario: scenarioName, status: result }));
// });

// router.post('/run-all', async (req, res) => {
//     console.log("🚀 n8n'e tetikleme isteği gönderiliyor...");
//     try {
//         const n8nUrl = CONSTANTS.N8N_BASE_URL + '/webhook/test-trigger';
//         const response = await fetch(n8nUrl, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ action: "run-all" })
//         });
        
//         const result = await response.text();
//         console.log("✅ n8n cevabı:", result);
        
//         res.json({ status: "SUCCESS", message: "n8n tetiklendi" });
//     } catch (error) {
//         console.error("❌ n8n hata döndürdü:", error);
//         res.status(500).json({ error: error.message });
//     }
// });

// router.post('/delete', (req, res) => {
//     const { scenarioName } = req.body;
//     const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
//     const filePath = path.join(targetFolder, `${sanitizedName}.json`);

//     if (fs.existsSync(filePath)) {
//         fs.unlinkSync(filePath); // Fiziksel dosyayı siler
//         res.status(200).json({ status: "SUCCESS" });
//     } else {
//         res.status(404).json({ error: "Dosya bulunamadı" });
//     }
// });

// export default router;

import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CONSTANTS } from '../config/constants.js';
import db from '../config/database.js';
import { processAndSaveScenario } from '../server.js';

const router = express.Router();
const baseScenariosFolder = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER || 'scenarios');
const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER || 'reports');

// ─── 🆕 PROJELERİ LİSTELEME ENDPOINT'İ ───
router.get('/projects/list', (req, res) => {
    try {
        if (!fs.existsSync(baseScenariosFolder)) fs.mkdirSync(baseScenariosFolder, { recursive: true });
        
        const items = fs.readdirSync(baseScenariosFolder);
        // Sadece klasör olanları "Proje" olarak kabul et
        let projects = items.filter(item => fs.statSync(path.join(baseScenariosFolder, item)).isDirectory());
        
        if (projects.length === 0) {
            fs.mkdirSync(path.join(baseScenariosFolder, 'Proje Seçin'), { recursive: true });
            projects.push('Proje Seçin');
        }
        res.json({ success: true, projects });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── 🆕 YENİ PROJE OLUŞTURMA ENDPOINT'İ ───
router.post('/projects/create', (req, res) => {
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: "Proje adı boş olamaz kanka!" });
    
    // Klasör adı güvenliği
    const sanitizedProjName = projectName.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
    if (!sanitizedProjName) return res.status(400).json({ error: "Geçersiz proje adı!" });

    try {
        const targetProjPath = path.join(baseScenariosFolder, sanitizedProjName);
        if (!fs.existsSync(targetProjPath)) {
            fs.mkdirSync(targetProjPath, { recursive: true });
        }
        res.json({ success: true, projectName: sanitizedProjName });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 💾 Senaryo Kaydetme (Sihirbaz) - Proje Destekli
router.post('/create-and-save', async (req, res) => {
    const { scenarioName, turkishInstructions, targetUrl, projectName } = req.body;
    const selectedProj = projectName || 'Proje Seçin';

    if (!scenarioName || !turkishInstructions || !targetUrl) {
        return res.status(400).json({ error: "Eksik alanlar var!" });
    }

    try {
        const filePath = await processAndSaveScenario(scenarioName, turkishInstructions, targetUrl, selectedProj);
        res.status(200).json({ status: "SUCCESS", path: filePath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔍 Proje Bazlı Senaryo Listeleme
router.get('/list', (req, res) => {
    const { project } = req.query; // Query string'den gelen proje: ?project=Auth Service
    const selectedProj = project || 'Proje Seçin';
    const targetFolder = path.join(baseScenariosFolder, selectedProj);

    try {
        if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
            return res.json({ scenarios: [] });
        }
        const scenarios = fs.readdirSync(targetFolder)
            .filter(f => f.endsWith('.json'))
            .map(f => path.basename(f, '.json'));
        res.json({ scenarios });
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

// 🚀 Testi Çalıştırma - Proje Destekli
router.post('/run-single', (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = projectName || 'Proje Seçin';
    if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli" });

    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    const targetFolder = path.join(baseScenariosFolder, selectedProj);

    const command = `npm run test:ai-local`;
    const options = { env: { ...process.env, SCENARIO_NAME: sanitizedName, PROJECT_CONTEXT: selectedProj } };

    let targetUrl = 'Bilinmiyor';
    try {
        const scenarioFilePath = path.join(targetFolder, `${sanitizedName}.json`);
        if (fs.existsSync(scenarioFilePath)) {
            const scenarioRaw = JSON.parse(fs.readFileSync(scenarioFilePath, 'utf-8'));
            targetUrl = scenarioRaw.targetUrl || 'Bilinmiyor';
        }
    } catch (readErr) {
        console.warn(readErr.message);
    }

    exec(command, options, (error, stdout, stderr) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

        const logFileName = `REPORT-${sanitizedName}-${timestamp}.txt`;
        const logContent = error 
            ? `❌ [TEST FAILED] - ${sanitizedName}\n================\n${stderr}\n\n${stdout}` 
            : `✅ [TEST SUCCESS] - ${sanitizedName}\n================\n${stdout}`;
        
        fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');
        const status = error ? 'FAILED' : 'SUCCESS';

        const insertQuery = `INSERT INTO reports (scenario_name, target_url, status, log_file_name) VALUES (?, ?, ?, ?)`;
        db.run(insertQuery, [sanitizedName, targetUrl, status, logFileName], (err) => {
            res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
        });
    });
});

// 🗑️ Senaryo Silme - Proje Destekli
router.post('/delete', (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = projectName || 'Auth Service';
    
    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(baseScenariosFolder, selectedProj, `${sanitizedName}.json`);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.status(200).json({ status: "SUCCESS" });
    } else {
        res.status(404).json({ error: "Dosya bulunamadı" });
    }
});

export default router;