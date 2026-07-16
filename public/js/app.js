// document.addEventListener("DOMContentLoaded", () => {
//     lucide.createIcons();

//     // ─── DOM ELEMANLARI ───
//     const loginView = document.getElementById("login-view");
//     const appView = document.getElementById("app-view");
//     const loginForm = document.getElementById("login-form");
//     const loginError = document.getElementById("login-error");
//     const userBadge = document.getElementById("user-badge");
//     const logoutBtn = document.getElementById("logout-btn");
//     const projectDropdown = document.getElementById("project-dropdown");
//     const currentProjectLabels = document.querySelectorAll(".current-project-label");
//     const navButtons = document.querySelectorAll(".nav-btn");
//     const views = document.querySelectorAll(".view-content");

//     // Modaller
//     const projectModal = document.getElementById("project-modal");
//     const addProjectBtn = document.getElementById("add-project-btn");
//     const closeProjectModal = document.getElementById("close-project-modal");
//     const saveProjectBtn = document.getElementById("save-project-btn");
//     const newProjectNameInput = document.getElementById("new-project-name");

//     const scenarioModal = document.getElementById("scenario-modal");
//     const openNewScenarioBtn = document.getElementById("open-new-scenario-btn");
//     const closeScenarioModal = document.getElementById("close-scenario-modal");
//     const cancelScenarioBtn = document.getElementById("cancel-scenario-btn");
//     const scenarioForm = document.getElementById("scenario-form");
//     const stepsContainer = document.getElementById("steps-container");
//     const addStepFieldBtn = document.getElementById("add-step-field-btn");

//     // ─── ⚡ TOPLU TEST KUYRUĞUNU ATEŞLEME ETKİNLİĞİ ───
//     const startBatchBtn = document.getElementById("start-batch-btn");
//     startBatchBtn.addEventListener("click", async () => {
//         if (batchQueue.length === 0) return;

//         const confirmBatch = confirm(`Seçtiğin ${batchQueue.length} senaryo sırasıyla arka arkaya koşturulacak kanka. Emin misin?`);
//         if (!confirmBatch) return;

//         const originalText = startBatchBtn.textContent;
//         startBatchBtn.disabled = true;
//         startBatchBtn.textContent = "Pipeline Çalıştırılıyor...";
//         startBatchBtn.className = "bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm animate-pulse cursor-wait";

