// // tests/ai-security.spec.ts
// import { test, expect } from '@playwright/test';
// import { Stagehand } from '@browserbasehq/stagehand';
// import { chromium } from 'playwright-core';
// import { z } from 'zod';
// import * as fs from 'fs';
// import * as path from 'path';
// import { fileURLToPath } from 'url';
// import { CONSTANTS } from '../config/constants.js'; 

// test('Yapay Zeka Test Otomasyonu', async () => {
//     const __filename = fileURLToPath(import.meta.url);
//     const __dirname = path.dirname(__filename);
    
//     const scenarioName = process.env.SCENARIO_NAME || 'ai-prompts'; // n8n'den gelen isim yoksa varsayılanı oku
    
//     // 🚀 Sadece çoklu proje klasör eki eklendi, başka hiçbir şeye dokunulmadı
//     const projectContext = process.env.PROJECT_CONTEXT ? `${process.env.PROJECT_CONTEXT}/` : '';
//     const promptFilePath = path.resolve(__dirname, `../scenarios/${projectContext}${scenarioName}.json`);
    
//     if (!fs.existsSync(promptFilePath)) {
//         throw new Error(`🚨 Test dosyası belirtilen proje klasöründe bulunamadı: ${promptFilePath}`);
//     }

//     const promptData = JSON.parse(fs.readFileSync(promptFilePath, 'utf-8'));

//     process.env.OPENAI_API_KEY = CONSTANTS.OPENAI_API_KEY;

//     const stagehand = new Stagehand({
//         env: 'LOCAL',
//         model: 'openai/gpt-4o-mini', // Bütçe dostu, hızlı model
//         cacheDir: path.resolve(__dirname, '../cache/ai-security'),
//         domSettleTimeout: 10000,
//         localBrowserLaunchOptions: { headless: false }
//     });

//     await stagehand.init();
//     const browser = await chromium.connectOverCDP({ wsEndpoint: stagehand.connectURL() });
//     const pwPage = browser.contexts()[0].pages()[0];
//     await pwPage.setViewportSize({ width: 1280, height: 720 });

//     try {
//         await pwPage.goto(promptData.targetUrl);

//         // Orijinal döngün ve fallback (yedek ajan) mantığın birebir korundu
//         for (const step of promptData.steps) {
//             try {
//                 if (step.type === 'act') {
//                     // Talimat metin girmeyle mi alakalı? (Metin gir, yaz, doldur vb.)
//                     const isWritingTask = step.instruction.toLowerCase().includes('enter') || 
//                                         step.instruction.toLowerCase().includes('type') || 
//                                         step.instruction.toLowerCase().includes('fill');

//                     let finalInstruction = step.instruction;

//                     if (isWritingTask) {
//                         // 🚀 YAPAY ZEKAYA KATI KURAL ENJEKSİYONU:
//                         finalInstruction = `${step.instruction} (CRITICAL: Target ONLY the actual <input> or text-entry element. DO NOT perform fill action on a <span>, <div> or label wrapper)`;
//                     }

//                     await stagehand.act(finalInstruction, { page: pwPage });
                    
//                     const isNavigationStep = step.instruction.toLowerCase().includes('enter') || 
//                                             step.instruction.toLowerCase().includes('click') || 
//                                             step.instruction.toLowerCase().includes('submit');
//                     if (isNavigationStep) {
//                         console.log("⏳ Sayfa geçişi için kısa duraklama (2sn)...");
//                         await pwPage.waitForTimeout(2000); 
//                     }
//                 }
//                 else if (step.type === 'extract') {
//                     const dynamicSchema = z.object({ [step.field]: z.string() });
//                     const response = await stagehand.extract(step.instruction, dynamicSchema, { page: pwPage });
                    
//                     console.log(`*** [BAŞARIYLA AYIKLANDI] ${step.field} ->`, response[step.field]);
                    
//                     expect(response[step.field]).toBeDefined();
//                     expect(response[step.field].length).toBeGreaterThan(0);
//                 }
//             } catch (e) {
//                 console.warn("⚠️ Hata oldu, yedek ajan devreye giriyor...");
//                 const agent = stagehand.agent({
//                     mode: "dom", // CUA değil DOM modu (Sadece OpenAI ile çalışır)
//                     model: "openai/gpt-4o" // Yedek olarak daha güçlü OpenAI modeli
//                 });
//                 await agent.execute({ instruction: step.instruction, page: pwPage });
//             }
//         }
//     } finally {
//         await stagehand.close();
//     }
// });

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
    
    const scenarioName = process.env.SCENARIO_NAME || 'ai-prompts';
    
    const projectContext = process.env.PROJECT_CONTEXT ? `${process.env.PROJECT_CONTEXT}/` : '';
    const promptFilePath = path.join(process.cwd(), 'cache', 'runtime_steps.json');

    if (!fs.existsSync(promptFilePath)) {
        throw new Error(`🚨 Test dosyası belirtilen proje klasöründe bulunamadı: ${promptFilePath}`);
    }

    const promptData = JSON.parse(fs.readFileSync(promptFilePath, 'utf-8'));

    process.env.OPENAI_API_KEY = CONSTANTS.OPENAI_API_KEY;

    const stagehand = new Stagehand({
        env: 'LOCAL',
        model: 'openai/gpt-4o-mini',
        cacheDir: path.resolve(__dirname, '../cache/ai-security'),
        domSettleTimeout: 10000,
        localBrowserLaunchOptions: { headless: false }
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