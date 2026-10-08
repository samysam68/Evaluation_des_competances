"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const router = (0, express_1.Router)();
// GET history based on user role and department
router.get('/:username', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const username = req.params.username;
        const caller = req.user;
        // Seul l'utilisateur lui-même (ou RH/SuperAdmin) peut consulter son historique
        if (!['RH', 'SuperAdmin'].includes(caller.role) &&
            caller.username?.toLowerCase() !== username.toLowerCase()) {
            return res.status(403).json({ message: 'Accès refusé : vous ne pouvez consulter que votre propre historique.' });
        }
        // Get current user info
        const user = await db.get(`SELECT id, nom, prenom, role, departement FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [username]);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        let logs = [];
        const selectWithPoste = `
      SELECT h.*, u.poste AS actorPoste
      FROM history_logs h
      LEFT JOIN users u ON u.id = h.actorId
    `;
        if (user.role === 'Directeur') {
            logs = await db.all(`${selectWithPoste} WHERE h.department = ? OR h.actorId = ? ORDER BY h.createdAt DESC`, [user.departement, user.id]);
        }
        else {
            logs = await db.all(`${selectWithPoste} WHERE h.actorId = ? ORDER BY h.createdAt DESC`, [user.id]);
        }
        res.json(logs);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST new history log
router.post('/log', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const { username, type, action, target, toTarget } = req.body;
        const caller = req.user;
        // Empêche de forger des logs au nom d'autrui
        if (caller.username?.toLowerCase() !== (username || '').toLowerCase() &&
            !['RH', 'SuperAdmin'].includes(caller.role)) {
            return res.status(403).json({ message: 'Vous ne pouvez enregistrer un log qu\'en votre propre nom.' });
        }
        const user = await db.get(`SELECT id, nom, prenom, role, departement FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [username]);
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        const actorName = `${user.nom} ${user.prenom}`.trim();
        const actorRole = user.role;
        const department = user.departement;
        await db.run(`INSERT INTO history_logs (actorId, actorName, actorRole, department, type, action, target, toTarget)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [user.id, actorName, actorRole, department, type, action, target, toTarget]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error logging history:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
