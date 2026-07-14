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

    // 🔒 BAŞLANGIÇTA BOŞ BIRAKIYORUZ KANKA (Varsayılan Proje belasını engellemek için!)
    let currentProject = "";

    // 1. Senaryoları Çekip Tabloya Döken Fonksiyon
    async function loadScenarios() {
        // Eğer henüz bir proje seçilmemişse istek atmayı tamamen engelliyoruz!
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
            console.log(`🔄 "${currentProject}" projesi için senaryolar buluttan isteniyor...`);
            const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(currentProject)}`);
            const result = await res.json();

            if (result.scenarios && result.scenarios.length > 0) {
                scenariosEmpty.classList.add("hidden");
                scenariosTable.classList.remove("hidden");
                scenariosList.innerHTML = "";
                scenarioCountLabel.textContent = result.scenarios.length;

                result.scenarios.forEach((scenarioName, index) => {
                    const row = document.createElement("tr");
                    row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition";
                    row.innerHTML = `
                        <td class="py-3 px-4 font-mono text-zinc-500">${String(index + 1).padStart(2, '0')}</td>
                        <td class="py-3 px-4 font-medium text-white">${scenarioName}</td>
                        <td class="py-3 px-4">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                                <span class="w-1 h-1 rounded-full bg-zinc-400"></span> Hazır
                            </span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <button class="run-single-btn text-[#3b82f6] hover:text-blue-400 font-medium transition mr-3" data-name="${scenarioName}">Testi Koştur</button>
                            <button class="delete-scenario-btn text-zinc-500 hover:text-red-400 transition" data-name="${scenarioName}"><i data-lucide="trash-2" class="w-3.5 h-3.5 inline"></i></button>
                        </td>
                    `;
                    scenariosList.appendChild(row);
                });
                // 🔒 TABLODAKİ DİNAMİK BUTONLARIN ETKİNLİK DİNLEYİCİLERİ 🔒

                // A. SİLME BUTONLARI (Delete Buttons)
                const deleteButtons = document.querySelectorAll(".delete-scenario-btn");
                deleteButtons.forEach(btn => {
                    btn.addEventListener("click", async () => {
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown.value;
                        
                        // Kullanıcıya emin olup olmadığını soralım kanka, kaza olmasın
                        const confirmDelete = confirm(`"${scenarioName}" senaryosunu silmek istediğine emin misin kanka?`);
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
                                alert("🗑️ Senaryo başarıyla buluttan silindi!");
                                await loadScenarios(); // Tabloyu tazeleyelim kanka
                            } else {
                                alert(`❌ Silinemedi: ${result.error || "Hata oluştu"}`);
                                btn.disabled = false;
                            }
                        } catch (err) {
                            console.error("Silme isteğinde hata patladı:", err);
                            btn.disabled = false;
                        }
                    });
                });

                
                // B. TESTİ KOŞTUR BUTONLARI (Playwright Tetikleyici Canavar 🔒)
                const runButtons = document.querySelectorAll(".run-single-btn");
                runButtons.forEach(btn => {
                    btn.addEventListener("click", async () => {
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown.value;

                        // Butonun o anki durumunu kilitleyip yükleniyor yapalım kanka
                        const originalHtml = btn.innerHTML;
                        btn.disabled = true;
                        btn.innerHTML = `<span class="text-amber-400 animate-pulse">Koşturuluyor...</span>`;

                        try {
                            console.log(`🚀 "${scenarioName}" testi başlatıldı kanka...`);
                            
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
                                alert(`🎉 Başarılı! "${scenarioName}" testi Playwright ile başarıyla çalıştırıldı ve tamamlandı!`);
                            } else {
                                alert(`❌ Test Başarısız: ${result.error || "Bilinmeyen bir hata oluştu."}\nDetay: ${result.details || ""}`);
                            }
                        } catch (err) {
                            console.error("Test çalıştırma isteğinde hata patladı:", err);
                            alert("❌ Sunucu bağlantı hatası! Playwright çalıştırılamadı.");
                        } finally {
                            // Butonu eski şık haline geri döndürüyoruz kanka
                            btn.disabled = false;
                            btn.innerHTML = originalHtml;
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
            console.error("❌ Senaryolar listelenirken hata patladı:", err.message);
        }
    }

    function updateProjectLabels() {
        currentProjectLabels.forEach(lbl => lbl.textContent = currentProject);
        loadScenarios(); 
    }

    // 3. DPU Base Projelerini Yükleyen Fonksiyon (Tam Sıralı kanka 🔒)
    async function loadProjects() {
        try {
            console.log("🔄 DPU Base projeleri yükleniyor...");
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
                
                // 🔒 Proje yüklendiği an ilk projeyi setliyoruz
                currentProject = result.projects[0];
                projectDropdown.value = currentProject;
                updateProjectLabels();
            } else {
                projectDropdown.innerHTML = `<option value="dpu">dpu</option>`;
                currentProject = "dpu";
                updateProjectLabels();
            }
        } catch (err) {
            console.error("❌ Projeler yüklenirken hata oluştu:", err);
        }
    }

    async function showDashboard(user) {
        loginView.classList.add("hidden");
        appView.classList.remove("hidden");
        userBadge.textContent = `${user.username.toUpperCase()} (${user.role})`;
        await loadProjects(); // 🔒 Tam kilit!
    }

    // ─── 🔓 OTURUM KONTROLÜ (AÇILIŞTA) ───
    const savedUser = localStorage.getItem("test_user");
    if (savedUser) {
        showDashboard(JSON.parse(savedUser));
    }

    // ─── 🔑 GİRİŞ / ÇIKIS YÖNETİMİ ───
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
            loginError.textContent = "Hatalı giriş! admin veya pm deneyin.";
            loginError.classList.remove("hidden");
        }
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("test_user");
        appView.classList.add("hidden");
        loginView.classList.remove("hidden");
        loginForm.reset();
    });

    // ─── 🎛️ SOL MENÜ SEKME DEĞİŞTİRME ───
    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            navButtons.forEach(b => {
                b.classList.remove("text-[#3b82f6]", "bg-[#3b82f6]/10");
                b.classList.add("text-zinc-400", "hover:bg-[#18181b]");
            });
            btn.classList.add("text-[#3b82f6]", "bg-[#3b82f6]/10");
            btn.classList.remove("text-zinc-400", "hover:bg-[#18181b]");

            const targetViewId = btn.getAttribute("data-target");
            views.forEach(v => v.classList.add("hidden"));
            document.getElementById(targetViewId).classList.remove("hidden");
        });
    });

    // ─── 📦 PROJE MODAL ETKİNLİKLERİ ───
    addProjectBtn.addEventListener("click", () => {
        newProjectNameInput.value = "";
        projectModal.classList.remove("hidden");
        newProjectNameInput.focus();
    });

    closeProjectModal.addEventListener("click", () => projectModal.classList.add("hidden"));

    saveProjectBtn.addEventListener("click", async () => {
        const projectName = newProjectNameInput.value.trim();
        if (!projectName) return alert("Proje adı boş olamaz kanka!");

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

    // ─── 🧪 SENARYO MODAL ETKİNLİKLERİ ───
    openNewScenarioBtn.addEventListener("click", () => {
        scenarioForm.reset();
        stepsContainer.innerHTML = `
            <div class="flex items-center gap-3 bg-[#27272a]/40 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)]">
                <span class="step-number text-[10px] font-mono text-zinc-500 w-5 text-center">01.</span>
                <input type="text" required placeholder="Örn: Akademisyen Girişi isimli butona tıkla" class="step-input flex-1 bg-transparent text-xs text-white outline-none">
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
            <input type="text" required placeholder="Yeni talimatı girin kanka..." class="step-input flex-1 bg-transparent text-xs text-white outline-none">
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

    // ─── 💾 SENARYO FORMU GÖNDERME ───
    scenarioForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const scenarioName = document.getElementById("new-scenario-name").value.trim();
        const targetUrl = document.getElementById("new-scenario-url").value.trim();
        const submitBtn = document.getElementById("save-scenario-submit-btn");

        const stepInputs = Array.from(document.querySelectorAll(".step-input"));
        const turkishInstructions = stepInputs.map(input => input.value.trim()).join("\n");

        if (!turkishInstructions) return alert("Lütfen en az bir adım talimatı yaz kanka!");

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
                alert("🎉 Başarılı! Senaryo Gemini ile Stagehand JSON formatına çevrildi ve DPU Base'e mühürlendi!");
            } else {
                alert(`❌ Hata: ${result.error || "Kayıt başarısız"}`);
            }
        } catch (err) {
            console.error(err);
            alert("İstek esnasında bağlantı hatası patladı kanka.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Kaydet ve Çevir</span>`;
        }
    });

    // ─── 🔄 DROPDOWN DEĞİŞİM DİNLEYİCİSİ ───
    projectDropdown.addEventListener("change", (e) => {
        currentProject = e.target.value;
        updateProjectLabels();
    });
});