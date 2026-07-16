// // import { GoogleGenerativeAI } from "@google/generative-ai";
// // import * as dotenv from 'dotenv';
// // dotenv.config();

// // const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// // export async function translateToStagehandJson(turkishInstruction, targetUrl) {
// //     const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

// //     const prompt = `
// //         Sen bir Stagehand otomasyon uzmanısın. Kullanıcının Türkçe komutlarını alıp Stagehand formatında bir JSON nesnesine çevireceksin.
        
// //         Kurallar:
// //         1. Sadece geçerli JSON dön. Başka metin ekleme.
// //         2. 'act', 'observe' ve 'extract' tiplerini kullan.
// //         3. 'extract' tipi için 'field' parametresini mutlaka ekle.
// //         4. !!! ÖNEMLİ: 'instruction' değerlerini mutlaka İNGİLİZCE olarak üret. Stagehand sadece İngilizce komutları anlar.
// //         5. !!! ÖNEMLİ: Hedef URL her zaman "targetUrl" alanına yazılmalı. "Adımlar" kısmı ise sadece işlemlerden oluşmalı.
// //         6. Komutları hedef URL'ye göre sıralı adımlar halinde JSON'a dök.

// //         Format:
// //         {
// //           "targetUrl": "${targetUrl}",
// //           "steps": [
// //             { "type": "act", "instruction": "..." },
// //             { "type": "observe", "instruction": "..." },
// //             { "type": "extract", "instruction": "...", "field": "..." }
// //           ]
// //         }

// //         Türkçe Komutlar: "${turkishInstruction}"
// //     `;

// //     try {
// //         const result = await model.generateContent(prompt);
// //         // JSON formatını temizle (bazı modeller ```json ... ``` şeklinde döner)
// //         const text = result.response.text().replace(/```json|```/g, "").trim();
// //         return JSON.parse(text);
// //     } catch (error) {
// //         console.error("Stagehand JSON çeviri hatası:", error);
// //         return null;
// //     }
// // }


// import { GoogleGenerativeAI } from "@google/generative-ai";
// import { OpenAI } from "openai"; // 🔒 Tam bağımsız OpenAI nesnesi
// import * as fs from 'fs';
// import * as path from 'path';
// import * as dotenv from 'dotenv';
// dotenv.config();

// export async function translateToStagehandJson(turkishInstruction, targetUrl) {
//     const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
    
//     // 1. Varsayılan Ayarlar (Fallback - Eğer ayar dosyası yoksa)
//     let chosenApi = "gemini";
//     let chosenModel = "gemini-1.5-flash";
//     let apiKey = process.env.GEMINI_API_KEY;

//     // 2. settings.json dosyasını hatasız bir şekilde okuyoruz kanka
//     if (fs.existsSync(settingsPath)) {
//         try {
//             const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
//             chosenApi = settings.translatorApi || "gemini";
//             chosenModel = settings.translatorModel || "gemini-1.5-flash";
            
//             if (settings.apiKeys && settings.apiKeys[chosenApi]) {
//                 apiKey = settings.apiKeys[chosenApi];
//             }
//         } catch (err) {
//             console.error("⚠️ Ayarlar dosyası okunurken hata oluştu:", err.message);
//         }
//     }

//     console.log(`⚙️ [Translator Gateway] Aktif Sağlayıcı: ${chosenApi} | Model: ${chosenModel}`);

//     const prompt = `
//         Sen bir Stagehand otomasyon uzmanısın. Kullanıcının Türkçe komutlarını alıp Stagehand formatında bir JSON nesnesine çevireceksin.
        
//         Kurallar:
//         1. Sadece geçerli JSON dön. Başka metin ekleme.
//         2. 'act', 'observe' ve 'extract' tiplerini kullan.
//         3. 'extract' tipi için 'field' parametresini mutlaka ekle.
//         4. !!! ÖNEMLİ: 'instruction' değerlerini mutlaka İNGİLİZCE olarak üret. Stagehand sadece İngilizce komutları anlar.
//         5. !!! ÖNEMLİ: Hedef URL her zaman "targetUrl" alanına yazılmalı. "Adımlar" kısmı ise sadece işlemlerden oluşmalı.
//         6. Komutları hedef URL'ye göre sıralı adımlar halinde JSON'a dök.

