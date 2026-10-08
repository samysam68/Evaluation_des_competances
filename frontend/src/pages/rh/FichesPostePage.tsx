import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, FileText, Users, Pencil, Loader2, Eye,
  CheckCircle2, XCircle, ChevronRight, ArrowLeft, Upload,
  Download, Building2, ExternalLink, X, Clock, AlertCircle,
  ShieldCheck, MessageSquare
} from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { RHNavTabs } from '../dashboards/RHDashboard';

// ──── Types ────────────────────────────────────────────────────────────────────
interface EmployeeStatus {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  poste: string;
  direction: string;
  departement: string;
  service: string;
  fichePosteId: number | null;
  fichePosteFile: string | null;
  ficheIntitule: string | null;
  ficheStatus: string | null;
  validationComment?: string;
}

// Badge statut fiche
const FicheStatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  const cfg: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    brouillon:  { label: 'Brouillon',     cls: 'bg-slate-100 text-slate-600',   icon: FileText },
    soumis_rh:  { label: 'En attente RH', cls: 'bg-amber-100 text-amber-700',   icon: Clock },
    valide:     { label: 'Validée',       cls: 'bg-emerald-100 text-emerald-700', icon: ShieldCheck },
    rejete:     { label: 'Rejetée',       cls: 'bg-red-100 text-red-700',        icon: AlertCircle },
  };
  if (!status) return null;
  const { label, cls, icon: Icon } = cfg[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500', icon: FileText };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>
      <Icon className="h-2.5 w-2.5" />{label}
    </span>
  );
};

interface FichePoste {
  id: number;
  intitule: string;
  statut: string;
  categorie: string;
  direction: string;
  departement: string;
  missionPrincipale?: string;
  activitesPrincipales?: string[];
}

interface DeptInfo {
  name: string;
  total: number;
  withFiche: number;
}

