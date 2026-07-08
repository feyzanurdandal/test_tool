// // import express from 'express';
// // import { exec } from 'child_process';
// // import fs from 'fs';
// // import path from 'path';
// // import { CONSTANTS } from '../config/constants.js';
// // import db from '../config/database.js'; // 📦 SQLite bağlantısını içeri alıyoruz

// // const router = express.Router();
// // const targetFolder = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER);
// // const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER);

// // // Arayüz için bir ana sayfa (Dashboard)
// // router.get('/', (req, res) => {
// //     // Burada basit bir HTML döndüreceğiz. Menü, Test Oluştur Butonu ve Raporlar Listesi olacak.
// //     res.send(`
// //         <html>
// //             <body>
// //                 <h1>Test Otomasyon Paneli</h1>
// //                 <nav>
// //                     <button onclick="window.location.href='/create-test.html'">+ Test Senaryosu Oluştur</button>
// //                     <button onclick="window.location.href='/reports-panel.html'">📊 Raporları Gör</button>
// //                 </nav>
// //             </body>
// //         </html>
// //     `);
// // });

// // // 💾 1. Tam Uyumlu Stagehand Formatını Olduğu Gibi Diske Kaydeden Endpoint
// // router.post('/save', (req, res) => {
// //     const { scenarioName, targetUrl, steps } = req.body;

// //     if (!scenarioName || !targetUrl || !steps) {
// //         return res.status(400).json({ error: "Gerekli veriler (scenarioName, targetUrl veya steps) eksik " });
// //     }

// //     try {
// //         const jsonOutput = {
// //             targetUrl: targetUrl,
// //             steps: steps 
// //         };

// //         if (!fs.existsSync(targetFolder)) {
// //             fs.mkdirSync(targetFolder, { recursive: true });
// //         }

// //         fs.writeFileSync(
// //             path.join(targetFolder, `${scenarioName}.json`), 
// //             JSON.stringify(jsonOutput, null, 2), 
// //             'utf-8'
// //         );

// //         res.status(200).json({ status: "SUCCESS", message: `Scenario ${scenarioName}.json successfully saved ` });

// //     } catch (error) {
// //         res.status(500).json({ error: error.message });
// //     }
// // });

// // // 🔍 2. Senaryoları Listeleme Endpoint'i
// // router.get('/list', (req, res) => {
// //     try {
// //         if (!fs.existsSync(targetFolder)) return res.json({ scenarios: [] });
// //         const files = fs.readdirSync(targetFolder);
// //         const scenarios = files
// //             .filter(file => path.extname(file).toLowerCase() === '.json')
// //             .map(file => path.basename(file, '.json'));
// //         res.json({ scenarios });
// //     } catch (error) { 
// //         res.status(500).json({ error: error.message }); 
// //     }
// // });

// // // 🚀 3. Testi Tetikleyen ve Temiz .txt Raporu Basıp SQLite'a İşleyen Endpoint
// // router.post('/run-single', (req, res) => {
// //     const { scenarioName } = req.body;
// //     if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli " });

// //     const command = `npm run test:ai-local`;
// //     const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

// //     // 📦 Veri tabanına yazabilmek için senaryonun targetUrl bilgisini JSON'dan çekiyoruz
// //     let targetUrl = 'Bilinmiyor';
// //     try {
// //         const scenarioFilePath = path.join(targetFolder, `${scenarioName}.json`);
// //         if (fs.existsSync(scenarioFilePath)) {
// //             const scenarioRaw = JSON.parse(fs.readFileSync(scenarioFilePath, 'utf-8'));
// //             targetUrl = scenarioRaw.targetUrl || 'Bilinmiyor';
// //         }
// //     } catch (readErr) {
// //         console.warn('⚠️ Senaryo JSON okunurken hata oluştu, varsayılan URL atanıyor:', readErr.message);
// //     }

