import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Login: Brute-force koruması.
// Üniversite/eduroam NAT'ı arkasında yüzlerce kullanıcı tek IP görünebilir; bu yüzden
//  1) asıl kota KULLANICI ADI başına (yalnızca BAŞARISIZ denemeler sayılır),
//  2) IP başına çok geniş bir tavan (toplu saldırı koruması) uygulanır.
const norm = (v) => String(v || '').trim().toLowerCase().slice(0, 60);
export const loginUserLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.LOGIN_MAX_FAILS_PER_USER) || 8,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `u:${norm(req.body?.username) || ipKeyGenerator(req.ip)}`,
    message: { error: "Bu hesap için çok fazla hatalı giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyin." },
});
export const loginIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.LOGIN_MAX_PER_IP) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: { error: "Bu ağdan çok fazla giriş isteği geldi. Lütfen biraz sonra tekrar deneyin." },
});
// Geriye dönük uyumluluk için birleşik middleware
export const loginLimiter = [loginIpLimiter, loginUserLimiter];

// AI çağıran endpoint'ler
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
        return ipKeyGenerator(req.ip);
    },
    message: { error: "Bu saat için AI istek limitine ulaşıldı. Lütfen daha sonra tekrar deneyin." },
});

// Test çalıştırma endpoint'leri
export const testRunLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        if (req.user && req.user.username) {
            return `user:${req.user.username}`;
        }
        return ipKeyGenerator(req.ip);
    },
    message: { error: "Çok sık test tetikleme isteği. Lütfen bir dakika bekleyin." },
});