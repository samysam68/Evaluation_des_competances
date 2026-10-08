import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Users, CheckCircle2, XCircle, Clock, Send,
  Plus, Search, ChevronRight, ArrowLeft, Loader2, Building2,
  Eye, Pencil, AlertCircle, UserPlus, Trash2, ShieldCheck,
} from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

// ──── Types ──────────────────────────────────────────────────────────────────
interface TeamEmployee {
  id: number; matricule: string; nom: string; prenom: string;
  poste: string; direction: string; departement: string; service: string;
  fichePosteId: number | null; fichePosteFile: string | null;
  ficheIntitule: string | null; ficheStatus: string | null;
}
interface Delegation {
  id: number; delegatedBy: number; delegatedTo: number;
  direction: string; departement: string; createdAt: string;
  byNom: string; byPrenom: string;
  toNom: string; toPrenom: string; toPoste: string;
}
interface TeamMember { id: number; nom: string; prenom: string; poste: string; role: string; departement: string; }

// ──── Badge statut fiche ─────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  const cfg: Record<string, { label: string; cls: string }> = {
    brouillon:  { label: 'Brouillon',  cls: 'bg-slate-100 text-slate-600' },
    soumis_rh:  { label: 'En attente RH', cls: 'bg-amber-100 text-amber-700' },
    valide:     { label: 'Validée',    cls: 'bg-emerald-100 text-emerald-700' },
    rejete:     { label: 'Rejetée',    cls: 'bg-red-100 text-red-700' },
  };
  if (!status) return <span className="text-xs text-slate-300 italic">Aucune</span>;
  const { label, cls } = cfg[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{label}</span>;
};

