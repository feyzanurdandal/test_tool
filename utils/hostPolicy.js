import net from 'net';

// ─── İZİN VERİLEN TEST ADRESLERİ (yönetici listesi) ───
// Yönetici Ayarlar > "Test İzinli Adresler" bölümünden satır satır adres ekler.
// Satır biçimi:
//   ornek.dpu.edu.tr            → yalnızca bu host
//   *.dpu.edu.tr                → tüm alt alan adları (dpu.edu.tr'nin kendisi hariç)
//   test.dpu.edu.tr:8443        → belirli port (varsayılan portlar 80/443'tür)
//   intranet.dpu.edu.tr iç-ağ   → özel (RFC1918) IP'ye çözümlenmesine izin verilir
//   # ile başlayan satırlar yorumdur. Tam URL yapıştırılırsa yalnızca host (ve port) alınır.
// Loopback, link-local ve bulut metadata adresleri hiçbir koşulda açılmaz.

export const MAX_HOST_ENTRIES = 300;
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`);
const INTERNAL_WORDS = new Set(['internal', 'iç-ağ', 'ic-ag', 'iç', 'ic', 'özel', 'ozel']);

/** Tek bir satırı ayrıştırır. Boş/yorum satırı için null, hata için {error} döner. */
export function parseHostLine(rawLine) {
    const line = String(rawLine ?? '').replace(/#.*$/, '').trim();
    if (!line) return null;

    const tokens = line.split(/\s+/);
    let target = tokens[0].toLowerCase();
    let internal = false;
    for (const word of tokens.slice(1)) {
        if (INTERNAL_WORDS.has(word.toLowerCase())) internal = true;
        else return { error: `Tanınmayan ifade: "${word}"` };
    }

    let port;
    if (/^https?:\/\//.test(target)) {
        try {
            const u = new URL(target);
            if (u.username || u.password) return { error: 'Adres kimlik bilgisi içeremez.' };
            target = u.hostname;
            if (u.port) port = Number(u.port);
        } catch { return { error: 'Geçersiz URL.' }; }
    } else {
        const m = target.match(/^([^:/\s]+):(\d{1,5})$/);
        if (m) { target = m[1]; port = Number(m[2]); }
        else if (/[/:?#@]/.test(target)) return { error: 'Yalnızca alan adı veya IP yazın (örn. *.dpu.edu.tr).' };
    }

    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) return { error: 'Geçersiz port.' };

    const wildcard = target.startsWith('*.');
    const host = wildcard ? target.slice(2) : target;

    if (net.isIPv4(host)) {
        if (wildcard) return { error: 'IP adresiyle joker (*) kullanılamaz.' };
    } else {
        if (host.length > 253 || !HOST_RE.test(host)) return { error: 'Geçersiz alan adı.' };
        if (wildcard && host.split('.').length < 2) return { error: 'Joker için en az iki bölümlü alan adı gerekir (örn. *.dpu.edu.tr).' };
    }
    return { entry: { host, wildcard, internal, ...(port !== undefined ? { port } : {}) } };
}

/** Çok satırlı metni ayrıştırır. */
export function parseHostEntries(input) {
    const lines = Array.isArray(input) ? input : String(input ?? '').split(/\r?\n/);
    const entries = [];
    const errors = [];
    const seen = new Set();
    lines.forEach((line, index) => {
        const parsed = parseHostLine(line);
        if (!parsed) return;
        if (parsed.error) { errors.push({ line: index + 1, text: String(line).slice(0, 120), message: parsed.error }); return; }
        const key = `${parsed.entry.wildcard ? '*.' : ''}${parsed.entry.host}:${parsed.entry.port ?? ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push(parsed.entry);
    });
    if (entries.length > MAX_HOST_ENTRIES) errors.push({ line: 0, text: '', message: `En fazla ${MAX_HOST_ENTRIES} adres tanımlanabilir.` });
    return { entries, errors };
}

/** Kaydedilecek normalize metin. */
export function formatHostEntries(entries) {
    return entries.map(e => `${e.wildcard ? '*.' : ''}${e.host}${e.port ? ':' + e.port : ''}${e.internal ? ' iç-ağ' : ''}`).join('\n');
}

export function hostMatches(entry, host, port) {
    const h = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
    const hostOk = entry.wildcard ? h.endsWith('.' + entry.host) : h === entry.host;
    return hostOk && (entry.port === undefined || port === undefined || entry.port === Number(port));
}

export function findEntry(entries, host, port) {
    return entries.find(e => hostMatches(e, host, port)) || null;
}

// Ortam değişkenleri (eski kurulumlarla uyumluluk): ALLOWED_TEST_HOSTS normal,
// ALLOWED_PRIVATE_HOSTS iç-ağ girişi olarak listeye eklenir.
function envEntries() {
    const out = [];
    for (const [name, internal] of [['ALLOWED_TEST_HOSTS', false], ['ALLOWED_PRIVATE_HOSTS', true]]) {
        for (const item of String(process.env[name] || '').split(',')) {
            const parsed = parseHostLine(item);
            if (parsed?.entry) out.push({ ...parsed.entry, internal: parsed.entry.internal || internal });
        }
    }
    return out;
}

let provider = null;

/** Yönetici listesinin kaynağını kaydeder (ana süreçte DPU ayarları, test sürecinde dosya). */
export function setHostPolicyProvider(fn) { provider = typeof fn === 'function' ? fn : null; }

/** Etkin izin listesi: yönetici girişleri + ortam değişkeni girişleri. */
export async function getEffectiveEntries() {
    const configured = provider ? await provider() : [];
    const merged = [...(Array.isArray(configured) ? configured : []), ...envEntries()];
    const seen = new Set();
    return merged.filter(e => {
        const key = `${e.wildcard ? '*.' : ''}${e.host}:${e.port ?? ''}:${e.internal ? 1 : 0}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
