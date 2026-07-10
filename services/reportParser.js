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
        tokenInfo = `<span style="color: #a1a1aa; font-size: 11px; margin-left: auto; font-family: monospace;">💎 Token: ${total}</span>`;
    }

    return `
        <div style="margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; overflow: hidden; background: #18181b;">
            <button type="button" onclick="const p = this.nextElementSibling; p.style.display = p.style.display === 'none' ? 'block' : 'none';" 
                style="width: 100%; text-align: left; background: #27272a/30; border: none; padding: 12px; font-size: 13px; font-weight: 600; color: #fafafa; cursor: pointer; display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <span style="margin-right: 8px;">🔹</span> İşlem ${num}: ${title} ${backupBadge} ${tokenInfo}
            </button>
            <div style="display: none; padding: 15px; background: #09090b; color: #34d399; font-family: 'Courier New', monospace; font-size: 12px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; border-top: 1px solid rgba(255,255,255,0.04);">${fullLogsText}</div>
        </div>
    `;
}

export const parseReportFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return { cardClass: "error", status: "❌ DOSYA BULUNAMADI", summary: "Log dosyası yok.", infoHeaderHtml: "", stepsHtml: "" };
    }

    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const lines = rawContent.split(/\r?\n/);

    const isSuccess = rawContent.includes('✅ [TEST SUCCESS]');
    const status = isSuccess ? "BAŞARILI ✅" : "BAŞARISIZ ❌";
    const cardClass = isSuccess ? "success" : "error";
    
    const summaryMatch = rawContent.match(/\d+ passed \(.+\)/);
    const summary = summaryMatch ? summaryMatch[0] : (isSuccess ? "Tüm adımlar başarıyla tamamlandı." : "Hata ile kesildi.");

    const urlMatch = rawContent.match(/Target URL\s*:\s*(.+)/i) || rawContent.match(/URL\s*->\s*(.+)/i) || rawContent.match(/http[s]?:\/\/[^\s]+/i);
    const modelMatch = rawContent.match(/Model\s*:\s*([\w-]+)/i) || rawContent.match(/LLM\s*:\s*([\w-]+)/i);
    const errorMatch = rawContent.match(/(Error:[\s\S]{1,150})/i) || rawContent.match(/(Patladı:[\s\S]{1,150})/i);

    let infoHeaderHtml = "";
    if (urlMatch) {
        const cleanUrl = urlMatch[1] ? urlMatch[1].trim() : urlMatch[0].trim();
        infoHeaderHtml += `<p><strong>Hedef URL:</strong> <a href="${cleanUrl}" target="_blank" style="color:#3b82f6; text-decoration:underline;">${cleanUrl}</a></p>`;
    }
    if (modelMatch) infoHeaderHtml += `<p><strong>Kullanılan LLM:</strong> <code style="background:#27272a; padding:2px 6px; border-radius:4px; font-family:monospace;">${modelMatch[1].trim()}</code></p>`;
    
    if (!isSuccess && errorMatch) {
        infoHeaderHtml += `
            <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); padding: 12px; border-radius: 6px; color: #ef4444; margin-top: 10px; font-family: monospace;">
                🚨 <strong>Kritik Hata Detayı:</strong> <br><pre style="margin: 5px 0; font-size: 12px; white-space: pre-wrap;">${errorMatch[1].trim()}...</pre>
            </div>
        `;
    }

    let stepsHtml = "";
    let currentStepNum = 0;
    let currentStepLogs = [];
    let currentStepTitle = "";
    let isBackupAgentTriggered = false;

    lines.forEach((line) => {
        const trimmedLine = line.trim();
        const infoStepMatch = trimmedLine.match(/^\[.*?\]\s+INFO:\s*(.+)/i);

        if (infoStepMatch) {
            if (currentStepNum > 0 && currentStepLogs.length > 0) {
                stepsHtml += buildAccordionHtml(currentStepNum, currentStepTitle, currentStepLogs, isBackupAgentTriggered);
            }
            currentStepNum++;
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
            currentStepNum = 1;
            currentStepTitle = "Test Başlangıç Aşaması ve Yapılandırma";
            currentStepLogs.push(line);
        }
    });

    if (currentStepNum > 0 && currentStepLogs.length > 0) {
        stepsHtml += buildAccordionHtml(currentStepNum, currentStepTitle, currentStepLogs, isBackupAgentTriggered);
    }

    return { cardClass, status, summary, infoHeaderHtml, stepsHtml };
};