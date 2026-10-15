import './setup-env.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateValue,applyScenarioData,compileScenarioData} from '../utils/scenarioData.js';
import {reserveRunSequence} from '../services/runSequence.js';
import {selectOptionIndex} from '../utils/formActions.js';
import {runtimeStepsSchema} from '../schemas/runtimeSteps.js';
import {createScenarioSchema} from '../schemas/scenarioSchemas.js';
test('kurallar: sabit login, sıfırlı sayı, son ek ve e-posta',()=>{
 assert.equal(generateValue('login@example.com','fixed','7'),'login@example.com');
 assert.equal(generateValue('000123','increment','2'),'000125');
 assert.equal(generateValue('feyza1','suffix','2'),'feyza3');
 assert.equal(generateValue('feyza@example.com','email','2'),'feyza2@example.com');
 assert.throws(()=>generateValue('99','increment','1'),/uzunlu/);
});
test('numaralar eşzamanlı ve yeniden başlatılan süreçlerde tekrarlanmaz',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'seq-test-'));
 try {
 const nums=await Promise.all(Array.from({length:30},()=>reserveRunSequence('scenario',dir)));
 assert.equal(new Set(nums).size,30);assert.equal(await reserveRunSequence('scenario',dir),'31');
 assert.equal(await reserveRunSequence('other',dir),'1');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
const field={key:'email',label:'E-Posta',value:'f@example.com',action:'fill',selectionMode:'text',rule:'email',scope:''};
test('aynı değişken adımlarda ve formda aynı değeri alır; temel senaryo değişmez',()=>{
 const runtime={targetUrl:'https://example.com',steps:[{type:'form',instruction:'E-Posta',form:field},{type:'act',instruction:'Search for "{{data.email}}"'},{type:'act',instruction:'Login with "fixed@example.com"'}],testData:{enabled:true,fields:[field],variables:[]}};
 const result=applyScenarioData(runtime,'4');assert.equal(result.steps[0].form.value,'f4@example.com');assert.match(result.steps[1].instruction,/f4@example/);assert.match(result.steps[2].instruction,/fixed@example/);assert.equal(runtime.steps[0].form.value,'f@example.com');
 runtime.testData.enabled=false;assert.equal(applyScenarioData(runtime,'4').steps[0].form.value,'f@example.com');
});
test('JSON form adımları AI çevirisinden ayrılır ve sıralama korunur',async()=>{
 const translate=async text=>({steps:text.split('\n').map(instruction=>({type:'act',instruction}))});
 const result=await compileScenarioData('Login\n[[FORM:email]]\nSave',{fields:[field],variables:[]},translate,'https://example.com');
 assert.deepEqual(result.steps.map(s=>s.type),['act','form','act']);assert.equal(result.steps[1].form.key,'email');
 assert.throws(()=>runtimeStepsSchema.parse({...result,targetUrl:'https://example.com',steps:[{type:'form',instruction:'missing'}]}));
 await assert.rejects(compileScenarioData('[[FORM:unknown]]',{},translate,''),/bulunamad/);
});
test('ID eşleşmemesi sıra/rastgele seçime dönüşmez; sıra ve rastgele açık kurallardır',()=>{
 const options=[{text:'Matematik',value:'uuid-a'},{text:'Türkçe',value:'uuid-b'},{text:'Fen',value:'uuid-c'}];
 assert.equal(selectOptionIndex(options,'index','2'),2);assert.equal(selectOptionIndex(options,'value','uuid-c'),2);
 assert.throws(()=>selectOptionIndex(options,'value','2'),/NOT_FOUND/);assert.throws(()=>selectOptionIndex(options,'index','3'),/OUT_OF_RANGE/);
 assert.equal(selectOptionIndex(options,'text','fen'),2);assert.equal(selectOptionIndex(options,'random','',()=>1),1);
});
test('alan ayarları API şemasından geçer; kimlik/şifre değişimi reddedilir',()=>{
 const body={scenarioName:'Test',turkishInstructions:'[[FORM:email]]',targetUrl:'https://example.com',testData:{enabled:true,fields:[field]}};
 assert.equal(createScenarioSchema.parse({body}).body.testData.fields.length,1);
 assert.throws(()=>createScenarioSchema.parse({body:{...body,testData:{fields:[{...field,key:'identityNo',label:'Kimlik',rule:'increment'}]}}}));
});

test('numara ayrı işletim sistemi süreçlerinde de benzersizdir',async()=>{
 const {spawn}=await import('node:child_process');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'seq-process-'));
 try{
  const moduleUrl=new URL('../services/runSequence.js',import.meta.url).href;
  const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',`import {reserveRunSequence} from ${JSON.stringify(moduleUrl)};console.log(await reserveRunSequence('same',process.argv[1]));`,dir]);let out='';child.stdout.on('data',d=>out+=d);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error('Child failed')));});
  const results=await Promise.all(Array.from({length:8},run));assert.equal(new Set(results).size,8);assert.equal(await reserveRunSequence('same',dir),'9');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
