// server.js
import express from 'express';
import path from 'path';
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
 * SADECE AI ÇEVİRİSİ YAPIP NET JSON DÖNEN YENİ FONKSİYON
 */
export async function translateScenario(turkishInstructions, targetUrl) {
    const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
    if (!stagehandJson) throw new Error("Yapay zeka çevirisi başarısız oldu.");
    stagehandJson.targetUrl = targetUrl;
    return stagehandJson;
}

// ─── ROTA IMPORTLARI ───
// Sadece bizim yeni ve dinamik bulut tabanlı rotamız aktif kalıyor kanka! 🔒
import dpuScenariosRouter from './routes/dpuScenarios.js';

// ─── 1. API ROTALARI ───
app.use('/api/scenarios', dpuScenariosRouter);

// ─── 2. STATIC FILES & HTML BINDINGS ───
app.use(express.static(path.join(process.cwd(), 'public')));

// API istekleri dışındaki tüm istekleri bizim public/index.html dosyamıza yönlendir
app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Sunucuyu ateşleme noktası
app.listen(CONSTANTS.PORT, () => {
    console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
});