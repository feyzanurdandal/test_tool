import net from 'net';
import dns from 'dns/promises';

/**
 * IP adresinin tehlikeli / dahili ağlarda olup olmadığını denetler.
 */
function isPrivateIp(ip) {
    if (!net.isIP(ip)) return false;

    // IPv4 Kontrolleri
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);

        return (
            parts[0] === 127 || // Loopback (127.0.0.0/8)
            parts[0] === 10 ||  // Private Class A (10.0.0.0/8)
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // Private Class B (172.16.0.0/12)
            (parts[0] === 192 && parts[1] === 168) || // Private Class C (192.168.0.0/16)
            (parts[0] === 169 && parts[1] === 254) || // Link-Local / AWS Metadata (169.254.0.0/16)
            parts[0] === 0 // 0.0.0.0
        );
    }

    // IPv6 Kontrolleri
    if (net.isIPv6(ip)) {
        const lowerIp = ip.toLowerCase();
        return (
            lowerIp === '::1' || // Loopback
            lowerIp.startsWith('fe80:') || // Link-Local
            lowerIp.startsWith('fc00:') || // Unique Local Address (ULA)
            lowerIp.startsWith('fd00:')
        );
    }

    return false;
}

/**
 * Gelen URL'in güvenli olup olmadığını (SSRF / IP Guard / DNS Rebinding) denetler.
 * @param {string} urlString 
 * @returns {Promise<{ safe: boolean, reason?: string }>}
 */
export async function isSafeUrl(urlString) {
    try {
        if (!urlString || typeof urlString !== 'string') {
            return { safe: false, reason: "URL boş veya geçersiz formatta!" };
        }

        const parsedUrl = new URL(urlString);
        const protocol = parsedUrl.protocol.toLowerCase();

        // Sadece HTTP ve HTTPS protokollerine izin ver
        if (protocol !== 'http:' && protocol !== 'https:') {
            return { safe: false, reason: `İzin verilmeyen protokol: ${protocol}` };
        }

        const hostname = parsedUrl.hostname;

        // 1. Doğrudan IP Kontrolü
        if (net.isIP(hostname)) {
            if (isPrivateIp(hostname)) {
                return { safe: false, reason: "Yerel/Özel IP adreslerine erişim engellendi!" };
            }
            return { safe: true };
        }

        // 2. DNS Resolution Kontrolü (DNS Rebinding Koruması)
        try {
            const addresses = await dns.lookup(hostname, { all: true });

            for (const addr of addresses) {
                if (isPrivateIp(addr.address)) {
                    return { safe: false, reason: `Domain'in çözümlendiği IP (${addr.address}) iç ağa işaret ediyor!` };
                }
            }
        } catch (dnsErr) {
            return { safe: false, reason: `DNS çözümlemesi başarısız: Domain adresi bulunamadı! (${hostname})` };
        }

        return { safe: true };
    } catch (err) {
        return { safe: false, reason: "Geçersiz URL yapısı!" };
    }
}