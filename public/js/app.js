// Adım ekleme
function addStep() {
    const container = document.getElementById('stepsContainer');
    const stepDiv = document.createElement('div');
    stepDiv.className = 'step';
    stepDiv.innerHTML = `<textarea class="step-instr w-full p-2 border rounded" placeholder="Buraya adım yaz (örn: Giriş yap)"></textarea>`;
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
    if(res.ok) alert("✅ Başarılı!"); else alert("❌ Hata!");
}

// Test Çalıştırma
async function runSelected() {
    const scenarioName = document.getElementById('scenarioSelector').value;
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
        loadScenarios(); // Listeyi güncelle
    } else {
        alert("❌ Silme hatası!");
    }
}

// Senaryo Listeleme (Dashboard için)
async function loadScenarios() {
    const res = await fetch('/api/scenarios/list');
    const data = await res.json();
    const selector = document.getElementById('scenarioSelector');
    if(selector) {
        selector.innerHTML = data.scenarios.map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

loadScenarios();