// //     exec(command, options, (error, stdout, stderr) => {
// //         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
// //         if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

// //         const logFileName = `REPORT-${scenarioName}-${timestamp}.txt`;
// //         const logContent = error 
// //             ? `❌ [TEST FAILED] - ${scenarioName}\n=====================================\n${stderr}\n\n${stdout}` 
// //             : `✅ [TEST SUCCESS] - ${scenarioName}\n=====================================\n${stdout}`;
        
// //         // 1. Log dosyasını diske yazıyoruz
// //         fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');

// //         // 2. Testin durumunu belirliyoruz
// //         const status = error ? 'FAILED' : 'SUCCESS';

// //         // 3. 🛡️ SQLite Veri Tabanına Özet Satırı Çakıyoruz
// //         const insertQuery = `
// //             INSERT INTO reports (scenario_name, target_url, status, log_file_name)
// //             VALUES (?, ?, ?, ?)
// // `;
        
// //         db.run(insertQuery, [scenarioName, targetUrl, status, logFileName], function(err) {
// //             if (err) {
// //                 console.error('🚨 Rapor veritabanına kaydedilirken hata oluştu:', err.message);
// //             } else {
// //                 console.log(`📦 Yeni rapor SQLite veri tabanına eklendi. ID: ${this.lastID}`);
// //             }
// //         });

// //         return res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
// //     });
// // });

// // // 🚀 3. Testi Tetikleyen ve Temiz .txt Raporu Basıp SQLite'a İşleyen Endpoint
// // router.post('/run-single-sync', (req, res) => {
// //     const { scenarioName } = req.body;
// //     if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli " });

// //     const command = `npm run test:ai-local`;
// //     const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

// //     // 📦 Veri tabanına yazabilmek için senaryonun targetUrl bilgisini JSON'dan çekiyoruz
// //     let targetUrl = 'Bilinmiyor';
// //     try {
// //         const scenarioFilePath = path.join(targetFolder, `${scenarioName}.json`);
// //         if (fs.existsSync(scenarioFilePath)) {
// //             const scenarioRaw = JSON.parse(fs.readFileSync(scenarioFilePath, 'utf-8'));
// //             targetUrl = scenarioRaw.targetUrl || 'Bilinmiyor';
// //         }
// //     } catch (readErr) {
// //         console.warn('⚠️ Senaryo JSON okunurken hata oluştu, varsayılan URL atanıyor:', readErr.message);
// //     }

// //     exec(command, options, (error, stdout, stderr) => {
// //         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
// //         if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

// //         const logFileName = `REPORT-${scenarioName}-${timestamp}.txt`;
// //         const logContent = error 
// //             ? `❌ [TEST FAILED] - ${scenarioName}\n=====================================\n${stderr}\n\n${stdout}` 
// //             : `✅ [TEST SUCCESS] - ${scenarioName}\n=====================================\n${stdout}`;
        
// //         // 1. Log dosyasını diske yazıyoruz
// //         fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');

// //         // 2. Testin durumunu belirliyoruz
// //         const status = error ? 'FAILED' : 'SUCCESS';

// //         // 3. 🛡️ SQLite Veri Tabanına Özet Satırı Çakıyoruz
// //         const insertQuery = `
// //             INSERT INTO reports (scenario_name, target_url, status, log_file_name)
// //             VALUES (?, ?, ?, ?)
// // `;
        
// //         db.run(insertQuery, [scenarioName, targetUrl, status, logFileName], function(err) {
// //             if (err) {
// //                 console.error('🚨 Rapor veritabanına kaydedilirken hata oluştu:', err.message);
// //             } else {
// //                 console.log(`📦 Yeni rapor SQLite veri tabanına eklendi. ID: ${this.lastID}`);
// //             }
// //         });

// //         return res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
// //     });
// // });

