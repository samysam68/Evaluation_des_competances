"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
exports.emailEvaluationSoumise = emailEvaluationSoumise;
exports.emailEvaluationValidee = emailEvaluationValidee;
exports.emailDelegationRecue = emailDelegationRecue;
exports.emailRelanceEvaluations = emailRelanceEvaluations;
const nodemailer_1 = __importDefault(require("nodemailer"));
const database_1 = require("../database");
async function getSmtpConfig() {
    const db = await (0, database_1.getDb)();
    const rows = await db.all(`SELECT key, value FROM app_settings WHERE key LIKE 'smtp_%'`);
    const cfg = {};
    rows.forEach((r) => { cfg[r.key] = r.value; });
    return cfg;
}
async function sendEmail(to, subject, html) {
    try {
        const cfg = await getSmtpConfig();
        if (cfg['smtp_enabled'] === 'false')
            return false;
        if (!cfg['smtp_host'] || !cfg['smtp_user'] || !cfg['smtp_password'])
            return false;
        if (!to || !to.includes('@'))
            return false;
        const port = Number(cfg['smtp_port'] || 587);
        const transporter = nodemailer_1.default.createTransport({
            host: cfg['smtp_host'],
            port,
            secure: port === 465,
            auth: { user: cfg['smtp_user'], pass: cfg['smtp_password'] },
            tls: { rejectUnauthorized: false },
        });
        await transporter.sendMail({
            from: cfg['smtp_from'] || `"Talents – LDM GROUPE" <${cfg['smtp_user']}>`,
            to,
            subject,
            html,
        });
        console.log(`[EMAIL] Sent to ${to}: ${subject}`);
        return true;
    }
    catch (err) {
        console.error(`[EMAIL] Failed to ${to}:`, err.message);
        return false;
    }
}
// ── Email templates ────────────────────────────────────────────────────────────
const BASE_STYLE = `
  font-family: 'Segoe UI', Arial, sans-serif;
  background: #f8fafc;
  padding: 0; margin: 0;
`;
const card = (content) => `
<table width="100%" style="${BASE_STYLE}">
  <tr><td align="center" style="padding: 40px 16px;">
    <table width="580" style="background:#fff; border-radius:16px; box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden; max-width:100%;">
      <!-- Header -->
      <tr>
        <td style="background: linear-gradient(135deg, #e11d48 0%, #f97316 100%); padding: 28px 36px;">
          <span style="color:#fff; font-size:22px; font-weight:900; letter-spacing:-0.5px;">Talents</span>
          <span style="color:rgba(255,255,255,0.7); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:2px; margin-left:10px;">LDM GROUPE</span>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding: 36px;">
          ${content}
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc; padding: 20px 36px; border-top: 1px solid #f1f5f9;">
          <p style="color:#94a3b8; font-size:11px; margin:0; text-align:center;">
            Cet email a été envoyé automatiquement par Talents · LDM GROUPE.<br>
            Ne pas répondre à cet email.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const btn = (label, path = '/dashboard') => `
  <a style="display:inline-block; background: linear-gradient(135deg,#e11d48,#f97316); color:#fff; padding:12px 28px; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px; margin-top:24px;"
     href="${APP_URL}${path}">${label}</a>`;
function emailEvaluationSoumise(opts) {
    return {
        subject: `Votre évaluation a été soumise – Talents`,
        html: card(`
      <p style="color:#64748b; font-size:14px; margin:0 0 6px;">Bonjour,</p>
      <h2 style="color:#0f172a; font-size:20px; font-weight:800; margin:0 0 20px;">${opts.prenom} ${opts.nom}</h2>

      <div style="background:#fef2f2; border-left:4px solid #e11d48; border-radius:0 10px 10px 0; padding:16px 20px; margin-bottom:24px;">
        <p style="color:#0f172a; margin:0; font-size:15px; font-weight:600;">
          Une évaluation vous a été soumise
        </p>
        <p style="color:#64748b; margin:6px 0 0; font-size:13px;">
          <strong>${opts.evaluateurPrenom} ${opts.evaluateurNom}</strong> (${opts.evaluateurRole})
          a enregistré votre évaluation <strong>${opts.type}</strong> le ${opts.date}.
        </p>
      </div>

      <table style="width:100%; border-radius:10px; overflow:hidden; border:1px solid #f1f5f9;">
        <tr style="background:#f8fafc;">
          <td style="padding:12px 16px; color:#64748b; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Type</td>
          <td style="padding:12px 16px; color:#0f172a; font-size:14px; font-weight:600;">${opts.type}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px; color:#64748b; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Évaluateur</td>
          <td style="padding:12px 16px; color:#0f172a; font-size:14px;">${opts.evaluateurPrenom} ${opts.evaluateurNom}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:12px 16px; color:#64748b; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Date</td>
          <td style="padding:12px 16px; color:#0f172a; font-size:14px;">${opts.date}</td>
        </tr>
        ${opts.score !== undefined ? `
        <tr>
          <td style="padding:12px 16px; color:#64748b; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Note</td>
          <td style="padding:12px 16px;">
            <span style="background:#fef2f2; color:#e11d48; font-size:16px; font-weight:900; padding:4px 12px; border-radius:6px;">${Number(opts.score).toFixed(1)}/20</span>
          </td>
        </tr>` : ''}
      </table>

      <p style="color:#64748b; font-size:13px; margin: 20px 0 0;">
        Connectez-vous à <strong>Talents</strong> pour consulter le détail de votre évaluation et vos résultats.
      </p>
      ${btn('Voir mon évaluation', '/dashboard/employee')}
    `),
    };
}
function emailEvaluationValidee(opts) {
    const objectivesRows = (opts.objectives || []).filter(o => o.objectif?.trim());
    return {
        subject: `Votre évaluation a été validée par les RH – Talents`,
        html: card(`
      <p style="color:#64748b; font-size:14px; margin:0 0 6px;">Bonjour,</p>
      <h2 style="color:#0f172a; font-size:20px; font-weight:800; margin:0 0 20px;">${opts.prenom} ${opts.nom}</h2>

      <div style="background:#f0fdf4; border-left:4px solid #22c55e; border-radius:0 10px 10px 0; padding:16px 20px; margin-bottom:24px;">
        <p style="color:#0f172a; margin:0; font-size:15px; font-weight:600;">
          ✓ Votre évaluation a été validée
        </p>
        <p style="color:#64748b; margin:6px 0 0; font-size:13px;">
          Votre évaluation <strong>${opts.type}</strong> a été officiellement validée par le département RH.
        </p>
      </div>

      <div style="text-align:center; padding: 20px; background:#f8fafc; border-radius:12px; margin-bottom:20px;">
        <p style="color:#64748b; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin:0 0 8px;">Note globale</p>
        <span style="font-size:36px; font-weight:900; color:#e11d48;">${Number(opts.score).toFixed(1)}</span>
        <span style="font-size:18px; color:#94a3b8; font-weight:600;">/20</span>
        <p style="color:#94a3b8; font-size:12px; margin:8px 0 0;">${opts.type} · ${opts.date}</p>
      </div>

      ${objectivesRows.length > 0 ? `
      <p style="color:#0f172a; font-size:13px; font-weight:700; margin:0 0 10px;">Vos objectifs fixés</p>
      <table style="width:100%; border-radius:10px; overflow:hidden; border:1px solid #f1f5f9; margin-bottom:20px;">
        <tr style="background:#f8fafc;">
          <td style="padding:10px 14px; color:#64748b; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Objectif</td>
          <td style="padding:10px 14px; color:#64748b; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Indicateur KPI</td>
          <td style="padding:10px 14px; color:#64748b; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Cible</td>
        </tr>
        ${objectivesRows.map((o, i) => `
        <tr style="${i % 2 === 1 ? 'background:#f8fafc;' : ''}">
          <td style="padding:10px 14px; color:#0f172a; font-size:13px;">${o.objectif}</td>
          <td style="padding:10px 14px; color:#0f172a; font-size:13px;">${o.kpi || '—'}</td>
          <td style="padding:10px 14px; color:#0f172a; font-size:13px;">${o.cible || '—'}${o.poids ? ` (${o.poids}%)` : ''}</td>
        </tr>`).join('')}
      </table>` : ''}

      <p style="color:#64748b; font-size:13px; margin:0 0 4px;">
        Connectez-vous à <strong>Talents</strong> pour accéder à votre rapport d'évaluation complet et donner votre retour (satisfait, moyennement satisfait ou non satisfait).
      </p>
      ${btn('Consulter mon rapport et donner mon avis', '/dashboard/employee')}
    `),
    };
}
function emailDelegationRecue(opts) {
    return {
        subject: `Délégation d'évaluation reçue – Talents`,
        html: card(`
      <p style="color:#64748b; font-size:14px; margin:0 0 6px;">Bonjour,</p>
      <h2 style="color:#0f172a; font-size:20px; font-weight:800; margin:0 0 20px;">${opts.prenom} ${opts.nom}</h2>

      <div style="background:#eff6ff; border-left:4px solid #3b82f6; border-radius:0 10px 10px 0; padding:16px 20px; margin-bottom:24px;">
        <p style="color:#0f172a; margin:0; font-size:15px; font-weight:600;">
          Vous avez reçu une délégation d'évaluation
        </p>
        <p style="color:#64748b; margin:6px 0 0; font-size:13px;">
          <strong>${opts.delegateurPrenom} ${opts.delegateurNom}</strong> (${opts.delegateurRole})
          vous a délégué la responsabilité d'évaluer son équipe le ${opts.date}.
        </p>
      </div>

      <p style="color:#0f172a; font-size:14px; margin:0 0 12px;">
        Vous pouvez désormais accéder aux fiches d'évaluation de l'équipe concernée directement depuis votre espace Talents.
      </p>

      <ul style="color:#64748b; font-size:13px; padding-left:20px; margin:0 0 20px; line-height:1.8;">
        <li>Accédez à l'onglet <strong>Arborescence équipe</strong></li>
        <li>Sélectionnez les collaborateurs à évaluer</li>
        <li>Remplissez et soumettez les fiches d'évaluation</li>
      </ul>

      ${btn('Commencer les évaluations', '/dashboard/director')}
    `),
    };
}
function emailRelanceEvaluations(opts) {
    const restantes = Math.max(0, opts.totalTeam - opts.evaluated);
    return {
        subject: `Rappel — Évaluations en attente de votre équipe – Talents`,
        html: card(`
      <p style="color:#64748b; font-size:14px; margin:0 0 6px;">Bonjour,</p>
      <h2 style="color:#0f172a; font-size:20px; font-weight:800; margin:0 0 20px;">${opts.prenom} ${opts.nom}</h2>

      <div style="background:#fff7ed; border-left:4px solid #f59e0b; border-radius:0 10px 10px 0; padding:16px 20px; margin-bottom:24px;">
        <p style="color:#0f172a; margin:0; font-size:15px; font-weight:600;">
          ${opts.evaluated}/${opts.totalTeam} évaluations soumises pour votre département
        </p>
        <p style="color:#64748b; margin:6px 0 0; font-size:13px;">
          Il reste <strong>${restantes} collaborateur${restantes > 1 ? 's' : ''}</strong> à évaluer avant la clôture de la campagne. La Direction des Ressources Humaines vous remercie de compléter les évaluations restantes dans les meilleurs délais.
        </p>
      </div>

      ${btn('Compléter les évaluations', '/dashboard/team-tree')}
    `),
    };
}