//         Format:
//         {
//           "targetUrl": "${targetUrl}",
//           "steps": [
//             { "type": "act", "instruction": "..." },
//             { "type": "observe", "instruction": "..." },
//             { "type": "extract", "instruction": "...", "field": "..." }
//           ]
//         }

//         Türkçe Komutlar: "${turkishInstruction}"
//     `;

//     try {
//         let textResult = "";

//         // 🌟 OpenAI Bloğu kanka
//         if (chosenApi.toLowerCase().includes("openai")) {
//             if (!apiKey) throw new Error("Ayarlar panelinde OpenAI için geçerli bir API Key bulunamadı!");
            
//             // Admin ne yazdıysa o! Sadece kazara eklenen ekleri temizliyoruz
//             const cleanModelName = chosenModel.replace("openai/", "").trim();
//             console.log(`🚀 [OpenAI Direct] İstek fırlatılıyor. Model: ${cleanModelName}`);

//             const openai = new OpenAI({ apiKey: apiKey });
//             const response = await openai.chat.completions.create({
//                 model: cleanModelName,
//                 messages: [{ role: "user", content: prompt }],
//                 temperature: 0.2
//             });
            
//             textResult = response.choices[0].message.content;
//         } else {
//             // 🌟 Google Gemini Bloğu kanka (Tamamen Özgür Bırakıldı! 🔒)
//             if (!apiKey) throw new Error("Ayarlar panelinde Gemini için geçerli bir API Key bulunamadı!");
            
//             // Admin ne yazdıysa milimetrik olarak o modeli kullanıyoruz kanka. Müdahale YOK!
//             let cleanModelName = chosenModel.replace("gemini/", "").trim();
            
//             // Sadece kütüphanenin zorunlu tuttuğu 'models/' prefix'i yoksa en başına ekliyoruz, isme dokunmuyoruz.
//             if (!cleanModelName.startsWith("models/")) {
//                 cleanModelName = `models/${cleanModelName}`;
//             }
            
//             console.log(`🚀 [Gemini Direct] İstek fırlatılıyor. Model: ${cleanModelName}`);

//             const genAI = new GoogleGenerativeAI(apiKey);
//             // v1beta sürümünü kullanarak adminin girdiği spesifik modele istek atıyoruz kanka
//             const model = genAI.getGenerativeModel({ model: cleanModelName });
            
//             const result = await model.generateContent(prompt);
//             textResult = result.response.text();
//         }

//         const cleanJsonText = textResult.replace(/```json|```/g, "").trim();
//         return JSON.parse(cleanJsonText);

//     } catch (error) {
//         console.error("❌ [Translator Gateway Error]:", error.message);
//         return null;
//     }
// }


import { GoogleGenerativeAI } from "@google/generative-ai";
import { OpenAI } from "openai"; // 🔒 OpenAI SDK'sını DPU Qwen API'si için de kullanıyoruz!
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

