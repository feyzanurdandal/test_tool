import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { executeUiAction, verifyUiExpectation } from '../utils/uiActions.js';
async function fixture(run) {
 const browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM_PATH || process.env.CHROME_PATH || chromium.executablePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu']});
 try { const page=await browser.newPage();await page.setContent(`<label for="email">E-Posta</label><input id="email"><div><label>Fakülte/MYO</label><p-dropdown onclick="document.querySelector('.p-dropdown-panel').hidden=false"><button role="combobox">Seçiniz</button></p-dropdown></div><div class="p-dropdown-panel" hidden><input aria-label="Ara" onkeydown="if(event.key==='Enter')window.selected='WRONG FIRST OPTION'"><ul role="listbox"><li role="option" onclick="window.selected='Mühendislik Fakültesi';this.setAttribute('aria-selected','true')">Mühendislik Fakültesi</li><li role="option" onclick="window.selected='Fen Edebiyat Fakültesi';this.setAttribute('aria-selected','true')">Fen Edebiyat Fakültesi</li></ul></div>`);await run(page); } finally {await browser.close();}
}
test('labelled fill does not click matching text',()=>fixture(async p=>{
 assert.equal(await executeUiAction(p,'Type "sample@example.test" into the input field labeled "e posta"'),true);
 assert.equal(await p.locator('#email').inputValue(),'sample@example.test');
}));
test('dropdown opening and search never select first unrelated option',()=>fixture(async p=>{
 await executeUiAction(p,'Click on the dropdown labeled "Fakülte/MYO"');
 assert.equal(await p.evaluate(()=>window.selected),undefined);
 await executeUiAction(p,'Type "fen edebiyat fakültesi" into the search box and press Enter','Click on "fen edebiyat fakültesi" in the opened list');
 assert.equal(await p.locator('.p-dropdown-panel input').inputValue(),'fen edebiyat fakültesi');
 assert.equal(await p.evaluate(()=>window.selected),undefined);
 await executeUiAction(p,'Click on "fen edebiyat fakültesi" in the opened list');
 assert.equal(await p.evaluate(()=>window.selected),'Fen Edebiyat Fakültesi');
}));
test('ambiguous visible search boxes fail without changing either value',()=>fixture(async p=>{
 await p.locator('p-dropdown').click();await p.locator('.p-dropdown-panel').evaluate(e=>e.insertAdjacentHTML('afterbegin','<input>'));
 await assert.rejects(executeUiAction(p,'Type "matematik" into the search box'),/AMBIGUOUS_TARGET/);
 assert.deepEqual(await p.locator('.p-dropdown-panel input').evaluateAll(es=>es.map(e=>e.value)),['','']);
}));
test('standalone find step cannot become a click',()=>fixture(async p=>{
 await assert.rejects(executeUiAction(p,'Find the button labeled "giriş yap"'),/UNSUPPORTED_FIND_STEP/);
}));

test('duplicate button labels fail instead of clicking the first button',()=>fixture(async p=>{
 await p.evaluate(()=>{document.body.insertAdjacentHTML('beforeend','<button>Ekle</button><button>Ekle</button>');window.clicked=0;document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>window.clicked++));});
 await assert.rejects(executeUiAction(p,'Click on the button labeled "ekle"'),/AMBIGUOUS_TARGET/);
 assert.equal(await p.evaluate(()=>window.clicked),0);
}));

