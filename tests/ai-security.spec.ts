// tests/ai-security.spec.ts
import { test, expect } from '@playwright/test';
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CONSTANTS } from '../config/constants.js';
// @ts-ignore
import { decrypt } from '../utils/cryptoHelper.js'; 
// @ts-ignore
import dpu from '../config/dpuService.js';

const ERROR_KEYWORDS = [
    'hata', 'başarısız', 'basarisiz', 'error', 'failed', 'invalid', 
    'uyarı', 'uyari', 'geçersiz', 'gecersiz', 'engellendi', 'yetkisiz',
    'unauthorized', 'forbidden', 'yanlış', 'yanlis', 'incorrect', 'denied'
];

//  Türkçe ve İngilizce büyük/küçük harf duyarsız dinamik regex üretici
function createTurkishInsensitiveRegex(text: string): RegExp {
    const map: Record<string, string> = {
        'i': '[iİıI]', 'ı': '[iİıI]', 'İ': '[iİıI]', 'I': '[iİıI]',
        'g': '[gğGĞ]', 'ğ': '[gğGĞ]', 'G': '[gğGĞ]', 'Ğ': '[gğGĞ]',
        'u': '[uüUÜ]', 'ü': '[uüUÜ]', 'U': '[uüUÜ]', 'Ü': '[uüUÜ]',
        's': '[sşSŞ]', 'ş': '[sşSŞ]', 'S': '[sşSŞ]', 'Ş': '[sşSŞ]',
        'o': '[oöOÖ]', 'ö': '[oöOÖ]', 'O': '[oöOÖ]', 'Ö': '[oöOÖ]',
        'c': '[cçCÇ]', 'ç': '[cçCÇ]', 'C': '[cçCÇ]', 'Ç': '[cçCÇ]'
    };

    let pattern = '';
    for (const char of text) {
        const lower = char.toLowerCase();
        pattern += map[lower] ? map[lower] : (char.match(/[a-z0-9]/i) ? `[${char.toLowerCase()}${char.toUpperCase()}]` : `\\${char}`);
    }
    return new RegExp(pattern, 'i');
}

