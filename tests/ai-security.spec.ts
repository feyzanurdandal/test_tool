// tests/ai-security.spec.ts
import { test, expect } from '@playwright/test';
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CONSTANTS } from '../config/constants.js'; // 🎯 Yeni kurumsal import (Sona .js ekledik)

test('Yapay Zeka Test Otomasyonu', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const scenarioName = process.env.SCENARIO_NAME || 'ai-prompts'; // n8n'den gelen isim yoksa varsayılanı oku
    const promptFilePath = path.resolve(__dirname, `../scenarios/${scenarioName}.json`);
    const promptData = JSON.parse(fs.readFileSync(promptFilePath, 'utf-8'));

    // 🎯 API Key artık doğrudan .env dosyasından, CONSTANTS nesnesi üzerinden besleniyor!
    process.env.OPENAI_API_KEY = CONSTANTS.OPENAI_API_KEY;

    const stagehand = new Stagehand({
        env: 'LOCAL',
        model: 'openai/gpt-4o-mini', // Bütçe dostu, hızlı model
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
                    await stagehand.act(step.instruction, { page: pwPage });
                    const isNavigationStep = step.instruction.toLowerCase().includes('enter') || 
                                             step.instruction.toLowerCase().includes('click') || 
                                             step.instruction.toLowerCase().includes('submit');
                    if (isNavigationStep) {
                        console.log("⏳ Sayfa geçişi için kısa duraklama (2sn)...");
                        await pwPage.waitForTimeout(2000); 
                    }
                } else if (step.type === 'extract') {
                    
                    const dynamicSchema = z.object({ [step.field]: z.string() });
                    
                    const response = await stagehand.extract(step.instruction, dynamicSchema, { page: pwPage });
                    
                    console.log(`*** [BAŞARIYLA AYIKLANDI] ${step.field} ->`, response[step.field]);
                    
                    // Artık gelen veri string olduğu için boş veya undefined olmadığını doğruluyoruz
                    expect(response[step.field]).toBeDefined();
                    expect(response[step.field].length).toBeGreaterThan(0);
                }
            } catch (e) {
                console.warn("⚠️ Hata oldu, yedek ajan devreye giriyor...");
                const agent = stagehand.agent({
                    mode: "dom", // CUA değil DOM modu (Sadece OpenAI ile çalışır)
                    model: "openai/gpt-4o" // Yedek olarak daha güçlü OpenAI modeli
                });
                await agent.execute({ instruction: step.instruction, page: pwPage });
            }
        }
    } finally {
        await stagehand.close();
    }
});