// ──── Panneau employé ─────────────────────────────────────────────────────────
const EmployeePanel: React.FC<{
  emp: TeamEmployee;
  userRole: string;
  onBack: () => void;
  onRefresh: () => void;
}> = ({ emp, onBack, onRefresh }) => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  const hasFiche  = Boolean(emp.fichePosteId);
  const canSubmit = (hasFiche && emp.ficheStatus === 'brouillon') || emp.ficheStatus === 'rejete';
  const canEdit   = hasFiche && emp.ficheStatus !== 'valide';

  const handleSubmit = async () => {
    if (!emp.fichePosteId) return;
    if (!confirm('Soumettre la fiche pour validation RH ?')) return;
    setSubmitting(true);
    const r = await authFetch(`${API_BASE_URL}/api/fiche-poste/${emp.fichePosteId}/submit`, { method: 'PATCH' });
    const d = await r.json();
    if (r.ok) { setSubmitDone(true); onRefresh(); }
    else alert(d.message || 'Erreur lors de la soumission.');
    setSubmitting(false);
  };

  const navToCreate = () => {
    const params = new URLSearchParams({
      employeeId:   String(emp.id),
      employeeName: `${emp.prenom} ${emp.nom}`,
      ...(emp.poste       && { intitule:    emp.poste }),
      ...(emp.direction   && { direction:   emp.direction }),
      ...(emp.departement && { departement: emp.departement }),
      ...(emp.service     && { service:     emp.service }),
    });
    navigate(`/dashboard/rh/fiches-poste/new?${params.toString()}`);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0"><ArrowLeft className="h-4 w-4" /></button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
          {emp.prenom?.[0]}{emp.nom?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-800 text-base leading-tight">{emp.prenom} {emp.nom}</p>
          <p className="text-xs text-slate-400 truncate">{emp.poste || '—'}</p>
        </div>
      </div>

      {/* Statut */}
      <div className={`rounded-2xl px-4 py-3 mb-4 border ${hasFiche ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-semibold mb-0.5">Statut fiche de poste</p>
            <StatusBadge status={emp.ficheStatus} />
          </div>
          {hasFiche && <FileText className="h-8 w-8 text-indigo-200" />}
        </div>
        {emp.ficheIntitule && <p className="text-sm font-bold text-indigo-800 mt-2 truncate">{emp.ficheIntitule}</p>}
        {/* Commentaire rejet */}
        {emp.ficheStatus === 'rejete' && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-red-600 uppercase mb-0.5">Motif du rejet RH</p>
            <p className="text-xs text-red-700">{(emp as any).validationComment || '—'}</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {/* Actions sur fiche existante */}
        {hasFiche && (
          <>
            <button onClick={() => navigate(`/dashboard/rh/fiches-poste/${emp.fichePosteId}/print`)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors w-full justify-center">
              <Eye className="h-4 w-4 text-indigo-500" /> Consulter la fiche
            </button>
            {canEdit && (
              <button onClick={() => navigate(`/dashboard/rh/fiches-poste/${emp.fichePosteId}/edit`)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors w-full justify-center">
                <Pencil className="h-4 w-4 text-amber-500" /> Modifier la fiche
              </button>
            )}
          </>
        )}

        {/* Soumettre au RH */}
        {canSubmit && !submitDone && (
          <button onClick={handleSubmit} disabled={submitting}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-500 text-white rounded-xl text-sm font-bold transition-colors w-full justify-center disabled:opacity-60 shadow-sm">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {emp.ficheStatus === 'rejete' ? 'Resoumettre au RH' : 'Soumettre au RH'}
          </button>
        )}
        {submitDone && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold w-full justify-center">
            <CheckCircle2 className="h-4 w-4" /> Soumis au RH
          </div>
        )}
        {emp.ficheStatus === 'soumis_rh' && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-bold w-full justify-center">
            <Clock className="h-4 w-4" /> En attente de validation RH
          </div>
        )}
      </div>

      {/* Créer fiche */}
      <div className="border-t border-slate-100 pt-4 mt-4 flex-shrink-0">
        <button onClick={navToCreate}
          className="flex items-center gap-2 px-4 py-2.5 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors w-full justify-center">
          <Plus className="h-4 w-4" />
          {hasFiche ? 'Créer une nouvelle version' : 'Créer la fiche de poste'}
        </button>
      </div>
    </div>
  );
};

// ──── Gestion des délégations ─────────────────────────────────────────────────
const DelegationPanel: React.FC<{
  delegations: Delegation[];
  onRevoke: (id: number) => void;
  onGrant: () => void;
  userRole: string;
  userId: number;
}> = ({ delegations, onRevoke, onGrant, userRole, userId: panelUserId }) => {
  const canGrant = ['Directeur', 'Manager', 'RH', 'SuperAdmin'].includes(userRole);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-violet-600" />
          <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Délégations actives</p>
        </div>
        {canGrant && (
          <button onClick={onGrant}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 transition-colors">
            <UserPlus className="h-3 w-3" /> Accorder
          </button>
        )}
      </div>
      {delegations.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">Aucune délégation active</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {delegations.map(d => (
            <div key={d.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-black text-violet-700 flex-shrink-0">
                {d.toPrenom?.[0]}{d.toNom?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{d.toPrenom} {d.toNom}</p>
                <p className="text-xs text-slate-400 truncate">{d.toPoste} · {d.direction || d.departement || '—'}</p>
              </div>
              {(d.delegatedBy === panelUserId || ['RH', 'SuperAdmin'].includes(userRole)) && (
                <button onClick={() => onRevoke(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ──── Modal accorder délégation ───────────────────────────────────────────────
const GrantDelegationModal: React.FC<{
  teamMembers: TeamMember[];
  direction: string;
  onClose: () => void;
  onGrant: (toId: number, dept?: string) => void;
}> = ({ teamMembers, direction, onClose, onGrant }) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dept, setDept] = useState('');
  const responsables = teamMembers.filter(m => m.role === 'Responsable' || m.role === 'Gestionnaire');
  const all = teamMembers.filter(m => !['Directeur', 'Manager', 'RH', 'SuperAdmin'].includes(m.role));
  const candidates = responsables.length > 0 ? responsables : all;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-black text-slate-800 text-lg mb-1">Accorder une délégation</h3>
        <p className="text-xs text-slate-400 mb-4">Le responsable sélectionné pourra créer et modifier des fiches de poste pour l'équipe.</p>
        <label className="block text-xs font-bold text-slate-600 mb-1.5">Sélectionner un responsable</label>
        <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
          {candidates.map(m => (
            <button key={m.id} onClick={() => setSelectedId(m.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${selectedId === m.id ? 'border-violet-400 bg-violet-50' : 'border-slate-100 hover:bg-slate-50'}`}>
              <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-black text-violet-700 flex-shrink-0">
                {m.prenom?.[0]}{m.nom?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{m.prenom} {m.nom}</p>
                <p className="text-xs text-slate-400 truncate">{m.poste}</p>
              </div>
              {selectedId === m.id && <CheckCircle2 className="h-4 w-4 text-violet-600 flex-shrink-0" />}
            </button>
          ))}
          {candidates.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun responsable disponible</p>}
        </div>
        <label className="block text-xs font-bold text-slate-600 mb-1.5">Département ciblé (optionnel, vide = toute la direction)</label>
        <input type="text" value={dept} onChange={e => setDept(e.target.value)}
          placeholder={`Direction: ${direction}`}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-300 mb-4" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">Annuler</button>
          <button disabled={!selectedId}
            onClick={() => { if (selectedId) { onGrant(selectedId, dept || undefined); onClose(); } }}
            className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors disabled:opacity-50">
            Accorder
          </button>
        </div>
      </div>
    </div>
  );
};

