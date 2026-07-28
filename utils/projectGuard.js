import dpu from '../config/dpuService.js';
/**
 * Kullanıcının erişmeye çalıştığı projeye yetkisi olup olmadığını kontrol eden merkezi middleware.
 * Request body, query veya params içinden 'projectName' veya 'proje' parametresini otomatik yakalar.
 */
export const requireProjectAccess = async (req, res, next) => {
    try {
        // ADMIN her projeye erişebilir
        if (req.user && req.user.role === 'ADMIN') {
            return next();
        }

        // Proje adını gelen istekten esnekçe çekiyoruz
        const projectName = req.body?.projectName || req.body?.proje || req.query?.projectName || req.query?.proje;

        if (!projectName) {
            return res.status(400).json({ success: false, error: "Proje adı belirtilmelidir!" });
        }

        // Kullanıcı veritabanından sorgulanır
        const userResult = await dpu.selectWhere('kullanicilar', { kullanici_adi: req.user.username });
        
        if (!userResult.success || !userResult.data || userResult.data.length === 0) {
            return res.status(401).json({ success: false, error: "Oturum açan kullanıcı veritabanında bulunamadı!" });
        }

        const user = userResult.data[0];
        const assignedProjects = user.projeler || [];

        // Kullanıcının atandığı projeler arasında bu proje var mı?
        const hasAccess = assignedProjects.includes(projectName);

        if (!hasAccess) {
            return res.status(403).json({ 
                success: false, 
                error: `Erişim Engellendi: '${projectName}' projesine erişim yetkiniz bulunmuyor!` 
            });
        }

        next();
    } catch (err) {
        console.error("🚨 [ProjectGuard Middleware Error]:", err.message);
        return res.status(500).json({ success: false, error: "Yetki kontrolü sırasında sunucu hatası oluştu." });
    }
};