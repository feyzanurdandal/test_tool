// ─── İÇE AKTARILAN SENARYO GRUPLARI ───
// Başka bir senaryodan içe aktarılan adımlar, adimlar_tr alanında aşağıdaki
// işaretçiler arasında saklanır. Böylece arayüz bu adımları senaryo adıyla
// akordiyon olarak gösterebilir. Yapay zeka çevirisine ise işaretçiler
// temizlenmiş düz metin gönderilir (çeviri sonucu ve önbellek etkilenmez).
//
//   [[İÇE_AKTAR:login]]
//   Kullanıcı adı alanına ... yaz
//   Giriş Yap butonuna tıkla
//   [[/İÇE_AKTAR]]

export const IMPORT_START_RE = /^\[\[İÇE_AKTAR:(.+)\]\]$/;
export const IMPORT_END = '[[/İÇE_AKTAR]]';

export const isImportMarker = (line) => {
    const t = String(line || '').trim();
    return t === IMPORT_END || IMPORT_START_RE.test(t);
};

// İşaretçileri kaldırıp yalnızca gerçek adımları satır satır döndürür.
export const stripImportMarkers = (text) => {
    if (typeof text !== 'string') return text;
    return text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l !== '' && !isImportMarker(l))
        .join('\n');
};
