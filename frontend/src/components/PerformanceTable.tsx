import React from 'react';
import { Target } from 'lucide-react';

export type ObjectifRow = {
  id: number;
  objectif: string;
  kpi: string;
  cible: string;
  resultat: string;
  poids: number; // % sum must = 100
};

interface Props {
  rows: ObjectifRow[];
  onChange: (rows: ObjectifRow[]) => void;
  /** Campagne 2026 : exercice de transition limité à la fixation des objectifs et
   *  cibles — la partie résultats (résultat obtenu / taux d'atteinte / note) est
   *  désactivée et ne doit pas être saisie ni notée cette année. */
  resultsEnabled?: boolean;
}

// Interpole linéairement une note entre les bornes d'un palier de la grille de conversion.
const interpolate = (x: number, x0: number, x1: number, y0: number, y1: number): number =>
  y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);

// Grille de conversion officielle taux d'atteinte → note /20 :
// ≤60% → 0-8 (Insuffisant) · 60-80% → 9-12 (Partiellement atteint) · 80-100% → 13-16 (Atteint)
// 100-120% → 17-18 (Dépassé) · >120% → 19-20 (Largement dépassé), plafonné à 20/20.
export const getNote = (taux: number): number => {
  const t = Math.max(0, taux);
  let note: number;
  if (t <= 60)       note = interpolate(t, 0, 60, 0, 8);
  else if (t <= 80)  note = interpolate(t, 60, 80, 9, 12);
  else if (t <= 100) note = interpolate(t, 80, 100, 13, 16);
  else if (t <= 120) note = interpolate(t, 100, 120, 17, 18);
  else               note = interpolate(t, 120, 140, 19, 20);
  return Math.min(20, Math.round(note));
};

const parsePct = (val: string): number | null => {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
};

// Un objectif renseigné sans KPI (ou l'inverse) est une ligne incomplète : les deux
// champs vont ensemble, on ne peut pas juger l'atteinte d'un objectif sans indicateur.
export const incompleteObjectiveRows = (rows: ObjectifRow[]): ObjectifRow[] =>
  rows.filter(r => !!r.objectif.trim() !== !!r.kpi.trim());

export const computePerformanceScore = (rows: ObjectifRow[]): number => {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const row of rows) {
    if (!row.objectif.trim()) continue;
    const cible = parsePct(row.cible);
    const resultat = parsePct(row.resultat);
    if (cible === null || cible === 0 || resultat === null) continue;
    const taux = (resultat / cible) * 100;
    const note = getNote(taux);
    weightedSum += note * row.poids;
    totalWeight += row.poids;
  }
  if (totalWeight === 0) return 0;
  return Math.min(20, weightedSum / totalWeight);
};

