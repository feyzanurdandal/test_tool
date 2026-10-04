import dpu from '../config/dpuService.js';
import { TtlCache } from './ttlCache.js';

// Oturum doğrulamasında kullanıcının hâlâ var olduğu ve güncel rolü buradan okunur.
// Böylece silinen kullanıcı veya değişen rol, token süresinin bitmesini
// beklemeden en geç TTL kadar sürede etkili olur.
const userCache = new TtlCache(30_000);
const key = (v) => String(v || '').trim().toLowerCase();

export async function findUserByName(username, { fresh = false } = {}) {
    const name = String(username || '').trim();
    if (!name) return null;

    const load = async () => {
        const res = await dpu.selectWhere('kullanicilar', { kullanici_adi: { eq: name } });
        if (!res.success) throw new Error('Kullanıcı sorgulanamadı.');
        return (res.data || []).find(u => key(u.kullanici_adi) === key(name)) || null;
    };

    if (fresh) {
        const user = await load();
        userCache.invalidate(key(name));
        return user;
    }
    return userCache.getOrLoad(key(name), load);
}

export function invalidateUser(username) {
    if (username === undefined) userCache.invalidate();
    else userCache.invalidate(key(username));
}

// Oturum kimliği kullanıcı adı tekrar kullanımından bağımsızdır.
export async function findUserById(id) {
    return dpu.findOne('kullanicilar', { id: { eq: String(id) } });
}
