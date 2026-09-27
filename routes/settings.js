import express from 'express';
import dpu from '../config/dpuService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { saveSettingsSchema } from '../schemas/scenarioSchemas.js';
import { encrypt, decrypt } from '../utils/cryptoHelper.js';
import {
    getSettingsRows, invalidateSettings, SYSTEM_KEYS, maskKey, isMaskedValue
} from '../services/settingsService.js';

const router = express.Router();

// ─── AYARLARI GETİRME ───
// API anahtarları tarayıcıya asla açık metin olarak gönderilmez, maskelenir.
router.get('/settings/get', requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const rows = await getSettingsRows();
        const settings = { testRunnerApi: 'openai', translatorApi: 'gemini', apiKeys: {} };

        rows.forEach(row => {
            if (row.ayar_anahtar === 'test_runner_api') settings.testRunnerApi = row.ayar_deger;
            else if (row.ayar_anahtar === 'translator_api') settings.translatorApi = row.ayar_deger;
            else {
                let plain = '';
                try {
                    plain = decrypt(row.ayar_deger || '') || '';
                } catch {
                    plain = '';
                }
                settings.apiKeys[row.ayar_anahtar] = { key: maskKey(plain), model: row.ayar_model || '' };
            }
        });

        return res.json({ success: true, settings });
    } catch (err) {
        next(err);
    }
});

// ─── AYARLARI KAYDETME ───
router.post('/settings/save', requireAuth, requireAdmin, validate(saveSettingsSchema), async (req, res, next) => {
    const { testRunnerApi, translatorApi, apiKeys } = req.body;

    const providers = Object.keys(apiKeys);
    for (const [label, value] of [['Test çalıştırıcı', testRunnerApi], ['Çeviri', translatorApi]]) {
        if (!providers.includes(value)) {
            return res.status(400).json({ error: `${label} sağlayıcısı (${value}) API anahtarları listesinde yok!` });
        }
    }

    try {
        invalidateSettings();
        const existingRows = await getSettingsRows();
        const byKey = new Map(existingRows.map(r => [r.ayar_anahtar, r]));
        const nowIso = new Date().toISOString();

        const target = new Map([
            ['test_runner_api', { val: testRunnerApi, model: null }],
            ['translator_api', { val: translatorApi, model: null }],
        ]);

        for (const [provider, details] of Object.entries(apiKeys)) {
            const existing = byKey.get(provider);
            let val;
            if (isMaskedValue(details.key)) {
                // Kullanıcı anahtarı değiştirmedi: mevcut şifreli değeri koru
                if (!existing) {
                    return res.status(400).json({ error: `"${provider}" için API anahtarını yeniden girmeniz gerekiyor.` });
                }
                val = existing.ayar_deger;
            } else {
                val = details.key ? encrypt(details.key.trim()) : '';
            }
            target.set(provider, { val, model: details.model || '' });
        }

        for (const [key, details] of target) {
            const existing = byKey.get(key);
            const payload = { ayar_anahtar: key, ayar_deger: details.val, ayar_model: details.model, updated_at: nowIso };

            let result;
            if (existing) {
                if (existing.ayar_deger === details.val && (existing.ayar_model ?? null) === details.model) continue;
                // Eskiden sil + ekle yapılıyordu; araya hata girerse ayar kayboluyordu
                result = await dpu.update('ayarlar', existing.id, payload);
            } else {
                result = await dpu.insert('ayarlar', { ...payload, created_at: nowIso });
            }
            if (!result?.success) throw new Error(`"${key}" ayarı kaydedilemedi.`);
        }

        for (const row of existingRows) {
            if (!SYSTEM_KEYS.includes(row.ayar_anahtar) && !target.has(row.ayar_anahtar)) {
                await dpu.delete('ayarlar', row.id);
            }
        }

        invalidateSettings();
        return res.json({ success: true, message: 'Ayarlar başarıyla kaydedildi.' });
    } catch (err) {
        invalidateSettings();
        next(err);
    }
});

export default router;
