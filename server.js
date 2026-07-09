
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONSTANTS } from './config/constants.js'; 
import scenarioRouter from './routes/scenarios.js';
import reportRoutes from './routes/reports.js';
import { translateToStagehandJson } from './utils/translator.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 🆕 OTOMATİK ÇEVİRİ VE KAYIT FONKSİYONU
 * Artık herhangi bir rotadan bunu çağırıp otomatik JSON oluşturabilirsin.
 */
export async function processAndSaveScenario(scenarioName, turkishInstructions, targetUrl) {
    const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
    if (!stagehandJson) throw new Error("Gemini çevirisi başarısız oldu.");
    stagehandJson.targetUrl = targetUrl;
    const dirPath = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER || 'scenarios');
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(dirPath, `${sanitizedName}.json`);
    
    fs.writeFileSync(filePath, JSON.stringify(stagehandJson, null, 2));
    return filePath;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/create-test', (req, res) => res.sendFile(path.join(__dirname, 'views', 'create-test.html')));

app.use('/api/scenarios', scenarioRouter);
app.use('/api/scenarios', reportRoutes);

app.listen(CONSTANTS.PORT, () => {
    console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
});