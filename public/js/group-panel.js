// ─── SENARYO GRUPLARI ───
// Grup = proje + test türü bazında adlandırılmış, SIRALI senaryo listesi (bir senaryo birden çok gruba girebilir).
// Bu dosya: senaryo listesi araç çubuğu (filtre + toplu gruba ekleme), toplu test ekranı grup seçici, grup yönetim penceresi
// (oluştur / yeniden adlandır / sil / sırala) ve senaryo formundaki "Gruplar" alanı. Tüm metinler textContent ile yazılır.
(function () {
    "use strict";

    const UNGROUPED = "__none__";
    const NEW_GROUP = "__new__";
    const BATCH_LIMIT = 50;           // sunucudaki tek seferlik toplu çalıştırma sınırı

    const S = {
        hooks: null, key: "", groups: [], scenarios: [], byName: new Map(), byId: new Map(),
        filterId: "", batchId: "", error: "", inflight: null, inflightKey: "",
        formSelected: new Set(), formInitial: new Set(), formEditing: false,
    };

    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const ctx = () => S.hooks.getContext();
    const say = (msg) => (window.notify ? window.notify(msg) : console.log(msg));
    const BTN = "text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#18181b] hover:bg-[#27272a] text-zinc-300 hover:text-white transition";
    const BTN_PRIMARY = "text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-blue-600 bg-[#3b82f6] hover:bg-blue-500 text-white transition";
    const SELECT = "bg-[#18181b] border border-[rgba(255,255,255,0.08)] text-xs text-white rounded-lg px-2.5 py-1.5 outline-none focus:border-[#3b82f6] cursor-pointer";
    const INPUT = "bg-[#27272a] border border-[rgba(255,255,255,0.08)] text-xs text-white rounded-lg px-2.5 py-1.5 outline-none focus:border-[#3b82f6]";

    // ── Veri ──
    function apply(json) {
        S.groups = Array.isArray(json.groups) ? json.groups : [];
        S.scenarios = Array.isArray(json.scenarios) ? json.scenarios : [];
        S.byName = new Map(S.scenarios.map(s => [s.name, s.id]));
        S.byId = new Map(S.scenarios.map(s => [s.id, s.name]));
        const exists = (id) => id === UNGROUPED || S.groups.some(g => g.id === id);
        if (S.filterId && !exists(S.filterId)) S.filterId = "";
        if (S.batchId && !exists(S.batchId)) S.batchId = "";
    }

    async function refresh() {
        const { project, type } = ctx();
        const key = `${project}|${type}`;
        if (!project || project === "Varsayılan Proje") { S.groups = []; S.scenarios = []; S.byName.clear(); S.byId.clear(); S.error = ""; return S; }
        if (S.key !== key) { S.key = key; S.filterId = ""; S.batchId = ""; }
        if (S.inflight && S.inflightKey === key) return S.inflight;
        S.inflightKey = key;
        S.inflight = (async () => {
            try {
                const res = await fetch(`/api/scenarios/groups?project=${encodeURIComponent(project)}&testType=${encodeURIComponent(type)}`);
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || "Gruplar yüklenemedi");
                apply(json); S.error = "";
            } catch (err) {
                S.groups = []; S.error = err.message || "Gruplar yüklenemedi";
            } finally { S.inflight = null; }
            return S;
        })();
        return S.inflight;
    }

    async function call(path, body) {
        const { project, type } = ctx();
        const res = await fetch(`/api/scenarios/groups${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectName: project, testType: type, ...body }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error(json.error || "İşlem başarısız oldu.");
        apply(json);
        return json;
    }

    const groupById = (id) => S.groups.find(g => g.id === id);
    const orderedNames = (g) => g.scenarioIds.map(id => S.byId.get(id)).filter(Boolean);
    const groupsOfName = (name) => { const id = S.byName.get(name); return id ? S.groups.filter(g => g.scenarioIds.includes(id)) : []; };

    function filterNames(names, groupId) {
        if (!groupId) return names;
        if (groupId === UNGROUPED) {
            const inAny = new Set(S.groups.flatMap(g => g.scenarioIds));
            return names.filter(n => { const id = S.byName.get(n); return !(id && inAny.has(id)); });
        }
        const g = groupById(groupId);
        if (!g) return names;
        const present = new Set(names);
        return orderedNames(g).filter(n => present.has(n));    // grup sırası
    }

    function groupOptions(select, { all = "Tüm senaryolar", ungrouped = true, selected = "" } = {}) {
        select.innerHTML = "";
        const add = (value, text) => { const o = el("option", "", text); o.value = value; if (value === selected) o.selected = true; select.appendChild(o); };
        add("", all);
        for (const g of S.groups) add(g.id, `${g.name} (${g.scenarioIds.length})`);
        if (ungrouped) add(UNGROUPED, "Grupsuz senaryolar");
    }

    // ── Senaryo listesi: satır etiketleri ──
    function fillChips(container, name) {
        container.innerHTML = "";
        const gs = groupsOfName(name);
        gs.slice(0, 3).forEach(g => {
            const chip = el("button", "sg-chip text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 mr-1 hover:bg-indigo-500/20 transition", g.name);
            chip.type = "button"; chip.title = "Grubun içeriğini göster";
            chip.addEventListener("click", (e) => { e.stopPropagation(); openContent(g.id); });   // satır açılıp kapanmasın
            container.appendChild(chip);
        });
        if (gs.length > 3) container.appendChild(el("span", "text-[10px] text-zinc-500", `+${gs.length - 3}`));
    }

    // ── Senaryo listesi araç çubuğu ──
    function selectedNames() { return [...document.querySelectorAll(".sg-row-check:checked")].map(c => c.value); }

    function renderScenarioToolbar() {
        const box = document.getElementById("scenario-group-toolbar");
        if (!box) return;
        box.innerHTML = "";
        if (S.error) { box.appendChild(el("span", "text-[11px] text-amber-400", `Gruplar kullanılamıyor: ${S.error}`)); return; }

        const filter = el("select", SELECT); filter.id = "sg-filter"; filter.setAttribute("aria-label", "Gruba göre filtrele");
        groupOptions(filter, { selected: S.filterId });
        filter.addEventListener("change", () => { S.filterId = filter.value; S.hooks.onChange(); });
        const manage = el("button", BTN, "Grupları Yönet"); manage.type = "button"; manage.id = "sg-manage";
        manage.addEventListener("click", () => openManager());
        box.append(el("span", "text-[10px] uppercase tracking-wider text-zinc-500 font-semibold", "Grup"), filter, manage);

        // Bir grup seçiliyken: o gruba senaryo ekleme ve grubun içeriği (ayrı bölüm)
        const active = S.filterId && S.filterId !== UNGROUPED ? groupById(S.filterId) : null;
        if (active) {
            const sec = el("div", "flex flex-wrap items-center gap-2 pl-2 ml-1 border-l border-[rgba(255,255,255,0.08)]"); sec.id = "sg-group-actions";
            const addSel = el("select", SELECT); addSel.id = "sg-add-select"; addSel.setAttribute("aria-label", "Gruba senaryo ekle");
            const candidates = S.scenarios.filter(sc => !active.scenarioIds.includes(sc.id));
            const ph = el("option", "", candidates.length ? "Senaryo ekle…" : "Eklenecek senaryo kalmadı"); ph.value = ""; addSel.appendChild(ph);
            for (const sc of candidates) { const o = el("option", "", sc.name); o.value = sc.name; addSel.appendChild(o); }
            const addBtn = el("button", BTN_PRIMARY, "Ekle"); addBtn.type = "button"; addBtn.id = "sg-add";
            addBtn.addEventListener("click", async () => {
                if (!addSel.value) return;
                try { await call("/members", { groupId: active.id, add: [addSel.value] }); S.hooks.onChange(); } catch (err) { say(err.message); }
            });
            const content = el("button", BTN, `Grup içeriği (${active.scenarioIds.length})`); content.type = "button"; content.id = "sg-open-content";
            content.addEventListener("click", () => openContent(active.id));
            sec.append(addSel, addBtn, content);
            box.appendChild(sec);
        }

        const bulk = el("div", "flex flex-wrap items-center gap-2 ml-2"); bulk.id = "sg-bulk"; bulk.style.display = "none";   // Tailwind flex, hidden özelliğini ezer: display ile gizlenir
        const count = el("span", "text-[11px] text-zinc-400"); count.id = "sg-bulk-count";
        const target = el("select", SELECT); target.id = "sg-bulk-target";
        const addBtn = el("button", BTN_PRIMARY, "Gruba ekle"); addBtn.type = "button"; addBtn.id = "sg-bulk-add";
        const removeBtn = el("button", BTN, "Bu gruptan çıkar"); removeBtn.type = "button"; removeBtn.id = "sg-bulk-remove";
        const clearBtn = el("button", BTN, "Seçimi temizle"); clearBtn.type = "button";
        const fillTarget = () => {
            target.innerHTML = "";
            for (const g of S.groups) { const o = el("option", "", g.name); o.value = g.id; target.appendChild(o); }
            const n = el("option", "", "＋ Yeni grup oluştur…"); n.value = NEW_GROUP; target.appendChild(n);
            if (S.filterId && groupById(S.filterId)) target.value = S.filterId;
        };
        fillTarget();
        removeBtn.hidden = !(S.filterId && groupById(S.filterId));
        bulk.append(count, target, addBtn, removeBtn, clearBtn);
        box.appendChild(bulk);

        addBtn.addEventListener("click", async () => {
            const names = selectedNames(); if (!names.length) return;
            try {
                if (target.value === NEW_GROUP) {
                    const name = (window.prompt("Yeni grup adı:") || "").trim(); if (!name) return;
                    await call("/create", { name, scenarioNames: names });
                    say(`"${name}" grubu oluşturuldu (${names.length} senaryo).`);
                } else {
                    await call("/members", { groupId: target.value, add: names });
                    say(`${names.length} senaryo gruba eklendi.`);
                }
                S.hooks.onChange();
            } catch (err) { say(err.message); }
        });
        removeBtn.addEventListener("click", async () => {
            const names = selectedNames(); if (!names.length || !S.filterId) return;
            try { await call("/members", { groupId: S.filterId, remove: names }); say(`${names.length} senaryo gruptan çıkarıldı.`); S.hooks.onChange(); }
            catch (err) { say(err.message); }
        });
        clearBtn.addEventListener("click", () => { document.querySelectorAll(".sg-row-check").forEach(c => { c.checked = false; }); updateBulk(); });
        updateBulk();
    }

    function updateBulk() {
        const bulk = document.getElementById("sg-bulk"); if (!bulk) return;
        const n = selectedNames().length;
        bulk.style.display = n === 0 ? "none" : "";
        const c = document.getElementById("sg-bulk-count"); if (c) c.textContent = `${n} senaryo seçili`;
    }
    document.addEventListener("change", (e) => { if (e.target?.classList?.contains("sg-row-check")) updateBulk(); });

    // ── Toplu test ekranı ──
    function renderBatchBar() {
        const box = document.getElementById("batch-group-bar");
        const th = document.getElementById("sg-batch-th");
        if (th) th.hidden = !(S.batchId && groupById(S.batchId));
        if (!box) return;
        box.innerHTML = "";
        if (S.error) { box.appendChild(el("span", "text-[11px] text-amber-400", `Gruplar kullanılamıyor: ${S.error}`)); return; }
        const sel = el("select", SELECT); sel.id = "sg-batch-group"; sel.setAttribute("aria-label", "Gruba göre listele");
        groupOptions(sel, { selected: S.batchId });
        sel.addEventListener("change", () => { S.batchId = sel.value; S.hooks.reloadBatch(false); });
        const selectAll = el("button", BTN_PRIMARY, "Görünenleri seç (grup sırasıyla)"); selectAll.type = "button"; selectAll.id = "sg-batch-select-all";
        const clear = el("button", BTN, "Seçimi temizle"); clear.type = "button";
        const manage = el("button", BTN, "Grup sırasını düzenle"); manage.type = "button";
        manage.hidden = !(S.batchId && groupById(S.batchId));
        selectAll.addEventListener("click", () => {
            let names = [...document.querySelectorAll("#batch-list .batch-checkbox")].map(c => c.value);
            if (names.length > BATCH_LIMIT) { say(`Tek seferde en fazla ${BATCH_LIMIT} test kuyruğa alınabilir; ilk ${BATCH_LIMIT} senaryo seçildi.`); names = names.slice(0, BATCH_LIMIT); }
            S.hooks.setBatchSelection(names);
        });
        clear.addEventListener("click", () => S.hooks.setBatchSelection([]));
        manage.addEventListener("click", () => openContent(S.batchId));
        box.append(el("span", "text-[10px] uppercase tracking-wider text-zinc-500 font-semibold", "Grup"), sel, selectAll, clear, manage);
        if (S.batchId && groupById(S.batchId)) box.appendChild(el("span", "text-[11px] text-zinc-500", "Sıra: ↑ ↓ düğmeleriyle değiştirilir, toplu çalıştırma bu sırayı kullanır."));
    }

    /** Toplu test satırına "grup sırası" hücresi (yalnızca bir grup seçiliyken). */
    function batchRowExtra(name) {
        const g = S.batchId && groupById(S.batchId);
        if (!g) return null;
        const names = orderedNames(g);
        const i = names.indexOf(name);
        const td = el("td", "py-3 px-4 whitespace-nowrap");
        const mk = (label, aria, disabled, dir) => {
            const b = el("button", "px-2 py-0.5 text-xs rounded border border-[rgba(255,255,255,0.08)] text-zinc-300 hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed mr-1", label);
            b.type = "button"; b.setAttribute("aria-label", aria); b.disabled = disabled;
            b.addEventListener("click", () => moveMember(g.id, name, dir, true));
            return b;
        };
        td.append(mk("↑", "Yukarı taşı", i <= 0, -1), mk("↓", "Aşağı taşı", i < 0 || i >= names.length - 1, 1));
        return td;
    }

    async function moveMember(groupId, name, dir, fromBatch) {
        const g = groupById(groupId); if (!g) return;
        const names = orderedNames(g); const i = names.indexOf(name); const j = i + dir;
        if (i < 0 || j < 0 || j >= names.length) return;
        [names[i], names[j]] = [names[j], names[i]];
        try {
            await call("/reorder", { groupId, scenarioNames: names });
            if (fromBatch) S.hooks.reloadBatch(true); else renderContent();
        } catch (err) { say(err.message); await refresh(); if (fromBatch) S.hooks.reloadBatch(true); else renderContent(); }
    }

    // ── Grup yönetim penceresi: YALNIZCA grup oluştur / yeniden adlandır / sil ──
    let overlay = null, renameId = "";
    const drafts = { newName: "" };   // yeniden çizimde (örn. liste yenilenince) yazılmakta olan metin kaybolmasın

    function mkOverlay(id, label, z) {
        const o = el("div", `fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 ${z}`);
        o.id = id; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", label);
        document.body.appendChild(o);
        return o;
    }
    const shown = (o) => !!o && o.style.display !== "none";   // Tailwind flex, hidden özelliğini ezer: display ile gizlenir

    function openManager() {
        renameId = "";
        if (!overlay) {
            overlay = mkOverlay("sg-manager", "Senaryo grupları", "z-50");
            overlay.addEventListener("click", (e) => { if (e.target === overlay) closeManager(); });
        }
        overlay.style.display = "";   // sınıftaki flex geçerli
        renderManager();
        // Veri tazelenince yalnızca DEĞİŞTİYSE yeniden çizilir (kullanıcı tıklarken/yazarken arayüz altından kayıp gitmesin)
        const snapshotBefore = JSON.stringify([S.groups, S.scenarios]);
        refresh().then(() => { if (JSON.stringify([S.groups, S.scenarios]) !== snapshotBefore) renderManager(); });
    }

    function closeManager() { if (overlay) overlay.style.display = "none"; S.hooks.onChange(); }

    function panelShell(title, onClose) {
        const panel = el("div", "w-full max-w-xl max-h-full flex flex-col gap-4 bg-[#18181b] border border-[rgba(255,255,255,0.08)] p-6 rounded-2xl shadow-2xl");
        const head = el("div", "shrink-0 flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-3");
        head.appendChild(el("h3", "text-sm font-semibold text-white truncate", title));
        const close = el("button", "text-zinc-400 hover:text-white text-lg leading-none px-2", "×"); close.type = "button"; close.setAttribute("aria-label", "Kapat");
        close.addEventListener("click", onClose); head.appendChild(close);
        panel.appendChild(head);
        return panel;
    }

    function renderManager() {
        if (!shown(overlay)) return;
        overlay.innerHTML = "";
        const panel = panelShell(`Senaryo Grupları · ${ctx().type === "SECURITY" ? "Güvenlik" : "UI"}`, closeManager);
        if (S.error) { panel.appendChild(el("p", "text-xs text-amber-400", `Gruplar kullanılamıyor: ${S.error}`)); overlay.appendChild(panel); return; }

        // yeni grup
        const newRow = el("div", "shrink-0 flex gap-2");
        const newInput = el("input", `${INPUT} flex-1 min-w-0`); newInput.id = "sg-new-name"; newInput.maxLength = 60; newInput.placeholder = "Yeni grup adı"; newInput.value = drafts.newName;
        newInput.addEventListener("input", () => { drafts.newName = newInput.value; });
        const newBtn = el("button", BTN_PRIMARY, "Grup oluştur"); newBtn.type = "button"; newBtn.id = "sg-create";
        const create = async () => {
            const name = newInput.value.trim(); if (!name) return;
            try { await call("/create", { name }); drafts.newName = ""; say(`"${name}" grubu oluşturuldu.`); renderManager(); } catch (err) { say(err.message); }
        };
        newBtn.addEventListener("click", create);
        newInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); create(); } });
        newRow.append(newInput, newBtn);
        panel.appendChild(newRow);

        // grup listesi
        const list = el("div", "flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"); list.id = "sg-group-list";
        if (!S.groups.length) list.appendChild(el("p", "text-xs text-zinc-500", "Henüz grup yok. Yukarıdan ilk grubunuzu oluşturun."));
        else list.appendChild(el("p", "text-[10px] text-zinc-500", "Bir grubun adına tıklayarak içindeki senaryoları görebilirsiniz."));
        for (const g of S.groups) {
            const row = el("div", "flex items-center gap-2 text-xs bg-[#09090b] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2"); row.dataset.groupId = g.id;
            if (renameId === g.id) {
                const input = el("input", `${INPUT} flex-1 min-w-0`); input.id = "sg-rename-input"; input.value = g.name; input.maxLength = 60;
                const save = el("button", BTN_PRIMARY, "Kaydet"); save.type = "button"; save.id = "sg-rename";
                const cancel = el("button", BTN, "İptal"); cancel.type = "button";
                const commit = async () => {
                    const name = input.value.trim();
                    if (!name || name === g.name) { renameId = ""; renderManager(); return; }
                    try { await call("/rename", { groupId: g.id, name }); renameId = ""; say("Grup adı güncellendi."); renderManager(); } catch (err) { say(err.message); }
                };
                save.addEventListener("click", commit);
                input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape") { renameId = ""; renderManager(); } });
                cancel.addEventListener("click", () => { renameId = ""; renderManager(); });
                row.append(input, save, cancel);
                setTimeout(() => input.focus(), 0);
            } else {
                const open = el("button", "sg-open flex-1 min-w-0 text-left text-white hover:text-[#3b82f6] truncate transition"); open.type = "button";
                open.append(el("span", "font-medium", g.name), el("span", "ml-1.5 text-zinc-500", `(${g.scenarioIds.length})`));
                open.addEventListener("click", () => openContent(g.id));
                const ren = el("button", `sg-rename-btn ${BTN}`, "Adı değiştir"); ren.type = "button";
                ren.addEventListener("click", () => { renameId = g.id; renderManager(); });
                const del = el("button", "sg-delete-btn text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition", "Sil"); del.type = "button";
                del.addEventListener("click", async () => {
                    if (!window.confirm(`"${g.name}" grubunu silmek istediğinize emin misiniz?\n\nGruptaki senaryolar SİLİNMEZ, yalnızca grup kaldırılır.`)) return;
                    try { await call("/delete", { groupId: g.id }); say("Grup silindi (senaryolar silinmedi)."); renderManager(); } catch (err) { say(err.message); }
                });
                row.append(open, ren, del);
            }
            list.appendChild(row);
        }
        panel.appendChild(list);
        overlay.appendChild(panel);
    }

    // ── Grup içeriği penceresi: bir grubun senaryoları (çalışma sırasıyla), ↑ ↓ ile sıralama, ✕ ile gruptan çıkarma ──
    let contentOverlay = null, contentGroupId = "";

    function openContent(groupId) {
        contentGroupId = groupId;
        if (!contentOverlay) {
            contentOverlay = mkOverlay("sg-content", "Grup içeriği", "z-[60]");
            contentOverlay.addEventListener("click", (e) => { if (e.target === contentOverlay) closeContent(); });
        }
        contentOverlay.style.display = "";
        renderContent();
        const snapshotBefore = JSON.stringify([S.groups, S.scenarios]);
        refresh().then(() => { if (JSON.stringify([S.groups, S.scenarios]) !== snapshotBefore) renderContent(); });
    }

    function closeContent() {
        if (contentOverlay) contentOverlay.style.display = "none";
        if (shown(overlay)) renderManager(); else S.hooks.onChange();   // yönetim penceresi açıksa sayıları tazele, değilse listeleri yenile
    }

    function renderContent() {
        if (!shown(contentOverlay)) return;
        contentOverlay.innerHTML = "";
        const g = groupById(contentGroupId);
        const names = g ? orderedNames(g) : [];
        const panel = panelShell(g ? `${g.name} · ${names.length} senaryo` : "Grup bulunamadı", closeContent);
        if (!g) { panel.appendChild(el("p", "text-xs text-zinc-500", "Bu grup artık yok.")); contentOverlay.appendChild(panel); return; }

        const members = el("div", "flex-1 min-h-0 overflow-y-auto space-y-1 pr-1"); members.id = "sg-members";
        members.appendChild(el("p", "text-[10px] uppercase tracking-wider text-zinc-500 font-semibold", "Çalışma sırası"));
        if (!names.length) members.appendChild(el("p", "text-xs text-zinc-500", "Bu grupta henüz senaryo yok. Senaryo listesinde bu grubu seçip \"Senaryo ekle\" ile ekleyebilirsiniz."));
        names.forEach((n, i) => {
            const row = el("div", "flex items-center gap-2 text-xs bg-[#09090b] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2"); row.dataset.name = n;
            row.append(el("span", "font-mono text-zinc-500 w-6", String(i + 1).padStart(2, "0")), el("span", "flex-1 text-white truncate", n));
            const mk = (label, aria, disabled, fn) => { const b = el("button", "px-2 py-0.5 rounded border border-[rgba(255,255,255,0.08)] text-zinc-300 hover:bg-[#27272a] disabled:opacity-30 disabled:cursor-not-allowed", label); b.type = "button"; b.setAttribute("aria-label", aria); b.disabled = disabled; b.addEventListener("click", fn); return b; };
            row.append(
                mk("↑", "Yukarı taşı", i === 0, () => moveMember(g.id, n, -1, false)),
                mk("↓", "Aşağı taşı", i === names.length - 1, () => moveMember(g.id, n, 1, false)),
                mk("✕", "Gruptan çıkar", false, async () => { try { await call("/members", { groupId: g.id, remove: [n] }); renderContent(); } catch (err) { say(err.message); } }),
            );
            members.appendChild(row);
        });
        panel.append(members, el("p", "shrink-0 text-[10px] text-zinc-500", "Toplu çalıştırma bu sırayı kullanır."));
        contentOverlay.appendChild(panel);
    }

    // ── Senaryo formu: "Gruplar" alanı ──
    async function mountFormField(container, scenarioName) {
        if (!container) return;
        container.innerHTML = "";
        await refresh();
        S.formEditing = !!scenarioName;
        const sid = scenarioName ? S.byName.get(scenarioName) : null;
        S.formSelected = new Set(sid ? S.groups.filter(g => g.scenarioIds.includes(sid)).map(g => g.id) : (S.filterId && groupById(S.filterId) ? [S.filterId] : []));
        S.formInitial = new Set(S.formSelected);

        container.appendChild(el("label", "block text-[10px] font-medium text-[#71717a] uppercase tracking-wider mb-1.5", "Gruplar (isteğe bağlı)"));
        if (S.error) { container.appendChild(el("p", "text-[11px] text-amber-400", `Gruplar kullanılamıyor: ${S.error}`)); return; }
        const chips = el("div", "flex flex-wrap gap-2 mb-2"); chips.id = "sg-form-chips";
        const draw = () => {
            chips.innerHTML = "";
            if (!S.groups.length) chips.appendChild(el("span", "text-[11px] text-zinc-500", "Henüz grup yok; aşağıdan oluşturabilirsiniz."));
            for (const g of S.groups) {
                const lab = el("label", "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#27272a]/40 text-zinc-300 cursor-pointer");
                const cb = el("input", "w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-800 text-[#3b82f6] focus:ring-0"); cb.type = "checkbox"; cb.value = g.id; cb.checked = S.formSelected.has(g.id);
                cb.addEventListener("change", () => { cb.checked ? S.formSelected.add(g.id) : S.formSelected.delete(g.id); });
                lab.append(cb, el("span", "", g.name)); chips.appendChild(lab);
            }
        };
        draw();
        const row = el("div", "flex gap-2");
        const input = el("input", `${INPUT} flex-1`); input.type = "text"; input.maxLength = 60; input.placeholder = "Yeni grup adı"; input.id = "sg-form-new";
        const btn = el("button", BTN, "Grup oluştur"); btn.type = "button"; btn.id = "sg-form-create";
        const make = async () => {
            const name = input.value.trim(); if (!name) return;
            try { const j = await call("/create", { name }); S.formSelected.add(j.groupId); input.value = ""; draw(); } catch (err) { say(err.message); }
        };
        btn.addEventListener("click", make);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); make(); } });   // Enter senaryo formunu göndermesin
        row.append(input, btn);
        container.append(chips, row);
    }

    /** Senaryo kaydedildikten sonra çağrılır; seçim değiştiyse (veya yeni senaryoda seçim varsa) üyelikleri günceller. */
    async function assignAfterSave(scenarioName) {
        if (S.error) return false;
        const a = [...S.formSelected].sort().join(","), b = [...S.formInitial].sort().join(",");
        if (a === b && (S.formEditing || !a)) return false;
        await call("/assign", { scenarioName, groupIds: [...S.formSelected] });
        return true;
    }

    window.ScenarioGroups = {
        init(hooks) { S.hooks = hooks; },
        refresh, fillChips, filterNames, renderScenarioToolbar, renderBatchBar, batchRowExtra, mountFormField, assignAfterSave, openManager, openContent, updateBulk,
        get filterId() { return S.filterId; },
        get batchId() { return S.batchId; },
        get ready() { return !S.error; },
    };
})();
