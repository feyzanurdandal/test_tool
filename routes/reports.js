// import express from 'express';
// import fs from 'fs';
// import path from 'path';
// import { parseReportFile } from '../services/reportParser.js';
// import { CONSTANTS } from '../config/constants.js'; 
// import db from '../config/database.js';

// const router = express.Router();
// const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER || 'reports');

// // ─── 1. API: TÜM RAPORLARI LİSTELEME ───
// router.get('/api/reports/list', (req, res) => {
//     const selectQuery = `SELECT * FROM reports ORDER BY created_at DESC`;
//     db.all(selectQuery, [], (err, rows) => {
//         if (err) {
//             return res.status(500).json({ error: "Veritabanı hatası", details: err.message });
//         }
//         return res.json({ success: true, reports: rows });
//     });
// });

// // ─── 2. API: TEK BİR RAPORUN İÇERİĞİNİ PARSE EDİP DÖNME ───
// router.get('/api/reports/detail', (req, res) => {
//     const { file } = req.query; // Gelen format: "id|file_name.txt"
//     if (!file) return res.status(400).json({ error: "File parametresi eksik" });

//     const [id, fileName] = file.split('|');
//     const filePath = path.join(reportFolder, fileName);

//     if (!fs.existsSync(filePath)) {
//         return res.status(404).json({ error: "Rapor dosyası bulunamadı" });
//     }

//     const parsed = parseReportFile(filePath);
//     return res.json({
//         success: true,
//         id,
//         fileName,
//         status: parsed.status,
//         summary: parsed.summary,
//         infoHeaderHtml: parsed.infoHeaderHtml,
//         stepsHtml: parsed.stepsHtml
//     });
// });

// export default router;


import express from 'express';
import fs from 'fs';
import path from 'path';
import { parseReportFile } from '../services/reportParser.js';
import { CONSTANTS } from '../config/constants.js'; 
import db from '../config/database.js';

const router = express.Router();
const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER || 'reports');

// ─── 1. API: PROJE BAZLI RAPORLARI FİLTRELEYEREK LİSTELEME ───
router.get('/api/reports/list', (req, res) => {
    const { project } = req.query; // React'ten gelen: ?project=Auth Service
    const selectedProj = project || 'Proje Seçin';

    const selectQuery = `SELECT * FROM reports ORDER BY created_at DESC`;
    db.all(selectQuery, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Veritabanı hatası", details: err.message });
        }

        // 🚀 Akıllı Filtreleme: Log adının içinde "ProjeAdı___" var mı diye bakıyoruz
        const filteredRows = rows.filter(row => {
            if (row.log_file_name.includes('___')) {
                const [projName] = row.log_file_name.split('___');
                return projName === selectedProj;
            }
            // Eğer ayıraç yoksa (eski raporlar), varsayılan projeye dahil et
            return selectedProj === 'Proje Seçin';
        });

        return res.json({ success: true, reports: filteredRows });
    });
});

// ─── 2. API: TEK BİR RAPORUN İÇERİĞİNİ PARSE EDİP DÖNME ───
router.get('/api/reports/detail', (req, res) => {
    const { file } = req.query; 
    if (!file) return res.status(400).json({ error: "File parametresi eksik" });

    const [id, fileName] = file.split('|');
    const filePath = path.join(reportFolder, fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Rapor dosyası bulunamadı" });
    }

    const parsed = parseReportFile(filePath);
    return res.json({
        success: true,
        id,
        fileName: fileName.includes('___') ? fileName.split('___')[1] : fileName, // Görünümden proje ekini temizle
        status: parsed.status,
        summary: parsed.summary,
        infoHeaderHtml: parsed.infoHeaderHtml,
        stepsHtml: parsed.stepsHtml
    });
});

export default router;