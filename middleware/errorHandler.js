
 //1. Tekil Controller/Route Hataları İçin Yardımcı Fonksiyon

export const sendServerError = (res, err, customMessage = "Sunucu Hatası", context = "General") => {
    console.error(`🚨 [${context} Error]:`, err);
    
    const isProduction = process.env.NODE_ENV === 'production';

    return res.status(500).json({
        success: false,
        error: customMessage,
        ...(isProduction ? {} : { details: err.message })
    });
};


 //2. Express Global Hata Yakalama Middleware'i

export const globalErrorHandler = (err, req, res, next) => {
    console.error("🚨 [Global Error Handler]:", err);

    const statusCode = err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';

    res.status(statusCode).json({
        success: false,
        error: isProduction 
            ? "Sunucuda beklenmeyen bir hata oluştu." 
            : (err.message || "Sunucu Hatası"),
        ...(isProduction ? {} : { stack: err.stack, details: err.details })
    });
};


//3. 404 Bulunamadı Yakalayıcısı

export const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        success: false,
        error: `Aradığınız uç nokta bulunamadı: ${req.method} ${req.originalUrl}`
    });
};