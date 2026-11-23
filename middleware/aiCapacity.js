// AI çeviri istekleri için eşzamanlılık kapısı.
// Eskiden 3. eşzamanlı istek anında 429 alıyordu; artık sınırlı süre SIRADA BEKLER.
//  - AI_CONCURRENCY  : aynı anda çalışan çeviri sayısı (varsayılan 3)
//  - AI_QUEUE_WAIT_MS: en fazla bekleme süresi (varsayılan 40 sn); 0 ise beklemeden reddeder
//  - Kullanıcı başına aynı anda en fazla 1 çeviri (çift tıklama ve kota tüketimi koruması)
// İstemci bağlantıyı kapatsa bile handler bitene kadar slot tutulur.
const MAX_WAITERS = 100;

export function createAiGate({ concurrency = Number(process.env.AI_CONCURRENCY) || 3,
                               maxWaitMs = process.env.AI_QUEUE_WAIT_MS !== undefined ? Number(process.env.AI_QUEUE_WAIT_MS) : 40000,
                               perUser = 1 } = {}) {
    let active = 0;
    const waiters = [];
    const perUserActive = new Map();

    const release = (userKey) => {
        active--;
        if (userKey !== undefined) {
            const n = (perUserActive.get(userKey) || 1) - 1;
            if (n <= 0) perUserActive.delete(userKey); else perUserActive.set(userKey, n);
        }
        const next = waiters.shift();
        if (next) { clearTimeout(next.timer); active++; next.resolve(); }
    };

    async function acquire(userKey) {
        if (userKey !== undefined && (perUserActive.get(userKey) || 0) >= perUser) return 'user';
        if (userKey !== undefined) perUserActive.set(userKey, (perUserActive.get(userKey) || 0) + 1);
        if (active < concurrency) { active++; return 'ok'; }
        if (maxWaitMs <= 0 || waiters.length >= MAX_WAITERS) {
            if (userKey !== undefined) release_user(userKey);
            return 'busy';
        }
        const ok = await new Promise(resolve => {
            const waiter = { resolve: () => resolve(true) };
            waiter.timer = setTimeout(() => { const i = waiters.indexOf(waiter); if (i >= 0) waiters.splice(i, 1); resolve(false); }, maxWaitMs);
            waiters.push(waiter);
        });
        if (!ok) { if (userKey !== undefined) release_user(userKey); return 'busy'; }
        return 'ok';
    }
    function release_user(userKey) {
        const n = (perUserActive.get(userKey) || 1) - 1;
        if (n <= 0) perUserActive.delete(userKey); else perUserActive.set(userKey, n);
    }

    return {
        get active() { return active; },
        get waiting() { return waiters.length; },
        acquire, release,
    };
}

const defaultGate = createAiGate();

export function withAiCapacity(handler, options) {
    const gate = options ? createAiGate(options) : defaultGate;
    return async (req, res, next) => {
        const userKey = req?.user?.id !== undefined ? String(req.user.id) : undefined;
        const state = await gate.acquire(userKey);
        if (state === 'user') return res.status(429).json({ error: 'Önceki kaydetme/çeviri işleminiz hâlâ sürüyor. Bitmesini bekleyin.' });
        if (state === 'busy') return res.status(429).json({ error: 'Çeviri servisi şu anda yoğun. Birkaç saniye sonra tekrar deneyin.' });
        try { await handler(req, res, next); }
        finally { gate.release(userKey); }
    };
}
