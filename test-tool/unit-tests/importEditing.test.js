import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripImportMarkers } from '../utils/stepGroups.js';

const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../public/js/lib/utils.js', import.meta.url), 'utf8'), context);
const { parseStepBlocks, flattenStepBlocks, renderStepsPreviewHtml } = context.window;

test('düzenlenmiş grup yeniden açılırken adını, adımlarını ve göstergesini korur', () => {
    const text = 'Siteyi aç\n[[İÇE_AKTAR:giriş]]\n[[İÇE_AKTAR_DÜZENLENDİ]]\nYeni kullanıcı adını yaz\nGirişe tıkla\n[[/İÇE_AKTAR]]';
    const blocks = parseStepBlocks(text);
    assert.equal(blocks[1].source, 'giriş');
    assert.equal(blocks[1].edited, true);
    assert.deepEqual(Array.from(blocks[1].steps), ['Yeni kullanıcı adını yaz', 'Girişe tıkla']);
    assert.deepEqual(Array.from(flattenStepBlocks(text)), ['Siteyi aç', 'Yeni kullanıcı adını yaz', 'Girişe tıkla']);
    assert.equal(stripImportMarkers(text), 'Siteyi aç\nYeni kullanıcı adını yaz\nGirişe tıkla');
    assert.match(renderStepsPreviewHtml(text), /Düzenlendi/);
});

test('eski gruplar değişmeden açılır ve düzenlendi göstergesi taşımaz', () => {
    const text = '[[İÇE_AKTAR:eski]]\nButona tıkla\n[[/İÇE_AKTAR]]';
    assert.equal(parseStepBlocks(text)[0].edited, undefined);
    assert.doesNotMatch(renderStepsPreviewHtml(text), /Düzenlendi/);
});

test('önizleme senaryo adını ve düzenlenen talimatları HTML olarak çalıştırmaz', () => {
    const text = '[[İÇE_AKTAR:<img src=x>]]\n[[İÇE_AKTAR_DÜZENLENDİ]]\n<script>alert(1)</script>\n[[/İÇE_AKTAR]]';
    const html = renderStepsPreviewHtml(text);
    assert.doesNotMatch(html, /<script>|<img src=x>/);
    assert.match(html, /&lt;script&gt;/);
});
