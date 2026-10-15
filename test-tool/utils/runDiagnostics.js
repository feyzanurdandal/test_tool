import fs from 'node:fs/promises';
import path from 'node:path';
import { uiActionContext, parseUiStep } from './uiActions.js';
export function scenarioSecrets(data) {
    const values=[];
    for(const step of data?.steps||[]) {
        if(step.value && ['fill','press'].includes(step.action))values.push(step.value);
        if(/^(type|fill)\b/i.test(step.instruction||'')) {
            const match=step.instruction.match(/"([^"]+)"/);if(match)values.push(match[1]);
        }
    }
    return [...new Set(values)].filter(Boolean).sort((a,b)=>b.length-a.length);
}
export function redactRunText(text,secrets=[]) {
    let value=String(text||'');
    for(const secret of secrets)value=value.split(secret).join('[GİZLENDİ]').split(JSON.stringify(secret).slice(1,-1)).join('[GİZLENDİ]');
    return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[E-POSTA]')
        .replace(/\b(?:sk-[\w-]+|Bearer\s+[\w.\/-]+)/gi,'[ANAHTAR]');
}
export async function captureRunDiagnostic(page,step,index,error,secrets=[]) {
    const dir=process.env.RUNTIME_DIAGNOSTIC_DIR;
    if(!dir)return;
    await fs.mkdir(dir,{recursive:true,mode:0o700});
    let parsed;try{parsed=parseUiStep(step);}catch{parsed=step;}
    const url=new URL(page.url());url.search='';url.hash='';url.username='';url.password='';
    const metadata={step:index+1,url:url.toString(),title:await page.title().catch(()=>''),action:parsed.action||step.type,target:parsed.target,scope:parsed.scope,position:parsed.position,
        error:redactRunText(error?.message||'STEP_FAILED',secrets).slice(0,1000),
        candidates:uiActionContext(page).candidates.slice(0,80),createdAt:new Date().toISOString()};
    // Mask all user-editable controls. Other page content can still be sensitive:
    // screenshots therefore remain encrypted, project-authorized and short lived.
    try {
        const png=await page.screenshot({mask:[page.locator('input,textarea,[contenteditable="true"]')],fullPage:false,timeout:3000});
        if(png.length<=2*1024*1024)await fs.writeFile(path.join(dir,'screen.png'),png,{mode:0o600});
    } catch {metadata.screenshotUnavailable=true;}
    const sanitized=JSON.parse(JSON.stringify(metadata),(_,value)=>typeof value==='string'?redactRunText(value,secrets):value);
    await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify(sanitized),{mode:0o600});
}
