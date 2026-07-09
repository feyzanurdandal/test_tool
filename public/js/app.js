
// 1. Dinamik adım ekleme fonksiyonu
function addStep() {
    const container = document.getElementById('stepsContainer');
    const stepDiv = document.createElement('div');
    stepDiv.className = 'step'; // CSS için bu sınıfı kullan
    stepDiv.innerHTML = `
        <textarea class="step-instr" placeholder="Buraya Türkçe adımı yaz"></textarea>
    `;
    container.appendChild(stepDiv);
}
// app.js içindeki saveScenario fonksiyonunu bu şekilde değiştir
// 2. Kaydetme Fonksiyonu
async function saveScenario() {
    const nameEl = document.getElementById('scenarioName');
    const urlEl = document.getElementById('targetUrl');
    
    // Güvenlik kontrolü
    if (!nameEl.value || !urlEl.value) {
        alert("Lütfen Senaryo Adı ve Hedef URL alanlarını doldur!");
        return;
    }

    const steps = [];
    document.querySelectorAll('.step-instr').forEach((textarea, index) => {
        if(textarea.value) steps.push(`${index + 1}. ${textarea.value}`);
    });

    if (steps.length === 0) {
        alert("En az bir adım eklemelisin!");
        return;
    }

    const payload = {
        scenarioName: nameEl.value,
        targetUrl: urlEl.value,
        turkishInstructions: steps.join('\n') 
    };

    console.log("📤 Gönderilen Veri:", payload);

    try {
        const response = await fetch('/api/scenarios/create-and-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ Senaryo başarıyla AI ile çevrildi ve kaydedildi!");
        } else {
            alert("❌ Hata: " + (result.error || "Bilinmeyen bir hata"));
        }
    } catch (err) {
        alert("Bağlantı hatası: " + err.message);
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