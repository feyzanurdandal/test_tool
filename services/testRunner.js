import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dpu from '../config/dpuService.js';
import { runtimeStepsSchema } from '../schemas/runtimeSteps.js';
import { applyScenarioData, needsSequence, generateValue } from '../utils/scenarioData.js';
import { getEffectiveEntries } from '../utils/hostPolicy.js';
import { safeChildEnv } from '../utils/safeEnv.js';
import { loadRunnerAiConfig } from './aiRunConfig.js';
import { invalidateReports } from './reportService.js';
import { reserveRunSequence } from './runSequence.js';
import { isSafeUrl } from '../utils/ipGuard.js';
import { stripStagehandLogs } from '../utils/logFilter.js';
import { analysisEnabled, withAnalysisBlock, pendingBlock, scheduleAnalysis } from './reportAnalysis.js';

// Çalışma anı adım dosyaları önbellekten AYRI bir klasörde tutulur;
// böylece önbellek temizliği koşan bir testin dosyasını silemez.
export const RUNTIME_DIR = path.join(process.cwd(), 'runtime');
const RUN_TIMEOUT_MS = 300_000;
const RUN_TIMEOUT_MAX_MS = 30 * 60_000;

/**
 * Bir testin süre sınırı. Yapay zeka adımı başına ~30 sn pay tanınır (sağlayıcı gecikmeleri 15-40 sn'ye çıkabilir):
 * max(5 dk, 90 sn + 30 sn × adım), en çok 30 dk. RUN_TIMEOUT_SECONDS verilirse sabit değer olarak o kullanılır.
 */
export function computeRunTimeoutMs(runtimeSteps, envValue = process.env.RUN_TIMEOUT_SECONDS) {
    const forced = Number(envValue);
    if (Number.isFinite(forced) && forced > 0) return Math.min(forced * 1000, 2 * 3600_000);
    const aiSteps = (runtimeSteps?.steps || []).filter(step => step.type !== 'recorded').length;
    return Math.min(RUN_TIMEOUT_MAX_MS, Math.max(RUN_TIMEOUT_MS, 90_000 + 30_000 * aiSteps));
}
const MAX_LOG_CHARS = 50_000;

export class RunPreparationError extends Error {}

// Seçici önbelleği ("yapay zeka bir kez, sonrası deterministik"): cache/selectors/<anahtar>.json.
// "Önbelleği Temizle" düğmesi cache/ klasörünü sildiği için bunu da temizler. SELECTOR_CACHE=off ile kapatılır.
const SELECTOR_CACHE_DIR = path.join(process.cwd(), 'cache', 'selectors');
const SELECTOR_CACHE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
function selectorCacheFileFor(key) {
    if (!key || process.env.SELECTOR_CACHE === 'off') return null;
    // 30 günden eski (artık kullanılmayan) senaryo önbellekleri en iyi çabayla temizlenir
    fs.promises.readdir(SELECTOR_CACHE_DIR).then(async names => {
        const cutoff = Date.now() - SELECTOR_CACHE_MAX_AGE_MS;
        for (const name of names) {
            const file = path.join(SELECTOR_CACHE_DIR, name);
            const st = await fs.promises.stat(file).catch(() => null);
            if (st && st.mtimeMs < cutoff) await fs.promises.rm(file, { force: true }).catch(() => {});
        }
    }).catch(() => {});
    return path.join(SELECTOR_CACHE_DIR, `${key}.json`);
}

// ─── DİNAMİK VE PROJE BAZLI HATA / GÜVENLİK DEĞERLENDİRİCİ ───
export function evaluateTestOutcome(logContent, customKeywordsRaw = '', expectedOutcome = 'SUCCESS_EXPECTED', isExecutionSuccess = true, expectedBlockVerified = false) {
    if (!isExecutionSuccess) return 'FAILED';
    if (expectedOutcome === 'ERROR_EXPECTED') return expectedBlockVerified ? 'SUCCESS' : 'FAILED';
    if (!logContent) return 'SUCCESS';
    return findFailureKeyword(logContent, customKeywordsRaw) ? 'FAILED' : 'SUCCESS';
}

const BASE_ERROR_KEYWORDS = [
    'error:', 'exception:', 'cannot find element',
    'incorrect api key', 'failed to launch', 'timeout',
    'execution context was destroyed', 'alert:', 'modal-error'
];

