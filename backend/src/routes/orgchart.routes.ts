import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../database';

const router = Router();

// Module Organigramme : ouvert à tous si le SuperAdmin l'a activé globalement
// (paramètre `module_orgchart_enabled`), sinon réservé au SuperAdmin et aux
// utilisateurs à qui l'accès a été accordé individuellement (ex. le manager RH).
router.use(async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: 'Non authentifié.' });
  if (user.role === 'SuperAdmin') return next();
  try {
    const db = await getDb();
    const setting = await db.get(`SELECT value FROM app_settings WHERE key = 'module_orgchart_enabled'`);
    if (setting?.value === '1') return next();
    const row = await db.get(`SELECT orgChartAccess FROM users WHERE id = ?`, [user.id]);
    if (row?.orgChartAccess === 1) return next();
  } catch { /* fall through to 403 */ }
  return res.status(403).json({ message: 'Accès à l\'organigramme non autorisé.' });
});

// GET /api/orgchart — tous les employés actifs
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
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
  } catch (err: any) {
    return res.status(500).json({ message: 'Erreur serveur.', details: err.message });
  }
});

// PATCH /api/orgchart/:userId/photo — mettre à jour la photo
router.patch('/:userId/photo', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Token manquant.' });

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: 'Configuration serveur manquante.' });
    const decoded: any = jwt.verify(authHeader.split(' ')[1], secret);
    const targetId = parseInt(req.params.userId, 10);
    const { photo } = req.body;

    if (!photo) return res.status(400).json({ message: 'Photo requise.' });

    const db = await getDb();
    const editor = await db.get('SELECT * FROM users WHERE id = ?', [decoded.id]);
    const target = await db.get('SELECT * FROM users WHERE id = ?', [targetId]);

    if (!editor || !target) return res.status(404).json({ message: 'Utilisateur non trouvé.' });

    const canEdit =
      ['SuperAdmin', 'RH'].includes(editor.role) ||
      editor.poste === 'Responsable Recrutement & Formation' ||
      (editor.role === 'Directeur'   && editor.direction   === target.direction)   ||
      (editor.role === 'Manager'     && editor.departement === target.departement) ||
      (editor.role === 'Responsable' && editor.service     === target.service)     ||
      editor.id === target.id;

    if (!canEdit) return res.status(403).json({ message: 'Non autorisé à modifier ce profil.' });

    await db.run('UPDATE users SET photo = ? WHERE id = ?', [photo, targetId]);
    return res.json({ message: 'Photo mise à jour.' });
  } catch {
    return res.status(401).json({ message: 'Token invalide.' });
  }
});

export default router;
