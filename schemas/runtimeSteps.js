import { z } from 'zod';

export const runtimeStepsSchema = z.object({
    targetUrl: z.string().url(),
    steps: z.array(z.object({
        type: z.enum(['act', 'extract']),
        instruction: z.string().trim().min(1).max(4000),
        field: z.string().trim().min(1).max(100).optional(),
    })).min(1).max(100),
    expectedErrorText: z.string().trim().max(500).optional().default(''),
    expectedOutcome: z.enum(['SUCCESS_EXPECTED','ERROR_EXPECTED']).optional().default('SUCCESS_EXPECTED'),
}).refine(value => value.expectedOutcome !== 'ERROR_EXPECTED' || value.expectedErrorText.length >= 3,
    {message:'Beklenen engelleme mesajını belirtip senaryoyu yeniden kaydedin.',path:['expectedErrorText']});
