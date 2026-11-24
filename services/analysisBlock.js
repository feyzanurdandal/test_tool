// Yapay zeka yorum bloğu (log_content sonunda) ve SENARYO SONUCU kuralları. Bağımlılığı yoktur (liste servisi de kullanır).
//   [[YZ_YORUMU:v1]]{json}[[/YZ_YORUMU]]
const OPEN = '[[YZ_YORUMU:v1]]';
const CLOSE = '[[/YZ_YORUMU]]';
const BLOCK_RE = /\n?\[\[YZ_YORUMU:v1\]\]([\s\S]*?)\[\[\/YZ_YORUMU\]\]\s*$/;
const PENDING_STALE_MS = 10 * 60 * 1000;   // toplu koşularda yorum kuyruğu birikebilir; 10 dk sonra hâlâ bekliyorsa üretilemedi sayılır

/** Günlük metninden yorum bloğunu ayırır: {log, analysis|null}. Bozuk blok → analysis null. */
export function extractAnalysis(logContent) {
    const text = typeof logContent === 'string' ? logContent : '';
    const idx = text.lastIndexOf(OPEN);                         // büyük günlüklerde hızlı çıkış: blok yoksa tarama yok
    if (idx < 0) return { log: text, analysis: null };
    const from = Math.max(0, idx - 1);
    const m = BLOCK_RE.exec(text.slice(from));
    if (!m) return { log: text, analysis: null };
    let analysis = null;
    try { analysis = JSON.parse(m[1]); } catch { /* bozuk blok yok sayılır */ }
    if (analysis?.durum === 'bekliyor' && Date.now() - Date.parse(analysis.baslangic || 0) > PENDING_STALE_MS) {
        analysis = { durum: 'uretilemedi' };
    }
    return { log: text.slice(0, from + m.index), analysis };
}

export function withAnalysisBlock(baseLog, analysis) {
    return `${baseLog}\n${OPEN}${JSON.stringify(analysis)}${CLOSE}`;
}

export const pendingBlock = () => ({ durum: 'bekliyor', baslangic: new Date().toISOString() });

/**
 * SENARYO SONUCU (adım durumundan ayrı): { sonuc: 'basarili'|'basarisiz'|'belirsiz'|'degerlendiriliyor', kaynak } veya null (yorum yok: eski rapor / kapalı).
 *  1) Adım durumu SUCCESS değilse → basarisiz (yapay zeka bunu başarılıya ÇEVİREMEZ; yalnızca aşağı yönlü etki).
 *  2) GÜVENLİK testleri: sonuç yapay zekaya bırakılmaz; "beklenen sonuç" mantığıyla sistemin verdiği durumdur (yorum yalnızca tavsiye).
 *  3) UI testleri, adımlar sorunsuz: yapay zeka yorumundaki senaryoSonucu; yorum hazırlanıyorsa degerlendiriliyor, üretilemediyse belirsiz.
 */
export function resolveScenarioResult({ status, testType, analysis }) {
    const stepOk = ['SUCCESS', 'PASSED'].includes(String(status || '').toUpperCase());
    if (String(testType || 'UI').toUpperCase() === 'SECURITY') return { sonuc: stepOk ? 'basarili' : 'basarisiz', kaynak: 'beklenen_sonuc' };
    if (!stepOk) return { sonuc: 'basarisiz', kaynak: 'adim' };
    if (!analysis) return null;
    if (analysis.durum === 'bekliyor') return { sonuc: 'degerlendiriliyor', kaynak: 'yapay_zeka' };
    if (analysis.durum !== 'hazir') return { sonuc: 'belirsiz', kaynak: 'yapay_zeka' };
    const v = analysis.senaryoSonucu;
    return { sonuc: v === 'basarili' || v === 'basarisiz' ? v : 'belirsiz', kaynak: 'yapay_zeka' };
}
