import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, CheckCircle, MessageSquare, Star } from 'lucide-react';
import { API_BASE_URL, authFetch } from '../../services/api';

export const FeedbackFormPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const [request, setRequest]   = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [comment, setComment]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (!requestId) return;
    authFetch(`${API_BASE_URL}/api/feedback/request/${requestId}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.message || 'Demande introuvable ou accès refusé.');
        } else {
          setRequest(data);
          if (data.status === 'submitted') setSubmitted(true);
        }
      })
      .catch(() => setError('Erreur de chargement.'))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handleSubmit = async () => {
    if (!comment.trim()) { setError('Veuillez écrire votre retour avant de soumettre.'); return; }
    setSaving(true); setError('');
    const res = await authFetch(`${API_BASE_URL}/api/feedback/submit/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({ ratings: {}, comment }),
    });
    const data = await res.json();
    if (res.ok) { setSubmitted(true); }
    else { setError(data.message || 'Erreur lors de la soumission.'); }
    setSaving(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
    </div>
  );

  if (error && !request) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-red-500 font-semibold">{error}</p>
        <button onClick={() => navigate(-1)} className="text-indigo-600 font-semibold text-sm hover:underline">
          Retour
        </button>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center space-y-5 border border-indigo-100">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-800">Feedback soumis !</h2>
        <p className="text-slate-500 text-sm">
          Merci pour votre retour sur <strong>{request?.targetPrenom} {request?.targetNom}</strong>.
          Ce feedback est confidentiel et sera agrégé avec les autres réponses.
        </p>
        <button onClick={() => navigate('/dashboard')}
          className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-500 text-white rounded-xl font-bold text-sm">
          Retour au tableau de bord
        </button>
      </div>
    </div>
  );

  const targetInitial = request?.targetPrenom?.charAt(0) || '?';
  const targetName    = `${request?.targetPrenom || ''} ${request?.targetNom || ''}`.trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Back */}
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-semibold text-sm transition-colors">
          <ChevronLeft className="h-4 w-4" /> Retour
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-500 rounded-3xl p-7 text-white shadow-lg shadow-indigo-200">
          <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-2">Feedback 360°</p>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white font-black text-2xl flex-shrink-0">
              {targetInitial}
            </div>
            <div>
              <h1 className="text-xl font-black">{targetName}</h1>
              <p className="text-indigo-200 text-sm">{request?.targetPoste}</p>
              {request?.targetDirection && <p className="text-indigo-300 text-xs">{request?.targetDirection}</p>}
            </div>
          </div>
          {request?.message && (
            <div className="mt-4 bg-white/10 rounded-xl px-4 py-3">
              <p className="text-indigo-100 text-xs italic">"{request.message}"</p>
              <p className="text-indigo-300 text-[10px] mt-1">— {request.requesterPrenom} {request.requesterNom}</p>
            </div>
          )}
        </div>

        {/* Confidentiality notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <Star className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-amber-800 text-sm font-medium">
            Ce feedback est <strong>confidentiel</strong>. Votre nom ne sera pas associé à vos réponses individuelles ;
            seuls les résultats agrégés seront visibles.
          </p>
        </div>

        {/* Champ libre */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-indigo-500" />
            <h2 className="font-bold text-slate-800">Votre retour</h2>
            <span className="text-red-400 text-xs font-semibold">* obligatoire</span>
          </div>
          <p className="text-slate-400 text-xs">
            Partagez librement vos observations sur <strong>{`${request?.targetPrenom} ${request?.targetNom}`}</strong> :
            points forts, axes d'amélioration, comportements remarqués…
          </p>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={8}
            placeholder="Écrivez votre retour ici…"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-none placeholder-slate-400"
          />
          <p className="text-right text-xs text-slate-400">{comment.length} caractère{comment.length > 1 ? 's' : ''}</p>
        </div>

        {/* Error */}
        {error && <p className="text-red-500 text-sm font-semibold bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

        {/* Submit */}
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)}
            className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={saving || !comment.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            {saving ? 'Envoi…' : 'Soumettre mon feedback'}
          </button>
        </div>
      </div>
    </div>
  );
};
