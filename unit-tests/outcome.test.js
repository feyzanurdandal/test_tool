// Durum kararı: Stagehand iç kayıtları (kurtarılmış hatalar) karara karışmaz; gerçek hatalar yine FAILED verir.
import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { evaluateTestOutcome, findFailureKeyword, explainOutcome } = await import('../services/testRunner.js');
const { stripStagehandLogs, evidenceLines } = await import('../utils/logFilter.js');

const temiz = `[VERİ_KOŞUSU]: 3
Running 1 test using 1 worker
[ÇÖZÜM] adım 1: yapay zeka (1. deneme) — toplam 6.8 sn
*** [BAŞARIYLA AYIKLANDI] extracted_data -> I.M.E.
[SÜRE] test 82 sn sürdü
  1 passed (1.4m)`;

const stagehandHata = `[2026-11-23 08:31:18.646 +0000] INFO: error filling element
    error: "Could not find an element for the given xPath(s): xpath=/html[1]/body[1]"
    trace: "UnderstudyCommandException: Could not find an element\\n    at fillOrType"

[2026-11-23 08:31:18.700 +0000] INFO: retrying`;

test('yalnızca Stagehand iç hata blokları varsa SUCCESS', () => {
    const log = temiz + '\n' + stagehandHata + '\nAI SDK Warning: error: something';
    assert.equal(evaluateTestOutcome(log, '', 'SUCCESS_EXPECTED', true, false), 'SUCCESS');
});

test('Stagehand bloğundan sonraki araç/Playwright satırları taranmaya devam eder', () => {
    const log = stagehandHata + '\nError: CRITICAL_STEP_FAILED adım 3\n' + temiz;
    assert.equal(evaluateTestOutcome(log, '', 'SUCCESS_EXPECTED', true, false), 'FAILED');
    assert.match(findFailureKeyword(log).line, /CRITICAL_STEP_FAILED/);
});

test('proje anahtar kelimesi Stagehand dışı satırda bulunursa FAILED ve açıklama üretilir', () => {
    const log = temiz + '\n[TEŞHİS] ekranda: Oturum süresi doldu';
    assert.equal(evaluateTestOutcome(log, 'oturum süresi doldu', 'SUCCESS_EXPECTED', true, false), 'FAILED');
    const why = explainOutcome(log, 'oturum süresi doldu', 'FAILED', 'SUCCESS_EXPECTED', true);
    assert.match(why, /^\n\[DEĞERLENDİRME\]/);
    assert.match(why, /proje anahtar kelimesi/);
});

test('proje anahtar kelimesi yalnızca Stagehand bloğundaysa sayılmaz', () => {
    assert.equal(evaluateTestOutcome(temiz + '\n' + stagehandHata, 'xpath', 'SUCCESS_EXPECTED', true, false), 'SUCCESS');
});

test('açıklama: çıkış kodu başarısızsa, SUCCESS ise veya ERROR_EXPECTED ise eklenmez', () => {
    const log = temiz + '\nError: x';
    assert.equal(explainOutcome(log, '', 'FAILED', 'SUCCESS_EXPECTED', false), '');
    assert.equal(explainOutcome(temiz, '', 'SUCCESS', 'SUCCESS_EXPECTED', true), '');
    assert.equal(explainOutcome(log, '', 'FAILED', 'ERROR_EXPECTED', true), '');
});

test('stripStagehandLogs ve evidenceLines', () => {
    const out = stripStagehandLogs(temiz + '\n' + stagehandHata);
    assert.ok(!out.includes('xpath'));
    assert.ok(out.includes('1 passed'));
    const ev = evidenceLines(stagehandHata + '\n' + temiz + '\nrastgele satır');
    assert.ok(ev.some(l => l.startsWith('[SÜRE]')));
    assert.ok(!ev.some(l => l.includes('xpath') || l.includes('rastgele')));
});
