import http from 'node:http';
import net from 'node:net';
import { resolveSafeHost, isAllowedTestPort, isSafeUrl } from './ipGuard.js';

// Her testin kendi loopback proxy'si vardır. HTTP ve HTTPS/WSS CONNECT bağlantısı
// kontrol edilen numeric IP'ye gider: tarayıcı/işletim sistemi yeniden DNS çözmez.
export async function startNetworkProxy({ resolveHost = resolveSafeHost, connect = net.connect, request = http.request } = {}) {
    const sockets = new Set();
    const deny = res => { if (!res.headersSent) res.writeHead(403); res.end('Test network policy denied this request.'); };
    async function destination(host, port) {
        if (!Number.isInteger(port) || !isAllowedTestPort(port)) throw new Error('Port denied');
        const verdict = await resolveHost(host);
        if (!verdict.safe || !net.isIP(verdict.address)) throw new Error('Host denied');
        return verdict;
    }
    function track(socket) {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
        socket.setTimeout(30000, () => socket.destroy());
        return socket;
    }
    const server = http.createServer(async (req, res) => {
        let upstream;
        try {
            const url = new URL(req.url);
            if (url.protocol !== 'http:' || url.username || url.password) return deny(res);
            const port = Number(url.port || 80);
            const verdict = await destination(url.hostname, port);
            if (req.destroyed || res.destroyed) return;
            const headers = {...req.headers, host:url.host};
            for (const key of ['proxy-authorization','proxy-connection','connection','upgrade','keep-alive']) delete headers[key];
            upstream = request({ hostname:verdict.address, family:verdict.family, port, method:req.method,
                path:url.pathname+url.search, headers, agent:false }, response => {
                res.writeHead(response.statusCode || 502, response.headers);
                response.pipe(res);
            });
            upstream.on('socket', track);
            upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Upstream unavailable.'); });
            req.on('aborted', () => upstream.destroy());
            res.on('close', () => upstream.destroy());
            req.pipe(upstream);
        } catch { upstream?.destroy(); deny(res); }
    });
    server.on('connect', async (req, client, head) => {
        client.on('error', () => {});
        try {
            // CONNECT yalnızca authority biçiminde hostname:port kabul eder.
            if (!/^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+):[0-9]+$/i.test(req.url)) throw new Error();
            const url = new URL(`https://${req.url}`);
            const host = url.hostname.replace(/^\[|\]$/g,'');
            const port = Number(url.port || 443);
            const verdict = await destination(host,port);
            if (client.destroyed) return;
            const upstream = track(connect({host:verdict.address, family:verdict.family, port}));
            upstream.once('error', () => client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'));
            upstream.once('connect', () => {
                if (client.destroyed) { upstream.destroy(); return; }
                client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                if (head.length) upstream.write(head);
                client.pipe(upstream); upstream.pipe(client);
            });
            client.on('close', () => upstream.destroy());
            upstream.on('close', () => client.destroy());
        } catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
    });
    server.on('upgrade', async (req, client, head) => {
        let upstream;
        try {
            const url = new URL(req.url);
            if (!['http:', 'ws:'].includes(url.protocol) || url.username || url.password || req.headers.upgrade?.toLowerCase() !== 'websocket') throw new Error();
            const port = Number(url.port || 80);
            const verdict = await destination(url.hostname, port);
            if (client.destroyed) return;
            const headers = {...req.headers,host:url.host,connection:'Upgrade',upgrade:'websocket'};
            delete headers['proxy-authorization']; delete headers['proxy-connection'];
            upstream = request({hostname:verdict.address,family:verdict.family,port,method:'GET',path:url.pathname+url.search,headers,agent:false});
            upstream.on('socket',track);
            upstream.on('upgrade',(response,socket,upstreamHead)=>{
                let responseHead = 'HTTP/1.1 101 Switching Protocols\r\n';
                for (const [key,value] of Object.entries(response.headers)) {
                    if (value !== undefined) responseHead += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`;
                }
                client.write(responseHead+'\r\n');
                if (head.length) socket.write(head);
                if (upstreamHead.length) client.write(upstreamHead);
                socket.on('error',()=>client.destroy()); socket.on('close',()=>client.destroy());
                client.on('close',()=>socket.destroy());
                client.pipe(socket); socket.pipe(client);
            });
            upstream.on('response',response=>{response.destroy();client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');});
            upstream.on('error',()=>client.destroy());
            client.on('close',()=>upstream.destroy());
            upstream.end();
        } catch { upstream?.destroy(); client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
    });
    server.on('connection', track);
    server.maxConnections = 64;
    server.headersTimeout = 10000;
    server.requestTimeout = 30000;
    await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
    return {
        url:`http://127.0.0.1:${server.address().port}`,
        async close() {
            for (const socket of sockets) socket.destroy();
            await new Promise(resolve => server.close(resolve));
        },
    };
}

export function browserNetworkArgs(proxyUrl) {
    return [`--proxy-server=${proxyUrl}`, '--proxy-bypass-list=<-loopback>', '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'];
}

export async function installBrowserNetworkGuard(context) {
    await context.route('**/*', route => {
        const protocol = new URL(route.request().url()).protocol;
        return ['http:','https:'].includes(protocol) ? route.continue() : route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', async socket => {
        const target = new URL(socket.url());
        if (!['ws:','wss:'].includes(target.protocol)) return socket.close({code:1008,reason:'Protocol denied'});
        target.protocol = target.protocol === 'wss:' ? 'https:' : 'http:';
        const checked = await isSafeUrl(target.href);
        if (!checked.safe) return socket.close({code:1008,reason:'Network policy denied'});
        socket.connectToServer();
    });
}