/**
 * Günlükte (Stagehand iç kayıtları HARİÇ) başarısızlık anahtar kelimesi arar.
 * Stagehand'in kurtarılmış iç hataları ("error: Could not find an element..." vb.) karara karışmaz; tam günlük yine kaydedilir.
 * @returns {{keyword: string, source: 'temel kural'|'proje anahtar kelimesi', line: string}|null}
 */
export function findFailureKeyword(logContent, customKeywordsRaw = '') {
    const lines = stripStagehandLogs(logContent).split('\n');
    const custom = (customKeywordsRaw || '').split('\n').map(k => k.trim().toLowerCase()).filter(Boolean);
    const candidates = [...BASE_ERROR_KEYWORDS.map(keyword => ({ keyword, source: 'temel kural' })),
                        ...custom.map(keyword => ({ keyword, source: 'proje anahtar kelimesi' }))];
    for (const c of candidates) {
        const line = lines.find(l => l.toLowerCase().includes(c.keyword));
        if (line !== undefined) return { ...c, line: line.trim().slice(0, 200) };
    }
    return null;
}

/** Çıkış kodu 0 olduğu halde FAILED verilen testler için günlüğe eklenecek açıklama satırı ('' = gerek yok). */
export function explainOutcome(logContent, customKeywordsRaw, status, expectedOutcome, isExecutionSuccess) {
    if (status !== 'FAILED' || !isExecutionSuccess || expectedOutcome === 'ERROR_EXPECTED') return '';
    const hit = findFailureKeyword(logContent, customKeywordsRaw);
    if (!hit) return '';
    return `\n[DEĞERLENDİRME]: Test adımları hatasız tamamlandı, ancak günlükte "${hit.keyword}" anahtar kelimesi bulundu (${hit.source}) ve durum buna göre FAILED yapıldı. Satır: ${hit.line}`;
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
    try {
        const sequence=needsSequence(validated.data.testData) ? await reserveRunSequence(String(scenario.project_id)+':'+String(scenario.id || scenario.senaryo_adi)) : '0';
        const out = applyScenarioData(validated.data,sequence);
        // Seçici önbelleği anahtarı: senaryo + ŞABLON adımlar (test verisi yerleştirilmeden önce).
        // Adımlar düzenlenirse anahtar değişir ve eski seçiciler kullanılmaz.
        out.selectorCacheKey = crypto.createHash('sha256')
            .update(`${scenario.project_id}:${scenario.id ?? scenario.senaryo_adi}:${JSON.stringify(validated.data.steps.map(st => [st.type, st.instruction]))}`)
            .digest('hex').slice(0, 32);
        return out;
    } catch(e) { throw new RunPreparationError(e.message); }
}

const SECRET_LIKE = /password|passwd|şifre|sifre|parola|token|secret/i;

/** Rapor logunda görünmemesi gereken (şifre benzeri) gerçek değerleri toplar. */
export function collectSecrets(runtimeSteps, extra = []) {
    const secrets = new Set(extra.filter(v => typeof v === 'string'));
    const add = v => { if (typeof v === 'string' && v.length >= 3) secrets.add(v); };
    const data = runtimeSteps?.testData || {};
    for (const f of data.fields || []) {
        if (f.target?.inputType === 'password' || SECRET_LIKE.test(`${f.key} ${f.label}`)) {
            add(f.value);
            try { add(generateValue(f.value, runtimeSteps.testData.enabled ? f.rule : 'fixed', runtimeSteps.runSequence || '0')); } catch {}
        }
    }
    for (const v of data.variables || []) {
        if (SECRET_LIKE.test(v.key)) {
            add(v.value);
            try { add(generateValue(v.value, data.enabled ? v.rule : 'fixed', runtimeSteps.runSequence || '0')); } catch {}
        }
    }
    for (const r of data.recordings || []) if (r.target?.inputType === 'password') add(r.value);
    for (const step of runtimeSteps?.steps || []) {
        if (step.type === 'form' && step.form && (step.form.target?.inputType === 'password' || SECRET_LIKE.test(`${step.form.key} ${step.form.label}`))) add(step.form.value);
        if (step.type === 'recorded' && step.recorded?.target?.inputType === 'password') add(step.recorded.value);
    }
    return [...secrets].filter(v => v.length >= 3).sort((a, b) => b.length - a.length);
}

