import { API_BASE_URL, authFetch } from '../../services/api';
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import {
  User, Mail, Building2, Shield, Save, Loader2, Briefcase,
  Calendar, Hash, Layers, MapPin, Users, ChevronRight, CheckCircle2, AlertCircle,
  Award, TrendingUp, Clock
} from 'lucide-react';

interface ObjectifRow { id: number; objectif: string; kpi: string; cible: string; resultat: string; poids: number; }

interface EvalSummary {
  id: number;
  date: string;
  campaignYear: number;
  type: string;
  globalScore: number;
  rhFinalScore: number | null;
  status: string;
  evaluatorName: string;
  objectives: ObjectifRow[];
}

interface ProfileData {
  id: string;
  fullName: string;
  nom: string;
  prenom: string;
  matricule: string;
  email: string;
  role: string;
  poste: string;
  direction: string;
  department: string;
  service: string;
  pole: string;
  categorie: string;
  dateRecrutement: string;
  responsable1: string;
  responsable2: string;
  responsable3: string;
}

const InfoRow: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
      <Icon className="h-4 w-4 text-slate-500" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{value || '—'}</p>
    </div>
  </div>
);

const roleColors: Record<string, string> = {
  SuperAdmin: 'bg-rose-100 text-rose-700 border-rose-200',
  RH: 'bg-violet-100 text-violet-700 border-violet-200',
  Directeur: 'bg-blue-100 text-blue-700 border-blue-200',
  Manager: 'bg-amber-100 text-amber-700 border-amber-200',
  Employé: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const SCORE_LABEL = (s: number) => {
  if (s >= 16) return { label: 'Supérieur', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', emoji: '🏆' };
  if (s >= 11) return { label: 'Satisfaisant', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', emoji: '✅' };
  if (s >= 6)  return { label: 'À améliorer', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', emoji: '⚠️' };
  return { label: 'Insatisfaisant', color: 'text-red-700', bg: 'bg-red-50 border-red-200', emoji: '❌' };
};

export const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [myEvals, setMyEvals] = useState<EvalSummary[]>([]);

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/auth/me`)
      .then(r => r.json())
      .then((data: ProfileData) => {
        if (data.id) {
          setProfile(data);
          setEmail(data.email || '');
          localStorage.setItem('user', JSON.stringify(data));
          useAuthStore.setState({ user: { ...useAuthStore.getState().user!, ...data } as any });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Charger les évaluations de l'employé connecté
    if (user?.username) {
      authFetch(`${API_BASE_URL}/api/team/my-evaluation/${user.username}`)
        .then(r => r.json())
        .then(data => {
          if (data.evaluated && Array.isArray(data.evaluations)) {
            setMyEvals(data.evaluations.map((e: any) => ({
              id: e.id,
              date: e.date,
              campaignYear: e.campaignYear ?? new Date(e.date).getFullYear(),
              type: e.data?.type || '',
              globalScore: e.data?.globalScore ?? 0,
              rhFinalScore: e.data?.rhFinalScore ?? null,
              status: e.status || 'Soumise',
              evaluatorName: e.evaluatorName || '',
              objectives: (e.data?.otherData?.objectives || []).filter((o: ObjectifRow) => o.objectif?.trim()),
            })));
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'PATCH',
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors de la sauvegarde.');
      }
      if (profile) {
        const updated = { ...profile, email };
        setProfile(updated);
        localStorage.setItem('user', JSON.stringify(updated));
        useAuthStore.setState({ user: { ...useAuthStore.getState().user!, email } as any });
      }
      await authFetch(`${API_BASE_URL}/api/history/log`, {
        method: 'POST',
        body: JSON.stringify({ username: user?.username, type: 'profil', action: 'a mis à jour son', target: 'Profil personnel', toTarget: null }),
      }).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error: any) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-10 w-10 text-primary-500 animate-spin" />
    </div>
  );

  const p = profile;
  const initials = p ? `${p.prenom?.charAt(0) || ''}${p.nom?.charAt(0) || ''}` : '?';
  const roleClass = roleColors[p?.role || ''] || 'bg-slate-100 text-slate-700 border-slate-200';

  const formatDate = (d: string) => {
    if (!d) return '';
    const parts = d.slice(0, 10).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  const responsables = [p?.responsable1, p?.responsable2, p?.responsable3].filter(Boolean);

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header banner */}
      <div className="bg-gradient-to-r from-primary-600 to-accent-500 rounded-3xl p-7 text-white relative overflow-hidden shadow-lg shadow-primary-500/20">
        <div className="absolute right-0 top-0 w-56 h-56 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute right-24 bottom-0 w-36 h-36 bg-white/5 rounded-full translate-y-1/2" />
        <div className="relative z-10 flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center font-black text-3xl shadow-lg flex-shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Mon Profil · Talents</p>
            <h1 className="text-3xl font-black tracking-tight">{p?.fullName || user?.fullName}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${roleClass}`}>{p?.role || user?.role}</span>
              {p?.poste && <span className="text-white/80 text-sm font-medium">{p.poste}</span>}
              {p?.matricule && (
                <span className="flex items-center gap-1 text-white/60 text-xs">
                  <Hash className="h-3 w-3" />{p.matricule}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Organisation */}
        <div className="lg:col-span-2 space-y-6">

          {/* Informations personnelles */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
              <User className="h-4 w-4 text-primary-500" /> Identité
            </h2>
            <p className="text-xs text-slate-400 font-medium mb-4">Informations de base gérées par les RH</p>
            <div className="divide-y divide-slate-100">
              <InfoRow icon={User} label="Prénom" value={p?.prenom || ''} />
              <InfoRow icon={User} label="Nom" value={p?.nom || ''} />
              <InfoRow icon={Hash} label="Matricule" value={p?.matricule || ''} />
              <InfoRow icon={Calendar} label="Date de recrutement" value={formatDate(p?.dateRecrutement || '')} />
              <InfoRow icon={Shield} label="Catégorie" value={p?.categorie || ''} />
            </div>
          </div>

          {/* Structure organisationnelle */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" /> Structure Organisationnelle
            </h2>
            <p className="text-xs text-slate-400 font-medium mb-4">Affectation dans l'organigramme LDM GROUPE</p>
            <div className="divide-y divide-slate-100">
              <InfoRow icon={Layers} label="Pôle" value={p?.pole || ''} />
              <InfoRow icon={Building2} label="Direction" value={p?.direction || ''} />
              <InfoRow icon={MapPin} label="Département" value={p?.department || ''} />
              <InfoRow icon={Briefcase} label="Service" value={p?.service || ''} />
              <InfoRow icon={Shield} label="Poste" value={p?.poste || ''} />
            </div>
          </div>

          {/* Responsables hiérarchiques */}
          {responsables.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-500" /> Responsables Hiérarchiques
              </h2>
              <p className="text-xs text-slate-400 font-medium mb-4">Chaîne managériale</p>
              <div className="space-y-2">
                {responsables.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs flex-shrink-0">
                      N{i === 0 ? '+1' : `+${i + 1}`}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Responsable N+{i + 1}</p>
                      <p className="text-sm font-bold text-slate-800">{r}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-amber-300 ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Email editable + infos rapides */}
        <div className="space-y-6">

          {/* Email éditable */}
          <form onSubmit={handleSave} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Mail className="h-4 w-4 text-emerald-500" /> Contact
            </h2>
            <p className="text-xs text-slate-400 font-medium mb-4">Vous pouvez modifier votre email</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Adresse email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-primary-400 focus:border-primary-400 outline-none transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {saved && (
              <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-3 py-2 text-xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> Email mis à jour !
              </div>
            )}
            {saveError && (
              <div className="mt-3 flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2 text-xs font-semibold">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {saveError}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </form>

          {/* Résumé rapide */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-3xl p-6 text-white">
            <h2 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-widest">Résumé</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium">Rôle</span>
                <span className="text-white text-xs font-bold">{p?.role || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium">Catégorie</span>
                <span className="text-white text-xs font-bold">{p?.categorie || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium">Direction</span>
                <span className="text-white text-xs font-bold text-right max-w-[60%] truncate">{p?.direction || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-medium">Département</span>
                <span className="text-white text-xs font-bold text-right max-w-[60%] truncate">{p?.department || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mes évaluations ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
          <Award className="h-4 w-4 text-rose-500" /> Mes Évaluations
        </h2>
        <p className="text-xs text-slate-400 font-medium mb-4">Historique de vos évaluations de performance</p>

        {myEvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <TrendingUp className="h-8 w-8 text-slate-300" />
            <p className="text-slate-400 text-sm font-medium">Aucune évaluation enregistrée</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myEvals.map(ev => {
              const score = ev.rhFinalScore ?? ev.globalScore;
              const sl = SCORE_LABEL(score);
              const isValidated = ev.status === 'Validée';
              return (
                <div key={ev.id} className={`rounded-2xl border p-4 ${sl.bg}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{ev.type}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">Campagne {ev.campaignYear}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isValidated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {ev.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {new Date(ev.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        {ev.evaluatorName && <span className="ml-1">· par {ev.evaluatorName}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-black ${sl.color}`}>{score.toFixed(2)}<span className="text-sm font-semibold text-slate-400">/20</span></p>
                      <p className={`text-xs font-bold ${sl.color}`}>{sl.emoji} {sl.label}</p>
                      {ev.rhFinalScore !== null && ev.rhFinalScore !== ev.globalScore && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Score manager : {ev.globalScore.toFixed(2)}/20</p>
                      )}
                    </div>
                  </div>
                  {/* Barre de progression */}
                  <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${score >= 16 ? 'bg-blue-500' : score >= 11 ? 'bg-emerald-500' : score >= 6 ? 'bg-orange-500' : 'bg-red-500'}`}
                      style={{ width: `${(score / 20) * 100}%` }} />
                  </div>

                  {/* Objectifs fixés pour cette campagne */}
                  {ev.objectives.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/60">
                      <p className="text-xs font-bold text-slate-600 mb-2">Objectifs fixés — Campagne {ev.campaignYear} :</p>
                      {ev.campaignYear === 2026 && (
                        <p className="text-[11px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 mb-2">
                          Exercice 2026 : fixation des objectifs uniquement — les résultats ne seront évalués qu'à la prochaine campagne.
                        </p>
                      )}
                      <div className="space-y-1">
                        {ev.objectives.map(o => (
                          <div key={o.id} className="flex items-center justify-between gap-2 bg-white/70 rounded-lg px-3 py-1.5 text-xs">
                            <span className="text-slate-700 font-medium truncate pr-2">{o.objectif}</span>
                            <span className="text-slate-400 flex-shrink-0">{o.kpi || '—'} {o.cible ? `· Cible : ${o.cible}` : ''}</span>
                          </div>
                        ))}
                      </div>
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
