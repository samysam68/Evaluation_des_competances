import React, { useEffect, useState } from 'react';
import { X, Loader2, CheckCircle, Search, Users, Send } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface Props {
  target: { id: number; name: string; poste?: string };
  onClose: () => void;
}

export const Feedback360Modal: React.FC<Props> = ({ target, onClose }) => {
  const { user } = useAuthStore();
  const [colleagues, setColleagues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    // Endpoint accessible à tous les rôles — exclut automatiquement l'appelant côté serveur
    authFetch(`${API_BASE_URL}/api/team/users-for-feedback`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setColleagues(list.filter((u: any) => u.id !== target.id));
      })
      .catch(() => setError('Impossible de charger la liste des collègues.'))
      .finally(() => setLoading(false));
  }, [user, target.id]);

  const filtered = colleagues.filter(c =>
    `${c.prenom} ${c.nom} ${c.poste || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSend = async () => {
    if (selected.size === 0) { setError('Sélectionnez au moins un répondant.'); return; }
    setSaving(true); setError('');
    const res = await authFetch(`${API_BASE_URL}/api/feedback/request`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId: target.id, respondentIds: Array.from(selected), message }),
    });
    const data = await res.json();
    if (res.ok) setDone(true);
    else setError(data.message || 'Erreur lors de l\'envoi.');
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
            {target.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-slate-800 text-base truncate">Demande de Feedback 360°</h2>
            <p className="text-slate-500 text-xs truncate">{target.name} · {target.poste || '—'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="h-7 w-7 text-emerald-500" />
            </div>
            <h3 className="font-black text-slate-800 text-lg">Demandes envoyées !</h3>
            <p className="text-slate-500 text-sm text-center">
              {selected.size} collègue{selected.size > 1 ? 's ont' : ' a'} reçu une demande de feedback pour <strong>{target.name}</strong>.
            </p>
            <button onClick={onClose}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-500 text-white rounded-xl font-bold text-sm">
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Message optionnel */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Message personnalisé (optionnel)</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
                  placeholder="Ex : Dans le cadre de l'évaluation annuelle, merci de partager votre retour sur…"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 resize-none placeholder-slate-400" />
              </div>

              {/* Search */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Sélectionner les répondants
                  </label>
                  {selected.size > 0 && (
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher un collègue…"
                    className="pl-9 pr-4 py-2.5 w-full bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              {/* List */}
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {filtered.map(c => {
                    const isSelected = selected.has(c.id);
                    return (
                      <button key={c.id} onClick={() => toggle(c.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-transparent bg-slate-50 hover:bg-slate-100'
                        }`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${
                          isSelected ? 'bg-gradient-to-br from-indigo-500 to-violet-500' : 'bg-gradient-to-br from-slate-400 to-slate-500'
                        }`}>
                          {c.prenom?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm truncate">{c.prenom} {c.nom}</p>
                          <p className="text-slate-400 text-xs truncate">{c.poste || c.role}</p>
                        </div>
                        {isSelected && <CheckCircle className="h-4 w-4 text-indigo-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <p className="text-center text-slate-400 text-sm py-6">Aucun collègue trouvé.</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 flex-shrink-0">
              {error && <p className="flex-1 text-red-500 text-xs font-semibold">{error}</p>}
              <div className="flex gap-3 ml-auto">
                <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold text-sm transition-colors">
                  Annuler
                </button>
                <button onClick={handleSend} disabled={saving || selected.size === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Envoyer les demandes
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
