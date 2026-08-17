document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();

    // ─── DOM ELEMANLARI ───
    const loginView = document.getElementById("login-view");
    const appView = document.getElementById("app-view");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const userBadge = document.getElementById("user-badge");
    const logoutBtn = document.getElementById("logout-btn");
    const projectDropdown = document.getElementById("project-dropdown");
    const currentProjectLabels = document.querySelectorAll(".current-project-label");
    const navButtons = document.querySelectorAll(".nav-btn");
    const views = document.querySelectorAll(".view-content");

    // Modaller
    const projectModal = document.getElementById("project-modal");
    const addProjectBtn = document.getElementById("add-project-btn");
    const closeProjectModal = document.getElementById("close-project-modal");
    const saveProjectBtn = document.getElementById("save-project-btn");
    const newProjectNameInput = document.getElementById("new-project-name");
    const projectErrorKeywordsInput = document.getElementById("project-error-keywords");
    const projectModalTitle = document.getElementById("project-modal-title");

    const scenarioModal = document.getElementById("scenario-modal");
    const openNewScenarioBtn = document.getElementById("open-new-scenario-btn");
    const closeScenarioModal = document.getElementById("close-scenario-modal");
    const cancelScenarioBtn = document.getElementById("cancel-scenario-btn");
    const scenarioForm = document.getElementById("scenario-form");
    const stepsContainer = document.getElementById("steps-container");
    const addStepFieldBtn = document.getElementById("add-step-field-btn");
    const expectedOutcomeContainer = document.getElementById("expected-outcome-container");
    const expectedOutcomeSelect = document.getElementById("new-scenario-expected-outcome");

    // Durum Değişkenleri
    let currentProject = "";
    let currentTestType = "UI"; // 'UI' | 'SECURITY'
    let batchQueue = [];
    let cachedAllProjects = [];
    let cachedProjectDetails = []; // 💡 Projelerin detayları (hata kelimeleri vb.)
    let globalEditUserId = "";
    let globalEditScenarioName = "";
    let globalEditProjectOldName = ""; // Proje düzenleme modu için

    // XSS Kaçış Fonksiyonu
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ─── GLOBAL PROJE SİLME FONKSİYONU ───
    window.deleteProject = async function(projectName) {
        if (!projectName || projectName === 'Varsayılan Proje') {
            alert("Varsayılan proje silinemez!");
            return;
        }

        const confirmDelete = confirm(`"${projectName}" projesini silmek istediğinize emin misiniz?\n\nBu işlem tüm kullanıcıların bu projeye erişimini kaldıracaktır!`);
        if (!confirmDelete) return;

        try {
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            const response = await fetch('/api/scenarios/projects/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Token': userSession.token || ""
                },
                body: JSON.stringify({ projectName: projectName })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert(result.message);
                currentProject = "";
                await loadProjects();
            } else {
                alert(`Hata: ${result.error || 'Proje silinemedi.'}`);
            }
        } catch (err) {
            console.error("Proje silme hatası:", err);
            alert("Sunucuyla iletişim kurulurken bir hata oluştu.");
        }
    };

    // ─── GLOBAL PROJE DÜZENLEME FONKSİYONU (Modal ile) ───
    window.editProject = function(oldProjectName) {
        if (!oldProjectName) return;

        const projDetail = cachedProjectDetails.find(p => p.proje_adi === oldProjectName) || {};
        
        globalEditProjectOldName = oldProjectName;
        if (projectModalTitle) projectModalTitle.textContent = `Projeyi Düzenle: ${oldProjectName}`;
        if (newProjectNameInput) newProjectNameInput.value = oldProjectName;
        if (projectErrorKeywordsInput) projectErrorKeywordsInput.value = projDetail.hata_anahtar_kelimeleri || "";
        if (saveProjectBtn) saveProjectBtn.textContent = "Değişiklikleri Kaydet";

        if (projectModal) projectModal.classList.remove("hidden");
    };

    // ─── TOPLU TEST KUYRUĞUNU ADIM ADIM ÇALIŞTIRMA ETKİNLİĞİ ───
    const startBatchBtn = document.getElementById("start-batch-btn");
    if (startBatchBtn) {
        startBatchBtn.addEventListener("click", async () => {
            if (batchQueue.length === 0) return;

            const totalTests = batchQueue.length;
            const confirmBatch = confirm(`Seçtiğiniz ${totalTests} senaryo (${currentTestType}) sırasıyla canlı olarak çalıştırılacak.`);
            if (!confirmBatch) return;

            startBatchBtn.disabled = true;
            startBatchBtn.className = "bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm animate-pulse cursor-wait";
            
            const activeQueue = [...batchQueue];

            for (let i = 0; i < activeQueue.length; i++) {
                const scenarioName = activeQueue[i];
                const remainingCount = activeQueue.length - i; 

                startBatchBtn.textContent = `Çalışacak Test Sayısı: ${remainingCount}...`;

                const rows = document.querySelectorAll("#batch-list tr");
                
                rows.forEach(row => {
                    const checkbox = row.querySelector(".batch-checkbox");
                    if (checkbox && checkbox.value === scenarioName) {
                        const targetOrderCell = row.querySelector(".batch-order-cell");
                        row.className = "border-b border-amber-500/30 bg-amber-500/5 transition h-12";
                        if (targetOrderCell) {
                            targetOrderCell.innerHTML = `<span class="text-amber-400 animate-pulse font-bold">Çalışıyor...</span>`;
                        }
                    }
                });

                try {
                    const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

                    const res = await fetch("/api/scenarios/run", {
                        method: "POST",
                        headers: { 
                            "Content-Type": "application/json",
                            "X-User-Token": userSession.token || ""
                        },
                        body: JSON.stringify({
                            scenarioName,
                            projectName: projectDropdown ? projectDropdown.value : currentProject
                        })
                    });

                    const result = await res.json();
                    
                    rows.forEach(row => {
                        const checkbox = row.querySelector(".batch-checkbox");
                        if (checkbox && checkbox.value === scenarioName) {
                            const orderCell = row.querySelector(".batch-order-cell");
                            if (res.ok && result.success && result.status !== "FAILED") {
                                row.className = "border-b border-emerald-500/20 bg-emerald-500/5 transition h-12";
                                if (orderCell) orderCell.innerHTML = `<span class="text-emerald-400 font-bold">Tamamlandı</span>`;
                            } else {
                                row.className = "border-b border-rose-500/20 bg-rose-500/5 transition h-12";
                                if (orderCell) orderCell.innerHTML = `<span class="text-rose-400 font-bold">Başarısız</span>`;
                            }
                        }
                    });

                } catch (err) {
                    console.error(`[Pipeline] ${scenarioName} hata verdi:`, err);
                    rows.forEach(row => {
                        const checkbox = row.querySelector(".batch-checkbox");
                        if (checkbox && checkbox.value === scenarioName) {
                            const orderCell = row.querySelector(".batch-order-cell");
                            row.className = "border-b border-rose-500/20 bg-rose-500/5 transition h-12";
                            if (orderCell) orderCell.innerHTML = `<span class="text-rose-400 font-bold">Bağlantı Hatası</span>`;
                        }
                    });
                }
            }

            alert("Seçilen tüm testler çalıştırıldı ve sonuçlar raporlara kaydedildi.");
            
            batchQueue = []; 
            updateBatchButtonState(); 
            await loadReports(); 
        });
    }

    // ─── 1. SENARYOLARI ÇEKİP TÜRKÇE ADIMLARI VE KARTLARI BASAN FONKSİYON ───
    async function loadScenarios() {
        if (!currentProject || currentProject === "Varsayılan Proje") {
            return;
        }

        const scenariosTable = document.getElementById("scenarios-table");
        const scenariosEmpty = document.getElementById("scenarios-empty");
        const scenariosList = document.getElementById("scenarios-list");
        const scenarioCountLabel = document.querySelector(".scenario-count");

        if (!scenariosTable || !scenariosEmpty || !scenariosList) return;

        try {
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

            const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(currentProject)}&testType=${encodeURIComponent(currentTestType)}`, {
                headers: {
                    "X-User-Token": userSession.token || ""
                }
            });
            const result = await res.json();

            if (result.scenarios && result.scenarios.length > 0) {
                scenariosEmpty.classList.add("hidden");
                scenariosTable.classList.remove("hidden");
                scenariosList.innerHTML = "";
                if (scenarioCountLabel) scenarioCountLabel.textContent = result.scenarios.length;

                result.scenarios.forEach((scenarioName, index) => {
                    const contentId = `scenario-content-${index}`;

                    const row = document.createElement("tr");
                    row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition cursor-pointer select-none";
                    row.setAttribute("data-target", contentId);
                    
                    row.innerHTML = `
                        <td class="py-3 px-4 font-mono text-zinc-500">${String(index + 1).padStart(2, '0')}</td>
                        <td class="py-3 px-4 font-medium text-white flex items-center gap-2">
                            <i data-lucide="chevron-right" class="chevron-icon-scen w-4 h-4 text-zinc-500 transition-transform duration-200"></i>
                            <span>${escapeHtml(scenarioName)}</span>
                        </td>
                        <td class="py-3 px-4 target-url-cell text-zinc-400 font-mono text-[11px]">-</td>
                        <td class="py-3 px-4 text-right" onclick="event.stopPropagation();">
                            <button class="run-single-btn text-[#3b82f6] hover:text-blue-400 font-medium transition mr-4" data-name="${scenarioName}">Testi Çalıştır</button>
                            <button class="edit-scenario-btn text-zinc-500 hover:text-amber-400 transition mr-3" data-name="${scenarioName}"><i data-lucide="edit-3" class="w-3.5 h-3.5 inline"></i></button>
                            <button class="delete-scenario-btn text-zinc-500 hover:text-red-400 transition" data-name="${scenarioName}"><i data-lucide="trash-2" class="w-3.5 h-3.5 inline"></i></button>
                        </td>
                    `;
                    scenariosList.appendChild(row);

                    const contentRow = document.createElement("tr");
                    contentRow.id = contentId;
                    contentRow.className = "hidden bg-[#09090b]/50";
                    contentRow.innerHTML = `
                        <td colspan="4" class="p-4 border-b border-[rgba(255,255,255,0.04)]">
                            <div class="space-y-3 bg-[#18181b]/40 p-4 rounded-xl border border-[rgba(255,255,255,0.06)]">
                                <div class="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
                                    <span class="text-[10px] uppercase font-bold tracking-wider text-zinc-500 flex items-center gap-1">
                                        <i data-lucide="list-todo" class="w-3.5 h-3.5 text-[#3b82f6]"></i> Yapay Zeka Test Adımları (Türkçe)
                                    </span>
                                    <span class="text-[10px] font-mono text-zinc-500 bg-[#27272a]/40 px-2 py-0.5 rounded">${currentTestType} Senaryosu</span>
                                </div>
                                <div class="steps-details-container space-y-2 text-xs text-zinc-300">
                                    <div class="animate-pulse text-zinc-500 text-[11px]">Buluttan adımlar yükleniyor...</div>
                                </div>
                            </div>
                        </td>
                    `;
                    scenariosList.appendChild(contentRow);

                    row.addEventListener("click", async () => {
                        const contentEl = document.getElementById(contentId);
                        const chevronIcon = row.querySelector(".chevron-icon-scen");
                        const isOpen = !contentEl.classList.contains("hidden");

                        if (isOpen) {
                            contentEl.classList.add("hidden");
                            if (chevronIcon) chevronIcon.style.transform = "rotate(0deg)";
                        } else {
                            contentEl.classList.remove("hidden");
                            if (chevronIcon) chevronIcon.style.transform = "rotate(90deg)";

                            const detailsContainer = contentRow.querySelector(".steps-details-container");
                            if (detailsContainer.getAttribute("data-loaded") !== "true") {
                                try {
                                    const contentRes = await fetch(`/api/scenarios/content?scenarioName=${encodeURIComponent(scenarioName)}&project=${encodeURIComponent(currentProject)}`, {
                                        headers: { "X-User-Token": userSession.token || "" }
                                    });
                                    const contentResult = await contentRes.json();

                                    if (contentResult.success) {
                                        const adimlarJson = contentResult.content || {};
                                        const contentTr = contentResult.contentTr;

                                        const targetUrl = adimlarJson.targetUrl || "";
                                        const urlCell = row.querySelector(".target-url-cell");
                                        if (urlCell && targetUrl) {
                                            urlCell.innerHTML = `
                                                <a href="${targetUrl}" target="_blank" onclick="event.stopPropagation();" class="text-[#3b82f6] hover:underline flex items-center gap-1 select-text">
                                                    ${targetUrl} <i data-lucide="external-link" class="w-3 h-3"></i>
                                                </a>
                                            `;
                                        }

                                        let stepsHtml = "";

                                        if (contentTr && contentTr.trim() !== "") {
                                            const trLines = contentTr.split('\n').filter(l => l.trim() !== "");
                                            trLines.forEach((line, stepIdx) => {
                                                stepsHtml += `
                                                    <div class="flex items-start gap-3 bg-[#27272a]/20 p-2.5 rounded-lg border border-[rgba(255,255,255,0.02)]">
                                                        <span class="font-mono text-[10px] text-zinc-500 mt-0.5">${String(stepIdx + 1).padStart(2, '0')}.</span>
                                                        <div class="flex-1">
                                                            <div class="font-medium text-zinc-200 select-text">${escapeHtml(line)}</div>
                                                        </div>
                                                        <span class="text-[9px] px-1.5 py-0.5 rounded border bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20 font-mono font-bold uppercase shrink-0">ADIM</span>
                                                    </div>
                                                `;
                                            });
                                        } else {
                                            stepsHtml = `<div class="text-amber-400/80 italic text-[11px] p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">Bu senaryo eski formatta oluşturulmuş, Türkçe adım önizlemesi bulunmuyor. Düzenleyip tekrar kaydederek güncelleyebilirsiniz.</div>`;
                                        }

                                        detailsContainer.innerHTML = stepsHtml;
                                        detailsContainer.setAttribute("data-loaded", "true");
                                        lucide.createIcons();
                                    } else {
                                        detailsContainer.innerHTML = `<div class="text-rose-400 text-[11px]">Adımlar buluttan getirilemedi!</div>`;
                                    }
                                } catch (err) {
                                    detailsContainer.innerHTML = `<div class="text-rose-400 text-[11px]">Bağlantı hatası oluştu!</div>`;
                                }
                            }
                        }
                    });
                });

                // A0. DÜZENLEME BUTONLARI
                document.querySelectorAll(".edit-scenario-btn").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown ? projectDropdown.value : currentProject;
                        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

                        try {
                            const contentRes = await fetch(`/api/scenarios/content?scenarioName=${encodeURIComponent(scenarioName)}&project=${encodeURIComponent(selectedProjName)}`, {
                                headers: { "X-User-Token": userSession.token || "" }
                            });
                            const contentResult = await contentRes.json();
                            if (!contentResult.success) {
                                alert("Senaryo içeriği getirilemedi, düzenlenemiyor.");
                                return;
                            }
                            
                            const adimlar = contentResult.content || {};
                            const contentTr = contentResult.contentTr;

                            globalEditScenarioName = scenarioName;

                            const modalTitle = document.getElementById("scenario-modal-title");
                            if (modalTitle) modalTitle.innerHTML = `<i data-lucide="edit-3" class="w-4 h-4 text-amber-400"></i> "${escapeHtml(scenarioName)}" Senaryosunu Düzenle`;
                            const submitLabel = document.getElementById("save-scenario-submit-btn-label");
                            if (submitLabel) submitLabel.textContent = "Güncelle ve Yeniden Çevir";

                            const nameInput = document.getElementById("new-scenario-name");
                            const urlInput = document.getElementById("new-scenario-url");
                            if (nameInput) nameInput.value = scenarioName;
                            if (urlInput) urlInput.value = adimlar.targetUrl || "";

                            if (expectedOutcomeSelect && contentResult.expectedOutcome) {
                                expectedOutcomeSelect.value = contentResult.expectedOutcome;
                            }

                            if (stepsContainer) {
                                stepsContainer.innerHTML = "";
                                if (contentTr && contentTr.trim() !== "") {
                                    const trLines = contentTr.split('\n').filter(l => l.trim() !== "");
                                    trLines.forEach(line => {
                                        stepsContainer.appendChild(createStepRow(line));
                                    });
                                } else if (adimlar.steps && adimlar.steps.length > 0) {
                                    adimlar.steps.forEach(s => {
                                        stepsContainer.appendChild(createStepRow(s.instruction || ""));
                                    });
                                } else {
                                    stepsContainer.appendChild(createStepRow(""));
                                }
                                reindexSteps();
                            }

                            lucide.createIcons();
                            if (scenarioModal) scenarioModal.classList.remove("hidden");
                        } catch (err) {
                            console.error("Senaryo düzenleme için içerik alınırken hata:", err);
                            alert("Bağlantı hatası! Senaryo düzenlenemiyor.");
                        }
                    });
                });

                // A. SİLME BUTONLARI
                document.querySelectorAll(".delete-scenario-btn").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown ? projectDropdown.value : currentProject;
                        
                        const confirmDelete = confirm(`"${scenarioName}" senaryosunu silmek istediğinize emin misiniz?`);
                        if (!confirmDelete) return;

                        try {
                            btn.disabled = true;
                            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

                            const res = await fetch("/api/scenarios/delete", {
                                method: "POST",
                                headers: { 
                                    "Content-Type": "application/json",
                                    "X-User-Token": userSession.token || ""
                                },
                                body: JSON.stringify({
                                    scenarioName,
                                    projectName: selectedProjName
                                })
                            });

                            const result = await res.json();
                            if (res.ok && result.success) {
                                alert("Senaryo başarıyla buluttan silindi!");
                                await loadScenarios(); 
                            } else {
                                alert(`Silinemedi: ${result.error || "Hata oluştu"}`);
                                btn.disabled = false;
                            }
                        } catch (err) {
                            console.error("Silme isteğinde hata verildi:", err);
                            btn.disabled = false;
                        }
                    });
                });

                // B. TEKİL TESTİ ÇALIŞTIR BUTONLARI
                document.querySelectorAll(".run-single-btn").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown ? projectDropdown.value : currentProject;

                        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

                        const originalHtml = btn.innerHTML;
                        btn.disabled = true;
                        btn.innerHTML = `<span class="text-amber-400 animate-pulse">Çalıştırılıyor...</span>`;

                        try {
                            const res = await fetch("/api/scenarios/run", {
                                method: "POST",
                                headers: { 
                                    "Content-Type": "application/json",
                                    "X-User-Token": userSession.token || ""
                                },
                                body: JSON.stringify({
                                    scenarioName,
                                    projectName: selectedProjName
                                })
                            });

                            const result = await res.json();
                            if (res.ok && result.success && result.status !== "FAILED") {
                                alert(`Başarılı: "${scenarioName}" testi tamamlandı! Sonuç: ${result.status || "SUCCESS"}`);
                            } else {
                                alert(`Test Başarısız / Beklenmeyen Sonuç: ${result.error || result.message || "Hata tespit edildi."}`);
                            }
                        } catch (err) {
                            console.error("Test çalıştırma isteğinde hata patladı:", err);
                            alert("Sunucu bağlantı hatası! Playwright çalıştırılamadı.");
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = originalHtml;
                            await loadReports();
                        }
                    });
                });

                lucide.createIcons();
            } else {
                if (scenarioCountLabel) scenarioCountLabel.textContent = "0";
                scenariosTable.classList.add("hidden");
                scenariosEmpty.classList.remove("hidden");
            }
        } catch (err) {
            console.error("Senaryolar listelenirken hata verdi:", err.message);
        }
    }

    // ─── RAPOR YÖNETİMİ ───
    let cachedReportsData = [];

    function parseLogsToSteps(logContent) {
        if (!logContent) return [];

        const lines = logContent.split('\n');
        const parsedSteps = [];
        
        let currentStepLogs = [];
        let currentActionTitle = "";
        let isStepFailed = false;

        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            if (trimmed.includes('❌ [HATA TESPİT EDİLDİ]') || trimmed.includes('CRITICAL_POPUP_ERROR') || /^Error:\s*ERROR:/i.test(trimmed)) {
                isStepFailed = true;
            }

            const isCacheHit = trimmed.includes('act cache hit') || trimmed.includes('category: "cache"');
            if (isCacheHit) {
                if (currentStepLogs.length > 0 && currentActionTitle) {
                    parsedSteps.push({
                        title: currentActionTitle,
                        status: isStepFailed ? 'FAILED' : 'PASSED',
                        logs: [...currentStepLogs]
                    });
                    currentStepLogs = [];
                    currentActionTitle = "";
                    isStepFailed = false;
                }
            }

            if (trimmed.includes('instruction:')) {
                const instrMatch = trimmed.match(/instruction:\s*"(.*)"/);
                if (instrMatch) {
                    const cleanInstr = instrMatch[1].replace(/\\"/g, '"').replace(/\\/g, '');
                    if (!currentActionTitle.includes('[')) {
                        currentActionTitle = `[CACHE] ${cleanInstr}`;
                    }
                }
            }

            if (trimmed.includes('"method":')) {
                const methodMatch = trimmed.match(/"method":\s*"(.*?)"/);
                if (methodMatch) {
                    const method = methodMatch[1].toUpperCase();
                    currentActionTitle = `[${method}] ` + currentActionTitle.replace(/^\[.*?\]\s*/, '');
                }
            }

            if (trimmed.includes('"description":')) {
                const descMatch = trimmed.match(/"description":\s*"(.*?)"/);
                if (descMatch) {
                    const cleanDesc = descMatch[1].replace(/\\"/g, '"').replace(/\\/g, '');
                    currentActionTitle += (currentActionTitle ? " - " : "") + cleanDesc;
                }
            }

            if (trimmed.includes('"extracted_data":')) {
                const extractMatch = trimmed.match(/"extracted_data":\s*"(.*?)"/);
                const val = extractMatch ? extractMatch[1].replace(/\\"/g, '"').replace(/\\/g, '') : "Ekrandan veri çekildi";
                currentActionTitle = `[EXTRACT] ${val}`;
            }

            currentStepLogs.push(trimmed);

            const isFinishStop = trimmed.includes('"finishReason": "stop"');
            const isNextStepStarting = (trimmed.includes('category: "aisdk"') || trimmed.includes('Starting extraction')) && currentActionTitle.startsWith('[CACHE]');

            if (isFinishStop || isNextStepStarting) {
                let logsToSave = [...currentStepLogs];
                if (isNextStepStarting) {
                    logsToSave.pop();
                }

                let finalTitle = currentActionTitle.trim() || "Yapay Zeka Otomasyon Adımı";

                parsedSteps.push({
                    title: finalTitle,
                    status: isStepFailed ? 'FAILED' : 'PASSED',
                    logs: logsToSave
                });

                currentStepLogs = isNextStepStarting ? [trimmed] : [];
                currentActionTitle = "";
                isStepFailed = false;
            }
        });

        if (currentStepLogs.length > 0) {
            let hasError = currentStepLogs.some(l => l.includes('❌') || l.includes('CRITICAL_POPUP_ERROR') || l.includes('1 failed'));
            const errorLine = currentStepLogs.find(l => l.includes('❌ [HATA TESPİT EDİLDİ]') || l.includes('CRITICAL_POPUP_ERROR'));
            
            let title = currentActionTitle || (hasError 
                ? `Hata Tespiti: ${errorLine ? errorLine.replace(/.*CRITICAL_POPUP_ERROR:\s*/i, '').replace(/.*❌ \[HATA TESPİT EDİLDİ\]:\s*/i, '') : 'Test Başarısız Oldu'}`
                : "Sistem ve Otomasyon Logları");

            parsedSteps.push({
                title: title,
                status: hasError ? 'FAILED' : 'PASSED',
                logs: currentStepLogs
            });
        }

        return parsedSteps;
    }

    async function loadReports() {
        const reportsEmpty = document.getElementById("reports-empty");
        const accordionContainer = document.getElementById("reports-list-accordion");

        if (!reportsEmpty || !accordionContainer) return;

        try {
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

            const res = await fetch(`/api/scenarios/reports/list?project=${encodeURIComponent(currentProject)}&testType=${encodeURIComponent(currentTestType)}`, {
                headers: { "X-User-Token": userSession.token || "" }
            });
            const result = await res.json();

            if (result.success && Array.isArray(result.reports)) {
                cachedReportsData = result.reports;
                updateReportStats(cachedReportsData);
                applyReportFilters();
            } else {
                cachedReportsData = [];
                updateReportStats([]);
                renderReportsList([]);
            }
        } catch (err) {
            console.error("Raporlar yüklenirken hata oluştu:", err);
            cachedReportsData = [];
            updateReportStats([]);
            renderReportsList([]);
        }
    }

    function updateReportStats(reports) {
        const totalEl = document.getElementById("stat-total-reports");
        const passedEl = document.getElementById("stat-passed-reports");
        const failedEl = document.getElementById("stat-failed-reports");
        const rateEl = document.getElementById("stat-rate-reports");

        if (!totalEl || !passedEl || !failedEl || !rateEl) return;

        const total = reports.length;
        const passed = reports.filter(r => String(r.status || '').toUpperCase() === 'SUCCESS' || String(r.status || '').toUpperCase() === 'PASSED').length;
        const failed = total - passed;
        const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

        totalEl.textContent = total;
        passedEl.textContent = passed;
        failedEl.textContent = failed;
        rateEl.textContent = `%${rate}`;
    }

    function applyReportFilters() {
        const searchInput = document.getElementById("report-search-input");
        const filterSelect = document.getElementById("report-filter-status");

        const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
        const statusFilter = filterSelect ? filterSelect.value : "ALL";

        let filtered = [...cachedReportsData];

        if (statusFilter !== "ALL") {
            filtered = filtered.filter(r => {
                const st = String(r.status || '').toUpperCase();
                if (statusFilter === "SUCCESS") return st === "SUCCESS" || st === "PASSED";
                if (statusFilter === "FAILED") return st !== "SUCCESS" && st !== "PASSED";
                return true;
            });
        }

        if (query) {
            filtered = filtered.filter(r => (r.scenario_name || '').toLowerCase().includes(query));
        }

        renderReportsList(filtered);
    }
    
    function renderReportsList(reports) {
        const reportsEmpty = document.getElementById("reports-empty");
        const accordionContainer = document.getElementById("reports-list-accordion");

        if (!reportsEmpty || !accordionContainer) return;

        accordionContainer.innerHTML = "";

        if (!reports || reports.length === 0) {
            reportsEmpty.classList.remove("hidden");
            accordionContainer.classList.add("hidden");
            return;
        }

        reportsEmpty.classList.add("hidden");
        accordionContainer.classList.remove("hidden");

        reports.forEach((report) => {
            try {
                const reportStatus = String(report.status || '').toUpperCase();
                const isSuccess = reportStatus === "SUCCESS" || reportStatus === "PASSED";
                const scenarioName = report.scenario_name || "Bilinmeyen Senaryo";
                const logContent = typeof report.log_content === 'string' ? report.log_content : "Log kaydı bulunmuyor.";

                let formattedDate = "Tarih Bilgisi Yok";
                if (report.created_at) {
                    try {
                        let dateStr = String(report.created_at).trim().replace(' ', 'T');
                        if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-')) dateStr += 'Z';
                        formattedDate = new Date(dateStr).toLocaleString(navigator.language || "tr-TR", {
                            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
                        });
                    } catch (e) { formattedDate = String(report.created_at); }
                }

                const parsedSteps = parseLogsToSteps(logContent);

                const card = document.createElement("div");
                card.className = "bg-[#18181b] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.2)] rounded-xl overflow-hidden transition-all duration-200 cursor-pointer select-none group";
                
                card.innerHTML = `
                    <div class="flex items-center justify-between p-4">
                        <div class="flex items-center gap-3">
                            <input type="checkbox" value="${report.id}" class="report-checkbox w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-[#3b82f6] focus:ring-0 cursor-pointer" onclick="event.stopPropagation();">
                            <div class="w-9 h-9 rounded-lg flex items-center justify-center ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
                                <i data-lucide="${isSuccess ? 'check-circle' : 'alert-triangle'}" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <h4 class="text-xs font-semibold text-white group-hover:text-[#3b82f6] transition-colors">${escapeHtml(scenarioName)}</h4>
                                <span class="text-[10px] text-zinc-500">${formattedDate} · ${parsedSteps.length} Adım</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-[10px] px-2.5 py-1 font-semibold rounded uppercase tracking-wider ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
                                ${isSuccess ? 'Başarılı' : 'Hata'}
                            </span>
                            <button class="delete-report-btn text-zinc-500 hover:text-red-400 transition p-1.5 rounded-lg hover:bg-red-500/10" data-id="${report.id}" onclick="event.stopPropagation();">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                            <div class="text-zinc-500 group-hover:text-white transition-colors pl-1">
                                <i data-lucide="external-link" class="w-4 h-4"></i>
                            </div>
                        </div>
                    </div>
                `;

                card.addEventListener("click", () => {
                    openReportModal(scenarioName, formattedDate, isSuccess, logContent, parsedSteps);
                });

                const deleteReportBtn = card.querySelector(".delete-report-btn");
                deleteReportBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const reportId = deleteReportBtn.getAttribute("data-id");

                    if (!confirm("Bu test raporunu kalıcı olarak silmek istediğinize emin misiniz?")) return;

                    const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

                    try {
                        deleteReportBtn.disabled = true;
                        const deleteRes = await fetch("/api/scenarios/reports/delete", {
                            method: "POST",
                            headers: { 
                                "Content-Type": "application/json",
                                "X-User-Token": userSession.token || ""
                            },
                            body: JSON.stringify({ id: reportId })
                        });

                        const deleteResult = await deleteRes.json();
                        if (deleteRes.ok && deleteResult.success) {
                            await loadReports();
                        } else {
                            alert(`Rapor silinemedi: ${deleteResult.error || "Hata oluştu"}`);
                            deleteReportBtn.disabled = false;
                        }
                    } catch (err) {
                        console.error("Rapor silinirken ağ hatası:", err);
                        deleteReportBtn.disabled = false;
                    }
                });

                accordionContainer.appendChild(card);
            } catch (singleErr) {
                console.error("Rapor kartı çizilirken hata:", singleErr);
            }
        });

        lucide.createIcons();
    }
    
    const searchInp = document.getElementById("report-search-input");
    const filterSel = document.getElementById("report-filter-status");
    const refreshBtn = document.getElementById("refresh-reports-btn");

    if (searchInp) searchInp.addEventListener("input", applyReportFilters);
    if (filterSel) filterSel.addEventListener("change", applyReportFilters);
    if (refreshBtn) refreshBtn.addEventListener("click", loadReports);
    
    // Toplu Testleri Yöneten Fonksiyon
    async function loadBatchScenarios() {
        const batchEmpty = document.getElementById("batch-empty");
        const batchTable = document.getElementById("batch-table");
        const batchList = document.getElementById("batch-list");

        if (!batchEmpty || !batchTable || !batchList) return;

        const activeProjectName = currentProject || (projectDropdown ? projectDropdown.value : "");

        if (!activeProjectName) {
            batchTable.classList.add("hidden");
            batchEmpty.classList.remove("hidden");
            return;
        }

        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

        try {
            const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(activeProjectName)}&testType=${encodeURIComponent(currentTestType)}`, {
                headers: {
                    "X-User-Token": userSession.token || ""
                }
            });
            const result = await res.json();

            batchQueue = [];
            updateBatchButtonState();

            if (result.scenarios && result.scenarios.length > 0) {
                batchEmpty.classList.add("hidden");
                batchTable.classList.remove("hidden");
                batchList.innerHTML = "";

                result.scenarios.forEach((scenarioName) => {
                    const row = document.createElement("tr");
                    row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition h-12";
                    row.innerHTML = `
                        <td class="py-3 px-4">
                            <input type="checkbox" value="${scenarioName}" class="batch-checkbox w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-[#3b82f6] focus:ring-0 cursor-pointer transition">
                        </td>
                        <td class="py-3 px-4 font-mono text-zinc-500 font-semibold batch-order-cell">-</td>
                        <td class="py-3 px-4 font-medium text-white">${escapeHtml(scenarioName)}</td>
                    `;

                    const checkbox = row.querySelector(".batch-checkbox");
                    checkbox.addEventListener("click", () => {
                        if (checkbox.checked) {
                            if (!batchQueue.includes(scenarioName)) batchQueue.push(scenarioName);
                        } else {
                            batchQueue = batchQueue.filter(name => name !== scenarioName);
                        }
                        updateBatchTableUI();
                    });

                    batchList.appendChild(row);
                });
            } else {
                batchTable.classList.add("hidden");
                batchEmpty.classList.remove("hidden");
            }
        } catch (err) {
            console.error("Toplu senaryolar yüklenirken hata:", err);
        }
    }

    function updateBatchTableUI() {
        const rows = document.querySelectorAll("#batch-list tr");
        rows.forEach(row => {
            const checkbox = row.querySelector(".batch-checkbox");
            const orderCell = row.querySelector(".batch-order-cell");
            const scenarioName = checkbox.value;

            const indexInQueue = batchQueue.indexOf(scenarioName);
            if (indexInQueue !== -1) {
                checkbox.checked = true;
                if (orderCell) {
                    orderCell.textContent = String(indexInQueue + 1).padStart(2, '0');
                    orderCell.className = "py-3 px-4 font-mono text-[#3b82f6] font-bold batch-order-cell";
                }
                row.className = "border-b border-[rgba(59,130,246,0.15)] bg-[#3b82f6]/5 transition h-12";
            } else {
                checkbox.checked = false;
                if (orderCell) {
                    orderCell.textContent = "-";
                    orderCell.className = "py-3 px-4 font-mono text-zinc-500 font-semibold batch-order-cell";
                }
                row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition h-12";
            }
        });

        updateBatchButtonState();
    }

    function updateBatchButtonState() {
        const startBatchBtn = document.getElementById("start-batch-btn");
        const selectedBatchCountLabel = document.getElementById("selected-batch-count");

        if (!startBatchBtn) return;

        const count = batchQueue.length;
        if (selectedBatchCountLabel) selectedBatchCountLabel.textContent = count;

        if (count > 0) {
            startBatchBtn.disabled = false;
            startBatchBtn.className = "bg-[#3b82f6] hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition border border-blue-600 flex items-center gap-1.5 shadow-sm cursor-pointer";
            startBatchBtn.textContent = `Seçilen Test Kuyruğunu Başlat (${count})`;
        } else {
            startBatchBtn.disabled = true;
            startBatchBtn.className = "bg-[#18181b] text-zinc-500 border border-[rgba(255,255,255,0.08)] text-xs font-medium px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-not-allowed";
            startBatchBtn.textContent = "Seçilen Test Kuyruğunu Başlat (0)";
        }
    }

    function renderProjectDeleteButton(userRole) {
        let btnContainer = document.getElementById("project-action-btns");
        
        if (!btnContainer && projectDropdown && projectDropdown.parentElement) {
            btnContainer = document.createElement("div");
            btnContainer.id = "project-action-btns";
            btnContainer.className = "hidden items-center gap-1.5 shrink-0 ml-2";

            const editBtn = document.createElement("button");
            editBtn.id = "edit-project-btn";
            editBtn.type = "button";
            editBtn.className = "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 font-medium cursor-pointer";
            editBtn.innerHTML = `<i data-lucide="edit-3" class="w-3.5 h-3.5 inline"></i> Düzenle`;
            editBtn.addEventListener("click", () => {
                window.editProject(projectDropdown.value);
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.id = "delete-project-btn";
            deleteBtn.type = "button";
            deleteBtn.className = "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 font-medium cursor-pointer";
            deleteBtn.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5 inline"></i> Sil`;
            deleteBtn.addEventListener("click", () => {
                window.deleteProject(projectDropdown.value);
            });

            btnContainer.appendChild(editBtn);
            btnContainer.appendChild(deleteBtn);
            projectDropdown.parentElement.appendChild(btnContainer);
        }

        if (btnContainer) {
            if (userRole === "ADMIN" && currentProject && currentProject !== "Varsayılan Proje") {
                btnContainer.classList.remove("hidden");
                btnContainer.classList.add("flex");
            } else {
                btnContainer.classList.add("hidden");
                btnContainer.classList.remove("flex");
            }
            lucide.createIcons();
        }
    }

    function updateViewHeadings() {
        const isSec = currentTestType === "SECURITY";

        const scenTitle = document.getElementById("scenarios-title-text");
        const scenBadge = document.getElementById("scenarios-badge-type");
        if (scenTitle) scenTitle.textContent = isSec ? "Siber Güvenlik Senaryoları" : "Test Senaryoları";
        if (scenBadge) {
            scenBadge.textContent = isSec ? "SECURITY" : "UI";
            scenBadge.className = isSec 
                ? "text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20";
        }

        const batchTitle = document.getElementById("batch-title-text");
        const batchBadge = document.getElementById("batch-badge-type");
        if (batchTitle) batchTitle.textContent = isSec ? "Siber Güvenlik Toplu Pipeline" : "Sıralı Toplu Test Pipeline Yapısı";
        if (batchBadge) {
            batchBadge.textContent = isSec ? "SECURITY" : "UI";
            batchBadge.className = isSec 
                ? "text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20";
        }

        const repTitle = document.getElementById("reports-title-text");
        const repBadge = document.getElementById("reports-badge-type");
        if (repTitle) repTitle.textContent = isSec ? "Siber Güvenlik Raporları" : "Test Raporları";
        if (repBadge) {
            repBadge.textContent = isSec ? "SECURITY" : "UI";
            repBadge.className = isSec 
                ? "text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20";
        }
    }

    function updateProjectLabels() {
        currentProjectLabels.forEach(lbl => lbl.textContent = currentProject);
        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
        renderProjectDeleteButton(userSession.role);
        updateViewHeadings();
        
        loadScenarios(); 
        loadReports();
        loadBatchScenarios();
    }

    async function loadProjects() {
        if (!projectDropdown) return;

        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

        try {
            const res = await fetch("/api/scenarios/projects/list", {
                headers: {
                    "X-User-Token": userSession.token || ""
                }
            });
            const result = await res.json();

            if (result.success && result.projects) {
                projectDropdown.innerHTML = "";
                cachedProjectDetails = result.projectDetails || [];

                result.projects.forEach((proj) => {
                    const opt = document.createElement("option");
                    opt.value = proj;
                    opt.textContent = proj;
                    projectDropdown.appendChild(opt);
                });

                if (result.projects.length > 0) {
                    if (!result.projects.includes(currentProject)) {
                        currentProject = result.projects[0];
                        projectDropdown.value = currentProject;
                    } else {
                        projectDropdown.value = currentProject;
                    }
                } else {
                    currentProject = "";
                }

                updateProjectLabels();
            }
        } catch (err) {
            console.error("Projeler yüklenirken hata oluştu:", err.message);
        }
    }

    async function showDashboard(user) {
        if (loginView) loginView.classList.add("hidden");
        if (appView) appView.classList.remove("hidden");
        if (userBadge) userBadge.textContent = `${user.username.toUpperCase()} (${user.role})`;

        const settingsNavBtn = document.querySelector('[data-target="view-settings"]');
        const usersNavBtn = document.getElementById("nav-users-btn");

        if (user.role === "PM") {
            if (addProjectBtn) addProjectBtn.classList.add("hidden");
            if (settingsNavBtn) settingsNavBtn.classList.add("hidden");
            if (usersNavBtn) usersNavBtn.classList.add("hidden");
        } else {
            if (addProjectBtn) addProjectBtn.classList.remove("hidden");
            if (settingsNavBtn) settingsNavBtn.classList.remove("hidden");
            if (usersNavBtn) usersNavBtn.classList.remove("hidden");
        }

        await loadProjects(); 

        navButtons.forEach(b => b.classList.remove("text-[#3b82f6]", "bg-[#3b82f6]/10", "text-amber-400", "bg-amber-500/10"));
        const scenarioNavBtn = document.querySelector('[data-target="view-scenarios"][data-test-type="UI"]');
        if (scenarioNavBtn) scenarioNavBtn.classList.add("text-[#3b82f6]", "bg-[#3b82f6]/10");

        currentTestType = "UI";
        views.forEach(v => v.classList.add("hidden"));
        const scenarioView = document.getElementById("view-scenarios");
        if (scenarioView) scenarioView.classList.remove("hidden");
        updateViewHeadings();
    }

    const savedUser = localStorage.getItem("test_user");
    if (savedUser) {
        showDashboard(JSON.parse(savedUser));
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (loginError) loginError.classList.add("hidden");
            const username = document.getElementById("login-username").value.trim();
            const password = document.getElementById("login-password").value;

            try {
                const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password })
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    const session = { username: result.username, role: result.role, token: result.token };
                    localStorage.setItem("test_user", JSON.stringify(session));
                    showDashboard(session);
                } else {
                    if (loginError) {
                        loginError.textContent = result.error || "Giriş başarısız!";
                        loginError.classList.remove("hidden");
                    }
                }
            } catch (err) {
                if (loginError) {
                    loginError.textContent = "Sunucu bağlantı hatası!";
                    loginError.classList.remove("hidden");
                }
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("test_user");
            if (appView) appView.classList.add("hidden");
            if (loginView) loginView.classList.remove("hidden");
            if (loginForm) loginForm.reset();
        });
    }

    // Önbellek Temizleme Buton Olayı
    const clearCacheBtn = document.getElementById("clear-cache-btn");
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener("click", async () => {
            const confirmClear = confirm("Sunucudaki geçici önbellek dosyaları temizlenecek ve ekrandaki veriler güncellenecek. Onaylıyor musunuz?");
            if (!confirmClear) return;

            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            const origHtml = clearCacheBtn.innerHTML;
            clearCacheBtn.disabled = true;
            clearCacheBtn.innerHTML = `<span class="text-amber-400 animate-pulse">Temizleniyor...</span>`;

            try {
                const res = await fetch("/api/scenarios/cache/clear", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-User-Token": userSession.token || ""
                    }
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    alert("🎉 " + result.message);
                    await loadProjects();
                } else {
                    alert(" Önbellek temizlenemedi: " + (result.error || "Bilinmeyen hata"));
                }
            } catch (err) {
                console.error("Cache temizleme isteğinde hata:", err);
                alert(" Sunucu bağlantı hatası!");
            } finally {
                clearCacheBtn.disabled = false;
                clearCacheBtn.innerHTML = origHtml;
                lucide.createIcons();
            }
        });
    }

    // ─── NAVİGASYON TIKLAMA OLAYLARI ───
    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            const targetViewId = btn.getAttribute("data-target");
            const testTypeAttr = btn.getAttribute("data-test-type");

            if (testTypeAttr) {
                currentTestType = testTypeAttr;
            }

            if (targetViewId === "view-settings" && userSession.role === "PM") {
                alert(" Bu alana erişim yetkiniz bulunmamaktadır!");
                return;
            }

            updateViewHeadings();

            if (targetViewId === "view-scenarios") {
                loadScenarios();
            }

            if (targetViewId === "view-batch") {
                loadBatchScenarios();
            }
            
            if (targetViewId === "view-reports") {
                loadReports();
            }

            navButtons.forEach(b => {
                b.classList.remove("text-[#3b82f6]", "bg-[#3b82f6]/10", "text-amber-400", "bg-amber-500/10");
                b.classList.add("text-zinc-400", "hover:bg-[#18181b]");
            });

            if (currentTestType === "SECURITY" && testTypeAttr) {
                btn.classList.add("text-amber-400", "bg-amber-500/10");
            } else {
                btn.classList.add("text-[#3b82f6]", "bg-[#3b82f6]/10");
            }
            btn.classList.remove("text-zinc-400", "hover:bg-[#18181b]");

            views.forEach(v => v.classList.add("hidden"));
            const targetEl = document.getElementById(targetViewId);
            if (targetEl) targetEl.classList.remove("hidden");
        });
    });

    if (addProjectBtn) {
        addProjectBtn.addEventListener("click", () => {
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            if (userSession.role === "PM") {
                alert(" Proje oluşturma yetkiniz bulunmamaktadır!");
                return;
            }
            globalEditProjectOldName = "";
            if (projectModalTitle) projectModalTitle.textContent = "Yeni Proje Oluştur";
            if (newProjectNameInput) newProjectNameInput.value = "";
            if (projectErrorKeywordsInput) projectErrorKeywordsInput.value = "";
            if (saveProjectBtn) saveProjectBtn.textContent = "Projeyi Kaydet";

            if (projectModal) projectModal.classList.remove("hidden");
            if (newProjectNameInput) newProjectNameInput.focus();
        });
    }

    if (closeProjectModal) {
        closeProjectModal.addEventListener("click", () => {
            if (projectModal) projectModal.classList.add("hidden");
        });
    }

    if (saveProjectBtn) {
        saveProjectBtn.addEventListener("click", async () => {
            const projectName = newProjectNameInput ? newProjectNameInput.value.trim() : "";
            const customErrorKeywords = projectErrorKeywordsInput ? projectErrorKeywordsInput.value.trim() : "";
            if (!projectName) return alert("Proje adı boş olamaz.");

            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            const isEdit = globalEditProjectOldName !== "";

            const endpoint = isEdit ? "/api/scenarios/projects/update" : "/api/scenarios/projects/create";
            const payload = isEdit 
                ? { oldProjectName: globalEditProjectOldName, newProjectName: projectName, customErrorKeywords }
                : { projectName, customErrorKeywords };

            try {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "X-User-Token": userSession.token || ""
                    },
                    body: JSON.stringify(payload)
                });

                const result = await res.json();
                if (result.success) {
                    alert(result.message || (isEdit ? "Proje güncellendi!" : "Proje oluşturuldu!"));
                    if (projectModal) projectModal.classList.add("hidden");
                    globalEditProjectOldName = "";
                    await loadProjects();
                    if (projectDropdown) projectDropdown.value = result.projectName || projectName;
                    currentProject = result.projectName || projectName;
                    updateProjectLabels();
                } else {
                    alert(result.error || "Proje kaydedilemedi.");
                }
            } catch (err) {
                console.error(err);
                alert("Sunucu bağlantı hatası!");
            }
        });
    }

    if (openNewScenarioBtn) {
        openNewScenarioBtn.addEventListener("click", () => {
            globalEditScenarioName = "";
            const isSec = currentTestType === "SECURITY";

            const modalTitle = document.getElementById("scenario-modal-title");
            if (modalTitle) {
                modalTitle.innerHTML = isSec 
                    ? `<i data-lucide="shield-alert" class="w-4 h-4 text-amber-400"></i> Yeni Siber Güvenlik Senaryosu (<span class="current-project-label"></span>)`
                    : `<i data-lucide="sparkles" class="w-4 h-4 text-[#3b82f6]"></i> Yeni UI Senaryosu (<span class="current-project-label"></span>)`;
            }

            const submitLabel = document.getElementById("save-scenario-submit-btn-label");
            if (submitLabel) submitLabel.textContent = "Kaydet ve Çevir";
            
            if (expectedOutcomeContainer) {
                if (isSec) {
                    expectedOutcomeContainer.classList.remove("hidden");
                } else {
                    expectedOutcomeContainer.classList.add("hidden");
                }
            }
            if (expectedOutcomeSelect) expectedOutcomeSelect.value = "SUCCESS_EXPECTED";

            updateProjectLabels();
            populateImportScenarioDropdown();

            if (scenarioForm) scenarioForm.reset();
            if (stepsContainer) {
                stepsContainer.innerHTML = "";
                stepsContainer.appendChild(createStepRow());
                reindexSteps();
            }
            lucide.createIcons();
            if (scenarioModal) scenarioModal.classList.remove("hidden");
        });
    }

    if (closeScenarioModal) closeScenarioModal.addEventListener("click", () => { globalEditScenarioName = ""; scenarioModal.classList.add("hidden"); });
    if (cancelScenarioBtn) cancelScenarioBtn.addEventListener("click", () => { globalEditScenarioName = ""; scenarioModal.classList.add("hidden"); });

    if (addStepFieldBtn) {
        addStepFieldBtn.addEventListener("click", () => {
            if (!stepsContainer) return;
            const newRow = createStepRow();
            stepsContainer.appendChild(newRow);
            reindexSteps();
            lucide.createIcons();
            stepsContainer.scrollTop = stepsContainer.scrollHeight;
            newRow.querySelector(".step-input").focus();
        });
    }

    const importStepsBtn = document.getElementById("import-scenario-steps-btn");
    if (importStepsBtn) {
        importStepsBtn.addEventListener("click", async () => {
            const importDropdown = document.getElementById("import-scenario-dropdown");
            const selectedScenarioToImport = importDropdown ? importDropdown.value : "";

            if (!selectedScenarioToImport) {
                alert("Lütfen önce içe aktarılacak bir senaryo seçin!");
                return;
            }

            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            const origText = importStepsBtn.innerHTML;
            importStepsBtn.disabled = true;
            importStepsBtn.innerHTML = `<span class="animate-pulse">Aktarılıyor...</span>`;

            try {
                const contentRes = await fetch(`/api/scenarios/content?scenarioName=${encodeURIComponent(selectedScenarioToImport)}&project=${encodeURIComponent(currentProject)}`, {
                    headers: { "X-User-Token": userSession.token || "" }
                });
                const contentResult = await contentRes.json();

                if (contentResult.success) {
                    const contentTr = contentResult.contentTr;
                    const adimlar = contentResult.content || {};
                    let stepsToImport = [];

                    if (contentTr && contentTr.trim() !== "") {
                        stepsToImport = contentTr.split('\n').filter(l => l.trim() !== "");
                    } else if (adimlar.steps) {
                        stepsToImport = adimlar.steps.map(s => s.instruction || "");
                    }

                    if (stepsToImport.length === 0) {
                        alert("Seçilen senaryoda adım bulunamadı.");
                        return;
                    }

                    if (stepsContainer.children.length === 1) {
                        const firstInput = stepsContainer.children[0].querySelector(".step-input");
                        if (firstInput && firstInput.value.trim() === "") {
                            stepsContainer.innerHTML = "";
                        }
                    }

                    stepsToImport.forEach(stepText => {
                        const stepRow = createStepRow(stepText);
                        stepsContainer.appendChild(stepRow);
                    });

                    reindexSteps();
                    lucide.createIcons();
                    alert(`"${selectedScenarioToImport}" senaryosunun ${stepsToImport.length} adımı başarıyla eklendi!`);
                } else {
                    alert("Senaryo adımları getirilemedi.");
                }
            } catch (err) {
                console.error("Adım içe aktarma hatası:", err);
                alert("Adımlar çekilirken bağlantı hatası oluştu.");
            } finally {
                importStepsBtn.disabled = false;
                importStepsBtn.innerHTML = origText;
            }
        });
    }

    async function populateImportScenarioDropdown() {
        const importDropdown = document.getElementById("import-scenario-dropdown");
        if (!importDropdown || !currentProject) return;

        importDropdown.innerHTML = `<option value="" disabled selected>İçe aktarılacak senaryoyu seçin...</option>`;
        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

        try {
            const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(currentProject)}&testType=${encodeURIComponent(currentTestType)}`, {
                headers: { "X-User-Token": userSession.token || "" }
            });
            const result = await res.json();

            if (result.scenarios && result.scenarios.length > 0) {
                result.scenarios.forEach(scenName => {
                    if (typeof globalEditScenarioName !== "undefined" && globalEditScenarioName === scenName) return;

                    const opt = document.createElement("option");
                    opt.value = scenName;
                    opt.textContent = scenName;
                    importDropdown.appendChild(opt);
                });
            }
        } catch (err) {
            console.error("İçe aktarılacak senaryolar listelenirken hata:", err);
        }
    }

    function createStepRow(value = "") {
        const stepRow = document.createElement("div");
        stepRow.className = "flex items-center gap-2 bg-[#27272a]/40 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)] animate-slide-in";
        
        stepRow.innerHTML = `
            <span class="step-number text-[10px] font-mono text-zinc-500 w-5 text-center">01.</span>
            <input type="text" required placeholder='Türkçe talimatı girin (Örn: "Giriş Yap" butonuna tıkla).' value="${escapeHtml(value)}" class="step-input flex-1 bg-transparent text-xs text-white outline-none">
            
            <button type="button" class="add-step-after-btn text-zinc-500 hover:text-[#3b82f6] transition p-1 rounded hover:bg-[#3b82f6]/10" title="Araya Adım Ekle">
                <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
            </button>

            <button type="button" class="remove-step-btn text-zinc-500 hover:text-red-400 transition p-1 rounded hover:bg-red-500/10" title="Adımı Sil">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
        `;

        stepRow.querySelector(".add-step-after-btn").addEventListener("click", () => {
            const newRow = createStepRow();
            stepRow.after(newRow);
            reindexSteps();
            lucide.createIcons();
            newRow.querySelector(".step-input").focus();
        });

        stepRow.querySelector(".remove-step-btn").addEventListener("click", () => {
            if (stepsContainer.children.length > 1) {
                stepRow.remove();
                reindexSteps();
            }
        });

        return stepRow;
    }    

    function reindexSteps() {
        if (!stepsContainer) return;
        const rows = Array.from(stepsContainer.children);
        rows.forEach((row, i) => {
            const index = i + 1;
            const numEl = row.querySelector(".step-number");
            if (numEl) numEl.textContent = index < 10 ? `0${index}.` : `${index}.`;

            const removeBtn = row.querySelector(".remove-step-btn");
            if (removeBtn) {
                if (rows.length === 1) {
                    removeBtn.classList.add("opacity-0", "pointer-events-none");
                } else {
                    removeBtn.classList.remove("opacity-0", "pointer-events-none");
                }
            }
        });
    }

    if (scenarioForm) {
        scenarioForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const scenarioNameInput = document.getElementById("new-scenario-name");
            const targetUrlInput = document.getElementById("new-scenario-url");
            
            const stepInputs = document.querySelectorAll(".step-input");
            const submitBtn = document.getElementById("save-scenario-submit-btn") || scenarioForm.querySelector('button[type="submit"]');

            const activeProjectName = projectDropdown ? projectDropdown.value : currentProject;
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

            const scenarioName = scenarioNameInput ? scenarioNameInput.value.trim() : "";
            const targetUrl = targetUrlInput ? targetUrlInput.value.trim() : "";
            
            const turkishInstructions = Array.from(stepInputs)
                .map(inp => inp.value.trim())
                .filter(val => val !== "")
                .join("\n");

            if (!scenarioName || !targetUrl || !turkishInstructions) {
                alert("Lütfen senaryo adı, hedef URL ve en az bir test adımı girin!");
                return;
            }

            const originalBtnText = submitBtn ? submitBtn.innerHTML : "";
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<span>Çevriliyor ve Kaydediliyor...</span>`;
            }

            const isEditMode = globalEditScenarioName !== "";
            const endpoint = isEditMode ? "/api/scenarios/update" : "/api/scenarios/create-and-save";
            
            const bodyData = {
                scenarioName,
                turkishInstructions,
                targetUrl,
                projectName: activeProjectName,
                testType: currentTestType,
                expectedOutcome: expectedOutcomeSelect ? expectedOutcomeSelect.value : "SUCCESS_EXPECTED"
            };
            if (isEditMode) bodyData.originalScenarioName = globalEditScenarioName;

            try {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "X-User-Token": userSession.token || ""
                    },
                    body: JSON.stringify(bodyData)
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    alert(result.message || (isEditMode ? "Senaryo güncellendi!" : "Senaryo kaydedildi!"));
                    globalEditScenarioName = "";
                    if (scenarioModal) scenarioModal.classList.add("hidden");
                    await loadScenarios();
                } else {
                    alert(`Kayıt Hatası: ${result.error || "Bilinmeyen hata"}`);
                }
            } catch (err) {
                console.error("Senaryo kaydetme isteğinde hata patladı:", err);
                alert("İstek esnasında bağlantı hatası patladı.");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            }
        });
    }

    if (projectDropdown) {
        projectDropdown.addEventListener("change", (e) => {
            currentProject = e.target.value;
            updateProjectLabels();
        });
    }

    // ─── DİNAMİK AYARLAR VE ÇOKLU API ANAHTARLARI YÖNETİMİ ───
    const settingsForm = document.getElementById("settings-form");
    const apiKeysContainer = document.getElementById("api-keys-container");
    const addApiKeyBtn = document.getElementById("add-api-key-btn");

    function refreshApiDropdowns(selectedRunner = "", selectedTranslator = "") {
        const runnerSelect = document.getElementById("setting-test-runner-api");
        const translatorSelect = document.getElementById("setting-translator-api");
        if (!runnerSelect || !translatorSelect) return;

        const currentRunner = selectedRunner || runnerSelect.value || "";
        const currentTranslator = selectedTranslator || translatorSelect.value || "";

        const providers = [];

        document.querySelectorAll(".api-provider-input").forEach(input => {
            const val = input.value.trim().toLowerCase();
            if (val && !providers.includes(val)) {
                providers.push(val);
            }
        });

        runnerSelect.innerHTML = "";
        providers.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p.toUpperCase();
            runnerSelect.appendChild(opt);
        });
        
        if (providers.includes(currentRunner)) {
            runnerSelect.value = currentRunner;
        } else if (providers.length > 0) {
            runnerSelect.value = providers[0];
        }

        translatorSelect.innerHTML = "";
        providers.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p.toUpperCase();
            translatorSelect.appendChild(opt);
        });

        if (providers.includes(currentTranslator)) {
            translatorSelect.value = currentTranslator;
        } else if (providers.length > 0) {
            translatorSelect.value = providers[0];
        }
    }

    async function loadSystemSettings() {
        if (!settingsForm) return;

        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

        try {
            const res = await fetch("/api/scenarios/settings/get", {
                headers: {
                    "X-User-Token": userSession.token || ""
                }
            });
            const result = await res.json();

            if (result.success && result.settings) {
                const s = result.settings;

                if (apiKeysContainer) apiKeysContainer.innerHTML = "";
                if (s.apiKeys) {
                    Object.entries(s.apiKeys).forEach(([provider, details]) => {
                        const keyVal = typeof details === "object" ? details.key : details;
                        const modelVal = typeof details === "object" ? details.model : "";
                        addApiKeyRow(provider, keyVal, modelVal);
                    });
                }

                refreshApiDropdowns(s.testRunnerApi, s.translatorApi);
            }
        } catch (err) {
            console.error("Ayarlar yüklenirken hata oluştu:", err);
        }
    }

    function addApiKeyRow(provider = "", keyVal = "", modelVal = "") {
        if (!apiKeysContainer) return;
        const row = document.createElement("div");
        row.className = "grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-[#27272a]/30 p-3 rounded-xl border border-[rgba(255,255,255,0.04)] animate-slide-in w-full";
        
        row.innerHTML = `
            <div class="md:col-span-3">
                <input type="text" required placeholder="Sağlayıcı adı" value="${provider}" 
                       class="api-provider-input w-full bg-transparent text-xs text-white outline-none font-mono font-bold border-b md:border-b-0 md:border-r border-[rgba(255,255,255,0.06)] pb-1 md:pb-0 md:pr-2">
            </div>
            
            <div class="md:col-span-5 flex items-center bg-[#18181b] border border-[rgba(255,255,255,0.05)] rounded-lg px-2.5 py-1.5 w-full gap-2">
                <input type="password" required placeholder="API Key Değeri" value="${keyVal}" 
                       class="api-value-input w-full bg-transparent text-xs text-zinc-300 outline-none font-mono">
                <button type="button" class="toggle-password-btn text-zinc-500 hover:text-zinc-300 transition focus:outline-none">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
            </div>
            
            <div class="md:col-span-3">
                <input type="text" required placeholder="Model adı" value="${modelVal}" 
                       class="api-model-input w-full bg-[#18181b] border border-[rgba(255,255,255,0.05)] p-2 rounded-lg text-xs text-amber-400 outline-none font-mono">
            </div>
            
            <div class="md:col-span-1 flex justify-end">
                <button type="button" class="remove-api-key-btn text-zinc-500 hover:text-red-400 transition p-1.5 rounded-lg hover:bg-red-500/10">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;

        const providerInput = row.querySelector(".api-provider-input");
        const passwordInput = row.querySelector(".api-value-input");
        const togglePasswordBtn = row.querySelector(".toggle-password-btn");

        togglePasswordBtn.addEventListener("click", () => {
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                togglePasswordBtn.innerHTML = `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
            } else {
                passwordInput.type = "password";
                togglePasswordBtn.innerHTML = `<i data-lucide="eye" class="w-4 h-4"></i>`;
            }
            lucide.createIcons();
        });

        providerInput.addEventListener("input", () => {
            refreshApiDropdowns();
        });

        row.querySelector(".remove-api-key-btn").addEventListener("click", () => {
            row.remove();
            refreshApiDropdowns();
        });

        apiKeysContainer.appendChild(row);
        lucide.createIcons();
    }

    if (addApiKeyBtn) {
        addApiKeyBtn.addEventListener("click", () => {
            addApiKeyRow();
            refreshApiDropdowns();
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const saveBtn = document.getElementById("save-settings-btn");
            const originalHtml = saveBtn ? saveBtn.innerHTML : "";
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = `<span>Kaydediliyor...</span>`;
            }

            const apiKeys = {};
            const providerInputs = document.querySelectorAll(".api-provider-input");
            const valueInputs = document.querySelectorAll(".api-value-input");
            const modelInputs = document.querySelectorAll(".api-model-input");

            providerInputs.forEach((input, index) => {
                const provider = input.value.trim().toLowerCase(); 
                const keyVal = valueInputs[index] ? valueInputs[index].value.trim() : "";
                const modelVal = modelInputs[index] ? modelInputs[index].value.trim() : "";
                
                if (provider) {
                    apiKeys[provider] = {
                        key: keyVal,
                        model: modelVal
                    };
                }
            });

            const testRunnerEl = document.getElementById("setting-test-runner-api");
            const translatorEl = document.getElementById("setting-translator-api");

            const payload = {
                testRunnerApi: testRunnerEl ? testRunnerEl.value : "",
                translatorApi: translatorEl ? translatorEl.value : "",
                apiKeys
            };
            
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            try {
                const res = await fetch("/api/scenarios/settings/save", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "X-User-Token": userSession.token || ""
                    },
                    body: JSON.stringify(payload)
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    alert("Başarılı: Sağlayıcı ayarları ve model isimleri diske başarıyla kaydedildi.");
                    await loadSystemSettings();
                } else {
                    alert(`Ayarlar kaydedilemedi: ${result.error || "Hata oluştu"}`);
                }
            } catch (err) {
                console.error("Ayarlar kaydedilirken ağ hatası:", err);
                alert("Sunucu bağlantı hatası!");
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalHtml;
                }
            }
        });
    }

    const settingsTabBtn = document.querySelector('[data-target="view-settings"]');
    if (settingsTabBtn) {
        settingsTabBtn.addEventListener("click", loadSystemSettings);
    }

    // ─── KULLANICI YÖNETİMİ FRONTEND ───
    const openNewUserModalBtn = document.getElementById("open-new-user-modal-btn");
    const userModal = document.getElementById("user-modal");
    const closeUserModal = document.getElementById("close-user-modal");
    const userForm = document.getElementById("user-form");
    const usersList = document.getElementById("users-list");
    const userProjectsCheckboxes = document.getElementById("user-projects-checkboxes");
    const passwordHint = document.getElementById("password-hint");

    const usersTabBtn = document.getElementById("nav-users-btn");
    if (usersTabBtn) usersTabBtn.addEventListener("click", loadUsers);

    async function loadUsers() {
        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
        try {
            const res = await fetch("/api/scenarios/users/list", { headers: { "X-User-Token": userSession.token || "" } });
            const result = await res.json();

            if (result.success && result.users) {
                if (usersList) usersList.innerHTML = "";
                cachedAllProjects = result.allProjects || [];
                
                result.users.forEach(user => {
                    const row = document.createElement("tr");
                    row.className = "border-b border-[rgba(255,255,255,0.04)] h-12";
                    
                    const pBadges = user.rol === 'ADMIN' 
                        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20">TÜMÜ (ADMIN)</span>' 
                        : (user.projeler.length > 0 
                            ? user.projeler.map(p => `<span class="px-2 py-0.5 mr-1 rounded text-[10px] bg-zinc-500/10 text-zinc-300 border border-zinc-500/20 font-mono">${escapeHtml(p)}</span>`).join('')
                            : `<span class="text-zinc-500 italic text-[10px]">Atanmış proje yok</span>`);

                    row.innerHTML = `
                        <td class="py-3 px-4 text-white font-medium">${escapeHtml(user.kullanici_adi)}</td>
                        <td class="py-3 px-4 text-zinc-400 font-mono">${escapeHtml(user.rol)}</td>
                        <td class="py-3 px-4 text-zinc-400">${pBadges}</td>
                        <td class="py-3 px-4 text-right flex items-center justify-end gap-2 h-12">
                            <button class="edit-user-btn text-zinc-500 hover:text-amber-400 transition p-1 rounded hover:bg-amber-500/10" 
                                    data-id="${user.id}" 
                                    data-username="${user.kullanici_adi}" 
                                    data-rol="${user.rol}" 
                                    data-projeler="${encodeURIComponent(JSON.stringify(user.projeler))}">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button class="delete-user-btn text-zinc-500 hover:text-red-400 transition p-1 rounded hover:bg-red-500/10" 
                                    data-id="${user.id}" data-username="${user.kullanici_adi}">
                                <i data-lucide="user-minus" class="w-4 h-4"></i>
                            </button>
                        </td>
                    `;
                    if (usersList) usersList.appendChild(row);
                });

                document.querySelectorAll(".delete-user-btn").forEach(btn => {
                    btn.onclick = async function() {
                        const id = btn.getAttribute("data-id");
                        const username = btn.getAttribute("data-username");
                        if (confirm(`"${username}" silinsin mi?`)) {
                            await fetch("/api/scenarios/users/delete", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "X-User-Token": userSession.token || "" },
                                body: JSON.stringify({ id, username })
                            });
                            await loadUsers();
                        }
                    };
                });

                document.querySelectorAll(".edit-user-btn").forEach(btn => {
                    btn.onclick = function() {
                        globalEditUserId = btn.getAttribute("data-id");
                        const username = btn.getAttribute("data-username");
                        const rol = btn.getAttribute("data-rol");
                        const userProjects = JSON.parse(decodeURIComponent(btn.getAttribute("data-projeler") || "[]"));

                        const modalTitle = document.getElementById("user-modal-title");
                        const modalSubmitBtn = document.getElementById("user-modal-submit-btn");
                        if (modalTitle) modalTitle.textContent = `Kullanıcı Yetkilerini Düzenle: ${username}`;
                        if (modalSubmitBtn) modalSubmitBtn.textContent = "Değişiklikleri Kaydet";
                        
                        const newUserInp = document.getElementById("new-user-username");
                        const newPassInp = document.getElementById("new-user-password");
                        const newRoleInp = document.getElementById("new-user-role");

                        if (newUserInp) {
                            newUserInp.value = username;
                            newUserInp.disabled = true;
                        }
                        
                        if (newPassInp) {
                            newPassInp.value = "";
                            newPassInp.required = false;
                        }

                        if (passwordHint) passwordHint.classList.remove("hidden");
                        if (newRoleInp) newRoleInp.value = rol;

                        renderCheckboxList(userProjects);
                        if (userModal) userModal.classList.remove("hidden");
                    };
                });
                lucide.createIcons();
            }
        } catch (err) {
            console.error("Kullanıcı listesi yüklenirken hata oluştu:", err);
        }
    }

    function renderCheckboxList(selectedList = []) {
        if (!userProjectsCheckboxes) return;
        userProjectsCheckboxes.innerHTML = "";
        cachedAllProjects.forEach(proj => {
            const isChecked = selectedList.includes(proj) ? "checked" : "";
            userProjectsCheckboxes.innerHTML += `
                <label class="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white transition mb-1">
                    <input type="checkbox" value="${proj}" ${isChecked} class="user-proj-cb w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-800 text-[#3b82f6] focus:ring-0">
                    <span>${proj}</span>
                </label>
            `;
        });
    }

    if (openNewUserModalBtn) {
        openNewUserModalBtn.addEventListener("click", () => {
            globalEditUserId = "";
            if (userForm) userForm.reset();
            const modalTitle = document.getElementById("user-modal-title");
            const modalSubmitBtn = document.getElementById("user-modal-submit-btn");
            if (modalTitle) modalTitle.textContent = "Yeni Kullanıcı Oluştur";
            if (modalSubmitBtn) modalSubmitBtn.textContent = "Kullanıcıyı Kaydet";
            
            const newUserInp = document.getElementById("new-user-username");
            const newPassInp = document.getElementById("new-user-password");

            if (newUserInp) {
                newUserInp.value = "";
                newUserInp.disabled = false;
            }
            if (newPassInp) newPassInp.required = true;
            if (passwordHint) passwordHint.classList.add("hidden");
            
            renderCheckboxList([]);
            if (userModal) userModal.classList.remove("hidden");
        });
    }

    if (closeUserModal) closeUserModal.addEventListener("click", () => userModal.classList.add("hidden"));

    if (userForm) {
        userForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const isEditMode = globalEditUserId !== ""; 
            const username = document.getElementById("new-user-username").value.trim();
            const password = document.getElementById("new-user-password").value;
            const role = document.getElementById("new-user-role").value;
            const selectedProjects = Array.from(document.querySelectorAll(".user-proj-cb:checked")).map(cb => cb.value);

            if (!username || (!isEditMode && !password)) {
                alert("Lütfen zorunlu alanları doldurun!");
                return;
            }

            const endpoint = isEditMode ? "/api/scenarios/users/update" : "/api/scenarios/users/create";
            const bodyData = { username, password, role, selectedProjects };
            
            if (isEditMode) bodyData.id = globalEditUserId;

            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

            try {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-User-Token": userSession.token || "" },
                    body: JSON.stringify(bodyData)
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    alert(isEditMode ? "Kullanıcı yetkileri başarıyla güncellendi!" : " Kullanıcı başarıyla oluşturuldu!");
                    if (userModal) userModal.classList.add("hidden");
                    globalEditUserId = ""; 
                    await loadUsers(); 
                } else {
                    alert(`Hata: ${result.error || "İşlem başarısız"}`);
                }
            } catch (err) {
                console.error(err);
                alert("Sunucu bağlantı hatası!");
            }
        });
    }

    // Toplu Rapor Seçimi ve Silme Yönetimi
    function updateSelectedReportsUI() {
        const checkboxes = document.querySelectorAll(".report-checkbox:checked");
        const deleteBtn = document.getElementById("delete-selected-reports-btn");
        const countLabel = document.getElementById("selected-reports-count");
        const selectAllCb = document.getElementById("select-all-reports-checkbox");
        const allCheckboxes = document.querySelectorAll(".report-checkbox");

        const count = checkboxes.length;
        if (countLabel) countLabel.textContent = count;

        if (deleteBtn) {
            if (count > 0) {
                deleteBtn.disabled = false;
                deleteBtn.classList.remove("opacity-50", "cursor-not-allowed");
                deleteBtn.classList.add("cursor-pointer");
            } else {
                deleteBtn.disabled = true;
                deleteBtn.classList.add("opacity-50", "cursor-not-allowed");
                deleteBtn.classList.remove("cursor-pointer");
            }
        }

        if (selectAllCb && allCheckboxes.length > 0) {
            selectAllCb.checked = checkboxes.length === allCheckboxes.length;
        }
    }

    document.addEventListener("change", (e) => {
        if (e.target.classList.contains("report-checkbox")) {
            updateSelectedReportsUI();
        }
    });

    const selectAllBtn = document.getElementById("select-all-reports-btn");
    if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
            const selectAllCb = document.getElementById("select-all-reports-checkbox");
            const allCheckboxes = document.querySelectorAll(".report-checkbox");
            const targetState = !selectAllCb.checked;

            selectAllCb.checked = targetState;
            allCheckboxes.forEach(cb => cb.checked = targetState);
            updateSelectedReportsUI();
        });
    }

    const deleteSelectedBtn = document.getElementById("delete-selected-reports-btn");
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener("click", async () => {
            const selectedCheckboxes = document.querySelectorAll(".report-checkbox:checked");
            const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);

            if (selectedIds.length === 0) return;

            const confirmDelete = confirm(`Seçtiğiniz ${selectedIds.length} adet test raporunu kalıcı olarak silmek istediğinize emin misiniz?`);
            if (!confirmDelete) return;

            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            const origText = deleteSelectedBtn.innerHTML;

            try {
                deleteSelectedBtn.disabled = true;
                deleteSelectedBtn.innerHTML = `<span class="animate-pulse">Siliniyor...</span>`;

                const res = await fetch("/api/scenarios/reports/delete-batch", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-User-Token": userSession.token || ""
                    },
                    body: JSON.stringify({ ids: selectedIds })
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    await loadReports();
                } else {
                    alert(`Silme Hatası: ${result.error || "Hata oluştu"}`);
                }
            } catch (err) {
                console.error("Toplu silmede hata:", err);
                alert("Sunucu bağlantı hatası!");
            } finally {
                deleteSelectedBtn.disabled = false;
                deleteSelectedBtn.innerHTML = origText;
                lucide.createIcons();
            }
        });
    }

    // ─── RAPOR DETAY MODALINI AÇAN VE DOLDURAN FONKSİYON ───
    function openReportModal(scenarioName, formattedDate, isSuccess, rawLogContent, parsedSteps) {
        const modal = document.getElementById("report-detail-modal");
        const titleEl = document.getElementById("modal-report-title");
        const dateEl = document.getElementById("modal-report-date");
        const iconEl = document.getElementById("modal-report-status-icon");
        const errorCard = document.getElementById("modal-report-error-card");
        const errorText = document.getElementById("modal-report-error-text");
        const stepsContainer = document.getElementById("modal-report-steps-container");
        const stepCountLabel = document.getElementById("modal-report-step-count");
        const copyRawBtn = document.getElementById("modal-copy-raw-log-btn");

        if (!modal) return;

        titleEl.textContent = scenarioName;
        dateEl.textContent = formattedDate;
        stepCountLabel.textContent = `${parsedSteps.length} Adım Yakalandı`;

        if (isSuccess) {
            iconEl.className = "w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
            iconEl.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5"></i>`;
            errorCard.classList.add("hidden");
        } else {
            iconEl.className = "w-9 h-9 rounded-xl flex items-center justify-center bg-rose-500/10 text-rose-400 border border-rose-500/20";
            iconEl.innerHTML = `<i data-lucide="alert-triangle" class="w-5 h-5"></i>`;
            
            const lines = rawLogContent.split('\n');
            const errLine = lines.find(l => l.includes('CRITICAL_POPUP_ERROR') || l.includes('HATA TESPİT EDİLDİ') || l.toLowerCase().includes('error:')) || "Test çalıştırma hatası oluştu.";
            errorText.textContent = errLine.replace(/.*CRITICAL_POPUP_ERROR:\s*/i, '').trim();
            errorCard.classList.remove("hidden");
        }

        stepsContainer.innerHTML = "";
        parsedSteps.forEach((st, idx) => {
            const isFailed = st.status === 'FAILED';
            const stepDiv = document.createElement("div");
            
            stepDiv.className = isFailed 
                ? "border border-rose-500/30 rounded-xl overflow-hidden bg-rose-500/5 shadow-sm"
                : "border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden bg-[#09090b]";

            stepDiv.innerHTML = `
                <div class="modal-step-header flex items-center justify-between p-3.5 cursor-pointer ${isFailed ? 'hover:bg-rose-500/10' : 'hover:bg-[#27272a]/40'} transition select-none">
                    <div class="flex items-center gap-3">
                        <span class="font-mono text-xs ${isFailed ? 'text-rose-400 font-bold' : 'text-zinc-500'}">${String(idx + 1).padStart(2, '0')}.</span>
                        <span class="text-xs ${isFailed ? 'text-rose-400 font-bold' : 'text-zinc-200 font-semibold'}">${escapeHtml(st.title)}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] px-2 py-0.5 rounded border ${isFailed ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-semibold'} font-mono uppercase">
                            ${isFailed ? 'HATA' : 'TAMAM'}
                        </span>
                        <i data-lucide="chevron-right" class="modal-step-chevron w-4 h-4 ${isFailed ? 'text-rose-400' : 'text-zinc-500'} transition-transform duration-200"></i>
                    </div>
                </div>
                <div class="modal-step-content max-h-0 overflow-hidden transition-all duration-300 ease-in-out">
                    <div class="p-3.5 ${isFailed ? 'bg-rose-950/20 border-t border-rose-500/20 text-rose-200' : 'bg-black/60 border-t border-[rgba(255,255,255,0.04)] text-zinc-300'}">
                        <pre class="text-[11px] font-mono whitespace-pre-wrap leading-relaxed select-text">${escapeHtml(st.logs.join('\n'))}</pre>
                    </div>
                </div>
            `;

            const header = stepDiv.querySelector(".modal-step-header");
            const content = stepDiv.querySelector(".modal-step-content");
            const chevron = stepDiv.querySelector(".modal-step-chevron");

            header.addEventListener("click", () => {
                const isOpen = content.style.maxHeight && content.style.maxHeight !== "0px";
                if (isOpen) {
                    content.style.maxHeight = "0px";
                    chevron.style.transform = "rotate(0deg)";
                } else {
                    content.style.maxHeight = content.scrollHeight + "px";
                    chevron.style.transform = "rotate(90deg)";
                }
            });

            stepsContainer.appendChild(stepDiv);
        });

        copyRawBtn.onclick = () => {
            navigator.clipboard.writeText(rawLogContent);
            const orig = copyRawBtn.innerHTML;
            copyRawBtn.innerHTML = `<span class="text-emerald-400 font-bold">Kopyalandı!</span>`;
            setTimeout(() => copyRawBtn.innerHTML = orig, 1500);
        };

        lucide.createIcons();
        modal.classList.remove("hidden");
    }

    // Modal Kapatma Dinleyicileri
    const closeReportModalBtn = document.getElementById("close-report-modal-btn");
    const closeReportModalFooterBtn = document.getElementById("close-report-modal-footer-btn");
    const reportDetailModal = document.getElementById("report-detail-modal");

    if (closeReportModalBtn) closeReportModalBtn.addEventListener("click", () => reportDetailModal.classList.add("hidden"));
    if (closeReportModalFooterBtn) closeReportModalFooterBtn.addEventListener("click", () => reportDetailModal.classList.add("hidden"));
});