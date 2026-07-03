import * as dotenv from 'dotenv';
dotenv.config();

export const CONSTANTS = {
    PORT: process.env.PORT || 3000,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    N8N_BASE_URL: process.env.N8N_BASE_URL || 'http://localhost:5678',
    SCENARIOS_FOLDER: 'scenarios',
    REPORTS_FOLDER: 'reports'
};