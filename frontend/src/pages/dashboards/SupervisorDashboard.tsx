import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { API_BASE_URL, authFetch } from '../../services/api';
import {
  Loader2, Star, CheckCircle, Clock, AlertCircle,
  Users, FileText, ChevronRight, TrendingUp, Award
} from 'lucide-react';

const getScoreLevel = (score: number) => {
  if (score >= 16) return { label: 'Supérieur aux attentes', color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',    stars: 5 };
  if (score >= 11) return { label: 'Satisfaisant',           color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', stars: 4 };
  if (score >= 6)  return { label: 'À améliorer',            color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200',  stars: 2 };
  return               { label: 'Insatisfaisant',            color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',     stars: 1 };
};

export const SupervisorDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [evalData, setEvalData]     = useState<any>(null);
  const [teamData, setTeamData]     = useState<any[]>([]);
  const [evalLoading, setEvalLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [evaluatedIds, setEvaluatedIds] = useState<Set<number>>(new Set());

  // ── Charger l'évaluation personnelle ──
  useEffect(() => {
    if (!user?.username) { setEvalLoading(false); return; }
    authFetch(`${API_BASE_URL}/api/team/my-evaluation/${user.username}`)
      .then(r => r.json())
      .then(data => { setEvalData(data); setEvalLoading(false); })
      .catch(() => setEvalLoading(false));
  }, [user]);

  // ── Charger l'équipe + statut évaluations ──
  useEffect(() => {
    if (!user?.username) { setTeamLoading(false); return; }
    authFetch(`${API_BASE_URL}/api/team/members/${user.username}`)
      .then(r => r.json())
      .then((members: any[]) => {
        setTeamData(members);
        setTeamLoading(false);
        if (members.length === 0) return;
        // Un seul appel batch au lieu de N appels simultanés
        authFetch(`${API_BASE_URL}/api/team/evaluations-status`)
          .then(r => r.json())
          .then((ids: number[]) => setEvaluatedIds(new Set(ids)))
          .catch(() => {});
      })
      .catch(() => setTeamLoading(false));
  }, [user]);

  const latestEval  = evalData?.evaluations?.[0];
  const evalScore   = latestEval?.data?.globalScore ?? 0;
  const evalLevel   = getScoreLevel(evalScore);
  const evaluated   = evalData?.evaluated && !!latestEval;

  const evaluatedCount = teamData.filter(m => evaluatedIds.has(m.id)).length;
  const pendingCount   = teamData.length - evaluatedCount;
  const progressPct    = teamData.length > 0 ? Math.round((evaluatedCount / teamData.length) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">

      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">
          Bonjour, <span className="text-gradient">{user?.fullName?.split(' ')[1] || user?.fullName}</span> 👋
        </h1>
        <p className="text-slate-500 mt-1 font-medium">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Mon évaluation ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Award className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-800">Mon Évaluation</p>
            <p className="text-xs text-slate-400">Résultat de votre dernière évaluation</p>
          </div>
        </div>

        {evalLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          </div>
        ) : !evaluated ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <AlertCircle className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">Aucune évaluation reçue pour le moment.</p>
            <p className="text-xs">Votre responsable n'a pas encore soumis votre évaluation.</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Score principal */}
            <div className={`flex items-center justify-between p-5 rounded-2xl border ${evalLevel.border} ${evalLevel.bg}`}>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{latestEval.data?.type}</p>
                <div className="flex items-end gap-2">
                  <span className={`text-5xl font-black ${evalLevel.color}`}>{evalScore.toFixed(1)}</span>
                  <span className="text-slate-400 font-semibold mb-1">/ 20</span>
                </div>
                <p className={`text-sm font-bold mt-1 ${evalLevel.color}`}>{evalLevel.label}</p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={`h-5 w-5 ${i <= evalLevel.stars ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                  ))}
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(latestEval.date).toLocaleDateString('fr-FR')}
                </p>
                <p className="text-xs text-slate-500 font-medium">Par {latestEval.evaluatorName}</p>
              </div>
            </div>

            {/* Évaluations multiples */}
            {evalData.evaluations.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Historique</p>
                {evalData.evaluations.slice(1).map((ev: any, idx: number) => {
                  const sc = ev.data?.globalScore ?? 0;
                  const lvl = getScoreLevel(sc);
                  return (
                    <div key={idx} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${lvl.border} ${lvl.bg}`}>
                      <div>
                        <p className="text-sm font-bold text-slate-700">{ev.data?.type}</p>
                        <p className="text-xs text-slate-400">{new Date(ev.date).toLocaleDateString('fr-FR')} · {ev.evaluatorName}</p>
                      </div>
                      <span className={`font-black ${lvl.color}`}>{sc.toFixed(1)}<span className="text-xs font-semibold opacity-60">/20</span></span>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => navigate('/dashboard/employee')}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl border border-indigo-100 transition-colors text-sm"
            >
              Voir le détail complet <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Mon Équipe ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Users className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-800">Mon Équipe</p>
            <p className="text-xs text-slate-400">{teamData.length} membre{teamData.length > 1 ? 's' : ''} sous votre responsabilité</p>
          </div>
        </div>

        {teamLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : teamData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <Users className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">Aucun membre d'équipe trouvé.</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Barre de progression */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-600">Progression des évaluations</span>
                <span className="text-sm font-black text-indigo-600">{progressPct}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> {evaluatedCount} évalué{evaluatedCount > 1 ? 's' : ''}
                </span>
                <span className="text-rose-500 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {pendingCount} restant{pendingCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Liste des membres */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {teamData.map((m: any) => {
                const isDone = evaluatedIds.has(m.id);
                return (
                  <div key={m.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${isDone ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 hover:border-slate-200 bg-white'}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 text-white ${isDone ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
                      {m.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate">{m.name}</p>
                      <p className="text-xs text-slate-400 truncate">{m.poste || m.role}</p>
                    </div>
                    {isDone
                      ? <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Évalué</span>
                      : <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1"><Clock className="h-3 w-3" /> À évaluer</span>
                    }
                  </div>
                );
              })}
            </div>

            {/* Actions rapides */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={() => navigate('/dashboard/evaluations/executions')}
                className="flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-colors text-sm shadow-sm shadow-teal-500/20"
              >
                <FileText className="h-4 w-4" /> Fiche Exécutions
              </button>
              <button
                onClick={() => navigate('/dashboard/evaluations/cadres')}
                className="flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-sm shadow-sm shadow-indigo-500/20"
              >
                <TrendingUp className="h-4 w-4" /> Fiche Cadres
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
