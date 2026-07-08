import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CONSTANTS } from '../config/constants.js';
import db from '../config/database.js'; // 📦 SQLite bağlantısını içeri alıyoruz

const router = express.Router();
const targetFolder = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER);
const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER);

// Arayüz için bir ana sayfa (Dashboard)
router.get('/', (req, res) => {
    // Burada basit bir HTML döndüreceğiz. Menü, Test Oluştur Butonu ve Raporlar Listesi olacak.
    res.send(`
        <html>
            <body>
                <h1>Test Otomasyon Paneli</h1>
                <nav>
                    <button onclick="window.location.href='/create-test.html'">+ Test Senaryosu Oluştur</button>
                    <button onclick="window.location.href='/reports-panel.html'">📊 Raporları Gör</button>
                </nav>
            </body>
        </html>
    `);
});

// 💾 1. Tam Uyumlu Stagehand Formatını Olduğu Gibi Diske Kaydeden Endpoint
router.post('/save', (req, res) => {
    const { scenarioName, targetUrl, steps } = req.body;

    if (!scenarioName || !targetUrl || !steps) {
        return res.status(400).json({ error: "Gerekli veriler (scenarioName, targetUrl veya steps) eksik " });
    }

    try {
        const jsonOutput = {
            targetUrl: targetUrl,
            steps: steps 
        };

        if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
        }

        fs.writeFileSync(
            path.join(targetFolder, `${scenarioName}.json`), 
            JSON.stringify(jsonOutput, null, 2), 
            'utf-8'
        );

        res.status(200).json({ status: "SUCCESS", message: `Scenario ${scenarioName}.json successfully saved ` });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔍 2. Senaryoları Listeleme Endpoint'i
router.get('/list', (req, res) => {
    try {
        if (!fs.existsSync(targetFolder)) return res.json({ scenarios: [] });
        const files = fs.readdirSync(targetFolder);
        const scenarios = files
            .filter(file => path.extname(file).toLowerCase() === '.json')
            .map(file => path.basename(file, '.json'));
        res.json({ scenarios });
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

// 🚀 3. Testi Tetikleyen ve Temiz .txt Raporu Basıp SQLite'a İşleyen Endpoint
router.post('/run-single', (req, res) => {
    const { scenarioName } = req.body;
    if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli " });

    const command = `npm run test:ai-local`;
    const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

    // 📦 Veri tabanına yazabilmek için senaryonun targetUrl bilgisini JSON'dan çekiyoruz
    let targetUrl = 'Bilinmiyor';
    try {
        const scenarioFilePath = path.join(targetFolder, `${scenarioName}.json`);
        if (fs.existsSync(scenarioFilePath)) {
            const scenarioRaw = JSON.parse(fs.readFileSync(scenarioFilePath, 'utf-8'));
            targetUrl = scenarioRaw.targetUrl || 'Bilinmiyor';
        }
    } catch (readErr) {
        console.warn('⚠️ Senaryo JSON okunurken hata oluştu, varsayılan URL atanıyor:', readErr.message);
    }

    exec(command, options, (error, stdout, stderr) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

        const logFileName = `REPORT-${scenarioName}-${timestamp}.txt`;
        const logContent = error 
            ? `❌ [TEST FAILED] - ${scenarioName}\n=====================================\n${stderr}\n\n${stdout}` 
            : `✅ [TEST SUCCESS] - ${scenarioName}\n=====================================\n${stdout}`;
        
        // 1. Log dosyasını diske yazıyoruz
        fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');

        // 2. Testin durumunu belirliyoruz
        const status = error ? 'FAILED' : 'SUCCESS';

        // 3. 🛡️ SQLite Veri Tabanına Özet Satırı Çakıyoruz
        const insertQuery = `
            INSERT INTO reports (scenario_name, target_url, status, log_file_name)
            VALUES (?, ?, ?, ?)
`;
        
        db.run(insertQuery, [scenarioName, targetUrl, status, logFileName], function(err) {
            if (err) {
                console.error('🚨 Rapor veritabanına kaydedilirken hata oluştu:', err.message);
            } else {
                console.log(`📦 Yeni rapor SQLite veri tabanına eklendi. ID: ${this.lastID}`);
            }
        });

        return res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
    });
});

// 🚀 3. Testi Tetikleyen ve Temiz .txt Raporu Basıp SQLite'a İşleyen Endpoint
router.post('/run-single-sync', (req, res) => {
    const { scenarioName } = req.body;
    if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli " });

    const command = `npm run test:ai-local`;
    const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

    // 📦 Veri tabanına yazabilmek için senaryonun targetUrl bilgisini JSON'dan çekiyoruz
    let targetUrl = 'Bilinmiyor';
    try {
        const scenarioFilePath = path.join(targetFolder, `${scenarioName}.json`);
        if (fs.existsSync(scenarioFilePath)) {
            const scenarioRaw = JSON.parse(fs.readFileSync(scenarioFilePath, 'utf-8'));
            targetUrl = scenarioRaw.targetUrl || 'Bilinmiyor';
        }
    } catch (readErr) {
        console.warn('⚠️ Senaryo JSON okunurken hata oluştu, varsayılan URL atanıyor:', readErr.message);
    }

    exec(command, options, (error, stdout, stderr) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

        const logFileName = `REPORT-${scenarioName}-${timestamp}.txt`;
        const logContent = error 
            ? `❌ [TEST FAILED] - ${scenarioName}\n=====================================\n${stderr}\n\n${stdout}` 
            : `✅ [TEST SUCCESS] - ${scenarioName}\n=====================================\n${stdout}`;
        
        // 1. Log dosyasını diske yazıyoruz
        fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');

        // 2. Testin durumunu belirliyoruz
        const status = error ? 'FAILED' : 'SUCCESS';

        // 3. 🛡️ SQLite Veri Tabanına Özet Satırı Çakıyoruz
        const insertQuery = `
            INSERT INTO reports (scenario_name, target_url, status, log_file_name)
            VALUES (?, ?, ?, ?)
`;
        
        db.run(insertQuery, [scenarioName, targetUrl, status, logFileName], function(err) {
            if (err) {
                console.error('🚨 Rapor veritabanına kaydedilirken hata oluştu:', err.message);
            } else {
                console.log(`📦 Yeni rapor SQLite veri tabanına eklendi. ID: ${this.lastID}`);
            }
        });

        return res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
    });
});

// routes/scenarios.js
router.post('/run-all', async (req, res) => {
    try {
        // n8n'in Webhook URL'sini buraya yapıştırıyoruz
        const n8nUrl = 'http://localhost:5678/webhook/test-trigger';
        
        // n8n'i tetikliyoruz
        const response = await fetch(n8nUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "run-all" })
        });

        res.json({ status: "SUCCESS", message: "Toplu test n8n üzerinden başlatıldı." });
    } catch (error) {
        res.status(500).json({ error: "n8n tetiklenemedi: " + error.message });
    }
});

export default router;