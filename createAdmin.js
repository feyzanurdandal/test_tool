import bcrypt from 'bcryptjs';
import { db } from './config/dbService.js';

async function createAdmin() {
    const username = process.argv[2] || 'feyza';
    const password = process.argv[3] || 'admin123';

    try {
        // Kullanıcı var mı kontrol et
        const existing = await db.selectWhere('kullanicilar', { kullanici_adi: username });
        if (existing.success && existing.data.length > 0) {
            console.log(`⚠️  '${username}' kullanicisi zaten mevcut!`);
            process.exit(0);
        }

        // Şifreyi Bcrypt ile hash'le
        const hashedPassword = await bcrypt.hash(password, 10);

        // SQLite'a admin olarak ekle
        const result = await db.insert('kullanicilar', {
            kullanici_adi: username,
            sifre: hashedPassword,
            rol: 'admin'
        });

        if (result.success) {
            console.log(`✅ Admin hesabi basariyla olusturuldu!`);
            console.log(`👤 Kullanici Adi: ${username}`);
            console.log(`🔑 Sifre: ${password}`);
        } else {
            console.error(`❌ Hata: ${result.error}`);
        }
    } catch (err) {
        console.error('🚨 Beklenmeyen Hata:', err.message);
    } finally {
        process.exit(0);
    }
}

createAdmin();