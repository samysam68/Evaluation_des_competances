"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const team_routes_1 = __importDefault(require("./routes/team.routes"));
const history_routes_1 = __importDefault(require("./routes/history.routes"));
const notifications_routes_1 = __importDefault(require("./routes/notifications.routes"));
const rh_routes_1 = __importDefault(require("./routes/rh.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const auth_middleware_1 = require("./middleware/auth.middleware");
const reminder_service_1 = require("./services/reminder.service");
const feedback_routes_1 = __importDefault(require("./routes/feedback.routes"));
const orgchart_routes_1 = __importDefault(require("./routes/orgchart.routes"));
const fichePoste_routes_1 = __importDefault(require("./routes/fichePoste.routes"));
dotenv_1.default.config();
// L'application doit toujours raisonner à l'heure d'Algérie (UTC+1, sans heure
// d'été), quel que soit le fuseau système du serveur qui l'héberge — important
// notamment sur une VM Linux dont le fuseau par défaut n'est pas garanti.
process.env.TZ = 'Africa/Algiers';
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow all localhost origins in development
        if (!origin || /^http:\/\/localhost:\d+$/.test(origin))
            return callback(null, true);
        const allowed = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
        callback(allowed.includes(origin) ? null : new Error('Not allowed by CORS'), allowed.includes(origin));
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '5mb' }));
// Public routes (no token required)
app.use('/api/auth', auth_routes_1.default);
// Protected routes (JWT required + mot de passe déjà changé)
app.use('/api/team', auth_middleware_1.requireAuth, auth_middleware_1.requirePasswordChanged, team_routes_1.default);
app.use('/api/history', auth_middleware_1.requireAuth, auth_middleware_1.requirePasswordChanged, history_routes_1.default);
app.use('/api/notifications', auth_middleware_1.requireAuth, auth_middleware_1.requirePasswordChanged, notifications_routes_1.default);
app.use('/api/rh', auth_middleware_1.requireAuth, auth_middleware_1.requirePasswordChanged, rh_routes_1.default);
app.use('/api/admin', auth_middleware_1.requireAuth, admin_routes_1.default);
app.use('/api/feedback', auth_middleware_1.requireAuth, auth_middleware_1.requirePasswordChanged, feedback_routes_1.default);
app.use('/api/orgchart', auth_middleware_1.requireAuth, auth_middleware_1.requirePasswordChanged, orgchart_routes_1.default);
app.use('/api/fiche-poste', auth_middleware_1.requireAuth, auth_middleware_1.requirePasswordChanged, fichePoste_routes_1.default);
// ── Servir le build React en production ───────────────────────────────────────
const frontendDist = path_1.default.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express_1.default.static(frontendDist));
// Toutes les routes non-API renvoient index.html (React Router SPA)
app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path_1.default.join(frontendDist, 'index.html'));
});
const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(Number(PORT), HOST, () => {
    console.log(`Talents running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    // Run reminder check once at startup, then every hour
    (0, reminder_service_1.checkAndSendReminders)();
    setInterval(reminder_service_1.checkAndSendReminders, 60 * 60 * 1000);
});
