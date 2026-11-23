process.env.ALLOW_LOOPBACK_IN_TESTS='1'; // yerel fixture sunucuları için (yalnızca test)
import '../unit-tests/setup-env.js';
import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright-core';
import { BrowserSessions } from '../services/browserSessions.js';
import { startNetworkProxy } from '../utils/networkProxy.js';
import { executeRecordedAction } from '../utils/recordedActions.js';
import { executeFormAction } from '../utils/formActions.js';
import { compileScenarioData,applyScenarioData } from '../utils/scenarioData.js';
import { runtimeStepsSchema } from '../schemas/runtimeSteps.js';
import { createBrowserRouter } from '../routes/browser.js';
import { startLiveFrames } from '../utils/liveFrames.js';
let fixture,fixtureUrl,sessions,apiServer,apiUrl,browser;
const html=`<!doctype html><html><body><label for="name">Adı</label><input id="name"><label for="pw">Şifre</label><input id="pw" type="password"><label for="faculty">Fakülte</label><select id="faculty"><option value="">Seçiniz</option><option value="bio">Biyoloji</option><option value="math">Matematik</option></select><input id="ok" type="checkbox"><label for="ok">Onay</label><button id="save">Kaydet</button><p id="result"></p><iframe id="child" src="/frame"></iframe><script>window.saves=0;document.querySelector('#save').onclick=()=>{window.saves++;document.querySelector('#result').textContent='Kayıt başarılı: '+document.querySelector('#name').value;};</script></body></html>`;
before(async()=>{
    fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/frame'?'<label for="inside">İç alan</label><input id="inside">':html);});
    await new Promise(r=>fixture.listen(0,'127.0.0.1',r));fixtureUrl='http://127.0.0.1:'+fixture.address().port;
    process.env.ALLOWED_TEST_PORTS=String(fixture.address().port);
    process.env.ALLOWED_PRIVATE_HOSTS='127.0.0.1';   // yerel fixture: izin listesine + iç-ağ olarak eklenir
    sessions=new BrowserSessions({
        launch:options=>chromium.launch({...options,executablePath:process.env.AUDIT_CHROMIUM_PATH,args:[...options.args,'--no-sandbox','--no-zygote','--disable-gpu']}),
        checkUrl:async url=>({safe:url.startsWith(fixtureUrl)}),
        proxy:()=>startNetworkProxy({resolveHost:async host=>({safe:host==='127.0.0.1',address:'127.0.0.1',family:4})}),
    });
    const app=express();app.use(express.json());app.use('/api/scenarios',createBrowserRouter({sessions,auth:(req,res,next)=>{if(!req.headers['x-user'])return res.sendStatus(401);req.user={id:req.headers['x-user'],role:'USER'};next();},projectGuard:(req,res,next)=>next(),hasAccess:async()=>true,findProject:async()=>({id:'p'})}));
    app.use((e,req,res,next)=>res.status(e.statusCode||500).json({error:e.message}));
    apiServer=app.listen(0,'127.0.0.1');await new Promise(r=>apiServer.once('listening',r));apiUrl='http://127.0.0.1:'+apiServer.address().port;
    browser=await chromium.launch({headless:true,executablePath:process.env.AUDIT_CHROMIUM_PATH,args:['--no-sandbox','--no-zygote','--disable-gpu','--disable-dev-shm-usage']});
});
after(async()=>{for(const s of sessions.sessions.values())await sessions.close(s);clearInterval(sessions.timer);await browser?.close();await new Promise(r=>fixture.close(r));await new Promise(r=>apiServer.close(r));});
async function api(route,body,user='u1'){return fetch(apiUrl+'/api/scenarios'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-user':user},...(body===undefined?{}:{body:JSON.stringify(body)})});}

test('gerçek Chromium: yazma tek adım, seçim, iframe ve sonuç doğrulaması kaydedilir; tek kez tekrar oynatılır',async()=>{
    const s=await sessions.start({owner:'u1',projectName:'Alfa',targetUrl:fixtureUrl});
    await assert.rejects(sessions.start({owner:'u1',projectName:'Alfa',targetUrl:fixtureUrl}),/Zaten açık bir kayıt oturumunuz/);   // kullanıcı başına 1 oturum
    await s.page.locator('#name').click();await sessions.control(s,{type:'text',text:'Feyza'});await sessions.control(s,{type:'key',key:'Tab'});
    await sessions.control(s,{type:'fill',text:'gizli-test'});
    assert.ok(sessions.info(s).steps.every(step=>step.value!=='gizli-test'));
    await s.page.locator('#faculty').focus();await sessions.control(s,{type:'select',value:'bio'});
    await s.page.locator('#ok').check();
    await s.page.frameLocator('#child').locator('#inside').fill('İç metin');await s.page.frameLocator('#child').locator('#inside').press('Tab');
    await s.page.locator('#save').click();await sessions.control(s,{type:'assert',text:'Kayıt başarılı: Feyza'});
    assert.equal(await s.page.evaluate(()=>window.saves),1);
    const frame=await sessions.frame(s);assert.ok(frame.length>1000);
    const result=await sessions.stop(s);
    assert.equal(result.steps.filter(step=>step.action==='fill' && step.target.selector==='#name').length,1);
    assert.ok(result.steps.some(step=>step.target?.frames?.[0]==='#child'));
    assert.equal(result.steps.filter(step=>step.action==='click' && step.target.selector==='#save').length,1);
    const replay=await browser.newPage();await replay.goto(fixtureUrl);
    for(const step of result.steps)await executeRecordedAction(replay,step);
    assert.equal(await replay.inputValue('#name'),'Feyza');assert.equal(await replay.inputValue('#faculty'),'bio');
    assert.equal(await replay.frameLocator('#child').locator('#inside').inputValue(),'İç metin');assert.equal(await replay.evaluate(()=>window.saves),1);
    await replay.close();
});

test('oturum görüntüsü sahibi dışında okunamaz; canlı test kontrol komutu kabul etmez',async()=>{
    const live=sessions.createLive({owner:'u1',projectName:'Alfa'});
    assert.equal((await api('/browser/'+live.id,undefined,'u2')).status,404);
    assert.equal((await api('/browser/'+live.id+'/frame',undefined,'u2')).status,404);
    assert.equal((await api('/browser/'+live.id+'/control',{type:'click',x:2,y:2})).status,403);
    assert.equal((await api('/browser/'+live.id+'/control',{type:'click',x:-1,y:2})).status,400);
    assert.equal((await api('/browser/'+live.id+'/close',{})).status,403);
    await sessions.close(live);
});

test('canlı görüntü atomik yazılır ve yetkili API üzerinden alınır; kapatınca dosyası silinir',async()=>{
    const live=sessions.createLive({owner:'u1',projectName:'Alfa'});const file=await sessions.prepareLive(live);
    const page=await browser.newPage();await page.goto(fixtureUrl);const stop=startLiveFrames(page,file);
    await new Promise(resolve=>setTimeout(resolve,1100));await stop();
    const response=await api('/browser/'+live.id+'/frame');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-type'),/image\/jpeg/);
    sessions.finishLive(live);await sessions.close(live);await assert.rejects(fs.stat(file));await page.close();
});

test('varsayılan ağ politikası private URLyi tarayıcı açmadan reddeder',async()=>{
    const blocked=new BrowserSessions({launch:()=>{throw new Error('LAUNCH_NOT_EXPECTED');}});
    try{await assert.rejects(blocked.start({owner:'u',projectName:'P',targetUrl:'http://169.254.169.254/'}),/Güvenlik Engeli/);assert.equal(blocked.sessions.size,0);}finally{clearInterval(blocked.timer);}
});

test('kaydedilmiş adımlar AI çevirisine girmez; form hedefi ve değişken değer korunur',async()=>{
    const target={selector:'#name',label:'Adı',frames:[],inputType:'text'};
    const data={enabled:true,fields:[{key:'f1',label:'Adı',scope:'',value:'Feyza',action:'fill',rule:'suffix',target}],recordings:[{key:'r1',action:'click',target:{selector:'#save',name:'Kaydet'}}]};
    const compiled=await compileScenarioData('[[FORM:f1]]\n[[REC:r1]]',data,()=>{throw Error('AI_CALLED');},fixtureUrl);
    const runtime=runtimeStepsSchema.parse({...compiled,targetUrl:fixtureUrl});const applied=applyScenarioData(runtime,'3');assert.equal(applied.steps[0].form.value,'Feyza3');
    const page=await browser.newPage();await page.goto(fixtureUrl);await executeFormAction(null,page,applied.steps[0].form);await executeRecordedAction(page,applied.steps[1].recorded);assert.equal(await page.textContent('#result'),'Kayıt başarılı: Feyza3');await page.close();
});

test('gerçek panel: kayıt ekleme, form ayarı, kaydetme ve düzenlemede kayıt hedefleri korunur',async()=>{
    const page=await browser.newPage();let saved;const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://panel.test/**',async route=>{
        const url=new URL(route.request().url());let data;
        if(url.pathname==='/api/auth/me')data={username:'admin',role:'ADMIN'};
        else if(url.pathname.endsWith('/projects/list'))data={success:true,projects:['Alfa']};
        else if(url.pathname==='/api/scenarios/list')data={success:true,scenarios:saved?[saved.scenarioName]:[]};
        else if(url.pathname==='/api/scenarios/content')data={success:true,contentTr:saved.turkishInstructions,content:{targetUrl:saved.targetUrl,testData:saved.testData},expectedOutcome:'SUCCESS_EXPECTED'};
        else if(url.pathname==='/api/scenarios/create-and-save'){saved=route.request().postDataJSON();data={success:true};}
        else if(url.pathname.startsWith('/api/'))data={success:true,reports:[],settings:[]};
        if(data)return route.fulfill({json:data});
        const file=path.resolve('public',url.pathname==='/'?'index.html':url.pathname.slice(1));
        try{await route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{await route.fulfill({status:404,body:''});}
    });
    await page.goto('http://panel.test/');await page.click('#open-new-scenario-btn');await page.fill('#new-scenario-name','Kayıt deneme');await page.fill('#new-scenario-url',fixtureUrl);
    await page.evaluate(()=>{
        const start=window.BrowserPanel.open;
        window.BrowserPanel.open=options=>options.onSave([{key:'r_a',action:'fill',value:'Feyza',target:{selector:'#name',label:'Adı',frames:[],inputType:'text'}},{key:'r_b',action:'click',target:{selector:'#save',name:'Kaydet',frames:[]}},{key:'r_c',action:'assertText',value:'Kayıt başarılı'}]);
    });
    await page.click('#browser-record-open');assert.equal(await page.locator('[data-record-key]').count(),2);
    await page.click('#data-values-open');await page.locator('#json-preview-table tbody tr select').nth(4).selectOption('suffix');await page.click('#json-apply');
    await page.click('#save-scenario-submit-btn');await page.waitForFunction(()=>document.querySelector('.edit-scenario-btn'));
    assert.match(saved.turkishInstructions,/\[\[REC:r_b\]\]/);assert.equal(saved.testData.recordings.length,2);assert.equal(saved.testData.fields[0].target.selector,'#name');
    await page.locator('.edit-scenario-btn').click();await page.waitForFunction(()=>document.querySelector('[data-record-key]'));
    assert.equal(await page.locator('[data-record-key]').count(),2);assert.match(await page.locator('[data-record-key]').first().locator('input').inputValue(),/Kaydet/);assert.deepEqual(errors,[]);
    await page.close();
});

test('panel görüntüsünden tıklama ve klavye gerçek uzak tarayıcıya gider; kayıt iptal edilince kapanır',async()=>{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.route('http://interactive.test/**',async route=>{
        const url=new URL(route.request().url());
        if(url.pathname.startsWith('/api/scenarios/browser/')){
            const response=await fetch(apiUrl+url.pathname,{method:route.request().method(),headers:{'Content-Type':'application/json','x-user':'u1'},...(route.request().method()==='POST'?{body:route.request().postData()}: {})});
            return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/json',body:Buffer.from(await response.arrayBuffer())});
        }
        let data;
        if(url.pathname==='/api/auth/me')data={username:'admin',role:'ADMIN'};
        else if(url.pathname.endsWith('/projects/list'))data={success:true,projects:['Alfa']};
        else if(url.pathname==='/api/scenarios/list')data={success:true,scenarios:[]};
        else if(url.pathname.startsWith('/api/'))data={success:true,reports:[],settings:[]};
        if(data)return route.fulfill({json:data});
        const file=path.resolve('public',url.pathname==='/'?'index.html':url.pathname.slice(1));
        try{return route.fulfill({body:await fs.readFile(file),contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html'});}catch{return route.fulfill({status:404,body:''});}
    });
    await page.goto('http://interactive.test/');await page.click('#open-new-scenario-btn');await page.fill('#new-scenario-name','Tarayıcı kaydı');await page.fill('#new-scenario-url',fixtureUrl);await page.click('#browser-record-open');
    await page.locator('.browser-screen.has-frame').waitFor({timeout:10000});
    const s=[...sessions.sessions.values()].find(s=>s.mode==='record');const box=await s.page.locator('#name').boundingBox();const screen=await page.locator('.browser-screen').boundingBox();
    await page.mouse.click(screen.x+(box.x+box.width/2)*screen.width/1280,screen.y+(box.y+box.height/2)*screen.height/720);
    await page.keyboard.type('Feyza');await page.keyboard.press('Tab');
    await page.waitForFunction(()=>window.BrowserPanel.active.pending===0);
    assert.equal(await s.page.inputValue('#name'),'Feyza');
    await page.getByRole('button',{name:'Kaydı Bitir ve Adımları Ekle',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#steps-container [data-form-key]'));
    assert.match(await page.locator('#steps-container [data-form-key] .step-input').inputValue(),/Feyza/);assert.equal(sessions.sessions.has(s.id),false);
    await page.click('#browser-record-open');await page.locator('.browser-screen.has-frame').waitFor({timeout:10000});
    if(process.env.UI_CAPTURE)await page.screenshot({path:process.env.UI_CAPTURE});
    await page.getByRole('button',{name:'Kaydı İptal Et',exact:true}).click();await page.waitForFunction(()=>!window.BrowserPanel.active);
    await new Promise(r=>setTimeout(r,100));assert.equal([...sessions.sessions.values()].filter(s=>s.mode==='record').length,0);await page.close();
});
