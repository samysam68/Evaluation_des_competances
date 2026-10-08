import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2, CheckCircle2, MessageSquare,
  Clock, CheckCheck, Download, Archive, Eye
} from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { RHNavTabs } from '../dashboards/RHDashboard';
import { EvaluationViewerModal } from '../../components/EvaluationViewerModal';

const RH_DECISIONS = [
  'Maintien du poste sans action particulière',
  'Maintien du poste avec plan de développement',
  'Évolution / Mobilité interne',
  'Promotion',
  'Action corrective (avertissement, plan de redressement)',
];

const SCORE_LABEL = (s: number) => {
  if (s >= 16) return { label: 'Supérieur', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' };
  if (s >= 11) return { label: 'Satisfaisant', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
  if (s >= 6)  return { label: 'À améliorer', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' };
  return { label: 'Insatisfaisant', color: 'text-red-700', bg: 'bg-red-50 border-red-200' };
};

export const RHValidationsPage: React.FC = () => {
  const [pending, setPending] = useState<any[]>([]);
  const [validated, setValidated] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [archiveScope, setArchiveScope] = useState<'current' | 'all'>('current');
  const [viewingEvaluationId, setViewingEvaluationId] = useState<number | null>(null);

  // Slide-over state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEval, setDetailEval] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailComment, setDetailComment] = useState('');
  const [detailFinalScore, setDetailFinalScore] = useState('');
  const [detailDecision, setDetailDecision] = useState<string[]>([]);
  const [detailSaving, setDetailSaving] = useState<'validate' | 'reject' | null>(null);

  const loadLists = async (scope: 'current' | 'all' = archiveScope) => {
    setLoadingList(true);
    try {
      const [pendingRes, validatedRes] = await Promise.all([
        authFetch(`${API_BASE_URL}/api/rh/pending-validations`),
        authFetch(`${API_BASE_URL}/api/rh/validated-evaluations?year=${scope === 'all' ? 'all' : new Date().getFullYear()}`),
      ]);
      if (pendingRes.ok) setPending(await pendingRes.json());
      if (validatedRes.ok) setValidated(await validatedRes.json());
    } catch { /* ignore */ }
    setLoadingList(false);
  };

  useEffect(() => { loadLists(archiveScope); }, [archiveScope]);

  const handleExportCSV = () => {
    const SEP = ';';
    const txt = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const num = (v: any) => v != null && v !== '' ? String(Number(v).toFixed(2)).replace('.', ',') : '';
    const dat = (d: any) => { if (!d) return ''; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d); };

    const headers = [
      'Matricule', 'Nom', 'Prénom', 'Poste', 'Direction', 'Département', 'Type',
      'Évaluateur', 'Note Manager (/20)', 'Note Finale RH (/20)', 'Décision RH', 'Commentaire RH',
      'Validé par', 'Date de validation', 'Retour employé',
      'Formations demandées — Thème', 'Formations demandées — Période', 'Formations demandées — Prix',
    ];

    const rows = validated.map((ev: any) => {
      const decision = ev.rhDecision ? (Array.isArray(ev.rhDecision) ? ev.rhDecision : JSON.parse(ev.rhDecision)) : [];
      let trainings: any[] = [];
      try { trainings = JSON.parse(ev.otherData || '{}')?.trainings || []; } catch { /* ignore */ }
      trainings = trainings.filter((t: any) => t?.intitule?.trim());
      return [
        txt(ev.targetMatricule),
        txt(ev.targetNom),
        txt(ev.targetPrenom),
        txt(ev.targetPoste),
        txt(ev.targetDirection),
        txt(ev.targetDepartement),
        txt(ev.type),
        txt(`${ev.evalPrenom} ${ev.evalNom}`),
        num(ev.globalScore),
        num(ev.rhFinalScore ?? ev.globalScore),
        txt(decision.join(' / ')),
        txt(ev.rhComment),
        txt(ev.validatorNom ? `${ev.validatorPrenom} ${ev.validatorNom}` : ''),
        txt(dat(ev.validatedAt)),
        txt(ev.employeeFeedback || ''),
        txt(trainings.map((t: any) => t.intitule).join(' / ')),
        txt(trainings.map((t: any) => t.periode || '—').join(' / ')),
        txt(trainings.map((t: any) => t.budget || '—').join(' / ')),
      ].join(SEP);
    });

    const csv = ['sep=;', headers.map(txt).join(SEP), ...rows].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Archive_Evaluations_${archiveScope === 'all' ? 'Toutes_Annees' : new Date().getFullYear()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDetail = async (evalId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailEval(null);
    setDetailComment('');
    setDetailFinalScore('');
    setDetailDecision([]);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/rh/evaluation/${evalId}`);
      const data = await res.json();
      setDetailEval(data);
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  const closeDetail = () => { setDetailOpen(false); setDetailEval(null); };

  const handleValidate = async () => {
    if (!detailEval) return;
    setDetailSaving('validate');
    try {
      const res = await authFetch(`${API_BASE_URL}/api/team/evaluate/${detailEval.id}/validate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rhComment: detailComment,
          rhFinalScore: detailFinalScore !== '' ? parseFloat(detailFinalScore) : undefined,
          rhDecision: detailDecision.length > 0 ? detailDecision : undefined,
        }),
      });
      if (res.ok) { closeDetail(); loadLists(); }
    } catch { /* ignore */ }
    setDetailSaving(null);
  };

  const handleReject = async () => {
    if (!detailEval) return;
    setDetailSaving('reject');
    try {
      const res = await authFetch(`${API_BASE_URL}/api/rh/evaluation/${detailEval.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rhComment: detailComment }),
      });
      if (res.ok) { closeDetail(); loadLists(); }
    } catch { /* ignore */ }
    setDetailSaving(null);
  };

  return (
    <div className="space-y-7">

      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl p-7 text-white relative overflow-hidden shadow-lg shadow-blue-500/20">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-white/70 font-semibold text-xs uppercase tracking-widest mb-1">Espace RH — LDM GROUPE</p>
            <h1 className="text-3xl font-black mb-1 tracking-tight">Validations des Évaluations</h1>
            <p className="text-white/80 font-medium text-sm">
              {pending.length} évaluation{pending.length !== 1 ? 's' : ''} en attente de validation
            </p>
          </div>
        </div>
      </div>

      <RHNavTabs />

      {/* KPI rapide */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-amber-100 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
            <Clock className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-amber-700">{pending.length}</p>
            <p className="text-xs font-semibold text-slate-500">En attente de validation</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-100 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
            <CheckCheck className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-700">{validated.length}</p>
            <p className="text-xs font-semibold text-slate-500">Validées ({archiveScope === 'all' ? 'toutes années' : 'exercice en cours'})</p>
          </div>
        </div>
      </div>

      {/* ── En attente ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-amber-50">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-slate-800">Évaluations en attente</h2>
            <p className="text-xs text-slate-400 font-medium">Cliquez sur une ligne pour ouvrir le panneau de validation</p>
          </div>
          {pending.length > 0 && (
            <span className="w-7 h-7 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center">
              {pending.length}
            </span>
          )}
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-300" />
            <p className="text-slate-500 font-semibold">Aucune évaluation en attente</p>
            <p className="text-slate-400 text-sm">Toutes les évaluations soumises ont été traitées.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pending.map((ev: any) => {
              const sl = SCORE_LABEL(ev.globalScore);
              return (
                <div key={ev.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-amber-50/40 transition-colors cursor-pointer group"
                  onClick={() => openDetail(ev.id)}
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-black text-base flex-shrink-0">
                    {(ev.targetPrenom || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{ev.targetPrenom} {ev.targetNom}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {ev.targetPoste || ev.departement} · {ev.type} · Soumis par {ev.evalPrenom} {ev.evalNom}
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {new Date(ev.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1.5 rounded-xl border text-center ${sl.bg}`}>
                      <p className={`text-sm font-black ${sl.color}`}>{Number(ev.globalScore).toFixed(1)}/20</p>
                      <p className={`text-[10px] font-semibold ${sl.color}`}>{sl.label}</p>
                    </div>
                    <button type="button" title="Voir la fiche complète (lecture seule)"
                      onClick={e => { e.stopPropagation(); setViewingEvaluationId(ev.id); }}
                      className="p-2 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-500 rounded-xl transition-colors">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors opacity-0 group-hover:opacity-100">
                      Valider →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Archive des évaluations validées ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-emerald-50 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Archive className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <h2 className="font-bold text-slate-800">Archive des évaluations validées</h2>
            <p className="text-xs text-slate-400 font-medium">{validated.length} évaluation{validated.length !== 1 ? 's' : ''} validée{validated.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex bg-white border border-slate-200 rounded-xl p-1">
              <button onClick={() => setArchiveScope('current')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${archiveScope === 'current' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                Exercice en cours
              </button>
              <button onClick={() => setArchiveScope('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${archiveScope === 'all' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                Toutes les années
              </button>
            </div>
            <button onClick={handleExportCSV} disabled={validated.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Download className="h-3.5 w-3.5" /> Exporter (CSV)
            </button>
          </div>
        </div>
        {validated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Archive className="h-10 w-10 text-slate-200" />
            <p className="text-slate-400 text-sm font-medium">Aucune évaluation validée pour cette période.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 max-h-[560px] overflow-y-auto">
            {validated.map((ev: any) => {
              const score = ev.rhFinalScore ?? ev.globalScore;
              const sl = SCORE_LABEL(score);
              const decision = ev.rhDecision ? JSON.parse(ev.rhDecision) : null;
              return (
                <div key={ev.id}
                  onClick={() => setViewingEvaluationId(ev.id)}
                  title="Voir la fiche complète (lecture seule)"
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-emerald-50/40 transition-colors group">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-black text-base flex-shrink-0">
                    {(ev.targetPrenom || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{ev.targetPrenom} {ev.targetNom}</p>
                    <p className="text-xs text-slate-400 truncate">{ev.targetPoste} · {ev.type}</p>
                    {decision && decision.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {decision.map((d: string) => (
                          <span key={d} className="text-[10px] px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-full font-semibold">{d}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl border text-center ${sl.bg}`}>
                    <p className={`text-sm font-black ${sl.color}`}>{Number(score).toFixed(1)}/20</p>
                    <p className={`text-[10px] font-semibold ${sl.color}`}>{sl.label}</p>
                  </div>
                  <Eye className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Slide-over ── */}
      {detailOpen && createPortal(
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={closeDetail} />
          <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-slide-in-right">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest">Validation RH</p>
                <h2 className="text-lg font-black text-slate-800 mt-0.5">
                  {detailEval ? `${detailEval.targetPrenom} ${detailEval.targetNom}` : 'Chargement…'}
                </h2>
              </div>
              <button onClick={closeDetail} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">✕</button>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-amber-400 animate-spin" />
              </div>
            ) : detailEval ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Identité */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Évalué', `${detailEval.targetPrenom} ${detailEval.targetNom}`],
                    ['Poste', detailEval.targetPoste || '—'],
                    ['Département', detailEval.departement || '—'],
                    ['Direction', detailEval.direction || '—'],
                    ['Évaluateur', `${detailEval.evalPrenom} ${detailEval.evalNom}`],
                    ['Type', detailEval.type],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{lbl}</p>
                      <p className="font-bold text-slate-800 text-sm truncate">{val}</p>
                    </div>
                  ))}
                </div>

                {/* Score */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Score soumis</p>
                    <p className="text-4xl font-black text-amber-700">{Number(detailEval.globalScore).toFixed(2)}<span className="text-lg font-semibold text-amber-500">/20</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Note finale RH (optionnel)</p>
                    <input
                      type="number" min="0" max="20" step="0.5"
                      value={detailFinalScore}
                      onChange={e => setDetailFinalScore(e.target.value)}
                      placeholder={Number(detailEval.globalScore).toFixed(2)}
                      className="w-24 px-3 py-2 bg-white border-2 border-amber-300 rounded-xl text-center text-lg font-bold text-amber-700 focus:ring-2 focus:ring-amber-400 outline-none"
                    />
                  </div>
                </div>

                {/* Points forts / faibles */}
                {(detailEval.strengths || detailEval.weaknesses || detailEval.trainingNeeds || detailEval.recommendation) && (
                  <div className="space-y-3">
                    {detailEval.strengths && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                        <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Points forts</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailEval.strengths}</p>
                      </div>
                    )}
                    {detailEval.weaknesses && (
                      <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
                        <p className="text-xs font-bold text-rose-600 uppercase mb-1">Points à améliorer</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailEval.weaknesses}</p>
                      </div>
                    )}
                    {detailEval.trainingNeeds && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <p className="text-xs font-bold text-blue-600 uppercase mb-1">Besoins en formation</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailEval.trainingNeeds}</p>
                      </div>
                    )}
                    {detailEval.recommendation && (
                      <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                        <p className="text-xs font-bold text-violet-600 uppercase mb-1">Recommandation</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailEval.recommendation}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Décision RH */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Décision RH :</label>
                  <div className="flex flex-wrap gap-2">
                    {RH_DECISIONS.map(dec => {
                      const checked = detailDecision.includes(dec);
                      return (
                        <label key={dec} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-xs transition-all ${checked ? 'border-rose-400 bg-rose-50 text-rose-700 font-bold' : 'border-slate-200 text-slate-600 hover:border-rose-300'}`}>
                          <input type="checkbox" checked={checked} className="w-3.5 h-3.5 accent-rose-500"
                            onChange={() => setDetailDecision(prev => checked ? prev.filter(d => d !== dec) : [...prev, dec])} />
                          {dec}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Commentaire RH */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-amber-500" /> Commentaire RH
                  </label>
                  <textarea
                    value={detailComment}
                    onChange={e => setDetailComment(e.target.value)}
                    placeholder="Ajouter un commentaire (optionnel)…"
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 resize-none outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>

                {/* Signature RH (auto) */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Signature RH (enregistrée à la validation)</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      RH
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Date & Heure de validation</p>
                      <p className="text-sm font-bold text-slate-700">
                        {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400">Impossible de charger l'évaluation.</div>
            )}

            {/* Footer */}
            {detailEval && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 bg-white">
                <button onClick={handleReject} disabled={!!detailSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                  {detailSaving === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : '✕'} Rejeter
                </button>
                <button onClick={handleValidate} disabled={!!detailSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-sm">
                  {detailSaving === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Valider l'évaluation
                </button>
              </div>
            )}
          </div>
        </div>
      , document.body)}

      {viewingEvaluationId && (
        <EvaluationViewerModal evaluationId={viewingEvaluationId} onClose={() => setViewingEvaluationId(null)} />
      )}

    </div>
  );
};
