import express from 'express';
import dpu from '../config/dpuService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createProjectSchema, updateProjectSchema, deleteProjectSchema } from '../schemas/scenarioSchemas.js';
import {
    getProjectByName, invalidateProjects, getUserProjectNames, invalidatePermissions
} from '../services/projectService.js';

const router = express.Router();
const DEFAULT_PROJECT = 'Varsayılan Proje';
const sanitizeProjectName = (name) => String(name || '').replace(/[^a-zA-Z0-9\s_-]/g, '').trim();

// ─── PROJELERİ LİSTELEME ───
router.get('/projects/list', requireAuth, async (req, res, next) => {
    try {
        const result = await dpu.selectAll('projeler');
        if (!result.success) {
            return res.status(500).json({ error: 'DPU Base listeleme hatası' });
        }

        let allProjects = result.data;

        if (req.user.role !== 'ADMIN') {
            const allowed = await getUserProjectNames(req.user.username);
            allProjects = allProjects.filter(p => allowed.includes(String(p.proje_adi || '').toLowerCase()));
        }

        if (allProjects.length === 0 && req.user.role === 'ADMIN') {
            await dpu.insert('projeler', { proje_adi: DEFAULT_PROJECT, hata_anahtar_kelimeleri: '' });
            invalidateProjects();
            return res.json({
                success: true,
                projects: [DEFAULT_PROJECT],
                projectDetails: [{ proje_adi: DEFAULT_PROJECT, hata_anahtar_kelimeleri: '' }]
            });
        }

        return res.json({
            success: true,
            projects: allProjects.map(p => p.proje_adi),
            projectDetails: allProjects.map(p => ({
                id: p.id,
                proje_adi: p.proje_adi,
                hata_anahtar_kelimeleri: p.hata_anahtar_kelimeleri || ''
            }))
        });
    } catch (error) {
        next(error);
    }
});

// ─── YENİ PROJE (ADMIN) ───
router.post('/projects/create', requireAuth, requireAdmin, validate(createProjectSchema), async (req, res, next) => {
    const { projectName, customErrorKeywords } = req.body;
    const name = sanitizeProjectName(projectName);
    if (!name) return res.status(400).json({ error: 'Geçersiz proje adı!' });

    try {
        if (await getProjectByName(name)) {
            return res.status(400).json({ error: 'Bu isimde bir proje zaten mevcut!' });
        }

        const result = await dpu.insert('projeler', { proje_adi: name, hata_anahtar_kelimeleri: customErrorKeywords || '' });
        invalidateProjects();
        if (result.success) return res.json({ success: true, projectName: name });
        return res.status(500).json({ error: 'DPU Base proje kayıt hatası' });
    } catch (error) {
        next(error);
    }
});

// ─── PROJE SİLME (ADMIN) ───
// Proje ile birlikte senaryoları, raporları ve kullanıcı yetkileri de silinir;
// aksi halde erişilemeyen öksüz kayıtlar veritabanında kalıyordu.
router.post('/projects/delete', requireAuth, requireAdmin, validate(deleteProjectSchema), async (req, res, next) => {
    const projectName = req.body.projectName.trim();
    if (projectName === DEFAULT_PROJECT) {
        return res.status(400).json({ error: 'Varsayılan proje silinemez!' });
    }

    try {
        const project = await getProjectByName(projectName);
        if (!project) return res.status(404).json({ error: 'Silinecek proje bulunamadı!' });

        const deleteRes = await dpu.delete('projeler', project.id);
        if (!deleteRes.success) {
            return res.status(500).json({ error: 'Proje silinirken veritabanı hatası oluştu.' });
        }
        invalidateProjects();

        const cleanups = [
            ['senaryolar', { project_id: { eq: project.id } }],
            ['raporlar', { project_id: { eq: project.id } }],
            ['kullanici_projeleri', { proje_adi: { eq: projectName } }],
        ];
        for (const [table, filter] of cleanups) {
            const rows = await dpu.selectWhere(table, filter);
            if (rows.success && rows.data) {
                for (const row of rows.data) await dpu.delete(table, row.id);
            }
        }
        invalidatePermissions();

        return res.json({ success: true, message: `"${projectName}" projesi, senaryoları, raporları ve kullanıcı yetkileri silindi.` });
    } catch (error) {
        next(error);
    }
});

// ─── PROJE GÜNCELLEME (İsim & Hata Kelimeleri) ───
router.post('/projects/update', requireAuth, requireAdmin, validate(updateProjectSchema), async (req, res, next) => {
    const oldName = req.body.oldProjectName.trim();
    const newName = sanitizeProjectName(req.body.newProjectName);
    const { customErrorKeywords } = req.body;

    if (oldName === DEFAULT_PROJECT && newName !== DEFAULT_PROJECT) {
        return res.status(400).json({ error: 'Varsayılan projenin adı değiştirilemez!' });
    }
    if (!newName) return res.status(400).json({ error: 'Geçersiz yeni proje adı!' });

    try {
        const project = await getProjectByName(oldName);
        if (!project) return res.status(404).json({ error: 'Güncellenecek proje bulunamadı!' });

        const isRename = oldName !== newName;
        if (isRename) {
            const existing = await getProjectByName(newName);
            if (existing && String(existing.id) !== String(project.id)) {
                return res.status(400).json({ error: 'Bu isimde bir proje zaten mevcut!' });
            }
        }

        const updateRes = await dpu.update('projeler', project.id, {
            proje_adi: newName,
            hata_anahtar_kelimeleri: customErrorKeywords || ''
        });
        if (!updateRes.success) {
            return res.status(500).json({ error: 'Proje güncellenirken veritabanı hatası oluştu.' });
        }
        invalidateProjects();

        // Yetki tablosu projeye adıyla bağlı olduğu için yeniden adlandırma yayılır
        if (isRename) {
            const permsRes = await dpu.selectWhere('kullanici_projeleri', { proje_adi: { eq: oldName } });
            if (permsRes.success && permsRes.data) {
                for (const perm of permsRes.data) {
                    await dpu.update('kullanici_projeleri', perm.id, { proje_adi: newName });
                }
            }
            invalidatePermissions();
        }

        return res.json({ success: true, projectName: newName, message: 'Proje bilgileri başarıyla güncellendi.' });
    } catch (error) {
        next(error);
    }
});

export default router;
