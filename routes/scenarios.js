import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CONSTANTS } from '../config/constants.js';

const router = express.Router();
const targetFolder = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER);
const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER);

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

// 🚀 3. Testi Tetikleyen ve Temiz .txt Raporu Basan Endpoint
router.post('/run-single', (req, res) => {
    const { scenarioName } = req.body;
    if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli " });

    const command = `npm run test:ai-local`;
    const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

    exec(command, options, (error, stdout, stderr) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

        const logContent = error 
            ? `❌ [TEST FAILED] - ${scenarioName}\n=====================================\n${stderr}\n\n${stdout}` 
            : `✅ [TEST SUCCESS] - ${scenarioName}\n=====================================\n${stdout}`;
        
        fs.writeFileSync(path.join(reportFolder, `REPORT-${scenarioName}-${timestamp}.txt`), logContent, 'utf-8');

        return res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
    });
});

export default router;