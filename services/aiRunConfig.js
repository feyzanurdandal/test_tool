import { getSettingsRows } from './settingsService.js';
import { decrypt } from '../utils/cryptoHelper.js';

// Test koşucusunun (Stagehand) kullanacağı AI sağlayıcı ayarlarını ANA süreçte çözer.
// Çözülmüş anahtar yalnızca o koşunun geçici adım dosyasıyla (0600) çocuk sürece verilir;
// böylece çocuk süreç ve açtığı Chromium DPU/JWT/ENCRYPTION gizli anahtarlarını görmez.

const DEFAULT_MODELS = { openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash' };

export async function loadRunnerAiConfig() {
    let chosenApi = 'openai';
    let model = '';
    let apiKey = process.env.OPENAI_API_KEY;
    let customBaseUrl = null;

    const rows = await getSettingsRows();
    const activeRunnerRow = rows.find(r => r.ayar_anahtar === 'test_runner_api');
    if (activeRunnerRow) {
        chosenApi = String(activeRunnerRow.ayar_deger || chosenApi);
        const providerRow = rows.find(r => r.ayar_anahtar === chosenApi);
        if (providerRow) {
            try {
                apiKey = decrypt(providerRow.ayar_deger);
            } catch {
                throw new Error(`"${chosenApi}" sağlayıcısının API anahtarı çözülemedi (ENCRYPTION_KEY değişmiş olabilir). Ayarlar'dan anahtarı yeniden girin.`);
            }
            model = String(providerRow.ayar_model || '').trim();
        }
    }

    const api = chosenApi.toLowerCase();
    if (api.includes('openai')) {
        model = model || DEFAULT_MODELS.openai;
        if (!model.startsWith('openai/')) model = `openai/${model}`;
    } else if (api.includes('gemini')) {
        model = model || DEFAULT_MODELS.gemini;
        if (!model.startsWith('google/') && !model.startsWith('gemini/')) model = `google/${model}`;
    } else if (api.includes('qwen') || api.includes('local') || api.includes('dpu')) {
        customBaseUrl = 'https://ai.dpu.edu.tr/api';
        if (!model) throw new Error(`"${chosenApi}" sağlayıcısı için model adı tanımlı değil.`);
        if (!model.startsWith('openai/')) model = `openai/${model}`;
    } else {
        model = model || DEFAULT_MODELS.openai;
        if (!model.includes('/')) model = `openai/${model}`;
    }

    // Anahtar yoksa saf kayıt (AI gerektirmeyen) senaryolar yine çalışır; AI adımı varsa sağlayıcı hata verir.
    if (!apiKey) console.warn(`[Test Runner] "${chosenApi}" için API anahtarı tanımlı değil; yalnızca kayıtlı/JSON adımlar çalışabilir.`);
    return { chosenApi, model, apiKey, customBaseUrl };
}
