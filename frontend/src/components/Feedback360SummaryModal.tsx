import React, { useEffect, useState } from 'react';
import { X, Loader2, MessageSquare, Users, Clock } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../services/api';

interface Props {
  target: { id: number; name: string; poste?: string };
  onClose: () => void;
}

export const Feedback360SummaryModal: React.FC<Props> = ({ target, onClose }) => {
  const [data, setData] = useState<{ feedbacks: any[]; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/feedback/summary/${target.id}`)
      .then(async r => {
        const json = await r.json();
        if (!r.ok) setError(json.message || 'Erreur.');
        else setData(json);
      })
      .catch(() => setError('Erreur de chargement.'))
      .finally(() => setLoading(false));
  }, [target.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
            {target.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-slate-800 text-base truncate">Feedbacks 360° reçus</h2>
            <p className="text-slate-500 text-xs truncate">{target.name} · {target.poste || '—'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm font-semibold text-center py-6">{error}</p>
          )}

          {!loading && !error && data && (
            <>
              {/* Compteur */}
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="font-black text-indigo-800 text-lg">{data.count}</p>
                  <p className="text-indigo-500 text-xs font-medium">retour{data.count > 1 ? 's' : ''} reçu{data.count > 1 ? 's' : ''}</p>
                </div>
              </div>

              {data.count === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-2">
                  <MessageSquare className="h-8 w-8 mx-auto opacity-30" />
                  <p className="text-sm font-medium">Aucun feedback soumis pour le moment.</p>
                  <p className="text-xs">Les répondants n'ont pas encore complété leurs retours.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.feedbacks.map((fb: any, i: number) => (
                    <div key={fb.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Répondant anonyme #{i + 1}
                        </span>
                        <div className="flex items-center gap-1 text-slate-400 text-xs">
                          <Clock className="h-3 w-3" />
                          {fb.submittedAt
                            ? new Date(fb.submittedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </div>
                      </div>
                      {fb.comment ? (
                        <p className="text-slate-700 text-sm leading-relaxed">"{fb.comment}"</p>
                      ) : (
                        <p className="text-slate-400 text-sm italic">Aucun commentaire.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