export async function translateToStagehandJson(turkishInstruction, targetUrl) {
    // 1. Varsayılan Ayarlar (Fallback - Eğer veritabanı boşsa)
    let chosenApi = "gemini";
    let chosenModel = "gemini-3.1-flash-lite";
    let apiKey = process.env.GEMINI_API_KEY;

    // 2. Ayarları DPU Base'den tek sorgu ile çekiyoruz kanka! 🔒
    try {
        console.log("🔄 [Translator Gateway] Aktif sağlayıcı DPU Base'den sorgulanıyor...");
        
        // Önce aktif çeviri sağlayıcısını öğrenelim
        const activeTranslatorRes = await dpu.select('ayarlar', 1, 'ayar_anahtar:eq:translator_api');
        
        if (activeTranslatorRes.success && activeTranslatorRes.data.length > 0) {
            chosenApi = activeTranslatorRes.data[0].ayar_deger;
            
            console.log(`🎯 [Translator Gateway] Aktif Çeviri Sağlayıcısı: ${chosenApi}. Key ve Model tek satırdan yükleniyor...`);
            
            // 🌟 Seçilen sağlayıcının satırını nokta atışı tek seferde çekiyoruz kanka!
            const providerRes = await dpu.select('ayarlar', 1, `ayar_anahtar:eq:${chosenApi}`);

            if (providerRes.success && providerRes.data.length > 0) {
                apiKey = providerRes.data[0].ayar_deger;     // API Key değerimiz
                chosenModel = providerRes.data[0].ayar_model; // Model değerimiz (Yeni kolon!) kilit! 🔒
            }
        }
    } catch (err) {
        console.warn("⚠️ DPU Base ayarları okunurken bir pürüz oluştu, .env fallback aktif:", err.message);
    }

    console.log(`⚙️ [Translator Gateway] Aktif Sağlayıcı: ${chosenApi} | Model: ${chosenModel}`);
    const prompt = `
        You are a Stagehand automation expert. Convert Turkish automation commands into a valid Stagehand JSON object.

        CRITICAL RULES:
        1. Output ONLY valid JSON. No explanations, no markdown blocks (Do NOT write \`\`\`json ... \`\`\`).
        2. Steps must strictly use these types: "act", "observe", "extract".
        3. Translate the ACTION/INSTRUCTION part of the step to ENGLISH.
        4. !!! DOUBLE QUOTES RULE !!!: Any text enclosed in double quotes (e.g., "Öğrenci Girişi", "Şifre") represents a literal UI element name or input value on a Turkish website. 
           DO NOT TRANSLATE ANY TEXT INSIDE DOUBLE QUOTES. Keep them exactly as they are in Turkish.

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

      
        // 🌟 DPU QWEN SERVISI KONTROLÜ
        const isQwenOrLocal = chosenApi.toLowerCase().includes("qwen") || 
                              chosenApi.toLowerCase().includes("local") || 
                              chosenApi.toLowerCase().includes("dpu");

        if (isQwenOrLocal) {
            console.log(`🚀 [DPU Qwen Direct] ai.dpu.edu.tr üzerinden istek fırlatılıyor. Model: ${chosenModel}`);
            
            const dpuAiUrl = "https://ai.dpu.edu.tr/api/chat"; 

            const bodyPayload = {
                model: chosenModel,
                messages: [
                    { role: "user", content: prompt }
                ],
                think: false,
                stream: false,
                options: {
                    temperature: 0.2
                }
            };

            // 🌟 Standart dışı yanıt formatlarını ezmek için doğrudan fetch atıyoruz kanka!
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

            // 🎯 Akıllı Yanıt Çözümleyici kanka:
            if (data.message && data.message.content) {
                // Ollama / DPU AI standart formatı 🔒
                textResult = data.message.content;
            } else if (data.choices && data.choices[0] && data.choices[0].message) {
                // OpenAI standart formatı fallback'i
                textResult = data.choices[0].message.content;
            } else if (data.response) {
                // Ollama /generate fallback'i
                textResult = data.response;
            } else {
                throw new Error("DPU AI sunucusundan gelen yanıt formatı çözümlenemedi!");
            }

        } else if (chosenApi.toLowerCase().includes("openai")) {

        } else if (chosenApi.toLowerCase().includes("openai")) {
            // Bulut OpenAI Modu
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
        } else {
            // Google Gemini Bloğu
            if (!apiKey) throw new Error("Ayarlar panelinde Gemini için geçerli bir API Key bulunamadı!");
            
            let cleanModelName = chosenModel.replace("gemini/", "").replace("models/", "").trim();
            
            if (cleanModelName === "gemini-1.5-pro") {
                cleanModelName = "gemini-1.5-pro-latest";
            } else if (cleanModelName === "gemini-1.5-flash") {
                cleanModelName = "gemini-1.5-flash"; 
            } else if (cleanModelName === "gemini-2.5-flash") {
                cleanModelName = "gemini-2.5-flash";
            }
            
            console.log(`🚀 [Gemini Direct] İstek fırlatılıyor. Model: models/${cleanModelName}`);

            const genAI = new GoogleGenerativeAI(apiKey, { apiVersion: "v1" });
            const model = genAI.getGenerativeModel({ model: cleanModelName });
            
            const result = await model.generateContent(prompt);
            textResult = result.response.text();
        }

        const cleanJsonText = textResult.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanJsonText);

    } catch (error) {
        console.error("❌ [Translator Gateway Error]:", error.message);
        return null;
    }
}