// ──── Panneau fiche d'un employé ───────────────────────────────────────────────
const EmployeeFichePanel: React.FC<{
  employee: EmployeeStatus;
  onBack: () => void;
  onRefresh: () => void;
}> = ({ employee, onBack, onRefresh }) => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  // RH peut créer uniquement pour son propre département
  const isRHUser = currentUser?.role === 'RH';
  const canCreate = !isRHUser || (employee.departement === currentUser?.department);
  const [ficheDetail, setFicheDetail] = useState<FichePoste | null>(null);
  const [loadingFiche, setLoadingFiche] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState<'validate' | 'reject' | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFicheDetail(null);
    if (employee.fichePosteId) {
      setLoadingFiche(true);
      authFetch(`${API_BASE_URL}/api/fiche-poste/${employee.fichePosteId}`)
        .then(r => r.json())
        .then(data => { if (data.id) setFicheDetail(data); setLoadingFiche(false); });
    }
  }, [employee.id, employee.fichePosteId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const { token } = useAuthStore.getState();
    await fetch(`${API_BASE_URL}/api/fiche-poste/upload/${employee.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    setUploading(false);
    onRefresh();
  };

  const handleUnassignFiche = async () => {
    if (!employee.fichePosteId) return;
    if (!confirm('Retirer la fiche de poste assignée ?')) return;
    setSaving(true);
    await authFetch(`${API_BASE_URL}/api/fiche-poste/${employee.fichePosteId}/unassign-employee/${employee.id}`, { method: 'PATCH' });
    setSaving(false);
    onRefresh();
  };

  const openPdf = async (download = false) => {
    const r = await authFetch(`${API_BASE_URL}/api/fiche-poste/download/${employee.id}`);
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `FichePoste_${employee.prenom}_${employee.nom}.pdf`;
      a.click();
    } else {
      window.open(url, '_blank');
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleRemoveFile = async () => {
    if (!confirm('Supprimer le fichier PDF ?')) return;
    setSaving(true);
    const { token } = useAuthStore.getState();
    await fetch(`${API_BASE_URL}/api/fiche-poste/remove-file/${employee.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setSaving(false);
    onRefresh();
  };

  const handleValidate = async () => {
    if (!employee.fichePosteId) return;
    if (!confirm('Valider cette fiche de poste ?')) return;
    setValidating('validate');
    const r = await authFetch(`${API_BASE_URL}/api/fiche-poste/${employee.fichePosteId}/validate`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: '' }),
    });
    setValidating(null);
    if (r.ok) onRefresh(); else alert((await r.json()).message || 'Erreur');
  };

  const handleReject = async () => {
    if (!employee.fichePosteId || !rejectComment.trim()) { alert('Le commentaire de rejet est requis.'); return; }
    setValidating('reject');
    const r = await authFetch(`${API_BASE_URL}/api/fiche-poste/${employee.fichePosteId}/reject`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: rejectComment }),
    });
    setValidating(null);
    if (r.ok) { setShowRejectBox(false); setRejectComment(''); onRefresh(); }
    else alert((await r.json()).message || 'Erreur');
  };

  const hasFiche = Boolean(employee.fichePosteId);
  const hasFile  = Boolean(employee.fichePosteFile);

  return (
    <div className="h-full flex flex-col">
      {/* Header employé */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
          {employee.prenom?.[0]}{employee.nom?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-800 text-base leading-tight">{employee.prenom} {employee.nom}</p>
          <p className="text-xs text-slate-400 truncate">{employee.poste || '—'}{employee.matricule ? ` · ${employee.matricule}` : ''}</p>
        </div>
      </div>

      {/* Bandeau statut */}
      <div className={`rounded-2xl px-4 py-3 mb-5 flex items-center gap-3 ${hasFiche || hasFile ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
        {(hasFiche || hasFile)
          ? <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          : <XCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          {hasFiche  && <p className="text-sm font-bold text-emerald-800 truncate">{employee.ficheIntitule}</p>}
          {hasFile && !hasFiche && <p className="text-sm font-bold text-emerald-800">Fiche PDF importée</p>}
          {!hasFiche && !hasFile && <p className="text-sm font-bold text-amber-700">Aucune fiche de poste</p>}
          <p className="text-xs text-slate-500">{[employee.departement, employee.service].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      {/* Badge statut fiche */}
      {employee.ficheStatus && (
        <div className="mb-3">
          <FicheStatusBadge status={employee.ficheStatus} />
        </div>
      )}

      {/* ── Bandeau validation RH ── */}
      {employee.fichePosteId && employee.ficheStatus === 'soumis_rh' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-bold text-amber-800">Fiche soumise — En attente de validation RH</p>
          </div>
          {!showRejectBox ? (
            <div className="flex gap-2">
              <button onClick={handleValidate} disabled={!!validating}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60">
                {validating === 'validate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Valider
              </button>
              <button onClick={() => setShowRejectBox(true)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors">
                <XCircle className="h-3.5 w-3.5" /> Rejeter
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                <p className="text-xs font-bold text-red-700">Motif du rejet (obligatoire)</p>
              </div>
              <textarea value={rejectComment} onChange={e => setRejectComment(e.target.value)}
                placeholder="Expliquer la raison du rejet…"
                rows={2}
                className="w-full px-3 py-2 text-xs border border-red-200 rounded-xl outline-none focus:ring-1 focus:ring-red-300 resize-none" />
              <div className="flex gap-2">
                <button onClick={() => { setShowRejectBox(false); setRejectComment(''); }}
                  className="flex-1 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50">Annuler</button>
                <button onClick={handleReject} disabled={!!validating || !rejectComment.trim()}
                  className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 disabled:opacity-50">
                  {validating === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Confirmer rejet'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Commentaire de rejet affiché (status = rejete) */}
      {employee.ficheStatus === 'rejete' && employee.validationComment && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
          <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Motif du rejet RH</p>
          <p className="text-xs text-red-700">{employee.validationComment}</p>
        </div>
      )}

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">

        {/* ── Fiche système ── */}
        {hasFiche && (
          <>
            {loadingFiche ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>
            ) : ficheDetail ? (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-500">
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Identification</p>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {([
                        ['Statut',      ficheDetail.statut],
                        ['Catégorie',   ficheDetail.categorie],
                        ['Direction',   ficheDetail.direction],
                        ['Département', ficheDetail.departement],
                      ] as [string, string][]).filter(([, v]) => v).map(([label, val]) => (
                        <tr key={label} className="border-b border-slate-50">
                          <td className="px-4 py-2 font-semibold text-slate-500 bg-slate-50 w-28">{label}</td>
                          <td className="px-4 py-2 text-slate-800">{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {ficheDetail.missionPrincipale && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
                    <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider mb-1">Mission principale</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{ficheDetail.missionPrincipale}</p>
                  </div>
                )}

                {ficheDetail.activitesPrincipales && ficheDetail.activitesPrincipales.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Activités principales</p>
                    <ul className="space-y-1">
                      {ficheDetail.activitesPrincipales.slice(0, 5).map((a, i) => (
                        <li key={i} className="flex gap-2 text-xs text-slate-700">
                          <span className="text-indigo-500 font-bold flex-shrink-0">▸</span>{a}
                        </li>
                      ))}
                      {ficheDetail.activitesPrincipales.length > 5 && (
                        <li className="text-xs text-slate-400 italic">+ {ficheDetail.activitesPrincipales.length - 5} autres…</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <button onClick={() => navigate(`/dashboard/rh/fiches-poste/${employee.fichePosteId}/print`)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors w-full justify-center">
                    <Eye className="h-4 w-4" /> Voir la fiche complète
                  </button>
                  <button onClick={() => navigate(`/dashboard/rh/fiches-poste/${employee.fichePosteId}/edit`)}
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors w-full justify-center">
                    <Pencil className="h-4 w-4" /> Modifier la fiche
                  </button>
                  <button onClick={handleUnassignFiche} disabled={saving}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-semibold justify-center transition-colors disabled:opacity-50 py-1">
                    <X className="h-3 w-3" /> Retirer cette fiche
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}

        {/* ── PDF importé ── */}
        {hasFile && !hasFiche && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
              <FileText className="h-7 w-7 text-red-500" />
            </div>
            <p className="font-bold text-slate-800 text-sm">Fiche PDF importée</p>
            <button onClick={() => openPdf(false)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors w-full justify-center">
              <ExternalLink className="h-4 w-4" /> Ouvrir le PDF
            </button>
            <button onClick={() => openPdf(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors w-full justify-center">
              <Download className="h-4 w-4" /> Télécharger
            </button>
            <button onClick={handleRemoveFile} disabled={saving}
              className="text-xs text-red-400 hover:text-red-600 font-semibold flex items-center gap-1 transition-colors">
              <X className="h-3 w-3" /> Supprimer le PDF
            </button>
          </div>
        )}

        {/* ── Aucune fiche ── */}
        {!hasFiche && !hasFile && (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <FileText className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-bold text-slate-500">Aucune fiche de poste</p>
            <p className="text-xs text-slate-400">Créez-en une ou importez un PDF</p>
          </div>
        )}
      </div>

      {/* ── Actions fixes en bas ── */}
      <div className="border-t border-slate-100 pt-4 mt-4 space-y-2 flex-shrink-0">
        {canCreate && (
          <button
            onClick={() => {
              const params = new URLSearchParams({
                employeeId:   String(employee.id),
                employeeName: `${employee.prenom} ${employee.nom}`,
                ...(employee.poste       && { intitule:    employee.poste }),
                ...(employee.direction   && { direction:   employee.direction }),
                ...(employee.departement && { departement: employee.departement }),
                ...(employee.service     && { service:     employee.service }),
              });
              navigate(`/dashboard/rh/fiches-poste/new?${params.toString()}`);
            }}
            className="flex items-center gap-2 px-4 py-2.5 border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors w-full justify-center">
            <Plus className="h-4 w-4" />
            {hasFiche ? 'Créer une nouvelle fiche' : 'Créer la fiche de poste'}
          </button>
        )}

        <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleUpload} className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors w-full justify-center disabled:opacity-60">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {hasFile ? 'Remplacer le PDF' : 'Importer un PDF'}
        </button>
      </div>
    </div>
  );
};

// ──── Page principale ───────────────────────────────────────────────────────────
export const FichesPostePage: React.FC = () => {
  const navigate = useNavigate();

  const [employees, setEmployees]       = useState<EmployeeStatus[]>([]);
  const [loadingEmp, setLoadingEmp]     = useState(true);
  const [searchEmp, setSearchEmp]       = useState('');
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedEmp, setSelectedEmp]   = useState<EmployeeStatus | null>(null);

  const loadEmployees = async () => {
    setLoadingEmp(true);
    const r = await authFetch(`${API_BASE_URL}/api/fiche-poste/employees-status`);
    const data = await r.json();
    if (Array.isArray(data)) {
      setEmployees(data);
      if (selectedEmp) {
        const updated = data.find((e: EmployeeStatus) => e.id === selectedEmp.id);
        if (updated) setSelectedEmp(updated);
      }
    }
    setLoadingEmp(false);
  };

  useEffect(() => { loadEmployees(); }, []);

  // ── Groupement par département ─────────────────────────────────────────────
  const allDepts: DeptInfo[] = Object.values(
    employees.reduce<Record<string, DeptInfo>>((acc, e) => {
      const key = e.departement?.trim() || 'Non défini';
      if (!acc[key]) acc[key] = { name: key, total: 0, withFiche: 0 };
      acc[key].total++;
      if (e.fichePosteId || e.fichePosteFile) acc[key].withFiche++;
      return acc;
    }, {})
  ).sort((a, b) => a.name.localeCompare(b.name));

  const deptEmployees = selectedDept
    ? employees.filter(e =>
        (e.departement?.trim() || 'Non défini') === selectedDept &&
        `${e.nom} ${e.prenom} ${e.poste}`.toLowerCase().includes(searchEmp.toLowerCase())
      )
    : [];

  const totalWithFiche = employees.filter(e => e.fichePosteId || e.fichePosteFile).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <RHNavTabs />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-500" /> Fiches de Poste
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {totalWithFiche}/{employees.length} employés couverts
          </p>
        </div>
        <button onClick={() => navigate('/dashboard/rh/fiches-poste/new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-500 text-white rounded-xl font-bold text-sm shadow hover:shadow-lg transition-all">
          <Plus className="h-4 w-4" /> Nouvelle fiche de poste
        </button>
      </div>

      {/* Layout 3 colonnes */}
      <div className="flex gap-4" style={{ minHeight: '72vh' }}>

        {/* ── Col 1 : Départements ── */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5" /> Départements
              </p>
            </div>
            {loadingEmp ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /></div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(72vh - 52px)' }}>
                {allDepts.map(dept => {
                  const pct = dept.total > 0 ? Math.round((dept.withFiche / dept.total) * 100) : 0;
                  const isSelected = selectedDept === dept.name;
                  const barColor = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';

                  return (
                    <button key={dept.name}
                      onClick={() => { setSelectedDept(dept.name); setSelectedEmp(null); setSearchEmp(''); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-slate-50 ${
                        isSelected
                          ? 'bg-indigo-50 border-l-4 border-l-indigo-500'
                          : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      }`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>
                          {dept.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{dept.withFiche}/{dept.total}</span>
                        </div>
                      </div>
                      <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Col 2 : Employés du département ── */}
        {!selectedDept ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
            <Building2 className="h-10 w-10 text-slate-200 mb-3" />
            <p className="text-slate-400 font-semibold text-sm">Sélectionnez un département</p>
          </div>
        ) : (
          <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all ${selectedEmp ? 'w-72 flex-shrink-0' : 'flex-1'}`}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-xs font-black text-slate-700 uppercase tracking-widest flex-1 truncate">{selectedDept}</p>
              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                {deptEmployees.length}
              </span>
            </div>
            {/* Recherche */}
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={searchEmp} onChange={e => setSearchEmp(e.target.value)}
                  placeholder="Rechercher…"
                  className="pl-8 pr-3 py-1.5 w-full text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300 bg-white" />
              </div>
            </div>
            {/* Liste employés */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {deptEmployees.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-300 text-sm">
                  Aucun employé trouvé.
                </div>
              ) : deptEmployees.map(emp => {
                const hasFiche   = Boolean(emp.fichePosteId);
                const hasFile    = Boolean(emp.fichePosteFile);
                const isSelected = selectedEmp?.id === emp.id;
                const statusIcon = emp.ficheStatus === 'valide'    ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                 : emp.ficheStatus === 'soumis_rh' ? <Clock className="h-4 w-4 text-amber-500" />
                                 : emp.ficheStatus === 'rejete'    ? <AlertCircle className="h-4 w-4 text-red-400" />
                                 : hasFiche                         ? <FileText className="h-4 w-4 text-indigo-400" />
                                 : hasFile                          ? <FileText className="h-4 w-4 text-blue-400" />
                                 : <XCircle className="h-4 w-4 text-slate-300" />;

                return (
                  <button key={emp.id} onClick={() => setSelectedEmp(isSelected ? null : emp)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 border-l-4 border-l-indigo-500'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      emp.ficheStatus === 'valide'    ? 'bg-emerald-100 text-emerald-700' :
                      emp.ficheStatus === 'soumis_rh' ? 'bg-amber-100 text-amber-700' :
                      emp.ficheStatus === 'rejete'    ? 'bg-red-100 text-red-700' :
                      hasFiche                         ? 'bg-indigo-100 text-indigo-700' :
                      hasFile                          ? 'bg-blue-100 text-blue-700' :
                                                         'bg-slate-100 text-slate-500'
                    }`}>
                      {emp.prenom?.[0]}{emp.nom?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{emp.prenom} {emp.nom}</p>
                      <p className="text-xs text-slate-400 truncate">{emp.poste || '—'}</p>
                    </div>
                    <div className="flex-shrink-0">{statusIcon}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Col 3 : Panneau fiche employé ── */}
        {selectedEmp && (
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col overflow-hidden" style={{ maxHeight: '75vh' }}>
            <EmployeeFichePanel
              employee={selectedEmp}
              onBack={() => setSelectedEmp(null)}
              onRefresh={loadEmployees}
            />
          </div>
        )}
      </div>
    </div>
  );
};
