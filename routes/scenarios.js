import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const targetFolder = 'C:/Users/feyza/Desktop/test-tool/scenarios';

// 💾 1. Senaryoyu JSON olarak diske kaydeden endpoint
router.post('/save', (req, res) => {
    const { scenarioName, actionType, selector, value } = req.body;

    try {
        const steps = [];
        if (Array.isArray(actionType)) {
            for (let i = 0; i < actionType.length; i++) {
                steps.push({
                    type: actionType[i],
                    selector: selector[i] || "",
                    value: value[i] || ""
                });
            }
        } else {
            steps.push({ type: actionType, selector: selector || "", value: value || "" });
        }

        const jsonOutput = { scenarioName, steps };

        if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
        fs.writeFileSync(path.join(targetFolder, `${scenarioName}.json`), JSON.stringify(jsonOutput, null, 2), 'utf-8');

        res.send(`
            <body style="background: #1e1e1e; color: #4caf50; font-family: sans-serif; text-align: center; padding-top: 50px;">
                <h2>✅ Senaryo "${scenarioName}.json" Başarıyla Oluşturuldu!</h2>
                <a href="/create" style="color: #007acc; text-decoration: none; font-weight: bold;">[Yeni Senaryo Oluştur]</a>
            </body>
        `);
    } catch (error) {
        res.status(500).send(`❌ Hata: ${error.message}`);
    }
});

// 🔄 2. Klasördeki senaryoları listeleyen endpoint
router.get('/list', (req, res) => {
    try {
        if (!fs.existsSync(targetFolder)) return res.json([]);
        const files = fs.readdirSync(targetFolder);
        const scenarios = files
            .filter(file => path.extname(file).toLowerCase() === '.json')
            .map(file => path.basename(file, '.json'));
        res.json({ scenarios });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 🚀 3. n8n / Manuel tekil testi çalıştıran senkron endpoint
router.post('/run-single', (req, res) => {
    const { scenarioName } = req.body;
    if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli!" });

    const command = `npm run test:ai-local`;
    const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

    exec(command, options, (error, stdout, stderr) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFolder = 'C:/Users/feyza/Desktop/test-tool/reports';
        if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

        const logContent = error ? `❌ [HATA] ${stderr}` : `✅ [BAŞARILI]\n\n${stdout}`;
        fs.writeFileSync(path.join(reportFolder, `REPORT-${scenarioName}-${timestamp}.txt`), logContent, 'utf-8');

        return res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
    });
});

export default router;