import './setup-env.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {saveDiagnostic,loadDiagnostic,deleteDiagnostic,cleanupDiagnostics,diagnosticIdFromReport} from '../services/diagnosticService.js';
import {scenarioSecrets,redactRunText} from '../utils/runDiagnostics.js';
import {runtimeStepsSchema} from '../schemas/runtimeSteps.js';

test('tanı kaydı şifrelenir, proje sınırı ve süre aşımı uygulanır',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tt-diagnostics-'));
 const evidence=path.join(dir,'evidence');await fs.mkdir(evidence);
 const previous=process.env.DIAGNOSTIC_DIR;process.env.DIAGNOSTIC_DIR=path.join(dir,'store');
 try {
  await fs.writeFile(path.join(evidence,'metadata.json'),JSON.stringify({step:7,target:'Ekle',error:'TARGET_NOT_FOUND'}));
  await fs.writeFile(path.join(evidence,'screen.png'),Buffer.from('fake-png-for-storage-test'));
  const id=await saveDiagnostic(evidence,1);assert.match(id,/^[a-f0-9]{32}$/);
  const stored=await fs.readFile(path.join(process.env.DIAGNOSTIC_DIR,id+'.enc'));
  assert.equal(stored.includes(Buffer.from('TARGET_NOT_FOUND')),false);
  assert.equal((await loadDiagnostic(id,1)).metadata.step,7);
  assert.equal(await loadDiagnostic(id,2),null);
  assert.equal(await loadDiagnostic('../'+id,1),null);
  assert.equal(diagnosticIdFromReport({log_content:'[TANI_KAYDI]:../x'}),null);
  // GCM rejects corrupted ciphertext instead of returning unauthenticated evidence.
  stored[stored.length-1]^=1;await fs.writeFile(path.join(process.env.DIAGNOSTIC_DIR,id+'.enc'),stored);
  assert.equal(await loadDiagnostic(id,1),null);
  await deleteDiagnostic(id);
  const expiredId=await saveDiagnostic(evidence,1);
  await cleanupDiagnostics(Date.now()+25*60*60*1000);
  assert.equal(await loadDiagnostic(expiredId,1),null);
 }finally{if(previous===undefined)delete process.env.DIAGNOSTIC_DIR;else process.env.DIAGNOSTIC_DIR=previous;await fs.rm(dir,{recursive:true,force:true});}
});

test('senaryo değerleri ve kimlik bilgileri loglarda maskelenir',()=>{
 const data={steps:[{action:'fill',value:'pass"with\\quotes',instruction:'Fill password'},{instruction:'Type "sample@example.test" into the input field labeled "E-posta"'}]};
 const secrets=scenarioSecrets(data);
 const raw=JSON.stringify({password:'pass"with\\quotes',email:'sample@example.test',token:'sk-proj-test-token'});
 const safe=redactRunText(raw,secrets);
 assert.equal(safe.includes('pass'),true); // key may remain; value must not
 assert.equal(safe.includes('with'),false);assert.equal(safe.includes('sample@example.test'),false);assert.equal(safe.includes('sk-proj-test-token'),false);
});

test('şema çevirinin bölüm ve konum alanlarını korur, doğrulamasız assert reddedilir',()=>{
 const scenario={targetUrl:'https://example.test',steps:[{type:'act',instruction:'Click Ekle in Rol Seçimi',action:'click',target:'Ekle',control:'button',scope:'Rol Seçimi',position:'top-right'}]};
 const parsed=runtimeStepsSchema.parse(scenario);assert.equal(parsed.steps[0].scope,'Rol Seçimi');assert.equal(parsed.steps[0].position,'top-right');
 assert.equal(runtimeStepsSchema.safeParse({...scenario,steps:[{type:'assert',instruction:'Check'}]}).success,false);
 assert.equal(runtimeStepsSchema.safeParse({...scenario,steps:[{type:'act',instruction:'Fill',action:'fill',target:'Adı'}]}).success,false);
});
