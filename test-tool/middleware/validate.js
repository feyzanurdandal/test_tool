import { z } from 'zod';

export const validate = (schema) => async (req, res, next) => {
    try {
        const validated = await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        if (validated.body) req.body = validated.body;
        // Express 5'te req.query her erişimde yeniden hesaplanan bir getter'dır;
        // Object.assign ile yapılan değişiklikler kaybolur. Doğrulanmış değeri sabitliyoruz.
        if (validated.query) {
            Object.defineProperty(req, 'query', {
                value: { ...req.query, ...validated.query },
                writable: true,
                configurable: true,
                enumerable: true,
            });
        }
        if (validated.params) Object.assign(req.params, validated.params);

        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
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