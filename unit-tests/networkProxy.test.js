import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {startNetworkProxy} from '../utils/networkProxy.js';
import {resolveSafeHost,isSafeUrl,isPrivateIp} from '../utils/ipGuard.js';

function proxyRequest(proxy,url) {
    const p=new URL(proxy.url);
    return new Promise((resolve,reject)=>{
        const req=http.request({host:p.hostname,port:p.port,path:url,method:'GET'},res=>{
            let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}));
        });req.on('error',reject);req.end();
    });
}
function tunnel(proxy,authority) {
    const p=new URL(proxy.url);
    return new Promise((resolve,reject)=>{
        const socket=net.connect({host:p.hostname,port:p.port},()=>socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
        socket.once('data',data=>{socket.destroy();resolve(String(data))});socket.on('error',reject);
    });
}

test('HTTP ve CONNECT ile loopback/metadata proxy üzerinde engellenir',async()=>{
    const proxy=await startNetworkProxy();
    try {
        for(const url of ['http://127.0.0.1/','http://169.254.169.254/latest/meta-data','http://[::ffff:127.0.0.1]/']) {
            assert.equal((await proxyRequest(proxy,url)).status,403);
        }
        assert.match(await tunnel(proxy,'127.0.0.1:443'),/403/);
        assert.match(await tunnel(proxy,'169.254.169.254:443'),/403/);
    } finally {await proxy.close();}
});

test('güvenli DNS sonucu bağlantıda aynı numeric IP olarak kullanılır',async()=>{
    const seen=[];
    const target=http.createServer((req,res)=>res.end('PINNED'));
    await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
    const proxy=await startNetworkProxy({
        resolveHost:async()=>({safe:true,address:'1.1.1.1',family:4}),
        request:(options,callback)=>{
            seen.push(options.hostname);
            return http.request({...options,hostname:'127.0.0.1',port:target.address().port},callback);
        },
    });
    try {
        assert.equal((await proxyRequest(proxy,'http://changing-dns.example/')).body,'PINNED');
        assert.deepEqual(seen,['1.1.1.1']);
    } finally {await proxy.close();target.close();}
});

test('DNS public→private değişince sonraki bağlantı engellenir, host kararı cache edilmez',async()=>{
    let calls=0,requests=0;
    const target=http.createServer((req,res)=>res.end('OK'));await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
    const resolver=host=>resolveSafeHost(host,async()=>[{address:++calls===1?'1.1.1.1':'127.0.0.1',family:4}]);
    const proxy=await startNetworkProxy({resolveHost:resolver,request:(opts,cb)=>{requests++;return http.request({...opts,hostname:'127.0.0.1',port:target.address().port},cb)}});
    try {
        assert.equal((await proxyRequest(proxy,'http://changing-dns.example/')).status,200);
        assert.equal((await proxyRequest(proxy,'http://changing-dns.example/again')).status,403);
        assert.equal(requests,1);assert.equal(calls,2);
    } finally {await proxy.close();target.close();}
});

test('karışık public/private DNS yanıtı reddedilir',async()=>{
    const r=await resolveSafeHost('mixed.example',async()=>[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}]);
    assert.equal(r.safe,false);
});

test('URL kimlik bilgisi, izinsiz port, geçiş IPv6 ağları reddedilir',async()=>{
    assert.equal((await isSafeUrl('https://user:password@1.1.1.1/')).safe,false);
    assert.equal((await isSafeUrl('http://1.1.1.1:22/')).safe,false);
    for(const ip of ['64:ff9b:1::a00:1','2002:7f00:1::','2001::1']) assert.equal(isPrivateIp(ip),true);
});

test('CONNECT hedefi numeric IPye pinlenir ve yanlış authority biçimi reddedilir',async()=>{
    const seen=[];
    const target=net.createServer(socket=>socket.on('data',()=>{}));await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
    const proxy=await startNetworkProxy({resolveHost:async()=>({safe:true,address:'1.1.1.1',family:4}),connect:opts=>{seen.push(opts.host);return net.connect({host:'127.0.0.1',port:target.address().port})}});
    try {
        assert.match(await tunnel(proxy,'public.example:443'),/200 Connection/);assert.deepEqual(seen,['1.1.1.1']);
        assert.match(await tunnel(proxy,'user@public.example:443'),/403/);
    } finally {await proxy.close();target.close();}
});
