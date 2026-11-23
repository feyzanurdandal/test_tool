import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { parseInstruction, turkishRegex, judge, SelectorCache, labelMismatch, foldText, methodMismatch } = await import('../utils/aiStepExecutor.js');
const { QUALIFIER_RULES } = await import('../utils/translator.js');
const { buildRuntimeSteps, computeRunTimeoutMs } = await import('../services/testRunner.js');

test('talimat ayrıştırıcı: çevirmenin ürettiği kalıpları çerçeve adı olmadan çözer', () => {
    const cases = [
        ['Type "ali@x.com" into the input field labeled "e-posta"', { intent: 'fill', value: 'ali@x.com', label: 'e-posta', kind: 'input' }],
        ['Type "aranan" into the input field labeled "ara" and press Enter', { intent: 'fill', value: 'aranan', label: 'ara', pressEnter: true }],
        ['Click on the button labeled "giriş yap"', { intent: 'click', label: 'giriş yap', kind: 'button' }],
        ['Click on the dropdown labeled "Fakülte/MYO"', { intent: 'click', label: 'Fakülte/MYO', kind: 'dropdown' }],
        ['Click on "matematik" in the opened list', { intent: 'click', label: 'matematik', kind: 'option' }],
        ['Check the checkbox labeled "Fen edebiyat fakültesi" in the "IME Aktif Başvuru Listesi" section', { intent: 'check', label: 'Fen edebiyat fakültesi', scope: 'IME Aktif Başvuru Listesi', kind: 'checkbox' }],
        ['Uncheck the checkbox labeled "x"', { intent: 'uncheck', label: 'x' }],
        ['Select "Bahar" from the dropdown', { intent: 'select', label: 'Bahar' }],
    ];
    for (const [text, expected] of cases) {
        const parsed = parseInstruction(text);
        for (const [key, value] of Object.entries(expected)) assert.equal(parsed[key], value, `${text} -> ${key}`);
    }
    // tırnaksız/anlaşılmayan talimat tahmin üretmez
    assert.equal(parseInstruction('Close the pop-up if it appears').label, null);
    assert.equal(parseInstruction('Type something somewhere').value, null);
});

test('Türkçe harf duyarsız eşleşme', () => {
    assert.ok(turkishRegex('Giriş Yap').test('GİRİŞ YAP'));
    assert.ok(turkishRegex('ıspanak').test('İSPANAK'));
    assert.ok(turkishRegex('a+b (x)').test('A+B (X)'), 'regex özel karakterleri kaçışlanır');
    assert.ok(!turkishRegex('giriş', { exact: true }).test('giriş yap'));
});

test('sonuç doğrulama kararları', () => {
    const cb = (checked) => ({ checkable: true, checked, radio: false });
    assert.equal(judge({ intent: 'check' }, 'click', [], cb(false), cb(true)).ok, true);
    assert.equal(judge({ intent: 'check' }, 'click', [], cb(false), cb(false)).ok, false);
    assert.equal(judge({ intent: 'check' }, 'click', [], cb(true), cb(false)).ok, false, 'zaten işaretliyken tıklamak kutuyu kapatırsa hata');
    assert.equal(judge({ intent: 'uncheck' }, 'click', [], cb(true), cb(false)).ok, true);
    assert.equal(judge({ intent: 'click' }, 'click', [], cb(false), cb(false)).ok, false, 'durum değişmedi');
    assert.equal(judge({ intent: 'click' }, 'click', [], { checkable: false }, { checkable: false }).ok, true, 'kanıt yoksa engellenmez');
    assert.equal(judge({ intent: 'fill' }, 'fill', ['abc'], { value: '' }, { value: '' }).ok, false);
    assert.equal(judge({ intent: 'fill' }, 'fill', ['abc'], { value: '' }, { value: '(555) 12' }).ok, true, 'maskeli alanlarda farklı biçim engellenmez');
    assert.equal(judge({ intent: 'fill' }, 'fill', [''], { value: '' }, { value: '' }).ok, true);
    assert.equal(judge({}, 'click', [], null, null).ok, true);
});

