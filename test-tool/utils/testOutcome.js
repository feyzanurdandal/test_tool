// Başarı yalnızca hedef sayfanın görünen metninde belirlenen mesaj doğrulanınca verilir.
// Koşucu exception/log satırları bu fonksiyonun girdisi değildir.
export function verifyExpectedBlock(visibleText, expectedText) {
    if (typeof expectedText !== 'string' || expectedText.trim().length < 3) return false;
    const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();
    return normalize(visibleText).includes(normalize(expectedText));
}
