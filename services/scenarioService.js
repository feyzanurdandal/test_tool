import { translateToStagehandJson } from '../utils/translator.js';

// 🛡️ SSRF ve Geçerli URL Kontrol Helper'ı
export function validateTargetUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') {
        return { isValid: false, reason: "URL boş olamaz." };
    }

    try {
        const parsed = new URL(urlStr.trim());

        // 1. Sadece HTTP ve HTTPS protokollerine izin ver
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { isValid: false, reason: "Sadece HTTP veya HTTPS protokolleri desteklenmektedir." };
        }

        const hostname = parsed.hostname.toLowerCase();

        // 2. Localhost ve Loopback Adreslerini Engelle
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
            return { isValid: false, reason: "Yerel (localhost) adreslere test senaryosu oluşturulamaz." };
        }

        // 3. İç Ağ / Private IP ve Cloud Metadata Adreslerini Engelle (SSRF Koruması)
        const isPrivateIp = 
            hostname.startsWith('10.') || 
            hostname.startsWith('192.168.') || 
            hostname.startsWith('169.254.') || // AWS/GCP/Azure Metadata IP
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

        if (isPrivateIp) {
            return { isValid: false, reason: "İç ağ (Private IP) adreslerine test senaryosu oluşturulamaz." };
        }

        return { isValid: true };
    } catch (err) {
        return { isValid: false, reason: "Geçersiz URL formatı! Örn: https://example.com" };
    }
}

export async function translateScenario(turkishInstructions, targetUrl) {
    const stagehandJson = await translateToStagehandJson(turkishInstructions, targetUrl);
    if (!stagehandJson) throw new Error("Yapay zeka çevirisi başarısız oldu.");
    stagehandJson.targetUrl = targetUrl;
    return stagehandJson;
}