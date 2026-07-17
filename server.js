// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONSTANTS } from './config/constants.js'; 
import { translateToStagehandJson } from './utils/translator.js';
import crypto from 'crypto';
import dpu from './config/dpuService.js';

const SECRET_KEY = 'djheschoeschsojcosdj'; // Sadece backend'in bildiği anahtar

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


// ─── DİNAMİK DPU BASE GİRİŞ SİSTEMİ ───
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Kullanıcı adı ve şifre zorunludur!" });
    }

    try {
        // DPU Base kullanicilar tablosundan kullanıcıyı çekiyoruz
        const dbResult = await dpu.select('kullanicilar', 100);
        if (!dbResult.success || !dbResult.data) {
            return res.status(500).json({ error: "Veritabanı bağlantı hatası!" });
        }

        // Kullanıcı adı ve şifre eşleştirmesi (Bellekte güvenli filtreleme)
        const user = dbResult.data.find(u => 
            u.kullanici_adi.toLowerCase() === username.toLowerCase() && 
            u.sifre === password
        );

        if (user) {
            const role = user.rol.toUpperCase(); // ADMIN veya PM
            
            // Kriptografik imza (Her zamanki gibi kurşun geçirmez!)
            const signature = crypto.createHmac('sha256', SECRET_KEY)
                                    .update(`${user.kullanici_adi}:${role}`)
                                    .digest('hex');
            
            const token = `${user.kullanici_adi}:${role}:${signature}`;

            return res.json({ 
                success: true, 
                token, 
                role, 
                username: user.kullanici_adi 
            });
        }

        return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı!" });
    } catch (err) {
        console.error("Giriş hatası:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// Sunucuyu ateşleme noktası
app.listen(CONSTANTS.PORT, () => {
    console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
});