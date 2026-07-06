// config/database.ts
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Veri tabanı dosyasını proje kök dizininde 'test_automation.db' olarak oluşturur
const dbPath = path.resolve(__dirname, '../test_automation.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('🚨 SQLite bağlantı hatası:', err.message);
    } else {
        console.log('📦 SQLite Veri Tabanı Bağlantısı Başarılı.');
    }
});

// Rapor özetlerini tutacağımız tabloyu ayağa kaldırıyoruz
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scenario_name TEXT NOT NULL,
            target_url TEXT NOT NULL,
            status TEXT NOT NULL, -- 'SUCCESS' veya 'FAILED'
            log_file_name TEXT NOT NULL, -- Detaylar için okunacak .txt dosyasının adı
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('🚨 Tablo oluşturma hatası:', err.message);
        }
    });
});

export default db;