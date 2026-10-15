// ─── ORTAK YARDIMCILAR ───
// app.js'ten ayrıştırılan, DOM durumuna bağlı olmayan saf fonksiyonlar.
(function () {
    "use strict";

    // XSS kaçış fonksiyonu
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Yalnızca http/https bağlantılarına izin verir (javascript: vb. engellenir)
    function safeHttpUrl(url) {
        try {
            const parsed = new URL(String(url || ''), window.location.origin);
            return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
        } catch {
            return '';
        }
    }

    function formatStepNo(n) {
        return n < 10 ? `0${n}.` : `${n}.`;
    }

    // ─── İÇE AKTARILAN SENARYO GRUPLARI ───
    // adimlar_tr içinde içe aktarılan adımlar şu işaretçilerle saklanır:
    //   [[İÇE_AKTAR:login]] ... [[/İÇE_AKTAR]]
    // Backend çeviriye göndermeden önce işaretçileri temizler (utils/stepGroups.js).
    const IMPORT_START_RE = /^\[\[İÇE_AKTAR:(.+)\]\]$/;
    const IMPORT_END = "[[/İÇE_AKTAR]]";

    // Metni blok listesine çevirir: { type: "step", text } | { type: "group", source, steps: [] }
    function parseStepBlocks(text) {
        const blocks = [];
        let openGroup = null;
        String(text || "").split('\n').map(l => l.trim()).filter(l => l !== "").forEach(line => {
            const startMatch = line.match(IMPORT_START_RE);
            if (startMatch) {
                if (openGroup && openGroup.steps.length) blocks.push(openGroup);
                openGroup = { type: "group", source: startMatch[1].trim(), steps: [] };
                return;
            }
            if (line === "[[İÇE_AKTAR_DÜZENLENDİ]]") {
                if (openGroup) openGroup.edited = true;
                return;
            }
            if (line === IMPORT_END) {
                if (openGroup && openGroup.steps.length) blocks.push(openGroup);
                openGroup = null;
                return;
            }
            if (openGroup) openGroup.steps.push(line);
            else blocks.push({ type: "step", text: line });
        });
        if (openGroup && openGroup.steps.length) blocks.push(openGroup);
        return blocks;
    }

    // Gruplar dahil tüm adımları düz liste olarak döndürür
    function flattenStepBlocks(text) {
        return parseStepBlocks(text).flatMap(b => b.type === "group" ? b.steps : [b.text]);
    }

    // Senaryo listesindeki salt okunur adım önizlemesi (gruplar akordiyon)
    function renderStepsPreviewHtml(contentTr) {
        const stepHtml = (line, no) => `
            <div class="flex items-start gap-3 bg-[#27272a]/20 p-2.5 rounded-lg border border-[rgba(255,255,255,0.02)]">
                <span class="font-mono text-[10px] text-zinc-500 mt-0.5">${formatStepNo(no)}</span>
                <div class="flex-1">
                    <div class="font-medium text-zinc-200 select-text">${escapeHtml(line)}</div>
                </div>
                <span class="text-[9px] px-1.5 py-0.5 rounded border bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20 font-mono font-bold uppercase shrink-0">ADIM</span>
            </div>`;

        let counter = 0;
        return parseStepBlocks(contentTr).map(block => {
            if (block.type === "step") return stepHtml(block.text, ++counter);

            const first = counter + 1;
            const inner = block.steps.map(line => stepHtml(line, ++counter)).join("");
            return `
                <div class="preview-step-group rounded-lg border border-[#3b82f6]/20 bg-[#3b82f6]/[0.04]">
                    <button type="button" aria-expanded="false" class="preview-group-toggle w-full flex items-center gap-2 p-2.5 text-left rounded-lg hover:bg-[#3b82f6]/[0.06] transition">
                        <span class="group-chevron inline-flex transition-transform duration-150"><i data-lucide="chevron-right" class="w-3.5 h-3.5 text-zinc-400"></i></span>
                        <i data-lucide="layers" class="w-3.5 h-3.5 text-[#3b82f6] shrink-0"></i>
                        <span class="font-medium text-zinc-100 truncate">${escapeHtml(block.source)}</span>
                        ${block.edited ? '<span class="text-[10px] text-amber-400 shrink-0">Düzenlendi</span>' : ""}
                        <span class="text-[10px] text-zinc-500 shrink-0">${block.steps.length} adım · ${formatStepNo(first).slice(0, -1)}–${formatStepNo(counter).slice(0, -1)}</span>
                    </button>
                    <div class="preview-group-body hidden space-y-2 px-2.5 pb-2.5">${inner}</div>
                </div>`;
        }).join("");
    }

    function bindPreviewGroupToggles(container) {
        container.querySelectorAll(".preview-group-toggle").forEach(toggle => {
            toggle.addEventListener("click", (e) => {
                e.stopPropagation();
                const group = toggle.closest(".preview-step-group");
                const body = group.querySelector(".preview-group-body");
                const willOpen = body.classList.contains("hidden");
                body.classList.toggle("hidden", !willOpen);
                toggle.setAttribute("aria-expanded", String(willOpen));
                group.querySelector(".group-chevron").style.transform = willOpen ? "rotate(90deg)" : "";
            });
        });
    }

    // CSP satır içi olay işleyicilerini (onclick="...") engeller; tıklamanın
    // üst satıra/karta yayılmaması gereken öğeler bu sınıfla işaretlenir.
    function bindStopPropagation(root) {
        root.querySelectorAll(".js-stop-propagation").forEach(el => {
            el.addEventListener("click", (e) => e.stopPropagation());
        });
    }

    Object.assign(window, {
        escapeHtml, safeHttpUrl, formatStepNo,
        IMPORT_START_RE, IMPORT_END, parseStepBlocks, flattenStepBlocks,
        renderStepsPreviewHtml, bindPreviewGroupToggles, bindStopPropagation,
    });
})();
