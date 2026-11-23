// Çevirmen etkileşim adımını extract (yalnızca oku) üretirse act olarak çalıştırılır; okuma adımları değişmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveStepType } from '../utils/stepKind.js';

const ex = (instruction) => effectiveStepType({ type: 'extract', instruction });

test('eylem fiili içeren extract adımı act olur (pop up kapatma)', () => {
    assert.equal(ex('If there is a pop up labeled "açık rıza beyanı", close it'), 'act');
    assert.equal(ex('Click on the button labeled "Tamam"'), 'act');
    assert.equal(ex('Find the button labeled "x" and click it'), 'act');
    assert.equal(ex('Dismiss the dialog'), 'act');
});

test('okuma/döndürme adımları extract kalır (hata/engel mesajı okuma bozulmaz)', () => {
    assert.equal(ex('Return the message shown in the pop up'), 'extract');
    assert.equal(ex('Get the text of the "Close" button'), 'extract');      // tırnak içi etiket karara girmez, "get" okumadır
    assert.equal(ex('Check that the success message is displayed'), 'extract');
    assert.equal(ex('Click the login button and return the error message'), 'extract');
    assert.equal(ex('Find the heading labeled "şifre"'), 'extract');         // eylem fiili yok: dokunulmaz
    assert.equal(ex(''), 'extract');
});

test('diğer adım türleri değişmez', () => {
    assert.equal(effectiveStepType({ type: 'act', instruction: 'x' }), 'act');
    assert.equal(effectiveStepType({ type: 'form' }), 'form');
    assert.equal(effectiveStepType({ type: 'recorded' }), 'recorded');
    assert.equal(effectiveStepType(null), undefined);
});
