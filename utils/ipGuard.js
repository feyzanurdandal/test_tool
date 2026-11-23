import net from 'net';
import dns from 'dns/promises';
import { findEntry, hostMatches, getEffectiveEntries } from './hostPolicy.js';

// ─── İÇ AĞ / ÖZEL ADRES LİSTESİ ───
// Test tarayıcısının ve sunucunun erişmemesi gereken tüm aralıklar.
const blockList = new net.BlockList();

[
    ['0.0.0.0', 8],        // "bu ağ"
    ['10.0.0.0', 8],       // özel
    ['100.64.0.0', 10],    // CGNAT
    ['127.0.0.0', 8],      // loopback
    ['169.254.0.0', 16],   // link-local / bulut metadata
    ['172.16.0.0', 12],    // özel
    ['192.0.0.0', 24],     // IETF protokol atamaları
    ['192.0.2.0', 24],     // dokümantasyon
    ['192.88.99.0', 24],   // 6to4 relay
    ['192.168.0.0', 16],   // özel
    ['198.18.0.0', 15],    // benchmark
    ['198.51.100.0', 24],  // dokümantasyon
    ['203.0.113.0', 24],   // dokümantasyon
    ['224.0.0.0', 4],      // multicast
    ['240.0.0.0', 4],      // rezerve + broadcast
].forEach(([addr, prefix]) => blockList.addSubnet(addr, prefix, 'ipv4'));

[
    ['::', 128],           // belirtilmemiş
    ['::1', 128],          // loopback
    ['100::', 64],         // discard
    ['64:ff9b:1::', 48],    // yerel NAT64
    ['2001::', 32],        // Teredo
    ['2002::', 16],        // 6to4
    ['2001:db8::', 32],    // dokümantasyon
    ['fc00::', 7],         // unique local (fc00::/7 = fc.. ve fd..)
    ['fe80::', 10],        // link-local
    ['fec0::', 10],        // site-local (eski)
    ['ff00::', 8],         // multicast
].forEach(([addr, prefix]) => blockList.addSubnet(addr, prefix, 'ipv6'));

