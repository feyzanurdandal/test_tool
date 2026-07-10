
// Adım ekleme
function addStep() {
    const container = document.getElementById('stepsContainer');
    const index = container.children.length + 1;
    const stepDiv = document.createElement('div');
    stepDiv.className = 'step flex gap-2 items-center';
    stepDiv.innerHTML = `
        <span class="text-[10px] font-mono text-[#71717a]">${String(index).padStart(2, '0')}.</span>
        <textarea class="step-instr flex-1 p-2.5 bg-[#27272a] border border-zinc-700 rounded-lg text-xs text-white focus:border-[#3b82f6] outline-none min-h-[60px]" placeholder="Test adımını açıkla (örn: Kullanıcı adı alanına 'admin' yaz)"></textarea>
    `;
    container.appendChild(stepDiv);
}

// Senaryo Kaydetme
async function saveScenario() {
    const steps = [];
    document.querySelectorAll('.step-instr').forEach((textarea, index) => {
        if(textarea.value) steps.push(`${index + 1}. ${textarea.value}`);
    });

    const payload = {
        scenarioName: document.getElementById('scenarioName').value,
        targetUrl: document.getElementById('targetUrl').value,
        turkishInstructions: steps.join('\n')
    };

    const res = await fetch('/api/scenarios/create-and-save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if(res.ok) {
        alert("✅ Başarılı!");
        window.location.href = "/";
    } else {
        alert("❌ Hata!");
    }
}

// Test Çalıştırma
async function runSelected() {
    const scenarioName = document.getElementById('scenarioSelector').value;
    if(!scenarioName) return;
    await fetch('/api/scenarios/run-single', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ scenarioName })
    });
    alert("Test başladı!");
}

// Senaryo Silme
async function deleteSelected() {
    const scenarioName = document.getElementById('scenarioSelector').value;
    if (!scenarioName) return;
    
    if (!confirm(scenarioName + " senaryosunu silmek istediğine emin misin?")) return;

    const res = await fetch('/api/scenarios/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioName })
    });

    if (res.ok) {
        alert("🗑️ Silindi!");
        loadScenarios(); 
    } else {
        alert("❌ Silme hatası!");
    }
}

// Senaryo Listeleme (Dashboard ve Tablo için)
async function loadScenarios() {
    const res = await fetch('/api/scenarios/list');
    const data = await res.json();
    
    // Konsol Seçici Güncelleme
    const selector = document.getElementById('scenarioSelector');
    if(selector) {
        selector.innerHTML = data.scenarios.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    // Üst Sayaç Güncelleme
    const counter = document.getElementById('scenarioCount');
    if(counter) {
        counter.innerText = `${data.scenarios.length} senaryo · Auth Service`;
    }

    // Figma Stili Tablo Çizimi
    const tableBody = document.getElementById('scenarioTableBody');
    if(tableBody) {
        if(data.scenarios.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-xs text-[#71717a]">Henüz test senaryosu eklenmemiş.</td></tr>`;
            return;
        }
        tableBody.innerHTML = data.scenarios.map((s, idx) => `
            <tr class="border-b border-[rgba(255,255,255,0.08)] last:border-0 hover:bg-[#27272a]/20 transition-colors">
                <td class="px-4 py-3 text-[10px] font-mono text-[#71717a]">${idx + 1}</td>
                <td class="px-4 py-3"><span class="text-xs font-medium text-white">${s}</span></td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono border border-zinc-600/30 bg-zinc-700/40 text-zinc-400 rounded">
                        Idle
                    </span>
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="runDirect('${s}')" class="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-[#3b82f6]/10 text-[#3b82f6] border border-[#3b82f6]/20 rounded hover:bg-[#3b82f6]/20 transition font-mono">▶️ Çalıştır</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

// Tablodan doğrudan çalıştırma köprüsü
async function runDirect(name) {
    await fetch('/api/scenarios/run-single', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ scenarioName: name })
    });
    alert(`"${name}" testi arka planda başlatıldı!`);
}

loadScenarios();