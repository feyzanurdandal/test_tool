import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module içinde __dirname oluşturma yöntemi
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Proje kök dizinindeki 'data' klasörünü hedefliyoruz
const dataDir = path.join(__dirname, '../data');

// 'data' klasörü yoksa kod tarafından otomatik oluşturulur
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Veritabanı dosya yolu: data/database.sqlite
const dbPath = path.join(dataDir, 'database.sqlite');

// Veritabanı bağlantı örneği
let dbInstance = null;

async function getDb() {
    if (!dbInstance) {
        dbInstance = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        
        await dbInstance.exec('PRAGMA journal_mode = WAL;');
        await initDatabase(dbInstance);
    }
    return dbInstance;
}

// 🛡️ Otomatik Tablo Kurulumları (Sadece Şema Oluşturur)
async function initDatabase(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS kullanicilar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kullanici_adi TEXT UNIQUE NOT NULL,
            sifre TEXT NOT NULL,
            rol TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS projeler (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proje_adi TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS kullanici_projeleri (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kullanici_adi TEXT NOT NULL,
            proje_adi TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS senaryolar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            senaryo_adi TEXT NOT NULL,
            hedef_url TEXT,
            adimlar TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS raporlar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            scenario_name TEXT NOT NULL,
            status TEXT NOT NULL,
            log_content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ayarlar (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ayar_anahtar TEXT UNIQUE NOT NULL,
            ayar_deger TEXT NOT NULL,
            ayar_model TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

export const db = {
    async selectAll(table) {
        try {
            const sqlite = await getDb();
            const rows = await sqlite.all(`SELECT * FROM ${table} ORDER BY id DESC`);
            return { success: true, data: rows };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    async selectWhere(table, filters) {
        try {
            const sqlite = await getDb();
            const keys = Object.keys(filters);
            if (keys.length === 0) return this.selectAll(table);

            const conditions = [];
            const values = [];

            keys.forEach((key) => {
                const valObj = filters[key];
                const val = (typeof valObj === 'object' && valObj !== null && 'eq' in valObj) ? valObj.eq : valObj;
                conditions.push(`${key} = ?`);
                values.push(val);
            });

            const sql = `SELECT * FROM ${table} WHERE ${conditions.join(' AND ')}`;
            const rows = await sqlite.all(sql, values);
            return { success: true, data: rows };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    async insert(table, data) {
        try {
            const sqlite = await getDb();
            const keys = Object.keys(data);
            const values = Object.values(data).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
            const placeholders = keys.map(() => '?').join(', ');

            const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
            const result = await sqlite.run(sql, values);
            
            const insertedRow = await sqlite.get(`SELECT * FROM ${table} WHERE id = ?`, [result.lastID]);
            return { success: true, data: [insertedRow] };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    async update(table, id, data) {
        try {
            const sqlite = await getDb();
            const keys = Object.keys(data);
            const values = Object.values(data).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
            const setClause = keys.map((key) => `${key} = ?`).join(', ');

            values.push(id);
            const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
            await sqlite.run(sql, values);

            const updatedRow = await sqlite.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
            return { success: true, data: [updatedRow] };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },

    async delete(table, id) {
        try {
            const sqlite = await getDb();
            const row = await sqlite.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
            await sqlite.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
            return { success: true, data: [row] };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

export default db;