// middleware/errorHandler.js

/**
 * Güvenli Hata Yanıtı Yardımcısı
 * Ham hata detaylarını istemciye sızdırmadan sunucuda loglar, istemciye güvenli mesaj döner.
 */
export function sendServerError(res, err, publicMessage = "Sunucu tarafında beklenmeyen bir hata oluştu.", context = "") {
    // 1. Hassas hata detaylarını ve stack trace'i SADECE sunucu konsoluna basıyoruz
    console.error(`💥 [${context || 'Hata'}]`, err && err.stack ? err.stack : err);

    // 2. İstemciye (Frontend) güvenli ve temiz hata mesajı dönüyoruz
    return res.status(500).json({ 
        error: publicMessage 
    });
}