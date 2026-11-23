import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, isSafeUrl, checkHost, classifyIp, resolveSafeHost, isNavigationAllowed, checkNetworkUrl } from '../utils/ipGuard.js';
import { setHostPolicyProvider, parseHostEntries } from '../utils/hostPolicy.js';

// Yönetici listesini ve ortam değişkenlerini testte kontrollü ayarlar.
async function withPolicy(text, fn, env = {}) {
    const saved = {};
    for (const key of ['ALLOWED_TEST_HOSTS', 'ALLOWED_PRIVATE_HOSTS', 'ALLOWED_TEST_PORTS']) { saved[key] = process.env[key]; delete process.env[key]; }
    Object.assign(process.env, env);
    setHostPolicyProvider(async () => parseHostEntries(text).entries);
    try { return await fn(); }
    finally {
        setHostPolicyProvider(null);
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
}

test('özel ve rezerve IPv4 aralıkları engellenir', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.3.4', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255']) {
        assert.equal(isPrivateIp(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '193.140.1.1']) {
        assert.equal(isPrivateIp(ip), false, ip);
    }
});

test('IPv6 ve IPv4 gömülü adresler engellenir', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1']) {
        assert.equal(isPrivateIp(ip), true, ip);
    }
    for (const ip of ['2606:4700:4700::1111', '::ffff:8.8.8.8']) {
        assert.equal(isPrivateIp(ip), false, ip);
    }
});

test('geçersiz IP şüpheli sayılır', () => {
    assert.equal(isPrivateIp('not-an-ip'), true);
});

test('IP sınıflandırması: loopback/metadata asla açılmaz, RFC1918 yetkiyle açılabilir', () => {
    for (const ip of ['127.0.0.1', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(classifyIp(ip), 'never', ip);
    for (const ip of ['10.1.2.3', '172.20.0.1', '192.168.5.5', '100.64.0.9', 'fd12:3456::1']) assert.equal(classifyIp(ip), 'private', ip);
    for (const ip of ['8.8.8.8', '193.140.1.1', '2606:4700:4700::1111']) assert.equal(classifyIp(ip), 'public', ip);
});

test('isSafeUrl protokol, host ve izin listesi denetimi yapar', async () => {
    await withPolicy('1.1.1.1', async () => {
        assert.equal((await isSafeUrl('file:///etc/passwd')).safe, false);
        assert.equal((await isSafeUrl('javascript:alert(1)')).safe, false);
        assert.equal((await isSafeUrl('http://127.0.0.1:3000')).safe, false);
        assert.equal((await isSafeUrl('http://2130706433/')).safe, false);   // 127.0.0.1'in ondalık yazımı
        assert.equal((await isSafeUrl('http://[::ffff:127.0.0.1]/')).safe, false);
        assert.equal((await isSafeUrl('http://localhost/')).safe, false);
        assert.equal((await isSafeUrl('https://1.1.1.1/')).safe, true);
        assert.equal((await isSafeUrl('')).safe, false);
    });
});

test('İzin listesi BOŞSA hiçbir adres kabul edilmez (fail-closed)', async () => {
    await withPolicy('', async () => {
        const r = await isSafeUrl('https://1.1.1.1/');
        assert.equal(r.safe, false);
        assert.match(r.reason, /listesi boş/i);
    });
});

test('Listede olmayan adres reddedilir, joker ve tam eşleşme çalışır', async () => {
    const lookup = async () => [{ address: '1.1.1.1', family: 4 }];
    await withPolicy('*.dpu.edu.tr\nornek.com', async () => {
        assert.equal((await isNavigationAllowed('https://app.dpu.edu.tr/giris')), true);
        assert.equal((await isNavigationAllowed('https://a.b.dpu.edu.tr/')), true);
        assert.equal((await isNavigationAllowed('https://dpu.edu.tr/')), false, 'joker apex alan adını kapsamaz');
        assert.equal((await isNavigationAllowed('https://evildpu.edu.tr/')), false);
        assert.equal((await isNavigationAllowed('https://dpu.edu.tr.evil.com/')), false);
        assert.equal((await isNavigationAllowed('https://ornek.com/')), true);
        assert.equal((await isNavigationAllowed('https://www.ornek.com/')), false);
        assert.equal((await isSafeUrl('https://baska.com/')).safe, false);
        assert.match((await isSafeUrl('https://baska.com/')).reason, /izin verilen/);
        // izinli alan adı bile iç ağa çözümleniyorsa engellenir
        assert.equal((await resolveSafeHost('app.dpu.edu.tr', async () => [{ address: '10.0.0.7', family: 4 }])).safe, false);
        assert.equal((await resolveSafeHost('app.dpu.edu.tr', lookup)).safe, true);
    });
});

test('iç-ağ işaretli host RFC1918 adrese çözülebilir; loopback ve metadata asla', async () => {
    await withPolicy('intranet.dpu.edu.tr iç-ağ\ndis.dpu.edu.tr', async () => {
        assert.equal((await resolveSafeHost('intranet.dpu.edu.tr', async () => [{ address: '10.5.5.5', family: 4 }])).safe, true);
        assert.equal((await resolveSafeHost('intranet.dpu.edu.tr', async () => [{ address: '127.0.0.1', family: 4 }])).safe, false);
        assert.equal((await resolveSafeHost('intranet.dpu.edu.tr', async () => [{ address: '169.254.169.254', family: 4 }])).safe, false);
        assert.equal((await resolveSafeHost('intranet.dpu.edu.tr', async () => [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }])).safe, false);
        assert.equal((await resolveSafeHost('dis.dpu.edu.tr', async () => [{ address: '10.5.5.5', family: 4 }])).safe, false, 'iç-ağ işareti olmayan host özel IP alamaz');
    });
});

test('ALLOWED_PRIVATE_HOSTS ortam değişkeni iç-ağ girişi sayılır ama loopback yine engellenir', async () => {
    await withPolicy('', async () => {
        assert.equal((await checkHost('localhost')).safe, false);
        assert.equal((await resolveSafeHost('staging.local', async () => [{ address: '192.168.1.20', family: 4 }])).safe, true);
    }, { ALLOWED_PRIVATE_HOSTS: 'staging.local' });
});

test('port: varsayılan 80/443; yönetici açıkça yazdığı port izinlidir', async () => {
    await withPolicy('1.1.1.1\n8.8.8.8:8443', async () => {
        assert.equal((await isSafeUrl('https://1.1.1.1/')).safe, true);
        assert.equal((await isSafeUrl('http://1.1.1.1:22/')).safe, false);
        assert.equal((await isSafeUrl('https://8.8.8.8:8443/')).safe, true);
        assert.equal((await isSafeUrl('https://8.8.8.8:9999/')).safe, false);
        assert.equal((await checkNetworkUrl('https://8.8.8.8:8443/')).safe, true);
    });
});

test('hostPolicy ayrıştırıcı geçersiz satırları raporlar', () => {
    const { entries, errors } = parseHostEntries('*.dpu.edu.tr\n# yorum\nhttps://test.dpu.edu.tr:8443/yol\n*.com\nkötü adres!\nbilgi.dpu.edu.tr iç-ağ\n10.0.0.1');
    assert.deepEqual(entries.map(e => `${e.wildcard ? '*.' : ''}${e.host}${e.port ? ':' + e.port : ''}${e.internal ? '!' : ''}`),
        ['*.dpu.edu.tr', 'test.dpu.edu.tr:8443', 'bilgi.dpu.edu.tr!', '10.0.0.1']);
    assert.equal(errors.length, 2);
    assert.equal(parseHostEntries('*.10.0.0.1').errors.length, 1);
});
