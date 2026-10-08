import { getDb } from '../database';
import { sendEmail } from './email.service';

// Days before close date that trigger a reminder
const REMINDER_DAYS = [7, 3];

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function reminderEmailHtml(opts: {
  evaluatorPrenom: string;
  evaluatorNom: string;
  pendingCount: number;
  closeDate: string;
  daysLeft: number;
  campaignLabel: string;
  members: { prenom: string; nom: string; poste: string }[];
}): { subject: string; html: string } {
  const urgentColor = opts.daysLeft <= 3 ? '#dc2626' : '#f97316';
  const membersRows = opts.members
    .map(m => `
      <tr>
        <td style="padding:10px 14px; color:#0f172a; font-size:13px; font-weight:600;">${m.prenom} ${m.nom}</td>
        <td style="padding:10px 14px; color:#64748b; font-size:13px;">${m.poste || '—'}</td>
      </tr>`)
    .join('');

  const html = `
<table width="100%" style="font-family:'Segoe UI',Arial,sans-serif; background:#f8fafc; padding:0; margin:0;">
  <tr><td align="center" style="padding:40px 16px;">
    <table width="580" style="background:#fff; border-radius:16px; box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden; max-width:100%;">
      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#e11d48 0%,#f97316 100%); padding:28px 36px;">
          <span style="color:#fff; font-size:22px; font-weight:900; letter-spacing:-0.5px;">Talents</span>
          <span style="color:rgba(255,255,255,0.7); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:2px; margin-left:10px;">LDM GROUPE</span>
        </td>
      </tr>
      <!-- Body -->
      <tr><td style="padding:36px;">
        <p style="color:#64748b; font-size:14px; margin:0 0 6px;">Bonjour,</p>
        <h2 style="color:#0f172a; font-size:20px; font-weight:800; margin:0 0 20px;">${opts.evaluatorPrenom} ${opts.evaluatorNom}</h2>

        <!-- Urgency badge -->
        <div style="background:${urgentColor}15; border-left:4px solid ${urgentColor}; border-radius:0 10px 10px 0; padding:16px 20px; margin-bottom:24px;">
          <p style="color:#0f172a; margin:0; font-size:15px; font-weight:700;">
            ⏰ Rappel – ${opts.campaignLabel}
          </p>
          <p style="color:#64748b; margin:6px 0 0; font-size:13px;">
            Il vous reste <strong style="color:${urgentColor};">${opts.daysLeft} jour${opts.daysLeft > 1 ? 's' : ''}</strong> pour soumettre
            <strong>${opts.pendingCount} évaluation${opts.pendingCount > 1 ? 's' : ''}</strong> avant la clôture
            le <strong>${formatDate(opts.closeDate)}</strong>.
          </p>
        </div>

        <!-- Pending members table -->
        <p style="color:#0f172a; font-size:14px; font-weight:600; margin:0 0 12px;">
          Collaborateurs sans évaluation soumise :
        </p>
        <table style="width:100%; border-radius:10px; overflow:hidden; border:1px solid #f1f5f9; margin-bottom:24px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px; color:#64748b; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; text-align:left;">Collaborateur</th>
              <th style="padding:10px 14px; color:#64748b; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; text-align:left;">Poste</th>
            </tr>
          </thead>
          <tbody>${membersRows}</tbody>
        </table>

        <p style="color:#64748b; font-size:13px; margin:0 0 24px;">
          Connectez-vous à <strong>Talents</strong> pour compléter ces évaluations avant la date de clôture.
        </p>
        <a style="display:inline-block; background:linear-gradient(135deg,#e11d48,#f97316); color:#fff; padding:12px 28px; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px;"
           href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/evaluations">Accéder aux évaluations</a>
      </td></tr>
      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc; padding:20px 36px; border-top:1px solid #f1f5f9;">
          <p style="color:#94a3b8; font-size:11px; margin:0; text-align:center;">
            Cet email a été envoyé automatiquement par Talents · LDM GROUPE.<br>
            Ne pas répondre à cet email.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;

  return {
    subject: `[RAPPEL J-${opts.daysLeft}] ${opts.pendingCount} évaluation${opts.pendingCount > 1 ? 's' : ''} en attente – ${opts.campaignLabel}`,
    html,
  };
}

async function sendRemindersForCampaign(
  db: any,
  closeDate: string,
  campaignLabel: string,
  daysLeft: number
) {
  const year = new Date(closeDate).getFullYear();

  // All active evaluators who have at least one direct report
  const evaluators = await db.all(`
    SELECT DISTINCT u.id, u.nom, u.prenom, u.email, u.activeDirectory,
      (u.nom || ' ' || u.prenom) AS fullName
    FROM users u
    WHERE u.actif = 1 AND u.email IS NOT NULL AND u.email != ''
      AND EXISTS (
        SELECT 1 FROM users emp
        WHERE emp.responsable1 = (u.nom || ' ' || u.prenom) COLLATE NOCASE
          AND emp.actif = 1
      )
  `);

  let sentCount = 0;

  for (const evaluator of evaluators) {
    // Direct reports of this evaluator
    const directReports = await db.all(`
      SELECT id, nom, prenom, poste FROM users
      WHERE responsable1 = ? COLLATE NOCASE AND actif = 1
    `, [evaluator.fullName]);

    // Check which ones have no submitted evaluation this campaign year
    const pending: { prenom: string; nom: string; poste: string }[] = [];
    for (const emp of directReports) {
      const eval_ = await db.get(`
        SELECT id FROM evaluations
        WHERE targetUserId = ? AND evaluatorId = ?
          AND strftime('%Y', createdAt) = ?
          AND status != 'Rejetée'
      `, [emp.id, evaluator.id, String(year)]);

      if (!eval_) {
        pending.push({ prenom: emp.prenom, nom: emp.nom, poste: emp.poste });
      }
    }

    if (pending.length === 0) continue;

    // Check if we already sent this reminder today (avoid duplicates on restart)
    const today = new Date().toISOString().slice(0, 10);
    const alreadySent = await db.get(`
      SELECT id FROM notifications
      WHERE userId = ? AND message LIKE ? AND date(createdAt) = ?
    `, [evaluator.id, `%RAPPEL J-${daysLeft}%${campaignLabel}%`, today]);

    if (alreadySent) continue;

    // Send email
    const { subject, html } = reminderEmailHtml({
      evaluatorPrenom: evaluator.prenom,
      evaluatorNom: evaluator.nom,
      pendingCount: pending.length,
      closeDate,
      daysLeft,
      campaignLabel,
      members: pending,
    });

    const sent = await sendEmail(evaluator.email, subject, html);

    if (sent) {
      // Record notification so the evaluator sees it in-app too
      await db.run(`
        INSERT INTO notifications (userId, message, type)
        VALUES (?, ?, 'warning')
      `, [
        evaluator.id,
        `RAPPEL J-${daysLeft} – ${campaignLabel} : ${pending.length} évaluation${pending.length > 1 ? 's' : ''} en attente avant le ${formatDate(closeDate)}.`,
      ]);
      sentCount++;
    }
  }

  console.log(`[REMINDER] ${campaignLabel} J-${daysLeft}: ${sentCount} email(s) envoyé(s).`);
}

export async function checkAndSendReminders() {
  try {
    const db = await getDb();
    const rows = await db.all(`SELECT key, value FROM app_settings WHERE key IN ('closeDate','closeDateMp')`);
    const settings: Record<string, string> = {};
    rows.forEach((r: any) => { settings[r.key] = r.value; });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const campaigns: { key: string; label: string }[] = [
      { key: 'closeDate',   label: 'Campagne Annuelle' },
      { key: 'closeDateMp', label: 'Campagne Mi-parcours' },
    ];

    for (const { key, label } of campaigns) {
      const closeVal = settings[key];
      if (!closeVal) continue;

      const closeDate = new Date(closeVal);
      closeDate.setHours(0, 0, 0, 0);

      const daysLeft = daysBetween(today, closeDate);

      if (REMINDER_DAYS.includes(daysLeft)) {
        await sendRemindersForCampaign(db, closeVal, label, daysLeft);
      }
    }
  } catch (err: any) {
    console.error('[REMINDER] Error:', err.message);
  }
}
