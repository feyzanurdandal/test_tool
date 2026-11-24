import express from 'express';
import dpu from '../config/dpuService.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireProjectAccess } from '../utils/projectGuard.js';
import { getProjectByName } from '../services/projectService.js';
import {
    listGroupsSchema, createGroupSchema, renameGroupSchema, deleteGroupSchema, groupMembersSchema, reorderGroupSchema, assignGroupsSchema,
} from '../schemas/groupSchemas.js';
import {
    GroupError, listGroups, createGroup, renameGroup, deleteGroup, updateMembers, reorderMembers, assignScenario,
} from '../services/scenarioGroups.js';

// /api/scenarios/groups/...  Projeye erişimi olan herkes grup oluşturup düzenleyebilir (silme arayüzde onaylanır).
// Her yanıt güncel grup listesini ve (proje+tür) senaryolarını içerir: istemci tek kaynaktan yeniler.
const router = express.Router();

const typeOf = (t) => (String(t || 'UI').toUpperCase() === 'SECURITY' ? 'SECURITY' : 'UI');
const projectNameOf = (req) => String(req.query?.project || req.query?.projectName || req.body?.projectName || '').trim();

async function projectOrFail(req, res) {
    const project = await getProjectByName(projectNameOf(req));
    if (!project) { res.status(404).json({ success: false, error: 'Proje bulunamadı.' }); return null; }
    return project;
}

async function scenariosOf(project, testType) {
    const res = await dpu.selectWhere('senaryolar', { project_id: { eq: project.id } });
    if (!res?.success || !res.data) throw new GroupError('Senaryolar okunamadı.', 502);
    return res.data.filter(s => typeOf(s.test_tipi) === testType).map(s => ({ id: String(s.id), name: s.senaryo_adi }));
}

/** Silinmiş senaryoların kimlikleri yanıttan çıkarılır (veritabanında kalmışsa bile görünmez). */
async function snapshot(project, testType) {
    const [groups, scenarios] = await Promise.all([listGroups(project.id, testType), scenariosOf(project, testType)]);
    const alive = new Set(scenarios.map(s => s.id));
    return {
        groups: groups.map(g => ({ id: g.id, name: g.name, scenarioIds: g.scenarioIds.filter(id => alive.has(id)) })),
        scenarios,
    };
}

const wrap = (handler) => async (req, res, next) => {
    try {
        await handler(req, res);
    } catch (err) {
        if (err instanceof GroupError) return res.status(err.statusCode || 400).json({ success: false, error: err.message });
        next(err);
    }
};

/** Senaryo adlarını kimliğe çevirir; bulunamayanlar ayrıca döner. */
function namesToIds(scenarios, names) {
    const byName = new Map(scenarios.map(s => [s.name, s.id]));
    const ids = []; const unknown = [];
    for (const n of names) (byName.has(n) ? ids.push(byName.get(n)) : unknown.push(n));
    return { ids, unknown };
}

router.get('/groups', requireAuth, validate(listGroupsSchema), requireProjectAccess, wrap(async (req, res) => {
    const project = await projectOrFail(req, res); if (!project) return;
    res.json({ success: true, ...(await snapshot(project, typeOf(req.query.testType))) });
}));

router.post('/groups/create', requireAuth, validate(createGroupSchema), requireProjectAccess, wrap(async (req, res) => {
    const project = await projectOrFail(req, res); if (!project) return;
    const type = typeOf(req.body.testType);
    const { ids } = namesToIds(await scenariosOf(project, type), req.body.scenarioNames);
    const group = await createGroup({ projectId: project.id, testType: type, name: req.body.name, scenarioIds: ids });
    res.json({ success: true, groupId: group.id, ...(await snapshot(project, type)) });
}));

router.post('/groups/rename', requireAuth, validate(renameGroupSchema), requireProjectAccess, wrap(async (req, res) => {
    const project = await projectOrFail(req, res); if (!project) return;
    const type = typeOf(req.body.testType);
    await renameGroup({ projectId: project.id, testType: type, groupId: req.body.groupId, name: req.body.name });
    res.json({ success: true, ...(await snapshot(project, type)) });
}));

router.post('/groups/delete', requireAuth, validate(deleteGroupSchema), requireProjectAccess, wrap(async (req, res) => {
    const project = await projectOrFail(req, res); if (!project) return;
    const type = typeOf(req.body.testType);
    await deleteGroup({ projectId: project.id, testType: type, groupId: req.body.groupId });   // yalnızca grup silinir; senaryolar kalır
    res.json({ success: true, message: 'Grup silindi (senaryolar silinmedi).', ...(await snapshot(project, type)) });
}));

router.post('/groups/members', requireAuth, validate(groupMembersSchema), requireProjectAccess, wrap(async (req, res) => {
    const project = await projectOrFail(req, res); if (!project) return;
    const type = typeOf(req.body.testType);
    const scenarios = await scenariosOf(project, type);
    const add = namesToIds(scenarios, req.body.add);
    const remove = namesToIds(scenarios, req.body.remove);
    await updateMembers({ projectId: project.id, testType: type, groupId: req.body.groupId, add: add.ids, remove: remove.ids });
    res.json({ success: true, skipped: [...add.unknown, ...remove.unknown], ...(await snapshot(project, type)) });
}));

router.post('/groups/reorder', requireAuth, validate(reorderGroupSchema), requireProjectAccess, wrap(async (req, res) => {
    const project = await projectOrFail(req, res); if (!project) return;
    const type = typeOf(req.body.testType);
    const { ids, unknown } = namesToIds(await scenariosOf(project, type), req.body.scenarioNames);
    if (unknown.length) throw new GroupError('Sıralamada bulunamayan senaryo var; sayfayı yenileyin.', 409);
    await reorderMembers({ projectId: project.id, testType: type, groupId: req.body.groupId, orderedIds: ids });
    res.json({ success: true, ...(await snapshot(project, type)) });
}));

// Senaryo formundaki "Gruplar" seçimi: bu senaryonun üye olacağı grupların tamamı
router.post('/groups/assign', requireAuth, validate(assignGroupsSchema), requireProjectAccess, wrap(async (req, res) => {
    const project = await projectOrFail(req, res); if (!project) return;
    const type = typeOf(req.body.testType);
    const { ids } = namesToIds(await scenariosOf(project, type), [req.body.scenarioName]);
    if (!ids.length) throw new GroupError('Senaryo bulunamadı.', 404);
    await assignScenario({ projectId: project.id, testType: type, scenarioId: ids[0], groupIds: req.body.groupIds });
    res.json({ success: true, ...(await snapshot(project, type)) });
}));

export default router;
