import { executeRecordedAction } from '../utils/recordedActions.js';
import { startLiveFrames } from '../utils/liveFrames.js';
import { executeFormAction } from '../utils/formActions.js';

// tests/ai-security.spec.ts
import { test, expect } from '@playwright/test';
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore
import { setHostPolicyProvider } from '../utils/hostPolicy.js';
// @ts-ignore
import { executeActStep, SelectorCache, collectPageDiagnostics } from '../utils/aiStepExecutor.js';
// @ts-ignore
import { effectiveStepType } from '../utils/stepKind.js';
// @ts-ignore
import { startNetworkProxy, browserNetworkArgs, installBrowserNetworkGuard } from '../utils/networkProxy.js';
// @ts-ignore
import { runtimeStepsSchema } from '../schemas/runtimeSteps.js';
// @ts-ignore
import { verifyExpectedBlock } from '../utils/testOutcome.js';

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
    test.setTimeout(Number(process.env.RUN_TEST_TIMEOUT_MS) || 300000);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const stepsFilePath = process.env.RUNTIME_STEPS_PATH || path.join(process.cwd(), 'cache', 'runtime_steps.json');

    if (!fs.existsSync(stepsFilePath)) {
        throw new Error(`Test dosyası belirtilen proje klasöründe bulunamadı: ${stepsFilePath}`);
    }

    const rawSteps = JSON.parse(fs.readFileSync(stepsFilePath, 'utf-8'));
    const promptData = runtimeStepsSchema.parse(rawSteps);
    // Yönetici izin listesi ve AI ayarları ana süreç tarafından hazırlanıp dosyayla verilir;
    // böylece bu süreç (ve açtığı Chromium) DPU/JWT/ENCRYPTION gizli anahtarlarını görmez.
    setHostPolicyProvider(async () => Array.isArray(rawSteps.hostPolicy) ? rawSteps.hostPolicy : []);
    const aiConfig = rawSteps.aiConfig && typeof rawSteps.aiConfig === 'object' ? rawSteps.aiConfig : null;
    let expectedBlockVerified = false;
    // Başarılı adımların seçicileri YALNIZCA test bütünüyle başarılı bitince kalıcı yazılır (writeResult).
    const selectorCache = process.env.SELECTOR_CACHE_FILE ? new SelectorCache(process.env.SELECTOR_CACHE_FILE) : null;
    // Adım/yapay zeka süre sayaçları (test sonunda [SÜRE] özeti yazılır)
    const stepStats: any = { aiMs: 0, aiCalls: 0, steps: 0, cacheHits: 0, seenAlerts: new Set<string>() };
    const testStartedAt = performance.now();
    const writeResult = () => {
        selectorCache?.commit();
        if (process.env.RUNTIME_RESULT_PATH) fs.writeFileSync(process.env.RUNTIME_RESULT_PATH, JSON.stringify({completed:true,expectedBlockVerified}), {mode:0o600});
    };
    const expectedMatch = (text: string) => promptData.expectedOutcome === 'ERROR_EXPECTED' && verifyExpectedBlock(text, promptData.expectedErrorText);

    // DİNAMİK AYARLARI OKUMA
    let activeModel = 'openai/gpt-4o-mini';
    let chosenApi = 'openai';
    let apiKeyValue: string | undefined = process.env.OPENAI_API_KEY;
    let customBaseUrl: string | undefined = undefined;

    if (aiConfig) {
        chosenApi = String(aiConfig.chosenApi || chosenApi);
        activeModel = String(aiConfig.model || activeModel);
        apiKeyValue = aiConfig.apiKey;
        customBaseUrl = aiConfig.customBaseUrl || undefined;
        console.log(`[Test Runner] Sağlayıcı ayarları ana süreçten alındı: ${chosenApi}`);
    } else {
        // Yerel/elle çalıştırma (npm run test:ai-local): ayarlar doğrudan DPU'dan okunur.
        try {
            // @ts-ignore
            const { loadRunnerAiConfig } = await import('../services/aiRunConfig.js');
            const cfg = await loadRunnerAiConfig();
            chosenApi = cfg.chosenApi; activeModel = cfg.model; apiKeyValue = cfg.apiKey; customBaseUrl = cfg.customBaseUrl || undefined;
        } catch (err: any) {
            console.warn("AI ayarları okunamadı, ortam değişkenleri kullanılacak. Hata:", err.message);
        }
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

    const networkProxy = await startNetworkProxy();
    let stagehand: Stagehand | undefined;
    try {
    stagehand = new Stagehand({
        env: 'LOCAL',
        // Stagehand'in kendi "onarma" denemesi (self-heal) başarısız eylemde modele yeniden sorup UYDURMA değer yazabiliyordu
        // (ör. şifre alanına "your_password"). Hata bizim geri bildirimli yeniden deneme mantığımıza gelir.
        selfHeal: false,
        model: activeModel as any,
        // cacheDir: path.resolve(__dirname, '../cache/ai-security'),
        domSettleTimeout: 15000,
        localBrowserLaunchOptions: { 
            headless: isDockerEnv || process.env.HEADLESS === 'true',
            ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
            proxy: { server: networkProxy.url, bypass: '<-loopback>' },
            args: [...browserNetworkArgs(networkProxy.url), '--disable-dev-shm-usage', ...(isDockerEnv ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] : [])]
        },
        ...(customBaseUrl ? { 
            configuration: localConfig
        } : {})
    });

    let stopLiveFrames=async()=>{};
    try {
    const bootStart = performance.now();
    await stagehand.init();
    const bootInit = performance.now();
    const browser = await chromium.connectOverCDP({ wsEndpoint: stagehand.connectURL() });
    const browserContext = browser.contexts()[0];
    const pwPage = browserContext.pages()[0];
    await pwPage.setViewportSize({ width: 1280, height: 720 });
    stopLiveFrames=startLiveFrames(pwPage);

    // ─── AĞ KORUMASI (SSRF) ───
    // Hedef URL sunucuda doğrulanmış olsa da test adımları tarayıcıyı başka
    // adreslere götürebilir (link tıklama, yönlendirme, form gönderimi).
    // Tarayıcının yaptığı HER istek burada denetlenir; iç ağa giden istekler kesilir.
    await installBrowserNetworkGuard(browserContext);
    let dialogFailure = '';
    // Tarayıcının yerel pop-up pencerelerini yakalama
    pwPage.on('dialog', async (dialog) => {
        const dialogText = dialog.message();
        await dialog.dismiss();
        
        const lowerDialog = dialogText.toLowerCase();
        if (expectedMatch(dialogText)) expectedBlockVerified = true;
        else if (ERROR_KEYWORDS.some(kw => lowerDialog.includes(kw))) {
            dialogFailure = `ERROR: Ekranda hata uyarı dialogu çıktı: "${dialogText}"`;
        }
    });

        await pwPage.goto(promptData.targetUrl);
        await pwPage.waitForLoadState('domcontentloaded').catch(() => {});
        console.log(`[SÜRE] başlatma: tarayıcı açılışı ${((bootInit - bootStart) / 1000).toFixed(1)} sn | ilk sayfa yüklemesi ${((performance.now() - bootInit) / 1000).toFixed(1)} sn`);
        if (expectedMatch(await pwPage.locator('body').innerText())) {
            console.warn('[UYARI]: Beklenen engelleme mesajı hedef sayfa açılır açılmaz göründü; adımlar çalıştırılmadan başarı verildi. Mesajın sayfada zaten kalıcı olarak bulunmadığından emin olun.');
            expectedBlockVerified = true; writeResult(); return;
        }

        for (const step of promptData.steps) {
            const stepIndex = promptData.steps.indexOf(step);
            //  2. PrimeNG gizli accessibility input'larının AI'ı yanıltmasını engelle
            await pwPage.evaluate(() => {
                document.querySelectorAll('.p-hidden-accessible input').forEach(el => {
                    el.setAttribute('tabindex', '-1');
                    el.setAttribute('aria-hidden', 'true');
                });
            }).catch(() => {});

            // PrimeNG overlay animasyonlarının oturması için kısa bekleme
            await pwPage.waitForTimeout(600);

            // Çevirmen etkileşim adımını ("pop up varsa kapat") extract (yalnızca oku) üretmişse act olarak çalıştırılır.
            const stepType = effectiveStepType(step);
            if (stepType !== step.type) console.log(`[BİLGİ] adım ${stepIndex + 1}: "${step.type}" olarak çevrilmiş ama eylem içeriyor; eylem (act) olarak çalıştırılıyor`);

            try {
                // tests/ai-security.spec.ts - Dinamik ve Kırılmaz Act Bloğu

if (step.type === 'recorded') {
    await executeRecordedAction(pwPage, step.recorded);
} else if (step.type === 'form') {
    await executeFormAction(stagehand, pwPage, step.form);
} else if (stepType === 'act') {
    let actSuccess = false;

    try {
        // Çerçeveden bağımsız çözüm: önbellek → yapay zeka (geri bildirimli yeniden deneme + sonuç doğrulama) → anlamsal yedek.
        await executeActStep({ stagehand, page: pwPage, instruction: step.instruction, stepIndex, cache: selectorCache, stats: stepStats });
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


                } else if (stepType === 'extract') {
                    const fieldName = step.field && step.field.trim() !== "" ? step.field : "extracted_data";
                    const dynamicSchema = z.object({ [fieldName]: z.string() });
                    
                    const response = await stagehand.extract(step.instruction, dynamicSchema, { page: pwPage });
                    const extractedValue = (response && response[fieldName]) ? String(response[fieldName]).trim() : "";
                    
                    console.log(`*** [BAŞARIYLA AYIKLANDI] ${fieldName} ->`, extractedValue);

                    if (expectedMatch(extractedValue)) { expectedBlockVerified = true; writeResult(); return; }
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
                if (dialogFailure) throw new Error(dialogFailure);
                if (expectedBlockVerified || expectedMatch(await pwPage.locator('body').innerText())) {
                    expectedBlockVerified = true; writeResult(); return;
                }
            } catch (e: any) {
                const errMsg = e.message || '';

                // Hata anında sayfanın durumu loga yazılır: adres, ekrandaki uyarılar, geçersiz alanlar.
                try { for (const line of await collectPageDiagnostics(pwPage)) console.warn(`[TEŞHİS] ${line}`); } catch { /* teşhis best-effort */ }

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
        if (promptData.expectedOutcome === 'ERROR_EXPECTED' && !expectedBlockVerified) {
            throw new Error('EXPECTED_BLOCK_NOT_FOUND: Beklenen engelleme mesajı hedefte doğrulanamadı.');
        }
        writeResult();
    } finally {
        const totalSec = ((performance.now() - testStartedAt) / 1000).toFixed(0);
        console.log(`[SÜRE] test ${totalSec} sn sürdü; yapay zeka çağrısı ${stepStats.aiCalls} kez, toplam bekleme ${(stepStats.aiMs / 1000).toFixed(0)} sn; önbellekten çözülen adım ${stepStats.cacheHits}`);
        await stopLiveFrames();
        await stagehand.close();
    }
    } finally { await networkProxy.close(); }
});