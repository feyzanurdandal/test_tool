// Ortam değişkenlerini yükler ve zorunlu olanları doğrular (fail-fast).
// server.js'in İLK import'u olmalıdır; diğer modüller process.env'i yükleme
// anında okuduğu için sıralama önemlidir.
import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = ['JWT_SECRET', 'ENCRYPTION_KEY'];
const missingVars = requiredEnvVars.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missingVars.length > 0) {
    console.error('Ortam değişkenleri eksik!');
    console.error(`Eksik Değişkenler: ${missingVars.join(', ')}`);
    console.error('Lütfen .env dosyanızı kontrol edin ve zorunlu anahtarları tanımlayın.');
    process.exit(1);
}

// ENCRYPTION_KEY: 64 hex karakter (32 byte, AES-256)
if (!/^[a-fA-F0-9]{64}$/.test(process.env.ENCRYPTION_KEY)) {
    console.error('GÜVENLİK HATASI: ENCRYPTION_KEY formatı geçersiz!');
    console.error('ENCRYPTION_KEY 64 karakterlik hex string olmalıdır (Örn: openssl rand -hex 32).');
    process.exit(1);
}

const dpuVars = ['DPU_BASE_URL', 'DPU_API_KEY', 'DPU_PROJECT_CODE', 'DPU_USER_EMAIL', 'DPU_USER_PASSWORD'];
const missingDpu = dpuVars.filter((key) => !process.env[key]);
if (missingDpu.length > 0) {
    console.warn(`UYARI: DPU Base bağlantı değişkenleri eksik: ${missingDpu.join(', ')}`);
}

if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET;
    if (secret.length < 32 || new Set(secret).size < 10 || /your_|test-secret|change.?me|placeholder/i.test(secret)) {
        console.error('Production JWT_SECRET güçlü ve rastgele olmalıdır (en az 32 karakter).');
        process.exit(1);
    }
    if (missingDpu.length) {
        console.error('Production DPU bağlantı ayarları zorunludur.');
        process.exit(1);
    }
    try {
        const base = new URL(process.env.DPU_BASE_URL);
        if (base.protocol !== 'https:' || base.username || base.password) throw new Error();
    } catch {
        console.error('Production DPU_BASE_URL kimlik bilgisi içermeyen HTTPS adresi olmalıdır.');
        process.exit(1);
    }
}

export const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: Number(process.env.PORT) || 3000,
    JWT_SECRET: process.env.JWT_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    // Aynı anda koşan test sayısı. Her test ≈ 0,7-1 GB RAM ve ≈ 0,5-1 çekirdek kullanır;
    // varsayılan 2 küçük sunucular için bilinçli olarak düşük tutulmuştur (fazlası sırada bekler).
    RUN_CONCURRENCY: Math.max(1, Number(process.env.RUN_CONCURRENCY) || 2),
    MAX_QUEUED_RUNS: Math.max(1, Number(process.env.MAX_QUEUED_RUNS) || 200),
    // Toplu çalıştırma tek istekte en fazla 50 senaryo alır; kullanıcı başına sınır buna uygun olmalıdır.
    MAX_QUEUED_PER_USER: Math.max(1, Number(process.env.MAX_QUEUED_PER_USER) || 50),
    RECORD_MAX: Math.max(1, Number(process.env.RECORD_MAX) || 2),
    COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
};

export default env;
