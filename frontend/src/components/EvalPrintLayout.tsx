import React from 'react';
import { EVAL_LEVELS, RatingsMap } from '../constants/evaluationForms';
import { getNote as getPerformanceNote } from './PerformanceTable';

interface PrintCriterionItem { id: string; label: string; description?: string; }
interface PrintSection { title: string; items: PrintCriterionItem[]; avg: number; }
interface PrintTaskRow { id: number; task: string; status: string; plan: string; rating: number; }
/** Bloc d'une section de compétences (A, B, C, D, E...), dans l'ordre exact
 *  d'impression voulu — un bloc « criteria » (table de critères notés) ou
 *  « tasks » (tableau de tâches spécifiques au poste), à la position qui lui
 *  revient plutôt que toujours en dernier. */
type PrintBlock =
  | ({ type: 'criteria' } & PrintSection)
  | { type: 'tasks'; title: string; rows: PrintTaskRow[]; avg: number };
interface PrintTrainingRow { id: number; intitule: string; typeFormation: string; organisme: string; modalite: string; joursPrevisionnels: string; budget: string; periode: string; priorite: string; }
interface PrintPlanDevRow { id: number; point: string; action: string; responsable: string; echeance: string; statut: string; }
interface PrintObjectifRow { id: number; objectif: string; kpi: string; cible: string; resultat: string; poids: number; }
interface SynthesisRow { label: string; pct: number; avg: number; }
interface IdentificationRow { label: string; value: string; fullWidth?: boolean; }

interface EvalPrintLayoutProps {
  type: string;
  globalScore: number;

  /** Lignes de la Partie I, dans le même ordre et le même emplacement que sur
   *  l'écran du formulaire — deux colonnes label/valeur par ligne, sauf `fullWidth`. */
  identificationRows: IdentificationRow[];

  /** Sections de compétences (A, B, C, D, E...) dans l'ordre exact d'impression —
   *  chaque bloc est soit une table de critères notés, soit le tableau de tâches
   *  spécifiques au poste, à sa position alphabétique réelle. */
  blocks: PrintBlock[];
  ratings: RatingsMap;

  /** Évaluation de la performance (objectifs / KPI). */
  objectives?: PrintObjectifRow[];
  avgPerf?: number;

  /** Tableau de synthèse (mêmes lignes que celles affichées à l'écran). */
  synthesisRows: SynthesisRow[];

  trainingNeeds: string;
  recommendation: string;
  otherActions?: string;

  planDev: PrintPlanDevRow[];
  trainings: PrintTrainingRow[];

  /** Nom de l'utilisateur connecté qui déclenche l'impression/export. */
  printedBy?: string;
}

const th: React.CSSProperties = { padding: '4px 8px', textAlign: 'left', border: '1px solid #e2e8f0', background: '#f1f5f9' };
const thCenter: React.CSSProperties = { ...th, textAlign: 'center' };
const td: React.CSSProperties = { padding: '3px 8px', border: '1px solid #e2e8f0' };
const tdCenter: React.CSSProperties = { ...td, textAlign: 'center' };
const sectionTitle: React.CSSProperties = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b', margin: '0 0 6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' };
const sectionWrap: React.CSSProperties = { marginBottom: '10px', breakInside: 'avoid' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '10px' };

const TYPE_FORMATION_LABEL: Record<string, string> = { interne: 'Interne', externe: 'Externe' };
const PRIORITE_FORMATION_LABEL: Record<string, string> = { '1': '1 — Haute', '2': '2 — Moyenne', '3': '3 — Basse' };
const STATUT_COLOR: Record<string, string> = { 'Non démarré': '#94a3b8', 'En cours': '#f59e0b', 'Réalisé': '#10b981' };

