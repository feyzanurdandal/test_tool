import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const TTL=24*60*60*1000,MAX_FILES=100,MAX_BYTES=100*1024*1024;
const root=()=>path.resolve(process.env.DIAGNOSTIC_DIR||path.join(process.cwd(),'diagnostics'));
const valid=id=>/^[0-9a-f]{32}$/.test(id||'');
function seal(buffer) {
    const iv=crypto.randomBytes(12),key=Buffer.from(process.env.ENCRYPTION_KEY||'','hex');
    if(key.length!==32)throw new Error('Tanı kayıtları için geçerli ENCRYPTION_KEY gerekli.');
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    const body=Buffer.concat([cipher.update(buffer),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),body]);
}
function open(buffer) {
    const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(process.env.ENCRYPTION_KEY||'','hex'),buffer.subarray(0,12));
    decipher.setAuthTag(buffer.subarray(12,28));return Buffer.concat([decipher.update(buffer.subarray(28)),decipher.final()]);
}
export function diagnosticIdFromReport(report) {
    return String(report?.log_content||'').match(/\[TANI_KAYDI\]:([0-9a-f]{32})(?:\s|$)/)?.[1]||null;
}
export async function cleanupDiagnostics(now=Date.now()) {
    await fs.mkdir(root(),{recursive:true,mode:0o700});
    const entries=[];
    for(const name of await fs.readdir(root())) {
        if(!/^[0-9a-f]{32}\.enc$/.test(name))continue;
        const file=path.join(root(),name),stat=await fs.stat(file);
        if(now-stat.mtimeMs>=TTL)await fs.rm(file,{force:true});
        else entries.push({file,stat});
    }
    entries.sort((a,b)=>a.stat.mtimeMs-b.stat.mtimeMs);
    let bytes=entries.reduce((s,e)=>s+e.stat.size,0);
    while(entries.length>MAX_FILES||bytes>MAX_BYTES) {
        const entry=entries.shift();bytes-=entry.stat.size;await fs.rm(entry.file,{force:true});
    }
}
let cleaning=false;
const janitor=setInterval(async()=>{if(cleaning)return;cleaning=true;try{await cleanupDiagnostics();}catch{}finally{cleaning=false;}},60*60*1000);janitor.unref();
export async function saveDiagnostic(dir,projectId) {
    try {
        const metadataFile=await fs.readFile(path.join(dir,'metadata.json'));
        if(metadataFile.length>100000)return null;
        const metadata=JSON.parse(metadataFile);
        let screenshot=null;
        try{const b=await fs.readFile(path.join(dir,'screen.png'));if(b.length<=2*1024*1024)screenshot=b.toString('base64');}catch{}
        const id=crypto.randomBytes(16).toString('hex');
        const record={metadata,screenshot,projectId:String(projectId),expiresAt:Date.now()+TTL};
        await cleanupDiagnostics();
        await fs.writeFile(path.join(root(),id+'.enc'),seal(Buffer.from(JSON.stringify(record))),{mode:0o600});
        await cleanupDiagnostics();return id;
    }catch{return null;}
}
export async function loadDiagnostic(id,projectId) {
    if(!valid(id))return null;
    try {
        const record=JSON.parse(open(await fs.readFile(path.join(root(),id+'.enc'))));
        if(record.expiresAt<=Date.now()){await deleteDiagnostic(id);return null;}
        if(record.projectId!==String(projectId))return null;
        return record;
    }catch{return null;}
}
export async function deleteDiagnostic(id) {
    if(valid(id))await fs.rm(path.join(root(),id+'.enc'),{force:true});
}
