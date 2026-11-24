import { z } from 'zod';
import { scenarioNameSchema, testTypeSchema } from './scenarioSchemas.js';

// Grup adı: görünen metin; HTML/betik karakterleri ve kontrol karakterleri yok.
export const groupNameSchema = z.string({ required_error: 'Grup adı zorunlu!' })
  .trim()
  .min(1, 'Grup adı boş bırakılamaz!')
  .max(60, 'Grup adı en fazla 60 karakter olabilir!')
  .refine(v => !/[<>"'\\]/.test(v) && !/[\u0000-\u001f\u007f]/.test(v), { message: 'Grup adı özel/zararlı karakterler (< > " \' \\) içeremez.' });

// DPU kayıt kimliği (örn. "uid_2554164e1f2c"): yalnızca güvenli karakterler (URL yoluna yazılır)
export const groupIdSchema = z.string({ required_error: 'Grup kimliği zorunlu!' }).trim().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Geçersiz grup kimliği!');

const projectName = z.string().trim().min(1, 'Proje adı zorunlu!');
const names = z.array(scenarioNameSchema).max(200, 'Tek seferde en fazla 200 senaryo.');

export const listGroupsSchema = z.object({
  query: z.object({
    project: z.string().optional().default(''),
    projectName: z.string().optional(),
    testType: testTypeSchema.optional().default('UI'),
  }),
});

export const createGroupSchema = z.object({
  body: z.object({
    projectName,
    testType: testTypeSchema.optional().default('UI'),
    name: groupNameSchema,
    scenarioNames: names.optional().default([]),
  }),
});

export const renameGroupSchema = z.object({
  body: z.object({ projectName, testType: testTypeSchema.optional().default('UI'), groupId: groupIdSchema, name: groupNameSchema }),
});

export const deleteGroupSchema = z.object({
  body: z.object({ projectName, testType: testTypeSchema.optional().default('UI'), groupId: groupIdSchema }),
});

export const groupMembersSchema = z.object({
  body: z.object({
    projectName,
    testType: testTypeSchema.optional().default('UI'),
    groupId: groupIdSchema,
    add: names.optional().default([]),
    remove: names.optional().default([]),
  }),
});

export const reorderGroupSchema = z.object({
  body: z.object({ projectName, testType: testTypeSchema.optional().default('UI'), groupId: groupIdSchema, scenarioNames: names }),
});

// Bir senaryonun üye olacağı grupların TAMAMI (formdaki seçim): listede olmayanlardan çıkarılır
export const assignGroupsSchema = z.object({
  body: z.object({
    projectName,
    testType: testTypeSchema.optional().default('UI'),
    scenarioName: scenarioNameSchema,
    groupIds: z.array(groupIdSchema).max(50),
  }),
});
