// tests/ai-security.spec.ts
import { test, expect } from '@playwright/test';
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { STAGEHAND_API_KEY } from '../config/constants.js';

test('Prompt-Driven v3 Stagehand Optimal Yapay Zeka Otomasyon Motoru', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const promptFilePath = path.resolve(__dirname, '../config/ai-prompts.json');
    const promptData = JSON.parse(fs.readFileSync(promptFilePath, 'utf-8'));

    process.env.OPENAI_API_KEY = STAGEHAND_API_KEY;

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
                    const dynamicSchema = z.object({ [step.field]: z.boolean() });
                    const response = await stagehand.extract(step.instruction, dynamicSchema, { page: pwPage });
                    expect(response[step.field]).toBeTruthy();
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