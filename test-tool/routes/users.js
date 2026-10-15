import express from 'express';
import bcrypt from 'bcryptjs';
import dpu from '../config/dpuService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createUserSchema, updateUserSchema, deleteUserSchema } from '../schemas/scenarioSchemas.js';
import { findUserByName, invalidateUser } from '../services/userService.js';
import { invalidatePermissions } from '../services/projectService.js';

import { revokeUserSessions } from '../services/sessionService.js';

const router = express.Router();
const lower = (v) => String(v || '').trim().toLowerCase();

async function replaceUserProjects(oldUsername, newUsername, selectedProjects) {
    const permsRes = await dpu.selectWhere('kullanici_projeleri', { kullanici_adi: { eq: lower(oldUsername) } });
    if (permsRes.success && permsRes.data) {
        for (const perm of permsRes.data) await dpu.delete('kullanici_projeleri', perm.id);
    }
    if (Array.isArray(selectedProjects)) {
        for (const proj of [...new Set(selectedProjects)]) {
            await dpu.insert('kullanici_projeleri', { kullanici_adi: newUsername, proje_adi: proj });
        }
    }
    invalidatePermissions(oldUsername);
    invalidatePermissions(newUsername);
}

// ─── KULLANICILARI LİSTELEME ───
router.get('/users/list', requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const [usersRes, projectsRes, permsRes] = await Promise.all([
            dpu.selectAll('kullanicilar'),
            dpu.selectAll('projeler'),
            dpu.selectAll('kullanici_projeleri'),
        ]);
        if (!usersRes.success) return res.status(500).json({ error: 'Kullanıcılar yüklenemedi.' });

        const perms = permsRes.success && permsRes.data ? permsRes.data : [];
        const users = usersRes.data.map(user => ({
            id: user.id,
            kullanici_adi: user.kullanici_adi,
            rol: user.rol,
            projeler: perms.filter(p => lower(p.kullanici_adi) === lower(user.kullanici_adi)).map(p => p.proje_adi)
        }));

        return res.json({ success: true, users, allProjects: projectsRes.success ? projectsRes.data.map(p => p.proje_adi) : [] });
    } catch (err) {
        next(err);
    }
});

// ─── YENİ KULLANICI ───
router.post('/users/create', requireAuth, requireAdmin, validate(createUserSchema), async (req, res, next) => {
    const { username, password, role, selectedProjects } = req.body;

    try {
        if (await findUserByName(username, { fresh: true })) {
            return res.status(400).json({ error: 'Bu kullanıcı adı zaten mevcut!' });
        }

        const userInsert = await dpu.insert('kullanicilar', {
            kullanici_adi: username,
            sifre: await bcrypt.hash(password, 10),
            rol: role.toUpperCase()
        });
        if (!userInsert.success) return res.status(500).json({ error: 'Kullanıcı eklenemedi.' });

        await replaceUserProjects(username, username, selectedProjects);
        invalidateUser(username);
        return res.json({ success: true, message: 'Kullanıcı başarıyla oluşturuldu!' });
    } catch (err) {
        next(err);
    }
});

// ─── KULLANICI SİLME ───
router.post('/users/delete', requireAuth, requireAdmin, validate(deleteUserSchema), async (req, res, next) => {
    const { id } = req.body;

    try {
        const user = await dpu.findOne('kullanicilar', { id: { eq: id } });
        if (!user) return res.status(404).json({ error: 'Silinecek kullanıcı bulunamadı.' });

        if (lower(user.kullanici_adi) === lower(req.user.username)) {
            return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
        }

        const deleteUser = await dpu.delete('kullanicilar', user.id);
        if (!deleteUser.success) return res.status(500).json({ error: 'Kullanıcı silinemedi.' });

        await revokeUserSessions(user.id);
        // Yetkiler istemcinin gönderdiği addan değil, veritabanındaki gerçek addan silinir
        await replaceUserProjects(user.kullanici_adi, user.kullanici_adi, []);
        invalidateUser(user.kullanici_adi);
        return res.json({ success: true, message: 'Kullanıcı ve yetkileri silindi!' });
    } catch (err) {
        next(err);
    }
});

// ─── KULLANICI GÜNCELLEME ───
router.post('/users/update', requireAuth, requireAdmin, validate(updateUserSchema), async (req, res, next) => {
    const { id, username, password, role, selectedProjects } = req.body;

    try {
        const existingUser = await dpu.findOne('kullanicilar', { id: { eq: id } });
        if (!existingUser) return res.status(404).json({ error: 'Güncellenecek kullanıcı bulunamadı.' });

        const isRename = lower(existingUser.kullanici_adi) !== lower(username);
        if (isRename && await findUserByName(username, { fresh: true })) {
            return res.status(400).json({ error: 'Bu kullanıcı adı zaten mevcut!' });
        }

        const finalRole = role ? role.toUpperCase() : String(existingUser.rol || 'USER').toUpperCase();
        const isSelf = lower(existingUser.kullanici_adi) === lower(req.user.username);
        if (isSelf && finalRole !== 'ADMIN') {
            return res.status(400).json({ error: 'Kendi ADMIN yetkinizi kaldıramazsınız.' });
        }

        const updateRes = await dpu.update('kullanicilar', existingUser.id, {
            kullanici_adi: username,
            sifre: password && password.trim() !== '' ? await bcrypt.hash(password, 10) : existingUser.sifre,
            rol: finalRole
        });
        if (!updateRes?.success) {
            return res.status(500).json({ error: 'Kullanıcı bilgileri güncellenirken veritabanı hatası oluştu.' });
        }

        if (password || isRename || finalRole !== String(existingUser.rol || 'USER').toUpperCase()) await revokeUserSessions(existingUser.id);

        // Eski addaki yetkiler silinir (eskiden yeni adla aranıyordu ve eski yetkiler öksüz kalıyordu)
        if (Array.isArray(selectedProjects)) {
            await replaceUserProjects(existingUser.kullanici_adi, username, selectedProjects);
        } else if (isRename) {
            const permsRes = await dpu.selectWhere('kullanici_projeleri', { kullanici_adi: { eq: lower(existingUser.kullanici_adi) } });
            await replaceUserProjects(existingUser.kullanici_adi, username, (permsRes.data || []).map(p => p.proje_adi));
        }

        invalidateUser(existingUser.kullanici_adi);
        invalidateUser(username);
        return res.json({ success: true, message: 'Kullanıcı bilgileri ve yetkileri başarıyla güncellendi!' });
    } catch (err) {
        next(err);
    }
});

export default router;
