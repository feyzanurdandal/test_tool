// İstemci bağlantıyı kapatsa bile handler bitene kadar slot tutulur.
// Rate limit, eşzamanlılık/maliyet sınırının yerine geçmez.
let active = 0;
export function withAiCapacity(handler) {
    return async (req,res,next) => {
        if (active >= 2) return res.status(429).json({error:'Aynı anda en fazla iki çeviri yapılabilir. Biraz sonra tekrar deneyin.'});
        active++;
        try { await handler(req,res,next); }
        finally { active--; }
    };
}
