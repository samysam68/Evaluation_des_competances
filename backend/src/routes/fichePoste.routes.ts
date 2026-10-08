import { Router, Request, Response } from 'express';
import { getDb } from '../database';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Module désactivable par le SuperAdmin (désactivé par défaut en V1.0).
// Le SuperAdmin garde l'accès pour pouvoir réactiver/administrer le module.
router.use(async (req: Request, res: Response, next) => {
  const user = (req as any).user;
  if (user?.role === 'SuperAdmin') return next();
  try {
    const db = await getDb();
    const row = await db.get(`SELECT value FROM app_settings WHERE key = 'module_fichePoste_enabled'`);
    if (row?.value === '1') return next();
  } catch { /* fall through to 403 */ }
  return res.status(403).json({ message: 'Le module Fiche de Poste est désactivé. Contactez le Super Administrateur.' });
});

// ── Multer — upload fiches PDF ────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'fiches');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, _file, cb) => {
    cb(null, `fiche_emp_${req.params.userId}_${Date.now()}.pdf`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Seuls les fichiers PDF sont acceptés.'));
  },
});

const JSON_FIELDS = [
  'activitesPrincipales', 'activitesSecondaires', 'tachesInterimaires',
  'relationsInternes', 'relationsExternes',
  'activitesSMI', 'autorites',
  'competencesTechniques', 'savoirFaire', 'competencesComportementales', 'savoirEtre',
  'langues', 'outils', 'indicateursPerformance', 'exigencesParticulieres',
];

function parseRow(row: any) {
  if (!row) return null;
  const parsed = { ...row };
  for (const f of JSON_FIELDS) {
    try { parsed[f] = JSON.parse(parsed[f] || '[]'); } catch { parsed[f] = []; }
  }
  return parsed;
}

function serializeBody(body: any) {
  const out: any = { ...body };
  for (const f of JSON_FIELDS) {
    if (out[f] !== undefined) {
      out[f] = typeof out[f] === 'string' ? out[f] : JSON.stringify(out[f] ?? []);
    }
  }
  return out;
}

// ── Helper : enrichir caller depuis la DB (JWT ne contient que id/role) ───────
async function getCallerFull(caller: any, db: any) {
  const row = await db.get(
    `SELECT nom, prenom, direction, departement FROM users WHERE id = ?`, [caller.id]
  );
  return { ...caller, ...row };
}

// ── Helper : log dans history_logs ───────────────────────────────────────────
async function logFiche(db: any, caller: any, action: string, target: string, toTarget?: string) {
  const full = await getCallerFull(caller, db);
  await db.run(`
    INSERT INTO history_logs (actorId, actorName, actorRole, department, type, action, target, toTarget)
    VALUES (?,?,?,?,?,?,?,?)
  `, [full.id, `${full.prenom || ''} ${full.nom || ''}`.trim(), full.role,
      full.departement || full.direction || '', 'FICHE_POSTE', action, target, toTarget || null]);
}

// Niveau hiérarchique pour la règle : on ne peut écrire la fiche que d'un INFÉRIEUR
const ROLE_LEVEL: Record<string, number> = {
  SuperAdmin: 99,
  Directeur: 4,
  Manager: 3,
  RH: 3,
  Responsable: 2,
  Superviseur: 2,
  Gestionnaire: 1,
  Employe: 0,
};

// ── Helper : vérifier si caller peut gérer la fiche d'un employé ─────────────
async function canManageTeamFiche(caller: any, targetUserId: number, db: any): Promise<boolean> {
  if (caller.role === 'SuperAdmin') return true;
  // RH : ne peut pas créer/modifier, seulement voir et valider
  if (caller.role === 'RH') return false;
  const callerFull = await getCallerFull(caller, db);
  const target     = await db.get(`SELECT direction, departement, role FROM users WHERE id = ?`, [targetUserId]);
  if (!target || !callerFull) return false;

  // Règle hiérarchique : impossible de rédiger la fiche de quelqu'un d'égal ou supérieur
  const callerLevel = ROLE_LEVEL[caller.role] ?? 0;
  const targetLevel = ROLE_LEVEL[target.role]  ?? 0;
  if (targetLevel >= callerLevel) return false;

  if (['Directeur', 'Manager'].includes(caller.role)) {
    // Filtrage par departement (le champ précis de l'équipe)
    return target.departement === callerFull.departement;
  }
  if (caller.role === 'Responsable') {
    const deleg = await db.get(`
      SELECT d.id FROM fiche_poste_delegations d
      WHERE d.delegatedTo = ? AND d.revokedAt IS NULL
        AND d.departement = ?
    `, [caller.id, target.departement]);
    return Boolean(deleg);
  }
  return false;
}

