import './env.js';

export const CONSTANTS = {
    PORT: Number(process.env.PORT) || 3000,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};
