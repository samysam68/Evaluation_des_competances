import { API_BASE_URL, authFetch } from '../../services/api';
import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, Save, Loader2, CheckCircle, User, FileText,
  CheckSquare, Plus, TrendingUp, AlertTriangle, RefreshCw, Clock, Printer, Award, Shield,
  Smile, Meh, Frown, Lock,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useReactToPrint } from 'react-to-print';
import { EvalPrintLayout } from '../../components/EvalPrintLayout';
import { EvalCriterionRow } from '../../components/EvalCriterionRow';
import { PerformanceTable, ObjectifRow, computePerformanceScore, incompleteObjectiveRows } from '../../components/PerformanceTable';
import { SelectOrOther } from '../../components/SelectOrOther';
import {
  CADRES_SECTIONS,
  CADRES_HSE_ITEMS,
  RatingsMap,
  CriterionRating,
  CriterionItem,
  getScoreLabel,
  EVAL_LEVELS,
  TrainingType,
  LDM_GROUPE_ORGANISME,
  DEFAULT_TRAINING_DAILY_RATE,
  formatTrainingBudget,
  TRAINING_CATALOG_OPTIONS,
  ORGANISMES_FORMATION,
  MODALITE_FORMATION_OPTIONS,
  PLAN_DEVELOPPEMENT_OPTIONS,
  getTrimesterOptions,
} from '../../constants/evaluationForms';

// ─── Types ────────────────────────────────────────────────────────────────────

type SpecificTask = {
  id: number;
  task: string;
  status: 'Non acquise' | 'En cours' | 'Acquise' | '';
  plan: string;
};

const STATUS_NOTE: Record<string, number> = {
  'Non acquise': 5,
  'En cours':    12,
  'Acquise':     20,
};

const emptyRating = (): CriterionRating => ({ level: null, note: null, justification: '' });

const avgNote = (map: RatingsMap, ids: string[]): number => {
  const rated = ids.filter(id => map[id]?.note !== null && map[id]?.note !== undefined);
  if (rated.length === 0) return 0;
  return rated.reduce((s, id) => s + (map[id].note ?? 0), 0) / rated.length;
};

const countRated = (map: RatingsMap, ids: string[]): number =>
  ids.filter(id => map[id]?.note !== null && map[id]?.note !== undefined).length;

// Un critère noté < 11/20 est automatiquement un point à améliorer, même si la
// moyenne globale de sa section reste satisfaisante — l'action de formation
// associée devient alors obligatoire (règle métier explicite).
const isPointAAmeliorer = (rating: CriterionRating | undefined): boolean =>
  rating?.note != null && rating.note < 11;

const taskAvgNote = (tasks: SpecificTask[]): number => {
  const filled = tasks.filter(t => t.task.trim() && t.status);
  if (filled.length === 0) return 0;
  return filled.reduce((s, t) => s + (STATUS_NOTE[t.status] ?? 0), 0) / filled.length;
};

const fmtDate = (d?: string | null): string => {
  if (!d) return '—';
  const parts = d.slice(0, 10).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
};

// ─── Component ───────────────────────────────────────────────────────────────

