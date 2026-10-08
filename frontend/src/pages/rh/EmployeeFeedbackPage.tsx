import React, { useEffect, useState } from 'react';
import { Loader2, Smile, Meh, Frown, Clock, MessageSquare } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { RHNavTabs } from '../dashboards/RHDashboard';

type FeedbackRow = {
  id: number;
  type: string;
  globalScore: number;
  rhFinalScore: number | null;
  validatedAt: string;
  employeeFeedback: 'satisfait' | 'moyen' | 'non_satisfait' | null;
  employeeFeedbackAt: string | null;
  targetId: number;
  targetNom: string;
  targetPrenom: string;
  targetPoste: string;
  targetDirection: string;
  targetDepartement: string;
  evalNom: string;
  evalPrenom: string;
  evalPoste: string;
};

type Summary = { total: number; responded: number; satisfait: number; moyen: number; non_satisfait: number };

const FEEDBACK_STYLE: Record<string, { label: string; icon: React.ElementType; text: string; bg: string; border: string }> = {
  satisfait:     { label: 'Satisfait(e)',              icon: Smile, text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  moyen:         { label: 'Moyennement satisfait(e)',  icon: Meh,   text: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  non_satisfait: { label: 'Non satisfait(e)',           icon: Frown, text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200' },
};

export const EmployeeFeedbackPage: React.FC = () => {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'satisfait' | 'moyen' | 'non_satisfait' | 'pending'>('all');

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/rh/employee-feedback`)
      .then(res => res.ok ? res.json() : { rows: [], summary: null })
      .then(data => { setRows(data.rows || []); setSummary(data.summary || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'pending') return !r.employeeFeedback;
    return r.employeeFeedback === filter;
  });

  return (
    <div className="space-y-7">

      {/* Banner */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-500 rounded-3xl p-7 text-white relative overflow-hidden shadow-lg shadow-violet-500/20">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="relative z-10">
          <p className="text-white/70 font-semibold text-xs uppercase tracking-widest mb-1">Espace RH — LDM GROUPE</p>
          <h1 className="text-3xl font-black mb-1 tracking-tight">Retour Employé</h1>
          <p className="text-white/80 font-medium text-sm">
            Ressenti des employés sur leur évaluation, une fois celle-ci validée par les RH.
          </p>
        </div>
      </div>

      <RHNavTabs />

      {/* KPI */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button onClick={() => setFilter('all')}
            className={`bg-white rounded-2xl border p-5 text-left transition-all ${filter === 'all' ? 'border-violet-300 ring-2 ring-violet-100' : 'border-slate-100 hover:border-slate-200'}`}>
            <p className="text-2xl font-black text-slate-800">{summary.total}</p>
            <p className="text-xs font-semibold text-slate-500">Évaluations validées</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{summary.responded} avec retour ({summary.total > 0 ? Math.round(summary.responded / summary.total * 100) : 0}%)</p>
          </button>
          <button onClick={() => setFilter('satisfait')}
            className={`bg-white rounded-2xl border p-5 text-left transition-all ${filter === 'satisfait' ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-emerald-100 hover:border-emerald-200'}`}>
            <div className="flex items-center gap-2 mb-1"><Smile className="h-5 w-5 text-emerald-500" /><p className="text-2xl font-black text-emerald-700">{summary.satisfait}</p></div>
            <p className="text-xs font-semibold text-slate-500">Satisfait(e)</p>
          </button>
          <button onClick={() => setFilter('moyen')}
            className={`bg-white rounded-2xl border p-5 text-left transition-all ${filter === 'moyen' ? 'border-orange-300 ring-2 ring-orange-100' : 'border-orange-100 hover:border-orange-200'}`}>
            <div className="flex items-center gap-2 mb-1"><Meh className="h-5 w-5 text-orange-500" /><p className="text-2xl font-black text-orange-700">{summary.moyen}</p></div>
            <p className="text-xs font-semibold text-slate-500">Moyennement satisfait(e)</p>
          </button>
          <button onClick={() => setFilter('non_satisfait')}
            className={`bg-white rounded-2xl border p-5 text-left transition-all ${filter === 'non_satisfait' ? 'border-red-300 ring-2 ring-red-100' : 'border-red-100 hover:border-red-200'}`}>
            <div className="flex items-center gap-2 mb-1"><Frown className="h-5 w-5 text-red-500" /><p className="text-2xl font-black text-red-700">{summary.non_satisfait}</p></div>
            <p className="text-xs font-semibold text-slate-500">Non satisfait(e)</p>
          </button>
        </div>
      )}

      {/* Liste */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-violet-50">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-slate-800">Retours des employés</h2>
            <p className="text-xs text-slate-400 font-medium">Exercice en cours · {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          {filter !== 'all' && (
            <button onClick={() => setFilter('all')} className="text-xs font-bold text-violet-600 hover:text-violet-800">
              Réinitialiser le filtre
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <MessageSquare className="h-12 w-12 text-slate-200" />
            <p className="text-slate-500 font-semibold">Aucun résultat</p>
            <p className="text-slate-400 text-sm">Aucune évaluation ne correspond à ce filtre.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(r => {
              const fb = r.employeeFeedback ? FEEDBACK_STYLE[r.employeeFeedback] : null;
              return (
                <div key={r.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-black text-base flex-shrink-0">
                    {(r.targetPrenom || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{r.targetPrenom} {r.targetNom}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {r.targetPoste || r.targetDepartement} · {r.type} · Évalué par {r.evalPrenom} {r.evalNom}
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Validée le {new Date(r.validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  {fb ? (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${fb.bg} ${fb.border}`}>
                      <fb.icon className={`h-4 w-4 ${fb.text}`} />
                      <div>
                        <p className={`text-xs font-bold ${fb.text}`}>{fb.label}</p>
                        {r.employeeFeedbackAt && (
                          <p className="text-[10px] text-slate-400">
                            {new Date(r.employeeFeedbackAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                      <Clock className="h-4 w-4" />
                      <p className="text-xs font-semibold">En attente</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
