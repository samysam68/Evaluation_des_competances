import React, { useState, useEffect } from 'react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { RHNavTabs } from '../dashboards/RHDashboard';
import { displayCategorie } from '../../utils/formatters';
import {
  Loader2, TrendingUp, TrendingDown, Minus,
  Users, BarChart3, ArrowUpRight, ArrowDownRight, ChevronDown
} from 'lucide-react';

const currentYear = new Date().getFullYear();

const trendIcon = (trend: string, delta: number | null) => {
  if (trend === 'up')      return <span className="flex items-center gap-1 text-emerald-600 font-black text-xs"><ArrowUpRight className="h-3.5 w-3.5" />+{delta?.toFixed(1)}</span>;
  if (trend === 'down')    return <span className="flex items-center gap-1 text-red-500 font-black text-xs"><ArrowDownRight className="h-3.5 w-3.5" />{delta?.toFixed(1)}</span>;
  if (trend === 'stable')  return <span className="flex items-center gap-1 text-slate-400 font-bold text-xs"><Minus className="h-3.5 w-3.5" />{delta !== null ? (delta >= 0 ? '+' : '') + delta?.toFixed(1) : '—'}</span>;
  if (trend === 'new')     return <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">Nouveau</span>;
  if (trend === 'pending') return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">En attente</span>;
  return null;
};

const scoreColor = (s: number | null) => {
  if (s === null) return 'text-slate-300';
  if (s >= 16)   return 'text-blue-600';
  if (s >= 11)   return 'text-emerald-600';
  if (s >= 6)    return 'text-orange-500';
  return 'text-red-500';
};

const scoreBg = (s: number | null) => {
  if (s === null) return 'bg-slate-50 border-slate-100';
  if (s >= 16)   return 'bg-blue-50 border-blue-100';
  if (s >= 11)   return 'bg-emerald-50 border-emerald-100';
  if (s >= 6)    return 'bg-orange-50 border-orange-100';
  return 'bg-red-50 border-red-100';
};

