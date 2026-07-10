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

    // routes/scenarios.js içindeki executeTest fonksiyonunun içi
exec(command, options, (error, stdout, stderr) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

    // 🚀 DOSYA ADINA PROJE ETİKETİNİ EKLEDİK:
    const pureLogName = `REPORT-${sanitizedName}-${timestamp}.txt`;
    const logFileName = `${selectedProj}___${pureLogName}`; 
    
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

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.status(200).json({ status: "SUCCESS" });
    } else {
        res.status(404).json({ error: "Dosya bulunamadı" });
    }
});

export default router;