/** Verilen gizli değerleri logdan maskeler. */
export function redactSecrets(text, secrets) {
    let out = String(text ?? '');
    for (const secret of secrets || []) if (secret && out.includes(secret)) out = out.split(secret).join('••••••');
    return out;
}

// Playwright testini ayrı süreçte, zaman aşımıyla koşturur
export function runPlaywrightTest(stepsFilePath, timeoutMs = RUN_TIMEOUT_MS, liveFramePath = null, { liveFrameIntervalMs = 0, signal = null, selectorCacheFile = null, testTimeoutMs = 0, expectedOutcome = 'SUCCESS_EXPECTED' } = {}) {
    return new Promise((resolve) => {
        const resultPath = `${stepsFilePath}.result.json`;
        const cli = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
        const child = spawn(process.execPath, [cli, 'test', 'tests/ai-security.spec.ts', '--reporter=line', '--workers=1', '--retries=0'], {
            // Gizli anahtarlar (JWT/ENCRYPTION/DPU/AI) çocuk sürece ve Chromium'a geçmez.
            env: safeChildEnv(process.env, { ...(liveFramePath?{RUN_LIVE_FRAME_PATH:liveFramePath}:{}), ...(liveFrameIntervalMs?{RUN_LIVE_FRAME_INTERVAL_MS:String(liveFrameIntervalMs)}:{}), ...(selectorCacheFile?{SELECTOR_CACHE_FILE:selectorCacheFile}:{}), ...(testTimeoutMs?{RUN_TEST_TIMEOUT_MS:String(testTimeoutMs)}:{}), RUNTIME_STEPS_PATH:stepsFilePath, RUNTIME_RESULT_PATH:resultPath, PLAYWRIGHT_HTML_OPEN:'never', PLAYWRIGHT_OUTPUT_DIR:`${stepsFilePath}.artifacts` }),
            shell:false, detached:process.platform !== 'win32', windowsHide:true,
            stdio:['ignore','pipe','pipe'],
        });
        let logContent = '', timedOut = false, finished = false;
        const capture = chunk => { logContent = (logContent + String(chunk)).slice(-MAX_LOG_CHARS); };
        child.stdout.on('data',capture); child.stderr.on('data',capture);
        const killTree = () => {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());
            } else {
                try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
            }
        };
        let aborted = false;
        const onAbort = () => { aborted = true; killTree(); };
        if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
        const timer = setTimeout(() => { timedOut = true; killTree(); },timeoutMs);
        async function finish(code, error) {
            if (finished) return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
            let result;
            try { result = JSON.parse(await fs.promises.readFile(resultPath,'utf8')); } catch {}
            await Promise.allSettled([fs.promises.rm(stepsFilePath,{force:true}), fs.promises.rm(resultPath,{force:true}), fs.promises.rm(`${stepsFilePath}.artifacts`,{recursive:true,force:true})]);
            const isSuccess = code === 0 && !timedOut && !error && result?.completed === true;
            // Bu not yalnızca "hata/engel beklenen" senaryolarda anlamlıdır; normal senaryoda yanıltıcı olduğundan eklenmez.
            if (!isSuccess && expectedOutcome === 'ERROR_EXPECTED') logContent +='\n[KOŞUCU_HATASI]: Test tamamlanamadı; altyapı hatası beklenen güvenlik engeli sayılmaz.';
            if (timedOut) logContent += `\n[HATA]: Test zaman aşımına uğradı (süre sınırı ${Math.round(timeoutMs / 60000)} dk).`;
            resolve({isSuccess, aborted, logContent, expectedBlockVerified:isSuccess && result?.expectedBlockVerified === true});
        }
        child.on('error',err=>finish(null,err));
        child.on('close',code=>finish(code));
    });
}

