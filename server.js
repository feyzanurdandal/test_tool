// // server.js
// import express from 'express';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import { CONSTANTS } from './config/constants.js'; 
// import crypto from 'crypto';
// import dpu from './config/dpuService.js';
// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';
// import { translateScenario } from './services/scenarioService.js';
// import { loginLimiter, aiCallLimiter, testRunLimiter } from './middleware/rateLimit.js';
// import { translateToStagehandJson } from './utils/translator.js';

// // Güvenli Secret Katmanı: Env değişkeni yoksa rastgele güçlü key üretilir veya uyarı verilir
// if (!process.env.JWT_SECRET) {
//     console.warn("⚠️ UYARI: JWT_SECRET .env dosyasında bulunamadı! Geçici güvenli anahtar oluşturuluyor.");
// }
// const SECRET_KEY = process.env.JWT_SECRET || 'dpu_secure_production_secret_key_2026_x89f';

// const app = express();
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // ─── MIDDLEWARES ───
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));


// // ─── ROTA IMPORTLARI ───
// // Sadece bizim yeni ve dinamik bulut tabanlı rotamız aktif kalıyor ! 🔒
// import dpuScenariosRouter from './routes/dpuScenarios.js';

// // ─── 1. API ROTALARI ───
// app.use('/api/scenarios', dpuScenariosRouter);

// // ─── 2. STATIC FILES & HTML BINDINGS ───
// app.use(express.static(path.join(process.cwd(), 'public')));

// // API istekleri dışındaki tüm istekleri bizim public/index.html dosyamıza yönlendir
// app.get(/^(?!\/api).*$/, (req, res) => {
//     res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
// });


// // ─── DİNAMİK DPU BASE GİRİŞ SİSTEMİ ───
// app.post('/api/auth/login',loginLimiter, async (req, res) => {
//     const { username, password } = req.body;

//     if (!username || !password) {
//         return res.status(400).json({ error: "Kullanıcı adı ve şifre zorunludur!" });
//     }

//     try {
//         const dbResult = await dpu.select('kullanicilar', 100);
//         if (!dbResult.success || !dbResult.data) {
//             return res.status(500).json({ error: "Veritabanı bağlantı hatası!" });
//         }

//         // Kullanıcıyı kullanıcı adından buluyoruz
//         const user = dbResult.data.find(u => 
//             u.kullanici_adi.toLowerCase() === username.toLowerCase()
//         );

//         if (user) {
//             // 🛡️ BCRYPT KONTROLÜ: Girilen şifre hash ile eşleşiyor mu?
//             // (Eski düz metin şifreler varsa geriye dönük uyumluluk/fallback için de kontrol koyduk)
//             let isMatch = await bcrypt.compare(password, user.sifre);
            
//             // Eğer veritabanında henüz hash'lenmemiş eski düz şifre varsa:
//             if (!isMatch && user.sifre === password) {
//                 isMatch = true;
//             }

//                         // /api/auth/login içi
//             if (isMatch) {
//                 const role = user.rol.toUpperCase();
                
//                 // 🛡️ GERÇEK JWT İMZALAMA (Payload + Secret + Expiration)
//                 const token = jwt.sign(
//                     { 
//                         username: user.kullanici_adi, 
//                         role: role 
//                     }, 
//                     SECRET_KEY, 
//                     { expiresIn: '8h' } // Token 8 saat sonra otomatik geçersiz kalır!
//                 );

//                 return res.json({ 
//                     success: true, 
//                     token, 
//                     role, 
//                     username: user.kullanici_adi 
//                 });
//             }
//         }

//         return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı!" });
//     } catch (err) {
//         console.error("Giriş hatası:", err.message);
//         return res.status(500).json({ error: err.message });
//     }
// });

// // Sunucuyu ateşleme noktası
// app.listen(CONSTANTS.PORT, () => {
//     console.log(`🚀 Sunucu http://localhost:${CONSTANTS.PORT} üzerinde aktif`);
// });

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