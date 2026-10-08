// Logique partagée entre l'import Excel de la console SuperAdmin (admin.routes.ts)
// et le script en ligne de commande (importExcel.ts), pour éviter toute divergence.

// Libellés lisibles des champs comparés lors d'une synchronisation (Excel ou API RH),
// utilisés pour afficher un avant/après compréhensible côté SuperAdmin.
export const FIELD_LABELS: Record<string, string> = {
  matricule: 'Matricule',
  nom: 'Nom',
  prenom: 'Prénom',
  direction: 'Direction',
  departement: 'Département',
  service: 'Service',
  poste: 'Poste',
  categorie: 'Catégorie',
  role: 'Rôle',
  evalType: "Type d'évaluation",
  actif: 'Actif',
  email: 'Email',
};

export function deduceEvalType(categorie: string): string {
  const c = (categorie || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (c === 'execution' || c.startsWith('exec')) return 'Exécutions';
  return 'Cadres & Maîtrises';
}

export function deduceRole(categorie: string, poste: string): string {
  const p = (poste || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const c = (categorie || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (p.includes('manager ressources humaines') || p.includes('drh') || p.includes('directeur des ressources humaines') || p.includes('directrice des ressources humaines')) return 'RH';
  if (p.includes('directeur') || p.includes('directrice') || p.includes('dir.') || c.includes('direction') || c.includes('directeur')) return 'Directeur';
  if (p.includes('manager') || c.includes('superieur') || c.includes('cadre superieur')) return 'Manager';
  if (p.includes('responsable') || p.includes('chef de') || p.includes('chef du') || c.includes('responsable')) return 'Responsable';
  if (p.includes('superviseur')) return 'Superviseur';
  if (c.includes('moyen') || c.includes('junior') || c.includes('cadre') || p.includes('charge de') || p.includes('coordinateur')) return 'Gestionnaire';
  return 'Employe';
}

// Certains exports (ex. requêtes Access/Power Query) ont des intitulés de colonne
// légèrement différents d'un export à l'autre (ex. "Matricul" au lieu de
// "Matricule"). On essaie plusieurs noms possibles dans l'ordre et on retourne
// la première valeur non vide trouvée.
export function getField(row: Record<string, any>, ...keys: string[]): any {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// SheetJS (xlsx, option `cellDates: true`) décode les dates Excel en interprétant
// le numéro de série comme un instant UTC. Le fichier RH source encode ses dates
// avec un léger résidu d'heure (souvent proche de 23h, ex. "22:59:25") au lieu
// d'un minuit net — probablement un artefact d'arrondi flottant hérité du système
// source (export Access/Power Query avec un décalage horaire local figé dans le
// nombre). Résultat : converti tel quel en ISO, la date affichée tombe un jour
// trop tôt. On corrige à la source, une fois pour toutes, en arrondissant au jour
// UTC le plus proche (plutôt que de tronquer) — ce qui restitue le bon jour civil
// sans qu'aucun écran d'affichage n'ait besoin d'un correctif "+1 jour".
export function normalizeExcelDate(d: Date): string {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const rounded = Math.round(d.getTime() / DAY_MS) * DAY_MS;
  return new Date(rounded).toISOString();
}

export function nameKey(nom: string, prenom: string): string {
  return `${(nom || '').trim().toLowerCase()}|${(prenom || '').trim().toLowerCase()}`;
}

// Construit un index nom+prénom -> utilisateur, en excluant les homonymes
// (deux personnes différentes portant le même nom et prénom) pour éviter
// tout rapprochement ambigu.
export function buildNameIndex(users: any[]): Record<string, any> {
  const counts: Record<string, number> = {};
  users.forEach(u => {
    const k = nameKey(u.nom, u.prenom);
    counts[k] = (counts[k] || 0) + 1;
  });
  const index: Record<string, any> = {};
  users.forEach(u => {
    const k = nameKey(u.nom, u.prenom);
    if (counts[k] === 1) index[k] = u;
  });
  return index;
}

// Retrouve l'utilisateur existant correspondant à une ligne du fichier Excel.
// Ordre de priorité : matricule exact → identifiant AD exact → à défaut (si la
// ligne n'avait pas de véritable identifiant AD, ex. "N/A"), nom + prénom
// exacts, uniquement lorsque ce nom n'est pas ambigu dans la base. Ce dernier
// repli est nécessaire car l'identifiant AD généré automatiquement pour les
// collaborateurs sans compte AD dépend de leur position dans le fichier et
// change donc d'un export à l'autre — sans repli sur le nom, ces personnes
// seraient recréées en double à chaque synchronisation.
export function resolveExistingUser(opts: {
  byMatricule: Record<string, any>;
  byAD: Record<string, any>;
  byName: Record<string, any>;
  matricule: string;
  adUsername: string;
  hadRealAD: boolean;
  nom: string;
  prenom: string;
}): any {
  const { byMatricule, byAD, byName, matricule, adUsername, hadRealAD, nom, prenom } = opts;
  if (matricule && byMatricule[matricule]) return byMatricule[matricule];
  const byADMatch = byAD[adUsername.toLowerCase()];
  if (byADMatch) return byADMatch;
  if (!hadRealAD) {
    const match = byName[nameKey(nom, prenom)];
    if (match) return match;
  }
  return undefined;
}
