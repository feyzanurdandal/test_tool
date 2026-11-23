import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordedActionSchema } from '../schemas/recording.js';
import { testDataSchema } from '../schemas/testData.js';
import { compileScenarioData } from '../utils/scenarioData.js';
import { BrowserSessions } from '../services/browserSessions.js';

test('kayıtlı adımlar hedef, URL ve tuş doğrulamasını atlayamaz',()=>{
    assert.equal(recordedActionSchema.safeParse({key:'r',action:'click'}).success,false);
    for(const url of ['file:///etc/passwd','javascript:alert(1)','http://user:pass@example.com'])assert.equal(recordedActionSchema.safeParse({key:'r',action:'goto',value:url}).success,false);
    assert.equal(recordedActionSchema.safeParse({key:'r',action:'press',target:{selector:'#x'},value:'F12'}).success,false);
    assert.equal(recordedActionSchema.safeParse({key:'r',action:'assertText',value:''}).success,false);
});
test('şifre hedefinin etiketi değiştirilse bile otomatik değişim açılamaz',()=>{
    assert.equal(testDataSchema.safeParse({fields:[{key:'f',label:'Alan',value:'123',action:'fill',rule:'increment',target:{selector:'#pw',inputType:'password'}}]}).success,false);
});
test('kayıt markerının metadata olmadan kaydedilmesi engellenir',async()=>{
    await assert.rejects(compileScenarioData('[[REC:r]]',{},()=>{throw Error('AI_CALLED');},'https://example.com'),/Kayıtlı adım bulunamadı/);
});
test('kayıt sahibi kontrol edilir; bağlantısız oturum ve tamamlanan görüntü temizlenir',async()=>{
    let now=100;const service=new BrowserSessions({now:()=>now});
    try {
        const r={id:'r',mode:'record',owner:'u1',createdAt:now,lastSeen:now,state:'recording',chain:Promise.resolve()};service.sessions.set('r',r);
        assert.throws(()=>service.get('r','u2'),/bulunamadı/);
        now+=120001;await service.cleanup();assert.equal(service.sessions.has('r'),false);
        const live=service.createLive({owner:'u1',projectName:'P'});service.finishLive(live);now+=120001;await service.cleanup();assert.equal(service.sessions.has(live.id),false);
    }finally{clearInterval(service.timer);}
});
