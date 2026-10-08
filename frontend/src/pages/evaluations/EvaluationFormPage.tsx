import React, { useState, useEffect } from 'react';
import { ChevronLeft, Save, Loader2, CheckCircle, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formExecutions, formCadres } from '../../constants/evaluationForms';

type Ratings = Record<string, number>;

interface EvaluationFormPageProps {
  formId: string;
}

export const EvaluationFormPage: React.FC<EvaluationFormPageProps> = ({ formId }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // We can pass target info from the URL if coming from the Team Page
  const urlTargetName = searchParams.get('name') || '';
  const urlTargetRole = searchParams.get('role') || '';
  
  const [targetName, setTargetName] = useState(urlTargetName);
  const [targetRole, setTargetRole] = useState(urlTargetRole);

  const formSchema = formId === 'form_executions' ? formExecutions : formCadres;

  const [ratings, setRatings] = useState<Ratings>({});
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [trainingNeeds, setTrainingNeeds] = useState('');
  const [recommendation, setRecommendation] = useState('');

  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Reset state if schema changes
  useEffect(() => {
    setRatings({});
  }, [formSchema.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSubmitted(true);
    }, 1500);
  };

  const totalItems = formSchema.categories.reduce((acc, cat) => acc + cat.items.length, 0);
  const isFormComplete = Object.keys(ratings).length === totalItems && targetName.trim() !== '';

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center gap-6 animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle className="h-12 w-12 text-emerald-500" />
        </div>
        <h2 className="text-3xl font-black text-slate-800">Évaluation Soumise !</h2>
        <p className="text-slate-500 font-medium">L'évaluation a été enregistrée avec succès et transmise pour validation.</p>
        <button onClick={() => { setSubmitted(false); navigate(-1); }} className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-600 transition-all shadow-lg shadow-primary-500/30 mt-4">
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">{formSchema.title}</h1>
          <p className="text-slate-500 font-medium mt-1">Remplissez le formulaire selon la grille d'évaluation.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Partie I: Renseignement de l'évalué */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-3">PARTIE I : RENSEIGNEMENT DE L'ÉVALUÉ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Nom et Prénom de l'évalué</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
                <input 
                  type="text" 
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  placeholder="Rechercher un employé..." 
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Fonction / Rôle</label>
              <input 
                type="text" 
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="Ex: Développeur Front-end"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Direction / Structure</label>
              <input type="text" defaultValue="Engineering" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Date de l'évaluation</label>
              <input type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none font-medium" />
            </div>
          </div>
        </div>

        {/* Partie II: Tableau d'Évaluation */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">PARTIE II : ÉVALUATION DU NIVEAU DE COMPÉTENCE</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/50">
                  <th className="p-4 border-b border-slate-200 font-bold text-slate-700 text-sm w-1/2">Critères d'évaluation</th>
                  {formSchema.maxScorePerItem === 20 ? (
                    <>
                      <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-xs text-red-600 bg-red-50/50">Insatisfaisant<br/>(0 à 10)</th>
                      <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-xs text-amber-600 bg-amber-50/50">Satisfaisant<br/>(11 à 15)</th>
                      <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-xs text-emerald-600 bg-emerald-50/50">Supérieur aux attentes<br/>(16 à 20)</th>
                    </>
                  ) : (
                    <>
                      <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-xs text-slate-600">Insuffisant (1)</th>
                      <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-xs text-slate-600">Moyen (2)</th>
                      <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-xs text-slate-600">Bon (3)</th>
                      <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-xs text-slate-600">Très Bon (4)</th>
                      <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-xs text-slate-600">Excellent (5)</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {formSchema.categories.map((cat, catIdx) => (
                  <React.Fragment key={catIdx}>
                    <tr>
                      <td colSpan={6} className="bg-slate-800 text-white font-bold p-3 text-sm">
                        {cat.title}
                      </td>
                    </tr>
                    {cat.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                        <td className="p-4 text-sm font-semibold text-slate-700">{item.label}</td>
                        
                        {formSchema.maxScorePerItem === 20 ? (
                          <>
                            <td className="p-2 border-l border-slate-100 text-center align-middle">
                              <input type="radio" name={item.id} className="w-5 h-5 accent-red-500 cursor-pointer" onChange={() => setRatings(prev => ({...prev, [item.id]: 5}))} checked={ratings[item.id] === 5} />
                            </td>
                            <td className="p-2 border-l border-slate-100 text-center align-middle">
                              <input type="radio" name={item.id} className="w-5 h-5 accent-amber-500 cursor-pointer" onChange={() => setRatings(prev => ({...prev, [item.id]: 13}))} checked={ratings[item.id] === 13} />
                            </td>
                            <td className="p-2 border-l border-slate-100 text-center align-middle">
                              <input type="radio" name={item.id} className="w-5 h-5 accent-emerald-500 cursor-pointer" onChange={() => setRatings(prev => ({...prev, [item.id]: 18}))} checked={ratings[item.id] === 18} />
                            </td>
                          </>
                        ) : (
                          [1, 2, 3, 4, 5].map(score => (
                            <td key={score} className="p-2 border-l border-slate-100 text-center align-middle">
                              <input type="radio" name={item.id} className="w-5 h-5 accent-primary-600 cursor-pointer" onChange={() => setRatings(prev => ({...prev, [item.id]: score}))} checked={ratings[item.id] === score} />
                            </td>
                          ))
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Partie III & IV : Résultats et Décision */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-8">
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">PARTIE III : RÉSULTATS DE L'ÉVALUATION</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Points forts</label>
                <textarea value={strengths} onChange={e => setStrengths(e.target.value)} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none resize-none" placeholder="Lister les points forts..."></textarea>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Points faibles</label>
                <textarea value={weaknesses} onChange={e => setWeaknesses(e.target.value)} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none resize-none" placeholder="Lister les points faibles..."></textarea>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">PARTIE IV : PRISE DE DÉCISION</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Appréciation et recommandation de l'évaluateur</label>
                <textarea value={recommendation} onChange={e => setRecommendation(e.target.value)} rows={2} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none resize-none"></textarea>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Besoins en formation</label>
                <textarea value={trainingNeeds} onChange={e => setTrainingNeeds(e.target.value)} rows={2} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none resize-none"></textarea>
              </div>
            </div>
          </div>
        </div>

        {/* Submit action */}
        <div className="sticky bottom-4 z-10 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl flex items-center justify-between">
          <p className="text-sm font-medium text-slate-500">
            {isFormComplete ? <span className="text-emerald-600 font-bold">✓ Formulaire complet</span> : `Veuillez remplir les ${totalItems} critères et le nom de l'évalué`}
          </p>
          <button
            type="submit"
            disabled={!isFormComplete || saving}
            className="px-8 py-3 bg-primary hover:bg-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-500/30 transition-all flex items-center gap-2 disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Soumettre l'évaluation
          </button>
        </div>
      </form>
    </div>
  );
};
