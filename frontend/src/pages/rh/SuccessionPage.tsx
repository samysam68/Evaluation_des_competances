import React, { useEffect, useState } from 'react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { RHNavTabs } from '../dashboards/RHDashboard';
import { Trophy, AlertTriangle, Briefcase, Users, Loader2, ChevronDown, ChevronUp, Star, TrendingUp, ShieldAlert } from 'lucide-react';

type Risk = 'critique' | 'vigilance' | 'stable';

const RISK_CONFIG: Record<Risk, { label: string; color: string; bg: string; border: string; dot: string }> = {
  critique:  { label: 'Critique',   color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500' },
  vigilance: { label: 'Vigilance',  color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-400' },
  stable:    { label: 'Stable',     color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

// Aligné sur le barème officiel /20 (cf. point 28).
const scoreColor = (s: number | null) => {
  if (s === null) return 'text-slate-400';
  if (s >= 16) return 'text-blue-600';
  if (s >= 11) return 'text-emerald-600';
  if (s >= 6)  return 'text-orange-500';
  return 'text-red-500';
};

interface Talent {
  id: number; name: string; poste: string; direction: string; departement: string;
  categorie: string; score: number; evaluatedAt: string; anciennete: number | null;
  recommendation: string; strengths: string; evalType: string;
}

interface Poste {
  name: string; direction: string; total: number; evaluated: number; avgScore: number | null;
  talentsCount: number; critiquesCount: number; minScore: number | null; maxScore: number | null;
  risk: Risk; coverage: number;
}

interface Summary { totalTalents: number; totalCritical: number; totalVigilance: number; uniquePostes: number; }

type TabId = 'talents' | 'postes';

export const SuccessionPage: React.FC = () => {
  const [data, setData] = useState<{ summary: Summary; talents: Talent[]; postes: Poste[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('talents');

  // Postes filters
  const [riskFilter, setRiskFilter] = useState<Risk | 'all'>('all');
  const [expandedPoste, setExpandedPoste] = useState<string | null>(null);

  // Talents search
  const [search, setSearch] = useState('');

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/rh/succession`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (!d?.summary || !Array.isArray(d.talents) || !Array.isArray(d.postes)) {
          throw new Error('Réponse inattendue du serveur.');
        }
        setData(d);
        setLoading(false);
      })
      .catch((e) => { setError(e.message || 'Impossible de charger les données.'); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="max-w-7xl mx-auto space-y-6">
      <RHNavTabs />
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="max-w-7xl mx-auto space-y-6">
      <RHNavTabs />
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 font-semibold">{error || 'Erreur inconnue.'}</div>
    </div>
  );

  const { summary, talents, postes } = data;

  const filteredTalents = talents.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.poste || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.direction || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredPostes = postes.filter(p => riskFilter === 'all' || p.risk === riskFilter);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <RHNavTabs />

      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-6 w-6 text-white/80" />
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Analyse de Succession</h1>
          </div>
          <p className="text-white/70 text-sm">Identification des talents, postes critiques et risques de succession.</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm flex flex-col gap-2">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-3xl font-black text-blue-600">{summary.totalTalents}</p>
          <p className="text-xs font-bold text-slate-500">Talents identifiés</p>
          <p className="text-[10px] text-slate-400">Score ≥ 16/20</p>
        </div>
        <div className="bg-white rounded-2xl border border-red-100 p-5 shadow-sm flex flex-col gap-2">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-red-500" />
          </div>
          <p className="text-3xl font-black text-red-500">{summary.totalCritical}</p>
          <p className="text-xs font-bold text-slate-500">Postes critiques</p>
          <p className="text-[10px] text-slate-400">Titulaire unique & talent</p>
        </div>
        <div className="bg-white rounded-2xl border border-orange-100 p-5 shadow-sm flex flex-col gap-2">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
          </div>
          <p className="text-3xl font-black text-orange-500">{summary.totalVigilance}</p>
          <p className="text-xs font-bold text-slate-500">Postes à surveiller</p>
          <p className="text-[10px] text-slate-400">Risque modéré</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col gap-2">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-slate-500" />
          </div>
          <p className="text-3xl font-black text-slate-700">{summary.uniquePostes}</p>
          <p className="text-xs font-bold text-slate-500">Postes analysés</p>
          <p className="text-[10px] text-slate-400">Référentiel complet</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-1.5 w-fit">
        {([['talents', Trophy, 'Talents'], ['postes', Briefcase, 'Postes critiques']] as [TabId, React.ElementType, string][]).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === id ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {/* ── TALENTS TAB ── */}
      {tab === 'talents' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un talent…"
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-400 w-64 shadow-sm"
            />
            <span className="text-xs text-slate-400 font-semibold">{filteredTalents.length} résultat{filteredTalents.length !== 1 ? 's' : ''}</span>
          </div>

          {filteredTalents.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center text-slate-400">
              <Trophy className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Aucun talent avec score ≥ 16 pour le moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTalents.map((t) => (
                <div key={t.id} className="bg-white rounded-2xl border border-violet-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-black text-lg flex-shrink-0 shadow">
                      {t.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-slate-800">{t.name}</p>
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Talent</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{t.poste}</p>
                      <p className="text-[11px] text-slate-400">{t.direction || t.departement}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-2xl font-black ${scoreColor(t.score)}`}>
                        {t.score.toFixed(1)}<span className="text-sm text-slate-400">/20</span>
                      </p>
                      <div className="flex justify-end gap-0.5 mt-1">
                        {[1,2,3,4,5].map(i => (
                          <Star key={i} className={`h-3 w-3 ${i <= Math.round(t.score / 4) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-wrap gap-2">
                    {t.categorie && (
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg uppercase tracking-wide">
                        {t.categorie}
                      </span>
                    )}
                    {t.anciennete !== null && (
                      <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg">
                        {t.anciennete} an{t.anciennete !== 1 ? 's' : ''} d'ancienneté
                      </span>
                    )}
                    {t.evaluatedAt && (
                      <span className="text-[10px] text-slate-400 px-2 py-1">
                        Évalué le {new Date(t.evaluatedAt).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>

                  {/* Strengths */}
                  {t.strengths && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Points forts</p>
                      <p className="text-xs text-slate-600 line-clamp-2">{t.strengths}</p>
                    </div>
                  )}

                  {/* Recommendation */}
                  {t.recommendation && (
                    <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                      <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest mb-1">Appréciation responsable</p>
                      <p className="text-xs text-slate-600 line-clamp-2 italic">"{t.recommendation}"</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── POSTES TAB ── */}
      {tab === 'postes' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'critique', 'vigilance', 'stable'] as const).map(r => {
              const cfg = r !== 'all' ? RISK_CONFIG[r] : null;
              const active = riskFilter === r;
              return (
                <button key={r} onClick={() => setRiskFilter(r)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                    active
                      ? r === 'all' ? 'border-violet-500 bg-violet-600 text-white'
                        : `${cfg!.border} ${cfg!.bg} ${cfg!.color}`
                      : 'border-transparent bg-white text-slate-500 hover:border-slate-200'
                  }`}>
                  {r !== 'all' && <span className={`w-2 h-2 rounded-full ${cfg!.dot}`} />}
                  {r === 'all' ? 'Tous' : cfg!.label}
                </button>
              );
            })}
            <span className="ml-2 text-xs text-slate-400 font-semibold self-center">
              {filteredPostes.length} poste{filteredPostes.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-2">
            {filteredPostes.map((p) => {
              const cfg = RISK_CONFIG[p.risk];
              const isOpen = expandedPoste === p.name;
              return (
                <div key={p.name} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${cfg.border}`}>
                  <button
                    onClick={() => setExpandedPoste(isOpen ? null : p.name)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left">
                    {/* Risk dot */}
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.dot}`} />

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{p.name}</p>
                      {p.direction && <p className="text-xs text-slate-400 truncate">{p.direction}</p>}
                    </div>

                    {/* Chips */}
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                        <Users className="h-3 w-3 inline mr-1" />{p.total}
                      </span>
                      {p.talentsCount > 0 && (
                        <span className="text-xs font-semibold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                          <Trophy className="h-3 w-3 inline mr-1" />{p.talentsCount} talent{p.talentsCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {p.avgScore !== null && (
                        <span className={`text-sm font-black ${scoreColor(p.avgScore)}`}>
                          {p.avgScore.toFixed(1)}<span className="text-xs text-slate-400">/20</span>
                        </span>
                      )}
                    </div>

                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className={`border-t px-5 py-4 ${cfg.bg} ${cfg.border}`}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div className="bg-white/70 rounded-xl px-4 py-3 space-y-0.5 border border-white/80">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Titulaires</p>
                          <p className="font-black text-slate-700 text-lg">{p.total}</p>
                          <p className="text-[11px] text-slate-400">{p.evaluated} évalué{p.evaluated !== 1 ? 's' : ''} ({p.coverage}%)</p>
                        </div>
                        <div className="bg-white/70 rounded-xl px-4 py-3 space-y-0.5 border border-white/80">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Score moyen</p>
                          <p className={`font-black text-lg ${scoreColor(p.avgScore)}`}>{p.avgScore !== null ? p.avgScore.toFixed(1) : '—'}<span className="text-xs text-slate-400">/20</span></p>
                        </div>
                        <div className="bg-white/70 rounded-xl px-4 py-3 space-y-0.5 border border-white/80">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Talents (≥17)</p>
                          <p className="font-black text-blue-600 text-lg">{p.talentsCount}</p>
                        </div>
                        <div className="bg-white/70 rounded-xl px-4 py-3 space-y-0.5 border border-white/80">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Situation critique</p>
                          <p className="font-black text-red-500 text-lg">{p.critiquesCount}</p>
                          <p className="text-[11px] text-slate-400">Score &lt; 10/20</p>
                        </div>
                      </div>

                      {/* Risk explanation */}
                      {p.risk !== 'stable' && (
                        <div className="mt-3 flex items-start gap-2 bg-white/60 rounded-xl px-4 py-3 border border-white/80">
                          <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${cfg.color}`} />
                          <p className={`text-xs font-semibold ${cfg.color}`}>
                            {p.risk === 'critique'
                              ? `Poste occupé par un seul titulaire classé Talent. Le départ ou la promotion de cet employé créerait un vide non couvert.`
                              : `Poste à surveiller : effectif réduit (${p.total}) avec ${p.talentsCount > 0 ? `${p.talentsCount} talent(s)` : `${p.critiquesCount} employé(s) en difficulté`}. Planifier une montée en compétences.`
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
