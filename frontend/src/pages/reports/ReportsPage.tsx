import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { API_BASE_URL, authFetch } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Filter, Download, CheckCircle, AlertCircle, Loader2, ClipboardList } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'evaluated' | 'pending'>('all');

  const loadStats = () => {
    if (user) {
      setLoading(true);
      authFetch(`${API_BASE_URL}/api/team/department-stats/${user.username}`)
        .then(res => res.json())
        .then(data => {
          setStats(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  };

  useEffect(() => {
    loadStats();
  }, [user]);

  if (loading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
        <p className="text-slate-500 font-medium">Chargement des rapports...</p>
      </div>
    );
  }

  // Combine both lists with status
  const allEmployees = [
    ...stats.evaluatedEmployees.map((e: any) => ({
      ...e,
      name: e.name || `${e.nom} ${e.prenom}`.trim(),
      status: 'evaluated'
    })),
    ...stats.pendingEvaluations.map((e: any) => ({ ...e, status: 'pending' }))
  ];

  const filteredEmployees = allEmployees.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.poste && emp.poste.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterStatus === 'evaluated') return matchesSearch && emp.status === 'evaluated';
    if (filterStatus === 'pending') return matchesSearch && emp.status === 'pending';
    return matchesSearch;
  });

  const evaluatedCount = allEmployees.filter(e => e.status === 'evaluated').length;
  const pendingCount = allEmployees.filter(e => e.status === 'pending').length;
  const total = allEmployees.length;
  const progressPct = total > 0 ? Math.round((evaluatedCount / total) * 100) : 0;

  const handleExportCSV = () => {
    const SEP = ';';
    // Wrap text in quotes, escape internal quotes
    const txt = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // Numbers stay unquoted, use comma as decimal (French Excel)
    const num = (v: any) => v != null && v !== '' ? String(Number(v).toFixed(2)).replace('.', ',') : '';
    // Date formatted dd/mm/yyyy
    const dat = (d: any) => { if (!d) return ''; const p = String(d).slice(0,10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d); };

    const headers = [
      'Matricule',
      'Nom',
      'Prénom',
      'Poste',
      'Catégorie',
      'Direction',
      'Département',
      'Service',
      'Responsable Direct',
      'Date de Recrutement',
      'Statut Évaluation',
      'Fiche Exécutions',
      'Note Exécutions (/4)',
      'Date Exécutions',
      'Validation Exécutions',
      'Fiche Cadres & Maîtrises',
      'Note Cadres & Maîtrises (/4)',
      'Date Cadres & Maîtrises',
      'Validation Cadres & Maîtrises',
    ];

    const rows = allEmployees.map(emp => {
      const evals: any[] = emp.evaluations || [];
      const exec  = evals.find((e: any) => e.type === 'Exécutions');
      const cadre = evals.find((e: any) => e.type === 'Cadres & Maîtrises');

      // Split stored "NOM Prénom" into parts
      const nameParts = (emp.name || '').trim().split(' ');
      const nom    = nameParts[0] || '';
      const prenom = nameParts.slice(1).join(' ') || '';

      const cols = [
        txt(emp.matricule),
        txt(nom),
        txt(prenom),
        txt(emp.poste),
        txt(emp.categorie),
        txt(emp.direction),
        txt(emp.departement),
        txt(emp.service),
        txt(emp.responsable1),
        txt(dat(emp.dateRecrutement)),
        txt(emp.status === 'evaluated' ? 'Évalué' : 'À évaluer'),
        // Exécutions
        txt(exec ? 'Oui' : 'Non'),
        exec ? num(exec.globalScore) : '',
        txt(exec ? dat(exec.date) : ''),
        txt(exec ? (exec.status || 'Soumise') : ''),
        // Cadres & Maîtrises
        txt(cadre ? 'Oui' : 'Non'),
        cadre ? num(cadre.globalScore) : '',
        txt(cadre ? dat(cadre.date) : ''),
        txt(cadre ? (cadre.status || 'Soumise') : ''),
      ];
      return cols.join(SEP);
    });

    // "sep=;" on first line tells Excel which separator to use
    const csv = ['sep=;', headers.map(txt).join(SEP), ...rows].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Rapport_Evaluations_${(stats.departement || 'Departement').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary-500" />
            Rapports d'Évaluations
          </h1>
          <p className="text-slate-500 font-medium mt-2">{stats.departement}</p>
        </div>
        <button onClick={handleExportCSV} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
          <Download className="h-4 w-4" /> Exporter (CSV)
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-500">Total Employés</p>
            <p className="text-3xl font-black text-slate-800 mt-1">{total}</p>
          </div>
          <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
            <Filter className="h-5 w-5 text-slate-400" />
          </div>
        </div>

        <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-emerald-600">Déjà évalués</p>
            <p className="text-3xl font-black text-emerald-700 mt-1">{evaluatedCount}</p>
          </div>
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          </div>
        </div>

        <div className="bg-rose-50 rounded-2xl p-6 border border-rose-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-rose-600">À évaluer</p>
            <p className="text-3xl font-black text-rose-700 mt-1">{pendingCount}</p>
          </div>
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-rose-500" />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-600">Progression des évaluations</span>
            <span className="text-sm font-black text-primary-600">{progressPct}%</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 font-medium mt-2">{evaluatedCount} évalué(s) sur {total} employé(s)</p>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Filters Bar */}
        <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par nom ou poste..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm font-medium transition-all"
            />
          </div>
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${filterStatus === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Tous ({total})
            </button>
            <button
              onClick={() => setFilterStatus('evaluated')}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${filterStatus === 'evaluated' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Évalués ({evaluatedCount})
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${filterStatus === 'pending' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              À évaluer ({pendingCount})
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[30%]">Employé</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[25%]">Poste</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-[25%]">Statut d'évaluation</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-500 font-medium">
                    <ClipboardList className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                    Aucun employé trouvé pour ces critères.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors group">
                    {/* Nom */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                          emp.status === 'evaluated'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{emp.name}</p>
                          <p className="text-xs text-slate-400 font-medium">{emp.role}</p>
                        </div>
                      </div>
                    </td>

                    {/* Poste */}
                    <td className="p-4">
                      <span className="text-sm text-slate-600 font-medium">{emp.poste || emp.role || '—'}</span>
                    </td>

                    {/* Statut — deux étapes distinctes : Validation Responsable puis Validation RH */}
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        {emp.evaluations && emp.evaluations.length > 0 ? (
                          emp.evaluations.map((ev: any, idx: number) => {
                            const isRejected = ev.status === 'Rejetée';
                            const isRHValidated = ev.status === 'Validée';
                            return (
                              <div key={idx} className="flex items-center gap-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isRejected ? 'bg-slate-50 text-slate-400 border-slate-200 line-through' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                  <CheckCircle className="h-3 w-3" /> Responsable
                                </span>
                                <span className="text-slate-300 text-xs">→</span>
                                {isRejected ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-50 text-rose-700 border-rose-200">
                                    <AlertCircle className="h-3 w-3" /> Rejetée RH
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isRHValidated ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                    <CheckCircle className="h-3 w-3" /> RH {isRHValidated ? '' : '(en attente)'}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 ml-1">({ev.type})</span>
                              </div>
                            );
                          })
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-bold border border-rose-200">
                            <AlertCircle className="h-3.5 w-3.5" /> À évaluer
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <div className="flex flex-col items-end gap-2">
                        {(() => {
                          const evals = emp.evaluations || [];
                          // Use evalType from the employee's category — only one form type per employee
                          const empEvalType = emp.evalType || 'Cadres & Maîtrises';
                          const isExec = empEvalType === 'Exécutions';
                          const path = isExec ? 'executions' : 'cadres';
                          const label = isExec ? 'Exécutions' : 'Cadres & Maîtrises';
                          const hasEval = evals.find((e: any) => e.type === empEvalType);

                          return (
                            <>
                              {hasEval ? (
                                <button
                                  onClick={() => navigate(`/dashboard/evaluations/${path}/form/${emp.id}`)}
                                  className={`px-3 py-1.5 bg-white border rounded-lg text-xs font-bold transition-colors flex items-center justify-between w-48 ${isExec ? 'border-teal-200 text-teal-600 hover:bg-teal-50' : 'border-primary-200 text-primary-600 hover:bg-primary-50'}`}
                                >
                                  <span>Modifier</span> <span className="text-[10px] opacity-70">({label})</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => navigate(`/dashboard/evaluations/${path}/form/${emp.id}`)}
                                  className={`px-3 py-1.5 border text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center justify-between w-48 ${isExec ? 'bg-teal-600 border-teal-700 hover:bg-teal-700 shadow-teal-500/20' : 'bg-primary border-primary-600 hover:bg-primary-600 shadow-primary-500/20'}`}
                                >
                                  <span>Évaluer</span> <span className="text-[10px] opacity-80">({label})</span>
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
