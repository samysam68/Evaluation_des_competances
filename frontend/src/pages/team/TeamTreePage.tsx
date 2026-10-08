import { API_BASE_URL, authFetch } from '../../services/api';
import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, User, ShieldCheck, ShieldOff, Loader2, Search, UserCog, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { RHNavTabs } from '../dashboards/RHDashboard';

interface ManagerResult { id: number; username: string; name: string; role: string; department: string; poste: string; }

const TeamTreePage: React.FC = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const [tree, setTree] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isRH = ['RH', 'SuperAdmin'].includes(user?.role ?? '');
  const inRHSpace = location.pathname.startsWith('/dashboard/rh');

  // RH/SuperAdmin : possibilité de consulter/déléguer l'équipe d'un autre manager
  // (absent), au-delà de sa propre équipe — recherche par nom.
  const [actingFor, setActingFor] = useState<ManagerResult | null>(null);
  const [managerQuery, setManagerQuery] = useState('');
  const [managerResults, setManagerResults] = useState<ManagerResult[]>([]);
  const [searching, setSearching] = useState(false);

  const rootUsername = actingFor?.username || user?.username;

  useEffect(() => { fetchTree(); }, [user, actingFor]);

  useEffect(() => {
    if (!isRH || managerQuery.trim().length < 2) { setManagerResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      authFetch(`${API_BASE_URL}/api/team/managers-search?q=${encodeURIComponent(managerQuery.trim())}`)
        .then(res => res.ok ? res.json() : [])
        .then(setManagerResults)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [managerQuery, isRH]);

  const fetchTree = () => {
    if (!rootUsername) return;
    setLoading(true);
    authFetch(`${API_BASE_URL}/api/team/tree/${rootUsername}`)
      .then(res => { if (!res.ok) throw new Error('Erreur de chargement'); return res.json(); })
      .then(data => { setTree(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  };

  const handleDelegate = async (targetId: number) => {
    if (!user) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/team/delegate/${targetId}`, {
        method: 'POST',
        body: JSON.stringify({ delegatedByUsername: rootUsername })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors de la délégation');
      }
      fetchTree();
    } catch (err: any) {
      alert(err.message || 'Impossible de déléguer');
    }
  };

  const handleRevoke = async (delegationId: number) => {
    if (!user || !window.confirm('Révoquer cette délégation ?')) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/team/delegate/${delegationId}`, {
        method: 'DELETE',
        body: JSON.stringify({ revokedByUsername: user.username })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors de la révocation');
      }
      fetchTree();
    } catch (err: any) {
      alert(err.message || 'Impossible de révoquer');
    }
  };

  const TreeNode = ({ node }: { node: any }) => {
    const [isOpen, setIsOpen] = React.useState(node.open);
    const canDelegate = ['Directeur', 'Manager', 'RH', 'SuperAdmin'].includes(user?.role ?? '');

    return (
      <div className="ml-6 mt-3">
        <div className="flex items-center gap-3 group">
          {node.children ? (
            <button onClick={() => setIsOpen(!isOpen)} className="p-1 hover:bg-slate-100 rounded text-slate-500">
              {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div className="flex items-center gap-4 bg-white p-3 pr-6 rounded-xl border border-slate-200 shadow-sm flex-1 max-w-xl hover:border-primary-300 transition-colors">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold ${node.children ? 'bg-gradient-to-br from-indigo-500 to-purple-500' : 'bg-slate-400'}`}>
              <User size={20} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-slate-800">{node.name}</p>
              <p className="text-xs text-slate-500 font-medium">{node.poste || node.role}</p>
            </div>

            {(node.role === 'Superviseur' || node.role === 'Responsable') && (
              <div className="flex gap-2">
                {node.delegated ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      <ShieldCheck size={14} /> Délégation active
                    </span>
                    {canDelegate && (
                      <button
                        onClick={() => handleRevoke(node.delegationId || node.id)}
                        className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-200 transition-colors"
                        title="Révoquer la délégation"
                      >
                        <ShieldOff size={14} /> Révoquer
                      </button>
                    )}
                  </div>
                ) : (
                  canDelegate && (
                    <button
                      onClick={() => handleDelegate(node.id)}
                      className="text-xs font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Déléguer l'évaluation
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {isOpen && node.children && (
          <div className="border-l-2 border-slate-200 ml-3 pl-3">
            {node.children.map((child: any) => (
              <TreeNode key={child.id} node={child} />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
    </div>
  );

  if (error || !tree) return (
    <div className="text-center text-red-500 p-8 font-bold">
      Erreur lors du chargement de l'arborescence.
    </div>
  );

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {inRHSpace && <RHNavTabs />}
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">
          {inRHSpace ? 'Délégations — Espace RH' : "Arborescence de l'Équipe"}
        </h1>
        <p className="text-slate-500 font-medium">
          {inRHSpace
            ? "Attribuez une délégation d'évaluation au nom d'un manager ou directeur absent, pour n'importe quelle équipe de l'entreprise."
            : 'Visualisez la structure de votre département et gérez les délégations.'}
        </p>
      </div>

      {inRHSpace && isRH && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <UserCog className="h-3.5 w-3.5" /> Gérer la délégation d'un manager ou directeur absent
          </p>
          {actingFor ? (
            <div className="flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-xl px-4 py-2.5">
              <span className="text-sm font-bold text-primary-700">{actingFor.name}</span>
              <span className="text-xs text-primary-500">{actingFor.role} · {actingFor.department}</span>
              <button onClick={() => { setActingFor(null); setManagerQuery(''); }}
                className="ml-auto flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-600 transition-colors">
                <X className="h-3.5 w-3.5" /> Revenir à mon équipe
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="text" value={managerQuery} onChange={e => setManagerQuery(e.target.value)}
                placeholder="Rechercher un manager ou directeur par nom..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500" />
              {(searching || managerResults.length > 0) && managerQuery.trim().length >= 2 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                  {searching ? (
                    <div className="p-3 text-center text-xs text-slate-400">Recherche…</div>
                  ) : managerResults.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">Aucun résultat</div>
                  ) : managerResults.map(m => (
                    <button key={m.id} onClick={() => { setActingFor(m); setManagerQuery(''); setManagerResults([]); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                      <p className="text-sm font-bold text-slate-800">{m.name}</p>
                      <p className="text-xs text-slate-400">{m.role} · {m.department}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 overflow-x-auto">
        <TreeNode node={tree} />
      </div>
    </div>
  );
};

export default TeamTreePage;