test('önbellek dosyası: kaydet/oku/sayfa anahtarı/silme, bozuk dosyada sessizce sıfırlanır', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-cache-unit-'));
    const file = path.join(dir, 'a', 'b.json');
    const c = new SelectorCache(file);
    assert.equal(c.get(0, 'https://x.test/giris'), null);
    c.set(0, { pageKey: 'https://x.test/giris', method: 'click', selector: 'xpath=/html[1]/body[1]/button[1]', fp: { tag: 'button', type: '', name: '', text: 'giriş' } });
    c.commit();
    assert.equal(new SelectorCache(file).get(0, 'https://x.test/giris').selector, 'xpath=/html[1]/body[1]/button[1]');
    assert.equal(new SelectorCache(file).get(0, 'https://x.test/baska'), null);
    assert.equal(new SelectorCache(file).get(1, 'https://x.test/giris'), null);
    c.delete(0);
    assert.equal(new SelectorCache(file).get(0, 'https://x.test/giris'), null);
    fs.writeFileSync(file, '{bozuk');
    assert.equal(new SelectorCache(file).get(0, 'x'), null);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('seçici önbelleği anahtarı şablon adımlardan türer: test verisi değişse de aynı, adım düzenlenince farklı', async () => {
    const mk = (instruction, value) => ({
        id: 7, project_id: 1, hedef_url: 'https://1.1.1.1/',
        adimlar: JSON.stringify({ steps: [{ type: 'act', instruction }], testData: { enabled: true, fields: [], variables: [{ key: 'ad', value, rule: 'suffix' }], recordings: [] } }),
    });
    const a = await buildRuntimeSteps(mk('Type "{{data.ad}}" into the input field labeled "ad"', 'ali1'));
    const b = await buildRuntimeSteps(mk('Type "{{data.ad}}" into the input field labeled "ad"', 'ali1'));
    const edited = await buildRuntimeSteps(mk('Type "{{data.ad}}" into the input field labeled "soyad"', 'ali1'));
    assert.match(a.selectorCacheKey, /^[0-9a-f]{32}$/);
    assert.notEqual(a.steps[0].instruction, b.steps[0].instruction, 'her koşuda yeni veri üretilir');
    assert.equal(a.selectorCacheKey, b.selectorCacheKey, 'ama önbellek anahtarı sabit kalır');
    assert.notEqual(a.selectorCacheKey, edited.selectorCacheKey);
});

test('etiket uyuşma denetimi kararları', () => {
    const el = (labels, extra = {}) => ({ tag: 'button', type: '', checkable: false, labels, ...extra });
    const p = (text) => parseInstruction(text);
    assert.deepEqual(labelMismatch(p('Click on the button labeled "devam et"'), el(['Giriş Yap'])), { found: 'Giriş Yap', wanted: 'devam et' });
    assert.equal(labelMismatch(p('Click on the button labeled "giriş yap"'), el(['Giriş Yap'])), null);
    assert.equal(labelMismatch(p('Click on the button labeled "GİRİŞ YAP"'), el(['giriş yap'])), null, 'İ/i duyarsız');
    assert.equal(labelMismatch(p('Click on the section labeled "başvur"'), el(['BAŞVURU VE TERCİH'], { tag: 'span' })), null, 'kısmi/aksan duyarsız eşleşme');
    assert.equal(labelMismatch(p('Click on the button labeled "kaydet"'), el([])), null, 'adsız (ikon) eleman: kanıt yok');
    assert.equal(labelMismatch(p('Click on the dropdown labeled "Fakülte"'), el(['Seçiniz'], { tag: 'div' })), null, 'açılır liste etiketi eleman metni değildir');
    assert.equal(labelMismatch(p('Type "a" into the input field labeled "ad"'), el(['x'], { tag: 'input' })), null);
    assert.equal(labelMismatch(p('Check the checkbox labeled "x"'), el(['y'], { checkable: true })), null);
    assert.equal(labelMismatch(p('Click on the button labeled "OK"'), el(['Tamam'])), null, 'çok kısa etiket: kanıt yok');
    assert.equal(labelMismatch(p('Close the pop-up if it appears'), el(['Giriş Yap'])), null, 'etiket yok');
    assert.equal(labelMismatch(p('Click on the button labeled "x"'), null), null);
    assert.equal(foldText('İĞNE Çanta Şişe'), 'igne canta sise');
});

test('önbellek: set() yalnızca commit() ile kalıcı olur; delete() bekleyeni de siler', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-cache-commit-'));
    const file = path.join(dir, 'c.json');
    const c = new SelectorCache(file);
    c.set(0, { pageKey: 'k', method: 'click', selector: 'xpath=/a', fp: { tag: 'a' } });
    assert.ok(!fs.existsSync(file));
    c.commit();
    assert.equal(new SelectorCache(file).get(0, 'k').selector, 'xpath=/a');
    c.set(1, { pageKey: 'k', method: 'click', selector: 'xpath=/b', fp: { tag: 'b' } });
    c.delete(1);
    c.commit();
    assert.equal(new SelectorCache(file).get(1, 'k'), null);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('test süre sınırı adım sayısına göre büyür; RUN_TIMEOUT_SECONDS ile sabitlenir; üst sınır 30 dk', () => {
    const steps = (n, type = 'act') => ({ steps: Array.from({ length: n }, () => ({ type })) });
    assert.equal(computeRunTimeoutMs(steps(3), ''), 300_000, 'kısa test en az 5 dk');
    assert.equal(computeRunTimeoutMs(steps(7), ''), 300_000);
    assert.equal(computeRunTimeoutMs(steps(24), ''), 810_000, '24 adım: 90 sn + 24×30 sn');
    assert.equal(computeRunTimeoutMs(steps(60), ''), 1_800_000, 'üst sınır 30 dk');
    assert.equal(computeRunTimeoutMs(steps(100, 'recorded'), ''), 300_000, 'kayıtlı adımlar yapay zeka beklemez');
    assert.equal(computeRunTimeoutMs(steps(24), '120'), 120_000, 'ortam değişkeni sabit değer verir');
    assert.equal(computeRunTimeoutMs(steps(24), '999999'), 7_200_000, 'en çok 2 saat');
    assert.equal(computeRunTimeoutMs(null, ''), 300_000);
});

test('adım türü / eylem eşleşmesi: "yaz" adımına tıklama, "tıkla" adımına yazma önerisi reddedilir', () => {
    const p = (t) => parseInstruction(t);
    assert.match(methodMismatch(p('Type "x" into the input field labeled "adı"'), { method: 'click' }), /TYPING/);
    assert.match(methodMismatch(p('Type "x" into the input field labeled "adı"'), { method: 'scrollTo' }), /TYPING/);
    assert.equal(methodMismatch(p('Type "x" into the input field labeled "adı"'), { method: 'fill' }), null);
    assert.equal(methodMismatch(p('Type "x" into the input field labeled "adı"'), { method: 'type' }), null);
    assert.match(methodMismatch(p('Click on the button labeled "kaydet"'), { method: 'fill' }), /CLICKING/);
    assert.match(methodMismatch(p('Check the checkbox labeled "x"'), { method: 'type' }), /CLICKING/);
    assert.equal(methodMismatch(p('Click on the button labeled "kaydet"'), { method: 'click' }), null);
    assert.equal(methodMismatch(p('Scroll to the top of the page'), { method: 'scrollTo' }), null, 'kaydırma serbest');
    assert.equal(methodMismatch(p('Select "Bahar" from the dropdown'), { method: 'selectOptionFromDropdown' }), null);
    assert.equal(methodMismatch(p('Click on the input field labeled "ad"'), { method: 'fill' }), null, 'input alanına tıkla + fill: engellenmez');
});

test('çeviri kuralı: yer/kapsam ifadeleri korunur (metin, örnekler ve uyarı bulunur)', () => {
    assert.match(QUALIFIER_RULES, /LOCATION \/ SCOPE QUALIFIERS \(MUST PRESERVE\)/);
    assert.match(QUALIFIER_RULES, /NEVER drop it/);
    for (const phrase of ['sayfanın en üstündeki', 'tablodaki / satırdaki', 'sol paneldeki', 'isimli bölümdeki']) assert.ok(QUALIFIER_RULES.includes(phrase), phrase);
    assert.match(QUALIFIER_RULES, /located at the very top of the page \(in the page header, outside any table row\)/);
});
