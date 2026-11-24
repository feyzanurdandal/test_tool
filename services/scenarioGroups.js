// Senaryo grupları (DPU Base tablosu: senaryo_gruplari).
// Satır = bir grup: { id (sistem), project_id, test_tipi ('UI'|'SECURITY'), grup_adi, senaryo_idleri (JSON, SIRALI senaryo kimlikleri) }.
// Bir senaryo birden fazla gruba girebilir; gruplar proje + test türü bazındadır; liste sırası toplu çalıştırma sırasıdır.
// Aynı grubu aynı anda iki istek değiştirirse biri diğerini ezmesin diye işlemler grup (veya proje+tür) bazında sırayla yürütülür
// (tek sunucu süreci için; birden çok sunucu örneğinde DPU tarafında kilit yoktur).
import dpu from '../config/dpuService.js';

export const GROUP_TABLE = 'senaryo_gruplari';
export const MAX_GROUPS = 50;
export const MAX_MEMBERS = 200;

export class GroupError extends Error {
    constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

// ── Sırayla yürütme (anahtar başına) ──
const tails = new Map();
export function withLock(key, fn) {
    const prev = tails.get(key) || Promise.resolve();
    const run = prev.then(fn);
    const tail = run.then(() => {}, () => {});
    tails.set(key, tail);
    tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return run;
}

const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
const typeOf = (t) => (String(t || 'UI').toUpperCase() === 'SECURITY' ? 'SECURITY' : 'UI');

/** JSON alanı dizi, JSON metni veya boş olabilir; her durumda tekil, sıralı kimlik dizisi (metin) döner. */
export function parseIds(value) {
    let v = value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter(x => x !== null && x !== undefined && x !== '').map(String))];
}

const toGroup = (row) => ({
    id: String(row.id),
    name: String(row.grup_adi ?? ''),
    testType: typeOf(row.test_tipi),
    projectId: String(row.project_id ?? ''),
    scenarioIds: parseIds(row.senaryo_idleri),
});

async function loadRows(projectId, testType) {
    const filters = { project_id: { eq: String(projectId) } };
    if (testType) filters.test_tipi = { eq: typeOf(testType) };
    const res = await dpu.selectWhere(GROUP_TABLE, filters);
    if (!res?.success) throw new GroupError(`Gruplar okunamadı${res?.error ? `: ${res.error}` : ''}. "${GROUP_TABLE}" tablosunu ve yetkilerini kontrol edin.`, 502);
    // JS tarafı da süzer (servis filtreyi yok sayarsa başka projenin grubu görünmesin)
    return (res.data || []).filter(r => String(r.project_id) === String(projectId) && (!testType || typeOf(r.test_tipi) === typeOf(testType)));
}