export const PerformanceTable: React.FC<Props> = ({ rows, onChange, resultsEnabled = true }) => {
  const update = (id: number, field: keyof ObjectifRow, val: string | number) => {
    onChange(rows.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const totalPoids = rows.reduce((s, r) => s + (r.poids || 0), 0);

  return (
    <div>
      {!resultsEnabled && (
        <div className="mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-semibold">
          Exercice 2026 : fixation des objectifs et cibles uniquement — l'évaluation des résultats est désactivée cette année.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="p-3 border-b border-slate-200 font-bold text-slate-700 w-[22%]">Objectif</th>
              <th className="p-3 border-b border-l border-slate-200 font-bold text-slate-700 w-[15%]">Indicateur de performance KPI</th>
              <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-slate-700 w-[10%]">Cible fixée</th>
              {resultsEnabled && <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-slate-700 w-[10%]">Résultat obtenu</th>}
              <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-slate-700 w-[8%]">Poids %</th>
              {resultsEnabled && <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-slate-700 w-[10%]">Taux d'atteinte %</th>}
              {resultsEnabled && <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-slate-700 w-[8%]">Note /20</th>}
              {resultsEnabled && <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-slate-700 w-[10%]">Note pondérée</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const cible = parsePct(row.cible);
              const resultat = parsePct(row.resultat);
              const taux = cible !== null && cible !== 0 && resultat !== null
                ? Math.round((resultat / cible) * 100)
                : null;
              const note = taux !== null ? getNote(taux) : null;
              const notePonderee = note !== null ? ((note * row.poids) / 100).toFixed(2) : null;

              const tauxColor = taux === null ? 'text-slate-400' : taux >= 100 ? 'text-emerald-600' : taux >= 80 ? 'text-orange-500' : 'text-red-500';
              const objectifMissing = !row.objectif.trim() && !!row.kpi.trim();
              const kpiMissing = !!row.objectif.trim() && !row.kpi.trim();

              return (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/40">
                  <td className="p-1.5">
                    <input
                      type="text"
                      value={row.objectif}
                      onChange={e => update(row.id, 'objectif', e.target.value)}
                      placeholder={`Objectif ${idx + 1}`}
                      className={`w-full p-1.5 text-xs bg-slate-50 border rounded-lg outline-none focus:ring-1 ${objectifMissing ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-primary-400'}`}
                    />
                  </td>
                  <td className="p-1.5 border-l border-slate-100">
                    <input
                      type="text"
                      value={row.kpi}
                      onChange={e => update(row.id, 'kpi', e.target.value)}
                      placeholder="Ex : Taux, Nb..."
                      className={`w-full p-1.5 text-xs bg-slate-50 border rounded-lg outline-none focus:ring-1 ${kpiMissing ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-primary-400'}`}
                    />
                  </td>
                  <td className="p-1.5 border-l border-slate-100">
                    <input
                      type="number"
                      value={row.cible}
                      onChange={e => update(row.id, 'cible', e.target.value)}
                      placeholder="100"
                      className="w-full p-1.5 text-xs text-center bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-400"
                    />
                  </td>
                  {resultsEnabled && (
                    <td className="p-1.5 border-l border-slate-100">
                      <input
                        type="number"
                        value={row.resultat}
                        onChange={e => update(row.id, 'resultat', e.target.value)}
                        placeholder="..."
                        className="w-full p-1.5 text-xs text-center bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-400"
                      />
                    </td>
                  )}
                  <td className="p-1.5 border-l border-slate-100">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.poids || ''}
                      onChange={e => update(row.id, 'poids', parseInt(e.target.value) || 0)}
                      placeholder="%"
                      className="w-full p-1.5 text-xs text-center bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-400"
                    />
                  </td>
                  {resultsEnabled && (
                    <td className={`p-1.5 border-l border-slate-100 text-center font-bold ${tauxColor}`}>
                      {taux !== null ? `${taux}%` : '—'}
                    </td>
                  )}
                  {resultsEnabled && (
                    <td className="p-1.5 border-l border-slate-100 text-center font-bold text-slate-700">
                      {note !== null ? `${note}/20` : '—'}
                    </td>
                  )}
                  {resultsEnabled && (
                    <td className="p-1.5 border-l border-slate-100 text-center font-bold text-primary-700">
                      {notePonderee ?? '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300">
              <td colSpan={resultsEnabled ? 4 : 3} className="p-3 text-xs font-bold text-slate-700 text-right">Total poids :</td>
              <td className={`p-3 text-center text-xs font-black ${totalPoids === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
                {totalPoids}%
              </td>
              {resultsEnabled && (
                <>
                  <td colSpan={2} className="p-3 text-right text-xs font-bold text-slate-700">Note performance :</td>
                  <td className="p-3 text-center text-sm font-black text-primary-700">
                    {computePerformanceScore(rows).toFixed(2)}/20
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Grille de conversion */}
      {resultsEnabled && (
      <div className="p-4 bg-slate-50 border-t border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-slate-500" />
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Grille de conversion – Taux d'atteinte → Note /20</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: '≤ 60%', note: '0–8', desc: 'Insuffisant : Action corrective immédiate', color: 'bg-red-100 text-red-700' },
            { label: '> 60% – 80%', note: '9–12', desc: 'Partiellement atteint : Analyse des causes', color: 'bg-orange-100 text-orange-700' },
            { label: '> 80% – 100%', note: '13–16', desc: 'Atteint : Maintenir', color: 'bg-emerald-50 text-emerald-600' },
            { label: '> 100% – 120%', note: '17–18', desc: "Dépassé : potentiel d'évolution", color: 'bg-emerald-100 text-emerald-700' },
            { label: '> 120%', note: '19–20', desc: 'Largement dépassé : progression', color: 'bg-blue-100 text-blue-700' },
          ].map(item => (
            <span key={item.label} title={item.desc} className={`inline-flex gap-1 items-center px-2 py-1 rounded-lg text-[10px] font-bold ${item.color}`}>
              {item.label} → {item.note}/20
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400">En cas de dépassement de la cible, la note est plafonnée à 20/20.</p>
      </div>
      )}
    </div>
  );
};
