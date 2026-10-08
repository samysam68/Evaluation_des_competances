import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import nodemailer from 'nodemailer';
import * as ldap from 'ldapjs';
import { getDb } from '../database';
import { checkAndSendReminders } from '../services/reminder.service';
import { deduceRole, deduceEvalType, getField, buildNameIndex, resolveExistingUser, normalizeExcelDate } from '../utils/importHelpers';
import { syncFromExcel, DEFAULT_EXCEL_FILE } from '../services/excelSync.service';
import { syncFromRhApi } from '../services/rhApiSync.service';
import { requirePasswordChanged } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ dest: path.join(__dirname, '../../uploads/') });

// ─── Guard ────────────────────────────────────────────────────────────────────
function requireSuperAdmin(req: Request, res: Response, next: any) {
  const user = (req as any).user;
  if (!user || user.role !== 'SuperAdmin') {
    return res.status(403).json({ message: 'Accès réservé au Super Administrateur.' });
  }
  next();
}
router.use(requireSuperAdmin);

// La console SuperAdmin n'utilise pas la modale de première connexion (elle
// n'est affichée que par DashboardLayout, que /admin n'utilise pas) — son
// propre écran « Mon Profil » (/profile) est le seul moyen pour le SuperAdmin
// de changer son mot de passe. On ne bloque donc jamais cette route précise,
// pour ne pas enfermer le compte hors de portée de son propre changement de
// mot de passe.
router.use((req: Request, res: Response, next: any) => {
  if (req.path === '/profile') return next();
  return requirePasswordChanged(req, res, next);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getSetting(db: any, key: string): Promise<string | null> {
  const row = await db.get(`SELECT value FROM app_settings WHERE key = ?`, [key]);
  return row ? row.value : null;
}

async function setSetting(db: any, key: string, value: string) {
  await db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`, [key, value]);
}

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const totalUsers = await db.get(`SELECT COUNT(*) as n FROM users`);
    const activeUsers = await db.get(`SELECT COUNT(*) as n FROM users WHERE actif = 1`);
    const totalEvals = await db.get(`SELECT COUNT(*) as n FROM evaluations`);
    const roleBreakdown = await db.all(`SELECT role, COUNT(*) as n FROM users GROUP BY role ORDER BY n DESC`);
    const evalTypeBreakdown = await db.all(`SELECT evalType, COUNT(*) as n FROM users WHERE actif=1 AND evalType IS NOT NULL GROUP BY evalType`);
    const directionBreakdown = await db.all(`SELECT direction, COUNT(*) as n FROM users WHERE actif=1 AND direction IS NOT NULL AND direction != '' GROUP BY direction ORDER BY n DESC LIMIT 10`);
    const recentEvals = await db.all(`
      SELECT e.id, e.type, e.globalScore, e.createdAt, e.status,
             u.nom, u.prenom, u.poste, ev.nom as evalNom, ev.prenom as evalPrenom
      FROM evaluations e JOIN users u ON u.id = e.targetUserId JOIN users ev ON ev.id = e.evaluatorId
      ORDER BY e.createdAt DESC LIMIT 10
    `);
    const settings = await db.all(`SELECT key, value FROM app_settings`);
    const settingsMap: Record<string, string> = {};
    settings.forEach((s: any) => { settingsMap[s.key] = s.value; });

    res.json({
      totalUsers: totalUsers.n, activeUsers: activeUsers.n,
      inactiveUsers: totalUsers.n - activeUsers.n,
      totalEvals: totalEvals.n, roleBreakdown, evalTypeBreakdown,
      directionBreakdown, recentEvals, settings: settingsMap,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { search, role, actif, direction } = req.query;
    let query = `SELECT id, matricule, nom, prenom, activeDirectory, poste, role, categorie, evalType, direction, departement, email, actif, rhAccess, orgChartAccess FROM users WHERE 1=1`;
    const params: any[] = [];
    if (search) { query += ` AND (nom LIKE ? OR prenom LIKE ? OR activeDirectory LIKE ? OR matricule LIKE ? OR poste LIKE ?)`; const s = `%${search}%`; params.push(s,s,s,s,s); }
    if (role) { query += ` AND role = ?`; params.push(role); }
    if (actif !== undefined && actif !== '') { query += ` AND actif = ?`; params.push(Number(actif)); }
    if (direction) { query += ` AND direction = ?`; params.push(direction); }
    query += ` ORDER BY nom, prenom LIMIT 200`;
    const users = await db.all(query, params);
    const total = await db.get(`SELECT COUNT(*) as n FROM users`);
    const active = await db.get(`SELECT COUNT(*) as n FROM users WHERE actif = 1`);
    const inactive = await db.get(`SELECT COUNT(*) as n FROM users WHERE actif = 0`);
    const roles = await db.all(`SELECT role, COUNT(*) as n FROM users GROUP BY role ORDER BY n DESC`);
    const directions = await db.all(`SELECT DISTINCT direction FROM users WHERE direction IS NOT NULL AND direction != '' ORDER BY direction`);
    res.json({ users, stats: { total: total.n, active: active.n, inactive: inactive.n }, roles, directions: directions.map((d: any) => d.direction) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH /api/admin/users/:id/toggle ───────────────────────────────────────
router.patch('/users/:id/toggle', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const user = await db.get(`SELECT id, actif FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    const newActif = user.actif === 1 ? 0 : 1;
    await db.run(`UPDATE users SET actif = ? WHERE id = ?`, [newActif, req.params.id]);
    res.json({ success: true, actif: newActif });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/modules ───────────────────────────────────────────────────
// État des modules activables/désactivables par le SuperAdmin (V1.0)
router.get('/modules', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const fichePoste = await getSetting(db, 'module_fichePoste_enabled');
    const feedback = await getSetting(db, 'module_feedback_enabled');
    const orgchart = await getSetting(db, 'module_orgchart_enabled');
    res.json({
      fichePoste: fichePoste === '1',
      feedback: feedback !== '0', // actif par défaut tant qu'explicitement désactivé
      orgchart: orgchart === '1', // restreint par défaut tant qu'explicitement activé
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/modules ──────────────────────────────────────────────────
router.post('/modules', async (req: Request, res: Response) => {
  try {
    const { module, enabled } = req.body;
    const validModules = ['fichePoste', 'feedback', 'orgchart'];
    if (!validModules.includes(module) || typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'Paramètres invalides.' });
    }
    const db = await getDb();
    await setSetting(db, `module_${module}_enabled`, enabled ? '1' : '0');
    res.json({ success: true, module, enabled });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH /api/admin/users/:id/rh-access ─────────────────────────────────────
// Accorde/retire l'accès à l'espace RH à un utilisateur, indépendamment de son rôle.
router.patch('/users/:id/rh-access', async (req: Request, res: Response) => {
  try {
    const { rhAccess } = req.body;
    if (typeof rhAccess !== 'boolean') return res.status(400).json({ message: 'Paramètre invalide.' });
    const db = await getDb();
    const user = await db.get(`SELECT id FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    await db.run(`UPDATE users SET rhAccess = ? WHERE id = ?`, [rhAccess ? 1 : 0, req.params.id]);
    res.json({ success: true, rhAccess });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH /api/admin/users/:id/orgchart-access ───────────────────────────────
// Accorde/retire l'accès au module Organigramme à un utilisateur (module désormais
// restreint, et non plus ouvert à tous — le SuperAdmin y a toujours accès).
router.patch('/users/:id/orgchart-access', async (req: Request, res: Response) => {
  try {
    const { orgChartAccess } = req.body;
    if (typeof orgChartAccess !== 'boolean') return res.status(400).json({ message: 'Paramètre invalide.' });
    const db = await getDb();
    const user = await db.get(`SELECT id FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    await db.run(`UPDATE users SET orgChartAccess = ? WHERE id = ?`, [orgChartAccess ? 1 : 0, req.params.id]);
    res.json({ success: true, orgChartAccess });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH /api/admin/users/:id/role ─────────────────────────────────────────
router.patch('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { role } = req.body;
    const validRoles = ['SuperAdmin','Directeur','Manager','RH','Responsable','Superviseur','Gestionnaire','Employe'];
    if (!validRoles.includes(role)) return res.status(400).json({ message: 'Rôle invalide.' });
    await db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, req.params.id]);
    res.json({ success: true, message: `Rôle mis à jour : ${role}` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH /api/admin/users/:id/password ─────────────────────────────────────
// Un mot de passe réinitialisé par le SuperAdmin doit être changé par l'utilisateur
// dès sa prochaine connexion (mustChangePassword = 1), comme pour l'onboarding initial.
router.patch('/users/:id/password', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ message: 'Mot de passe trop court.' });
    const hashed = await bcrypt.hash(password, 10);
    await db.run(`UPDATE users SET password = ?, mustChangePassword = 1 WHERE id = ?`, [hashed, req.params.id]);
    res.json({ success: true, message: 'Mot de passe réinitialisé.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/users/password-bulk ─────────────────────────────────────
router.post('/users/password-bulk', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ message: 'Mot de passe trop court.' });
    const hashed = await bcrypt.hash(password, 10);
    const result = await db.run(`UPDATE users SET password = ?, mustChangePassword = 1 WHERE role != 'SuperAdmin'`, [hashed]);
    res.json({ success: true, message: `Mot de passe appliqué à tous les comptes.`, count: result.changes });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/users/:id ────────────────────────────────────────────────
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const user = await db.get(
      `SELECT id, matricule, nom, prenom, activeDirectory, email, poste, role, categorie, evalType,
              direction, departement, service, pole, actif,
              responsable1, responsable2, responsable3, dateRecrutement
       FROM users WHERE id = ?`, [req.params.id]
    );
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    res.json(user);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH /api/admin/users/:id/details ──────────────────────────────────────
router.patch('/users/:id/details', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const user = await db.get(`SELECT id, role FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    if (user.role === 'SuperAdmin') return res.status(403).json({ message: 'Impossible de modifier le Super Admin.' });

    const { nom, prenom, email, poste, direction, departement, service, pole, categorie, dateRecrutement, matricule, activeDirectory, responsable1, responsable2, responsable3, evalType, role } = req.body;

    const validRoles = ['Directeur','Manager','RH','Responsable','Superviseur','Gestionnaire','Employe'];
    if (role && !validRoles.includes(role)) return res.status(400).json({ message: 'Rôle invalide.' });

    await db.run(
      `UPDATE users SET
        nom = COALESCE(?, nom),
        prenom = COALESCE(?, prenom),
        email = ?,
        poste = ?,
        direction = ?,
        departement = ?,
        service = ?,
        pole = ?,
        categorie = ?,
        dateRecrutement = ?,
        matricule = ?,
        activeDirectory = COALESCE(NULLIF(?, ''), activeDirectory),
        responsable1 = ?,
        responsable2 = ?,
        responsable3 = ?,
        evalType = ?,
        role = COALESCE(NULLIF(?, ''), role)
      WHERE id = ?`,
      [nom, prenom, email, poste, direction, departement, service, pole, categorie, dateRecrutement, matricule, activeDirectory, responsable1, responsable2, responsable3, evalType, role, req.params.id]
    );

    const updated = await db.get(`SELECT id, matricule, nom, prenom, activeDirectory, poste, role, categorie, evalType, direction, departement, service, pole, email, actif, responsable1, responsable2, responsable3, dateRecrutement FROM users WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Informations mises à jour.', user: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /api/admin/users/:id ─────────────────────────────────────────────
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = Number(req.params.id);
    const user = await db.get(`SELECT role FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    if (user.role === 'SuperAdmin') return res.status(403).json({ message: 'Impossible de supprimer le Super Admin.' });
    // Nettoyage des données liées avant suppression (évite les références orphelines)
    await db.run(`DELETE FROM evaluations WHERE targetUserId = ? OR evaluatorId = ?`, [userId, userId]);
    await db.run(`DELETE FROM notifications WHERE userId = ?`, [userId]);
    await db.run(`DELETE FROM feedback_360 WHERE targetUserId = ? OR respondentId = ? OR requestedBy = ?`, [userId, userId, userId]);
    await db.run(`DELETE FROM delegations WHERE delegatedToUserId = ? OR delegatedByUserId = ?`, [userId, userId]);
    await db.run(`DELETE FROM users WHERE id = ?`, [userId]);
    res.json({ success: true, message: 'Compte et toutes ses données supprimés.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/settings ──────────────────────────────────────────────────
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.all(`SELECT key, value FROM app_settings`);
    const result: Record<string, string> = {};
    rows.forEach((r: any) => { result[r.key] = r.value; });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/settings ─────────────────────────────────────────────────
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { openDate, closeDate, openDateMp, closeDateMp, appName, apiUrl, apiKey } = req.body;
    if (openDate !== undefined) await setSetting(db, 'openDate', openDate);
    if (closeDate !== undefined) await setSetting(db, 'closeDate', closeDate);
    if (openDateMp !== undefined) await setSetting(db, 'openDateMp', openDateMp);
    if (closeDateMp !== undefined) await setSetting(db, 'closeDateMp', closeDateMp);
    if (appName !== undefined) await setSetting(db, 'appName', appName);
    if (apiUrl !== undefined) await setSetting(db, 'apiUrl', apiUrl);
    if (apiKey !== undefined) await setSetting(db, 'apiKey', apiKey);
    res.json({ success: true, message: 'Paramètres enregistrés.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/excel/preview ────────────────────────────────────────────
// Upload Excel, compare with DB, return diff (no changes applied yet)
router.post('/excel/preview', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier manquant.' });
  try {
    const db = await getDb();
    const wb = xlsx.readFile(req.file.path, { cellDates: true });
    const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
    fs.unlinkSync(req.file.path);

    // Build map of current users by matricule and activeDirectory
    const dbUsers = await db.all(`SELECT * FROM users WHERE role != 'SuperAdmin'`);
    const byMatricule: Record<string, any> = {};
    const byAD: Record<string, any> = {};
    dbUsers.forEach((u: any) => {
      if (u.matricule) byMatricule[u.matricule] = u;
      if (u.activeDirectory) byAD[u.activeDirectory.toLowerCase()] = u;
    });
    const byName = buildNameIndex(dbUsers);

    const toAdd: any[] = [];
    const toUpdate: any[] = [];
    const processedIds = new Set<number>();
    let idx = 0;

    for (const row of data) {
      idx++;
      const matricule = (getField(row, 'Matricule', 'Matricul') || '').toString().trim();
      let adUsername = (row['ActiveDirectory'] || '').toString().trim();
      const hadRealAD = !!adUsername && adUsername.toLowerCase() !== 'n/a' && adUsername.toLowerCase() !== 'na';
      if (!hadRealAD) {
        adUsername = `${row['Prenom']}.${row['Nom']}${idx}`.toLowerCase().replace(/\s+/g, '');
      }

      const categorie = row['Categorie'] || '';
      const poste = row['Poste'] || '';
      const actifRaw = row['Actif'];
      const actif = actifRaw === undefined ? 1 : (actifRaw === true || actifRaw === 'True' || actifRaw === 1 ? 1 : 0);
      const dateRecrutement = row['DateRecrutement'] instanceof Date
        ? normalizeExcelDate(row['DateRecrutement'])
        : (row['DateRecrutement'] ? normalizeExcelDate(new Date(row['DateRecrutement'])) : null);

      const newData = {
        matricule: matricule || null,
        nom: row['Nom'] || '',
        prenom: row['Prenom'] || '',
        actif,
        pole: row['Pole'] || null,
        direction: row['Direction'] || null,
        departement: row['Departement'] || null,
        service: row['Service'] || null,
        poste,
        activeDirectory: adUsername,
        responsable1: row['Responsable1'] || null,
        responsable2: row['Responsable2'] || null,
        responsable3: row['Responsable3'] || null,
        categorie,
        dateRecrutement,
        email: row['Email'] || null,
        role: deduceRole(categorie, poste),
        evalType: deduceEvalType(categorie),
      };

      // Try to find existing user
      let existing = resolveExistingUser({ byMatricule, byAD, byName, matricule, adUsername, hadRealAD, nom: newData.nom, prenom: newData.prenom });

      if (!existing) {
        toAdd.push({ ...newData, _adUsername: adUsername });
      } else {
        processedIds.add(existing.id);
        // Le matricule du fichier fait référence ; on ne l'écrase que s'il est renseigné.
        const comparable = { ...newData, matricule: newData.matricule || existing.matricule };
        const changed: string[] = [];
        const fieldsToCheck = ['matricule','nom','prenom','direction','departement','service','poste','categorie','role','evalType','actif','email'];
        for (const f of fieldsToCheck) {
          if ((existing[f] || '') !== ((comparable as any)[f] || '')) {
            changed.push(f);
          }
        }
        if (changed.length > 0) {
          toUpdate.push({ id: existing.id, current: existing, next: comparable, changed });
        }
      }
    }

    // Users in DB but not in Excel → would be deactivated
    const toDeactivate = dbUsers.filter((u: any) => !processedIds.has(u.id) && u.actif === 1);

    res.json({
      summary: {
        total: data.length,
        toAdd: toAdd.length,
        toUpdate: toUpdate.length,
        toDeactivate: toDeactivate.length,
      },
      toAdd: toAdd.slice(0, 50),
      toUpdate: toUpdate.slice(0, 50),
      toDeactivate: toDeactivate.slice(0, 50).map((u: any) => ({ id: u.id, nom: u.nom, prenom: u.prenom, poste: u.poste, activeDirectory: u.activeDirectory })),
    });
  } catch (err: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/admin/excel/apply ──────────────────────────────────────────────
// Re-upload Excel and apply all changes (full sync)
router.post('/excel/apply', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier manquant.' });
  try {
    const db = await getDb();
    const wb = xlsx.readFile(req.file.path, { cellDates: true });
    const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
    fs.unlinkSync(req.file.path);

    const { deactivateMissing } = req.body;

    const dbUsers = await db.all(`SELECT * FROM users WHERE role != 'SuperAdmin'`);
    const byMatricule: Record<string, any> = {};
    const byAD: Record<string, any> = {};
    dbUsers.forEach((u: any) => {
      if (u.matricule) byMatricule[u.matricule] = u;
      if (u.activeDirectory) byAD[u.activeDirectory.toLowerCase()] = u;
    });
    const byName = buildNameIndex(dbUsers);

    let added = 0, updated = 0, deactivated = 0;
    const processedIds = new Set<number>();
    let idx = 0;
    const defaultPassword = await bcrypt.hash('1234', 10);

    for (const row of data) {
      idx++;
      const matricule = (getField(row, 'Matricule', 'Matricul') || '').toString().trim();
      let adUsername = (row['ActiveDirectory'] || '').toString().trim();
      const hadRealAD = !!adUsername && adUsername.toLowerCase() !== 'n/a' && adUsername.toLowerCase() !== 'na';
      if (!hadRealAD) {
        adUsername = `${row['Prenom']}.${row['Nom']}${idx}`.toLowerCase().replace(/\s+/g, '');
      }
      const categorie = row['Categorie'] || '';
      const poste = row['Poste'] || '';
      const actifRaw = row['Actif'];
      const actif = actifRaw === undefined ? 1 : (actifRaw === true || actifRaw === 'True' || actifRaw === 1 ? 1 : 0);
      const dateRecrutement = row['DateRecrutement'] instanceof Date
        ? normalizeExcelDate(row['DateRecrutement'])
        : (row['DateRecrutement'] ? normalizeExcelDate(new Date(row['DateRecrutement'])) : null);

      const existing = resolveExistingUser({ byMatricule, byAD, byName, matricule, adUsername, hadRealAD, nom: row['Nom'] || '', prenom: row['Prenom'] || '' });

      if (!existing) {
        try {
          await db.run(`INSERT INTO users (matricule,nom,prenom,actif,pole,direction,departement,service,poste,activeDirectory,responsable1,responsable2,responsable3,categorie,dateRecrutement,email,role,evalType,password) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [matricule||null, row['Nom']||'', row['Prenom']||'', actif, row['Pole']||null, row['Direction']||null, row['Departement']||null, row['Service']||null, poste, adUsername, row['Responsable1']||null, row['Responsable2']||null, row['Responsable3']||null, categorie, dateRecrutement, row['Email']||null, deduceRole(categorie,poste), deduceEvalType(categorie), defaultPassword]);
          added++;
        } catch { /* skip duplicates */ }
      } else {
        processedIds.add(existing.id);
        await db.run(`UPDATE users SET nom=?,prenom=?,actif=?,pole=?,direction=?,departement=?,service=?,poste=?,responsable1=?,responsable2=?,responsable3=?,categorie=?,dateRecrutement=?,email=?,role=?,evalType=? WHERE id=?`,
          [row['Nom']||'', row['Prenom']||'', actif, row['Pole']||null, row['Direction']||null, row['Departement']||null, row['Service']||null, poste, row['Responsable1']||null, row['Responsable2']||null, row['Responsable3']||null, categorie, dateRecrutement, row['Email']||null, deduceRole(categorie,poste), deduceEvalType(categorie), existing.id]);
        updated++;
      }
    }

    if (deactivateMissing === 'true' || deactivateMissing === true) {
      const toDeactivate = dbUsers.filter((u: any) => !processedIds.has(u.id) && u.actif === 1);
      for (const u of toDeactivate) {
        await db.run(`UPDATE users SET actif = 0 WHERE id = ?`, [u.id]);
        deactivated++;
      }
    }

    await setSetting(db, 'lastExcelImport', new Date().toISOString());

    res.json({ success: true, added, updated, deactivated, message: `Synchronisation terminée : ${added} ajoutés, ${updated} mis à jour, ${deactivated} désactivés.` });
  } catch (err: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/admin/excel/refresh-live ───────────────────────────────────────
// Rafraîchit le fichier Excel « Collaborateurs Actualisable » (équivalent du
// bouton Données > Actualiser dans Excel — relance la requête Power Query vers
// la base RH source) puis synchronise immédiatement la base avec son contenu.
router.post('/excel/refresh-live', async (req: Request, res: Response) => {
  const deactivateMissing = req.body?.deactivateMissing === true;

  if (!fs.existsSync(DEFAULT_EXCEL_FILE)) {
    return res.status(404).json({ message: `Fichier introuvable : ${DEFAULT_EXCEL_FILE}` });
  }

  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'refresh-excel.ps1');

  // Tentative de rafraîchissement automatique (équivalent Données > Actualiser).
  // Ce pilotage d'Excel depuis un processus serveur n'est pas garanti par
  // Microsoft et peut échouer selon le contexte d'exécution : on lui laisse
  // un délai raisonnable, mais on ne bloque jamais la synchronisation en cas
  // d'échec — on se rabat alors sur le contenu actuel du fichier.
  const refresh = () => new Promise<{ ok: boolean; error?: string }>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Path', DEFAULT_EXCEL_FILE],
      { timeout: 35_000, windowsHide: true },
      (error, stdout, stderr) => {
        const out = (stdout || '').trim();
        if (error) {
          return resolve({
            ok: false,
            error: error.killed
              ? 'délai dépassé (35s)'
              : (out || stderr || error.message),
          });
        }
        if (out.startsWith('ERROR')) return resolve({ ok: false, error: out.replace(/^ERROR:\s*/, '') });
        resolve({ ok: true });
      }
    );
  });

  const refreshResult = await refresh();

  try {
    const result = await syncFromExcel({ apply: true, deactivateMissing });
    const base = refreshResult.ok
      ? `Fichier actualisé et synchronisé`
      : `Rafraîchissement automatique indisponible (${refreshResult.error}) — synchronisé à partir du fichier tel qu'il était sur le disque`;
    res.json({
      success: true,
      refreshed: refreshResult.ok,
      ...result,
      message: `${base} : ${result.added} ajouté(s), ${result.updated} mis à jour${deactivateMissing ? `, ${result.deactivated} désactivé(s)` : ''}.`,
    });
  } catch (err: any) {
    res.status(500).json({ message: `Échec de la synchronisation : ${err.message}` });
  }
});

// ─── POST /api/admin/excel/sync-api ──────────────────────────────────────────
// Synchronise la base à partir de l'API RH externe (lecture seule, jeton porteur).
router.post('/excel/sync-api', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const apiUrl = await getSetting(db, 'apiUrl');
    const apiKey = await getSetting(db, 'apiKey');
    if (!apiUrl) return res.status(400).json({ message: 'Aucune URL API configurée.' });

    const deactivateMissing = req.body?.deactivateMissing === true;

    const result = await syncFromRhApi({ apply: true, deactivateMissing, apiUrl, apiKey: apiKey || undefined });
    res.json({
      success: true,
      ...result,
      message: `${result.added} ajouté(s), ${result.updated} mis à jour${deactivateMissing ? `, ${result.deactivated} désactivé(s)` : ''}${result.failed ? `, ${result.failed} échec(s)` : ''}.`,
    });
  } catch (err: any) { res.status(500).json({ message: `Échec de la synchronisation : ${err.message}` }); }
});

// ─── GET /api/admin/profile ───────────────────────────────────────────────────
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).user.id;
    const user = await db.get(`SELECT id, nom, prenom, activeDirectory, email, poste, role FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ message: 'Profil non trouvé.' });
    res.json(user);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── PATCH /api/admin/profile ─────────────────────────────────────────────────
router.patch('/profile', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).user.id;
    const { email, currentPassword, newPassword } = req.body;
    if (email) await db.run(`UPDATE users SET email = ? WHERE id = ?`, [email, userId]);
    if (newPassword) {
      if (newPassword.length < 6) return res.status(400).json({ message: 'Mot de passe trop court (min 6 caractères).' });
      const user = await db.get(`SELECT password FROM users WHERE id = ?`, [userId]);
      if (user.password) {
        const match = await bcrypt.compare(currentPassword || '', user.password);
        if (!match) return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      await db.run(`UPDATE users SET password = ?, mustChangePassword = 0 WHERE id = ?`, [hashed, userId]);
    }
    res.json({ success: true, message: 'Profil mis à jour.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/admin/system/config ────────────────────────────────────────────
// Returns email + LDAP config (passwords masked)
router.get('/system/config', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.all(`SELECT key, value FROM app_settings WHERE key LIKE 'smtp_%' OR key LIKE 'ldap_%'`);
    const cfg: Record<string, string> = {};
    rows.forEach((r: any) => { cfg[r.key] = r.value; });
    // Mask passwords for transport
    const safe = { ...cfg };
    if (safe['smtp_password']) safe['smtp_password'] = '••••••••';
    if (safe['ldap_bindPassword']) safe['ldap_bindPassword'] = '••••••••';
    res.json(safe);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/system/email ─────────────────────────────────────────────
router.post('/system/email', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_tls, smtp_enabled } = req.body;
    const fields: Record<string, string> = { smtp_host, smtp_port, smtp_user, smtp_from, smtp_tls, smtp_enabled };
    if (smtp_password && smtp_password !== '••••••••') fields['smtp_password'] = smtp_password;
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) await setSetting(db, k, String(v));
    }
    res.json({ success: true, message: 'Configuration email enregistrée.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/system/email/test ────────────────────────────────────────
router.post('/system/email/test', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const host     = req.body.smtp_host     || await getSetting(db, 'smtp_host');
    const port     = Number(req.body.smtp_port || await getSetting(db, 'smtp_port') || 587);
    const user     = req.body.smtp_user     || await getSetting(db, 'smtp_user');
    const pass     = (req.body.smtp_password && req.body.smtp_password !== '••••••••')
                       ? req.body.smtp_password
                       : await getSetting(db, 'smtp_password');
    const from     = req.body.smtp_from     || await getSetting(db, 'smtp_from') || user;
    const testTo   = req.body.testTo || from;

    if (!host || !user || !pass) return res.status(400).json({ message: 'Configuration SMTP incomplète (host, user, password requis).' });

    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: `"Talents Admin" <${from}>`,
      to: testTo,
      subject: 'Test SMTP – Talents',
      html: `<p>Connexion SMTP vérifiée avec succès depuis <b>Talents · LDM GROUPE</b>.</p><p><small>Envoyé le ${new Date().toLocaleString('fr-FR')}</small></p>`,
    });

    res.json({ success: true, message: `Email de test envoyé à ${testTo}.` });
  } catch (err: any) { res.status(500).json({ message: `Erreur SMTP : ${err.message}` }); }
});

// ─── POST /api/admin/system/ldap ──────────────────────────────────────────────
router.post('/system/ldap', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { ldap_url, ldap_baseDn, ldap_bindDn, ldap_bindPassword, ldap_userFilter, ldap_enabled } = req.body;
    const fields: Record<string, string> = { ldap_url, ldap_baseDn, ldap_bindDn, ldap_userFilter, ldap_enabled };
    if (ldap_bindPassword && ldap_bindPassword !== '••••••••') fields['ldap_bindPassword'] = ldap_bindPassword;
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) await setSetting(db, k, String(v));
    }
    res.json({ success: true, message: 'Configuration LDAP enregistrée.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/system/ldap/test ────────────────────────────────────────
router.post('/system/ldap/test', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const url      = req.body.ldap_url      || await getSetting(db, 'ldap_url');
    const bindDn   = req.body.ldap_bindDn   || await getSetting(db, 'ldap_bindDn');
    const bindPass = (req.body.ldap_bindPassword && req.body.ldap_bindPassword !== '••••••••')
                       ? req.body.ldap_bindPassword
                       : await getSetting(db, 'ldap_bindPassword');
    const baseDn   = req.body.ldap_baseDn   || await getSetting(db, 'ldap_baseDn');

    if (!url) return res.status(400).json({ message: 'URL LDAP manquante.' });

    const result = await new Promise<{ success: boolean; message: string }>((resolve) => {
      const client = ldap.createClient({ url, connectTimeout: 5000, timeout: 5000 });
      client.on('error', (err: any) => {
        client.destroy();
        resolve({ success: false, message: `Connexion échouée : ${err.message}` });
      });
      if (bindDn && bindPass) {
        client.bind(bindDn, bindPass, (err: any) => {
          client.destroy();
          if (err) resolve({ success: false, message: `Bind échoué : ${err.message}` });
          else resolve({ success: true, message: `Connexion LDAP réussie — bind sur ${bindDn}${baseDn ? ` (base: ${baseDn})` : ''}.` });
        });
      } else {
        // Anonymous bind
        client.bind('', '', (err: any) => {
          client.destroy();
          if (err) resolve({ success: false, message: `Bind anonyme échoué : ${err.message}` });
          else resolve({ success: true, message: `Connexion LDAP anonyme réussie sur ${url}.` });
        });
      }
    });

    res.status(result.success ? 200 : 502).json(result);
  } catch (err: any) { res.status(500).json({ message: `Erreur : ${err.message}` }); }
});

// ─── POST /api/admin/reminders/test ──────────────────────────────────────────
router.post('/reminders/test', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    await checkAndSendReminders();
    res.json({ message: 'Vérification des rappels exécutée. Consultez les logs serveur pour le détail.' });
  } catch (err: any) {
    res.status(500).json({ message: `Erreur : ${err.message}` });
  }
});

// ─── Criteria defaults ────────────────────────────────────────────────────────
const DEFAULT_CRITERIA: Record<string, any> = {
  executions: {
    type: 'Exécutions',
    categories: [
      {
        title: 'Compétence comportementale : Savoir être',
        items: [
          { id: 'reactivity', label: 'Réactivité' },
          { id: 'autonomy', label: 'Autonomie' },
          { id: 'adaptation', label: 'Adaptation' },
          { id: 'discipline', label: 'Discipline, assiduité et régularité' },
          { id: 'assimilation', label: "Facilité d'assimilation des règles" },
          { id: 'teamwork', label: "Esprit d'équipe" },
          { id: 'communication', label: 'Communication' },
          { id: 'autres_comportement', label: 'Autres à définir' },
        ],
      },
      {
        title: 'Compétence Techniques : Savoir-faire',
        items: [
          { id: 'accuracy', label: 'Ordre, précision et respect des délais' },
        ],
      },
    ],
  },
  cadres: {
    type: 'Cadres & Maîtrises',
    categories: [
      {
        title: 'A. COMPÉTENCES PROFESSIONNELLES ET TECHNIQUES',
        items: [
          { id: 'savoir_faire', label: 'Connaissance des savoir-faire techniques', description: 'Connaissance des concepts de base et des principaux outils relatifs aux missions exercées' },
          { id: 'fiabilite', label: 'Fiabilité et qualité de son activité', description: 'Niveau de conformité des opérations réalisées' },
          { id: 'gestion_temps', label: 'Gestion du temps', description: 'Organisation de son temps de travail, ponctualité, assiduité' },
          { id: 'respect_consignes', label: 'Respect des consignes et/ou directives', description: "Ordre d'exécution, règlement intérieur, hygiène/sécurité, etc." },
          { id: 'respect_obligations', label: 'Respect des obligations statutaires', description: 'Devoir de réserve, discrétion, etc.' },
          { id: 'initiative', label: "Prise d'initiative", description: "Capacité à prendre seul des décisions permettant l'amélioration de son activité et de celle des autres" },
          { id: 'adaptabilite', label: 'Adaptabilité et disponibilité', description: 'Capacité à intégrer les évolutions conjoncturelles et/ou structurelles et à assurer la continuité du service' },
          { id: 'developpement_comp', label: 'Entretien et développement des compétences', description: 'Souci de la conservation et du développement de ses compétences professionnelles' },
          { id: 'efficacite', label: "Souci d'efficacité et de résultat", description: "Capacité à prendre en compte la finalité de son activité et à rechercher la qualité du service rendu" },
        ],
      },
      {
        title: 'B. COMPÉTENCES / QUALITÉS RELATIONNELLES',
        items: [
          { id: 'relation_hierarchie', label: 'Relation avec la hiérarchie', description: "Respect de la hiérarchie et des règles de courtoisie, rend compte de son activité" },
          { id: 'relation_collegues', label: 'Relation avec les collègues', description: 'Respect de ses collègues et des règles de courtoisie, écoute et prise en compte des autres, solidarité professionnelle' },
          { id: 'relation_public', label: 'Relation avec le public externe', description: 'Politesse, écoute, neutralité et équité' },
          { id: 'travail_equipe', label: "Capacité à travailler en équipe", description: 'Capacité à développer des relations positives et constructives, à faire circuler l\'information' },
        ],
      },
      {
        title: "C. QUALITÉS D'ENCADREMENT OU D'EXERCER DES FONCTIONS DE NIVEAU SUPÉRIEUR / EXPERTISE",
        items: [
          { id: 'accompagner_agents', label: 'Accompagner les agents', description: 'Capacité à écouter, comprendre et accompagner les ressources humaines' },
          { id: 'animer_equipe', label: 'Animer une équipe', description: 'Capacité à motiver et dynamiser un collectif de travail' },
          { id: 'gerer_conflits', label: 'Gérer les conflits', description: 'Capacité à prévenir, gérer et résoudre les situations de conflits' },
          { id: 'connaissance_reglementaire', label: 'Connaissance réglementaire', description: 'Connaissance du statut réglementaire et des instances représentatives' },
          { id: 'gerer_competences', label: 'Gérer les compétences', description: 'Capacité à gérer le potentiel de son équipe, à cerner les besoins en formations' },
          { id: 'prendre_decisions', label: 'Appliquer et prendre des décisions', description: 'Capacité à prendre des décisions' },
          { id: 'fixer_objectifs', label: 'Fixer des objectifs', description: 'Capacité à décliner les objectifs du service en objectifs individuels et à en évaluer les résultats' },
          { id: 'structurer_activite', label: "Structurer l'activité", description: 'Capacité à organiser le travail en distribuant individuellement les tâches à accomplir' },
          { id: 'deleguer', label: 'Déléguer', description: 'Capacité à partager avec les agents des tâches à responsabilité' },
          { id: 'superviser', label: 'Superviser et contrôler', description: 'Capacité à s\'assurer de la bonne réalisation des tâches et activités de l\'équipe' },
          { id: 'accompagner_changement', label: 'Accompagner le changement', description: "Capacité à accompagner les évolutions de son secteur" },
          { id: 'communiquer', label: 'Communiquer', description: 'Circulation ascendante et descendante de l\'information et communication au sein de l\'équipe' },
          { id: 'transversalite', label: 'Transversalité managériale', description: 'Dialogue et communication avec les autres managers de la structure' },
          { id: 'animer_reseau', label: 'Animer et développer un réseau', description: 'Capacité à rencontrer les acteurs de sa profession, à tisser des relations' },
          { id: 'gestion_projet', label: 'Gestion de projet', description: "Capacité à entreprendre avec méthode un projet aboutissant à la réalisation d'un service ou d'un produit fini" },
          { id: 'gestion_budgetaire', label: 'Gestion budgétaire', description: "Compréhension de l'environnement des ressources budgétaires applicables à l'activité" },
          { id: 'resolution_probleme', label: 'Adaptabilité et résolution de problème', description: 'Capacité à trouver des solutions pertinentes à des problèmes professionnels complexes' },
        ],
      },
    ],
  },
};

// ─── GET /api/admin/criteria/:type ────────────────────────────────────────────
router.get('/criteria/:type', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const key = `criteria_${req.params.type}`;
    const row = await db.get(`SELECT value FROM app_settings WHERE key = ?`, [key]);
    if (row?.value) {
      res.json(JSON.parse(row.value));
    } else {
      res.json(DEFAULT_CRITERIA[req.params.type] || null);
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/criteria/:type ───────────────────────────────────────────
router.post('/criteria/:type', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const key = `criteria_${req.params.type}`;
    await db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`, [key, JSON.stringify(req.body)]);
    res.json({ message: 'Critères sauvegardés.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /api/admin/criteria/:type/reset ───────────────────────────────────
router.delete('/criteria/:type/reset', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.run(`DELETE FROM app_settings WHERE key = ?`, [`criteria_${req.params.type}`]);
    res.json({ message: 'Critères réinitialisés aux valeurs par défaut.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TARIF JOURNALIER FORMATION — Formations demandées (externes)
// Formule officielle (RH, 06/09/2026) : Budget = tarif journalier × nombre de
// jours prévisionnels de la formation. Un tarif unique pour toutes les
// catégories (Exécutions / Cadre / Maîtrise) — pas de grille par catégorie.
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_TRAINING_DAILY_RATE = 15000;

// ─── GET /api/admin/training-daily-rate ───────────────────────────────────────
router.get('/training-daily-rate', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const row = await db.get(`SELECT value FROM app_settings WHERE key = 'training_daily_rate'`);
    res.json({ rate: row?.value ? Number(row.value) : DEFAULT_TRAINING_DAILY_RATE });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/admin/training-daily-rate ──────────────────────────────────────
router.post('/training-daily-rate', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { rate } = req.body;
    if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) {
      return res.status(400).json({ message: 'Le tarif doit être un nombre positif.' });
    }
    const db = await getDb();
    await db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('training_daily_rate', ?)`, [String(rate)]);
    res.json({ message: 'Tarif journalier sauvegardé.', rate });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /api/admin/training-daily-rate/reset ──────────────────────────────
router.delete('/training-daily-rate/reset', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.run(`DELETE FROM app_settings WHERE key = 'training_daily_rate'`);
    res.json({ message: 'Tarif journalier réinitialisé par défaut.', rate: DEFAULT_TRAINING_DAILY_RATE });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RGPD
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/rgpd/policy
router.get('/rgpd/policy', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const row = await db.get(`SELECT value FROM app_settings WHERE key = 'rgpd_retention_years'`);
    res.json({ retentionYears: row ? Number(row.value) : 5 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/rgpd/policy
router.post('/rgpd/policy', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { retentionYears } = req.body;
    const years = Math.max(1, Math.min(50, Number(retentionYears) || 5));
    await db.run(
      `INSERT INTO app_settings (key, value) VALUES ('rgpd_retention_years', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(years)]
    );
    res.json({ message: 'Politique de conservation enregistrée.', retentionYears: years });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/rgpd/users  — inactive users with their data age
router.get('/rgpd/users', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const policyRow = await db.get(`SELECT value FROM app_settings WHERE key = 'rgpd_retention_years'`);
    const retentionYears = policyRow ? Number(policyRow.value) : 5;
    const { filter = 'all' } = req.query;

    let whereClause = `u.actif = 0`;
    if (filter === 'expired')    whereClause += ` AND (julianday('now') - julianday(COALESCE(lastEval.createdAt, u.dateRecrutement, '2000-01-01'))) / 365.25 >= ${retentionYears}`;
    if (filter === 'anonymized') whereClause = `u.anonymized = 1`;
    if (filter === 'active')     whereClause = `u.actif = 1 AND u.anonymized = 0`;

    const users = await db.all(`
      SELECT
        u.id, u.nom, u.prenom, u.matricule, u.poste, u.direction, u.departement,
        u.email, u.actif, u.anonymized, u.anonymizedAt, u.dateRecrutement,
        COUNT(e.id) AS evalCount,
        MAX(e.createdAt) AS lastEvalAt,
        (julianday('now') - julianday(COALESCE(MAX(e.createdAt), u.dateRecrutement, '2000-01-01'))) / 365.25 AS dataAgeYears
      FROM users u
      LEFT JOIN evaluations e ON e.targetUserId = u.id
      LEFT JOIN (SELECT targetUserId, MAX(createdAt) as createdAt FROM evaluations GROUP BY targetUserId) lastEval ON lastEval.targetUserId = u.id
      WHERE ${whereClause}
      GROUP BY u.id
      ORDER BY dataAgeYears DESC
    `);

    res.json({
      users: users.map((u: any) => ({
        ...u,
        dataAgeYears: u.dataAgeYears ? Math.round(u.dataAgeYears * 10) / 10 : null,
        expired: u.dataAgeYears >= retentionYears,
      })),
      retentionYears,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/rgpd/anonymize/:userId
router.post('/rgpd/anonymize/:userId', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = Number(req.params.userId);
    const actor = (req as any).user;

    const user = await db.get(`SELECT id, nom, prenom, email, actif, anonymized FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    if (user.anonymized) return res.status(400).json({ message: 'Cet utilisateur est déjà anonymisé.' });

    const snapshot = `${user.nom} ${user.prenom}`.trim();
    const anonId = `ANON_${userId}`;

    await db.run(`
      UPDATE users SET
        nom = 'Anonymisé', prenom = '', email = NULL,
        activeDirectory = ?, matricule = ?,
        responsable1 = '', responsable2 = '', responsable3 = '',
        anonymized = 1, anonymizedAt = datetime('now')
      WHERE id = ?
    `, [anonId, anonId, userId]);

    // Anonymiser les champs libres des évaluations (RGPD Art. 17)
    await db.run(
      `UPDATE evaluations SET
         strengths = NULL, weaknesses = NULL, trainingNeeds = NULL,
         recommendation = NULL, otherData = NULL, rhComment = NULL
       WHERE targetUserId = ?`,
      [userId]
    );
    // Anonymiser les logs d'historique
    await db.run(
      `UPDATE history_logs SET target = 'Anonymisé' WHERE target = ?`,
      [snapshot]
    );

    await db.run(`
      INSERT INTO rgpd_audit_log (action, targetUserId, targetNameSnapshot, performedBy, performedByName, details)
      VALUES ('anonymize', ?, ?, ?, ?, ?)
    `, [userId, snapshot, actor.id, `${actor.nom || ''} ${actor.prenom || ''}`.trim(), `Anonymisation RGPD — données personnelles effacées`]);

    return res.json({ message: `Les données personnelles de "${snapshot}" ont été anonymisées.` });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/rgpd/delete/:userId
router.delete('/rgpd/delete/:userId', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = Number(req.params.userId);
    const actor = (req as any).user;

    const user = await db.get(`SELECT id, nom, prenom, actif FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
    if (user.actif) return res.status(400).json({ message: 'Impossible de supprimer un utilisateur actif. Désactivez-le d\'abord.' });

    const snapshot = `${user.nom} ${user.prenom}`.trim();
    const evalCount = (await db.get(`SELECT COUNT(*) as c FROM evaluations WHERE targetUserId = ?`, [userId]))?.c ?? 0;

    await db.run(`DELETE FROM evaluations WHERE targetUserId = ?`, [userId]);
    await db.run(`DELETE FROM notifications WHERE userId = ?`, [userId]);
    await db.run(`DELETE FROM feedback_360 WHERE targetUserId = ? OR respondentId = ? OR requestedBy = ?`, [userId, userId, userId]);
    await db.run(`DELETE FROM delegations WHERE targetUserId = ? OR delegatedToUserId = ?`, [userId, userId]);
    await db.run(`DELETE FROM users WHERE id = ?`, [userId]);

    await db.run(`
      INSERT INTO rgpd_audit_log (action, targetUserId, targetNameSnapshot, performedBy, performedByName, details)
      VALUES ('delete', ?, ?, ?, ?, ?)
    `, [userId, snapshot, actor.id, `${actor.nom || ''} ${actor.prenom || ''}`.trim(),
       `Suppression définitive — ${evalCount} évaluation(s) supprimée(s)`]);

    return res.json({ message: `L'utilisateur "${snapshot}" et toutes ses données (${evalCount} évaluation(s)) ont été supprimés définitivement.` });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

// GET /api/admin/rgpd/audit-log
router.get('/rgpd/audit-log', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const logs = await db.all(`
      SELECT * FROM rgpd_audit_log ORDER BY performedAt DESC LIMIT 100
    `);
    res.json(logs);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