test('active dialog disambiguates repeated labels and buttons',()=>fixture(async p=>{
 await p.setContent('<label for="background">Adı</label><input id="background"><button>Ekle</button><div role="dialog" aria-label="Kullanıcı"><label for="active">Adı</label><input id="active"><button onclick="window.clicked=1">Ekle</button></div>');
 await executeUiAction(p,'Type "sample" into the input field labeled "adı"');
 assert.equal(await p.locator('#active').inputValue(),'sample');assert.equal(await p.locator('#background').inputValue(),'');
 await executeUiAction(p,'Click on the button labeled "ekle"');assert.equal(await p.evaluate(()=>window.clicked),1);
}));
test('explicit section resolves same-named buttons',()=>fixture(async p=>{
 await p.setContent('<section><h2>Kullanıcı listesi</h2><button onclick="window.clicked=1">Ekle</button></section><section><h2>Programlar</h2><button onclick="window.clicked=2">Ekle</button></section>');
 await executeUiAction(p,'Click on the "ekle" button in the "Programlar" section');assert.equal(await p.evaluate(()=>window.clicked),2);
}));
test('candidate resolver sees only matches and chosen index controls the click',()=>fixture(async p=>{
 await p.setContent('<button onclick="window.clicked=1">Ekle</button><button onclick="window.clicked=2">Ekle</button><button onclick="window.clicked=3">Sil</button>');
 await executeUiAction(p,'Click on the button labeled "ekle"','',{disambiguate:async({candidates})=>{assert.equal(candidates.length,2);return 1;}});
 assert.equal(await p.evaluate(()=>window.clicked),2);
}));
test('out-of-range AI candidate cannot cause a click',()=>fixture(async p=>{
 await p.setContent('<button onclick="window.clicked=1">Ekle</button><button onclick="window.clicked=2">Ekle</button>');
 await assert.rejects(executeUiAction(p,'Click on the button labeled "ekle"','',{disambiguate:async()=>99}),/AMBIGUOUS_TARGET/);
 assert.equal(await p.evaluate(()=>window.clicked),undefined);
}));
test('dialog dropdown portal remains available for search',()=>fixture(async p=>{
 await p.locator('p-dropdown').evaluate(el=>{const group=el.parentElement;const dialog=document.createElement('div');dialog.setAttribute('role','dialog');group.replaceWith(dialog);dialog.appendChild(group);});
 await executeUiAction(p,'Click on the dropdown labeled "Fakülte/MYO"');
 await executeUiAction(p,'Type "fen edebiyat fakültesi" into the search box');
 assert.equal(await p.locator('.p-dropdown-panel input').inputValue(),'fen edebiyat fakültesi');
}));

