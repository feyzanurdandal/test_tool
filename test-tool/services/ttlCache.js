// Tek süreçlik basit TTL önbellek. Harici DPU servisine her istekte
// tekrar tekrar gidilmesini engeller. Yazma işlemlerinde ilgili anahtar
// invalidate edilir. (Birden fazla sunucu örneği çalıştırılırsa her örneğin
// kendi önbelleği olur; TTL kısa tutulduğu için tutarsızlık en fazla TTL kadar sürer.)
export class TtlCache {
    constructor(ttlMs = 30_000) {
        this.ttlMs = ttlMs;
        this.store = new Map();
    }

    async getOrLoad(key, loader) {
        const hit = this.store.get(key);
        if (hit && hit.expiresAt > Date.now()) return hit.value;

        // Aynı anahtar için eşzamanlı istekler tek yüklemeyi paylaşır
        if (hit && hit.pending) return hit.pending;

        const pending = (async () => {
            try {
                const value = await loader();
                this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
                return value;
            } catch (err) {
                this.store.delete(key);
                throw err;
            }
        })();
        this.store.set(key, { pending, expiresAt: 0 });
        return pending;
    }

    invalidate(key) {
        if (key === undefined) this.store.clear();
        else this.store.delete(key);
    }
}
