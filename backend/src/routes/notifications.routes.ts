import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

// GET /api/notifications/:username — fetch notifications for a user
router.get('/:username', async (req: Request, res: Response) => {
  const { username } = req.params;
  const caller = (req as any).user;
  if (!['RH', 'SuperAdmin'].includes(caller.role) &&
      caller.username?.toLowerCase() !== username.toLowerCase()) {
    return res.status(403).json({ message: 'Accès refusé : vous ne pouvez consulter que vos propres notifications.' });
  }
  try {
    const db = await getDb();
    const user = await db.get(`SELECT id FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [username]);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });

    const notifications = await db.all(
      `SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50`,
      [user.id]
    );
    const unreadCount = notifications.filter((n: any) => !n.read).length;
    return res.json({ notifications, unreadCount });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/:id/read — mark one notification as read
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const caller = (req as any).user;
    const notif = await db.get(`SELECT userId FROM notifications WHERE id = ?`, [req.params.id]);
    if (!notif) return res.status(404).json({ message: 'Notification non trouvée.' });
    if (notif.userId !== caller.id && !['RH', 'SuperAdmin'].includes(caller.role)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }
    await db.run(`UPDATE notifications SET read = 1 WHERE id = ?`, [req.params.id]);
    return res.json({ message: 'Notification marquée comme lue.' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/read-all/:username — mark all as read
router.patch('/read-all/:username', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).user;
    if (!['RH', 'SuperAdmin'].includes(caller.role) &&
        caller.username?.toLowerCase() !== req.params.username.toLowerCase()) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }
    const db = await getDb();
    const user = await db.get(`SELECT id FROM users WHERE activeDirectory = ? COLLATE NOCASE`, [req.params.username]);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    await db.run(`UPDATE notifications SET read = 1 WHERE userId = ?`, [user.id]);
    return res.json({ message: 'Toutes les notifications marquées comme lues.' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications/relancer/:employeeId — remind manager to evaluate an employee
router.post('/relancer/:employeeId', async (req: Request, res: Response) => {
  const caller = (req as any).user;
  if (!['RH', 'SuperAdmin', 'Directeur', 'Manager', 'Responsable'].includes(caller.role)) {
    return res.status(403).json({ message: 'Action non autorisée.' });
  }
  try {
    const db = await getDb();
    const employee = await db.get(
      `SELECT id, nom, prenom, responsable1 FROM users WHERE id = ?`,
      [req.params.employeeId]
    );
    if (!employee) return res.status(404).json({ message: 'Employé non trouvé.' });

    // Find the manager (responsable1) by name
    const manager = await db.get(
      `SELECT id, nom, prenom FROM users WHERE
        LOWER(TRIM(nom || ' ' || prenom)) = LOWER(TRIM(?))
        OR LOWER(TRIM(prenom || ' ' || nom)) = LOWER(TRIM(?))`,
      [employee.responsable1, employee.responsable1]
    );

    const empName = `${employee.prenom} ${employee.nom}`.trim();

    if (manager) {
      await db.run(
        `INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`,
        [manager.id, `Rappel : l'évaluation de ${empName} est en attente. Merci de la soumettre.`, 'warning']
      );
    }

    // Also notify the employee
    await db.run(
      `INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`,
      [employee.id, `Votre évaluation annuelle est en attente. Votre manager a été relancé.`, 'info']
    );

    return res.json({ success: true, message: `Relance envoyée pour ${empName}.` });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications — create a notification (RH/Admin only)
router.post('/', async (req: Request, res: Response) => {
  const caller = (req as any).user;
  if (!['RH', 'SuperAdmin'].includes(caller.role)) {
    return res.status(403).json({ message: 'Accès réservé à l\'équipe RH.' });
  }
  const { userId, message, type } = req.body;
  if (!userId || !message) return res.status(400).json({ message: 'userId et message requis.' });
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`,
      [userId, message, type || 'info']
    );
    return res.status(201).json({ message: 'Notification créée.' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
