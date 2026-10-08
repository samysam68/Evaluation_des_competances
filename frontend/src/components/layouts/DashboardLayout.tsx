import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { NotificationBell } from '../notifications/NotificationBell';
import { FirstLoginModal } from '../modals/FirstLoginModal';
import { Footer } from '../common/Footer';
import { API_BASE_URL, authFetch } from '../../services/api';
import {
  LogOut, LayoutDashboard, UserCircle,
  ChevronRight, ChevronDown, Users, FileText, BarChart3, Settings, ClipboardList, Briefcase, GitBranch
} from 'lucide-react';

type NavItem = { icon: React.ElementType; label: string; path: string; roles?: string[]; needsDelegation?: boolean; isDropdown?: boolean; moduleKey?: 'fichePoste' | 'feedback'; requiresOrgChartAccess?: boolean };

const allNav: NavItem[] = [
  // Dashboard home — role-specific
  { icon: LayoutDashboard, label: 'Tableau de bord', path: '/dashboard/director',  roles: ['Directeur', 'Manager'] },
  { icon: LayoutDashboard, label: 'Tableau de bord', path: '/dashboard/supervisor', roles: ['Superviseur'] },
  { icon: LayoutDashboard, label: 'Mon Espace',      path: '/dashboard/employee',  roles: ['Employé', 'Responsable', 'Gestionnaire', 'Employe', 'RH'] },

  // Shared
  { icon: Users,         label: 'Mon Équipe', path: '/dashboard/team-tree',  roles: ['Directeur', 'Manager', 'Responsable', 'Superviseur', 'RH'] },
  { icon: ClipboardList, label: 'Évaluations',         path: '#', roles: ['Directeur', 'Manager', 'Responsable', 'Superviseur', 'RH'], needsDelegation: true, isDropdown: true },
  { icon: ClipboardList, label: 'Historique',          path: '/dashboard/history',    roles: ['Directeur', 'Manager', 'Responsable', 'RH', 'Superviseur'] },
  { icon: FileText,      label: 'Rapports',            path: '/dashboard/reports',    roles: ['Directeur', 'Manager', 'Responsable', 'RH'] },

  // Organigramme — module restreint (SuperAdmin + accès accordé individuellement)
  { icon: GitBranch,   label: 'Organigramme',    path: '/dashboard/orgchart', requiresOrgChartAccess: true },
  { icon: BarChart3,   label: 'Mes Feedbacks',   path: '/dashboard/my-feedbacks', moduleKey: 'feedback' },

  // Profile & Settings
  { icon: UserCircle, label: 'Mon Profil',  path: '/dashboard/profile' },
  { icon: Settings,   label: 'Paramètres', path: '/dashboard/settings' },
];

const roleGradient: Record<string, string> = {
  RH:          'from-purple-500 to-pink-500',
  Directeur:   'from-purple-500 to-pink-500',
  Manager:     'from-purple-500 to-pink-500',
  Responsable: 'from-purple-500 to-pink-500',
  Gestionnaire:'from-purple-500 to-pink-500',
  Superviseur: 'from-orange-500 to-amber-500',
  Employé:     'from-slate-500 to-slate-700',
};

