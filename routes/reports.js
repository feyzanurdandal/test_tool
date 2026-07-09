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
    
    let baseLayout = fs.readFileSync(viewPath, 'utf-8');

    // 1. DURUM: DETAY SAYFASI
    if (req.query.file) {
        const [id, fileName] = req.query.file.split('|');
        if (!fileName || !fileName.endsWith('.txt')) return res.status(403).send("<h3>🚨 Geçersiz rapor</h3>");

        const filePath = path.join(reportFolder, fileName);
        if (!fs.existsSync(filePath)) return res.send("<h3>❌ Dosya bulunamadı</h3>");

        const parsed = parseReportFile(filePath);

        // Tailwind sınıfları eklendi
        const detailHtml = `
            <div class="space-y-6">
                <div class="border-2 border-slate-300 p-6 rounded-xl bg-slate-50">
                    <h3 class="text-xl font-bold mb-2">${parsed.status}</h3>
                    <p class="mb-4"><strong>Özet:</strong> ${parsed.summary}</p>
                    ${parsed.infoHeaderHtml}
                </div>
                <div class="border-2 border-slate-300 p-4 rounded-xl">
                    ${parsed.stepsHtml}
                </div>
                <div class="flex gap-4">
                    <a href="/api/scenarios/reports-panel" class="bg-slate-200 px-6 py-3 rounded-lg font-bold border-2 border-slate-300">⬅️ Listeye Dön</a>
                    <button onclick="deleteReport('${id}', '${fileName}')" class="bg-red-50 text-red-600 px-6 py-3 rounded-lg font-bold border-2 border-red-500 hover:bg-red-100">🗑️ Raporu Sil</button>
                </div>
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
        return res.send(baseLayout.replace('<div class="container">', '<div class="container">' + detailHtml));
    }

    // 2. DURUM: GENEL LİSTELEME
    const selectQuery = `SELECT * FROM reports ORDER BY created_at DESC`;
    db.all(selectQuery, [], (err, rows) => {
        let optionsHtml = rows.length > 0 
            ? rows.map(row => {
                const statusIndicator = row.status === 'SUCCESS' ? '✅' : '❌';
                const date = new Date(row.created_at).toLocaleString('tr-TR');
                return `<option value="${row.id}|${row.log_file_name}">${statusIndicator} [${date}] ${row.scenario_name}</option>`;
            }).join('')
            : '<option value="">Henüz rapor yok</option>';

        // Dropdown'ı belirginleştiren Tailwind sınıfları
        const listHtml = `
            <form action="/api/scenarios/reports-panel" method="GET" class="space-y-6">
                <select name="file" class="w-full p-4 border-2 border-slate-400 rounded-lg text-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200">
                    ${optionsHtml}
                </select>
                <button type="submit" class="w-full bg-indigo-600 text-white py-4 rounded-lg font-bold border-2 border-indigo-700 hover:bg-indigo-700 transition">Raporu Göster</button>
            </form>
        `;
        return res.send(baseLayout.replace('<div class="container">', '<div class="container">' + listHtml));
    });
});

export default router;