test('Yapay Zeka Test Otomasyonu', async () => {
    //  1. Test zaman aşımını 5 dakikaya (300.000 ms) çıkarıyoruz
    test.setTimeout(300000);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const scenarioName = process.env.SCENARIO_NAME || 'ai-prompts';
    const stepsFilePath = process.env.RUNTIME_STEPS_PATH || path.join(process.cwd(), 'cache', 'runtime_steps.json');

    if (!fs.existsSync(stepsFilePath)) {
        throw new Error(`Test dosyası belirtilen proje klasöründe bulunamadı: ${stepsFilePath}`);
    }

    const promptData = JSON.parse(fs.readFileSync(stepsFilePath, 'utf-8'));

    // DİNAMİK AYARLARI OKUMA
    let activeModel = 'openai/gpt-4o-mini';
    let chosenApi = 'openai';
    let apiKeyValue = CONSTANTS.OPENAI_API_KEY;
    let customBaseUrl: string | undefined = undefined;

    try {
        console.log("[Test Runner] Aktif test çalıştırıcı sağlayıcı DPU Base'den sorgulanıyor...");
        
        const dpuClient = dpu as any;
        const dbResult = await dpuClient.select('ayarlar', 100); 

        if (dbResult.success && dbResult.data && dbResult.data.length > 0) {
            const settingsRows = dbResult.data;
            const activeRunnerRow = settingsRows.find((r: any) => r.ayar_anahtar === 'test_runner_api');

            if (activeRunnerRow) {
                chosenApi = activeRunnerRow.ayar_deger;
                console.log(`🎯 [Test Runner] Aktif Çalıştırıcı Sağlayıcı: ${chosenApi}. Key ve Model detayları yükleniyor...`);

                const providerRow = settingsRows.find((r: any) => r.ayar_anahtar === chosenApi);

                if (providerRow) {
                    try {
                        apiKeyValue = decrypt(providerRow.ayar_deger);
                    } catch (e) {
                        const error = e as Error;
                        console.error("API Key çözülemedi, ham değer deneniyor:", error.message);
                        apiKeyValue = providerRow.ayar_deger;
                    }
                    activeModel = providerRow.ayar_model;
                }
            }

            if (chosenApi.toLowerCase().includes("openai")) {
                if (!activeModel.startsWith("openai/")) {
                    activeModel = `openai/${activeModel}`;
                }
            } else if (chosenApi.toLowerCase().includes("gemini")) {
                if (!activeModel.startsWith("google/") && !activeModel.startsWith("gemini/")) {
                    activeModel = `google/${activeModel}`;
                }
            } else if (chosenApi.toLowerCase().includes("qwen") || chosenApi.toLowerCase().includes("local") || chosenApi.toLowerCase().includes("dpu")) {
                customBaseUrl = "https://ai.dpu.edu.tr/api";
                if (!activeModel.startsWith("openai/")) {
                    activeModel = `openai/${activeModel}`;
                }
                console.log(`🔌 DPU Yerel Sunucusu Bağlantı Köprüsü kuruldu: ${customBaseUrl}`);
            }
        }
    } catch (err: any) {
        console.warn("DPU Base ayar tablosu sorgulanamadı, local CONSTANTS kullanılacak. Hata:", err.message);
    }

    if (chosenApi.toLowerCase().includes("gemini")) {
        process.env.GEMINI_API_KEY = apiKeyValue;
    } else {
        process.env.OPENAI_API_KEY = apiKeyValue || "local-no-key";
    }

    const localConfig = customBaseUrl ? {
        baseURL: customBaseUrl,
        defaultHeaders: {
            "Authorization": `Bearer ${apiKeyValue}`
        }
    } : {};

    console.log(`[Test Runner] Stagehand Başlatılıyor. Sağlayıcı: ${chosenApi} | Model: ${activeModel}`);

    const isDockerEnv = process.env.DOCKER_ENV === 'true';

    const stagehand = new Stagehand({
        env: 'LOCAL',
        model: activeModel as any,
        cacheDir: path.resolve(__dirname, '../cache/ai-security'),
        domSettleTimeout: 15000,
        localBrowserLaunchOptions: { 
            headless: isDockerEnv ? true : false,
            args: isDockerEnv ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] : []
        },
        ...(customBaseUrl ? { 
            configuration: localConfig
        } : {})
    });

    await stagehand.init();
    const browser = await chromium.connectOverCDP({ wsEndpoint: stagehand.connectURL() });
    const pwPage = browser.contexts()[0].pages()[0];
    await pwPage.setViewportSize({ width: 1280, height: 720 });

    // Tarayıcının yerel pop-up pencerelerini yakalama
    pwPage.on('dialog', async (dialog) => {
        const dialogText = dialog.message();
        await dialog.dismiss();
        
        const lowerDialog = dialogText.toLowerCase();
        if (ERROR_KEYWORDS.some(kw => lowerDialog.includes(kw))) {
            throw new Error(`ERROR: Ekranda hata uyarı dialogu çıktı: "${dialogText}"`);
        }
    });

    try {
        await pwPage.goto(promptData.targetUrl);
        await pwPage.waitForLoadState('domcontentloaded').catch(() => {});

        for (const step of promptData.steps) {
            //  2. PrimeNG gizli accessibility input'larının AI'ı yanıltmasını engelle
            await pwPage.evaluate(() => {
                document.querySelectorAll('.p-hidden-accessible input').forEach(el => {
                    el.setAttribute('tabindex', '-1');
                    el.setAttribute('aria-hidden', 'true');
                });
            }).catch(() => {});

            // PrimeNG overlay animasyonlarının oturması için kısa bekleme
            await pwPage.waitForTimeout(600);

            try {
                // tests/ai-security.spec.ts - Dinamik ve Kırılmaz Act Bloğu

if (step.type === 'act') {
    let actSuccess = false;

    try {
        const actResult = await stagehand.act(step.instruction, { page: pwPage });
        const resultStr = JSON.stringify(actResult || {});

        if (resultStr.includes('nextChunk') || resultStr.includes('prevChunk') || resultStr.includes('"action":null')) {
            throw new Error(`ACTION_FAILED: Hedef eleman bulunamadı.`);
        }
        actSuccess = true;
        } catch (actError: any) {
    const errText = actError.message || actError.toString();
    const rawErrorObj = JSON.stringify(actError);

    const isZodSchemaError = 
        errText.includes('invalid_format') || 
        errText.includes('did not match schema') || 
        errText.includes('No object generated') ||
        rawErrorObj.includes('invalid_format');

    if (isZodSchemaError) {
        // Tırnak içindeki anahtar hedefi yakala (örn: "ime rektörlük koordinatörlüğü")
        const matchText = step.instruction.match(/"([^"]+)"/);
        
        if (matchText && matchText[1]) {
            const targetText = matchText[1].trim();
            const flexibleRegex = createTurkishInsensitiveRegex(targetText);
            console.warn(`🎯 [Dinamik Semantik Çözücü] Türkçe duyarsız aranıyor: "${targetText}"`);

            try {
                // 1. Öncelik: Açık açılır menü / overlay listesi içindeki seçenekler
                const overlayOption = pwPage.locator('.p-dropdown-panel li, .p-multiselect-panel li, .p-overlay li, [role="option"], .p-dropdown-item')
                    .filter({ hasText: flexibleRegex }).first();

                if (await overlayOption.count() > 0) {
                    await overlayOption.scrollIntoViewIfNeeded().catch(() => {});
                    await overlayOption.click({ force: true, timeout: 3000 });
                    console.log(`✅ [Dinamik Semantik Çözücü] Açık listeden seçildi: "${targetText}"`);
                    actSuccess = true;
                } else {
                    // 2. Öncelik: Sayfada görünen herhangi bir buton, metin veya link
                    const genericElement = pwPage.locator('button, a, span, label, div')
                        .filter({ hasText: flexibleRegex }).first();

                    await genericElement.waitFor({ state: 'visible', timeout: 3000 });
                    await genericElement.click({ force: true });
                    console.log(`✅ [Dinamik Semantik Çözücü] Ekranda tıklanabilir eleman bulundu ve tıklandı: "${targetText}"`);
                    actSuccess = true;
                }
            } catch (clickErr) {
                console.warn(`Dinamik semantik tıklama başarısız oldu:`, (clickErr as Error).message);
                throw actError;
            }
        } else {
            throw actError;
        }
    } else {
        throw actError;
    }
}

    // Dropdown açılış animasyonları beklemesi
    const isDropdown = step.instruction.toLowerCase().includes('dropdown') || 
                       step.instruction.toLowerCase().includes('menu') || 
                       step.instruction.toLowerCase().includes('menü');
    if (isDropdown) {
        await pwPage.waitForTimeout(800);
    }

    // Fakülte vb. dinamik alt liste yüklemeleri
    if (step.instruction.toLowerCase().includes('fakülte') || step.instruction.toLowerCase().includes('faculty')) {
        await pwPage.waitForLoadState('networkidle').catch(() => {});
        await pwPage.waitForTimeout(1500);
    }


                } else if (step.type === 'extract') {
                    const fieldName = step.field && step.field.trim() !== "" ? step.field : "extracted_data";
                    const dynamicSchema = z.object({ [fieldName]: z.string() });
                    
                    const response = await stagehand.extract(step.instruction, dynamicSchema, { page: pwPage });
                    const extractedValue = (response && response[fieldName]) ? String(response[fieldName]).trim() : "";
                    
                    console.log(`*** [BAŞARIYLA AYIKLANDI] ${fieldName} ->`, extractedValue);

                    const lowerExtracted = extractedValue.toLowerCase();
                    const detectedKeyword = ERROR_KEYWORDS.find(kw => lowerExtracted.includes(kw));

                    if (detectedKeyword) {
                        const cleanErrorMessage = extractedValue
                            .replace(/^(hata|error|uyarı|warning)\s*/i, '')
                            .replace(/^[•\-\*\s]+/, '')
                            .replace(/tamam$/i, '')
                            .trim();

                        console.error(`[HATA TESPİT EDİLDİ]: ${cleanErrorMessage}`);
                        throw new Error(`ERROR: ${cleanErrorMessage || extractedValue}`);
                    }

                    expect(extractedValue).toBeDefined();
                    expect(extractedValue.length).toBeGreaterThan(0);
                }
            } catch (e: any) {
                const errMsg = e.message || '';

                const isCriticalError = 
                    errMsg.includes('ERROR') || 
                    errMsg.includes('HATA TESPİT EDİLDİ') ||
                    errMsg.includes('ACTION_FAILED') ||
                    errMsg.includes('unsupported-element') ||
                    errMsg.includes('Could not find an element') ||
                    errMsg.includes('failed to fill');

                if (isCriticalError) {
                    console.error(`🛑 Test Adımı Başarısız Oldu ve Durduruldu: ${errMsg}`);
                    throw new Error(`CRITICAL_STEP_FAILED: ${step.instruction} -> Detay: ${errMsg}`);
                }

                console.warn(`Yapay zeka ana akışta adımı gerçekleştiremedi: ${errMsg}`);
                throw new Error(`STEP_FAILED: ${step.instruction} - Detay: ${errMsg}`);
            }
        }
    } finally {
        await stagehand.close();
    }
});