import { userHasProjectAccess } from '../services/projectService.js';

/**
 * Kullanıcının erişmeye çalıştığı projeye yetkisi olup olmadığını kontrol eden merkezi middleware.
 */
export const requireProjectAccess = async (req, res, next) => {
    try {
        // Yetkilendirme ve işlem aynı doğrulanmış proje kaynağını kullanır.
        const source = ['GET', 'HEAD'].includes(req.method) ? req.query : req.body;
        const rawProjectName = source?.project || source?.projectName;
        const supplied = [req.query?.project, req.query?.projectName, req.body?.project, req.body?.projectName]
            .filter(value => value !== undefined && value !== '');
        if (supplied.some(value => typeof value !== 'string' || value.trim().toLowerCase() !== String(rawProjectName || '').trim().toLowerCase())) {
            return res.status(400).json({ success: false, error: 'Çelişkili proje bilgisi gönderildi.' });
        }
        if (req.user && req.user.role === 'ADMIN') return next();

        if (!rawProjectName) {
            return res.status(400).json({ success: false, error: 'Proje adı belirtilmelidir!' });
        }

        if (!(await userHasProjectAccess(req.user, rawProjectName))) {
            return res.status(403).json({
                success: false,
                error: `Erişim Engellendi: '${rawProjectName}' projesine erişim yetkiniz bulunmuyor!`
            });
        }

        next();
    } catch (err) {
        console.error(' [ProjectGuard Middleware Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Yetki kontrolü sırasında sunucu hatası oluştu.' });
    }
};