export const DashboardLayout: React.FC = () => {
  const { user, isAuthenticated, logout, patchUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isEvalDropdownOpen, setEvalDropdownOpen] = useState(false);

  // Le flag `user.modules` (Fiches de Poste / Feedback 360) est figé au login. Si le
  // SuperAdmin active/désactive un module pendant que la session est déjà ouverte, on
  // le rafraîchit ici pour que le menu reflète l'état réel sans devoir se reconnecter.
  useEffect(() => {
    if (!isAuthenticated) return;
    authFetch(`${API_BASE_URL}/api/auth/me`)
      .then(r => (r.ok ? r.json() : null))
      .then(fresh => {
        if (fresh?.modules) patchUser({ modules: fresh.modules });
        if (typeof fresh?.orgChartAccess === 'boolean') patchUser({ orgChartAccess: fresh.orgChartAccess });
      })
      .catch(() => { /* ignore — on garde le dernier état connu */ });
  }, [isAuthenticated]);

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  const handleLogout = () => { logout(); navigate('/login'); };

  const gradient = roleGradient[user.role] ?? 'from-primary-500 to-accent-500';
  const navItems = allNav.filter(item => {
    if (item.roles && !item.roles.includes(user.role)) return false;
    if (item.needsDelegation && ['Superviseur', 'Responsable'].includes(user.role) && !user.hasDelegation) return false;
    if (item.moduleKey && user.modules && !user.modules[item.moduleKey]) return false;
    if (item.requiresOrgChartAccess && !user.orgChartAccess) return false;
    return true;
  });

  const isOnRHSpace = location.pathname.startsWith('/dashboard/rh');
  const isRH = user.rhAccess || user.poste === 'Responsable Recrutement & Formation';

  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-800">
      {user?.mustChangePassword && <FirstLoginModal />}
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200/80 flex-col hidden md:flex z-20 shadow-sm">
        <div className="h-20 flex items-center gap-3 px-6 border-b border-slate-100">
          <img src="/logo-talents.png" alt="Talents LDM" className="h-11 object-contain" />
          <div className="w-px h-8 bg-slate-200" />
          <img src="/logo-ldm.png" alt="LDM Groupe" className="h-14 object-contain flex-shrink-0" />
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Navigation</div>

          {navItems.map((item) => {
            const isActive = location.pathname === item.path;

            if (item.isDropdown) {
              return (
                <div key={item.label} className="space-y-1 mb-1">
                  <button
                    onClick={() => setEvalDropdownOpen(!isEvalDropdownOpen)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all font-semibold group text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon size={20} className="text-slate-400 group-hover:text-slate-600" />
                      <span>{item.label}</span>
                    </div>
                    {isEvalDropdownOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {isEvalDropdownOpen && (
                    <div className="pl-11 pr-4 py-2 space-y-1">
                      <button onClick={() => navigate('/dashboard/evaluations/executions')} className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${location.pathname.includes('/executions') ? 'bg-primary-50 text-primary-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
                        Fiche Exécutions
                      </button>
                      <button onClick={() => navigate('/dashboard/evaluations/cadres')} className={`w-full text-left py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${location.pathname.includes('/cadres') ? 'bg-primary-50 text-primary-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
                        Fiche Cadres & Maîtrises
                      </button>
                      {(['Directeur', 'Manager', 'RH'].includes(user.role)) && (
                        <button onClick={() => navigate('/dashboard/team-tree')} className="w-full text-left py-2 px-3 rounded-lg text-sm font-bold text-purple-600 hover:bg-purple-50 transition-colors mt-2 border border-purple-100 flex items-center gap-2">
                           Déléguer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button key={item.label + item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all font-semibold group mb-1 ${
                  isActive
                    ? 'bg-primary-50 text-primary-600 shadow-sm border border-primary-100'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={20} className={isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight size={16} className="text-primary-400" />}
              </button>
            );
          })}

          {/* ── Bouton Espace RH — visible uniquement pour le Manager RH ── */}
          {isRH && (
            <div className="pt-4 mt-2 border-t border-slate-100">
              <div className="px-4 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Accès Spécial</div>
              <button
                onClick={() => navigate(isOnRHSpace ? '/dashboard/employee' : '/dashboard/rh')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all border ${
                  isOnRHSpace
                    ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-500/30'
                    : 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 border-blue-100 hover:from-blue-100 hover:to-cyan-100'
                }`}
              >
                <BarChart3 size={20} className={isOnRHSpace ? 'text-white' : 'text-blue-500'} />
                <span>{isOnRHSpace ? 'Retour Manager' : 'Espace RH'}</span>
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold ${isOnRHSpace ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>
                  {isOnRHSpace ? '← ' : 'RH'}
                </span>
              </button>
            </div>
          )}
        </nav>

        {/* User Card */}
        <div className="p-4 border-t border-slate-100">
          <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-4 text-white`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center font-black text-lg shadow-inner">
                {user.fullName.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <p className="font-bold truncate text-sm" title={user.fullName}>{user.fullName}</p>
                <p className="text-xs text-white/70 font-medium truncate">{user.direction} / {user.department}</p>
              </div>
            </div>
            <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-bold mb-4">
              {isRH ? 'Manager RH' : user.role}
            </span>
            <button onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/25 rounded-xl transition-all font-semibold text-sm">
              <LogOut size={16} /> Déconnexion
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200/60 flex items-center justify-between px-8 z-10 sticky top-0 shadow-sm">
          <div className="hidden md:block">
            <h2 className="text-lg font-bold text-slate-800">
              Bonjour, <span className="text-gradient">{user.fullName.split(' ')[0]}</span> 👋
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <img src="/logo-talents.png" alt="Talents LDM" className="h-8 object-contain" />
            <div className="w-px h-6 bg-slate-200" />
            <img src="/logo-ldm.png" alt="LDM Groupe" className="h-10 object-contain" />
          </div>

          <div className="flex items-center gap-3">
            {/* Badge Espace RH actif dans le header */}
            {isRH && isOnRHSpace && (
              <span className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl text-xs font-bold">
                <Briefcase size={13} />
                Espace RH
              </span>
            )}
            <NotificationBell />
            <button onClick={() => navigate('/dashboard/profile')}
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center font-black text-sm shadow-md hover:scale-105 transition-transform`}>
              {user.fullName.charAt(0)}
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8 animate-slide-up flex flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
        </div>
      </main>
    </div>
  );
};
