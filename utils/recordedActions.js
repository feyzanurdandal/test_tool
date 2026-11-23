import { isSafeUrl } from './ipGuard.js';

// Sadece kayıtlı CSS/etiket/rol hedefleri; kayıt içeriği kod olarak çalıştırılmaz.
export async function recordedLocator(page, target) {
    let scope=page;
    for(const selector of target.frames||[])scope=scope.frameLocator(selector);
    const exact=scope.locator(target.selector);
    try { await exact.first().waitFor({state:'visible',timeout:4000}); } catch {}
    if(await exact.count()===1 && await exact.isVisible()) {
        const matches=await exact.evaluate((el,t)=>{
            const normalize=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
            if(t.inputType && el.getAttribute('type')!==t.inputType)return false;
            if(t.role && t.name) {
                const labelled=el.getAttribute('aria-labelledby');
                const actual=el.getAttribute('aria-label') || (labelled && labelled.split(/\s+/).map(id=>document.getElementById(id)?.textContent).join(' ')) || el.textContent;
                return normalize(actual)===normalize(t.name);
            }
            return true;
        },target);
        if(matches)return exact;
    }
    const alternatives=[];
    if(target.label)alternatives.push(scope.getByLabel(target.label,{exact:true}));
    if(target.role && target.name)alternatives.push(scope.getByRole(target.role,{name:target.name,exact:true}));
    for(const loc of alternatives)if(await loc.count()===1 && await loc.isVisible())return loc;
    throw new Error('RECORDED_TARGET_NOT_FOUND_OR_AMBIGUOUS: '+(target.label||target.name||'Kayıtlı eleman'));
}

export async function executeRecordedAction(page, step) {
    if(step.action==='goto') {
        const check=await isSafeUrl(step.value);
        if(!check.safe)throw new Error('RECORDED_URL_BLOCKED: '+check.reason);
        await page.goto(step.value,{waitUntil:'domcontentloaded',timeout:30000});return;
    }
    if(step.action==='assertText') {
        await page.getByText(step.value,{exact:false}).first().waitFor({state:'visible',timeout:10000});return;
    }
    const target=await recordedLocator(page,step.target);
    if(step.action==='click')await target.click({timeout:10000});
    else if(step.action==='fill')await target.fill(step.value,{timeout:10000});
    else if(step.action==='select')await target.selectOption({value:step.value},{timeout:10000});
    else if(step.action==='check')await target.setChecked(step.checked===true,{timeout:10000});
    else if(step.action==='press')await target.press(step.value,{timeout:10000});
}

// Sayfa yeniden yüklendiğinde ve iframe oluştuğunda tekrar kurulur.
export function installRecorderScript() {
    if(window.__ttRecorder)return;
    window.__ttRecorder=true;
    const clean=v=>String(v||'').trim().replace(/\s+/g,' ').slice(0,200);
    const cssPath=element=>{
        if(element.id && !/^(?:ng-|p-\w*\d|.*\d{5,})/.test(element.id)) {
            const id='#'+CSS.escape(element.id);
            if(document.querySelectorAll(id).length===1)return id;
        }
        const parts=[];
        for(let el=element;el && el.nodeType===1;el=el.parentElement){
            let part=el.tagName.toLowerCase();
            for(const attribute of ['data-testid','name','formcontrolname','aria-label']){
                const value=el.getAttribute(attribute);
                if(value){const candidate=part+'['+attribute+'='+JSON.stringify(value)+']';if(document.querySelectorAll(candidate).length===1){parts.unshift(candidate);return parts.join(' > ');}}
            }
            const siblings=el.parentElement?Array.from(el.parentElement.children).filter(x=>x.tagName===el.tagName):[];
            if(siblings.length>1)part+=':nth-of-type('+(siblings.indexOf(el)+1)+')';
            parts.unshift(part);
            if(el.tagName==='BODY')break;
        }
        return parts.join(' > ');
    };
    window.__ttCssPath=cssPath;
    const describe=el=>{
        const aria=el.getAttribute('aria-labelledby');
        const label=clean(el.getAttribute('aria-label') || (aria && aria.split(/\s+/).map(id=>document.getElementById(id)?.textContent).join(' ')) || el.labels?.[0]?.textContent || el.getAttribute('placeholder'));
        const type=el.getAttribute('type')||'';
        const role=el.getAttribute('role') || (el.tagName==='BUTTON'?'button':el.tagName==='A'?'link':'');
        return {selector:cssPath(el),label,role,name:clean(el.getAttribute('aria-label')||el.textContent||label),inputType:type};
    };
    window.__ttDescribe=describe;
    let pending=null,timer;
    const send=step=>{try{window.__ttRecord(step).catch(()=>{});}catch{}};
    const flush=()=>{clearTimeout(timer);if(pending){send(pending);pending=null;}};
    window.__ttFlush=flush;
    const editable=el=>el?.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea');
    document.addEventListener('input',event=>{
        const el=event.target;if(!event.isTrusted || !editable(el))return;
        pending={action:'fill',target:describe(el),value:el.value};clearTimeout(timer);timer=setTimeout(flush,500);
    },true);
    document.addEventListener('focusout',flush,true);
    document.addEventListener('click',event=>{
        if(!event.isTrusted)return;flush();
        const el=event.target.closest('button,a,input,textarea,select,[role=button],[role=option],[role=checkbox],[role=combobox],label')||event.target;
        if(el.matches('body,html'))return;
        if(editable(el)||el.matches('select,input[type=checkbox],input[type=radio],label'))return;
        send({action:'click',target:describe(el)});
    },true);
    document.addEventListener('change',event=>{
        if(!event.isTrusted)return;const el=event.target;flush();
        if(el.matches('select'))send({action:'select',target:describe(el),value:el.value});
        else if(el.matches('input[type=checkbox],input[type=radio]'))send({action:'check',target:describe(el),checked:el.checked});
    },true);
    document.addEventListener('keydown',event=>{
        if(!event.isTrusted || !['Enter','Escape'].includes(event.key))return;flush();
        if(event.target?.matches('input,textarea,[role=combobox]'))send({action:'press',target:describe(event.target),value:event.key});
    },true);
}
