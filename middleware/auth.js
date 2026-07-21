import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET || 'dpu_secure_production_secret_key_2026_x89f';

// 1. Kimlik Doğrulama Middleware'i (Login Olunmuş Mu?)
export function requireAuth(req, res, next) {
    const token = req.headers['x-user-token'];

    if (!token) {
        return res.status(401).json({ error: "Oturum bulunamadı! Lütfen giriş yapın." });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded; // { username: '...', role: '...' } bilgisini isteğe yapıştırıyoruz
        next();
    } catch (err) {
        return res.status(401).json({ error: "Geçersiz veya süresi dolmuş oturum! Lütfen tekrar giriş yapın." });
    }
}

// 2. Admin Yetki Kontrolü Middleware'i (Sadece ADMIN Yetkili İse)
export function requireAdmin(req, res, next) {
    // requireAuth'tan geçen kullanıcının rolüne bakıyoruz
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Yetkisiz işlem! Bu alan için ADMIN yetkisi gereklidir." });
    }
    next();
}