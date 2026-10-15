// Runs the real Playwright/Stagehand process against a disposable local fixture.
// No real AI calls: deterministic targets plus explicit business assertions.
import '../unit-tests/setup-env.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runPlaywrightTest} from '../services/testRunner.js';
import {loadDiagnostic,deleteDiagnostic} from '../services/diagnosticService.js';

test('real runner preserves scope, verifies business result and saves a protected failure capture',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tt-full-runner-'));
 let clicks=0;
 const site=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url.startsWith('/api/v1/auth/token'))return res.end(JSON.stringify({success:true,data:{token:'fixture-only',expires_at:new Date(Date.now()+3600000).toISOString()}}));
  if(req.url.startsWith('/api/v1/'))return res.end(JSON.stringify({success:true,data:[]}));
  if(req.url==='/clicked'){clicks++;return res.end('{}');}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<section><h2>Liste</h2><button onclick="fetch('/clicked');document.querySelector('#result').textContent='Yanlış işlem'">Ekle</button></section>
<section><h2>Rol Seçimi</h2><label for="name">Adı</label><input id="name"><button onclick="fetch('/clicked');document.querySelector('#result').textContent='Kaydedildi'"> <i>+</i> Ekle </button></section><p id="result"></p>`);
 });
 await new Promise(r=>site.listen(0,'127.0.0.1',r));
 const port=site.address().port,url=`http://127.0.0.1:${port}/`;
 const keys=['DPU_BASE_URL','OPENAI_API_KEY','HEADLESS','DOCKER_ENV','CHROME_PATH','ALLOWED_PRIVATE_HOSTS','ALLOWED_TEST_PORTS','DIAGNOSTIC_DIR'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{DPU_BASE_URL:url.slice(0,-1),DOCKER_ENV:'true',OPENAI_API_KEY:'fixture-only-no-real-key',HEADLESS:'true',CHROME_PATH:process.env.AUDIT_CHROMIUM_PATH||process.env.CHROME_PATH||'',ALLOWED_PRIVATE_HOSTS:'127.0.0.1',ALLOWED_TEST_PORTS:String(port),DIAGNOSTIC_DIR:path.join(dir,'private')});
 try {
  const steps=[{type:'act',action:'fill',control:'input',target:'Adı',value:'private-test-value',scope:'Rol Seçimi',instruction:'Fill Adı in Rol Seçimi'},
   {type:'act',action:'click',control:'button',target:'Ekle',scope:'Rol Seçimi',instruction:'Click Ekle in Rol Seçimi'},
   {type:'assert',instruction:'Check saved message',expect:{kind:'visible',target:'Kaydedildi'}}];
  const successFile=path.join(dir,'success.json');await fs.writeFile(successFile,JSON.stringify({targetUrl:url,steps}));
  const success=await runPlaywrightTest(successFile,45000,{projectId:1,secrets:['private-test-value']});
  assert.equal(success.isSuccess,true,success.logContent);assert.equal(clicks,1);
  assert.equal(success.logContent.includes('private-test-value'),false);
  steps[2].expect.target='Olmayan iş sonucu';
  const failureFile=path.join(dir,'failure.json');await fs.writeFile(failureFile,JSON.stringify({targetUrl:url,steps}));
  const failure=await runPlaywrightTest(failureFile,45000,{projectId:1,secrets:['private-test-value']});
  assert.equal(failure.isSuccess,false);assert.equal(clicks,2); // one save per run, never replayed
  assert.match(failure.logContent,/TANI_KAYDI/);
  const record=await loadDiagnostic(failure.diagnosticId,1);assert.equal(record.metadata.step,3);assert.ok(record.screenshot);
  assert.equal(await loadDiagnostic(failure.diagnosticId,2),null);await deleteDiagnostic(failure.diagnosticId);
  assert.equal(await fs.stat(failureFile+'.diagnostic').catch(()=>null),null); // temporary plaintext evidence removed
 }finally{for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];site.closeAllConnections();site.close();await fs.rm(dir,{recursive:true,force:true});}
});
