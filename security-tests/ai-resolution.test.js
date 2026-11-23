// Çerçeveden bağımsız adım çözümü: gerçek Chromium + farklı arayüz yapılarını taklit eden deneme sayfaları.
// Yapay zeka sahte bir Stagehand ile taklit edilir (kötü/boş cevaplar dahil); asıl denenen
// geri bildirimli yeniden deneme, sonuç doğrulama, anlamsal yedek ve seçici önbelleğidir.
// Çalıştırma: node --test security-tests/ai-resolution.test.js   (Chromium gerekir: AUDIT_CHROMIUM_PATH)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { executeActStep, resolveSemantic, parseInstruction, SelectorCache, collectPageDiagnostics } from '../utils/aiStepExecutor.js';

const quiet = { log() {} };
let server, base, browser, page;

// ── Deneme sayfaları: aynı "satırdaki kutuyu işaretle" işi farklı yapılarla ──
const PAGES = {
    // 1) Düz, standart HTML
    plain: `<h1>Düz</h1>
<label for=em>E-Posta</label><input id=em><label>Şifre <input id=pw type=password></label>
<button type=button id=go onclick="window.clicks=(window.clicks||0)+1;document.title='clicked'+window.clicks">Giriş Yap</button>
<table><tr><td><input type=checkbox id=c1></td><td>Fen Edebiyat Fakültesi</td></tr>
<tr><td><input type=checkbox id=c2></td><td>Mühendislik Fakültesi</td></tr></table>`,
    // 2) Özel onay kutusu: görsel olarak gizli gerçek input + görünen sahte kutu (tasarım kütüphanelerinin yaygın kalıbı)
    custom: `<style>.vh{position:absolute;width:1px;height:1px;clip:rect(0,0,0,0);overflow:hidden}
.bx{width:18px;height:18px;border:1px solid #000;display:inline-block}.cx{display:inline-block;position:relative;cursor:pointer}</style>
<table><tr><td><div class=cx id=w1><input type=checkbox class=vh id=h1><div class=bx></div></div></td><td>Fen Edebiyat Fakültesi</td></tr>
<tr><td><div class=cx id=w2><input type=checkbox class=vh id=h2><div class=bx></div></div></td><td>Mühendislik Fakültesi</td></tr></table>
<script>document.querySelectorAll('.cx').forEach(w=>w.addEventListener('click',e=>{if(e.target.tagName==='INPUT')return;const i=w.querySelector('input');i.checked=!i.checked;}))</script>`,
    // 3) ARIA: rol=checkbox taşıyan sıradan elemanlar
    aria: `<ul><li><span role=checkbox aria-checked=false tabindex=0 id=a1 style="display:inline-block;width:16px;height:16px;border:1px solid #000" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')==='true'?'false':'true')"></span> Fen Edebiyat Fakültesi</li>
<li><span role=checkbox aria-checked=false tabindex=0 id=a2 style="display:inline-block;width:16px;height:16px;border:1px solid #000" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')==='true'?'false':'true')"></span> Mühendislik Fakültesi</li></ul>`,
    // 4) Belirsiz: aynı metinli iki satır (tahmin edilmemeli)
    ambiguous: `<table><tr><td><input type=checkbox id=x1></td><td>Tekrarlayan Fakülte</td></tr><tr><td><input type=checkbox id=x2></td><td>Tekrarlayan Fakülte</td></tr></table>`,
    // 5) Özel açılır liste (combobox + listbox/option)
    dropdown: `<button role=combobox aria-label="Fakülte" aria-expanded=false id=dd onclick="document.getElementById('lb').hidden=false">Seçiniz</button>
<ul role=listbox id=lb hidden><li role=option onclick="pick('Matematik')">Matematik</li><li role=option onclick="pick('Fizik')">Fizik</li></ul>
<span id=out></span><script>function pick(v){document.getElementById('dd').textContent=v;document.getElementById('lb').hidden=true;document.getElementById('out').textContent=v}</script>`,
    // 5b) Tıklayınca ekranda uyarı çıkaran form (ör. "hesap bilgileri yanlış") + zorunlu alan
    alertpage: `<input id=req required aria-label="Zorunlu Alan"><button id=login onclick="var d=document.createElement('div');d.setAttribute('role','alert');d.textContent='Hesap bilgileri yanlış';document.body.appendChild(d)">Giriş Yap</button>`,
    // 5c) Gürültü: sayfalama/durum alanları (role=status, aria-live) gerçek uyarı DEĞİLDİR
    noisy: `<div role=status>Page 1 of 1</div><div aria-live=polite>1 to 1 of 1</div><button id=b onclick="document.title='b'">Tamam</button>
<button id=al onclick="var d=document.createElement('div');d.setAttribute('role','alert');d.textContent='Kayıt bulunamadı';document.body.appendChild(d)">Ara</button>`,
    // 5e) Aynı etiketli iki "Detay" butonu: üst başlıkta ve tablo satırında (hangisi seçildiği sonucu değiştirir)
    twobuttons: `<button id=top onclick="document.title='ust'">Detay</button><table><tr><td><button id=row onclick="document.title='satir'">Detay</button></td><td><input id=nm aria-label="Adı"></td></tr></table><button id=sv>Güncelle</button><a href="#x">Yardım</a>`,
    // 5f) Yavaş giriş: tıklama 1,5 sn süren bir istek başlatır, yanıt gelince panel görünür
    slowlogin: `<input id=em aria-label="E-Posta"><button id=login onclick="fetch('/slow').then(r=>r.text()).then(()=>{var n=document.createElement('nav');n.id='panel';n.textContent='Panel';document.body.appendChild(n)})">Giriş Yap</button>`,
    // 5g) Yazma hedefi KAP: şifre kutusu bir sarmalayıcı div içinde; e-posta kutusu ayrı (odak orada kalır)
    wrapped: `<div id=ew><input id=em aria-label="E-Posta"></div><div id=pww><input id=pw type=password aria-label="Şifre"></div>`,
    // 5h) Tuzak kap: içinde yalnızca gizli erişilebilirlik girdisi (PrimeNG açılır liste) var; gerçek şifre kutusu ayrı
    trapwrap: `<input id=em aria-label="E-Posta"><div id=dd><div class=p-hidden-accessible><input id=hid readonly aria-label="Fakülte"></div><span>Seçiniz</span></div><input id=pw type=password placeholder="Şifre">`,
    // 5d) Tıklayınca kendini kaldıran eleman (açılır liste seçeneği gibi)
    vanish: `<button id=v onclick="this.remove()">Kapat</button>`,
    // 6) Açık shadow DOM
    shadow: `<div id=host></div><script>const r=document.getElementById('host').attachShadow({mode:'open'});
r.innerHTML='<label>Kullanıcı Adı <input id=u></label><button id=b onclick="this.textContent=\\'tamam\\'">Kaydet</button>';</script>`,
};