// ──── Page principale ─────────────────────────────────────────────────────────
export const FichesPosteEquipePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [team, setTeam]               = useState<TeamEmployee[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading]         = useState(true);
  const [searchEmp, setSearchEmp]     = useState('');
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp]   = useState<TeamEmployee | null>(null);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [filterStatus, setFilterStatus]   = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    const [teamRes, delegRes] = await Promise.all([
      authFetch(`${API_BASE_URL}/api/fiche-poste/team`),
      authFetch(`${API_BASE_URL}/api/fiche-poste/delegations`),
    ]);
    if (teamRes.ok)  { const d = await teamRes.json();  if (Array.isArray(d)) setTeam(d); }
    if (delegRes.ok) { const d = await delegRes.json(); if (Array.isArray(d)) setDelegations(d); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Charge les membres d'équipe pour la modal de délégation
  useEffect(() => {
    if (!user) return;
    authFetch(`${API_BASE_URL}/api/team/members/${user.username}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setTeamMembers(d); })
      .catch(() => {});
  }, [user]);

  const handleRevoke = async (id: number) => {
    if (!confirm('Révoquer cette délégation ?')) return;
    await authFetch(`${API_BASE_URL}/api/fiche-poste/delegate/${id}`, { method: 'DELETE' });
    loadData();
  };

  const handleGrant = async (toId: number, dept?: string) => {
    const r = await authFetch(`${API_BASE_URL}/api/fiche-poste/delegate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delegatedToId: toId, departement: dept }),
    });
    const d = await r.json();
    if (!r.ok) { alert(d.message || 'Erreur'); return; }
    loadData();
  };

  // Groupement par département
  type DeptInfo = { name: string; total: number; withFiche: number; pending: number };
  const allDepts: DeptInfo[] = Object.values(
    team.reduce<Record<string, DeptInfo>>((acc, e) => {
      const key = e.departement?.trim() || 'Non défini';
      if (!acc[key]) acc[key] = { name: key, total: 0, withFiche: 0, pending: 0 };
      acc[key].total++;
      if (e.fichePosteId) acc[key].withFiche++;
      if (e.ficheStatus === 'soumis_rh') acc[key].pending++;
      return acc;
    }, {})
  ).sort((a, b) => a.name.localeCompare(b.name));

  const deptEmployees = selectedDept
    ? team.filter(e => {
        const matchDept = (e.departement?.trim() || 'Non défini') === selectedDept;
        const matchSearch = `${e.nom} ${e.prenom} ${e.poste}`.toLowerCase().includes(searchEmp.toLowerCase());
        const matchStatus = filterStatus === 'all' || e.ficheStatus === filterStatus || (!e.ficheStatus && filterStatus === 'none');
        return matchDept && matchSearch && matchStatus;
      })
    : [];

  const totals = { total: team.length, withFiche: team.filter(e => e.fichePosteId).length, pending: team.filter(e => e.ficheStatus === 'soumis_rh').length, validated: team.filter(e => e.ficheStatus === 'valide').length };


  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-500" /> Fiches de Poste — Mon Équipe
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {totals.withFiche}/{totals.total} fiches créées · {totals.validated} validées · {totals.pending > 0 && <span className="text-amber-600 font-bold">{totals.pending} en attente RH</span>}
          </p>
        </div>
      </div>

      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour
      </button>

      {/* KPI rapides */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Membres équipe', val: totals.total, color: 'text-slate-700', bg: 'bg-slate-50' },
          { label: 'Fiches créées',  val: totals.withFiche, color: 'text-indigo-700', bg: 'bg-indigo-50' },
          { label: 'Validées RH',    val: totals.validated, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'En attente RH',  val: totals.pending,   color: 'text-amber-700', bg: 'bg-amber-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4 border border-slate-100`}>
            <p className={`text-2xl font-black ${k.color}`}>{k.val}</p>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4" style={{ minHeight: '68vh' }}>
        {/* ── Col 1 : Départements ── */}
        <div className="w-64 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Départements</p>
            </div>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: '55vh' }}>
                {allDepts.map(dept => {
                  const pct = dept.total > 0 ? Math.round((dept.withFiche / dept.total) * 100) : 0;
                  const isSelected = selectedDept === dept.name;
                  return (
                    <button key={dept.name}
                      onClick={() => { setSelectedDept(dept.name); setSelectedEmp(null); setSearchEmp(''); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-slate-50 ${isSelected ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>{dept.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{dept.withFiche}/{dept.total}</span>
                        </div>
                        {dept.pending > 0 && <span className="text-[10px] text-amber-600 font-bold">{dept.pending} en attente RH</span>}
                      </div>
                      <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`} />
                    </button>
                  );
                })}
                {allDepts.length === 0 && (
                  <div className="py-8 text-center text-slate-400 text-sm">Aucun département</div>
                )}
              </div>
            )}
          </div>

          {/* Délégations */}
          <DelegationPanel
            delegations={delegations}
            userRole={user?.role || ''}
            userId={Number(user?.id) || 0}
            onRevoke={handleRevoke}
            onGrant={() => setShowGrantModal(true)}
          />
        </div>

        {/* ── Col 2 : Employés ── */}
        {!selectedDept ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
            <Building2 className="h-10 w-10 text-slate-200 mb-3" />
            <p className="text-slate-400 font-semibold text-sm">Sélectionnez un département</p>
          </div>
        ) : (
          <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all ${selectedEmp ? 'w-72 flex-shrink-0' : 'flex-1'}`}>
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-xs font-black text-slate-700 uppercase tracking-widest flex-1 truncate">{selectedDept}</p>
              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{deptEmployees.length}</span>
            </div>
            {/* Filtres */}
            <div className="px-3 py-2 border-b border-slate-100 space-y-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={searchEmp} onChange={e => setSearchEmp(e.target.value)}
                  placeholder="Rechercher…"
                  className="pl-8 pr-3 py-1.5 w-full text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 bg-white" />
              </div>
              <div className="flex gap-1 flex-wrap">
                {[['all','Tous'],['none','Sans fiche'],['brouillon','Brouillon'],['soumis_rh','En attente'],['valide','Validées'],['rejete','Rejetées']].map(([val,lbl]) => (
                  <button key={val} onClick={() => setFilterStatus(val)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${filterStatus === val ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {deptEmployees.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-300 text-sm">Aucun employé trouvé.</div>
              ) : deptEmployees.map(emp => {
                const isSelected = selectedEmp?.id === emp.id;
                const icon = emp.ficheStatus === 'valide' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : emp.ficheStatus === 'soumis_rh' ? <Clock className="h-4 w-4 text-amber-500" />
                  : emp.ficheStatus === 'rejete' ? <AlertCircle className="h-4 w-4 text-red-400" />
                  : emp.fichePosteId ? <FileText className="h-4 w-4 text-indigo-400" />
                  : <XCircle className="h-4 w-4 text-slate-300" />;
                return (
                  <button key={emp.id} onClick={() => setSelectedEmp(isSelected ? null : emp)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}>
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black flex-shrink-0">
                      {emp.prenom?.[0]}{emp.nom?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{emp.prenom} {emp.nom}</p>
                      <p className="text-xs text-slate-400 truncate">{emp.poste || '—'}</p>
                    </div>
                    <div className="flex-shrink-0">{icon}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Col 3 : Panneau employé ── */}
        {selectedEmp && (
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col overflow-hidden" style={{ maxHeight: '75vh' }}>
            <EmployeePanel
              emp={selectedEmp}
              userRole={user?.role || ''}
              onBack={() => setSelectedEmp(null)}
              onRefresh={() => { loadData(); if (selectedEmp) { /* refresh emp */ } }}
            />
          </div>
        )}
      </div>

      {/* Modal délégation */}
      {showGrantModal && (
        <GrantDelegationModal
          teamMembers={teamMembers}
          direction={user?.direction || ''}
          onClose={() => setShowGrantModal(false)}
          onGrant={handleGrant}
        />
      )}
    </div>
  );
};
