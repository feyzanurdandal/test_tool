// ─── BİLDİRİMLER ───
// Tarayıcının engelleyici alert() kutusunun yerine sayfanın köşesinde
// kendiliğinden kapanan bildirimler.
(function () {
    "use strict";

    const ERROR_HINTS = /(hata|başarısız|basarisiz|engel|yetki|bulunamadı|lütfen|geçersiz|dolu|error)/i;
    let region = null;

    function ensureRegion() {
        if (region) return region;
        region = document.createElement("div");
        region.id = "notify-region";
        region.setAttribute("role", "status");
        region.setAttribute("aria-live", "polite");
        region.className = "fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)] pointer-events-none";
        document.body.appendChild(region);
        return region;
    }

    /**
     * @param {string} message
     * @param {"success"|"error"|"info"} [type] Verilmezse mesaj içeriğinden tahmin edilir.
     */
    function notify(message, type) {
        const text = String(message ?? "").trim();
        if (!text) return;
        const kind = type || (ERROR_HINTS.test(text) ? "error" : "success");

        const palette = {
            success: "border-emerald-500/30 text-emerald-100",
            error: "border-rose-500/40 text-rose-100",
            info: "border-[#3b82f6]/40 text-zinc-100",
        }[kind] || "border-[#3b82f6]/40 text-zinc-100";
        const bar = { success: "bg-emerald-400", error: "bg-rose-400", info: "bg-[#3b82f6]" }[kind] || "bg-[#3b82f6]";

        const toast = document.createElement("div");
        toast.className = `notify-toast pointer-events-auto flex items-stretch gap-3 bg-[#18181b] border ${palette} rounded-xl shadow-2xl overflow-hidden`;
        toast.innerHTML = `
            <span class="w-1 shrink-0 ${bar}"></span>
            <p class="flex-1 py-3 text-xs leading-relaxed whitespace-pre-line select-text"></p>
            <button type="button" class="px-3 text-zinc-500 hover:text-white transition" aria-label="Kapat">&times;</button>
        `;
        toast.querySelector("p").textContent = text;

        const close = () => toast.remove();
        toast.querySelector("button").addEventListener("click", close);
        ensureRegion().appendChild(toast);

        const duration = kind === "error" ? 8000 : 4500;
        setTimeout(close, duration);
    }

    window.notify = notify;
})();
