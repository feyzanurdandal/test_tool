import fs from 'fs';

// Yardımcı Fonksiyon: Tıklanınca açılan şık akordeon yapıları inşa eder
function buildAccordionHtml(num, title, logsArray, wasBackup) {
    const backupBadge = wasBackup 
        ? `<span style="background: #ffc107; color: #212529; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 10px;">⚠️ YEDEK AJAN TETİKLENDİ</span>` 
        : "";
    
    const fullLogsText = logsArray.join('\n');
    
    // Token bilgilerini log parçasının içinden hassasça tarıyoruz
    const promptTokens = fullLogsText.match(/prompt_tokens["\s:]+(\d+)/i);
    const completionTokens = fullLogsText.match(/completion_tokens["\s:]+(\d+)/i);
    let tokenInfo = "";
    
    if (promptTokens && completionTokens) {
        const total = parseInt(promptTokens[1]) + parseInt(completionTokens[1]);
        tokenInfo = `<span style="color: #6c757d; font-size: 12px; margin-left: auto;">💎 Toplam Token: ${total}</span>`;
    }

    return `
        <div style="margin-bottom: 10px; border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden; background: white;">
            <button type="button" onclick="const p = this.nextElementSibling; p.style.display = p.style.display === 'none' ? 'block' : 'none';" 
                style="width: 100%; text-align: left; background: #f8f9fa; border: none; padding: 14px; font-size: 14px; font-weight: 600; color: #495057; cursor: pointer; display: flex; align-items: center; border-bottom: 1px solid #dee2e6;">
                İşlem ${num}: ${title} ${backupBadge} ${tokenInfo}
            </button>
            <div style="display: none; padding: 15px; background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 12px; max-height: 300px; overflow-y: auto; white-space: pre-wrap;">${fullLogsText}</div>
        </div>
    `;
}

export const parseReportFile = (filePath) => {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const lines = rawContent.split(/\r?\n/);

    const isSuccess = rawContent.includes('✅ [TEST SUCCESS]');
    const status = isSuccess ? "✅ BAŞARILI" : "❌ BAŞARISIZ";
    const cardClass = isSuccess ? "success" : "error";
    
    const summaryMatch = rawContent.match(/\d+ passed \(.+\)/);
    const summary = summaryMatch ? summaryMatch[0] : "Süre/Özet bilgisi alınamadı.";

    // 🌐 Sabit Metrik Süzgeçleri
    const urlMatch = rawContent.match(/Target URL\s*:\s*(.+)/i) || rawContent.match(/URL\s*->\s*(.+)/i) || rawContent.match(/http[s]?:\/\/[^\s]+/i);
    const modelMatch = rawContent.match(/Model\s*:\s*([\w-]+)/i) || rawContent.match(/LLM\s*:\s*([\w-]+)/i);
    const errorMatch = rawContent.match(/(Error:[\s\S]{1,150})/i) || rawContent.match(/(Patladı:[\s\S]{1,150})/i);

    let infoHeaderHtml = "";
    if (urlMatch) {
        const cleanUrl = urlMatch[1] ? urlMatch[1].trim() : urlMatch[0].trim();
        infoHeaderHtml += `<div class="data-item"> <strong>Hedef URL:</strong> <a href="${cleanUrl}" target="_blank">${cleanUrl}</a></div>`;
    }
    if (modelMatch) infoHeaderHtml += `<div class="data-item"> <strong>Kullanılan LLM:</strong> <code>${modelMatch[1].trim()}</code></div>`;
    
    if (!isSuccess && errorMatch) {
        infoHeaderHtml += `
            <div class="data-item" style="background: #fff3f3; border: 1px solid #f5c6cb; padding: 10px; border-radius: 5px; color: #721c24; margin-top: 10px;">
                🚨 <strong>Kritik Hata Detayı:</strong> <br><pre style="margin: 5px 0; font-size: 13px; white-space: pre-wrap;">${errorMatch[1].trim()}...</pre>
            </div>
        `;
    }

    // 🎬 ZAMAN DAMGALI AKIŞ PARÇALAYICI
    let stepsHtml = "";
    let currentStepNum = 0;
    let currentStepLogs = [];
    let currentStepTitle = "";
    let isBackupAgentTriggered = false;

    lines.forEach((line) => {
        const trimmedLine = line.trim();
        
        // Satırın bir zaman damgasıyla ve INFO ile başlayıp başlamadığını yakalayan Regex kuralı
        // Örn: [2026-07-03 11:36:35.794 +0300] INFO: Extraction completed successfully
        const infoStepMatch = trimmedLine.match(/^\[.*?\]\s+INFO:\s*(.+)/i);

        if (infoStepMatch) {
            // Eğer önceden birikmiş bir adım varsa onu rapora ekle
            if (currentStepNum > 0 && currentStepLogs.length > 0) {
                stepsHtml += buildAccordionHtml(currentStepNum, currentStepTitle, currentStepLogs, isBackupAgentTriggered);
            }
            
            currentStepNum++;
            // Başlık olarak doğrudan INFO:'dan sonra gelen o anlamlı açıklamayı alıyoruz
            currentStepTitle = infoStepMatch[1].trim();
            currentStepLogs = [];
            isBackupAgentTriggered = false;
        }

        if (currentStepNum > 0) {
            currentStepLogs.push(line);
            if (trimmedLine.includes('agent.execute') || trimmedLine.includes('Backup agent') || trimmedLine.includes('fallback')) {
                isBackupAgentTriggered = true;
            }
        } else {
            // Eğer henüz hiçbir INFO satırına denk gelmediysek ama başta loglar varsa onları ilk adıma dahil etmek için ön hazırlık yapıyoruz
            currentStepNum = 1;
            currentStepTitle = "Test Başlangıç Aşaması ve Yapılandırma";
            currentStepLogs.push(line);
        }
    });

    // Son kalan adımı da listeye ekle
    if (currentStepNum > 0 && currentStepLogs.length > 0) {
        stepsHtml += buildAccordionHtml(currentStepNum, currentStepTitle, currentStepLogs, isBackupAgentTriggered);
    }

    return {
        cardClass,
        status,
        summary,
        infoHeaderHtml,
        stepsHtml
    };
};