test('decorative plus and nested icon do not change the button name',()=>fixture(async p=>{
 await p.setContent('<button onclick="window.clicked=1"><i class="pi pi-plus">+</i> Ekle </button>');
 await executeUiAction(p,{type:'act',action:'click',control:'button',target:'ekle',instruction:'Click Ekle'});
 assert.equal(await p.evaluate(()=>window.clicked),1);
}));
test('whole-word contains matching tolerates a descriptive suffix',()=>fixture(async p=>{
 await p.setContent('<button onclick="window.clicked=1">Yeni Ekle +</button><button onclick="window.clicked=2">Eklemeler</button>');
 await executeUiAction(p,'Click on the button labeled "ekle"');assert.equal(await p.evaluate(()=>window.clicked),1);
}));
test('explicit missing scope never falls back to the only background match',()=>fixture(async p=>{
 await p.setContent('<section><h2>Liste</h2><button onclick="window.clicked=1">Ekle</button></section>');
 await assert.rejects(executeUiAction(p,{action:'click',control:'button',target:'Ekle',scope:'Rol Seçimi',instruction:'Click Ekle in Rol Seçimi'},'',{timeout:250}),/TARGET_NOT_FOUND/);
 assert.equal(await p.evaluate(()=>window.clicked),undefined);
}));
test('top right preference resolves duplicate save buttons',()=>fixture(async p=>{
 await p.setContent('<button style="position:absolute;left:20px;top:20px" onclick="window.clicked=1">Kaydet</button><button style="position:absolute;right:20px;top:20px" onclick="window.clicked=2">Kaydet</button>');
 await executeUiAction(p,{action:'click',control:'button',target:'Kaydet',position:'top-right',instruction:'Click top right Kaydet'});
 assert.equal(await p.evaluate(()=>window.clicked),2);
}));
test('delayed SPA render is awaited before selecting a target',()=>fixture(async p=>{
 await p.setContent('<main></main>');await p.evaluate(()=>setTimeout(()=>document.querySelector('main').innerHTML='<button onclick="window.clicked=1">Ekle</button>',150));
 await executeUiAction(p,'Click on the button labeled "ekle"','',{timeout:1000});
 assert.equal(await p.evaluate(()=>window.clicked),1);
}));
test('disabled buttons cannot be offered as AI candidates',()=>fixture(async p=>{
 await p.setContent('<button disabled>Ekle</button><button onclick="window.clicked=1">Yeni kullanıcı</button>');
 await executeUiAction(p,'Click on the button labeled "ekle"','',{timeout:200,disambiguate:async({candidates,fallback})=>{assert.equal(fallback,true);assert.equal(candidates.length,1);return 0;}});
 assert.equal(await p.evaluate(()=>window.clicked),1);
}));
test('no exact name can still resolve to one validated semantic AI candidate',()=>fixture(async p=>{
 await p.setContent('<button title="Create user" onclick="window.clicked=1"><svg></svg></button><a href="#">Elsewhere</a>');
 await executeUiAction(p,'Click on the button labeled "ekle"','',{timeout:200,disambiguate:async({candidates})=>{assert.equal(candidates.length,2);return candidates.findIndex(c=>c.tag==='BUTTON'&&c.names.includes('Create user'));}});
 assert.equal(await p.evaluate(()=>window.clicked),1);
}));
test('an unresolved fallback never clicks a random other button',()=>fixture(async p=>{
 await p.setContent('<button onclick="window.clicked=1">Sil</button>');
 await assert.rejects(executeUiAction(p,'Click on the button labeled "ekle"','',{timeout:200,disambiguate:async()=>null}),/TARGET_NOT_FOUND/);
 assert.equal(await p.evaluate(()=>window.clicked),undefined);
}));
test('native select opens and verifies the exact requested option',()=>fixture(async p=>{
 await p.setContent('<label for="faculty">Fakülte</label><select id="faculty"><option>Seçiniz</option><option value="science">Fen Edebiyat</option></select>');
 await executeUiAction(p,{action:'open',control:'dropdown',target:'Fakülte',instruction:'Open Fakülte'});
 await executeUiAction(p,{action:'select',target:'Fen Edebiyat',instruction:'Select Fen Edebiyat'});
 assert.equal(await p.locator('select').inputValue(),'science');
}));
test('option closing a menu without selection is not a verified effect',()=>fixture(async p=>{
 await p.setContent('<label for="trigger">Rol</label><button id="trigger" role="combobox" aria-controls="list" onclick="document.querySelector(\'#list\').hidden=false">Seçiniz</button><ul id="list" role="listbox" hidden><li role="option" onclick="document.querySelector(\'#list\').hidden=true;window.clicks=(window.clicks||0)+1">Öğretim elemanı</li></ul>');
 await executeUiAction(p,{action:'open',control:'dropdown',target:'Rol',instruction:'Open Rol'});
 await assert.rejects(executeUiAction(p,{action:'select',target:'Öğretim elemanı',instruction:'Select option'},'',{timeout:250}),/EFFECT_NOT_VERIFIED/);
 assert.equal(await p.evaluate(()=>window.clicks),1);
}));
test('explicit business expectation fails without replaying the save',()=>fixture(async p=>{
 await p.setContent('<button onclick="window.clicks=(window.clicks||0)+1">Kaydet</button>');
 await assert.rejects(executeUiAction(p,{action:'click',control:'button',target:'Kaydet',instruction:'Save',expect:{kind:'visible',target:'Başarıyla kaydedildi'}},'',{timeout:250}),/EFFECT_NOT_VERIFIED/);
 assert.equal(await p.evaluate(()=>window.clicks),1);
}));
test('explicit success message is awaited and verified',()=>fixture(async p=>{
 await p.setContent('<button onclick="setTimeout(()=>this.insertAdjacentHTML(\'afterend\',\'<p>Kaydedildi</p>\'),100)">Kaydet</button>');
 await executeUiAction(p,{action:'click',control:'button',target:'Kaydet',instruction:'Save',expect:{kind:'visible',target:'Kaydedildi'}},'',{timeout:1000});
}));
test('disabled visible content does not satisfy a hidden expectation',()=>fixture(async p=>{
 await p.setContent('<button disabled>Kaydet</button>');
 await assert.rejects(verifyUiExpectation(p,{kind:'hidden',target:'Kaydet'},{timeout:250}),/EFFECT_NOT_VERIFIED/);
}));
test('closing a named modal verifies it disappears',()=>fixture(async p=>{
 await p.setContent('<div role="dialog" aria-label="Onay"><button aria-label="Close" onclick="this.parentElement.remove()">×</button></div>');
 await executeUiAction(p,{action:'close',target:'Close',scope:'Onay',instruction:'Close Onay'});
 assert.equal(await p.getByRole('dialog').count(),0);
}));
test('asserted field value detects a change made after filling',()=>fixture(async p=>{
 await executeUiAction(p,'Type "sample" into the input field labeled "e posta"');
 await p.locator('#email').fill('changed');
 await assert.rejects(verifyUiExpectation(p,{kind:'value',target:'E-Posta',value:'sample'},{timeout:250}),/EFFECT_NOT_VERIFIED/);
}));

