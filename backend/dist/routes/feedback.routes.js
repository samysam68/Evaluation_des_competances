"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const email_service_1 = require("../services/email.service");
const router = (0, express_1.Router)();
// Module désactivable par le SuperAdmin. Le SuperAdmin garde l'accès pour
// pouvoir réactiver/administrer le module.
router.use(async (req, res, next) => {
    const user = req.user;
    if (user?.role === 'SuperAdmin')
        return next();
    try {
        const db = await (0, database_1.getDb)();
        const row = await db.get(`SELECT value FROM app_settings WHERE key = 'module_feedback_enabled'`);
        if (row?.value !== '0')
            return next();
    }
    catch {
        return next();
    }
    return res.status(403).json({ message: 'Le module Feedback 360° est désactivé. Contactez le Super Administrateur.' });
});
// ── POST /api/feedback/request ─────────────────────────────────────────────────
// Manager/RH creates 360 feedback requests for a target employee
router.post('/request', async (req, res) => {
    try {
        const requester = req.user;
        const db = await (0, database_1.getDb)();
        const { targetUserId, respondentIds, message } = req.body;
        if (!targetUserId || !respondentIds?.length) {
            return res.status(400).json({ message: 'targetUserId et respondentIds requis.' });
        }
        const target = await db.get(`SELECT id, nom, prenom FROM users WHERE id = ?`, [targetUserId]);
        if (!target)
            return res.status(404).json({ message: 'Employé cible non trouvé.' });
        const requesterUser = await db.get(`SELECT id, nom, prenom, email FROM users WHERE id = ?`, [requester.id]);
        if (!requesterUser)
            return res.status(404).json({ message: 'Requester non trouvé.' });
        const created = [];
        for (const respondentId of respondentIds) {
            // Don't create duplicate pending request
            const existing = await db.get(`SELECT id FROM feedback_360 WHERE targetUserId = ? AND respondentId = ? AND status = 'pending'`, [targetUserId, respondentId]);
            if (existing)
                continue;
            const result = await db.run(`INSERT INTO feedback_360 (targetUserId, requestedBy, respondentId, message, status) VALUES (?, ?, ?, ?, 'pending')`, [targetUserId, requesterUser.id, respondentId, message || '']);
            created.push(result.lastID);
            // In-app notification for respondent (avec lien direct vers le formulaire)
            await db.run(`INSERT INTO notifications (userId, message, type, link) VALUES (?, ?, 'info', ?)`, [
                respondentId,
                `${requesterUser.prenom} ${requesterUser.nom} vous demande un feedback 360° sur ${target.prenom} ${target.nom}. Cliquez pour répondre.`,
                `/dashboard/feedback/${result.lastID}`,
            ]);
            // Email notification
            const respondent = await db.get(`SELECT email, prenom, nom FROM users WHERE id = ?`, [respondentId]);
            if (respondent?.email) {
                const targetName = `${target.prenom} ${target.nom}`;
                const requesterName = `${requesterUser.prenom} ${requesterUser.nom}`;
                await (0, email_service_1.sendEmail)(respondent.email, `Feedback 360° demandé – ${targetName} – Talents`, feedbackRequestEmailHtml({ respondentPrenom: respondent.prenom, respondentNom: respondent.nom, targetName, requesterName, customMessage: message, requestId: result.lastID }));
            }
        }
        res.json({ message: `${created.length} demande(s) de feedback créée(s).`, created });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/feedback/pending ──────────────────────────────────────────────────
// Get all pending feedback requests for the authenticated user (respondent)
router.get('/pending', async (req, res) => {
    try {
        const callerId = req.user.id;
        const db = await (0, database_1.getDb)();
        const requests = await db.all(`
      SELECT f.id, f.targetUserId, f.requestedBy, f.message, f.status, f.createdAt,
        t.nom AS targetNom, t.prenom AS targetPrenom, t.poste AS targetPoste, t.direction AS targetDirection,
        r.nom AS requesterNom, r.prenom AS requesterPrenom, r.role AS requesterRole
      FROM feedback_360 f
      JOIN users t ON t.id = f.targetUserId
      JOIN users r ON r.id = f.requestedBy
      WHERE f.respondentId = ? AND f.status = 'pending'
      ORDER BY f.createdAt DESC
    `, [callerId]);
        res.json(requests);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/feedback/my-requests ─────────────────────────────────────────────
// Get all 360 requests created by the authenticated user
router.get('/my-requests', async (req, res) => {
    try {
        const callerId = req.user.id;
        const db = await (0, database_1.getDb)();
        const requests = await db.all(`
      SELECT f.id, f.targetUserId, f.respondentId, f.status, f.globalScore, f.createdAt, f.submittedAt,
        t.nom AS targetNom, t.prenom AS targetPrenom, t.poste AS targetPoste,
        resp.nom AS respondentNom, resp.prenom AS respondentPrenom, resp.poste AS respondentPoste
      FROM feedback_360 f
      JOIN users t ON t.id = f.targetUserId
      JOIN users resp ON resp.id = f.respondentId
      WHERE f.requestedBy = ?
      ORDER BY f.createdAt DESC
    `, [callerId]);
        res.json(requests);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/feedback/summary/:targetId ───────────────────────────────────────
// Réservé : RH, SuperAdmin, ou le manager direct de la cible
router.get('/summary/:targetId', async (req, res) => {
    const caller = req.user;
    const allowedRoles = ['RH', 'SuperAdmin', 'Directeur', 'Manager', 'Responsable'];
    const isOwnProfile = caller.id === Number(req.params.targetId);
    if (!allowedRoles.includes(caller.role) && !isOwnProfile) {
        return res.status(403).json({ message: 'Accès non autorisé aux feedbacks de cet employé.' });
    }
    try {
        const db = await (0, database_1.getDb)();
        const rows = await db.all(`
      SELECT f.id, f.respondentId, f.status, f.ratings, f.comment, f.globalScore, f.submittedAt,
        resp.nom AS respondentNom, resp.prenom AS respondentPrenom, resp.poste AS respondentPoste, resp.role AS respondentRole
      FROM feedback_360 f
      JOIN users resp ON resp.id = f.respondentId
      WHERE f.targetUserId = ? AND f.status = 'submitted'
      ORDER BY f.submittedAt DESC
    `, [req.params.targetId]);
        const parsed = rows.map((r) => ({
            ...r,
            ratings: r.ratings ? JSON.parse(r.ratings) : {},
        }));
        const avg = parsed.length > 0
            ? parsed.reduce((acc, r) => acc + (r.globalScore || 0), 0) / parsed.length
            : null;
        res.json({ feedbacks: parsed, avgScore: avg, count: parsed.length });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/feedback/request/:id ─────────────────────────────────────────────
// Get a single feedback request (for filling in the form)
router.get('/request/:id', async (req, res) => {
    try {
        const callerId = req.user.id;
        const db = await (0, database_1.getDb)();
        const request = await db.get(`
      SELECT f.id, f.targetUserId, f.respondentId, f.requestedBy, f.message, f.status,
        t.nom AS targetNom, t.prenom AS targetPrenom, t.poste AS targetPoste, t.direction AS targetDirection, t.departement AS targetDept,
        r.nom AS requesterNom, r.prenom AS requesterPrenom
      FROM feedback_360 f
      JOIN users t ON t.id = f.targetUserId
      JOIN users r ON r.id = f.requestedBy
      WHERE f.id = ?
    `, [req.params.id]);
        if (!request)
            return res.status(404).json({ message: 'Demande non trouvée.' });
        if (request.respondentId !== callerId)
            return res.status(403).json({ message: 'Accès refusé.' });
        res.json(request);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/feedback/submit/:requestId ──────────────────────────────────────
// Respondent submits their feedback
router.post('/submit/:requestId', async (req, res) => {
    try {
        const callerId = req.user.id;
        const db = await (0, database_1.getDb)();
        const request = await db.get(`SELECT * FROM feedback_360 WHERE id = ?`, [req.params.requestId]);
        if (!request)
            return res.status(404).json({ message: 'Demande non trouvée.' });
        if (request.respondentId !== callerId)
            return res.status(403).json({ message: 'Accès refusé.' });
        if (request.status !== 'pending')
            return res.status(409).json({ message: 'Ce feedback a déjà été soumis.' });
        const { ratings, comment } = req.body;
        const ratingValues = Object.values(ratings || {});
        const globalScore = ratingValues.length > 0
            ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length
            : 0;
        await db.run(`UPDATE feedback_360 SET status = 'submitted', ratings = ?, comment = ?, globalScore = ?, submittedAt = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(ratings), comment || '', globalScore, request.id]);
        // Notify the requester
        const respondent = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [callerId]);
        const target = await db.get(`SELECT nom, prenom FROM users WHERE id = ?`, [request.targetUserId]);
        if (respondent && target) {
            await db.run(`INSERT INTO notifications (userId, message, type) VALUES (?, ?, 'success')`, [request.requestedBy, `${respondent.prenom} ${respondent.nom} a soumis son feedback 360° sur ${target.prenom} ${target.nom}.`]);
        }
        res.json({ message: 'Feedback soumis avec succès.', globalScore: globalScore.toFixed(2) });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── DELETE /api/feedback/request/:requestId ───────────────────────────────────
router.delete('/request/:requestId', async (req, res) => {
    try {
        const caller = req.user;
        const db = await (0, database_1.getDb)();
        const row = await db.get(`SELECT requestedBy FROM feedback_360 WHERE id = ? AND status = 'pending'`, [req.params.requestId]);
        if (!row)
            return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
        if (row.requestedBy !== caller.id && !['RH', 'SuperAdmin'].includes(caller.role)) {
            return res.status(403).json({ error: 'Non autorisé à annuler cette demande.' });
        }
        await db.run(`DELETE FROM feedback_360 WHERE id = ?`, [req.params.requestId]);
        res.json({ message: 'Demande annulée.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── Email template ─────────────────────────────────────────────────────────────
function feedbackRequestEmailHtml(opts) {
    return `
<table width="100%" style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;padding:0;margin:0;">
  <tr><td align="center" style="padding:40px 16px;">
    <table width="580" style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden;max-width:100%;">
      <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 36px;">
        <span style="color:#fff;font-size:22px;font-weight:900;">Talents</span>
        <span style="color:rgba(255,255,255,.7);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin-left:10px;">LDM GROUPE</span>
      </td></tr>
      <tr><td style="padding:36px;">
        <p style="color:#64748b;font-size:14px;margin:0 0 6px;">Bonjour,</p>
        <h2 style="color:#0f172a;font-size:20px;font-weight:800;margin:0 0 20px;">${opts.respondentPrenom} ${opts.respondentNom}</h2>
        <div style="background:#f5f3ff;border-left:4px solid #6366f1;border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:24px;">
          <p style="color:#0f172a;margin:0;font-size:15px;font-weight:600;">Demande de Feedback 360°</p>
          <p style="color:#64748b;margin:6px 0 0;font-size:13px;">
            <strong>${opts.requesterName}</strong> vous demande de donner votre avis sur
            <strong>${opts.targetName}</strong> dans le cadre d'une évaluation 360°.
          </p>
        </div>
        ${opts.customMessage ? `<p style="color:#64748b;font-size:13px;font-style:italic;margin-bottom:20px;">"${opts.customMessage}"</p>` : ''}
        <p style="color:#0f172a;font-size:14px;margin:0 0 12px;">Ce retour est <strong>confidentiel</strong> et ne sera visible que sous forme agrégée.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/feedback/${opts.requestId}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
          Donner mon feedback
        </a>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #f1f5f9;">
        <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center;">Cet email a été envoyé automatiquement par Talents · LDM GROUPE.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
exports.default = router;
