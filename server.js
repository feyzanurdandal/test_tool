import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONSTANTS } from './config/constants.js'; 
import scenarioRouter from './routes/scenarios.js';
import reportRoutes from './routes/reports.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🎨 HTML Form Sayfasını Doğrudan Sunan Rota
app.get('/create', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'create.html'));
});

// 🛣️ Modüler Rota Yönetimi
app.use('/api/scenarios', scenarioRouter);
app.use('/api/scenarios', reportRoutes); // Raporlama altyapısı köprülendi

// 🌍 Portu artık .env dosyasından (CONSTANTS üzerinden) dinamik okuyoruz!
app.use(express.static(path.join(__dirname, 'public')));

app.listen(CONSTANTS.PORT, () => {
    console.log(`Sunucu http://localhost:${CONSTANTS.PORT}/create üzerinde aktif`);
});