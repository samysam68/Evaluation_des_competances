// Catégorie socioprofessionnelle affichée sans le qualificatif (Junior/Moyen/Supérieur) :
// "Cadre Junior" / "Cadre Moyen" / "Cadre Superieur" → "Cadre". Les autres catégories
// (Maîtrise, Exécution...) sont déjà affichées telles quelles.
export function displayCategorie(categorie?: string | null): string {
  if (!categorie) return '';
  return categorie.trim().toLowerCase().startsWith('cadre') ? 'Cadre' : categorie;
}

// SQLite stocke CURRENT_TIMESTAMP en UTC sous la forme "YYYY-MM-DD HH:MM:SS", sans
// indicateur de fuseau. `new Date(...)` sur cette chaîne l'interprète à tort comme
// une heure locale du navigateur, d'où le décalage observé entre les notifications
// de la plateforme et les e-mails (générés côté serveur en Africa/Algiers). On force
// ici l'interprétation UTC avant de reformater vers le fuseau Algérie.
export function parseSqliteUTC(value: string): Date {
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
}

export function formatAlgeriaDateTime(value: string, options: Intl.DateTimeFormatOptions): string {
  return parseSqliteUTC(value).toLocaleDateString('fr-FR', { ...options, timeZone: 'Africa/Algiers' });
}
