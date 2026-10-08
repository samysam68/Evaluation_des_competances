import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../database';
import { sendEmail, emailRelanceEvaluations } from '../services/email.service';

const router = Router();

// Toutes les routes /api/rh/* sont réservées aux RH, SuperAdmin, et aux
// utilisateurs à qui le SuperAdmin a explicitement accordé l'accès à l'espace RH.
router.use(async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: 'Non authentifié.' });
  if (['RH', 'SuperAdmin'].includes(user.role)) return next();
  try {
    const db = await getDb();
    const row = await db.get(`SELECT rhAccess FROM users WHERE id = ?`, [user.id]);
    if (row?.rhAccess === 1) return next();
  } catch { /* fall through to 403 */ }
  return res.status(403).json({ message: 'Accès réservé à l\'équipe RH.' });
});

// ─── Helper: score → statut compétence ───────────────────────────────────────
// Ratings are stored on a /20 scale (5, 10, 15, 20)
function classifyScore(s: number): 'acquise' | 'enCours' | 'nonAcquise' {
  if (s >= 15) return 'acquise';
  if (s >= 10) return 'enCours';
  return 'nonAcquise';
}

// Ratings can be either a raw number (old format) or a {level, note, justification} object (new format)
function extractNote(v: any): number {
  if (v && typeof v === 'object' && 'note' in v) return typeof v.note === 'number' ? v.note : 0;
  return typeof v === 'number' ? v : 0;
}

function extractJustification(v: any): string {
  if (v && typeof v === 'object' && typeof v.justification === 'string') return v.justification.trim();
  return '';
}

// Critères génériques « Autre critère X (selon le poste) » : un intitulé libre que
// chaque évaluateur définit lui-même selon le poste — on ne peut pas l'agréger sous
// son libellé générique (qui ne désigne rien de comparable d'une fiche à l'autre).
const GENERIC_OTHER_CRITERION_IDS = new Set(['autre_a']);

