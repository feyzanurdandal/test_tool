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
import dpu from '../config/dpuService.js';

test('Yapay Zeka Test Otomasyonu', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const scenarioName = process.env.SCENARIO_NAME || 'ai-prompts';
    const promptFilePath = path.join(process.cwd(), 'cache', 'runtime_steps.json');

    if (!fs.existsSync(promptFilePath)) {
        throw new Error(`🚨 Test dosyası belirtilen proje klasöründe bulunamadı: ${promptFilePath}`);
    }

    const promptData = JSON.parse(fs.readFileSync(promptFilePath, 'utf-8'));

    // ─── ⚙️ DİNAMİK AYARLARI OKUMA SİHRİ (DPU Base Jilet Gibi JS Filtreleme Sürümü! 🔒) ───
    let activeModel = 'openai/gpt-4o-mini';
    let chosenApi = 'openai';
    let apiKeyValue = CONSTANTS.OPENAI_API_KEY;
    let customBaseUrl: string | undefined = undefined;

    try {
        console.log("🔄 [Test Runner] Aktif test çalıştırıcı sağlayıcı DPU Base'den sorgulanıyor...");
        
        const dpuClient = dpu as any;
        const dbResult = await dpuClient.select('ayarlar', 100); // Filtre göndermeden çekerek API tıkanıklığını aşıyoruz kanka!

        if (dbResult.success && dbResult.data && dbResult.data.length > 0) {
            const settingsRows = dbResult.data;

            // 1. Aktif çalıştırıcıyı JavaScript tarafında buluyoruz
            const activeRunnerRow = settingsRows.find((r: any) => r.ayar_anahtar === 'test_runner_api');

            if (activeRunnerRow) {
                chosenApi = activeRunnerRow.ayar_deger;
                console.log(`🎯 [Test Runner] Aktif Çalıştırıcı Sağlayıcı: ${chosenApi}. Key ve Model detayları yükleniyor...`);

                // 2. Seçilen sağlayıcının API key ve model bilgisini çekiyoruz
                const providerRow = settingsRows.find((r: any) => r.ayar_anahtar === chosenApi);

                if (providerRow) {
                    apiKeyValue = providerRow.ayar_deger;
                    activeModel = providerRow.ayar_model;
                }
            }

            // 🎯 EVRENSEL SAĞLAYICI ÖNEKİ (PREFIX) STANDARTLAŞTIRMASI
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
        console.warn("⚠️ DPU Base ayar tablosu sorgulanamadı, local CONSTANTS kullanılacak. Hata:", err.message);
    }

    // 🎯 Çevre değişkenlerini kütüphanelerin okuyabileceği şekilde mühürlüyoruz
    if (chosenApi.toLowerCase().includes("gemini")) {
        process.env.GEMINI_API_KEY = apiKeyValue;
    } else {
        process.env.OPENAI_API_KEY = apiKeyValue || "local-no-key";
    }

    // 🔒 YEREL LLM GÜVENLİK YAPILANDIRMASI: Alt ajanların OpenAI sunucularına kaçmasını engelleyen köprü!
    const localConfig = customBaseUrl ? {
        baseURL: customBaseUrl,
        defaultHeaders: {
            "Authorization": `Bearer ${apiKeyValue}`
        }
    } : {};

    console.log(`⚙️ [Test Runner] Stagehand Başlatılıyor. Sağlayıcı: ${chosenApi} | Model: ${activeModel}`);

    const stagehand = new Stagehand({
        env: 'LOCAL',
        model: activeModel as any,
        cacheDir: path.resolve(__dirname, '../cache/ai-security'),
        domSettleTimeout: 10000,
        localBrowserLaunchOptions: { headless: false },
        // DPU Qwen seçildiyse yerel yapılandırmayı doğrudan enjekte ediyoruz
        ...(customBaseUrl ? { 
            configuration: localConfig
        } : {})
    });

    await stagehand.init();
    const browser = await chromium.connectOverCDP({ wsEndpoint: stagehand.connectURL() });
    const pwPage = browser.contexts()[0].pages()[0];
    await pwPage.setViewportSize({ width: 1280, height: 720 });

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
                    console.log(`*** [BAŞARIYLA AYIKLANDI] ${fieldName} ->`, response[fieldName]);
                    
                    expect(response[fieldName]).toBeDefined();
                    expect(response[fieldName].length).toBeGreaterThan(0);
                }
            } catch (e: any) {
                console.warn(`⚠️ Yapay zeka ana akışta adımı gerçekleştiremedi: ${e.message}`);
                
                // 🌟 DİNAMİK FALLBACK: OpenAI sunucularına gitmeyi tamamen engelleyip yerel köprüyü buraya da kuruyoruz!
                console.log(`⏳ Adım, aktif yerel LLM ajanına paslanıyor... (Model: ${activeModel})`);
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
                    console.error(`❌ Yedek ajan da adımı tamamlayamadı: ${agentErr.message}`);
                    throw agentErr; // Hata durumunda testi patlatıyoruz ki raporlarımıza "FAILED" olarak mühürlensin!
                }
            }
        }
    } finally {
        await stagehand.close();
    }
});