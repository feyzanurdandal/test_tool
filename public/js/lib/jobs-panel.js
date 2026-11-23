// ─── SIRADAKİ / ÇALIŞAN TESTLERİM ───
// Kullanıcının kuyruktaki ve çalışan testlerini gösterir (sıra no, tahmini bekleme) ve iptal
// etmeyi sağlar. Yalnızca aktif iş varken görünür. Sunucuya yük bindirmemek için iş yokken
// seyrek (15 sn), iş varken 4 sn aralıkla sorgular; sekme gizliyken sorgulamaz.
(function () {
    "use strict";
    let panel = null, list = null, note = null, cancelAll = null, timer = null, stopped = false;
    const busyCancel = new Set();

    function ensure() {
        if (panel) return;
        panel = document.createElement("aside");
        panel.className = "jobs-panel";
        panel.hidden = true;
        panel.setAttribute("aria-label", "Sıradaki ve çalışan testlerim");
        const h = document.createElement("h4");
        h.textContent = "Testlerim";
        list = document.createElement("ul");
        note = document.createElement("div");
        note.className = "jobs-note";
        cancelAll = document.createElement("button");
        cancelAll.type = "button";
        cancelAll.textContent = "Sıradakileri iptal et";
        cancelAll.hidden = true;
        cancelAll.style.marginTop = "6px";
        cancelAll.addEventListener("click", async () => {
            cancelAll.disabled = true;
            try { await fetch("/api/scenarios/jobs/cancel-queued", { method: "POST" }); }
            catch (e) { /* bir sonraki sorguda durum görünür */ }
            finally { cancelAll.disabled = false; schedule(300); }
        });
        panel.append(h, list, cancelAll, note);
        document.body.appendChild(panel);
    }

    function stateText(job) {
        if (job.status === "running") return "Çalışıyor";
        if (job.position > 0) {
            const eta = job.estimatedWaitSeconds ? ` · ~${Math.max(1, Math.round(job.estimatedWaitSeconds / 60))} dk` : "";
            return `Sırada (${job.position}.)${eta}`;
        }
        return "Sırada";
    }

    function render(jobs, queue) {
        ensure();
        list.replaceChildren();
        panel.hidden = jobs.length === 0;
        const queuedCount = jobs.filter(j => j.status === "queued").length;
        cancelAll.hidden = queuedCount < 2;
        cancelAll.textContent = `Sıradakileri iptal et (${queuedCount})`;
        for (const job of jobs) {
            const li = document.createElement("li");
            const name = document.createElement("span");
            name.className = "jobs-name";
            name.textContent = (job.kind === "batch" ? "[toplu] " : "") + (job.scenarioName || "Test");
            name.title = `${job.projectName || ""} / ${job.scenarioName || ""}`;
            const state = document.createElement("span");
            state.className = "jobs-state";
            state.textContent = stateText(job);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = "İptal";
            btn.disabled = busyCancel.has(job.id);
            btn.addEventListener("click", async () => {
                busyCancel.add(job.id);
                btn.disabled = true;
                try { await fetch(`/api/scenarios/jobs/${encodeURIComponent(job.id)}/cancel`, { method: "POST" }); }
                catch (e) { /* ağ hatası: bir sonraki sorguda durum görünür */ }
                finally { busyCancel.delete(job.id); schedule(500); }
            });
            li.append(name, state, btn);
            list.appendChild(li);
        }
        note.textContent = queue ? `Sistem: ${queue.running}/${queue.concurrency} test çalışıyor, ${queue.queued} sırada.` : "";
    }

    async function poll() {
        timer = null;
        if (stopped) return;
        if (document.hidden) return schedule(15000);
        let active = false;
        try {
            const res = await fetch("/api/scenarios/jobs");
            if (res.status === 401) return;                 // oturum yok: giriş yapılınca 'jobs-changed' ile yeniden başlar
            const data = await res.json();
            if (data && data.success) { render(data.jobs || [], data.queue); active = (data.jobs || []).length > 0; }
        } catch (e) { /* geçici ağ hatası */ }
        schedule(active ? 4000 : 15000);
    }

    function schedule(ms) {
        if (stopped) return;
        clearTimeout(timer);
        timer = setTimeout(poll, ms);
    }

    window.addEventListener("session-expired", () => { stopped = true; clearTimeout(timer); if (panel) panel.hidden = true; });
    window.addEventListener("jobs-changed", () => { stopped = false; schedule(300); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(500); });
    window.JobsPanel = {
        refresh: () => { stopped = false; schedule(200); },
        stop: () => { stopped = true; clearTimeout(timer); if (panel) panel.hidden = true; },
    };
})();
