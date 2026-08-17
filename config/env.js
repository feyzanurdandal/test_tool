// import dotenv from 'dotenv';
// import path from 'path';

// dotenv.config();

// /**
//  * Zorunlu ortam değişkenlerini kontrol eder.
//  * Eksik değişken varsa uygulamanın çalışmasını anında durdurur (Fail-Fast).
//  */
// const requiredEnvVars = ['JWT_SECRET', 'ENCRYPTION_KEY'];

// const missingVars = requiredEnvVars.filter((key) => !process.env[key] || process.env[key].trim() === '');

// if (missingVars.length > 0) {
//     console.error('Ortam değişkenleri eksik!');
//     console.error(`Eksik Değişkenler: ${missingVars.join(', ')}`);
//     console.error('Lütfen .env dosyanızı kontrol edin ve zorunlu anahtarları tanımlayın.');
//     process.exit(1); // Uygulamanın ayağa kalkmasını engelle
// }

// export const env = {
//     NODE_ENV: process.env.NODE_ENV || 'development',
//     PORT: process.env.PORT || 3000,
//     JWT_SECRET: process.env.JWT_SECRET,
//     ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
//     DPU_BASE_URL: process.env.DPU_BASE_URL,
//     DPU_API_KEY: process.env.DPU_API_KEY,
//     DPU_PROJECT_CODE: process.env.DPU_PROJECT_CODE,
// };

// export default env;

import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

/**
 * Zorunlu ortam değişkenlerini kontrol eder.
 * Eksik değişken varsa uygulamanın çalışmasını anında durdurur (Fail-Fast).
 */
const requiredEnvVars = ['JWT_SECRET', 'ENCRYPTION_KEY'];

const missingVars = requiredEnvVars.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missingVars.length > 0) {
    console.error('Ortam değişkenleri eksik!');
    console.error(`Eksik Değişkenler: ${missingVars.join(', ')}`);
    console.error('Lütfen .env dosyanızı kontrol edin ve zorunlu anahtarları tanımlayın.');
    process.exit(1); // Uygulamanın ayağa kalkmasını engelle
}

// 💡 FAZ 0: ENCRYPTION_KEY format doğrulaması (64 hex karakter - 32 byte AES-256)
const HEX_64_REGEX = /^[a-fA-F0-9]{64}$/;
if (!HEX_64_REGEX.test(process.env.ENCRYPTION_KEY)) {
    console.error('GÜVENLİK HATASI: ENCRYPTION_KEY formatı geçersiz!');
    console.error('ENCRYPTION_KEY tam olarak 64 karakter uzunluğunda geçerli bir hex string olmalıdır (Örn: openssl rand -hex 32).');
    process.exit(1);
}

export const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    JWT_SECRET: process.env.JWT_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    DPU_BASE_URL: process.env.DPU_BASE_URL,
    DPU_API_KEY: process.env.DPU_API_KEY,
    DPU_PROJECT_CODE: process.env.DPU_PROJECT_CODE,
};

export default env;