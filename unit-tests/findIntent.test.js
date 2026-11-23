// "Bul" adımları eylemsiz sayılır; eylem fiili içeren cümleler eskisi gibi kalır.
import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { parseInstruction } = await import('../utils/aiStepExecutor.js');

test('find/locate/look for → find; etiket çıkarılır', () => {
    for (const t of ['Find the label "e-posta"', 'Locate the button labeled "giriş yap"', 'Look for the text "Hoş geldiniz"']) {
        const p = parseInstruction(t);
        assert.equal(p.intent, 'find', t);
        assert.ok(p.label, t);
    }
});

test('eylem fiili içeren cümleler find sayılmaz', () => {
    for (const t of ['Find the button "Kaydet" and click it', 'Find the "Detay" button then click', 'Click on the button labeled "giriş yap"',
        'Type "a" into the input field labeled "e-posta"', 'Select the option "X" from the dropdown']) {
        assert.notEqual(parseInstruction(t).intent, 'find', t);
    }
});

test('tırnak içindeki metindeki fiiller (örn. "Open") find kararını bozmaz', () => {
    assert.equal(parseInstruction('Find the button labeled "Open and Close"').intent, 'find');
});
