// Logique de synchronisation base ↔ fichier Excel RH, partagée entre :
//  - le script CLI (src/importExcel.ts, `npm run import`)
//  - l'endpoint SuperAdmin "Actualiser" (routes/admin.routes.ts)

import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import xlsx from 'xlsx';
import { getDb } from '../database';
import {
  deduceRole, deduceEvalType, getField, buildNameIndex, resolveExistingUser, normalizeExcelDate, FIELD_LABELS,
} from '../utils/importHelpers';

export const DEFAULT_EXCEL_FILE = path.join(__dirname, '..', '..', '..', 'Collaborateurs Actualisable - V e talent.xlsx');

export interface SyncOptions {
  apply?: boolean;
  deactivateMissing?: boolean;
  filePath?: string;
}

export interface FieldChange {
  field: string;
  label: string;
  before: any;
  after: any;
}

export interface AddedUserDetail {
  matricule: string | null;
  name: string;
  poste: string | null;
  role: string;
}

export interface UpdatedUserDetail {
  id: number;
  matricule: string | null;
  name: string;
  changes: FieldChange[];
}

export interface DeactivatedUserDetail {
  id: number;
  matricule: string | null;
  name: string;
  poste: string | null;
}

export interface SyncResult {
  filePath: string;
  totalRows: number;
  skippedNoNom: number;
  added: number;
  updated: number;
  deactivatable: number;
  deactivated: number;
  applied: boolean;
  addedDetails: AddedUserDetail[];
  updatedDetails: UpdatedUserDetail[];
  deactivatedDetails: DeactivatedUserDetail[];
}

export async function syncFromExcel(opts: SyncOptions = {}): Promise<SyncResult> {
  const apply = !!opts.apply;
  const deactivateMissing = !!opts.deactivateMissing;
  const filePath = opts.filePath || DEFAULT_EXCEL_FILE;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable : ${filePath}`);
  }

  const wb = xlsx.readFile(filePath, { cellDates: true });
  const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];

  const db = await getDb();
  const dbUsers = await db.all(`SELECT * FROM users WHERE role != 'SuperAdmin'`);
  const byMatricule: Record<string, any> = {};
  const byAD: Record<string, any> = {};
  dbUsers.forEach((u: any) => {
    if (u.matricule) byMatricule[u.matricule] = u;
    if (u.activeDirectory) byAD[u.activeDirectory.toLowerCase()] = u;
  });
  const byName = buildNameIndex(dbUsers);

  const addedDetails: AddedUserDetail[] = [];
  const updatedDetails: UpdatedUserDetail[] = [];
  const processedIds = new Set<number>();
  let idx = 0;
  let skippedNoNom = 0;

  for (const row of data) {
    idx++;
    const nom = (row['Nom'] || '').toString().trim();
    if (!nom) { skippedNoNom++; continue; }

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
      role: deduceRole(categorie, poste),
      evalType: deduceEvalType(categorie),
    };

    const existing = resolveExistingUser({ byMatricule, byAD, byName, matricule, adUsername, hadRealAD, nom, prenom: newData.prenom });

    if (!existing) {
      addedDetails.push({ matricule: newData.matricule, name: `${newData.prenom} ${newData.nom}`, poste: newData.poste, role: newData.role });
      if (apply) {
        try {
          const defaultPassword = await bcrypt.hash('1234', 10);
          await db.run(
            `INSERT INTO users (matricule,nom,prenom,actif,pole,direction,departement,service,poste,activeDirectory,responsable1,responsable2,responsable3,categorie,dateRecrutement,email,role,evalType,password)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [newData.matricule, newData.nom, newData.prenom, newData.actif, newData.pole, newData.direction,
             newData.departement, newData.service, newData.poste, newData.activeDirectory, newData.responsable1,
             newData.responsable2, newData.responsable3, newData.categorie, newData.dateRecrutement, newData.email,
             newData.role, newData.evalType, defaultPassword]
          );
        } catch { /* skip duplicates */ }
      }
    } else {
      processedIds.add(existing.id);
      const matriculeToWrite = newData.matricule || existing.matricule;
      const fieldsToCheck = ['matricule', 'nom', 'prenom', 'direction', 'departement', 'service', 'poste', 'categorie', 'role', 'evalType', 'actif', 'email'] as const;
      const comparable = { ...newData, matricule: matriculeToWrite };
      const changed = fieldsToCheck.filter(f => (existing[f] || '') !== ((comparable as any)[f] || ''));
      if (changed.length > 0) {
        updatedDetails.push({
          id: existing.id,
          matricule: matriculeToWrite,
          name: `${newData.prenom} ${newData.nom}`,
          changes: changed.map(f => ({
            field: f,
            label: FIELD_LABELS[f] || f,
            before: (existing as any)[f],
            after: (comparable as any)[f],
          })),
        });
        if (apply) {
          await db.run(
            `UPDATE users SET matricule=?,nom=?,prenom=?,actif=?,pole=?,direction=?,departement=?,service=?,poste=?,responsable1=?,responsable2=?,responsable3=?,categorie=?,dateRecrutement=?,email=?,role=?,evalType=? WHERE id=?`,
            [matriculeToWrite, newData.nom, newData.prenom, newData.actif, newData.pole, newData.direction, newData.departement,
             newData.service, newData.poste, newData.responsable1, newData.responsable2, newData.responsable3,
             newData.categorie, newData.dateRecrutement, newData.email, newData.role, newData.evalType, existing.id]
          );
        }
      }
    }
  }

  const toDeactivate = dbUsers.filter((u: any) => !processedIds.has(u.id) && u.actif === 1);
  const deactivatedDetails: DeactivatedUserDetail[] = toDeactivate.map((u: any) => ({
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
