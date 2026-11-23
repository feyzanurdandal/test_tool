import dpu from '../config/dpuService.js';
import { TtlCache } from './ttlCache.js';
import { extractAnalysis, resolveScenarioResult } from './analysisBlock.js';

// Rapor listesi: log içeriği (50 KB'a kadar) listeye KONMAZ. Eskiden her proje listesi tüm
// logları indirip tarayıcıya gönderiyordu; rapor sayısı arttıkça yanıt megabaytlara çıkıyor,
// DPU yanıt boyut sınırına takılınca liste sessizce boş dönüyordu. Log, rapor açılınca
// /reports/detail ile tek tek alınır. Liste 15 sn önbelleğe alınır (20 kullanıcı aynı anda
// raporlara bakınca DPU her seferinde taranmasın).
const listCache = new TtlCache(15_000);
export const REPORT_LIST_MAX = Math.max(50, Number(process.env.REPORT_LIST_MAX) || 1000);

// senaryo_sonucu / senaryo_kaynagi: adım durumundan (status) AYRI sonuç (yapay zeka yorumu + kurallar); yorum yoksa null.
const slim = ({ log_content, ...rest }) => {
    const { analysis } = extractAnalysis(log_content);
    const scenario = resolveScenarioResult({ status: rest.status, testType: rest.test_tipi, analysis });
    return { ...rest, has_log: typeof log_content === 'string' && log_content.length > 0, senaryo_sonucu: scenario?.sonuc ?? null, senaryo_kaynagi: scenario?.kaynak ?? null };
};

export async function listProjectReports(projectId) {
    return listCache.getOrLoad(String(projectId), async () => {
        const res = await dpu.selectWhere('raporlar', { project_id: { eq: projectId } });
        if (!res.success || !res.data) throw new Error(res.error || 'Raporlar okunamadı.');
        const sorted = res.data.map(slim).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return { total: sorted.length, reports: sorted.slice(0, REPORT_LIST_MAX) };
    });
}

export function invalidateReports(projectId) {
    if (projectId === undefined) listCache.invalidate();
    else listCache.invalidate(String(projectId));
}
