import fs from 'node:fs/promises';

// Child process yalnızca parent'ın oluşturduğu çalışma dizinine görüntü yazar.
// Görüntüler statik dosya sunucusundan yayımlanmaz.
export function startLiveFrames(page,file=process.env.RUN_LIVE_FRAME_PATH) {
    if(!file)return async()=>{};
    let closed=false,current=null;
    const capture=()=>{
        if(closed)return Promise.resolve();
        if(current)return current;
        current=(async()=>{
            try {const image=await page.screenshot({type:'jpeg',quality:65,timeout:3000});await fs.writeFile(file+'.tmp',image,{mode:0o600});await fs.rename(file+'.tmp',file);}catch{}finally{current=null;}
        })();
        return current;
    };
    const interval=Math.min(5000,Math.max(500,Number(process.env.RUN_LIVE_FRAME_INTERVAL_MS)||900));const timer=setInterval(capture,interval);timer.unref();void capture();
    return async()=>{clearInterval(timer);if(current)await current;await capture();closed=true;};
}
