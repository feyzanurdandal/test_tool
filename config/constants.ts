import * as dotenv from 'dotenv';
dotenv.config();

const isDocker = process.env.DOCKER_ENV === 'true';

export const CONSTANTS = {
    PORT: process.env.PORT || 3000,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    
    // MANTIK: Eğer Docker'daysak n8n ismiyle ara, değilsek .env'deki adresi kullan
    N8N_BASE_URL: isDocker ? 'http://n8n:5678' : (process.env.N8N_BASE_URL || 'http://localhost:5678'),
    
    SCENARIOS_FOLDER: process.env.SCENARIOS_FOLDER || 'scenarios',
    REPORTS_FOLDER: process.env.REPORTS_FOLDER || 'reports'
};