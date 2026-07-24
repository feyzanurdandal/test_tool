import { z } from 'zod';

export const createProjectSchema = z.object({
  body: z.object({
    projectName: z.string({ required_error: "Proje adı boş olamaz!" })
      .trim()
      .min(1, "Proje adı boş olamaz!")
      .transform(val => val.replace(/[^a-zA-Z0-9\s_-]/g, '').trim())
      .refine(val => val.length > 0, "Geçersiz proje adı!")
  })
});

export const deleteProjectSchema = z.object({
  body: z.object({
    projectName: z.string().trim().min(1, "Silinecek proje adı boş olamaz!")
  })
});

export const listScenariosSchema = z.object({
  query: z.object({
    project: z.string().optional().default('')
  })
});

export const getScenarioContentSchema = z.object({
  query: z.object({
    scenarioName: z.string().trim().min(1, "Senaryo ismi zorunlu!"),
    project: z.string().optional().default('Varsayılan Proje')
  })
});

export const createScenarioSchema = z.object({
  body: z.object({
    scenarioName: z.string().trim().min(1, "Senaryo adı boş olamaz!"),
    turkishInstructions: z.union([z.string(), z.array(z.string()), z.object({})]),
    targetUrl: z.string().url("Geçerli bir URL giriniz!"),
    projectName: z.string().optional().default('Varsayılan Proje')
  })
});

export const runScenarioSchema = z.object({
  body: z.object({
    scenarioName: z.string().trim().min(1, "Senaryo adı zorunlu!"),
    projectName: z.string().trim().min(1, "Proje adı zorunlu!"),
    targetUrl: z.string().url("Geçersiz URL formatı!").optional()
  })
});

export const runBatchSchema = z.object({
  body: z.object({
    scenarioNames: z.array(z.string()).min(1, "Kuyruk için en az bir senaryo gereklidir!"),
    projectName: z.string().trim().min(1, "Proje adı zorunlu!")
  })
});

export const createUserSchema = z.object({
  body: z.object({
    username: z.string().trim().min(3, "Kullanıcı adı en az 3 karakter olmalıdır!"),
    password: z.string().min(6, "Şifre en az 6 karakter olmalıdır!"),
    role: z.enum(["ADMIN", "USER"], { errorMap: () => ({ message: "Geçersiz rol!" }) }),
    selectedProjects: z.array(z.string()).optional().default([])
  })
});

export const updateUserSchema = z.object({
  body: z.object({
    id: z.union([z.string(), z.number()]),
    username: z.string().trim().min(1, "Kullanıcı adı boş olamaz!"),
    password: z.string().optional(),
    role: z.enum(["ADMIN", "USER"]).optional(),
    selectedProjects: z.array(z.string()).optional()
  })
});