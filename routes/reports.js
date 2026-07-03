import express from 'express';
import fs from 'fs';
import path from 'path';
import { parseReportFile } from '../services/reportParser.js';
import { CONSTANTS } from '../config/constants.js'; // constants dosyanı bağladık kanka

const router = express.Router();

const reportFolder = path.join(process.cwd(), CONSTANTS.REPORTS_FOLDER);
const viewPath = path.join(process.cwd(), 'views', 'reports-panel.html');

router.get('/reports-panel', (req, res) => {
    if (!fs.existsSync(viewPath)) return res.send("<h3>❌ views/reports-panel.html dosyası bulunamadı </h3>");
    const baseLayout = fs.readFileSync(viewPath, 'utf-8');

    // 1. DURUM: DETAY SAYFASI GÖRÜNÜMÜ
    if (req.query.file) {
        const fileName = req.query.file;

        if (fileName.includes('/') || fileName.includes('\\') || !fileName.endsWith('.txt')) {
            return res.status(403).send("<h3>🚨 Güvenlik İhlali: Geçersiz dosya adı </h3>");
        }

        const filePath = path.join(reportFolder, fileName);
        if (!fs.existsSync(filePath)) return res.send("<h3>❌ Rapor dosyası bulunamadı </h3>");

        const parsed = parseReportFile(filePath);

        const detailHtml = `
            <h2>📊 Test Sonuç Özeti</h2>
            <hr>
            <div class="card ${parsed.cardClass}">
                <div class="data-item"><strong> Senaryo Durumu:</strong> ${parsed.status}</div>
                <div class="data-item"><strong> Özet & Süre:</strong> ${parsed.summary}</div>
                <h3 style="margin-top: 20px; color: #555;">🔍 Detaylı Rapor Metrikleri:</h3>
                ${parsed.infoHeaderHtml}
            </div>
            
            <h3 style="margin-top: 30px; margin-bottom: 15px; color: #2c3e50; display: flex; align-items: center; gap: 8px;">🎬 Yapay Zeka İşlem Adımları (İncelemek İçin Tıkla)</h3>
            <div style="margin-bottom: 25px;">
                ${parsed.stepsHtml || '<div style="color: #888; font-style: italic;">Adım detayları ayrıştırılamadı </div>'}
            </div>
            
            <a href="${CONSTANTS.N8N_BASE_URL}/webhook/reports-viewer" class="btn-back">⬅️ Listeye Geri Dön</a>
        `;

        // 🎯 Boş metin yerine artık şablondaki etiketi tam hedef alıyoruz kanka!
        return res.send(baseLayout.replace('', detailHtml));
    }

    // 2. DURUM: GENEL LİSTELEME GÖRÜNÜMÜ
    if (!fs.existsSync(reportFolder)) {
        return res.send(baseLayout.replace('', "<h3> Henüz hiç rapor oluşturulmamış </h3>"));
    }

    const files = fs.readdirSync(reportFolder).filter(f => f.endsWith('.txt'));
    let optionsHtml = files.map(f => `<option value="${f}">${f}</option>`).join('');

    const listHtml = `
        <h2> Güncel Test Raporları Paneli</h2>
        <p>Lütfen özetini görmek istediğiniz detaylı <code>.txt</code> raporunu seçin: </p>
        <form action="${CONSTANTS.N8N_BASE_URL}/webhook/reports-viewer" method="GET">
            <select name="file">
                ${optionsHtml}
            </select>
            <button type="submit"> Raporu Özetle</button>
        </form>
    `;

    return res.send(baseLayout.replace('', listHtml));
});

export default router;