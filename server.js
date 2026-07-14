import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONSTANTS } from './config/constants.js'; 
import { translateToStagehandJson } from './utils/translator.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── MIDDLEWARES ───
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 🆕 SADECE AI ÇEVİRİSİ YAPIP NET JSON DÖNEN YENİ FONKSİYON
 */
export async function translateScenario(turkishInstructions, targetUrl) {
    const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
    if (!stagehandJson) throw new Error("Gemini çevirisi başarısız oldu.");
    stagehandJson.targetUrl = targetUrl;
    return stagehandJson;
}

/**
 * 🔄 ESKİ OTOMATİK ÇEVİRİ VE KAYIT FONKSİYONU (YENİ MEKANİZMAYI KULLANACAK ŞEKİLDE)
 */
export async function processAndSaveScenario(scenarioName, turkishInstructions, targetUrl, projectName) {
    const stagehandJson = await translateScenario(turkishInstructions, targetUrl);
    const selectedProj = projectName || 'Proje Seçin';
    const dirPath = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER || 'scenarios', selectedProj);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(dirPath, `${sanitizedName}.json`);
    
    fs.writeFileSync(filePath, JSON.stringify(stagehandJson, null, 2));
    return filePath;
}

// ─── ROTA IMPORTLARI ───
import dpuScenariosRouter from './routes/dpuScenarios.js';
import reportRoutes from './routes/reports.js';

// ─── 1. API ROTALARI ───
app.use('/api/scenarios', dpuScenariosRouter);
app.use('/api/reports', reportRoutes);

// ─── 2. STATIC FILES & HTML BINDINGS (YENİ SAF VANILLA JS DÜNYASI) ───
// Eskiden 'dist' klasörünü serve ediyorduk, artık yeni 'public' klasörümüz aktif!
app.use(express.static(path.join(process.cwd(), 'public')));

// API istekleri dışındaki tüm istekleri bizim public/index.html dosyamıza yönlendir kanka
app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(CONSTANTS.PORT, () => {
    console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
});