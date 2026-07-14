// // // import express from 'express';
// // // import path from 'path';
// // // import fs from 'fs';
// // // import { fileURLToPath } from 'url';
// // // import { CONSTANTS } from './config/constants.js'; 
// // // import scenarioRouter from './routes/scenarios.js';
// // // import reportRoutes from './routes/reports.js';
// // // import { translateToStagehandJson } from './utils/translator.js';
// // // import dpuScenariosRouter from './routes/dpuScenarios.js';

// // // const app = express();
// // // const __filename = fileURLToPath(import.meta.url);
// // // const __dirname = path.dirname(__filename);

// // // app.use(express.json());
// // // app.use(express.urlencoded({ extended: true }));

// // // // ─── 1. API ROTAlARI (Statik dosyalardan ÖNCE gelmeli) ───
// // // // app.use('/api/scenarios', scenarioRouter);
// // // app.use('/api/scenarios', dpuScenariosRouter);
// // // app.use('/api/scenarios', reportRoutes); // Rapor listesi /api/scenarios/api/reports/list yerine geçecek

// // // /**
// // //  * 🆕 OTOMATİK ÇEVİRİ VE KAYIT FONKSİYONU
// // //  */
// // // export async function processAndSaveScenario(scenarioName, turkishInstructions, targetUrl, projectName) {
// // //     const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
// // //     if (!stagehandJson) throw new Error("Gemini çevirisi başarısız oldu.");
// // //     stagehandJson.targetUrl = targetUrl;
// // //     const selectedProj = projectName || 'Proje Seçin';
// // //     const dirPath = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER || 'scenarios', selectedProj);
// // //     if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

// // //     const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
// // //     const filePath = path.join(dirPath, `${sanitizedName}.json`);
    
// // //     fs.writeFileSync(filePath, JSON.stringify(stagehandJson, null, 2));
// // //     return filePath;
// // // }

// // // // ─── 2. REACT BINDINGS (En Altta Olmalı) ───
// // // // React build (dist) klasörünü static olarak serve et
// // // app.use(express.static(path.join(process.cwd(), 'dist')));

// // // app.get(/^\/(.*)$/, (req, res) => {
// // //     res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
// // // });

// // // app.listen(CONSTANTS.PORT, () => {
// // //     console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
// // // });


// // import express from 'express';
// // import path from 'path';
// // import fs from 'fs';
// // import { fileURLToPath } from 'url';
// // import { CONSTANTS } from './config/constants.js'; 
// // import scenarioRouter from './routes/scenarios.js';
// // import reportRoutes from './routes/reports.js';
// // import { translateToStagehandJson } from './utils/translator.js';
// // import dpuScenariosRouter from './routes/dpuScenarios.js';

// // const app = express();
// // const __filename = fileURLToPath(import.meta.url);
// // const __dirname = path.dirname(__filename);

// // app.use(express.json());
// // app.use(express.urlencoded({ extended: true }));

// // // ─── 1. API ROTALARI (Statik dosyalardan ÖNCE gelmeli) ───
// // // app.use('/api/scenarios', scenarioRouter);
// // app.use('/api/scenarios', dpuScenariosRouter);
// // app.use('/api/reports', reportRoutes);

// // /**
// //  * 🆕 SADECE AI ÇEVİRİSİ YAPIP NET JSON DÖNEN YENİ FONKSİYON
// //  */
// // export async function translateScenario(turkishInstructions, targetUrl) {
// //     const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
// //     if (!stagehandJson) throw new Error("Gemini çevirisi başarısız oldu.");
// //     stagehandJson.targetUrl = targetUrl;
// //     return stagehandJson; // Dosyaya yazmıyor, sadece saf nesneyi dönüyor kanka!
// // }

// // /**
// //  * 🔄 ESKİ OTOMATİK ÇEVİRİ VE KAYIT FONKSİYONU (YENİ MEKANİZMAYI KULLANACAK ŞEKİLDE)
// //  */
// // export async function processAndSaveScenario(scenarioName, turkishInstructions, targetUrl, projectName) {
// //     // Yukarıda yazdığımız yeni bağımsız çeviri fonksiyonunu çağırıyoruz
// //     const stagehandJson = await translateScenario(turkishInstructions, targetUrl);
    
// //     const selectedProj = projectName || 'Proje Seçin';
// //     const dirPath = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER || 'scenarios', selectedProj);
// //     if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

// //     const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
// //     const filePath = path.join(dirPath, `${sanitizedName}.json`);
    
// //     fs.writeFileSync(filePath, JSON.stringify(stagehandJson, null, 2));
// //     return filePath;
// // }

// // // ─── 2. REACT BINDINGS (En Altta Olmalı) ───
// // // React build (dist) klasörünü static olarak serve et
// // app.use(express.static(path.join(process.cwd(), 'dist')));

// // app.get(/^\/(.*)$/, (req, res) => {
// //     res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
// // });

// // app.listen(CONSTANTS.PORT, () => {
// //     console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
// // });


// import express from 'express';
// import path from 'path';
// import fs from 'fs';
// import { fileURLToPath } from 'url';
// import { CONSTANTS } from './config/constants.js'; 
// import { translateToStagehandJson } from './utils/translator.js';

// const app = express();
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // ─── MIDDLEWARES (En üstte olmalı kanka!) ───
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// /**
//  * 🆕 SADECE AI ÇEVİRİSİ YAPIP NET JSON DÖNEN YENİ FONKSİYON
//  */
// export async function translateScenario(turkishInstructions, targetUrl) {
//     const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
//     if (!stagehandJson) throw new Error("Gemini çevirisi başarısız oldu.");
//     stagehandJson.targetUrl = targetUrl;
//     return stagehandJson;
// }

// /**
//  * 🔄 ESKİ OTOMATİK ÇEVİRİ VE KAYIT FONKSİYONU (YENİ MEKANİZMAYI KULLANACAK ŞEKİLDE)
//  */
// export async function processAndSaveScenario(scenarioName, turkishInstructions, targetUrl, projectName) {
//     const stagehandJson = await translateScenario(turkishInstructions, targetUrl);
//     const selectedProj = projectName || 'Proje Seçin';
//     const dirPath = path.join(process.cwd(), CONSTANTS.SCENARIOS_FOLDER || 'scenarios', selectedProj);
//     if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

//     const sanitizedName = scenarioName.replace(/[^a-zA-Z0-9_-]/g, '');
//     const filePath = path.join(dirPath, `${sanitizedName}.json`);
    
//     fs.writeFileSync(filePath, JSON.stringify(stagehandJson, null, 2));
//     return filePath;
// }

// // ─── ROTA IMPORTLARINI BURADA YAPIYORUZ (Sıralama Hatasını Önlemek İçin) ───
// import dpuScenariosRouter from './routes/dpuScenarios.js';
// import reportRoutes from './routes/reports.js';

// // ─── 1. API ROTALARI (Kesinlikle statik dosya sunumundan ÖNCE tanımlanmalı!) ───
// app.use('/api/scenarios', dpuScenariosRouter);
// app.use('/api/reports', reportRoutes);

// // ─── 2. STATIC FILES & REACT BINDINGS (En Altta Olmalı) ───
// app.use(express.static(path.join(process.cwd(), 'dist')));

// // API istekleri dışındaki tüm GET isteklerini React'a yönlendir kanka (API'leri yutmasın diye '/api' koruması ekledik)
// app.get(/^\/(?!api).*$/, (req, res) => {
//     res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
// });

// app.listen(CONSTANTS.PORT, () => {
//     console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
// });


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