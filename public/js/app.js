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

    const scenarioModal = document.getElementById("scenario-modal");
    const openNewScenarioBtn = document.getElementById("open-new-scenario-btn");
    const closeScenarioModal = document.getElementById("close-scenario-modal");
    const cancelScenarioBtn = document.getElementById("cancel-scenario-btn");
    const scenarioForm = document.getElementById("scenario-form");
    const stepsContainer = document.getElementById("steps-container");
    const addStepFieldBtn = document.getElementById("add-step-field-btn");

    
    let currentProject = "";
    let batchQueue = [];

    // ─── TOPLU TEST KUYRUĞUNU ADIM ADIM ÇALIŞTIRMA ETKİNLİĞİ ───
    const startBatchBtn = document.getElementById("start-batch-btn");
    startBatchBtn.addEventListener("click", async () => {
        if (batchQueue.length === 0) return;

        const totalTests = batchQueue.length;
        const confirmBatch = confirm(`Seçtiğiniz ${totalTests} senaryo sırasıyla canlı olarak çalıştırılacak. `);
        if (!confirmBatch) return;

        startBatchBtn.disabled = true;
        startBatchBtn.className = "bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm animate-pulse cursor-wait";
        
        const activeQueue = [...batchQueue]; 
        console.log(" Canlı Pipeline Başlatıldı. Sıralama:", activeQueue);

        for (let i = 0; i < activeQueue.length; i++) {
            const scenarioName = activeQueue[i];
            const remainingCount = activeQueue.length - i; 

            startBatchBtn.textContent = `Çalışacak Test Sayısı: ${remainingCount}...`;

            const rows = document.querySelectorAll("#batch-list tr");
            let targetOrderCell = null;
            
            rows.forEach(row => {
                const checkbox = row.querySelector(".batch-checkbox");
                if (checkbox && checkbox.value === scenarioName) {
                    targetOrderCell = row.querySelector(".batch-order-cell");
                    row.className = "border-b border-amber-500/30 bg-amber-500/5 transition h-12";
                    targetOrderCell.innerHTML = `<span class="text-amber-400 animate-pulse font-bold">Çalışıyor...</span>`;
                }
            });

            try {
                console.log(`[Pipeline] ${scenarioName} başlatılıyor... (${remainingCount} test kaldı)`);
                
                const res = await fetch("/api/scenarios/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        scenarioName,
                        projectName: projectDropdown.value
                    })
                });

                const result = await res.json();
                
                rows.forEach(row => {
                    const checkbox = row.querySelector(".batch-checkbox");
                    if (checkbox && checkbox.value === scenarioName) {
                        const orderCell = row.querySelector(".batch-order-cell");
                        if (res.ok && result.success) {
                            row.className = "border-b border-emerald-500/20 bg-emerald-500/5 transition h-12";
                            orderCell.innerHTML = `<span class="text-emerald-400 font-bold">Tamamlandı</span>`;
                        } else {
                            row.className = "border-b border-rose-500/20 bg-rose-500/5 transition h-12";
                            orderCell.innerHTML = `<span class="text-rose-400 font-bold">Başarısız</span>`;
                        }
                    }
                });

            } catch (err) {
                console.error(` [Pipeline] ${scenarioName} hata verdi:`, err);
                rows.forEach(row => {
                    const checkbox = row.querySelector(".batch-checkbox");
                    if (checkbox && checkbox.value === scenarioName) {
                        const orderCell = row.querySelector(".batch-order-cell");
                        row.className = "border-b border-rose-500/20 bg-rose-500/5 transition h-12";
                        orderCell.innerHTML = `<span class="text-rose-400 font-bold">Bağlantı Hatası</span>`;
                    }
                });
            }
        }

        alert(" Seçilen tüm testler çalıştırıldı ve sonuçlar raporlara kaydedildi.");
        
        batchQueue = []; 
        updateBatchButtonState(); 
        await loadReports(); 
    });


    // // 1. Senaryoları Çekip Tabloya Döken Fonksiyon
    // async function loadScenarios() {
    //     if (!currentProject || currentProject === "Varsayılan Proje") {
    //         console.log("⚠️ Geçerli bir proje seçilmediği için senaryo isteği iptal edildi.");
    //         return;
    //     }

    //     const scenariosTable = document.getElementById("scenarios-table");
    //     const scenariosEmpty = document.getElementById("scenarios-empty");
    //     const scenariosList = document.getElementById("scenarios-list");
    //     const scenarioCountLabel = document.querySelector(".scenario-count");

    //     if (!scenariosTable || !scenariosEmpty || !scenariosList) return;

    //     try {
    //         console.log(` "${currentProject}" projesi için senaryolar buluttan isteniyor...`);
    //         const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(currentProject)}`);
    //         const result = await res.json();

    //         if (result.scenarios && result.scenarios.length > 0) {
    //             scenariosEmpty.classList.add("hidden");
    //             scenariosTable.classList.remove("hidden");
    //             scenariosList.innerHTML = "";
    //             scenarioCountLabel.textContent = result.scenarios.length;

    //             result.scenarios.forEach((scenarioName, index) => {
    //                 const row = document.createElement("tr");
    //                 row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition";
    //                 row.innerHTML = `
    //                     <td class="py-3 px-4 font-mono text-zinc-500">${String(index + 1).padStart(2, '0')}</td>
    //                     <td class="py-3 px-4 font-medium text-white">${scenarioName}</td>
    //                     <td class="py-3 px-4">
    //                         <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
    //                             <span class="w-1 h-1 rounded-full bg-zinc-400"></span> Hazır
    //                         </span>
    //                     </td>
    //                     <td class="py-3 px-4 text-right">
    //                         <button class="run-single-btn text-[#3b82f6] hover:text-blue-400 font-medium transition mr-3" data-name="${scenarioName}">Testi Çalıştır</button>
    //                         <button class="delete-scenario-btn text-zinc-500 hover:text-red-400 transition" data-name="${scenarioName}"><i data-lucide="trash-2" class="w-3.5 h-3.5 inline"></i></button>
    //                     </td>
    //                 `;
    //                 scenariosList.appendChild(row);
    //             });

    //             // A. SİLME BUTONLARI
    //             const deleteButtons = document.querySelectorAll(".delete-scenario-btn");
    //             deleteButtons.forEach(btn => {
    //                 btn.addEventListener("click", async () => {
    //                     const scenarioName = btn.getAttribute("data-name");
    //                     const selectedProjName = projectDropdown.value;
                        
    //                     const confirmDelete = confirm(`"${scenarioName}" senaryosunu silmek istediğinize emin misiniz?`);
    //                     if (!confirmDelete) return;

    //                     try {
    //                         btn.disabled = true;
    //                         const res = await fetch("/api/scenarios/delete", {
    //                             method: "POST",
    //                             headers: { "Content-Type": "application/json" },
    //                             body: JSON.stringify({
    //                                 scenarioName,
    //                                 projectName: selectedProjName
    //                             })
    //                         });

    //                         const result = await res.json();
    //                         if (res.ok && result.success) {
    //                             alert("Senaryo başarıyla buluttan silindi!");
    //                             await loadScenarios(); 
    //                         } else {
    //                             alert(`Silinemedi: ${result.error || "Hata oluştu"}`);
    //                             btn.disabled = false;
    //                         }
    //                     } catch (err) {
    //                         console.error("Silme isteğinde hata verildi:", err);
    //                         btn.disabled = false;
    //                     }
    //                 });
    //             });

    //             // B. TEKİL TESTİ KOŞTUR BUTONLARI
    //             const runButtons = document.querySelectorAll(".run-single-btn");
    //             runButtons.forEach(btn => {
    //                 btn.addEventListener("click", async () => {
    //                     const scenarioName = btn.getAttribute("data-name");
    //                     const selectedProjName = projectDropdown.value;

    //                     const originalHtml = btn.innerHTML;
    //                     btn.disabled = true;
    //                     btn.innerHTML = `<span class="text-amber-400 animate-pulse">Çalıştırılıyor...</span>`;

    //                     try {
    //                         console.log(`"${scenarioName}" testi başlatıldı...`);
    //                         const res = await fetch("/api/scenarios/run", {
    //                             method: "POST",
    //                             headers: { "Content-Type": "application/json" },
    //                             body: JSON.stringify({
    //                                 scenarioName,
    //                                 projectName: selectedProjName
    //                             })
    //                         });

    //                         const result = await res.json();
    //                         if (res.ok && result.success) {
    //                             alert(`Başarılı: "${scenarioName}" testi Playwright ile başarıyla çalıştırıldı ve tamamlandı!`);
    //                         } else {
    //                             alert(`Test Başarısız: ${result.error || "Bilinmeyen bir hata oluştu."}\nDetay: ${result.details || ""}`);
    //                         }
    //                     } catch (err) {
    //                         console.error("Test çalıştırma isteğinde hata patladı:", err);
    //                         alert("Sunucu bağlantı hatası! Playwright çalıştırılamadı.");
    //                     } finally {
    //                         btn.disabled = false;
    //                         btn.innerHTML = originalHtml;
    //                     }
    //                 });
    //             });

    //             lucide.createIcons();
    //         } else {
    //             scenarioCountLabel.textContent = "0";
    //             scenariosTable.classList.add("hidden");
    //             scenariosEmpty.classList.remove("hidden");
    //         }
    //     } catch (err) {
    //         console.error("Senaryolar listelenirken hata verdi:", err.message);
    //     }
    // }

    // 1. Senaryoları Çekip Şık Birer Akordeon Kartı Olarak Döken Fonksiyon 🚀
    async function loadScenarios() {
        if (!currentProject || currentProject === "Varsayılan Proje") {
            console.log("⚠️ Geçerli bir proje seçilmediği için senaryo isteği iptal edildi.");
            return;
        }

        const scenariosTable = document.getElementById("scenarios-table");
        const scenariosEmpty = document.getElementById("scenarios-empty");
        const scenariosList = document.getElementById("scenarios-list");
        const scenarioCountLabel = document.querySelector(".scenario-count");

        if (!scenariosTable || !scenariosEmpty || !scenariosList) return;

        try {
            console.log(` "${currentProject}" projesi için senaryolar buluttan isteniyor...`);
            const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(currentProject)}`);
            const result = await res.json();

            if (result.scenarios && result.scenarios.length > 0) {
                scenariosEmpty.classList.add("hidden");
                scenariosTable.classList.remove("hidden");
                scenariosList.innerHTML = "";
                scenarioCountLabel.textContent = result.scenarios.length;

                // Tablo başlıklarındaki "Durum" sütununu "Hedef URL" olarak güncelliyoruz kanka 🎨
                const tableHeader = scenariosTable.querySelector("thead tr");
                if (tableHeader) {
                    tableHeader.innerHTML = `
                        <th class="py-3 px-4 w-12">#</th>
                        <th class="py-3 px-4">Senaryo Adı</th>
                        <th class="py-3 px-4">Hedef URL</th>
                        <th class="py-3 px-4 text-right">İşlemler</th>
                    `;
                }

                result.scenarios.forEach((scenarioName, index) => {
                    // Her bir senaryo için iki parçalı bir yapı oluşturuyoruz: Satır ve gizli akordeon içeriği!
                    const rowId = `scenario-row-${index}`;
                    const contentId = `scenario-content-${index}`;

                    // 1. Ana Senaryo Satırı
                    const row = document.createElement("tr");
                    row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition cursor-pointer select-none";
                    row.setAttribute("data-target", contentId);
                    
                    // Geçici olarak "Yükleniyor..." yazıp, content çekildiğinde gerçek URL'i buraya basacağız
                    row.innerHTML = `
                        <td class="py-3 px-4 font-mono text-zinc-500">${String(index + 1).padStart(2, '0')}</td>
                        <td class="py-3 px-4 font-medium text-white flex items-center gap-2">
                            <i data-lucide="chevron-right" class="chevron-icon-scen w-4 h-4 text-zinc-500 transition-transform duration-200"></i>
                            <span>${scenarioName}</span>
                        </td>
                        <td class="py-3 px-4 target-url-cell text-zinc-400 font-mono text-[11px]">-</td>
                        <td class="py-3 px-4 text-right" onclick="event.stopPropagation();">
                            <button class="run-single-btn text-[#3b82f6] hover:text-blue-400 font-medium transition mr-4" data-name="${scenarioName}">Testi Çalıştır</button>
                            <button class="delete-scenario-btn text-zinc-500 hover:text-red-400 transition" data-name="${scenarioName}"><i data-lucide="trash-2" class="w-3.5 h-3.5 inline"></i></button>
                        </td>
                    `;
                    scenariosList.appendChild(row);

                    // 2. Akordeon İçerik Satırı (Başlangıçta gizli)
                    const contentRow = document.createElement("tr");
                    contentRow.id = contentId;
                    contentRow.className = "hidden bg-[#09090b]/50";
                    contentRow.innerHTML = `
                        <td colspan="4" class="p-4 border-b border-[rgba(255,255,255,0.04)]">
                            <div class="space-y-3 bg-[#18181b]/40 p-4 rounded-xl border border-[rgba(255,255,255,0.06)]">
                                <div class="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
                                    <span class="text-[10px] uppercase font-bold tracking-wider text-zinc-500 flex items-center gap-1">
                                        <i data-lucide="list-todo" class="w-3.5 h-3.5 text-[#3b82f6]"></i> Yapay Zeka Test Adımları
                                    </span>
                                    <span class="text-[10px] font-mono text-zinc-500 bg-[#27272a]/40 px-2 py-0.5 rounded">JSON Modeli</span>
                                </div>
                                <div class="steps-details-container space-y-2 text-xs text-zinc-300">
                                    <div class="animate-pulse text-zinc-500 text-[11px]">Buluttan adımlar yükleniyor...</div>
                                </div>
                            </div>
                        </td>
                    `;
                    scenariosList.appendChild(contentRow);

                    // 💥 TIKLAMA VE AKORDEON AÇILMA SİHRİ!
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

                            // Akordeon açıldığında eğer adımlar henüz çekilmediyse buluttan talep ediyoruz
                            const detailsContainer = contentRow.querySelector(".steps-details-container");
                            if (detailsContainer.getAttribute("data-loaded") !== "true") {
                                try {
                                    const contentRes = await fetch(`/api/scenarios/content?scenarioName=${encodeURIComponent(scenarioName)}&project=${encodeURIComponent(currentProject)}`);
                                    const contentResult = await contentRes.json();

                                    if (contentResult.success && contentResult.content) {
                                        const adimlar = contentResult.content;
                                        
                                        // Satırdaki URL hücresini asıl hedef_url ile güncelliyoruz kanka!
                                        const urlCell = row.querySelector(".target-url-cell");
                                        if (urlCell && adimlar.targetUrl) {
                                            urlCell.innerHTML = `
                                                <a href="${adimlar.targetUrl}" target="_blank" onclick="event.stopPropagation();" class="text-[#3b82f6] hover:underline flex items-center gap-1 select-text">
                                                    ${adimlar.targetUrl} <i data-lucide="external-link" class="w-3 h-3"></i>
                                                </a>
                                            `;
                                        }

                                        // Test adımlarını şık bir liste halinde basıyoruz
                                        let stepsHtml = "";
                                        if (adimlar.steps && adimlar.steps.length > 0) {
                                            adimlar.steps.forEach((step, stepIdx) => {
                                                let badgeClass = "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20";
                                                if (step.type === "observe") badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                                                if (step.type === "extract") badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

                                                stepsHtml += `
                                                    <div class="flex items-start gap-3 bg-[#27272a]/20 p-2.5 rounded-lg border border-[rgba(255,255,255,0.02)]">
                                                        <span class="font-mono text-[10px] text-zinc-600 mt-0.5">${String(stepIdx + 1).padStart(2, '0')}.</span>
                                                        <div class="flex-1">
                                                            <div class="font-medium text-zinc-200 select-text">${step.instruction}</div>
                                                            ${step.field ? `<div class="text-[10px] text-zinc-500 mt-1 font-mono">Çıktı Kolonu: ${step.field}</div>` : ''}
                                                        </div>
                                                        <span class="text-[9px] px-1.5 py-0.5 rounded border ${badgeClass} font-mono font-bold uppercase shrink-0">${step.type}</span>
                                                    </div>
                                                `;
                                            });
                                        } else {
                                            stepsHtml = `<div class="text-zinc-500 italic text-[11px]">Bu senaryoda tanımlanmış test adımı bulunmuyor.</div>`;
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

                // A. SİLME BUTONLARI (Olay yayılımını engellemek için stopPropagation ile güvene aldık kanka!)
                const deleteButtons = document.querySelectorAll(".delete-scenario-btn");
                deleteButtons.forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        e.stopPropagation(); // Satır tıklama akordeon olayını tetiklemesin kilit! 🔒
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown.value;
                        
                        const confirmDelete = confirm(`"${scenarioName}" senaryosunu silmek istediğinize emin misiniz?`);
                        if (!confirmDelete) return;

                        try {
                            btn.disabled = true;
                            const res = await fetch("/api/scenarios/delete", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
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

                // B. TEKİL TESTİ KOŞTUR BUTONLARI
                const runButtons = document.querySelectorAll(".run-single-btn");
                runButtons.forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        e.stopPropagation(); // Akordeonu tetiklemesin!
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown.value;

                        const originalHtml = btn.innerHTML;
                        btn.disabled = true;
                        btn.innerHTML = `<span class="text-amber-400 animate-pulse">Çalıştırılıyor...</span>`;

                        try {
                            console.log(`"${scenarioName}" testi başlatıldı...`);
                            const res = await fetch("/api/scenarios/run", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    scenarioName,
                                    projectName: selectedProjName
                                })
                            });

                            const result = await res.json();
                            if (res.ok && result.success) {
                                alert(`Başarılı: "${scenarioName}" testi Playwright ile başarıyla çalıştırıldı ve tamamlandı!`);
                            } else {
                                alert(`Test Başarısız: ${result.error || "Bilinmeyen bir hata oluştu."}\nDetay: ${result.details || ""}`);
                            }
                        } catch (err) {
                            console.error("Test çalıştırma isteğinde hata patladı:", err);
                            alert("Sunucu bağlantı hatası! Playwright çalıştırılamadı.");
                        } finally {
                            btn.disabled = false;
                            btn.innerHTML = originalHtml;
                            await loadReports(); // Rapor listesini otomatik yenile kanka!
                        }
                    });
                });

                lucide.createIcons();
            } else {
                scenarioCountLabel.textContent = "0";
                scenariosTable.classList.add("hidden");
                scenariosEmpty.classList.remove("hidden");
            }
        } catch (err) {
            console.error("Senaryolar listelenirken hata verdi:", err.message);
        }
    }

// 📊 DPU Base'den Raporları Çekip İç İçe Akordeon Yapan Fonksiyon (Silme Özellikli)! 🔒
    async function loadReports() {
        const reportsEmpty = document.getElementById("reports-empty");
        const accordionContainer = document.getElementById("reports-list-accordion");

        if (!reportsEmpty || !accordionContainer) return;

        try {
            console.log(`🔄 "${currentProject}" projesi için raporlar buluttan getiriliyor...`);
            const res = await fetch(`/api/scenarios/reports/list?project=${encodeURIComponent(currentProject)}`);
            const result = await res.json();

            if (result.reports && result.reports.length > 0) {
                reportsEmpty.classList.add("hidden");
                accordionContainer.classList.remove("hidden");
                accordionContainer.innerHTML = "";

                result.reports.forEach((report) => {
                    // 🌟 GÜVENLİK: Durum eşleştirmesini case-insensitive ve tam uyumlu yapıyoruz kanka!
                    const reportStatus = (report.status || '').toUpperCase();
                    const isSuccess = reportStatus === "SUCCESS" || reportStatus === "PASSED";

                    const scenarioName = report.scenario_name || "Bilinmeyen Senaryo";
                    const logContent = report.log_content || "Log kaydı bulunmuyor.";
                    const formattedDate = new Date(report.created_at).toLocaleString("tr-TR");

                    // 🚨 DİNAMİK HATA ANALİZİ: Logların içindeki asıl can sıkan hata satırını cımbızlıyoruz
                    let errorSummaryHtml = "";
                    if (!isSuccess) {
                        const linesForError = logContent.split('\n');
                        const errorLine = linesForError.find(line => 
                            line.toLowerCase().includes('error:') || 
                            line.toLowerCase().includes('failed') || 
                            line.toLowerCase().includes('exception:') ||
                            line.toLowerCase().includes('cannot find') ||
                            line.toLowerCase().includes('incorrect api key') ||
                            line.toLowerCase().includes('failed to launch')
                        ) || "Test çalıştırılırken beklenmeyen bir hata ile karşılaşıldı.";

                        // En üste ekleyeceğimiz kırmızı şık hata kutusu tasarımı
                        errorSummaryHtml = `
                            <div class="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3.5 mb-4 text-rose-400 animate-fade-in">
                                <div class="flex items-center gap-2 mb-1.5">
                                    <i data-lucide="alert-octagon" class="w-4 h-4 text-rose-400 shrink-0"></i>
                                    <span class="text-xs font-bold uppercase tracking-wider">Kritik Hata Detayı</span>
                                </div>
                                <pre class="text-[11px] font-mono whitespace-pre-wrap leading-relaxed select-text select-none">${errorLine.trim()}</pre>
                            </div>
                        `;
                    }

                    const lines = logContent.split('\n');
                    const steps = [];
                    let currentStep = null;

                    lines.forEach(line => {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) return;

                        const infoRegex = /(?:\[.*?\]\s+)?(INFO|WARN|ERROR):\s*(.*)/i;
                        const match = trimmedLine.match(infoRegex);

                        if (match) {
                            if (currentStep) {
                                steps.push(currentStep);
                            }
                            const logType = match[1].toUpperCase();
                            const logMessage = match[2].trim();

                            currentStep = {
                                title: logMessage,
                                type: logType,
                                rawHeader: trimmedLine,
                                content: []
                            };
                        } else {
                            if (!currentStep) {
                                currentStep = {
                                    title: "Sistem ve Altyapı Başlangıç Logları",
                                    type: "SYSTEM",
                                    rawHeader: "",
                                    content: []
                                };
                            }
                            currentStep.content.push(trimmedLine);
                        }
                    });

                    if (currentStep) {
                        steps.push(currentStep);
                    }

                    let nestedStepsHtml = "";
                    steps.forEach((step, idx) => {
                        const stepBody = step.content.join('\n').trim();
                        if (!stepBody && step.type === "SYSTEM") return;

                        let badgeClass = "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
                        if (step.type === "WARN") badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                        if (step.type === "ERROR") badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                        if (step.type === "INFO") badgeClass = "bg-blue-500/10 text-[#3b82f6] border-blue-500/20";

                        nestedStepsHtml += `
                            <div class="border border-[rgba(255,255,255,0.04)] rounded-lg overflow-hidden bg-[#09090b]/40">
                                <div class="inner-accordion-header flex items-center justify-between p-3 cursor-pointer hover:bg-[#27272a]/20 transition select-none">
                                    <div class="flex items-center gap-2">
                                        <span class="font-mono text-[10px] text-zinc-500">${String(idx + 1).padStart(2, '0')}.</span>
                                        <span class="text-[11px] font-medium text-zinc-300">${step.title}</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-[9px] px-1.5 py-0.5 rounded border ${badgeClass} font-mono font-semibold uppercase">${step.type}</span>
                                        <i data-lucide="chevron-right" class="inner-chevron w-3.5 h-3.5 text-zinc-600 transition-transform duration-200"></i>
                                    </div>
                                </div>
                                <div class="inner-accordion-content max-h-0 overflow-hidden transition-all duration-200 ease-in-out">
                                    <div class="p-3 bg-black/40 border-t border-[rgba(255,255,255,0.02)]">
                                        ${step.rawHeader ? `<div class="text-[10px] font-mono text-zinc-500 border-b border-[rgba(255,255,255,0.02)] pb-1.5 mb-1.5">Ham Satır: ${step.rawHeader}</div>` : ''}
                                        <pre class="text-[10px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text">${stepBody || 'Bu adıma ait ekstra detay logu bulunmuyor.'}</pre>
                                    </div>
                                </div>
                            </div>
                        `;
                    });

                    const card = document.createElement("div");
                    card.className = "bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden transition-all duration-300";
                    card.innerHTML = `
                        <div class="accordion-header flex items-center justify-between p-4 cursor-pointer hover:bg-[#27272a]/30 transition select-none">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-lg flex items-center justify-center ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
                                    <i data-lucide="${isSuccess ? 'check-circle' : 'alert-triangle'}" class="w-4 h-4"></i>
                                </div>
                                <div>
                                    <h4 class="text-xs font-semibold text-white">${scenarioName}</h4>
                                    <span class="text-[10px] text-zinc-500">${formattedDate}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="text-[10px] px-2 py-0.5 font-semibold rounded uppercase tracking-wider ${isSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
                                    ${isSuccess ? 'Başarılı' : 'Hata'}
                                </span>
                                <button class="delete-report-btn text-zinc-500 hover:text-red-400 transition p-1.5 rounded-lg hover:bg-red-500/10 focus:outline-none" data-id="${report.id}">
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                </button>
                                <i data-lucide="chevron-down" class="chevron-icon w-4 h-4 text-zinc-500 transition-transform duration-300"></i>
                            </div>
                        </div>

                        <div class="accordion-content max-h-0 overflow-hidden transition-all duration-300 ease-in-out bg-[#09090b]/50 border-t border-[rgba(255,255,255,0)]">
                            <div class="p-4 space-y-3">
                                <!-- 🔴 HATA UYARI KUTUSU BURAYA GELİYOR -->
                                ${errorSummaryHtml}

                                <div class="flex items-center justify-between">
                                    <span class="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">Adım Bazlı Test Akışı</span>
                                    <button class="copy-log-btn text-[10px] text-zinc-500 hover:text-white transition flex items-center gap-1" data-log="${encodeURIComponent(logContent)}">
                                        <i data-lucide="copy" class="w-3 h-3"></i> Ham Logu Kopyala
                                    </button>
                                </div>
                                <div class="space-y-2">${nestedStepsHtml}</div>
                            </div>
                        </div>
                    `;

                    const header = card.querySelector(".accordion-header");
                    const content = card.querySelector(".accordion-content");
                    const chevron = card.querySelector(".chevron-icon");
                    const deleteReportBtn = card.querySelector(".delete-report-btn");

                    // Rapor Silme Olayı! 🔒
                    deleteReportBtn.addEventListener("click", async (e) => {
                        e.stopPropagation(); // Butona tıklayınca akordeon açılmasın, kilit!
                        const reportId = deleteReportBtn.getAttribute("data-id");

                        const confirmDelete = confirm(`Bu test raporunu kalıcı olarak silmek istediğinize emin misiniz?`);
                        if (!confirmDelete) return;

                        try {
                            deleteReportBtn.disabled = true;
                            const deleteRes = await fetch("/api/scenarios/reports/delete", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: reportId })
                            });

                            const deleteResult = await deleteRes.json();
                            if (deleteRes.ok && deleteResult.success) {
                                alert("🎉 Rapor başarıyla buluttan temizlendi!");
                                await loadReports(); // Listeyi yenileyip güncel durumu çekiyoruz
                            } else {
                                alert(`❌ Rapor silinemedi: ${deleteResult.error || "Hata oluştu"}`);
                                deleteReportBtn.disabled = false;
                            }
                        } catch (err) {
                            console.error("Rapor silinirken ağ hatası oluştu:", err);
                            alert("❌ Sunucu bağlantı hatası!");
                            deleteReportBtn.disabled = false;
                        }
                    });

                    header.addEventListener("click", () => {
                        const isOpen = content.style.maxHeight && content.style.maxHeight !== "0px";
                        if (isOpen) {
                            content.style.maxHeight = "0px";
                            content.style.borderTopColor = "transparent";
                            chevron.style.transform = "rotate(0deg)";
                        } else {
                            content.style.maxHeight = "none"; 
                            content.style.borderTopColor = "rgba(255,255,255,0.06)";
                            chevron.style.transform = "rotate(180deg)";
                        }
                    });

                    const innerCards = card.querySelectorAll(".inner-accordion-header");
                    innerCards.forEach(innerHeader => {
                        innerHeader.addEventListener("click", (e) => {
                            e.stopPropagation(); 
                            const innerContent = innerHeader.nextElementSibling;
                            const innerChevron = innerHeader.querySelector(".inner-chevron");
                            const isInnerOpen = innerContent.style.maxHeight && innerContent.style.maxHeight !== "0px";

                            if (isInnerOpen) {
                                innerContent.style.maxHeight = "0px";
                                innerChevron.style.transform = "rotate(0deg)";
                            } else {
                                innerContent.style.maxHeight = innerContent.scrollHeight + "px";
                                innerChevron.style.transform = "rotate(90deg)"; 
                            }
                        });
                    });

                    const copyBtn = card.querySelector(".copy-log-btn");
                    copyBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const rawLog = decodeURIComponent(copyBtn.getAttribute("data-log"));
                        navigator.clipboard.writeText(rawLog);
                        
                        const origHtml = copyBtn.innerHTML;
                        copyBtn.innerHTML = `<span class="text-emerald-400">Kopyalandı!</span>`;
                        setTimeout(() => copyBtn.innerHTML = origHtml, 1500);
                    });

                    accordionContainer.appendChild(card);
                });

                lucide.createIcons();
            } else {
                accordionContainer.innerHTML = "";
                accordionContainer.classList.add("hidden");
                reportsEmpty.classList.remove("hidden");
            }
        } catch (err) {
            console.error("Raporlar listelenirken hata oluştu:", err.message);
        }
    }
    // ⚡ Toplu Testleri Checkbox ve Tıklama Sırasıyla Listeyip Yöneten Fonksiyon
    async function loadBatchScenarios() {
        const batchEmpty = document.getElementById("batch-empty");
        const batchTable = document.getElementById("batch-table");
        const batchList = document.getElementById("batch-list");
        const startBatchBtn = document.getElementById("start-batch-btn");

        if (!batchEmpty || !batchTable || !batchList || !startBatchBtn) return;

        try {
            console.log(`🔄 "${currentProject}" projesi için toplu test senaryoları çekiliyor...`);
            const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(currentProject)}`);
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
                        <td class="py-3 px-4 font-medium text-white">${scenarioName}</td>
                    `;

                    const checkbox = row.querySelector(".batch-checkbox");

                    checkbox.addEventListener("click", () => {
                        if (checkbox.checked) {
                            if (!batchQueue.includes(scenarioName)) {
                                batchQueue.push(scenarioName);
                            }
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
                orderCell.textContent = String(indexInQueue + 1).padStart(2, '0');
                orderCell.className = "py-3 px-4 font-mono text-[#3b82f6] font-bold batch-order-cell";
                row.className = "border-b border-[rgba(59,130,246,0.15)] bg-[#3b82f6]/5 transition h-12";
            } else {
                checkbox.checked = false;
                orderCell.textContent = "-";
                orderCell.className = "py-3 px-4 font-mono text-zinc-500 font-semibold batch-order-cell";
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
        selectedBatchCountLabel.textContent = count;

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

    function updateProjectLabels() {
        currentProjectLabels.forEach(lbl => lbl.textContent = currentProject);
        loadScenarios(); 
        loadReports();
        loadBatchScenarios();
    }

    async function loadProjects() {
        try {
            console.log("Veritabanaından projeler yükleniyor...");
            const res = await fetch("/api/scenarios/projects/list");
            const result = await res.json();
            
            if (result.success && result.projects && result.projects.length > 0) {
                projectDropdown.innerHTML = "";
                result.projects.forEach(projName => {
                    const opt = document.createElement("option");
                    opt.value = projName;
                    opt.textContent = projName;
                    projectDropdown.appendChild(opt);
                });
                
                currentProject = result.projects[0];
                projectDropdown.value = currentProject;
                updateProjectLabels();
            } else {
                projectDropdown.innerHTML = `<option value="dpu">dpu</option>`;
                currentProject = "dpu";
                updateProjectLabels();
            }
        } catch (err) {
            console.error("Projeler yüklenirken hata oluştu:", err);
        }
    }

// Rol bazlı yetkilendirme (ADMIN / PM) 
    async function showDashboard(user) {
        loginView.classList.add("hidden");
        appView.classList.remove("hidden");
        userBadge.textContent = `${user.username.toUpperCase()} (${user.role})`;

        // Rol Elementlerini Yakala 
        const addProjectBtn = document.getElementById("add-project-btn");
        const settingsNavBtn = document.querySelector('[data-target="view-settings"]');

        if (user.role === "PM") {
            if (addProjectBtn) addProjectBtn.classList.add("hidden");
            if (settingsNavBtn) settingsNavBtn.classList.add("hidden");

            // Eğer kazara ayarlar ekranında kaldıysa, senaryolar ekranına zorla yönlendiriyoruz
            const settingsView = document.getElementById("view-settings");
            if (settingsView && !settingsView.classList.contains("hidden")) {
                const scenariosNavBtn = document.querySelector('[data-target="view-scenarios"]');
                if (scenariosNavBtn) scenariosNavBtn.click();
            }
        } else {
            // ADMIN ise her yeri aslanlar gibi açıyoruz 
            if (addProjectBtn) addProjectBtn.classList.remove("hidden");
            if (settingsNavBtn) settingsNavBtn.classList.remove("hidden");
        }

        await loadProjects(); 
    }

    const savedUser = localStorage.getItem("test_user");
    if (savedUser) {
        showDashboard(JSON.parse(savedUser));
    }

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        loginError.classList.add("hidden");
        const username = document.getElementById("login-username").value.trim();
        const password = document.getElementById("login-password").value;

        if ((username === "admin" || username === "pm") && password === "123456") {
            const session = { username, role: username === "admin" ? "ADMIN" : "PM" };
            localStorage.setItem("test_user", JSON.stringify(session));
            showDashboard(session);
        } else {
            loginError.textContent = "Hatalı giriş!";
            loginError.classList.remove("hidden");
        }
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("test_user");
        appView.classList.add("hidden");
        loginView.classList.remove("hidden");
        loginForm.reset();
    });

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            // Güvenlik Önlemi: PM eğer bir şekilde Ayarlar butonuna basmaya çalışırsa engelliyoruz
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            const targetViewId = btn.getAttribute("data-target");

            if (targetViewId === "view-settings" && userSession.role === "PM") {
                alert("⚠️ Bu alana erişim yetkiniz bulunmamaktadır!");
                return;
            }

            navButtons.forEach(b => {
                b.classList.remove("text-[#3b82f6]", "bg-[#3b82f6]/10");
                b.classList.add("text-zinc-400", "hover:bg-[#18181b]");
            });
            btn.classList.add("text-[#3b82f6]", "bg-[#3b82f6]/10");
            btn.classList.remove("text-zinc-400", "hover:bg-[#18181b]");

            views.forEach(v => v.classList.add("hidden"));
            document.getElementById(targetViewId).classList.remove("hidden");
        });
    });

    addProjectBtn.addEventListener("click", () => {
        // Son bir UI güvenlik kilidi
        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
        if (userSession.role === "PM") {
            alert("⚠️ Proje oluşturma yetkiniz bulunmamaktadır!");
            return;
        }
        newProjectNameInput.value = "";
        projectModal.classList.remove("hidden");
        newProjectNameInput.focus();
    });

    closeProjectModal.addEventListener("click", () => projectModal.classList.add("hidden"));

    saveProjectBtn.addEventListener("click", async () => {
        const projectName = newProjectNameInput.value.trim();
        if (!projectName) return alert("Proje adı boş olamaz.");

        const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");

        try {
            const res = await fetch("/api/scenarios/projects/create", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "X-User-Role": userSession.role || "PM" // 🌟 Backend'e rolü fırlatıyoruz!
                },
                body: JSON.stringify({ projectName })
            });
            const result = await res.json();
            if (result.success) {
                projectModal.classList.add("hidden");
                await loadProjects();
                projectDropdown.value = result.projectName;
                currentProject = result.projectName;
                updateProjectLabels();
            } else {
                alert(result.error || "Proje oluşturulamadı.");
            }
        } catch (err) {
            console.error(err);
        }
    });

    saveProjectBtn.addEventListener("click", async () => {
        const projectName = newProjectNameInput.value.trim();
        if (!projectName) return alert("Proje adı boş olamaz.");

        try {
            const res = await fetch("/api/scenarios/projects/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectName })
            });
            const result = await res.json();
            if (result.success) {
                projectModal.classList.add("hidden");
                await loadProjects();
                projectDropdown.value = result.projectName;
                currentProject = result.projectName;
                updateProjectLabels();
            } else {
                alert(result.error || "Proje oluşturulamadı.");
            }
        } catch (err) {
            console.error(err);
        }
    });

    openNewScenarioBtn.addEventListener("click", () => {
        scenarioForm.reset();
        stepsContainer.innerHTML = `
            <div class="flex items-center gap-3 bg-[#27272a]/40 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)]">
                <span class="step-number text-[10px] font-mono text-zinc-500 w-5 text-center">01.</span>
                <input type="text" required placeholder=" "Giriş" butonunu bul " class="step-input flex-1 bg-transparent text-xs text-white outline-none">
                <button type="button" class="remove-step-btn text-zinc-600 hover:text-red-400 transition opacity-0 pointer-events-none"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
        `;
        lucide.createIcons();
        scenarioModal.classList.remove("hidden");
    });

    closeScenarioModal.addEventListener("click", () => scenarioModal.classList.add("hidden"));
    cancelScenarioBtn.addEventListener("click", () => scenarioModal.classList.add("hidden"));

    addStepFieldBtn.addEventListener("click", () => {
        const nextIndex = stepsContainer.children.length + 1;
        const paddedIndex = nextIndex < 10 ? `0${nextIndex}.` : `${nextIndex}.`;

        const stepRow = document.createElement("div");
        stepRow.className = "flex items-center gap-3 bg-[#27272a]/40 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)] animate-slide-in";
        stepRow.innerHTML = `
            <span class="step-number text-[10px] font-mono text-zinc-500 w-5 text-center">${paddedIndex}</span>
            <input type="text" required placeholder="Yeni talimatı girin." class="step-input flex-1 bg-transparent text-xs text-white outline-none">
            <button type="button" class="remove-step-btn text-zinc-500 hover:text-red-400 transition"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        `;

        stepRow.querySelector(".remove-step-btn").addEventListener("click", () => {
            stepRow.remove();
            reindexSteps();
        });

        stepsContainer.appendChild(stepRow);
        lucide.createIcons();
        stepsContainer.scrollTop = stepsContainer.scrollHeight;
    });

    function reindexSteps() {
        Array.from(stepsContainer.children).forEach((row, i) => {
            const index = i + 1;
            row.querySelector(".step-number").textContent = index < 10 ? `0${index}.` : `${index}.`;
        });
    }

    scenarioForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const scenarioName = document.getElementById("new-scenario-name").value.trim();
        const targetUrl = document.getElementById("new-scenario-url").value.trim();
        const submitBtn = document.getElementById("save-scenario-submit-btn");

        const stepInputs = Array.from(document.querySelectorAll(".step-input"));
        const turkishInstructions = stepInputs.map(input => input.value.trim()).join("\n");

        if (!turkishInstructions) return alert("Lütfen en az bir adım talimatı ekleyin.");

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Çevriliyor ve Kaydediliyor...</span>`;

        try {
            const res = await fetch("/api/scenarios/create-and-save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scenarioName,
                    targetUrl,
                    turkishInstructions,
                    projectName: projectDropdown.value
                })
            });

            const result = await res.json();
            if (res.ok && (result.status === "SUCCESS" || result.success)) {
                scenarioModal.classList.add("hidden");
                await loadScenarios(); 
                alert("Başarılı! Senaryo kaydedildi.");
            } else {
                alert(`Hata: ${result.error || "Kayıt başarısız"}`);
            }
        } catch (err) {
            console.error(err);
            alert("İstek esnasında bağlantı hatası patladı.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Kaydet ve Çevir</span>`;
        }
    });

    projectDropdown.addEventListener("change", (e) => {
        currentProject = e.target.value;
        updateProjectLabels();
    });


