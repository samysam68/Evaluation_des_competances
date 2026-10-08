import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Target, MessageSquare, Clock, CheckCircle, AlertCircle, Loader2, FileX, TrendingUp, Award, BookOpen, ChevronDown, ChevronUp, History, Users, ChevronRight, FileText, ShieldCheck, Smile, Meh, Frown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAuthStore } from '../../store/authStore';
import { API_BASE_URL, authFetch } from '../../services/api';

const getScoreLevel = (score: number): { label: string; color: string; bg: string; border: string; stars: number } => {
  if (score >= 16) return { label: 'Supérieur aux attentes', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', stars: 5 };
  if (score >= 11) return { label: 'Satisfaisant',           color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', stars: 4 };
  if (score >= 6)  return { label: 'À améliorer',            color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', stars: 2 };
  return              { label: 'Insatisfaisant',             color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    stars: 1 };
};

export const EmployeeDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [evalData, setEvalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myFiche, setMyFiche] = useState<any>(null);
  const [hasFicheDelegation, setHasFicheDelegation] = useState(false);

  // State for which evaluation tab is selected (if there are multiple)
  const [selectedEvalIndex, setSelectedEvalIndex] = useState(0);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<string | null>(null);

  // Feedback 360° received
  const [feedback360, setFeedback360] = useState<{ feedbacks: any[]; avgScore: number | null; count: number } | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showFeedback360, setShowFeedback360] = useState(false);

  // Pending feedback requests (to fill in)
  const [pendingFeedbacks, setPendingFeedbacks] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.username) return;
    authFetch(`${API_BASE_URL}/api/feedback/pending`)
      .then(r => r.ok ? r.json() : [])
      .then(setPendingFeedbacks)
      .catch(() => {});
  }, [user]);

  const loadFeedback360 = async () => {
    if (!user?.username || feedback360 !== null) return;
    setLoadingFeedback(true);
    try {
      // First get my user id
      const meRes = await authFetch(`${API_BASE_URL}/api/auth/me`);
      if (meRes.ok) {
        const me = await meRes.json();
        const fbRes = await authFetch(`${API_BASE_URL}/api/feedback/summary/${me.id}`);
        if (fbRes.ok) setFeedback360(await fbRes.json());
      }
    } catch { /* ignore */ }
    setLoadingFeedback(false);
  };

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/fiche-poste/my`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setMyFiche(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.role !== 'Responsable') return;
    authFetch(`${API_BASE_URL}/api/fiche-poste/delegations`)
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => { if (Array.isArray(d) && d.length > 0) setHasFicheDelegation(true); })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (user?.username) {
      authFetch(`${API_BASE_URL}/api/team/my-evaluation/${user.username}`)
        .then(res => res.json())
        .then(data => {
          setEvalData(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    );
  }

  const evaluated = evalData?.evaluated;
  const evaluations: any[] = evalData?.evaluations || [];

  const currentEval = evaluations[selectedEvalIndex];

  const submitEmployeeFeedback = async (value: 'satisfait' | 'moyen' | 'non_satisfait') => {
    if (!currentEval || feedbackSubmitting) return;
    setFeedbackSubmitting(value);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/team/evaluate/${currentEval.id}/employee-feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: value }),
      });
      if (res.ok) {
        const result = await res.json();
        setEvalData((prev: any) => {
          if (!prev) return prev;
          const nextEvaluations = prev.evaluations.map((ev: any, idx: number) =>
            idx === selectedEvalIndex ? { ...ev, employeeFeedback: value, employeeFeedbackAt: result.feedbackAt } : ev
          );
          return { ...prev, evaluations: nextEvaluations };
        });
      }
    } catch { /* ignore */ }
    setFeedbackSubmitting(null);
  };
  
  const data = currentEval?.data;
  const globalScore = data?.globalScore ?? 0;
  const globalLevel = getScoreLevel(globalScore);
  const objectiveEntries: any[] = (data?.otherData?.objectives ?? []).filter((o: any) => o.objectif?.trim());
  const tasks: any[] = data?.tasks ?? [];
  
  // For Exécutions, valid tasks are those with rating > 0. For Cadres, it's status that determines completion.
  const validTasks = data?.type === 'Exécutions' 
    ? tasks.filter(t => t.task?.trim() && t.rating > 0)
    : tasks.filter(t => t.task?.trim() && t.status);

  // Category scores from otherData
  const categoryScores: any[] = data?.otherData?.categoryScores ?? [];

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

      {/* ── Ma Fiche de Poste ────────────────────────────────── */}
      {user?.modules?.fichePoste && (
      <div className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${
        myFiche?.ficheStatus === 'valide'    ? 'border-emerald-200' :
        myFiche?.ficheStatus === 'soumis_rh' ? 'border-amber-200' :
        myFiche?.ficheStatus === 'rejete'    ? 'border-red-200' :
        myFiche ? 'border-indigo-200' : 'border-slate-200'
      }`}>
        <div className={`flex items-center gap-4 px-6 py-4 ${
          myFiche?.ficheStatus === 'valide'    ? 'bg-emerald-50' :
          myFiche?.ficheStatus === 'soumis_rh' ? 'bg-amber-50' :
          myFiche?.ficheStatus === 'rejete'    ? 'bg-red-50' :
          myFiche ? 'bg-indigo-50' : 'bg-slate-50'
        }`}>
          <div className="w-11 h-11 rounded-2xl bg-white/60 backdrop-blur flex items-center justify-center flex-shrink-0 shadow-sm">
            {myFiche?.ficheStatus === 'valide'
              ? <ShieldCheck className="h-5 w-5 text-emerald-600" />
              : <FileText className="h-5 w-5 text-indigo-500" />}
          </div>
          <div className="flex-1">
            <p className="font-black text-slate-800">Ma Fiche de Poste</p>
            {myFiche ? (
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-slate-600 truncate font-semibold">{myFiche.intitule}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  myFiche.ficheStatus === 'valide'    ? 'bg-emerald-100 text-emerald-700' :
                  myFiche.ficheStatus === 'soumis_rh' ? 'bg-amber-100 text-amber-700' :
                  myFiche.ficheStatus === 'rejete'    ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {myFiche.ficheStatus === 'valide' ? 'Validée' : myFiche.ficheStatus === 'soumis_rh' ? 'En cours de validation' : myFiche.ficheStatus === 'rejete' ? 'En révision' : 'Brouillon'}
                </span>
              </div>
            ) : <p className="text-xs text-slate-400">Aucune fiche de poste assignée</p>}
          </div>
          {myFiche && (
            <button onClick={() => navigate(`/dashboard/rh/fiches-poste/${myFiche.id}/print`)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors flex-shrink-0 shadow-sm">
              Consulter <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {myFiche?.ficheStatus === 'rejete' && myFiche.validationComment && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-600"><span className="font-bold">Motif RH :</span> {myFiche.validationComment}</p>
          </div>
        )}
      </div>
      )}

      {/* ── Carte Fiches de Poste Équipe (Responsable délégué) ── */}
      {user?.modules?.fichePoste && hasFicheDelegation && (
        <button onClick={() => navigate('/dashboard/fiches-poste-equipe')}
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-2xl p-5 text-white text-left hover:shadow-lg hover:shadow-violet-500/30 transition-all group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-0.5">Délégation active</p>
                <p className="text-base font-black">Fiches de Poste — Équipe</p>
                <p className="text-xs text-white/70 font-medium">Vous avez une délégation pour créer des fiches</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-transform flex-shrink-0" />
          </div>
        </button>
      )}

      {/* ── Feedbacks 360° à donner ──────────────────────────── */}
      {user?.modules?.feedback && pendingFeedbacks.length > 0 && (
        <div className="bg-white rounded-3xl border border-indigo-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-indigo-100 bg-indigo-50">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-indigo-800">Feedbacks 360° à compléter</p>
              <p className="text-xs text-indigo-500">Vos collègues attendent votre retour</p>
            </div>
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center">
              {pendingFeedbacks.length}
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {pendingFeedbacks.map((fb: any) => (
              <div key={fb.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-base flex-shrink-0">
                  {(fb.targetPrenom || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{fb.targetPrenom} {fb.targetNom}</p>
                  <p className="text-xs text-slate-400 truncate">
                    Demandé par {fb.requesterPrenom} {fb.requesterNom}
                    {fb.createdAt && ` · ${new Date(fb.createdAt).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/dashboard/feedback/${fb.id}`)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors flex-shrink-0">
                  Donner mon feedback <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {evaluated && evaluations.length > 0 ? (
        <>
          {/* ── Historique multi-années ── */}
          {evaluations.length >= 1 && (() => {
            const chartData = [...evaluations].reverse().map((ev, idx) => ({
              name: `${ev.data.type.slice(0, 4)}. ${new Date(ev.date).getFullYear()}`,
              score: Number((ev.data.globalScore ?? 0).toFixed(2)),
              type: ev.data.type,
              date: new Date(ev.date).toLocaleDateString('fr-FR'),
              idx: evaluations.length - 1 - idx,
            }));
            return (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                      <History className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">Historique des Évaluations</h2>
                      <p className="text-xs text-slate-400 font-medium">{evaluations.length} évaluation{evaluations.length > 1 ? 's' : ''} sur votre parcours</p>
                    </div>
                  </div>
                  {evaluations.length > 1 && (
                    <span className="text-xs font-bold px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                      Évolution : {(chartData[chartData.length - 1].score - chartData[0].score) >= 0 ? '+' : ''}{(chartData[chartData.length - 1].score - chartData[0].score).toFixed(2)} pts
                    </span>
                  )}
                </div>

                {/* Line chart — only if more than one eval */}
                {evaluations.length > 1 && (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 20]} tickFormatter={v => `${v}`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: any) => [`${v}/20`, 'Score']}
                        labelFormatter={(l: any) => String(l)}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      />
                      <ReferenceLine y={15} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'Acquis', position: 'right', fontSize: 10, fill: '#10b981' }} />
                      <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'En cours', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                      <Line
                        type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3}
                        dot={{ r: 5, fill: '#6366f1', stroke: 'white', strokeWidth: 2 }}
                        activeDot={{ r: 7, fill: '#6366f1' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {/* Timeline */}
                <div className="space-y-2">
                  {evaluations.map((ev, idx) => {
                    const sc = Number(ev.data.globalScore ?? 0);
                    const lvl = getScoreLevel(sc);
                    const yr = new Date(ev.date).getFullYear();
                    const isSelected = idx === selectedEvalIndex;
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelectedEvalIndex(idx)}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                          isSelected ? 'border-indigo-300 bg-indigo-50 shadow-sm' : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl ${lvl.bg} ${lvl.border} border flex items-center justify-center flex-shrink-0`}>
                          <span className={`text-xs font-black ${lvl.color}`}>{sc.toFixed(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm">{ev.data.type}</p>
                          <p className="text-xs text-slate-400">{new Date(ev.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} · {ev.evaluatorName}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-black text-lg ${lvl.color}`}>{sc.toFixed(1)}<span className="text-xs font-medium opacity-60">/20</span></p>
                          <p className={`text-xs font-semibold ${lvl.color}`}>{lvl.label}</p>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                          {yr}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* === CARTE NOTE GLOBALE === */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-fade-in">
            <div className="bg-gradient-to-r from-slate-700 to-slate-900 p-6 text-white">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-slate-400 text-sm font-semibold mb-1">Évaluation — {data?.type}</p>
                  <div className="flex items-end gap-2">
                    <span className="text-6xl font-black">{globalScore.toFixed(1)}</span>
                    <span className="text-slate-400 text-xl font-bold mb-2">/ 20</span>
                  </div>
                  <p className={`text-lg font-bold mt-1 ${globalLevel.color.replace('text-', 'text-')}`}>
                    {globalLevel.label}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <span className="px-4 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-black">
                    ✓ Évaluation soumise
                  </span>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} className={`h-5 w-5 ${i <= globalLevel.stars ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
                    ))}
                  </div>
                  <p className="text-slate-400 text-xs font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(currentEval.date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4 w-full bg-white/10 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${(globalScore / 20) * 100}%`,
                    background: globalScore >= 16 ? '#3b82f6' : globalScore >= 11 ? '#10b981' : globalScore >= 6 ? '#f97316' : '#ef4444'
                  }}
                />
              </div>
            </div>

            {/* Evaluator info */}
            <div className="p-5 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center font-black text-sm shadow">
                {currentEval.evaluatorName?.charAt(0) || '?'}
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800">{currentEval.evaluatorName}</p>
                <p className="text-xs text-slate-500">{currentEval.evaluatorRole}</p>
              </div>
              <span className={`ml-auto text-xs font-bold px-3 py-1 rounded-full border ${currentEval.status === 'Validée' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-amber-600 bg-amber-50 border-amber-100'}`}>
                {currentEval.status === 'Validée' ? '✓ Validée' : currentEval.status || 'Soumise'}
              </span>
            </div>

            {/* ── Décision & Signature RH ── */}
            {currentEval.status === 'Validée' && (
              <div className="p-5 space-y-4">
                {/* Note RH si différente */}
                {currentEval.data?.rhFinalScore != null && currentEval.data.rhFinalScore !== currentEval.data.globalScore && (
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                    <div className="text-blue-600 font-bold text-xs uppercase tracking-wide">Note finale RH</div>
                    <div className="ml-auto text-lg font-black text-blue-700">{Number(currentEval.data.rhFinalScore).toFixed(2)}/20</div>
                  </div>
                )}

                {/* Décision RH */}
                {Array.isArray(currentEval.rhDecision) && currentEval.rhDecision.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Décision RH</p>
                    <div className="flex flex-wrap gap-2">
                      {currentEval.rhDecision.map((d: string) => (
                        <span key={d} className="text-xs px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 font-semibold rounded-xl">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commentaire RH */}
                {currentEval.rhComment && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Commentaire RH</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{currentEval.rhComment}</p>
                  </div>
                )}

                {/* Signature RH */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  {/* Signature évaluateur */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Évaluateur (N+1)</p>
                    <p className="text-sm font-bold text-slate-800">{currentEval.evaluatorName || '—'}</p>
                    <p className="text-xs text-slate-500">{currentEval.evaluatorRole || '—'}</p>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(currentEval.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Signature RH */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">Validation RH</p>
                    <p className="text-sm font-bold text-slate-800">{currentEval.validatorName || '—'}</p>
                    <p className="text-xs text-slate-500">{currentEval.validatorPoste || 'Responsable RH'}</p>
                    {currentEval.validatedAt && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(currentEval.validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        {' à '}
                        {new Date(currentEval.validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Retour employé ── */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Votre retour sur cette évaluation</p>
                  {currentEval.employeeFeedback ? (
                    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${
                      currentEval.employeeFeedback === 'satisfait'     ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                      currentEval.employeeFeedback === 'moyen'         ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                                                          'bg-red-50 border-red-200 text-red-700'
                    }`}>
                      {currentEval.employeeFeedback === 'satisfait' ? <Smile className="h-5 w-5 flex-shrink-0" />
                        : currentEval.employeeFeedback === 'moyen' ? <Meh className="h-5 w-5 flex-shrink-0" />
                        : <Frown className="h-5 w-5 flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-bold">
                          {currentEval.employeeFeedback === 'satisfait' ? 'Satisfait(e)'
                            : currentEval.employeeFeedback === 'moyen' ? 'Moyennement satisfait(e)'
                            : 'Non satisfait(e)'}
                        </p>
                        {currentEval.employeeFeedbackAt && (
                          <p className="text-xs opacity-70">
                            Envoyé le {new Date(currentEval.employeeFeedbackAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button onClick={() => submitEmployeeFeedback('satisfait')} disabled={!!feedbackSubmitting}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-2xl font-bold text-sm transition-all disabled:opacity-50">
                        {feedbackSubmitting === 'satisfait' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smile className="h-4 w-4" />}
                        Satisfait(e)
                      </button>
                      <button onClick={() => submitEmployeeFeedback('moyen')} disabled={!!feedbackSubmitting}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-2xl font-bold text-sm transition-all disabled:opacity-50">
                        {feedbackSubmitting === 'moyen' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Meh className="h-4 w-4" />}
                        Moyennement satisfait(e)
                      </button>
                      <button onClick={() => submitEmployeeFeedback('non_satisfait')} disabled={!!feedbackSubmitting}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-2xl font-bold text-sm transition-all disabled:opacity-50">
                        {feedbackSubmitting === 'non_satisfait' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Frown className="h-4 w-4" />}
                        Non satisfait(e)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* === SCORES PAR TABLEAU (Pour Cadres) === */}
          {categoryScores.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 animate-fade-in" style={{ animationDelay: '50ms' }}>
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-4">
                <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Scores par tableau de compétences</h2>
                  <p className="text-sm text-slate-500">Résultats détaillés par catégorie</p>
                </div>
              </div>
              <div className="space-y-4">
                {categoryScores.map((cat: any, idx: number) => {
                  const avg = cat.avg ?? 0;
                  const lvl = getScoreLevel(avg);
                  return (
                    <div key={idx} className={`p-4 rounded-2xl border ${lvl.border} ${lvl.bg} transition-all hover:scale-[1.01]`}>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <span className="font-bold text-slate-700 text-sm">{cat.title}</span>
                        <span className={`font-black text-lg ${lvl.color}`}>{avg.toFixed(1)}<span className="text-sm font-semibold opacity-60">/20</span></span>
                      </div>
                      <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden shadow-inner">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{
                            width: `${(avg / 20) * 100}%`,
                            background: avg >= 16 ? '#3b82f6' : avg >= 11 ? '#10b981' : avg >= 6 ? '#f97316' : '#ef4444'
                          }}
                        />
                      </div>
                      <p className={`text-xs font-bold mt-1 ${lvl.color}`}>{lvl.label} · {cat.rated}/{cat.count} critères évalués</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* === SCORES SAVOIR ÊTRE / FAIRE (Pour Exécutions) === */}
          {data?.type === 'Exécutions' && data?.otherData?.savoirEtreScore !== undefined && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 animate-fade-in" style={{ animationDelay: '50ms' }}>
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-4">
                <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Scores par domaine de compétences</h2>
                  <p className="text-sm text-slate-500">Savoir Être et Savoir Faire</p>
                </div>
              </div>
              <div className="space-y-4">
                {/* Savoir Etre */}
                <div className={`p-4 rounded-2xl border ${getScoreLevel(data.otherData.savoirEtreScore).border} ${getScoreLevel(data.otherData.savoirEtreScore).bg} transition-all hover:scale-[1.01]`}>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <span className="font-bold text-slate-700 text-sm">Savoir Être</span>
                    <span className={`font-black text-lg ${getScoreLevel(data.otherData.savoirEtreScore).color}`}>{data.otherData.savoirEtreScore.toFixed(1)}<span className="text-sm font-semibold opacity-60">/20</span></span>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(data.otherData.savoirEtreScore / 20) * 100}%`, background: data.otherData.savoirEtreScore >= 16 ? '#3b82f6' : data.otherData.savoirEtreScore >= 11 ? '#10b981' : data.otherData.savoirEtreScore >= 6 ? '#f97316' : '#ef4444' }} />
                  </div>
                  <p className={`text-xs font-bold mt-1 ${getScoreLevel(data.otherData.savoirEtreScore).color}`}>{getScoreLevel(data.otherData.savoirEtreScore).label}</p>
                </div>
                {/* Savoir Faire */}
                <div className={`p-4 rounded-2xl border ${getScoreLevel(data.otherData.savoirFaireScore).border} ${getScoreLevel(data.otherData.savoirFaireScore).bg} transition-all hover:scale-[1.01]`}>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <span className="font-bold text-slate-700 text-sm">Savoir Faire (Tâches)</span>
                    <span className={`font-black text-lg ${getScoreLevel(data.otherData.savoirFaireScore).color}`}>{data.otherData.savoirFaireScore.toFixed(1)}<span className="text-sm font-semibold opacity-60">/20</span></span>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden shadow-inner">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(data.otherData.savoirFaireScore / 20) * 100}%`, background: data.otherData.savoirFaireScore >= 16 ? '#3b82f6' : data.otherData.savoirFaireScore >= 11 ? '#10b981' : data.otherData.savoirFaireScore >= 6 ? '#f97316' : '#ef4444' }} />
                  </div>
                  <p className={`text-xs font-bold mt-1 ${getScoreLevel(data.otherData.savoirFaireScore).color}`}>{getScoreLevel(data.otherData.savoirFaireScore).label}</p>
                </div>
              </div>
            </div>
          )}

          {/* === OBJECTIFS DE L'ANNÉE PROCHAINE === */}
          {objectiveEntries.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 animate-fade-in" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-4">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Mes objectifs — Campagne {currentEval?.campaignYear}</h2>
                  <p className="text-sm text-slate-500">Objectifs fixés pour l'année prochaine</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {objectiveEntries.map(o => (
                  <div key={o.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <span className="text-sm font-semibold text-slate-700 truncate">{o.objectif}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{o.kpi || '—'}{o.cible ? ` · Cible : ${o.cible}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === TÂCHES (TABLEAU D / SAVOIR FAIRE) === */}
          {validTasks.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 animate-fade-in" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-4">
                <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Compétences exigées par le poste</h2>
                  <p className="text-sm text-slate-500">Niveau d'acquisition des tâches</p>
                </div>
              </div>
              <div className="space-y-3">
                {data.type === 'Exécutions' ? (
                  // Tâches type Exécutions (notées sur 20)
                  validTasks.map((t: any, i: number) => {
                    const lvl = getScoreLevel(t.rating);
                    return (
                      <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border transition-all hover:scale-[1.01] ${lvl.bg} ${lvl.border}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-white shadow-sm text-slate-400 font-black text-sm`}>
                            {i+1}
                          </div>
                          <p className="font-bold text-sm text-slate-800">{t.task}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-black ${lvl.color}`}>{lvl.label}</span>
                          <span className={`text-sm font-black px-3 py-1 rounded-full ${lvl.color} bg-white shadow-sm`}>{t.rating}/20</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // Tâches type Cadres & Maîtrises (statut Acquise/En cours/Non acquise)
                  validTasks.map((t: any, i: number) => (
                    <div key={i} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.01] ${
                      t.status === 'Acquise' ? 'bg-emerald-50 border-emerald-100' :
                      t.status === 'En cours' ? 'bg-orange-50 border-orange-100' :
                      'bg-red-50 border-red-100'
                    }`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        t.status === 'Acquise' ? 'bg-emerald-100' : t.status === 'En cours' ? 'bg-orange-100' : 'bg-red-100'
                      }`}>
                        {t.status === 'Acquise'
                          ? <CheckCircle className="h-5 w-5 text-emerald-600" />
                          : t.status === 'En cours'
                          ? <Clock className="h-5 w-5 text-orange-500" />
                          : <AlertCircle className="h-5 w-5 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-800 truncate">{t.task}</p>
                        {t.proposition && (
                          <p className="text-xs text-slate-500 mt-0.5">💡 {t.proposition}</p>
                        )}
                      </div>
                      <span className={`text-xs font-black px-3 py-1 rounded-full whitespace-nowrap ${
                        t.status === 'Acquise' ? 'bg-emerald-500 text-white' :
                        t.status === 'En cours' ? 'bg-orange-400 text-white' :
                        'bg-red-500 text-white'
                      }`}>{t.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* === BILAN DU RESPONSABLE === */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-slate-700 shadow-xl p-8 text-white relative overflow-hidden animate-fade-in" style={{ animationDelay: '200ms' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/20 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl"></div>
            <div className="relative z-10 space-y-5">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary-400" />
                <h3 className="text-lg font-bold text-slate-100">Synthèse et Décision du Responsable</h3>
              </div>

              {data?.recommendation ? (
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 p-5 rounded-2xl">
                  <p className="text-slate-200 font-medium leading-relaxed italic">"{data.recommendation}"</p>
                </div>
              ) : (
                <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-400 italic text-sm">
                  Aucune appréciation écrite pour cette évaluation.
                </div>
              )}

              {/* Points forts & faibles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.strengths && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                    <p className="text-emerald-400 text-xs font-black mb-2 uppercase tracking-wider">✅ Points forts</p>
                    <p className="text-slate-200 text-sm leading-relaxed">{data.strengths}</p>
                  </div>
                )}
                {data?.weaknesses && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                    <p className="text-orange-400 text-xs font-black mb-2 uppercase tracking-wider">⚠️ Points à améliorer</p>
                    <p className="text-slate-200 text-sm leading-relaxed">{data.weaknesses}</p>
                  </div>
                )}
              </div>

              {/* Besoins en formation */}
              {data?.trainingNeeds && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <p className="text-blue-400 text-xs font-black mb-2 uppercase tracking-wider flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> Besoins en formation
                  </p>
                  <p className="text-slate-200 text-sm leading-relaxed">{data.trainingNeeds}</p>
                </div>
              )}

              {/* Exigence du poste */}
              {data?.otherData?.exigence && (
                <div className="flex items-center gap-2 pt-2">
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Profil par rapport au poste :</span>
                  <span className="text-sm font-bold text-white">{data.otherData.exigence}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center font-black shadow-md border border-primary-300/30">
                    {currentEval.evaluatorName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-100">{currentEval.evaluatorName}</p>
                    <p className="text-xs text-slate-400">{currentEval.evaluatorRole}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-xl border border-emerald-400/20">
                  <CheckCircle className="h-4 w-4" /> Validé le {new Date(currentEval.date).toLocaleDateString('fr-FR')}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center p-16 mt-8 animate-fade-in">
          <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6 shadow-inner border border-slate-100">
            <FileX className="h-10 w-10 text-slate-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Pas encore évalué</h2>
          <p className="text-slate-500 font-medium max-w-md">
            Votre évaluation annuelle n'a pas encore été soumise par votre responsable. Veuillez patienter ou le contacter.
          </p>
        </div>
      )}

      {/* ── Feedback 360° ─────────────────────────────────────── */}
      {user?.modules?.feedback && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => { setShowFeedback360(v => !v); loadFeedback360(); }}
            className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 text-indigo-500" />
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-800">Feedback 360°</p>
                <p className="text-xs text-slate-400">Retours de vos collègues et pairs</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {feedback360 !== null && (
                <span className="text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2.5 py-1 rounded-full">
                  {feedback360.count} retour{feedback360.count > 1 ? 's' : ''}
                </span>
              )}
              {showFeedback360 ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </div>
          </button>

          {showFeedback360 && (
            <div className="border-t border-slate-100 p-6">
              {loadingFeedback ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>
              ) : !feedback360 || feedback360.count === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">Aucun feedback 360° reçu pour le moment.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-3 flex items-center gap-2">
                    <span className="text-indigo-600 font-black text-lg">{feedback360.count}</span>
                    <p className="text-indigo-700 text-sm font-medium">retour{feedback360.count > 1 ? 's' : ''} reçu{feedback360.count > 1 ? 's' : ''}</p>
                  </div>
                  {feedback360.feedbacks.map((fb: any, i: number) => (
                    <div key={fb.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Répondant anonyme #{i + 1}
                        </span>
                        {fb.submittedAt && (
                          <span className="text-xs text-slate-400">
                            {new Date(fb.submittedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                      {fb.comment ? (
                        <p className="text-sm text-slate-600 italic">"{fb.comment}"</p>
                      ) : (
                        <p className="text-sm text-slate-400 italic">Aucun commentaire.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
