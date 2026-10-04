import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dpu from '../config/dpuService.js';
import { runtimeStepsSchema } from '../schemas/runtimeSteps.js';
import { isSafeUrl } from '../utils/ipGuard.js';

// Çalışma anı adım dosyaları önbellekten AYRI bir klasörde tutulur;
// böylece önbellek temizliği koşan bir testin dosyasını silemez.
export const RUNTIME_DIR = path.join(process.cwd(), 'runtime');
const RUN_TIMEOUT_MS = 300_000;
const MAX_LOG_CHARS = 50_000;

export class RunPreparationError extends Error {}

// ─── DİNAMİK VE PROJE BAZLI HATA / GÜVENLİK DEĞERLENDİRİCİ ───
export function evaluateTestOutcome(logContent, customKeywordsRaw = '', expectedOutcome = 'SUCCESS_EXPECTED', isExecutionSuccess = true, expectedBlockVerified = false) {
    if (!isExecutionSuccess) return 'FAILED';
    if (expectedOutcome === 'ERROR_EXPECTED') return expectedBlockVerified ? 'SUCCESS' : 'FAILED';
    if (!logContent) return 'SUCCESS';
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

    const validated = runtimeStepsSchema.safeParse({ ...parsed, targetUrl,
        expectedOutcome: scenario.beklenen_sonuc || 'SUCCESS_EXPECTED' });
    if (!validated.success) throw new RunPreparationError('Senaryo adımları veya beklenen engelleme mesajı geçersiz. Senaryoyu düzenleyip yeniden kaydedin.');
    return validated.data;
}

// Playwright testini ayrı süreçte, zaman aşımıyla koşturur
export function runPlaywrightTest(stepsFilePath, timeoutMs = RUN_TIMEOUT_MS) {
    return new Promise((resolve) => {
        const resultPath = `${stepsFilePath}.result.json`;
        const cli = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
        const child = spawn(process.execPath, [cli, 'test', 'tests/ai-security.spec.ts', '--reporter=line', '--workers=1', '--retries=0'], {
            env: { ...process.env, RUNTIME_STEPS_PATH:stepsFilePath, RUNTIME_RESULT_PATH:resultPath, PLAYWRIGHT_HTML_OPEN:'never', PLAYWRIGHT_OUTPUT_DIR:`${stepsFilePath}.artifacts` },
            shell:false, detached:process.platform !== 'win32', windowsHide:true,
            stdio:['ignore','pipe','pipe'],
        });
        let logContent = '', timedOut = false, finished = false;
        const capture = chunk => { logContent = (logContent + String(chunk)).slice(-MAX_LOG_CHARS); };
        child.stdout.on('data',capture); child.stderr.on('data',capture);
        const timer = setTimeout(() => {
            timedOut = true;
            if (process.platform === 'win32') {
                spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());
            } else {
                try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
            }
        },timeoutMs);
        async function finish(code, error) {
            if (finished) return; finished = true; clearTimeout(timer);
            let result;
            try { result = JSON.parse(await fs.promises.readFile(resultPath,'utf8')); } catch {}
            await Promise.allSettled([fs.promises.rm(stepsFilePath,{force:true}), fs.promises.rm(resultPath,{force:true}), fs.promises.rm(`${stepsFilePath}.artifacts`,{recursive:true,force:true})]);
            const isSuccess = code === 0 && !timedOut && !error && result?.completed === true;
            if (!isSuccess) logContent += '\n[KOŞUCU_HATASI]: Test tamamlanamadı; altyapı hatası beklenen güvenlik engeli sayılmaz.';
            if (timedOut) logContent += '\n[HATA]: Test zaman aşımına uğradı.';
            resolve({isSuccess, logContent, expectedBlockVerified:isSuccess && result?.expectedBlockVerified === true});
        }
        child.on('error',err=>finish(null,err));
        child.on('close',code=>finish(code));
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
    await fs.promises.writeFile(runtimeStepsPath, JSON.stringify(runtimeSteps, null, 2), {encoding:'utf-8',mode:0o600});

    const testResult = await runPlaywrightTest(runtimeStepsPath);
    const logContent = testResult.logContent || '';
    const safeLogContent = logContent.length > MAX_LOG_CHARS ? logContent.slice(-MAX_LOG_CHARS) : logContent;

    const expectedOutcome = (scenario.beklenen_sonuc || 'SUCCESS_EXPECTED').toUpperCase();
    const status = evaluateTestOutcome(safeLogContent, project.hata_anahtar_kelimeleri || '', expectedOutcome, testResult.isSuccess, testResult.expectedBlockVerified);

    await saveReport({ ...baseReport, status, log_content: safeLogContent, created_at: new Date().toISOString() });

    return {
        status,
        message: status === 'SUCCESS' ? 'Test tamamlandı.' : 'Test koşturulurken hata tespit edildi.',
    };
}
