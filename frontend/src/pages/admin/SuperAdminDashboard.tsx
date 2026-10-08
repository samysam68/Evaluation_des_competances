import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Users, ShieldCheck, Power, PowerOff, Key, Trash2,
  Search, RefreshCw, BarChart3, AlertTriangle, CheckCircle,
  UserCog, Loader2, Lock, X, Upload, Settings, User,
  FileSpreadsheet, Link2, Calendar, Eye, CheckCircle2,
  TrendingUp, Database, Globe, Save, ChevronRight, Bell,
  Clock, Mail, Server, ToggleLeft, ToggleRight,
  Wifi, WifiOff, Send, Pencil, Building2, Hash, Phone,
  ListChecks, ChevronDown, ChevronUp, RotateCcw, GripVertical, Plus,
  ShieldAlert, EyeOff, Eraser, History as HistoryIcon, Filter, Wallet, GitBranch
} from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../../components/common/Footer';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdminUser { id: number; matricule: string; nom: string; prenom: string; activeDirectory: string; poste: string; role: string; direction: string; departement: string; service?: string; pole?: string; email: string; actif: number; evalType: string; categorie: string; responsable1?: string; responsable2?: string; responsable3?: string; dateRecrutement?: string; rhAccess?: number; orgChartAccess?: number; }
type DetailForm = { nom: string; prenom: string; matricule: string; activeDirectory: string; email: string; poste: string; direction: string; departement: string; service: string; pole: string; categorie: string; evalType: string; role: string; responsable1: string; responsable2: string; responsable3: string; dateRecrutement: string; };
interface Stats { totalUsers: number; activeUsers: number; inactiveUsers: number; totalEvals: number; roleBreakdown: { role: string; n: number }[]; evalTypeBreakdown: { evalType: string; n: number }[]; directionBreakdown: { direction: string; n: number }[]; recentEvals: any[]; settings: Record<string, string>; }
interface ExcelPreview { summary: { total: number; toAdd: number; toUpdate: number; toDeactivate: number }; toAdd: any[]; toUpdate: any[]; toDeactivate: any[]; }
interface FieldChange { field: string; label: string; before: any; after: any; }
interface AddedUserDetail { matricule: string | null; name: string; poste: string | null; role: string; }
interface UpdatedUserDetail { id: number; matricule: string | null; name: string; changes: FieldChange[]; }
interface DeactivatedUserDetail { id: number; matricule: string | null; name: string; poste: string | null; }
interface FailedUserDetail { matricule: string | null; name: string; reason: string; }
interface SyncDiffResult { added: number; updated: number; deactivated: number; deactivatable: number; failed?: number; addedDetails: AddedUserDetail[]; updatedDetails: UpdatedUserDetail[]; deactivatedDetails: DeactivatedUserDetail[]; failedDetails?: FailedUserDetail[]; }

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES = ['Directeur','Manager','RH','Responsable','Superviseur','Gestionnaire','Employe'];
const ROLE_COLORS: Record<string, string> = {
  SuperAdmin: 'bg-rose-100 text-rose-700 border-rose-200',
  Directeur:  'bg-purple-100 text-purple-700 border-purple-200',
  Manager:    'bg-blue-100 text-blue-700 border-blue-200',
  RH:         'bg-teal-100 text-teal-700 border-teal-200',
  Responsable:'bg-indigo-100 text-indigo-700 border-indigo-200',
  Superviseur:'bg-cyan-100 text-cyan-700 border-cyan-200',
  Gestionnaire:'bg-amber-100 text-amber-700 border-amber-200',
  Employe:    'bg-slate-100 text-slate-500 border-slate-200',
};

const SYNC_FIELD_LABELS: Record<string, string> = {
  matricule: 'Matricule', nom: 'Nom', prenom: 'Prénom', direction: 'Direction',
  departement: 'Département', service: 'Service', poste: 'Poste', categorie: 'Catégorie',
  role: 'Rôle', evalType: "Type d'évaluation", actif: 'Actif', email: 'Email',
};

type TabId = 'overview' | 'users' | 'excel' | 'settings' | 'criteria' | 'system' | 'profile' | 'rgpd';
type ModalType = 'role' | 'password' | 'delete' | 'bulkPassword' | null;

