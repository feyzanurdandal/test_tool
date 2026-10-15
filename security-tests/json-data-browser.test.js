import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {executeFormAction} from '../utils/formActions.js';
import path from 'node:path';
let browser,page;
before(async()=>{browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu']});page=await browser.newPage();});
after(async()=>await browser?.close());
function mock(selector){return {observe:async()=>[{selector,method:'click',arguments:[]}],act:async a=>{await page.locator(a.selector).click();return {success:true};}};}
const base={key:'f',label:'Alan',scope:'',value:'',action:'select',selectionMode:'text',rule:'fixed'};
test('native select: ID, sıfırdan sıra, rastgele; eşleşmeyen ID reddedilir',async()=>{
 await page.setContent('<select id="faculty"><option value="">Seçiniz</option><option value="uuid-1">Matematik</option><option value="uuid-2">Türkçe</option><option value="uuid-3">Fen</option></select>');
 await executeFormAction(mock('#faculty'),page,{...base,selectionMode:'index',value:'2'});assert.equal(await page.inputValue('#faculty'),'uuid-3');
 await executeFormAction(mock('#faculty'),page,{...base,selectionMode:'value',value:'uuid-2'});assert.equal(await page.inputValue('#faculty'),'uuid-2');
 await assert.rejects(executeFormAction(mock('#faculty'),page,{...base,selectionMode:'value',value:'2'}),/NOT_FOUND/);
 await executeFormAction(mock('#faculty'),page,{...base,selectionMode:'random'});assert.match(await page.inputValue('#faculty'),/^uuid-/);
});
test('custom overlay: gerçek değer ve metin seçimi, bağlı listede güncelleme',async()=>{
 await page.setContent('<button id="trigger" aria-controls="choices">Aç</button><div id="choices" class="p-dropdown-panel" hidden><div role="listbox"><div role="option" data-value="id-a">Matematik</div><div role="option" data-value="id-b">Fen</div></div></div><span id="selected"></span><select id="dependent"></select>');
 await page.evaluate(()=>{document.querySelector('#trigger').onclick=()=>document.querySelector('#choices').hidden=false;for(const o of document.querySelectorAll('[role=option]'))o.onclick=()=>{document.querySelector('#selected').textContent=o.textContent;document.querySelector('#choices').hidden=true;setTimeout(()=>document.querySelector('#dependent').innerHTML='<option value="bio">Biyoloji</option>',50);};});
 await executeFormAction(mock('#trigger'),page,{...base,selectionMode:'value',value:'id-b'});assert.equal(await page.textContent('#selected'),'Fen');
 await executeFormAction(mock('#dependent'),page,{...base,selectionMode:'text',value:'Biyoloji'});assert.equal(await page.inputValue('#dependent'),'bio');
});
test('metin/tarih/kutu işlemleri JSON değerini değiştirmeden uygular',async()=>{
 await page.setContent('<input id="name"><input id="date" type="date"><input id="check" type="checkbox">');
 const fill={observe:async()=>[{selector:'#name',method:'fill',arguments:['model changed value']}]};
 await executeFormAction(fill,page,{...base,action:'fill',value:'Feyza'});assert.equal(await page.inputValue('#name'),'Feyza');
 await executeFormAction({observe:async()=>[{selector:'#date',method:'fill'}]},page,{...base,action:'date',value:'2004-02-11'});assert.equal(await page.inputValue('#date'),'2004-02-11');
 await executeFormAction(mock('#check'),page,{...base,action:'check',value:'true'});assert.equal(await page.isChecked('#check'),true);
});
test('JSON arayüzü: genel alanlar, teknik alanlar kapalı, önizleme ve yeniden açma',async()=>{
 await page.setContent('<form id="scenario-form"><div><button id="add-step-field-btn" type="button">Adım</button></div><div id="steps"></div></form>');
 await page.addScriptTag({path:path.resolve('public/js/test-data-editor.js')});
 await page.evaluate(()=>{const steps=document.querySelector('#steps');const addRow=value=>{const row=document.createElement('div');const i=document.createElement('input');i.className='step-input';i.value=value;row.append(i);window.editor.decorate(row,value);return row;};window.editor=new window.TestDataEditor({form:document.querySelector('form'),steps,addRow,reindex:()=>{},notify:()=>{}});});
 await page.click('#json-form-open');await page.fill('#json-form-source',JSON.stringify({productName:'Kalem',quantity:'00012',id:'technical',settings:{enabled:true}}));await page.click('#json-preview');
 assert.equal(await page.locator('#json-preview-table tbody tr').count(),4);assert.equal(await page.locator('#json-preview-table tbody tr').nth(2).locator('input[type=checkbox]').isChecked(),false);
 await page.locator('#json-preview-table tbody tr').nth(1).locator('select').nth(2).selectOption('increment');await page.click('#json-apply');
 const data=await page.evaluate(()=>window.editor.get());assert.equal(data.fields.length,3);assert.equal(data.enabled,true);assert.equal(data.fields[1].rule,'increment');assert.equal(await page.locator('#steps [data-form-key]').count(),3);
 await page.evaluate(data=>window.editor.load(data),data);await page.click('#json-form-open');assert.equal(await page.locator('#json-preview-table tbody tr').count(),3);await page.getByRole('button',{name:'İptal',exact:true}).click();
 await page.click('#json-form-open');await page.fill('#json-form-source','{"__proto__":{"x":1}}');await page.click('#json-preview');assert.match(await page.locator('[role=alert]').textContent(),/Desteklenmeyen/);
});

test('gerçek panel: JSON alanı ve adım değişkeni kaydetme/yeniden açma',async()=>{
 const fs=await import('node:fs/promises');let saved;const errors=[];const onError=e=>errors.push(e.message);page.on('pageerror',onError);
 await page.route('http://panel.test/**',async route=>{
  const url=new URL(route.request().url());let data;
  if(url.pathname==='/api/auth/me')data={username:'admin',role:'ADMIN'};
  else if(url.pathname.endsWith('/projects/list'))data={success:true,projects:['Alfa']};
  else if(url.pathname==='/api/scenarios/list')data={success:true,scenarios:saved?[saved.scenarioName]:[]};
  else if(url.pathname==='/api/scenarios/content')data={success:true,contentTr:saved.turkishInstructions,content:{targetUrl:saved.targetUrl,testData:saved.testData},expectedOutcome:'SUCCESS_EXPECTED'};
  else if(url.pathname==='/api/scenarios/create-and-save'){saved=route.request().postDataJSON();data={success:true,status:'SUCCESS'};}
  else if(url.pathname.startsWith('/api/'))data={success:true,reports:[],users:[],settings:[]};
  if(data)return route.fulfill({json:data});
  const file=path.resolve('public',url.pathname==='/'?'index.html':url.pathname.slice(1));
  try{await route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{await route.fulfill({status:404,body:''});}
 });
 await page.goto('http://panel.test/');await page.click('#open-new-scenario-btn');await page.fill('#new-scenario-name','JSON deneme');await page.fill('#new-scenario-url','https://example.com');
 await page.locator('#steps-container .step-input').fill('"Adı" alanına "Feyza" yaz');
 await page.click('#data-values-open');await page.selectOption('#data-value-choice','Feyza');await page.getByRole('button',{name:'Seçilen değeri ekle',exact:true}).click();await page.click('#json-apply');
 await page.click('#json-form-open');await page.fill('#json-form-source','{"email":"f@example.com"}');await page.click('#json-preview');await page.click('#json-apply');
 await page.click('#save-scenario-submit-btn');await page.waitForFunction(()=>document.querySelector('.edit-scenario-btn'));
 assert.equal(saved.testData.fields.length,1);assert.equal(saved.testData.variables.length,1);assert.match(saved.turkishInstructions,/\[\[FORM:/);assert.match(saved.turkishInstructions,/\{\{data\./);
 await page.locator('.edit-scenario-btn').click();await page.waitForFunction(()=>document.querySelector('#steps-container [data-form-key]'));
 assert.equal(await page.locator('#steps-container [data-form-key]').count(),1);await page.click('#json-form-open');assert.equal(await page.locator('#json-preview-table tbody tr').count(),1);assert.deepEqual(errors,[]);
 page.off('pageerror',onError);await page.unroute('http://panel.test/**');
});
