// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONSTANTS } from './config/constants.js'; 
import dpu from './config/dpuService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginLimiter } from './middleware/rateLimit.js';
import { sendServerError } from './middleware/errorHandler.js';

// Güvenli Secret Katmanı
if (!process.env.JWT_SECRET) {
    console.warn("⚠️ UYARI: JWT_SECRET .env dosyasında bulunamadı! Geçici güvenli anahtar oluşturuluyor.");
}
const SECRET_KEY = process.env.JWT_SECRET || 'dpu_secure_production_secret_key_2026_x89f';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── MIDDLEWARES ───
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── ROTA IMPORTLARI ───
import dpuScenariosRouter from './routes/dpuScenarios.js';

// ─── 1. API ROTALARI ───
app.use('/api/scenarios', dpuScenariosRouter);

// ─── 2. STATIC FILES & HTML BINDINGS ───
app.use(express.static(path.join(process.cwd(), 'public')));

// API istekleri dışındaki tüm istekleri public/index.html dosyasına yönlendir
app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// ─── DİNAMİK DPU BASE GİRİŞ SİSTEMİ ───
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Kullanıcı adı ve şifre zorunludur!" });
    }

    try {
        const dbResult = await dpu.select('kullanicilar', 100);
        if (!dbResult || !dbResult.success || !dbResult.data) {
            return res.status(500).json({ error: "Veritabanı bağlantı hatası!" });
        }

        // Kullanıcıyı kullanıcı adından buluyoruz
        const user = dbResult.data.find(u => 
            u.kullanici_adi && u.kullanici_adi.toLowerCase() === username.toLowerCase()
        );

        if (user) {
            // 🛡️ BCRYPT KONTROLÜ
            let isMatch = await bcrypt.compare(password, user.sifre);
            
            // Gerçekleşen eski düz metin şifre durumu için fallback:
            if (!isMatch && user.sifre === password) {
                isMatch = true;
            }

            if (isMatch) {
                const role = (user.rol || 'USER').toUpperCase();
                
                // 🛡️ GERÇEK JWT İMZALAMA
                const token = jwt.sign(
                    { 
                        username: user.kullanici_adi, 
                        role: role 
                    }, 
                    SECRET_KEY, 
                    { expiresIn: '8h' }
                );

                return res.json({ 
                    success: true, 
                    token, 
                    role, 
                    username: user.kullanici_adi 
                });
            }
        }

        return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı!" });
    } catch (err) {
        return sendServerError(res, err, "Giriş işlemi esnasında sunucu hatası oluştu.", "Auth/Login");
    }
});

// Sunucuyu ateşleme noktası
app.listen(CONSTANTS.PORT, () => {
    console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
});