test('AI selectors outside candidates or across two candidates cannot act',()=>fixture(async p=>{
 const {validateUiProposals}=await import('../utils/uiActions.js');
 await p.setContent('<button id="a">Ekle<i id="icon">+</i></button><button id="b">Ekle</button><button id="other">Sil</button>');
 const handles=[await p.locator('#a').elementHandle(),await p.locator('#b').elementHandle()];
 assert.equal(await validateUiProposals(p,[{selector:'#icon'}],handles),0);
 assert.equal(await validateUiProposals(p,[{selector:'#other'}],handles),null);
 assert.equal(await validateUiProposals(p,[{selector:'button'}],handles),null);
}));
test('DOM reordering during AI selection cannot redirect the click',()=>fixture(async p=>{
 await p.setContent('<button id="a" onclick="window.clicked=1">Ekle</button><button id="b" onclick="window.clicked=2">Ekle</button>');
 await executeUiAction(p,'Click on the button labeled "ekle"','',{disambiguate:async()=>{await p.evaluate(()=>document.body.prepend(document.querySelector('#b')));return 1;}});
 assert.equal(await p.evaluate(()=>window.clicked),2);
}));
test('removed AI target is not replaced by another same-named control',()=>fixture(async p=>{
 await p.setContent('<button id="a" onclick="window.clicked=1">Ekle</button><button id="b" onclick="window.clicked=2">Ekle</button>');
 await assert.rejects(executeUiAction(p,'Click on the button labeled "ekle"','',{timeout:300,disambiguate:async()=>{await p.locator('#a').evaluate(e=>e.remove());return 0;}}),/not attached|detached/i);
 assert.equal(await p.evaluate(()=>window.clicked),undefined);
}));

test('failure capture masks editable fields and redacts supplied values',()=>fixture(async p=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {captureRunDiagnostic}=await import('../utils/runDiagnostics.js');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tt-capture-'));const previous=process.env.RUNTIME_DIAGNOSTIC_DIR;process.env.RUNTIME_DIAGNOSTIC_DIR=dir;
 try {
  await p.setContent('<label for="password">Şifre</label><input id="password">');
  await p.locator('input').fill('secret-one');
  await captureRunDiagnostic(p,{action:'fill',target:'Şifre',value:'secret-one',instruction:'Fill secret-one'},0,new Error('secret-one'),['secret-one']);
  const first=await fs.readFile(path.join(dir,'screen.png'));
  const metadata=await fs.readFile(path.join(dir,'metadata.json'),'utf8');assert.equal(metadata.includes('secret-one'),false);
  await p.locator('input').fill('secret-two-longer');
  await captureRunDiagnostic(p,{action:'fill',target:'Şifre',value:'secret-two-longer',instruction:'Fill'},0,new Error('FAIL'),['secret-two-longer']);
  const second=await fs.readFile(path.join(dir,'screen.png'));
  assert.deepEqual(first,second); // changing masked input contents cannot change the captured image
 }finally{if(previous===undefined)delete process.env.RUNTIME_DIAGNOSTIC_DIR;else process.env.RUNTIME_DIAGNOSTIC_DIR=previous;await fs.rm(dir,{recursive:true,force:true});}
}));

test('a link presented as a button is resolved by its visible name',()=>fixture(async p=>{
 await p.setContent('<a href="#" class="btn" onclick="window.clicked=1;return false">Ekle</a>');
 await executeUiAction(p,'Click on the button labeled "ekle"');assert.equal(await p.evaluate(()=>window.clicked),1);
}));
test('plain JavaScript clickable controls do not require framework classes',()=>fixture(async p=>{
 await p.setContent('<div onclick="window.clicked=1">Ekle</div><div>Unrelated text</div>');
 await executeUiAction(p,'Click on the button labeled "ekle"');assert.equal(await p.evaluate(()=>window.clicked),1);
}));
test('custom option selection can be verified from the combobox value',()=>fixture(async p=>{
 await p.setContent('<label for="role">Rol</label><input id="role" role="combobox" aria-controls="list" readonly onclick="document.querySelector(\'#list\').hidden=false"><div id="list" role="listbox" hidden><div role="option" onclick="document.querySelector(\'#role\').value=\'Öğretim elemanı\';this.remove()">Öğretim elemanı</div></div>');
 await executeUiAction(p,{action:'open',control:'dropdown',target:'Rol',instruction:'Open Rol'});
 await executeUiAction(p,{action:'select',target:'Öğretim elemanı',instruction:'Select option'});
 assert.equal(await p.locator('#role').inputValue(),'Öğretim elemanı');
}));