//         try {
//             console.log(`⚡ Toplu test pipeline başlatıldı:`, batchQueue);
//             const res = await fetch("/api/scenarios/run-batch", {
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({
//                     scenarioNames: batchQueue,
//                     projectName: projectDropdown.value
//                 })
//             });

//             const result = await res.json();
//             if (res.ok && result.success) {
//                 alert(`🚀 Pipeline başarıyla kuruldu ve arka planda ateşlendi!\n\nTest sonuçları bittikçe "Raporlar" sekmesine düşecek kanka. Oradan anlık takip edebilirsin.`);
//             } else {
//                 alert(`❌ Hata: ${result.error || "Toplu test başlatılamadı."}`);
//             }
//         } catch (err) {
//             console.error("Toplu test tetiklemede bağlantı hatası:", err);
//             alert("❌ Sunucu bağlantı hatası patladı!");
//         } finally {
//             // Kuyruğu temizleyip butonu eski haline getiriyoruz
//             batchQueue = [];
//             loadBatchScenarios(); // Listeyi temizleyelim kanka
//         }
//     });

//     // 🔒 BAŞLANGIÇTA BOŞ BIRAKIYORUZ KANKA (Varsayılan Proje belasını engellemek için!)
//     let currentProject = "";
//     // ⚡ Toplu Testler için Tıklama Sıralı Kuyruk Dizisi kanka
//     let batchQueue = [];

//     // 1. Senaryoları Çekip Tabloya Döken Fonksiyon
//     async function loadScenarios() {
//         // Eğer henüz bir proje seçilmemişse istek atmayı tamamen engelliyoruz!
//         if (!currentProject || currentProject === "Varsayılan Proje") {
//             console.log("⚠️ Geçerli bir proje seçilmediği için senaryo isteği iptal edildi.");
//             return;
//         }

//         const scenariosTable = document.getElementById("scenarios-table");
//         const scenariosEmpty = document.getElementById("scenarios-empty");
//         const scenariosList = document.getElementById("scenarios-list");
//         const scenarioCountLabel = document.querySelector(".scenario-count");

//         if (!scenariosTable || !scenariosEmpty || !scenariosList) return;

//         try {
//             console.log(`🔄 "${currentProject}" projesi için senaryolar buluttan isteniyor...`);
//             const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(currentProject)}`);
//             const result = await res.json();

//             if (result.scenarios && result.scenarios.length > 0) {
//                 scenariosEmpty.classList.add("hidden");
//                 scenariosTable.classList.remove("hidden");
//                 scenariosList.innerHTML = "";
//                 scenarioCountLabel.textContent = result.scenarios.length;

//                 result.scenarios.forEach((scenarioName, index) => {
//                     const row = document.createElement("tr");
//                     row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition";
//                     row.innerHTML = `
//                         <td class="py-3 px-4 font-mono text-zinc-500">${String(index + 1).padStart(2, '0')}</td>
//                         <td class="py-3 px-4 font-medium text-white">${scenarioName}</td>
//                         <td class="py-3 px-4">
//                             <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
//                                 <span class="w-1 h-1 rounded-full bg-zinc-400"></span> Hazır
//                             </span>
//                         </td>
//                         <td class="py-3 px-4 text-right">
//                             <button class="run-single-btn text-[#3b82f6] hover:text-blue-400 font-medium transition mr-3" data-name="${scenarioName}">Testi Koştur</button>
//                             <button class="delete-scenario-btn text-zinc-500 hover:text-red-400 transition" data-name="${scenarioName}"><i data-lucide="trash-2" class="w-3.5 h-3.5 inline"></i></button>
//                         </td>
//                     `;
//                     scenariosList.appendChild(row);
//                 });
//                 // 🔒 TABLODAKİ DİNAMİK BUTONLARIN ETKİNLİK DİNLEYİCİLERİ 🔒

//                 // A. SİLME BUTONLARI (Delete Buttons)
//                 const deleteButtons = document.querySelectorAll(".delete-scenario-btn");
//                 deleteButtons.forEach(btn => {
//                     btn.addEventListener("click", async () => {
//                         const scenarioName = btn.getAttribute("data-name");
//                         const selectedProjName = projectDropdown.value;
                        
//                         // Kullanıcıya emin olup olmadığını soralım kanka, kaza olmasın
//                         const confirmDelete = confirm(`"${scenarioName}" senaryosunu silmek istediğine emin misin kanka?`);
//                         if (!confirmDelete) return;

//                         try {
//                             btn.disabled = true;
//                             const res = await fetch("/api/scenarios/delete", {
//                                 method: "POST",
//                                 headers: { "Content-Type": "application/json" },
//                                 body: JSON.stringify({
//                                     scenarioName,
//                                     projectName: selectedProjName
//                                 })
//                             });

//                             const result = await res.json();
//                             if (res.ok && result.success) {
//                                 alert("🗑️ Senaryo başarıyla buluttan silindi!");
//                                 await loadScenarios(); // Tabloyu tazeleyelim kanka
//                             } else {
//                                 alert(`❌ Silinemedi: ${result.error || "Hata oluştu"}`);
//                                 btn.disabled = false;
//                             }
//                         } catch (err) {
//                             console.error("Silme isteğinde hata patladı:", err);
//                             btn.disabled = false;
//                         }
//                     });
//                 });

                
//                 // B. TESTİ KOŞTUR BUTONLARI (Playwright Tetikleyici Canavar 🔒)
//                 const runButtons = document.querySelectorAll(".run-single-btn");
//                 runButtons.forEach(btn => {
//                     btn.addEventListener("click", async () => {
//                         const scenarioName = btn.getAttribute("data-name");
//                         const selectedProjName = projectDropdown.value;

//                         // Butonun o anki durumunu kilitleyip yükleniyor yapalım kanka
//                         const originalHtml = btn.innerHTML;
//                         btn.disabled = true;
//                         btn.innerHTML = `<span class="text-amber-400 animate-pulse">Koşturuluyor...</span>`;

//                         try {
//                             console.log(`🚀 "${scenarioName}" testi başlatıldı kanka...`);
                            
//                             const res = await fetch("/api/scenarios/run", {
//                                 method: "POST",
//                                 headers: { "Content-Type": "application/json" },
//                                 body: JSON.stringify({
//                                     scenarioName,
//                                     projectName: selectedProjName
//                                 })
//                             });

//                             const result = await res.json();
                            
//                             if (res.ok && result.success) {
//                                 alert(`🎉 Başarılı! "${scenarioName}" testi Playwright ile başarıyla çalıştırıldı ve tamamlandı!`);
//                             } else {
//                                 alert(`❌ Test Başarısız: ${result.error || "Bilinmeyen bir hata oluştu."}\nDetay: ${result.details || ""}`);
//                             }
//                         } catch (err) {
//                             console.error("Test çalıştırma isteğinde hata patladı:", err);
//                             alert("❌ Sunucu bağlantı hatası! Playwright çalıştırılamadı.");
//                         } finally {
//                             // Butonu eski şık haline geri döndürüyoruz kanka
//                             btn.disabled = false;
//                             btn.innerHTML = originalHtml;
//                         }
//                     });
//                 });

//                 lucide.createIcons();
//             } else {
//                 scenarioCountLabel.textContent = "0";
//                 scenariosTable.classList.add("hidden");
//                 scenariosEmpty.classList.remove("hidden");
//             }
//         } catch (err) {
//             console.error("❌ Senaryolar listelenirken hata patladı:", err.message);
//         }
//     }

//     // 📊 DPU Base'den Raporları Çekip İç İçe (Dinamik INFO Bölmeli) Akordeon Olarak Döken Fonksiyon 🔒
//     async function loadReports() {
//         const reportsEmpty = document.getElementById("reports-empty");
//         const accordionContainer = document.getElementById("reports-list-accordion");

//         if (!reportsEmpty || !accordionContainer) return;

//         try {
//             console.log(`🔄 "${currentProject}" projesi için raporlar buluttan isteniyor...`);
//             const res = await fetch(`/api/scenarios/reports/list?project=${encodeURIComponent(currentProject)}`);
//             const result = await res.json();

//             if (result.reports && result.reports.length > 0) {
//                 reportsEmpty.classList.add("hidden");
//                 accordionContainer.classList.remove("hidden");
//                 accordionContainer.innerHTML = "";

//                 result.reports.forEach((report) => {
//                     const isSuccess = report.status === "SUCCESS";
//                     const scenarioName = report.scenario_name || "Bilinmeyen Senaryo";
//                     const logContent = report.log_content || "Log kaydı bulunmuyor.";
//                     const formattedDate = new Date(report.created_at).toLocaleString("tr-TR");

//                     // ─── 🧠 GELİŞMİŞ LOG DİLİMLEME ALGORİTMASI ───
//                     const lines = logContent.split('\n');
//                     const steps = [];
//                     let currentStep = null;

//                     lines.forEach(line => {
//                         const trimmedLine = line.trim();
//                         if (!trimmedLine) return; // Boş satırları atla kanka

//                         // Zaman damgalı INFO:, WARN: veya ERROR: satırlarını yakalayan düzenli ifade (Regex)
//                         // Örn: "[2026-07-16 09:40:26.127 +0300] INFO: act cache hit" satırını yakalar!
//                         const infoRegex = /(?:\[.*?\]\s+)?(INFO|WARN|ERROR):\s*(.*)/i;
//                         const match = trimmedLine.match(infoRegex);

//                         if (match) {
//                             // Eğer daha önceden açık olan bir adım varsa onu paketleyip listeye atıyoruz kanka
//                             if (currentStep) {
//                                 steps.push(currentStep);
//                             }

//                             const logType = match[1].toUpperCase(); // INFO, WARN veya ERROR
//                             const logMessage = match[2].trim();    // "act cache hit" veya "Action: click..." kısmı

//                             // Yeni adımı başlatıyoruz kanka
//                             currentStep = {
//                                 title: logMessage,
//                                 type: logType,
//                                 rawHeader: trimmedLine, // Tam orijinal satırı da içeride saklayalım
//                                 content: []
//                             };
//                         } else {
//                             // Eğer henüz hiçbir INFO satırı gelmediyse, başlangıç loglarını toplamak için bir kap açıyoruz
//                             if (!currentStep) {
//                                 currentStep = {
//                                     title: "Sistem ve Altyapı Başlangıç Logları",
//                                     type: "SYSTEM",
//                                     rawHeader: "",
//                                     content: []
//                                 };
//                             }
//                             // Detay logu olarak satırı ekliyoruz kanka
//                             currentStep.content.push(trimmedLine);
//                         }
//                     });

//                     // Son kalan adımı da içeriye fırlatıyoruz kanka
//                     if (currentStep) {
//                         steps.push(currentStep);
//                     }
//                     // ─── 🧠 ALGORİTMASININ SONU ───

//                     // Her bir dilimlenmiş adım için iç akordeon HTML'i üretiyoruz kanka
//                     let nestedStepsHtml = "";
//                     steps.forEach((step, idx) => {
//                         const stepBody = step.content.join('\n').trim();
                        
//                         // Sistem başlangıcında log yoksa kalabalık etmesin kanka
//                         if (!stepBody && step.type === "SYSTEM") return;

//                         // Log tipine göre şık bir renk etiketi verelim
//                         let badgeClass = "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
//                         if (step.type === "WARN") badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
//                         if (step.type === "ERROR") badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
//                         if (step.type === "INFO") badgeClass = "bg-blue-500/10 text-[#3b82f6] border-blue-500/20";

//                         nestedStepsHtml += `
//                             <div class="border border-[rgba(255,255,255,0.04)] rounded-lg overflow-hidden bg-[#09090b]/40">
//                                 <div class="inner-accordion-header flex items-center justify-between p-3 cursor-pointer hover:bg-[#27272a]/20 transition select-none">
//                                     <div class="flex items-center gap-2">
//                                         <span class="font-mono text-[10px] text-zinc-500">${String(idx + 1).padStart(2, '0')}.</span>
//                                         <span class="text-[11px] font-medium text-zinc-300">${step.title}</span>
//                                     </div>
//                                     <div class="flex items-center gap-2">
//                                         <span class="text-[9px] px-1.5 py-0.5 rounded border ${badgeClass} font-mono font-semibold uppercase">${step.type}</span>
//                                         <i data-lucide="chevron-right" class="inner-chevron w-3.5 h-3.5 text-zinc-600 transition-transform duration-200"></i>
//                                     </div>
//                                 </div>
//                                 <div class="inner-accordion-content max-h-0 overflow-hidden transition-all duration-200 ease-in-out">
//                                     <div class="p-3 bg-black/40 border-t border-[rgba(255,255,255,0.02)]">
//                                         ${step.rawHeader ? `<div class="text-[10px] font-mono text-zinc-500 border-b border-[rgba(255,255,255,0.02)] pb-1.5 mb-1.5">Ham Satır: ${step.rawHeader}</div>` : ''}
//                                         <pre class="text-[10px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap leading-relaxed select-text">${stepBody || 'Bu adıma ait ekstra detay logu bulunmuyor.'}</pre>
//                                     </div>
//                                 </div>
//                             </div>
//                         `;
//                     });

//                     // Ana Dış Akordeon Kartı
//                     const card = document.createElement("div");
//                     card.className = "bg-[#18181b] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden transition-all duration-300";
//                     card.innerHTML = `
//                         <div class="accordion-header flex items-center justify-between p-4 cursor-pointer hover:bg-[#27272a]/30 transition select-none">
//                             <div class="flex items-center gap-3">
//                                 <div class="w-8 h-8 rounded-lg flex items-center justify-center ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
//                                     <i data-lucide="${isSuccess ? 'check-circle' : 'alert-triangle'}" class="w-4 h-4"></i>
//                                 </div>
//                                 <div>
//                                     <h4 class="text-xs font-semibold text-white">${scenarioName}</h4>
//                                     <span class="text-[10px] text-zinc-500">${formattedDate}</span>
//                                 </div>
//                             </div>
//                             <div class="flex items-center gap-3">
//                                 <span class="text-[10px] px-2 py-0.5 font-semibold rounded uppercase tracking-wider ${isSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
//                                     ${isSuccess ? 'Başarılı' : 'Hata'}
//                                 </span>
//                                 <i data-lucide="chevron-down" class="chevron-icon w-4 h-4 text-zinc-500 transition-transform duration-300"></i>
//                             </div>
//                         </div>

//                         <div class="accordion-content max-h-0 overflow-hidden transition-all duration-300 ease-in-out bg-[#09090b]/50 border-t border-[rgba(255,255,255,0)]">
//                             <div class="p-4 space-y-3">
//                                 <div class="flex items-center justify-between">
//                                     <span class="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">Adım Bazlı Test Akışı</span>
//                                     <button class="copy-log-btn text-[10px] text-zinc-500 hover:text-white transition flex items-center gap-1" data-log="${encodeURIComponent(logContent)}">
//                                         <i data-lucide="copy" class="w-3 h-3"></i> Ham Logu Kopyala
//                                     </button>
//                                 </div>
                                
//                                 <div class="space-y-2">
//                                     ${nestedStepsHtml}
//                                 </div>
//                             </div>
//                         </div>
//                     `;

//                     // ─── ↕️ DIŞ AKORDEON TETİKLEYİCİSİ ───
//                     const header = card.querySelector(".accordion-header");
//                     const content = card.querySelector(".accordion-content");
//                     const chevron = card.querySelector(".chevron-icon");

//                     header.addEventListener("click", () => {
//                         const isOpen = content.style.maxHeight && content.style.maxHeight !== "0px";

//                         if (isOpen) {
//                             content.style.maxHeight = "0px";
//                             content.style.borderTopColor = "transparent";
//                             chevron.style.transform = "rotate(0deg)";
//                         } else {
//                             content.style.maxHeight = "none"; 
//                             content.style.borderTopColor = "rgba(255,255,255,0.06)";
//                             chevron.style.transform = "rotate(180deg)";
//                         }
//                     });

//                     // ─── ↕️ İÇ AKORDEON TETİKLEYİCİLERİ ───
//                     const innerCards = card.querySelectorAll(".inner-accordion-header");
//                     innerCards.forEach(innerHeader => {
//                         innerHeader.addEventListener("click", (e) => {
//                             e.stopPropagation(); 
//                             const innerContent = innerHeader.nextElementSibling;
//                             const innerChevron = innerHeader.querySelector(".inner-chevron");
//                             const isInnerOpen = innerContent.style.maxHeight && innerContent.style.maxHeight !== "0px";

//                             if (isInnerOpen) {
//                                 innerContent.style.maxHeight = "0px";
//                                 innerChevron.style.transform = "rotate(0deg)";
//                             } else {
//                                 innerContent.style.maxHeight = innerContent.scrollHeight + "px";
//                                 innerChevron.style.transform = "rotate(90deg)"; 
//                             }
//                         });
//                     });

//                     // Ham Log Kopyalama
//                     const copyBtn = card.querySelector(".copy-log-btn");
//                     copyBtn.addEventListener("click", (e) => {
//                         e.stopPropagation();
//                         const rawLog = decodeURIComponent(copyBtn.getAttribute("data-log"));
//                         navigator.clipboard.writeText(rawLog);
                        
//                         const origHtml = copyBtn.innerHTML;
//                         copyBtn.innerHTML = `<span class="text-emerald-400">Kopyalandı!</span>`;
//                         setTimeout(() => copyBtn.innerHTML = origHtml, 1500);
//                     });

//                     accordionContainer.appendChild(card);
//                 });

//                 lucide.createIcons();
//             } else {
//                 accordionContainer.innerHTML = "";
//                 accordionContainer.classList.add("hidden");
//                 reportsEmpty.classList.remove("hidden");
//             }
//         } catch (err) {
//             console.error("❌ Raporlar listelenirken hata patladı:", err.message);
//         }
//     }

//     // ⚡ Toplu Testleri Checkbox ve Tıklama Sırasıyla Listeyip Yöneten Fonksiyon (Kurşun Geçirmez Hale Getirildi 🔒)
//     async function loadBatchScenarios() {
//         const batchEmpty = document.getElementById("batch-empty");
//         const batchTable = document.getElementById("batch-table");
//         const batchList = document.getElementById("batch-list");
//         const startBatchBtn = document.getElementById("start-batch-btn");

//         if (!batchEmpty || !batchTable || !batchList || !startBatchBtn) return;

//         try {
//             console.log(`🔄 "${currentProject}" projesi için toplu test senaryoları çekiliyor...`);
//             const res = await fetch(`/api/scenarios/list?project=${encodeURIComponent(currentProject)}`);
//             const result = await res.json();

//             // Her proje değiştiğinde veya sayfa yenilendiğinde kuyruğu sıfırlayalım kanka
//             batchQueue = [];
//             updateBatchButtonState();

//             if (result.scenarios && result.scenarios.length > 0) {
//                 batchEmpty.classList.add("hidden");
//                 batchTable.classList.remove("hidden");
//                 batchList.innerHTML = "";

//                 result.scenarios.forEach((scenarioName) => {
//                     const row = document.createElement("tr");
//                     row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition h-12";
//                     row.innerHTML = `
//                         <td class="py-3 px-4">
//                             <input type="checkbox" value="${scenarioName}" class="batch-checkbox w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-[#3b82f6] focus:ring-0 cursor-pointer transition">
//                         </td>
//                         <td class="py-3 px-4 font-mono text-zinc-500 font-semibold batch-order-cell">-</td>
//                         <td class="py-3 px-4 font-medium text-white">${scenarioName}</td>
//                     `;

//                     const checkbox = row.querySelector(".batch-checkbox");

//                     // Tıklama sırasına göre sıralı kuyruk mantığı kanka (click olayı ile tam senkronize 🔒)
//                     checkbox.addEventListener("click", () => {
//                         if (checkbox.checked) {
//                             if (!batchQueue.includes(scenarioName)) {
//                                 batchQueue.push(scenarioName);
//                             }
//                         } else {
//                             batchQueue = batchQueue.filter(name => name !== scenarioName);
//                         }
                        
//                         // Her tıklamada hem UI'ı hem buton durumlarını anında eşitliyoruz
//                         updateBatchTableUI();
//                     });

//                     batchList.appendChild(row);
//                 });
//             } else {
//                 batchTable.classList.add("hidden");
//                 batchEmpty.classList.remove("hidden");
//             }
//         } catch (err) {
//             console.error("❌ Toplu senaryolar yüklenirken hata:", err);
//         }
//     }

//     // Tablodaki sıra numaralarını ve checkbox durumlarını tam senkronize eden yardımcı fonksiyon (Kurşun Geçirmez 🔒)
//     function updateBatchTableUI() {
//         const rows = document.querySelectorAll("#batch-list tr");
//         rows.forEach(row => {
//             const checkbox = row.querySelector(".batch-checkbox");
//             const orderCell = row.querySelector(".batch-order-cell");
//             const scenarioName = checkbox.value;

//             const indexInQueue = batchQueue.indexOf(scenarioName);
//             if (indexInQueue !== -1) {
//                 // Eğer kuyruktaysa: Checkbox'ı işaretle, sırasını yaz ve maviye boya!
//                 checkbox.checked = true;
//                 orderCell.textContent = String(indexInQueue + 1).padStart(2, '0');
//                 orderCell.className = "py-3 px-4 font-mono text-[#3b82f6] font-bold batch-order-cell";
//                 row.className = "border-b border-[rgba(59,130,246,0.15)] bg-[#3b82f6]/5 transition h-12";
//             } else {
//                 // Eğer kuyrukta değilse: Checkbox işaretini kaldır, sırayı sıfırla ve eski sade haline getir!
//                 checkbox.checked = false;
//                 orderCell.textContent = "-";
//                 orderCell.className = "py-3 px-4 font-mono text-zinc-500 font-semibold batch-order-cell";
//                 row.className = "border-b border-[rgba(255,255,255,0.04)] hover:bg-[#18181b]/40 transition h-12";
//             }
//         });

//         updateBatchButtonState();
//     }

//     // Başlat butonunun aktifliğini ve sayısını güncelleyen yardımcı fonksiyon
//     function updateBatchButtonState() {
//         const startBatchBtn = document.getElementById("start-batch-btn");
//         const selectedBatchCountLabel = document.getElementById("selected-batch-count");

//         if (!startBatchBtn) return;

//         const count = batchQueue.length;
//         selectedBatchCountLabel.textContent = count;

//         if (count > 0) {
//             startBatchBtn.disabled = false;
//             startBatchBtn.className = "bg-[#3b82f6] hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition border border-blue-600 flex items-center gap-1.5 shadow-sm cursor-pointer";
//             startBatchBtn.textContent = `Seçilen Test Kuyruğunu Başlat (${count})`;
//         } else {
//             startBatchBtn.disabled = true;
//             startBatchBtn.className = "bg-[#18181b] text-zinc-500 border border-[rgba(255,255,255,0.08)] text-xs font-medium px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-not-allowed";
//             startBatchBtn.textContent = "Seçilen Test Kuyruğunu Başlat (0)";
//         }
//     }

//     function updateProjectLabels() {
//         currentProjectLabels.forEach(lbl => lbl.textContent = currentProject);
//         loadScenarios(); 
//         loadReports();
//         loadBatchScenarios();
//     }

//     // 3. DPU Base Projelerini Yükleyen Fonksiyon (Tam Sıralı kanka 🔒)
//     async function loadProjects() {
//         try {
//             console.log("🔄 DPU Base projeleri yükleniyor...");
//             const res = await fetch("/api/scenarios/projects/list");
//             const result = await res.json();
            
//             if (result.success && result.projects && result.projects.length > 0) {
//                 projectDropdown.innerHTML = "";
//                 result.projects.forEach(projName => {
//                     const opt = document.createElement("option");
//                     opt.value = projName;
//                     opt.textContent = projName;
//                     projectDropdown.appendChild(opt);
//                 });
                
//                 // 🔒 Proje yüklendiği an ilk projeyi setliyoruz
//                 currentProject = result.projects[0];
//                 projectDropdown.value = currentProject;
//                 updateProjectLabels();
//             } else {
//                 projectDropdown.innerHTML = `<option value="dpu">dpu</option>`;
//                 currentProject = "dpu";
//                 updateProjectLabels();
//             }
//         } catch (err) {
//             console.error("❌ Projeler yüklenirken hata oluştu:", err);
//         }
//     }

//     async function showDashboard(user) {
//         loginView.classList.add("hidden");
//         appView.classList.remove("hidden");
//         userBadge.textContent = `${user.username.toUpperCase()} (${user.role})`;
//         await loadProjects(); // 🔒 Tam kilit!
//     }

//     // ─── 🔓 OTURUM KONTROLÜ (AÇILIŞTA) ───
//     const savedUser = localStorage.getItem("test_user");
//     if (savedUser) {
//         showDashboard(JSON.parse(savedUser));
//     }

//     // ─── 🔑 GİRİŞ / ÇIKIS YÖNETİMİ ───
//     loginForm.addEventListener("submit", (e) => {
//         e.preventDefault();
//         loginError.classList.add("hidden");
//         const username = document.getElementById("login-username").value.trim();
//         const password = document.getElementById("login-password").value;

//         if ((username === "admin" || username === "pm") && password === "123456") {
//             const session = { username, role: username === "admin" ? "ADMIN" : "PM" };
//             localStorage.setItem("test_user", JSON.stringify(session));
//             showDashboard(session);
//         } else {
//             loginError.textContent = "Hatalı giriş! admin veya pm deneyin.";
//             loginError.classList.remove("hidden");
//         }
//     });

//     logoutBtn.addEventListener("click", () => {
//         localStorage.removeItem("test_user");
//         appView.classList.add("hidden");
//         loginView.classList.remove("hidden");
//         loginForm.reset();
//     });

//     // ─── 🎛️ SOL MENÜ SEKME DEĞİŞTİRME ───
//     navButtons.forEach(btn => {
//         btn.addEventListener("click", () => {
//             navButtons.forEach(b => {
//                 b.classList.remove("text-[#3b82f6]", "bg-[#3b82f6]/10");
//                 b.classList.add("text-zinc-400", "hover:bg-[#18181b]");
//             });
//             btn.classList.add("text-[#3b82f6]", "bg-[#3b82f6]/10");
//             btn.classList.remove("text-zinc-400", "hover:bg-[#18181b]");

//             const targetViewId = btn.getAttribute("data-target");
//             views.forEach(v => v.classList.add("hidden"));
//             document.getElementById(targetViewId).classList.remove("hidden");
//         });
//     });

//     // ─── 📦 PROJE MODAL ETKİNLİKLERİ ───
//     addProjectBtn.addEventListener("click", () => {
//         newProjectNameInput.value = "";
//         projectModal.classList.remove("hidden");
//         newProjectNameInput.focus();
//     });

//     closeProjectModal.addEventListener("click", () => projectModal.classList.add("hidden"));

//     saveProjectBtn.addEventListener("click", async () => {
//         const projectName = newProjectNameInput.value.trim();
//         if (!projectName) return alert("Proje adı boş olamaz kanka!");

//         try {
//             const res = await fetch("/api/scenarios/projects/create", {
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({ projectName })
//             });
//             const result = await res.json();
//             if (result.success) {
//                 projectModal.classList.add("hidden");
//                 await loadProjects();
//                 projectDropdown.value = result.projectName;
//                 currentProject = result.projectName;
//                 updateProjectLabels();
//             } else {
//                 alert(result.error || "Proje oluşturulamadı.");
//             }
//         } catch (err) {
//             console.error(err);
//         }
//     });

//     // ─── 🧪 SENARYO MODAL ETKİNLİKLERİ ───
//     openNewScenarioBtn.addEventListener("click", () => {
//         scenarioForm.reset();
//         stepsContainer.innerHTML = `
//             <div class="flex items-center gap-3 bg-[#27272a]/40 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)]">
//                 <span class="step-number text-[10px] font-mono text-zinc-500 w-5 text-center">01.</span>
//                 <input type="text" required placeholder="Örn: Akademisyen Girişi isimli butona tıkla" class="step-input flex-1 bg-transparent text-xs text-white outline-none">
//                 <button type="button" class="remove-step-btn text-zinc-600 hover:text-red-400 transition opacity-0 pointer-events-none"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
//             </div>
//         `;
//         lucide.createIcons();
//         scenarioModal.classList.remove("hidden");
//     });

//     closeScenarioModal.addEventListener("click", () => scenarioModal.classList.add("hidden"));
//     cancelScenarioBtn.addEventListener("click", () => scenarioModal.classList.add("hidden"));

//     addStepFieldBtn.addEventListener("click", () => {
//         const nextIndex = stepsContainer.children.length + 1;
//         const paddedIndex = nextIndex < 10 ? `0${nextIndex}.` : `${nextIndex}.`;

//         const stepRow = document.createElement("div");
//         stepRow.className = "flex items-center gap-3 bg-[#27272a]/40 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)] animate-slide-in";
//         stepRow.innerHTML = `
//             <span class="step-number text-[10px] font-mono text-zinc-500 w-5 text-center">${paddedIndex}</span>
//             <input type="text" required placeholder="Yeni talimatı girin kanka..." class="step-input flex-1 bg-transparent text-xs text-white outline-none">
//             <button type="button" class="remove-step-btn text-zinc-500 hover:text-red-400 transition"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
//         `;

//         stepRow.querySelector(".remove-step-btn").addEventListener("click", () => {
//             stepRow.remove();
//             reindexSteps();
//         });

//         stepsContainer.appendChild(stepRow);
//         lucide.createIcons();
//         stepsContainer.scrollTop = stepsContainer.scrollHeight;
//     });

//     function reindexSteps() {
//         Array.from(stepsContainer.children).forEach((row, i) => {
//             const index = i + 1;
//             row.querySelector(".step-number").textContent = index < 10 ? `0${index}.` : `${index}.`;
//         });
//     }

//     // ─── 💾 SENARYO FORMU GÖNDERME ───
//     scenarioForm.addEventListener("submit", async (e) => {
//         e.preventDefault();

//         const scenarioName = document.getElementById("new-scenario-name").value.trim();
//         const targetUrl = document.getElementById("new-scenario-url").value.trim();
//         const submitBtn = document.getElementById("save-scenario-submit-btn");

//         const stepInputs = Array.from(document.querySelectorAll(".step-input"));
//         const turkishInstructions = stepInputs.map(input => input.value.trim()).join("\n");

//         if (!turkishInstructions) return alert("Lütfen en az bir adım talimatı yaz kanka!");

//         submitBtn.disabled = true;
//         submitBtn.innerHTML = `<span>Çevriliyor ve Kaydediliyor...</span>`;

//         try {
//             const res = await fetch("/api/scenarios/create-and-save", {
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({
//                     scenarioName,
//                     targetUrl,
//                     turkishInstructions,
//                     projectName: projectDropdown.value
//                 })
//             });

//             const result = await res.json();
//             if (res.ok && (result.status === "SUCCESS" || result.success)) {
//                 scenarioModal.classList.add("hidden");
//                 await loadScenarios(); 
//                 alert("🎉 Başarılı! Senaryo Gemini ile Stagehand JSON formatına çevrildi ve DPU Base'e mühürlendi!");
//             } else {
//                 alert(`❌ Hata: ${result.error || "Kayıt başarısız"}`);
//             }
//         } catch (err) {
//             console.error(err);
//             alert("İstek esnasında bağlantı hatası patladı kanka.");
//         } finally {
//             submitBtn.disabled = false;
//             submitBtn.innerHTML = `<span>Kaydet ve Çevir</span>`;
//         }
//     });

//     // ─── 🔄 DROPDOWN DEĞİŞİM DİNLEYİCİSİ ───
//     projectDropdown.addEventListener("change", (e) => {
//         currentProject = e.target.value;
//         updateProjectLabels();
//     });
// });


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
    // ⚡ Toplu Testler için Tıklama Sıralı Kuyruk Dizisi kanka
    let batchQueue = [];

    // ─── ⚡ TOPLU TEST KUYRUĞUNU ADIM ADIM ATEŞLEME ETKİNLİĞİ (Gelişmiş Sıralı Akış) ───
    const startBatchBtn = document.getElementById("start-batch-btn");
    startBatchBtn.addEventListener("click", async () => {
        if (batchQueue.length === 0) return;

        const totalTests = batchQueue.length;
        const confirmBatch = confirm(`Seçtiğin ${totalTests} senaryo sırasıyla canlı olarak koşturulacak kanka. Hazır mısın?`);
        if (!confirmBatch) return;

        // 1. Buton durumunu çalışıyor moduna alıyoruz
        startBatchBtn.disabled = true;
        startBatchBtn.className = "bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm animate-pulse cursor-wait";
        
        // Çalıştırılacak kopyasını alıyoruz ki döngü esnasında diziyi manipüle edebilelim
        const activeQueue = [...batchQueue]; 
        console.log("⚡ Canlı Pipeline Başlatıldı kanka. Sıralama:", activeQueue);

        // 2. Her bir testi sırayla (Sequential) koşturuyoruz kanka 🔒
        for (let i = 0; i < activeQueue.length; i++) {
            const scenarioName = activeQueue[i];
            const remainingCount = activeQueue.length - i; // Kalan test sayısı

            // Buton üzerindeki sayıyı dinamik olarak güncelliyoruz kanka!
            startBatchBtn.textContent = `Çalışacak Test Sayısı: ${remainingCount}...`;

            // Tabloda ilgili satırı bulup durum hücresini güncelliyoruz
            const rows = document.querySelectorAll("#batch-list tr");
            let targetOrderCell = null;
            
            rows.forEach(row => {
                const checkbox = row.querySelector(".batch-checkbox");
                if (checkbox && checkbox.value === scenarioName) {
                    targetOrderCell = row.querySelector(".batch-order-cell");
                    // Satırı parlatıp sarı 'Çalışıyor...' durumuna çekiyoruz kanka
                    row.className = "border-b border-amber-500/30 bg-amber-500/5 transition h-12";
                    targetOrderCell.innerHTML = `<span class="text-amber-400 animate-pulse font-bold">Çalışıyor...</span>`;
                }
            });

            try {
                console.log(`🚀 [Pipeline] ${scenarioName} başlatılıyor... (${remainingCount} test kaldı)`);
                
                // Tekil test çalıştırma endpoint'ine istek atıp bitmesini bekliyoruz!
                const res = await fetch("/api/scenarios/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        scenarioName,
                        projectName: projectDropdown.value
                    })
                });

                const result = await res.json();
                
                // Test sonucuna göre tablodaki ilgili satırı yeşile veya kırmızıya boyuyoruz kanka!
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
                console.error(`❌ [Pipeline] ${scenarioName} hataya düştü:`, err);
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

        // 3. Tüm testler bittiğinde butonu sıfırlıyoruz kanka
        alert("⚡ Harika! Seçilen tüm test pipeline adımları koşturuldu ve sonuçlar raporlara mühürlendi!");
        
        batchQueue = []; // Kuyruğu temizle
        updateBatchButtonState(); // Butonu 0 durumuna çek
        await loadReports(); // Raporları anında tazele kanka!
    });


    // 1. Senaryoları Çekip Tabloya Döken Fonksiyon
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

                // A. SİLME BUTONLARI
                const deleteButtons = document.querySelectorAll(".delete-scenario-btn");
                deleteButtons.forEach(btn => {
                    btn.addEventListener("click", async () => {
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown.value;
                        
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
                                await loadScenarios(); 
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

                // B. TEKİL TESTİ KOŞTUR BUTONLARI
                const runButtons = document.querySelectorAll(".run-single-btn");
                runButtons.forEach(btn => {
                    btn.addEventListener("click", async () => {
                        const scenarioName = btn.getAttribute("data-name");
                        const selectedProjName = projectDropdown.value;

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

    // 📊 DPU Base'den Raporları Çekip İç İçe Akordeon Yapan Fonksiyon
    async function loadReports() {
        const reportsEmpty = document.getElementById("reports-empty");
        const accordionContainer = document.getElementById("reports-list-accordion");

        if (!reportsEmpty || !accordionContainer) return;

        try {
            console.log(`🔄 "${currentProject}" projesi için raporlar buluttan isteniyor...`);
            const res = await fetch(`/api/scenarios/reports/list?project=${encodeURIComponent(currentProject)}`);
            const result = await res.json();

            if (result.reports && result.reports.length > 0) {
                reportsEmpty.classList.add("hidden");
                accordionContainer.classList.remove("hidden");
                accordionContainer.innerHTML = "";

                result.reports.forEach((report) => {
                    const isSuccess = report.status === "SUCCESS";
                    const scenarioName = report.scenario_name || "Bilinmeyen Senaryo";
                    const logContent = report.log_content || "Log kaydı bulunmuyor.";
                    const formattedDate = new Date(report.created_at).toLocaleString("tr-TR");

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
                                <i data-lucide="chevron-down" class="chevron-icon w-4 h-4 text-zinc-500 transition-transform duration-300"></i>
                            </div>
                        </div>

                        <div class="accordion-content max-h-0 overflow-hidden transition-all duration-300 ease-in-out bg-[#09090b]/50 border-t border-[rgba(255,255,255,0)]">
                            <div class="p-4 space-y-3">
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
            console.error("❌ Raporlar listelenirken hata patladı:", err.message);
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
            console.error("❌ Toplu senaryolar yüklenirken hata:", err);
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

    projectDropdown.addEventListener("change", (e) => {
        currentProject = e.target.value;
        updateProjectLabels();
    });
});