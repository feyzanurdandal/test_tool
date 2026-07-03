import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import scenarioRouter from './routes/scenarios.js';

import reportRoutes from './routes/reports.js';

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🎨 HTML Form Sayfasını Doğrudan Sunan Rota
app.get('/create', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'create.html'));
});

// 🛣️ Tüm API İsteklerini Yeni Router'a Devrediyoruz
app.use('/api/scenarios', scenarioRouter);

app.use('/api/scenarios', reportRoutes);

app.listen(PORT, () => {
    console.log(` Sunucu http://localhost:${PORT}/create üzerinde aktif `);
});