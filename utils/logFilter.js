// Test günlüğü süzgeçleri.
//
// Günlüğün büyük kısmı Stagehand'in kendi iç kayıtlarıdır ("[2026-11-23 08:31:18.646 +0000] INFO: ..." ile başlayan, altında
// girintili ayrıntı satırları olan bloklar) ve AI SDK uyarılarıdır. Bu bloklar KURTARILMIŞ iç hataları da içerir (ör. eleman yolu
// bayatlayınca ilk deneme "error: Could not find an element..." yazar, ikinci deneme başarılı olur). Başarı/başarısızlık kararında
// anahtar kelime taraması bu bloklara bakmamalıdır; aksi halde başarıyla biten test yanlışlıkla FAILED görünür.

const STAGEHAND_ENTRY = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ [+-]\d{4}\] [A-Za-z]+:/;

/** Stagehand iç kayıt bloklarını ve AI SDK uyarılarını çıkarır; test/araç satırları kalır. */
export function stripStagehandLogs(log) {
    const kept = [];
    let inBlock = false;
    for (const line of String(log ?? '').split('\n')) {
        if (STAGEHAND_ENTRY.test(line)) { inBlock = true; continue; }
        if (inBlock) {
            if (line === '' || /^\s/.test(line)) continue;      // girintili/boş satır: bloğun devamı
            inBlock = false;
        }
        if (/^AI SDK Warning:/.test(line)) continue;
        kept.push(line);
    }
    return kept.join('\n');
}

const TOOL_LINE = /^\s*(?:❌\s*)?(\[(ÇÖZÜM|BİLGİ|TEŞHİS|SÜRE|UYARI|VERİ_KOŞUSU|JSON_ALANI|JSON_SECIMI|JSON_TARIH|KOŞUCU_HATASI|HATA|HATA TESPİT EDİLDİ|DEĞERLENDİRME)\]|\*\*\* \[BAŞARIYLA AYIKLANDI\]|🛑|\d+ (passed|failed|skipped))/;
const FAILURE_LINE = /^\s*(Error: |CRITICAL_STEP_FAILED|STEP_FAILED|ACTION_FAILED|EXPECTED_BLOCK_NOT_FOUND)/;
// Mesajı birden çok satıra yayılabilen satırlar (sayfadaki hata/pop up metni): devam satırları da alınır.
const MULTILINE_START = /^\s*(?:❌\s*)?(\*\*\* \[BAŞARIYLA AYIKLANDI\]|\[HATA TESPİT EDİLDİ\]|\[HATA\]|\[DEĞERLENDİRME\]|🛑|Error: )/;
const STOPS_CONTINUATION = (l) => !l.trim() || STAGEHAND_ENTRY.test(l) || TOOL_LINE.test(l) || FAILURE_LINE.test(l) || /^\s*\d+\)\s/.test(l);

/**
 * Yapay zeka yorumcusu için kanıt satırları: araç satırları ve test başarısızlık satırları (Stagehand iç blokları ve ham model
 * cevapları dahil EDİLMEZ). Sayfa hata mesajları çok satırlıysa devam satırlarıyla (en çok 5 satır / maxGroupChars) birlikte alınır;
 * aynı mesajın tekrarları (ayıklanan değer, hata satırı, 🛑, Playwright Error) yalnızca bir kez yazılır.
 */
export function evidenceLines(log, { maxLineChars = 240, maxGroupChars = 600 } = {}) {
    const src = String(log ?? '').split('\n');
    const lines = [];
    const seenContinuations = new Set();
    let inBlock = false;
    for (let i = 0; i < src.length; i++) {
        const line = src[i];
        if (STAGEHAND_ENTRY.test(line)) { inBlock = true; continue; }
        const isTool = TOOL_LINE.test(line);
        const isFailure = FAILURE_LINE.test(line);
        if (inBlock && !isTool && !isFailure) {
            if (line === '' || /^\s/.test(line)) continue;
            inBlock = false;
        }
        if (!isTool && !isFailure) continue;
        inBlock = false;
        let text = line.trim().slice(0, maxLineChars);
        if (MULTILINE_START.test(line)) {
            const cont = [];
            for (let j = i + 1; j < src.length && cont.length < 5; j++) {
                if (STOPS_CONTINUATION(src[j])) break;
                cont.push(src[j].trim());
            }
            if (cont.length) {
                const joined = cont.join(' ⏎ ').slice(0, maxGroupChars);
                if (!seenContinuations.has(joined)) { seenContinuations.add(joined); text += ` ⏎ ${joined}`; }
            }
        }
        lines.push(text);
    }
    return lines;
}
