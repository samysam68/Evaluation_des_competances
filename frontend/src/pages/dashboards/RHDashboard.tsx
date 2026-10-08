import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import {
  Users, FileText, TrendingUp, AlertCircle,
  Clock, Award, Target, BookOpen,
  ChevronRight, ChevronDown, Loader2, ArrowLeft, Star, Zap,
  AlertTriangle, BarChart3, UserCheck, CheckCircle2, ShieldCheck, MessageSquare,
  ArrowRightLeft, Send, UserCog
} from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { API_BASE_URL, authFetch } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { ALL_CRITERIA_LABELS } from '../../constants/evaluationForms';

// Le backend n'agrège que l'id du critère (clé brute de `ratings`) — on réaffiche
// ici son libellé complet exact, tel qu'il apparaît sur la fiche d'évaluation.
const compLabel = (idOrLabel: string): string => ALL_CRITERIA_LABELS[idOrLabel] || idOrLabel;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RHStats {
  kpi: {
    totalEmployees: number;
    evaluatedCount: number;
    pendingCount: number;
    coverageRate: number;
    avgGlobalScore: number;
    evaluationCount: number;
    execCount: number;
    cadresCount: number;
    igc: number;
    tauxAcquises: number;
    tauxNonAcquises: number;
    tauxEnCours: number;
    talentsCount: number;
    criticalCount: number;
    totalRatings: number;
  };
  byDepartment: { name: string; evaluated: number; total: number; avgScore: number }[];
  scoreDistribution: { label: string; count: number }[];
  topCompetences: { name: string; avgScore: number }[];
  bottomCompetences: { name: string; avgScore: number }[];
  radarData: { subject: string; score: number; fullMark: number }[];
  heatMapByDirection: { name: string; acquises: number; enCours: number; nonAcquises: number }[];
  topDeficits: { name: string; avgScore: number; ecarts: number }[];
  managerDashboard: { id: number; name: string; role: string; totalTeam: number; evaluated: number; taux: number; relanceCount: number; lastRelanceAt: string | null }[];
  trainingNeeds: { need: string; count: number }[];
  trainingNeedsByDepartment: { department: string; total: number; needs: { need: string; count: number }[] }[];
  recommendations: { name: string; count: number }[];
  alertes: { nonEvalues: number; critiques: number; hausPotentiel: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCORE_COLORS = ['#ef4444', '#f97316', '#22c55e', '#3b82f6'];
const BAR_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#84cc16'];
const PIE_COLORS = ['#6366f1', '#e2e8f0'];
const HEAT_COLORS = { acquises: '#22c55e', enCours: '#f59e0b', nonAcquises: '#ef4444' };

function igcLevel(igc: number): { label: string; color: string; bg: string; bar: string } {
  if (igc >= 90) return { label: 'Excellence',   color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',  bar: 'bg-emerald-500' };
  if (igc >= 80) return { label: 'Maîtrisé',     color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',        bar: 'bg-blue-500' };
  if (igc >= 70) return { label: 'Acceptable',   color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',        bar: 'bg-cyan-500' };
  if (igc >= 60) return { label: 'À renforcer',  color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',      bar: 'bg-amber-500' };
  return            { label: 'Critique',         color: 'text-red-700',     bg: 'bg-red-50 border-red-200',          bar: 'bg-red-500' };
}

function managerTauxColor(t: number) {
  if (t === 100) return 'text-emerald-600';
  if (t >= 80) return 'text-blue-600';
  if (t >= 50) return 'text-amber-600';
  return 'text-red-600';
}
function managerBadge(t: number) {
  if (t === 100) return { label: 'Conforme', cls: 'bg-emerald-100 text-emerald-700' };
  if (t >= 80) return { label: 'En cours', cls: 'bg-blue-100 text-blue-700' };
  return { label: 'Retard', cls: 'bg-red-100 text-red-700' };
}
const ROLE_BADGE: Record<string, string> = {
  Manager: 'bg-indigo-100 text-indigo-700',
  Responsable: 'bg-violet-100 text-violet-700',
  Superviseur: 'bg-cyan-100 text-cyan-700',
  Gestionnaire: 'bg-teal-100 text-teal-700',
  RH: 'bg-blue-100 text-blue-700',
};

function scoreColor(s: number): string {
  if (s >= 3.5) return 'text-emerald-600';
  if (s >= 2.5) return 'text-blue-600';
  if (s >= 1.5) return 'text-amber-600';
  return 'text-red-600';
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
        <p className="font-bold text-slate-700 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
            {p.name}: {p.value}{typeof p.value === 'number' && p.name?.includes('%') ? '%' : ''}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

interface KPICardProps {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; bg: string; border: string;
}
const KPICard: React.FC<KPICardProps> = ({ title, value, sub, icon: Icon, color, bg, border }) => (
  <div className={`bg-white p-5 rounded-3xl border ${border} hover:border-primary-200 hover:-translate-y-1 hover:shadow-md transition-all duration-300`}>
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${bg} border ${border} mb-3`}>
      <Icon className={`h-5 w-5 ${color}`} />
    </div>
    <h3 className="text-xl font-black text-slate-800 mb-0.5">{value}</h3>
    <p className="text-xs text-slate-500 font-semibold">{title}</p>
    {sub && <p className="text-[10px] text-slate-400 font-medium mt-0.5">{sub}</p>}
  </div>
);

const EmptyChart: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-48 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
    <TrendingUp className="h-8 w-8 text-slate-300" />
    <p className="text-slate-400 text-sm font-medium text-center px-4">{label}</p>
  </div>
);

// ─── RH Sub-Navigation ────────────────────────────────────────────────────────

export const RHNavTabs: React.FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();
  const tabs = [
    { label: 'Vue Exécutive', path: '/dashboard/rh', icon: BarChart3 },
    { label: 'Validations', path: '/dashboard/rh/validations', icon: UserCheck },
    { label: 'Délégations', path: '/dashboard/rh/delegations', icon: UserCog },
    { label: 'Employés / Départements', path: '/dashboard/rh/employees', icon: Users },
    { label: 'Dashboard Qualité', path: '/dashboard/rh/qualite', icon: ShieldCheck },
    { label: 'Succession', path: '/dashboard/rh/succession', icon: TrendingUp },
    { label: 'Comparaison N/N-1', path: '/dashboard/rh/comparison', icon: ArrowRightLeft },
    { label: 'Retour Employé', path: '/dashboard/rh/retour-employe', icon: MessageSquare },
    ...(user?.modules?.fichePoste ? [{ label: 'Fiches de Poste', path: '/dashboard/rh/fiches-poste', icon: FileText }] : []),
  ];
  return (
    <div className="flex gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-1.5 overflow-x-auto max-w-full">
      {tabs.map(t => {
        const active = t.path === '/dashboard/rh'
          ? location.pathname === t.path
          : location.pathname.startsWith(t.path);
        return (
          <Link key={t.path} to={t.path}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              active ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const RHDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<RHStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingValidations, setPendingValidations] = useState<any[]>([]);
  const [validating, setValidating] = useState<number | null>(null);
  const [rhComments, setRhComments] = useState<Record<number, string>>({});

  // Validation slide-over
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEval, setDetailEval] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailComment, setDetailComment] = useState('');
  const [detailFinalScore, setDetailFinalScore] = useState<string>('');
  const [detailDecision, setDetailDecision] = useState<string[]>([]);
  const [detailSaving, setDetailSaving] = useState<'validate' | 'reject' | null>(null);
  const [relancingManager, setRelancingManager] = useState<number | null>(null);
  const [managerRelanceSent, setManagerRelanceSent] = useState<Record<number, boolean>>({});
  const [expandedTrainingDept, setExpandedTrainingDept] = useState<string | null>(null);

  const handleRelancerManager = async (m: { id: number; name: string; role: string; evaluated: number; totalTeam: number }) => {
    if (!m.id) return;
    setRelancingManager(m.id);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/rh/relance/${m.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluated: m.evaluated, totalTeam: m.totalTeam }),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(prev => prev ? {
          ...prev,
          managerDashboard: prev.managerDashboard.map(x => x.id === m.id
            ? { ...x, relanceCount: data.relanceCount, lastRelanceAt: data.lastRelanceAt }
            : x),
        } : prev);
        setManagerRelanceSent(prev => ({ ...prev, [m.id]: true }));
        setTimeout(() => setManagerRelanceSent(prev => { const n = { ...prev }; delete n[m.id]; return n; }), 3000);
      }
    } catch { /* ignore */ }
    setRelancingManager(null);
  };

  const loadPendingValidations = () => {
    authFetch(`${API_BASE_URL}/api/rh/pending-validations`)
      .then(r => r.json())
      .then(data => Array.isArray(data) && setPendingValidations(data))
      .catch(() => {});
  };

  const openDetail = async (evalId: number) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setDetailEval(null);
    setDetailComment(rhComments[evalId] || '');
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

  const handleDetailValidate = async () => {
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
      if (res.ok) {
        setPendingValidations(prev => prev.filter(e => e.id !== detailEval.id));
        closeDetail();
      }
    } catch { /* ignore */ }
    setDetailSaving(null);
  };

  const handleDetailReject = async () => {
    if (!detailEval) return;
    setDetailSaving('reject');
    try {
      const res = await authFetch(`${API_BASE_URL}/api/rh/evaluation/${detailEval.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rhComment: detailComment }),
      });
      if (res.ok) {
        setPendingValidations(prev => prev.filter(e => e.id !== detailEval.id));
        closeDetail();
      }
    } catch { /* ignore */ }
    setDetailSaving(null);
  };

  const handleValidate = async (evalId: number) => {
    setValidating(evalId);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/team/evaluate/${evalId}/validate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rhComment: rhComments[evalId] || '' }),
      });
      if (res.ok) {
        setPendingValidations(prev => prev.filter(e => e.id !== evalId));
        setRhComments(prev => { const next = { ...prev }; delete next[evalId]; return next; });
      }
    } catch { /* ignore */ }
    setValidating(null);
  };

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/rh/stats`)
      .then(r => { if (!r.ok) throw new Error('Erreur serveur'); return r.json(); })
      .then(data => { setStats(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
    loadPendingValidations();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-500 font-medium">Chargement des statistiques RH…</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="flex items-center justify-center h-96">
      <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center max-w-md">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-4" />
        <p className="text-red-600 font-bold">Impossible de charger les données</p>
        <p className="text-red-400 text-sm mt-1">{error}</p>
      </div>
    </div>
  );
  if (!stats) return null;

  const { kpi, byDepartment, scoreDistribution, topCompetences, bottomCompetences,
          radarData, heatMapByDirection, topDeficits, managerDashboard,
          trainingNeeds, trainingNeedsByDepartment, recommendations, alertes } = stats;

  const hasEvaluations = kpi.evaluationCount > 0;
  const hasCompetencies = radarData.length >= 3;
  const radarDataLabeled = radarData.map(d => ({ ...d, subject: compLabel(d.subject) }));
  const igc = igcLevel(kpi.igc);

  const coveragePie = [
    { name: 'Évalués', value: kpi.evaluatedCount },
    { name: 'Non évalués', value: kpi.pendingCount },
  ];

  return (
    <div className="space-y-7">

      {/* ── Banner ── */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl p-7 text-white relative overflow-hidden shadow-lg shadow-blue-500/20">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute right-20 bottom-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-white/70 font-semibold text-xs uppercase tracking-widest mb-1">Espace RH — LDM GROUPE</p>
            <h1 className="text-3xl font-black mb-1 tracking-tight">Tableau de Bord RH</h1>
            <p className="text-white/80 font-medium text-sm">Vue globale · Exercice {new Date().getFullYear()}</p>
          </div>
          <button onClick={() => navigate('/dashboard/employee')}
            className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-white text-sm font-semibold transition-all flex-shrink-0 mt-1">
            <ArrowLeft size={15} /> Vue Manager
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <RHNavTabs />

      {/* ── IGC — Indicateur Signature ── */}
      {hasEvaluations && (
        <div className={`border rounded-3xl p-6 flex items-center gap-6 ${igc.bg}`}>
          <div className="flex-shrink-0">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${igc.bar} text-white`}>
              <span className="text-2xl font-black">{kpi.igc}%</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-0.5">Indice Global de Compétence (IGC)</p>
            <p className={`text-2xl font-black ${igc.color} mb-1`}>{igc.label}</p>
            <div className="h-3 bg-white/60 rounded-full overflow-hidden max-w-sm">
              <div className={`h-full rounded-full ${igc.bar} transition-all`} style={{ width: `${kpi.igc}%` }} />
            </div>
          </div>
          <div className="hidden md:grid grid-cols-3 gap-4 flex-shrink-0 text-center">
            <div>
              <p className="text-xl font-black text-emerald-600">{kpi.tauxAcquises}%</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Acquises</p>
            </div>
            <div>
              <p className="text-xl font-black text-amber-500">{kpi.tauxEnCours}%</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase">En cours</p>
            </div>
            <div>
              <p className="text-xl font-black text-red-500">{kpi.tauxNonAcquises}%</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Non acquises</p>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI Stratégiques Row 1 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Employés Actifs" value={kpi.totalEmployees.toLocaleString('fr-FR')}
          icon={Users} color="text-blue-500" bg="bg-blue-50" border="border-blue-100" />
        <KPICard title="Taux de Couverture" value={`${kpi.coverageRate}%`}
          sub={`${kpi.evaluatedCount} évalués sur ${kpi.totalEmployees}`}
          icon={Target} color="text-indigo-500" bg="bg-indigo-50" border="border-indigo-100" />
        <KPICard title="Talents Haut Potentiel" value={kpi.talentsCount}
          sub="Note ≥ 16/20"
          icon={Star} color="text-amber-500" bg="bg-amber-50" border="border-amber-100" />
        <KPICard title="Situation Critique" value={kpi.criticalCount}
          sub="Note < 11/20 — Priorité RH"
          icon={AlertTriangle} color="text-red-500" bg="bg-red-50" border="border-red-100" />
      </div>

      {/* ── KPI Row 2 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Évaluations Soumises" value={kpi.evaluationCount.toLocaleString('fr-FR')}
          icon={FileText} color="text-cyan-500" bg="bg-cyan-50" border="border-cyan-100" />
        <KPICard title="Compétences Évaluées" value={kpi.totalRatings.toLocaleString('fr-FR')}
          sub="Total critères notés"
          icon={Award} color="text-purple-500" bg="bg-purple-50" border="border-purple-100" />
        <KPICard title="Besoins de Formation" value={trainingNeeds.length}
          sub="Types identifiés"
          icon={BookOpen} color="text-teal-500" bg="bg-teal-50" border="border-teal-100" />
        <KPICard title="Non Évalués" value={kpi.pendingCount.toLocaleString('fr-FR')}
          sub="Évaluation non réalisée"
          icon={Clock} color="text-slate-500" bg="bg-slate-50" border="border-slate-200" />
      </div>

      {/* ── Alertes Automatiques ── */}
      {hasEvaluations && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-800">Alertes Automatiques RH</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-4 p-4 bg-red-50 rounded-2xl border border-red-100">
              <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse" />
              <div>
                <p className="font-black text-red-700 text-xl">{alertes.nonEvalues}</p>
                <p className="text-xs font-bold text-red-500">Évaluations non réalisées</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-orange-50 rounded-2xl border border-orange-100">
              <div className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0 shadow-[0_0_8px_rgba(249,115,22,0.6)] animate-pulse" />
              <div>
                <p className="font-black text-orange-700 text-xl">{alertes.critiques}</p>
                <p className="text-xs font-bold text-orange-500">Collaborateurs en situation critique</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
              <div className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0" />
              <div>
                <p className="font-black text-emerald-700 text-xl">{alertes.hausPotentiel}</p>
                <p className="text-xs font-bold text-emerald-500">Talents à haut potentiel</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Heat Map Directions + Coverage Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Cartographie des Compétences</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">Heat Map par Direction — Acquises / En cours / Non acquises</p>
          {heatMapByDirection.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={heatMapByDirection} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(v: string) => v?.length > 16 ? v.substring(0, 16) + '…' : v} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="acquises" name="Acquises %" stackId="a" fill={HEAT_COLORS.acquises} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="enCours" name="En cours %" stackId="a" fill={HEAT_COLORS.enCours} />
                  <Bar dataKey="nonAcquises" name="Non acquises %" stackId="a" fill={HEAT_COLORS.nonAcquises} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-5 mt-3">
                {[{ color: HEAT_COLORS.acquises, label: '> 85% Acquises' }, { color: HEAT_COLORS.enCours, label: '70–85% En cours' }, { color: HEAT_COLORS.nonAcquises, label: '< 70% Non acquises' }]
                  .map(l => <div key={l.label} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{ background: l.color }} /><span className="text-xs text-slate-500 font-medium">{l.label}</span></div>)}
              </div>
            </>
          ) : <EmptyChart label="Aucune donnée de direction disponible" />}
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Taux de Couverture</h2>
          <p className="text-xs text-slate-400 font-medium mb-3">Employés évalués vs total</p>
          {hasEvaluations ? (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={coveragePie} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {coveragePie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v} employés`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {coveragePie.map((e, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                    <span className="text-xs text-slate-500 font-medium">{e.name} ({e.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyChart label="Aucune évaluation" />}
        </div>
      </div>

      {/* ── Top Déficits + Score Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Top 10 Compétences Déficitaires</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">Priorités automatiques du plan de formation annuel</p>
          {topDeficits.length > 0 ? (
            <div className="space-y-2.5">
              {topDeficits.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 text-[10px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-semibold text-slate-700 truncate pr-2">{compLabel(c.name)}</span>
                      <span className="text-xs font-black text-red-500 flex-shrink-0">{c.ecarts} écarts</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${(c.ecarts / (topDeficits[0]?.ecarts || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyChart label="Aucun écart de compétence identifié" />}
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Distribution des Notes</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">Répartition par niveau de performance</p>
          {hasEvaluations ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreDistribution} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Employés" radius={[6, 6, 0, 0]}>
                  {scoreDistribution.map((_, i) => <Cell key={i} fill={SCORE_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="Aucune note enregistrée" />}
        </div>
      </div>

      {/* ── Profil Radar + Top/Bottom compétences ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Profil des Compétences</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">Moyenne par compétence — Top 10</p>
          {hasCompetencies ? (
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarDataLabeled} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
                <PolarRadiusAxis angle={30} domain={[0, 4]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <Radar name="Moyenne" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                <Tooltip formatter={(v: any) => `${v}/4`} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="Min. 3 compétences évaluées requises" />}
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Compétences Clés</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">Points forts et axes d'amélioration</p>
          {topCompetences.length > 0 ? (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {topCompetences.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-semibold text-slate-700 truncate pr-2">{compLabel(c.name)}</span>
                      <span className={`text-xs font-black flex-shrink-0 ${scoreColor(c.avgScore)}`}>{c.avgScore}/4</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(c.avgScore / 4) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="pt-2 pb-1"><p className="text-[10px] font-bold text-red-500 uppercase tracking-wide">Axes d'amélioration</p></div>
              {bottomCompetences.slice(0, 4).map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-semibold text-slate-700 truncate pr-2">{compLabel(c.name)}</span>
                      <span className={`text-xs font-black flex-shrink-0 ${scoreColor(c.avgScore)}`}>{c.avgScore}/4</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${(c.avgScore / 4) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyChart label="Aucune compétence évaluée" />}
        </div>
      </div>

      {/* ── Suivi par Responsable Hiérarchique ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-slate-800">Suivi par Responsable Hiérarchique</h2>
          <p className="text-xs text-slate-400 font-medium ml-1">— Liste complète des responsables (Directeurs, Managers, Responsables, Superviseurs) et taux de réalisation de leur équipe</p>
        </div>
        {managerDashboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Responsable</th>
                  <th className="text-left py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Rôle</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Équipe</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Évalués</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Taux</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Statut</th>
                  <th className="py-3 px-3 w-28 text-xs font-bold text-slate-400 uppercase tracking-wide">Progression</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Relances</th>
                  <th className="text-center py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Dernière relance</th>
                  <th className="py-3 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {managerDashboard.map((m, i) => {
                  const badge = managerBadge(m.taux);
                  return (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-700 text-sm">{m.name}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ROLE_BADGE[m.role] || 'bg-slate-100 text-slate-600'}`}>{m.role || '—'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500">{m.totalTeam}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-indigo-600">{m.evaluated}</td>
                      <td className={`py-2.5 px-3 text-center font-black ${managerTauxColor(m.taux)}`}>{m.taux}%</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${m.taux === 100 ? 'bg-emerald-500' : m.taux >= 80 ? 'bg-blue-500' : m.taux >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${m.taux}%` }} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-500">
                        {m.relanceCount > 0 ? m.relanceCount : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500">
                        {m.lastRelanceAt ? new Date(m.lastRelanceAt.replace(' ', 'T')).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {m.taux < 100 && (
                          <button
                            onClick={() => handleRelancerManager(m)}
                            disabled={relancingManager === m.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:text-primary-600 hover:border-primary-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {managerRelanceSent[m.id] ? (
                              <span className="text-emerald-600">✓ Relancé</span>
                            ) : relancingManager === m.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <><Send className="h-3 w-3" /> Relancer</>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyChart label="Aucune donnée manager disponible" />}
      </div>

      {/* ── Répartition par département ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Répartition par Département</h2>
            <p className="text-xs text-slate-400 font-medium">Couverture et note moyenne</p>
          </div>
          <Link to="/dashboard/rh/employees"
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
            Voir tous les employés <ChevronRight size={14} />
          </Link>
        </div>
        {byDepartment.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byDepartment.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v: string) => v?.length > 15 ? v.substring(0, 15) + '…' : v} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="evaluated" name="Évalués" radius={[0, 6, 6, 0]}>
                  {byDepartment.slice(0, 10).map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : <EmptyChart label="Aucune donnée département" />}
      </div>

      {/* ── Formation + Recommandations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Plan de Formation</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">Besoins identifiés — générés automatiquement depuis les écarts</p>
          {trainingNeeds.length > 0 ? (
            <div className="space-y-2.5 max-h-[240px] overflow-y-auto pr-1">
              {trainingNeeds.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-semibold text-slate-700 truncate pr-2">{item.need}</span>
                      <span className="text-xs font-black text-indigo-600 flex-shrink-0">{item.count}×</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(item.count / trainingNeeds[0].count) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyChart label="Aucun besoin de formation renseigné" />}
        </div>

        {recommendations.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Recommandations RH</h2>
            <p className="text-xs text-slate-400 font-medium mb-4">Répartition des types de recommandations émises</p>
            <div className="grid grid-cols-2 gap-3">
              {recommendations.map((rec, i) => (
                <div key={i} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 hover:border-indigo-200 transition-colors">
                  <p className="text-xs font-semibold text-slate-600 truncate mb-1">{rec.name}</p>
                  <p className="text-xl font-black text-indigo-600">{rec.count}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Formations demandées par département (détail complet, en plus du classement global) ── */}
      {trainingNeedsByDepartment.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Formations demandées par Département</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">Détail complet des besoins identifiés, département par département</p>
          <div className="divide-y divide-slate-50">
            {trainingNeedsByDepartment.map(dept => {
              const isOpen = expandedTrainingDept === dept.department;
              return (
                <div key={dept.department}>
                  <button
                    onClick={() => setExpandedTrainingDept(isOpen ? null : dept.department)}
                    className="w-full flex items-center gap-3 py-3 hover:bg-slate-50/60 transition-colors text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                    <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{dept.department}</span>
                    <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full flex-shrink-0">{dept.total} demande{dept.total !== 1 ? 's' : ''}</span>
                  </button>
                  {isOpen && (
                    <div className="pl-7 pb-4 space-y-2">
                      {dept.needs.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className="text-xs font-semibold text-slate-700 truncate pr-2">{item.need}</span>
                              <span className="text-xs font-black text-indigo-600 flex-shrink-0">{item.count}×</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(item.count / dept.needs[0].count) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Validation des Évaluations ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Évaluations à Valider</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Évaluations soumises par les managers en attente de validation RH</p>
          </div>
          {pendingValidations.length > 0 && (
            <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-200">
              {pendingValidations.length} en attente
            </span>
          )}
        </div>
        {pendingValidations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <p className="text-emerald-600 font-bold">Tout est à jour</p>
            <p className="text-slate-400 text-sm mt-1">Aucune évaluation en attente de validation.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingValidations.map(ev => (
              <div key={ev.id} className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl hover:border-amber-200 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
                      {ev.targetPrenom?.charAt(0)}{ev.targetNom?.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm">{ev.targetPrenom} {ev.targetNom}</p>
                      <p className="text-xs text-slate-500">{ev.targetPoste} · {ev.departement}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Soumis par <span className="font-semibold">{ev.evalPrenom} {ev.evalNom}</span> · {ev.type} · Note: <span className="font-bold text-slate-600">{Number(ev.globalScore).toFixed(2)}/20</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => openDetail(ev.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors shadow-sm"
                    >
                      <FileText className="h-3.5 w-3.5" /> Voir
                    </button>
                    <button
                      onClick={() => handleValidate(ev.id)}
                      disabled={validating === ev.id}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {validating === ev.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Valider
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-amber-400 mt-2.5 flex-shrink-0" />
                  <textarea
                    value={rhComments[ev.id] || ''}
                    onChange={e => setRhComments(prev => ({ ...prev, [ev.id]: e.target.value }))}
                    placeholder="Commentaire RH (optionnel)…"
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs text-slate-700 resize-none outline-none focus:ring-2 focus:ring-amber-300 placeholder:text-slate-400"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Slide-over Validation RH ── */}
      {detailOpen && createPortal(
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={closeDetail} />
          {/* Panel */}
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
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Score soumis par le manager</p>
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

                {/* Bilan qualitatif */}
                {(detailEval.strengths || detailEval.weaknesses || detailEval.trainingNeeds) && (
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

                {/* Objectifs N+1 */}
                {detailEval.otherData?.objectifsN1?.filter((o: any) => o.text?.trim()).length > 0 && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                    <p className="text-xs font-bold text-indigo-600 uppercase mb-2">Objectifs N+1</p>
                    <ul className="space-y-1">
                      {detailEval.otherData.objectifsN1.filter((o: any) => o.text?.trim()).map((o: any, i: number) => (
                        <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                          <span className="text-indigo-400 font-bold flex-shrink-0">{i + 1}.</span>
                          <span>{o.text}{o.deadline && <span className="text-indigo-400 ml-2 text-xs">→ {new Date(o.deadline).toLocaleDateString('fr-FR')}</span>}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Décision RH */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Décision RH :</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Maintien du poste sans action particulière',
                      'Maintien du poste avec plan de développement',
                      'Évolution / Mobilité interne',
                      'Promotion',
                      'Action corrective (avertissement, plan de redressement)',
                    ].map(dec => {
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
                    placeholder="Ajouter un commentaire de validation (optionnel)…"
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 resize-none outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400">Impossible de charger l'évaluation.</div>
            )}

            {/* Footer actions */}
            {detailEval && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 bg-white">
                <button
                  onClick={handleDetailReject}
                  disabled={!!detailSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {detailSaving === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : '✕'}
                  Rejeter
                </button>
                <button
                  onClick={handleDetailValidate}
                  disabled={!!detailSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                >
                  {detailSaving === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Valider l'évaluation
                </button>
              </div>
            )}
          </div>
        </div>
      , document.body)}

    </div>
  );
};
