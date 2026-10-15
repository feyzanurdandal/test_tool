import { z } from 'zod';
const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
export const dataRuleSchema = z.enum(['fixed','increment','suffix','email']);
export const formFieldSchema = z.object({
    key, label:z.string().trim().min(1).max(200), scope:z.string().trim().max(200).default(''),
    value:z.string().max(2000), action:z.enum(['fill','select','date','check']),
    selectionMode:z.enum(['text','value','index','random']).default('text'),
    dateFormat:z.enum(['auto','MM/DD/YYYY','DD/MM/YYYY','DD.MM.YYYY','DD-MM-YYYY','YYYY-MM-DD']).default('auto'),
    typingMode:z.enum(['auto','fill','keyboard']).default('auto'),
    rule:dataRuleSchema.default('fixed'),
}).superRefine((f,ctx)=>{
    if (f.action==='select' && f.selectionMode==='index' && !/^\d+$/.test(f.value)) ctx.addIssue({code:'custom',message:'Sıra numarası 0 veya pozitif tam sayı olmalıdır.'});
    if (f.rule==='increment' && !/^\d+$/.test(f.value))ctx.addIssue({code:'custom',message:'Artırılacak değer yalnızca rakam içermelidir.'});
    if (f.rule==='email' && !/^[^\s@]+@[^\s@]+$/.test(f.value))ctx.addIssue({code:'custom',message:'E-posta kuralı için geçerli e-posta girin.'});
    if (f.rule!=='fixed' && (f.action!=='fill' || /password|şifre/i.test(f.key+' '+f.label))) ctx.addIssue({code:'custom',message:'Bu alan otomatik değiştirilemez.'});
});
export const testDataSchema = z.object({
    enabled:z.boolean().default(false),
    fields:z.array(formFieldSchema).max(80).default([]),
    variables:z.array(z.object({key,value:z.string().min(1).max(2000),rule:dataRuleSchema})).max(50).default([]),
}).superRefine((data,ctx)=>{
    for(const v of data.variables){if(v.rule==='increment'&&!/^\d+$/.test(v.value))ctx.addIssue({code:'custom',message:'Artırılacak değer yalnızca rakam içermelidir.'});if(v.rule==='email'&&!/^[^\s@]+@[^\s@]+$/.test(v.value))ctx.addIssue({code:'custom',message:'E-posta kuralı için geçerli e-posta girin.'});}
    const keys=[...data.fields,...data.variables].map(f=>f.key);
    if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'Veri alanı anahtarları benzersiz olmalıdır.'});
});