// ─── Sub-components ───────────────────────────────────────────────────────────
const KPICard: React.FC<{ label: string; value: string | number; icon: React.ElementType; color: string; bg: string; border: string; sub?: string }> = ({ label, value, icon: Icon, color, bg, border, sub }) => (
  <div className={`bg-white rounded-2xl border ${border} p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}>
    <div className={`w-10 h-10 rounded-xl ${bg} border ${border} flex items-center justify-center mb-3`}>
      <Icon className={`h-5 w-5 ${color}`} />
    </div>
    <p className="text-2xl font-black text-slate-800">{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</p>
    <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

function formatSyncFieldValue(field: string, v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'actif') return (v === 1 || v === true || v === '1') ? 'Actif' : 'Inactif';
  return String(v);
}

// Détail "avant / après" d'une synchronisation (Excel en direct ou API RH) :
// affiche exactement ce qui a été ajouté, modifié (champ par champ) et désactivé.
const SyncChangesReport: React.FC<{ result: SyncDiffResult }> = ({ result }) => {
  const hasAny = result.addedDetails.length > 0 || result.updatedDetails.length > 0 || result.deactivatedDetails.length > 0 || (result.failedDetails?.length ?? 0) > 0;
  if (!hasAny) return <p className="text-slate-500 text-xs">Aucun changement détecté — la base est déjà à jour par rapport à la source.</p>;
  return (
    <div className="space-y-3">
      {result.updatedDetails.length > 0 && (
        <div className="bg-white/5 border border-blue-500/20 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-blue-400 font-bold text-xs">Modifiés ({result.updatedDetails.length})</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
            {result.updatedDetails.map(u => (
              <div key={u.id} className="px-4 py-2 text-xs">
                <p className="text-white font-semibold">{u.name} <span className="text-slate-500 font-mono font-normal">{u.matricule}</span></p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {u.changes.map((c, i) => (
                    <span key={i}>
                      <span className="text-slate-500">{c.label} : </span>
                      <span className="text-red-300 line-through decoration-red-500/50">{formatSyncFieldValue(c.field, c.before)}</span>
                      <span className="text-slate-500"> → </span>
                      <span className="text-emerald-300">{formatSyncFieldValue(c.field, c.after)}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.addedDetails.length > 0 && (
        <div className="bg-white/5 border border-emerald-500/20 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-bold text-xs">Ajoutés ({result.addedDetails.length})</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
            {result.addedDetails.map((u, i) => (
              <div key={i} className="px-4 py-1.5 text-xs flex items-center gap-3">
                <span className="text-white font-semibold flex-1">{u.name}</span>
                <span className="text-slate-500 font-mono">{u.matricule || '—'}</span>
                <span className="text-slate-400 truncate max-w-[160px]">{u.poste || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.deactivatedDetails.length > 0 && (
        <div className="bg-white/5 border border-red-500/20 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <PowerOff className="h-3.5 w-3.5 text-red-400" />
            <span className="text-red-400 font-bold text-xs">
              {result.deactivated > 0 ? `Désactivés (${result.deactivatedDetails.length})` : `Absents de la source, non désactivés (${result.deactivatedDetails.length})`}
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
            {result.deactivatedDetails.map(u => (
              <div key={u.id} className="px-4 py-1.5 text-xs flex items-center gap-3">
                <span className="text-white font-semibold flex-1">{u.name}</span>
                <span className="text-slate-500 font-mono">{u.matricule || '—'}</span>
                <span className="text-slate-400 truncate max-w-[160px]">{u.poste || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(result.failedDetails?.length ?? 0) > 0 && (
        <div className="bg-white/5 border border-amber-500/30 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-amber-400 font-bold text-xs">Échecs — non importés ({result.failedDetails!.length})</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
            {result.failedDetails!.map((u, i) => (
              <div key={i} className="px-4 py-1.5 text-xs flex items-center gap-3">
                <span className="text-white font-semibold flex-1">{u.name}</span>
                <span className="text-slate-500 font-mono">{u.matricule || '—'}</span>
                <span className="text-amber-300/80 truncate max-w-[220px]">{u.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const SuperAdminDashboard: React.FC = () => {
  const { logout, user, patchUser } = useAuthStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mustChangePassword = !!user?.mustChangePassword;
  const [tab, setTabRaw] = useState<TabId>('overview');
  // Tant que le mot de passe par défaut n'a pas été changé, le serveur bloque
  // tout le reste de l'API : on force donc l'onglet Profil (seul autorisé).
  const setTab = (t: TabId) => setTabRaw(mustChangePassword ? 'profile' : t);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [totalStats, setTotalStats] = useState({ total: 0, active: 0, inactive: 0 });
  const [allRoles, setAllRoles] = useState<{ role: string; n: number }[]>([]);

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterActif, setFilterActif] = useState('');
  const [filterDir, setFilterDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [rhAccessToggling, setRhAccessToggling] = useState<number | null>(null);
  const [orgChartAccessToggling, setOrgChartAccessToggling] = useState<number | null>(null);

  const [modal, setModal] = useState<ModalType>(null);
  const [modalUser, setModalUser] = useState<AdminUser | null>(null);
  const [modalValue, setModalValue] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMsg, setModalMsg] = useState('');

  // Detail slide-over state
  const emptyDetail: DetailForm = { nom: '', prenom: '', matricule: '', activeDirectory: '', email: '', poste: '', direction: '', departement: '', service: '', pole: '', categorie: '', evalType: '', role: '', responsable1: '', responsable2: '', responsable3: '', dateRecrutement: '' };
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [detailForm, setDetailForm] = useState<DetailForm>(emptyDetail);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailMsg, setDetailMsg] = useState('');

  // Excel state
  const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelMsg, setExcelMsg] = useState('');
  const [deactivateMissing, setDeactivateMissing] = useState(false);

  // Rafraîchissement en direct du fichier RH (Collaborateurs Actualisable)
  const [refreshingExcel, setRefreshingExcel] = useState(false);
  const [refreshExcelMsg, setRefreshExcelMsg] = useState('');
  const [liveDeactivateMissing, setLiveDeactivateMissing] = useState(false);
  const [liveSyncResult, setLiveSyncResult] = useState<SyncDiffResult | null>(null);

  // Settings state
  const [settings, setSettings] = useState({ openDate: '', closeDate: '', openDateMp: '', closeDateMp: '', appName: 'Talents', apiUrl: '', apiKey: '', lastExcelImport: '', lastApiSync: '' });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [syncingApi, setSyncingApi] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [apiDeactivateMissing, setApiDeactivateMissing] = useState(false);
  const [apiSyncResult, setApiSyncResult] = useState<SyncDiffResult | null>(null);

  // Modules activables/désactivables (V1.0 : Fiche de Poste désactivée par défaut)
  const [moduleFlags, setModuleFlags] = useState({ fichePoste: false, feedback: true, orgchart: false });
  const [moduleSaving, setModuleSaving] = useState<'fichePoste' | 'feedback' | 'orgchart' | null>(null);

  // System (email + LDAP) state
  const [smtpCfg, setSmtpCfg] = useState({ smtp_host: '', smtp_port: '587', smtp_user: '', smtp_password: '', smtp_from: '', smtp_tls: 'false', smtp_enabled: 'true' });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState('');
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [ldapCfg, setLdapCfg] = useState({ ldap_url: '', ldap_baseDn: '', ldap_bindDn: '', ldap_bindPassword: '', ldap_userFilter: '(sAMAccountName={{username}})', ldap_enabled: 'true' });
  const [ldapSaving, setLdapSaving] = useState(false);
  const [ldapMsg, setLdapMsg] = useState('');
  const [ldapTesting, setLdapTesting] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<any>(null);
  const [profileEmail, setProfileEmail] = useState('');
  const [profileCurrent, setProfileCurrent] = useState('');
  const [profileNew, setProfileNew] = useState('');
  const [profileConfirm, setProfileConfirm] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // RGPD state
  const [rgpdUsers, setRgpdUsers] = useState<any[]>([]);
  const [rgpdLoading, setRgpdLoading] = useState(false);
  const [rgpdFilter, setRgpdFilter] = useState<'all' | 'expired' | 'anonymized'>('all');
  const [rgpdRetention, setRgpdRetention] = useState(5);
  const [rgpdRetentionInput, setRgpdRetentionInput] = useState('5');
  const [rgpdPolicySaving, setRgpdPolicySaving] = useState(false);
  const [rgpdMsg, setRgpdMsg] = useState('');
  const [rgpdAuditLog, setRgpdAuditLog] = useState<any[]>([]);
  const [rgpdAuditLoading, setRgpdAuditLoading] = useState(false);
  const [rgpdShowAudit, setRgpdShowAudit] = useState(false);
  const [rgpdActionLoading, setRgpdActionLoading] = useState<number | null>(null);
  const [rgpdConfirm, setRgpdConfirm] = useState<{ userId: number; action: 'anonymize' | 'delete'; name: string } | null>(null);

  const loadRgpdData = useCallback(async (filter: typeof rgpdFilter = 'all') => {
    setRgpdLoading(true);
    try {
      const [policyRes, usersRes] = await Promise.all([
        authFetch(`${API_BASE_URL}/api/admin/rgpd/policy`),
        authFetch(`${API_BASE_URL}/api/admin/rgpd/users?filter=${filter}`),
      ]);
      if (policyRes.ok) {
        const p = await policyRes.json();
        setRgpdRetention(p.retentionYears);
        setRgpdRetentionInput(String(p.retentionYears));
      }
      if (usersRes.ok) {
        const u = await usersRes.json();
        setRgpdUsers(u.users || []);
      }
    } catch { /* ignore */ }
    setRgpdLoading(false);
  }, []);

  const handleRgpdSavePolicy = async () => {
    setRgpdPolicySaving(true); setRgpdMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/rgpd/policy`, {
      method: 'POST', body: JSON.stringify({ retentionYears: Number(rgpdRetentionInput) }),
    });
    const data = await res.json();
    if (res.ok) { setRgpdRetention(data.retentionYears); setRgpdMsg('✓ Politique enregistrée.'); loadRgpdData(rgpdFilter); }
    else setRgpdMsg(data.message || 'Erreur.');
    setRgpdPolicySaving(false);
  };

  const handleRgpdAction = async (userId: number, action: 'anonymize' | 'delete') => {
    setRgpdActionLoading(userId); setRgpdMsg(''); setRgpdConfirm(null);
    const url = action === 'anonymize'
      ? `${API_BASE_URL}/api/admin/rgpd/anonymize/${userId}`
      : `${API_BASE_URL}/api/admin/rgpd/delete/${userId}`;
    const res = await authFetch(url, { method: action === 'anonymize' ? 'POST' : 'DELETE' });
    const data = await res.json();
    if (res.ok) { setRgpdMsg('✓ ' + data.message); loadRgpdData(rgpdFilter); }
    else setRgpdMsg('✗ ' + (data.message || 'Erreur.'));
    setRgpdActionLoading(null);
  };

  const loadRgpdAudit = async () => {
    setRgpdAuditLoading(true);
    const res = await authFetch(`${API_BASE_URL}/api/admin/rgpd/audit-log`);
    if (res.ok) setRgpdAuditLog(await res.json());
    setRgpdAuditLoading(false);
  };

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/stats`);
    if (res.ok) {
      const data = await res.json();
      setStats(data);
      if (data.settings) {
        setSettings(prev => ({ ...prev, ...data.settings }));
      }
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterRole) params.set('role', filterRole);
    if (filterActif !== '') params.set('actif', filterActif);
    if (filterDir) params.set('direction', filterDir);
    const res = await authFetch(`${API_BASE_URL}/api/admin/users?${params}`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users); setDirections(data.directions);
      setTotalStats(data.stats); setAllRoles(data.roles);
    }
    setLoading(false);
  }, [search, filterRole, filterActif, filterDir]);

  const loadProfile = useCallback(async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/profile`);
    if (res.ok) {
      const data = await res.json();
      setProfile(data);
      setProfileEmail(data.email || '');
    }
  }, []);

  const loadSystemConfig = useCallback(async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/system/config`);
    if (res.ok) {
      const data = await res.json();
      setSmtpCfg(prev => ({ ...prev, ...Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith('smtp_'))) }));
      setLdapCfg(prev => ({ ...prev, ...Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith('ldap_'))) }));
    }
  }, []);

  const loadModules = useCallback(async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/modules`);
    if (res.ok) setModuleFlags(await res.json());
  }, []);

  const toggleModule = async (module: 'fichePoste' | 'feedback' | 'orgchart') => {
    const enabled = !moduleFlags[module];
    setModuleSaving(module);
    setModuleFlags(prev => ({ ...prev, [module]: enabled }));
    try {
      const res = await authFetch(`${API_BASE_URL}/api/admin/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module, enabled }),
      });
      if (!res.ok) {
        setModuleFlags(prev => ({ ...prev, [module]: !enabled }));
      } else if (user?.modules && module !== 'orgchart') {
        // Reflète immédiatement le changement dans le menu du SuperAdmin (sinon figé depuis le login)
        patchUser({ modules: { ...user.modules, [module]: enabled } });
      }
    } catch {
      setModuleFlags(prev => ({ ...prev, [module]: !enabled }));
    } finally {
      setModuleSaving(null);
    }
  };

  useEffect(() => { loadStats(); loadProfile(); loadModules(); }, [loadStats, loadProfile, loadModules]);
  useEffect(() => { if (mustChangePassword) setTabRaw('profile'); }, [mustChangePassword]);
  useEffect(() => { if (tab === 'users') loadUsers(); }, [tab, loadUsers]);
  useEffect(() => { if (tab === 'system') loadSystemConfig(); }, [tab, loadSystemConfig]);

  // ── User actions ───────────────────────────────────────────────────────────
  const handleToggle = async (u: AdminUser) => {
    setToggling(u.id);
    const res = await authFetch(`${API_BASE_URL}/api/admin/users/${u.id}/toggle`, { method: 'PATCH' });
    if (res.ok) {
      const data = await res.json();
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, actif: data.actif } : x));
    }
    setToggling(null);
  };

  const handleToggleRhAccess = async (u: AdminUser & { rhAccess?: number }) => {
    const nextValue = !(u.rhAccess === 1);
    setRhAccessToggling(u.id);
    const res = await authFetch(`${API_BASE_URL}/api/admin/users/${u.id}/rh-access`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rhAccess: nextValue }),
    });
    if (res.ok) {
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, rhAccess: nextValue ? 1 : 0 } as any : x));
    }
    setRhAccessToggling(null);
  };

  const handleToggleOrgChartAccess = async (u: AdminUser) => {
    const nextValue = !(u.orgChartAccess === 1);
    setOrgChartAccessToggling(u.id);
    const res = await authFetch(`${API_BASE_URL}/api/admin/users/${u.id}/orgchart-access`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgChartAccess: nextValue }),
    });
    if (res.ok) {
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, orgChartAccess: nextValue ? 1 : 0 } : x));
    }
    setOrgChartAccessToggling(null);
  };

  const openModal = (type: ModalType, u?: AdminUser) => {
    setModal(type); setModalUser(u || null);
    setModalValue(type === 'role' ? (u?.role || '') : ''); setModalMsg('');
  };

  const handleModalConfirm = async () => {
    setModalLoading(true); setModalMsg('');
    try {
      let res: Response;
      if (modal === 'role' && modalUser) res = await authFetch(`${API_BASE_URL}/api/admin/users/${modalUser.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: modalValue }) });
      else if (modal === 'password' && modalUser) res = await authFetch(`${API_BASE_URL}/api/admin/users/${modalUser.id}/password`, { method: 'PATCH', body: JSON.stringify({ password: modalValue }) });
      else if (modal === 'delete' && modalUser) res = await authFetch(`${API_BASE_URL}/api/admin/users/${modalUser.id}`, { method: 'DELETE' });
      else if (modal === 'bulkPassword') res = await authFetch(`${API_BASE_URL}/api/admin/users/password-bulk`, { method: 'POST', body: JSON.stringify({ password: modalValue }) });
      else return;
      const data = await res!.json();
      if (res!.ok) {
        setModalMsg('✓ ' + data.message);
        if (modal === 'role') setUsers(prev => prev.map(u => u.id === modalUser!.id ? { ...u, role: modalValue } : u));
        if (modal === 'delete') setUsers(prev => prev.filter(u => u.id !== modalUser!.id));
        setTimeout(() => { setModal(null); setModalMsg(''); }, 1200);
      } else setModalMsg('✗ ' + (data.message || 'Erreur'));
    } catch { setModalMsg('✗ Erreur réseau'); }
    setModalLoading(false);
  };

  // ── Excel actions ──────────────────────────────────────────────────────────
  const handleExcelPreview = async (file: File) => {
    setExcelFile(file); setExcelLoading(true); setExcelPreview(null); setExcelMsg('');
    const form = new FormData();
    form.append('file', file);
    try {
      const token = useAuthStore.getState().token || '';
      const res = await fetch(`${API_BASE_URL}/api/admin/excel/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) setExcelPreview(await res.json());
      else setExcelMsg('Erreur lors de l\'analyse du fichier.');
    } catch { setExcelMsg('Erreur réseau.'); }
    setExcelLoading(false);
  };

  const handleExcelApply = async () => {
    if (!excelFile) return;
    setExcelLoading(true); setExcelMsg('');
    const form = new FormData();
    form.append('file', excelFile);
    form.append('deactivateMissing', String(deactivateMissing));
    try {
      const token = useAuthStore.getState().token || '';
      const res = await fetch(`${API_BASE_URL}/api/admin/excel/apply`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      const data = await res.json();
      if (res.ok) { setExcelMsg('✓ ' + data.message); setExcelPreview(null); setExcelFile(null); loadStats(); }
      else setExcelMsg('✗ ' + (data.message || 'Erreur'));
    } catch { setExcelMsg('✗ Erreur réseau.'); }
    setExcelLoading(false);
  };

  const handleApiSync = async () => {
    setSyncingApi(true); setSyncMsg(''); setApiSyncResult(null);
    const res = await authFetch(`${API_BASE_URL}/api/admin/excel/sync-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deactivateMissing: apiDeactivateMissing }),
    });
    const data = await res.json();
    setSyncMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    if (res.ok) {
      setSettings(s => ({ ...s, lastApiSync: new Date().toISOString() }));
      setApiSyncResult(data);
      loadStats();
    }
    setSyncingApi(false);
  };

  const handleRefreshExcelLive = async () => {
    setRefreshingExcel(true); setRefreshExcelMsg(''); setLiveSyncResult(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/admin/excel/refresh-live`, {
        method: 'POST',
        body: JSON.stringify({ deactivateMissing: liveDeactivateMissing }),
      });
      const data = await res.json();
      setRefreshExcelMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
      if (res.ok) { setLiveSyncResult(data); loadStats(); }
    } catch {
      setRefreshExcelMsg('✗ Erreur réseau — vérifiez que le serveur est bien démarré.');
    }
    setRefreshingExcel(false);
  };

  // ── Settings save ──────────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    const res = await authFetch(`${API_BASE_URL}/api/admin/settings`, { method: 'POST', body: JSON.stringify(settings) });
    if (res.ok) { setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2000); }
  };

  const [reminderTesting, setReminderTesting] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');
  const handleTestReminders = async () => {
    setReminderTesting(true); setReminderMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/reminders/test`, { method: 'POST' });
    const data = await res.json();
    setReminderMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    setReminderTesting(false);
  };

  // ── Profile save ───────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (profileNew && profileNew !== profileConfirm) { setProfileMsg('✗ Les mots de passe ne correspondent pas.'); return; }
    setProfileLoading(true); setProfileMsg('');
    const body: any = {};
    if (profileEmail) body.email = profileEmail;
    if (profileNew) { body.currentPassword = profileCurrent; body.newPassword = profileNew; }
    const res = await authFetch(`${API_BASE_URL}/api/admin/profile`, { method: 'PATCH', body: JSON.stringify(body) });
    const data = await res.json();
    setProfileMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    if (res.ok) {
      setProfileCurrent(''); setProfileNew(''); setProfileConfirm('');
      if (body.newPassword) { patchUser({ mustChangePassword: false }); loadStats(); }
    }
    setProfileLoading(false);
  };

  // ── Detail panel handlers ──────────────────────────────────────────────────
  const openDetail = async (u: AdminUser) => {
    setDetailUser(u); setDetailMsg(''); setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/admin/users/${u.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailForm({
          nom: data.nom || '', prenom: data.prenom || '',
          matricule: data.matricule || '', activeDirectory: data.activeDirectory || '',
          email: data.email || '', poste: data.poste || '',
          direction: data.direction || '', departement: data.departement || '',
          service: data.service || '', pole: data.pole || '',
          categorie: data.categorie || '', evalType: data.evalType || '',
          role: data.role || '', responsable1: data.responsable1 || '',
          responsable2: data.responsable2 || '', responsable3: data.responsable3 || '',
          dateRecrutement: data.dateRecrutement ? data.dateRecrutement.slice(0, 10) : '',
        });
      }
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  const handleSaveDetail = async () => {
    if (!detailUser) return;
    setDetailSaving(true); setDetailMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/users/${detailUser.id}/details`, {
      method: 'PATCH', body: JSON.stringify(detailForm),
    });
    const data = await res.json();
    if (res.ok) {
      setDetailMsg('✓ ' + data.message);
      setUsers(prev => prev.map(u => u.id === detailUser.id ? { ...u, ...data.user } : u));
      setTimeout(() => setDetailMsg(''), 2500);
    } else {
      setDetailMsg('✗ ' + (data.message || 'Erreur'));
    }
    setDetailSaving(false);
  };

  // ── System handlers ────────────────────────────────────────────────────────
  const handleSaveSmtp = async () => {
    setSmtpSaving(true); setSmtpMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/system/email`, { method: 'POST', body: JSON.stringify(smtpCfg) });
    const data = await res.json();
    setSmtpMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    setSmtpSaving(false);
  };

  const handleTestSmtp = async () => {
    setSmtpTesting(true); setSmtpMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/system/email/test`, { method: 'POST', body: JSON.stringify({ ...smtpCfg, testTo: smtpTestEmail || smtpCfg.smtp_from }) });
    const data = await res.json();
    setSmtpMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    setSmtpTesting(false);
  };

  const handleSaveLdap = async () => {
    setLdapSaving(true); setLdapMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/system/ldap`, { method: 'POST', body: JSON.stringify(ldapCfg) });
    const data = await res.json();
    setLdapMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    setLdapSaving(false);
  };

  const handleTestLdap = async () => {
    setLdapTesting(true); setLdapMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/system/ldap/test`, { method: 'POST', body: JSON.stringify(ldapCfg) });
    const data = await res.json();
    setLdapMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    setLdapTesting(false);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  // ── Criteria state ─────────────────────────────────────────────────────────
  type CriteriaItem = { id: string; label: string; description?: string };
  type CriteriaCategory = { title: string; items: CriteriaItem[] };
  type CriteriaSet = { type: string; categories: CriteriaCategory[] };

  const [criteriaTab, setCriteriaTab] = useState<'executions' | 'cadres'>('executions');
  const [criteriaData, setCriteriaData] = useState<Record<string, CriteriaSet>>({});
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const [criteriaMsg, setCriteriaMsg] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const loadCriteria = async (type: 'executions' | 'cadres') => {
    if (criteriaData[type]) return;
    setCriteriaLoading(true);
    const res = await authFetch(`${API_BASE_URL}/api/admin/criteria/${type}`);
    if (res.ok) {
      const data = await res.json();
      if (data) setCriteriaData(prev => ({ ...prev, [type]: data }));
    }
    setCriteriaLoading(false);
  };

  useEffect(() => { if (tab === 'criteria') loadCriteria(criteriaTab); }, [tab, criteriaTab]);

  const handleSaveCriteria = async () => {
    const current = criteriaData[criteriaTab];
    if (!current) return;
    setCriteriaSaving(true); setCriteriaMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/criteria/${criteriaTab}`, { method: 'POST', body: JSON.stringify(current) });
    const data = await res.json();
    setCriteriaMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    setCriteriaSaving(false);
    setTimeout(() => setCriteriaMsg(''), 3000);
  };

  const handleResetCriteria = async () => {
    if (!confirm('Réinitialiser les critères par défaut ? Les modifications seront perdues.')) return;
    setCriteriaSaving(true); setCriteriaMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/criteria/${criteriaTab}/reset`, { method: 'DELETE' });
    if (res.ok) {
      setCriteriaData(prev => { const n = { ...prev }; delete n[criteriaTab]; return n; });
      await loadCriteria(criteriaTab);
      setCriteriaMsg('✓ Critères réinitialisés.');
    }
    setCriteriaSaving(false);
    setTimeout(() => setCriteriaMsg(''), 3000);
  };

  const updateCriteriaItem = (catIdx: number, itemIdx: number, field: keyof CriteriaItem, value: string) => {
    setCriteriaData(prev => {
      const set = prev[criteriaTab];
      if (!set) return prev;
      const cats = set.categories.map((cat, ci) => ci !== catIdx ? cat : {
        ...cat,
        items: cat.items.map((item, ii) => ii !== itemIdx ? item : { ...item, [field]: value }),
      });
      return { ...prev, [criteriaTab]: { ...set, categories: cats } };
    });
  };

  const addCriteriaItem = (catIdx: number) => {
    setCriteriaData(prev => {
      const set = prev[criteriaTab];
      if (!set) return prev;
      const newId = `item_${Date.now()}`;
      const cats = set.categories.map((cat, ci) => ci !== catIdx ? cat : {
        ...cat,
        items: [...cat.items, { id: newId, label: '' }],
      });
      return { ...prev, [criteriaTab]: { ...set, categories: cats } };
    });
  };

  const removeCriteriaItem = (catIdx: number, itemIdx: number) => {
    setCriteriaData(prev => {
      const set = prev[criteriaTab];
      if (!set) return prev;
      const cats = set.categories.map((cat, ci) => ci !== catIdx ? cat : {
        ...cat,
        items: cat.items.filter((_, ii) => ii !== itemIdx),
      });
      return { ...prev, [criteriaTab]: { ...set, categories: cats } };
    });
  };

  const updateCategoryTitle = (catIdx: number, title: string) => {
    setCriteriaData(prev => {
      const set = prev[criteriaTab];
      if (!set) return prev;
      const cats = set.categories.map((cat, ci) => ci !== catIdx ? cat : { ...cat, title });
      return { ...prev, [criteriaTab]: { ...set, categories: cats } };
    });
  };

  const addCategory = () => {
    setCriteriaData(prev => {
      const set = prev[criteriaTab];
      if (!set) return prev;
      return { ...prev, [criteriaTab]: { ...set, categories: [...set.categories, { title: 'Nouvelle catégorie', items: [] }] } };
    });
  };

  const removeCategory = (catIdx: number) => {
    setCriteriaData(prev => {
      const set = prev[criteriaTab];
      if (!set) return prev;
      return { ...prev, [criteriaTab]: { ...set, categories: set.categories.filter((_, ci) => ci !== catIdx) } };
    });
  };

  // ── Tarif journalier formation (budget = tarif × nb. jours prévisionnels) ───
  // Formule officielle RH (06/09/2026), tarif unique pour toutes les catégories.
  const [dailyRate, setDailyRate] = useState<string>('');
  const [dailyRateLoaded, setDailyRateLoaded] = useState(false);
  const [budgetsSaving, setBudgetsSaving] = useState(false);
  const [budgetsMsg, setBudgetsMsg] = useState('');

  const loadDailyRate = async () => {
    if (dailyRateLoaded) return;
    const res = await authFetch(`${API_BASE_URL}/api/admin/training-daily-rate`);
    if (res.ok) {
      const data = await res.json();
      setDailyRate(String(data.rate));
      setDailyRateLoaded(true);
    }
  };

  useEffect(() => { if (tab === 'criteria') loadDailyRate(); }, [tab]);

  const handleSaveDailyRate = async () => {
    const rate = parseFloat(dailyRate);
    if (!rate || rate <= 0) { setBudgetsMsg('✗ Le tarif doit être un nombre positif.'); setTimeout(() => setBudgetsMsg(''), 3000); return; }
    setBudgetsSaving(true); setBudgetsMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/training-daily-rate`, {
      method: 'POST',
      body: JSON.stringify({ rate }),
    });
    const data = await res.json();
    setBudgetsMsg(res.ok ? '✓ ' + data.message : '✗ ' + (data.message || 'Erreur'));
    setBudgetsSaving(false);
    setTimeout(() => setBudgetsMsg(''), 3000);
  };

  const handleResetDailyRate = async () => {
    if (!confirm('Réinitialiser le tarif journalier par défaut ? La modification sera perdue.')) return;
    setBudgetsSaving(true); setBudgetsMsg('');
    const res = await authFetch(`${API_BASE_URL}/api/admin/training-daily-rate/reset`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      setDailyRate(String(data.rate));
      setBudgetsMsg('✓ Tarif réinitialisé.');
    }
    setBudgetsSaving(false);
    setTimeout(() => setBudgetsMsg(''), 3000);
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview',  label: 'Vue d\'ensemble',    icon: BarChart3 },
    { id: 'users',     label: 'Comptes',             icon: Users },
    { id: 'excel',     label: 'Import & Sync',       icon: FileSpreadsheet },
    { id: 'settings',  label: 'Paramètres',          icon: Settings },
    { id: 'criteria',  label: 'Critères',            icon: ListChecks },
    { id: 'system',    label: 'Système',              icon: Server },
    { id: 'rgpd',      label: 'RGPD',                 icon: ShieldAlert },
    { id: 'profile',   label: 'Mon Profil',          icon: User },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950">

      {/* ── Sidebar ── */}
      <div className="fixed left-0 top-0 bottom-0 w-64 bg-slate-900/80 backdrop-blur-xl border-r border-white/5 flex flex-col z-40">
        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <div className="bg-white rounded-xl px-3 py-2 inline-flex items-center shadow-lg">
            <img src="/logo-talents.png" alt="Talents LDM" className="h-8 object-contain" />
          </div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-2 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-rose-400" /> Super Admin
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}>
              <t.icon className="h-4 w-4 flex-shrink-0" />
              {t.label}
              {tab === t.id && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
            </button>
          ))}
        </nav>

        {/* User card */}
        <div className="p-4 border-t border-white/5">
          <div className="bg-white/5 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {profile?.prenom?.charAt(0) || 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-bold truncate">{profile?.prenom} {profile?.nom}</p>
                <p className="text-slate-400 text-[10px] truncate">{profile?.email || profile?.activeDirectory}</p>
              </div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 text-sm font-semibold transition-all">
            <Lock className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="ml-64 min-h-screen">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-slate-900/60 backdrop-blur-xl border-b border-white/5 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-black text-xl tracking-tight">
              {tabs.find(t => t.id === tab)?.label}
            </h2>
            <p className="text-slate-400 text-xs font-medium mt-0.5">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={() => { loadStats(); if (tab === 'users') loadUsers(); }}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="p-8 space-y-6">

          {/* ════════ OVERVIEW ════════ */}
          {tab === 'overview' && stats && (
            <div className="space-y-6">
              {/* Campaign status banners */}
              {(settings.openDate || settings.closeDate || settings.openDateMp || settings.closeDateMp) && (() => {
                const now = new Date();
                const isActive = (open: string, close: string) => {
                  if (!open && !close) return false;
                  const afterOpen = !open || now >= new Date(open);
                  const beforeClose = !close || now <= new Date(new Date(close).setHours(23, 59, 59, 999));
                  return afterOpen && beforeClose;
                };
                const annualActive = isActive(settings.openDate, settings.closeDate);
                const mpActive = isActive(settings.openDateMp, settings.closeDateMp);
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(settings.openDate || settings.closeDate) && (
                      <div className={`rounded-2xl p-4 border flex items-center gap-4 ${annualActive ? 'bg-gradient-to-r from-rose-500/20 to-orange-500/20 border-rose-500/30' : 'bg-white/5 border-white/10'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${annualActive ? 'bg-rose-500/30' : 'bg-white/10'}`}>
                          <Calendar className={`h-5 w-5 ${annualActive ? 'text-rose-300' : 'text-slate-500'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-[10px] font-black uppercase tracking-widest ${annualActive ? 'text-rose-400' : 'text-slate-500'}`}>Campagne Annuelle</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${annualActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'}`}>{annualActive ? 'En cours' : 'Inactive'}</span>
                          </div>
                          <p className="text-slate-300 text-xs">
                            {settings.openDate && <span>{new Date(settings.openDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                            {settings.openDate && settings.closeDate && <span className="text-slate-500 mx-1">→</span>}
                            {settings.closeDate && <span>{new Date(settings.closeDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                          </p>
                        </div>
                      </div>
                    )}
                    {(settings.openDateMp || settings.closeDateMp) && (
                      <div className={`rounded-2xl p-4 border flex items-center gap-4 ${mpActive ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border-indigo-500/30' : 'bg-white/5 border-white/10'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${mpActive ? 'bg-indigo-500/30' : 'bg-white/10'}`}>
                          <Calendar className={`h-5 w-5 ${mpActive ? 'text-indigo-300' : 'text-slate-500'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-[10px] font-black uppercase tracking-widest ${mpActive ? 'text-indigo-400' : 'text-slate-500'}`}>Campagne Mi-parcours</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${mpActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'}`}>{mpActive ? 'En cours' : 'Inactive'}</span>
                          </div>
                          <p className="text-slate-300 text-xs">
                            {settings.openDateMp && <span>{new Date(settings.openDateMp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                            {settings.openDateMp && settings.closeDateMp && <span className="text-slate-500 mx-1">→</span>}
                            {settings.closeDateMp && <span>{new Date(settings.closeDateMp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Exercice de transition 2026 : fixation des objectifs uniquement, pas
                  d'évaluation des résultats cette année (même règle que dans les fiches). */}
              {new Date().getFullYear() === 2026 && (
                <div className="rounded-2xl p-4 border bg-blue-500/10 border-blue-500/30 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-500/20">
                    <Calendar className="h-5 w-5 text-blue-300" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Exercice 2026 — Transition</p>
                    <p className="text-slate-300 text-xs">
                      Les fiches d'évaluation 2026 n'intègrent que la fixation des objectifs/cibles pour l'année suivante — l'évaluation des résultats est désactivée pour cette campagne. Les objectifs fixés sont consultables dans le profil de chaque employé.
                    </p>
                  </div>
                </div>
              )}

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Total comptes" value={stats.totalUsers} icon={Users} color="text-blue-400" bg="bg-blue-500/10" border="border-blue-500/20" />
                <KPICard label="Comptes actifs" value={stats.activeUsers} icon={CheckCircle} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20" />
                <KPICard label="Désactivés" value={stats.inactiveUsers} icon={PowerOff} color="text-red-400" bg="bg-red-500/10" border="border-red-500/20" />
                <KPICard label="Évaluations" value={stats.totalEvals} icon={BarChart3} color="text-purple-400" bg="bg-purple-500/10" border="border-purple-500/20" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Roles */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-slate-400" /> Répartition des rôles
                  </h3>
                  <div className="space-y-2.5">
                    {stats.roleBreakdown.map(r => (
                      <div key={r.role} className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border w-24 text-center flex-shrink-0 ${ROLE_COLORS[r.role] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{r.role}</span>
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${(r.n / stats.totalUsers) * 100}%` }} />
                        </div>
                        <span className="text-slate-300 text-xs font-bold w-8 text-right">{r.n}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Eval types */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-slate-400" /> Types d'évaluation
                  </h3>
                  <div className="space-y-4">
                    {stats.evalTypeBreakdown.map(e => (
                      <div key={e.evalType} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-300 font-semibold">{e.evalType}</span>
                          <span className="text-white font-black">{e.n}</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                            style={{ width: `${(e.n / stats.activeUsers) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Directions */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                  <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                    <Database className="h-4 w-4 text-slate-400" /> Top directions
                  </h3>
                  <div className="space-y-2">
                    {stats.directionBreakdown.map((d, i) => (
                      <div key={d.direction} className="flex items-center gap-2">
                        <span className="text-slate-500 text-[10px] font-bold w-4">{i + 1}</span>
                        <span className="text-slate-300 text-xs font-medium truncate flex-1">{d.direction}</span>
                        <span className="text-white text-xs font-black">{d.n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent evals */}
              {stats.recentEvals.length > 0 && (
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-white/5 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <h3 className="text-white font-bold text-sm">Dernières évaluations</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-white/5">
                        {['Évalué','Poste','Type','Note','Évaluateur','Date','Statut'].map(h => (
                          <th key={h} className="py-3 px-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {stats.recentEvals.map(e => (
                          <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-2.5 px-4 font-semibold text-white">{e.prenom} {e.nom}</td>
                            <td className="py-2.5 px-4 text-slate-400 text-xs max-w-[140px] truncate">{e.poste}</td>
                            <td className="py-2.5 px-4 text-slate-400 text-xs">{e.type}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-200">{Number(e.globalScore).toFixed(1)}/20</td>
                            <td className="py-2.5 px-4 text-slate-400">{e.evalPrenom} {e.evalNom}</td>
                            <td className="py-2.5 px-4 text-slate-500 text-xs">{new Date(e.createdAt).toLocaleDateString('fr-FR')}</td>
                            <td className="py-2.5 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${e.status === 'Validée' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>{e.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════ USERS ════════ */}
          {tab === 'users' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Nom, prénom, matricule, AD…" onKeyDown={e => e.key === 'Enter' && loadUsers()}
                    className="pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 w-full outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500/40" />
                </div>
                <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
                  className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-300 outline-none focus:ring-2 focus:ring-rose-500/40">
                  <option value="">Tous les rôles</option>
                  {allRoles.map(r => <option key={r.role} value={r.role}>{r.role} ({r.n})</option>)}
                </select>
                <select value={filterActif} onChange={e => setFilterActif(e.target.value)}
                  className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-300 outline-none focus:ring-2 focus:ring-rose-500/40">
                  <option value="">Tous statuts</option>
                  <option value="1">Actifs</option>
                  <option value="0">Désactivés</option>
                </select>
                <select value={filterDir} onChange={e => setFilterDir(e.target.value)}
                  className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-300 outline-none focus:ring-2 focus:ring-rose-500/40 max-w-[180px]">
                  <option value="">Toutes les directions</option>
                  {directions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <button onClick={loadUsers} className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold transition-colors">
                  <Search className="h-4 w-4" />
                </button>
                <button onClick={() => openModal('bulkPassword')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 rounded-xl text-sm font-bold transition-colors">
                  <Key className="h-4 w-4" /> MDP global
                </button>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-6 text-sm">
                <span className="text-slate-400">{totalStats.total.toLocaleString('fr-FR')} comptes</span>
                <span className="text-emerald-400 font-semibold">{totalStats.active.toLocaleString('fr-FR')} actifs</span>
                <span className="text-red-400 font-semibold">{totalStats.inactive.toLocaleString('fr-FR')} désactivés</span>
                <span className="text-slate-600 ml-auto text-xs">max 200 résultats</span>
              </div>

              {/* Table */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-rose-400" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-white/10">
                        {['Matricule','Nom & Prénom','Login AD','Poste','Rôle','Statut','Actions'].map(h => (
                          <th key={h} className="py-3 px-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${u.actif === 0 ? 'opacity-40' : ''}`}>
                            <td className="py-2.5 px-4 text-slate-500 text-xs font-mono">{u.matricule || '—'}</td>
                            <td className="py-2.5 px-4 font-semibold text-white whitespace-nowrap">{u.prenom} {u.nom}</td>
                            <td className="py-2.5 px-4 text-slate-400 font-mono text-xs">{u.activeDirectory}</td>
                            <td className="py-2.5 px-4 text-slate-400 text-xs max-w-[150px] truncate">{u.poste || '—'}</td>
                            <td className="py-2.5 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_COLORS[u.role] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{u.role}</span>
                            </td>
                            <td className="py-2.5 px-4">
                              {u.actif === 1
                                ? <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Actif</span>
                                : <span className="flex items-center gap-1 text-red-400 text-[10px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Désactivé</span>}
                            </td>
                            <td className="py-2.5 px-4">
                              {u.role !== 'SuperAdmin' && (
                                <div className="flex items-center gap-1">
                                  <button title="Voir / Modifier les détails" onClick={() => openDetail(u)}
                                    className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                                  <button title={u.actif === 1 ? 'Désactiver' : 'Activer'} onClick={() => handleToggle(u)} disabled={toggling === u.id}
                                    className={`p-1.5 rounded-lg transition-colors ${u.actif === 1 ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'}`}>
                                    {toggling === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.actif === 1 ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    title={u.role === 'RH' ? 'Accès RH inclus par le rôle' : (u.rhAccess === 1 ? "Retirer l'accès à l'espace RH" : "Accorder l'accès à l'espace RH")}
                                    onClick={() => handleToggleRhAccess(u)}
                                    disabled={rhAccessToggling === u.id || u.role === 'RH'}
                                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${u.rhAccess === 1 || u.role === 'RH' ? 'bg-teal-500/10 hover:bg-teal-500/20 text-teal-400' : 'bg-slate-500/10 hover:bg-slate-500/20 text-slate-400'}`}>
                                    {rhAccessToggling === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    title={u.orgChartAccess === 1 ? "Retirer l'accès à l'organigramme" : "Accorder l'accès à l'organigramme"}
                                    onClick={() => handleToggleOrgChartAccess(u)}
                                    disabled={orgChartAccessToggling === u.id}
                                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${u.orgChartAccess === 1 ? 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-400' : 'bg-slate-500/10 hover:bg-slate-500/20 text-slate-400'}`}>
                                    {orgChartAccessToggling === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                                  </button>
                                  <button title="Changer le rôle" onClick={() => openModal('role', u)} className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"><UserCog className="h-3.5 w-3.5" /></button>
                                  <button title="Réinitialiser MDP" onClick={() => openModal('password', u)} className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors"><Key className="h-3.5 w-3.5" /></button>
                                  <button title="Supprimer" onClick={() => openModal('delete', u)} className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {users.length === 0 && <div className="text-center py-12 text-slate-500 text-sm">Aucun utilisateur trouvé.</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ EXCEL ════════ */}
          {tab === 'excel' && (
            <div className="space-y-6">
              {/* Fichier RH — rafraîchissement en direct */}
              <div className="bg-white/5 backdrop-blur-sm border border-violet-500/20 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                    <Database className="h-5 w-5 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">Fichier RH — Collaborateurs Actualisable</h3>
                    <p className="text-slate-400 text-xs">Rafraîchit le fichier depuis votre système RH (comme Données → Actualiser dans Excel), puis synchronise aussitôt la base.</p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={liveDeactivateMissing} onChange={e => setLiveDeactivateMissing(e.target.checked)} className="w-4 h-4 accent-violet-500" />
                  <span className="text-slate-300 text-sm">Désactiver les comptes absents du fichier après actualisation</span>
                </label>

                <button onClick={handleRefreshExcelLive} disabled={refreshingExcel}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 rounded-xl text-sm font-bold transition-all disabled:opacity-40">
                  {refreshingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {refreshingExcel ? 'Actualisation en cours (jusqu\'à 1 min)…' : 'Actualiser'}
                </button>
                {refreshExcelMsg && <p className={`text-sm font-semibold ${refreshExcelMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{refreshExcelMsg}</p>}
                {liveSyncResult && <SyncChangesReport result={liveSyncResult} />}
                {settings.lastExcelImport && (
                  <p className="text-slate-500 text-xs flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Dernière synchronisation : {new Date(settings.lastExcelImport).toLocaleString('fr-FR')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Upload card */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                      <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Import depuis Excel</h3>
                      <p className="text-slate-400 text-xs">Détection automatique des changements</p>
                    </div>
                  </div>

                  {/* Drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 hover:border-emerald-500/40 rounded-xl p-8 text-center cursor-pointer transition-all hover:bg-emerald-500/5 group">
                    <Upload className="h-8 w-8 text-slate-500 group-hover:text-emerald-400 mx-auto mb-3 transition-colors" />
                    <p className="text-slate-300 font-semibold text-sm">{excelFile ? excelFile.name : 'Cliquez ou déposez votre fichier Excel'}</p>
                    <p className="text-slate-500 text-xs mt-1">.xlsx, .xls — même format que l'import initial</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelPreview(f); e.target.value = ''; }} />

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={deactivateMissing} onChange={e => setDeactivateMissing(e.target.checked)} className="w-4 h-4 accent-rose-500" />
                    <span className="text-slate-300 text-sm">Désactiver les comptes absents du fichier</span>
                  </label>

                  {excelMsg && <p className={`text-sm font-semibold ${excelMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{excelMsg}</p>}
                </div>

                {/* API sync card */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Synchronisation API</h3>
                      <p className="text-slate-400 text-xs">Récupération depuis votre API externe</p>
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-xl p-4 space-y-1 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">URL API configurée</p>
                    <p className="text-slate-300 text-sm font-mono break-all">{settings.apiUrl || '— Non configurée (voir Paramètres) —'}</p>
                  </div>

                  {settings.lastApiSync && (
                    <p className="text-slate-500 text-xs flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Dernière synchro : {new Date(settings.lastApiSync).toLocaleString('fr-FR')}
                    </p>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={apiDeactivateMissing} onChange={e => setApiDeactivateMissing(e.target.checked)} className="w-4 h-4 accent-rose-500" />
                    <span className="text-slate-300 text-sm">Désactiver les comptes absents de l'API</span>
                  </label>

                  <button onClick={handleApiSync} disabled={syncingApi || !settings.apiUrl}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-xl text-sm font-bold transition-all disabled:opacity-40">
                    {syncingApi ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Synchroniser depuis l'API
                  </button>
                  {syncMsg && <p className={`text-sm font-semibold ${syncMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{syncMsg}</p>}
                  {apiSyncResult && <SyncChangesReport result={apiSyncResult} />}
                </div>
              </div>

              {/* Preview */}
              {excelLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                  <span className="text-slate-400 ml-3 font-medium">Analyse du fichier…</span>
                </div>
              )}

              {excelPreview && (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total dans le fichier', value: excelPreview.summary.total, color: 'text-slate-300', bg: 'bg-white/5', border: 'border-white/10' },
                      { label: 'Nouveaux comptes', value: excelPreview.summary.toAdd, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                      { label: 'Mises à jour', value: excelPreview.summary.toUpdate, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                      { label: 'À désactiver', value: excelPreview.summary.toDeactivate, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                    ].map(k => (
                      <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-4`}>
                        <p className={`text-3xl font-black ${k.color}`}>{k.value}</p>
                        <p className="text-slate-400 text-xs font-semibold mt-1">{k.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* New users */}
                  {excelPreview.toAdd.length > 0 && (
                    <div className="bg-white/5 border border-emerald-500/20 rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-emerald-400 font-bold text-sm">Nouveaux comptes à ajouter ({excelPreview.toAdd.length})</span>
                      </div>
                      <div className="overflow-x-auto max-h-48">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-white/5">
                            {['Nom','Prénom','AD','Poste','Rôle'].map(h => <th key={h} className="py-2 px-4 text-left text-slate-500 font-bold uppercase">{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {excelPreview.toAdd.map((u, i) => (
                              <tr key={i} className="border-b border-white/5">
                                <td className="py-1.5 px-4 text-white font-semibold">{u.nom}</td>
                                <td className="py-1.5 px-4 text-slate-300">{u.prenom}</td>
                                <td className="py-1.5 px-4 text-slate-400 font-mono">{u.activeDirectory}</td>
                                <td className="py-1.5 px-4 text-slate-400 max-w-[140px] truncate">{u.poste}</td>
                                <td className="py-1.5 px-4"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${ROLE_COLORS[u.role] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{u.role}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Updated */}
                  {excelPreview.toUpdate.length > 0 && (
                    <div className="bg-white/5 border border-blue-500/20 rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
                        <Eye className="h-4 w-4 text-blue-400" />
                        <span className="text-blue-400 font-bold text-sm">Modifications détectées ({excelPreview.toUpdate.length})</span>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                        {excelPreview.toUpdate.map((u, i) => (
                          <div key={i} className="px-4 py-2 text-xs">
                            <p className="text-white font-semibold">{u.next.prenom} {u.next.nom} <span className="text-slate-500 font-mono font-normal">{u.next.matricule}</span></p>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                              {(u.changed as string[]).map((f, j) => (
                                <span key={j}>
                                  <span className="text-slate-500">{SYNC_FIELD_LABELS[f] || f} : </span>
                                  <span className="text-red-300 line-through decoration-red-500/50">{formatSyncFieldValue(f, u.current[f])}</span>
                                  <span className="text-slate-500"> → </span>
                                  <span className="text-emerald-300">{formatSyncFieldValue(f, u.next[f])}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Apply button */}
                  <button onClick={handleExcelApply} disabled={excelLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-rose-500/20 disabled:opacity-60">
                    {excelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Appliquer les changements
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════════ SETTINGS ════════ */}
          {tab === 'settings' && (
            <div className="max-w-2xl space-y-6">
              {/* App name */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5 text-slate-400" />
                  <h3 className="text-white font-bold">Général</h3>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Nom de l'application</label>
                  <input type="text" value={settings.appName} onChange={e => setSettings(s => ({ ...s, appName: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40" />
                </div>
              </div>

              {/* Modules activables/désactivables */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <ToggleRight className="h-5 w-5 text-slate-400" />
                  <div>
                    <h3 className="text-white font-bold">Modules</h3>
                    <p className="text-slate-500 text-[10px]">Seul le Super Administrateur peut activer ou désactiver ces modules.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-semibold">Fiche de Poste</p>
                    <p className="text-slate-500 text-[10px]">Désactivé par défaut en V1.0</p>
                  </div>
                  <button onClick={() => toggleModule('fichePoste')} disabled={moduleSaving === 'fichePoste'}
                    className={`flex items-center gap-2 transition-opacity disabled:opacity-50 ${moduleFlags.fichePoste ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {moduleFlags.fichePoste ? <ToggleRight className="h-8 w-8" /> : <ToggleLeft className="h-8 w-8" />}
                    <span className="text-xs font-bold w-16 text-left">{moduleFlags.fichePoste ? 'Activé' : 'Désactivé'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-semibold">Feedback 360°</p>
                    <p className="text-slate-500 text-[10px]">Demandes de feedback multi-évaluateurs</p>
                  </div>
                  <button onClick={() => toggleModule('feedback')} disabled={moduleSaving === 'feedback'}
                    className={`flex items-center gap-2 transition-opacity disabled:opacity-50 ${moduleFlags.feedback ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {moduleFlags.feedback ? <ToggleRight className="h-8 w-8" /> : <ToggleLeft className="h-8 w-8" />}
                    <span className="text-xs font-bold w-16 text-left">{moduleFlags.feedback ? 'Activé' : 'Désactivé'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-semibold">Organigramme</p>
                    <p className="text-slate-500 text-[10px]">
                      {moduleFlags.orgchart
                        ? 'Ouvert à tous les utilisateurs'
                        : 'Restreint — accès individuel uniquement (voir icône dédiée dans Comptes)'}
                    </p>
                  </div>
                  <button onClick={() => toggleModule('orgchart')} disabled={moduleSaving === 'orgchart'}
                    className={`flex items-center gap-2 transition-opacity disabled:opacity-50 ${moduleFlags.orgchart ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {moduleFlags.orgchart ? <ToggleRight className="h-8 w-8" /> : <ToggleLeft className="h-8 w-8" />}
                    <span className="text-xs font-bold w-16 text-left">{moduleFlags.orgchart ? 'Ouvert à tous' : 'Restreint'}</span>
                  </button>
                </div>
              </div>

              {/* Campaign panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Campagne Annuelle */}
                <div className="bg-white/5 backdrop-blur-sm border border-rose-500/20 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-4 w-4 text-rose-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-sm">Campagne Annuelle</h3>
                      <p className="text-slate-500 text-[10px]">Évaluation de fin d'année (N)</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Date d'ouverture</label>
                      <input type="date" value={settings.openDate} onChange={e => setSettings(s => ({ ...s, openDate: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Date de fermeture</label>
                      <input type="date" value={settings.closeDate} onChange={e => setSettings(s => ({ ...s, closeDate: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40" />
                    </div>
                  </div>
                  {settings.openDate && settings.closeDate && (
                    <div className={`text-[10px] font-semibold px-3 py-2 rounded-lg border ${
                      new Date() >= new Date(settings.openDate) && new Date() <= new Date(settings.closeDate)
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-500/10 border-slate-500/20 text-slate-500'
                    }`}>
                      {new Date() >= new Date(settings.openDate) && new Date() <= new Date(settings.closeDate)
                        ? '● Campagne en cours'
                        : new Date() < new Date(settings.openDate) ? '○ Pas encore ouverte' : '○ Clôturée'}
                    </div>
                  )}
                </div>

                {/* Campagne Mi-parcours */}
                <div className="bg-white/5 backdrop-blur-sm border border-indigo-500/20 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-sm">Campagne Mi-parcours</h3>
                      <p className="text-slate-500 text-[10px]">Évaluation intermédiaire (N+0.5)</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Date d'ouverture</label>
                      <input type="date" value={settings.openDateMp} onChange={e => setSettings(s => ({ ...s, openDateMp: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Date de fermeture</label>
                      <input type="date" value={settings.closeDateMp} onChange={e => setSettings(s => ({ ...s, closeDateMp: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
                    </div>
                  </div>
                  {settings.openDateMp && settings.closeDateMp && (
                    <div className={`text-[10px] font-semibold px-3 py-2 rounded-lg border ${
                      new Date() >= new Date(settings.openDateMp) && new Date() <= new Date(settings.closeDateMp)
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-500/10 border-slate-500/20 text-slate-500'
                    }`}>
                      {new Date() >= new Date(settings.openDateMp) && new Date() <= new Date(settings.closeDateMp)
                        ? '● Campagne en cours'
                        : new Date() < new Date(settings.openDateMp) ? '○ Pas encore ouverte' : '○ Clôturée'}
                    </div>
                  )}
                </div>
              </div>

              {/* API config */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-3 mb-1">
                  <Link2 className="h-5 w-5 text-blue-400" />
                  <h3 className="text-white font-bold">Configuration API externe</h3>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">URL de base de l'API RH</label>
                  <input type="url" value={settings.apiUrl} placeholder="http://192.168.0.44/api"
                    onChange={e => setSettings(s => ({ ...s, apiUrl: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-blue-500/40 font-mono placeholder-slate-600" />
                  <p className="text-slate-500 text-xs">Adresse de base de l'API RH (LDM RH API), sans <code>/employees</code> à la fin — ex. http://192.168.0.44/api</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Clé API (Bearer token)</label>
                  <input type="password" value={settings.apiKey} placeholder="••••••••••••••••••••"
                    onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-blue-500/40 font-mono" />
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={handleSaveSettings}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${settingsSaved ? 'bg-emerald-600 text-white' : 'bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white shadow-lg shadow-rose-500/20'}`}>
                  {settingsSaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {settingsSaved ? 'Enregistré !' : 'Enregistrer les paramètres'}
                </button>
                <button onClick={handleTestReminders} disabled={reminderTesting}
                  className="flex items-center gap-2 px-5 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                  {reminderTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                  Tester les rappels
                </button>
              </div>
              {reminderMsg && (
                <p className={`text-sm font-semibold ${reminderMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{reminderMsg}</p>
              )}
            </div>
          )}

          {/* ════════ CRITÈRES ════════ */}
          {tab === 'criteria' && (
            <div className="space-y-5">
              {/* Sub-tabs */}
              <div className="flex gap-2">
                {(['executions', 'cadres'] as const).map(t => (
                  <button key={t} onClick={() => setCriteriaTab(t)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                      criteriaTab === t
                        ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                    }`}>
                    <ListChecks className="h-4 w-4" />
                    {t === 'executions' ? 'Exécutions' : 'Cadres & Maîtrises'}
                  </button>
                ))}
              </div>

              {criteriaLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
                </div>
              ) : !criteriaData[criteriaTab] ? (
                <div className="text-center py-16 text-slate-500">
                  <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Aucun critère chargé.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {criteriaData[criteriaTab].categories.map((cat, catIdx) => {
                    const catKey = `${criteriaTab}_${catIdx}`;
                    const collapsed = collapsedCats[catKey];
                    const totalItems = cat.items.length;
                    return (
                      <div key={catIdx} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                        {/* Category header */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                          <GripVertical className="h-4 w-4 text-slate-600 flex-shrink-0" />
                          <input
                            value={cat.title}
                            onChange={e => updateCategoryTitle(catIdx, e.target.value)}
                            className="flex-1 bg-transparent text-white font-bold text-sm outline-none border-b border-transparent focus:border-rose-500/50 py-0.5 transition-colors"
                          />
                          <span className="text-slate-500 text-xs font-semibold flex-shrink-0">{totalItems} critère{totalItems > 1 ? 's' : ''}</span>
                          <button
                            onClick={() => setCollapsedCats(prev => ({ ...prev, [catKey]: !collapsed }))}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors flex-shrink-0">
                            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => removeCategory(catIdx)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors flex-shrink-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Items */}
                        {!collapsed && (
                          <div className="divide-y divide-white/5">
                            {cat.items.map((item, itemIdx) => (
                              <div key={item.id} className="flex items-start gap-3 px-5 py-3 group hover:bg-white/3">
                                <GripVertical className="h-4 w-4 text-slate-700 flex-shrink-0 mt-2.5" />
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <input
                                    value={item.label}
                                    onChange={e => updateCriteriaItem(catIdx, itemIdx, 'label', e.target.value)}
                                    placeholder="Intitulé du critère"
                                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/30 placeholder-slate-600"
                                  />
                                  <input
                                    value={item.description || ''}
                                    onChange={e => updateCriteriaItem(catIdx, itemIdx, 'description', e.target.value)}
                                    placeholder="Description (optionnel)"
                                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-sm outline-none focus:ring-2 focus:ring-rose-500/30 placeholder-slate-600"
                                  />
                                </div>
                                <button
                                  onClick={() => removeCriteriaItem(catIdx, itemIdx)}
                                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all flex-shrink-0 mt-1">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                            {/* Add item */}
                            <div className="px-5 py-3">
                              <button
                                onClick={() => addCriteriaItem(catIdx)}
                                className="flex items-center gap-2 text-sm text-slate-500 hover:text-rose-400 font-semibold transition-colors">
                                <Plus className="h-4 w-4" /> Ajouter un critère
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add category */}
                  <button onClick={addCategory}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-white/10 hover:border-rose-500/30 text-slate-500 hover:text-rose-400 rounded-2xl text-sm font-semibold transition-all">
                    <Plus className="h-4 w-4" /> Ajouter une catégorie
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-3 flex-wrap pt-2">
                    <button onClick={handleSaveCriteria} disabled={criteriaSaving}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-rose-500/20 disabled:opacity-60">
                      {criteriaSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer les critères
                    </button>
                    <button onClick={handleResetCriteria} disabled={criteriaSaving}
                      className="flex items-center gap-2 px-5 py-3 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-slate-400 rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                      <RotateCcw className="h-4 w-4" /> Réinitialiser par défaut
                    </button>
                  </div>
                  {criteriaMsg && (
                    <p className={`text-sm font-semibold ${criteriaMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{criteriaMsg}</p>
                  )}
                </div>
              )}

              {/* ── Tarif journalier — Formations externes ── */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden mt-2">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                    <Wallet className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">Tarif journalier — Formations externes</p>
                    <p className="text-slate-500 text-xs">Budget = tarif journalier × nombre de jours prévisionnels. Tarif unique pour toutes les catégories (Exécutions, Cadre, Maîtrise). Sans effet sur les formations internes (LDM Groupe, sans budget).</p>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Tarif par jour (DA)</label>
                      <input
                        type="number" min="1" step="500"
                        value={dailyRate}
                        onChange={e => setDailyRate(e.target.value)}
                        placeholder="15000"
                        className="w-40 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-amber-500/30 placeholder-slate-600"
                      />
                    </div>
                    <span className="text-slate-500 text-sm pb-2.5">DA / jour de formation</span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap pt-2">
                    <button onClick={handleSaveDailyRate} disabled={budgetsSaving}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-rose-500/20 disabled:opacity-60">
                      {budgetsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer le tarif
                    </button>
                    <button onClick={handleResetDailyRate} disabled={budgetsSaving}
                      className="flex items-center gap-2 px-5 py-3 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-slate-400 rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                      <RotateCcw className="h-4 w-4" /> Réinitialiser par défaut
                    </button>
                  </div>
                  {budgetsMsg && (
                    <p className={`text-sm font-semibold ${budgetsMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{budgetsMsg}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ════════ SYSTÈME ════════ */}
          {tab === 'system' && (
            <div className="space-y-6 max-w-3xl">

              {/* ── SMTP ── */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Configuration Email (SMTP)</h3>
                      <p className="text-slate-500 text-xs">Notifications, mot de passe oublié, rapports automatiques</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSmtpCfg(c => ({ ...c, smtp_enabled: c.smtp_enabled === 'true' ? 'false' : 'true' }))}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${smtpCfg.smtp_enabled === 'true' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-500'}`}>
                    {smtpCfg.smtp_enabled === 'true' ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    {smtpCfg.smtp_enabled === 'true' ? 'Activé' : 'Désactivé'}
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 col-span-2 md:col-span-1">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Serveur SMTP (host)</label>
                      <input value={smtpCfg.smtp_host} onChange={e => setSmtpCfg(c => ({ ...c, smtp_host: e.target.value }))}
                        placeholder="smtp.office365.com" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Port</label>
                      <input value={smtpCfg.smtp_port} onChange={e => setSmtpCfg(c => ({ ...c, smtp_port: e.target.value }))}
                        placeholder="587" type="number" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Utilisateur (login)</label>
                      <input value={smtpCfg.smtp_user} onChange={e => setSmtpCfg(c => ({ ...c, smtp_user: e.target.value }))}
                        placeholder="noreply@ldmgroupe.com" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Mot de passe SMTP</label>
                      <input value={smtpCfg.smtp_password} onChange={e => setSmtpCfg(c => ({ ...c, smtp_password: e.target.value }))}
                        type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Adresse expéditeur (From)</label>
                      <input value={smtpCfg.smtp_from} onChange={e => setSmtpCfg(c => ({ ...c, smtp_from: e.target.value }))}
                        placeholder="Talents <noreply@ldmgroupe.com>" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500/40" />
                    </div>
                    <div className="space-y-1.5 flex flex-col justify-end">
                      <label className="flex items-center gap-2 cursor-pointer py-2.5">
                        <input type="checkbox" checked={smtpCfg.smtp_tls === 'true'} onChange={e => setSmtpCfg(c => ({ ...c, smtp_tls: String(e.target.checked) }))} className="w-4 h-4 accent-blue-500" />
                        <span className="text-slate-300 text-sm font-medium">Activer TLS/STARTTLS</span>
                      </label>
                    </div>
                  </div>

                  {/* Test email row */}
                  <div className="flex gap-3 pt-2 border-t border-white/5">
                    <input value={smtpTestEmail} onChange={e => setSmtpTestEmail(e.target.value)}
                      placeholder="Envoyer un email de test à…" className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500/40" />
                    <button onClick={handleTestSmtp} disabled={smtpTesting}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-xl text-sm font-bold transition-all disabled:opacity-50 whitespace-nowrap">
                      {smtpTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Tester
                    </button>
                    <button onClick={handleSaveSmtp} disabled={smtpSaving}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 whitespace-nowrap">
                      {smtpSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer
                    </button>
                  </div>
                  {smtpMsg && <p className={`text-sm font-semibold ${smtpMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{smtpMsg}</p>}
                </div>
              </div>

              {/* ── LDAP ── */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                      <Server className="h-4 w-4 text-violet-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Configuration LDAP / Active Directory</h3>
                      <p className="text-slate-500 text-xs">Authentification SSO des collaborateurs via l'annuaire d'entreprise</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setLdapCfg(c => ({ ...c, ldap_enabled: c.ldap_enabled === 'true' ? 'false' : 'true' }))}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${ldapCfg.ldap_enabled === 'true' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-500'}`}>
                    {ldapCfg.ldap_enabled === 'true' ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    {ldapCfg.ldap_enabled === 'true' ? 'Activé' : 'Désactivé'}
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">URL du serveur LDAP</label>
                      <input value={ldapCfg.ldap_url} onChange={e => setLdapCfg(c => ({ ...c, ldap_url: e.target.value }))}
                        placeholder="ldap://ad.ldmgroupe.com:389" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500/40" />
                      <p className="text-slate-600 text-[10px]">Exemples : ldap://192.168.1.10:389 · ldaps://ad.entreprise.com:636</p>
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Base DN</label>
                      <input value={ldapCfg.ldap_baseDn} onChange={e => setLdapCfg(c => ({ ...c, ldap_baseDn: e.target.value }))}
                        placeholder="DC=ldmgroupe,DC=com" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Bind DN (compte de service)</label>
                      <input value={ldapCfg.ldap_bindDn} onChange={e => setLdapCfg(c => ({ ...c, ldap_bindDn: e.target.value }))}
                        placeholder="CN=svc-talent,OU=Services,DC=ldmgroupe,DC=com" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500/40" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Mot de passe Bind</label>
                      <input value={ldapCfg.ldap_bindPassword} onChange={e => setLdapCfg(c => ({ ...c, ldap_bindPassword: e.target.value }))}
                        type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500/40" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Filtre de recherche utilisateur</label>
                      <input value={ldapCfg.ldap_userFilter} onChange={e => setLdapCfg(c => ({ ...c, ldap_userFilter: e.target.value }))}
                        placeholder="(sAMAccountName={{username}})" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-violet-500/40" />
                      <p className="text-slate-600 text-[10px]">&#123;&#123;username&#125;&#125; sera remplacé par le login saisi. Défaut AD : (sAMAccountName=&#123;&#123;username&#125;&#125;)</p>
                    </div>
                  </div>

                  {/* Info box */}
                  <div className="flex items-start gap-3 bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                    <Wifi className="h-4 w-4 text-violet-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-400 space-y-1">
                      <p><span className="text-violet-300 font-semibold">Priorité :</span> si un utilisateur a un mot de passe local défini, celui-ci est vérifié en premier (LDAP ignoré).</p>
                      <p><span className="text-violet-300 font-semibold">Fallback :</span> si le serveur LDAP est inaccessible, la connexion par mot de passe local reste disponible.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2 border-t border-white/5">
                    <button onClick={handleTestLdap} disabled={ldapTesting}
                      className="flex items-center gap-2 px-4 py-2.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                      {ldapTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />}
                      Tester la connexion
                    </button>
                    <button onClick={handleSaveLdap} disabled={ldapSaving}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                      {ldapSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Enregistrer
                    </button>
                  </div>
                  {ldapMsg && (
                    <div className={`flex items-center gap-2 text-sm font-semibold ${ldapMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                      {ldapMsg.startsWith('✓') ? <CheckCircle className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                      {ldapMsg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ════════ PROFILE ════════ */}
          {/* ═══════════════════════════════════ RGPD ═══════════════════════════════════ */}
          {tab === 'rgpd' && (
            <div className="max-w-4xl space-y-6">

              {/* Header */}
              <div className="bg-gradient-to-r from-orange-600/20 to-red-600/20 border border-orange-500/20 rounded-2xl p-6 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="h-6 w-6 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-white font-black text-lg">Conformité RGPD</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Gérez le droit à l'oubli et les politiques d'archivage légal. L'anonymisation supprime les données identifiantes
                    tout en conservant les données statistiques. La suppression est définitive et irréversible.
                  </p>
                </div>
              </div>

              {/* Retention policy */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                  <HistoryIcon className="h-4 w-4 text-slate-400" /> Politique de conservation des données
                </h3>
                <p className="text-slate-400 text-xs">
                  Durée légale après laquelle les données d'un employé inactif peuvent être anonymisées ou supprimées.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min="1" max="50"
                    value={rgpdRetentionInput}
                    onChange={e => setRgpdRetentionInput(e.target.value)}
                    className="w-24 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-orange-500/40 text-center font-bold"
                  />
                  <span className="text-slate-400 text-sm">ans après le dernier enregistrement</span>
                  <button onClick={handleRgpdSavePolicy} disabled={rgpdPolicySaving}
                    className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ml-auto">
                    {rgpdPolicySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Enregistrer
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/5 rounded-xl px-4 py-2.5 border border-white/5">
                  <Clock className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                  Politique actuelle : <span className="text-orange-300 font-bold ml-1">{rgpdRetention} ans</span>
                </div>
              </div>

              {/* Filter + Load */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-2">
                  {([['all', 'Tous (inactifs)'], ['expired', 'Durée dépassée'], ['anonymized', 'Déjà anonymisés']] as [typeof rgpdFilter, string][]).map(([f, label]) => (
                    <button key={f} onClick={() => { setRgpdFilter(f); loadRgpdData(f); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        rgpdFilter === f ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'text-slate-400 hover:text-white bg-white/5 border border-white/5'
                      }`}>
                      <Filter className="h-3 w-3" />{label}
                    </button>
                  ))}
                </div>
                <button onClick={() => loadRgpdData(rgpdFilter)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-semibold border border-white/10 transition-colors ml-auto">
                  <RefreshCw className="h-3.5 w-3.5" /> Actualiser
                </button>
              </div>

              {/* Message */}
              {rgpdMsg && (
                <div className={`px-4 py-3 rounded-xl text-sm font-semibold border ${
                  rgpdMsg.startsWith('✓') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'
                }`}>{rgpdMsg}</div>
              )}

              {/* Users list */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
                  <EyeOff className="h-4 w-4 text-orange-400" />
                  <span className="text-white font-bold text-sm">Employés concernés</span>
                  {!rgpdLoading && <span className="ml-auto text-xs text-slate-400 font-semibold">{rgpdUsers.length} utilisateur{rgpdUsers.length !== 1 ? 's' : ''}</span>}
                </div>

                {rgpdLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
                  </div>
                ) : rgpdUsers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <EyeOff className="h-8 w-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Aucun utilisateur dans ce filtre. Cliquez sur "Actualiser".</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {rgpdUsers.map((u: any) => (
                      <div key={u.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-colors">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base flex-shrink-0 ${
                          u.anonymized ? 'bg-slate-700 text-slate-400' : u.expired ? 'bg-red-500/20 text-red-300' : 'bg-slate-600 text-slate-300'
                        }`}>
                          {u.anonymized ? <EyeOff className="h-4 w-4" /> : (u.nom?.charAt(0) || '?')}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-white text-sm truncate">
                              {u.anonymized ? 'Anonymisé' : `${u.nom} ${u.prenom}`.trim()}
                            </p>
                            {u.anonymized && (
                              <span className="text-[10px] font-bold bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">Anonymisé</span>
                            )}
                            {u.expired && !u.anonymized && (
                              <span className="text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/20 px-2 py-0.5 rounded-full">
                                Durée dépassée
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">
                            {u.poste}{u.direction ? ` · ${u.direction}` : ''}
                            {u.dataAgeYears !== null && ` · ${u.dataAgeYears}a`}
                            {u.evalCount > 0 && ` · ${u.evalCount} éval.`}
                          </p>
                          {u.anonymizedAt && (
                            <p className="text-[10px] text-slate-500">Anonymisé le {new Date(u.anonymizedAt).toLocaleDateString('fr-FR')}</p>
                          )}
                        </div>

                        {/* Actions */}
                        {!u.anonymized && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => setRgpdConfirm({ userId: u.id, action: 'anonymize', name: `${u.nom} ${u.prenom}`.trim() })}
                              disabled={rgpdActionLoading === u.id}
                              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/20 rounded-xl text-xs font-bold transition-colors">
                              {rgpdActionLoading === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                              Anonymiser
                            </button>
                            <button
                              onClick={() => setRgpdConfirm({ userId: u.id, action: 'delete', name: `${u.nom} ${u.prenom}`.trim() })}
                              disabled={rgpdActionLoading === u.id || !!u.actif}
                              title={u.actif ? 'Désactivez l\'utilisateur avant de le supprimer' : ''}
                              className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition-colors disabled:opacity-40">
                              <Eraser className="h-3.5 w-3.5" /> Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit log */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                <button
                  onClick={() => { setRgpdShowAudit(v => !v); if (!rgpdShowAudit) loadRgpdAudit(); }}
                  className="w-full flex items-center gap-3 px-6 py-4 hover:bg-white/5 transition-colors text-left">
                  <HistoryIcon className="h-4 w-4 text-slate-400" />
                  <span className="text-white font-bold text-sm">Journal des actions RGPD</span>
                  {rgpdShowAudit ? <ChevronUp className="h-4 w-4 text-slate-400 ml-auto" /> : <ChevronDown className="h-4 w-4 text-slate-400 ml-auto" />}
                </button>
                {rgpdShowAudit && (
                  <div className="border-t border-white/10">
                    {rgpdAuditLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                    ) : rgpdAuditLog.length === 0 ? (
                      <p className="text-center py-8 text-slate-500 text-sm">Aucune action enregistrée.</p>
                    ) : (
                      <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                        {rgpdAuditLog.map((log: any) => (
                          <div key={log.id} className="flex items-start gap-3 px-6 py-3">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              log.action === 'anonymize' ? 'bg-orange-500/20' : 'bg-red-500/20'
                            }`}>
                              {log.action === 'anonymize' ? <EyeOff className="h-3.5 w-3.5 text-orange-400" /> : <Eraser className="h-3.5 w-3.5 text-red-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-semibold">
                                {log.action === 'anonymize' ? 'Anonymisation' : 'Suppression'} — <span className="text-slate-300">{log.targetNameSnapshot}</span>
                              </p>
                              <p className="text-slate-500 text-[11px] mt-0.5">
                                Par {log.performedByName} · {new Date(log.performedAt).toLocaleString('fr-FR')}
                              </p>
                              {log.details && <p className="text-slate-500 text-[11px]">{log.details}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CONFIRM DIALOG (RGPD) ── */}
          {rgpdConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-7 max-w-md w-full space-y-5">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                    rgpdConfirm.action === 'delete' ? 'bg-red-500/20' : 'bg-orange-500/20'
                  }`}>
                    {rgpdConfirm.action === 'delete' ? <Eraser className="h-5 w-5 text-red-400" /> : <EyeOff className="h-5 w-5 text-orange-400" />}
                  </div>
                  <div>
                    <h3 className="text-white font-black">
                      {rgpdConfirm.action === 'anonymize' ? 'Confirmer l\'anonymisation' : 'Confirmer la suppression'}
                    </h3>
                    <p className="text-slate-400 text-xs">{rgpdConfirm.name}</p>
                  </div>
                </div>
                <p className="text-slate-300 text-sm">
                  {rgpdConfirm.action === 'anonymize'
                    ? 'Les données identifiantes (nom, prénom, email, matricule) seront remplacées par des valeurs anonymes. Les évaluations seront conservées à des fins statistiques.'
                    : 'Toutes les données de cet utilisateur seront supprimées définitivement, y compris ses évaluations. Cette action est irréversible.'
                  }
                </p>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setRgpdConfirm(null)}
                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-semibold text-sm transition-colors border border-white/10">
                    Annuler
                  </button>
                  <button onClick={() => handleRgpdAction(rgpdConfirm.userId, rgpdConfirm.action)}
                    className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold text-sm transition-colors ${
                      rgpdConfirm.action === 'delete' ? 'bg-red-600 hover:bg-red-500' : 'bg-orange-600 hover:bg-orange-500'
                    }`}>
                    {rgpdConfirm.action === 'anonymize' ? 'Anonymiser' : 'Supprimer définitivement'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'profile' && (
            <div className="max-w-xl space-y-6">
              {mustChangePassword && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                  <ShieldAlert className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-300 font-bold text-sm">Changement de mot de passe requis</p>
                    <p className="text-amber-200/70 text-xs mt-0.5">
                      Votre compte utilise encore le mot de passe par défaut. Définissez-en un nouveau ci-dessous pour débloquer le reste de la console.
                    </p>
                  </div>
                </div>
              )}

              {/* Avatar card */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-rose-500/30">
                  {profile?.prenom?.charAt(0) || 'A'}
                </div>
                <div>
                  <h2 className="text-white font-black text-xl">{profile?.prenom} {profile?.nom}</h2>
                  <p className="text-slate-400 text-sm font-medium">{profile?.poste}</p>
                  <span className="mt-1 inline-block px-2.5 py-0.5 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-full text-[10px] font-bold">Super Administrateur</span>
                </div>
              </div>

              {/* Edit form */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
                <h3 className="text-white font-bold text-sm flex items-center gap-2"><User className="h-4 w-4 text-slate-400" /> Informations</h3>
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Identifiant AD</label>
                  <input disabled value={profile?.activeDirectory || ''} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-400 text-sm font-mono cursor-not-allowed" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Email</label>
                  <input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40" />
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-4">
                <h3 className="text-white font-bold text-sm flex items-center gap-2"><Key className="h-4 w-4 text-slate-400" /> Changer le mot de passe</h3>
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Mot de passe actuel</label>
                  <input type="password" value={profileCurrent} onChange={e => setProfileCurrent(e.target.value)} placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Nouveau MDP</label>
                    <input type="password" value={profileNew} onChange={e => setProfileNew(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-xs font-bold uppercase tracking-widest">Confirmer</label>
                    <input type="password" value={profileConfirm} onChange={e => setProfileConfirm(e.target.value)} placeholder="••••••••"
                      className={`w-full px-4 py-2.5 bg-white/5 border rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40 ${profileNew && profileConfirm && profileNew !== profileConfirm ? 'border-red-500/50' : 'border-white/10'}`} />
                  </div>
                </div>
              </div>

              {profileMsg && (
                <p className={`text-sm font-semibold ${profileMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{profileMsg}</p>
              )}

              <button onClick={handleSaveProfile} disabled={profileLoading}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-rose-500/20 disabled:opacity-60">
                {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Enregistrer le profil
              </button>
            </div>
          )}
        </div>

        <Footer className="text-slate-500" />
      </div>

      {/* ── Detail slide-over ── */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setDetailOpen(false)} />
          {/* Panel */}
          <div className="w-full max-w-lg bg-slate-900 border-l border-white/10 flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/10 flex items-center gap-4 flex-shrink-0">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/30 flex-shrink-0">
                {detailForm.prenom?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-black text-lg leading-tight truncate">{detailForm.prenom} {detailForm.nom}</h3>
                <p className="text-slate-400 text-xs font-mono truncate">{detailForm.activeDirectory}</p>
              </div>
              <button onClick={() => setDetailOpen(false)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 flex-shrink-0"><X className="h-4 w-4" /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {detailLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div>
              ) : (
                <>
                  {/* Identité */}
                  <section className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><User className="h-3.5 w-3.5" />Identité</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {([['Nom', 'nom'], ['Prénom', 'prenom']] as [string, keyof DetailForm][]).map(([lbl, key]) => (
                        <div key={key} className="space-y-1">
                          <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{lbl}</label>
                          <input value={detailForm[key]} onChange={e => setDetailForm(f => ({ ...f, [key]: e.target.value }))}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
                        </div>
                      ))}
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Matricule</label>
                        <input value={detailForm.matricule} onChange={e => setDetailForm(f => ({ ...f, matricule: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500/40" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Hash className="h-3 w-3" />Login AD</label>
                        <input value={detailForm.activeDirectory} onChange={e => setDetailForm(f => ({ ...f, activeDirectory: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500/40" />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Mail className="h-3 w-3" />Email</label>
                        <input type="email" value={detailForm.email} onChange={e => setDetailForm(f => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
                      </div>
                    </div>
                  </section>

                  {/* Poste & Rôle */}
                  <section className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><UserCog className="h-3.5 w-3.5" />Poste & Rôle</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 col-span-2">
                        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Intitulé du poste</label>
                        <input value={detailForm.poste} onChange={e => setDetailForm(f => ({ ...f, poste: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Rôle</label>
                        <select value={detailForm.role} onChange={e => setDetailForm(f => ({ ...f, role: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40">
                          {ROLES.map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Catégorie</label>
                        <input value={detailForm.categorie} onChange={e => setDetailForm(f => ({ ...f, categorie: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Type évaluation</label>
                        <select value={detailForm.evalType} onChange={e => setDetailForm(f => ({ ...f, evalType: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40">
                          <option value="Cadres & Maîtrises" className="bg-slate-900">Cadres & Maîtrises</option>
                          <option value="Exécutions" className="bg-slate-900">Exécutions</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Calendar className="h-3 w-3" />Date recrutement</label>
                        <input type="date" value={detailForm.dateRecrutement} onChange={e => setDetailForm(f => ({ ...f, dateRecrutement: e.target.value }))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
                      </div>
                    </div>
                  </section>

                  {/* Structure */}
                  <section className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />Structure organisationnelle</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {([['Pôle', 'pole'], ['Direction', 'direction'], ['Département', 'departement'], ['Service', 'service']] as [string, keyof DetailForm][]).map(([lbl, key]) => (
                        <div key={key} className="space-y-1">
                          <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{lbl}</label>
                          <input value={detailForm[key]} onChange={e => setDetailForm(f => ({ ...f, [key]: e.target.value }))}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40" />
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Responsables */}
                  <section className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Phone className="h-3.5 w-3.5" />Responsables hiérarchiques</h4>
                    <div className="space-y-2">
                      {(['responsable1', 'responsable2', 'responsable3'] as (keyof DetailForm)[]).map((key, i) => (
                        <div key={key} className="space-y-1">
                          <label className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Responsable {i + 1}</label>
                          <input value={detailForm[key]} onChange={e => setDetailForm(f => ({ ...f, [key]: e.target.value }))}
                            placeholder="Login AD du responsable"
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono placeholder-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/40" />
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex items-center gap-3 flex-shrink-0 bg-slate-900/80">
              {detailMsg && <p className={`flex-1 text-sm font-semibold ${detailMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{detailMsg}</p>}
              <div className="flex gap-3 ml-auto">
                <button onClick={() => setDetailOpen(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-sm font-semibold transition-colors">Fermer</button>
                <button onClick={handleSaveDetail} disabled={detailSaving || detailLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-500 hover:from-indigo-500 hover:to-purple-400 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-60 shadow-lg shadow-indigo-500/20">
                  {detailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-black text-base">
                {modal === 'role' && 'Changer le rôle'}
                {modal === 'password' && 'Réinitialiser le mot de passe'}
                {modal === 'delete' && 'Supprimer le compte'}
                {modal === 'bulkPassword' && 'Mot de passe pour tous'}
              </h3>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl hover:bg-white/10 text-slate-400"><X className="h-4 w-4" /></button>
            </div>

            {modalUser && (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-orange-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {modalUser.prenom?.charAt(0)}
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{modalUser.prenom} {modalUser.nom}</p>
                  <p className="text-slate-400 text-xs font-mono">{modalUser.activeDirectory}</p>
                </div>
              </div>
            )}

            {modal === 'role' && (
              <select value={modalValue} onChange={e => setModalValue(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40 mb-4">
                {ROLES.map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
              </select>
            )}
            {(modal === 'password' || modal === 'bulkPassword') && (
              <>
                {modal === 'bulkPassword' && <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 text-amber-300 text-xs font-medium"><Bell className="h-4 w-4 flex-shrink-0 mt-0.5" />Ce mot de passe sera appliqué à tous les comptes (sauf SuperAdmin).</div>}
                <input type="password" placeholder="Nouveau mot de passe" value={modalValue} onChange={e => setModalValue(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:ring-2 focus:ring-rose-500/40 mb-4" />
              </>
            )}
            {modal === 'delete' && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-300 text-sm font-medium">Cette action est irréversible. Le compte sera définitivement supprimé.</p>
              </div>
            )}

            {modalMsg && <p className={`text-sm font-semibold mb-4 ${modalMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{modalMsg}</p>}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-sm font-semibold transition-colors">Annuler</button>
              <button onClick={handleModalConfirm} disabled={modalLoading}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 ${modal === 'delete' ? 'bg-red-600 hover:bg-red-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
                {modalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {modal === 'delete' ? 'Supprimer' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
