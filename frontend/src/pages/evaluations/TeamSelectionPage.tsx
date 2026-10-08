import { API_BASE_URL, authFetch } from '../../services/api';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Users, ChevronRight, Clock, Search, FileText, CheckCircle, RefreshCw, Star, MessageSquare } from 'lucide-react';
import { Feedback360Modal } from '../../components/Feedback360Modal';
import { Feedback360SummaryModal } from '../../components/Feedback360SummaryModal';
import { displayCategorie } from '../../utils/formatters';

interface TeamMember {
  id: number;
  name: string;
  role: string;
  department: string;
  poste: string;
  categorie: string;
  evalType: string;
  status: string;
  avatar: string;
}

interface Props {
  formId: string;
}

export const TeamSelectionPage: React.FC<Props> = ({ formId }) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [evaluatedIds, setEvaluatedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingEvals, setCheckingEvals] = useState(false);
  const [feedback360Target, setFeedback360Target] = useState<{ id: number; name: string; poste?: string } | null>(null);
  const [feedback360Summary, setFeedback360Summary] = useState<{ id: number; name: string; poste?: string } | null>(null);

  // The evaluation type string matching what is stored in the DB
  const evalType = formId === 'form_cadres' ? 'Cadres & Maîtrises' : 'Exécutions';
  const formPath = formId === 'form_cadres' ? 'cadres' : 'executions';
  const formTitle = formId === 'form_cadres' ? 'Fiche Cadres & Maîtrises' : 'Fiche Exécutions';

  useEffect(() => {
    if (!user) return;

    authFetch(`${API_BASE_URL}/api/team/members/${user.username}`)
      .then(res => res.json())
      .then((data: TeamMember[]) => {
        // Le backend retourne toujours un evalType (null → 'Cadres & Maîtrises' par défaut)
        const compatible = data.filter(m => (m.evalType || 'Cadres & Maîtrises') === evalType);
        setMembers(compatible);
        setLoading(false);

        if (compatible.length === 0) return;

        // Un seul appel batch au lieu de N appels individuels
        setCheckingEvals(true);
        authFetch(`${API_BASE_URL}/api/team/evaluations-status?type=${encodeURIComponent(evalType)}`)
          .then(res => res.json())
          .then((ids: number[]) => {
            setEvaluatedIds(new Set(ids));
            setCheckingEvals(false);
          })
          .catch(() => setCheckingEvals(false));
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [user, formId]);

  const filtered = members.filter(
    m =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.poste && m.poste.toLowerCase().includes(search.toLowerCase()))
  );

  const evaluatedCount = members.filter(m => evaluatedIds.has(m.id)).length;
  const pendingCount = members.length - evaluatedCount;

  return (
    <>
    <div className="max-w-5xl mx-auto space-y-8 pb-12">

      {/* Header banner */}
      <div className="bg-gradient-to-r from-primary-500 to-accent-500 rounded-3xl p-8 text-white relative overflow-hidden shadow-lg">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-6 w-6 text-white/80" />
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">{formTitle}</h1>
          </div>
          <p className="text-white/80 font-medium">Sélectionnez un membre de votre équipe pour commencer ou modifier l'évaluation.</p>
          {!loading && (
            <div className="flex items-center gap-4 mt-4 text-sm font-bold">
              <span className="bg-white/20 px-3 py-1 rounded-full flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> {evaluatedCount} évalué(s)
              </span>
              <span className="bg-white/10 px-3 py-1 rounded-full flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {pendingCount} restant(s)
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-400" /> Mon Équipe
          </h2>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Rechercher un membre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none w-full sm:w-64 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-slate-500 text-sm font-medium">Chargement de l'équipe...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center p-8 text-slate-500">Aucun membre trouvé dans votre équipe.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((emp) => {
              const isEvaluated = evaluatedIds.has(emp.id);
              return (
                <div
                  key={emp.id}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all group ${
                    isEvaluated
                      ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50'
                      : 'border-slate-100 hover:border-primary-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-md ${
                      isEvaluated
                        ? 'bg-gradient-to-br from-emerald-400 to-emerald-600'
                        : 'bg-gradient-to-br from-slate-400 to-slate-500'
                    }`}>
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{emp.name}</p>
                      <p className="text-xs text-slate-500 font-medium">{emp.poste || emp.role}</p>
                      {emp.categorie && (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{displayCategorie(emp.categorie)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {isEvaluated ? (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Déjà évalué
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-orange-100 text-orange-600 border border-orange-200 rounded-full text-xs font-bold flex items-center gap-1">
                        <Clock className="h-3 w-3" /> À évaluer
                      </span>
                    )}

                    {user?.modules?.feedback && (
                      <>
                        <button
                          title="Demander un feedback 360°"
                          onClick={() => setFeedback360Target({ id: emp.id, name: emp.name, poste: emp.poste })}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all">
                          <Star className="h-3.5 w-3.5" /> 360°
                        </button>

                        <button
                          title="Voir les feedbacks reçus"
                          onClick={() => setFeedback360Summary({ id: emp.id, name: emp.name, poste: emp.poste })}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100 transition-all">
                          <MessageSquare className="h-3.5 w-3.5" /> Voir 360°
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => navigate(`/dashboard/evaluations/${formPath}/form/${emp.id}`)}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl shadow hover:shadow-lg transition-all ${
                        isEvaluated
                          ? 'bg-white border border-primary-200 text-primary-600 hover:bg-primary-50'
                          : 'bg-primary text-white hover:bg-primary-600'
                      }`}
                    >
                      {isEvaluated ? (
                        <><RefreshCw className="h-4 w-4" /> Modifier</>
                      ) : (
                        <>Évaluer <ChevronRight className="h-4 w-4" /></>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {checkingEvals && (
          <div className="flex items-center gap-2 mt-4 text-xs text-slate-400">
            <div className="animate-spin rounded-full h-3 w-3 border-b border-slate-400"></div>
            Vérification des statuts d'évaluation…
          </div>
        )}
      </div>
    </div>

    {feedback360Target && (
      <Feedback360Modal
        target={feedback360Target}
        onClose={() => setFeedback360Target(null)}
      />
    )}

    {feedback360Summary && (
      <Feedback360SummaryModal
        target={feedback360Summary}
        onClose={() => setFeedback360Summary(null)}
      />
    )}
    </>
  );
};
