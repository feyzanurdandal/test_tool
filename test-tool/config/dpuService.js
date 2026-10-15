import './env.js';
import fetch from 'node-fetch';

class DpuService {
    constructor() {
        this.baseUrl = process.env.DPU_BASE_URL;
        this.projectCode = process.env.DPU_PROJECT_CODE;
        this.apiKey = process.env.DPU_API_KEY;
        this.email = process.env.DPU_USER_EMAIL; 
        this.password = process.env.DPU_USER_PASSWORD;  

        this.token = null;
        this.tokenExpiresAt = null;
    }

    // JWT Token Alma ve Yenileme Mekanizması
    async getValidToken() {
        const now = new Date();
        
        if (this.token && this.tokenExpiresAt && (this.tokenExpiresAt - now > 5 * 60 * 1000)) {
            return this.token;
        }

        console.log(" DPU Base: Yeni JWT Token alınıyor...");
        try {
            const result = await this.fetchWithTimeoutAndRetry(`${this.baseUrl}/api/v1/auth/token`, {
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
            }, {timeoutMs:8000,retries:0});

            if (result.success && result.data && result.data.token) {
                this.token = result.data.token;
                this.tokenExpiresAt = new Date(result.data.expires_at);
                console.log(" DPU Base: JWT Token başarıyla güncellendi.");
                return this.token;
            } else {
                throw new Error(result.message || "Token alınamadı.");
            }
        } catch (error) {
            console.error(" DPU Base Bağlantı Hatası ! Değerleri kontrol et:", error.message);
            throw error;
        }
    }

    // Fetch isteğine Timeout ve Retry desteği
    async fetchWithTimeoutAndRetry(url, config, options = { timeoutMs: 8000, retries: 2 }) {
        let lastError;

        for (let attempt = 0; attempt <= options.retries; attempt++) {
            // AbortController ile zamanaşımı mekanizması kuruyoruz
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

            try {
                const response = await fetch(url, {
                    ...config,
                    signal: controller.signal,
                    size: 2 * 1024 * 1024,
                });

                // Eğer HTTP statüsü 5xx ise ve retry hakkımız varsa yeniden denemek üzere catch'e düşür
                if (!response.ok && response.status >= 500 && attempt < options.retries) {
                    throw new Error(`DPU Base Sunucu Hatası (HTTP ${response.status}) - Yeniden deneniyor...`);
                }

                // 2xx veya 4xx durumunda doğrudan cevabı döndür (4xx hatalarında retry atılmaz)
                const result = await response.json();
                clearTimeout(timeoutId);
                return result;

            } catch (error) {
                clearTimeout(timeoutId);
                
                const isAbortError = error.name === 'AbortError';
                const errorMessage = isAbortError 
                    ? `DPU Base isteği zamanaşımına uğradı (${options.timeoutMs}ms)` 
                    : error.message;

                lastError = new Error(errorMessage);

                if (attempt < options.retries) {
                    // Her başarısız denemede bekleme süresini katla (1sn, 2sn...)
                    const backoffDelay = Math.pow(2, attempt) * 1000;
                    console.warn(` [DPU Base Retry] İstek başarısız oldu (${errorMessage}). ${attempt + 1}/${options.retries} deneme ${backoffDelay}ms sonra yapılacak...`);
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                } else {
                    console.error(` [DPU Base Critical Failure] ${options.retries} deneme sonrası istek tamamen başarısız oldu:`, errorMessage);
                }
            }
        }

        return { success: false, error: lastError ? lastError.message : "DPU Base servisine ulaşılamadı." };
    }

    // Genel İstek Atma
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

