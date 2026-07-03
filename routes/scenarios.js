// import express from 'express';
// import { exec } from 'child_process';
// import fs from 'fs';
// import path from 'path';

// const router = express.Router();
// const targetFolder = 'C:/Users/feyza/Desktop/test-tool/scenarios';

// // 💾 1. n8n'den gelen Yeni Stagehand Formatını Diske Kaydeden Endpoint
// router.post('/save', (req, res) => {
//     const { scenarioName, steps } = req.body;
//     if (!scenarioName || !steps) {
//         return res.status(400).json({ error: "Gerekli veriler eksik kanka!" });
//     }
//     try {
//         const jsonOutput = { scenarioName, steps };
//         if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
//         fs.writeFileSync(path.join(targetFolder, `${scenarioName}.json`), JSON.stringify(jsonOutput, null, 2), 'utf-8');
//         res.status(200).json({ status: "SUCCESS", message: "Kaydedildi kanka!" });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// // 🔍 2. Eksik Olan Listeleme Endpoint'i (Şu an n8n'in arayıp bulamadığı yer)
// router.get('/list', (req, res) => {
//     try {
//         if (!fs.existsSync(targetFolder)) return res.json({ scenarios: [] });
//         const files = fs.readdirSync(targetFolder);
//         const scenarios = files
//             .filter(file => path.extname(file).toLowerCase() === '.json')
//             .map(file => path.basename(file, '.json'));
//         res.json({ scenarios }); // n8n'e diziyi nesne içinde fırlatıyoruz
//     } catch (error) { 
//         res.status(500).json({ error: error.message }); 
//     }
// });

// // // 🚀 3. Eksik Olan Test Tetikleme Endpoint'i
// // router.post('/run-single', (req, res) => {
// //     const { scenarioName } = req.body;
// //     if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli!" });

// //     const command = `npm run test:ai-local`;
// //     const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

// //     exec(command, options, (error, stdout, stderr) => {
// //         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
// //         const reportFolder = 'C:/Users/feyza/Desktop/test-tool/reports';
// //         if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

// //         const logContent = error ? `❌ [HATA] ${stderr}` : `✅ [BAŞARILI]\n\n${stdout}`;
// //         fs.writeFileSync(path.join(reportFolder, `REPORT-${scenarioName}-${timestamp}.txt`), logContent, 'utf-8');

// //         return res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
// //     });
// // });

// // 🚀 3. Şablonu Bağımsız HTML Dosyasından Çeken Gelişmiş Test Tetikleme Endpoint'i
// router.post('/run-single', (req, res) => {
//     const { scenarioName } = req.body;
//     if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli kanka!" });

//     const command = `npm run test:ai-local`;
//     const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

//     // Testi arka planda ateşliyoruz
//     exec(command, options, (error, stdout, stderr) => {
//         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
//         const reportFolder = 'C:/Users/feyza/Desktop/test-tool/reports';
//         const templatePath = 'C:/Users/feyza/Desktop/test-tool/views/report-template.html';
        
//         if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

//         // Testin durum parametrelerini hazırlayalım kanka
//         const isSuccess = !error;
//         const statusText = isSuccess ? "BAŞARILI" : "BAŞARISIZ";
//         const statusColor = isSuccess ? "#4caf50" : "#f44336";
//         const summaryText = isSuccess 
//             ? "Harika! Test senaryosundaki tüm ucu açık adımlar yapay zeka tarafından başarıyla icra edildi ve hiçbir hata fırlatılmadı kanka." 
//             : "Dikkat! Test adımları koşturulurken teknik bir aksaklık veya timeout sınırı aşıldı. Detaylar aşağıda maskelenmiştir kanka.";
//         const logs = (stdout || "") + (stderr || "");

//     try {
//     // Şablonu diskten oku
//     let htmlTemplate = fs.readFileSync(templatePath, 'utf-8');

//     // ✏️ CSS kurallarını bozmayan pürüzsüz düz metin yer değiştirmeleri
//     htmlTemplate = htmlTemplate
//         .replace(/SCENARIO_NAME_PLACEHOLDER/g, scenarioName)
//         .replace(/STATUS_TEXT_PLACEHOLDER/g, statusText)
//         .replace(/DATE_PLACEHOLDER/g, new Date().toLocaleString('tr-TR'))
//         .replace(/SUMMARY_TEXT_PLACEHOLDER/g, summaryText)
//         .replace(/TECHNICAL_LOGS_PLACEHOLDER/g, logs);

