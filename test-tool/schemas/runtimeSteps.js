import { z } from 'zod';

export const runtimeStepsSchema = z.object({
    targetUrl: z.string().url(),
    steps: z.array(z.object({
        type: z.enum(['act', 'extract', 'assert']),
        instruction: z.string().trim().min(1).max(4000),
        action: z.enum(['click','fill','open','select','close','scroll','press']).optional(),
        target: z.string().trim().min(1).max(300).optional(),
        control: z.enum(['button','input','dropdown','option','link','text']).optional(),
        value: z.string().max(4000).optional(),
        scope: z.string().trim().min(1).max(300).optional(),
        position: z.enum(['top','bottom','left','right','top-right','top-left']).optional(),
        expect: z.object({
            kind: z.enum(['visible','hidden','text','value','url','selected']),
            target: z.string().trim().min(1).max(300).optional(),
            value: z.string().max(2000).optional(),
            scope: z.string().trim().min(1).max(300).optional(),
        }).refine(e => e.kind === 'url' ? !!e.value : !!e.target, {message:'Doğrulama hedefi gerekli.'})
          .refine(e => !['text','value','selected'].includes(e.kind) || e.value !== undefined, {message:'Doğrulama değeri gerekli.'}).optional(),
        field: z.string().trim().min(1).max(100).optional(),
    }).refine(s => s.type !== 'assert' || !!s.expect, {message:'Assert adımı expect içermeli.'})
      .refine(s => !s.action || s.action === 'scroll' || !!s.target, {message:'İşlem hedefi gerekli.'})
      .refine(s => !['fill','press'].includes(s.action) || s.value !== undefined, {message:'Giriş değeri gerekli.'})).min(1).max(100),
    expectedErrorText: z.string().trim().max(500).optional().default(''),
    expectedOutcome: z.enum(['SUCCESS_EXPECTED','ERROR_EXPECTED']).optional().default('SUCCESS_EXPECTED'),
}).refine(value => value.expectedOutcome !== 'ERROR_EXPECTED' || value.expectedErrorText.length >= 3,
    {message:'Beklenen engelleme mesajını belirtip senaryoyu yeniden kaydedin.',path:['expectedErrorText']});
