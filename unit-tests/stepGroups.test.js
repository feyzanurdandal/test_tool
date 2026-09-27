import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripImportMarkers, isImportMarker } from '../utils/stepGroups.js';

test('içe aktarma işaretçileri çeviriden önce temizlenir', () => {
    const text = 'Siteyi aç\n[[İÇE_AKTAR:login]]\nKullanıcı adını yaz\n  Giriş Yap\'a tıkla\n[[/İÇE_AKTAR]]\n\nProfile git';
    assert.equal(stripImportMarkers(text), 'Siteyi aç\nKullanıcı adını yaz\nGiriş Yap\'a tıkla\nProfile git');
});

test('string olmayan girdi olduğu gibi döner', () => {
    const arr = ['a', 'b'];
    assert.equal(stripImportMarkers(arr), arr);
});

test('işaretçi tanıma', () => {
    assert.equal(isImportMarker('[[İÇE_AKTAR:login]]'), true);
    assert.equal(isImportMarker('[[/İÇE_AKTAR]]'), true);
    assert.equal(isImportMarker('Giriş butonuna tıkla'), false);
});
