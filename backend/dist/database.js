"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
let dbInstance = null;
async function getDb() {
    if (dbInstance)
        return dbInstance;
    dbInstance = await (0, sqlite_1.open)({
        filename: path_1.default.join(__dirname, '..', 'database.sqlite'),
        driver: sqlite3_1.default.Database
    });
    await dbInstance.run('PRAGMA foreign_keys = ON');
    await dbInstance.run('PRAGMA journal_mode = WAL'); // écritures simultanées x10
    await dbInstance.run('PRAGMA synchronous = NORMAL'); // bon compromis perf/sécurité
    await dbInstance.run('PRAGMA cache_size = -32000'); // cache 32 Mo en RAM
    await dbInstance.run('PRAGMA temp_store = MEMORY'); // tri/index en RAM
    await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users ( 
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matricule TEXT,
      nom TEXT,
      prenom TEXT,
      actif BOOLEAN,
      pole TEXT,
      direction TEXT,
      departement TEXT,
      service TEXT,
      poste TEXT,
      activeDirectory TEXT UNIQUE,
      responsable1 TEXT,
      responsable2 TEXT,
      responsable3 TEXT,
      categorie TEXT,
      dateRecrutement TEXT,
      email TEXT,
      role TEXT
    );
    
    CREATE TABLE IF NOT EXISTS delegations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      targetUserId INTEGER,
      delegatedToUserId INTEGER,
      delegatedByUserId INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS history_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actorId INTEGER,
      actorName TEXT,
      actorRole TEXT,
      department TEXT,
      type TEXT,
      action TEXT,
      target TEXT,
      toTarget TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      targetUserId INTEGER,
      evaluatorId INTEGER,
      type TEXT,
      ratings TEXT,
      tasks TEXT,
      strengths TEXT,
      weaknesses TEXT,
      trainingNeeds TEXT,
      recommendation TEXT,
      otherData TEXT,
      globalScore REAL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(targetUserId) REFERENCES users(id),
      FOREIGN KEY(evaluatorId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    -- Historique des relances RH (rappels envoyés aux directeurs en retard sur
    -- leurs évaluations) : sert à afficher le nombre de relances et la date de
    -- la dernière, en plus de la notification in-app et de l'email envoyés.
    CREATE TABLE IF NOT EXISTS manager_relances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      managerId INTEGER NOT NULL,
      sentBy INTEGER,
      sentAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(managerId) REFERENCES users(id)
    );
  `);
    await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
    // Migrations: add columns if not already present
    await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS feedback_360 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      targetUserId INTEGER NOT NULL,
      requestedBy INTEGER NOT NULL,
      respondentId INTEGER NOT NULL,
      message TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      ratings TEXT,
      comment TEXT,
      globalScore REAL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      submittedAt DATETIME,
      FOREIGN KEY(targetUserId) REFERENCES users(id),
      FOREIGN KEY(requestedBy) REFERENCES users(id),
      FOREIGN KEY(respondentId) REFERENCES users(id)
    );
  `);
    try {
        await dbInstance.run(`ALTER TABLE notifications ADD COLUMN link TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN password TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN status TEXT DEFAULT 'Soumise'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN evalType TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN rhComment TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN validatedAt TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN validatedBy INTEGER`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN rhFinalScore REAL`);
    }
    catch { /* already exists */ }
    // Année de campagne sur chaque évaluation
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN campaignYear INTEGER`);
    }
    catch { /* already exists */ }
    // Décision RH (renseignée lors de la validation RH, pas par l'évaluateur)
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN rhDecision TEXT`);
    }
    catch { /* already exists */ }
    // Retour employé après validation RH : 'satisfait' | 'moyen' | 'non_satisfait'
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN employeeFeedback TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE evaluations ADD COLUMN employeeFeedbackAt TEXT`);
    }
    catch { /* already exists */ }
    // Première connexion obligatoire : changement de mot de passe
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN mustChangePassword INTEGER DEFAULT 1`);
    }
    catch { /* already exists */ }
    // Mot de passe par défaut "1234" uniquement pour les comptes sans mot de passe (pas de réinitialisation des comptes verrouillés)
    const noPasswordCount = await dbInstance.get(`SELECT COUNT(*) as c FROM users WHERE password IS NULL`);
    if (noPasswordCount?.c > 0) {
        const defaultHash = await bcryptjs_1.default.hash('1234', 10);
        await dbInstance.run(`UPDATE users SET password = ?, mustChangePassword = 1 WHERE password IS NULL`, [defaultHash]);
    }
    // Index sur les colonnes les plus interrogées (performances)
    await dbInstance.exec(`
    CREATE INDEX IF NOT EXISTS idx_evals_target   ON evaluations(targetUserId);
    CREATE INDEX IF NOT EXISTS idx_evals_evaluator ON evaluations(evaluatorId);
    CREATE INDEX IF NOT EXISTS idx_evals_status   ON evaluations(status);
    CREATE INDEX IF NOT EXISTS idx_evals_year     ON evaluations(campaignYear);
    CREATE INDEX IF NOT EXISTS idx_evals_created  ON evaluations(createdAt);
    CREATE INDEX IF NOT EXISTS idx_notif_user     ON notifications(userId);
    CREATE INDEX IF NOT EXISTS idx_users_resp1    ON users(responsable1);
    CREATE INDEX IF NOT EXISTS idx_users_actif    ON users(actif);
  `);
    // Photo de profil (organigramme)
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN photo TEXT`);
    }
    catch { /* already exists */ }
    // RGPD
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN anonymized INTEGER DEFAULT 0`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN anonymizedAt TEXT`);
    }
    catch { /* already exists */ }
    await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS fiches_poste (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Identification du poste
      intitule                    TEXT NOT NULL,
      direction                   TEXT,
      departement                 TEXT,
      service                     TEXT,
      localisation                TEXT DEFAULT 'LDM Groupe — Alger',
      statut                      TEXT,
      categorie                   TEXT,
      coefficient                 TEXT,
      reference                   TEXT,
      rattachementHierarchique    TEXT,
      -- Mission
      missionPrincipale           TEXT,
      -- Activités (JSON arrays)
      activitesPrincipales        TEXT DEFAULT '[]',
      activitesSecondaires        TEXT DEFAULT '[]',
      -- Relations de travail
      relationsInternes           TEXT DEFAULT '[]',
      relationsExternes           TEXT DEFAULT '[]',
      -- Profil requis
      formationRequise            TEXT,
      specialite                  TEXT,
      experienceRequise           TEXT,
      competencesTechniques       TEXT DEFAULT '[]',
      competencesComportementales TEXT DEFAULT '[]',
      langues                     TEXT DEFAULT '[]',
      outils                      TEXT DEFAULT '[]',
      -- Conditions de travail
      horaires                    TEXT DEFAULT 'Temps plein — 8h/jour',
      lieuTravail                 TEXT DEFAULT 'Alger',
      conditionsParticulieres     TEXT,
      -- Indicateurs de performance (JSON array)
      indicateursPerformance      TEXT DEFAULT '[]',
      -- Métadonnées
      createdBy                   INTEGER,
      createdAt                   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt                   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );
  `);
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN fichePosteId INTEGER REFERENCES fiches_poste(id)`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN fichePosteFile TEXT`);
    }
    catch { /* already exists */ }
    // Nouvelles colonnes fiche de poste (template LDM exact)
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN codePosition TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN codeSysteme TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN versionFichePoste TEXT DEFAULT '01'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN dateCreation TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN subordonneesDirect TEXT DEFAULT 'NA'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN tachesInterimaires TEXT DEFAULT '[]'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN activitesSMI TEXT DEFAULT '[]'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN autorites TEXT DEFAULT '[]'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN autreQualite TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN exigencesParticulieres TEXT DEFAULT '[]'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN savoirFaire TEXT DEFAULT '[]'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN savoirEtre TEXT DEFAULT '[]'`);
    }
    catch { /* already exists */ }
    // Workflow de validation fiche de poste
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN ficheStatus TEXT DEFAULT 'brouillon'`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN validatedBy INTEGER`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN validatedAt TEXT`);
    }
    catch { /* already exists */ }
    try {
        await dbInstance.run(`ALTER TABLE fiches_poste ADD COLUMN validationComment TEXT`);
    }
    catch { /* already exists */ }
    await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS fiche_poste_delegations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      delegatedBy INTEGER NOT NULL,
      delegatedTo INTEGER NOT NULL,
      direction   TEXT,
      departement TEXT,
      createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
      revokedAt   DATETIME,
      FOREIGN KEY (delegatedBy) REFERENCES users(id),
      FOREIGN KEY (delegatedTo) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_fiches_poste_intitule ON fiches_poste(intitule);
    CREATE INDEX IF NOT EXISTS idx_fp_delegations_to ON fiche_poste_delegations(delegatedTo);
  `);
    await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS rgpd_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      targetUserId INTEGER,
      targetNameSnapshot TEXT,
      performedBy INTEGER,
      performedByName TEXT,
      details TEXT,
      performedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
    // Accès à l'espace RH accordé individuellement par le SuperAdmin (indépendant du rôle)
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN rhAccess INTEGER DEFAULT 0`);
    }
    catch { /* already exists */ }
    // Accès à l'organigramme accordé individuellement par le SuperAdmin — module
    // désormais restreint (ex. au manager RH), et non plus ouvert à tous.
    try {
        await dbInstance.run(`ALTER TABLE users ADD COLUMN orgChartAccess INTEGER DEFAULT 0`);
    }
    catch { /* already exists */ }
    // Paramètres par défaut des modules — V1.0 : la Fiche de Poste est désactivée
    // à l'activation, seul le SuperAdmin peut la réactiver. Le Feedback 360°
    // reste actif par défaut mais peut être désactivé par le SuperAdmin.
    const moduleDefaults = {
        module_fichePoste_enabled: '0',
        module_feedback_enabled: '1',
        appName: 'Talents',
    };
    for (const [key, value] of Object.entries(moduleDefaults)) {
        await dbInstance.run(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`, [key, value]);
    }
    return dbInstance;
}
