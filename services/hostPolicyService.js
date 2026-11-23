import { getSettingsRows } from './settingsService.js';
import { setHostPolicyProvider, parseHostEntries } from '../utils/hostPolicy.js';

// Yönetici izin listesi 'ayarlar' tablosunda tek satır olarak tutulur (ayar_anahtar: allowed_test_hosts).
export const ALLOWED_HOSTS_KEY = 'allowed_test_hosts';

let lastGood = [];

/** Kayıtlı yönetici girişleri. DPU geçici olarak yanıt vermezse son bilinen liste kullanılır. */
export async function loadConfiguredEntries() {
    try {
        const rows = await getSettingsRows();
        const row = rows.find(r => r.ayar_anahtar === ALLOWED_HOSTS_KEY);
        lastGood = parseHostEntries(row?.ayar_deger || '').entries;
    } catch (err) {
        console.warn('[HostPolicy] Ayarlar okunamadı, son bilinen liste kullanılıyor:', err.message);
    }
    return lastGood;
}

export function registerHostPolicy() {
    setHostPolicyProvider(loadConfiguredEntries);
}
