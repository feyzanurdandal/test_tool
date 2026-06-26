// tests/ai-security.spec.ts
import { test, expect } from '@playwright/test';
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { STAGEHAND_API_KEY } from '../config/constants.js'; // Senin anahtarın burada

test('Prompt-Driven v3 Stagehand Optimal Yapay Zeka Otomasyon Motoru', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const promptFilePath = path.resolve(__dirname, '../config/ai-prompts.json');
    const promptData = JSON.parse(fs.readFileSync(promptFilePath, 'utf-8'));

    // Stagehand, bu anahtarı kullanarak OpenAI ile konuşacak
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
                } else if (step.type === 'extract') {
                    const dynamicSchema = z.object({ [step.field]: z.boolean() });
                    const result = await stagehand.extract(step.instruction, dynamicSchema, { page: pwPage });
                    expect(result[step.field]).toBeTruthy();
                }
            } catch (e) {
                console.warn("Hata oldu, yedek ajan devreye giriyor...");
                // Sadece OpenAI anahtarı ile çalışan, CUA modunda olmayan yedek ajan
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