import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import dns from 'node:dns/promises';
import {chromium} from 'playwright-core';
import {WebSocketServer} from 'ws';
import {startNetworkProxy,browserNetworkArgs,installBrowserNetworkGuard} from '../utils/networkProxy.js';
import {isSafeUrl} from '../utils/ipGuard.js';

let target,port,requests=0,sockets=0,wss;
const originalLookup=dns.lookup;
const originalPorts=process.env.ALLOWED_TEST_PORTS, originalHosts=process.env.ALLOWED_PRIVATE_HOSTS;
before(async()=>{
    delete process.env.ALLOWED_PRIVATE_HOSTS;
    target=http.createServer((req,res)=>{requests++;res.end('PRIVATE TARGET');});
    wss=new WebSocketServer({server:target});wss.on('connection',ws=>{sockets++;ws.send('PERMITTED SOCKET');});
    await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));port=target.address().port;
    process.env.ALLOWED_TEST_PORTS=`80,443,${port}`;
});
after(()=>{
    dns.lookup=originalLookup;
    if(originalPorts===undefined) delete process.env.ALLOWED_TEST_PORTS;else process.env.ALLOWED_TEST_PORTS=originalPorts;
    if(originalHosts===undefined) delete process.env.ALLOWED_PRIVATE_HOSTS;else process.env.ALLOWED_PRIVATE_HOSTS=originalHosts;
    wss.close();target.close();
});
async function runBrowser(task) {
    const proxy=await startNetworkProxy();
    let browser;
    try {
    browser=await chromium.launch({executablePath:process.env.AUDIT_CHROMIUM_PATH || process.env.CHROME_PATH || chromium.executablePath(),headless:true,
        args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu',...browserNetworkArgs(proxy.url)]});
    const ctx=await browser.newContext();await installBrowserNetworkGuard(ctx);await task(await ctx.newPage());
    } finally {await browser?.close();await proxy.close();}
}

test('tarayıcı loopback HTTP ve WebSocket hedeflerine ulaşamaz',async()=>{
    const httpCount=requests, wsCount=sockets;
    await runBrowser(async page=>{
        const response=await page.goto(`http://127.0.0.1:${port}/private`);
        assert.equal(response.status(),403);assert.equal(requests,httpCount);
        const answer=await page.evaluate(port=>new Promise(resolve=>{
            const ws=new WebSocket(`ws://127.0.0.1:${port}/private`);
            const timer=setTimeout(()=>resolve('TIMEOUT'),2000);
            ws.onmessage=e=>{clearTimeout(timer);resolve(e.data);ws.close()};
            ws.onerror=()=>{clearTimeout(timer);resolve('DENIED')};ws.onclose=()=>{clearTimeout(timer);resolve('DENIED')};
        }),port);
        assert.equal(answer,'DENIED');assert.equal(sockets,wsCount);
    });
});

test('public DNS kararı sonraki private bağlantıya izin vermez',async()=>{
    let lookupCalls=0;const count=requests;
    dns.lookup=async(host,...args)=>host==='localhost'?[{address:++lookupCalls===1?'1.1.1.1':'127.0.0.1',family:4}]:originalLookup.call(dns,host,...args);
    try {
        assert.equal((await isSafeUrl(`http://localhost:${port}/rebind`)).safe,true);
        await runBrowser(async page=>{
            const response=await page.goto(`http://localhost:${port}/rebind`);
            assert.equal(response.status(),403);assert.equal(requests,count);assert.ok(lookupCalls>=2);
        });
    } finally {dns.lookup=originalLookup;}
});

test('yönetici tarafından açıkça izinli host ve port normal HTTP/WS akışını korur',async()=>{
    process.env.ALLOWED_PRIVATE_HOSTS='localhost';
    try {
        await runBrowser(async page=>{
            await page.goto(`http://localhost:${port}/allowed`);assert.match(await page.textContent('body'),/PRIVATE TARGET/);
            const answer=await page.evaluate(port=>new Promise(resolve=>{
                const ws=new WebSocket(`ws://localhost:${port}/allowed`);const timer=setTimeout(()=>resolve('TIMEOUT'),3000);
                ws.onmessage=e=>{clearTimeout(timer);resolve(e.data);ws.close()};ws.onerror=()=>{clearTimeout(timer);resolve('ERROR')};
            }),port);
            assert.equal(answer,'PERMITTED SOCKET');
        });
    } finally {delete process.env.ALLOWED_PRIVATE_HOSTS;}
});
