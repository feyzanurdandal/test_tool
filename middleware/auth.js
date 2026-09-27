import '../config/env.js';
import jwt from 'jsonwebtoken';
import { findUserByName } from '../services/userService.js';

const SECRET_KEY = process.env.JWT_SECRET;

export const SESSION_COOKIE = 'tt_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function parseCookies(header = '') {
    const cookies = {};
    String(header).split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx < 0) return;
        const name = part.slice(0, idx).trim();
        const raw = part.slice(idx + 1).trim();
        if (!name) return;
        try {
            cookies[name] = decodeURIComponent(raw);
        } catch {
            cookies[name] = raw;
        }
    });
    return cookies;
}

export function signSession(username) {
    return jwt.sign({ username }, SECRET_KEY, { expiresIn: Math.floor(SESSION_TTL_MS / 1000), algorithm: 'HS256' });
}

export function sessionCookieOptions(req) {
    return {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.secure || process.env.COOKIE_SECURE === 'true',
        maxAge: SESSION_TTL_MS,
        path: '/',
    };
}

// 1. Kimlik Doğrulama: oturum httpOnly çerezden okunur (JavaScript erişemez).
//    Kullanıcının hâlâ var olduğu ve güncel rolü veritabanından doğrulanır.
export async function requireAuth(req, res, next) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) {
        return res.status(401).json({ error: 'Oturum bulunamadı! Lütfen giriş yapın.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, SECRET_KEY, { algorithms: ['HS256'] });
    } catch {
        return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum! Lütfen tekrar giriş yapın.' });
    }

    try {
        const user = await findUserByName(decoded.username);
        if (!user) {
            return res.status(401).json({ error: 'Hesap bulunamadı veya silinmiş. Lütfen tekrar giriş yapın.' });
        }
        req.user = {
            id: user.id,
            username: user.kullanici_adi,
            role: String(user.rol || 'USER').toUpperCase(),
        };
        next();
    } catch (err) {
        next(err);
    }
}

// 2. Admin Yetki Kontrolü
export function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Yetkisiz işlem! Bu alan için ADMIN yetkisi gereklidir.' });
    }
    next();
}

// 3. CSRF koruması: çerezle kimlik doğrulandığı için durum değiştiren her
//    API isteğinde özel bir başlık aranır. Başka bir siteden gönderilen düz
//    form/istekler bu başlığı ekleyemez (SameSite=Strict ile birlikte çift katman).
export function requireCsrfHeader(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-Requested-With') !== 'fetch') {
        return res.status(403).json({ error: 'Geçersiz istek kaynağı.' });
    }
    next();
}
