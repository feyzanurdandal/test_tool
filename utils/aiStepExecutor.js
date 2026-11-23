import fs from 'node:fs';
import path from 'node:path';

// ─── YAPAY ZEKA ADIMLARI İÇİN ÇERÇEVEDEN BAĞIMSIZ ÇALIŞTIRICI ───
// Hiçbir arayüz kütüphanesine (PrimeNG, MUI, Ant...) ait sınıf adı kullanmaz; yalnızca web standartlarına
// (ARIA rolleri, etiketler, görünürlük) dayanır. Bir "act" adımı şu sırayla çözülür:
//
//   0. ÖNBELLEK  : önceki başarılı koşuda bulunan seçici doğrulanırsa yapay zekaya hiç gidilmez.
//   1. YAPAY ZEKA: eleman seçtirilir; çevrilemezse/yanlış etkiyse GERİ BİLDİRİMLE yeniden sorulur (en çok 3).
//   2. SEMANTİK  : yapay zeka başarısız olursa (veya kota/ağ hatası varsa) rol+etiket+metin ile yapay zekasız çözülür.
//
// Her eylemden sonra sonuç DOĞRULANIR (alan doldu mu, kutu işaretlendi mi); sessiz başarısızlıklar yakalanır.

const MAX_ATTEMPTS = 3;
const CHECKABLE = 'input[type=checkbox],input[type=radio],[role=checkbox],[role=radio],[role=switch]';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ───────────────────────── Metin yardımcıları ─────────────────────────

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Türkçe i/ı/İ/I farkını yok sayan, büyük-küçük harf duyarsız regex. */
export function turkishRegex(text, { exact = false } = {}) {
    let pattern = '';
    for (const ch of String(text).normalize('NFKC').trim()) {
        if ('iıİI'.includes(ch)) pattern += '[iıİI]';
        else if (/\s/.test(ch)) pattern += '\\s+';
        else pattern += escapeRe(ch);
    }
    return new RegExp(exact ? `^\\s*${pattern}\\s*$` : pattern, 'i');
}

const KINDS = [
    ['checkbox', /check\s?box|tick\s?box/],
    ['radio', /\bradio\b/],
    ['dropdown', /drop-?down|combo\s?box|select\s(box|menu)|select\sfield/],
    ['option', /\boption\b|opened (list|panel|menu)|in the (open|opened|dropdown) /],
    ['button', /\bbutton\b/],
    ['link', /\blink\b/],
    ['tab', /\btab\b/],
    ['input', /\binput\b|\bfield\b|text\s?box|text\s?area/],
    ['menu', /\bmenu\b|\bsection\b|\bsidebar\b|\bnavigation\b|\bpanel\b/],
];

/**
 * Çevirmenin ürettiği (veya elle yazılan) İngilizce adım metnini yapısal bilgiye çevirir.
 * Tırnak içindeki ifadeler UI metni/değerdir. Anlaşılamazsa intent 'click', label null olabilir.
 */
