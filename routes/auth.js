import express from 'express';
import bcrypt from 'bcryptjs';
import { loginLimiter } from '../middleware/rateLimit.js';
import { requireAuth, signSession, sessionCookieOptions, SESSION_COOKIE } from '../middleware/auth.js';
import { findUserByName } from '../services/userService.js';

const router = express.Router();

// Kullanıcı bulunamadığında da bcrypt karşılaştırması yapılır (zamanlama saldırısı koruması)
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUUWXYZ123456';

router.post('/login', loginLimiter, async (req, res, next) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
        return res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur!' });
    }

    try {
        const user = await findUserByName(username, { fresh: true });
        const isMatch = await bcrypt.compare(password, user ? user.sifre : DUMMY_HASH);

        if (!user || !isMatch) {
            return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı!' });
        }

        const role = String(user.rol || 'USER').toUpperCase();
        res.cookie(SESSION_COOKIE, signSession(user.kullanici_adi), sessionCookieOptions(req));

        // Token artık yanıt gövdesinde dönmez; yalnızca httpOnly çerezde tutulur.
        return res.json({ success: true, role, username: user.kullanici_adi });
    } catch (err) {
        next(err);
    }
});

router.post('/logout', (req, res) => {
    const { maxAge, ...opts } = sessionCookieOptions(req);
    res.clearCookie(SESSION_COOKIE, opts);
    return res.json({ success: true });
});

// Sayfa açılışında oturumun hâlâ geçerli olup olmadığını doğrular
router.get('/me', requireAuth, (req, res) => {
    return res.json({ success: true, username: req.user.username, role: req.user.role });
});

export default router;
