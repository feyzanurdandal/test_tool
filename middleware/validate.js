import { z } from 'zod';

export const validate = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    
    // Doğrulanmış ve temizlenmiş veriyi request objesine atayalım
    req.body = validated.body || req.body;
    req.query = validated.query || req.query;
    req.params = validated.params || req.params;

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