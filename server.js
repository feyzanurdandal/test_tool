// // server.js
// import express from 'express';
// import { exec } from 'child_process';
// import fs from 'fs';
// import path from 'path';

// const app = express();
// const PORT = 3000;

// app.use(express.json());

// // Klasördeki test senaryolarını listeleyen endpoint (n8n JavaScript nodu için)
// app.get('/api/list-scenarios', (req, res) => {
//     const targetFolder = 'C:/Users/feyza/Desktop/test-tool/scenarios';
//     try {
//         if (!fs.existsSync(targetFolder)) return res.json([]);
//         const files = fs.readdirSync(targetFolder);
//         const scenarios = files
//             .filter(file => path.extname(file).toLowerCase() === '.json')
//             .map(file => path.basename(file, '.json'));
//         res.json({ scenarios });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// // 🚀 n8n DÖNGÜSÜ İÇİN KRİTİK ENDPOINT: Test biter, çıktıları n8n'e teslim eder!
// app.post('/api/run-single-sync', (req, res) => {
//     const { scenarioName } = req.body;

//     if (!scenarioName) {
//         return res.status(400).json({ error: "scenarioName gerekli kanka!" });
//     }

//     console.log(`🎬 [DÖNGÜ] ${scenarioName} testi başladı. n8n bekletiliyor...`);
    
//     const command = `npm run test:ai-local`;
//     const options = {
//         env: { ...process.env, SCENARIO_NAME: scenarioName }
//     };

//     // exec ile testi koşturuyoruz
//     exec(command, options, (error, stdout, stderr) => {
//         // Test bittiğinde n8n'e verilecek çıktı paketini hazırlıyoruz
//         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//         const reportFolder = 'C:/Users/feyza/Desktop/test-tool/reports';
        
//         // Klasör yoksa oluştur
//         if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

//         const logContent = error 
//             ? `❌ [HATA] ${error.message}\n\n[DETAY]\n${stderr}` 
//             : `✅ [BAŞARILI]\n\n[ÇIKTI]\n${stdout}`;

//         // 1. Manuel Dosya Yedekleme: Sonuçları bilgisayara da TXT olarak yazalım 
//         fs.writeFileSync(path.join(reportFolder, `REPORT-${scenarioName}-${timestamp}.txt`), logContent, 'utf-8');

//         // 2. n8n'e Cevap Dönme: n8n bu JSON'ı alıp döngüde kullanacak
//         return res.json({
//             scenario: scenarioName,
//             status: error ? "BAŞARISIZ" : "BAŞARILI",
//             executionTime: timestamp,
//             terminalOutput: stdout || stderr
//         });
//     });
// });

// app.listen(PORT, () => {
//     console.log(`Test API Sunucusu http://localhost:${PORT} üzerinde aktif!`);
// });

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import scenarioRouter from './routes/scenarios.js';

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🎨 HTML Form Sayfasını Doğrudan Sunan Rota
app.get('/create', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'create.html'));
});

// 🛣️ Tüm API İsteklerini Yeni Router'a Devrediyoruz
app.use('/api/scenarios', scenarioRouter);

app.listen(PORT, () => {
    console.log(`🚀 Kurumsal Mimari Sunucusu http://localhost:${PORT}/create üzerinde aktif!`);
});