// ─── GET /api/rh/stats ────────────────────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const currentYear = new Date().getFullYear();
    const year = parseInt(String(req.query.year || currentYear), 10);
    const yearStr = String(year);

    // Totaux
    const totalResult = await db.get(`SELECT COUNT(*) as count FROM users WHERE actif = 1`);
    const totalEmployees = totalResult.count as number;

    const evaluatedResult = await db.get(
      `SELECT COUNT(DISTINCT targetUserId) as count FROM evaluations
       WHERE (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))`,
      [year, yearStr]
    );
    const evaluatedCount = evaluatedResult.count as number;
    const pendingCount = totalEmployees - evaluatedCount;
    const coverageRate = totalEmployees > 0 ? Math.round((evaluatedCount / totalEmployees) * 1000) / 10 : 0;

    // Agrégation ratings → IGC (filtrée par année de campagne). Une évaluation
    // rejetée par les RH puis resoumise crée une NOUVELLE ligne (l'ancienne,
    // rejetée, reste en base) — on ne garde ici que la ligne la plus récente par
    // employé pour ne pas compter deux fois la même personne dans l'IGC et les
    // compétences (la ligne rejetée obsolète ne doit plus peser dans les stats).
    const allEvals = await db.all(
      `SELECT ratings, globalScore, targetUserId FROM evaluations e
       WHERE ratings IS NOT NULL
         AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))
         AND e.id = (
           SELECT e2.id FROM evaluations e2
           WHERE e2.targetUserId = e.targetUserId
             AND e2.ratings IS NOT NULL
             AND (e2.campaignYear = ? OR (e2.campaignYear IS NULL AND strftime('%Y', e2.createdAt) = ?))
           ORDER BY e2.createdAt DESC LIMIT 1
         )`,
      [year, yearStr, year, yearStr]
    );
    let totalRatings = 0, acquises = 0, enCours = 0, nonAcquises = 0;

    // Ne considérer que la dernière évaluation par employé (voir commentaire sur
    // `allEvals` ci-dessus : une évaluation rejetée puis resoumise laisse une ligne
    // obsolète en base qui ne doit plus peser dans les statistiques). Réutilisé par
    // toutes les requêtes d'agrégation brute de `/stats` ci-dessous.
    const latestEvalFilter = `
      AND e.id = (
        SELECT e2.id FROM evaluations e2
        WHERE e2.targetUserId = e.targetUserId
          AND (e2.campaignYear = ? OR (e2.campaignYear IS NULL AND strftime('%Y', e2.createdAt) = ?))
        ORDER BY e2.createdAt DESC LIMIT 1
      )`;

    const competencyScores: Record<string, { total: number; count: number; nonAcqCount: number }> = {};

    for (const ev of allEvals) {
      try {
        const ratings = JSON.parse(ev.ratings as string);
        for (const [key, value] of Object.entries(ratings)) {
          const numVal = extractNote(value);
          if (numVal > 0) {
            totalRatings++;
            const cls = classifyScore(numVal);
            if (cls === 'acquise') acquises++;
            else if (cls === 'enCours') enCours++;
            else nonAcquises++;

            // Pour un critère générique « Autre », on affiche la description que
            // l'évaluateur a lui-même saisie (plutôt que l'intitulé générique qui ne
            // veut rien dire à l'échelle de l'entreprise) — ou on l'exclut du
            // classement des compétences s'il n'a rien précisé.
            let compKey = key;
            if (GENERIC_OTHER_CRITERION_IDS.has(key)) {
              const justif = extractJustification(value);
              if (!justif) continue;
              compKey = justif;
            }

            if (!competencyScores[compKey]) competencyScores[compKey] = { total: 0, count: 0, nonAcqCount: 0 };
            competencyScores[compKey].total += numVal;
            competencyScores[compKey].count += 1;
            if (cls === 'nonAcquise') competencyScores[compKey].nonAcqCount += 1;
          }
        }
      } catch { /* skip */ }
    }

    const igc = totalRatings > 0 ? Math.round((acquises / totalRatings) * 100) : 0;
    const tauxAcquises = totalRatings > 0 ? Math.round((acquises / totalRatings) * 100) : 0;
    const tauxNonAcquises = totalRatings > 0 ? Math.round((nonAcquises / totalRatings) * 100) : 0;
    const tauxEnCours = totalRatings > 0 ? Math.round((enCours / totalRatings) * 100) : 0;

    // Note moyenne globale
    const avgResult = await db.get(
      `SELECT AVG(globalScore) as avg FROM evaluations e WHERE globalScore IS NOT NULL
       AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))
       ${latestEvalFilter}`,
      [year, yearStr, year, yearStr]
    );
    const avgGlobalScore = avgResult.avg ? Math.round(avgResult.avg * 100) / 100 : 0;

    // Compteurs évaluations
    const evalCountResult = await db.get(
      `SELECT COUNT(*) as count FROM evaluations
       WHERE (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))`,
      [year, yearStr]
    );
    const evaluationCount = evalCountResult.count as number;
    const execResult = await db.get(
      `SELECT COUNT(*) as count FROM evaluations WHERE type = 'form_executions'
       AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))`,
      [year, yearStr]
    );
    const cadresResult = await db.get(
      `SELECT COUNT(*) as count FROM evaluations WHERE type = 'form_cadres'
       AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))`,
      [year, yearStr]
    );

    // Talents haut potentiel : aligné sur la grille /20 (Supérieur aux attentes, >= 16/20)
    const talentsResult = await db.get(
      `SELECT COUNT(DISTINCT targetUserId) as count FROM evaluations e WHERE globalScore >= 16
       AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))
       ${latestEvalFilter}`,
      [year, yearStr, year, yearStr]
    );
    const talentsCount = talentsResult.count as number;

    // Situation critique : aligné sur la règle du point à améliorer (< 11/20)
    const criticalResult = await db.get(
      `SELECT COUNT(DISTINCT targetUserId) as count FROM evaluations e WHERE globalScore < 11
       AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))
       ${latestEvalFilter}`,
      [year, yearStr, year, yearStr]
    );
    const criticalCount = criticalResult.count as number;

    // Score distribution — alignée sur le barème officiel de notation (4 niveaux)
    const allScores = await db.all(
      `SELECT globalScore FROM evaluations e WHERE globalScore IS NOT NULL
       AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))
       ${latestEvalFilter}`,
      [year, yearStr, year, yearStr]
    );
    const scoreDistribution = [
      { label: 'Insatisfaisant (0-5)', count: 0 },
      { label: 'À améliorer (6-10)', count: 0 },
      { label: 'Satisfaisant (11-15)', count: 0 },
      { label: 'Supérieur (16-20)', count: 0 },
    ];
    for (const { globalScore } of allScores) {
      if (globalScore <= 5) scoreDistribution[0].count++;
      else if (globalScore <= 10) scoreDistribution[1].count++;
      else if (globalScore <= 15) scoreDistribution[2].count++;
      else scoreDistribution[3].count++;
    }

    // Heat Map par Direction
    const directionUsers = await db.all(`
      SELECT u.direction, u.id as userId
      FROM users u
      WHERE u.actif = 1 AND u.direction IS NOT NULL AND u.direction != ''
    `);

    const evalsByUser: Record<number, string> = {};
    for (const ev of allEvals) {
      if (ev.targetUserId && !evalsByUser[ev.targetUserId]) {
        evalsByUser[ev.targetUserId] = ev.ratings as string;
      }
    }

    const dirMap: Record<string, { acquises: number; enCours: number; nonAcquises: number; total: number }> = {};
    for (const { direction, userId } of directionUsers) {
      if (!dirMap[direction]) dirMap[direction] = { acquises: 0, enCours: 0, nonAcquises: 0, total: 0 };
      const ratingsStr = evalsByUser[userId];
      if (!ratingsStr) continue;
      try {
        const ratings = JSON.parse(ratingsStr);
        for (const value of Object.values(ratings)) {
          const numVal = extractNote(value);
          if (numVal > 0) {
            dirMap[direction].total++;
            const cls = classifyScore(numVal);
            dirMap[direction][cls === 'acquise' ? 'acquises' : cls === 'enCours' ? 'enCours' : 'nonAcquises']++;
          }
        }
      } catch { /* skip */ }
    }

    const heatMapByDirection = Object.entries(dirMap)
      .filter(([, v]) => v.total > 0)
      .map(([name, v]) => ({
        name: name.length > 25 ? name.substring(0, 25) + '…' : name,
        acquises: v.total > 0 ? Math.round((v.acquises / v.total) * 100) : 0,
        enCours: v.total > 0 ? Math.round((v.enCours / v.total) * 100) : 0,
        nonAcquises: v.total > 0 ? Math.round((v.nonAcquises / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.acquises - a.acquises)
      .slice(0, 12);

    // Top 10 compétences déficitaires — libellés complets, repris tels quels des
    // fiches d'évaluation (aucune abréviation/troncature).
    const topDeficits = Object.entries(competencyScores)
      .filter(([, v]) => v.count >= 1)
      .map(([name, v]) => ({
        name,
        avgScore: Math.round((v.total / v.count) * 100) / 100,
        nonAcqCount: v.nonAcqCount,
        ecarts: v.nonAcqCount,
      }))
      .sort((a, b) => b.nonAcqCount - a.nonAcqCount)
      .slice(0, 10);

    // Top/Bottom compétences globales — libellés complets également.
    const competencyAvgs = Object.entries(competencyScores)
      .map(([name, v]) => ({
        name,
        avgScore: Math.round((v.total / v.count) * 100) / 100,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const topCompetences = competencyAvgs.slice(0, 10);
    const bottomCompetences = [...competencyAvgs].sort((a, b) => a.avgScore - b.avgScore).slice(0, 8);
    const radarData = topCompetences.slice(0, 10).map((c) => ({
      subject: c.name.length > 20 ? c.name.substring(0, 20) + '…' : c.name,
      score: c.avgScore,
      fullMark: 4,
    }));

    // Stats par département (top 12) — filtrée par année
    const byDepartment: any[] = await db.all(`
      SELECT u.departement AS name,
             COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN u.id END) AS evaluated,
             COUNT(DISTINCT u.id) AS total,
             ROUND(AVG(e.globalScore), 2) AS avgScore
      FROM users u
      LEFT JOIN evaluations e ON e.targetUserId = u.id
        AND (e.campaignYear = ? OR (e.campaignYear IS NULL AND strftime('%Y', e.createdAt) = ?))
      WHERE u.actif = 1 AND u.departement IS NOT NULL AND u.departement != ''
      GROUP BY u.departement
      ORDER BY total DESC
    `, [year, yearStr]);

    // Dashboard Managers — taux de réalisation par Directeur/Manager, pour la campagne
    // sélectionnée. L'équipe couvre tout le département : quelqu'un compte dans l'équipe
    // dès qu'il apparaît à N'IMPORTE QUEL niveau de sa chaîne hiérarchique (responsable1,
    // 2 ou 3), pas seulement en tant que subordonné direct (responsable1 uniquement).
    // Remarque : on ne regroupe pas par simple égalité de "departement" — plusieurs
    // directions différentes partagent parfois le même libellé de département dans les
    // données RH source (ex. "Département Affaires Réglementaires" existe sous au moins
    // deux directions distinctes), ce qui fausserait le comptage en fusionnant des équipes
    // sans rapport entre elles.
    const managerStats: any[] = await db.all(`
      SELECT
        mgr.id AS managerId,
        mgr.nom || ' ' || mgr.prenom AS managerName,
        mgr.role AS managerRole,
        COUNT(DISTINCT u.id) AS totalTeam,
        COUNT(DISTINCT CASE
          WHEN e.campaignYear = ? OR (e.campaignYear IS NULL AND strftime('%Y', e.createdAt) = ?)
          THEN e.targetUserId
        END) AS evaluated,
        (SELECT COUNT(*) FROM manager_relances r WHERE r.managerId = mgr.id) AS relanceCount,
        (SELECT MAX(sentAt) FROM manager_relances r WHERE r.managerId = mgr.id) AS lastRelanceAt
      FROM users mgr
      JOIN users u ON u.actif = 1
        AND u.id != mgr.id
        AND (
          LOWER(TRIM(mgr.nom || ' ' || mgr.prenom)) IN (LOWER(TRIM(u.responsable1)), LOWER(TRIM(u.responsable2)), LOWER(TRIM(u.responsable3)))
          OR LOWER(TRIM(mgr.prenom || ' ' || mgr.nom)) IN (LOWER(TRIM(u.responsable1)), LOWER(TRIM(u.responsable2)), LOWER(TRIM(u.responsable3)))
        )
      LEFT JOIN evaluations e ON e.targetUserId = u.id
      WHERE mgr.actif = 1
        AND mgr.role IN ('Directeur', 'Manager', 'Responsable', 'Superviseur')
      GROUP BY mgr.id
      HAVING totalTeam >= 1
      ORDER BY evaluated DESC
    `, [year, yearStr]);

    const managerDashboard = managerStats.map(m => ({
      id: m.managerId,
      name: m.managerName,
      role: m.managerRole,
      totalTeam: m.totalTeam,
      evaluated: m.evaluated,
      taux: m.totalTeam > 0 ? Math.round((m.evaluated / m.totalTeam) * 100) : 0,
      relanceCount: m.relanceCount || 0,
      lastRelanceAt: m.lastRelanceAt || null,
    }));

    // Alertes RH — employés non évalués avec rôle critique
    const alertes = {
      nonEvalues: pendingCount,
      critiques: criticalCount,
      hausPotentiel: talentsCount,
    };

    // Besoins de formation — intitulés des formations demandées (tableau « Formations
    // demandées » de chaque fiche, stocké dans otherData.trainings), et non plus le
    // champ libre "Besoins en formation" qui n'est pas toujours rempli.
    const trainingEvals = await db.all(
      `SELECT e.otherData, u.departement FROM evaluations e
       JOIN users u ON u.id = e.targetUserId
       WHERE e.otherData IS NOT NULL AND e.otherData != ''
         AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))
         ${latestEvalFilter}`,
      [year, yearStr, year, yearStr]
    );
    const trainingMap: Record<string, number> = {};
    // Détail par département, pour le plan de formation RH (point demandé : classement
    // global ET détail des formations demandées par département).
    const trainingByDept: Record<string, Record<string, number>> = {};
    for (const { otherData, departement } of trainingEvals) {
      let trainings: any[] = [];
      try { trainings = JSON.parse(otherData)?.trainings || []; } catch { trainings = []; }
      const dept = (departement || 'Non renseigné').trim() || 'Non renseigné';
      for (const t of trainings) {
        const intitule = (t?.intitule || '').trim();
        if (!intitule) continue;
        trainingMap[intitule] = (trainingMap[intitule] || 0) + 1;
        if (!trainingByDept[dept]) trainingByDept[dept] = {};
        trainingByDept[dept][intitule] = (trainingByDept[dept][intitule] || 0) + 1;
      }
    }
    const trainingNeeds = Object.entries(trainingMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([need, count]) => ({ need, count }));
    const trainingNeedsByDepartment = Object.entries(trainingByDept)
      .map(([department, needs]) => ({
        department,
        total: Object.values(needs).reduce((s, c) => s + c, 0),
        needs: Object.entries(needs).sort(([, a], [, b]) => b - a).map(([need, count]) => ({ need, count })),
      }))
      .sort((a, b) => b.total - a.total);

    // Recommandations RH — décisions choisies par la RH à la validation de chaque évaluation
    // (rhDecision, saisi "après la validation"), et non l'appréciation de l'évaluateur.
    const recEvals = await db.all(
      `SELECT rhDecision FROM evaluations
       WHERE status = 'Validée' AND rhDecision IS NOT NULL AND rhDecision != ''
         AND (campaignYear = ? OR (campaignYear IS NULL AND strftime('%Y', createdAt) = ?))`,
      [year, yearStr]
    );
    const recMap: Record<string, number> = {};
    for (const { rhDecision } of recEvals) {
      let decisions: string[] = [];
      try { decisions = JSON.parse(rhDecision); } catch { decisions = [rhDecision]; }
      for (const d of decisions) {
        if (!d) continue;
        recMap[d] = (recMap[d] || 0) + 1;
      }
    }
    const recommendations = Object.entries(recMap)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    res.json({
      kpi: {
        totalEmployees, evaluatedCount, pendingCount, coverageRate,
        avgGlobalScore, evaluationCount,
        execCount: execResult.count, cadresCount: cadresResult.count,
        igc, tauxAcquises, tauxNonAcquises, tauxEnCours,
        talentsCount, criticalCount,
        totalRatings, acquises, enCours: enCours, nonAcquises,
      },
      byDepartment,
      scoreDistribution,
      topCompetences,
      bottomCompetences,
      radarData,
      heatMapByDirection,
      topDeficits,
      managerDashboard,
      trainingNeeds,
      trainingNeedsByDepartment,
      recommendations,
      alertes,
      appName: (await db.get(`SELECT value FROM app_settings WHERE key = 'appName'`))?.value || 'Talents',
    });
  } catch (error: any) {
    console.error('RH stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/rh/relance/:managerId ───────────────────────────────────────────
// Relance un directeur en retard sur les évaluations de son équipe : notification
// in-app + email, et trace la relance (nombre + date) pour affichage dans le
// tableau de suivi RH.
router.post('/relance/:managerId', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const managerId = parseInt(req.params.managerId, 10);
    const caller = (req as any).user;
    const { evaluated, totalTeam } = req.body || {};

    const manager = await db.get(`SELECT id, nom, prenom, email FROM users WHERE id = ? AND actif = 1`, [managerId]);
    if (!manager) return res.status(404).json({ message: 'Responsable non trouvé.' });

    const evaluatedNum = Number(evaluated) || 0;
    const totalTeamNum = Number(totalTeam) || 0;

    await db.run(
      `INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`,
      [managerId, `Rappel RH : ${evaluatedNum}/${totalTeamNum} évaluations de votre équipe ont été soumises. Merci de compléter les évaluations restantes avant la clôture de la campagne.`, 'warning']
    );

    let emailSent = false;
    if (manager.email) {
      const { subject, html } = emailRelanceEvaluations({ prenom: manager.prenom, nom: manager.nom, evaluated: evaluatedNum, totalTeam: totalTeamNum });
      emailSent = await sendEmail(manager.email, subject, html);
    }

    await db.run(`INSERT INTO manager_relances (managerId, sentBy) VALUES (?, ?)`, [managerId, caller?.id ?? null]);

    const relanceCount = await db.get(`SELECT COUNT(*) as n FROM manager_relances WHERE managerId = ?`, [managerId]);
    const lastRelanceAt = await db.get(`SELECT MAX(sentAt) as d FROM manager_relances WHERE managerId = ?`, [managerId]);

    res.json({ success: true, emailSent, relanceCount: relanceCount.n, lastRelanceAt: lastRelanceAt.d });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/rh/departments ──────────────────────────────────────────────────
router.get('/departments', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();

    const depts: any[] = await db.all(`
      SELECT
        u.departement AS name,
        u.direction,
        COUNT(DISTINCT u.id) AS total,
        COUNT(DISTINCT e.targetUserId) AS evaluated,
        ROUND(AVG(e.globalScore), 2) AS avgScore
      FROM users u
      LEFT JOIN evaluations e ON e.targetUserId = u.id
      WHERE u.actif = 1 AND u.departement IS NOT NULL AND u.departement != ''
      GROUP BY u.departement
      ORDER BY u.direction, total DESC
    `);

    // Filtre options
    const directions = await db.all(`SELECT DISTINCT direction FROM users WHERE actif=1 AND direction IS NOT NULL ORDER BY direction`);
    const categories = await db.all(`SELECT DISTINCT categorie FROM users WHERE actif=1 AND categorie IS NOT NULL ORDER BY categorie`);

    res.json({
      departments: depts.map(d => ({
        name: d.name,
        direction: d.direction,
        total: d.total,
        evaluated: d.evaluated,
        pending: d.total - d.evaluated,
        avgScore: d.avgScore,
        coverage: d.total > 0 ? Math.round((d.evaluated / d.total) * 100) : 0,
      })),
      filters: {
        directions: directions.map((d: any) => d.direction),
        categories: categories.map((c: any) => c.categorie),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/rh/department/:dept/employees ───────────────────────────────────
router.get('/department/:dept/employees', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const dept = decodeURIComponent(req.params.dept);
    const { categorie } = req.query;

    let query = `
      SELECT u.id, u.nom, u.prenom, u.matricule, u.poste, u.categorie, u.direction,
             u.responsable1, u.dateRecrutement,
             e.id as evaluationId, e.status as evaluationStatus,
             e.globalScore, e.ratings, e.createdAt as evaluatedAt, e.type as evalType
      FROM users u
      LEFT JOIN evaluations e ON e.targetUserId = u.id
        AND e.id = (SELECT id FROM evaluations WHERE targetUserId = u.id ORDER BY createdAt DESC LIMIT 1)
      WHERE u.actif = 1 AND u.departement = ?
    `;
    const params: any[] = [dept];

    if (categorie) {
      query += ` AND u.categorie = ?`;
      params.push(categorie);
    }
    query += ` ORDER BY u.nom, u.prenom`;

    const employees = await db.all(query, params);

    const result = employees.map((emp: any) => {
      let acquises = 0, enCours = 0, nonAcquises = 0, totalR = 0;
      if (emp.ratings) {
        try {
          const ratings = JSON.parse(emp.ratings);
          for (const value of Object.values(ratings)) {
            const numVal = extractNote(value);
            if (numVal > 0) {
              totalR++;
              if (numVal >= 15) acquises++;
              else if (numVal >= 10) enCours++;
              else nonAcquises++;
            }
          }
        } catch { /* skip */ }
      }
      const igc = totalR > 0 ? Math.round((acquises / totalR) * 100) : null;
      const critique = emp.globalScore !== null && (emp.globalScore < 11 || (totalR > 0 && nonAcquises / totalR > 0.3));
      const hautPotentiel = emp.globalScore !== null && emp.globalScore >= 16;

      return {
        id: emp.id,
        name: `${emp.nom} ${emp.prenom}`.trim(),
        matricule: emp.matricule,
        poste: emp.poste,
        categorie: emp.categorie,
        direction: emp.direction,
        responsable: emp.responsable1,
        globalScore: emp.globalScore,
        evaluatedAt: emp.evaluatedAt,
        evalType: emp.evalType,
        evaluationId: emp.evaluationId ?? null,
        evaluationStatus: emp.evaluationStatus ?? null,
        status: emp.globalScore !== null ? 'Évalué' : 'Non évalué',
        acquises, enCours, nonAcquises, totalCompetences: totalR,
        igc,
        critique,
        hautPotentiel,
      };
    });

    res.json({ department: dept, employees: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/rh/pending-validations ─────────────────────────────────────────
router.get('/pending-validations', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT e.id, e.type, e.globalScore, e.createdAt, e.status,
             u.nom AS targetNom, u.prenom AS targetPrenom, u.poste AS targetPoste, u.departement,
             ev.nom AS evalNom, ev.prenom AS evalPrenom
      FROM evaluations e
      JOIN users u ON u.id = e.targetUserId
      JOIN users ev ON ev.id = e.evaluatorId
      WHERE e.status = 'Soumise'
      ORDER BY e.createdAt DESC
    `);
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/rh/validated-evaluations?year=YYYY|all ──────────────────────────
// Archive des évaluations validées par les RH. Par défaut : année en cours.
// ?year=all renvoie l'archive complète, toutes campagnes confondues.
router.get('/validated-evaluations', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const yearParam = String(req.query.year || new Date().getFullYear());

    const baseSelect = `
      SELECT e.id, e.type, e.globalScore, e.rhFinalScore, e.rhDecision, e.rhComment,
             e.validatedAt, e.createdAt, e.campaignYear, e.employeeFeedback, e.employeeFeedbackAt, e.otherData,
             u.nom AS targetNom, u.prenom AS targetPrenom, u.poste AS targetPoste,
             u.matricule AS targetMatricule, u.direction AS targetDirection, u.departement AS targetDepartement,
             ev.nom AS evalNom, ev.prenom AS evalPrenom,
             v.nom AS validatorNom, v.prenom AS validatorPrenom, v.poste AS validatorPoste
      FROM evaluations e
      JOIN users u ON u.id = e.targetUserId
      JOIN users ev ON ev.id = e.evaluatorId
      LEFT JOIN users v ON v.id = e.validatedBy
      WHERE e.status = 'Validée'
    `;

    const rows = yearParam === 'all'
      ? await db.all(`${baseSelect} ORDER BY e.validatedAt DESC`)
      : await db.all(
          `${baseSelect} AND (e.campaignYear = ? OR (e.campaignYear IS NULL AND strftime('%Y', e.createdAt) = ?))
           ORDER BY e.validatedAt DESC`,
          [parseInt(yearParam, 10), yearParam]
        );

    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/rh/employee-feedback ────────────────────────────────────────────
// Section « Retour Employé » : liste des évaluations validées avec le retour
// (satisfait / moyen / non satisfait) donné par l'employé, s'il l'a déjà donné.
router.get('/employee-feedback', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const currentYear = new Date().getFullYear();
    const rows = await db.all(`
      SELECT e.id, e.type, e.globalScore, e.rhFinalScore, e.validatedAt,
             e.employeeFeedback, e.employeeFeedbackAt,
             u.id AS targetId, u.nom AS targetNom, u.prenom AS targetPrenom, u.poste AS targetPoste,
             u.direction AS targetDirection, u.departement AS targetDepartement,
             ev.nom AS evalNom, ev.prenom AS evalPrenom, ev.poste AS evalPoste
      FROM evaluations e
      JOIN users u ON u.id = e.targetUserId
      JOIN users ev ON ev.id = e.evaluatorId
      WHERE e.status = 'Validée'
        AND (e.campaignYear = ? OR (e.campaignYear IS NULL AND strftime('%Y', e.createdAt) = ?))
      ORDER BY (e.employeeFeedbackAt IS NULL) ASC, e.employeeFeedbackAt DESC, e.validatedAt DESC
    `, [currentYear, String(currentYear)]);

    const responded = rows.filter((r: any) => r.employeeFeedback);
    const summary = {
      total: rows.length,
      responded: responded.length,
      satisfait: responded.filter((r: any) => r.employeeFeedback === 'satisfait').length,
      moyen: responded.filter((r: any) => r.employeeFeedback === 'moyen').length,
      non_satisfait: responded.filter((r: any) => r.employeeFeedback === 'non_satisfait').length,
    };

    return res.json({ rows, summary });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get('/evaluation/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const ev = await db.get(`
      SELECT e.*,
             u.nom AS targetNom, u.prenom AS targetPrenom, u.poste AS targetPoste,
             u.departement, u.direction, u.matricule, u.categorie, u.dateRecrutement,
             ev.nom AS evalNom, ev.prenom AS evalPrenom, ev.poste AS evalPoste
      FROM evaluations e
      JOIN users u ON u.id = e.targetUserId
      JOIN users ev ON ev.id = e.evaluatorId
      WHERE e.id = ?
    `, [req.params.id]);
    if (!ev) return res.status(404).json({ message: 'Évaluation introuvable.' });
    return res.json({
      ...ev,
      ratings: ev.ratings ? JSON.parse(ev.ratings) : {},
      tasks: ev.tasks ? JSON.parse(ev.tasks) : [],
      otherData: ev.otherData ? JSON.parse(ev.otherData) : {},
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/rh/succession ──────────────────────────────────────────────────
router.get('/succession', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();

    // Talents : employés avec score >= 16 sur leur dernière évaluation (aligné grille /20)
    const talents: any[] = await db.all(`
      SELECT u.id, u.nom, u.prenom, u.poste, u.direction, u.departement,
             u.categorie, u.responsable1, u.dateRecrutement,
             e.globalScore, e.createdAt AS evaluatedAt, e.recommendation, e.strengths, e.type AS evalType
      FROM users u
      JOIN evaluations e ON e.targetUserId = u.id
        AND e.id = (SELECT id FROM evaluations WHERE targetUserId = u.id ORDER BY createdAt DESC LIMIT 1)
      WHERE u.actif = 1 AND e.globalScore >= 16
      ORDER BY e.globalScore DESC
    `);

    // Analyse par poste : nombre d'employés, évalués, score moyen, nb talents
    const posteStats: any[] = await db.all(`
      SELECT
        u.poste,
        u.direction,
        COUNT(DISTINCT u.id) AS total,
        COUNT(DISTINCT e.targetUserId) AS evaluated,
        ROUND(AVG(e.globalScore), 2) AS avgScore,
        COUNT(DISTINCT CASE WHEN e.globalScore >= 16 THEN u.id END) AS talentsCount,
        COUNT(DISTINCT CASE WHEN e.globalScore < 11  THEN u.id END) AS critiquesCount,
        MIN(e.globalScore) AS minScore,
        MAX(e.globalScore) AS maxScore
      FROM users u
      LEFT JOIN evaluations e ON e.targetUserId = u.id
        AND e.id = (SELECT id FROM evaluations WHERE targetUserId = u.id ORDER BY createdAt DESC LIMIT 1)
      WHERE u.actif = 1 AND u.poste IS NOT NULL AND u.poste != ''
      GROUP BY u.poste
      ORDER BY total DESC
    `);

    const postesWithRisk = posteStats.map((p: any) => {
      let risk: 'critique' | 'vigilance' | 'stable' = 'stable';
      // Poste critique = un seul titulaire OU tous les titulaires sont des talents (risque départ/promotion)
      if (p.total === 1 && p.talentsCount === 1) risk = 'critique';
      else if (p.total <= 2 && p.talentsCount >= 1) risk = 'vigilance';
      else if (p.critiquesCount > 0 || p.evaluated === 0) risk = 'vigilance';
      return {
        name: p.poste,
        direction: p.direction,
        total: p.total,
        evaluated: p.evaluated,
        avgScore: p.avgScore,
        talentsCount: p.talentsCount || 0,
        critiquesCount: p.critiquesCount || 0,
        minScore: p.minScore,
        maxScore: p.maxScore,
        risk,
        coverage: p.total > 0 ? Math.round((p.evaluated / p.total) * 100) : 0,
      };
    });

    // Résumé
    const totalCritical = postesWithRisk.filter(p => p.risk === 'critique').length;
    const totalVigilance = postesWithRisk.filter(p => p.risk === 'vigilance').length;
    const uniquePostes = postesWithRisk.length;

    const talentsFormatted = talents.map((t: any) => {
      const annees = t.dateRecrutement
        ? Math.floor((Date.now() - new Date(t.dateRecrutement).getTime()) / (1000 * 60 * 60 * 24 * 365))
        : null;
      return {
        id: t.id,
        name: `${t.nom} ${t.prenom}`.trim(),
        poste: t.poste,
        direction: t.direction,
        departement: t.departement,
        categorie: t.categorie,
        responsable: t.responsable1,
        score: t.globalScore,
        evaluatedAt: t.evaluatedAt,
        evalType: t.evalType,
        anciennete: annees,
        recommendation: t.recommendation,
        strengths: t.strengths,
      };
    });

    res.json({
      summary: {
        totalTalents: talents.length,
        totalCritical,
        totalVigilance,
        uniquePostes,
      },
      talents: talentsFormatted,
      postes: postesWithRisk,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/evaluation/:id/reject', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { rhComment } = req.body;

    const evalRow = await db.get(
      `SELECT e.id, e.targetUserId, e.evaluatorId, e.type
       FROM evaluations e WHERE e.id = ?`,
      [req.params.id]
    );
    if (!evalRow) return res.status(404).json({ message: 'Évaluation introuvable.' });

    await db.run(
      `UPDATE evaluations SET status = 'Rejetée', rhComment = ? WHERE id = ?`,
      [rhComment || '', req.params.id]
    );

    // Notifier l'évaluateur
    if (evalRow.evaluatorId) {
      await db.run(
        `INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`,
        [evalRow.evaluatorId, `Votre évaluation (${evalRow.type}) a été rejetée par les RH. Motif : ${rhComment || 'non précisé'}.`, 'warning']
      );
    }
    // Notifier l'employé évalué
    if (evalRow.targetUserId) {
      await db.run(
        `INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)`,
        [evalRow.targetUserId, `Votre évaluation (${evalRow.type}) a été rejetée par les RH et sera soumise à nouveau par votre évaluateur.`, 'warning']
      );
    }

    return res.json({ message: 'Évaluation rejetée.' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/rh/comparison?year=2026 ────────────────────────────────────────
// Retourne la comparaison des scores N vs N-1 pour chaque employé actif
router.get('/comparison', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const year = parseInt(String(req.query.year || new Date().getFullYear()), 10);
    const prevYear = year - 1;

    // Récupérer la dernière évaluation par employé pour chaque année
    // Évaluations avec campaignYear explicite
    const evalsN = await db.all(
      `SELECT e.targetUserId, e.globalScore, e.rhFinalScore, e.type, e.status, e.campaignYear,
              u.nom, u.prenom, u.poste, u.direction, u.departement, u.service, u.categorie
       FROM evaluations e
       JOIN users u ON e.targetUserId = u.id
       WHERE e.campaignYear = ?
       GROUP BY e.targetUserId
       HAVING e.id = MAX(e.id)`,
      [year]
    );

    // Fallback année N : évaluations sans campaignYear créées cette année-là
    const evalsNFallback = await db.all(
      `SELECT e.targetUserId, e.globalScore, e.rhFinalScore, e.type, e.status,
              u.nom, u.prenom, u.poste, u.direction, u.departement, u.service, u.categorie
       FROM evaluations e
       JOIN users u ON e.targetUserId = u.id
       WHERE e.campaignYear IS NULL
         AND strftime('%Y', e.createdAt) = ?
       GROUP BY e.targetUserId
       HAVING e.id = MAX(e.id)`,
      [String(year)]
    );

    const evalsN1 = await db.all(
      `SELECT e.targetUserId, e.globalScore, e.rhFinalScore, e.type, e.campaignYear
       FROM evaluations e
       WHERE e.campaignYear = ?
       GROUP BY e.targetUserId
       HAVING e.id = MAX(e.id)`,
      [prevYear]
    );

    // Fallback N-1 : évaluations sans campaignYear créées l'année précédente
    const evalsN1Fallback = await db.all(
      `SELECT e.targetUserId, e.globalScore, e.rhFinalScore, e.type,
              strftime('%Y', e.createdAt) as inferredYear
       FROM evaluations e
       WHERE e.campaignYear IS NULL
         AND strftime('%Y', e.createdAt) = ?
       GROUP BY e.targetUserId
       HAVING e.id = MAX(e.id)`,
      [String(prevYear)]
    );

    // Index par userId
    const mapN: Record<number, any>   = {};
    const mapN1: Record<number, any>  = {};

    for (const ev of evalsN)  mapN[ev.targetUserId]  = ev;
    // Fallback N : ne remplace que si pas déjà présent avec campaignYear explicite
    for (const ev of evalsNFallback) {
      if (!mapN[ev.targetUserId]) mapN[ev.targetUserId] = ev;
    }
    for (const ev of evalsN1) mapN1[ev.targetUserId] = ev;
    // Fallback N-1
    for (const ev of evalsN1Fallback) {
      if (!mapN1[ev.targetUserId]) mapN1[ev.targetUserId] = ev;
    }

    // Union de tous les employés concernés
    const allIds = new Set([...Object.keys(mapN), ...Object.keys(mapN1)].map(Number));

    // Récupérer les infos des employés manquants (ceux présents en N-1 mais pas N)
    const missingIds = [...allIds].filter(id => !mapN[id]);
    const missingUsers: any[] = missingIds.length > 0
      ? await db.all(
          `SELECT id, nom, prenom, poste, direction, departement, service, categorie
           FROM users WHERE id IN (${missingIds.map(() => '?').join(',')})`,
          missingIds
        )
      : [];
    const missingMap: Record<number, any> = {};
    for (const u of missingUsers) missingMap[u.id] = u;

    const employees = [...allIds].map(id => {
      const n  = mapN[id];
      const n1 = mapN1[id];
      const userInfo = n || missingMap[id] || {};

      const scoreN  = n  ? (n.rhFinalScore  ?? n.globalScore)  : null;
      const scoreN1 = n1 ? (n1.rhFinalScore ?? n1.globalScore) : null;

      const delta  = (scoreN !== null && scoreN1 !== null) ? parseFloat((scoreN - scoreN1).toFixed(2)) : null;
      const trend  = delta === null ? (scoreN !== null ? 'new' : 'pending')
                   : delta > 0.5   ? 'up'
                   : delta < -0.5  ? 'down'
                   : 'stable';

      return {
        id,
        name:       `${userInfo.nom || ''} ${userInfo.prenom || ''}`.trim(),
        poste:      userInfo.poste      || '',
        direction:  userInfo.direction  || '',
        departement: userInfo.departement || '',
        categorie:  userInfo.categorie  || '',
        scoreN:     scoreN !== null  ? parseFloat(scoreN.toFixed(2))  : null,
        scoreN1:    scoreN1 !== null ? parseFloat(scoreN1.toFixed(2)) : null,
        delta,
        trend,
        typeN:      n  ? n.type  : null,
        typeN1:     n1 ? n1.type : null,
        statusN:    n  ? n.status : null,
      };
    });

    // Trier : ceux évalués en N d'abord, puis les en attente
    employees.sort((a, b) => {
      if (a.scoreN !== null && b.scoreN === null) return -1;
      if (a.scoreN === null && b.scoreN !== null) return 1;
      return (b.scoreN ?? 0) - (a.scoreN ?? 0);
    });

    // Résumé
    const evaluated    = employees.filter(e => e.scoreN !== null);
    const avgN         = evaluated.length > 0 ? parseFloat((evaluated.reduce((s, e) => s + (e.scoreN ?? 0), 0) / evaluated.length).toFixed(2)) : null;
    const withBoth     = employees.filter(e => e.scoreN !== null && e.scoreN1 !== null);
    const avgN1        = withBoth.length > 0 ? parseFloat((withBoth.reduce((s, e) => s + (e.scoreN1 ?? 0), 0) / withBoth.length).toFixed(2)) : null;
    const avgDelta     = withBoth.length > 0 ? parseFloat((withBoth.reduce((s, e) => s + (e.delta ?? 0), 0) / withBoth.length).toFixed(2)) : null;

    return res.json({
      year,
      prevYear,
      employees,
      summary: {
        totalEmployees: employees.length,
        evaluatedN:     evaluated.length,
        withBoth:       withBoth.length,
        avgN,
        avgN1,
        avgDelta,
        improvedCount:  withBoth.filter(e => (e.delta ?? 0) > 0.5).length,
        declinedCount:  withBoth.filter(e => (e.delta ?? 0) < -0.5).length,
        stableCount:    withBoth.filter(e => Math.abs(e.delta ?? 0) <= 0.5).length,
        newCount:       employees.filter(e => e.trend === 'new').length,
        pendingCount:   employees.filter(e => e.trend === 'pending').length,
      }
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