export const ComparisonPage: React.FC = () => {
  const [year, setYear]       = useState(currentYear);
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'up' | 'down' | 'stable' | 'new' | 'pending'>('all');
  const [dirFilter, setDirFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    setData(null);
    authFetch(`${API_BASE_URL}/api/rh/comparison?year=${year}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (!d?.summary || !Array.isArray(d.employees)) throw new Error('Réponse inattendue.');
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year]);

  const directions = data
    ? [...new Set<string>(data.employees.map((e: any) => e.direction).filter(Boolean))]
    : [];

  const employees: any[] = data?.employees ?? [];
  const filtered = employees.filter((e: any) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.poste.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || e.trend === filter;
    const matchDir    = !dirFilter || e.direction === dirFilter;
    return matchSearch && matchFilter && matchDir;
  });

  const s = data?.summary;

  return (
    <div className="space-y-6 animate-fade-in">
      <RHNavTabs />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-indigo-500" />
            Comparaison N / N-1
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Évolution des scores entre <strong>{year - 1}</strong> et <strong>{year}</strong>
          </p>
        </div>
        {/* Sélecteur d'année */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-slate-500">Année en cours :</label>
          <div className="relative">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-8 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none cursor-pointer"
            >
              {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-slate-500 font-medium">Calcul de la comparaison...</p>
        </div>
      ) : !data ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-100">
          Impossible de charger les données.
        </div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Évalués en {year}</p>
              <p className="text-3xl font-black text-slate-800">{s.evaluatedN}</p>
              <p className="text-xs text-slate-400 mt-1">sur {s.totalEmployees} concernés</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Score moyen {year}</p>
              <p className="text-3xl font-black text-indigo-600">{s.avgN ?? '—'}<span className="text-sm font-semibold text-slate-400">/20</span></p>
              {s.avgN1 && <p className="text-xs text-slate-400 mt-1">vs {s.avgN1}/20 en {year - 1}</p>}
            </div>
            <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> Progression
              </p>
              <p className="text-3xl font-black text-emerald-700">{s.improvedCount}</p>
              <p className="text-xs text-emerald-600 mt-1">employés en hausse</p>
            </div>
            <div className="bg-red-50 rounded-2xl p-5 border border-red-100 shadow-sm">
              <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <TrendingDown className="h-3.5 w-3.5" /> Régression
              </p>
              <p className="text-3xl font-black text-red-600">{s.declinedCount}</p>
              <p className="text-xs text-red-500 mt-1">employés en baisse</p>
            </div>
          </div>

          {/* ── Bannière si aucune donnée N-1 ── */}
          {s.withBoth === 0 && s.totalEmployees > 0 && (
            <div className="flex items-start gap-4 p-4 rounded-2xl border border-amber-200 bg-amber-50">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="font-bold text-amber-800 text-sm">Première année de campagne</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Aucun employé ne possède d'évaluation de l'année {year - 1}. La comparaison N/N-1 sera disponible à partir de l'année prochaine ({year + 1}) une fois que les évaluations {year} auront servi de référence.
                </p>
              </div>
            </div>
          )}

          {/* ── Delta moyen ── */}
          {s.avgDelta !== null && (
            <div className={`flex items-center gap-4 p-4 rounded-2xl border ${s.avgDelta >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.avgDelta >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                {s.avgDelta >= 0 ? <TrendingUp className="h-6 w-6 text-emerald-600" /> : <TrendingDown className="h-6 w-6 text-red-500" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-600">Évolution moyenne {year - 1} → {year}</p>
                <p className={`text-2xl font-black ${s.avgDelta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {s.avgDelta >= 0 ? '+' : ''}{s.avgDelta} pts
                </p>
              </div>
              <div className="ml-auto flex gap-6 text-center">
                <div><p className="text-2xl font-black text-slate-600">{s.stableCount}</p><p className="text-xs text-slate-400 font-medium">Stables</p></div>
                <div><p className="text-2xl font-black text-indigo-600">{s.newCount}</p><p className="text-xs text-slate-400 font-medium">Nouveaux</p></div>
                <div><p className="text-2xl font-black text-amber-600">{s.pendingCount}</p><p className="text-xs text-slate-400 font-medium">En attente</p></div>
              </div>
            </div>
          )}

          {/* ── Filtres ── */}
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <input
              type="text"
              placeholder="Rechercher un employé ou un poste..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 md:max-w-xs px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'up', 'down', 'stable', 'new', 'pending'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    filter === f
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {{ all: 'Tous', up: '↑ Hausse', down: '↓ Baisse', stable: '= Stable', new: 'Nouveaux', pending: 'En attente' }[f]}
                </button>
              ))}
            </div>
            {directions.length > 0 && (
              <div className="relative">
                <select
                  value={dirFilter}
                  onChange={e => setDirFilter(e.target.value)}
                  className="appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 pr-7 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">Toutes les directions</option>
                  {directions.map((d: string) => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>

          {/* ── Tableau comparaison ── */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employé</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Direction / Poste</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                      Score {year - 1}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                      Score {year}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                      Évolution
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Aucun employé correspondant aux filtres.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((emp: any) => (
                      <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Nom */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${
                              emp.trend === 'up'     ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' :
                              emp.trend === 'down'   ? 'bg-gradient-to-br from-red-400 to-red-600' :
                              emp.trend === 'new'    ? 'bg-gradient-to-br from-indigo-400 to-indigo-600' :
                              emp.trend === 'pending'? 'bg-gradient-to-br from-amber-400 to-amber-500' :
                                                       'bg-gradient-to-br from-slate-400 to-slate-500'
                            }`}>
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-slate-800">{emp.name}</p>
                              <p className="text-xs text-slate-400">{displayCategorie(emp.categorie)}</p>
                            </div>
                          </div>
                        </td>

                        {/* Direction / Poste */}
                        <td className="p-4">
                          <p className="text-sm font-semibold text-slate-600">{emp.direction || '—'}</p>
                          <p className="text-xs text-slate-400">{emp.poste || '—'}</p>
                        </td>

                        {/* Score N-1 */}
                        <td className="p-4 text-center">
                          {emp.scoreN1 !== null ? (
                            <div className={`inline-flex flex-col items-center px-3 py-1.5 rounded-xl border ${scoreBg(emp.scoreN1)}`}>
                              <span className={`text-lg font-black ${scoreColor(emp.scoreN1)}`}>{emp.scoreN1.toFixed(1)}</span>
                              <span className="text-[10px] text-slate-400 font-medium">/20</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-sm font-medium">—</span>
                          )}
                        </td>

                        {/* Score N */}
                        <td className="p-4 text-center">
                          {emp.scoreN !== null ? (
                            <div className={`inline-flex flex-col items-center px-3 py-1.5 rounded-xl border ${scoreBg(emp.scoreN)}`}>
                              <span className={`text-lg font-black ${scoreColor(emp.scoreN)}`}>{emp.scoreN.toFixed(1)}</span>
                              <span className="text-[10px] text-slate-400 font-medium">/20</span>
                            </div>
                          ) : (
                            <span className="text-amber-500 text-xs font-bold">Pas encore évalué</span>
                          )}
                        </td>

                        {/* Évolution */}
                        <td className="p-4 text-center">
                          {trendIcon(emp.trend, emp.delta)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 font-medium">
                {filtered.length} employé{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
