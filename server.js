// server.js
import express from 'express';
import { exec } from 'child_process';

const app = express();
const PORT = 3000;

app.use(express.json());

// n8n'in güvenle tetikleyeceği endpoint
app.post('/api/run-test', (req, res) => {
    const { scenarioName } = req.body;
    
    if (!scenarioName) {
        return res.status(400).json({ error: "scenarioName gerekli!" });
    }

    // 💡 DEĞİŞİKLİK BURADA: cross-env komutunu tamamen kaldırdık, sadece düz npm script'ini çağırıyoruz
    const command = `npm run test:ai-local`;
    
    // Çevre değişkenini (SCENARIO_NAME) doğrudan Node.js'in alt sürecine (env) enjekte ediyoruz
    const options = {
        env: {
            ...process.env,            // Bilgisayarın mevcut tüm ortam değişkenlerini koru
            SCENARIO_NAME: scenarioName // Bizim dinamik senaryo adını araya ekle
        }
    };

    console.log(`🎬 ${scenarioName} senaryosu için Playwright testi tetikleniyor...`);

    // Testi güvenli options nesnesiyle ateşliyoruz
    exec(command, options, (error, stdout, stderr) => {
        if (error) {
            console.error(`[HATA] Test çalıştırılamadı: ${error.message}`);
            return;
        }
        console.log(`[BAŞARILI] Test çıktıları:\n${stdout}`);
    });

    res.json({ status: "Tetiklendi", message: `${scenarioName} testi arka planda başlatıldı.` });
});

app.listen(PORT, () => {
    console.log(`🚀 Güvenli Test API Sunucusu http://localhost:${PORT} üzerinde aktif!`);
});