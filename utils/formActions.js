import crypto from 'node:crypto';
const normalize=s=>String(s).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
const optionSelector='[role="option"], option, .p-dropdown-item, .p-multiselect-item, .p-select-option, [data-pc-section="option"]';
const panelSelector='[role="listbox"], .p-dropdown-panel, .p-multiselect-panel, .p-select-overlay, .p-autocomplete-panel';
async function proposal(stagehand,page,instruction) {
    const actions=await stagehand.observe(instruction+' Return exactly one best interaction. Do not perform it or choose a following option.',{page,serverCache:false});
    if(actions.length!==1 || !actions[0].selector)throw new Error('FORM_TARGET_NOT_FOUND: '+instruction);
    return actions[0];
}
async function act(stagehand,page,action) {
    const result=await stagehand.act(action,{page,serverCache:false});
    if(!result.success)throw new Error('FORM_ACTION_FAILED');
}
export function selectOptionIndex(options,mode,value,randomInt=crypto.randomInt) {
    if(!options.length)throw new Error('FORM_OPTIONS_NOT_FOUND: Açılan listede seçilebilir seçenek yok.');
    if(mode==='random')return randomInt(options.length);
    if(mode==='index') {
        if(!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))throw new Error('FORM_INDEX_INVALID');
        const index=Number(value);
        if(index>=options.length)throw new Error('FORM_INDEX_OUT_OF_RANGE: '+value);
        if(options[index].disabled)throw new Error('FORM_OPTION_DISABLED');
        return index;
    }
    const matches=options.map((o,i)=>({o,i})).filter(({o})=>!o.disabled && (mode==='value'?o.value===value:normalize(o.text)===normalize(value)));
    if(matches.length!==1)throw new Error('FORM_OPTION_NOT_FOUND_OR_AMBIGUOUS: '+value+'; metin, değer veya sıra ayarını kontrol edin.');
    return matches[0].i;
}
export function resolveDateFormat(type, placeholder, requested='auto') {
    if(type==='date')return 'YYYY-MM-DD';
    if(requested && requested!=='auto')return requested;
    const hint=String(placeholder||'').toLowerCase().trim();
    if(/^dd\/mm/.test(hint))return 'DD/MM/YYYY';
    if(/^dd\.mm/.test(hint))return 'DD.MM.YYYY';
    if(/^dd-mm/.test(hint))return 'DD-MM-YYYY';
    if(/^yyyy-mm-dd/.test(hint))return 'YYYY-MM-DD';
    return 'MM/DD/YYYY';
}
export function calendarDate(value,format) {
    const text=String(value).trim();let parts=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    let y,m,d;
    if(parts){y=Number(parts[1]);m=Number(parts[2]);d=Number(parts[3]);}
    else {
        const separator=format.includes('.')?'.':format.includes('-')?'-':'/';
        const fields=text.split(separator);
        if(fields.length!==3 || !fields.every(v=>/^\d+$/.test(v)))throw new Error('FORM_DATE_FORMAT: ISO tarih veya seçilen biçime uygun tarih girin.');
        if(format.startsWith('MM')){m=Number(fields[0]);d=Number(fields[1]);y=Number(fields[2]);}
        else if(format.startsWith('DD')){d=Number(fields[0]);m=Number(fields[1]);y=Number(fields[2]);}
        else {y=Number(fields[0]);m=Number(fields[1]);d=Number(fields[2]);}
        if((format.startsWith('YYYY')?fields[0]:fields[2]).length!==4)throw new Error('FORM_DATE_FORMAT: Yılı dört haneli girin.');
    }
    const leap=y%4===0 && (y%100!==0 || y%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(y<1 || y>9999 || m<1 || m>12 || d<1 || d>days[m-1])throw new Error('FORM_DATE_FORMAT: Geçersiz takvim tarihi.');
    return {year:String(y).padStart(4,'0'),month:String(m).padStart(2,'0'),day:String(d).padStart(2,'0')};
}
export function formatCalendarDate(value,format) {
    const {year,month,day}=calendarDate(value,format);
    return format.replace('YYYY',year).replace('MM',month).replace('DD',day);
}

export async function executeFormAction(stagehand,page,field) {
    const context=field.scope?` within the section or dialog named ${JSON.stringify(field.scope)}`:'';
    if(field.action==='fill' || field.action==='date') {
        const action=await proposal(stagehand,page,`Fill the editable field labeled ${JSON.stringify(field.label)}${context} with ${JSON.stringify(field.value)}. Do not submit the form. ${field.action==='date'?'This is a date field. Use only the requested date.':''}`);
        if(!['fill','type','press'].includes(action.method))throw new Error('FORM_FILL_TARGET_INVALID: '+field.label);
        // JSON değerinin model tarafından değiştirilmesini önle.
        if(action.method==='press')throw new Error('FORM_DATE_NOT_EDITABLE: Tarihi elle düzenlenebilir alan biçiminde belirtin veya takvim adımlarını kullanın.');
        const target=page.locator(action.selector);
        const inputType = await target.getAttribute('type');
        const dateFormat = resolveDateFormat(inputType, await target.getAttribute('placeholder'), field.dateFormat);
        let value = field.value;
        if(field.action==='date')value=formatCalendarDate(value,dateFormat);
        if(inputType==='date' && !/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('FORM_DATE_FORMAT: Yerel tarih alanında YYYY-MM-DD kullanın.');
        const keyboard = inputType !== 'date' && (field.typingMode === 'keyboard' || ((!field.typingMode || field.typingMode === 'auto') && field.action === 'date'));
        if (keyboard) {
            await target.fill('', { timeout: 10000 });
            await target.pressSequentially(value, { delay: field.action === 'date' ? 75 : 20, timeout: Math.max(10000, value.length * 25 + 5000) });
            await target.press('Tab');
        } else {
            await target.fill(value, { timeout: 10000 });
            if (field.action === 'date') await target.blur();
        }
        const actual=await target.inputValue();
        if(field.action==='date') {
            let equivalent=false;
            try { equivalent=JSON.stringify(calendarDate(actual,dateFormat))===JSON.stringify(calendarDate(value,dateFormat)); }catch{}
            console.log('[JSON_TARIH]: '+JSON.stringify({field:field.label,format:dateFormat,expected:value,actual}));
            if(!equivalent)throw new Error('FORM_VALUE_NOT_APPLIED: '+field.label+'; biçim='+dateFormat+'; beklenen='+JSON.stringify(value)+'; okunan='+JSON.stringify(actual));
        } else if(actual!==value)throw new Error('FORM_VALUE_NOT_APPLIED: '+field.label);
        console.log('[JSON_ALANI]: '+JSON.stringify({field:field.label,action:field.action}));return;
    }
    if(field.action==='check') {
        if(!['true','false'].includes(field.value))throw new Error('FORM_CHECK_VALUE: true veya false kullanın.');
        const action=await proposal(stagehand,page,`Identify the checkbox labeled ${JSON.stringify(field.label)}${context}.`);
        const target=page.locator(action.selector);
        // Native ve role=checkbox kontrollerinde Playwright durumu doğrular.
        await target.setChecked(field.value==='true',{timeout:10000});
        console.log('[JSON_ALANI]: '+JSON.stringify({field:field.label,action:'check'}));return;
    }
    const action=await proposal(stagehand,page,`Open the dropdown labeled ${JSON.stringify(field.label)}${context}. Only identify its trigger; do not select any option.`);
    const target=page.locator(action.selector);
    const tag=await target.evaluate(el=>el.tagName);
    if(tag==='SELECT') {
        await target.evaluate(async select=>{
            const start=Date.now();let previous='';
            while(Date.now()-start<10000){
                const current=JSON.stringify(Array.from(select.options).map(o=>[o.value,o.textContent,o.disabled]));
                if(!select.disabled && select.getAttribute('aria-busy')!=='true' && Array.from(select.options).some(o=>!o.disabled && o.value!=='' && o.textContent.trim()) && current===previous)return;
                previous=current;await new Promise(resolve=>setTimeout(resolve,100));
            }
            throw new Error('FORM_OPTIONS_NOT_READY: Bağlı listenin seçenekleri yüklenmedi.');
        });
        const options=await target.locator('option').evaluateAll(els=>els.map(el=>({text:el.textContent||'',value:el.value,disabled:el.disabled})));
        const available=field.selectionMode==='random'?options.filter(o=>!o.disabled && o.value!=='' && o.text.trim()):field.selectionMode==='index'?options.filter(o=>o.value!=='' && o.text.trim()):options;
        const chosen=available[selectOptionIndex(available,field.selectionMode,field.value)];
        await target.selectOption({value:chosen.value},{timeout:10000});
        if(await target.inputValue()!==chosen.value)throw new Error('FORM_SELECTION_NOT_APPLIED');
        console.log('[JSON_SECIMI]: '+JSON.stringify({field:field.label,mode:field.selectionMode,selected:chosen.text,value:chosen.value}));return;
    }
    const controls=await target.getAttribute('aria-controls');
    await act(stagehand,page,{...action,method:'click',arguments:[]});
    // Bağlı kutuların ve overlay seçeneklerinin yüklenmesine süre tanı.
    await page.waitForFunction(sel=>Array.from(document.querySelectorAll(sel)).some(el=>el.getClientRects().length>0),optionSelector,{timeout:10000});
    let panels=page.locator(panelSelector).filter({visible:true});
    const leafPanels=[];
    for(let i=0;i<await panels.count();i++){const p=panels.nth(i);if(!await p.locator(panelSelector).filter({visible:true}).count())leafPanels.push(p);}
    if(leafPanels.length===1)panels=leafPanels[0];
    if(controls) {
        const controlled=page.locator('[id]').filter({visible:true});
        for(let i=0;i<await controlled.count();i++) {
            const el=controlled.nth(i);
            if((controls.split(/\s+/)).includes(await el.getAttribute('id')) && await el.locator(optionSelector).count()) {panels=el;break;}
        }
    }
    if(await panels.count()!==1)throw new Error('FORM_LIST_CONTEXT_AMBIGUOUS: İlgili açık liste tek olarak belirlenemedi.');
    const list=panels.first();
    await list.evaluate(async (panel,selector)=>{
        let previous='';const start=Date.now();
        while(Date.now()-start<10000){
            const options=Array.from(panel.querySelectorAll(selector)).filter(el=>el.getClientRects().length>0);
            const current=JSON.stringify(options.map(el=>[el.textContent,el.getAttribute('data-value'),el.getAttribute('aria-disabled')]));
            if(options.length && panel.getAttribute('aria-busy')!=='true' && current===previous)return;
            previous=current;await new Promise(resolve=>setTimeout(resolve,100));
        }
        throw new Error('FORM_OPTIONS_NOT_READY');
    },optionSelector);
    let candidates=list.locator(optionSelector).filter({visible:true});
    // data-pc-section ve role iç içeyse dış seçeneği kullan; iki kez sayma.
    const items=[];
    for(let i=0;i<await candidates.count();i++) {
        const item=candidates.nth(i);
        if(await item.evaluate((el,sel)=>!!el.parentElement?.closest(sel),optionSelector))continue;
        items.push({locator:item,text:(await item.innerText()).trim(),value:await item.getAttribute('data-value') ?? await item.getAttribute('value') ?? await item.getAttribute('data-id'),disabled:await item.getAttribute('aria-disabled')==='true' || await item.evaluate(el=>el.matches(':disabled,.p-disabled,[data-p-disabled="true"]'))});
    }
    const options=field.selectionMode==='random'?items.filter(o=>!o.disabled && o.text && !/^(seçiniz|select|choose)(\.\.\.)?$/i.test(o.text)):items;
    const chosen=options[selectOptionIndex(options,field.selectionMode,field.value)];
    await chosen.locator.click({timeout:10000});
    console.log('[JSON_SECIMI]: '+JSON.stringify({field:field.label,mode:field.selectionMode,selected:chosen.text,value:chosen.value}));
}
