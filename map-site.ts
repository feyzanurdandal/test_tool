import { Stagehand } from "@browserbasehq/stagehand";
import * as fs from 'fs';

import { STAGEHAND_API_KEY } from './config/constants.js';

async function mapSecuritySelectors() {
    console.log("🚀 Derin tarama başlatılıyor...");

    process.env.OPENAI_API_KEY = STAGEHAND_API_KEY;

    const stagehand = new Stagehand({ 
        env: 'LOCAL',
        model: 'openai/gpt-4o-mini',
        cacheDir: './cache/map-site'
    });

    await stagehand.init();
    const page = stagehand.context.pages()[0];
    await page.goto("https://www.dpu.edu.tr/");

    // 1. ADIM: Sayfayı aşağı kaydırarak tüm elementleri yükle
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000); // Dinamik içeriklerin yüklenmesini bekle

    // 2. ADIM: Daha zeki bir observation talimatı ver
    const actions = await stagehand.observe(
        "Identify all input fields, buttons, navigation menus, and critical security-related elements. " +
        "Assign professional, short, uppercase snake_case names for keys (e.g., SEARCH_INPUT, LOGIN_BTN). " +
        "Remove any non-ASCII characters from the keys.", 
        { page: page, selector: "body" }
    );
    
    // 3. ADIM: İsimlendirmeyi temizleyen fonksiyon
    const cleanKey = (str: string) => {
        return str
            .toLowerCase() // Önce hepsini küçült ki karışmasın
            .replace(/ı/g, 'i')
            .replace(/i/g, 'i') // İ'leri de i yap
            .replace(/ş/g, 's')
            .replace(/ç/g, 'c')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ö/g, 'o')
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Artıkları temizle
            .replace(/[^a-zA-Z0-9]/g, '_') // Özel karakteri _ yap
            .toUpperCase();
    };

    const selectorMap = actions.reduce((acc, action) => {
        // AI'dan gelen description'ı temizle, eğer çok uzunsa ilk 3 kelimeyi al
        const key = cleanKey(action.description.substring(0, 30)); 
        acc[key] = action.selector;
        return acc;
    }, {} as Record<string, string>);

    fs.writeFileSync('./config/selectors.json', JSON.stringify(selectorMap, null, 2));
    
    console.log("✅ Derin harita güncellendi: config/selectors.json");
    await stagehand.close();
}

mapSecuritySelectors();