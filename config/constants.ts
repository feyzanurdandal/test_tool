import * as dotenv from 'dotenv';
dotenv.config();

const isDocker = process.env.DOCKER_ENV === 'true';

export const CONSTANTS = {
    PORT: process.env.PORT || 3000,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};