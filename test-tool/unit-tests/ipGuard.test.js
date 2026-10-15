import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, isSafeUrl, checkHost } from '../utils/ipGuard.js';

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

test('isSafeUrl protokol ve host denetimi yapar', async () => {
    assert.equal((await isSafeUrl('file:///etc/passwd')).safe, false);
    assert.equal((await isSafeUrl('javascript:alert(1)')).safe, false);
    assert.equal((await isSafeUrl('http://127.0.0.1:3000')).safe, false);
    assert.equal((await isSafeUrl('http://2130706433/')).safe, false);   // 127.0.0.1'in ondalık yazımı
    assert.equal((await isSafeUrl('http://[::ffff:127.0.0.1]/')).safe, false);
    assert.equal((await isSafeUrl('http://localhost/')).safe, false);
    assert.equal((await isSafeUrl('https://1.1.1.1/')).safe, true);
    assert.equal((await isSafeUrl('')).safe, false);
});

test('ALLOWED_PRIVATE_HOSTS ile bilinçli istisna tanımlanabilir', async () => {
    process.env.ALLOWED_PRIVATE_HOSTS = 'localhost';
    try {
        assert.equal((await checkHost('localhost')).safe, true);
        assert.equal((await checkHost('127.0.0.1')).safe, false);
    } finally {
        delete process.env.ALLOWED_PRIVATE_HOSTS;
    }
});
