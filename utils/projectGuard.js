import dpu from '../config/dpuService.js';

/**
 * Kullanıcının erişmeye çalıştığı projeye yetkisi olup olmadığını kontrol eden merkezi middleware.
 */
export const requireProjectAccess = async (req, res, next) => {
    try {
        // 1. ADMIN her projeye engelsiz erişebilir
        if (req.user && req.user.role === 'ADMIN') {
            return next();
        }

        // 2. Proje adını gelen istekten esnekçe çekiyoruz (project, projectName, proje)
        const rawProjectName = req.query?.project || req.query?.projectName || req.query?.proje ||
                               req.body?.project || req.body?.projectName || req.body?.proje;

        if (!rawProjectName) {
            return res.status(400).json({ success: false, error: "Proje adı belirtilmelidir!" });
        }

        const targetProject = String(rawProjectName).trim().toLowerCase();
        const username = String(req.user?.username || '').trim().toLowerCase();

        // 3. Kullanıcının atandığı projeler 'kullanici_projeleri' tablosundan sorgulanır
        const permsRes = await dpu.selectWhere('kullanici_projeleri', { 
            kullanici_adi: { eq: username } 
        });

        if (!permsRes.success || !permsRes.data) {
            return res.status(500).json({ success: false, error: "Kullanıcı yetkileri veritabanından çekilemedi." });
        }

        const assignedProjects = permsRes.data.map(p => String(p.proje_adi || '').trim().toLowerCase());

        // 4. Harf büyüklüğünden bağımsız yetki kontrolü
        const hasAccess = assignedProjects.includes(targetProject);

        if (!hasAccess) {
            return res.status(403).json({ 
                success: false, 
                error: `Erişim Engellendi: '${rawProjectName}' projesine erişim yetkiniz bulunmuyor!` 
            });
        }

        next();
    } catch (err) {
        console.error(" [ProjectGuard Middleware Error]:", err.message);
        return res.status(500).json({ success: false, error: "Yetki kontrolü sırasında sunucu hatası oluştu." });
    }
};