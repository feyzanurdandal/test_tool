// ─── API İSTEMCİSİ ───
// Oturum artık httpOnly çerezde tutulur; JavaScript token'a hiç erişmez.
// Tüm /api isteklerine CSRF başlığı eklenir ve oturum düşerse giriş ekranına dönülür.
(function () {
    "use strict";

    const nativeFetch = window.fetch.bind(window);
    const SESSION_EXEMPT = ["/api/auth/login", "/api/auth/me", "/api/auth/logout"];

    function isApiUrl(input) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        try {
            const parsed = new URL(url, window.location.origin);
            return parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/") ? parsed.pathname : null;
        } catch {
            return null;
        }
    }

    window.fetch = async function (input, init = {}) {
        const apiPath = isApiUrl(input);
        if (!apiPath) return nativeFetch(input, init);

        const headers = new Headers(init.headers || {});
        headers.set("X-Requested-With", "fetch");

        const response = await nativeFetch(input, { ...init, headers, credentials: "same-origin" });

        if (response.status === 401 && !SESSION_EXEMPT.includes(apiPath)) {
            window.dispatchEvent(new CustomEvent("session-expired"));
        }
        return response;
    };

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function readJson(res) {
        try {
            return await res.json();
        } catch {
            return {};
        }
    }

    /**
     * Kuyruktaki bir işin bitmesini bekler.
     * @param {string} jobId
     * @param {(job: object) => void} [onProgress]
     * @returns {Promise<{ ok: boolean, status?: string, message: string }>}
     */
    async function waitForJob(jobId, onProgress) {
        let delay = 1500;
        for (;;) {
            const res = await fetch(`/api/scenarios/jobs/${encodeURIComponent(jobId)}`);
            const data = await readJson(res);
            if (!res.ok || !data.job) {
                return { ok: false, message: data.error || "İş durumu alınamadı." };
            }

            const job = data.job;
            if (onProgress) onProgress(job);

            if (job.status === "completed") {
                const status = job.result && job.result.status;
                return { ok: status !== "FAILED", status, message: (job.result && job.result.message) || "" };
            }
            if (job.status === "failed") {
                return { ok: false, status: "FAILED", message: job.error || "Test çalıştırılamadı." };
            }

            await sleep(delay);
            delay = Math.min(delay + 500, 4000);
        }
    }

    /**
     * Tek bir senaryoyu kuyruğa ekler ve sonucunu bekler.
     */
    async function runScenario(scenarioName, projectName, onProgress) {
        const res = await fetch("/api/scenarios/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenarioName, projectName }),
        });
        const data = await readJson(res);
        if (!res.ok || !data.jobId) {
            return { ok: false, status: "FAILED", message: data.error || "Test kuyruğa eklenemedi." };
        }
        if (onProgress && data.job) onProgress(data.job);
        return waitForJob(data.jobId, onProgress);
    }

    /**
     * Birden fazla senaryoyu sırayla kuyruğa ekler.
     * @returns {Promise<{ ok: boolean, jobs?: Array<{jobId, scenarioName}>, skipped?: Array, message?: string }>}
     */
    async function runBatch(scenarioNames, projectName, testType) {
        const res = await fetch("/api/scenarios/run-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenarioNames, projectName, testType }),
        });
        const data = await readJson(res);
        if (!res.ok) return { ok: false, message: data.error || "Toplu test başlatılamadı.", skipped: data.skipped || [] };
        return { ok: true, jobs: data.jobs || [], skipped: data.skipped || [] };
    }

    function describeJob(job) {
        if (job.status === "queued") return job.position > 1 ? `Sırada (${job.position}.)` : "Sırada...";
        if (job.status === "running") return "Çalışıyor...";
        return "";
    }

    window.TestToolApi = { waitForJob, runScenario, runBatch, describeJob };
})();
