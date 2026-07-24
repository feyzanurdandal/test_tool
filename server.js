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
import './config/env.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Güvenli Secret Katmanı
if (!process.env.JWT_SECRET) {
    console.error("GÜVENLİK HATASI: .env dosyasında JWT_SECRET tanımlı değil!");
    console.error("Lütfen .env dosyanıza güçlü bir JWT_SECRET ekleyin ve sunucuyu yeniden başlatın.");
    process.exit(1); // Sunucuyu durdur
}
const SECRET_KEY = process.env.JWT_SECRET;

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

// 🏥 HEALTH-CHECK ENDPOINT'İ (Sistem ve Veritabanı Sağlık Kontrolü)
app.get('/api/health', async (req, res) => {
    const healthStatus = {
        status: 'UP',
        timestamp: new Date().toISOString(),
        services: {
            server: 'HEALTHY',
            database: 'UNKNOWN'
        }
    };

    try {
        // DPU Base servisine hızlı bir bağlantı testi atıyoruz
        const dbCheck = await dpu.select('projeler', 1);
        if (dbCheck && dbCheck.success) {
            healthStatus.services.database = 'HEALTHY';
            return res.status(200).json(healthStatus);
        } else {
            healthStatus.status = 'DEGRADED';
            healthStatus.services.database = 'UNHEALTHY';
            return res.status(503).json(healthStatus);
        }
    } catch (err) {
        healthStatus.status = 'DOWN';
        healthStatus.services.database = 'DOWN';
        healthStatus.error = err.message;
        return res.status(500).json(healthStatus);
    }
});

// ─── DİNAMİK DPU BASE GİRİŞ SİSTEMİ ───
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Kullanıcı adı ve şifre zorunludur!" });
    }

    try {
        const dbResult = await dpu.selectAll('kullanicilar');
        if (!dbResult || !dbResult.success || !dbResult.data) {
            return res.status(500).json({ error: "Veritabanı bağlantı hatası!" });
        }

        // Kullanıcıyı kullanıcı adından buluyoruz
        const user = dbResult.data.find(u => 
            u.kullanici_adi && u.kullanici_adi.toLowerCase() === username.toLowerCase()
        );

        if (user) {
            // BCRYPT KONTROLÜ
            const isMatch = await bcrypt.compare(password, user.sifre);

            if (isMatch) {
                const role = (user.rol || 'USER').toUpperCase();
                
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

// 1. Tanımlanmamış rotalara atılan istekleri yakalamak için (404 Handler)
app.use(notFoundHandler);

// 2. Tüm catch(err) bloklarında next(err) dendiğinde hataları yakalayan merkezi sistem
app.use(globalErrorHandler);

// Sunucuyu ateşleme noktası
app.listen(CONSTANTS.PORT, () => {
    console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
});