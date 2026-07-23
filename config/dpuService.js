import fetch from 'node-fetch';

class DpuService {
    constructor() {
        this.baseUrl = process.env.DPU_BASE_URL;
        this.projectCode = process.env.DPU_PROJECT_CODE;
        this.apiKey = process.env.DPU_API_KEY;
        this.email = process.env.DPU_USER_EMAIL; // Admin yerine User Email 
        this.password = process.env.DPU_USER_PASSWORD; // Admin yerine User Password 

        this.token = null;
        this.tokenExpiresAt = null;
    }

    // 🔑 JWT Token Alma ve Yenileme Mekanizması
    async getValidToken() {
        const now = new Date();
        
        if (this.token && this.tokenExpiresAt && (this.tokenExpiresAt - now > 5 * 60 * 1000)) {
            return this.token;
        }

        console.log("🔄 DPU Base: Yeni JWT Token alınıyor...");
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/auth/token`, {
                method: "POST",
                headers: {
                    "X-API-Key": this.apiKey,
                    "X-Project-Code": this.projectCode,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: this.email,
                    password: this.password
                })
            });

            const result = await response.json();
            if (result.success && result.data && result.data.token) {
                this.token = result.data.token;
                this.tokenExpiresAt = new Date(result.data.expires_at);
                console.log("✅ DPU Base: JWT Token başarıyla güncellendi.");
                return this.token;
            } else {
                throw new Error(result.message || "Token alınamadı.");
            }
        } catch (error) {
            console.error("❌ DPU Base Bağlantı Hatası ! Değerleri kontrol et:", error.message);
            throw error;
        }
    }

    // 🛠️ Genel İstek Atma Yardımcısı (Helper)
    async request(endpoint, method = "GET", body = null) {
        const token = await this.getValidToken();
        const headers = {
            "Authorization": `Bearer ${token}`,
            "X-API-Key": this.apiKey,
            "X-Project-Code": this.projectCode,
            "Content-Type": "application/json"
        };

        const config = {
            method,
            headers
        };

        if (body) {
            config.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}/api/v1/${endpoint}`, config);
        return await response.json();
    }

    // 🔍 1. LIST / SEARCH
    async select(tableName, limit = 100, where = "") {
        let url = `${tableName}?limit=${limit}`;
        if (where) {
            url += `&where=${encodeURIComponent(where)}`;
        }
        return await this.request(url, "GET");
    }

    // 🔍 1.1 SELECT ALL (Tüm sayfaları otomatik gezerek tam veriyi getirir)
    async selectAll(tableName, pageSize = 100, where = "") {
        try {
            let allRecords = [];
            let currentPage = 1;
            let hasMore = true;

            while (hasMore) {
                let url = `${tableName}?limit=${pageSize}&page=${currentPage}`;
                if (where) {
                    url += `&where=${encodeURIComponent(where)}`;
                }

                const response = await this.request(url, "GET");

                if (response && response.success && Array.isArray(response.data)) {
                    allRecords = allRecords.concat(response.data);

                    // Eğer dönen kayıt sayısı istenen limit sayısından azsa son sayfaya gelmişizdir
                    if (response.data.length < pageSize) {
                        hasMore = false;
                    } else {
                        currentPage++;
                    }
                } else {
                    // İstek başarısızsa veya veri yoksa döngüyü kır
                    hasMore = false;
                }
            }

            return { success: true, data: allRecords };
        } catch (error) {
            console.error(`DPU Base SelectAll Hatası (${tableName}):`, error);
            return { success: false, error: error.message, data: [] };
        }
    }

    // 💾 2. CREATE
    async insert(tableName, data) {
        return await this.request(tableName, "POST", data);
    }

    // 🔄 3. UPDATE (request helper'ı kullanılarak güvenli hale getirildi)
    async update(tableName, id, data) {
        return await this.request(`${tableName}/${id}`, "PATCH", data);
    }

    // 🗑️ 4. DELETE
    async delete(tableName, id) {
        return await this.request(`${tableName}/${id}`, "DELETE");
    }
}

const dpu = new DpuService();
export default dpu;