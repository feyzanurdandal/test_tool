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

test('Yapay Zeka Test Otomasyonu', async () => {
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
        domSettleTimeout: 10000,
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

    // Tarayıcının yerel pop-up (alert/confirm/prompt) pencerelerini yakalama
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

        for (const step of promptData.steps) {
            try {
                if (step.type === 'act') {
                    await stagehand.act(step.instruction, { page: pwPage });
                    
                    const isNavigationStep = step.instruction.toLowerCase().includes('enter') || 
                                              step.instruction.toLowerCase().includes('click') || 
                                              step.instruction.toLowerCase().includes('submit');
                    if (isNavigationStep) {
                        console.log("⏳ Sayfa geçişi için kısa duraklama (2sn)...");
                        await pwPage.waitForTimeout(2000); 
                    }
                }
                    else if (step.type === 'extract') {
                    const fieldName = step.field && step.field.trim() !== "" ? step.field : "extracted_data";
                    const dynamicSchema = z.object({ [fieldName]: z.string() });
                    
                    const response = await stagehand.extract(step.instruction, dynamicSchema, { page: pwPage });
                    const extractedValue = (response && response[fieldName]) ? String(response[fieldName]).trim() : "";
                    
                    console.log(`*** [BAŞARIYLA AYIKLANDI] ${fieldName} ->`, extractedValue);

                    const lowerExtracted = extractedValue.toLowerCase();
                    const detectedKeyword = ERROR_KEYWORDS.find(kw => lowerExtracted.includes(kw));

                    if (detectedKeyword) {
                        // Ham metindeki fazla boşluk ve yeni satırları temizleyip net hata mesajını çıkarıyoruz
                        const cleanErrorMessage = extractedValue
                            .replace(/^(hata|error|uyarı|warning)\s*/i, '')
                            .replace(/^[•\-\*\s]+/, '')
                            .replace(/tamam$/i, '')
                            .trim();

                        console.error(`[HATA TESPİT EDİLDİ]: ${cleanErrorMessage}`);
                        
                        // ERROR etiketiyle hatayı fırlatıyoruz
                        throw new Error(`ERROR: ${cleanErrorMessage || extractedValue}`);
                    }

                    expect(extractedValue).toBeDefined();
                    expect(extractedValue.length).toBeGreaterThan(0);
                }
            } catch (e: any) {
                // 💡 EĞER HATA BİZİM BULDUĞUMUZ POP-UP HATASIYSA YEDEK AJANA PASLAMA, ANINDA TESTİ PATLAT!
                if (e.message && (e.message.includes('ERROR') || e.message.includes('HATA TESPİT EDİLDİ'))) {
                    console.error(`Test Pop-up Hatası Sebebiyle Durduruldu: ${e.message}`);
                    throw e; // Playwright testi FAILED kabul etsin
                }

                console.warn(`Yapay zeka ana akışta adımı gerçekleştiremedi: ${e.message}`);
                console.log(`Adım, aktif yerel LLM ajanına paslanıyor... (Model: ${activeModel})`);
                try {
                    const agent = stagehand.agent({
                        mode: "dom",
                        model: activeModel as any,
                        ...(customBaseUrl ? {
                            configuration: localConfig
                        } : {})
                    });
                    await agent.execute({ instruction: step.instruction, page: pwPage });
                } catch (agentErr: any) {
                    console.error(`Yedek ajan da adımı tamamlayamadı: ${agentErr.message}`);
                    throw agentErr;
                }
            }
        }
    } finally {
        await stagehand.close();
    }
});