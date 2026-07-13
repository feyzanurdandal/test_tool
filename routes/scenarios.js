
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

// ─── PROJELERİ LİSTELEME ENDPOINT'İ ───
router.get('/projects/list', (req, res) => {
    try {
        if (!fs.existsSync(baseScenariosFolder)) fs.mkdirSync(baseScenariosFolder, { recursive: true });
        
        const items = fs.readdirSync(baseScenariosFolder);
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

// ─── YENİ PROJE OLUŞTURMA ENDPOINT'İ ───
router.post('/projects/create', (req, res) => {
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: "Proje adı boş olamaz kanka!" });
    
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

// ─── 🆕 API: SENARYO JSON İÇERİĞİNİ OKUMA ───
router.get('/content', (req, res) => {
    const { scenarioName, project } = req.query;
    const selectedProj = project || 'Proje Seçin';

    if (!scenarioName) return res.status(400).json({ error: "scenarioName parametresi zorunlu!" });

    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(baseScenariosFolder, selectedProj, `${sanitizedName}.json`);

    try {
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            const jsonData = JSON.parse(rawData);
            return res.json({ success: true, content: jsonData });
        } else {
            return res.status(404).json({ error: "Senaryo dosyası bulunamadı." });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
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
    const { project } = req.query;
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

        const logFileName = `${selectedProj}___REPORT-${sanitizedName}-${timestamp}.txt`; 
        const logContent = error 
            ? `❌ [TEST FAILED] - ${sanitizedName}\n================\n${stderr}\n\n${stdout}` 
            : `✅ [TEST SUCCESS] - ${sanitizedName}\n================\n${stdout}`;
        
        fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');
        const status = error ? 'FAILED' : 'SUCCESS';

        const insertQuery = `INSERT INTO reports (scenario_name, target_url, status, log_file_name) VALUES (?, ?, ?, ?)`;
        db.run(insertQuery, [sanitizedName, targetUrl, status, logFileName], (err) => {
            res.json({ scenario: scenarioName, status: error ? "failed" : "passed" });
        });
    });
});

// 🗑️ Senaryo Silme - Proje Destekli
router.post('/delete', (req, res) => {
    const { scenarioName, projectName } = req.body;
    const selectedProj = projectName || 'Auth Service';
    
    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(baseScenariosFolder, selectedProj, `${sanitizedName}.json`);

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return res.status(200).json({ success: true, status: "SUCCESS" });
        } else {
            return res.status(404).json({ error: "Senaryo dosyası bulunamadı" });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── 🆕 API: TOPLU VE SIRALI TEST ÇALIŞTIRMA (BATCH RUNNER) ───
router.post('/run-batch', async (req, res) => {
    const { scenarioNames, projectName } = req.body;
    const selectedProj = projectName || 'Proje Seçin';

    if (!scenarioNames || !Array.isArray(scenarioNames) || scenarioNames.length === 0) {
        return res.status(400).json({ error: "Çalıştırılacak senaryo dizisi eksik kanka!" });
    }

    console.log(`🚀 Toplu test akışı başladı! Toplam: ${scenarioNames.length} test sıralı koşturulacak.`);

    // İstek atan istemciyi (React) bekletmemek için testi arka planda başlatıp hemen yanıt dönüyoruz
    res.json({ success: true, message: `${scenarioNames.length} adet test arka planda sıralı olarak başlatıldı.` });

    // Arka planda sıralı çalıştırma döngüsü (Senkronize kuyruk mantığı)
    for (const scenarioName of scenarioNames) {
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
            console.warn(`[Batch Warning] ${sanitizedName} okunurken hata:`, readErr.message);
        }

        // Her bir testi Promise ile sararak sıralı (sequential) olmasını garanti ediyoruz kanka
        await new Promise((resolve) => {
            console.log(`⏳ Kuyruktaki Test Çalıştırılıyor: ${sanitizedName}`);
            
            exec(command, options, (error, stdout, stderr) => {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

                const logFileName = `${selectedProj}___REPORT-${sanitizedName}-${timestamp}.txt`; 
                const logContent = error 
                    ? `❌ [TEST FAILED] - ${sanitizedName}\n================\n${stderr}\n\n${stdout}` 
                    : `✅ [TEST SUCCESS] - ${sanitizedName}\n================\n${stdout}`;
                
                fs.writeFileSync(path.join(reportFolder, logFileName), logContent, 'utf-8');
                const status = error ? 'FAILED' : 'SUCCESS';

                const insertQuery = `INSERT INTO reports (scenario_name, target_url, status, log_file_name) VALUES (?, ?, ?, ?)`;
                db.run(insertQuery, [sanitizedName, targetUrl, status, logFileName], (err) => {
                    console.log(`🏁 Kuyruktaki Test Bitti: ${sanitizedName} -> Durum: ${status}`);
                    resolve(); // Döngünün bir sonraki elemana geçmesi için tetikliyoruz
                });
            });
        });
    }
});

export default router;