//     // 🎨 CSS Renk enjeksiyonlarını inline style kurallarını tam ezerek yapıyoruz kanka
//     htmlTemplate = htmlTemplate
//         .replace(/background: #3e3e42; color: white;/g, `background: ${statusColor}; color: white;`)
//         .replace(/border-left: 4px solid #3e3e42;/g, `border-left: 4px solid ${statusColor};`)
//         .replace(/color: #007acc;/g, `color: ${statusColor};`);

//     // Nihai HTML raporunu diske yaz
//     const reportPath = path.join(reportFolder, `REPORT-${scenarioName}-${timestamp}.html`);
//     fs.writeFileSync(reportPath, htmlTemplate, 'utf-8');

//     return res.json({ scenario: scenarioName, status: statusText });

//     } catch (templateError) {
//     console.error("Şablon işleme hatası kanka:", templateError);
//     const fallbackPath = path.join(reportFolder, `REPORT-${scenarioName}-${timestamp}.txt`);
//     fs.writeFileSync(fallbackPath, logs, 'utf-8');
//     return res.status(500).json({ error: "Rapor basılırken teknik şablon hatası oluştu!" });
//     }
//     });
// });

// export default router;


import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const targetFolder = 'C:/Users/feyza/Desktop/test-tool/scenarios';

// 💾 1. Tam Uyumlu Stagehand Formatını Olduğu Gibi Diske Kaydeden Endpoint
router.post('/save', (req, res) => {
    // n8n'den gelen paketimizi doğrudan yakalıyoruz kanka
    const { scenarioName, targetUrl, steps } = req.body;

    if (!scenarioName || !targetUrl || !steps) {
        return res.status(400).json({ error: "Gerekli veriler (scenarioName, targetUrl veya steps) eksik kanka!" });
    }

    try {
        // Tam senin attığın mimari yapıda JSON dosyasını paketliyoruz
        const jsonOutput = {
            targetUrl: targetUrl,
            steps: steps // İçinde ekstra 'step: 1' numaraları olmayan, sadece type ve instruction içeren saf dizi
        };

        if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
        }

        // JSON dosyasını senaryo adıyla diske yazıyoruz
        fs.writeFileSync(
            path.join(targetFolder, `${scenarioName}.json`), 
            JSON.stringify(jsonOutput, null, 2), 
            'utf-8'
        );

        res.status(200).json({ status: "SUCCESS", message: `Scenario ${scenarioName}.json successfully saved kanka!` });

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
    if (!scenarioName) return res.status(400).json({ error: "scenarioName gerekli kanka!" });

    const command = `npm run test:ai-local`;
    const options = { env: { ...process.env, SCENARIO_NAME: scenarioName } };

    exec(command, options, (error, stdout, stderr) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFolder = 'C:/Users/feyza/Desktop/test-tool/reports';
        if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder, { recursive: true });

        // Düz metin (.txt) olarak temiz hata ve başarı logları
        const logContent = error 
            ? `❌ [TEST FAILED] - ${scenarioName}\n=====================================\n${stderr}\n\n${stdout}` 
            : `✅ [TEST SUCCESS] - ${scenarioName}\n=====================================\n${stdout}`;
        
        fs.writeFileSync(path.join(reportFolder, `REPORT-${scenarioName}-${timestamp}.txt`), logContent, 'utf-8');

        return res.json({ scenario: scenarioName, status: error ? "BAŞARISIZ" : "BAŞARILI" });
    });
});


