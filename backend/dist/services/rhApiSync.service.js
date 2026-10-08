"use strict";
// Logique de synchronisation base ↔ API RH externe (lecture seule), miroir de
// excelSync.service.ts mais avec l'API RH (http://192.168.0.44/api) comme
// source au lieu du fichier Excel. Partagée avec l'endpoint SuperAdmin
// "Synchroniser depuis l'API" (routes/admin.routes.ts).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncFromRhApi = syncFromRhApi;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../database");
const importHelpers_1 = require("../utils/importHelpers");
// On ne demande que les champs réellement utilisés par la table users : une
// requête non filtrée transporte les 27 champs de ~2900 employés pour rien.
const EMPLOYEE_FIELDS = [
    'matricule', 'nom', 'prenom', 'actif', 'pole', 'direction', 'departement',
    'service', 'poste', 'active_directory', 'responsable1', 'responsable2',
    'responsable3', 'categorie', 'date_recrutement', 'email',
].join(',');
// L'API renvoie la date au format AAAA-MM-JJ, sans heure ni fuseau — contrairement
// à l'export Excel, aucun résidu d'heure à corriger : on fixe juste minuit UTC.
function toIsoDate(d) {
    if (!d)
        return null;
    const parsed = new Date(`${d}T00:00:00.000Z`);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
async function syncFromRhApi(opts) {
    const apply = !!opts.apply;
    const deactivateMissing = !!opts.deactivateMissing;
    const base = opts.apiUrl.replace(/\/+$/, '');
    const headers = { Accept: 'application/json' };
    if (opts.apiKey)
        headers['Authorization'] = `Bearer ${opts.apiKey}`;
    const url = `${base}/employees?mode=clean&fields=${EMPLOYEE_FIELDS}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json || json.success !== true) {
        throw new Error(json?.message || `L'API RH a répondu ${response.status}`);
    }
    const rows = json.data;
    const db = await (0, database_1.getDb)();
    const dbUsers = await db.all(`SELECT * FROM users WHERE role != 'SuperAdmin'`);
    const byMatricule = {};
    const byAD = {};
    dbUsers.forEach((u) => {
        if (u.matricule)
            byMatricule[u.matricule] = u;
        if (u.activeDirectory)
            byAD[u.activeDirectory.toLowerCase()] = u;
    });
    const byName = (0, importHelpers_1.buildNameIndex)(dbUsers);
    const addedDetails = [];
    const updatedDetails = [];
    const failedDetails = [];
    const processedIds = new Set();
    let idx = 0;
    let skippedNoNom = 0;
    for (const row of rows) {
        idx++;
        const nom = (row.nom || '').toString().trim();
        if (!nom) {
            skippedNoNom++;
            continue;
        }
        const matricule = (row.matricule || '').toString().trim();
        let adUsername = (row.active_directory || '').toString().trim();
        // La doc décrit un champ null en l'absence de compte AD, mais l'API renvoie en
        // pratique la chaîne littérale "N/A" (ou "NA") pour ~580 employés — non filtrée,
        // elle romprait la contrainte UNIQUE sur activeDirectory (tous se disputeraient
        // la même valeur "N/A" à l'insertion, écrasant silencieusement les suivants).
        const hadRealAD = !!adUsername && adUsername.toLowerCase() !== 'n/a' && adUsername.toLowerCase() !== 'na';
        if (!hadRealAD) {
            adUsername = `${row.prenom}.${row.nom}${idx}`.toLowerCase().replace(/\s+/g, '');
        }
        const categorie = row.categorie || '';
        const poste = row.poste || '';
        const actif = row.actif === true ? 1 : 0;
        const newData = {
            matricule: matricule || null,
            nom,
            prenom: row.prenom || '',
            actif,
            pole: row.pole || null,
            direction: row.direction || null,
            departement: row.departement || null,
            service: row.service || null,
            poste,
            activeDirectory: adUsername,
            responsable1: row.responsable1 || null,
            responsable2: row.responsable2 || null,
            responsable3: row.responsable3 || null,
            categorie,
            dateRecrutement: toIsoDate(row.date_recrutement),
            email: row.email || null,
            role: (0, importHelpers_1.deduceRole)(categorie, poste),
            evalType: (0, importHelpers_1.deduceEvalType)(categorie),
        };
        const existing = (0, importHelpers_1.resolveExistingUser)({ byMatricule, byAD, byName, matricule, adUsername, hadRealAD, nom, prenom: newData.prenom });
        if (!existing) {
            const detail = { matricule: newData.matricule, name: `${newData.prenom} ${newData.nom}`, poste: newData.poste, role: newData.role };
            if (apply) {
                try {
                    const defaultPassword = await bcryptjs_1.default.hash('1234', 10);
                    await db.run(`INSERT INTO users (matricule,nom,prenom,actif,pole,direction,departement,service,poste,activeDirectory,responsable1,responsable2,responsable3,categorie,dateRecrutement,email,role,evalType,password)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [newData.matricule, newData.nom, newData.prenom, newData.actif, newData.pole, newData.direction,
                        newData.departement, newData.service, newData.poste, newData.activeDirectory, newData.responsable1,
                        newData.responsable2, newData.responsable3, newData.categorie, newData.dateRecrutement, newData.email,
                        newData.role, newData.evalType, defaultPassword]);
                    addedDetails.push(detail);
                    // La ligne vient d'être insérée : les lignes suivantes de ce même lot dont
                    // l'AD réel coïnciderait (doublon dans la source RH elle-même) doivent la
                    // reconnaître comme "existante" plutôt que d'échouer silencieusement.
                    if (hadRealAD)
                        byAD[adUsername.toLowerCase()] = { ...newData, activeDirectory: adUsername };
                }
                catch (err) {
                    failedDetails.push({ matricule: newData.matricule, name: detail.name, reason: err?.message || 'Échec insertion (doublon probable)' });
                }
            }
            else {
                addedDetails.push(detail);
            }
        }
        else {
            processedIds.add(existing.id);
            const matriculeToWrite = newData.matricule || existing.matricule;
            const fieldsToCheck = ['matricule', 'nom', 'prenom', 'direction', 'departement', 'service', 'poste', 'categorie', 'role', 'evalType', 'actif', 'email'];
            const comparable = { ...newData, matricule: matriculeToWrite };
            const changed = fieldsToCheck.filter(f => (existing[f] || '') !== (comparable[f] || ''));
            if (changed.length > 0) {
                updatedDetails.push({
                    id: existing.id,
                    matricule: matriculeToWrite,
                    name: `${newData.prenom} ${newData.nom}`,
                    changes: changed.map(f => ({
                        field: f,
                        label: importHelpers_1.FIELD_LABELS[f] || f,
                        before: existing[f],
                        after: comparable[f],
                    })),
                });
                if (apply) {
                    await db.run(`UPDATE users SET matricule=?,nom=?,prenom=?,actif=?,pole=?,direction=?,departement=?,service=?,poste=?,responsable1=?,responsable2=?,responsable3=?,categorie=?,dateRecrutement=?,email=?,role=?,evalType=? WHERE id=?`, [matriculeToWrite, newData.nom, newData.prenom, newData.actif, newData.pole, newData.direction, newData.departement,
                        newData.service, newData.poste, newData.responsable1, newData.responsable2, newData.responsable3,
                        newData.categorie, newData.dateRecrutement, newData.email, newData.role, newData.evalType, existing.id]);
                }
            }
        }
    }
    const toDeactivate = dbUsers.filter((u) => !processedIds.has(u.id) && u.actif === 1);
    const deactivatedDetails = toDeactivate.map((u) => ({
        id: u.id, matricule: u.matricule, name: `${u.prenom} ${u.nom}`, poste: u.poste,
    }));
    let deactivated = 0;
    if (apply && deactivateMissing) {
        for (const u of toDeactivate) {
            await db.run(`UPDATE users SET actif = 0 WHERE id = ?`, [u.id]);
            deactivated++;
        }
    }
    if (apply) {
        await db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('lastApiSync', ?)`, [new Date().toISOString()]);
    }
    return {
        totalRows: rows.length,
        skippedNoNom,
        added: addedDetails.length,
        updated: updatedDetails.length,
        deactivatable: toDeactivate.length,
        deactivated,
        failed: failedDetails.length,
        applied: apply,
        addedDetails,
        updatedDetails,
        deactivatedDetails,
        failedDetails,
    };
}
