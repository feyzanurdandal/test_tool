import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startNetworkProxy, browserNetworkArgs, installBrowserNetworkGuard } from '../utils/networkProxy.js';
import { isSafeUrl } from '../utils/ipGuard.js';
import { recordedActionSchema } from '../schemas/recording.js';
import { safeChildEnv } from '../utils/safeEnv.js';
import { installRecorderScript } from '../utils/recordedActions.js';

const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
export class BrowserSessions {
    constructor({launch=options=>chromium.launch(options),proxy=startNetworkProxy,checkUrl=isSafeUrl,guard=installBrowserNetworkGuard,now=Date.now}={}) {
        Object.assign(this,{launch,proxy,checkUrl,guard,now});this.sessions=new Map();
        this.timer=setInterval(()=>this.cleanup(),30000);this.timer.unref();
    }
    get(id,owner) {
        const s=this.sessions.get(id);
        if(!s || s.owner!==String(owner))throw fail('Tarayıcı oturumu bulunamadı veya süresi doldu.',404);
        return s;
    }
    info(s) {
        return {id:s.id,mode:s.mode,state:s.state,projectName:s.projectName,targetUrl:s.page?.url()||s.targetUrl,
            count:s.steps?.length||0,message:s.message||'',width:1280,height:720,
            steps:s.mode==='record'?s.steps.map(step=>({...step,value:step.target?.inputType==='password'?'••••••':step.value})):[],
            focused:s.focused||null};
    }
    // Kayıt oturumları: kullanıcı başına 1, toplamda RECORD_MAX (her biri bir Chromium'dur).
    checkRecordCapacity(owner) {
        const open=[...this.sessions.values()].filter(s=>s.mode==='record' && !['stopped','closed','failed'].includes(s.state));
        if(open.some(s=>s.owner===String(owner)))throw fail('Zaten açık bir kayıt oturumunuz var. Önce onu bitirin veya iptal edin.',429);
        const max=Number(process.env.RECORD_MAX)||2;
        if(open.length>=max)throw fail(`Şu anda en fazla ${max} kayıt oturumu aynı anda açılabiliyor ve hepsi dolu. Birkaç dakika sonra tekrar deneyin.`,429);
    }
    liveRunningCount() {
        return [...this.sessions.values()].filter(s=>s.mode==='live' && s.state==='running').length;
    }
    async start({owner,projectName,targetUrl}) {
        this.checkRecordCapacity(owner);
        const check=await this.checkUrl(targetUrl);if(!check.safe)throw fail('Güvenlik Engeli: '+check.reason);
        // DNS kontrolünden dönülene kadar başka istek rezervasyon yapmış olabilir.
        this.checkRecordCapacity(owner);
        const s={id:crypto.randomUUID(),mode:'record',owner:String(owner),projectName,targetUrl,state:'starting',steps:[],createdAt:this.now(),lastSeen:this.now(),chain:Promise.resolve()};
        this.sessions.set(s.id,s);
        try {
            s.proxy=await this.proxy();
            s.browser=await this.launch({headless:true,timeout:20000,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),
                env:safeChildEnv(),proxy:{server:s.proxy.url,bypass:'<-loopback>'},args:[...browserNetworkArgs(s.proxy.url),'--disable-dev-shm-usage',...(process.env.DOCKER_ENV==='true'?['--no-sandbox','--disable-setuid-sandbox']:[])]});
            s.context=await s.browser.newContext({viewport:{width:1280,height:720},acceptDownloads:false,serviceWorkers:'block'});
            await this.guard(s.context);
            s.page=await s.context.newPage();
            s.context.on('page',page=>{if(page!==s.page){s.message='Yeni sekme açıldı; ilk sürüm tek sekmeli kayıt destekler. Bu adımı elle düzenleyin.';void page.close().catch(()=>{});}});
            s.page.on('dialog',dialog=>{s.message='Yerel tarayıcı iletişim kutusu kapatıldı: '+dialog.message().slice(0,200);void dialog.dismiss().catch(()=>{});});
            await s.context.exposeBinding('__ttRecord',async(source,payload)=>{
                if(s.state!=='recording' || source.page!==s.page)return;
                const frames=[];let frame=source.frame;
                while(frame.parentFrame()) {
                    const handle=await frame.frameElement();
                    const selector=await handle.evaluate(el=>window.__ttCssPath?.(el));
                    await handle.dispose();if(!selector)return;
                    frames.unshift(selector);frame=frame.parentFrame();
                }
                const parsed=recordedActionSchema.safeParse({...payload,key:'r_'+crypto.randomBytes(8).toString('hex'),target:payload.target?{...payload.target,frames}:undefined});
                if(!parsed.success){s.state='limit';s.message='Bir işlem kayıt sınırlarını aştı. Kaydı bitirip son adımı elle düzenleyin.';return;}
                this.append(s,parsed.data);
            });
            await s.context.addInitScript(installRecorderScript);
            s.state='recording';
            await s.page.goto(targetUrl,{waitUntil:'domcontentloaded',timeout:20000});
            return s;
        }catch(error){s.state='failed';await this.release(s);this.sessions.delete(s.id);throw fail('Tarayıcı başlatılamadı. URL erişimini ve Chromium kurulumunu kontrol edin.',502);}
    }
    append(s,step) {
        if(s.state!=='recording')return;
        const last=s.steps.at(-1);
        if(step.action==='fill' && last?.action==='fill' && JSON.stringify(last.target)===JSON.stringify(step.target)){s.steps[s.steps.length-1]={...step,key:last.key};return;}
        if(s.steps.length>=100){s.state='limit';s.message='100 adım sınırına ulaşıldı. Kaydı bitirin; sınırdan sonraki işlemler kaydedilmedi.';return;}
        s.steps.push(step);
    }
    async refreshFocus(s) {
        s.focused=await s.page.evaluate(()=>{
            let el=document.activeElement;
            // Ana sayfadaki alan; iframe alanları klavye/tuşlarla kullanılabilir.
            if(!el?.matches('input,textarea,select'))return null;
            return {type:el.getAttribute('type')||el.tagName.toLowerCase(),label:el.getAttribute('aria-label')||el.labels?.[0]?.textContent||el.placeholder||'Seçili alan',
                options:el.tagName==='SELECT'?Array.from(el.options).map(o=>({value:o.value,text:o.text,disabled:o.disabled})):null};
        }).catch(()=>null);
    }
    async control(s,command) {
        if(s.mode!=='record')throw fail('Canlı test görüntüsüne müdahale edilemez.',403);
        if(s.stopping || s.state!=='recording')throw fail('Kayıt aktif değil. Kaydı bitirin veya yeniden başlatın.',409);
        if(s.pending>=30)throw fail('Çok fazla bekleyen tarayıcı komutu var.',429);
        s.pending=(s.pending||0)+1;s.lastSeen=this.now();
        const execute=async()=>{
            if(s.state!=='recording')throw fail('Kayıt kapatıldı.',409);
            const page=s.page;
            if(command.type==='click')await page.mouse.click(command.x,command.y);
            if(command.type==='wheel'){await page.mouse.move(command.x,command.y);await page.mouse.wheel(0,command.delta);}
            if(command.type==='text')await page.keyboard.insertText(command.text);
            if(command.type==='key')await page.keyboard.press(command.key);
            if(command.type==='fill') {
                const focused=page.locator(':focus');
                if(await focused.count()!==1)throw fail('Önce görüntüde metin alanına tıklayın.');
                await focused.fill('');
                if(await focused.getAttribute('type')==='date'){await focused.fill(command.text);const target=await focused.evaluate(el=>window.__ttDescribe(el));this.append(s,recordedActionSchema.parse({key:'r_'+crypto.randomBytes(8).toString('hex'),action:'fill',target,value:command.text}));}
                else await focused.pressSequentially(command.text,{delay:30,timeout:Math.max(10000,command.text.length*35+5000)});
                await focused.press('Tab');
            }
            if(command.type==='select'){const select=page.locator('select:focus');const target=await select.evaluate(el=>window.__ttDescribe(el));await select.selectOption({value:command.value},{timeout:5000});this.append(s,recordedActionSchema.parse({key:'r_'+crypto.randomBytes(8).toString('hex'),action:'select',target,value:command.value}));}
            if(command.type==='goto') {
                const check=await this.checkUrl(command.url);if(!check.safe)throw fail('Güvenlik Engeli: '+check.reason);
                await page.evaluate(()=>window.__ttFlush?.());
                this.append(s,recordedActionSchema.parse({key:'r_'+crypto.randomBytes(8).toString('hex'),action:'goto',value:command.url}));
                await page.goto(command.url,{waitUntil:'domcontentloaded',timeout:30000});
            }
            if(command.type==='assert') {
                await page.getByText(command.text,{exact:false}).first().waitFor({state:'visible',timeout:5000});
                this.append(s,recordedActionSchema.parse({key:'r_'+crypto.randomBytes(8).toString('hex'),action:'assertText',value:command.text}));
            }
            await this.refreshFocus(s);
        };
        const result=s.chain.then(execute);s.chain=result.catch(()=>{});
        try{await result;}finally{s.pending--;}
    }
    async frame(s) {
        s.lastSeen=this.now();
        if(s.mode==='live') {try{return await fs.readFile(path.join(s.dir,'frame.jpg'));}catch{return null;}}
        if(s.capturing)return s.frame||null;
        if(!s.page || !['recording','limit'].includes(s.state))return s.frame||null;
        s.capturing=true;
        try{s.frame=await s.page.screenshot({type:'jpeg',quality:65,timeout:5000});return s.frame;}catch{return s.frame||null;}finally{s.capturing=false;}
    }
    async stop(s) {
        if(s.mode!=='record')throw fail('Bu oturum bir kayıt değil.');
        s.stopping=true;await s.chain;
        if(s.page && s.state==='recording') {
            for(const frame of s.page.frames())await frame.evaluate(()=>window.__ttFlush?.()).catch(()=>{});
            await s.page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,30))).catch(()=>{});
        }
        const result={steps:s.steps,targetUrl:s.targetUrl,warning:s.message||''};
        s.state='stopped';await this.release(s);this.sessions.delete(s.id);return result;
    }
    async release(s) {await s.browser?.close().catch(()=>{});await s.proxy?.close().catch(()=>{});s.browser=null;s.page=null;s.frame=null;}
    async close(s) {s.state='closed';await s.chain;await this.release(s);if(s.dir)await fs.rm(s.dir,{recursive:true,force:true});this.sessions.delete(s.id);}
    createLive({owner,projectName}) {
        const s={id:crypto.randomUUID(),mode:'live',owner:String(owner),projectName,state:'queued',createdAt:this.now(),lastSeen:this.now()};
        s.dir=path.join(process.cwd(),'runtime','live_'+s.id);this.sessions.set(s.id,s);return s;
    }
    async prepareLive(s) {await fs.mkdir(s.dir,{recursive:true,mode:0o700});s.state='running';return path.join(s.dir,'frame.jpg');}
    finishLive(s) {s.state='finished';s.finishedAt=this.now();}
    async closeAll() {
        for (const s of [...this.sessions.values()]) await this.close(s).catch(() => {});
    }
    async cleanup() {
        for(const s of this.sessions.values()) {
            const expired=s.mode==='live'?(s.finishedAt?this.now()-s.finishedAt>120000:this.now()-s.createdAt>7200000):this.now()-s.lastSeen>120000 || this.now()-s.createdAt>900000;
            if(expired)await this.close(s).catch(()=>{});
        }
    }
}
export const browserSessions=new BrowserSessions();
