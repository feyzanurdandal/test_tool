import { testDataSchema } from '../schemas/testData.js';
export function generateValue(value,rule,sequence) {
    if(rule==='fixed') return value;
    const n=BigInt(sequence);
    if(rule==='increment') {
        if(!/^\d+$/.test(value)) throw new Error('Artırılacak değer yalnızca rakam içermelidir.');
        const result=(BigInt(value)+n).toString();
        if(result.length>value.length)throw new Error('Artırılan sayı alan uzunluğunu aşıyor. Başlangıç değerini değiştirin.');
        return result.padStart(value.length,'0');
    }
    if(rule==='email') {
        const at=value.lastIndexOf('@');
        if(at<1 || at===value.length-1)throw new Error('E-posta kuralı için geçerli bir e-posta girin.');
        return value.slice(0,at)+sequence+value.slice(at);
    }
    if(rule==='suffix') {
        const m=value.match(/^(.*?)(\d+)$/);
        return m?m[1]+(BigInt(m[2])+n).toString().padStart(m[2].length,'0'):value+sequence;
    }
    throw new Error('Bilinmeyen veri kuralı.');
}
export function needsSequence(data) {
    return data?.enabled && [...(data.fields||[]),...(data.variables||[])].some(f=>f.rule!=='fixed');
}
export function applyScenarioData(runtime,sequence='0') {
    const data=testDataSchema.parse(runtime.testData||{});
    const values=new Map([...data.fields,...data.variables].map(f=>[f.key,generateValue(f.value,data.enabled?f.rule:'fixed',sequence)]));
    const replace=text=>text.replace(/\{\{data\.([A-Za-z][A-Za-z0-9_]*)\}\}/g,(_,k)=>{
        if(!values.has(k))throw new Error('Bilinmeyen veri değişkeni: '+k);
        return values.get(k);
    });
    return {...runtime,runSequence:sequence,testData:data,steps:runtime.steps.map(s=>s.type==='form'
        ? {...s,form:{...s.form,value:values.get(s.form.key)}}
        : {...s,instruction:replace(s.instruction)})};
}
// JSON form adımları AI çevirisine verilmez; sıraları korunarak doğrudan derlenir.
export async function compileScenarioData(input,data,translate,targetUrl) {
    data=testDataSchema.parse(data||{});
    const fields=new Map(data.fields.map(f=>[f.key,f]));
    const steps=[];let batch=[];
    const flush=async()=>{
        if(!batch.length)return;
        const translated=await translate(batch.join('\n'),targetUrl);
        if(!translated || !Array.isArray(translated.steps))throw new Error('Senaryo çevirisi tamamlanamadı.');
        steps.push(...translated.steps);batch=[];
    };
    const lines=Array.isArray(input)?input:String(input).split('\n');
    for(const line of lines) {
        const match=line.trim().match(/^\[\[FORM:([A-Za-z][A-Za-z0-9_]*)\]\]$/);
        if(!match){if(line.trim())batch.push(line);continue;}
        await flush();const form=fields.get(match[1]);
        if(!form)throw new Error('JSON alanı bulunamadı. Alan ayarlarını yeniden ekleyin: '+match[1]);
        steps.push({type:'form',instruction:form.label,form});
    }
    await flush();
    for(const v of data.variables) {
        if(!steps.some(s=>s.instruction.includes('{{data.'+v.key+'}}')))throw new Error('Veri değişkeni çeviride korunamadı: '+v.key);
    }
    return {steps,testData:data};
}