export const FicheCadresMaitrises: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const { user: evaluator } = useAuthStore();

  const [targetUser, setTargetUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Parcours par étapes : la fiche reste un seul <form> (tout l'état/la validation
  // existants sont inchangés) — chaque table d'évaluation est sa propre étape (slide),
  // via une classe `hidden` sur son conteneur. Le bouton de soumission n'est actif
  // qu'à la toute dernière étape (Synthèse). Défini plus bas (après `hasSectionC`,
  // dont dépend la liste des étapes) — voir `STEPS`/`stepIdx`.
  const [currentStep, setCurrentStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const goToStep = (step: number) => { if (step <= maxStepReached) setCurrentStep(step); };
  const advanceStep = () => setCurrentStep(s => { const next = s + 1; setMaxStepReached(m => Math.max(m, next)); return next; });
  const [draftSaved, setDraftSaved] = useState<Date | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [evalStatus, setEvalStatus] = useState<string>('');
  // Fixée à la date de la première soumission — ne doit pas changer quand
  // l'évaluateur revient modifier la fiche avant la validation RH.
  const [evalDate, setEvalDate] = useState<string>('');
  const [validatorName, setValidatorName] = useState<string | null>(null);
  const [validatorPoste, setValidatorPoste] = useState<string | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [employeeFeedback, setEmployeeFeedback] = useState<string | null>(null);
  const [employeeFeedbackAt, setEmployeeFeedbackAt] = useState<string | null>(null);
  const [rhComment, setRhComment] = useState<string | null>(null);
  const [rhDecision, setRhDecision] = useState<string[] | null>(null);
  const [evaluatorSignedAt] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  });

  // Whether section C applies (encadrement)
  const [hasSectionC, setHasSectionC] = useState(true);

  // Chaque table d'évaluation est sa propre étape. L'étape « Compétences C » existe
  // toujours (c'est elle qui porte la case à cocher « applicable / non applicable » —
  // voir plus bas) ; seul son contenu (table de critères vs. message) dépend de hasSectionC.
  const STEPS = [
    'Renseignements',
    'Compétences A',
    'Compétences B',
    'Compétences C',
    'Compétences D',
    'Compétences E',
    'Performance',
    'Formations',
    'Synthèse',
  ];
  const stepIdx = (label: string) => STEPS.indexOf(label);
  const isLastStep = currentStep === STEPS.length - 1;

  // Profil
  const [profilDiplome, setProfilDiplome] = useState('');
  const [profil, setProfil]   = useState('');
  const [profilFormations, setProfilFormations] = useState('');

  // Ratings for sections A, B, C, E (HSE)
  const initRatings = (): RatingsMap => {
    const m: RatingsMap = {};
    [...CADRES_SECTIONS.flatMap(s => s.items), ...CADRES_HSE_ITEMS].forEach(i => {
      m[i.id] = emptyRating();
    });
    return m;
  };
  const [ratings, setRatings] = useState<RatingsMap>(initRatings);

  // Section D — compétences spécifiques
  const [tableDTasks, setTableDTasks] = useState<SpecificTask[]>([
    { id: 1, task: '', status: '', plan: '' },
    { id: 2, task: '', status: '', plan: '' },
    { id: 3, task: '', status: '', plan: '' },
  ]);

  // Partie III — KPI Performance
  const [objectives, setObjectives] = useState<ObjectifRow[]>([
    { id: 1, objectif: '', kpi: '', cible: '', resultat: '', poids: 20 },
    { id: 2, objectif: '', kpi: '', cible: '', resultat: '', poids: 20 },
    { id: 3, objectif: '', kpi: '', cible: '', resultat: '', poids: 20 },
    { id: 4, objectif: '', kpi: '', cible: '', resultat: '', poids: 20 },
    { id: 5, objectif: '', kpi: '', cible: '', resultat: '', poids: 20 },
  ]);

  // Partie V — Plan de développement
  const [trainingNeeds, setTrainingNeeds] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [planDev, setPlanDev] = useState<{ id: number; point: string; action: string; responsable: string; echeance: string; statut: string; sourceTaskId?: number }[]>([
    { id: 1, point: '', action: '', responsable: '', echeance: '', statut: 'Non démarré' },
  ]);

  // Le plan de développement individuel reprend automatiquement chaque tâche de la
  // section D (Compétences spécifiques au poste) dont un plan de développement a été
  // saisi — le contenu (Point/Action) vient directement de la fiche de poste, seuls
  // Responsable/Échéance/Statut restent à détailler ici.
  useEffect(() => {
    setPlanDev(prev => {
      const sourceRows = tableDTasks.filter(t => t.plan.trim());
      const sourceIds = new Set(sourceRows.map(t => t.id));
      let next = prev.filter(r => !r.sourceTaskId || sourceIds.has(r.sourceTaskId));
      sourceRows.forEach(t => {
        const idx = next.findIndex(r => r.sourceTaskId === t.id);
        const point = t.task.trim() || 'Tâche sans intitulé';
        if (idx === -1) {
          next = [...next, { id: Date.now() + t.id, sourceTaskId: t.id, point, action: t.plan, responsable: '', echeance: '', statut: 'Non démarré' }];
        } else if (next[idx].point !== point || next[idx].action !== t.plan) {
          next = next.map((r, i) => i === idx ? { ...r, point, action: t.plan } : r);
        }
      });
      return next;
    });
  }, [tableDTasks]);
  const [trainings, setTrainings] = useState<{ id: number; intitule: string; typeFormation: TrainingType; organisme: string; modalite: string; joursPrevisionnels: string; budget: string; periode: string; priorite: string }[]>([
    { id: 1, intitule: '', typeFormation: 'externe', organisme: '', modalite: '', joursPrevisionnels: '', budget: '', periode: '', priorite: '2' },
  ]);

  // Toute formation choisie comme « Action de formation » sur un critère noté
  // <11/20 (Insatisfaisant / À améliorer) doit apparaître automatiquement dans le
  // Plan de développement (Formation proposée), comme si elle y avait été ajoutée
  // manuellement — sans dupliquer une formation déjà présente.
  useEffect(() => {
    const neededTrainings = new Set<string>();
    [...CADRES_SECTIONS.flatMap(s => s.items).filter(i => !i.isCustomCriterion), ...CADRES_HSE_ITEMS].forEach(item => {
      const r = ratings[item.id];
      if (isPointAAmeliorer(r) && r?.justification?.trim()) neededTrainings.add(r.justification.trim());
    });
    if (neededTrainings.size === 0) return;
    setTrainings(prev => {
      const existingNames = new Set(prev.map(t => t.intitule.trim()).filter(Boolean));
      const toAdd = Array.from(neededTrainings).filter(name => !existingNames.has(name));
      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd.map((name, i) => ({
        id: Date.now() + i, intitule: name, typeFormation: 'externe' as TrainingType,
        organisme: '', modalite: '', joursPrevisionnels: '', budget: '', periode: '', priorite: '2',
      }))];
    });
  }, [ratings]);

  const trimesterOptions = getTrimesterOptions();
  // Budget formation externe = tarif journalier × nombre de jours prévisionnels
  // (formule officielle RH). Tarif unique, configurable depuis le SuperAdmin.
  const [trainingDailyRate, setTrainingDailyRate] = useState<number>(DEFAULT_TRAINING_DAILY_RATE);

  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/team/training-daily-rate`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (typeof data?.rate === 'number' && data.rate > 0) setTrainingDailyRate(data.rate); })
      .catch(() => { /* garde le tarif par défaut */ });
  }, []);

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });
  const DRAFT_KEY = `draft_cadres_v2_${evaluator?.username || 'unknown'}_${userId}`;

  // ─── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) { setLoadingUser(false); return; }
    const load = async () => {
      try {
        const userRes = await authFetch(`${API_BASE_URL}/api/team/user/${userId}`);
        const userData = await userRes.json();
        setTargetUser(userData);

        const evalRes = await authFetch(`${API_BASE_URL}/api/team/evaluation/${userId}?type=${encodeURIComponent('Cadres & Maîtrises')}`);
        const evalData = await evalRes.json();

        if (evalData.exists) {
          setIsEditing(true);
          restoreState(evalData.otherData ?? {}, evalData.ratings, evalData.tasks);
          if (evalData.trainingNeeds) setTrainingNeeds(evalData.trainingNeeds);
          if (evalData.recommendation) setRecommendation(evalData.recommendation);
          if (evalData.status)       setEvalStatus(evalData.status);
          if (evalData.date)         setEvalDate(evalData.date);
          if (evalData.validatorName)  setValidatorName(evalData.validatorName);
          if (evalData.validatorPoste) setValidatorPoste(evalData.validatorPoste);
          if (evalData.validatedAt)    setValidatedAt(evalData.validatedAt);
          if (evalData.employeeFeedback)   setEmployeeFeedback(evalData.employeeFeedback);
          if (evalData.employeeFeedbackAt) setEmployeeFeedbackAt(evalData.employeeFeedbackAt);
          if (evalData.rhComment)          setRhComment(evalData.rhComment);
          if (evalData.rhDecision)         setRhDecision(evalData.rhDecision);
        } else {
          try {
            const saved = localStorage.getItem(DRAFT_KEY);
            if (saved) {
              const d = JSON.parse(saved);
              restoreState(d, d.ratings, d.tableDTasks);
              if (d.trainingNeeds) setTrainingNeeds(d.trainingNeeds);
              if (d.recommendation) setRecommendation(d.recommendation);
              setDraftRestored(true);
            }
          } catch { /* ignore */ }
        }
      } catch (err) { console.error(err); }
      finally { setLoadingUser(false); }
    };
    load();
  }, [userId]);

  const restoreState = (od: any, savedRatings: any, savedTasks: any) => {
    if (savedRatings && Object.keys(savedRatings).length > 0) {
      setRatings(prev => {
        const merged = { ...prev };
        Object.entries(savedRatings).forEach(([k, v]: any) => {
          if (v && typeof v === 'object' && 'level' in v) merged[k] = v;
          else if (typeof v === 'number') merged[k] = { level: null, note: v, justification: '' };
        });
        return merged;
      });
    }
    if (savedTasks?.length > 0) setTableDTasks(savedTasks);
    if (od?.objectives?.length > 0) setObjectives(od.objectives);
    if (od?.hasSectionC !== undefined) setHasSectionC(od.hasSectionC);
    if (od?.planDev?.length > 0)   setPlanDev(od.planDev);
    if (od?.trainings?.length > 0) setTrainings(od.trainings);
    if (od?.profilDiplome)         setProfilDiplome(od.profilDiplome);
    if (od?.profil)                setProfil(od.profil);
    if (od?.profilFormations)      setProfilFormations(od.profilFormations);
  };

  // Auto-save draft
  useEffect(() => {
    if (!userId || submitted) return;
    const interval = setInterval(() => {
      const draft = { ratings, tableDTasks, objectives, hasSectionC, trainingNeeds, recommendation, planDev, trainings, profilDiplome, profil, profilFormations };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftSaved(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [userId, submitted, ratings, tableDTasks, objectives, hasSectionC, trainingNeeds, recommendation, planDev, trainings, profilDiplome, profil, profilFormations]);

  // ─── Score calculations ──────────────────────────────────────────────────────

  const sectionIds = (key: string) => CADRES_SECTIONS.find(s => s.key === key)?.items.map(i => i.id) ?? [];
  const hseIds = CADRES_HSE_ITEMS.map(i => i.id);

  const avgA = avgNote(ratings, sectionIds('A'));
  const avgB = avgNote(ratings, sectionIds('B'));
  const avgC = avgNote(ratings, sectionIds('C'));
  const avgD = taskAvgNote(tableDTasks);
  const avgE = avgNote(ratings, hseIds);
  const avgPerf = computePerformanceScore(objectives);

  // Campagne 2026 (exercice de transition) : uniquement la fixation des objectifs et
  // cibles — la partie résultats (et donc la note de performance) est désactivée. Le
  // poids normalement dévolu à la performance (20%) est reporté sur les autres
  // sections au prorata de leur pondération, pour rester sur une échelle /20 pleine.
  const isCampaign2026 = new Date().getFullYear() === 2026;

  const noteFinaleCadres = isCampaign2026
    ? (hasSectionC
        ? (avgA * 0.25 + avgB * 0.15 + avgC * 0.20 + avgD * 0.10 + avgE * 0.10) / 0.80
        : (avgA * 0.35 + avgB * 0.20 + avgD * 0.15 + avgE * 0.10) / 0.80)
    : (hasSectionC
        ? avgA * 0.25 + avgB * 0.15 + avgC * 0.20 + avgD * 0.10 + avgE * 0.10 + avgPerf * 0.20
        : avgA * 0.35 + avgB * 0.20 + avgD * 0.15 + avgE * 0.10 + avgPerf * 0.20);

  // Appréciation globale calculée automatiquement à partir de la note finale —
  // n'est plus saisie manuellement par l'évaluateur.
  useEffect(() => {
    if (noteFinaleCadres > 0) setRecommendation(getScoreLabel(noteFinaleCadres).label);
  }, [noteFinaleCadres]);

  const applicableCadresSections = CADRES_SECTIONS.filter(s => s.key !== 'C' || hasSectionC);
  const totalCriteria = applicableCadresSections.flatMap(s => s.items).length + hseIds.length;
  const ratedCriteria = countRated(ratings, [...applicableCadresSections.flatMap(s => s.items).map(i => i.id), ...hseIds]);
  const missingJustifications = [...CADRES_SECTIONS.flatMap(s => s.items), ...CADRES_HSE_ITEMS]
    .filter(item => (item.justificationRequired || isPointAAmeliorer(ratings[item.id])) && ratings[item.id]?.level && !ratings[item.id]?.justification.trim());

  // Partagé entre le tableau de synthèse affiché à l'écran et l'export PDF, pour
  // garantir des chiffres strictement identiques entre les deux. En 2026, les poids
  // A-E sont renormalisés sur 100% (division par 0.80) puisque la performance (20%)
  // ne contribue pas à la note cette année.
  const rescale2026 = (pct: number) => isCampaign2026 ? Math.round(pct / 0.80) : pct;
  const synthesisRows = [
    { label: 'A. Compétences professionnelles et techniques', pct: rescale2026(25),          avg: avgA },
    { label: 'B. Compétences relationnelles',                  pct: rescale2026(15),          avg: avgB },
    ...(hasSectionC ? [{ label: 'C. Compétences managériales et d\'expertise', pct: rescale2026(20), avg: avgC }] : []),
    { label: 'D. Compétences spécifiques au poste',            pct: rescale2026(10),          avg: avgD },
    { label: 'E. Compétences Qualité / SST / Réglementaire',  pct: rescale2026(10),          avg: avgE },
    ...(isCampaign2026 ? [] : [{ label: 'Évaluation de la performance (KPI)', pct: 20, avg: avgPerf }]),
  ];

  const setRating = (id: string, val: CriterionRating) => setRatings(prev => ({ ...prev, [id]: val }));

  const isLocked = evalStatus === 'Validée';

  // Champs nécessaires par étape, pour bloquer le bouton « Suivant » tant que
  // la table de l'étape courante n'est pas complète.
  const checkCriteriaStep = (items: CriterionItem[]): string | null => {
    const ids = items.map(i => i.id);
    const rated = countRated(ratings, ids);
    if (rated < ids.length) return `Il manque ${ids.length - rated} critère(s) non noté(s) dans cette partie.`;
    const missing = items.filter(item => (item.justificationRequired || isPointAAmeliorer(ratings[item.id])) && ratings[item.id]?.level && !ratings[item.id]?.justification.trim());
    if (missing.length > 0) return `Action de formation obligatoire (note < 11/20) pour : ${missing.map(i => i.label).join(', ')}.`;
    return null;
  };

  const stepBlockedReason = (step: number): string | null => {
    const label = STEPS[step];
    if (label === 'Renseignements') {
      if (!profilDiplome.trim()) return 'Le champ Niveau d\'instruction / Diplôme de base est obligatoire.';
      if (!profil.trim()) return 'Le champ Profil est obligatoire.';
      return null;
    }
    if (label === 'Compétences A') return checkCriteriaStep(CADRES_SECTIONS.find(s => s.key === 'A')!.items);
    if (label === 'Compétences B') return checkCriteriaStep(CADRES_SECTIONS.find(s => s.key === 'B')!.items);
    if (label === 'Compétences C') return hasSectionC ? checkCriteriaStep(CADRES_SECTIONS.find(s => s.key === 'C')!.items) : null;
    if (label === 'Compétences E') return checkCriteriaStep(CADRES_HSE_ITEMS);
    if (label === 'Performance') return incompleteObjectiveRows(objectives).length > 0
      ? 'Chaque objectif doit avoir un KPI, et chaque KPI doit être rattaché à un objectif.' : null;
    return null;
  };

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    if (!profilDiplome.trim()) {
      setSaveError('Le champ Niveau d\'instruction / Diplôme de base (Partie I) est obligatoire.');
      return;
    }
    if (!profil.trim()) {
      setSaveError('Le champ Profil (Partie I) est obligatoire.');
      return;
    }
    if (ratedCriteria < totalCriteria) {
      setSaveError(`Veuillez remplir toutes les notes avant de soumettre. Il manque encore ${totalCriteria - ratedCriteria} critère(s) non noté(s).`);
      return;
    }
    if (missingJustifications.length > 0) {
      setSaveError(`Action de formation obligatoire (note < 11/20) pour : ${missingJustifications.map(i => i.label).join(', ')}.`);
      return;
    }
    if (incompleteObjectiveRows(objectives).length > 0) {
      setSaveError('Chaque objectif doit avoir un KPI, et chaque KPI doit être rattaché à un objectif.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (evaluator && targetUser) {
        const res = await authFetch(`${API_BASE_URL}/api/team/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId: targetUser.id,
            evaluatorUsername: evaluator.username,
            type: 'Cadres & Maîtrises',
            ratings,
            tasks: tableDTasks,
            trainingNeeds,
            recommendation,
            otherData: {
              hasSectionC,
              objectives,
              planDev,
              trainings,
              profilDiplome, profil, profilFormations,
              avgA, avgB, avgC, avgD, avgE, avgPerf,
              noteFinaleCadres,
            },
            globalScore: noteFinaleCadres,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Erreur serveur');
        }
      }
      setSaving(false);
      setSubmitted(true);
      localStorage.removeItem(DRAFT_KEY);
    } catch (error: any) {
      setSaveError(error.message || 'Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  // ─── Submitted screen ────────────────────────────────────────────────────────

  if (submitted) {
    const lbl = getScoreLabel(noteFinaleCadres);
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center gap-6 animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center shadow-inner">
          <CheckCircle className="h-12 w-12 text-emerald-500" />
        </div>
        <h2 className="text-3xl font-black text-slate-800">Évaluation Soumise !</h2>
        <p className="text-slate-500 font-medium">L'évaluation de <strong>{targetUser?.fullName}</strong> a été enregistrée avec succès.</p>
        <div className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-left space-y-3">
          <h3 className="font-bold text-slate-700 flex items-center gap-2"><Award className="h-5 w-5 text-primary-500" /> Synthèse des notes</h3>
          {[
            { label: `A. Prof. & Techniques (${rescale2026(25)}%)`,      avg: avgA,    pct: rescale2026(25) },
            { label: `B. Relationnelles (${rescale2026(15)}%)`,           avg: avgB,    pct: rescale2026(15) },
            ...(hasSectionC ? [{ label: `C. Managériales (${rescale2026(20)}%)`, avg: avgC, pct: rescale2026(20) }] : []),
            { label: `D. Spécifiques au poste (${rescale2026(10)}%)`,    avg: avgD,    pct: rescale2026(10) },
            { label: `E. Qualité/SST (${rescale2026(10)}%)`,              avg: avgE,    pct: rescale2026(10) },
            ...(isCampaign2026 ? [] : [{ label: 'Performance / KPI (20%)', avg: avgPerf, pct: 20 }]),
          ].map(row => {
            const sl = getScoreLabel(row.avg);
            return (
              <div key={row.label} className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-sm font-medium text-slate-600 flex-1">{row.label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(row.avg / 20) * 100}%` }} />
                  </div>
                  <span className={`text-sm font-black w-14 text-right ${sl.color}`}>{row.avg.toFixed(1)}/20</span>
                </div>
              </div>
            );
          })}
          <div className="pt-2 flex items-center justify-between">
            <span className="font-bold text-slate-800">NOTE FINALE</span>
            <span className={`text-xl font-black ${lbl.color}`}>{lbl.emoji} {noteFinaleCadres.toFixed(2)}/20 — {lbl.label}</span>
          </div>
        </div>
        <button onClick={() => navigate(-1)} className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-600 transition-all shadow-lg shadow-primary-500/30">
          Retour au tableau de bord
        </button>
      </div>
    );
  }

  if (loadingUser) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>;
  }

  // ─── Section renderer (A, B, C, E) ────────────────────────────────────────

  const renderSection = (
    key: string,
    title: string,
    items: CriterionItem[],
    avg: number,
    showJustification = true,
    visible = true,
  ) => {
    const rated = countRated(ratings, items.map(i => i.id));
    const sl = rated > 0 ? getScoreLabel(avg) : null;
    return (
      <div className={visible ? "border-b border-slate-200 last:border-0" : "hidden"}>
        <div className="bg-slate-800 text-white p-4 flex items-center justify-between">
          <h3 className="font-bold text-sm tracking-wide">{title}</h3>
          {sl && (
            <span className="text-xs font-bold bg-white/10 px-3 py-1 rounded-full">
              Moy. {avg.toFixed(1)}/20 — {sl.emoji} {sl.label}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-3 border-b border-slate-200 font-bold text-slate-700 text-xs w-[16%]">Critère</th>
                <th className="p-3 border-b border-l border-slate-200 font-bold text-slate-700 text-xs w-[22%]">Définition / Comportements observables</th>
                {EVAL_LEVELS.map(lvl => (
                  <th key={lvl.key} className={`p-3 border-b border-l border-slate-200 font-bold text-center text-xs ${lvl.textColor} w-[10%]`}>
                    {lvl.label}<br /><span className="font-normal opacity-70">({lvl.min}–{lvl.max})</span>
                  </th>
                ))}
                <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-xs text-slate-500 w-[6%]">Note</th>
                {showJustification && (
                  <th className="p-3 border-b border-l border-slate-200 font-bold text-xs text-slate-500 w-[16%]">Action de formation – Plan de développement individuel</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <EvalCriterionRow
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  description={item.description}
                  levelDescriptions={item.levelDescriptions}
                  value={ratings[item.id] ?? emptyRating()}
                  onChange={val => setRating(item.id, val)}
                  showJustification={showJustification}
                  justificationRequired={item.justificationRequired || isPointAAmeliorer(ratings[item.id])}
                  isCustomCriterion={item.isCustomCriterion}
                />
              ))}
            </tbody>
            {rated > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td colSpan={6} className="p-3 text-sm font-bold text-slate-700 text-right pr-4">
                    Moyenne {key} ({rated}/{items.length}) :
                  </td>
                  <td className={`p-3 text-center text-sm font-black ${getScoreLabel(avg).color}`}>
                    {avg.toFixed(1)}/20
                  </td>
                  {showJustification && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  };

  // ─── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={() => navigate(-1)} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600 shadow-sm">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Fiche d'évaluation – Cadres &amp; Maîtrises</h1>
          <p className="text-slate-500 font-medium mt-1">Formulaire complet v1.0 — Compétences &amp; Performance</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {isLocked ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
              <Lock className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-bold">Évaluation validée — verrouillée</span>
            </div>
          ) : isEditing && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
              <RefreshCw className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-bold">Données précédentes chargées</span>
            </div>
          )}
          <button type="button" onClick={() => handlePrint()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-colors shadow-sm">
            <Printer className="h-4 w-4" /> Exporter PDF
          </button>
          {draftRestored && !isEditing && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs font-bold">Brouillon restauré</span>
            </div>
          )}
          {draftSaved && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">Brouillon {draftSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Barre de progression / parcours par étapes ─────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <button type="button" onClick={() => goToStep(i)} disabled={i > maxStepReached}
                title={i > maxStepReached ? 'Complétez d\'abord les étapes précédentes' : undefined}
                className={`flex flex-col items-center gap-1.5 group flex-shrink-0 w-16 ${i > maxStepReached ? 'cursor-not-allowed' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                  i === currentStep ? 'bg-primary-600 text-white shadow-sm' :
                  i < currentStep ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' :
                  i > maxStepReached ? 'bg-slate-50 text-slate-300 border border-slate-200' :
                  'bg-slate-100 text-slate-400 border border-slate-200 group-hover:bg-slate-200'
                }`}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <span className={`text-[11px] font-bold text-center leading-tight ${i === currentStep ? 'text-primary-600' : 'text-slate-400'}`}>{label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-6 flex-shrink-0 h-0.5 mb-5 rounded-full ${i < currentStep ? 'bg-emerald-300' : 'bg-slate-100'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
        {noteFinaleCadres > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Note provisoire (calculée en continu) :</span>
            <span className={`text-sm font-black ${getScoreLabel(noteFinaleCadres).color}`}>{noteFinaleCadres.toFixed(2)}/20</span>
          </div>
        )}
        {!isLastStep && stepBlockedReason(currentStep) && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-orange-600">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs font-semibold">{stepBlockedReason(currentStep)}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
      <fieldset disabled={isLocked} className="contents">

        {/* ── PARTIE I : RENSEIGNEMENTS GÉNÉRAUX ─────────────────────────────── */}
        <div className={currentStep === stepIdx('Renseignements') ? "bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" : "hidden"}>
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
            <User className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-bold text-slate-800">PARTIE I — RENSEIGNEMENTS GÉNÉRAUX</h2>
          </div>
          <table className="w-full text-left border-collapse text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <th className="p-4 bg-slate-50/50 w-1/4 font-semibold text-slate-600 border-r border-slate-100">Direction / Structure / Entité</th>
                <td colSpan={3} className="p-4 font-medium text-slate-800">{targetUser?.departement || targetUser?.direction || '—'} — LDM Groupe</td>
              </tr>
              <tr className="border-b border-slate-100">
                <th className="p-4 bg-slate-50/50 font-semibold text-slate-600 border-r border-slate-100">Nom et Prénom de l'évalué</th>
                <td className="p-4 font-bold text-primary-700 bg-primary-50/30">{targetUser?.fullName || '—'}</td>
                <th className="p-4 bg-slate-50/50 font-semibold text-slate-600 border-r border-l border-slate-100">Date de recrutement</th>
                <td className="p-4 font-medium text-slate-800">
                  {fmtDate(targetUser?.dateRecrutement)}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <th className="p-4 bg-slate-50/50 font-semibold text-slate-600 border-r border-slate-100">Fonction</th>
                <td className="p-4 font-medium text-slate-800">{targetUser?.poste || targetUser?.role || '—'}</td>
                <th className="p-4 bg-slate-50/50 font-semibold text-slate-600 border-r border-l border-slate-100">Catégorie Socioprofessionnelle</th>
                <td className="p-4 font-medium text-slate-800">{targetUser?.categorie || '—'}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <th className="p-4 bg-slate-50/50 font-semibold text-slate-600 border-r border-slate-100">Évaluateur</th>
                <td className="p-4 font-medium text-slate-800">{evaluator?.fullName || '—'}</td>
                <th className="p-4 bg-slate-50/50 font-semibold text-slate-600 border-r border-l border-slate-100">Fonction évaluateur</th>
                <td className="p-4 font-medium text-slate-800">{evaluator?.role || '—'}</td>
              </tr>
              <tr>
                <th className="p-4 bg-slate-50/50 font-semibold text-slate-600 border-r border-slate-100">Date de l'évaluation</th>
                <td colSpan={3} className="p-4 font-medium text-slate-800">{evalDate ? fmtDate(evalDate) : new Date().toLocaleDateString('fr-FR')}</td>
              </tr>
            </tbody>
          </table>

          {/* Profil — acquis et savoir */}
          <div className="p-6 border-t border-slate-200 space-y-3 bg-slate-50/30">
            <h3 className="text-sm font-bold text-slate-700">Profil – acquis et savoir :</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Niveau d'instruction / Diplôme de base <span className="text-red-500">*</span></label>
                <input type="text" required className={`w-full p-2.5 bg-white border rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm ${!profilDiplome.trim() ? 'border-red-300' : 'border-slate-200'}`} value={profilDiplome} onChange={e => setProfilDiplome(e.target.value)} placeholder="Ex: Bac + 5, Ingénieur..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Profil <span className="text-red-500">*</span></label>
                <input type="text" required className={`w-full p-2.5 bg-white border rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm ${!profil.trim() ? 'border-red-300' : 'border-slate-200'}`} value={profil} onChange={e => setProfil(e.target.value)} placeholder="Profil du poste / du titulaire..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Formations supplémentaires</label>
                <input type="text" className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-sm" value={profilFormations} onChange={e => setProfilFormations(e.target.value)} placeholder="Certifications, formations..." />
              </div>
            </div>
          </div>
        </div>

        {/* ── PARTIE II : ÉVALUATION DES COMPÉTENCES (une table = une étape) ── */}
        <div className={currentStep >= stepIdx('Compétences A') && currentStep <= stepIdx('Compétences E') ? "bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" : "hidden"}>
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <CheckSquare className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-bold text-slate-800">PARTIE II — ÉVALUATION DES COMPÉTENCES</h2>
            </div>
            <span className="text-xs text-slate-500 font-medium">Barème : Insatisfaisant (0–5) · À améliorer (6–10) · Satisfaisant (11–15) · Supérieur (16–20)</span>
          </div>

          {/* Sections A, B — une table par étape */}
          {CADRES_SECTIONS.filter(s => s.key !== 'C').map(section => {
            const avg = section.key === 'A' ? avgA : avgB;
            return <React.Fragment key={section.key}>{renderSection(section.key, `${section.title} (${section.ponderation}%)`, section.items, avg, true, currentStep === stepIdx(`Compétences ${section.key}`))}</React.Fragment>;
          })}

          {/* Section C — la case à cocher applicable/non applicable vit dans la section elle-même */}
          <div className={currentStep === stepIdx('Compétences C') ? "" : "hidden"}>
            <div className="p-4 bg-slate-50 border-y border-slate-200 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-bold text-slate-700">C. Compétences managériales et d'expertise (encadrement)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Cochez uniquement si le poste comporte une fonction d'encadrement / de management d'équipe.</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none flex-shrink-0">
                <input type="checkbox" checked={hasSectionC} onChange={e => setHasSectionC(e.target.checked)}
                  className="w-4 h-4 accent-primary-600 cursor-pointer" />
                <span className="text-xs font-bold text-slate-600">Évaluer cette section</span>
              </label>
            </div>
            {hasSectionC ? (
              renderSection('C', `${CADRES_SECTIONS.find(s => s.key === 'C')!.title} (${CADRES_SECTIONS.find(s => s.key === 'C')!.ponderation}%)`, CADRES_SECTIONS.find(s => s.key === 'C')!.items, avgC, true, true)
            ) : (
              <div className="p-8 text-center text-sm text-slate-400 italic">
                Section non applicable pour ce poste — sa pondération (20%) est automatiquement répartie entre les sections A et B.
              </div>
            )}
          </div>

          {/* Section D — Compétences spécifiques */}
          <div className={currentStep === stepIdx('Compétences D') ? "border-t-4 border-slate-800" : "hidden"}>
            <div className="bg-slate-800 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-wide">D. COMPÉTENCES SPÉCIFIQUES AU POSTE (10%)</h3>
              <span className="text-xs bg-white/10 px-3 py-1 rounded-full">Non acquise = 5 · En cours = 12 · Acquise = 20</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-3 border-b border-slate-200 font-bold text-slate-700 text-xs w-[35%]">Activité / Tâche (Fiche de poste)</th>
                    <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-xs text-red-600">Non acquise<br /><span className="font-normal">(note = 5)</span></th>
                    <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-xs text-orange-600">En cours<br /><span className="font-normal">(note = 12)</span></th>
                    <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-xs text-emerald-600">Acquise<br /><span className="font-normal">(note = 20)</span></th>
                    <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-xs text-slate-500">Note</th>
                    <th className="p-3 border-b border-l border-slate-200 font-bold text-xs text-slate-500 w-[25%]">Plan de développement</th>
                  </tr>
                </thead>
                <tbody>
                  {tableDTasks.map((t, idx) => {
                    const taskFilled = !!t.task.trim();
                    return (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/40">
                      <td className="p-2">
                        <input type="text" placeholder={`Tâche ${idx + 1}`}
                          className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                          value={t.task} onChange={e => { const n = [...tableDTasks]; n[idx].task = e.target.value; setTableDTasks(n); }} />
                      </td>
                      {(['Non acquise', 'En cours', 'Acquise'] as const).map((s, ci) => (
                        <td key={s} className={`p-2 border-l border-slate-100 text-center align-middle ${ci === 0 ? 'bg-red-50/10' : ci === 1 ? 'bg-orange-50/10' : 'bg-emerald-50/10'}`}>
                          <input type="radio" name={`dtask_${t.id}`} disabled={!taskFilled}
                            title={!taskFilled ? 'Renseignez la tâche pour activer la notation' : undefined}
                            className={`w-4 h-4 ${taskFilled ? 'cursor-pointer' : 'cursor-not-allowed opacity-30'} ${ci === 0 ? 'accent-red-500' : ci === 1 ? 'accent-orange-500' : 'accent-emerald-500'}`}
                            checked={t.status === s}
                            onChange={() => { const n = [...tableDTasks]; n[idx].status = s; setTableDTasks(n); }} />
                        </td>
                      ))}
                      <td className="p-2 border-l border-slate-100 text-center">
                        {t.status ? (
                          <span className={`text-sm font-black ${t.status === 'Acquise' ? 'text-emerald-600' : t.status === 'En cours' ? 'text-orange-600' : 'text-red-600'}`}>
                            {STATUS_NOTE[t.status]}/20
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="p-2 border-l border-slate-100">
                        <SelectOrOther compact disabled={!taskFilled} value={t.plan} options={PLAN_DEVELOPPEMENT_OPTIONS}
                          onChange={plan => { const n = [...tableDTasks]; n[idx].plan = plan; setTableDTasks(n); }}
                          otherPlaceholder="Autre action de développement" />
                      </td>
                    </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={6} className="p-3 bg-slate-50 text-center">
                      <button type="button" onClick={() => setTableDTasks([...tableDTasks, { id: Date.now(), task: '', status: '', plan: '' }])}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors">
                        <Plus className="h-4 w-4" /> Ajouter une tâche
                      </button>
                    </td>
                  </tr>
                </tbody>
                {avgD > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300">
                      <td colSpan={5} className="p-3 text-sm font-bold text-slate-700 text-right pr-4">Moyenne D :</td>
                      <td className={`p-3 text-center text-sm font-black ${getScoreLabel(avgD).color}`}>{avgD.toFixed(1)}/20</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Section E — Qualité/HSE */}
          <div className={currentStep === stepIdx('Compétences E') ? "border-t-4 border-slate-800" : "hidden"}>
            <div className="bg-slate-800 text-white p-4 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <h3 className="font-bold text-sm tracking-wide">E. COMPÉTENCES QUALITÉ / SST / RÉGLEMENTAIRE (10%)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-3 border-b border-slate-200 font-bold text-slate-700 text-xs w-[16%]">Critère</th>
                    <th className="p-3 border-b border-l border-slate-200 font-bold text-slate-700 text-xs w-[22%]">Définition / Comportements observables</th>
                    {EVAL_LEVELS.map(lvl => (
                      <th key={lvl.key} className={`p-3 border-b border-l border-slate-200 font-bold text-center text-xs ${lvl.textColor} w-[10%]`}>
                        {lvl.label}<br /><span className="font-normal opacity-70">({lvl.min}–{lvl.max})</span>
                      </th>
                    ))}
                    <th className="p-3 border-b border-l border-slate-200 font-bold text-center text-xs text-slate-500 w-[6%]">Note</th>
                    <th className="p-3 border-b border-l border-slate-200 font-bold text-xs text-slate-500 w-[16%]">Action de formation – Plan de développement individuel</th>
                  </tr>
                </thead>
                <tbody>
                  {CADRES_HSE_ITEMS.map(item => (
                    <EvalCriterionRow
                      key={item.id}
                      id={item.id}
                      label={item.label}
                      description={item.description}
                      value={ratings[item.id] ?? emptyRating()}
                      onChange={val => setRating(item.id, val)}
                      justificationRequired={isPointAAmeliorer(ratings[item.id])}
                      isCustomCriterion={item.isCustomCriterion}
                    />
                  ))}
                </tbody>
                {avgE > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300">
                      <td colSpan={6} className="p-3 text-sm font-bold text-slate-700 text-right pr-4">Moyenne E ({countRated(ratings, hseIds)}/{CADRES_HSE_ITEMS.length}) :</td>
                      <td className={`p-3 text-center text-sm font-black ${getScoreLabel(avgE).color}`}>{avgE.toFixed(1)}/20</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* ── PARTIE III : ÉVALUATION DE LA PERFORMANCE ─────────────────────── */}
        <div className={currentStep === stepIdx('Performance') ? "bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" : "hidden"}>
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-indigo-500" />
            <div>
              <h2 className="text-lg font-bold text-slate-800">PARTIE III — ÉVALUATION DE LA PERFORMANCE {isCampaign2026 ? '(fixation des objectifs 2026)' : '(20%)'}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Bilan des objectifs N-1 · Poids total doit être égal à 100%</p>
            </div>
            <button type="button" onClick={() => setObjectives(prev => [...prev, { id: Date.now(), objectif: '', kpi: '', cible: '', resultat: '', poids: 0 }])}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors">
              <Plus className="h-3.5 w-3.5" /> Ajouter un objectif
            </button>
          </div>
          <PerformanceTable rows={objectives} onChange={setObjectives} resultsEnabled={!isCampaign2026} />
        </div>

        {/* ── PARTIE IV : TABLEAU DE SYNTHÈSE ───────────────────────────────── */}
        <div className={currentStep === stepIdx('Synthèse') ? "bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" : "hidden"}>
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center gap-3">
            <Award className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">PARTIE IV — TABLEAU DE SYNTHÈSE</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="p-4 border-b border-slate-200 font-bold text-slate-700 text-sm">Section</th>
                  <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-slate-700 text-sm">Pondération</th>
                  <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-slate-700 text-sm">Moyenne /20</th>
                  <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-slate-700 text-sm">Note pondérée</th>
                  <th className="p-4 border-b border-l border-slate-200 font-bold text-center text-slate-700 text-sm">Appréciation</th>
                </tr>
              </thead>
              <tbody>
                {synthesisRows.map(row => {
                  const sl = getScoreLabel(row.avg);
                  const pondNote = (row.avg * row.pct) / 100;
                  return (
                    <tr key={row.label} className="border-b border-slate-100 hover:bg-slate-50/40">
                      <td className="p-4 text-sm font-medium text-slate-700">{row.label}</td>
                      <td className="p-4 border-l border-slate-100 text-center font-bold text-slate-600">{row.pct}%</td>
                      <td className={`p-4 border-l border-slate-100 text-center font-black text-sm ${sl.color}`}>
                        {row.avg > 0 ? row.avg.toFixed(1) : '—'}
                      </td>
                      <td className="p-4 border-l border-slate-100 text-center font-bold text-primary-700">
                        {row.avg > 0 ? pondNote.toFixed(2) : '—'}
                      </td>
                      <td className="p-4 border-l border-slate-100 text-center">
                        {row.avg > 0 ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                            row.avg >= 16 ? 'bg-blue-100 text-blue-700' :
                            row.avg >= 11 ? 'bg-emerald-100 text-emerald-700' :
                            row.avg >= 6  ? 'bg-orange-100 text-orange-700' :
                                            'bg-red-100 text-red-700'
                          }`}>
                            {sl.emoji} {sl.label}
                          </span>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white">
                  <td colSpan={3} className="p-4 font-black text-sm text-right pr-6">NOTE FINALE GLOBALE /20 :</td>
                  <td className={`p-4 text-center text-xl font-black ${getScoreLabel(noteFinaleCadres).color.replace('text-', 'text-white ')}`}>
                    {noteFinaleCadres > 0 ? noteFinaleCadres.toFixed(2) : '—'}
                  </td>
                  <td className="p-4 text-center text-sm font-bold text-white/80">
                    {noteFinaleCadres > 0 ? getScoreLabel(noteFinaleCadres).label : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Grille d'appréciation */}
          <div className="p-4 bg-slate-50 border-t border-slate-200">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Grille d'appréciation</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Supérieur aux attentes',  range: '16–20', color: 'bg-blue-100 text-blue-700' },
                { label: 'Satisfaisant',             range: '11–15', color: 'bg-emerald-100 text-emerald-700' },
                { label: 'À améliorer',              range: '6–10',  color: 'bg-orange-100 text-orange-700' },
                { label: 'Insatisfaisant',           range: '0–5',   color: 'bg-red-100 text-red-700' },
              ].map(g => (
                <span key={g.label} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${g.color}`}>
                  {g.label} ({g.range}/20)
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── PARTIE V (1/2) : FORMATION ET PLAN DE DÉVELOPPEMENT ────────────── */}
        <div className={currentStep === stepIdx('Formations') ? "bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" : "hidden"}>
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-rose-50 to-pink-50 flex items-center gap-3">
            <FileText className="h-5 w-5 text-rose-500" />
            <h2 className="text-lg font-bold text-slate-800">PARTIE V — FORMATION ET PLAN DE DÉVELOPPEMENT</h2>
          </div>

          {/* Appréciation globale (automatique) / Grille des notes données */}
          <div className="p-6 border-b border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Appréciation globale de l'évaluateur</label>
              {noteFinaleCadres > 0 ? (
                <div className={`flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm ${getScoreLabel(noteFinaleCadres).color}`}>
                  <span>{getScoreLabel(noteFinaleCadres).emoji}</span>
                  <span>{getScoreLabel(noteFinaleCadres).label}</span>
                  <span className="ml-auto text-slate-400 font-medium">{noteFinaleCadres.toFixed(2)}/20</span>
                </div>
              ) : (
                <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400 italic">
                  Déterminée automatiquement une fois toutes les notes saisies.
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-1.5">Calculée automatiquement à partir de la note finale (grille ci-contre) — non modifiable.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Grille des notes données</label>
              <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
                {synthesisRows.map(row => {
                  const sl = row.avg > 0 ? getScoreLabel(row.avg) : null;
                  return (
                    <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600 font-medium truncate pr-2">{row.label}</span>
                      <span className={`font-bold flex-shrink-0 ${sl ? sl.color : 'text-slate-300'}`}>{row.avg > 0 ? `${row.avg.toFixed(1)}/20` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Plan de développement */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700">Plan de développement individuel :</h3>
              <button type="button" onClick={() => setPlanDev(prev => [...prev, { id: Date.now(), point: '', action: '', responsable: '', echeance: '', statut: 'Non démarré' }])}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors">
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-2 border-b border-slate-200 font-bold text-slate-600 w-[25%]">Point/Écart</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[25%]">Action</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[15%]">Responsable</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[15%]">Échéance</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[15%]">Statut</th>
                    <th className="p-2 border-b border-l border-slate-200 w-[5%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {planDev.map(row => {
                    const fromSectionD = !!row.sourceTaskId;
                    return (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="p-1.5">
                        <input type="text" value={row.point} readOnly={fromSectionD}
                          onChange={e => setPlanDev(prev => prev.map(r => r.id === row.id ? { ...r, point: e.target.value } : r))}
                          placeholder="Compétence à développer"
                          title={fromSectionD ? 'Repris de la section D — Compétences spécifiques au poste' : undefined}
                          className={`w-full p-1.5 text-xs border rounded-lg outline-none ${fromSectionD ? 'bg-teal-50 border-teal-200 text-teal-800 font-semibold' : 'bg-slate-50 border-slate-200'}`} />
                      </td>
                      <td className="p-1.5 border-l border-slate-100">
                        <input type="text" value={row.action} readOnly={fromSectionD}
                          onChange={e => setPlanDev(prev => prev.map(r => r.id === row.id ? { ...r, action: e.target.value } : r))}
                          placeholder="Action de développement"
                          className={`w-full p-1.5 text-xs border rounded-lg outline-none ${fromSectionD ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-slate-50 border-slate-200'}`} />
                      </td>
                      <td className="p-1.5 border-l border-slate-100"><input type="text" value={row.responsable} onChange={e => setPlanDev(prev => prev.map(r => r.id === row.id ? { ...r, responsable: e.target.value } : r))} placeholder="RH / Manager" className="w-full p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none" /></td>
                      <td className="p-1.5 border-l border-slate-100"><input type="date" value={row.echeance} onChange={e => setPlanDev(prev => prev.map(r => r.id === row.id ? { ...r, echeance: e.target.value } : r))} className="w-full p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none" /></td>
                      <td className="p-1.5 border-l border-slate-100">
                        <select value={row.statut} onChange={e => setPlanDev(prev => prev.map(r => r.id === row.id ? { ...r, statut: e.target.value } : r))} className="w-full p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none">
                          {['Non démarré', 'En cours', 'Réalisé'].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="p-1.5 border-l border-slate-100 text-center">
                        {!fromSectionD && planDev.length > 1 && <button type="button" onClick={() => setPlanDev(prev => prev.filter(r => r.id !== row.id))} className="text-slate-300 hover:text-red-500 transition-colors">✕</button>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Plan de développement (Formation proposée) */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700">Plan de développement (Formation proposée) :</h3>
              <button type="button" onClick={() => setTrainings(prev => [...prev, { id: Date.now(), intitule: '', typeFormation: 'externe', organisme: '', modalite: '', joursPrevisionnels: '', budget: '', periode: '', priorite: '2' }])}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors">
                <Plus className="h-3.5 w-3.5" /> Ajouter une formation
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Budget calculé automatiquement : {formatTrainingBudget(trainingDailyRate)} / jour × nombre de jours prévisionnels (formations externes uniquement).</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-2 border-b border-slate-200 font-bold text-slate-600 w-[16%]">Intitulé de la formation</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[8%]">Type</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[13%]">Organisme</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[12%]">Modalité</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[7%]">Nb. jours</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[11%]">Budget estimé</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[13%]">Période</th>
                    <th className="p-2 border-b border-l border-slate-200 font-bold text-slate-600 w-[8%]">Priorité</th>
                    <th className="p-2 border-b border-l border-slate-200 w-[5%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {trainings.map(row => {
                    const isInterne = (row.typeFormation || 'externe') === 'interne';
                    const jours = parseFloat(row.joursPrevisionnels);
                    const computedBudget = !isInterne && jours > 0 ? formatTrainingBudget(jours * trainingDailyRate) : '';
                    return (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="p-1.5">
                        <SelectOrOther compact otherRequired value={row.intitule} options={TRAINING_CATALOG_OPTIONS}
                          onChange={intitule => setTrainings(prev => prev.map(r => r.id === row.id ? { ...r, intitule } : r))}
                          otherPlaceholder="Nom de la formation" />
                      </td>
                      <td className="p-1.5 border-l border-slate-100">
                        <select value={row.typeFormation || 'externe'} onChange={e => {
                          const typeFormation = e.target.value as TrainingType;
                          setTrainings(prev => prev.map(r => r.id === row.id ? {
                            ...r,
                            typeFormation,
                            organisme: typeFormation === 'interne' ? LDM_GROUPE_ORGANISME : '',
                            joursPrevisionnels: '',
                            budget: '',
                          } : r));
                        }} className="w-full p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none">
                          <option value="interne">Interne</option>
                          <option value="externe">Externe</option>
                        </select>
                      </td>
                      <td className="p-1.5 border-l border-slate-100">
                        {isInterne ? (
                          <span className="block w-full p-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-500">{LDM_GROUPE_ORGANISME}</span>
                        ) : (
                          <SelectOrOther compact value={row.organisme} options={ORGANISMES_FORMATION}
                            onChange={organisme => setTrainings(prev => prev.map(r => r.id === row.id ? { ...r, organisme } : r))}
                            otherPlaceholder="Nom de l'organisme" />
                        )}
                      </td>
                      <td className="p-1.5 border-l border-slate-100">
                        <select value={row.modalite} onChange={e => setTrainings(prev => prev.map(r => r.id === row.id ? { ...r, modalite: e.target.value } : r))} className="w-full p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none">
                          <option value="">—</option>
                          {MODALITE_FORMATION_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="p-1.5 border-l border-slate-100">
                        {isInterne ? (
                          <span className="block w-full p-1.5 text-xs text-slate-300 text-center">—</span>
                        ) : (
                          <input type="number" min="0" step="0.5" value={row.joursPrevisionnels}
                            onChange={e => {
                              const joursPrevisionnels = e.target.value;
                              const j = parseFloat(joursPrevisionnels);
                              setTrainings(prev => prev.map(r => r.id === row.id ? {
                                ...r,
                                joursPrevisionnels,
                                budget: j > 0 ? formatTrainingBudget(j * trainingDailyRate) : '',
                              } : r));
                            }}
                            placeholder="Ex: 3" className="w-full p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none" />
                        )}
                      </td>
                      <td className="p-1.5 border-l border-slate-100 text-center">
                        {isInterne ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <span className="text-xs font-bold text-slate-700">{computedBudget || '—'}</span>
                        )}
                      </td>
                      <td className="p-1.5 border-l border-slate-100">
                        <SelectOrOther compact value={row.periode} options={trimesterOptions}
                          onChange={periode => setTrainings(prev => prev.map(r => r.id === row.id ? { ...r, periode } : r))}
                          otherPlaceholder="Autre période" />
                      </td>
                      <td className="p-1.5 border-l border-slate-100">
                        <select value={row.priorite} onChange={e => setTrainings(prev => prev.map(r => r.id === row.id ? { ...r, priorite: e.target.value } : r))} className="w-full p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none">
                          <option value="1">1 — Haute</option>
                          <option value="2">2 — Moyenne</option>
                          <option value="3">3 — Basse</option>
                        </select>
                      </td>
                      <td className="p-1.5 border-l border-slate-100 text-center">
                        {trainings.length > 1 && <button type="button" onClick={() => setTrainings(prev => prev.filter(r => r.id !== row.id))} className="text-slate-300 hover:text-red-500 transition-colors">✕</button>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── PARTIE V (2/2) : SYNTHÈSE, SIGNATURES ET DÉCISION RH ───────────── */}
        <div className={currentStep === stepIdx('Synthèse') ? "bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" : "hidden"}>
          {/* ── Signatures ─────────────────────────────────────────────────────── */}
          <div className="p-6 bg-slate-50 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Signatures</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              {/* Évaluateur */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">L'Évaluateur (N+1)</p>
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5">Nom &amp; Prénom</p>
                  <p className="text-sm font-semibold text-slate-800">{evaluator?.fullName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5">Poste</p>
                  <p className="text-sm text-slate-700">{evaluator?.poste ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5">Date &amp; Heure</p>
                  <p className="text-sm font-semibold text-slate-800">{evaluatorSignedAt}</p>
                </div>
              </div>

              {/* Validation RH — affiche les données réelles si validée */}
              {evalStatus === 'Validée' && validatorName ? (
                <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Validation RH</p>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">✓ Validée</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">Nom &amp; Prénom</p>
                    <p className="text-sm font-semibold text-slate-800">{validatorName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">Poste</p>
                    <p className="text-sm text-slate-700">{validatorPoste ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">Date &amp; Heure</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {validatedAt
                        ? new Date(validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          + ' à ' + new Date(validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </p>
                  </div>
                  {rhDecision && rhDecision.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-400 mb-0.5">Décision RH</p>
                      <div className="flex flex-wrap gap-1">
                        {rhDecision.map((d: string) => (
                          <span key={d} className="text-[10px] px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-full font-semibold">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {rhComment && (
                    <div>
                      <p className="text-[10px] text-slate-400 mb-0.5">Commentaire RH</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{rhComment}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-100/50 border border-dashed border-slate-300 rounded-2xl p-5 space-y-3 opacity-60">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Validation RH</p>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">Nom &amp; Prénom</p>
                    <p className="text-sm italic text-slate-400">À compléter lors de la validation RH</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">Poste</p>
                    <p className="text-sm italic text-slate-400">—</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">Date &amp; Heure</p>
                    <p className="text-sm italic text-slate-400">—</p>
                  </div>
                </div>
              )}
            </div>

            {/* Retour employé */}
            {evalStatus === 'Validée' && employeeFeedback && (
              <div className={`mt-4 flex items-center gap-3 rounded-2xl px-4 py-3 border ${
                employeeFeedback === 'satisfait'     ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                employeeFeedback === 'moyen'         ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                                        'bg-red-50 border-red-200 text-red-700'
              }`}>
                {employeeFeedback === 'satisfait' ? <Smile className="h-5 w-5 flex-shrink-0" />
                  : employeeFeedback === 'moyen' ? <Meh className="h-5 w-5 flex-shrink-0" />
                  : <Frown className="h-5 w-5 flex-shrink-0" />}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">Retour de l'employé</p>
                  <p className="text-sm font-bold">
                    {employeeFeedback === 'satisfait' ? 'Satisfait(e)'
                      : employeeFeedback === 'moyen' ? 'Moyennement satisfait(e)'
                      : 'Non satisfait(e)'}
                    {employeeFeedbackAt && (
                      <span className="font-medium opacity-70"> · {new Date(employeeFeedbackAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

      </fieldset>

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 font-medium text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {saveError}
          </div>
        )}

        {/* ── Sticky submit bar ──────────────────────────────────────────────── */}
        {isLocked ? (
          <div className="sticky bottom-4 z-10 bg-emerald-50/95 backdrop-blur-md p-4 rounded-2xl border border-emerald-200 shadow-xl flex items-center gap-3">
            <Lock className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-bold text-emerald-700">
              Cette évaluation a été validée par les RH le {validatedAt ? new Date(validatedAt).toLocaleDateString('fr-FR') : ''} et ne peut plus être modifiée.
            </p>
          </div>
        ) : (
          <div className="sticky bottom-4 z-10 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`w-2 h-2 rounded-full ${ratedCriteria === totalCriteria ? 'bg-emerald-500' : 'bg-orange-500 animate-pulse'}`} />
              <p className="text-sm font-medium text-slate-600">
                {ratedCriteria === totalCriteria
                  ? <span className="text-emerald-600 font-bold">Tous les critères évalués ✓</span>
                  : <span className="text-orange-600 font-bold">{ratedCriteria} / {totalCriteria} critères remplis</span>}
              </p>
              {noteFinaleCadres > 0 && (
                <span className={`text-sm font-black ml-2 ${getScoreLabel(noteFinaleCadres).color}`}>
                  · Note finale : {noteFinaleCadres.toFixed(2)}/20
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {currentStep > 0 && (
                <button type="button" onClick={() => setCurrentStep(s => s - 1)}
                  className="px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold transition-colors">
                  ← Précédent
                </button>
              )}
              {isLastStep ? (
                <button type="submit" disabled={saving || ratedCriteria < totalCriteria || missingJustifications.length > 0 || incompleteObjectiveRows(objectives).length > 0}
                  title={
                    ratedCriteria < totalCriteria ? `Il manque ${totalCriteria - ratedCriteria} note(s) avant de pouvoir soumettre`
                    : missingJustifications.length > 0 ? `Action de formation obligatoire (note < 11/20) pour : ${missingJustifications.map(i => i.label).join(', ')}`
                    : incompleteObjectiveRows(objectives).length > 0 ? 'Chaque objectif doit avoir un KPI, et chaque KPI doit être rattaché à un objectif.'
                    : ''
                  }
                  className="flex-1 sm:flex-none px-8 py-3 bg-primary hover:bg-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  Soumettre l'évaluation
                </button>
              ) : (
                <button type="button" onClick={advanceStep} disabled={!!stepBlockedReason(currentStep)}
                  title={stepBlockedReason(currentStep) ?? undefined}
                  className="flex-1 sm:flex-none px-8 py-3 bg-primary hover:bg-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  Suivant : {STEPS[currentStep + 1]} →
                </button>
              )}
            </div>
          </div>
        )}
      </form>

      {/* Hidden print layout */}
      <div style={{ display: 'none' }}>
        <EvalPrintLayout
          ref={printRef}
          type="Cadres & Maîtrises"
          globalScore={noteFinaleCadres}
          identificationRows={[
            { label: 'Direction / Structure / Entité', value: `${targetUser?.departement || targetUser?.direction || '—'} — LDM Groupe`, fullWidth: true },
            { label: "Nom et Prénom de l'évalué", value: targetUser?.fullName || '' },
            { label: 'Date de recrutement', value: fmtDate(targetUser?.dateRecrutement) },
            { label: 'Fonction', value: targetUser?.poste || targetUser?.role || '' },
            { label: 'Catégorie Socioprofessionnelle', value: targetUser?.categorie || '' },
            { label: 'Évaluateur', value: evaluator?.fullName || '' },
            { label: 'Fonction évaluateur', value: evaluator?.role || '' },
            { label: "Date de l'évaluation", value: evalDate ? fmtDate(evalDate) : new Date().toLocaleDateString('fr-FR'), fullWidth: true },
            ...(profilDiplome ? [{ label: 'Diplôme', value: profilDiplome, fullWidth: true }] : []),
            ...(profil ? [{ label: 'Profil', value: profil, fullWidth: true }] : []),
            ...(profilFormations ? [{ label: 'Formations / Certifications', value: profilFormations, fullWidth: true }] : []),
          ]}
          blocks={[
            // A, B, (C) puis D (tâches spécifiques) puis E — dans l'ordre alphabétique
            // réel, chacune à sa position exacte (au lieu d'être reléguée en fin de page).
            ...CADRES_SECTIONS.filter(s => s.key !== 'C' || hasSectionC).map(s => ({
              type: 'criteria' as const,
              title: `${s.title} (${s.ponderation}%)`,
              items: s.items,
              avg: s.key === 'A' ? avgA : s.key === 'B' ? avgB : avgC,
            })),
            {
              type: 'tasks' as const,
              title: 'D. COMPÉTENCES SPÉCIFIQUES AU POSTE (10%)',
              rows: tableDTasks.map(t => ({ ...t, rating: STATUS_NOTE[t.status] || 0 })),
              avg: avgD,
            },
            { type: 'criteria' as const, title: 'E. COMPÉTENCES QUALITÉ / SST / RÉGLEMENTAIRE (10%)', items: CADRES_HSE_ITEMS, avg: avgE },
          ]}
          ratings={ratings}
          objectives={objectives}
          avgPerf={avgPerf}
          synthesisRows={synthesisRows}
          trainingNeeds={trainingNeeds}
          recommendation={recommendation}
          planDev={planDev}
          trainings={trainings}
          printedBy={evaluator?.fullName}
        />
      </div>
    </div>
  );
};
