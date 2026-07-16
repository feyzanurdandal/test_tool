// tests/ai-security.spec.ts
import { test, expect } from '@playwright/test';
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CONSTANTS } from '../config/constants.js'; 

test('Yapay Zeka Test Otomasyonu', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const scenarioName = process.env.SCENARIO_NAME;
    
    const projectContext = process.env.PROJECT_CONTEXT ? `${process.env.PROJECT_CONTEXT}/` : '';
    const promptFilePath = path.join(process.cwd(), 'cache', 'runtime_steps.json');

    if (!fs.existsSync(promptFilePath)) {
        throw new Error(`Test dosyası belirtilen proje klasöründe bulunamadı: ${promptFilePath}`);
    }

    const promptData = JSON.parse(fs.readFileSync(promptFilePath, 'utf-8'));

// ───  DİNAMİK AYARLARI OKUMA  ───
    let activeModel = 'openai/gpt-4o-mini';
    let chosenApi = 'openai';
    let apiKeyValue = CONSTANTS.OPENAI_API_KEY;
    let customBaseUrl: string | undefined = undefined;

    try {
        console.log("[Test Runner] Aktif test çalıştırıcı sağlayıcı DPU Base'den sorgulanıyor...");
        
        // Önce aktif test sağlayıcısını seçelim
        const activeRunnerRes = await dpu.select('ayarlar', 1, 'ayar_anahtar:eq:test_runner_api');

        if (activeRunnerRes.success && activeRunnerRes.data.length > 0) {
            chosenApi = activeRunnerRes.data[0].ayar_deger;
            console.log(`[Test Runner] Aktif Çalıştırıcı Sağlayıcı: ${chosenApi}. Key ve Model tek satırdan çekiliyor...`);

            //  Sağlayıcıya ait satırı nokta atışı tek sorgu ile çekip hem key hem de model bilgisini tek seferde alıyoruz
            const providerRes = await dpu.select('ayarlar', 1, `ayar_anahtar:eq:${chosenApi}`);

            if (providerRes.success && providerRes.data.length > 0) {
                apiKeyValue = providerRes.data[0].ayar_deger;  // API Key değerimiz
                activeModel = providerRes.data[0].ayar_model;  // Model değerimiz
            }

            // EVRENSEL SAĞLAYICI ÖNEKİ (PREFIX) STANDARTLAŞTIRMASI
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
                console.log(`DPU Yerel Sunucusu Bağlantı Köprüsü kuruldu: ${customBaseUrl}`);
            }
        }
    } catch (err: any) {
        console.warn("DPU Base ayar tablosu sorgulanamadı, local CONSTANTS kullanılacak:", err.message);
    }

    // 🎯 Çevre değişkenlerini ve API Anahtarlarını kütüphanelere dağıtıyoruz
    if (chosenApi.toLowerCase().includes("gemini")) {
        process.env.GEMINI_API_KEY = apiKeyValue;
    } else {
        process.env.OPENAI_API_KEY = apiKeyValue || "local-no-key";
    }

    console.log(`[Test Runner] Stagehand Başlatılıyor. Sağlayıcı: ${chosenApi} | Model: ${activeModel}`);

    const stagehand = new Stagehand({
        env: 'LOCAL',
        model: activeModel as any,
        cacheDir: path.resolve(__dirname, '../cache/ai-security'),
        domSettleTimeout: 10000,
        localBrowserLaunchOptions: { headless: false },
        // Eğer DPU Qwen seçildiyse API endpoint geçişi yapıyoruz
        ...(customBaseUrl ? { 
            configuration: {
                baseURL: customBaseUrl
            }
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
                    // Yapay zekaya ilk şansını veriyoruz
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
                    const dynamicSchema = z.object({ [step.field]: z.string() });
                    const response = await stagehand.extract(step.instruction, dynamicSchema, { page: pwPage });
                    console.log(`*** [BAŞARIYLA AYIKLANDI] ${step.field} ->`, response[step.field]);
                    expect(response[step.field]).toBeDefined();
                    expect(response[step.field].length).toBeGreaterThan(0);
                }
            } catch (e) {
                console.warn(`⚠️ Yapay zeka adımı gerçekleştiremedi veya element hatası aldı. Yerel Playwright bypass'ı deneniyor...`);
                
                // 🚀 HİBRİT AKILLI BYPASS: Eğer hata bir metin girişi sırasındaysa yerel Playwright locator'larını zorla
                const instructionLower = step.instruction.toLowerCase();
                if (instructionLower.includes('enter') || instructionLower.includes('type') || instructionLower.includes('fill')) {
                    
                    // Talimatın içindeki tırnak içindeki veriyi veya şifreyi/numarayı regex ile ayıklayalım
                    const valueMatch = step.instruction.match(/['"](.*?)['"]/);
                    const valueToFill = valueMatch ? valueMatch[1] : "";

                    if (valueToFill) {
                        if (instructionLower.includes('öğrenci no') || instructionLower.includes('number') || instructionLower.includes('username')) {
                            console.log(`🤖 [Bypass] Öğrenci No alanına Playwright ile zorla yazılıyor: ${valueToFill}`);
                            // Sitedeki gerçek input alanını placeholder veya text tabanlı yakala
                            await pwPage.locator('input[type="text"], input:not([type="password"])').first().fill(valueToFill);
                            continue;
                        } 
                        else if (instructionLower.includes('şifre') || instructionLower.includes('password')) {
                            console.log(`🤖 [Bypass] Şifre alanına Playwright ile zorla yazılıyor.`);
                            await pwPage.locator('input[type="password"]').first().fill(valueToFill);
                            continue;
                        }
                    }
                }

                // Eğer metin girişi dışındaki bir adım patladıysa eski yedek ajanı (fallback) koruyoruz
                console.log("⏳ Adım metin girişi değil, yedek LLM ajanına paslanıyor...");
                const agent = stagehand.agent({
                    mode: "dom",
                    model: "openai/gpt-4o"
                });
                await agent.execute({ instruction: step.instruction, page: pwPage });
            }
        }
    } finally {
        await stagehand.close();
    }
});