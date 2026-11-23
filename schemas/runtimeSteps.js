import { z } from 'zod';
import { recordedActionSchema } from './recording.js';
import { testDataSchema, formFieldSchema } from './testData.js';

export const runtimeStepsSchema = z.object({
    targetUrl: z.string().url(),
    steps: z.array(z.object({
        type: z.enum(['act', 'extract', 'form', 'recorded']),
        instruction: z.string().trim().min(1).max(4000),
        form: formFieldSchema.optional(),
        recorded: recordedActionSchema.optional(),
        field: z.string().trim().min(1).max(100).optional(),
    }).refine(s=>s.type!=='form'||!!s.form,{message:'Form alanı eksik.'}).refine(s=>s.type!=='recorded'||!!s.recorded,{message:'Kayıtlı adım eksik.'})).min(1).max(100),
    testData: testDataSchema.optional(),
    runSequence: z.string().regex(/^\d+$/).optional(),
    expectedErrorText: z.string().trim().max(500).optional().default(''),
    expectedOutcome: z.enum(['SUCCESS_EXPECTED','ERROR_EXPECTED']).optional().default('SUCCESS_EXPECTED'),
}).refine(value => value.expectedOutcome !== 'ERROR_EXPECTED' || value.expectedErrorText.length >= 3,
    {message:'Beklenen engelleme mesajını belirtip senaryoyu yeniden kaydedin.',path:['expectedErrorText']});
