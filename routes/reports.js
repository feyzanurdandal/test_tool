import express from 'express';
import fs from 'fs';
import path from 'path';
import { parseReportFile } from '../services/reportParser.js';
import { CONSTANTS } from '../config/constants.js'; 
import db from '../config/database.js';

const router = express.Router();

const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER);
const viewPath = path.join(process.cwd(), 'views', 'reports-panel.html');

router.get('/reports-panel', (req, res) => {
    if (!fs.existsSync(viewPath)) return res.send("<h3>❌ views/reports-panel.html dosyası bulunamadı </h3>");
    
    // HTML'i oku
    let baseLayout = fs.readFileSync(viewPath, 'utf-8');

    // 1. DURUM: DETAY SAYFASI
    if (req.query.file) {
        const [id, fileName] = req.query.file.split('|');
        if (!fileName || !fileName.endsWith('.txt')) return res.status(403).send("<h3>🚨 Geçersiz rapor</h3>");

        const filePath = path.join(reportFolder, fileName);
        if (!fs.existsSync(filePath)) return res.send("<h3>❌ Dosya bulunamadı</h3>");

        const parsed = parseReportFile(filePath);

        const detailHtml = `
            <div class="card ${parsed.cardClass}">
                <h3>${parsed.status}</h3>
                <p><strong>Özet:</strong> ${parsed.summary}</p>
                ${parsed.infoHeaderHtml}
                <hr>
                ${parsed.stepsHtml}
            </div>
            <br>
            <div style="display:flex; gap:10px;">
                <a href="/api/scenarios/reports-panel" class="btn-back">⬅️ Listeye Geri Dön</a>
                <button onclick="deleteReport('${id}', '${fileName}')" class="btn-delete">🗑️ Bu Raporu Sil</button>
            </div>
            <script>
            async function deleteReport(id, logFileName) {
                if(!confirm("Emin misin?")) return;
                const res = await fetch('/api/scenarios/delete-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, logFileName })
                });
                if(res.ok) { alert("Silindi!"); window.location.href = '/api/scenarios/reports-panel'; }
            }
            </script>
        `;
        // replace işlemini garantili yapıyoruz
        return res.send(baseLayout.replace('<div class="container">', '<div class="container">' + detailHtml));
    }

    // 2. DURUM: GENEL LİSTELEME
    const selectQuery = `SELECT * FROM reports ORDER BY created_at DESC`;
    db.all(selectQuery, [], (err, rows) => {
        if (err) return res.status(500).send("<h3>❌ Veri tabanı hatası</h3>");

        // rows boşsa kullanıcıyı uyaralım
        let optionsHtml = rows.length > 0 
            ? rows.map(row => {
                const statusIndicator = row.status === 'SUCCESS' ? '✅' : '❌';
                return `<option value="${row.id}|${row.log_file_name}">${statusIndicator} ${row.scenario_name}</option>`;
              }).join('')
            : '<option value="">Henüz rapor yok</option>';

        const listHtml = `
            <h2>Güncel Test Raporları Paneli</h2>
            <form action="/api/scenarios/reports-panel" method="GET">
                <select name="file" style="padding:10px; width:100%; margin-bottom:10px;">
                    ${optionsHtml}
                </select>
                <button type="submit">Raporu Özetle</button>
            </form>
        `;
        return res.send(baseLayout.replace('<div class="container">', '<div class="container">' + listHtml));
    });
});

// SİLME ROTASI (Aynı dosyanın içine, router altına ekle)
router.post('/delete-report', (req, res) => {
    const { id, logFileName } = req.body;
    if (!logFileName) return res.status(400).json({ error: "Dosya adı eksik" });

    const filePath = path.join(reportFolder, logFileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.run(`DELETE FROM reports WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: "DB silme hatası" });
        res.json({ status: "SUCCESS" });
    });
});

export default router;