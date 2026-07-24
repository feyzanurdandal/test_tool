/**
 * 1. Tekil Controller/Route Hataları İçin Yardımcı Fonksiyon
 */
export const sendServerError = (res, error, customMessage = "Sunucu hatası oluştu.", context = "") => {
    console.error(`❌ [${context || 'SERVER_ERROR'}]`, error);
    return res.status(500).json({
        success: false,
        error: customMessage,
        details: error?.message || error
    });
};

/**
 * 2. Express Global Hata Yakalama Middleware'i
 */
export const globalErrorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || "Sunucuda beklenmeyen bir hata oluştu!";

    console.error(`❌ [HATA] ${req.method} ${req.url} - Status: ${statusCode}`, err);

    res.status(statusCode).json({
        success: false,
        error: message,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
};

/**
 * 3. 404 Bulunamadı Yakalayıcısı
 */
export const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        success: false,
        error: `Aradığınız uç nokta bulunamadı: ${req.method} ${req.originalUrl}`
    });
};