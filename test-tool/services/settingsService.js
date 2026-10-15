import dpu from '../config/dpuService.js';
import { TtlCache } from './ttlCache.js';

const settingsCache = new TtlCache(30_000);

export const SYSTEM_KEYS = ['test_runner_api', 'translator_api'];

// Arayüze gerçek API anahtarı yerine gönderilen maske. Kullanıcı alanı
// değiştirmezse bu değer geri gelir ve mevcut şifreli anahtar korunur.
export const MASK_PREFIX = '••••••••';

export function maskKey(plain) {
    if (!plain) return '';
    const tail = plain.length > 8 ? plain.slice(-4) : '';
    return `${MASK_PREFIX}${tail}`;
}

export function isMaskedValue(value) {
    return typeof value === 'string' && value.startsWith(MASK_PREFIX);
}

/** 'ayarlar' tablosunun tüm satırları (kısa süreli önbellekli) */
export async function getSettingsRows() {
    return settingsCache.getOrLoad('rows', async () => {
        const res = await dpu.selectAll('ayarlar');
        if (!res.success) throw new Error('Ayarlar okunamadı.');
        return res.data || [];
    });
}

export function invalidateSettings() {
    settingsCache.invalidate();
}
