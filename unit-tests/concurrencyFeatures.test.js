import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createAiGate, withAiCapacity } = await import('../middleware/aiCapacity.js');
const { collectSecrets, redactSecrets } = await import('../services/testRunner.js');
const { safeChildEnv } = await import('../utils/safeEnv.js');
const { decrypt, encrypt } = await import('../utils/cryptoHelper.js');
const { BrowserSessions } = await import('../services/browserSessions.js');
const tick = (ms) => new Promise(r => setTimeout(r, ms));
const fakeRes = () => ({ status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

test('AI kapısı: kapasite dolunca bekler, yer açılınca sırayla devam eder', async () => {
    const gate = createAiGate({ concurrency: 1, maxWaitMs: 1000, perUser: 5 });
    assert.equal(await gate.acquire('a'), 'ok');
    let second = null;
    const waiting = gate.acquire('b').then(v => { second = v; });
    await tick(30);
    assert.equal(second, null, 'ikinci istek reddedilmeden bekliyor');
    gate.release('a');
    await waiting;
    assert.equal(second, 'ok');
    gate.release('b');
    assert.equal(gate.active, 0);
});

test('AI kapısı: bekleme süresi dolunca yoğun mesajı, kullanıcı başına tek çeviri', async () => {
    const gate = createAiGate({ concurrency: 1, maxWaitMs: 40, perUser: 1 });
    assert.equal(await gate.acquire('a'), 'ok');
    assert.equal(await gate.acquire('a'), 'user');
    assert.equal(await gate.acquire('b'), 'busy');
    gate.release('a');
    assert.equal(gate.active, 0);
    assert.equal(await gate.acquire('b'), 'ok');
    gate.release('b');
});

test('AI kapısı: handler sarmalayıcısı 429 döner ve slotu bırakır', async () => {
    let release;
    const h = withAiCapacity(async () => new Promise(r => { release = r; }), { concurrency: 1, maxWaitMs: 0, perUser: 1 });
    const first = h({ user: { id: 1 } }, fakeRes(), () => {});
    const r2 = fakeRes();
    await h({ user: { id: 2 } }, r2, () => {});
    assert.equal(r2.code, 429);
    release();
    await first;
    const r3 = fakeRes();
    const third = h({ user: { id: 3 } }, r3, () => {});
    await tick(10);
    assert.equal(r3.code, undefined, 'slot bırakıldığı için yeni istek kabul edilir (429 değil)');
    release();
    await third;
});

test('rapor logundan şifre benzeri değerler maskelenir', () => {
    const steps = {
        runSequence: '0',
        testData: { enabled: false, fields: [{ key: 'sifre', label: 'Şifre', value: 'Gizli-Parola-1', rule: 'fixed', action: 'fill' }, { key: 'ad', label: 'Ad', value: 'ayse', rule: 'fixed', action: 'fill' }], variables: [{ key: 'api_token', value: 'tok_123456', rule: 'fixed' }], recordings: [] },
        steps: [{ type: 'recorded', instruction: 'x', recorded: { action: 'fill', value: 'recPass99', target: { inputType: 'password' } } }],
    };
    const secrets = collectSecrets(steps, ['sk-anahtar-1']);
    assert.ok(secrets.includes('Gizli-Parola-1') && secrets.includes('tok_123456') && secrets.includes('recPass99') && secrets.includes('sk-anahtar-1'));
    assert.ok(!secrets.includes('ayse'));
    const log = redactSecrets('Type "Gizli-Parola-1" into field; ad ayse; tok_123456 / sk-anahtar-1 recPass99', secrets);
    assert.doesNotMatch(log, /Gizli-Parola-1|tok_123456|sk-anahtar-1|recPass99/);
    assert.match(log, /ayse/);
});

test('çocuk sürece ve Chromium a gizli anahtarlar geçmez', () => {
    const env = safeChildEnv({ PATH: '/bin', JWT_SECRET: 'a', ENCRYPTION_KEY: 'b', DPU_API_KEY: 'c', DPU_USER_PASSWORD: 'd', OPENAI_API_KEY: 'e', GEMINI_API_KEY: 'f', HOME: '/h', CHROME_PATH: '/c', PLAYWRIGHT_BROWSERS_PATH: '/p', HEADLESS: 'true' }, { RUNTIME_STEPS_PATH: '/x' });
    for (const k of ['JWT_SECRET', 'ENCRYPTION_KEY', 'DPU_API_KEY', 'DPU_USER_PASSWORD', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) assert.equal(env[k], undefined, k);
    assert.equal(env.PATH, '/bin');
    assert.equal(env.CHROME_PATH, '/c');
    assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, '/p');
    assert.equal(env.RUNTIME_STEPS_PATH, '/x');
    assert.equal(env.HEADLESS, 'true');
});

test('decrypt bozuk şifreli veriyi anahtar olarak geri döndürmez', () => {
    assert.equal(decrypt(encrypt('sk-test')), 'sk-test');
    assert.equal(decrypt('düz-metin'), 'düz-metin');
    assert.throws(() => decrypt('enc:00:00:00'));
    assert.throws(() => decrypt('enc:bozuk'));
});

test('kayıt oturumları: kullanıcı başına 1, toplamda RECORD_MAX', () => {
    process.env.RECORD_MAX = '2';
    const sessions = new BrowserSessions({ launch: async () => { throw new Error('tarayıcı yok'); }, proxy: async () => ({ url: 'http://127.0.0.1:1', close: async () => {} }) });
    clearInterval(sessions.timer);
    const add = (id, owner, state = 'recording') => sessions.sessions.set(id, { id, mode: 'record', owner: String(owner), state });
    add('s1', 1);
    assert.throws(() => sessions.checkRecordCapacity(1), /Zaten açık/);
    assert.doesNotThrow(() => sessions.checkRecordCapacity(2));
    add('s2', 2);
    assert.throws(() => sessions.checkRecordCapacity(3), /en fazla 2/);
    sessions.sessions.get('s1').state = 'closed';
    assert.doesNotThrow(() => sessions.checkRecordCapacity(3));
});
