import { z } from 'zod';

// XSS ve Script Enjeksiyonunu Önleyen Karakter Kontrolü
const safeTextRule = (val) => !/[<>"'\\]/.test(val);
const safeTextMessage = 'Özel/zararlı karakterler (< > " \' \\) içeremez.';

export const scenarioNameSchema = z.string({ required_error: "Senaryo adı zorunlu!" })
  .trim()
  .min(1, "Senaryo adı boş bırakılamaz!")
  .max(100, "Senaryo adı çok uzun!")
  .refine(safeTextRule, { message: `Senaryo adı ${safeTextMessage}` });

export const usernameSchema = z.string({ required_error: "Kullanıcı adı zorunlu!" })
  .trim()
  .min(3, "Kullanıcı adı en az 3 karakter olmalıdır!")
  .max(50, "Kullanıcı adı çok uzun!")
  .refine(safeTextRule, { message: `Kullanıcı adı ${safeTextMessage}` });

export const testTypeSchema = z.enum(["UI", "SECURITY"]).default("UI");
export const expectedOutcomeSchema = z.enum(["SUCCESS_EXPECTED", "ERROR_EXPECTED"]).default("SUCCESS_EXPECTED");

export const createProjectSchema = z.object({
  body: z.object({
    projectName: z.string({ required_error: "Proje adı boş olamaz!" })
      .trim()
      .min(1, "Proje adı boş olamaz!")
      .transform(val => val.replace(/[^a-zA-Z0-9\s_-]/g, '').trim())
      .refine(val => val.length > 0, "Geçersiz proje adı!"),
    customErrorKeywords: z.string().optional().default('')
  })
});

export const updateProjectSchema = z.object({
  body: z.object({
    oldProjectName: z.string().trim().min(1, "Eski proje adı zorunlu!"),
    newProjectName: z.string().trim().min(1, "Yeni proje adı zorunlu!"),
    customErrorKeywords: z.string().optional().default('')
  })
});

export const deleteProjectSchema = z.object({
  body: z.object({
    projectName: z.string().trim().min(1, "Silinecek proje adı boş olamaz!")
  })
});

export const listScenariosSchema = z.object({
  query: z.object({
    project: z.string().optional().default(''),
    projectName: z.string().optional(),
    testType: testTypeSchema.optional().default("UI")
  })
});

export const getScenarioContentSchema = z.object({
  query: z.object({
    scenarioName: scenarioNameSchema,
    project: z.string().optional().default('Varsayılan Proje'),
    projectName: z.string().optional()
  })
});

export const createScenarioSchema = z.object({
  body: z.object({
    scenarioName: scenarioNameSchema,
    turkishInstructions: z.union([z.string(), z.array(z.string()), z.object({})]),
    targetUrl: z.string().url("Geçerli bir URL giriniz!"),
    projectName: z.string().optional().default('Varsayılan Proje'),
    testType: testTypeSchema.optional().default("UI"),
    expectedOutcome: expectedOutcomeSchema.optional().default("SUCCESS_EXPECTED")
  })
});

export const updateScenarioSchema = z.object({
  body: z.object({
    scenarioName: scenarioNameSchema,
    originalScenarioName: scenarioNameSchema,
    turkishInstructions: z.union([z.string(), z.array(z.string()), z.object({})]),
    targetUrl: z.string().url("Geçerli bir URL giriniz!"),
    projectName: z.string().optional().default('Varsayılan Proje'),
    testType: testTypeSchema.optional().default("UI"),
    expectedOutcome: expectedOutcomeSchema.optional().default("SUCCESS_EXPECTED")
  })
});

// Hedef URL artık istekten alınmaz; her zaman senaryonun kayıtlı hedef_url'si kullanılır.
export const runScenarioSchema = z.object({
  body: z.object({
    scenarioName: scenarioNameSchema,
    projectName: z.string().trim().min(1, "Proje adı zorunlu!")
  })
});

export const deleteScenarioSchema = z.object({
  body: z.object({
    scenarioName: scenarioNameSchema,
    projectName: z.string().trim().min(1, "Proje adı zorunlu!")
  })
});

const recordIdSchema = z.union([z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Geçersiz ID!"), z.number().int().nonnegative()]);

export const deleteReportSchema = z.object({
  body: z.object({ id: recordIdSchema })
});

export const deleteReportsBatchSchema = z.object({
  body: z.object({ ids: z.array(recordIdSchema).min(1, "Silinecek rapor seçilmedi!").max(500) })
});

export const deleteUserSchema = z.object({
  body: z.object({ id: recordIdSchema })
});

export const jobIdSchema = z.object({
  params: z.object({ id: z.string().uuid("Geçersiz iş ID'si!") })
});

const providerNameSchema = z.string().trim().toLowerCase()
  .min(1, "Sağlayıcı adı boş olamaz!")
  .max(40)
  .regex(/^[a-z0-9_-]+$/, "Sağlayıcı adı yalnızca harf, rakam, - ve _ içerebilir!")
  .refine(v => v !== 'test_runner_api' && v !== 'translator_api', "Bu sağlayıcı adı sistem tarafından ayrılmıştır!");

export const saveSettingsSchema = z.object({
  body: z.object({
    testRunnerApi: z.string().trim().toLowerCase().min(1, "Test çalıştırıcı sağlayıcı seçilmedi!"),
    translatorApi: z.string().trim().toLowerCase().min(1, "Çeviri sağlayıcısı seçilmedi!"),
    apiKeys: z.record(providerNameSchema, z.object({
      key: z.string().max(4096).optional().default(''),
      model: z.string().trim().max(200).optional().default('')
    })).optional().default({})
  })
});

export const runBatchSchema = z.object({
  body: z.object({
    scenarioNames: z.array(scenarioNameSchema).min(1, "Kuyruk için en az bir senaryo gereklidir!"),
    projectName: z.string().trim().min(1, "Proje adı zorunlu!"),
    testType: testTypeSchema.optional().default("UI")
  })
});

export const createUserSchema = z.object({
  body: z.object({
    username: usernameSchema,
    password: z.string().min(6, "Şifre en az 6 karakter olmalıdır!"),
    role: z.enum(["ADMIN", "PM", "USER"], { errorMap: () => ({ message: "Geçersiz rol seçimi!" }) }),
    selectedProjects: z.array(z.string()).optional().default([])
  })
});

export const updateUserSchema = z.object({
  body: z.object({
    id: z.union([z.string(), z.number()]),
    username: usernameSchema,
    password: z.string().optional(),
    role: z.enum(["ADMIN", "PM", "USER"]).optional(),
    selectedProjects: z.array(z.string()).optional()
  })
});