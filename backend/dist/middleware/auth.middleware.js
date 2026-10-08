"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requirePasswordChanged = requirePasswordChanged;
exports.requireRH = requireRH;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../database");
// Lire JWT_SECRET à l'intérieur des fonctions (pas au niveau module) pour
// s'assurer que dotenv.config() a déjà été appelé dans index.ts avant l'import.
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Accès refusé. Token manquant.' });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('[FATAL] JWT_SECRET non défini — vérifiez le fichier .env');
        return res.status(500).json({ message: 'Erreur de configuration serveur.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        req.user = decoded;
        next();
    }
    catch {
        return res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
}
// Bloque l'accès à toute l'API (hors /api/auth/*, qui gère son propre flux de
// première connexion) tant que l'utilisateur n'a pas changé son mot de passe
// par défaut. Le blocage côté interface (FirstLoginModal) seul ne suffit pas :
// un appel direct à l'API contournerait la modale sans cette vérification.
async function requirePasswordChanged(req, res, next) {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Non authentifié.' });
    try {
        const db = await (0, database_1.getDb)();
        const row = await db.get(`SELECT mustChangePassword FROM users WHERE id = ?`, [user.id]);
        if (row?.mustChangePassword === 1) {
            return res.status(403).json({
                code: 'MUST_CHANGE_PASSWORD',
                message: 'Vous devez définir un nouveau mot de passe avant de continuer.',
            });
        }
        next();
    }
    catch {
        // En cas d'erreur de lecture, on laisse passer plutôt que de bloquer
        // tout le monde à cause d'un souci de base de données.
        next();
    }
}
function requireRH(req, res, next) {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Non authentifié.' });
    if (!['RH', 'SuperAdmin'].includes(user.role)) {
        return res.status(403).json({ message: 'Accès réservé à l\'équipe RH.' });
    }
    next();
}
