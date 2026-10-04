import net from 'net';
import dns from 'dns/promises';

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

// Yönetici tarafından bilinçli olarak izin verilen iç ağ host'ları
// (örn: ALLOWED_PRIVATE_HOSTS=test.intranet.local,staging.local)
function allowedPrivateHosts() {
    return (process.env.ALLOWED_PRIVATE_HOSTS || '')
        .split(',')
        .map(h => h.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Host adının (domain veya IP) güvenli bir dış adrese çözümlenip
 * çözümlenmediğini denetler.
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function resolveSafeHost(hostname, lookup = dns.lookup) {
    const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
    if (!host) return { safe: false, reason: 'Host adı boş!' };
    const hosts = (process.env.ALLOWED_TEST_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    if (hosts.length && !hosts.includes(host)) return { safe: false, reason: 'Host test izin listesinde yok.' };
    const privateAllowed = allowedPrivateHosts().includes(host);
    try {
        let timer;
        const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }]
            : await Promise.race([
                lookup(host, {all:true, verbatim:true}),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 3000); }),
            ]).finally(() => clearTimeout(timer));
        if (!Array.isArray(addresses) || !addresses.length || addresses.some(a => !net.isIP(a.address))) {
            return {safe:false,reason:'DNS çözümlemesi geçersiz.'};
        }
        if (!privateAllowed && addresses.some(a => isPrivateIp(a.address))) {
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

/**
 * URL'in güvenli olup olmadığını denetler (protokol + SSRF).
 * Hem kayıt anında hem de test çalıştırılmadan hemen önce çağrılır.
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function isSafeUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') {
        return { safe: false, reason: 'URL boş veya geçersiz formatta!' };
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(urlString);
    } catch {
        return { safe: false, reason: 'Geçersiz URL yapısı!' };
    }

    const protocol = parsedUrl.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
        return { safe: false, reason: `İzin verilmeyen protokol: ${protocol}` };
    }

    if (parsedUrl.username || parsedUrl.password) return {safe:false,reason:'URL içinde kullanıcı adı/şifre kullanılamaz.'};
    const port = Number(parsedUrl.port || (protocol === 'https:' ? 443 : 80));
    if (!isAllowedTestPort(port)) return {safe:false,reason:'Hedef port test izin listesinde yok.'};
    return checkHost(parsedUrl.hostname);
}
