// Rapor penceresi adım ayrıştırıcısı (public/js/app.js içindeki parseLogsToSteps) — tarayıcısız, işlev metni çıkarılıp çalıştırılır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const a = src.indexOf('    function parseLogsToSteps(logContent)');
const b = src.indexOf('    async function loadReports()');
const parseLogsToSteps = new Function(src.slice(a, b) + '\nreturn parseLogsToSteps;')();

const ins = (text, extra = '') => `    instruction: "Current test step: ${text}\\nIdentify the single next interaction needed for this step.\\nDo not perform any interaction during observation.${extra}"`;
const block = (time, msg, ...rest) => `[2026-11-23 09:20:${time} +0000] INFO: ${msg}\n${rest.join('\n')}\n`;

const log = [
    'Running 1 test using 1 worker', '[SÜRE] başlatma: tarayıcı açılışı 0.9 sn',
    'AI SDK Warning: System messages in the prompt',
    block('46.583', 'starting observation', '    category: "observation"', ins('Type \\"a@b.c\\" into the input field labeled \\"e-posta\\"')),
    block('47.775', 'found elements', '    category: "observation"', '    elements: [', '      {', '        "description": "E-Posta",', '        "method": "fill",', '      }', '    ]'),
    '[ÇÖZÜM] adım 1: yapay zeka (1. deneme) — toplam 1.6 sn',
    block('50.930', 'starting observation', '    category: "observation"', ins('Click on the button labeled \\"giriş yap\\"')),
    '[ÇÖZÜM] adım 2: yapay zeka (1. deneme) — toplam 1.3 sn',
    block('52.836', 'starting observation', '    category: "observation"', ins('Click on the section labeled \\"başvuru\\" in the left panel')),
    block('57.325', 'starting observation', '    category: "observation"', ins('Click on the section labeled \\"başvuru\\" in the left panel', '\\n\\nIMPORTANT - correction for this retry: x')),
    '[TEŞHİS] sayfa: https://x/ | başlık: "I.M.E."',
    '🛑 Test Adımı Başarısız Oldu ve Durduruldu: ACTION_FAILED: bulunamadı',
    '  1) [chromium] › spec',
    '    Error: CRITICAL_STEP_FAILED: Click on the section labeled "başvuru" in the left panel -> Detay: ACTION_FAILED: bulunamadı',
    '  1 failed',
    '[KOŞUCU_HATASI]: x',
].join('\n');

test('yeniden denemeler tek adımda toplanır, Stagehand iç satırları başlık olmaz, başarısız adım doğru işaretlenir', () => {
    const steps = parseLogsToSteps(log);
    assert.deepEqual(steps.map(s => s.title), [
        'Başlatma ve Hazırlık',
        'Type "a@b.c" into the input field labeled "e-posta"',
        'Click on the button labeled "giriş yap"',
        'Click on the section labeled "başvuru" in the left panel',
    ]);
    assert.deepEqual(steps.map(s => s.status), ['PASSED', 'PASSED', 'PASSED', 'FAILED']);
    assert.equal(steps.filter(s => !s.info).length, 3);
    assert.ok(steps.every(s => !s.title.includes('IMPORTANT')));
    assert.ok(steps[3].logs.some(l => l.includes('CRITICAL_STEP_FAILED')));
});

test('aynı metinli iki ardışık adım (ÇÖZÜM ile ayrılmış) iki ayrı adım olur', () => {
    const l = [block('01.000', 'starting observation', ins('Click X')), '[ÇÖZÜM] adım 1: önbellek', block('02.000', 'starting observation', ins('Click X')), '[ÇÖZÜM] adım 2: önbellek'].join('\n');
    assert.equal(parseLogsToSteps(l).filter(s => !s.info).length, 2);
});

test('önbellekten çözülen (Stagehand bloğu olmayan) adım "Adım N" olarak görünür; veri çekme adımı ayrı', () => {
    const l = ['[ÇÖZÜM] adım 1: önbellek', '*** [BAŞARIYLA AYIKLANDI] extracted_data -> I.M.E.', '  1 passed'].join('\n');
    const steps = parseLogsToSteps(l);
    assert.equal(steps[0].title, 'Adım 1');
    assert.match(steps[1].title, /^Veri çekme: extracted_data → I\.M\.E\./);
    assert.ok(steps.every(s => s.status === 'PASSED'));
});

test('işaret içermeyen eski rapor eski ayrıştırıcıya düşer (çökmez)', () => {
    assert.ok(Array.isArray(parseLogsToSteps('düz bir günlük satırı\nbaşka satır')));
});
