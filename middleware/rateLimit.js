import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// 🔒 Login: Brute-force koruması
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Çok fazla giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin." },
});

// 💰 AI çağıran endpoint'ler
export const aiCallLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        // Eğer kullanıcı giriş yapmışsa kullanıcı adına göre kısıtla
        if (req.user && req.user.username) {
            return `user:${req.user.username}`;
        }
        // Giriş yapmamışsa IPv4/IPv6 güvenli IP anahtarlayıcısını kullan
        return ipKeyGenerator(req, res);
    },
    message: { error: "Bu saat için AI istek limitine ulaşıldı. Lütfen daha sonra tekrar deneyin." },
});

// 🧪 Test koşturma endpoint'leri
export const testRunLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        if (req.user && req.user.username) {
            return `user:${req.user.username}`;
        }
        return ipKeyGenerator(req, res);
    },
    message: { error: "Çok sık test tetikleme isteği. Lütfen bir dakika bekleyin." },
});