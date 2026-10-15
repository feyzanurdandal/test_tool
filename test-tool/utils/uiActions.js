// Browser semantics, independent of Angular/React/component class names.
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function exactUiName(value) {
    const patterns={i:'[iİıI]',ı:'[iİıI]',s:'[sşSŞ]',ş:'[sşSŞ]',g:'[gğGĞ]',ğ:'[gğGĞ]',u:'[uüUÜ]',ü:'[uüUÜ]',o:'[oöOÖ]',ö:'[oöOÖ]',c:'[cçCÇ]',ç:'[cçCÇ]'};
    return new RegExp('^\\s*'+value.trim().toLocaleLowerCase('tr-TR').split(/[\s-]+/).map(w=>Array.from(w).map(c=>patterns[c]||escape(c)).join('')).join('[\\s-]+')+'\\s*$','i');
}
export const normalizeUiName=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const contexts=new WeakMap();
const actionable='button, summary, [onclick]:not(body):not(html), a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="link"], [role="combobox"], [role="option"], [role="menuitem"], [aria-haspopup], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const overlays='[role="listbox"], [role="menu"], [popover]:popover-open';
export function uiActionContext(page) {
    if(!contexts.has(page)) contexts.set(page,{history:[],lastControl:null,overlay:null,candidates:[],lastAction:null});
    return contexts.get(page);
}
export function parseUiStep(step) {
    if(typeof step==='object' && step.action) return {...step};
    const instruction=typeof step==='string'?step:step.instruction;
    const q=[...instruction.matchAll(/"([^"]+)"/g)].map(m=>m[1]);
    const out={...(typeof step==='object'?step:{}),instruction};
    const section=instruction.match(/(?:in|under|within|inside) (?:the )?"([^"]+)"(?: (?:section|header|panel|dialog|popup|menu))?/i);
    if(section) out.scope=section[1];
    if(/top right/i.test(instruction))out.position='top-right';
    else if(/top left/i.test(instruction))out.position='top-left';
    else if(/left (menu|panel)/i.test(instruction))out.position='left';
    if(/^(find|locate)\b/i.test(instruction)&&!/\b(click|type|fill|press)\b/i.test(instruction))throw new Error('UNSUPPORTED_FIND_STEP: Use an action or an explicit visible assertion.');
    if(/^scroll/i.test(instruction))return {...out,action:'scroll',position:/bottom/i.test(instruction)?'bottom':'top'};
    if(/^(type|fill)\b/i.test(instruction)&&q.length)return {...out,action:'fill',control:'input',target:/search (box|field|input)/i.test(instruction)?'search box':q[1],value:q[0]};
    if(/^close (the )?opened (dropdown|list)/i.test(instruction)||/close button (of|in) the opened (dropdown|list)/i.test(instruction))return {...out,action:'close',target:'opened list'};
    if(/^close/i.test(instruction)&&q.length)return {...out,action:'close',control:'button',target:'close',scope:q[0]};
    if(/^(click|find and click)/i.test(instruction)&&q.length) {
        if(/dropdown.*labeled/i.test(instruction))return {...out,action:'open',control:'dropdown',target:q[0]};
        if(/opened (list|overlay|dropdown)|opened dropdown/i.test(instruction))return {...out,action:'select',control:'option',target:q[0],scope:undefined};
        return {...out,action:'click',control:/\bbutton\b/i.test(instruction)?'button':/\blink\b/i.test(instruction)?'link':'text',target:q[0]};
    }
    return out;
}
async function inside(candidate,container) {
    const h=await container.elementHandle();if(!h)return false;
    try{return await candidate.evaluate((el,p)=>p===el||p.contains(el),h);}finally{await h.dispose();}
}
async function usable(items) {
    const result=[];
    for(const m of items)if(await m.isVisible().catch(()=>false)&&await m.isEnabled().catch(()=>false)&&await m.getAttribute('aria-disabled')!=='true'&&await m.evaluate(el=>!el.closest('[inert],[aria-hidden="true"]')).catch(()=>false)) result.push(m);
    return result;
}
async function names(locator) {
    return locator.evaluate(el=>{
        const ids=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);
        const labels=Array.from(el.labels||[]).map(l=>l.textContent||'');
        // Hide decorative descendants when deriving the visible name.
        const copy=el.cloneNode(true);copy.querySelectorAll('i,svg,[aria-hidden="true"],script,style').forEach(n=>n.remove());
        return [el.getAttribute('aria-label'),ids.map(id=>document.getElementById(id)?.textContent||'').join(' '),...labels,copy.textContent,el.getAttribute('placeholder'),el.getAttribute('title'),['button','submit','reset'].includes(el.type)?el.value:null].filter(Boolean);
    });
}
async function freeze(items) {
    const result=[];
    for(const item of items) {
        const handle=typeof item.elementHandle==='function'?await item.elementHandle():item;
        if(handle && await handle.isVisible().catch(()=>false))result.push(handle);
    }
    return result;
}
export async function validateUiProposals(page,proposals,candidates) {
    const indexes=new Set();
    for(const proposal of proposals||[]) {
        if(typeof proposal.selector!=='string')continue;
        let targets;
        try{targets=await page.locator(proposal.selector).all();}catch{continue;}
        for(const target of targets) {
            if(!await target.isVisible().catch(()=>false))continue;
            const handle=await target.elementHandle();if(!handle)continue;
            try {
                for(let i=0;i<candidates.length;i++)if(await candidates[i].evaluate((el,selected)=>el===selected||el.contains(selected),handle).catch(()=>false))indexes.add(i);
            }finally{await handle.dispose();}
        }
    }
    return indexes.size===1?[...indexes][0]:null;
}
async function describe(m,index) {
    const data=await m.evaluate((el,index)=>({index,tag:el.tagName,role:el.getAttribute('role'),type:el.getAttribute('type'),section:el.closest('section,fieldset,[role="region"],[role="dialog"]')?.getAttribute('aria-label')||''}),index);
    return {...data,names:(await names(m)).map(n=>n.slice(0,150)).slice(0,5)};
}
async function explicitScope(page,name) {
    const found=[]; const target=normalizeUiName(name);
    for(const node of await page.locator('section,fieldset,article,nav,aside,form,dialog,[role="dialog"],[role="region"],[role="group"],[role="navigation"]').all()) {
        if(!await node.isVisible())continue;
        const labels=await node.evaluate(el=>[el.getAttribute('aria-label'),...(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent),...Array.from(el.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > legend,:scope > [role="heading"]')).map(e=>e.textContent)].filter(Boolean));
        if(labels.some(s=>normalizeUiName(s)===target))found.push(node);
    }
    // Non-semantic layouts: the nearest container around an exact heading/label,
    // stopping before BODY so a requested section never becomes the whole page.
    if(!found.length)for(const heading of await page.getByText(exactUiName(name),{exact:true}).all()) {
        if(!await heading.isVisible())continue;
        const group=heading.locator('xpath=ancestor::*[not(self::body) and not(self::html)][.//button or .//input or .//select or .//*[@role="combobox"] or .//*[@role="button"] or .//*[@aria-haspopup]][1]');
        if(await group.count())found.push(group);
    }
    return found;
}
async function constrain(page,matches,step,context) {
    if(step.scope) {
        const scopes=await explicitScope(page,step.scope),scoped=[];
        for(const m of matches)if((await Promise.all(scopes.map(s=>inside(m,s)))).some(Boolean))scoped.push(m);
        matches=scoped; // Never silently discard an explicit scope.
    }
    const dialogs=await usable(await page.locator('[role="dialog"],dialog[open],[aria-modal="true"]').all());
    if(dialogs.length) {
        const scoped=[];
        for(const m of matches) {
            const inDialog=(await Promise.all(dialogs.map(d=>inside(m,d)))).some(Boolean);
            const ownedPortal=context.overlay && await context.overlay.isVisible().catch(()=>false) && await inside(m,context.overlay).catch(()=>false) && context.lastControl && (await Promise.all(dialogs.map(d=>inside(context.lastControl,d).catch(()=>false)))).some(Boolean);
            if(inDialog||ownedPortal)scoped.push(m);
        }
        matches=scoped;
    }
    if(step.position && matches.length>1) {
        const viewport=page.viewportSize()||{width:1280,height:720};const positioned=[];
        for(const m of matches) {
            const box=await m.boundingBox();if(!box)continue;
            const x=box.x+box.width/2,y=box.y+box.height/2;
            if((!step.position.includes('right')||x>=viewport.width/2)&&(!step.position.includes('left')||x<viewport.width/2)&&(!step.position.includes('top')||y<viewport.height/2)&&(!step.position.includes('bottom')||y>=viewport.height/2))positioned.push(m);
        }
        // Position is a preference; absolute scope/name remain the hard constraint.
        if(positioned.length)matches=positioned;
    }
    return matches;
}
async function resolve(page,pool,step,settings,context,{labels=false,generic=false}={}) {
    const deadline=Date.now()+(settings.timeout??10000); let matches=[],nameMatches=[];
    while(Date.now()<deadline) {
        const all=await usable(await pool.all());
        const tiers=[[],[],[]]; const target=normalizeUiName(step.target);
        for(const m of all) {
            const ns=(await names(m)).map(normalizeUiName);
            if(labels && !ns.some(n=>n===target))continue;
            const tier=generic?0:ns.some(n=>n===target)?0:ns.some(n=>(' '+n+' ').includes(' '+target+' '))?1:2;
            tiers[tier].push(m);
        }
        nameMatches=[...tiers[0],...tiers[1]];
        for(let tier=0;tier<2;tier++) {
            matches=await constrain(page,tiers[tier],step,context);
            if(matches.length)break;
        }
        if(matches.length)break;
        await page.waitForTimeout(100);
    }
    let fallback=false;
    if(!matches.length) {
        fallback=true;
        matches=await constrain(page,await usable(await pool.all()),step,context);
    }
    matches=await freeze(matches);
    context.candidates=await Promise.all(matches.slice(0,80).map(describe));
    if(!matches.length && nameMatches.length)context.candidates=(await Promise.all(nameMatches.slice(0,80).map(describe))).map(c=>({...c,excludedByContext:true}));
    if(matches.length>80)throw new Error('TOO_MANY_TARGETS: Refine the section or target.');
    if(!fallback && matches.length===1)return matches[0];
    if(matches.length && settings.disambiguate) {
        const index=await settings.disambiguate({instruction:step.instruction,step:{action:step.action,target:step.target,scope:step.scope,position:step.position},candidates:context.candidates,locators:matches,history:context.history.slice(-4),fallback});
        if(Number.isInteger(index)&&index>=0&&index<matches.length)return matches[index];
    }
    throw new Error(matches.length && !fallback?'AMBIGUOUS_TARGET: AI did not resolve uniquely.':'TARGET_NOT_FOUND: '+(step.control||'control')+' '+step.target);
}
async function labelledControl(page,step,settings,context) {
    const selector=step.control==='dropdown'?'select,[role="combobox"],[aria-haspopup="listbox"]':'input:not([type="hidden"]),textarea,[contenteditable="true"]';
    // Preserve browser label associations; then support visual labels in plain div layouts.
    const named=await usable(await page.getByLabel(exactUiName(step.target)).all());
    const qualified=[];
    for(const m of named)if(await m.evaluate((el,sel)=>el.matches(sel),selector))qualified.push(m);
    if(qualified.length) {
        const scoped=await constrain(page,qualified,step,context);
        if(scoped.length===1)return (await freeze(scoped))[0];
        if(scoped.length>1)return resolve(page,page.locator(selector),step,settings,context,{labels:true});
    }
    const groups=[];
    for(const label of await page.getByText(exactUiName(step.target),{exact:true}).all()) {
        if(!await label.isVisible())continue;
        const group=label.locator(`xpath=ancestor::*[not(self::body) and not(self::html)][.//input or .//textarea or .//select or .//*[@role="combobox"] or .//*[@aria-haspopup="listbox"] or .//*[@contenteditable="true"]][1]`);
        for(const m of await usable(await group.locator(selector).all()))groups.push(m);
    }
    if(groups.length) {
        const scoped=await freeze(await constrain(page,groups,step,context));
        if(scoped.length===1)return (await freeze(scoped))[0];
        context.candidates=await Promise.all(scoped.map(describe));
        if(scoped.length && settings.disambiguate) {
            const index=await settings.disambiguate({instruction:step.instruction,candidates:context.candidates,locators:scoped,history:context.history.slice(-4)});
            if(Number.isInteger(index)&&index>=0&&index<scoped.length)return scoped[index];
        }
        if(scoped.length>1)throw new Error('AMBIGUOUS_TARGET: labelled control');
    }
    return resolve(page,page.locator(selector),step,settings,context);
}
async function waitUntil(page,predicate,timeout=10000) {
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline) {if(await predicate())return;await page.waitForTimeout(100);}
    throw new Error('EFFECT_NOT_VERIFIED: Expected UI change was not observed.');
}
async function overlayContainer(overlay) {
    // Search fields can be siblings of a semantic listbox (common portal layout).
    const parent=overlay.locator('..');
    const suitable=await parent.evaluate(el=>!['BODY','HTML'].includes(el.tagName) && el.querySelectorAll('[role="listbox"],[role="menu"]').length===1 && !!el.querySelector('input:not([type="hidden"]),[role="searchbox"]'));
    return suitable?parent:overlay;
}
async function ownedOverlay(page,context,timeout) {
    if(context.overlay && await context.overlay.isVisible().catch(()=>false))return context.overlay;
    const visible=await usable(await page.locator(overlays).all());
    if(visible.length===1) {context.overlay=await overlayContainer(visible[0]);return context.overlay;}
    throw new Error('OPEN_LIST_NOT_FOUND: Open a unique dropdown first.');
}
export async function executeUiAction(page,rawStep,nextInstruction='',settings={}) {
    const step=parseUiStep(rawStep),context=uiActionContext(page);context.candidates=[];
    const timeout=settings.timeout??10000;
    if(!step.action)return false;
    const actionOptions={timeout};
    let target;
    if(step.action==='scroll') {
        await page.evaluate(pos=>{
            const nodes=[document.scrollingElement,...document.querySelectorAll('*')].filter(el=>el && el.scrollHeight>el.clientHeight+8 && ['auto','scroll'].includes(getComputedStyle(el).overflowY));
            if(document.scrollingElement&&!nodes.includes(document.scrollingElement))nodes.push(document.scrollingElement);
            nodes.forEach(el=>el.scrollTop=pos==='bottom'?el.scrollHeight:0);
        },step.position); // deterministic, no cached AI selector
    } else if(step.action==='fill' || step.action==='press') {
        if(step.target==='search box') {
            const overlay=await ownedOverlay(page,context,timeout);
            target=await resolve(page,overlay.locator('input:not([type="hidden"]),[role="searchbox"]'),{...step,scope:undefined},settings,context,{generic:true});
        } else target=await labelledControl(page,{...step,control:'input'},settings,context);
        if(step.action==='press') {
            if(!['Enter','Tab','Escape','ArrowDown','ArrowUp','Space'].includes(step.value))throw new Error('UNSUPPORTED_KEY');
            await target.press(step.value,actionOptions);
        } else {
            await target.fill(step.value,actionOptions);
            const actual=await target.evaluate(el=>el.isContentEditable?el.textContent:el.value);
            if(actual!==step.value)throw new Error('INPUT_VERIFICATION_FAILED');
            if(typeof rawStep==='string' && /press Enter/i.test(rawStep)&&!/opened (list|overlay|dropdown)/i.test(nextInstruction))await target.press('Enter',actionOptions);
        }
    } else if(step.action==='open') {
        target=await labelledControl(page,{...step,control:'dropdown'},settings,context);context.lastControl=target;
        if(await target.evaluate(el=>el.tagName==='SELECT'))context.overlay=target;
        else {
            const before=await usable(await page.locator(overlays).all());
            if(await target.getAttribute('aria-expanded')!=='true')await target.click(actionOptions);
            await waitUntil(page,async()=>{
                const id=await target.getAttribute('aria-controls')||await target.getAttribute('aria-owns');
                if(id) {
                    const controlled=page.locator('[id='+JSON.stringify(id.split(/\s+/)[0])+']');
                    if(await controlled.isVisible().catch(()=>false)) {context.overlay=await overlayContainer(controlled);return true;}
                }
                const opened=[];
                for(const o of await usable(await page.locator(overlays).all())) {
                    if(!(await Promise.all(before.map(b=>inside(o,b)))).some(Boolean))opened.push(o);
                }
                if(opened.length===1){context.overlay=await overlayContainer(opened[0]);return true;}
                return false;
            },timeout);
        }
    } else if(step.action==='select') {
        const overlay=await ownedOverlay(page,context,timeout);
        if(await overlay.evaluate(el=>el.tagName==='SELECT')) {
            const options=typeof overlay.locator==='function'?await overlay.locator('option').all():await overlay.$$('option');const exact=[];
            for(const option of options)if(normalizeUiName(await option.textContent())===normalizeUiName(step.target))exact.push(option);
            if(exact.length!==1)throw new Error('AMBIGUOUS_OR_MISSING_NATIVE_OPTION');
            const value=await exact[0].getAttribute('value')??await exact[0].textContent();
            await overlay.selectOption({label:await exact[0].textContent()},actionOptions);
            if(await overlay.inputValue()!==value)throw new Error('SELECTION_VERIFICATION_FAILED');
        } else {
            target=await resolve(page,overlay.locator('[role="option"],[role="menuitem"],li,button,[tabindex],[onclick]:not(body):not(html)'),{...step,scope:undefined},settings,context);
            const selectionText=control=>control.evaluate(el=>[el.value,el.getAttribute('aria-valuetext'),el.textContent].filter(Boolean).join(' '));
            const before=context.lastControl?await selectionText(context.lastControl):null;
            await target.click(actionOptions);
            await waitUntil(page,async()=>{
                const selected=await target.getAttribute('aria-selected').catch(()=>null)==='true'||await target.getAttribute('aria-checked').catch(()=>null)==='true'||await target.evaluate(el=>!!el.querySelector('input:checked'));
                const after=context.lastControl?await selectionText(context.lastControl).catch(()=>null):null;
                const named=after && normalizeUiName(after).includes(normalizeUiName(step.target)) && after!==before;
                return selected || !!named;
            },timeout); // Closing the list alone is NOT proof of correct selection.
        }
    } else if(step.action==='close' && step.target==='opened list') {
        const overlay=await ownedOverlay(page,context,timeout);
        await page.keyboard.press('Escape');
        // Custom menus may use a close button, but don't toggle/reopen the trigger.
        if(await overlay.isVisible().catch(()=>false)) {
            const close=overlay.getByRole('button',{name:/^(close|kapat|×|x)$/i});
            const visible=await usable(await close.all());
            if(visible.length===1)await visible[0].click(actionOptions);
        }
        await waitUntil(page,async()=>!await overlay.isVisible().catch(()=>false),timeout);context.overlay=null;
    } else {
        const selector=step.control==='button'||step.action==='close'?'button,[role="button"],input[type="button"],input[type="submit"],a[href],summary,[onclick]:not(body):not(html)':step.control==='link'?'a[href],[role="link"]':actionable;
        target=await resolve(page,page.locator(selector),step,settings,context);
        const closing=step.action==='close'?await explicitScope(page,step.scope||step.target):[];
        await target.click(actionOptions); // One click, never replay a save/delete on uncertain effects.
        if(step.action==='close' && closing.length)await waitUntil(page,async()=>!(await Promise.all(closing.map(s=>s.isVisible().catch(()=>false)))).some(Boolean),timeout);
    }
    context.lastAction={action:step.action,target:step.target,scope:step.scope};
    context.history.push(context.lastAction);context.history=context.history.slice(-10);
    if(step.expect)await verifyUiExpectation(page,step.expect,settings);
    return true;
}
export async function verifyUiExpectation(page,expected,settings={}) {
    const context=uiActionContext(page),timeout=settings.timeout??10000;
    await waitUntil(page,async()=>{
        if(expected.kind==='url')return page.url()===expected.value;
        const step={action:'assert',target:expected.target,scope:expected.scope};
        let candidates=await page.getByText(exactUiName(expected.target),{exact:true}).all();
        if(expected.kind==='text') {
            const labelled=await page.getByLabel(exactUiName(expected.target)).all();
            if(labelled.length)candidates=labelled;
        }
        if(['value','selected'].includes(expected.kind))candidates=await page.getByLabel(exactUiName(expected.target)).all();
        if(expected.scope) {
            const scopes=await explicitScope(page,expected.scope),scoped=[];
            if(!scopes.length)return false;
            for(const c of candidates)if((await Promise.all(scopes.map(s=>inside(c,s)))).some(Boolean))scoped.push(c);
            candidates=scoped;
        }
        const visible=[];for(const c of candidates)if(await c.isVisible().catch(()=>false))visible.push(c);
        if(expected.kind==='hidden')return !visible.length;
        if(expected.kind==='visible')return visible.length>0;
        if(visible.length!==1)return false;
        if(expected.kind==='value')return await visible[0].inputValue().catch(()=>null)===expected.value;
        if(expected.kind==='selected')return normalizeUiName(await visible[0].evaluate(el=>el.tagName==='SELECT'?Array.from(el.selectedOptions).map(o=>o.textContent).join(' '):el.textContent||el.value||''))===normalizeUiName(expected.value);
        return (await visible[0].textContent()).includes(expected.value);
    },timeout);
}