// ───  DİNAMİK AYARLAR VE ÇOKLU API ANAHTARLARI YÖNETİMİ ───
    const settingsForm = document.getElementById("settings-form");
    const apiKeysContainer = document.getElementById("api-keys-container");
    const addApiKeyBtn = document.getElementById("add-api-key-btn");

    // 🌟 ÇÖZÜM: Statik dizi kirliliğini temizledik, dropdown sadece senin eklediğin anahtarlarla dolacak! 🔒
    function refreshApiDropdowns(selectedRunner = "", selectedTranslator = "") {
        const runnerSelect = document.getElementById("setting-test-runner-api");
        const translatorSelect = document.getElementById("setting-translator-api");
        if (!runnerSelect || !translatorSelect) return;

        const currentRunner = selectedRunner || runnerSelect.value || "";
        const currentTranslator = selectedTranslator || translatorSelect.value || "";

        // Statik "openai" ve "gemini" başlangıçlarını uçurduk. Tamamen boş başlıyor!
        const providers = [];

        // Sadece ekranda aktif olarak ekli olan API sağlayıcı adlarını diziye dolduruyoruz
        document.querySelectorAll(".api-provider-input").forEach(input => {
            const val = input.value.trim().toLowerCase();
            if (val && !providers.includes(val)) {
                providers.push(val);
            }
        });

        // Test Çalıştırıcı dropdown'ını tamamen dinamik olarak render ediyoruz
        runnerSelect.innerHTML = "";
        providers.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p.toUpperCase(); // Örn: OPENAI_API_KEY, GEMINI_API_KEY veya QWEN3:1.7B
            runnerSelect.appendChild(opt);
        });
        
        // Eğer daha önce seçilen değer listede varsa onu seçili yap, yoksa listenin ilk elemanını seç
        if (providers.includes(currentRunner)) {
            runnerSelect.value = currentRunner;
        } else if (providers.length > 0) {
            runnerSelect.value = providers[0];
        }

        // Çeviri Sağlayıcı dropdown'ını tamamen dinamik olarak render ediyoruz
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

    // A. Ayarları Sunucudan Çekip Formu Kilitleyen Fonksiyon
    async function loadSystemSettings() {
        if (!settingsForm) return;

        try {
            console.log("Dinamik sistem ayarları yükleniyor...");
            const res = await fetch("/api/scenarios/settings/get");
            const result = await res.json();

            if (result.success && result.settings) {
                const s = result.settings;

                apiKeysContainer.innerHTML = "";
                if (s.apiKeys) {
                    Object.entries(s.apiKeys).forEach(([provider, details]) => {
                        // Eğer eski sürümden kalan düz string varsa kaza çıkmasın diye fallback yapıyoruz 
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

// B. Dinamik Sağlayıcı, API Key (Şifreli/Göz Butonlu) ve Model Satırı Ekleyen Yardımcı Fonksiyon 
    function addApiKeyRow(provider = "", keyVal = "", modelVal = "") {
        const row = document.createElement("div");
        // responsive grid ve ferah paddingler eklendi 
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
        const eyeIcon = togglePasswordBtn.querySelector("i");

        // Göz butonuna basıldığında input tipini password/text arasında değiştirme sihri 
        togglePasswordBtn.addEventListener("click", () => {
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                togglePasswordBtn.innerHTML = `<i data-lucide="eye-off" class="w-4 h-4"></i>`;
            } else {
                passwordInput.type = "password";
                togglePasswordBtn.innerHTML = `<i data-lucide="eye" class="w-4 h-4"></i>`;
            }
            lucide.createIcons(); // İkonu anında yenileyelim
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

    // C. Ayarları Kaydetme Olayı
    if (settingsForm) {
        settingsForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const saveBtn = document.getElementById("save-settings-btn");
            const originalHtml = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span>Kaydediliyor...</span>`;

            const apiKeys = {};
            const providerInputs = document.querySelectorAll(".api-provider-input");
            const valueInputs = document.querySelectorAll(".api-value-input");
            const modelInputs = document.querySelectorAll(".api-model-input");

            providerInputs.forEach((input, index) => {
                const provider = input.value.trim().toLowerCase(); 
                const keyVal = valueInputs[index].value.trim();
                const modelVal = modelInputs[index].value.trim();
                
                if (provider) {
                    apiKeys[provider] = {
                        key: keyVal,
                        model: modelVal
                    };
                }
            });

            const payload = {
                testRunnerApi: document.getElementById("setting-test-runner-api").value,
                translatorApi: document.getElementById("setting-translator-api").value,
                apiKeys
            };
            
            const userSession = JSON.parse(localStorage.getItem("test_user") || "{}");
            try {
                const res = await fetch("/api/scenarios/settings/save", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json", 
                        "X-User-Role": userSession.role || "PM"
                    },
                    body: JSON.stringify(payload)
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    alert("Başarılı:Sağlayıcı ayarları ve model isimleri diske başarıyla kaydedildi.");
                    await loadSystemSettings();
                } else {
                    alert(`Ayarlar kaydedilemedi: ${result.error || "Hata oluştu"}`);
                }
            } catch (err) {
                console.error("Ayarlar kaydedilirken ağ hatası:", err);
                alert("Sunucu bağlantı hatası!");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalHtml;
            }
        });
    }

    const settingsTabBtn = document.querySelector('[data-target="view-settings"]');
    if (settingsTabBtn) {
        settingsTabBtn.addEventListener("click", loadSystemSettings);
    }
});