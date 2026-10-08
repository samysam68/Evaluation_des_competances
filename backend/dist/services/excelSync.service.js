"use strict";
// Logique de synchronisation base ↔ fichier Excel RH, partagée entre :
//  - le script CLI (src/importExcel.ts, `npm run import`)
//  - l'endpoint SuperAdmin "Actualiser" (routes/admin.routes.ts)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_EXCEL_FILE = void 0;
exports.syncFromExcel = syncFromExcel;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const xlsx_1 = __importDefault(require("xlsx"));
const database_1 = require("../database");
const importHelpers_1 = require("../utils/importHelpers");
exports.DEFAULT_EXCEL_FILE = path_1.default.join(__dirname, '..', '..', '..', 'Collaborateurs Actualisable - V e talent.xlsx');
async function syncFromExcel(opts = {}) {
    const apply = !!opts.apply;
    const deactivateMissing = !!opts.deactivateMissing;
    const filePath = opts.filePath || exports.DEFAULT_EXCEL_FILE;
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`Fichier introuvable : ${filePath}`);
    }
    const wb = xlsx_1.default.readFile(filePath, { cellDates: true });
    const data = xlsx_1.default.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
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
    const processedIds = new Set();
    let idx = 0;
    let skippedNoNom = 0;
    for (const row of data) {
        idx++;
        const nom = (row['Nom'] || '').toString().trim();
        if (!nom) {
            skippedNoNom++;
            continue;
        }
        const matricule = ((0, importHelpers_1.getField)(row, 'Matricule', 'Matricul') || '').toString().trim();
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
            ? (0, importHelpers_1.normalizeExcelDate)(row['DateRecrutement'])
            : (row['DateRecrutement'] ? (0, importHelpers_1.normalizeExcelDate)(new Date(row['DateRecrutement'])) : null);
        const newData = {
            matricule: matricule || null,
            nom,
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
            role: (0, importHelpers_1.deduceRole)(categorie, poste),
            evalType: (0, importHelpers_1.deduceEvalType)(categorie),
        };
        const existing = (0, importHelpers_1.resolveExistingUser)({ byMatricule, byAD, byName, matricule, adUsername, hadRealAD, nom, prenom: newData.prenom });
        if (!existing) {
            addedDetails.push({ matricule: newData.matricule, name: `${newData.prenom} ${newData.nom}`, poste: newData.poste, role: newData.role });
            if (apply) {
                try {
                    const defaultPassword = await bcryptjs_1.default.hash('1234', 10);
                    await db.run(`INSERT INTO users (matricule,nom,prenom,actif,pole,direction,departement,service,poste,activeDirectory,responsable1,responsable2,responsable3,categorie,dateRecrutement,email,role,evalType,password)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [newData.matricule, newData.nom, newData.prenom, newData.actif, newData.pole, newData.direction,
                        newData.departement, newData.service, newData.poste, newData.activeDirectory, newData.responsable1,
                        newData.responsable2, newData.responsable3, newData.categorie, newData.dateRecrutement, newData.email,
                        newData.role, newData.evalType, defaultPassword]);
                }
                catch { /* skip duplicates */ }
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
        await db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('lastExcelImport', ?)`, [new Date().toISOString()]);
    }
    return {
        filePath,
        totalRows: data.length,
        skippedNoNom,
        added: addedDetails.length,
        updated: updatedDetails.length,
        deactivatable: toDeactivate.length,
        deactivated,
        applied: apply,
        addedDetails,
        updatedDetails,
        deactivatedDetails,
    };
}
