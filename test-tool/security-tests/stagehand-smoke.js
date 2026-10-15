import '../unit-tests/setup-env.js';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import {startNetworkProxy,browserNetworkArgs,installBrowserNetworkGuard} from '../utils/networkProxy.js';
const target=http.createServer((req,res)=>res.end('STAGEHAND SMOKE OK'));
await new Promise(r=>target.listen(0,'127.0.0.1',r));
process.env.ALLOWED_PRIVATE_HOSTS='127.0.0.1';process.env.ALLOWED_TEST_PORTS=String(target.address().port);
process.env.OPENAI_API_KEY='test-only-not-a-real-key';
const proxy=await startNetworkProxy();let stagehand;
try {
 stagehand=new Stagehand({env:'LOCAL',model:'openai/gpt-4o-mini',localBrowserLaunchOptions:{executablePath:process.env.AUDIT_CHROMIUM_PATH,headless:true,proxy:{server:proxy.url,bypass:'<-loopback>'},args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu',...browserNetworkArgs(proxy.url)]}});
 await stagehand.init();const browser=await chromium.connectOverCDP(stagehand.connectURL());
 const context=browser.contexts()[0];await installBrowserNetworkGuard(context);
 const page=context.pages()[0];await page.goto(`http://127.0.0.1:${target.address().port}`);
 assert.equal(await page.textContent('body'),'STAGEHAND SMOKE OK');
 await browser.close();console.log('Stagehand init / browser proxy / permitted navigation: PASS');
} finally {try {await stagehand?.close();} finally {await proxy.close();target.close();}}