// Yönetici "iç-ağ" izni verse bile ASLA açılmayan aralıklar: loopback, link-local
// (bulut metadata 169.254.169.254 dahil), belirtilmemiş, multicast ve rezerve.
const neverBlock = new net.BlockList();
[['0.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4]]
    .forEach(([addr, prefix]) => neverBlock.addSubnet(addr, prefix, 'ipv4'));
[['::', 128], ['::1', 128], ['fe80::', 10], ['ff00::', 8]]
    .forEach(([addr, prefix]) => neverBlock.addSubnet(addr, prefix, 'ipv6'));

// IPv6 adresini 8 adet 16-bit gruba açar (IPv4 gömülü yazımı da destekler)
function expandIpv6(ip) {
    let addr = ip.toLowerCase().split('%')[0];

    const lastColon = addr.lastIndexOf(':');
    const tail = addr.slice(lastColon + 1);
    if (tail.includes('.')) {
        if (!net.isIPv4(tail)) return null;
        const p = tail.split('.').map(Number);
        addr = `${addr.slice(0, lastColon + 1)}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
    }

    const halves = addr.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - head.length - rest.length;
    if (halves.length === 1 && head.length !== 8) return null;
    if (missing < 0) return null;

    const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest]
        .map(g => parseInt(g || '0', 16));
    return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

// IPv6 içine gömülü IPv4 adresini çıkarır (mapped, compatible, NAT64)
function embeddedIpv4(groups) {
    const toV4 = (hi, lo) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
    const firstFiveZero = groups.slice(0, 5).every(g => g === 0);

    if (firstFiveZero && groups[5] === 0xffff) return toV4(groups[6], groups[7]);          // ::ffff:a.b.c.d
    if (firstFiveZero && groups[5] === 0 && (groups[6] || groups[7] > 1)) return toV4(groups[6], groups[7]); // ::a.b.c.d
    if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every(g => g === 0)) {
        return toV4(groups[6], groups[7]);                                                 // 64:ff9b::/96
    }
    return null;
}

/**
 * IP adresinin iç ağ / özel / rezerve bir adres olup olmadığını denetler.
 * Geçersiz bir IP için de true döner (şüpheli olan engellenir).
 */
export function isPrivateIp(ip) {
    const clean = String(ip || '').replace(/^\[|\]$/g, '');

    if (net.isIPv4(clean)) return blockList.check(clean, 'ipv4');

    if (net.isIPv6(clean)) {
        const groups = expandIpv6(clean);
        if (!groups) return true;
        const v4 = embeddedIpv4(groups);
        if (v4) return blockList.check(v4, 'ipv4');
        return blockList.check(clean.split('%')[0], 'ipv6');
    }

    return true;
}

/** 'public' | 'private' (RFC1918/CGNAT/ULA vb., yetkiyle açılabilir) | 'never' (hiçbir koşulda açılmaz) */
export function classifyIp(ip) {
    const clean = String(ip || '').replace(/^\[|\]$/g, '');
    let v4 = null;
    if (net.isIPv4(clean)) v4 = clean;
    else if (net.isIPv6(clean)) {
        const groups = expandIpv6(clean);
        if (!groups) return 'never';
        v4 = embeddedIpv4(groups);
        if (!v4) {
            const v6 = clean.split('%')[0];
            if (neverBlock.check(v6, 'ipv6')) return 'never';
            return blockList.check(v6, 'ipv6') ? 'private' : 'public';
        }
    } else return 'never';
    if (neverBlock.check(v4, 'ipv4')) return 'never';
    return blockList.check(v4, 'ipv4') ? 'private' : 'public';
}

/**
 * Host adının (domain veya IP) güvenli bir adrese çözümlenip çözümlenmediğini denetler.
 * - Loopback, link-local/metadata, multicast ve rezerve adresler HER ZAMAN engellenir.
 * - Özel (RFC1918/CGNAT/ULA) adreslere yalnızca yöneticinin "iç-ağ" işaretlediği host'lar çözümlenebilir.
 * Not: Hangi host'ların test edilebileceği (izin listesi) isSafeUrl / isNavigationAllowed ile denetlenir;
 * burası yalnızca SSRF korumasıdır ve sayfanın alt kaynakları için de kullanılır.
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function resolveSafeHost(hostname, lookup = dns.lookup) {
    const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
    if (!host) return { safe: false, reason: 'Host adı boş!' };
    try {
        const entries = await getEffectiveEntries();
        const privateAllowed = entries.some(e => e.internal && hostMatches(e, host));
        let timer;
        const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }]
            : await Promise.race([
                lookup(host, {all:true, verbatim:true}),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 3000); }),
            ]).finally(() => clearTimeout(timer));
        if (!Array.isArray(addresses) || !addresses.length || addresses.some(a => !net.isIP(a.address))) {
            return {safe:false,reason:'DNS çözümlemesi geçersiz.'};
        }
        // Yalnızca geliştirme/test: izinli host'un loopback'e çözülmesine (yerel test sunucuları) izin veren
        // açık anahtar. Production'da ve docker-compose'da ASLA etkin olmaz (NODE_ENV=production iken yok sayılır).
        const loopbackOk = privateAllowed && process.env.ALLOW_LOOPBACK_IN_TESTS === '1' && process.env.NODE_ENV !== 'production';
        const classes = addresses.map(a => (loopbackOk && /^(127\.|::1$)/.test(a.address)) ? 'private' : classifyIp(a.address));
        if (classes.includes('never') || (!privateAllowed && classes.includes('private'))) {
            return {safe:false, reason:'Yerel/özel veya rezerve IP adresine erişim engellendi.'};
        }
        // Proxy yalnızca burada kontrol edilen IP'ye bağlanır; tekrar DNS çözmez.
        const selected = addresses.find(a => net.isIP(a.address) === 4) || addresses[0];
        return {safe:true, address:selected.address, family:net.isIP(selected.address)};
    } catch {
        return {safe:false, reason:'DNS çözümlemesi başarısız veya zaman aşımına uğradı.'};
    }
}

export async function checkHost(hostname) {
    const { safe, reason } = await resolveSafeHost(hostname);
    return reason ? {safe,reason} : {safe};
}

export function isAllowedTestPort(port) {
    return (process.env.ALLOWED_TEST_PORTS || '80,443').split(',').map(p => Number(p.trim())).includes(Number(port));
}

/** Port varsayılan listede ya da yöneticinin bu host için açıkça yazdığı port mu? */
export async function isPortPermitted(host, port) {
    if (isAllowedTestPort(port)) return true;
    const entries = await getEffectiveEntries();
    return entries.some(e => e.port !== undefined && hostMatches(e, host, port));
}

function parseHttpUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return { error: 'URL boş veya geçersiz formatta!' };
    let parsed;
    try { parsed = new URL(urlString); } catch { return { error: 'Geçersiz URL yapısı!' }; }
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return { error: `İzin verilmeyen protokol: ${protocol}` };
    if (parsed.username || parsed.password) return { error: 'URL içinde kullanıcı adı/şifre kullanılamaz.' };
    const port = Number(parsed.port || (protocol === 'https:' ? 443 : 80));
    return { parsed, port };
}

/**
 * Ağ düzeyinde güvenlik (protokol + port + SSRF). İzin listesi aranmaz;
 * WebSocket ve benzeri alt kaynak bağlantıları için kullanılır.
 */
export async function checkNetworkUrl(urlString) {
    const { parsed, port, error } = parseHttpUrl(urlString);
    if (error) return { safe: false, reason: error };
    if (!(await isPortPermitted(parsed.hostname, port))) return { safe: false, reason: 'Hedef port test izin listesinde yok.' };
    return checkHost(parsed.hostname);
}

/** Ana çerçeve (sayfa) gezintisi yönetici izin listesinde mi? */
export async function isNavigationAllowed(urlString) {
    const { parsed, port, error } = parseHttpUrl(urlString);
    if (error) return false;
    const entries = await getEffectiveEntries();
    return !!findEntry(entries, parsed.hostname, port);
}

/**
 * Test hedefi URL'inin güvenli ve YÖNETİCİ İZİN LİSTESİNDE olup olmadığını denetler
 * (protokol + izin listesi + port + SSRF). Kayıt anında ve her çalıştırmadan önce çağrılır.
 * İzin listesi boşsa hiçbir adres kabul edilmez.
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function isSafeUrl(urlString) {
    const { parsed, port, error } = parseHttpUrl(urlString);
    if (error) return { safe: false, reason: error };
    const entries = await getEffectiveEntries();
    if (!entries.length) {
        return { safe: false, reason: 'Test için izin verilen adres listesi boş. Yönetici Ayarlar > "Test İzinli Adresler" bölümüne adres eklemelidir.' };
    }
    if (!findEntry(entries, parsed.hostname, port)) {
        const defaultPort = isAllowedTestPort(port);
        return { safe: false, reason: defaultPort
            ? `"${parsed.hostname}" yönetici tarafından izin verilen test adresleri arasında değil.`
            : 'Hedef port test izin listesinde yok.' };
    }
    return checkNetworkUrl(urlString);
}
