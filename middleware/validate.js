import { z } from 'zod';

export const validate = (schema) => async (req, res, next) => {
    try {
        const validated = await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        // 🚨 DÜZELTME: Express'te req.query read-only getter'dır. 
        // Üzerine atama yapmak yerine içini güncelliyoruz ya da req.body'ye yazıyoruz.
        if (validated.body) req.body = validated.body;
        if (validated.query) Object.assign(req.query, validated.query);
        if (validated.params) Object.assign(req.params, validated.params);

        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: "Girdi doğrulama hatası!",
                details: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }))
            });
        }
        next(error);
    }
};