export function parseInstruction(instruction) {
    const text = String(instruction || '');
    const quoted = [...text.matchAll(/["“”„]([^"“”„]+)["“”„]/g)].map(m => m[1].trim()).filter(Boolean);
    const lower = text.toLowerCase();
    const kind = (KINDS.find(([, re]) => re.test(lower)) || [])[0] || null;
    const pressEnter = /\bpress\s+enter\b/.test(lower);

    let intent = 'click';
    if (/\b(uncheck|untick|deselect)\b/.test(lower)) intent = 'uncheck';
    else if (/^\s*(check|tick|mark)\b/.test(lower)) intent = 'check';
    else if (/^\s*(type|enter|fill|write|input|set)\b/.test(lower)) intent = 'fill';
    else if (/^\s*(select|choose|pick)\b/.test(lower)) intent = 'select';
    // "Bul" adımı: yalnızca eleman var mı denetler, eylem UYGULAMAZ. Aynı cümlede bir eylem fiili varsa ("find X and click it") eskisi gibi eylem sayılır.
    else if (/^\s*(find|locate|look\s+for|search\s+for)\b/.test(lower) && !/\b(click|press|tap|type|enter|fill|write|select|choose|pick|check|tick|open|toggle|hover|then|and)\b/.test(lower.replace(/["“”„][^"“”„]*["“”„]/g, ''))) intent = 'find';

    const parsed = { intent, kind, pressEnter, quoted, label: null, value: null, scope: null };
    if (intent === 'fill') {
        if (quoted.length >= 2) { parsed.value = quoted[0]; parsed.label = quoted[1]; }
    } else if (quoted.length) {
        parsed.label = quoted[0];
        if (quoted.length > 1) parsed.scope = quoted[1];
    }
    return parsed;
}

// ───────────────────────── Sayfa/eleman durumu ─────────────────────────

/** Tarayıcıda çalışır: elemanın yapısal "parmak izi" ve (varsa) işaret/değer durumu. */
function snapshotInPage(el, checkableSelector) {
    const c = el.matches(checkableSelector) ? el
        : (el.querySelector(checkableSelector) || el.closest('[role=checkbox],[role=radio],[role=switch]')
            || (el.closest('label') && el.closest('label').querySelector(checkableSelector)) || null);
    const stateOf = (n) => (n.type === 'checkbox' || n.type === 'radio') ? n.checked : n.getAttribute('aria-checked') === 'true';
    const hasValue = 'value' in el && el.tagName !== 'LI' && el.tagName !== 'BUTTON';
    return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '',
        name: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '',
        text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80).toLowerCase(),
        // Elemanın GÖRÜNEN/erişilebilir adı (etiket uyuşma denetimi için): metin, aria-label, title, alt, düğme değeri
        labels: [(el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160), el.getAttribute('aria-label'), el.getAttribute('title'),
            el.getAttribute('alt'), (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) ? el.value : null]
            .filter(v => v && String(v).trim()),
        checkable: !!c,
        radio: !!c && (c.type === 'radio' || c.getAttribute('role') === 'radio'),
        checked: c ? stateOf(c) : null,
        value: hasValue ? String(el.value) : (el.isContentEditable ? (el.textContent || '') : null),
    };
}

// timeoutMs: eleman bulunamazsa en çok ne kadar beklenir. Eylemden SONRAKİ okumada kısa tutulur: tıklamayla
// kaybolan elemanlar (açılır liste seçeneği gibi) için 1,5 sn boşuna beklenmez. Bu yalnızca DOĞRULAMA okumasıdır;
// adımın tamamlanmasını beklemek (sayfanın oturması) ayrıca settle() ve Stagehand'in kendi beklemesiyle yapılır.
async function snapshot(locator, timeoutMs = 1500) {
    try { return await locator.first().evaluate(snapshotInPage, CHECKABLE, { timeout: timeoutMs }); }
    catch { return null; }
}
const AFTER_SNAPSHOT_MS = 400;

export function pageKey(page) {
    try { const u = new URL(page.url()); return u.origin + u.pathname.replace(/\/+$/, ''); } catch { return ''; }
}

async function settle(page, ms = 350) {
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    if (ms > 0) await page.waitForTimeout(ms).catch(() => {});
}

// Eylemden sonra ağ isteklerini (xhr/fetch/belge) izler: eylem istek başlattıysa (ör. "Giriş Yap" → oturum isteği) o istekler
// bitene kadar (en çok AI_POST_ACTION_WAIT_SECONDS, varsayılan 8 sn; 0 = kapalı) bekler. İstek başlamazsa en çok 0,5 sn bekler.
// Böylece yavaş sitelerde sonraki adım sayfa daha hazır değilken başlayıp "eleman yok" hatası vermez.
const POST_ACTION_MAX_MS = (() => { const n = Number(process.env.AI_POST_ACTION_WAIT_SECONDS ?? 8); return Number.isFinite(n) && n >= 0 ? Math.min(n, 60) * 1000 : 8000; })();
const NET_RESOURCE_TYPES = new Set(['xhr', 'fetch', 'document']);

export function needsNetWait(method, pressEnter = false) {
    return pressEnter || !['fill', 'type'].includes(String(method || '').toLowerCase());
}

export function watchNetwork(page, { maxMs = POST_ACTION_MAX_MS, startWaitMs = 500 } = {}) {
    let inflight = 0, started = 0;
    const relevant = r => { try { return NET_RESOURCE_TYPES.has(r.resourceType()); } catch { return false; } };
    const onRequest = r => { if (relevant(r)) { inflight++; started++; } };
    const onDone = r => { if (relevant(r)) inflight = Math.max(0, inflight - 1); };
    page.on('request', onRequest); page.on('requestfinished', onDone); page.on('requestfailed', onDone);
    const sleep = ms => page.waitForTimeout(ms).catch(() => {});
    return {
        async afterAction() {
            if (!maxMs) return;
            const t0 = performance.now();
            while (!started && performance.now() - t0 < startWaitMs) await sleep(50);
            if (!started) return;
            // istekler bitince kısa pay: yanıtın tetiklediği ek istekler/çizim için; yeni istek başladıysa yeniden bekler
            do {
                while (inflight > 0 && performance.now() - t0 < maxMs) await sleep(100);
                await sleep(300);
            } while (inflight > 0 && performance.now() - t0 < maxMs);
        },
        stop() { page.off('request', onRequest); page.off('requestfinished', onDone); page.off('requestfailed', onDone); },
    };
}

// ───────────────────────── Etiket uyuşma denetimi ─────────────────────────

/** Türkçe/aksan duyarsız karşılaştırma için sadeleştirir. */
export function foldText(s) {
    return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i').toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const tokensOf = (s) => foldText(s).split(' ').filter(t => t.length >= 3);

/**
 * Tıklama/seçme adımında modelin seçtiği elemanın görünen adı, adımdaki tırnak içi etiketle HİÇ örtüşmüyorsa
 * (ör. "devam et" için "Giriş Yap" düğmesi) uyuşmazlık döner. Yalnızca KESİN kanıt varsa engeller:
 * etiket anlamsız/kısa, eleman adsız (ikon düğmesi) veya eleman bir alan/açılır liste/onay kutusuysa
 * (bunların etiketi elemanın kendi metni değildir) denetim yapılmaz.
 */
export function labelMismatch(parsed, snap) {
    if (!parsed?.label || !snap) return null;
    if (!['click', 'select'].includes(parsed.intent)) return null;
    if (['dropdown', 'input', 'checkbox', 'radio'].includes(parsed.kind)) return null;
    if (snap.checkable || ['input', 'select', 'textarea'].includes(snap.tag) && !/^(button|submit|reset)$/i.test(snap.type)) return null;
    const wanted = tokensOf(parsed.label);
    if (!wanted.length || !snap.labels?.length) return null;
    const haystack = foldText(snap.labels.join(' '));
    if (!haystack) return null;
    const hay = haystack.split(' ').filter(Boolean);
    const overlaps = wanted.some(w => haystack.includes(w) || hay.some(h => h.length >= 3 && w.includes(h)));
    return overlaps ? null : { found: snap.labels[0].slice(0, 60), wanted: parsed.label };
}

/**
 * Adımın türü ile modelin önerdiği Stagehand eylemi çelişiyorsa neden metnini döner (yoksa null).
 * "Yaz" adımı için "tıkla" önerisi (veya tersi) sessizce uygulanırsa metin hiçbir yere yazılmaz ama adım başarılı görünür.
 * Kaydırma/seçme gibi diğer eylemler (scrollTo, selectOptionFromDropdown...) serbesttir.
 */
export function methodMismatch(parsed, action) {
    const method = String(action?.method || '');
    const typing = method === 'fill' || method === 'type';
    if (parsed?.intent === 'fill' && !typing) {
        return `this step requires TYPING text into an editable input: return method "fill" for the input element (with the text as the argument), not "${method}"`;
    }
    if (['click', 'check', 'uncheck'].includes(parsed?.intent) && typing && parsed?.kind !== 'input') {
        return `this step requires CLICKING, not typing: return method "click" for the element`;
    }
    return null;
}

// ───────────────────────── Ekrandaki uyarılar / teşhis ─────────────────────────

// Yalnızca GERÇEK uyarı rolleri. role=status / aria-live alanları (sayfalama bilgisi, ekran okuyucu metinleri) ve
// bilgi amaçlı açık diyaloglar gürültü üretir ve proje "hata anahtar kelimeleri" taramasını yanıltabilir.
const ALERT_SELECTOR = '[role=alert],[role=alertdialog]';

/** Ekranda görünen uyarı/durum mesajları (en çok 3). Hata ayıklama içindir, adımı etkilemez. */
export async function visibleAlerts(page) {
    try {
        const texts = await page.locator(ALERT_SELECTOR).filter({ visible: true }).allInnerTexts();
        return [...new Set(texts.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 3).map(t => t.slice(0, 140));
    } catch { return []; }
}

/**
 * Adım başarısız olduğunda loga yazılacak teşhis: adres (sorgusuz), başlık, ekrandaki uyarılar ve
 * geçersiz işaretlenmiş alanlar. Sayfa içeriğinin tamamını yazmaz.
 */
export async function collectPageDiagnostics(page) {
    const lines = [];
    try {
        const u = new URL(page.url());
        lines.push(`sayfa: ${u.origin}${u.pathname} | başlık: "${(await page.title().catch(() => '')).slice(0, 80)}"`);
    } catch { /* sayfa kapanmış olabilir */ }
    const alerts = await visibleAlerts(page);
    if (alerts.length) lines.push(`ekrandaki uyarı/durum metinleri: ${alerts.map(a => `"${a}"`).join(' | ')}`);
    try {
        const invalid = await page.locator('input:invalid, select:invalid, textarea:invalid, [aria-invalid=true]').filter({ visible: true })
            .evaluateAll(els => els.slice(0, 5).map(e => e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name') || e.id || e.tagName.toLowerCase()));
        if (invalid.length) lines.push(`geçersiz/zorunlu alanlar: ${invalid.join(', ')}`);
    } catch { /* yoksay */ }
    try {
        // Adımdaki eleman neden bulunamadı sorusuna hızlı cevap: sayfada GÖRÜNEN düğme/bağlantı adları (en çok 14)
        const names = await page.locator('button, [role=button], a[href], input[type=button], input[type=submit]').filter({ visible: true })
            .evaluateAll(els => els.slice(0, 60).map(e => (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean));
        const unique = [...new Set(names)].slice(0, 14);
        if (unique.length) lines.push(`görünen düğmeler/bağlantılar: ${unique.map(n => `"${n}"`).join(', ')}`);
    } catch { /* yoksay */ }
    return lines;
}

/** Eylem sonucunu değerlendirir. Kesin başarısızlık yoksa ok=true (kanıt yoksa engellemez). */
export function judge(parsed, method, args, before, after) {
    if (!before || !after) return { ok: true };
    if (method === 'fill' || method === 'type') {
        const expected = String(args?.[0] ?? '');
        if (expected && after.value === null) return { ok: false, reason: 'the chosen element is not an editable input, so nothing was typed into it; target the actual input element' };
        if (expected && after.value !== null && after.value === '') return { ok: false, reason: 'the field is still empty after typing; target the actual editable input element' };
        return { ok: true };
    }
    if (method === 'click' && before.checkable && after.checkable) {
        if (parsed.intent === 'check') return after.checked ? { ok: true } : { ok: false, reason: 'the checkbox is still unchecked; choose the visible control that toggles it' };
        if (parsed.intent === 'uncheck') return after.checked ? { ok: false, reason: 'the checkbox is still checked; choose the control that toggles it' } : { ok: true };
        if (before.radio) return after.checked ? { ok: true } : { ok: false, reason: 'the radio option was not selected' };
        return after.checked !== before.checked ? { ok: true } : { ok: false, reason: 'the checkbox state did not change; choose the control that actually toggles it' };
    }
    return { ok: true };
}

// ───────────────────────── Seçici önbelleği ─────────────────────────

/**
 * Başarılı adımların seçicilerini dosyada saklar ("yapay zeka bir kez, sonrası deterministik").
 * Yalnızca seçici + elemanın parmak izi saklanır; yazılan değerler asla saklanmaz.
 */
export class SelectorCache {
    constructor(file) { this.file = file; this.data = null; this.pending = new Map(); }
    load() {
        if (this.data) return this.data;
        try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = null; }
        if (!this.data || this.data.version !== 1 || typeof this.data.steps !== 'object') this.data = { version: 1, steps: {} };
        return this.data;
    }
    get(stepIndex, key) {
        const e = this.load().steps[String(stepIndex)];
        return e && e.pageKey === key ? e : null;
    }
    /**
     * Adım sonucunu SIRAYA alır; dosyaya yalnızca commit() ile yazılır. Test bütünüyle başarılı bitmedikçe
     * commit çağrılmaz; böylece başarısız bir koşunun (yanlış sayfada yapılmış) tıklamaları kalıcı olmaz.
     */
    set(stepIndex, entry) {
        this.pending.set(String(stepIndex), { ...entry, savedAt: new Date().toISOString() });
    }
    /** Testin tamamı başarıyla bitince çağrılır: bekleyen girişleri dosyaya yazar. */
    commit() {
        if (!this.pending.size) return;
        const data = this.load();
        for (const [index, entry] of this.pending) data.steps[index] = entry;
        this.pending.clear();
        this.save();
    }
    delete(stepIndex) {
        this.pending.delete(String(stepIndex));
        delete this.load().steps[String(stepIndex)];
        this.save();
    }
    save() {
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            const tmp = `${this.file}.${process.pid}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
            fs.renameSync(tmp, this.file);
        } catch { /* önbellek en iyi çabayla çalışır; yazılamazsa test etkilenmez */ }
    }
}

function fingerprintMatches(fp, snap) {
    if (!fp || !snap) return false;
    if (fp.tag !== snap.tag || fp.type !== snap.type) return false;
    if (fp.name && fp.name !== snap.name) return false;
    if (fp.text && fp.text !== snap.text) return false;
    return true;
}

async function tryCached(page, entry, parsed) {
    if (!['click', 'fill'].includes(entry.method)) return false;
    const loc = page.locator(entry.selector);
    if (await loc.count().catch(() => 0) !== 1) return false;
    const before = await snapshot(loc);
    if (!fingerprintMatches(entry.fp, before)) return false;
    const target = loc.first();
    const net = needsNetWait(entry.method, parsed.pressEnter) ? watchNetwork(page) : null;
    try {
        if (entry.method === 'fill') {
            if (parsed.value === null) return false;          // değer talimattan çıkarılamıyorsa güvenli değil
            await target.fill(parsed.value, { timeout: 5000 });
            if (parsed.pressEnter) await target.press('Enter');
        } else {
            await target.click({ timeout: 5000 });
        }
        await net?.afterAction();
    } finally { net?.stop(); }
    await settle(page);
    const after = await snapshot(loc, AFTER_SNAPSHOT_MS);
    const verdict = judge(parsed, entry.method, [parsed.value], before, after);
    if (!verdict.ok) throw Object.assign(new Error(verdict.reason), { cacheMiss: true });
    return true;
}

// ───────────────────────── Yapay zeka yolu ─────────────────────────

const OBSERVE_PROMPT = (instruction, feedback) => [
    `Current test step: ${instruction}`,
    'Identify the single next interaction needed for this step.',
    'Use the current page and the context stated in the instruction.',
    'Return one best action, not a sequence of actions.',
    'If the instruction only opens a dropdown, return only the action',
    'that opens it. Do not select an option.',
    'If the instruction selects an option, identify that option',
    'in the relevant currently opened list.',
    'Do not perform any interaction during observation.',
    ...(feedback ? ['', `IMPORTANT - correction for this retry: ${feedback}`,
        'Pick a visible, interactive element (button, link, input, checkbox, radio, option, tab). Avoid hidden or purely decorative nodes.',
        'Do NOT guess: if no element matching the step exists on the CURRENT page (for example the page has not reached the expected state),',
        'return an empty list instead of choosing an unrelated element.'] : []),
].join('\n');

const isSchemaError = (err) => {
    const text = `${err?.message || ''} ${(() => { try { return JSON.stringify(err); } catch { return ''; } })()}`;
    return text.includes('invalid_format') || text.includes('did not match schema') || text.includes('No object generated');
};

function usableActions(actions) {
    return (Array.isArray(actions) ? actions : []).filter(a =>
        a && a.selector && a.selector !== 'not-supported' && a.method && !['nextChunk', 'prevChunk', 'not-supported'].includes(a.method));
}

// ───────────────────────── Semantik (yapay zekasız) yol ─────────────────────────

async function uniqueVisible(locator) {
    try {
        const visible = locator.filter({ visible: true });
        return (await visible.count()) === 1 ? visible.first() : null;
    } catch { return null; }
}

function semanticCandidates(page, p) {
    if (!p.label) return [];
    const re = turkishRegex(p.label);
    const exact = turkishRegex(p.label, { exact: true });
    const list = [];
    const checkableKind = p.intent === 'check' || p.intent === 'uncheck' || p.kind === 'checkbox' || p.kind === 'radio';
    if (p.intent === 'fill') {
        list.push(['etiket', page.getByLabel(re)], ['placeholder', page.getByPlaceholder(re)],
            ['textbox', page.getByRole('textbox', { name: re })], ['searchbox', page.getByRole('searchbox', { name: re })],
            ['spinbutton', page.getByRole('spinbutton', { name: re })]);
    } else if (checkableKind) {
        const role = p.kind === 'radio' ? 'radio' : 'checkbox';
        list.push(['checkbox-rol', page.getByRole(role, { name: re })],
            ['checkbox-etiket', page.getByLabel(re).and(page.locator(CHECKABLE))]);
        const rowSel = 'tr,[role=row],li,[role=listitem],[role=treeitem],[role=option]';
        const rows = page.locator(rowSel).filter({ hasText: re }).filter({ hasNot: page.locator(rowSel).filter({ hasText: re }) });
        list.push(['satir-checkbox', rows.locator(CHECKABLE)], ['satir-checkbox-gizli', rows.locator(CHECKABLE), { allowHidden: true }]);
    } else if (p.intent === 'select' || p.kind === 'option') {
        list.push(['option-rol', page.getByRole('option', { name: exact })], ['menuitem', page.getByRole('menuitem', { name: exact })],
            ['listitem', page.locator('li,[role=listitem]').filter({ hasText: exact })], ['metin-tam', page.getByText(exact)],
            ['option-icerir', page.getByRole('option', { name: re })], ['metin', page.getByText(re)]);
    } else if (p.kind === 'dropdown') {
        list.push(['combobox', page.getByRole('combobox', { name: re })], ['etiket', page.getByLabel(re)],
            ['haspopup', page.locator('[aria-haspopup]').filter({ hasText: re })], ['button', page.getByRole('button', { name: re })],
            ['metin-tam', page.getByText(exact)]);
    } else {
        list.push(['button', page.getByRole('button', { name: re })], ['link', page.getByRole('link', { name: re })],
            ['tab', page.getByRole('tab', { name: re })], ['menuitem', page.getByRole('menuitem', { name: re })],
            ['metin-tam', page.getByText(exact)], ['metin', page.getByText(re)]);
    }
    return list;
}

/** Yapay zekasız çözüm: ilk "tam olarak 1 görünür eşleşme" veren strateji. Belirsizse tahmin etmez (null). */
export async function resolveSemantic(page, parsed) {
    for (const [how, locator, opts] of semanticCandidates(page, parsed)) {
        const found = await uniqueVisible(locator);
        if (found) return { locator: found, how };
        if (opts?.allowHidden && (await locator.count().catch(() => 0)) === 1) return { locator: locator.first(), how };
    }
    return null;
}

// Yazma adımında model yazı kutusu yerine bir KAP (div/bileşen sarmalayıcı) seçtiyse: kabın içinde YAZILABİLİR tek görünür kutu varsa onu döner.
// Gizli erişilebilirlik girdileri (PrimeNG p-hidden-accessible), salt-okunur/devre dışı/aria-hidden kutular ve düğme/onay türleri sayılmaz;
// böylece örn. bir açılır listenin gizli girdisine yanlışlıkla yazılmaz. Birden çok veya hiç aday yoksa null (adım yeniden sorulur).
const EDITABLE_INSIDE = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=image]):not([readonly]):not([disabled]):not([aria-hidden=true]):not(.p-hidden-accessible):not(.p-hidden-accessible *), textarea:not([readonly]):not([disabled]):not([aria-hidden=true]), [contenteditable=""], [contenteditable=true]';
export async function uniqueEditableInside(page, selector) {
    try {
        const base = page.locator(selector);
        if ((await base.count()) !== 1) return null;
        const inner = base.locator(EDITABLE_INSIDE).filter({ visible: true });
        return (await inner.count()) === 1 ? inner.first() : null;
    } catch { return null; }
}

async function setCheckedRobust(locator, want) {
    try { await locator.setChecked(want, { timeout: 2500 }); return; } catch { /* sonraki yöntem */ }
    try { await locator.setChecked(want, { timeout: 2500, force: true }); return; } catch { /* sonraki yöntem */ }
    const state = async () => (await snapshot(locator))?.checked;
    if ((await state()) !== want) await locator.locator('xpath=ancestor::*[1]').click({ timeout: 2500 });
    if ((await state()) !== want) throw new Error('checkbox state could not be changed');
}

async function performSemantic(page, parsed, resolved) {
    const { locator } = resolved;
    const before = await snapshot(locator);
    const net = needsNetWait(parsed.intent === 'fill' ? 'fill' : 'click', parsed.pressEnter) ? watchNetwork(page) : null;
    try {
        if (parsed.intent === 'fill') {
            if (parsed.value === null) throw new Error('no value to type');
            await locator.fill(parsed.value, { timeout: 4000 });
            if (parsed.pressEnter) await locator.press('Enter');
        } else if (parsed.intent === 'check' || parsed.intent === 'uncheck') {
            await setCheckedRobust(locator, parsed.intent === 'check');
        } else {
            await locator.click({ timeout: 4000 });
        }
        await net?.afterAction();
    } finally { net?.stop(); }
    await settle(page);
    const after = await snapshot(locator, AFTER_SNAPSHOT_MS);
    const method = parsed.intent === 'fill' ? 'fill' : 'click';
    const verdict = (parsed.intent === 'check' || parsed.intent === 'uncheck')
        ? { ok: after?.checked === (parsed.intent === 'check') || !after }
        : judge(parsed, method, [parsed.value], before, after);
    if (!verdict.ok) throw new Error(verdict.reason || 'verification failed');
}

/** Tıklama/seçme sonrası ekranda görünen YENİ uyarıyı loga yazar (ör. "hesap bilgileri yanlış"); adımı etkilemez. */
async function reportAlerts(page, logger, stepIndex, parsed, stats) {
    if (!['click', 'select'].includes(parsed.intent)) return;
    const seen = stats?.seenAlerts;
    const alerts = (await visibleAlerts(page)).filter(a => !seen || !seen.has(a));   // sürekli açık uyarı her adımda tekrarlanmaz
    for (const a of alerts) seen?.add(a);
    if (alerts.length) logger.log(`[BİLGİ] adım ${stepIndex + 1} sonrası ekranda görünen uyarı: ${alerts.map(a => `"${a}"`).join(' | ')}`);
}

const seconds = (ms) => (ms / 1000).toFixed(1);

/** Süre sınırlı yapay zeka çağrısı: sınır aşılırsa {slow:true} hatası; arkadaki çağrı sonuçsuz bırakılır. */
function observeLimited(stagehand, page, prompt, limitMs) {
    const call = stagehand.observe(prompt, { page, serverCache: false });
    if (!(limitMs > 0)) return call;
    call.catch(() => {});                                   // terk edilen çağrının hatası işlenmemiş kalmasın
    let timer;
    const gate = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(`yapay zeka çağrısı ${seconds(limitMs)} sn içinde yanıt vermedi`), { slow: true })), limitMs);
    });
    return Promise.race([call, gate]).finally(() => clearTimeout(timer));
}

export const DEFAULT_AI_CALL_LIMIT_MS = (Number(process.env.AI_CALL_TIMEOUT_SECONDS) > 0 ? Number(process.env.AI_CALL_TIMEOUT_SECONDS) : 25) * 1000;
const MAX_EXTRA_SLOW_RETRIES = 2;

// ───────────────────────── "Bul" adımları (eylemsiz) ─────────────────────────

const FIND_WAIT_MS = (() => { const n = Number(process.env.AI_FIND_WAIT_SECONDS ?? 5); return Number.isFinite(n) && n >= 0 ? Math.min(n, 60) * 1000 : 5000; })();

/** Etiketle eşleşen GÖRÜNEN eleman var mı? (yapay zekasız; hiçbir eylem uygulamaz) */
async function findVisibleByLabel(page, label) {
    const re = turkishRegex(label);
    const candidates = [page.getByRole('button', { name: re }), page.getByRole('link', { name: re }), page.getByLabel(re), page.getByPlaceholder(re),
        page.getByRole('textbox', { name: re }), page.getByRole('tab', { name: re }), page.getByRole('menuitem', { name: re }),
        page.getByRole('checkbox', { name: re }), page.getByRole('combobox', { name: re }), page.getByText(re)];
    for (const c of candidates) {
        try { if ((await c.filter({ visible: true }).count()) > 0) return true; } catch { /* sonraki aday */ }
    }
    return false;
}

/**
 * "Find/Locate ..." adımı: elemanın sayfada var olduğunu DOĞRULAR; tıklama/yazma gibi hiçbir eylem uygulamaz.
 * 1) etiket varsa yapay zekasız metin/etiket denetimi (yavaş sayfalar için kısa süre yoklanır),
 * 2) bulunamazsa yalnızca GÖZLEM yapan yapay zeka (en çok 2 deneme; seçtiği eleman sayfada görünür olmalı).
 */
async function executeFindStep({ stagehand, page, instruction, parsed, stepIndex, logger, aiLimitMs, stats }) {
    const stepStart = performance.now();
    const finish = (via, attempts, text) => {
        if (stats) { stats.steps = (stats.steps || 0) + 1; }
        logger.log(`[ÇÖZÜM] adım ${stepIndex + 1}: ${text} — toplam ${seconds(performance.now() - stepStart)} sn (eylem uygulanmadı)`);
        return { via, attempts };
    };

    if (parsed.label) {
        const t0 = performance.now();
        do {
            if (await findVisibleByLabel(page, parsed.label)) return finish('semantic', 0, `eleman sayfada bulundu (yapay zeka çağrılmadı)`);
            if (FIND_WAIT_MS <= 0) break;
            await page.waitForTimeout(250).catch(() => {});
        } while (performance.now() - t0 < FIND_WAIT_MS);
    }

    let feedback = '';
    let lastReason = parsed.label
        ? `Sayfada "${parsed.label}" ile eşleşen bir eleman bulunamadı (sayfa beklenen durumda olmayabilir).`
        : 'Aranan eleman sayfada bulunamadı.';
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const callStart = performance.now();
            let raw;
            try { raw = await observeLimited(stagehand, page, OBSERVE_PROMPT(instruction, feedback), aiLimitMs); }
            finally { const spent = performance.now() - callStart; if (stats) { stats.aiMs = (stats.aiMs || 0) + spent; stats.aiCalls = (stats.aiCalls || 0) + 1; } }
            const actions = usableActions(raw);
            const el = actions[0] && page.locator(actions[0].selector).filter({ visible: true });
            if (el && (await el.count().catch(() => 0)) > 0) {
                const snap = await snapshot(el, 1500);
                const mismatch = labelMismatch({ ...parsed, intent: 'click' }, snap);
                if (!mismatch) return finish('ai', attempt, `eleman sayfada bulundu (yapay zeka, ${attempt}. deneme)`);
                feedback = `the element you chose is labeled "${mismatch.found}", which does not match "${mismatch.wanted}". If no element labeled "${mismatch.wanted}" exists on the current page, return an empty list.`;
            } else {
                feedback = 'your previous answer did not contain an element that could be resolved on the page.';
            }
        } catch (err) {
            if (err?.slow) lastReason = `Yapay zeka çağrısı ${seconds(aiLimitMs)} sn içinde yanıt vermedi.`;
            feedback = '';
        }
    }
    throw new Error(`ACTION_FAILED: ${lastReason}`);
}

/**
 * @param stats  isteğe bağlı sayaç nesnesi: { aiMs, aiCalls, steps, cacheHits, seenAlerts:Set } (test sonunda özet için)
 * @returns {Promise<{ via: 'cache'|'ai'|'semantic', attempts: number }>}
 * Başarısız olursa `ACTION_FAILED: ...` hatası fırlatır; şema hataları (yapay zeka çıktısı geçersiz)
 * çağıranın mevcut yedek mantığı için olduğu gibi yukarı iletilir.
 */
export async function executeActStep({ stagehand, page, instruction, stepIndex = 0, cache = null, logger = console, maxAttempts = MAX_ATTEMPTS,
    aiLimitMs = DEFAULT_AI_CALL_LIMIT_MS, stats = null }) {
    const parsed = parseInstruction(instruction);
    if (parsed.intent === 'find') return await executeFindStep({ stagehand, page, instruction, parsed, stepIndex, logger, aiLimitMs, stats });
    const key = pageKey(page);
    const stepStart = performance.now();   // monoton sayaç: sistem saati sıçrasa da süreler doğru kalır
    let aiMs = 0;
    const done = async (via, attempts, text) => {
        const total = performance.now() - stepStart;
        if (stats) { stats.steps = (stats.steps || 0) + 1; if (via === 'cache') stats.cacheHits = (stats.cacheHits || 0) + 1; }
        logger.log(`[ÇÖZÜM] adım ${stepIndex + 1}: ${text} — toplam ${seconds(total)} sn, yapay zekayı bekleme ${seconds(aiMs)} sn`);
        await reportAlerts(page, logger, stepIndex, parsed, stats);
        return { via, attempts };
    };

    // 0) ÖNBELLEK
    const cached = cache?.get(stepIndex, key);
    if (cached) {
        try {
            if (await tryCached(page, cached, parsed)) return await done('cache', 0, 'önbellekteki seçici kullanıldı (yapay zeka çağrılmadı)');
        } catch { /* önbellek geçersiz: yapay zekaya düş */ }
        cache.delete(stepIndex);
    }

    // 1) YAPAY ZEKA + GERİ BİLDİRİMLİ YENİDEN DENEME
    let feedback = '';
    let lastReason = 'Yapay zeka bu adım için uygulanabilir bir işlem belirleyemedi.';
    let schemaError = null;
    let emptyAnswers = 0;
    let mismatches = 0;
    let methodMismatches = 0;
    let containerRejects = 0;
    let budget = maxAttempts;
    let slowRetries = 0;
    for (let attempt = 1; attempt <= budget; attempt++) {
        try {
            const callStart = performance.now();
            let raw;
            try { raw = await observeLimited(stagehand, page, OBSERVE_PROMPT(instruction, feedback), aiLimitMs); }
            finally { const spent = performance.now() - callStart; aiMs += spent; if (stats) { stats.aiMs = (stats.aiMs || 0) + spent; stats.aiCalls = (stats.aiCalls || 0) + 1; } }
            const actions = usableActions(raw);
            if (actions.length === 0) {
                emptyAnswers++;
                lastReason = parsed.label
                    ? `Sayfada "${parsed.label}" ile eşleşen bir eleman bulunamadı (sayfa beklenen durumda olmayabilir).`
                    : 'Yapay zekanın seçtiği eleman sayfada çözümlenemedi.';
                // İki kez üst üste "eleman yok" cevabı: model büyük olasılıkla doğru söylüyor; üçüncü çağrıyı harcamadan yedek yola geç.
                if (emptyAnswers >= 2) break;
                // Sayfa hâlâ yükleniyor olabilir: yeniden sormadan önce oturmasını bekle.
                await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
                await page.waitForTimeout(1200).catch(() => {});
                feedback = 'your previous answer did not contain an element that could be resolved on the page.';
                continue;
            }
            if (actions.length > 1 && attempt < budget) {
                feedback = 'you returned several actions; return exactly ONE best action.';
                lastReason = 'Yapay zeka birden fazla işlem döndürdü.';
                continue;
            }
            let action = actions[0];
            // Adım türü ile eylem çelişiyorsa (ör. "yaz" adımına "tıkla") UYGULANMAZ; model düzeltmeyle yeniden sorulur.
            const wrongMethod = methodMismatch(parsed, action);
            if (wrongMethod) {
                feedback = `the previous answer had the wrong action type: ${wrongMethod}.`;
                lastReason = `Önerilen eylem ("${action.method}") adımın türüyle uyuşmuyor; uygulanmadı.`;
                if (++methodMismatches >= 2) break;
                continue;
            }
            // Yazılacak değerin kaynağı talimattır; model uydurma/değiştirilmiş bir değer döndürse bile talimattaki değer yazılır.
            if (parsed.intent === 'fill' && parsed.value !== null && ['fill', 'type'].includes(action.method)) {
                action = { ...action, arguments: [parsed.value] };
            }
            const loc = page.locator(action.selector);
            const before = await snapshot(loc);
            const keyBefore = pageKey(page);
            // "Yaz" adımında hedef yazı kutusu DEĞİLSE (kap/div): "type" yöntemi odağın olduğu YERE yazar (örn. önceki alana) ve başarılı görünür.
            // Kapta tek bir yazılabilir kutu varsa doğrudan ona yazılır; yoksa eylem UYGULANMAZ, düzeltmeyle yeniden sorulur.
            if (parsed.intent === 'fill' && ['fill', 'type'].includes(action.method) && before && before.value === null) {
                const inner = parsed.value !== null ? await uniqueEditableInside(page, action.selector) : null;
                if (inner) {
                    const net = watchNetwork(page);
                    try {
                        await inner.fill(parsed.value, { timeout: 4000 });
                        if (parsed.pressEnter) await inner.press('Enter');
                        await net.afterAction();
                    } finally { net.stop(); }
                    await settle(page, 100);
                    const snapInner = await snapshot(inner, AFTER_SNAPSHOT_MS);
                    const verdictInner = judge(parsed, 'fill', [parsed.value], snapInner, snapInner);
                    if (verdictInner.ok) {
                        logger.log(`[BİLGİ] adım ${stepIndex + 1}: model yazı kutusu yerine bir kap seçti; kabın içindeki tek yazı kutusuna yazıldı`);
                        return await done('ai', attempt, `yapay zeka (${attempt}. deneme; kabın içindeki yazı kutusuna yazıldı)`);
                    }
                }
                feedback = 'the element you chose is a container, not an editable text input; choose the actual input element (the <input>/<textarea> itself), or return an empty list if none exists.';
                lastReason = 'Önerilen eleman bir yazı kutusu değil (kap); yazı yazılmadı.';
                if (++containerRejects >= 2) break;
                continue;
            }
            // "type" odaktaki elemana yazar; "fill" ise hedefe yazar ve uygun olmayan hedefte güvenle hata verir. Yazma adımında her zaman "fill".
            if (parsed.intent === 'fill' && action.method === 'type') action = { ...action, method: 'fill' };
            // Gerçek <select> olmayan hedefte (örn. PrimeNG listesinin <li> seçeneği) "selectOptionFromDropdown" sessizce işe yaramaz: sıradan tıklama yapılır.
            if (action.method === 'selectOptionFromDropdown' && ['click', 'select'].includes(parsed.intent) && before && !['select', 'option'].includes(before.tag)) {
                logger.log(`[BİLGİ] adım ${stepIndex + 1}: hedef gerçek bir <select> değil; "selectOptionFromDropdown" yerine tıklama uygulanıyor`);
                action = { ...action, method: 'click', arguments: [] };
            }
            // Etiket uyuşma denetimi: seçilen elemanın görünen adı adımdaki etiketle hiç örtüşmüyorsa TIKLAMADAN reddedilir.
            const mismatch = labelMismatch(parsed, before);
            if (mismatch) {
                feedback = `the element you chose is labeled "${mismatch.found}", which does not match "${mismatch.wanted}". If no element labeled "${mismatch.wanted}" exists on the current page, return an empty list.`;
                lastReason = `Önerilen elemanın adı ("${mismatch.found}") adımdaki etikete ("${mismatch.wanted}") uymuyor; yanlış yere tıklanmadı. Sayfa beklenen durumda olmayabilir.`;
                if (++mismatches >= 2) break;      // model ısrar ediyorsa daha fazla çağrı harcama
                continue;
            }
            // Tıklama gibi eylemler ağ isteği başlatabilir (giriş, kaydet…): istekler bitene kadar beklenir (yavaş sitelerde sonraki adım hazır olmayan sayfada başlamasın).
            const net = needsNetWait(action.method, parsed.pressEnter) ? watchNetwork(page) : null;
            let result;
            try {
                result = await stagehand.act(action, { page, serverCache: false });
                if (result && result.success !== false) await net?.afterAction();
            } finally { net?.stop(); }
            if (!result || result.success === false) {
                feedback = 'the previous action could not be performed; choose a different, visible element.';
                lastReason = 'Belirlenen işlem gerçekleştirilemedi.';
                continue;
            }
            await settle(page, 100);       // Stagehand act() DOM'un oturmasını zaten bekledi; burada yalnızca kısa pay
            const after = await snapshot(loc, AFTER_SNAPSHOT_MS);
            const verdict = judge(parsed, action.method, action.arguments, before, after);
            if (!verdict.ok) {
                feedback = `the previous action had no effect: ${verdict.reason}.`;
                lastReason = `İşlem uygulandı ama sonuç doğrulanamadı (${verdict.reason}).`;
                continue;
            }
            if (cache && ['click', 'fill'].includes(action.method) && before && String(action.selector).startsWith('xpath=')) {
                cache.set(stepIndex, { pageKey: keyBefore, method: action.method, selector: action.selector,
                    fp: { tag: before.tag, type: before.type, name: before.name, text: before.text } });
            }
            return await done('ai', attempt, `yapay zeka (${attempt}. deneme)`);
        } catch (err) {
            if (isSchemaError(err)) { schemaError = err; break; }    // çağıranın mevcut yedeği ele alır
            if (err?.slow) {
                // Sağlayıcı gecikti: aynı soruyu yeniden sor (deneme hakkından yemez; en çok 2 ek hak)
                lastReason = `Yapay zeka çağrısı ${seconds(aiLimitMs)} sn içinde yanıt vermedi.`;
                logger.log(`[BİLGİ] adım ${stepIndex + 1}: yapay zeka ${seconds(aiLimitMs)} sn içinde yanıt vermedi; yeniden deneniyor`);
                if (slowRetries++ < MAX_EXTRA_SLOW_RETRIES) budget++;
                feedback = '';
                continue;
            }
            lastReason = `Yapay zeka çağrısı başarısız: ${String(err?.message || err).slice(0, 160)}`;
            feedback = '';
            await sleep(800);
        }
    }
    if (schemaError) throw schemaError;

    // 2) SEMANTİK YEDEK (yapay zekasız)
    try {
        const resolved = await resolveSemantic(page, parsed);
        if (resolved) {
            await performSemantic(page, parsed, resolved);
            return await done('semantic', maxAttempts, `yapay zeka sonuç vermedi; anlamsal çözüm kullanıldı (${resolved.how})`);
        }
    } catch (err) {
        lastReason = `${lastReason} Anlamsal yedek de başarısız: ${String(err?.message || err).slice(0, 120)}`;
    }
    throw new Error(`ACTION_FAILED: ${lastReason}`);
}