// 📂 Dinamik Rapor Listeleme ve Esnek Log Temizleme Arayüzü
router.get('/reports-panel', (req, res) => {
    const reportFolder = 'C:/Users/feyza/Desktop/test-tool/reports';
    const viewPath = path.join(process.cwd(), 'views', 'reports-panel.html');
    
    if (!fs.existsSync(viewPath)) return res.send("<h3>❌ views/reports-panel.html dosyası bulunamadı kanka!</h3>");
    const baseLayout = fs.readFileSync(viewPath, 'utf-8');

    // 1. DURUM: DETAY SAYFASI GÖRÜNÜMÜ
    if (req.query.file) {
        const filePath = path.join(reportFolder, req.query.file);
        if (!fs.existsSync(filePath)) return res.send("<h3>❌ Rapor dosyası bulunamadı kanka!</h3>");

        const rawContent = fs.readFileSync(filePath, 'utf-8');

        const isSuccess = rawContent.includes('✅ [TEST SUCCESS]');
        const status = isSuccess ? "✅ BAŞARILI" : "❌ BAŞARISIZ";
        const cardClass = isSuccess ? "success" : "error";
        
        const summaryMatch = rawContent.match(/\d+ passed \(.+\)/);
        const summary = summaryMatch ? summaryMatch[0] : "Süre/Özet bilgisi alınamadı.";

        // 🧠 ZENGİNLEŞTİRİLMİŞ METRİKLER (Regex Avcıları)
        const urlMatch = rawContent.match(/Target URL\s*:\s*(.+)/i) || rawContent.match(/URL\s*->\s*(.+)/);
        const modelMatch = rawContent.match(/Model\s*:\s*([\w-]+)/i) || rawContent.match(/LLM\s*:\s*([\w-]+)/i);
        
        // Hata ayıklama: Eğer test patladıysa logun içindeki ilk "Error:" satırını ve devamını yakalar
        const errorMatch = rawContent.match(/(Error:[\s\S]{1,150})/i) || rawContent.match(/(Patladı:[\s\S]{1,150})/i);

        let extractedDataHtml = "";

        // 🎯 Sabit kurumsal metrikleri listenin başına şıkça ekliyoruz
        if (urlMatch) extractedDataHtml += `<div class="data-item">🌐 <strong>Hedef URL:</strong> <a href="${urlMatch[1].trim()}" target="_blank">${urlMatch[1].trim()}</a></div>`;
        if (modelMatch) extractedDataHtml += `<div class="data-item">🤖 <strong>Kullanılan LLM:</strong> <code>${modelMatch[1].trim()}</code></div>`;
        
        // Eğer test başarısızsa hata detayını kırmızı/uyarı tarzında enjekte edelim
        if (!isSuccess && errorMatch) {
            extractedDataHtml += `
                <div class="data-item" style="background: #fff3f3; border: 1px solid #f5c6cb; padding: 10px; border-radius: 5px; color: #721c24; margin-top: 10px;">
                    🚨 <strong>Kritik Hata Detayı:</strong> <br><pre style="margin: 5px 0; font-size: 13px; white-space: pre-wrap;">${errorMatch[1].trim()}...</pre>
                </div>
            `;
        }

        extractedDataHtml += `<hr style="border: 0; border-top: 1px dashed #ccc; margin: 15px 0;">`;

        // 🔍 Dinamik olarak siber/QA verilerini toplama
        const extractedMatches = [...rawContent.matchAll(/\*\*\* \[BAŞARIYLA AYIKLANDI\] (\w+) -> (.+)/g)];
        
        if (extractedMatches.length > 0) {
            extractedMatches.forEach(match => {
                extractedDataHtml += `<div class="data-item">🔹 <strong>${match[1]}:</strong> ${match[2]}</div>`;
            });
        } else {
            extractedDataHtml += `<div style="color: #888; font-style: italic;">Bu test adımında ek bir veri ayıklanmadı.</div>`;
        }

        // Sadece Detay HTML içeriğini hazırlıyoruz
        const detailHtml = `
            <h2>📊 Test Sonuç Özeti</h2>
            <hr>
            <div class="card ${cardClass}">
                <div class="data-item"><strong>📋 Senaryo Durumu:</strong> ${status}</div>
                <div class="data-item"><strong>⏱️ Özet & Süre:</strong> ${summary}</div>
                <h3 style="margin-top: 20px; color: #555;">🔍 Detaylı Rapor Metrikleri:</h3>
                ${extractedDataHtml}
            </div>
            <br>
            <a href="http://localhost:5678/webhook/reports-viewer" class="btn-back">⬅️ Listeye Geri Dön</a>
        `;

        // Ana şablonun içine basıyoruz
        return res.send(baseLayout.replace('', detailHtml));
    }

    // 2. DURUM: GENEL LİSTELEME GÖRÜNÜMÜ
    if (!fs.existsSync(reportFolder)) {
        return res.send(baseLayout.replace('', "<h3>📂 Henüz hiç rapor oluşturulmamış kanka!</h3>"));
    }

    const files = fs.readdirSync(reportFolder).filter(f => f.endsWith('.txt'));
    let optionsHtml = files.map(f => `<option value="${f}">${f}</option>`).join('');

    const listHtml = `
        <h2>📁 Güncel Test Raporları Paneli</h2>
        <p>Lütfen özetini görmek istediğiniz detaylı <code>.txt</code> raporunu seçin kanka:</p>
        <form action="http://localhost:5678/webhook/reports-viewer" method="GET">
            <select name="file">
                ${optionsHtml}
            </select>
            <button type="submit">🔍 Raporu Özetle</button>
        </form>
    `;

    return res.send(baseLayout.replace('', listHtml));
});

export default router;