export const EvalPrintLayout = React.forwardRef<HTMLDivElement, EvalPrintLayoutProps>(({
  type, globalScore,
  identificationRows,
  blocks, ratings, objectives, avgPerf,
  synthesisRows,
  trainingNeeds, recommendation, otherActions,
  planDev, trainings,
  printedBy,
}, ref) => {
  // Fuseau horaire forcé (Africa/Algiers) pour que l'horodatage d'impression reste
  // cohérent avec celui des e-mails générés côté serveur, quel que soit le fuseau
  // système du poste client.
  const now = new Date();
  const today = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Africa/Algiers' });
  const printedAtTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' });
  const scoreLabel = globalScore >= 16 ? 'Supérieur aux attentes' : globalScore >= 11 ? 'Satisfaisant' : globalScore >= 6 ? 'À améliorer' : 'Insatisfaisant';

  const formatDate = (d: string) => {
    if (!d) return '—';
    const parts = d.slice(0, 10).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  return (
    <div ref={ref} style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1e293b', padding: '20px 30px', maxWidth: '800px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #e11d48 0%, #f97316 100%)', color: 'white', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.8, margin: '0 0 4px' }}>Talents · LDM GROUPE</p>
          <h1 style={{ fontSize: '16px', fontWeight: 900, margin: '0 0 2px' }}>Fiche d'Évaluation — {type}</h1>
          <p style={{ fontSize: '10px', opacity: 0.85, margin: 0 }}>Document confidentiel · Exercice {new Date().getFullYear()}</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '10px', opacity: 0.9 }}>
          <p style={{ margin: '0 0 2px' }}>Imprimé le {today} à {printedAtTime}{printedBy ? ` par ${printedBy}` : ''}</p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{globalScore.toFixed(1)}<span style={{ fontSize: '11px', fontWeight: 400 }}>/20</span></p>
          <p style={{ margin: 0, fontSize: '9px', opacity: 0.8 }}>{scoreLabel}</p>
        </div>
      </div>

      {/* PARTIE I — Identification, dans le même ordre/emplacement que l'écran */}
      <div style={{ marginBottom: '12px', breakInside: 'avoid' }}>
        <h2 style={sectionTitle}>Partie I — Renseignements généraux</h2>
        <table style={table}>
          <tbody>
            {(() => {
              const trs: React.ReactNode[] = [];
              let i = 0;
              while (i < identificationRows.length) {
                const row = identificationRows[i];
                if (row.fullWidth) {
                  trs.push(
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: 700, background: '#f1f5f9', width: '22%' }}>{row.label}</td>
                      <td style={td} colSpan={3}>{row.value || '—'}</td>
                    </tr>
                  );
                  i += 1;
                } else {
                  const next = identificationRows[i + 1];
                  trs.push(
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: 700, background: '#f1f5f9', width: '22%' }}>{row.label}</td>
                      <td style={{ ...td, width: '28%' }}>{row.value || '—'}</td>
                      {next && !next.fullWidth ? (
                        <>
                          <td style={{ ...td, fontWeight: 700, background: '#f1f5f9', width: '22%' }}>{next.label}</td>
                          <td style={{ ...td, width: '28%' }}>{next.value || '—'}</td>
                        </>
                      ) : <td colSpan={2} style={td} />}
                    </tr>
                  );
                  i += (next && !next.fullWidth) ? 2 : 1;
                }
              }
              return trs;
            })()}
          </tbody>
        </table>
      </div>

      {/* PARTIE II — Sections de compétences (A, B, C, D, E...), dans l'ordre exact
          où elles apparaissent à l'écran — plus de tableau relégué en fin de page. */}
      {blocks.map((block, bidx) => {
        if (block.type === 'tasks') {
          const filledRows = block.rows.filter(t => t.task.trim());
          if (filledRows.length === 0) return null;
          return (
            <div key={bidx} style={sectionWrap}>
              <h2 style={sectionTitle}>{block.title} {block.avg > 0 && `— Moy. ${block.avg.toFixed(1)}/20`}</h2>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Activité / Tâche</th>
                    <th style={{ ...thCenter, width: '90px' }}>Statut</th>
                    <th style={{ ...thCenter, width: '60px' }}>Note</th>
                    <th style={{ ...th, width: '28%' }}>Plan de développement</th>
                  </tr>
                </thead>
                <tbody>
                  {filledRows.map((t, i) => (
                    <tr key={t.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={td}>{t.task}</td>
                      <td style={tdCenter}>{t.status || '—'}</td>
                      <td style={{ ...tdCenter, fontWeight: 700 }}>{t.rating > 0 ? `${t.rating}/20` : '—'}</td>
                      <td style={td}>{t.plan || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <div key={bidx} style={sectionWrap}>
            <h2 style={sectionTitle}>{block.title} {block.avg > 0 && `— Moy. ${block.avg.toFixed(1)}/20`}</h2>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '20%' }}>Critère</th>
                  <th style={{ ...th, width: '28%' }}>Définition</th>
                  <th style={{ ...thCenter, width: '10%' }}>Niveau</th>
                  <th style={{ ...thCenter, width: '8%' }}>Note</th>
                  <th style={th}>Action de formation – Plan de développement individuel</th>
                </tr>
              </thead>
              <tbody>
                {block.items.map((item, iidx) => {
                  const r = ratings[item.id];
                  const levelLabel = r?.level ? EVAL_LEVELS.find(l => l.key === r.level)?.label : null;
                  return (
                    <tr key={item.id} style={{ background: iidx % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={td}>{item.label}</td>
                      <td style={{ ...td, fontSize: '9px', color: '#64748b' }}>{item.description || '—'}</td>
                      <td style={tdCenter}>{levelLabel || '—'}</td>
                      <td style={{ ...tdCenter, fontWeight: 700 }}>{r?.note != null ? `${r.note}/20` : '—'}</td>
                      <td style={{ ...td, whiteSpace: 'pre-wrap' }}>{r?.justification || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* PARTIE III — Évaluation de la performance */}
      {objectives && objectives.filter(o => o.objectif.trim()).length > 0 && (
        <div style={sectionWrap}>
          <h2 style={sectionTitle}>Partie III — Évaluation de la performance {avgPerf != null && avgPerf > 0 && `— Moy. ${avgPerf.toFixed(1)}/20`}</h2>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Objectif</th>
                <th style={th}>Indicateur de performance KPI</th>
                <th style={thCenter}>Cible</th>
                <th style={thCenter}>Résultat</th>
                <th style={thCenter}>Poids %</th>
                <th style={thCenter}>Taux</th>
                <th style={thCenter}>Note</th>
              </tr>
            </thead>
            <tbody>
              {objectives.filter(o => o.objectif.trim()).map((o, i) => {
                const cible = parseFloat(o.cible);
                const resultat = parseFloat(o.resultat);
                const taux = !isNaN(cible) && cible !== 0 && !isNaN(resultat) ? Math.round((resultat / cible) * 100) : null;
                const note = taux !== null ? getPerformanceNote(taux) : null;
                return (
                  <tr key={o.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={td}>{o.objectif}</td>
                    <td style={td}>{o.kpi || '—'}</td>
                    <td style={tdCenter}>{o.cible || '—'}</td>
                    <td style={tdCenter}>{o.resultat || '—'}</td>
                    <td style={tdCenter}>{o.poids}%</td>
                    <td style={tdCenter}>{taux !== null ? `${taux}%` : '—'}</td>
                    <td style={{ ...tdCenter, fontWeight: 700 }}>{note !== null ? `${note}/20` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* PARTIE IV — Tableau de synthèse */}
      {synthesisRows.length > 0 && (
        <div style={sectionWrap}>
          <h2 style={sectionTitle}>Partie IV — Tableau de synthèse</h2>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Section</th>
                <th style={thCenter}>Pondération</th>
                <th style={thCenter}>Moyenne /20</th>
                <th style={thCenter}>Note pondérée</th>
              </tr>
            </thead>
            <tbody>
              {synthesisRows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={td}>{row.label}</td>
                  <td style={tdCenter}>{row.pct}%</td>
                  <td style={{ ...tdCenter, fontWeight: 700 }}>{row.avg > 0 ? row.avg.toFixed(1) : '—'}</td>
                  <td style={{ ...tdCenter, fontWeight: 700 }}>{row.avg > 0 ? ((row.avg * row.pct) / 100).toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#1e293b', color: 'white' }}>
                <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 900 }}>NOTE FINALE GLOBALE /20 :</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 900, fontSize: '13px' }}>{globalScore > 0 ? globalScore.toFixed(2) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Bilan qualitatif */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 16px', marginBottom: '10px', breakInside: 'avoid' }}>
        <h2 style={sectionTitle}>Partie V — Décisions et plan de développement</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {trainingNeeds && <div><strong style={{ fontSize: '10px', color: '#1d4ed8' }}>Besoins en formation :</strong><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{trainingNeeds}</p></div>}
          {otherActions && <div><strong style={{ fontSize: '10px', color: '#7c3aed' }}>Autres actions :</strong><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{otherActions}</p></div>}
        </div>
        {recommendation && <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}><strong>Appréciation globale de l'évaluateur :</strong><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{recommendation}</p></div>}
      </div>

      {/* Plan de développement individuel */}
      {planDev.filter(r => r.point.trim()).length > 0 && (
        <div style={sectionWrap}>
          <h2 style={sectionTitle}>Plan de développement individuel</h2>
          <table style={table}>
            <thead><tr>
              <th style={th}>Point / Écart</th>
              <th style={th}>Action</th>
              <th style={{ ...th, width: '90px' }}>Responsable</th>
              <th style={{ ...thCenter, width: '80px' }}>Échéance</th>
              <th style={{ ...thCenter, width: '80px' }}>Statut</th>
            </tr></thead>
            <tbody>{planDev.filter(r => r.point.trim()).map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={td}>{r.point}</td>
                <td style={td}>{r.action || '—'}</td>
                <td style={td}>{r.responsable || '—'}</td>
                <td style={tdCenter}>{formatDate(r.echeance)}</td>
                <td style={{ ...tdCenter, fontWeight: 700, color: STATUT_COLOR[r.statut] || '#64748b' }}>{r.statut || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Formations demandées */}
      {trainings.filter(t => t.intitule.trim()).length > 0 && (
        <div style={sectionWrap}>
          <h2 style={sectionTitle}>Plan de développement (Formation proposée)</h2>
          <table style={table}>
            <thead><tr>
              <th style={th}>Intitulé</th>
              <th style={{ ...thCenter, width: '55px' }}>Type</th>
              <th style={th}>Organisme</th>
              <th style={th}>Modalité</th>
              <th style={{ ...thCenter, width: '55px' }}>Jours</th>
              <th style={{ ...thCenter, width: '75px' }}>Budget</th>
              <th style={{ ...thCenter, width: '70px' }}>Période</th>
              <th style={{ ...thCenter, width: '65px' }}>Priorité</th>
            </tr></thead>
            <tbody>{trainings.filter(t => t.intitule.trim()).map((t, i) => (
              <tr key={t.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={td}>{t.intitule}</td>
                <td style={tdCenter}>{TYPE_FORMATION_LABEL[t.typeFormation] || t.typeFormation}</td>
                <td style={td}>{t.organisme || '—'}</td>
                <td style={td}>{t.modalite || '—'}</td>
                <td style={tdCenter}>{t.joursPrevisionnels || '—'}</td>
                <td style={tdCenter}>{t.budget || '—'}</td>
                <td style={tdCenter}>{t.periode || '—'}</td>
                <td style={tdCenter}>{PRIORITE_FORMATION_LABEL[t.priorite] || t.priorite}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8' }}>
        <span>Talents · LDM GROUPE — Document confidentiel</span>
        <span>Évaluation {type} · {new Date().getFullYear()}</span>
      </div>
    </div>
  );
});

EvalPrintLayout.displayName = 'EvalPrintLayout';
