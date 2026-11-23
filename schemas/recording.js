import { z } from 'zod';

export const recordedTargetSchema = z.object({
    selector: z.string().min(1).max(2000),
    frames: z.array(z.string().min(1).max(2000)).max(8).default([]),
    label: z.string().max(200).default(''),
    role: z.string().max(40).default(''),
    name: z.string().max(200).default(''),
    inputType: z.string().max(40).default(''),
});
export const recordedActionSchema = z.object({
    key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    action: z.enum(['click','fill','select','check','press','goto','assertText']),
    target: recordedTargetSchema.optional(),
    value: z.string().max(2000).default(''),
    checked: z.boolean().optional(),
    rule: z.enum(['fixed','increment','suffix','email']).default('fixed'),
}).superRefine((v,ctx)=>{
    if (!['goto','assertText'].includes(v.action) && !v.target) ctx.addIssue({code:'custom',message:'Kayıtlı hedef eksik.'});
    if (v.action==='goto') {try{const u=new URL(v.value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{ctx.addIssue({code:'custom',message:'Geçersiz kayıt adresi.'});}}
    if (v.action==='press' && !['Enter','Tab','Escape','ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(v.value))ctx.addIssue({code:'custom',message:'Desteklenmeyen kayıt tuşu.'});
    if (v.action==='assertText' && !v.value.trim())ctx.addIssue({code:'custom',message:'Doğrulanacak metin boş olamaz.'});
});