before(async () => {
    server = http.createServer((req, res) => {
        const name = new URL(req.url, 'http://x').pathname.slice(1);
        if (name === 'slow') return setTimeout(() => { res.setHeader('Content-Type', 'text/plain'); res.end('ok'); }, 1500);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><meta charset=utf-8><title>${name}</title>${PAGES[name] ?? ''}`);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM_PATH || process.env.CHROME_PATH || chromium.executablePath(), headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'] });
    page = await browser.newPage();
});
after(async () => { await browser?.close(); await new Promise(r => server.close(r)); });
const open = (name) => page.goto(base + name);

// ── Yapay zekayı taklit eden sahte Stagehand ──
function fakeStagehand({ replies = [], actBehaviors = [] } = {}) {
    const prompts = [];
    return {
        prompts,
        async observe(prompt) {
            prompts.push(prompt);
            const next = replies.length ? replies.shift() : [];
            if (next instanceof Error) throw next;
            return typeof next === 'function' ? next() : next;
        },
        async act(action) {
            const behavior = actBehaviors.length ? actBehaviors.shift() : 'real';
            if (behavior === 'noop') return { success: true };          // "başarılı" der ama hiçbir şey yapmaz
            if (behavior === 'throw') throw new Error('element not interactable');
            const loc = page.locator(action.selector).first();
            if (action.method === 'click') await loc.click({ timeout: 3000 });
            else if (action.method === 'fill') await loc.fill(action.arguments?.[0] ?? '', { timeout: 3000 });
            return { success: true };
        },
    };
}
const act = (selector, method = 'click', args = []) => [{ selector, method, arguments: args, description: 'x' }];
const CHECK_STEP = 'Check the checkbox labeled "Fen edebiyat fakültesi" in the "Liste" section';
const isChecked = async (sel) => page.locator(sel).evaluate(el => el.type ? el.checked : el.getAttribute('aria-checked') === 'true');

test('geri bildirimli yeniden deneme: çevrilemeyen eleman ilk cevapta boş gelirse model düzeltmeyle tekrar sorulur', async () => {
    await open('plain');
    const sh = fakeStagehand({ replies: [[], act('xpath=//*[@id="c1"]')] });
    const r = await executeActStep({ stagehand: sh, page, instruction: CHECK_STEP, logger: quiet });
    assert.equal(r.via, 'ai'); assert.equal(r.attempts, 2);
    assert.match(sh.prompts[1], /IMPORTANT - correction/);
    assert.match(sh.prompts[1], /could be resolved/);
    assert.equal(await isChecked('#c1'), true);
    assert.equal(await isChecked('#c2'), false);
});

test('sonuç doğrulama: "başarılı" denen ama etkisiz eylem yakalanır ve yeniden denenir', async () => {
    await open('plain');
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="c1"]'), act('xpath=//*[@id="c1"]')], actBehaviors: ['noop', 'real'] });
    const r = await executeActStep({ stagehand: sh, page, instruction: CHECK_STEP, logger: quiet });
    assert.equal(r.attempts, 2);
    assert.match(sh.prompts[1], /no effect/);
    assert.equal(await isChecked('#c1'), true);
});

test('eylem hata fırlatırsa deneme başarısız sayılır ve sonrakinde düzelir', async () => {
    await open('plain');
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="c2"]'), act('xpath=//*[@id="c1"]')], actBehaviors: ['throw', 'real'] });
    const r = await executeActStep({ stagehand: sh, page, instruction: CHECK_STEP, logger: quiet });
    assert.equal(r.via, 'ai');
    assert.equal(await isChecked('#c1'), true); assert.equal(await isChecked('#c2'), false);
});

for (const [name, checkedSelector, otherSelector] of [['plain', '#c1', '#c2'], ['custom', '#h1', '#h2'], ['aria', '#a1', '#a2']]) {
    test(`anlamsal yedek (yapay zeka sürekli başarısız): "${name}" yapısında satırdaki onay kutusu işaretlenir`, async () => {
        await open(name);
        const sh = fakeStagehand({ replies: [[], [], []] });
        const r = await executeActStep({ stagehand: sh, page, instruction: CHECK_STEP, logger: quiet });
        assert.equal(r.via, 'semantic');
        assert.equal(sh.prompts.length, 2, 'iki kez "eleman yok" cevabından sonra üçüncü çağrı harcanmadan anlamsal yola geçilir');
        assert.equal(await isChecked(checkedSelector), true);
        assert.equal(await isChecked(otherSelector), false, 'diğer satır değişmemeli');
    });
}

test('yapay zeka kotası/ağ hatasında bile adım anlamsal yolla tamamlanır', async () => {
    await open('plain');
    const quota = Object.assign(new Error('429 Too Many Requests'), { status: 429 });
    const sh = fakeStagehand({ replies: [quota, quota, quota] });
    await executeActStep({ stagehand: sh, page, instruction: 'Type "ali@dpu.edu.tr" into the input field labeled "e-posta"', logger: quiet });
    assert.equal(await page.inputValue('#em'), 'ali@dpu.edu.tr');
    await executeActStep({ stagehand: fakeStagehand({ replies: [quota, quota, quota] }), page, instruction: 'Click on the button labeled "giriş yap"', logger: quiet });
    assert.equal(await page.title(), 'clicked1');
});

test('şema hatası (geçersiz yapay zeka çıktısı) olduğu gibi yukarı iletilir: mevcut yedek mantığı bozulmaz', async () => {
    await open('plain');
    const sh = fakeStagehand({ replies: [new Error('No object generated: response did not match schema.')] });
    await assert.rejects(executeActStep({ stagehand: sh, page, instruction: 'Click on the button labeled "giriş yap"', logger: quiet }), /No object generated/);
});

test('belirsiz eşleşmede tahmin edilmez: ACTION_FAILED', async () => {
    await open('ambiguous');
    const sh = fakeStagehand({ replies: [[], [], []] });
    await assert.rejects(executeActStep({ stagehand: sh, page, instruction: 'Check the checkbox labeled "Tekrarlayan Fakülte"', logger: quiet }), /ACTION_FAILED/);
    assert.equal(await isChecked('#x1'), false); assert.equal(await isChecked('#x2'), false);
});

test('anlamsal çözüm: özel açılır liste (combobox → option)', async () => {
    await open('dropdown');
    const sh = () => fakeStagehand({ replies: [[], [], []] });
    await executeActStep({ stagehand: sh(), page, instruction: 'Click on the dropdown labeled "Fakülte"', logger: quiet });
    await executeActStep({ stagehand: sh(), page, instruction: 'Click on "matematik" in the opened list', logger: quiet });
    assert.equal(await page.textContent('#out'), 'Matematik');
});

test('anlamsal çözüm: açık shadow DOM içindeki alan ve buton', async () => {
    await open('shadow');
    const sh = () => fakeStagehand({ replies: [[], [], []] });
    await executeActStep({ stagehand: sh(), page, instruction: 'Type "feyza" into the input field labeled "kullanıcı adı"', logger: quiet });
    assert.equal(await page.locator('#u').inputValue(), 'feyza');
    await executeActStep({ stagehand: sh(), page, instruction: 'Click on the button labeled "kaydet"', logger: quiet });
    assert.equal(await page.locator('#b').textContent(), 'tamam');
});

test('seçici önbelleği: ikinci koşu yapay zekaya gitmez, değişen sayfada geçersiz sayılıp yenilenir, değer saklanmaz', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-selcache-')), 'selectors', 'k.json');
    const cache = new SelectorCache(file);
    const step = 'Click on the button labeled "giriş yap"';
    // 1. koşu: yapay zeka bulur, seçici saklanır
    await open('plain');
    const first = await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="go"]')] }), page, instruction: step, stepIndex: 3, cache, logger: quiet });
    assert.equal(first.via, 'ai');
    assert.ok(!fs.existsSync(file), 'başarılı adım bile test bitmeden kalıcı yazılmaz (commit gerekir)');
    cache.commit();
    assert.ok(fs.existsSync(file));
    // 2. koşu (yeni sayfa, yeni önbellek nesnesi): yapay zeka ÇAĞRILMAMALI
    await open('plain');
    const boom = { async observe() { throw new Error('yapay zeka çağrılmamalıydı'); }, async act() { throw new Error('çağrılmamalı'); } };
    const second = await executeActStep({ stagehand: boom, page, instruction: step, stepIndex: 3, cache: new SelectorCache(file), logger: quiet });
    assert.equal(second.via, 'cache'); assert.equal(await page.title(), 'clicked1');
    // 3. koşu: sayfadaki butonun metni değişti ama etiket hâlâ uyuyor (parmak izi uyuşmaz) -> önbellek atlanır, yapay zeka yenisini bulur
    await open('plain');
    await page.evaluate(() => { document.getElementById('go').textContent = 'Giriş Yap (yeni)'; });
    const thirdCache = new SelectorCache(file);
    const third = await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="go"]')] }), page, instruction: step, stepIndex: 3, cache: thirdCache, logger: quiet });
    assert.equal(third.via, 'ai');
    thirdCache.commit();
    // başka adres/sayfa anahtarı önbelleği kullanmaz
    await open('custom');
    assert.equal(new SelectorCache(file).get(3, 'http://baska.example/yol'), null);
    // yazılan değer asla saklanmaz
    await open('plain');
    const fillCache = new SelectorCache(file);
    await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="em"]', 'fill', ['gizli-deger-123'])] }),
        page, instruction: 'Type "gizli-deger-123" into the input field labeled "e-posta"', stepIndex: 5, cache: fillCache, logger: quiet });
    fillCache.commit();
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /gizli-deger-123/);
    // fill önbellekten: değer talimattan alınır (artan test verisi desteklenir)
    await open('plain');
    const viaCache = await executeActStep({ stagehand: boom, page, instruction: 'Type "yeni-deger-9" into the input field labeled "e-posta"', stepIndex: 5, cache: new SelectorCache(file), logger: quiet });
    assert.equal(viaCache.via, 'cache'); assert.equal(await page.inputValue('#em'), 'yeni-deger-9');
});

test('resolveSemantic: yönetici metni Türkçe büyük/küçük harf farkından etkilenmez', async () => {
    await open('plain');
    const r = await resolveSemantic(page, parseInstruction('Click on the button labeled "GİRİŞ YAP"'));
    assert.ok(r, 'İ/i farkı yüzünden bulunamadı'); assert.equal(r.how, 'button');
});

test('başarısız koşu önbelleği kirletmez: commit çağrılmazsa hiçbir adım kalıcı olmaz', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-selcache2-')), 'k.json');
    await open('plain');
    const cache = new SelectorCache(file);
    await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="go"]')] }), page, instruction: 'Click on the button labeled "giriş yap"', stepIndex: 0, cache, logger: quiet });
    // test sonraki adımda başarısız oldu -> commit çağrılmaz
    assert.ok(!fs.existsSync(file));
    assert.equal(new SelectorCache(file).get(0, `${base.replace(/\/$/, '')}/plain`), null);
});

test('etiket uyuşma denetimi: "devam et" için "Giriş Yap" düğmesi önerilirse TIKLANMAZ', async () => {
    await open('plain');
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="go"]'), act('xpath=//*[@id="go"]'), act('xpath=//*[@id="go"]')] });
    await assert.rejects(executeActStep({ stagehand: sh, page, instruction: 'Click on the button labeled "devam et"', logger: quiet }),
        /uymuyor; yanlış yere tıklanmadı/);
    assert.equal(await page.title(), 'plain', 'düğmeye hiç tıklanmadı');
    assert.equal(sh.prompts.length, 2, 'ısrar eden modele üçüncü çağrı harcanmaz');
    assert.match(sh.prompts[1], /does not match "devam et"/);
});

test('etiket uyuşma denetimi: doğru etiketli eşleşmeler ve etiketi eleman metni olmayan türler engellenmez', async () => {
    await open('plain');
    const ok = await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="go"]')] }), page, instruction: 'Click on the button labeled "GİRİŞ"', logger: quiet });
    assert.equal(ok.via, 'ai'); assert.equal(await page.title(), 'clicked1');
    // açılır liste tetikleyicisi "Seçiniz" gösterir; adımdaki etiket ("Fakülte") elemanın metni değildir -> denetim uygulanmaz
    await open('dropdown');
    const dd = await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="dd"]')] }), page, instruction: 'Click on the dropdown labeled "Fakülte/MYO"', logger: quiet });
    assert.equal(dd.via, 'ai');
    // metin alanı: etiket elemanın metni değildir
    await open('plain');
    const fill = await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="em"]', 'fill', ['a@b.co'])] }), page, instruction: 'Type "a@b.co" into the input field labeled "e-posta"', logger: quiet });
    assert.equal(fill.via, 'ai');
});

test('iki kez üst üste "eleman yok" cevabında üçüncü yapay zeka çağrısı harcanmaz; geri bildirim "tahmin etme" der', async () => {
    await open('plain');
    const sh = fakeStagehand({ replies: [[], [], act('xpath=//*[@id="em"]', 'fill', ['x@y.zz'])] });
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Type "x@y.zz" into the input field labeled "e-posta"', logger: quiet });
    assert.equal(sh.prompts.length, 2);
    assert.equal(r.via, 'semantic');
    assert.match(sh.prompts[1], /Do NOT guess/);
    assert.match(sh.prompts[1], /return an empty list/);
});

test('tıklama sonrası ekranda görünen uyarı loga yazılır (adımı başarısız yapmaz)', async () => {
    await open('alertpage');
    const lines = [];
    const logger = { log: (m) => lines.push(m) };
    const r = await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="login"]')] }), page, instruction: 'Click on the button labeled "giriş yap"', logger });
    assert.equal(r.via, 'ai');
    assert.ok(lines.some(l => /\[BİLGİ\] adım 1 sonrası ekranda görünen uyarı: "Hesap bilgileri yanlış"/.test(l)), lines.join('\n'));
});

test('hata anı teşhisi: sayfa adresi (sorgusuz), ekrandaki uyarı ve geçersiz alanlar', async () => {
    await page.goto(base + 'alertpage?gizli=1');
    await page.click('#login');
    const text = (await collectPageDiagnostics(page)).join('\n');
    assert.match(text, /sayfa: http:\/\/127\.0\.0\.1:\d+\/alertpage \| başlık: "alertpage"/);
    assert.doesNotMatch(text, /gizli=1/, 'sorgu parametreleri loga yazılmaz');
    assert.match(text, /ekrandaki uyarı\/durum metinleri: "Hesap bilgileri yanlış"/);
    assert.match(text, /geçersiz\/zorunlu alanlar: Zorunlu Alan/);
});

test('yapay zeka çağrısı sınırı: yanıt gecikirse aynı soru yeniden sorulur, deneme hakkından yemez', async () => {
    await open('plain');
    const lines = [];
    const logger = { log: (m) => lines.push(m) };
    let calls = 0;
    const sh = fakeStagehand({});
    // 1. çağrı hiç dönmez, 2. çağrı doğru cevap verir
    sh.observe = async (prompt) => {
        sh.prompts.push(prompt);
        calls++;
        if (calls === 1) return new Promise(() => {});
        return act('xpath=//*[@id="go"]');
    };
    const started = Date.now();
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Click on the button labeled "giriş yap"', logger, aiLimitMs: 400 });
    assert.equal(r.via, 'ai'); assert.equal(calls, 2);
    assert.ok(Date.now() - started < 4000);
    assert.ok(lines.some(l => /yeniden deneniyor/.test(l)), lines.join('\n'));
    assert.ok(!lines.some(l => /timeout/i.test(l)), 'günlükte "timeout" kelimesi geçmemeli (başarı değerlendirmesini bozar)');
});

test('yapay zeka sürekli yanıt vermezse sonunda anlamsal yedeğe düşülür (en çok 2 ek hak)', async () => {
    await open('plain');
    let calls = 0;
    const sh = { prompts: [], async observe() { calls++; return new Promise(() => {}); }, async act() { throw new Error('çağrılmamalı'); } };
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Click on the button labeled "giriş yap"', logger: quiet, aiLimitMs: 200 });
    assert.equal(r.via, 'semantic');
    assert.equal(calls, 5, '3 deneme + 2 ek hak');
    assert.equal(await page.title(), 'clicked1');
});

test('adım süresi günlüğü ve sayaçlar: toplam süre ile yapay zekayı bekleme süresi yazılır', async () => {
    await open('plain');
    const lines = [];
    const stats = { aiMs: 0, aiCalls: 0, steps: 0, cacheHits: 0, seenAlerts: new Set() };
    const slowAi = fakeStagehand({ replies: [() => new Promise(r => setTimeout(() => r(act('xpath=//*[@id="go"]')), 300))] });
    await executeActStep({ stagehand: slowAi, page, instruction: 'Click on the button labeled "giriş yap"', logger: { log: (m) => lines.push(m) }, stats });
    assert.match(lines.find(l => l.includes('[ÇÖZÜM]')), /yapay zeka \(1\. deneme\) — toplam \d+\.\d sn, yapay zekayı bekleme 0\.[3-9] sn/);
    assert.equal(stats.aiCalls, 1); assert.equal(stats.steps, 1); assert.ok(stats.aiMs >= 290);
});

test('uyarı günlüğü: role=status / aria-live gürültüsü yazılmaz, gerçek uyarı yazılır ve tekrarlanmaz', async () => {
    await open('noisy');
    const lines = [];
    const logger = { log: (m) => lines.push(m) };
    const stats = { seenAlerts: new Set() };
    await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="b"]')] }), page, instruction: 'Click on the button labeled "tamam"', logger, stats });
    assert.ok(!lines.some(l => l.includes('[BİLGİ]')), `gürültü yazılmamalı: ${lines.join(' / ')}`);
    await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="al"]')] }), page, instruction: 'Click on the button labeled "ara"', stepIndex: 1, logger, stats });
    assert.equal(lines.filter(l => l.includes('"Kayıt bulunamadı"')).length, 1);
    // aynı uyarı sonraki adımda yeniden yazılmaz
    await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="b"]')] }), page, instruction: 'Click on the button labeled "tamam"', stepIndex: 2, logger, stats });
    assert.equal(lines.filter(l => l.includes('"Kayıt bulunamadı"')).length, 1, 'tekrarlanmamalı');
    assert.ok(!lines.some(l => /Page 1 of 1|1 to 1 of 1/.test(l)));
});

test('ek yük: tıklamayla kaybolan elemanda doğrulama okuması 1,5 sn beklemez', async () => {
    await open('vanish');
    const started = Date.now();
    const r = await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="v"]')] }), page, instruction: 'Click on the button labeled "kapat"', logger: quiet });
    const took = Date.now() - started;
    assert.equal(r.via, 'ai');
    assert.equal(await page.locator('#v').count(), 0, 'tıklama gerçekten yapıldı');
    assert.ok(took < 1300, `adım ${took} ms sürdü; kaybolan eleman için kısa okuma sınırı uygulanmalı`);
});

test('adım türü uyuşmazlığı: "yaz" adımı için tıklama önerisi UYGULANMAZ, düzeltmeyle yeniden sorulur ve doğru alan doldurulur', async () => {
    await open('twobuttons');
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="sv"]', 'click'), act('xpath=//*[@id="nm"]', 'fill', ['x'])] });
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Type "feyza düzenlendi" into the input field labeled "adı"', logger: quiet });
    assert.equal(r.via, 'ai'); assert.equal(r.attempts, 2);
    assert.match(sh.prompts[1], /TYPING text/);
    assert.equal(await page.title(), 'twobuttons', 'Güncelle butonuna tıklanmadı');
    assert.equal(await page.inputValue('#nm'), 'feyza düzenlendi', 'yazılacak değer talimattan alındı (modelin "x" argümanı değil)');
});

test('yazılacak değer talimattan gelir: model uydurma/değiştirilmiş değer döndürse bile talimattaki değer yazılır', async () => {
    await open('plain');
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="pw"]', 'fill', ['your_password_here'])] });
    await executeActStep({ stagehand: sh, page, instruction: 'Type "Gizli-77" into the input field labeled "şifre"', logger: quiet });
    assert.equal(await page.inputValue('#pw'), 'Gizli-77');
});

test('iki kez üst üste yanlış eylem türü: yapay zekayı bırakıp anlamsal yedekle doğru alan doldurulur', async () => {
    await open('twobuttons');
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="sv"]', 'click'), act('xpath=//*[@id="sv"]', 'click'), act('xpath=//*[@id="sv"]', 'click')] });
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Type "ali" into the input field labeled "adı"', logger: quiet });
    assert.equal(r.via, 'semantic');
    assert.equal(sh.prompts.length, 2, 'üçüncü çağrı harcanmadı');
    assert.equal(await page.inputValue('#nm'), 'ali');
    assert.equal(await page.title(), 'twobuttons');
});

test('hata anı teşhisi: sayfada GÖRÜNEN düğme ve bağlantı adları da yazılır', async () => {
    await open('twobuttons');
    const text = (await collectPageDiagnostics(page)).join('\n');
    assert.match(text, /görünen düğmeler\/bağlantılar: "Detay", "Güncelle", "Yardım"/, text);
});

test('aynı etiketli iki düğme: yalnızca konum ifadesi taşıyan talimat için semantik yedek belirsiz kalırsa TAHMİN ETMEZ', async () => {
    await open('twobuttons');
    const sh = fakeStagehand({ replies: [[], []] });
    await assert.rejects(executeActStep({ stagehand: sh, page, instruction: 'Click on the button labeled "detay"', logger: quiet }), /ACTION_FAILED/);
    assert.equal(await page.title(), 'twobuttons', 'iki Detay butonundan hiçbirine tıklanmadı');
});

test('eylem ağ isteği başlatırsa (yavaş giriş) istek bitene kadar beklenir; yazma adımı ise boşuna beklemez', async () => {
    await open('slowlogin');
    const fillStart = Date.now();
    await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="em"]', 'fill', ['a@b.c'])] }), page, instruction: 'Type "a@b.c" into the input field labeled "e-posta"', logger: quiet });
    assert.ok(Date.now() - fillStart < 1200, 'yazma adımı ağ beklemesi yapmamalı');
    await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="login"]')] }), page, instruction: 'Click on the button labeled "giriş yap"', logger: quiet });
    assert.equal(await page.locator('#panel').count(), 1, 'tıklamadan sonraki adım panelin geldiği sayfada başlamalı');
});

test('istek başlatmayan tıklama en çok ~yarım saniye ek bekletir', async () => {
    await open('plain');
    const t0 = Date.now();
    await executeActStep({ stagehand: fakeStagehand({ replies: [act('xpath=//*[@id="go"]')] }), page, instruction: 'Click on the button labeled "giriş yap"', logger: quiet });
    assert.ok(Date.now() - t0 < 2500, `çok bekledi: ${Date.now() - t0} ms`);
});

// ── "Bul" adımları: eleman var mı denetler, HİÇBİR eylem uygulamaz ──
function noActStagehand(replies = []) {
    const sh = fakeStagehand({ replies });
    sh.acts = 0;
    const realAct = sh.act; sh.act = async (...a) => { sh.acts++; return realAct(...a); };
    return sh;
}

test('bul adımı: eleman varsa yapay zekasız bulunur ve TIKLANMAZ (giriş düğmesi tetiklenmez)', async () => {
    await open('plain');
    const sh = noActStagehand();
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Find the button labeled "giriş yap"', logger: quiet });
    assert.equal(r.via, 'semantic');
    assert.equal(sh.prompts.length, 0, 'yapay zeka çağrılmadı');
    assert.equal(sh.acts, 0);
    assert.equal(await page.evaluate(() => window.clicks || 0), 0, 'düğmeye tıklanmadı');
});

test('bul adımı: etiket (label) bulunur ve odaklanma/tıklama yapılmaz', async () => {
    await open('plain');
    const sh = noActStagehand();
    await executeActStep({ stagehand: sh, page, instruction: 'Find the label "e-posta"', logger: quiet });
    assert.equal(sh.acts, 0);
});

test('bul adımı: eleman yoksa ACTION_FAILED (yapay zeka boş döner, eylem yok)', async () => {
    await open('plain');
    const sh = noActStagehand([[], []]);
    await assert.rejects(executeActStep({ stagehand: sh, page, instruction: 'Find the button labeled "olmayan düğme"', logger: quiet }), /ACTION_FAILED.*olmayan düğme/);
    assert.equal(sh.acts, 0);
});

test('bul adımı: metin eşleşmezse yalnızca gözlem yapan yapay zeka eleman gösterirse geçer, yine eylem yok', async () => {
    await open('plain');
    const sh = noActStagehand([act('xpath=//*[@id="go"]')]);
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Find the main action control', logger: quiet });   // tırnaklı etiket yok → yapay zeka yolu
    assert.equal(r.via, 'ai');
    assert.equal(sh.acts, 0);
    assert.equal(await page.evaluate(() => window.clicks || 0), 0);
});

test('"bul ve tıkla" gibi eylem içeren cümle eskisi gibi tıklar (bozulmadı)', async () => {
    await open('plain');
    const sh = noActStagehand([act('xpath=//*[@id="go"]')]);
    await executeActStep({ stagehand: sh, page, instruction: 'Find the button labeled "giriş yap" and click it', logger: quiet });
    assert.equal(sh.acts, 1);
    assert.equal(await page.evaluate(() => window.clicks || 0), 1);
});

test('bul adımı: geç görünen eleman (yavaş sayfa) kısa süre beklenerek bulunur', async () => {
    await open('plain');
    await page.evaluate(() => setTimeout(() => { const b = document.createElement('button'); b.textContent = 'Geç Gelen'; document.body.appendChild(b); }, 1200));
    const sh = noActStagehand();
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Find the button labeled "geç gelen"', logger: quiet });
    assert.equal(r.via, 'semantic');
    assert.equal(sh.prompts.length, 0);
});

// ── Yazma adımı: kap seçilirse yanlış yere yazılmaz; "type" odağa körlemesine yazmaz ──
test('yazma hedefi kap ve "type": kabın içindeki tek yazı kutusuna yazılır, odaktaki e-posta kutusu BOZULMAZ', async () => {
    await open('wrapped');
    await page.locator('#em').fill('a@b.c');                                    // odak e-postada kalır
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="pww"]', 'type', ['gizli123'])] });
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Type "gizli123" into the input field labeled "şifre"', logger: quiet });
    assert.equal(r.via, 'ai');
    assert.equal(await page.locator('#pw').inputValue(), 'gizli123');
    assert.equal(await page.locator('#em').inputValue(), 'a@b.c', 'e-posta kutusuna şifre eklenmemeli');
});

test('kap yalnızca gizli erişilebilirlik girdisi içeriyorsa ona YAZILMAZ; reddedilip yedek yolla gerçek şifre kutusu doldurulur', async () => {
    await open('trapwrap');
    await page.locator('#em').fill('a@b.c');
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="dd"]', 'type', ['gizli123']), act('xpath=//*[@id="dd"]', 'fill', ['gizli123']), act('xpath=//*[@id="dd"]', 'type', ['gizli123'])] });
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Type "gizli123" into the input field labeled "şifre"', logger: quiet });
    assert.equal(r.via, 'semantic');
    assert.equal(await page.locator('#pw').inputValue(), 'gizli123');
    assert.equal(await page.locator('#hid').inputValue(), '', 'gizli girdiye yazılmadı');
    assert.equal(await page.locator('#em').inputValue(), 'a@b.c');
    assert.match(sh.prompts[1], /container, not an editable text input/);
});

test('"type" önerisi gerçek yazı kutusunda "fill" olarak uygulanır', async () => {
    await open('plain');
    const sh = fakeStagehand({ replies: [act('xpath=//*[@id="em"]', 'type', ['x@y.z'])] });
    await executeActStep({ stagehand: sh, page, instruction: 'Type "x@y.z" into the input field labeled "e-posta"', logger: quiet });
    assert.equal(await page.locator('#em').inputValue(), 'x@y.z');
});

test('selectOptionFromDropdown önerisi gerçek <select> olmayan hedefte (li seçeneği) tıklamaya çevrilir', async () => {
    await open('dropdown');
    await page.locator('#dd').click();
    const sh = fakeStagehand({ replies: [act('xpath=//li[normalize-space()="Matematik"]', 'selectOptionFromDropdown', ['Matematik'])] });
    const r = await executeActStep({ stagehand: sh, page, instruction: 'Click on "Matematik" inside the opened dropdown list', logger: quiet });
    assert.equal(r.via, 'ai');
    assert.equal(await page.locator('#out').innerText(), 'Matematik');
});