/** Projenin (ve türün) grupları, ada göre sıralı. */
export async function listGroups(projectId, testType) {
    const rows = await loadRows(projectId, testType);
    return rows.map(toGroup).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function checkName(name, groups, exceptId = null) {
    const f = fold(name);
    if (!f) throw new GroupError('Grup adı boş bırakılamaz!');
    if (groups.some(g => g.id !== exceptId && fold(g.name) === f)) throw new GroupError('Bu projede ve test türünde bu adla bir grup zaten var!');
}

export function createGroup({ projectId, testType, name, scenarioIds = [] }) {
    const type = typeOf(testType);
    return withLock(`c:${projectId}:${type}`, async () => {
        const groups = (await loadRows(projectId, type)).map(toGroup);
        if (groups.length >= MAX_GROUPS) throw new GroupError(`Bir projede/türde en fazla ${MAX_GROUPS} grup olabilir.`);
        checkName(name, groups);
        const ids = parseIds(scenarioIds).slice(0, MAX_MEMBERS);
        const res = await dpu.insert(GROUP_TABLE, { project_id: String(projectId), test_tipi: type, grup_adi: name.trim(), senaryo_idleri: ids });
        if (!res?.success) throw new GroupError('Grup oluşturulamadı (veritabanı hatası).', 502);
        let id = res.data?.id ?? res.data?.insertId ?? null;
        if (id == null) id = (await loadRows(projectId, type)).map(toGroup).find(g => fold(g.name) === fold(name))?.id;
        return { id: String(id), name: name.trim(), testType: type, projectId: String(projectId), scenarioIds: ids };
    });
}

export function renameGroup({ projectId, testType, groupId, name }) {
    const type = typeOf(testType);
    return withLock(`c:${projectId}:${type}`, async () => {
        const groups = (await loadRows(projectId, type)).map(toGroup);
        const group = groups.find(g => g.id === String(groupId));
        if (!group) throw new GroupError('Grup bulunamadı.', 404);
        checkName(name, groups, group.id);
        const res = await dpu.update(GROUP_TABLE, group.id, { grup_adi: name.trim() });
        if (!res?.success) throw new GroupError('Grup yeniden adlandırılamadı.', 502);
        return { ...group, name: name.trim() };
    });
}

/** Yalnızca grubu siler; senaryolara dokunmaz. */
export function deleteGroup({ projectId, testType, groupId }) {
    return withLock(`g:${groupId}`, async () => {
        const group = (await loadRows(projectId, testType)).map(toGroup).find(g => g.id === String(groupId));
        if (!group) throw new GroupError('Grup bulunamadı.', 404);
        const res = await dpu.delete(GROUP_TABLE, group.id);
        if (!res?.success) throw new GroupError('Grup silinemedi.', 502);
        return group;
    });
}

// Grubun taze halini kilit altında okuyup değiştirir (eski veriyle ezme olmaz). mutator(ids, group) → yeni dizi veya null (değişiklik yok).
function mutateGroup({ projectId, testType, groupId }, mutator) {
    return withLock(`g:${groupId}`, async () => {
        const row = await dpu.findOne(GROUP_TABLE, { id: { eq: String(groupId) } });
        const group = row ? toGroup(row) : null;
        if (!group || group.projectId !== String(projectId) || group.testType !== typeOf(testType)) throw new GroupError('Grup bulunamadı.', 404);
        const next = mutator(group.scenarioIds, group);
        if (next === null || (next.length === group.scenarioIds.length && next.every((id, i) => id === group.scenarioIds[i]))) return group;
        if (next.length > MAX_MEMBERS) throw new GroupError(`Bir grupta en fazla ${MAX_MEMBERS} senaryo olabilir.`);
        const res = await dpu.update(GROUP_TABLE, group.id, { senaryo_idleri: next });
        if (!res?.success) throw new GroupError('Grup güncellenemedi (veritabanı hatası).', 502);
        return { ...group, scenarioIds: next };
    });
}

/** Üye ekle (sona eklenir, tekrar etmez) ve/veya çıkar. */
export function updateMembers({ projectId, testType, groupId, add = [], remove = [] }) {
    const addIds = parseIds(add); const removeSet = new Set(parseIds(remove));
    return mutateGroup({ projectId, testType, groupId }, (ids) => {
        const kept = ids.filter(id => !removeSet.has(id));
        for (const id of addIds) if (!kept.includes(id) && !removeSet.has(id)) kept.push(id);
        return kept;
    });
}

/** Grup içi sıra: verilen sıra, mevcut üyelerin birebir aynı kümesi olmalıdır. */
export function reorderMembers({ projectId, testType, groupId, orderedIds }) {
    const wanted = parseIds(orderedIds);
    return mutateGroup({ projectId, testType, groupId }, (ids) => {
        if (wanted.length !== ids.length || new Set(wanted).size !== ids.length || !wanted.every(id => ids.includes(id))) {
            throw new GroupError('Sıralama listesi grubun mevcut üyeleriyle uyuşmuyor; sayfayı yenileyip tekrar deneyin.', 409);
        }
        return wanted;
    });
}

/** Bir senaryonun grup üyeliklerini verilen küme yapar: seçilenlere (sona) ekler, seçilmeyenlerden çıkarır. */
export async function assignScenario({ projectId, testType, scenarioId, groupIds }) {
    const wanted = new Set(parseIds(groupIds));
    const sid = String(scenarioId);
    const groups = await listGroups(projectId, testType);
    for (const id of wanted) if (!groups.some(g => g.id === id)) throw new GroupError('Seçilen gruplardan biri bulunamadı.', 404);
    for (const g of groups) {
        const isMember = g.scenarioIds.includes(sid);
        if (wanted.has(g.id) && !isMember) await updateMembers({ projectId, testType, groupId: g.id, add: [sid] });
        else if (!wanted.has(g.id) && isMember) await updateMembers({ projectId, testType, groupId: g.id, remove: [sid] });
    }
    return listGroups(projectId, testType);
}

/** Senaryo silindiğinde tüm gruplardan çıkarır (en iyi çaba; hata fırlatmaz). */
export async function removeScenarioEverywhere(projectId, scenarioId) {
    try {
        const sid = String(scenarioId);
        const rows = (await loadRows(projectId, null)).map(toGroup).filter(g => g.scenarioIds.includes(sid));
        for (const g of rows) await updateMembers({ projectId, testType: g.testType, groupId: g.id, remove: [sid] });
    } catch (err) {
        console.error('[Senaryo grupları] silinen senaryo gruplardan çıkarılamadı:', err.message);
    }
}
