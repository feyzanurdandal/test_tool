// Dinamik adım ekleme fonksiyonu
function addStep() {
    const container = document.getElementById('stepsContainer');
    const stepDiv = document.createElement('div');
    stepDiv.className = 'step';
    stepDiv.innerHTML = `
        <select class="step-type">
            <option value="act">Act (Aksiyon)</option>
            <option value="observe">Observe (Gözlem)</option>
            <option value="extract">Extract (Ayıklama)</option>
        </select>
        <input type="text" class="step-instr" placeholder="Talimat (örn: Tıkla, Yaz)">
        <input type="text" class="step-field" placeholder="Değişken Adı (Extract için)">
    `;
    container.appendChild(stepDiv);
}

async function saveScenario() {
    const steps = [];
    document.querySelectorAll('.step').forEach(div => {
        steps.push({
            type: div.querySelector('.step-type').value,
            instruction: div.querySelector('.step-instr').value,
            field: div.querySelector('.step-field').value || null
        });
    });

    const payload = {
        scenarioName: document.getElementById('scenarioName').value,
        targetUrl: document.getElementById('targetUrl').value,
        steps: steps
    };

    const response = await fetch('/api/scenarios/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        alert("Senaryo başarıyla kaydedildi!");
    } else {
        alert("Hata oluştu, kontrol et kanka.");
    }
}

async function runScenario() {
    const scenarioName = document.getElementById('scenarioName').value;
    if (!scenarioName) return alert("Önce bir senaryo adı gir!");

    const response = await fetch('/api/scenarios/run-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioName })
    });

    const result = await response.json();
    alert("Test Sonucu: " + result.status);
}