import { API_BASE_URL, authFetch } from '../../services/api';
import React, { useState, useEffect } from 'react';
import { Clock, ShieldCheck, FileCheck, ArrowRight, User as UserIcon, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const getIconForType = (type: string) => {
  switch (type) {
    case 'delegation': return ShieldCheck;
    case 'evaluation': return FileCheck;
    case 'profil': return UserIcon;
    default: return ArrowRight;
  }
};

const getColorForType = (type: string) => {
  switch (type) {
    case 'delegation': return { text: "text-purple-600", bg: "bg-purple-100" };
    case 'evaluation': return { text: "text-emerald-600", bg: "bg-emerald-100" };
    case 'profil': return { text: "text-blue-600", bg: "bg-blue-100" };
    default: return { text: "text-slate-600", bg: "bg-slate-100" };
  }
};

const formatDate = (dateString: string) => {
  const d = new Date(dateString);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const HistoryPage: React.FC = () => {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      authFetch(`${API_BASE_URL}/api/history/${user.username}`)
        .then(res => res.json())
        .then(data => {
          setLogs(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Historique des Actions</h1>
        <p className="text-slate-500 font-medium">Traçabilité complète des délégations, évaluations et modifications de profil.</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 relative overflow-hidden">
        {logs.length === 0 ? (
          <div className="text-center text-slate-500 py-12 font-medium">Aucun historique disponible.</div>
        ) : (
          <>
            <div className="absolute left-12 top-12 bottom-12 w-0.5 bg-slate-100"></div>
            <div className="space-y-8 relative z-10">
              {logs.map((item) => {
                const Icon = getIconForType(item.type);
                const colors = getColorForType(item.type);
                
                return (
                  <div key={item.id} className="flex gap-6">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-4 border-white ${colors.bg} shadow-sm z-10`}>
                      <Icon className={`h-4 w-4 ${colors.text}`} />
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex-1 hover:border-slate-300 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-sm text-slate-800">
                          <span className="font-bold">{item.actorPoste || item.actorRole} ({item.actorName})</span> {item.action} <span className="font-bold">{item.target}</span>
                          {item.toTarget && <span> à <span className="font-bold text-primary-600">{item.toTarget}</span></span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(item.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
