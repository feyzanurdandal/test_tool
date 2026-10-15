import dpu from '../config/dpuService.js';
import { TtlCache } from './ttlCache.js';

const projectCache = new TtlCache(30_000);
const permissionCache = new TtlCache(30_000);

const key = (v) => String(v || '').trim().toLowerCase();

export class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 404;
    }
}

/** Proje adına göre proje kaydı (bulunamazsa null). Kısa süreli önbellekli. */
export async function getProjectByName(projectName) {
    const name = String(projectName || '').trim();
    if (!name) return null;
    return projectCache.getOrLoad(key(name), () => dpu.findOne('projeler', { proje_adi: { eq: name } }));
}

/** Proje yoksa 404 fırlatan sürüm */
export async function requireProject(projectName) {
    const project = await getProjectByName(projectName);
    if (!project) throw new NotFoundError('Proje bulunamadı.');
    return project;
}

export function invalidateProjects() {
    projectCache.invalidate();
}

/** Kullanıcının atandığı proje adları (küçük harfli). Kısa süreli önbellekli. */
export async function getUserProjectNames(username) {
    const user = key(username);
    return permissionCache.getOrLoad(user, async () => {
        const res = await dpu.selectWhere('kullanici_projeleri', { kullanici_adi: { eq: user } });
        if (!res.success || !res.data) throw new Error('Kullanıcı yetkileri veritabanından çekilemedi.');
        return res.data.map(p => key(p.proje_adi));
    });
}

export async function userHasProjectAccess(user, projectName) {
    if (user && user.role === 'ADMIN') return true;
    const assigned = await getUserProjectNames(user?.username);
    return assigned.includes(key(projectName));
}

export function invalidatePermissions(username) {
    if (username === undefined) permissionCache.invalidate();
    else permissionCache.invalidate(key(username));
}

/** Projeye ait senaryoyu adıyla getirir (bulunamazsa null) */
export async function getScenario(projectId, scenarioName) {
    return dpu.findOne('senaryolar', {
        project_id: { eq: projectId },
        senaryo_adi: { eq: scenarioName },
    });
}
