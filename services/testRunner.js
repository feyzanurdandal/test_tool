import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dpu from '../config/dpuService.js';
import { isSafeUrl } from '../utils/ipGuard.js';

// Çalışma anı adım dosyaları önbellekten AYRI bir klasörde tutulur;
// böylece önbellek temizliği koşan bir testin dosyasını silemez.
export const RUNTIME_DIR = path.join(process.cwd(), 'runtime');
const RUN_TIMEOUT_MS = 300_000;
const MAX_LOG_CHARS = 50_000;

export class RunPreparationError extends Error {}

// ─── DİNAMİK VE PROJE BAZLI HATA / GÜVENLİK DEĞERLENDİRİCİ ───
export function evaluateTestOutcome(logContent, customKeywordsRaw = '', expectedOutcome = 'SUCCESS_EXPECTED', isExecutionSuccess = true) {
    if (!logContent) return isExecutionSuccess ? 'SUCCESS' : 'FAILED';
    const lowerLog = logContent.toLowerCase();

    const baseErrorKeywords = [
        'error:', 'exception:', 'cannot find element',
        'incorrect api key', 'failed to launch', 'timeout',
        'execution context was destroyed', 'alert:', 'modal-error'
    ];

    const projectCustomKeywords = (customKeywordsRaw || '')
        .split('\n')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);

    const detectedKeyword = [...baseErrorKeywords, ...projectCustomKeywords].find(kw => lowerLog.includes(kw));

    if (expectedOutcome === 'ERROR_EXPECTED') {
        // Güvenlik testi: sistem engellediyse / beklenen hata geldiyse test BAŞARILIDIR
        return (detectedKeyword || !isExecutionSuccess) ? 'SUCCESS' : 'FAILED';
    }
    return (isExecutionSuccess && !detectedKeyword) ? 'SUCCESS' : 'FAILED';
}

/**
 * Koşucuya verilecek adım dosyasının içeriğini hazırlar.
 * Hedef URL, yapay zeka çıktısından DEĞİL veritabanındaki doğrulanmış
 * hedef_url alanından alınır ve çalıştırmadan hemen önce yeniden denetlenir.
 */
export async function buildRuntimeSteps(scenario) {
    let parsed;
    try {
        parsed = typeof scenario.adimlar === 'string' ? JSON.parse(scenario.adimlar) : scenario.adimlar;
    } catch {
        throw new RunPreparationError('Senaryonun çevrilmiş adımları okunamadı. Senaryoyu düzenleyip tekrar kaydedin.');
    }
    if (!parsed || !Array.isArray(parsed.steps)) {
        throw new RunPreparationError('Senaryonun çevrilmiş adımları geçersiz. Senaryoyu düzenleyip tekrar kaydedin.');
    }

    // Eski kayıtlarda hedef_url boş olabilir; o durumda JSON'daki değer kullanılır
    // ama o da aynı güvenlik denetiminden geçer.
    const targetUrl = String(scenario.hedef_url || parsed.targetUrl || '').trim();
    const urlCheck = await isSafeUrl(targetUrl);
    if (!urlCheck.safe) {
        throw new RunPreparationError(`Güvenlik Engeli: ${urlCheck.reason}`);
    }

    return { ...parsed, targetUrl };
}

// Playwright testini ayrı süreçte, zaman aşımıyla koşturur
export function runPlaywrightTest(stepsFilePath, timeoutMs = RUN_TIMEOUT_MS) {
    return new Promise((resolve) => {
        console.log(`Playwright motoru tetikleniyor... (Dosya: ${path.basename(stepsFilePath)})`);

        const env = { ...process.env, RUNTIME_STEPS_PATH: stepsFilePath };
        const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

        execFile(npx, ['playwright', 'test', 'tests/ai-security.spec.ts'], {
            env,
            timeout: timeoutMs,
            maxBuffer: 20 * 1024 * 1024,
            shell: process.platform === 'win32',
        }, (error, stdout = '', stderr = '') => {
            if (error) {
                if (error.killed) console.error(`Playwright testi zaman aşımına uğradı (${timeoutMs / 1000}sn) ve durduruldu.`);
                else console.error('Playwright test hatası:', error.message);
            }

            fs.promises.unlink(stepsFilePath).catch(() => {});

            resolve({
                isSuccess: !error,
                logContent: stdout + (stderr ? `\n--- Hatalar ---\n${stderr}` : '') + (error?.killed ? '\n[HATA]: Test zaman aşımına uğradı.' : '')
            });
        });
    });
}

async function saveReport(report) {
    try {
        const res = await dpu.insert('raporlar', report);
        if (!res?.success) console.error('Rapor veritabanına yazılamadı:', res?.error);
    } catch (err) {
        console.error('Rapor veritabanına yazılırken istisna oluştu:', err.message);
    }
}

/**
 * Bir senaryoyu uçtan uca çalıştırır ve raporunu kaydeder.
 * @returns {Promise<{ status: 'SUCCESS'|'FAILED', message: string }>}
 */
export async function executeScenario(project, scenario) {
    const baseReport = {
        project_id: project.id,
        scenario_name: scenario.senaryo_adi,
        test_tipi: (scenario.test_tipi || 'UI').toUpperCase(),
    };

    let runtimeSteps;
    try {
        runtimeSteps = await buildRuntimeSteps(scenario);
    } catch (err) {
        if (!(err instanceof RunPreparationError)) throw err;
        await saveReport({ ...baseReport, status: 'FAILED', log_content: `[HATA]: ${err.message}`, created_at: new Date().toISOString() });
        return { status: 'FAILED', message: err.message };
    }

    await fs.promises.mkdir(RUNTIME_DIR, { recursive: true });
    const runtimeStepsPath = path.join(RUNTIME_DIR, `runtime_steps_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.json`);
    await fs.promises.writeFile(runtimeStepsPath, JSON.stringify(runtimeSteps, null, 2), 'utf-8');

    const testResult = await runPlaywrightTest(runtimeStepsPath);
    const logContent = testResult.logContent || '';
    const safeLogContent = logContent.length > MAX_LOG_CHARS ? logContent.slice(-MAX_LOG_CHARS) : logContent;

    const expectedOutcome = (scenario.beklenen_sonuc || 'SUCCESS_EXPECTED').toUpperCase();
    const status = evaluateTestOutcome(safeLogContent, project.hata_anahtar_kelimeleri || '', expectedOutcome, testResult.isSuccess);

    await saveReport({ ...baseReport, status, log_content: safeLogContent, created_at: new Date().toISOString() });

    return {
        status,
        message: status === 'SUCCESS' ? 'Test tamamlandı.' : 'Test koşturulurken hata tespit edildi.',
    };
}
