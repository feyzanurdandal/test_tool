import express from 'express';
import fs from 'fs';
import path from 'path';
import { parseReportFile } from '../services/reportParser.js';
import { CONSTANTS } from '../config/constants.js'; 
import db from '../config/database.js';

const router = express.Router();
const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER || 'reports');

// ─── 1. API: TÜM RAPORLARI LİSTELEME ───
router.get('/api/reports/list', (req, res) => {
    const selectQuery = `SELECT * FROM reports ORDER BY created_at DESC`;
    db.all(selectQuery, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Veritabanı hatası", details: err.message });
        }
        return res.json({ success: true, reports: rows });
    });
});

// ─── 2. API: TEK BİR RAPORUN İÇERİĞİNİ PARSE EDİP DÖNME ───
router.get('/api/reports/detail', (req, res) => {
    const { file } = req.query; // Gelen format: "id|file_name.txt"
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
        fileName,
        status: parsed.status,
        summary: parsed.summary,
        infoHeaderHtml: parsed.infoHeaderHtml,
        stepsHtml: parsed.stepsHtml
    });
});

export default router;