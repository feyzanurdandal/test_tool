import { diagnosticIdFromReport, loadDiagnostic, deleteDiagnostic } from '../services/diagnosticService.js';
import express from 'express';
import dpu from '../config/dpuService.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireProjectAccess } from '../utils/projectGuard.js';
import { listScenariosSchema, deleteReportSchema, deleteReportsBatchSchema } from '../schemas/scenarioSchemas.js';
import { getProjectByName, userHasProjectAccess } from '../services/projectService.js';

const router = express.Router();

// ─── PROJE BAZLI RAPORLARI LİSTELEME ───
router.get('/reports/list', requireAuth, validate(listScenariosSchema), requireProjectAccess, async (req, res, next) => {
    const selectedProj = String(req.query.project || req.query.projectName || '').trim();
    const testType = String(req.query.testType || 'UI').toUpperCase();
    if (!selectedProj) return res.json({ reports: [] });

    try {
        const project = await getProjectByName(selectedProj);
        if (!project) return res.json({ reports: [] });

        const reportsRes = await dpu.selectWhere('raporlar', { project_id: { eq: project.id } });
        if (!reportsRes.success || !reportsRes.data) return res.json({ reports: [] });

        const reports = reportsRes.data
            .filter(r => (r.test_tipi || 'UI').toUpperCase() === testType)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return res.json({ success: true, reports });
    } catch (error) {
        next(error);
    }
});

// Raporun projesini bulup kullanıcının yetkisini denetler.
// Proje bulunamazsa ADMIN dışındaki kullanıcılar için erişim REDDEDİLİR.
async function canManageReport(user, report, projectsById) {
    if (user.role === 'ADMIN') return true;
    const project = projectsById.get(String(report.project_id));
    if (!project) return false;
    return userHasProjectAccess(user, project.proje_adi);
}

async function loadProjectsById() {
    const res = await dpu.selectAll('projeler');
    if (!res.success) throw new Error('Projeler okunamadı.');
    return new Map(res.data.map(p => [String(p.id), p]));
}

// Same report/project authorization for metadata and screenshots; no public files.
router.get(['/reports/:id/diagnostic','/reports/:id/diagnostic/screenshot'], requireAuth, async (req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!/^[0-9]+$/.test(req.params.id))return res.status(400).json({error:'Geçersiz rapor.'});
    try {
        const report=await dpu.findOne('raporlar',{id:{eq:req.params.id}});
        if(!report)return res.status(404).json({error:'Rapor bulunamadı.'});
        const projects=req.user.role==='ADMIN'?new Map():await loadProjectsById();
        if(!await canManageReport(req.user,report,projects))return res.status(403).json({error:'Bu projeye erişim yetkiniz yok.'});
        const record=await loadDiagnostic(diagnosticIdFromReport(report),report.project_id);
        if(!record)return res.status(404).json({error:'Tanı kaydı yok veya 24 saatlik saklama süresi doldu.'});
        if(req.path.endsWith('/screenshot')) {
            if(!record.screenshot)return res.status(404).json({error:'Ekran görüntüsü alınamadı.'});
            return res.type('image/png').send(Buffer.from(record.screenshot,'base64'));
        }
        return res.json({metadata:record.metadata,hasScreenshot:!!record.screenshot,expiresAt:record.expiresAt});
    }catch(error){next(error);}
});

// ─── TEKİL RAPOR SİLME ───
router.post('/reports/delete', requireAuth, validate(deleteReportSchema), async (req, res, next) => {
    const { id } = req.body;

    try {
        const report = await dpu.findOne('raporlar', { id: { eq: id } });
        if (!report) return res.status(404).json({ error: 'Silinecek rapor bulunamadı.' });

        const projectsById = req.user.role === 'ADMIN' ? new Map() : await loadProjectsById();
        if (!(await canManageReport(req.user, report, projectsById))) {
            return res.status(403).json({ error: 'Erişim Engellendi: Bu rapora ait projede silme yetkiniz yok!' });
        }

        const deleteResult = await dpu.delete('raporlar', report.id);
        if (deleteResult.success) { await deleteDiagnostic(diagnosticIdFromReport(report)); return res.json({ success: true, message: 'Test raporu başarıyla silindi!' }); }
        return res.status(500).json({ error: 'Silme işlemi veritabanında başarısız oldu.' });
    } catch (error) {
        next(error);
    }
});

// ─── TOPLU RAPOR SİLME ───
// Projeler bir kez yüklenir; eskiden her rapor için ayrı proje sorgusu atılıyordu.
router.post('/reports/delete-batch', requireAuth, validate(deleteReportsBatchSchema), async (req, res, next) => {
    const ids = [...new Set(req.body.ids.map(String))];

    try {
        const projectsById = req.user.role === 'ADMIN' ? new Map() : await loadProjectsById();
        let deletedCount = 0;
        let deniedCount = 0;

        for (const id of ids) {
            const report = await dpu.findOne('raporlar', { id: { eq: id } });
            if (!report) continue;

            if (!(await canManageReport(req.user, report, projectsById))) {
                deniedCount++;
                continue;
            }

            const deleteResult = await dpu.delete('raporlar', report.id);
            if (deleteResult.success) { deletedCount++; await deleteDiagnostic(diagnosticIdFromReport(report)); }
        }

        return res.json({
            success: true,
            message: `${deletedCount} adet rapor başarıyla silindi.` + (deniedCount ? ` ${deniedCount} rapor için yetkiniz yoktu.` : '')
        });
    } catch (error) {
        next(error);
    }
});

export default router;
