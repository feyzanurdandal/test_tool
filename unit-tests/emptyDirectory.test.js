// "Önbelleği Temizle": klasörün kendisi korunur (Docker volume bağlama noktası silinemez), içindekiler tamamen silinir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emptyDirectory } from '../utils/emptyDirectory.js';

test('içindekiler (iç içe klasörler dahil) silinir, klasörün kendisi aynı kalır', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-cache-'));
    fs.mkdirSync(path.join(dir, 'selectors', 'alt'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'selectors', 'a.json'), '{}');
    fs.writeFileSync(path.join(dir, 'selectors', 'alt', 'b.json'), '{}');
    fs.mkdirSync(path.join(dir, 'ai-security'));
    fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
    const inodeBefore = fs.statSync(dir).ino;
    assert.equal(await emptyDirectory(dir), 3);
    assert.deepEqual(fs.readdirSync(dir), []);
    assert.equal(fs.statSync(dir).ino, inodeBefore, 'klasörün kendisi silinip yeniden oluşturulmamalı');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('klasör yoksa hata vermez; boş klasörde 0 döner', async () => {
    const dir = path.join(os.tmpdir(), 'tt-yok-' + Date.now());
    assert.equal(await emptyDirectory(dir), 0);
    fs.mkdirSync(dir);
    assert.equal(await emptyDirectory(dir), 0);
    fs.rmSync(dir, { recursive: true, force: true });
});
