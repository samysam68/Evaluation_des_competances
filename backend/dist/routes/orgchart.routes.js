"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../database");
const router = (0, express_1.Router)();
// Module Organigramme : ouvert à tous si le SuperAdmin l'a activé globalement
// (paramètre `module_orgchart_enabled`), sinon réservé au SuperAdmin et aux
// utilisateurs à qui l'accès a été accordé individuellement (ex. le manager RH).
router.use(async (req, res, next) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Non authentifié.' });
    if (user.role === 'SuperAdmin')
        return next();
    try {
        const db = await (0, database_1.getDb)();
        const setting = await db.get(`SELECT value FROM app_settings WHERE key = 'module_orgchart_enabled'`);
        if (setting?.value === '1')
            return next();
        const row = await db.get(`SELECT orgChartAccess FROM users WHERE id = ?`, [user.id]);
        if (row?.orgChartAccess === 1)
            return next();
    }
    catch { /* fall through to 403 */ }
    return res.status(403).json({ message: 'Accès à l\'organigramme non autorisé.' });
});
// GET /api/orgchart — tous les employés actifs
router.get('/', async (_req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const employees = await db.all(`
      SELECT id, matricule, nom, prenom, poste, direction, departement, service,
             role, photo, dateRecrutement, email, categorie, pole, actif,
             responsable1, responsable2, responsable3
      FROM users
      WHERE actif = 1
      ORDER BY
        CASE WHEN direction IS NULL OR direction = '' THEN 1 ELSE 0 END,
        direction,
        CASE WHEN departement IS NULL OR departement = '' THEN 1 ELSE 0 END,
        departement,
        CASE WHEN service IS NULL OR service = '' THEN 1 ELSE 0 END,
        service,
        nom, prenom
    `);
        return res.json(employees);
    }
    catch (err) {
        return res.status(500).json({ message: 'Erreur serveur.', details: err.message });
    }
});
// PATCH /api/orgchart/:userId/photo — mettre à jour la photo
router.patch('/:userId/photo', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return res.status(401).json({ message: 'Token manquant.' });
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret)
            return res.status(500).json({ message: 'Configuration serveur manquante.' });
        const decoded = jsonwebtoken_1.default.verify(authHeader.split(' ')[1], secret);
        const targetId = parseInt(req.params.userId, 10);
        const { photo } = req.body;
        if (!photo)
            return res.status(400).json({ message: 'Photo requise.' });
        const db = await (0, database_1.getDb)();
        const editor = await db.get('SELECT * FROM users WHERE id = ?', [decoded.id]);
        const target = await db.get('SELECT * FROM users WHERE id = ?', [targetId]);
        if (!editor || !target)
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        const canEdit = ['SuperAdmin', 'RH'].includes(editor.role) ||
            editor.poste === 'Responsable Recrutement & Formation' ||
            (editor.role === 'Directeur' && editor.direction === target.direction) ||
            (editor.role === 'Manager' && editor.departement === target.departement) ||
            (editor.role === 'Responsable' && editor.service === target.service) ||
            editor.id === target.id;
        if (!canEdit)
            return res.status(403).json({ message: 'Non autorisé à modifier ce profil.' });
        await db.run('UPDATE users SET photo = ? WHERE id = ?', [photo, targetId]);
        return res.json({ message: 'Photo mise à jour.' });
    }
    catch {
        return res.status(401).json({ message: 'Token invalide.' });
    }
});
exports.default = router;