// // // routes/scenarios.js
// // router.post('/run-all', async (req, res) => {
// //     try {
// //         // n8n'in Webhook URL'sini buraya yapıştırıyoruz
// //         const n8nUrl = 'http://localhost:5678/webhook/test-trigger';
        
// //         // n8n'i tetikliyoruz
// //         const response = await fetch(n8nUrl, {
// //             method: 'POST',
// //             headers: { 'Content-Type': 'application/json' },
// //             body: JSON.stringify({ action: "run-all" })
// //         });

// //         res.json({ status: "SUCCESS", message: "Toplu test n8n üzerinden başlatıldı." });
// //     } catch (error) {
// //         res.status(500).json({ error: "n8n tetiklenemedi: " + error.message });
// //     }
// // });

// // export default router;

// import express from 'express';
// import { exec } from 'child_process';
// import fs from 'fs';
// import path from 'path';
// import { CONSTANTS } from '../config/constants.js';
// import db from '../config/database.js';

// const router = express.Router();
// const targetFolder = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER);
// const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER);

// /**
//  * 🛠️ Yardımcı Fonksiyon: Testi çalıştıran ortak mantık
//  * Tekrarlayan kodu engellemek için buraya aldık.
//  */
// const executeTest = (scenarioName, callback) => {
//     const command = `npm run test:ai-local`;
//     const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

//     let targetUrl = 'Bilinmiyor';
//     try {
//         const scenarioFilePath = path.join(targetFolder, `${scenarioName}.json`);
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

//         const logFileName = `REPORT-${scenarioName}-${timestamp}.txt`;
//         const logContent = error 
//             ? `❌ [TEST FAILED] - ${scenarioName}\n================\n${stderr}\n\n${stdout}` 
//             : `✅ [TEST SUCCESS] - ${scenarioName}\n================\n${stdout}`;
        
//         fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');
//         const status = error ? 'FAILED' : 'SUCCESS';

//         const insertQuery = `INSERT INTO reports (scenario_name, target_url, status, log_file_name) VALUES (?, ?, ?, ?)`;
//         db.run(insertQuery, [scenarioName, targetUrl, status, logFileName], (err) => {
//             if (err) console.error('🚨 Veritabanı hatası:', err.message);
//             callback(error ? "BAŞARISIZ" : "BAŞARILI");
//         });
//     });
// };

// // 🏠 Dashboard'a Yönlendirme
// router.get('/', (req, res) => {
//     res.redirect('/'); // Ana server.js üzerindeki dashboard'a yönlendirir
// });

// // 💾 Senaryo Kaydetme
// router.post('/save', (req, res) => {
//     const { scenarioName, targetUrl, steps } = req.body;
//     if (!scenarioName || !targetUrl || !steps) return res.status(400).json({ error: "Eksik veri!" });

//     try {
//         if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
//         fs.writeFileSync(path.join(targetFolder, `${scenarioName}.json`), JSON.stringify({ targetUrl, steps }, null, 2));
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

// // 🚀 Testi Çalıştıran Uç Noktalar (Artık ortak executeTest fonksiyonunu kullanıyor)
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
//         const n8nUrl = process.env.N8N_BASE_URL + '/webhook/test-trigger';
//         console.log("🔥 Kullanılan URL:", n8nUrl); // <--- BU SATIRI EK
//         const response = await fetch(n8nUrl, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ action: "run-all" })
//         });
        
//         // n8n'den gelen cevabı yakalayalım
//         const result = await response.text();
//         console.log("✅ n8n cevabı:", result);
        
//         res.json({ status: "SUCCESS", message: "n8n tetiklendi" });
//     } catch (error) {
//         console.error("❌ n8n hata döndürdü:", error);
//         res.status(500).json({ error: error.message });
//     }
// });

// export default router;

import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CONSTANTS } from '../config/constants.js';
import db from '../config/database.js';

const router = express.Router();
const targetFolder = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER);
const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER);

/**
 * 🛠️ Yardımcı Fonksiyon: Testi çalıştıran ortak mantık
 */