        // Doğrudan fetch yerine Timeout + Retry mekanizmasını çağırıyoruz
        return await this.fetchWithTimeoutAndRetry(`${this.baseUrl}/api/v1/${endpoint}`, config,
            {timeoutMs:8000,retries:['GET','HEAD'].includes(method) ? 2 : 0});
    }

    // 1. LIST / SEARCH
    async select(tableName, limit = 100, where = "") {
        let url = `${tableName}?limit=${limit}`;
        if (where) {
            url += `&where=${encodeURIComponent(where)}`;
        }
        return await this.request(url, "GET");
    }

    // 1.1 SELECT ALL (Tüm sayfaları otomatik gezerek tam veriyi getirir)
    async selectAll(tableName, pageSize = 100, where = "") {
        try {
            let allRecords = [];
            let currentPage = 1;
            let hasMore = true;

            while (hasMore && currentPage <= 100) {
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
                    return {success:false,error:'DPU Base kayıt listesi tamamlanamadı.',data:[]};
                }
            }
            if (hasMore) return {success:false,error:'DPU Base sayfalama sınırı aşıldı.',data:[]};
            return { success: true, data: allRecords };
        } catch (error) {
            console.error(`DPU Base SelectAll Hatası (${tableName}):`, error);
            return { success: false, error: error.message, data: [] };
        }
    }

    // 2. CREATE
    async insert(tableName, data) {
        return await this.request(tableName, "POST", data);
    }

    // 3. UPDATE 
    async update(tableName, id, data) {
        return await this.request(`${tableName}/${encodeURIComponent(id)}`, "PATCH", data);
    }

    // 4. DELETE
    async delete(tableName, id) {
        return await this.request(`${tableName}/${encodeURIComponent(id)}`, "DELETE");
    }

    /**
     * DPU Base veritabanından filtreli (WHERE) veri çeker.
     *
     * - Sayfalama yapar: servis varsayılan limitte keserse kayıtlar kaybolmaz.
     * - Sonuçları JS tarafında filtreye göre yeniden süzer: servis bir filtreyi
     *   yok sayarsa (geçmişte görüldü) yanlış kayıt data[0] olarak dönmez.
     *   Eşleşme büyük/küçük harfe duyarsızdır (servisin davranışıyla uyumlu),
     *   birebir eşleşen kayıtlar listenin başına alınır.
     * @param {string} tableName - Tablo adı (ör: 'kullanicilar')
     * @param {Object} filters - Filtre objesi (ör: { kullanici_adi: { eq: 'admin' } })
     */
    async selectWhere(tableName, filters = {}, { pageSize = 100, maxPages = 100 } = {}) {
        try {
            let allRecords = [];

            for (let page = 1; page <= maxPages; page++) {
                const queryParams = new URLSearchParams();
                Object.entries(filters).forEach(([field, ops]) => {
                    Object.entries(ops).forEach(([op, val]) => {
                        queryParams.append(`where[${field}][${op}]`, val);
                    });
                });
                queryParams.append('limit', String(pageSize));
                queryParams.append('page', String(page));

                const res = await this.request(`${tableName}?${queryParams.toString()}`, 'GET');
                if (!res || !res.success) {
                    return res || {success:false,error:'DPU Base sorgusu tamamlanamadı.'};
                }

                const rows = Array.isArray(res.data) ? res.data : [];
                allRecords = allRecords.concat(rows);
                if (rows.length < pageSize) break;
                if (page === maxPages) return {success:false,error:'DPU Base sayfalama sınırı aşıldı.'};
            }

            return { success: true, data: applyFilters(allRecords, filters) };
        } catch (error) {
            console.error(`DPU Base WHERE sorgu hatası (${tableName}):`, error);
            return { success: false, error: error.message };
        }
    }

    // Tek kayıt döndüren kısayol (bulunamazsa null)
    async findOne(tableName, filters = {}) {
        const res = await this.selectWhere(tableName, filters);
        if (!res.success) throw new Error(res.error || `${tableName} sorgulanamadı.`);
        return res.data.length > 0 ? res.data[0] : null;
    }
}

const normalize = (v) => String(v ?? '').trim().toLowerCase();

export function applyFilters(rows, filters = {}) {
    const eqFilters = [];
    Object.entries(filters).forEach(([field, ops]) => {
        if (ops && Object.prototype.hasOwnProperty.call(ops, 'eq')) eqFilters.push([field, ops.eq]);
    });
    if (eqFilters.length === 0) return rows;

    const matched = rows.filter(row => eqFilters.every(([field, val]) => normalize(row[field]) === normalize(val)));
    const isExact = (row) => eqFilters.every(([field, val]) => String(row[field] ?? '').trim() === String(val ?? '').trim());
    return [...matched.filter(isExact), ...matched.filter(r => !isExact(r))];
}

const dpu = new DpuService();
export default dpu;