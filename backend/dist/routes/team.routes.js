"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const email_service_1 = require("../services/email.service");
const router = (0, express_1.Router)();
// Recursively build the hierarchy tree
async function buildTree(db, managerFullName, visited = new Set(), depth = 0) {
    if (depth > 10)
        return []; // guard against unexpectedly deep hierarchies
    const children = await db.all(`SELECT id, nom, prenom, activeDirectory, role, departement, poste FROM users WHERE responsable1 = ? COLLATE NOCASE AND actif = 1`, [managerFullName]);
    const result = [];
    for (const child of children) {
        if (visited.has(child.id))
            continue; // anti-cycle: skip already-visited nodes
        visited.add(child.id);
        const fullName = `${child.nom} ${child.prenom}`.trim();
        const subChildren = await buildTree(db, fullName, visited, depth + 1);
        const delegation = await db.get(`SELECT * FROM delegations WHERE delegatedToUserId = ?`, [child.id]);
        result.push({
            id: child.id,
            name: fullName,
            role: child.role,
            poste: child.poste,
            department: child.departement,
            delegated: !!delegation,
            delegationId: delegation?.id ?? null,
            open: false,
            children: subChildren.length > 0 ? subChildren : undefined
        });
    }
    return result;
}
router.get('/tree/:username', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const username = req.params.username;
        // Find the logged-in user
        const user = await db.get(`SELECT nom, prenom, role, departement, poste FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [username]);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const fullName = `${user.nom} ${user.prenom}`.trim();
        // Start building the tree with this user at the root
        const children = await buildTree(db, fullName);
        const tree = {
            id: 'root',
            name: fullName,
            role: user.role,
            poste: user.poste,
            department: user.departement,
            open: true,
            children
        };
        res.json(tree);
    }
    catch (error) {
        console.error('Error generating tree:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/team/managers-search?q=... — RH/SuperAdmin uniquement : recherche un
// Manager ou Directeur (par nom) dont l'équipe pourra être consultée/déléguée, pour
// gérer une délégation au nom d'un responsable absent (en dehors de sa propre équipe).
router.get('/managers-search', async (req, res) => {
    try {
        const caller = req.user;
        if (!['RH', 'SuperAdmin'].includes(caller?.role)) {
            return res.status(403).json({ message: 'Accès réservé à l\'équipe RH.' });
        }
        const db = await (0, database_1.getDb)();
        const q = String(req.query.q || '').trim();
        if (q.length < 2)
            return res.json([]);
        const rows = await db.all(`SELECT id, nom, prenom, activeDirectory, role, departement, poste FROM users
       WHERE actif = 1 AND role IN ('Directeur', 'Manager') AND (nom || ' ' || prenom LIKE ? OR prenom || ' ' || nom LIKE ?)
       ORDER BY nom LIMIT 20`, [`%${q}%`, `%${q}%`]);
        res.json(rows.map((r) => ({
            id: r.id, username: r.activeDirectory, name: `${r.nom} ${r.prenom}`.trim(),
            role: r.role, department: r.departement, poste: r.poste,
        })));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Recursively get all members flattened (colonnes de base pour la sélection d'équipe)
async function getFlatTeam(db, managerFullName, visited = new Set(), depth = 0) {
    if (depth > 10)
        return [];
    const children = await db.all(`SELECT id, nom, prenom, role, departement, poste, categorie, evalType FROM users WHERE responsable1 = ? COLLATE NOCASE AND actif = 1`, [managerFullName]);
    let result = [];
    for (const child of children) {
        if (visited.has(child.id))
            continue;
        visited.add(child.id);
        result.push(child);
        const fullName = `${child.nom} ${child.prenom}`.trim();
        const subChildren = await getFlatTeam(db, fullName, visited, depth + 1);
        result = result.concat(subChildren);
    }
    return result;
}
// Variante avec toutes les colonnes nécessaires pour les rapports
async function getFlatTeamFull(db, managerFullName, visited = new Set(), depth = 0) {
    if (depth > 10)
        return [];
    const children = await db.all(`SELECT id, nom, prenom, matricule, role, poste, categorie, evalType,
            direction, departement, service, responsable1, dateRecrutement, activeDirectory
     FROM users WHERE responsable1 = ? COLLATE NOCASE AND actif = 1`, [managerFullName]);
    let result = [];
    for (const child of children) {
        if (visited.has(child.id))
            continue;
        visited.add(child.id);
        result.push(child);
        const fullName = `${child.nom} ${child.prenom}`.trim();
        const subChildren = await getFlatTeamFull(db, fullName, visited, depth + 1);
        result = result.concat(subChildren);
    }
    return result;
}
// Vérifie si targetId appartient à l'équipe hiérarchique du manager (récursif)
async function isTeamMember(db, managerFullName, targetId) {
    const team = await getFlatTeam(db, managerFullName);
    return team.some((m) => m.id === targetId);
}
// A route to list ALL team members managed by someone (recursively for Directeur/Responsable)
router.get('/members/:username', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const username = req.params.username;
        const user = await db.get(`SELECT nom, prenom, role FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [username]);
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        const fullName = `${user.nom} ${user.prenom}`.trim();
        // If it's a Director or Manager, fetch everyone under them recursively
        let members = [];
        if (['Directeur', 'Manager', 'Responsable', 'Gestionnaire', 'RH'].includes(user.role)) {
            members = await getFlatTeam(db, fullName);
        }
        else {
            // Direct reports only fallback
            members = await db.all(`SELECT id, nom, prenom, role, departement, poste, categorie, evalType FROM users WHERE responsable1 = ? COLLATE NOCASE`, [fullName]);
        }
        res.json(members.map((m) => ({
            id: m.id,
            name: `${m.nom} ${m.prenom}`.trim(),
            role: m.role,
            department: m.departement,
            poste: m.poste,
            categorie: m.categorie,
            evalType: m.evalType || 'Cadres & Maîtrises',
            status: 'À évaluer',
            avatar: 'from-slate-400 to-slate-500'
        })));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Route to get specific user details for auto-filling forms
router.get('/user/:id', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const userId = req.params.id;
        const caller = req.user;
        const user = await db.get(`SELECT id, nom, prenom, matricule, direction, departement, service, poste, categorie, dateRecrutement, role FROM users WHERE id = ?`, [userId]);
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        // SuperAdmin et RH voient tous les employés ; un utilisateur peut lire sa propre fiche
        if (!['SuperAdmin', 'RH'].includes(caller.role) && caller.id !== user.id) {
            const callerRecord = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [caller.id]);
            if (!callerRecord)
                return res.status(403).json({ message: 'Non autorisé.' });
            const callerFullName = `${callerRecord.nom} ${callerRecord.prenom}`.trim();
            const inTeam = await isTeamMember(db, callerFullName, user.id);
            if (!inTeam) {
                return res.status(403).json({ message: 'Accès refusé : cet employé n\'appartient pas à votre équipe.' });
            }
        }
        res.json({
            id: user.id,
            matricule: user.matricule,
            nom: user.nom,
            prenom: user.prenom,
            fullName: `${user.nom} ${user.prenom}`.trim(),
            direction: user.direction,
            departement: user.departement,
            service: user.service,
            poste: user.poste,
            categorie: user.categorie,
            dateRecrutement: user.dateRecrutement,
            role: user.role
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Route to delegate evaluation to a manager
router.post('/delegate/:id', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const targetUserId = req.params.id;
        const { delegatedByUsername } = req.body;
        const caller = req.user;
        const delegator = await db.get(`SELECT id, nom, prenom, role, departement FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [delegatedByUsername]);
        if (!delegator)
            return res.status(404).json({ message: 'Delegator not found' });
        // Le caller doit être le délégateur lui-même, sauf RH/SuperAdmin qui peuvent
        // attribuer une délégation au nom d'un manager ou directeur absent.
        if (caller.id !== delegator.id && !['SuperAdmin', 'RH'].includes(caller.role)) {
            return res.status(403).json({ message: 'Non autorisé : vous ne pouvez déléguer qu\'en votre propre nom.' });
        }
        // Check if delegation already exists
        const existing = await db.get(`SELECT * FROM delegations WHERE delegatedToUserId = ?`, [targetUserId]);
        if (existing) {
            return res.status(400).json({ message: 'Delegation already active for this user' });
        }
        await db.run(`INSERT INTO delegations (targetUserId, delegatedToUserId, delegatedByUserId) VALUES (?, ?, ?)`, [null, targetUserId, delegator.id]);
        // Fetch the target user's details for logging
        const targetUser = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [targetUserId]);
        const targetName = targetUser ? `${targetUser.nom} ${targetUser.prenom}`.trim() : 'Unknown';
        // Log the delegation
        const actorName = `${delegator.nom} ${delegator.prenom}`.trim();
        await db.run(`INSERT INTO history_logs (actorId, actorName, actorRole, department, type, action, target, toTarget)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [delegator.id, actorName, delegator.role, delegator.departement, 'delegation', 'a délégué l\'évaluation de son équipe à', targetName, null]);
        // Notify the target user
        await db.run(`INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`, [targetUserId, `${actorName} vous a délégué des évaluations à effectuer.`, 'delegation']);
        // Send email to the delegated person (non-blocking)
        const delegataire = await db.get(`SELECT nom, prenom, email FROM users WHERE id = ?`, [targetUserId]);
        if (delegataire?.email) {
            const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
            const { subject, html } = (0, email_service_1.emailDelegationRecue)({
                prenom: delegataire.prenom, nom: delegataire.nom,
                delegateurPrenom: delegator.prenom, delegateurNom: delegator.nom, delegateurRole: delegator.role,
                date: dateStr,
            });
            (0, email_service_1.sendEmail)(delegataire.email, subject, html).catch(() => { });
        }
        res.json({ success: true, message: 'Delegation accorded' });
    }
    catch (error) {
        console.error('Delegation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Revoke a delegation
router.delete('/delegate/:id', async (req, res) => {
    try {
        const caller = req.user;
        const db = await (0, database_1.getDb)();
        const delegationId = req.params.id;
        const { revokedByUsername } = req.body;
        const delegation = await db.get(`SELECT * FROM delegations WHERE id = ?`, [delegationId]);
        if (!delegation)
            return res.status(404).json({ message: 'Délégation non trouvée.' });
        const revoker = await db.get(`SELECT id, nom, prenom, role, departement FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [revokedByUsername]);
        if (!revoker)
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        // L'appelant JWT doit être le même que revokedByUsername, sauf RH/SuperAdmin
        if (revoker.id !== caller.id && !['SuperAdmin', 'RH'].includes(caller.role)) {
            return res.status(403).json({ message: 'Accès refusé : vous ne pouvez pas révoquer une délégation au nom d\'un autre utilisateur.' });
        }
        const targetUser = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [delegation.delegatedToUserId]);
        const targetName = targetUser ? `${targetUser.nom} ${targetUser.prenom}`.trim() : 'Inconnu';
        const revokerName = `${revoker.nom} ${revoker.prenom}`.trim();
        await db.run(`DELETE FROM delegations WHERE id = ?`, [delegationId]);
        await db.run(`INSERT INTO history_logs (actorId, actorName, actorRole, department, type, action, target, toTarget)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [revoker.id, revokerName, revoker.role, revoker.departement, 'delegation', 'a révoqué la délégation de', targetName, null]);
        await db.run(`INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`, [delegation.delegatedToUserId, `${revokerName} a révoqué votre délégation d'évaluation.`, 'warning']);
        res.json({ success: true, message: 'Délégation révoquée.' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/department-stats/:username', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const username = req.params.username;
        const user = await db.get(`SELECT nom, prenom, role, departement FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [username]);
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        const departement = user.departement;
        const fullName = `${user.nom} ${user.prenom}`.trim();
        // Toujours filtrer par hiérarchie directe (même logique que /members)
        const employees = await getFlatTeamFull(db, fullName);
        // Find evaluated employees using the evaluations table
        const evaluationsMap = {};
        const currentYear = new Date().getFullYear();
        const empEvals = await db.all(`SELECT targetUserId, type, createdAt, globalScore, status FROM evaluations
       WHERE (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))
       ORDER BY createdAt DESC`, [currentYear, String(currentYear)]);
        for (const ev of empEvals) {
            if (!evaluationsMap[ev.targetUserId]) {
                evaluationsMap[ev.targetUserId] = [];
            }
            // Keep only the latest for each type
            if (!evaluationsMap[ev.targetUserId].find((e) => e.type === ev.type)) {
                evaluationsMap[ev.targetUserId].push({
                    type: ev.type,
                    date: ev.createdAt,
                    globalScore: ev.globalScore,
                    status: ev.status || 'Soumise'
                });
            }
        }
        const pendingEvaluations = [];
        const evaluatedEmployees = [];
        for (const emp of employees) {
            const fullName = `${emp.nom} ${emp.prenom}`.trim();
            const userEvals = evaluationsMap[emp.id] || [];
            const empData = {
                ...emp,
                name: fullName,
                evaluations: userEvals
            };
            if (userEvals.length > 0) {
                evaluatedEmployees.push(empData);
            }
            else {
                pendingEvaluations.push(empData);
            }
        }
        // Get active delegations in the department
        const delegations = await db.all(`
      SELECT d.*, 
             u1.nom as targetNom, u1.prenom as targetPrenom,
             u2.nom as toNom, u2.prenom as toPrenom,
             u3.nom as byNom, u3.prenom as byPrenom
      FROM delegations d
      LEFT JOIN users u1 ON d.targetUserId = u1.id
      LEFT JOIN users u2 ON d.delegatedToUserId = u2.id
      LEFT JOIN users u3 ON d.delegatedByUserId = u3.id
      WHERE u3.departement = ?
    `, [departement]);
        const formattedDelegations = delegations.map((d) => ({
            id: d.id,
            delegatedBy: `${d.byNom} ${d.byPrenom}`.trim(),
            delegatedTo: `${d.toNom} ${d.toPrenom}`.trim(),
            target: d.targetUserId ? `${d.targetNom} ${d.targetPrenom}`.trim() : 'Toute l\'équipe',
            createdAt: d.createdAt
        }));
        res.json({
            departement,
            totalEmployees: employees.length,
            evaluatedCount: evaluatedEmployees.length,
            evaluatedEmployees,
            pendingEvaluations,
            delegations: formattedDelegations
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Batch check: return IDs of team members who already have an evaluation for the given type
// Single SQL query instead of N recursive isTeamMember calls — much faster
router.get('/evaluations-status', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const caller = req.user;
        const { type } = req.query;
        const callerRecord = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [caller.id]);
        if (!callerRecord)
            return res.status(403).json({ message: 'Non autorisé.' });
        const callerFullName = `${callerRecord.nom} ${callerRecord.prenom}`.trim();
        const team = await getFlatTeam(db, callerFullName);
        if (team.length === 0)
            return res.json([]);
        const memberIds = team.map((m) => m.id);
        const placeholders = memberIds.map(() => '?').join(',');
        const currentYear = new Date().getFullYear();
        let query = `SELECT DISTINCT targetUserId FROM evaluations WHERE targetUserId IN (${placeholders}) AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))`;
        const params = [...memberIds, currentYear, String(currentYear)];
        if (type) {
            query += ` AND type = ?`;
            params.push(type);
        }
        const rows = await db.all(query, params);
        return res.json(rows.map((r) => r.targetUserId));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get existing evaluation for a user (to pre-fill the form)
router.get('/evaluation/:userId', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const { userId } = req.params;
        const { type } = req.query;
        const caller = req.user;
        // Seuls SuperAdmin, RH ou le manager hiérarchique peuvent lire une évaluation
        if (!['SuperAdmin', 'RH'].includes(caller.role) && caller.id !== Number(userId)) {
            const callerRecord = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [caller.id]);
            if (!callerRecord)
                return res.status(403).json({ message: 'Non autorisé.' });
            const callerFullName = `${callerRecord.nom} ${callerRecord.prenom}`.trim();
            const inTeam = await isTeamMember(db, callerFullName, Number(userId));
            if (!inTeam) {
                return res.status(403).json({ message: 'Accès refusé : cet employé n\'appartient pas à votre équipe.' });
            }
        }
        let query = `
      SELECT e.*,
             u.nom  as evaluatorNom,  u.prenom  as evaluatorPrenom,  u.role  as evaluatorRole,  u.poste as evaluatorPoste,
             v.nom  as validatorNom,  v.prenom  as validatorPrenom,  v.poste as validatorPoste
      FROM evaluations e
      LEFT JOIN users u ON e.evaluatorId  = u.id
      LEFT JOIN users v ON e.validatedBy  = v.id
      WHERE e.targetUserId = ?
    `;
        const params = [userId];
        if (type) {
            query += ` AND e.type = ?`;
            params.push(type);
        }
        query += ` ORDER BY e.createdAt DESC LIMIT 1`;
        const evaluation = await db.get(query, params);
        if (!evaluation) {
            return res.json({ exists: false });
        }
        res.json({
            exists: true,
            id: evaluation.id,
            type: evaluation.type,
            status: evaluation.status || 'Soumise',
            evaluatorName: `${evaluation.evaluatorNom} ${evaluation.evaluatorPrenom}`.trim(),
            evaluatorRole: evaluation.evaluatorRole,
            evaluatorPoste: evaluation.evaluatorPoste || '',
            date: evaluation.createdAt,
            ratings: JSON.parse(evaluation.ratings || '{}'),
            tasks: JSON.parse(evaluation.tasks || '[]'),
            strengths: evaluation.strengths || '',
            weaknesses: evaluation.weaknesses || '',
            trainingNeeds: evaluation.trainingNeeds || '',
            recommendation: evaluation.recommendation || '',
            otherData: JSON.parse(evaluation.otherData || '{}'),
            globalScore: evaluation.globalScore,
            rhFinalScore: evaluation.rhFinalScore ?? null,
            rhComment: evaluation.rhComment ?? null,
            rhDecision: evaluation.rhDecision ? JSON.parse(evaluation.rhDecision) : null,
            employeeFeedback: evaluation.employeeFeedback ?? null,
            employeeFeedbackAt: evaluation.employeeFeedbackAt ?? null,
            validatedAt: evaluation.validatedAt ?? null,
            validatorName: evaluation.validatorNom
                ? `${evaluation.validatorNom} ${evaluation.validatorPrenom}`.trim()
                : null,
            validatorPoste: evaluation.validatorPoste ?? null,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/my-evaluation/:username', async (req, res) => {
    try {
        const caller = req.user;
        const db = await (0, database_1.getDb)();
        const username = req.params.username;
        const user = await db.get(`SELECT id, nom, prenom FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [username]);
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        // Seul l'employé lui-même ou un RH/SuperAdmin peut lire les évaluations
        if (!['RH', 'SuperAdmin'].includes(caller.role) && caller.id !== user.id) {
            return res.status(403).json({ message: 'Accès refusé.' });
        }
        // Fetch all evaluations for the user
        const evaluations = await db.all(`
      SELECT e.*,
             u.nom as evaluatorNom, u.prenom as evaluatorPrenom, u.role as evaluatorRole,
             v.nom as validatorNom, v.prenom as validatorPrenom, v.poste as validatorPoste
      FROM evaluations e
      LEFT JOIN users u ON e.evaluatorId = u.id
      LEFT JOIN users v ON e.validatedBy = v.id
      WHERE e.targetUserId = ?
      ORDER BY e.createdAt DESC
    `, [user.id]);
        if (evaluations && evaluations.length > 0) {
            res.json({
                evaluated: true,
                evaluations: evaluations.map((evalData) => ({
                    id: evalData.id,
                    date: evalData.createdAt,
                    campaignYear: evalData.campaignYear ?? new Date(evalData.createdAt).getFullYear(),
                    status: evalData.status || 'Soumise',
                    evaluatorName: `${evalData.evaluatorNom} ${evalData.evaluatorPrenom}`.trim(),
                    evaluatorRole: evalData.evaluatorRole,
                    validatedAt: evalData.validatedAt ?? null,
                    validatorName: evalData.validatorNom ? `${evalData.validatorNom} ${evalData.validatorPrenom}`.trim() : null,
                    validatorPoste: evalData.validatorPoste ?? null,
                    rhComment: evalData.rhComment ?? null,
                    rhDecision: evalData.rhDecision ? JSON.parse(evalData.rhDecision) : null,
                    employeeFeedback: evalData.employeeFeedback ?? null,
                    employeeFeedbackAt: evalData.employeeFeedbackAt ?? null,
                    data: {
                        type: evalData.type,
                        ratings: JSON.parse(evalData.ratings || '{}'),
                        tasks: JSON.parse(evalData.tasks || '[]'),
                        strengths: evalData.strengths,
                        weaknesses: evalData.weaknesses,
                        trainingNeeds: evalData.trainingNeeds,
                        recommendation: evalData.recommendation,
                        otherData: JSON.parse(evalData.otherData || '{}'),
                        globalScore: evalData.globalScore,
                        rhFinalScore: evalData.rhFinalScore ?? null,
                    }
                }))
            });
        }
        else {
            res.json({ evaluated: false, evaluations: [] });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/evaluate', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const { targetUserId, evaluatorUsername, type, ratings, tasks, strengths = null, weaknesses = null, trainingNeeds, recommendation, otherData, globalScore } = req.body;
        const caller = req.user;
        const evaluator = await db.get(`SELECT id, nom, prenom, role, departement FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [evaluatorUsername]);
        if (!evaluator)
            return res.status(404).json({ message: 'Evaluator not found' });
        // Vérification : le caller doit être l'évaluateur ou avoir une délégation active
        const delegation = await db.get(`SELECT id FROM delegations WHERE delegatedToUserId = ? AND targetUserId IS NULL`, [caller.id]);
        const callerIsEvaluator = caller.id === evaluator.id;
        const callerHasDelegationFor = delegation !== undefined;
        if (!callerIsEvaluator && !callerHasDelegationFor && !['SuperAdmin', 'RH'].includes(caller.role)) {
            return res.status(403).json({ message: 'Non autorisé : vous ne pouvez soumettre une évaluation qu\'en votre propre nom.' });
        }
        // Un Responsable ou un Superviseur ne peut évaluer son équipe qu'à partir du moment
        // où il a reçu une délégation d'évaluation — pas d'évaluation "de plein droit" pour
        // ces échelons, contrairement à Directeur/Manager.
        if (['Responsable', 'Superviseur'].includes(evaluator.role) && !['SuperAdmin', 'RH'].includes(caller.role)) {
            const evaluatorHasReceivedDelegation = await db.get(`SELECT id FROM delegations WHERE delegatedToUserId = ? AND targetUserId IS NULL`, [evaluator.id]);
            if (!evaluatorHasReceivedDelegation) {
                return res.status(403).json({ message: 'Vous devez avoir reçu une délégation avant de pouvoir évaluer votre équipe.' });
            }
        }
        const targetUser = await db.get(`SELECT id, nom, prenom, evalType, email FROM users WHERE id = ?`, [targetUserId]);
        if (!targetUser)
            return res.status(404).json({ message: 'Target user not found' });
        // Vérifier que la cible appartient à l'équipe de l'évaluateur (sauf SuperAdmin/RH)
        if (!['SuperAdmin', 'RH'].includes(caller.role)) {
            const evaluatorFullName = `${evaluator.nom} ${evaluator.prenom}`.trim();
            const inTeam = await isTeamMember(db, evaluatorFullName, Number(targetUserId));
            if (!inTeam) {
                return res.status(403).json({ message: 'Non autorisé : cet employé ne fait pas partie de votre équipe.' });
            }
        }
        // Enforce evalType — si NULL, on déduit par défaut "Cadres & Maîtrises"
        const expectedEvalType = targetUser.evalType || 'Cadres & Maîtrises';
        if (expectedEvalType !== type) {
            return res.status(400).json({
                message: `Cet employé est de catégorie "${expectedEvalType}" et ne peut pas recevoir une évaluation de type "${type}".`
            });
        }
        // ── Vérification doublon pour l'année en cours uniquement ──
        const currentYear = new Date().getFullYear();
        const existing = await db.get(`SELECT id, status FROM evaluations
       WHERE targetUserId = ? AND type = ? AND (
         campaignYear = ?
         OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?)
       )
       ORDER BY createdAt DESC LIMIT 1`, [targetUserId, type, currentYear, String(currentYear)]);
        // ── Une évaluation déjà validée par les RH ne peut plus être modifiée ──────
        if (existing && existing.status === 'Validée') {
            return res.status(403).json({
                message: 'Cette évaluation a déjà été validée par les RH et ne peut plus être modifiée.'
            });
        }
        // ── Vérification campagne ouverte (annuelle OU mi-parcours) ───────────────
        const [openDateRow, closeDateRow, openDateMpRow, closeDateMpRow] = await Promise.all([
            db.get(`SELECT value FROM app_settings WHERE key = 'openDate'`),
            db.get(`SELECT value FROM app_settings WHERE key = 'closeDate'`),
            db.get(`SELECT value FROM app_settings WHERE key = 'openDateMp'`),
            db.get(`SELECT value FROM app_settings WHERE key = 'closeDateMp'`),
        ]);
        const now = new Date();
        const isWindowActive = (openRow, closeRow) => {
            if (!openRow?.value && !closeRow?.value)
                return true;
            let ok = true;
            if (openRow?.value) {
                const d = new Date(openRow.value);
                d.setHours(0, 0, 0, 0);
                if (now < d)
                    ok = false;
            }
            if (closeRow?.value) {
                const d = new Date(closeRow.value);
                d.setHours(23, 59, 59, 999);
                if (now > d)
                    ok = false;
            }
            return ok;
        };
        const annualConfigured = openDateRow?.value || closeDateRow?.value;
        const mpConfigured = openDateMpRow?.value || closeDateMpRow?.value;
        if (annualConfigured || mpConfigured) {
            const inAnnual = annualConfigured && isWindowActive(openDateRow, closeDateRow);
            const inMp = mpConfigured && isWindowActive(openDateMpRow, closeDateMpRow);
            if (!inAnnual && !inMp) {
                return res.status(403).json({
                    message: `Aucune campagne d'évaluation n'est actuellement ouverte. Vérifiez les dates d'ouverture configurées par votre administrateur.`
                });
            }
        }
        const actorName = `${evaluator.nom} ${evaluator.prenom}`.trim();
        const targetName = `${targetUser.nom} ${targetUser.prenom}`.trim();
        const campaignYear = new Date().getFullYear();
        if (existing && existing.status !== 'Rejetée') {
            // ── Mise à jour de l'évaluation existante ──
            await db.run(`UPDATE evaluations
         SET evaluatorId=?, ratings=?, tasks=?, strengths=?, weaknesses=?, trainingNeeds=?,
             recommendation=?, otherData=?, globalScore=?, status='Soumise', campaignYear=?,
             rhComment=NULL, validatedAt=NULL, validatedBy=NULL, rhFinalScore=NULL
         WHERE id = ?`, [
                evaluator.id, JSON.stringify(ratings), JSON.stringify(tasks),
                strengths, weaknesses, trainingNeeds, recommendation, JSON.stringify(otherData), globalScore,
                campaignYear, existing.id
            ]);
            await db.run(`INSERT INTO history_logs (actorId, actorName, actorRole, department, type, action, target, toTarget)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [evaluator.id, actorName, evaluator.role, evaluator.departement, 'evaluation', `a modifié l'évaluation ${type} de`, targetName, null]);
            await db.run(`INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`, [targetUserId, `${actorName} a mis à jour votre évaluation (${type}).`, 'evaluation']);
            if (targetUser.email) {
                const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
                const { subject, html } = (0, email_service_1.emailEvaluationSoumise)({
                    prenom: targetUser.prenom, nom: targetUser.nom,
                    evaluateurPrenom: evaluator.prenom, evaluateurNom: evaluator.nom, evaluateurRole: evaluator.role,
                    type, score: globalScore, date: dateStr,
                });
                (0, email_service_1.sendEmail)(targetUser.email, subject, html).catch(() => { });
            }
            return res.json({ success: true, message: 'Evaluation updated successfully' });
        }
        // ── Création d'une nouvelle évaluation ──
        await db.run(`INSERT INTO evaluations (targetUserId, evaluatorId, type, ratings, tasks, strengths, weaknesses, trainingNeeds, recommendation, otherData, globalScore, status, campaignYear)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Soumise', ?)`, [
            targetUserId, evaluator.id, type, JSON.stringify(ratings), JSON.stringify(tasks),
            strengths, weaknesses, trainingNeeds, recommendation, JSON.stringify(otherData), globalScore, campaignYear
        ]);
        await db.run(`INSERT INTO history_logs (actorId, actorName, actorRole, department, type, action, target, toTarget)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [evaluator.id, actorName, evaluator.role, evaluator.departement, 'evaluation', `a soumis l'évaluation ${type} de`, targetName, null]);
        await db.run(`INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`, [targetUserId, `${actorName} a soumis votre évaluation (${type}).`, 'evaluation']);
        if (targetUser.email) {
            const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
            const { subject, html } = (0, email_service_1.emailEvaluationSoumise)({
                prenom: targetUser.prenom, nom: targetUser.nom,
                evaluateurPrenom: evaluator.prenom, evaluateurNom: evaluator.nom, evaluateurRole: evaluator.role,
                type, score: globalScore, date: dateStr,
            });
            (0, email_service_1.sendEmail)(targetUser.email, subject, html).catch(() => { });
        }
        res.json({ success: true, message: 'Evaluation saved successfully' });
    }
    catch (error) {
        console.error('Save evaluation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/team/evaluate/:id/comment — RH adds/edits a comment on any evaluation
router.patch('/evaluate/:id/comment', async (req, res) => {
    try {
        const caller = req.user;
        if (!['RH', 'SuperAdmin'].includes(caller?.role)) {
            return res.status(403).json({ message: 'Accès réservé à l\'équipe RH.' });
        }
        const db = await (0, database_1.getDb)();
        const { rhComment } = req.body;
        const evalRow = await db.get(`SELECT id FROM evaluations WHERE id = ?`, [req.params.id]);
        if (!evalRow)
            return res.status(404).json({ message: 'Évaluation non trouvée.' });
        await db.run(`UPDATE evaluations SET rhComment = ? WHERE id = ?`, [rhComment ?? '', req.params.id]);
        res.json({ success: true, message: 'Commentaire enregistré.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// PATCH /api/team/evaluate/:id/validate — RH validates a submitted evaluation
router.patch('/evaluate/:id/validate', async (req, res) => {
    const caller = req.user;
    if (!['RH', 'SuperAdmin'].includes(caller?.role)) {
        return res.status(403).json({ message: 'Accès réservé à l\'équipe RH.' });
    }
    try {
        const db = await (0, database_1.getDb)();
        const { rhComment, rhFinalScore, rhDecision } = req.body;
        const rhUser = caller;
        const evalRow = await db.get(`SELECT id, targetUserId, evaluatorId, type, globalScore, status, otherData FROM evaluations WHERE id = ?`, [req.params.id]);
        if (!evalRow)
            return res.status(404).json({ message: 'Évaluation non trouvée.' });
        if (evalRow.status === 'Validée') {
            return res.status(409).json({ message: 'Cette évaluation est déjà validée et ne peut pas être revalidée.' });
        }
        const validatedAt = new Date().toISOString();
        await db.run(`UPDATE evaluations SET status = 'Validée', rhComment = COALESCE(?, rhComment), validatedAt = ?, validatedBy = ?, rhFinalScore = COALESCE(?, rhFinalScore), rhDecision = COALESCE(?, rhDecision) WHERE id = ?`, [rhComment || null, validatedAt, rhUser?.id ?? null, rhFinalScore ?? null, rhDecision ? JSON.stringify(rhDecision) : null, req.params.id]);
        // Notifier l'employé évalué
        await db.run(`INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`, [evalRow.targetUserId, `Votre évaluation (${evalRow.type}) a été validée par les RH.`, 'success']);
        // Notifier l'évaluateur (N+1) que son évaluation a été validée par le RH
        if (evalRow.evaluatorId && evalRow.evaluatorId !== evalRow.targetUserId) {
            const target = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [evalRow.targetUserId]);
            const targetName = target ? `${target.prenom} ${target.nom}`.trim() : 'l\'employé';
            await db.run(`INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`, [evalRow.evaluatorId, `Les RH ont validé votre évaluation de ${targetName} (${evalRow.type}).`, 'success']);
        }
        // Email à l'employé (non bloquant)
        const emp = await db.get(`SELECT nom, prenom, email FROM users WHERE id = ?`, [evalRow.targetUserId]);
        if (emp?.email) {
            const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
            let objectives;
            try {
                objectives = JSON.parse(evalRow.otherData || '{}')?.objectives;
            }
            catch { /* otherData invalide, ignoré */ }
            const { subject, html } = (0, email_service_1.emailEvaluationValidee)({
                prenom: emp.prenom, nom: emp.nom,
                type: evalRow.type, score: evalRow.globalScore, date: dateStr,
                objectives,
            });
            (0, email_service_1.sendEmail)(emp.email, subject, html).catch(() => { });
        }
        return res.json({ success: true });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// PATCH /api/team/evaluate/:id/employee-feedback — l'employé donne son retour
// (satisfait / moyen / non satisfait) une fois son évaluation validée par les RH.
const FEEDBACK_VALUES = ['satisfait', 'moyen', 'non_satisfait'];
const FEEDBACK_LABELS = {
    satisfait: 'satisfait(e)',
    moyen: 'moyennement satisfait(e)',
    non_satisfait: 'non satisfait(e)',
};
router.patch('/evaluate/:id/employee-feedback', async (req, res) => {
    try {
        const caller = req.user;
        const { feedback } = req.body;
        if (!FEEDBACK_VALUES.includes(feedback)) {
            return res.status(400).json({ message: 'Retour invalide.' });
        }
        const db = await (0, database_1.getDb)();
        const evalRow = await db.get(`SELECT id, targetUserId, evaluatorId, type, status FROM evaluations WHERE id = ?`, [req.params.id]);
        if (!evalRow)
            return res.status(404).json({ message: 'Évaluation non trouvée.' });
        if (evalRow.targetUserId !== caller.id) {
            return res.status(403).json({ message: 'Vous ne pouvez donner votre retour que sur votre propre évaluation.' });
        }
        if (evalRow.status !== 'Validée') {
            return res.status(409).json({ message: 'Cette évaluation n\'est pas encore validée par les RH.' });
        }
        const now = new Date().toISOString();
        await db.run(`UPDATE evaluations SET employeeFeedback = ?, employeeFeedbackAt = ? WHERE id = ?`, [feedback, now, req.params.id]);
        // Notifier le responsable qui a réalisé l'évaluation
        if (evalRow.evaluatorId) {
            const emp = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [caller.id]);
            const empName = emp ? `${emp.prenom} ${emp.nom}`.trim() : 'Votre collaborateur';
            await db.run(`INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`, [
                evalRow.evaluatorId,
                `${empName} s'est déclaré(e) ${FEEDBACK_LABELS[feedback]} de son évaluation (${evalRow.type}).`,
                feedback === 'satisfait' ? 'success' : feedback === 'non_satisfait' ? 'warning' : 'info',
            ]);
        }
        res.json({ success: true, feedback, feedbackAt: now });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── GET /api/team/history/:username?year=YYYY ───────────────────────────────
// Retourne les résultats de l'équipe pour une année donnée (années précédentes)
router.get('/history/:username', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const { username } = req.params;
        const year = parseInt(String(req.query.year || new Date().getFullYear() - 1));
        const user = await db.get(`SELECT nom, prenom, role FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [username]);
        if (!user)
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        const fullName = `${user.nom} ${user.prenom}`.trim();
        const teamMembers = await getFlatTeamFull(db, fullName);
        if (teamMembers.length === 0)
            return res.json({ year, members: [], avgScore: null, totalEvaluated: 0 });
        const memberIds = teamMembers.map((m) => m.id);
        const placeholders = memberIds.map(() => '?').join(',');
        const evals = await db.all(`SELECT e.targetUserId, e.type, e.globalScore, e.rhFinalScore, e.status, e.createdAt,
              u.nom, u.prenom, u.poste, u.departement
       FROM evaluations e
       JOIN users u ON e.targetUserId = u.id
       WHERE e.targetUserId IN (${placeholders})
         AND (e.campaignYear = ? OR (e.campaignYear IS NULL AND strftime('%Y', e.createdAt) = ?))
       ORDER BY e.createdAt DESC`, [...memberIds, year, String(year)]);
        // Dédoublonner : garder la dernière évaluation par employé
        const seen = new Set();
        const unique = evals.filter((e) => {
            if (seen.has(e.targetUserId))
                return false;
            seen.add(e.targetUserId);
            return true;
        });
        const scores = unique.map((e) => e.rhFinalScore ?? e.globalScore).filter((s) => s != null);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        res.json({
            year,
            totalTeam: teamMembers.length,
            totalEvaluated: unique.length,
            avgScore,
            members: unique.map((e) => ({
                id: e.targetUserId,
                name: `${e.nom} ${e.prenom}`.trim(),
                poste: e.poste,
                departement: e.departement,
                type: e.type,
                score: e.rhFinalScore ?? e.globalScore,
                status: e.status,
                date: e.createdAt,
            })),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ─── GET /api/team/users-for-feedback ────────────────────────────────────────
// Retourne la liste minimale des employés actifs pour la sélection des répondants 360°
// Accessible à tous les rôles authentifiés (données non sensibles : nom, prénom, poste uniquement)
router.get('/users-for-feedback', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const caller = req.user;
        const { search } = req.query;
        let query = `SELECT id, nom, prenom, poste, direction, departement FROM users WHERE actif = 1 AND id != ?`;
        const params = [caller.id];
        if (search) {
            query += ` AND (nom LIKE ? OR prenom LIKE ? OR poste LIKE ?)`;
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        query += ` ORDER BY nom, prenom LIMIT 200`;
        const users = await db.all(query, params);
        res.json(users.map((u) => ({
            id: u.id,
            nom: u.nom,
            prenom: u.prenom,
            poste: u.poste || '',
            direction: u.direction || '',
            departement: u.departement || '',
        })));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── GET /api/team/campaign-dates ─────────────────────────────────────────────
// Dates de campagne configurées par le SuperAdmin — accessible à tout utilisateur
// authentifié (contrairement à /api/admin/settings, réservé au SuperAdmin) afin que
// chaque manager/directeur voie l'échéance en cours sur son propre tableau de bord.
router.get('/campaign-dates', async (_req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const rows = await db.all(`SELECT key, value FROM app_settings WHERE key IN ('openDate','closeDate','openDateMp','closeDateMp')`);
        const map = {};
        rows.forEach((r) => { map[r.key] = r.value; });
        res.json({
            openDate: map.openDate || null,
            closeDate: map.closeDate || null,
            openDateMp: map.openDateMp || null,
            closeDateMp: map.closeDateMp || null,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── GET /api/team/criteria?type=executions|cadres ───────────────────────────
router.get('/criteria', async (req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const type = String(req.query.type || 'executions');
        const key = `criteria_${type}`;
        const row = await db.get(`SELECT value FROM app_settings WHERE key = ?`, [key]);
        if (row?.value) {
            res.json(JSON.parse(row.value));
        }
        else {
            res.json(null); // fallback to frontend defaults
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── GET /api/team/training-daily-rate ────────────────────────────────────────
// Tarif journalier des formations externes, configuré par le SuperAdmin
// (voir /api/admin/training-daily-rate). Lecture ouverte à tout utilisateur
// authentifié : le budget affiché sur les fiches = jours × ce tarif.
router.get('/training-daily-rate', async (_req, res) => {
    try {
        const db = await (0, database_1.getDb)();
        const row = await db.get(`SELECT value FROM app_settings WHERE key = 'training_daily_rate'`);
        res.json({ rate: row?.value ? Number(row.value) : null }); // null → fallback to frontend default
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
