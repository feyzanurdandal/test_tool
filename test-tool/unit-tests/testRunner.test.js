import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { evaluateTestOutcome, buildRuntimeSteps, RunPreparationError } = await import('../services/testRunner.js');

test('normal testte hata kelimesi FAILED yapar', () => {
    assert.equal(evaluateTestOutcome('her şey yolunda', '', 'SUCCESS_EXPECTED', true), 'SUCCESS');
    assert.equal(evaluateTestOutcome('Error: bir şey kırıldı', '', 'SUCCESS_EXPECTED', true), 'FAILED');
    assert.equal(evaluateTestOutcome('temiz log', 'yetkisiz erişim', 'SUCCESS_EXPECTED', false), 'FAILED');
});

test('güvenlik testinde beklenen engelleme SUCCESS sayılır', () => {
    assert.equal(evaluateTestOutcome('istek engellendi: waf', 'engellendi', 'ERROR_EXPECTED', true, true), 'SUCCESS');
    assert.equal(evaluateTestOutcome('sorunsuz geçti', 'engellendi', 'ERROR_EXPECTED', true), 'FAILED');
});

test('hedef URL yapay zeka çıktısından değil kayıtlı alandan alınır', async () => {
    const scenario = {
        hedef_url: 'https://1.1.1.1/',
        adimlar: JSON.stringify({ targetUrl: 'http://169.254.169.254/latest/meta-data', steps: [{ type: 'act', instruction: 'x' }] }),
    };
    const out = await buildRuntimeSteps(scenario);
    assert.equal(out.targetUrl, 'https://1.1.1.1/');
    assert.equal(out.steps.length, 1);
});

test('kayıtlı URL iç ağa çözümleniyorsa çalıştırma anında reddedilir', async () => {
    const scenario = { hedef_url: 'http://127.0.0.1:8080/', adimlar: JSON.stringify({ steps: [] }) };
    await assert.rejects(buildRuntimeSteps(scenario), RunPreparationError);
});

test('hedef_url boşsa JSON içindeki değer de aynı denetimden geçer', async () => {
    const scenario = { hedef_url: '', adimlar: JSON.stringify({ targetUrl: 'http://10.0.0.1/', steps: [] }) };
    await assert.rejects(buildRuntimeSteps(scenario), /Güvenlik Engeli/);
});

test('bozuk adım JSON\'u anlaşılır hata verir', async () => {
    await assert.rejects(buildRuntimeSteps({ hedef_url: 'https://1.1.1.1/', adimlar: '{bozuk' }), RunPreparationError);
    await assert.rejects(buildRuntimeSteps({ hedef_url: 'https://1.1.1.1/', adimlar: '{"x":1}' }), RunPreparationError);
});
