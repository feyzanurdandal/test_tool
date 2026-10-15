import './setup-env.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import dpu from '../config/dpuService.js';
import {evaluateTestOutcome,buildRuntimeSteps} from '../services/testRunner.js';
import {runtimeStepsSchema} from '../schemas/runtimeSteps.js';
import {verifyExpectedBlock} from '../utils/testOutcome.js';
import {passwordSchema,createScenarioSchema} from '../schemas/scenarioSchemas.js';
import {withAiCapacity} from '../middleware/aiCapacity.js';

test('altyapı hataları, hata logu veya sahte başarı metni beklenen engelleme sayılmaz',()=>{
    for(const log of ['Error: Incorrect API key','Error: Failed to launch browser','Error: timeout','Erişim engellendi']) {
        assert.equal(evaluateTestOutcome(log,'engellendi','ERROR_EXPECTED',false,true),'FAILED');
        assert.equal(evaluateTestOutcome(log,'engellendi','ERROR_EXPECTED',true,false),'FAILED');
    }
    assert.equal(evaluateTestOutcome('doğrulandı','','ERROR_EXPECTED',true,true),'SUCCESS');
});

test('görünen beklenen mesaj doğrulanır; boş/genel keyword yeterli olmaz',()=>{
    assert.equal(verifyExpectedBlock('Bu işlem için yetkiniz bulunmuyor.','yetkiniz bulunmuyor'),true);
    assert.equal(verifyExpectedBlock('Error: timeout','yetkiniz bulunmuyor'),false);
    assert.equal(verifyExpectedBlock('hata',''),false);
});

test('boş, desteklenmeyen ve aşırı uzun AI adımları reddedilir',async()=>{
    for(const steps of [[],[{type:'unknown',instruction:'x'}],[{type:'observe',instruction:'x'}],[{type:'act',instruction:''}],[{type:'act',instruction:'a'.repeat(4001)}]]) {
        await assert.rejects(buildRuntimeSteps({hedef_url:'https://1.1.1.1/',adimlar:JSON.stringify({steps})}));
    }
    assert.equal(runtimeStepsSchema.safeParse({targetUrl:'https://1.1.1.1',steps:[{type:'act',instruction:'x'}],expectedOutcome:'ERROR_EXPECTED'}).success,false);
});

test('şifre politikası karakter ve bcrypt byte sınırını birlikte uygular',()=>{
    assert.equal(passwordSchema.safeParse('x').success,false);
    assert.equal(passwordSchema.safeParse('secure-password-123').success,true);
    assert.equal(passwordSchema.safeParse('ğ'.repeat(37)).success,false);
});

test('beklenen engelleme mesajı olmadan ERROR_EXPECTED senaryo kaydedilemez',()=>{
    const body={scenarioName:'s',turkishInstructions:'x',targetUrl:'https://1.1.1.1/',expectedOutcome:'ERROR_EXPECTED'};
    assert.equal(createScenarioSchema.safeParse({body}).success,false);
    assert.equal(createScenarioSchema.safeParse({body:{...body,expectedErrorText:'Erişim engellendi'}}).success,true);
});

test('production zayıf JWT veya HTTP DPU yapılandırmasıyla başlamaz',()=>{
    for(const changes of [{JWT_SECRET:'x',DPU_BASE_URL:'https://example.com'},{JWT_SECRET:'ab0123456789cd'.repeat(4),DPU_BASE_URL:'http://127.0.0.1:9'}]) {
        const p=spawnSync(process.execPath,['--input-type=module','-e',"import './config/env.js';"],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',...changes},encoding:'utf8'});
        assert.notEqual(p.status,0);
    }
});

test('cevap başlığı gelse bile DPU gövdesi timeout sınırını aşamaz',async()=>{
    let finishTimer;
    const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();finishTimer=setTimeout(()=>res.end('{"success":true}'),400);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
        const start=performance.now();
        const result=await dpu.fetchWithTimeoutAndRetry(`http://127.0.0.1:${server.address().port}/`,{}, {timeoutMs:50,retries:0});
        assert.equal(result.success,false);assert.ok(performance.now()-start<350);
    } finally {clearTimeout(finishTimer);server.closeAllConnections();server.close();}
});

test('AI eşzamanlılık slotu işlem bitene kadar tutulur',async()=>{
    let release;const blocked=new Promise(resolve=>{release=resolve});
    const handler=withAiCapacity(async()=>blocked);
    const res={status(code){this.code=code;return this},json(body){this.body=body;return this}};
    const one=handler({}, {}, ()=>{}),two=handler({}, {}, ()=>{});
    await handler({},res,()=>{});assert.equal(res.code,429);
    release();await Promise.all([one,two]);
    await handler({}, {}, ()=>{});
});
