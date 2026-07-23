// utils/ipGuard.js
import net from 'net';

// IPv4 adresini 32-bit tamsayıya çevirir
function ipv4ToInt(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipv4InCidr(ip, cidr) {
    const [range, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr, 10);
    const ipInt = ipv4ToInt(ip);
    const rangeInt = ipv4ToInt(range);
    if (ipInt === null || rangeInt === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
}

// Bloklanan IPv4 aralıkları (Loopback, Private, Link-Local, Cloud Metadata)
const BLOCKED_IPV4_CIDRS = [
    '0.0.0.0/8',        // Bu ağ
    '10.0.0.0/8',       // Private Class A
    '100.64.0.0/10',    // CGNAT (Bulut metadata erişimleri)
    '127.0.0.0/8',      // Loopback (localhost)
    '169.254.0.0/16',   // Link-local (AWS/GCP/Azure Metadata: 169.254.169.254)
    '172.16.0.0/12',    // Private Class B
    '192.0.0.0/24',     // IETF
    '192.168.0.0/16',   // Private Class C
    '198.18.0.0/15',    // Benchmark
    '224.0.0.0/4',      // Multicast
    '240.0.0.0/4',      // Reserved
    '255.255.255.255/32', // Broadcast
];

function isBlockedIpv4(ip) {
    return BLOCKED_IPV4_CIDRS.some(cidr => ipv4InCidr(ip, cidr));
}

function expandIpv6(ip) {
    const ipv4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (ipv4MappedMatch) return { mappedIpv4: ipv4MappedMatch[1] };

    let head = ip;
    let tail = '';
    if (ip.includes('::')) {
        [head, tail] = ip.split('::');
    } else {
        head = ip;
    }
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - (headParts.length + tailParts.length);
    const fullParts = [
        ...headParts,
        ...Array(Math.max(missing, 0)).fill('0'),
        ...tailParts,
    ].map(p => parseInt(p || '0', 16));

    return { parts: fullParts };
}

function isBlockedIpv6(ip) {
    const clean = ip.toLowerCase();
    if (clean === '::1' || clean === '::') return true;

    const expanded = expandIpv6(clean);
    if (expanded.mappedIpv4) return isBlockedIpv4(expanded.mappedIpv4);

    const parts = expanded.parts;
    if (!parts || parts.length !== 8) return false;

    if ((parts[0] & 0xfe00) === 0xfc00) return true; // Unique Local
    if ((parts[0] & 0xffc0) === 0xfe80) return true; // Link-Local

    return false;
}

// IP adresinin iç ağda olup olmadığını doğrulayan ana fonksiyon
export function isBlockedIp(ip) {
    const family = net.isIP(ip);
    if (family === 4) return isBlockedIpv4(ip);
    if (family === 6) return isBlockedIpv6(ip);
    return true; // Tanınamayan formatları güvenli tarafta kalarak engelle
}

// URL string'ini çözüp IP/Domain kontrolü yapan yardımcı fonksiyon
export function isSafeUrl(targetUrl) {
    try {
        const parsedUrl = new URL(targetUrl);
        const hostname = parsedUrl.hostname;

        // "localhost" kelimesi doğrudan engellenir
        if (hostname.toLowerCase() === 'localhost') {
            return { safe: false, reason: "Localhost adresi hedef gösterilemez!" };
        }

        // Eğer IP adresi girildiyse CIDR kontrolünden geçir
        if (net.isIP(hostname)) {
            if (isBlockedIp(hostname)) {
                return { safe: false, reason: "İç ağ IP adreslerine test çalıştırılamaz!" };
            }
        }

        return { safe: true };
    } catch (err) {
        return { safe: false, reason: "Geçersiz URL formatı!" };
    }
}