import { db } from '../config/dbService.js';

/**
 * Kullanıcının erişmeye çalıştığı projeye yetkisi olup olmadığını kontrol eden merkezi middleware.
 * Request body veya query içinden 'projectName', 'project' veya 'proje' parametresini otomatik yakalar.
 */
export const requireProjectAccess = async (req, res, next) => {
    try {
        // 1. ADMIN her projeye koşulsuz erişebilir
        if (req.user && req.user.role === 'ADMIN') {
            return next();
        }

        // 2. Proje adını gelen istekten çekiyoruz (app.js query string'de 'project' olarak gönderiyor)
        const projectName = req.body?.projectName || req.body?.proje || req.query?.projectName || req.query?.project || req.query?.proje;

        if (!projectName) {
            return res.status(400).json({ success: false, error: "Proje adı belirtilmelidir!" });
        }

        const username = req.user?.username;
        if (!username) {
            return res.status(401).json({ success: false, error: "Geçersiz oturum bilgisi!" });
        }

        // 3. Güvenlik Kontrolü: Doğrudan ilişki tablosu (kullanici_projeleri) sorgulanır
        const permissionResult = await db.selectWhere('kullanici_projeleri', { 
            kullanici_adi: { eq: username.trim() },
            proje_adi: { eq: projectName.trim() }
        });

        // 4. Yetki Doğrulama
        if (permissionResult.success && permissionResult.data && permissionResult.data.length > 0) {
            return next(); // Yetki TAM, geçişe izin ver.
        }

        // Yetki YOKSA erişimi doğrudan blokla!
        return res.status(403).json({ 
            success: false, 
            error: `Erişim Engellendi: '${projectName}' projesine erişim yetkiniz bulunmuyor!` 
        });

    } catch (err) {
        console.error("🚨 [ProjectGuard Middleware Error]:", err.message);
        return res.status(500).json({ success: false, error: "Yetki kontrolü sırasında sunucu hatası oluştu." });
    }
};