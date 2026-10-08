"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ldapjs_1 = __importDefault(require("ldapjs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../database");
const router = (0, express_1.Router)();
// Attempt LDAP bind. Resolves true on success, false on wrong password, throws on unreachable host.
function ldapBind(username, password) {
    return new Promise((resolve, reject) => {
        const host = process.env.LDAP_HOST || '192.168.0.3';
        const port = parseInt(process.env.LDAP_PORT || '389', 10);
        const domain = process.env.LDAP_DOMAIN || 'ldmgroupe.lan';
        const timeoutMs = parseInt(process.env.LDAP_TIMEOUT || '3', 10) * 1000;
        const client = ldapjs_1.default.createClient({
            url: `ldap://${host}:${port}`,
            connectTimeout: timeoutMs,
            timeout: timeoutMs,
        });
        const timer = setTimeout(() => {
            client.destroy();
            reject(new Error('LDAP_UNREACHABLE'));
        }, timeoutMs);
        client.on('error', (err) => {
            clearTimeout(timer);
            // Connection refused / unreachable → fallback to DB
            if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
                reject(new Error('LDAP_UNREACHABLE'));
            }
            else {
                reject(err);
            }
        });
        client.bind(`${username}@${domain}`, password, (err) => {
            clearTimeout(timer);
            client.destroy();
            if (err) {
                // InvalidCredentialsError = wrong password — user exists but password is wrong
                if (err.name === 'InvalidCredentialsError' || err.code === 49) {
                    resolve(false);
                }
                else {
                    reject(new Error('LDAP_UNREACHABLE'));
                }
            }
            else {
                resolve(true);
            }
        });
    });
}
async function getModuleFlags(db) {
    const rows = await db.all(`SELECT key, value FROM app_settings WHERE key IN ('module_fichePoste_enabled','module_feedback_enabled','module_orgchart_enabled')`);
    const map = {};
    rows.forEach((r) => { map[r.key] = r.value; });
    return {
        fichePoste: map.module_fichePoste_enabled === '1',
        feedback: map.module_feedback_enabled !== '0',
        // Organigramme restreint par défaut : ouvert à tous seulement si explicitement activé
        orgchartEnabled: map.module_orgchart_enabled === '1',
    };
}
function buildUserResponse(user, token, hasDelegation, modules, orgchartEnabled) {
    const normalizeForEmail = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
    const email = (user.email && user.email.trim())
        ? user.email.trim()
        : `${normalizeForEmail(user.prenom)}.${normalizeForEmail(user.nom)}@ldmgroupe.com`;
    return {
        token,
        expiresIn: 7200,
        user: {
            id: user.id.toString(),
            username: user.activeDirectory,
            email,
            fullName: `${user.prenom} ${user.nom}`.trim(),
            nom: user.nom || '',
            prenom: user.prenom || '',
            matricule: user.matricule || '',
            role: user.role,
            poste: user.poste || '',
            direction: user.direction || '',
            department: user.departement || '',
            service: user.service || '',
            pole: user.pole || '',
            categorie: user.categorie || '',
            dateRecrutement: user.dateRecrutement || '',
            responsable1: user.responsable1 || '',
            responsable2: user.responsable2 || '',
            responsable3: user.responsable3 || '',
            isActive: user.actif === 1,
            canDelegate: ['Directeur', 'Manager', 'RH'].includes(user.role),
            hasDelegation,
            mustChangePassword: user.mustChangePassword === 1,
            // Accès à l'espace RH accordé par le SuperAdmin, en plus du rôle RH natif
            rhAccess: user.role === 'RH' || user.role === 'SuperAdmin' || user.rhAccess === 1,
            // Accès à l'organigramme — ouvert à tous si le module est activé globalement,
            // sinon restreint au SuperAdmin et aux utilisateurs à qui l'accès a été accordé individuellement
            orgChartAccess: user.role === 'SuperAdmin' || orgchartEnabled || user.orgChartAccess === 1,
            modules,
        }
    };
}
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Veuillez fournir un nom d\'utilisateur et un mot de passe.' });
    }
    const cleanUsername = username.split('@')[0].split('\\').pop() || username;
    try {
        const db = await (0, database_1.getDb)();
        // Find user in DB first (needed regardless of auth method)
        let user = await db.get(`SELECT * FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [cleanUsername]);
        if (!user) {
            user = await db.get(`
        SELECT * FROM users
        WHERE REPLACE(LOWER(prenom || '.' || nom), ' ', '') = LOWER(?)
           OR REPLACE(LOWER(nom || '.' || prenom), ' ', '') = LOWER(?)
      `, [cleanUsername, cleanUsername]);
        }
        const GENERIC_ERR = 'Identifiant ou mot de passe incorrect.';
        if (!user) {
            return res.status(401).json({ message: GENERIC_ERR });
        }
        if (!user.actif) {
            return res.status(403).json({ message: 'Compte désactivé. Contactez votre administrateur.' });
        }
        // If a local password is set, use it directly (bypasses LDAP)
        let ldapAvailable = true;
        if (user.password) {
            const match = await bcryptjs_1.default.compare(password, user.password);
            if (!match) {
                return res.status(401).json({ message: GENERIC_ERR });
            }
            ldapAvailable = false;
        }
        else {
            // No local password → try LDAP
            try {
                console.log(`[AD] Attempting LDAP bind for: ${cleanUsername}@${process.env.LDAP_DOMAIN || 'ldmgroupe.lan'}`);
                const ldapSuccess = await ldapBind(cleanUsername, password);
                if (!ldapSuccess) {
                    return res.status(401).json({ message: GENERIC_ERR });
                }
                console.log(`[AD] LDAP bind successful for: ${cleanUsername}`);
            }
            catch (ldapErr) {
                if (ldapErr.message === 'LDAP_UNREACHABLE') {
                    ldapAvailable = false;
                    console.warn(`[AD] LDAP unreachable for: ${cleanUsername}`);
                    // No local password AND LDAP unreachable → reject login (security)
                    return res.status(503).json({
                        message: 'Le serveur d\'authentification Active Directory est inaccessible. Veuillez réessayer plus tard ou contacter l\'administrateur.',
                    });
                }
                else {
                    throw ldapErr;
                }
            }
        }
        const delegation = await db.get(`SELECT * FROM delegations WHERE delegatedToUserId = ?`, [user.id]);
        const { orgchartEnabled, ...modules } = await getModuleFlags(db);
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.activeDirectory, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
        const response = buildUserResponse(user, token, !!delegation, modules, orgchartEnabled);
        if (!ldapAvailable) {
            response.warning = 'Mode développement : authentification AD non disponible.';
        }
        return res.json(response);
    }
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Une erreur est survenue. Veuillez réessayer.' });
    }
});
router.patch('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token manquant.' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const { email } = req.body;
        if (!email || !email.trim()) {
            return res.status(400).json({ message: 'Email invalide.' });
        }
        const db = await (0, database_1.getDb)();
        await db.run(`UPDATE users SET email = ? WHERE id = ?`, [email.trim(), decoded.id]);
        return res.json({ message: 'Profil mis à jour.', email: email.trim() });
    }
    catch {
        return res.status(401).json({ message: 'Token invalide.' });
    }
});
router.patch('/password', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return res.status(401).json({ message: 'Token manquant.' });
    try {
        const decoded = jsonwebtoken_1.default.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 6)
            return res.status(400).json({ message: 'Le nouveau mot de passe doit faire au moins 6 caractères.' });
        const db = await (0, database_1.getDb)();
        const user = await db.get(`SELECT * FROM users WHERE id = ?`, [decoded.id]);
        if (!user)
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        // If a local password is already set, verify current password
        if (user.password) {
            const match = await bcryptjs_1.default.compare(currentPassword || '', user.password);
            if (!match)
                return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
        }
        const hashed = await bcryptjs_1.default.hash(newPassword, 10);
        await db.run(`UPDATE users SET password = ?, mustChangePassword = 0 WHERE id = ?`, [hashed, decoded.id]);
        return res.json({ message: 'Mot de passe mis à jour avec succès.' });
    }
    catch {
        return res.status(401).json({ message: 'Token invalide.' });
    }
});
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token manquant.' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const db = await (0, database_1.getDb)();
        const user = await db.get(`SELECT * FROM users WHERE id = ?`, [decoded.id]);
        if (!user)
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        const delegation = await db.get(`SELECT * FROM delegations WHERE delegatedToUserId = ?`, [user.id]);
        const { orgchartEnabled, ...modules } = await getModuleFlags(db);
        const fakeToken = req.headers.authorization.split(' ')[1];
        const response = buildUserResponse(user, fakeToken, !!delegation, modules, orgchartEnabled);
        return res.json(response.user);
    }
    catch {
        return res.status(401).json({ message: 'Token invalide.' });
    }
});
// ─── PATCH /api/auth/first-login ─────────────────────────────────────────────
// Appelé lors de la première connexion : met à jour l'email + le mot de passe
// et passe mustChangePassword = 0
router.patch('/first-login', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return res.status(401).json({ message: 'Token manquant.' });
    try {
        const decoded = jsonwebtoken_1.default.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        const { email, newPassword } = req.body;
        // Validation email
        if (!email || !email.trim())
            return res.status(400).json({ message: 'L\'adresse email est requise.' });
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim()))
            return res.status(400).json({ message: 'Format d\'email invalide.' });
        // Validation mot de passe
        if (!newPassword)
            return res.status(400).json({ message: 'Le mot de passe est requis.' });
        if (newPassword.length < 10)
            return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 10 caractères.' });
        if (!/[A-Z]/.test(newPassword))
            return res.status(400).json({ message: 'Le mot de passe doit contenir au moins une majuscule.' });
        if (!/[0-9]/.test(newPassword))
            return res.status(400).json({ message: 'Le mot de passe doit contenir au moins un chiffre.' });
        if (!/[^A-Za-z0-9]/.test(newPassword))
            return res.status(400).json({ message: 'Le mot de passe doit contenir au moins un caractère spécial.' });
        const db = await (0, database_1.getDb)();
        const hashed = await bcryptjs_1.default.hash(newPassword, 10);
        await db.run(`UPDATE users SET email = ?, password = ?, mustChangePassword = 0 WHERE id = ?`, [email.trim(), hashed, decoded.id]);
        return res.json({ message: 'Compte configuré avec succès.' });
    }
    catch {
        return res.status(401).json({ message: 'Token invalide.' });
    }
});
exports.default = router;
