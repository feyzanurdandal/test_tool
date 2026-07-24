import { z } from 'zod';

export const validate = (schema) => async (req, res, next) => {
    try {
        const validated = await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        if (validated.body) req.body = validated.body;
        if (validated.query) Object.assign(req.query, validated.query);
        if (validated.params) Object.assign(req.params, validated.params);

        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            // 🚨 DÜZELTME: issues dizisini güvenli biçimde yakalıyoruz
            const issueList = error.issues || error.errors || [];
            return res.status(400).json({
                error: "Girdi doğrulama hatası!",
                details: issueList.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }))
            });
        }
        next(error);
    }
};