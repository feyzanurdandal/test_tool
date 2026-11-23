import fs from 'fs';
import path from 'path';

/**
 * Klasörün İÇİNDEKİLERİ siler, klasörün kendisini bırakır. Docker'da /app/cache bir volume bağlama noktasıdır ve kök dosya sistemi
 * salt-okunurdur; klasörün kendisini silmek (rm -r + mkdir) `EROFS: rmdir '/app/cache'` ile düşer. Klasör yoksa hata vermez.
 * @returns {Promise<number>} silinen üst düzey öğe sayısı
 */
export async function emptyDirectory(dir) {
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
    catch (err) { if (err?.code === 'ENOENT') return 0; throw err; }
    for (const entry of entries) await fs.promises.rm(path.join(dir, entry.name), { recursive: true, force: true });
    return entries.length;
}
