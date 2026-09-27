import express from 'express';
import projectsRouter from './projects.js';
import scenariosRouter from './scenarios.js';
import runsRouter from './runs.js';
import reportsRouter from './reports.js';
import settingsRouter from './settings.js';
import usersRouter from './users.js';
import maintenanceRouter from './maintenance.js';

// Mevcut ön yüzün kullandığı URL'ler korunarak (/api/scenarios/...)
// rotalar konularına göre ayrı dosyalara bölündü.
const router = express.Router();

router.use(projectsRouter);
router.use(scenariosRouter);
router.use(runsRouter);
router.use(reportsRouter);
router.use(settingsRouter);
router.use(usersRouter);
router.use(maintenanceRouter);

export default router;
