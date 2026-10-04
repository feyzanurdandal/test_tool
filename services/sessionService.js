import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import '../config/env.js';

// Tek Node instance için kalıcı, sunucu taraflı oturum deposu.
// Docker named volume ile restart boyunca korunur; geçersiz veya eksik kayıt erişimi reddeder.
export const SESSION_DIR = path.resolve(process.env.SESSION_DIR || path.join(process.cwd(), 'sessions'));
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fileFor = id => validId.test(id) ? path.join(SESSION_DIR, `${id}.json`) : null;

export function credentialFingerprint(user) {
    return crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(`${user.id}\0${user.sifre}`).digest('hex');
}

export async function createSession(user, ttlMs) {
    if (user.id === undefined || !user.sifre) throw new Error('Geçerli hesap kimliği bulunamadı.');
    await fs.mkdir(SESSION_DIR, {recursive: true, mode: 0o700});
    const entries = await fs.readdir(SESSION_DIR);
    // Süresi dolmuş dosyalar oturum açıldığında temizlenir; kullanıcı başına en fazla 20 oturum.
    const owned = [];
    for (const name of entries) {
        const id = name.replace(/\.json$/, '');
        if (!fileFor(id)) continue;
        const existing = await readSession(id);
        if (existing?.userId === String(user.id)) owned.push({id, ...existing});
    }
    owned.sort((a,b) => a.expiresAt - b.expiresAt);
    for (const old of owned.slice(0, Math.max(0, owned.length - 19))) await revokeSession(old.id);
    const session = {id:crypto.randomUUID(), userId:String(user.id), fingerprint:credentialFingerprint(user), expiresAt:Date.now()+ttlMs};
    await fs.writeFile(fileFor(session.id), JSON.stringify(session), {flag:'wx',mode:0o600});
    return session;
}

export async function readSession(id) {
    const file = fileFor(id);
    if (!file) return null;
    try {
        const session = JSON.parse(await fs.readFile(file,'utf8'));
        if (session.id !== id || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
            await revokeSession(id);
            return null;
        }
        return session;
    } catch(err) {
        if (err.code === 'ENOENT' || err instanceof SyntaxError) return null;
        throw err;
    }
}

export async function revokeSession(id) {
    const file = fileFor(id);
    if (file) await fs.rm(file,{force:true});
}

export async function revokeUserSessions(userId) {
    let entries;
    try { entries = await fs.readdir(SESSION_DIR); }
    catch(err) { if(err.code==='ENOENT') return; throw err; }
    for(const name of entries) {
        const id = name.replace(/\.json$/,'');
        if (!fileFor(id)) continue;
        const session = await readSession(id);
        if (session?.userId === String(userId)) await revokeSession(id);
    }
}
