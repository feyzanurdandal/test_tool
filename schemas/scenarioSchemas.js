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
    scenarioName: scenarioNameSchema,
    project: z.string().optional().default('Varsayılan Proje')
  })
});

export const createScenarioSchema = z.object({
  body: z.object({
    scenarioName: scenarioNameSchema,
    turkishInstructions: z.union([z.string(), z.array(z.string()), z.object({})]),
    targetUrl: z.string().url("Geçerli bir URL giriniz!"),
    projectName: z.string().optional().default('Varsayılan Proje')
  })
});

export const runScenarioSchema = z.object({
  body: z.object({
    scenarioName: scenarioNameSchema,
    projectName: z.string().trim().min(1, "Proje adı zorunlu!"),
    targetUrl: z.string().url("Geçersiz URL formatı!").optional()
  })
});

export const runBatchSchema = z.object({
  body: z.object({
    scenarioNames: z.array(scenarioNameSchema).min(1, "Kuyruk için en az bir senaryo gereklidir!"),
    projectName: z.string().trim().min(1, "Proje adı zorunlu!")
  })
});

// YENİ: Kullanıcı Oluşturma Şeması (Büyük/Küçük harf toleranslı ve esnek)
export const createUserSchema = z.object({
  body: z.object({
    username: usernameSchema,
    password: z.string().min(4, "Şifre en az 4 karakter olmalıdır!"),
    role: z.string().transform(val => val.toUpperCase()).refine(val => ["ADMIN", "PM", "USER"].includes(val), {
      message: "Geçersiz rol seçimi! (ADMIN, PM, USER olmalı)"
    }),
    selectedProjects: z.array(z.string()).optional().default([])
  })
});

// YENİ: Kullanıcı Güncelleme Şeması
export const updateUserSchema = z.object({
  body: z.object({
    id: z.union([z.string(), z.number()]),
    username: usernameSchema,
    password: z.string().optional(),
    role: z.string().optional().transform(val => val ? val.toUpperCase() : val),
    selectedProjects: z.array(z.string()).optional().default([])
  })
});