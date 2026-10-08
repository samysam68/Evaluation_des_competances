"use strict";
// Script de synchronisation de la base à partir du fichier Excel RH.
//
// Usage :
//   npm run import                          → aperçu (aucune écriture en base)
//   npm run import -- --apply               → applique les ajouts/mises à jour
//   npm run import -- --apply --deactivate  → applique aussi la désactivation
//                                              des personnes absentes du fichier
//   npm run import -- "C:\chemin\vers\fichier.xlsx" --apply
//
// Par défaut, le script lit "Collaborateurs Actualisable - V e talent.xlsx"
// à la racine du projet (à côté de backend/ et frontend/).
Object.defineProperty(exports, "__esModule", { value: true });
const excelSync_service_1 = require("./services/excelSync.service");
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const deactivateMissing = args.includes('--deactivate');
const fileArg = args.find(a => !a.startsWith('--'));
async function main() {
    const filePath = fileArg || excelSync_service_1.DEFAULT_EXCEL_FILE;
    console.log(`Lecture de : ${filePath}`);
    const result = await (0, excelSync_service_1.syncFromExcel)({ apply, deactivateMissing, filePath });
    console.log(`${result.totalRows} ligne(s) trouvée(s) dans le fichier.\n`);
    console.log('── Résumé ──────────────────────────────────────────');
    console.log(`Lignes ignorées (sans nom)     : ${result.skippedNoNom}`);
    console.log(`Nouveaux collaborateurs        : ${result.added}`);
    console.log(`Collaborateurs à mettre à jour : ${result.updated}`);
    console.log(`Collaborateurs absents du fichier (désactivables) : ${result.deactivatable}${deactivateMissing ? '' : '  [non désactivés — ajoutez --deactivate pour les désactiver]'}`);
    console.log('');
    if (!apply) {
        console.log('Mode aperçu — aucune donnée n\'a été modifiée en base.');
        console.log('Relancez avec --apply pour appliquer ces changements (et --deactivate pour désactiver les absents).');
    }
    else {
        console.log(`✓ Synchronisation appliquée : ${result.added} ajouté(s), ${result.updated} mis à jour${deactivateMissing ? `, ${result.deactivated} désactivé(s)` : ''}.`);
    }
}
main()
    .then(() => process.exit(0))
    .catch(err => { console.error('✗ Erreur :', err); process.exit(1); });
