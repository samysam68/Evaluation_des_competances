import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';

export const MyFeedbacksPage: React.FC = () => {
  const navigate = useNavigate();
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/feedback/pending`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setPending(data);
        else setError('Erreur de chargement.');
      })
      .catch(() => setError('Erreur de chargement.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-800">Mes Feedbacks 360°</h1>
        <p className="text-slate-400 text-sm mt-1">Demandes de feedback en attente de votre retour</p>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-5 py-4 text-sm font-medium">
          {error}
        </div>
      )}

      {!loading && !error && pending.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center space-y-3">
          <CheckCircle className="h-10 w-10 text-emerald-300 mx-auto" />
          <p className="text-slate-500 font-semibold">Aucune demande en attente</p>
          <p className="text-slate-400 text-sm">Vous recevrez une notification lorsqu'un collègue vous demandera un feedback.</p>
        </div>
      )}

      <div className="space-y-3">
        {pending.map(req => (
          <div key={req.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
              {req.targetPrenom?.charAt(0)}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 truncate">{req.targetPrenom} {req.targetNom}</p>
              <p className="text-slate-400 text-xs truncate">{req.targetPoste}</p>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-3 w-3 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-slate-400">
                  Demandé par <strong className="text-slate-600">{req.requesterPrenom} {req.requesterNom}</strong>
                  {' · '}
                  {new Date(req.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              {req.message && (
                <p className="text-xs text-slate-400 italic mt-1 truncate">"{req.message}"</p>
              )}
            </div>

            <button
              onClick={() => navigate(`/dashboard/feedback/${req.id}`)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-500 text-white rounded-xl font-bold text-sm flex-shrink-0 hover:from-indigo-500 hover:to-violet-400 transition-all">
              <MessageSquare className="h-4 w-4" />
              Répondre
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
