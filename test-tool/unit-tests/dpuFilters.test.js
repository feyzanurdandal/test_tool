import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { applyFilters } = await import('../config/dpuService.js');

test('servis filtreyi yok sayarsa yanlış kayıt dönmez', () => {
    const rows = [
        { id: 1, senaryo_adi: 'kayit', project_id: 7 },
        { id: 2, senaryo_adi: 'login', project_id: 7 },
        { id: 3, senaryo_adi: 'login', project_id: 8 },
    ];
    const out = applyFilters(rows, { project_id: { eq: 7 }, senaryo_adi: { eq: 'login' } });
    assert.deepEqual(out.map(r => r.id), [2]);
});

test('sayı/string ve büyük-küçük harf farkı tolere edilir, birebir eşleşen öne alınır', () => {
    const rows = [
        { id: 1, kullanici_adi: 'Feyza' },
        { id: 2, kullanici_adi: 'feyza' },
        { id: 3, kullanici_adi: 'admin' },
    ];
    const out = applyFilters(rows, { kullanici_adi: { eq: 'feyza' } });
    assert.deepEqual(out.map(r => r.id), [2, 1]);
    assert.deepEqual(applyFilters([{ id: 5, project_id: '12' }], { project_id: { eq: 12 } }).map(r => r.id), [5]);
});

test('filtre yoksa tüm satırlar döner', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    assert.equal(applyFilters(rows, {}).length, 2);
});
