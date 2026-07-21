import { GoogleGenerativeAI } from "@google/generative-ai";
import { OpenAI } from "openai"; 
import * as dotenv from 'dotenv';
import dpu from '../config/dpuService.js';

dotenv.config();

/**
 * Türkçe otomasyon adımlarını Stagehand JSON formatına çeviren ana modüler fonksiyon
 */
export async function translateToStagehandJson(turkishInstruction, targetUrl) {
    // 1. Varsayılan Ayarlar (Fallback - Eğer veritabanı boşsa)
    let chosenApi = "gemini";
    let chosenModel = "gemini-3.1-flash-lite";
    let apiKey = process.env.GEMINI_API_KEY;

    // 2. Ayarları DPU Base'den Çekme (Dinamik ve Kilitlenmesiz İthalat! 🔓)
    try {
        console.log("🔄 [Translator Gateway] Ayarlar DPU Base'den sorgulanıyor...");
        
        // 🌟 KİLİT ÇÖZÜM: circular dependency pürüzünü aşmak için dpuService'i tam ihtiyaç anında dinamik yüklüyoruz!
        const dpuModule = await import('../config/dpuService.js');
        const dpuClient = dpuModule.default || dpuModule;

        const dbResult = await dpuClient.select('ayarlar', 100); 

        if (dbResult.success && dbResult.data && dbResult.data.length > 0) {
            const settingsRows = dbResult.data;

            // Çeviri sağlayıcısını bellekte eşleştirerek buluyoruz
            const activeTranslatorRow = settingsRows.find(r => r.ayar_anahtar === 'translator_api');
            
            if (activeTranslatorRow) {
                chosenApi = activeTranslatorRow.ayar_deger;
                console.log(`🎯 [Translator Gateway] Aktif Çeviri Sağlayıcısı: ${chosenApi}. Key ve Model yükleniyor...`);
                
                // Sağlayıcının API Key ve Model detaylarını buluyoruz
                const providerRow = settingsRows.find(r => r.ayar_anahtar === chosenApi);

                if (providerRow) {
                    apiKey = providerRow.ayar_deger;     
                    chosenModel = providerRow.ayar_model; 
                }
            }
        }
    } catch (err) {
        console.warn("⚠️ DPU Base ayarları okunurken pürüz oluştu, .env fallback aktif:", err.message);
    }

    console.log(`⚙️ [Translator Gateway] Aktif Sağlayıcı: ${chosenApi} | Model: ${chosenModel}`);

    // Ortak Prompt Taslağımız
    const prompt = `
        You are a Stagehand automation expert. Convert Turkish automation commands into a valid Stagehand JSON object.

        CRITICAL RULES:
        1. Output ONLY valid JSON. No explanations, no markdown blocks (Do NOT write \`\`\`json ... \`\`\`).
        2. Steps must strictly use these types: "act", "observe", "extract".
        3. Translate the ACTION/INSTRUCTION part of the step to ENGLISH.
        4. !!! DOUBLE QUOTES RULE (UI Elements & Values Only) !!!: 
           - Only exact, literal Turkish UI text (like button names, input labels: e.g., "Giriş Yap", "Kullanıcı Adı") or input values (e.g., "feyza") must remain in Turkish inside double quotes.
           - General action descriptions (e.g., "the text area", "the search input", "the output field") must be translated entirely to English.
           - Do NOT wrap entire descriptive sentences or long instructions in double quotes. Only wrap the specific target element's label if it exists as-is on the screen.

        Example:
        Turkish Commands: 
        "Giriş yap" butonunu bul
        "Kullanıcı Adı" alanına "feyza" yaz
        "Giriş yap" butonuna tıkla
        
        Target URL: "https://example.com"
        
        JSON Output:
        {
          "targetUrl": "https://example.com",
          "steps": [
            { "type": "observe", "instruction": "Find the button with text \\"Giriş yap\\"" },
            { "type": "act", "instruction": "Type \\"feyza\\" into the input field \\"Kullanıcı Adı\\"" },
            { "type": "act", "instruction": "Click on the button with text \\"Giriş yap\\"" }
          ]
        }

        Now convert this target:
        Turkish Commands: "${turkishInstruction}"
        Target URL: "${targetUrl}"
        JSON Output:
    `;

    try {
        let textResult = "";

        switch (chosenApi.toLowerCase()) {

            // ─── 1. SEÇENEK: CLOUD OPENAI (CHATGPT) ───
            case "openai":
            case "openai_api_key": {
                if (!apiKey) throw new Error("Ayarlar panelinde OpenAI için geçerli bir API Key bulunamadı!");
                
                const cleanModelName = chosenModel.replace("openai/", "").trim();
                console.log(`🚀 [OpenAI Direct] İstek fırlatılıyor. Model: ${cleanModelName}`);

                const openai = new OpenAI({ apiKey: apiKey });
                const response = await openai.chat.completions.create({
                    model: cleanModelName,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.2
                });
                
                textResult = response.choices[0].message.content;
                break;
            }

            // ─── 2. SEÇENEK: GOOGLE GEMINI (VARSAYILAN) ───
            case "gemini":
            case "gemini_api_key":
            default: {
                if (!apiKey) throw new Error("Ayarlar panelinde Gemini için geçerli bir API Key bulunamadı!");
                
                let cleanModelName = chosenModel.replace("gemini/", "").replace("models/", "").trim();
                
                if (cleanModelName === "gemini-1.5-pro") cleanModelName = "gemini-1.5-pro-latest";
                else if (cleanModelName === "gemini-1.5-flash") cleanModelName = "gemini-1.5-flash"; 
                else if (cleanModelName === "gemini-2.5-flash") cleanModelName = "gemini-2.5-flash";
                else if (cleanModelName === "gemini-3.1-flash-lite") cleanModelName = "gemini-3.1-flash-lite";
                
                console.log(`🚀 [Gemini Direct] İstek fırlatılıyor. Model: models/${cleanModelName}`);

                const genAI = new GoogleGenerativeAI(apiKey, { apiVersion: "v1" });
                const model = genAI.getGenerativeModel({ model: cleanModelName });
                
                const result = await model.generateContent(prompt);
                textResult = result.response.text();
                break;
            }

            // ─── 3. SEÇENEK:YEREL QWEN / LOCAL LLM ───
            case "qwen":
            case "qwen3:1.7b":
            case "local":
            case "dpu": {
                console.log(`🚀 [DPU Qwen Direct] ai.dpu.edu.tr üzerinden istek fırlatılıyor. Model: ${chosenModel}`);
                
                const dpuAiUrl = "https://ai.dpu.edu.tr/api/chat"; 
                const bodyPayload = {
                    model: chosenModel,
                    messages: [{ role: "user", content: prompt }],
                    think: false,
                    stream: false,
                    options: { temperature: 0.2 }
                };

                const response = await fetch(dpuAiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(bodyPayload)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`DPU AI Sunucusu hata döndürdü (${response.status}): ${errText}`);
                }

                const data = await response.json();
                console.log("📦 DPU Sunucusundan Gelen Ham Yanıt:", JSON.stringify(data));

                if (data.message && data.message.content) {
                    textResult = data.message.content;
                } else if (data.choices && data.choices[0] && data.choices[0].message) {
                    textResult = data.choices[0].message.content;
                } else if (data.response) {
                    textResult = data.response;
                } else {
                    throw new Error("DPU AI sunucusundan gelen yanıt formatı çözümlenemedi!");
                }
                break;
            }
        }

        const cleanJsonText = textResult.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanJsonText);

    } catch (error) {
        console.error("❌ [Translator Gateway Error]:", error.message);
        return null;
    }
}