const executeTest = (scenarioName, callback) => {
    // 🛡️ GÜVENLİK ADIMI: scenarioName içerisindeki özel karakterleri temizle (Sadece harf, rakam, alt çizgi ve tireye izin ver)
    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    
    // Eğer isim temizlendikten sonra boş kalıyorsa hata döndür
    if (!sanitizedName) {
        return callback("BAŞARISIZ (Geçersiz isim)");
    }

    const command = `npm run test:ai-local`;
    // 🛡️ GÜVENLİK ADIMI: İşletim sistemi komutuna temizlenmiş ismi gönder
    const options = { env: { ...process.env, SCENARIO_NAME: sanitizedName } };

    let targetUrl = 'Bilinmiyor';
    try {
        // Dosya okurken de yine temizlenmiş ismi kullan
        const scenarioFilePath = path.join(targetFolder, `${sanitizedName}.json`);
        if (fs.existsSync(scenarioFilePath)) {
            const scenarioRaw = JSON.parse(fs.readFileSync(scenarioFilePath, 'utf-8'));
            targetUrl = scenarioRaw.targetUrl || 'Bilinmiyor';
        }
    } catch (readErr) {
        console.warn('⚠️ Senaryo okunurken hata:', readErr.message);
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
            if (err) console.error('🚨 Veritabanı hatası:', err.message);
            callback(error ? "BAŞARISIZ" : "BAŞARILI");
        });
    });
};

// 🏠 Dashboard'a Yönlendirme
router.get('/', (req, res) => {
    res.redirect('/'); 
});

// 💾 Senaryo Kaydetme
router.post('/save', (req, res) => {
    const { scenarioName, targetUrl, steps } = req.body;
    // 🛡️ GÜVENLİK ADIMI: Kaydederken de ismi temizle ki dosya sistemi karmaşası olmasın
    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    
    if (!sanitizedName || !targetUrl || !steps) return res.status(400).json({ error: "Eksik veya geçersiz veri!" });

    try {
        if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
        fs.writeFileSync(path.join(targetFolder, `${sanitizedName}.json`), JSON.stringify({ targetUrl, steps }, null, 2));
        res.status(200).json({ status: "SUCCESS" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 🔍 Senaryo Listeleme
router.get('/list', (req, res) => {
    try {
        if (!fs.existsSync(targetFolder)) return res.json({ scenarios: [] });
        const scenarios = fs.readdirSync(targetFolder).filter(f => f.endsWith('.json')).map(f => path.basename(f, '.json'));
        res.json({ scenarios });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 🚀 Testi Çalıştıran Uç Noktalar
router.post('/run-single', (req, res) => {
    const { scenarioName } = req.body;
    if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli" });
    executeTest(scenarioName, (result) => res.json({ scenario: scenarioName, status: result }));
});

router.post('/run-single-sync', (req, res) => {
    const { scenarioName } = req.body;
    if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli" });
    executeTest(scenarioName, (result) => res.json({ scenario: scenarioName, status: result }));
});

router.post('/run-all', async (req, res) => {
    console.log("🚀 n8n'e tetikleme isteği gönderiliyor...");
    try {
        const n8nUrl = CONSTANTS.N8N_BASE_URL + '/webhook/test-trigger';
        const response = await fetch(n8nUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "run-all" })
        });
        
        const result = await response.text();
        console.log("✅ n8n cevabı:", result);
        
        res.json({ status: "SUCCESS", message: "n8n tetiklendi" });
    } catch (error) {
        console.error("❌ n8n hata döndürdü:", error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/delete', (req, res) => {
    const { scenarioName } = req.body;
    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(targetFolder, `${sanitizedName}.json`);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // Fiziksel dosyayı siler
        res.status(200).json({ status: "SUCCESS" });
    } else {
        res.status(404).json({ error: "Dosya bulunamadı" });
    }
});

export default router;