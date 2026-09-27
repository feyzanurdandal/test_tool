import { userHasProjectAccess } from '../services/projectService.js';

/**
 * Kullanıcının erişmeye çalıştığı projeye yetkisi olup olmadığını kontrol eden merkezi middleware.
 */
export const requireProjectAccess = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'ADMIN') return next();

        const rawProjectName = req.query?.project || req.query?.projectName ||
                               req.body?.project || req.body?.projectName;

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
