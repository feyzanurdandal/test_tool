import express from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { runQueue } from '../services/jobQueue.js';
import { emptyDirectory } from '../utils/emptyDirectory.js';

const router = express.Router();
const CACHE_DIR = path.join(process.cwd(), 'cache');

// ─── ÖNBELLEK TEMİZLEME (yalnızca ADMIN) ───
// Test çalışırken Stagehand önbelleği kullanıldığı için aktif iş varken reddedilir.
// Çalışma anı adım dosyaları artık ayrı klasörde (runtime/) olduğu için etkilenmez.
router.post('/cache/clear', requireAuth, requireAdmin, async (req, res, next) => {
    if (runQueue.activeCount > 0) {
        return res.status(409).json({ error: 'Şu anda çalışan veya sırada bekleyen testler var. Bittikten sonra tekrar deneyin.' });
    }

    try {
        // Klasörün kendisi silinmez (Docker'da volume bağlama noktası + salt-okunur kök: rmdir EROFS/EBUSY verir); yalnızca içi boşaltılır.
        await emptyDirectory(CACHE_DIR);
        await fs.promises.mkdir(path.join(CACHE_DIR, 'ai-security'), { recursive: true });
        return res.json({ success: true, message: 'Geçici önbellek dosyaları başarıyla temizlendi!' });
    } catch (error) {
        if (['EROFS', 'EACCES', 'EPERM', 'EBUSY'].includes(error?.code)) {
            console.error('Önbellek temizlenemedi:', error.code, error.message);
            return res.status(500).json({ error: `Önbellek temizlenemedi (${error.code}): klasör yazılabilir değil veya kullanımda. Sunucu günlüğüne bakın.` });
        }
        next(error);
    }
});

export default router;
