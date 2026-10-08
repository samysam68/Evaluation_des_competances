import { API_BASE_URL, authFetch } from '../../services/api';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Users, ShieldCheck, AlertCircle, Clock, Send, History, ChevronDown, FileText, ChevronRight, CalendarClock } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

type CampaignDates = { openDate: string | null; closeDate: string | null; openDateMp: string | null; closeDateMp: string | null };

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

function resolveCampaignBanner(c: CampaignDates | null): { text: string; urgent: boolean } | null {
  if (!c) return null;
  const now = new Date();
  const windows = [
    { open: c.openDate, close: c.closeDate, label: 'Campagne annuelle' },
    { open: c.openDateMp, close: c.closeDateMp, label: 'Campagne mi-parcours' },
  ].filter(w => w.open || w.close);
  if (windows.length === 0) return null;

  // Fenêtre actuellement ouverte (priorité à celle qui ferme le plus tôt)
  const open = windows
    .filter(w => (!w.open || now >= new Date(w.open)) && (!w.close || now <= new Date(`${w.close}T23:59:59`)))
    .sort((a, b) => (a.close ? new Date(a.close).getTime() : Infinity) - (b.close ? new Date(b.close).getTime() : Infinity));
  if (open.length > 0 && open[0].close) {
    const daysLeft = Math.ceil((new Date(`${open[0].close}T23:59:59`).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      text: `${open[0].label} ouverte jusqu'au ${fmtDate(open[0].close)}${daysLeft <= 7 ? ` (${daysLeft} jour${daysLeft !== 1 ? 's' : ''} restant${daysLeft !== 1 ? 's' : ''})` : ''}`,
      urgent: daysLeft <= 7,
    };
  }

  // Sinon, la prochaine campagne à venir
  const upcoming = windows
    .filter(w => w.open && now < new Date(w.open))
    .sort((a, b) => new Date(a.open!).getTime() - new Date(b.open!).getTime());
  if (upcoming.length > 0) {
    return { text: `${upcoming[0].label} : ouverture le ${fmtDate(upcoming[0].open!)}`, urgent: false };
  }

  return null;
}

const SCORE_LVL = (s: number) => {
  if (s >= 16) return { label: 'Supérieur', color: 'text-blue-700', bg: 'bg-blue-100' };
  if (s >= 11) return { label: 'Satisfaisant', color: 'text-emerald-700', bg: 'bg-emerald-100' };
  if (s >= 6)  return { label: 'À améliorer', color: 'text-orange-700', bg: 'bg-orange-100' };
  return { label: 'Insatisfaisant', color: 'text-red-700', bg: 'bg-red-100' };
};

export const DirectorDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [fichesStats, setFichesStats] = useState<{ total: number; withFiche: number; pending: number } | null>(null);

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/fiche-poste/team`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setFichesStats({
            total: data.length,
            withFiche: data.filter((e: any) => e.fichePosteId).length,
            pending: data.filter((e: any) => e.ficheStatus === 'soumis_rh').length,
          });
        }
      })
      .catch(() => {});
  }, []);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [relancing, setRelancing] = useState<number | null>(null);
  const [relanceFeedback, setRelanceFeedback] = useState<Record<number, string>>({});
  const [campaign, setCampaign] = useState<CampaignDates | null>(null);

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/team/campaign-dates`)
      .then(r => r.ok ? r.json() : null)
      .then(setCampaign)
      .catch(() => {});
  }, []);

  const currentYear = new Date().getFullYear();
  const historyYears = Array.from({ length: 5 }, (_, i) => currentYear - 1 - i);
  const [historyYear, setHistoryYear] = useState(currentYear - 1);
  const [historyData, setHistoryData] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async (yr: number) => {
    if (!user?.username) return;
    setHistoryLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/team/history/${user.username}?year=${yr}`);
      const data = await res.json();
      setHistoryData(data);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  };

  const handleRelancer = async (empId: number) => {
    setRelancing(empId);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/notifications/relancer/${empId}`, { method: 'POST' });
      if (res.ok) {
        setRelanceFeedback(prev => ({ ...prev, [empId]: '✓ Relancé' }));
        setTimeout(() => setRelanceFeedback(prev => { const n = { ...prev }; delete n[empId]; return n; }), 3000);
      }
    } catch { /* ignore */ }
    setRelancing(null);
  };

  useEffect(() => {
    if (user) {
      authFetch(`${API_BASE_URL}/api/team/department-stats/${user.username}`)
        .then(async res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          setStats(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [user]);

  if (loading || !stats) {
    return <div className="animate-pulse flex space-x-4 p-8">Chargement des statistiques du département...</div>;
  }

  const completionRate = stats.totalEmployees > 0
    ? Math.round((stats.evaluatedCount / stats.totalEmployees) * 100)
    : 0;
  const pendingEvaluations = stats.pendingEvaluations ?? [];
  const delegations = stats.delegations ?? [];

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Card Fiches de Poste Équipe ── */}
      {user?.modules?.fichePoste && (
        <button onClick={() => navigate('/dashboard/fiches-poste-equipe')}
          className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 rounded-2xl p-5 text-white text-left hover:shadow-lg hover:shadow-indigo-500/30 transition-all group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-0.5">Mon Équipe</p>
                <p className="text-lg font-black">Fiches de Poste</p>
                {fichesStats && (
                  <p className="text-sm text-white/80 font-medium">
                    {fichesStats.withFiche}/{fichesStats.total} fiches créées
                    {fichesStats.pending > 0 && <span className="ml-2 bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full">{fichesStats.pending} en attente RH</span>}
                  </p>
                )}
              </div>
            </div>
            <ChevronRight className="h-6 w-6 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      )}

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl p-8 text-white relative overflow-hidden shadow-lg shadow-purple-500/20">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute right-32 bottom-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2"></div>
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">Direction - {stats.departement || user?.department}</h1>
            <p className="text-white/80 font-medium">Vue globale sur l'avancement des évaluations de votre département.</p>
          </div>
          {(() => {
            const info = resolveCampaignBanner(campaign);
            if (!info) return null;
            return (
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border flex-shrink-0 ${info.urgent ? 'bg-amber-400/20 border-amber-300/40' : 'bg-white/10 border-white/20'}`}>
                <CalendarClock className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-bold">{info.text}</span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-primary-200 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-blue-50 border border-blue-100 mb-5">
            <Users className="h-7 w-7 text-blue-500" />
          </div>
          <h3 className="text-2xl font-black text-slate-800 mb-1">{stats.totalEmployees}</h3>
          <p className="text-xs text-slate-500 font-semibold">Effectif Département</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-primary-200 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-purple-50 border border-purple-100 mb-5">
            <BarChart3 className="h-7 w-7 text-purple-500" />
          </div>
          <h3 className="text-2xl font-black text-slate-800 mb-1">{completionRate}%</h3>
          <p className="text-xs text-slate-500 font-semibold">Taux d'Évaluation</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-primary-200 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-emerald-50 border border-emerald-100 mb-5">
            <ShieldCheck className="h-7 w-7 text-emerald-500" />
          </div>
          <h3 className="text-2xl font-black text-slate-800 mb-1">{stats.evaluatedCount}</h3>
          <p className="text-xs text-slate-500 font-semibold">Évaluations Terminées</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-primary-200 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-rose-50 border border-rose-100 mb-5">
            <AlertCircle className="h-7 w-7 text-rose-500" />
          </div>
          <h3 className="text-2xl font-black text-slate-800 mb-1">{pendingEvaluations.length}</h3>
          <p className="text-xs text-slate-500 font-semibold">Employés Non Évalués</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pending Evaluations */}
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-50 rounded-xl">
                <AlertCircle className="h-5 w-5 text-rose-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Employés non évalués</h2>
            </div>
            <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-bold border border-rose-100">
              {pendingEvaluations.length} à faire
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {pendingEvaluations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                  <ShieldCheck className="h-8 w-8 text-emerald-500" />
                </div>
                <p className="text-emerald-600 font-bold">Excellent !</p>
                <p className="text-slate-500 text-sm mt-1">Tous les employés de votre département ont été évalués.</p>
              </div>
            ) : (
              pendingEvaluations.map((emp: any) => (
                <div key={emp.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-bold text-sm">
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{emp.name}</p>
                      <p className="text-xs text-slate-500 font-medium">{emp.poste || emp.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRelancer(emp.id)}
                    disabled={relancing === emp.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:text-primary-600 hover:border-primary-200 disabled:opacity-50 transition-colors"
                  >
                    {relanceFeedback[emp.id] ? (
                      <span className="text-emerald-600">{relanceFeedback[emp.id]}</span>
                    ) : (
                      <><Send className="h-3 w-3" /> Relancer</>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Delegations and Stats */}
        <div className="space-y-8 h-[500px] flex flex-col">
          {/* Delegations */}
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl">
                  <Clock className="h-5 w-5 text-indigo-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Délégations Actives</h2>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
              {delegations.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <p className="text-slate-400 font-medium text-sm">Aucune délégation d'évaluation active dans votre département.</p>
                </div>
              ) : (
                delegations.map((del: any) => (
                  <div key={del.id} className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                    <p className="text-xs text-indigo-400 font-bold mb-2">DÉLÉGATION D'ÉVALUATION</p>
                    <div className="space-y-2 text-sm font-medium text-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Délégué par :</span>
                        <span className="font-bold">{del.delegatedBy}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Assigné à :</span>
                        <span className="font-bold text-indigo-700">{del.delegatedTo}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Cible :</span>
                        <span>{del.target}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Historique des années précédentes ──────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl">
              <History className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Historique des Évaluations</h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">Résultats de votre équipe sur les années précédentes</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={historyYear}
                onChange={e => {
                  const yr = Number(e.target.value);
                  setHistoryYear(yr);
                  loadHistory(yr);
                }}
                className="appearance-none pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-300 outline-none cursor-pointer"
              >
                {historyYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <button
              onClick={() => loadHistory(historyYear)}
              disabled={historyLoading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            >
              {historyLoading ? 'Chargement…' : 'Afficher'}
            </button>
          </div>
        </div>

        {!historyData ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <History className="h-8 w-8 text-slate-300" />
            <p className="text-slate-400 text-sm font-medium">Sélectionnez une année et cliquez sur "Afficher"</p>
          </div>
        ) : historyData.members?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <History className="h-8 w-8 text-slate-300" />
            <p className="text-slate-400 text-sm font-medium">Aucune évaluation enregistrée pour {historyData.year}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Résumé année */}
            <div className="grid grid-cols-3 gap-4 mb-2">
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-indigo-700">{historyData.totalEvaluated}</p>
                <p className="text-xs text-indigo-500 font-semibold mt-0.5">Évaluations {historyData.year}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                <p className="text-2xl font-black text-slate-700">{historyData.totalTeam}</p>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Effectif total</p>
              </div>
              {historyData.avgScore != null && (
                <div className={`border rounded-2xl p-4 text-center ${SCORE_LVL(historyData.avgScore).bg} border-slate-100`}>
                  <p className={`text-2xl font-black ${SCORE_LVL(historyData.avgScore).color}`}>{historyData.avgScore.toFixed(2)}/20</p>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Score moyen équipe</p>
                </div>
              )}
            </div>

            {/* Tableau employés */}
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-3 font-bold text-slate-600 text-xs">Employé</th>
                    <th className="p-3 font-bold text-slate-600 text-xs">Poste</th>
                    <th className="p-3 font-bold text-slate-600 text-xs">Type</th>
                    <th className="p-3 font-bold text-slate-600 text-xs text-center">Score</th>
                    <th className="p-3 font-bold text-slate-600 text-xs text-center">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.members.map((m: any, i: number) => {
                    const sl = SCORE_LVL(m.score);
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-bold text-slate-800">{m.name}</td>
                        <td className="p-3 text-slate-500 text-xs">{m.poste || '—'}</td>
                        <td className="p-3 text-slate-500 text-xs">{m.type}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-black ${sl.bg} ${sl.color}`}>
                            {m.score.toFixed(1)}/20
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${m.status === 'Validée' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
