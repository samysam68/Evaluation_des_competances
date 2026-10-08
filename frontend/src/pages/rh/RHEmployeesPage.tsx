import React, { useEffect, useState } from 'react';
import {
  Users, Search, ChevronDown, ChevronRight,
  Star, AlertTriangle, Loader2, CheckCircle, Clock, Eye
} from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { RHNavTabs } from '../dashboards/RHDashboard';
import { EvaluationViewerModal } from '../../components/EvaluationViewerModal';

interface Department {
  name: string;
  direction: string;
  total: number;
  evaluated: number;
  pending: number;
  avgScore: number;
  coverage: number;
}

interface Employee {
  id: number;
  name: string;
  matricule: string;
  poste: string;
  categorie: string;
  responsable: string;
  globalScore: number | null;
  evaluatedAt: string | null;
  evalType: string | null;
  evaluationId: number | null;
  evaluationStatus: string | null;
  status: 'Évalué' | 'Non évalué';
  acquises: number;
  enCours: number;
  nonAcquises: number;
  totalCompetences: number;
  igc: number | null;
  critique: boolean;
  hautPotentiel: boolean;
}

// Alignés sur le barème officiel /20 : Insatisfaisant 0-5, À améliorer 6-10,
// Satisfaisant 11-15, Supérieur 16-20 (cf. point 28 — seuils Talents/Situation critique).
function scoreLabel(s: number): string {
  if (s >= 16) return 'Excellent';
  if (s >= 11) return 'Satisfaisant';
  if (s >= 6)  return 'Partiel';
  return 'Insuffisant';
}
function scoreColor(s: number | null): string {
  if (s === null) return 'text-slate-400';
  if (s >= 16) return 'text-emerald-600';
  if (s >= 11) return 'text-blue-600';
  if (s >= 6)  return 'text-amber-600';
  return 'text-red-600';
}
function coverageBg(c: number): string {
  if (c >= 80) return 'bg-emerald-500';
  if (c >= 50) return 'bg-blue-500';
  if (c >= 20) return 'bg-amber-500';
  return 'bg-red-500';
}
function igcLevel(igc: number): { label: string; color: string } {
  if (igc >= 90) return { label: 'Excellence', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
  if (igc >= 80) return { label: 'Maîtrisé', color: 'text-blue-600 bg-blue-50 border-blue-200' };
  if (igc >= 70) return { label: 'Acceptable', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' };
  if (igc >= 60) return { label: 'À renforcer', color: 'text-amber-600 bg-amber-50 border-amber-200' };
  return { label: 'Critique', color: 'text-red-600 bg-red-50 border-red-200' };
}

export const RHEmployeesPage: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filteredDepts, setFilteredDepts] = useState<Department[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [selectedDirection, setSelectedDirection] = useState('');
  const [searchDept, setSearchDept] = useState('');
  const [loading, setLoading] = useState(true);

  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [deptEmployees, setDeptEmployees] = useState<Record<string, Employee[]>>({});
  const [deptLoading, setDeptLoading] = useState<string | null>(null);
  const [searchEmp, setSearchEmp] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'evalué' | 'non_evalué' | 'critique' | 'potentiel'>('all');
  const [viewingEvaluationId, setViewingEvaluationId] = useState<number | null>(null);

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/rh/departments`)
      .then(r => r.json())
      .then(data => {
        setDepartments(data.departments || []);
        setFilteredDepts(data.departments || []);
        setDirections(data.filters?.directions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    let list = departments;
    if (selectedDirection) list = list.filter(d => d.direction === selectedDirection);
    if (searchDept) list = list.filter(d => d.name.toLowerCase().includes(searchDept.toLowerCase()));
    setFilteredDepts(list);
  }, [selectedDirection, searchDept, departments]);

  const toggleDept = async (deptName: string) => {
    if (expandedDept === deptName) { setExpandedDept(null); return; }
    setExpandedDept(deptName);
    if (deptEmployees[deptName]) return;
    setDeptLoading(deptName);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/rh/department/${encodeURIComponent(deptName)}/employees`);
      const data = await res.json();
      setDeptEmployees(prev => ({ ...prev, [deptName]: data.employees || [] }));
    } catch { /* ignore */ }
    setDeptLoading(null);
  };

  const getFilteredEmployees = (emps: Employee[]) => {
    let list = emps;
    if (searchEmp) list = list.filter(e => e.name.toLowerCase().includes(searchEmp.toLowerCase()) || (e.poste || '').toLowerCase().includes(searchEmp.toLowerCase()));
    if (filterStatus === 'evalué') list = list.filter(e => e.status === 'Évalué');
    else if (filterStatus === 'non_evalué') list = list.filter(e => e.status === 'Non évalué');
    else if (filterStatus === 'critique') list = list.filter(e => e.critique);
    else if (filterStatus === 'potentiel') list = list.filter(e => e.hautPotentiel);
    return list;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* RH Navigation */}
      <RHNavTabs />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-1">Employés par Département</h1>
        <p className="text-slate-500 font-medium">Vue détaillée des évaluations par département et direction</p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher un département…"
            value={searchDept}
            onChange={e => setSearchDept(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={selectedDirection}
          onChange={e => setSelectedDirection(e.target.value)}
          className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Toutes les directions</option>
          {directions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="flex gap-1">
          {(['all', 'evalué', 'non_evalué', 'critique', 'potentiel'] as const).map(f => (
            <button key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterStatus === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {f === 'all' ? 'Tous' : f === 'evalué' ? 'Évalués' : f === 'non_evalué' ? 'Non évalués' : f === 'critique' ? '🔴 Critiques' : '⭐ Potentiels'}
            </button>
          ))}
        </div>
        <span className="ml-auto self-center text-xs text-slate-400 font-medium">{filteredDepts.length} département(s)</span>
      </div>

      {/* Liste des départements */}
      <div className="space-y-3">
        {filteredDepts.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Aucun département trouvé</p>
          </div>
        )}

        {filteredDepts.map(dept => {
          const isOpen = expandedDept === dept.name;
          const employees = deptEmployees[dept.name] || [];
          const filtered = getFilteredEmployees(employees);

          return (
            <div key={dept.name} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Département header */}
              <button
                onClick={() => toggleDept(dept.name)}
                className="w-full flex items-center gap-4 p-5 hover:bg-slate-50/60 transition-colors text-left"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${coverageBg(dept.coverage)}`}>
                  {dept.coverage}%
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">{dept.name}</p>
                  <p className="text-xs text-slate-400 font-medium truncate">{dept.direction}</p>
                </div>
                <div className="hidden md:flex items-center gap-6 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-medium">Total</p>
                    <p className="font-black text-slate-700">{dept.total}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-medium">Évalués</p>
                    <p className="font-black text-indigo-600">{dept.evaluated}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-medium">Note moy.</p>
                    <p className={`font-black ${scoreColor(dept.avgScore)}`}>
                      {dept.avgScore ? `${dept.avgScore}/20` : '—'}
                    </p>
                  </div>
                  <div className="w-24">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${coverageBg(dept.coverage)}`} style={{ width: `${dept.coverage}%` }} />
                    </div>
                  </div>
                </div>
                {deptLoading === dept.name
                  ? <Loader2 className="h-5 w-5 animate-spin text-blue-500 flex-shrink-0" />
                  : isOpen
                    ? <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    : <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                }
              </button>

              {/* Employés du département */}
              {isOpen && (
                <div className="border-t border-slate-100">
                  {/* Search in dept */}
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex gap-3 items-center">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Rechercher un employé…"
                        value={searchEmp}
                        onChange={e => setSearchEmp(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-xs text-slate-400 font-medium">{filtered.length} employé(s)</span>
                  </div>

                  {filtered.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-slate-400 text-sm font-medium">Aucun employé correspond aux filtres</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Employé</th>
                            <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Poste</th>
                            <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wide hidden md:table-cell">Catégorie</th>
                            <th className="text-center py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Statut</th>
                            <th className="text-center py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Note /20</th>
                            <th className="text-center py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wide hidden md:table-cell">IGC</th>
                            <th className="text-center py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Compétences</th>
                            <th className="text-center py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wide">Niveau</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filtered.map(emp => {
                            const level = emp.igc !== null ? igcLevel(emp.igc) : null;
                            return (
                              <tr key={emp.id}
                                onClick={() => emp.evaluationId && setViewingEvaluationId(emp.evaluationId)}
                                title={emp.evaluationId ? 'Voir la fiche complète (lecture seule)' : undefined}
                                className={`transition-colors ${emp.evaluationId ? 'cursor-pointer hover:bg-blue-50/50' : 'hover:bg-slate-50/50'} ${emp.critique ? 'bg-red-50/30' : emp.hautPotentiel ? 'bg-emerald-50/20' : ''}`}>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0 ${emp.hautPotentiel ? 'bg-emerald-500' : emp.critique ? 'bg-red-400' : 'bg-slate-400'}`}>
                                      {emp.name.charAt(0)}
                                    </div>
                                    <div>
                                      <p className="font-semibold text-slate-800 text-xs leading-tight">
                                        {emp.name}
                                        {emp.hautPotentiel && <Star className="inline h-3 w-3 text-amber-400 ml-1" />}
                                        {emp.critique && <AlertTriangle className="inline h-3 w-3 text-red-400 ml-1" />}
                                      </p>
                                      <p className="text-[10px] text-slate-400">{emp.matricule}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 hidden lg:table-cell">
                                  <p className="text-xs text-slate-600 font-medium max-w-[180px] truncate">{emp.poste || '—'}</p>
                                </td>
                                <td className="py-3 px-4 hidden md:table-cell">
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{emp.categorie || '—'}</span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {emp.status === 'Évalué' ? (
                                    <span className="inline-flex flex-col items-center gap-1">
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"><CheckCircle className="h-3 w-3" />Évalué</span>
                                      {emp.evaluationId && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-blue-500"><Eye className="h-2.5 w-2.5" />Voir la fiche</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"><Clock className="h-3 w-3" />En attente</span>
                                  )}
                                </td>
                                <td className={`py-3 px-4 text-center font-black text-sm ${scoreColor(emp.globalScore)}`}>
                                  {emp.globalScore !== null ? emp.globalScore.toFixed(1) : '—'}
                                </td>
                                <td className="py-3 px-4 text-center hidden md:table-cell">
                                  {emp.igc !== null
                                    ? <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${level?.color}`}>{emp.igc}%</span>
                                    : <span className="text-slate-300 text-xs">—</span>
                                  }
                                </td>
                                <td className="py-3 px-4 text-center hidden lg:table-cell">
                                  {emp.totalCompetences > 0 ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <span className="text-[10px] font-bold text-emerald-600">{emp.acquises}✓</span>
                                      <span className="text-[10px] text-slate-300">/</span>
                                      <span className="text-[10px] font-bold text-amber-500">{emp.enCours}~</span>
                                      <span className="text-[10px] text-slate-300">/</span>
                                      <span className="text-[10px] font-bold text-red-500">{emp.nonAcquises}✗</span>
                                    </div>
                                  ) : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {emp.globalScore !== null
                                    ? <span className={`text-[10px] font-bold ${scoreColor(emp.globalScore)}`}>{scoreLabel(emp.globalScore)}</span>
                                    : <span className="text-slate-300 text-xs">—</span>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewingEvaluationId && (
        <EvaluationViewerModal evaluationId={viewingEvaluationId} onClose={() => setViewingEvaluationId(null)} />
      )}
    </div>
  );
};
