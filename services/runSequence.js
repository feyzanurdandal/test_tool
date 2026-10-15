import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const RUN_DATA_DIR=process.env.RUN_DATA_DIR || path.resolve('run-data');
// Her numara O_EXCL ile bir kez ayrılır. Kilit/silme/yeniden kullanma yoktur.
// Aynı fiziksel dizini paylaşan süreçler atomik dosya oluşturma ile yarışabilir.
export async function reserveRunSequence(scenarioKey,baseDir=RUN_DATA_DIR) {
    const dir=path.join(baseDir,crypto.createHash('sha256').update(String(scenarioKey)).digest('hex'));
    await fs.mkdir(dir,{recursive:true,mode:0o700});
    const files=await fs.readdir(dir);
    let next=files.reduce((m,f)=>/^\d+\.seq$/.test(f)?(BigInt(f.slice(0,-4))>m?BigInt(f.slice(0,-4)):m):m,0n)+1n;
    for(let attempt=0;attempt<1000;attempt++,next++) {
        try {
            const file=await fs.open(path.join(dir,next+'.seq'),'wx',0o600);
            try{await file.sync();}finally{await file.close();}
            return next.toString();
        }catch(e){if(e.code!=='EEXIST')throw e;}
    }
    throw new Error('Koşu numarası ayrılamadı. Daha sonra tekrar deneyin.');
}
