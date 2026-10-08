import React, { useEffect, useState } from 'react';
import { X, Loader2, Lock } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../services/api';
import { EvalPrintLayout } from './EvalPrintLayout';
import { CADRES_SECTIONS, CADRES_HSE_ITEMS, EXEC_SECTIONS, EXEC_HSE_ITEMS } from '../constants/evaluationForms';

// Même barème que dans les fiches (Section D Cadres / Section C Exécutions).
const STATUS_NOTE: Record<string, number> = { 'Non acquise': 5, 'En cours': 12, 'Acquise': 20 };

interface Props {
  evaluationId: number;
  onClose: () => void;
}

const fmtDate = (s?: string | null): string => {
  if (!s) return '';
  const p = String(s).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(s);
};

// Consultation en lecture seule de la fiche complète d'une évaluation, pour
// l'Espace RH (page Employés) — reconstruit exactement les mêmes blocs que
// l'export PDF (EvalPrintLayout), à partir des données déjà stockées en base
// (ratings, tasks, otherData), sans passer par le formulaire éditable.
export const EvaluationViewerModal: React.FC<Props> = ({ evaluationId, onClose }) => {
  const [ev, setEv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    authFetch(`${API_BASE_URL}/api/rh/evaluation/${evaluationId}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setEv)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [evaluationId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-slate-400" />
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Consultation — lecture seule</p>
              <h2 className="text-lg font-black text-slate-800">Fiche d'évaluation complète</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-200 text-slate-500 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            </div>
          ) : error || !ev ? (
            <div className="text-center text-slate-400 py-20 font-medium">Impossible de charger cette évaluation.</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm mx-auto" style={{ maxWidth: '850px' }}>
              {(() => {
                const isCadres = ev.type === 'Cadres & Maîtrises';
                const od = ev.otherData || {};
                const ratings = ev.ratings || {};
                const tasks = (ev.tasks || []).map((t: any) => ({ ...t, rating: STATUS_NOTE[t.status] || 0 }));

                const identificationRows = [
                  { label: 'Direction / Structure / Entité', value: `${ev.departement || ev.direction || '—'} — LDM Groupe`, fullWidth: true },
                  { label: "Nom et Prénom de l'évalué", value: `${ev.targetNom} ${ev.targetPrenom}`.trim() },
                  { label: 'Date de recrutement', value: fmtDate(ev.dateRecrutement) },
                  { label: 'Fonction', value: ev.targetPoste || '' },
                  { label: 'Catégorie Socioprofessionnelle', value: ev.categorie || '' },
                  { label: 'Évaluateur', value: `${ev.evalNom} ${ev.evalPrenom}`.trim() },
                  { label: 'Fonction évaluateur', value: ev.evalPoste || '' },
                  { label: "Date de l'évaluation", value: fmtDate(ev.createdAt), fullWidth: true },
                  ...(od.profilDiplome ? [{ label: 'Diplôme', value: od.profilDiplome, fullWidth: true }] : []),
                  ...(od.profil ? [{ label: 'Profil', value: od.profil, fullWidth: true }] : []),
                  ...(od.profilFormations ? [{ label: 'Formations / Certifications', value: od.profilFormations, fullWidth: true }] : []),
                ];

                const blocks = isCadres
                  ? [
                      ...CADRES_SECTIONS.filter(s => s.key !== 'C' || od.hasSectionC !== false).map(s => ({
                        type: 'criteria' as const,
                        title: `${s.title} (${s.ponderation}%)`,
                        items: s.items,
                        avg: s.key === 'A' ? od.avgA : s.key === 'B' ? od.avgB : od.avgC,
                      })),
                      { type: 'tasks' as const, title: 'D. COMPÉTENCES SPÉCIFIQUES AU POSTE (10%)', rows: tasks, avg: od.avgD },
                      { type: 'criteria' as const, title: 'E. COMPÉTENCES QUALITÉ / SST / RÉGLEMENTAIRE (10%)', items: CADRES_HSE_ITEMS, avg: od.avgE },
                    ]
                  : [
                      ...EXEC_SECTIONS.map(s => ({ type: 'criteria' as const, title: `${s.title} (${s.ponderation}%)`, items: s.items, avg: s.key === 'A' ? od.avgA : od.avgB })),
                      { type: 'tasks' as const, title: 'C. COMPÉTENCES SPÉCIFIQUES AU POSTE (10%)', rows: tasks, avg: od.avgC },
                      { type: 'criteria' as const, title: 'D. COMPÉTENCES QUALITÉ / SST / RÉGLEMENTAIRE (10%)', items: EXEC_HSE_ITEMS, avg: od.avgD },
                    ];

                const synthesisRows = isCadres
                  ? [
                      { label: 'A. Compétences professionnelles et techniques', pct: 25, avg: od.avgA },
                      { label: 'B. Compétences relationnelles', pct: 15, avg: od.avgB },
                      ...(od.hasSectionC !== false ? [{ label: "C. Compétences managériales et d'expertise", pct: 20, avg: od.avgC }] : []),
                      { label: 'D. Compétences spécifiques au poste', pct: 10, avg: od.avgD },
                      { label: 'E. Compétences Qualité / SST / Réglementaire', pct: 10, avg: od.avgE },
                      ...(od.avgPerf != null ? [{ label: 'Évaluation de la performance (KPI)', pct: 20, avg: od.avgPerf }] : []),
                    ]
                  : [
                      { label: 'A. Compétences comportementales / Savoir-être', pct: 25, avg: od.avgA },
                      { label: 'B. Compétences techniques / Savoir-faire', pct: 35, avg: od.avgB },
                      { label: 'C. Compétences spécifiques au poste', pct: 10, avg: od.avgC },
                      { label: 'D. Compétences Qualité / SST / Réglementaire', pct: 10, avg: od.avgD },
                      ...(od.avgPerf != null ? [{ label: 'Évaluation de la performance (KPI)', pct: 20, avg: od.avgPerf }] : []),
                    ];

                return (
                  <EvalPrintLayout
                    type={ev.type}
                    globalScore={ev.globalScore || 0}
                    identificationRows={identificationRows}
                    blocks={blocks}
                    ratings={ratings}
                    objectives={od.objectives || []}
                    avgPerf={od.avgPerf}
                    synthesisRows={synthesisRows}
                    trainingNeeds={ev.trainingNeeds || ''}
                    recommendation={ev.recommendation || ''}
                    otherActions={od.otherActions}
                    planDev={od.planDev || []}
                    trainings={od.trainings || []}
                  />
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
