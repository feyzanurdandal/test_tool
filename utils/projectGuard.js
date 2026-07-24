import dpu from '../config/dpuService.js';

/**
 * Kullanıcının belirtilen projeye erişim yetkisi olup olmadığını denetler.
 * ADMIN rolü her zaman tam yetkilidir.
 * 
 * @param {Object} user - req.user nesnesi ({ username, role })
 * @param {string} projectName - İşlem yapılmak istenen proje adı
 * @returns {Promise<boolean>}
 */
export async function checkProjectOwnership(user, projectName) {
    if (!user || !projectName) return false;
    
    // ADMIN tüm projelere erişebilir
    if (user.role === 'ADMIN') return true;

    try {
        const permissionsRes = await dpu.selectAll('kullanici_projeleri');
        if (!permissionsRes.success || !permissionsRes.data) return false;

        const allowedProjects = permissionsRes.data
            .filter(p => p.kullanici_adi.toLowerCase() === user.username.toLowerCase())
            .map(p => p.proje_adi.toLowerCase());

        return allowedProjects.includes(projectName.trim().toLowerCase());
    } catch (error) {
        console.error("Yetki kontrolü esnasında hata oluştu:", error);
        return false;
    }
}