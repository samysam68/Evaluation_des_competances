import React, { useEffect, useState } from 'react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { RHNavTabs } from '../dashboards/RHDashboard';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { ShieldCheck, TrendingUp, AlertTriangle, Users, FileCheck, Loader2, AlertCircle } from 'lucide-react';

const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

interface KPIBoxProps {
  title: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}

const KPIBox: React.FC<KPIBoxProps> = ({ title, value, sub, icon: Icon, color, bg, border }) => (
  <div className={`bg-white rounded-3xl border ${border} p-6 flex flex-col gap-3 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300`}>
    <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center`}>
      <Icon className={`h-6 w-6 ${color}`} />
    </div>
    <div>
      <p className="text-2xl font-black text-slate-800">{value}</p>
      <p className="text-xs font-bold text-slate-500 mt-0.5">{title}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  </div>
);

export const QualityDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/rh/stats`)
      .then(r => { if (!r.ok) throw new Error('Erreur serveur'); return r.json(); })
      .then(data => { setStats(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
    </div>
  );
  if (error || !stats) return (
    <div className="flex items-center justify-center h-96">
      <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center max-w-md">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-4" />
        <p className="text-red-600 font-bold">{error || 'Données indisponibles'}</p>
      </div>
    </div>
  );

  const { kpi, byDepartment, appName } = stats;
  const appLabel = appName || 'Talents';
  const total = kpi.totalEmployees || 0;
  const evaluated = kpi.evaluatedCount || 0;
  const tauxPersonnel = total > 0 ? Math.round((evaluated / total) * 100) : 0;
  const tauxConformes = kpi.tauxAcquises ?? 0;
  const tauxEcarts = kpi.tauxNonAcquises ?? 0;
  const tauxEnCours = kpi.tauxEnCours ?? 0;

  const conformityPie = [
    { name: 'Conformes (Acquises)', value: Math.round(tauxConformes) },
    { name: 'En cours', value: Math.round(tauxEnCours) },
    { name: 'Non conformes', value: Math.round(tauxEcarts) },
  ];

  const deptData = (byDepartment || []).map((d: any) => {
    const label   = d.name || d.departement || '—';
    const total   = d.total ?? d.totalEmployees ?? 0;
    const evalued = d.evaluated ?? d.evaluatedCount ?? 0;
    const taux    = total > 0 ? Math.round((evalued / total) * 100) : 0;
    // IGC: si fourni directement, sinon calculé depuis avgScore (/20 → %)
    const igc     = d.igc != null ? Math.round(d.igc) : d.avgScore != null ? Math.round((d.avgScore / 20) * 100) : 0;
    return {
      name:      label.length > 20 ? label.slice(0, 20) + '…' : label,
      fullName:  label,
      evaluated: evalued,
      total,
      taux,
      igc,
    };
  });

  return (
    <div className="space-y-7 animate-fade-in">

      {/* RH Navigation */}
      <RHNavTabs />

      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-3xl p-7 text-white relative overflow-hidden shadow-lg shadow-emerald-500/20">
        <div className="absolute right-0 top-0 w-56 h-56 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute right-24 bottom-0 w-36 h-36 bg-white/5 rounded-full translate-y-1/2" />
        <div className="relative z-10">
          <p className="text-white/70 font-semibold text-xs uppercase tracking-widest mb-1">Qualité RH — {appLabel} · LDM GROUPE</p>
          <h1 className="text-3xl font-black mb-1 tracking-tight">Dashboard Qualité</h1>
          <p className="text-white/80 font-medium text-sm">Indicateurs de conformité compétences · Exercice {new Date().getFullYear()}</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <KPIBox
          title="Personnel Évalué"
          value={`${tauxPersonnel}%`}
          sub={`${evaluated} / ${total} employés`}
          icon={Users}
          color="text-blue-500" bg="bg-blue-50" border="border-blue-100"
        />
        <KPIBox
          title="Compétences Conformes"
          value={`${Math.round(tauxConformes)}%`}
          sub="Score ≥ 3 — Acquises"
          icon={ShieldCheck}
          color="text-emerald-500" bg="bg-emerald-50" border="border-emerald-100"
        />
        <KPIBox
          title="Écarts Identifiés"
          value={`${Math.round(tauxEcarts)}%`}
          sub="Score < 2 — Non acquises"
          icon={AlertTriangle}
          color="text-rose-500" bg="bg-rose-50" border="border-rose-100"
        />
        <KPIBox
          title="IGC Global"
          value={`${Math.round(kpi.igc ?? 0)}%`}
          sub="Indice Global de Compétence"
          icon={TrendingUp}
          color="text-purple-500" bg="bg-purple-50" border="border-purple-100"
        />
      </div>

      {/* Conformité globale */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Répartition de la Conformité</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">Distribution globale des compétences évaluées</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={conformityPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ value }) => `${value}%`} labelLine={false}>
                {conformityPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-1">Taux de Couverture par Département</h2>
          <p className="text-xs text-slate-400 font-medium mb-4">% employés évalués dans chaque département</p>
          {deptData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Bar dataKey="taux" name="Taux évalué" radius={[0, 6, 6, 0]}>
                  {deptData.map((d: any, i: number) => (
                    <Cell key={i} fill={d.taux >= 80 ? '#10b981' : d.taux >= 50 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-52 text-slate-400 text-sm">Aucune donnée disponible</div>
          )}
        </div>
      </div>

      {/* IGC par département */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">IGC par Département</h2>
        <p className="text-xs text-slate-400 font-medium mb-4">Indice Global de Compétence — seuil de conformité ISO à 70%</p>
        {deptData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={deptData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [`${v}%`, 'IGC']} />
              <Bar dataKey="igc" name="IGC" radius={[6, 6, 0, 0]}>
                {deptData.map((d: any, i: number) => (
                  <Cell key={i} fill={d.igc >= 70 ? '#10b981' : d.igc >= 50 ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-52 text-slate-400 text-sm">Aucune donnée disponible</div>
        )}
      </div>

      {/* Table récapitulative */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-emerald-500" /> Synthèse Qualité par Département
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Tableau de conformité qualité — {appLabel} · Évaluation des compétences</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Département</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Effectif</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Évalués</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Couverture</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">IGC</th>
                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Conformité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deptData.map((d: any, i: number) => {
                const isConform = d.igc >= 70 && d.taux >= 80;
                const isWarn = !isConform && (d.igc >= 50 || d.taux >= 50);
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-semibold text-slate-800 text-sm">{d.fullName}</td>
                    <td className="p-4 text-center text-sm text-slate-600">{d.total}</td>
                    <td className="p-4 text-center text-sm text-slate-600">{d.evaluated}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        d.taux >= 80 ? 'bg-emerald-50 text-emerald-700' :
                        d.taux >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                      }`}>{d.taux}%</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        d.igc >= 70 ? 'bg-emerald-50 text-emerald-700' :
                        d.igc >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                      }`}>{d.igc}%</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        isConform ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        isWarn ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {isConform ? '✓ Conforme' : isWarn ? '⚠ En cours' : '✗ Non conforme'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
