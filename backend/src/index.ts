import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth.routes';
import teamRoutes from './routes/team.routes';
import historyRoutes from './routes/history.routes';
import notificationRoutes from './routes/notifications.routes';
import rhRoutes from './routes/rh.routes';
import adminRoutes from './routes/admin.routes';
import { requireAuth, requirePasswordChanged } from './middleware/auth.middleware';
import { checkAndSendReminders } from './services/reminder.service';
import feedbackRoutes from './routes/feedback.routes';
import orgchartRoutes from './routes/orgchart.routes';
import fichePosteRoutes from './routes/fichePoste.routes';

dotenv.config();

// L'application doit toujours raisonner à l'heure d'Algérie (UTC+1, sans heure
// d'été), quel que soit le fuseau système du serveur qui l'héberge — important
// notamment sur une VM Linux dont le fuseau par défaut n'est pas garanti.
process.env.TZ = 'Africa/Algiers';

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    // Allow all localhost origins in development
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
    const allowed = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
    callback(allowed.includes(origin) ? null : new Error('Not allowed by CORS'), allowed.includes(origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

// Public routes (no token required)
app.use('/api/auth', authRoutes);

// Protected routes (JWT required + mot de passe déjà changé)
app.use('/api/team', requireAuth, requirePasswordChanged, teamRoutes);
app.use('/api/history', requireAuth, requirePasswordChanged, historyRoutes);
app.use('/api/notifications', requireAuth, requirePasswordChanged, notificationRoutes);
app.use('/api/rh', requireAuth, requirePasswordChanged, rhRoutes);
app.use('/api/admin', requireAuth, adminRoutes);
app.use('/api/feedback', requireAuth, requirePasswordChanged, feedbackRoutes);
app.use('/api/orgchart', requireAuth, requirePasswordChanged, orgchartRoutes);
app.use('/api/fiche-poste', requireAuth, requirePasswordChanged, fichePosteRoutes);

// ── Servir le build React en production ───────────────────────────────────────
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
// Toutes les routes non-API renvoient index.html (React Router SPA)
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(Number(PORT), HOST, () => {
  console.log(`Talents running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);

  // Run reminder check once at startup, then every hour
  checkAndSendReminders();
  setInterval(checkAndSendReminders, 60 * 60 * 1000);
});