// ── GET /api/fiche-poste — liste toutes les fiches ────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role)) {
      return res.status(403).json({ message: 'Réservé aux RH.' });
    }
    const db = await getDb();
    const rows = await db.all(`
      SELECT fp.*, u.nom AS createdByNom, u.prenom AS createdByPrenom
      FROM fiches_poste fp
      LEFT JOIN users u ON u.id = fp.createdBy
      ORDER BY fp.updatedAt DESC
    `);
    res.json(rows.map(parseRow));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/my — fiche de l'utilisateur connecté ────────────────
router.get('/my', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const db = await getDb();
    const user = await db.get(`SELECT fichePosteId FROM users WHERE id = ?`, [caller.id]);
    if (!user?.fichePosteId) return res.status(404).json({ message: 'Aucune fiche de poste assignée.' });
    const row = await db.get(`SELECT * FROM fiches_poste WHERE id = ?`, [user.fichePosteId]);
    res.json(parseRow(row));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/team — fiches de l'équipe (manager/directeur/responsable délégué) ──
// Règle : on n'affiche que les membres dont le rôle est INFÉRIEUR au caller (pas d'égal, pas de supérieur)
router.get('/team', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const db = await getDb();
    let rows: any[] = [];

    // Rôles à exclure selon le niveau du caller
    // Directeur (4) : exclut SuperAdmin(99) et autres Directeurs(4)
    // Manager   (3) : exclut SuperAdmin, Directeur, Manager, RH (même niveau 3)
    // Responsable(2): exclut SuperAdmin, Directeur, Manager, RH, Responsable
    const excludedByRole: Record<string, string[]> = {
      Directeur:   ['SuperAdmin', 'Directeur'],
      Manager:     ['SuperAdmin', 'Directeur', 'Manager', 'RH'],
      Responsable: ['SuperAdmin', 'Directeur', 'Manager', 'RH', 'Responsable'],
    };

    if (['Directeur', 'Manager'].includes(caller.role)) {
      const callerFull = await getCallerFull(caller, db);
      if (!callerFull.departement) return res.json([]);
      const excluded = excludedByRole[caller.role] ?? [];
      const notIn = excluded.map(() => '?').join(',');
      rows = await db.all(`
        SELECT u.id, u.matricule, u.nom, u.prenom, u.poste, u.direction, u.departement, u.service,
               u.fichePosteId, u.fichePosteFile, fp.intitule AS ficheIntitule, fp.ficheStatus, fp.validationComment
        FROM users u LEFT JOIN fiches_poste fp ON fp.id = u.fichePosteId
        WHERE u.actif = 1 AND u.departement = ? AND u.id != ? AND u.role NOT IN (${notIn})
        ORDER BY u.nom, u.prenom`,
        [callerFull.departement, caller.id, ...excluded]);

    } else if (caller.role === 'Responsable') {
      const delgs = await db.all(`SELECT departement FROM fiche_poste_delegations WHERE delegatedTo = ? AND revokedAt IS NULL AND departement IS NOT NULL`, [caller.id]);
      if (delgs.length === 0) return res.json([]);
      const conditions = delgs.map((_: any) => `u.departement = ?`).join(' OR ');
      const deptParams = delgs.map((d: any) => d.departement);
      const excluded = excludedByRole['Responsable'];
      const notIn = excluded.map(() => '?').join(',');
      rows = await db.all(`
        SELECT u.id, u.matricule, u.nom, u.prenom, u.poste, u.direction, u.departement, u.service,
               u.fichePosteId, u.fichePosteFile, fp.intitule AS ficheIntitule, fp.ficheStatus, fp.validationComment
        FROM users u LEFT JOIN fiches_poste fp ON fp.id = u.fichePosteId
        WHERE u.actif = 1 AND (${conditions}) AND u.id != ? AND u.role NOT IN (${notIn})
        ORDER BY u.departement, u.nom, u.prenom`,
        [...deptParams, caller.id, ...excluded]);
    }
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/pending-validation — fiches soumises au RH ───────────
router.get('/pending-validation', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role)) return res.status(403).json({ message: 'Réservé aux RH.' });
    const db = await getDb();
    const rows = await db.all(`
      SELECT fp.id, fp.intitule, fp.ficheStatus, fp.createdAt, fp.updatedAt,
             u.id AS employeeId, u.nom, u.prenom, u.poste, u.departement, u.direction,
             cu.nom AS createdByNom, cu.prenom AS createdByPrenom, cu.role AS createdByRole
      FROM fiches_poste fp
      JOIN users u ON u.fichePosteId = fp.id
      LEFT JOIN users cu ON cu.id = fp.createdBy
      WHERE fp.ficheStatus = 'soumis_rh'
      ORDER BY fp.updatedAt DESC`);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/delegations — délégations actives du caller ──────────
router.get('/delegations', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const db = await getDb();
    let rows;
    if (['RH', 'SuperAdmin'].includes(caller.role)) {
      rows = await db.all(`
        SELECT d.*, ub.nom AS byNom, ub.prenom AS byPrenom,
               ut.nom AS toNom, ut.prenom AS toPrenom, ut.poste AS toPoste
        FROM fiche_poste_delegations d
        JOIN users ub ON ub.id = d.delegatedBy
        JOIN users ut ON ut.id = d.delegatedTo
        WHERE d.revokedAt IS NULL ORDER BY d.createdAt DESC`);
    } else {
      rows = await db.all(`
        SELECT d.*, ub.nom AS byNom, ub.prenom AS byPrenom,
               ut.nom AS toNom, ut.prenom AS toPrenom, ut.poste AS toPoste
        FROM fiche_poste_delegations d
        JOIN users ub ON ub.id = d.delegatedBy
        JOIN users ut ON ut.id = d.delegatedTo
        WHERE d.revokedAt IS NULL AND (d.delegatedBy = ? OR d.delegatedTo = ?)
        ORDER BY d.createdAt DESC`, [caller.id, caller.id]);
    }
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/employees-status — tous les employés + statut fiche ──
router.get('/employees-status', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role)) {
      return res.status(403).json({ message: 'Réservé aux RH.' });
    }
    const db = await getDb();
    const rows = await db.all(`
      SELECT u.id, u.matricule, u.nom, u.prenom, u.poste, u.direction, u.departement, u.service,
             u.fichePosteId, u.fichePosteFile, fp.intitule AS ficheIntitule, fp.ficheStatus,
             fp.validationComment
      FROM users u
      LEFT JOIN fiches_poste fp ON fp.id = u.fichePosteId
      WHERE u.actif = 1
      ORDER BY u.departement, u.nom, u.prenom
    `);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/fiche-poste/upload/:userId — upload PDF fiche de poste ─────────
router.post('/upload/:userId', (req: Request, res: Response) => {
  const caller = (req as any).user;
  if (!['RH', 'SuperAdmin'].includes(caller.role)) {
    return res.status(403).json({ message: 'Réservé aux RH.' });
  }
  upload.single('file')(req, res, async (err: any) => {
    if (err) return res.status(400).json({ message: err.message || 'Erreur upload.' });
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
    try {
      const db = await getDb();
      // Supprimer l'ancien fichier si existant
      const existing = await db.get(`SELECT fichePosteFile FROM users WHERE id = ?`, [req.params.userId]);
      if (existing?.fichePosteFile) {
        const oldPath = path.join(uploadDir, existing.fichePosteFile);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await db.run(`UPDATE users SET fichePosteFile = ? WHERE id = ?`, [req.file.filename, req.params.userId]);
      res.json({ filename: req.file.filename, message: 'Fiche PDF uploadée.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
});

// ── DELETE /api/fiche-poste/remove-file/:userId — supprimer le PDF ────────────
router.delete('/remove-file/:userId', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role)) {
      return res.status(403).json({ message: 'Réservé aux RH.' });
    }
    const db = await getDb();
    const user = await db.get(`SELECT fichePosteFile FROM users WHERE id = ?`, [req.params.userId]);
    if (user?.fichePosteFile) {
      const filePath = path.join(uploadDir, user.fichePosteFile);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.run(`UPDATE users SET fichePosteFile = NULL WHERE id = ?`, [req.params.userId]);
    res.json({ message: 'Fichier supprimé.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/download/:userId — servir le PDF ─────────────────────
router.get('/download/:userId', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const managerRoles = ['RH', 'SuperAdmin', 'Directeur', 'Manager', 'Responsable'];
    if (!managerRoles.includes(caller.role) && caller.id !== Number(req.params.userId)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }
    const db = await getDb();
    const user = await db.get(`SELECT fichePosteFile, nom, prenom FROM users WHERE id = ?`, [req.params.userId]);
    if (!user?.fichePosteFile) return res.status(404).json({ message: 'Aucun fichier PDF.' });
    const filePath = path.join(uploadDir, user.fichePosteFile);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Fichier introuvable sur le serveur.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="FichePoste_${user.nom}_${user.prenom}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/:id ──────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const managerRoles = ['RH', 'SuperAdmin', 'Directeur', 'Manager', 'Responsable'];
    const db = await getDb();
    const row = await db.get(`
      SELECT fp.*, u.nom AS createdByNom, u.prenom AS createdByPrenom
      FROM fiches_poste fp
      LEFT JOIN users u ON u.id = fp.createdBy
      WHERE fp.id = ?
    `, [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Fiche de poste introuvable.' });
    // Managers peuvent toujours lire ; pour un employé, vérifier que la fiche lui est assignée
    if (!managerRoles.includes(caller.role)) {
      const assigned = await db.get(`SELECT id FROM users WHERE fichePosteId = ? AND id = ?`, [req.params.id, caller.id]);
      if (!assigned) return res.status(403).json({ message: 'Accès refusé.' });
    }
    res.json(parseRow(row));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/by-employee/:userId ──────────────────────────────────
router.get('/by-employee/:userId', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const managerRoles = ['RH', 'SuperAdmin', 'Directeur', 'Manager', 'Responsable'];
    if (!managerRoles.includes(caller.role) && caller.id !== Number(req.params.userId)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }
    const db = await getDb();
    const user = await db.get(`SELECT fichePosteId FROM users WHERE id = ?`, [req.params.userId]);
    if (!user?.fichePosteId) return res.status(404).json({ message: 'Aucune fiche de poste assignée.' });
    const row = await db.get(`SELECT * FROM fiches_poste WHERE id = ?`, [user.fichePosteId]);
    res.json(parseRow(row));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/fiche-poste — créer une fiche ──────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const allowedRoles = ['RH', 'SuperAdmin', 'Directeur', 'Manager', 'Responsable'];
    if (!allowedRoles.includes(caller.role)) {
      return res.status(403).json({ message: 'Permission insuffisante pour créer une fiche de poste.' });
    }
    // Responsable : doit avoir une délégation active
    if (caller.role === 'Responsable') {
      const db2 = await getDb();
      const hasDeleg = await db2.get(`SELECT id FROM fiche_poste_delegations WHERE delegatedTo = ? AND revokedAt IS NULL`, [caller.id]);
      if (!hasDeleg) return res.status(403).json({ message: 'Aucune délégation active pour créer une fiche de poste.' });
    }
    const db = await getDb();
    const b = serializeBody(req.body);

    if (!b.intitule?.trim()) return res.status(400).json({ message: 'L\'intitulé du poste est requis.' });

    const result = await db.run(`
      INSERT INTO fiches_poste (
        intitule, direction, departement, service, localisation, statut, categorie,
        coefficient, reference, rattachementHierarchique,
        codePosition, codeSysteme, versionFichePoste, dateCreation, subordonneesDirect,
        missionPrincipale, activitesPrincipales, activitesSecondaires, tachesInterimaires,
        relationsInternes, relationsExternes,
        activitesSMI, autorites,
        formationRequise, specialite, experienceRequise, autreQualite,
        competencesTechniques, savoirFaire, competencesComportementales, savoirEtre,
        langues, outils,
        conditionsParticulieres, exigencesParticulieres, indicateursPerformance,
        createdBy, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `, [
      b.intitule, b.direction, b.departement, b.service,
      b.localisation || 'LDM Groupe — Alger',
      b.statut, b.categorie, b.coefficient, b.reference,
      b.rattachementHierarchique,
      b.codePosition, b.codeSysteme, b.versionFichePoste || '01',
      b.dateCreation, b.subordonneesDirect || 'NA',
      b.missionPrincipale,
      b.activitesPrincipales || '[]', b.activitesSecondaires || '[]', b.tachesInterimaires || '[]',
      b.relationsInternes || '[]', b.relationsExternes || '[]',
      b.activitesSMI || '[]', b.autorites || '[]',
      b.formationRequise, b.specialite, b.experienceRequise, b.autreQualite,
      b.competencesTechniques || '[]', b.savoirFaire || '[]',
      b.competencesComportementales || '[]', b.savoirEtre || '[]',
      b.langues || '[]', b.outils || '[]',
      b.conditionsParticulieres, b.exigencesParticulieres || '[]',
      b.indicateursPerformance || '[]',
      caller.id,
    ]);

    await logFiche(db, caller, 'CREER', b.intitule || 'Sans titre');
    res.status(201).json({ id: result.lastID, message: 'Fiche de poste créée.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/fiche-poste/:id/submit — soumettre au RH ─────────────────────
router.patch('/:id/submit', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const db = await getDb();
    const fiche = await db.get(`SELECT * FROM fiches_poste WHERE id = ?`, [req.params.id]);
    if (!fiche) return res.status(404).json({ message: 'Fiche introuvable.' });
    // Seul le créateur ou un manager de l'équipe peut soumettre
    const assigned = await db.get(`SELECT id, nom, prenom FROM users WHERE fichePosteId = ?`, [req.params.id]);
    const canManage = assigned
      ? await canManageTeamFiche(caller, assigned.id, db)
      : fiche.createdBy === caller.id;
    if (!canManage) return res.status(403).json({ message: 'Permission insuffisante.' });
    if (fiche.ficheStatus === 'valide') return res.status(400).json({ message: 'Une fiche validée ne peut pas être resoumise.' });
    await db.run(`UPDATE fiches_poste SET ficheStatus = 'soumis_rh', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    const empName = assigned ? `${assigned.prenom} ${assigned.nom}` : fiche.intitule;
    await logFiche(db, caller, 'SOUMETTRE', empName, `Fiche "${fiche.intitule}" soumise pour validation RH`);
    res.json({ message: 'Fiche soumise pour validation RH.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/fiche-poste/:id/validate — validation RH ─────────────────────
router.patch('/:id/validate', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role)) return res.status(403).json({ message: 'Réservé aux RH.' });
    const db = await getDb();
    const fiche = await db.get(`SELECT * FROM fiches_poste WHERE id = ?`, [req.params.id]);
    if (!fiche) return res.status(404).json({ message: 'Fiche introuvable.' });
    const { comment } = req.body;
    await db.run(`UPDATE fiches_poste SET ficheStatus = 'valide', validatedBy = ?, validatedAt = CURRENT_TIMESTAMP, validationComment = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [caller.id, comment || null, req.params.id]);
    const emp = await db.get(`SELECT nom, prenom FROM users WHERE fichePosteId = ?`, [req.params.id]);
    const empName = emp ? `${emp.prenom} ${emp.nom}` : fiche.intitule;
    await logFiche(db, caller, 'VALIDER', empName, `Fiche "${fiche.intitule}" validée${comment ? ` — ${comment}` : ''}`);
    res.json({ message: 'Fiche validée.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/fiche-poste/:id/reject — rejet RH ────────────────────────────
router.patch('/:id/reject', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role)) return res.status(403).json({ message: 'Réservé aux RH.' });
    const db = await getDb();
    const fiche = await db.get(`SELECT * FROM fiches_poste WHERE id = ?`, [req.params.id]);
    if (!fiche) return res.status(404).json({ message: 'Fiche introuvable.' });
    const { comment } = req.body;
    if (!comment?.trim()) return res.status(400).json({ message: 'Un commentaire est requis pour rejeter.' });
    await db.run(`UPDATE fiches_poste SET ficheStatus = 'rejete', validationComment = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [comment, req.params.id]);
    const emp = await db.get(`SELECT nom, prenom FROM users WHERE fichePosteId = ?`, [req.params.id]);
    const empName = emp ? `${emp.prenom} ${emp.nom}` : fiche.intitule;
    await logFiche(db, caller, 'REJETER', empName, `Fiche "${fiche.intitule}" rejetée — ${comment}`);
    res.json({ message: 'Fiche rejetée.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/fiche-poste/delegate — créer une délégation ────────────────────
router.post('/delegate', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['Directeur', 'Manager', 'RH', 'SuperAdmin'].includes(caller.role)) {
      return res.status(403).json({ message: 'Seuls les Managers et Directeurs peuvent déléguer.' });
    }
    const { delegatedToId, direction, departement } = req.body;
    if (!delegatedToId) return res.status(400).json({ message: 'delegatedToId requis.' });
    const db = await getDb();
    const target = await db.get(`SELECT id, nom, prenom, role FROM users WHERE id = ?`, [delegatedToId]);
    if (!target) return res.status(404).json({ message: 'Utilisateur cible introuvable.' });
    // Vérifier que la délégation n'existe pas déjà
    const existing = await db.get(`SELECT id FROM fiche_poste_delegations WHERE delegatedBy = ? AND delegatedTo = ? AND revokedAt IS NULL`, [caller.id, delegatedToId]);
    if (existing) return res.status(400).json({ message: 'Délégation déjà active pour cet utilisateur.' });
    const callerFull = await getCallerFull(caller, db);
    // On stocke le departement (précis) comme scope de la délégation
    const scopeDept = departement || callerFull.departement || null;
    const result = await db.run(`INSERT INTO fiche_poste_delegations (delegatedBy, delegatedTo, direction, departement) VALUES (?,?,?,?)`,
      [caller.id, delegatedToId, callerFull.direction || null, scopeDept]);
    await logFiche(db, caller, 'DELEGUER', `${target.prenom} ${target.nom}`, `Délégation création fiche de poste accordée (${scopeDept || callerFull.direction})`);
    res.status(201).json({ id: result.lastID, message: `Délégation accordée à ${target.prenom} ${target.nom}.` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/fiche-poste/delegate/:delegationId — révoquer une délégation ─
router.delete('/delegate/:delegationId', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const db = await getDb();
    const deleg = await db.get(`
      SELECT d.*, ut.nom AS toNom, ut.prenom AS toPrenom
      FROM fiche_poste_delegations d JOIN users ut ON ut.id = d.delegatedTo
      WHERE d.id = ?`, [req.params.delegationId]);
    if (!deleg) return res.status(404).json({ message: 'Délégation introuvable.' });
    if (deleg.delegatedBy !== caller.id && !['RH', 'SuperAdmin'].includes(caller.role)) {
      return res.status(403).json({ message: 'Seul le délégant peut révoquer.' });
    }
    await db.run(`UPDATE fiche_poste_delegations SET revokedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.delegationId]);
    await logFiche(db, caller, 'DELEGATION_REVOQUEE', `${deleg.toPrenom} ${deleg.toNom}`, 'Délégation création fiche de poste révoquée');
    res.json({ message: 'Délégation révoquée.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/fiche-poste/:id — modifier une fiche ──────────────────────────
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const db = await getDb();
    const existing = await db.get(`SELECT id, createdBy, ficheStatus FROM fiches_poste WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ message: 'Fiche introuvable.' });
    if (existing.ficheStatus === 'valide' && caller.role !== 'SuperAdmin') {
      return res.status(409).json({ message: 'Une fiche validée ne peut plus être modifiée.' });
    }
    // SuperAdmin → toujours autorisé
    // RH → peut modifier seulement les fiches d'employés de son département
    // Directeur/Manager/Responsable → s'ils sont le créateur OU peuvent gérer l'équipe de l'employé assigné
    if (caller.role !== 'SuperAdmin') {
      const assigned = await db.get(`SELECT id FROM users WHERE fichePosteId = ?`, [req.params.id]);
      if (caller.role === 'RH') {
        if (assigned) {
          const callerFull = await getCallerFull(caller, db);
          const targetUser = await db.get(`SELECT departement FROM users WHERE id = ?`, [assigned.id]);
          if (targetUser?.departement !== callerFull.departement) {
            return res.status(403).json({ message: 'Les RH ne peuvent modifier que les fiches de leur département.' });
          }
        }
      } else {
        const isCreator = existing.createdBy === caller.id;
        const canManage = assigned ? await canManageTeamFiche(caller, assigned.id, db) : false;
        if (!isCreator && !canManage) {
          return res.status(403).json({ message: 'Permission insuffisante pour modifier cette fiche.' });
        }
      }
    }

    const b = serializeBody(req.body);
    const fields = [
      'intitule','direction','departement','service','localisation','statut','categorie',
      'coefficient','reference','rattachementHierarchique',
      'codePosition','codeSysteme','versionFichePoste','dateCreation','subordonneesDirect',
      'missionPrincipale',
      'activitesPrincipales','activitesSecondaires','tachesInterimaires',
      'relationsInternes','relationsExternes',
      'activitesSMI','autorites',
      'formationRequise','specialite','experienceRequise','autreQualite',
      'competencesTechniques','savoirFaire','competencesComportementales','savoirEtre',
      'langues','outils',
      'conditionsParticulieres','exigencesParticulieres','indicateursPerformance',
    ].filter(f => b[f] !== undefined);

    if (fields.length === 0) return res.status(400).json({ message: 'Aucune modification.' });

    const setClause = [...fields.map(f => `${f} = ?`), 'updatedAt = CURRENT_TIMESTAMP'].join(', ');
    const values = [...fields.map(f => b[f]), req.params.id];
    await db.run(`UPDATE fiches_poste SET ${setClause} WHERE id = ?`, values);
    const ficheRow = await db.get(`SELECT intitule FROM fiches_poste WHERE id = ?`, [req.params.id]);
    await logFiche(db, caller, 'MODIFIER', ficheRow?.intitule || `Fiche #${req.params.id}`);
    res.json({ message: 'Fiche mise à jour.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/fiche-poste/:id/assign — assigner la fiche à des employés ─────
router.patch('/:id/assign', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const allowedRoles = ['SuperAdmin', 'RH', 'Directeur', 'Manager', 'Responsable'];
    if (!allowedRoles.includes(caller.role)) {
      return res.status(403).json({ message: 'Permission insuffisante.' });
    }
    const db = await getDb();
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'userIds requis.' });
    }
    // Vérifier que le caller peut gérer chaque employé cible
    if (caller.role !== 'SuperAdmin') {
      if (caller.role === 'RH') {
        const callerFull = await getCallerFull(caller, db);
        for (const uid of userIds) {
          const targetUser = await db.get(`SELECT departement FROM users WHERE id = ?`, [uid]);
          if (targetUser?.departement !== callerFull.departement) {
            return res.status(403).json({ message: 'Les RH ne peuvent créer des fiches que pour leur département.' });
          }
        }
      } else {
        for (const uid of userIds) {
          const ok = await canManageTeamFiche(caller, uid, db);
          if (!ok) return res.status(403).json({ message: `Vous ne pouvez pas assigner de fiche à l'employé #${uid}.` });
        }
      }
    }
    for (const uid of userIds) {
      await db.run(`UPDATE users SET fichePosteId = ? WHERE id = ?`, [req.params.id, uid]);
    }
    res.json({ message: `Fiche assignée à ${userIds.length} employé(s).` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/fiche-poste/:id/unassign-employee/:userId ─────────────────────
router.patch('/:id/unassign-employee/:userId', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role)) {
      return res.status(403).json({ message: 'Réservé aux RH.' });
    }
    const db = await getDb();
    await db.run(`UPDATE users SET fichePosteId = NULL WHERE id = ? AND fichePosteId = ?`, [req.params.userId, req.params.id]);
    res.json({ message: 'Assignation retirée.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/fiche-poste/:id/employees — employés assignés à cette fiche ──────
router.get('/:id/employees', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    const managerRoles = ['RH', 'SuperAdmin', 'Directeur', 'Manager', 'Responsable'];
    if (!managerRoles.includes(caller.role)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }
    const db = await getDb();
    const rows = await db.all(
      `SELECT id, nom, prenom, poste, direction, departement FROM users WHERE fichePosteId = ? AND actif = 1 ORDER BY nom`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/fiche-poste/:id ───────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role)) {
      return res.status(403).json({ message: 'Réservé aux RH.' });
    }
    const db = await getDb();
    const employees = await db.all(`SELECT id, fichePosteFile FROM users WHERE fichePosteId = ? AND fichePosteFile IS NOT NULL`, [req.params.id]);
    for (const emp of employees) {
      const filePath = path.join(uploadDir, emp.fichePosteFile);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.run(`UPDATE users SET fichePosteId = NULL, fichePosteFile = NULL WHERE fichePosteId = ?`, [req.params.id]);
    await db.run(`DELETE FROM fiches_poste WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Fiche supprimée.' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
