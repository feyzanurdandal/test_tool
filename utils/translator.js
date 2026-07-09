import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function translateToStagehandJson(turkishInstruction, targetUrl) {
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

    const prompt = `
        Sen bir Stagehand otomasyon uzmanısın. Kullanıcının Türkçe komutlarını alıp Stagehand formatında bir JSON nesnesine çevireceksin.
        
        Kurallar:
        1. Sadece geçerli JSON dön. Başka metin ekleme.
        2. 'act', 'observe' ve 'extract' tiplerini kullan.
        3. 'extract' tipi için 'field' parametresini mutlaka ekle.
        4. !!! ÖNEMLİ: 'instruction' değerlerini mutlaka İNGİLİZCE olarak üret. Stagehand sadece İngilizce komutları anlar.
        5. !!! ÖNEMLİ: Hedef URL her zaman "targetUrl" alanına yazılmalı. "Adımlar" kısmı ise sadece işlemlerden oluşmalı.
        6. Komutları hedef URL'ye göre sıralı adımlar halinde JSON'a dök.

        Format:
        {
          "targetUrl": "${targetUrl}",
          "steps": [
            { "type": "act", "instruction": "..." },
            { "type": "observe", "instruction": "..." },
            { "type": "extract", "instruction": "...", "field": "..." }
          ]
        }

        Türkçe Komutlar: "${turkishInstruction}"
    `;

    try {
        const result = await model.generateContent(prompt);
        // JSON formatını temizle (bazı modeller ```json ... ``` şeklinde döner)
        const text = result.response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(text);
    } catch (error) {
        console.error("Stagehand JSON çeviri hatası:", error);
        return null;
    }
}