// analysisCtx verilirse (ve AI_REPORT_ANALYSIS kapalı değilse) rapor "yorum hazırlanıyor" işaretiyle kaydedilir,
// ardından yapay zeka yorumu arka planda üretilip aynı satıra yazılır. Yorum durumu ETKİLEMEZ.
async function saveReport(report, analysisCtx = null) {
    try {
        const withAi = !!analysisCtx && analysisEnabled();
        const baseLog = report.log_content;
        const row = withAi ? { ...report, log_content: withAnalysisBlock(baseLog, pendingBlock()) } : report;
        const res = await dpu.insert('raporlar', row);
        if (!res?.success) console.error('Rapor veritabanına yazılamadı:', res?.error);
        invalidateReports(report.project_id);
        if (withAi && res?.success) {
            let reportId = res.data?.id ?? res.data?.insertId ?? null;
            if (reportId == null) {
                const found = await dpu.findOne('raporlar', { project_id: { eq: report.project_id }, scenario_name: { eq: report.scenario_name }, created_at: { eq: report.created_at } }).catch(() => null);
                reportId = found?.id ?? null;
            }
            scheduleAnalysis({ reportId, projectId: report.project_id, baseLog, ctx: { ...analysisCtx, status: report.status } });
        }
    } catch (err) {
        console.error('Rapor veritabanına yazılırken istisna oluştu:', err.message);
    }
}

/**
 * Bir senaryoyu uçtan uca çalıştırır ve raporunu kaydeder.
 * @returns {Promise<{ status: 'SUCCESS'|'FAILED', message: string }>}
 */
export async function executeScenario(project, scenario, { liveFramePath = null, liveFrameIntervalMs = 0, signal = null } = {}) {
    if (signal?.aborted) return { status: 'CANCELLED', message: 'Test iptal edildi.' };
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

    // AI ayarları ve izin listesi ANA süreçte hazırlanır; çocuk sürece yalnızca dosyayla verilir.
    let aiConfig;
    try {
        aiConfig = await loadRunnerAiConfig();
    } catch (err) {
        await saveReport({ ...baseReport, status: 'FAILED', log_content: `[HATA]: ${err.message}`, created_at: new Date().toISOString() });
        return { status: 'FAILED', message: err.message };
    }
    const hostPolicy = await getEffectiveEntries();

    await fs.promises.mkdir(RUNTIME_DIR, { recursive: true });
    const runtimeStepsPath = path.join(RUNTIME_DIR, `runtime_steps_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.json`);
    await fs.promises.writeFile(runtimeStepsPath, JSON.stringify({ ...runtimeSteps, hostPolicy, aiConfig }, null, 2), {encoding:'utf-8',mode:0o600});

    // Playwright'ın kendi test süresi T, üst süreç T + 30 sn'de öldürür (başlatma payı); böylece sınır önce temiz bir mesajla dolar.
    const testTimeoutMs = computeRunTimeoutMs(runtimeSteps);
    const expectedOutcome = (scenario.beklenen_sonuc || 'SUCCESS_EXPECTED').toUpperCase();
    const testResult = await runPlaywrightTest(runtimeStepsPath, testTimeoutMs + 30_000, liveFramePath, { liveFrameIntervalMs, signal, testTimeoutMs, expectedOutcome, selectorCacheFile: selectorCacheFileFor(runtimeSteps.selectorCacheKey) });
    if (testResult.aborted) return { status: 'CANCELLED', message: 'Test iptal edildi.' };
    const secrets = collectSecrets(runtimeSteps, [aiConfig.apiKey]);
    const logContent = redactSecrets((runtimeSteps.runSequence !== '0' ? `[VERİ_KOŞUSU]: ${runtimeSteps.runSequence}
` : '') + (testResult.logContent || ''), secrets);
    const safeLogContent = logContent.length > MAX_LOG_CHARS ? logContent.slice(-MAX_LOG_CHARS) : logContent;

    const status = evaluateTestOutcome(safeLogContent, project.hata_anahtar_kelimeleri || '', expectedOutcome, testResult.isSuccess, testResult.expectedBlockVerified);

    const reason = explainOutcome(safeLogContent, project.hata_anahtar_kelimeleri || '', status, expectedOutcome, testResult.isSuccess);
    await saveReport({ ...baseReport, status, log_content: safeLogContent + reason, created_at: new Date().toISOString() }, {
        scenarioName: scenario.senaryo_adi,
        testType: baseReport.test_tipi,
        expectedOutcome,
        steps: (runtimeSteps.steps || []).map(s => s.instruction || s.type || ''),
    });

    return {
        status,
        message: status === 'SUCCESS' ? 'Test tamamlandı.' : 'Test koşturulurken hata tespit edildi.',
    };
}
