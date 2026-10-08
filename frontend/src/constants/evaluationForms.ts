export type LevelDescriptions = {
  insatisfaisant: string;
  ameliorer: string;
  satisfaisant: string;
  superieur: string;
};

export type CriterionItem = {
  id: string;
  label: string;
  description?: string;          // Définition générale du critère (ce qu'il mesure)
  levelDescriptions?: LevelDescriptions; // Comportements observables par niveau
  /** Si vrai, la justification devient obligatoire dès qu'une note est donnée à ce critère. */
  justificationRequired?: boolean;
  /** Critère générique « Autre » (ex. « Autre critère A (selon le poste) ») : son
   *  libellé générique ne désigne rien de comparable d'une fiche à l'autre — la
   *  colonne habituellement réservée à l'action de formation devient ici un champ
   *  libre où l'évaluateur précise ce que ce critère mesure réellement. */
  isCustomCriterion?: boolean;
};

export type CriteriaSection = {
  key: string;
  title: string;
  ponderation: number;
  items: CriterionItem[];
};

// LEVELS for checkbox + free note system
export const EVAL_LEVELS = [
  { key: 'insatisfaisant', label: 'Insatisfaisant',        color: 'red',     min: 0,  max: 5,  accent: 'accent-red-500',     bg: 'bg-red-50/10',    hoverBg: 'group-hover:bg-red-50/30',    textColor: 'text-red-600',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700' },
  { key: 'ameliorer',      label: 'À améliorer',           color: 'orange',  min: 6,  max: 10, accent: 'accent-orange-500',   bg: 'bg-orange-50/10', hoverBg: 'group-hover:bg-orange-50/30', textColor: 'text-orange-600', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
  { key: 'satisfaisant',   label: 'Satisfaisant',          color: 'emerald', min: 11, max: 15, accent: 'accent-emerald-500',  bg: 'bg-emerald-50/10',hoverBg: 'group-hover:bg-emerald-50/30',textColor: 'text-emerald-600',border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-700' },
  { key: 'superieur',      label: 'Supérieur aux attentes',color: 'blue',    min: 16, max: 20, accent: 'accent-blue-500',     bg: 'bg-blue-50/10',   hoverBg: 'group-hover:bg-blue-50/30',   textColor: 'text-blue-600',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700' },
] as const;

export type LevelKey = typeof EVAL_LEVELS[number]['key'];

export type CriterionRating = {
  level: LevelKey | null;
  note: number | null;
  justification: string;
};

export type RatingsMap = Record<string, CriterionRating>;

export const getLevelForNote = (note: number) => {
  return EVAL_LEVELS.find(l => note >= l.min && note <= l.max) ?? EVAL_LEVELS[0];
};

export const getScoreLabel = (score: number): { label: string; color: string; emoji: string } => {
  if (score >= 16) return { label: 'Supérieur aux attentes', color: 'text-blue-600',    emoji: '🏆' };
  if (score >= 11) return { label: 'Satisfaisant',           color: 'text-emerald-600', emoji: '✅' };
  if (score >= 6)  return { label: 'À améliorer',            color: 'text-orange-600',  emoji: '⚠️' };
  if (score > 0)   return { label: 'Insatisfaisant',         color: 'text-red-600',     emoji: '❌' };
  return               { label: 'Non noté',                color: 'text-slate-400',   emoji: '—' };
};

// ─── CADRES & MAÎTRISES ────────────────────────────────────────────────────

export const CADRES_SECTIONS: CriteriaSection[] = [
  {
    key: 'A',
    title: 'A. COMPÉTENCES PROFESSIONNELLES ET TECHNIQUES',
    ponderation: 25,
    items: [
      {
        id: 'savoir_faire',
        label: 'Connaissance des savoir-faire techniques',
        description: 'Maîtrise des concepts, méthodes et outils propres aux missions exercées',
        levelDescriptions: {
          insatisfaisant: 'Ne maîtrise pas les outils de base, commet des erreurs répétées, nécessite une assistance constante',
          ameliorer:      'Connaît les concepts de base mais applique avec hésitation, erreurs occasionnelles',
          satisfaisant:   'Maîtrise les outils et méthodes requises, travaille de manière autonome',
          superieur:      'Maîtrise experte, forme ses collègues, propose des améliorations des méthodes existantes',
        },
      },
      {
        id: 'fiabilite',
        label: 'Fiabilité et qualité de l\'activité',
        description: 'Niveau de conformité des opérations réalisées aux exigences qualité du poste',
        levelDescriptions: {
          insatisfaisant: 'Opérations souvent non conformes, retouches fréquentes, non-qualité impactant le service',
          ameliorer:      'Conformité partielle, quelques non-conformités récurrentes',
          satisfaisant:   'Opérations généralement conformes, rares écarts rapidement corrigés',
          superieur:      'Zéro non-conformité sur la période, améliore les procédures pour éviter les récidives',
        },
      },
      {
        id: 'gestion_temps',
        label: 'Gestion du temps et organisation',
        description: 'Organisation du travail, respect des délais, ponctualité, gestion des priorités',
        levelDescriptions: {
          insatisfaisant: 'Délais régulièrement non respectés, désorganisation chronique, retards fréquents',
          ameliorer:      'Difficultés à prioriser, quelques retards, prise en charge des urgences insuffisante',
          satisfaisant:   'Respecte les délais, planifie son travail, gère correctement les priorités',
          superieur:      'Anticipe les charges, optimise son temps, aide l\'équipe à respecter ses propres délais',
        },
      },
      {
        id: 'respect_consignes',
        label: 'Respect des consignes et directives',
        description: 'Suivi des procédures, du règlement intérieur, des instructions sécurité',
        levelDescriptions: {
          insatisfaisant: 'Contourne régulièrement les procédures, met en danger la conformité ou la sécurité',
          ameliorer:      'Suit partiellement les consignes, doit être régulièrement rappelé',
          satisfaisant:   'Respecte systématiquement les procédures et consignes applicables',
          superieur:      'Signale proactivement les non-conformités, propose des améliorations documentaires',
        },
      },
      {
        id: 'initiative',
        label: 'Prise d\'initiative',
        description: 'Capacité à proposer des actions d\'amélioration sans attendre d\'y être invité',
        levelDescriptions: {
          insatisfaisant: 'Attend systématiquement les instructions pour agir, aucune suggestion d\'amélioration',
          ameliorer:      'Agit rarement seul, initiatives limitées aux tâches routinières',
          satisfaisant:   'Identifie des problèmes et propose des solutions appropriées',
          superieur:      'Force de proposition reconnue, met en œuvre des améliorations à fort impact',
        },
      },
      {
        id: 'adaptabilite',
        label: 'Adaptabilité',
        description: 'Capacité à intégrer le changement, nouvelles méthodes, nouvelles responsabilités',
        levelDescriptions: {
          insatisfaisant: 'Résiste aux changements, difficultés majeures face aux nouvelles situations',
          ameliorer:      'Accepte les changements avec réticence, adaptation lente',
          satisfaisant:   'S\'adapte aux évolutions dans un délai raisonnable',
          superieur:      'Moteur du changement, aide ses collègues à s\'adapter, voit les opportunités',
        },
      },
      {
        id: 'developpement_comp',
        label: 'Entretien et développement des compétences',
        description: 'Implication dans les formations et dans l\'autoformation pour maintenir son niveau',
        levelDescriptions: {
          insatisfaisant: 'N\'investit pas dans son développement, rejette les opportunités de formation',
          ameliorer:      'Participation aux formations obligatoires uniquement, faible auto-développement',
          satisfaisant:   'Participe activement aux formations, applique les acquis',
          superieur:      'Investit dans sa veille professionnelle, partage ses connaissances avec l\'équipe',
        },
      },
      {
        id: 'efficacite',
        label: 'Souci d\'efficacité et de résultat',
        description: 'Orientation résultats, capacité à optimiser son activité pour maximiser la valeur produite',
        levelDescriptions: {
          insatisfaisant: 'Travail réalisé sans souci d\'impact ou d\'efficience',
          ameliorer:      'Conscience du résultat attendu mais difficultés à optimiser sa contribution',
          satisfaisant:   'Oriente son travail vers les résultats, mesure son efficacité',
          superieur:      'Cherche en permanence à maximiser la valeur, propose des gains de productivité',
        },
      },
      {
        id: 'respect_obligations',
        label: 'Respect des obligations statutaires',
        description: 'Devoir de réserve, discrétion, respect du secret professionnel',
        levelDescriptions: {
          insatisfaisant: 'Manquements graves au devoir de réserve ou à la confidentialité',
          ameliorer:      'Quelques entorses ponctuelles aux obligations de discrétion',
          satisfaisant:   'Respecte systématiquement ses obligations statutaires',
          superieur:      'Modèle d\'exemplarité, sensibilise ses collègues sur ces obligations',
        },
      },
      {
        id: 'autre_a',
        label: 'Autre critère A (selon le poste)',
        description: 'Critère complémentaire à définir selon le poste occupé',
        justificationRequired: true,
        isCustomCriterion: true,
      },
    ],
  },
  {
    key: 'B',
    title: 'B. COMPÉTENCES RELATIONNELLES',
    ponderation: 15,
    items: [
      {
        id: 'relation_hierarchie',
        label: 'Relation avec la hiérarchie',
        description: 'Respect de la ligne hiérarchique, rend compte de son activité, écoute les feedbacks',
        levelDescriptions: {
          insatisfaisant: 'Conteste systématiquement les décisions, ne rend pas compte, mauvaise communication ascendante',
          ameliorer:      'Communication insuffisante, certains refus d\'accepter les orientations',
          satisfaisant:   'Relation respectueuse, reporting régulier, réceptif aux feedbacks',
          superieur:      'Communication proactive et constructive, facilite le travail de sa hiérarchie',
        },
      },
      {
        id: 'relation_collegues',
        label: 'Relation avec les collègues',
        description: 'Respect, écoute, solidarité professionnelle, courtoisie',
        levelDescriptions: {
          insatisfaisant: 'Comportements irrespectueux, conflits répétés, refus de coopérer',
          ameliorer:      'Relations parfois tendues, peu d\'entraide spontanée',
          satisfaisant:   'Relations respectueuses et constructives, disponible pour aider',
          superieur:      'Crée un climat de confiance, prévient les conflits, référent relationnel de l\'équipe',
        },
      },
      {
        id: 'relation_externe',
        label: 'Relation avec les parties externes',
        description: 'Politesse, écoute, représentation professionnelle de l\'entreprise',
        levelDescriptions: {
          insatisfaisant: 'Attitude non professionnelle avec des tiers, plaintes enregistrées',
          ameliorer:      'Quelques incidents de communication avec des parties externes',
          satisfaisant:   'Communication professionnelle et courtoise avec les parties externes',
          superieur:      'Représentant apprécié, contribue à l\'image positive de l\'entreprise',
        },
      },
      {
        id: 'travail_equipe',
        label: 'Travail en équipe et collaboration',
        description: 'Contribution active à la dynamique collective, partage de l\'information',
        levelDescriptions: {
          insatisfaisant: 'Travaille en silo, ne partage pas les informations, freine la dynamique d\'équipe',
          ameliorer:      'Participation limitée à la vie d\'équipe, partage d\'information insuffisant',
          satisfaisant:   'Contribue activement à l\'équipe, fait circuler les informations utiles',
          superieur:      'Catalyseur de l\'intelligence collective, crée des synergies entre les membres',
        },
      },
    ],
  },
  {
    key: 'C',
    title: 'C. COMPÉTENCES MANAGÉRIALES ET D\'EXPERTISE (pour fonctions d\'encadrement)',
    ponderation: 20,
    items: [
      {
        id: 'accompagner_collab',
        label: 'Accompagner et développer les collaborateurs',
        description: 'Capacité à écouter, comprendre et faire grandir les ressources humaines sous sa responsabilité',
        levelDescriptions: {
          insatisfaisant: 'Ignore les besoins de développement de son équipe',
          ameliorer:      'Identifie les besoins mais actions d\'accompagnement rares',
          satisfaisant:   'Accompagne activement, identifie et planifie les besoins de formation',
          superieur:      'Coach reconnu, développe les talents et prépare les successeurs',
        },
      },
      {
        id: 'animer_motiver',
        label: 'Animer et motiver l\'équipe',
        description: 'Capacité à créer de l\'engagement, dynamiser le collectif et maintenir la motivation',
        levelDescriptions: {
          insatisfaisant: 'Équipe démotivée, ambiance dégradée, fort turnover',
          ameliorer:      'Animation superficielle, faible engagement observé dans l\'équipe',
          satisfaisant:   'Équipe engagée, rituels d\'animation en place',
          superieur:      'Équipe hautement motivée, forte rétention, culture de performance instaurée',
        },
      },
      {
        id: 'gerer_conflits',
        label: 'Gestion des conflits',
        description: 'Prévention, médiation et résolution des situations conflictuelles',
        levelDescriptions: {
          insatisfaisant: 'Ignore ou aggrave les conflits, escalade systématique',
          ameliorer:      'Intervient tardivement, résolution partielle',
          satisfaisant:   'Gère les conflits de manière constructive et rapide',
          superieur:      'Prévient les conflits, culture de médiation dans l\'équipe',
        },
      },
      {
        id: 'fixer_objectifs',
        label: 'Fixer et décliner les objectifs',
        description: 'Déclinaison des objectifs stratégiques en objectifs individuels mesurables (SMART)',
        levelDescriptions: {
          insatisfaisant: 'Objectifs absents, flous ou non communiqués',
          ameliorer:      'Objectifs définis mais peu SMART, suivi insuffisant',
          satisfaisant:   'Objectifs clairs, SMART, déclinés et suivis régulièrement',
          superieur:      'Processus d\'objectifs exemplaire, forte corrélation performance/objectif',
        },
      },
      {
        id: 'deleguer',
        label: 'Déléguer et responsabiliser',
        description: 'Capacité à confier des responsabilités en développant l\'autonomie des collaborateurs',
        levelDescriptions: {
          insatisfaisant: 'Micro management, aucune délégation effective',
          ameliorer:      'Délégation rare, difficultés à lâcher prise',
          satisfaisant:   'Délègue selon les compétences, contrôle proportionné',
          superieur:      'Délégation haut niveau, équipe très autonome et responsabilisée',
        },
      },
      {
        id: 'superviser',
        label: 'Superviser, contrôler, rendre compte',
        description: 'Pilotage de l\'activité, remontée d\'information ascendante et descendante',
        levelDescriptions: {
          insatisfaisant: 'Aucun suivi de l\'activité, écarts non détectés',
          ameliorer:      'Contrôle sporadique, reportings incomplets',
          satisfaisant:   'Suivi régulier, alertes gérées en temps opportun',
          superieur:      'Tableaux de bord en temps réel, pilotage proactif',
        },
      },
      {
        id: 'conduite_changement',
        label: 'Conduite du changement',
        description: 'Capacité à fédérer autour des transformations organisationnelles',
        levelDescriptions: {
          insatisfaisant: 'Résistance active au changement, frein pour l\'équipe',
          ameliorer:      'Accepte le changement passivement, peu d\'accompagnement de l\'équipe',
          satisfaisant:   'Accompagne l\'équipe dans le changement, crée l\'adhésion',
          superieur:      'Agent du changement, initie des transformations et embarque l\'équipe',
        },
      },
      {
        id: 'communication_mgmt',
        label: 'Communication managériale',
        description: 'Qualité de la communication interne, transversale et externe',
        levelDescriptions: {
          insatisfaisant: 'Communication absente ou contre-productive',
          ameliorer:      'Messages parfois mal transmis, manque de clarté',
          satisfaisant:   'Communication claire et adaptée à chaque interlocuteur',
          superieur:      'Communication inspirante, crée la transparence et la confiance',
        },
      },
      {
        id: 'gestion_projet',
        label: 'Gestion de projet',
        description: 'Capacité à planifier, exécuter et clôturer des projets dans les délais et budgets',
        levelDescriptions: {
          insatisfaisant: 'Projets sans méthode, résultats insuffisants',
          ameliorer:      'Gestion partielle, manque de rigueur dans le suivi',
          satisfaisant:   'Projets menés à terme dans les délais avec les ressources allouées',
          superieur:      'Gestion de projet exemplaire, amélioration continue des méthodes',
        },
      },
    ],
  },
];

export const CADRES_HSE_ITEMS: CriterionItem[] = [
  { id: 'hse_smq',     label: 'Connaissance et respect du SMQ (ISO 9001)',        description: 'Maîtrise des procédures qualité, modes opératoires, application des exigences documentaires du SMQ' },
  { id: 'hse_nc',      label: 'Gestion des non-conformités',                      description: 'Identification, signalement et traitement des NC produit/process' },
  { id: 'hse_sme',     label: 'Connaissance et respect du SME (ISO 14001)',       description: 'Connaissance des aspects environnementaux significatifs du poste, application des bonnes pratiques environnementales' },
  { id: 'hse_risques', label: 'Maîtrise des risques SST (ISO 45001)',             description: 'Identification des dangers liés au poste, application des mesures de prévention et procédures d\'urgence' },
  { id: 'hse_culture', label: 'Culture de sécurité',                             description: 'Comportements proactifs de sécurité, participation aux sensibilisations, respect des EPI et consignes' },
  { id: 'hse_bpf',     label: 'Respect des BPF / réglementations pharmaceutiques', description: 'Application des Bonnes Pratiques de Fabrication, des exigences réglementaires propres à l\'industrie pharmaceutique' },
  { id: 'hse_amelio',  label: 'Participation à l\'amélioration continue',        description: 'Contribution aux audits internes, CAPA, revues de processus, etc.' },
];

// ─── EXÉCUTIONS ────────────────────────────────────────────────────────────

export const EXEC_SECTIONS: CriteriaSection[] = [
  {
    key: 'A',
    title: 'A. COMPÉTENCES COMPORTEMENTALES / SAVOIR-ÊTRE',
    ponderation: 25,
    items: [
      {
        id: 'reactivite',
        label: 'Réactivité',
        description: 'Capacité à agir rapidement face aux situations, aux demandes et aux imprévus',
        levelDescriptions: {
          insatisfaisant: 'Ne réagit pas ou très tardivement même en situation d\'urgence, nécessite une relance permanente',
          ameliorer:      'Réagit avec retard, nécessite souvent d\'être sollicité plusieurs fois',
          satisfaisant:   'Réagit dans des délais raisonnables, prend en charge les demandes sans relance',
          superieur:      'Anticipe les situations, agit proactivement avant même d\'être sollicité',
        },
      },
      {
        id: 'autonomie',
        label: 'Autonomie',
        description: 'Capacité à réaliser ses tâches sans supervision constante et à prendre des initiatives appropriées',
        levelDescriptions: {
          insatisfaisant: 'Ne peut rien faire sans instruction détaillée, dépendance totale au supérieur',
          ameliorer:      'Peut réaliser les tâches simples seul mais demande une validation fréquente',
          satisfaisant:   'Travaille de façon autonome sur les tâches habituelles, sollicite de l\'aide de manière appropriée',
          superieur:      'Gère seul des situations complexes, propose des solutions sans attendre',
        },
      },
      {
        id: 'adaptation',
        label: 'Adaptation',
        description: 'Capacité à s\'ajuster aux changements, nouvelles procédures, nouveaux équipements',
        levelDescriptions: {
          insatisfaisant: 'Refuse ou montre une forte résistance face au moindre changement',
          ameliorer:      'Accepte le changement avec réticence, adaptation lente et partielle',
          satisfaisant:   'S\'adapte aux nouvelles situations dans un délai raisonnable',
          superieur:      'Moteur d\'adaptation, aide ses collègues à s\'ajuster aux changements',
        },
      },
      {
        id: 'discipline',
        label: 'Discipline, assiduité et régularité',
        description: 'Respect des horaires, du règlement intérieur, présence et ponctualité constante',
        levelDescriptions: {
          insatisfaisant: 'Absences ou retards fréquents non justifiés, manquements répétés au règlement',
          ameliorer:      'Quelques absences ou retards, discipline inégale selon les périodes',
          satisfaisant:   'Ponctuel, présent et discipliné de manière régulière',
          superieur:      'Exemplaire en matière de ponctualité, de présence et de respect des règles',
        },
      },
      {
        id: 'assimilation',
        label: 'Facilité d\'assimilation des règles',
        description: 'Capacité à comprendre, mémoriser et appliquer rapidement les procédures et consignes',
        levelDescriptions: {
          insatisfaisant: 'Difficulté persistante à comprendre ou retenir les consignes, même répétées',
          ameliorer:      'Assimile les règles basiques mais a du mal avec les procédures complexes',
          satisfaisant:   'Comprend et applique correctement les procédures après formation',
          superieur:      'Assimile très rapidement, peut expliquer les procédures à ses collègues',
        },
      },
      {
        id: 'esprit_equipe',
        label: 'Esprit d\'équipe',
        description: 'Capacité à coopérer, partager les tâches et contribuer positivement à la dynamique collective',
        levelDescriptions: {
          insatisfaisant: 'Travaille en silo, refuse la coopération, comportement négatif pour l\'équipe',
          ameliorer:      'Participation limitée à la vie d\'équipe, peu d\'entraide spontanée',
          satisfaisant:   'Coopère volontiers, contribue activement à l\'équipe',
          superieur:      'Ciment de l\'équipe, soutient ses collègues, renforce la cohésion',
        },
      },
      {
        id: 'communication',
        label: 'Communication',
        description: 'Qualité et clarté des échanges verbaux et écrits avec la hiérarchie et les collègues',
        levelDescriptions: {
          insatisfaisant: 'Communication inexistante, incorrecte ou source de tensions répétées',
          ameliorer:      'Communication insuffisante ou maladroite, informations parfois retenues',
          satisfaisant:   'Communique clairement et de façon appropriée, fait remonter les informations',
          superieur:      'Communication exemplaire, facilitateur d\'information, interface fluide',
        },
      },
      {
        id: 'tache_specifique_a',
        label: 'Tâche spécifique au poste (à compléter)',
        description: 'A compléter selon la fiche de poste',
      },
    ],
  },
  {
    key: 'B',
    title: 'B. COMPÉTENCES TECHNIQUES / SAVOIR-FAIRE',
    ponderation: 35,
    items: [
      {
        id: 'ordre_precision',
        label: 'Ordre, précision et respect des délais',
        description: 'Soin dans l\'exécution des tâches, exactitude des résultats et respect des échéances',
        levelDescriptions: {
          insatisfaisant: 'Travail souvent désordonné, erreurs fréquentes, délais systématiquement non respectés',
          ameliorer:      'Quelques erreurs récurrentes, délais parfois dépassés, nécessite des rappels',
          satisfaisant:   'Travail soigné, erreurs rares, respecte généralement les délais',
          superieur:      'Travail impeccable, anticipe et respecte tous les délais, référence pour la qualité d\'exécution',
        },
      },
      {
        id: 'respect_proc',
        label: 'Respect des procédures et modes opératoires',
        description: 'Application rigoureuse des procédures, modes opératoires et instructions de travail',
        levelDescriptions: {
          insatisfaisant: 'Contourne régulièrement les procédures, risques qualité ou sécurité avérés',
          ameliorer:      'Application partielle, dérogations sans autorisation',
          satisfaisant:   'Respecte systématiquement les procédures en vigueur',
          superieur:      'Signale les procédures obsolètes, propose des améliorations documentaires',
        },
      },
      {
        id: 'maitrise_equip',
        label: 'Maîtrise des équipements et outils',
        description: 'Capacité à utiliser correctement et en sécurité les équipements, machines et outils du poste',
        levelDescriptions: {
          insatisfaisant: 'Utilisation incorrecte, pannes ou incidents liés à une mauvaise utilisation fréquents',
          ameliorer:      'Utilisation de base maîtrisée, difficultés sur les réglages ou situations inhabituelles',
          satisfaisant:   'Maîtrise les équipements du poste, entretien courant assuré',
          superieur:      'Référence technique, forme les nouveaux, détecte proactivement les anomalies',
        },
      },
      {
        id: 'tache_specifique_b',
        label: 'Tâche spécifique au poste (à compléter)',
        description: 'A compléter selon la fiche de poste',
      },
    ],
  },
];

export const EXEC_HSE_ITEMS: CriterionItem[] = [
  { id: 'ehse_consignes', label: 'Respect des consignes SST (ISO 45001)',        description: 'Port des EPI, respect des procédures de sécurité, signalement des situations dangereuses' },
  { id: 'ehse_risques',   label: 'Connaissance des risques du poste',            description: 'Identification des dangers spécifiques à son poste, maîtrise des mesures de prévention' },
  { id: 'ehse_qualite',   label: 'Respect des procédures qualité (ISO 9001)',    description: 'Application des modes opératoires, des instructions qualité, signalement des non-conformités' },
  { id: 'ehse_env',       label: 'Pratiques environnementales (ISO 14001)',      description: 'Tri des déchets, respect des consignes environnementales' },
  { id: 'ehse_bpf',       label: 'Respect des BPF pharmaceutiques',             description: 'Application des Bonnes Pratiques de Fabrication, traçabilité, hygiène en zone de production' },
  { id: 'ehse_amelio',    label: 'Participation aux actions d\'amélioration',   description: 'Implication dans les formations SST/Qualité, remontée d\'anomalies, suggestions d\'amélioration' },
];

// Libellé complet (sans abréviation) de chaque critère noté, par id — le backend
// (agrégats RH : Top 10 compétences déficitaires, Profil des compétences) ne
// stocke que l'id du critère dans `ratings`, cette table permet de le réafficher
// avec son intitulé exact tel qu'il apparaît sur la fiche d'évaluation.
export const ALL_CRITERIA_LABELS: Record<string, string> = Object.fromEntries(
  [
    ...CADRES_SECTIONS.flatMap(s => s.items),
    ...CADRES_HSE_ITEMS,
    ...EXEC_SECTIONS.flatMap(s => s.items),
    ...EXEC_HSE_ITEMS,
  ].map(item => [item.id, item.label])
);

// ─── LEGACY (kept for backward compatibility with EvalPrintLayout) ──────────

export type CriteriaCategory = {
  title: string;
  items: { id: string; label: string; description?: string }[];
};

export type EvaluationFormSchema = {
  id: string;
  title: string;
  targetRoles: string[];
  maxScorePerItem: number;
  categories: CriteriaCategory[];
};

export const formExecutions: EvaluationFormSchema = {
  id: 'form_executions',
  title: "Fiche d'évaluation des compétences et de performance – Exécutions",
  targetRoles: ['Employe', 'Superviseur', 'Gestionnaire'],
  maxScorePerItem: 20,
  categories: EXEC_SECTIONS.map(s => ({ title: s.title, items: s.items })),
};

export const formCadres: EvaluationFormSchema = {
  id: 'form_cadres',
  title: "Fiche d'évaluation des compétences et de performance – Cadres et Maîtrises",
  targetRoles: ['Responsable', 'Directeur', 'RH', 'Gestionnaire'],
  maxScorePerItem: 20,
  categories: CADRES_SECTIONS.map(s => ({ title: s.title, items: s.items })),
};

export const getFormSchemaForRole = (role: string): EvaluationFormSchema => {
  if (formCadres.targetRoles.includes(role)) return formCadres;
  return formExecutions;
};

// ─── Formations demandées — Interne / Externe ───────────────────────────────
// Formation interne : dispensée par LDM Groupe (organisme fixe, pas de budget à saisir).
// Formation externe : budget calculé automatiquement selon la formule officielle RH
// (email RH du 06/09/2026) : Budget = tarif journalier × nombre de jours prévisionnels.
// Tarif unique pour toutes les catégories (Exécutions / Cadre / Maîtrise), configurable
// depuis le SuperAdmin (clé training_daily_rate).
export const LDM_GROUPE_ORGANISME = 'LDM Groupe';

// Période prévisionnelle d'une formation : T1 à T4 de l'année d'évaluation en cours.
export const getTrimesterOptions = (year: number = new Date().getFullYear()): string[] =>
  [1, 2, 3, 4].map(t => `T${t} ${year}`);

export type TrainingType = 'interne' | 'externe';

export const DEFAULT_TRAINING_DAILY_RATE = 15000;

// Formatage "45 000 DA" (séparateur de milliers en espace ordinaire, comme le reste de l'app).
const withThousandsSeparator = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const formatTrainingBudget = (amount: number): string =>
  `${withThousandsSeparator(amount)} DA`;

// Organismes de formation habituels — liste RH, avec repli "Autre (à préciser)" via SelectOrOther.
export const ORGANISMES_FORMATION = [
  'ECF Training',
  'CCIR Rhumel',
  'P&P',
  'Educaform ESG',
  'Istam',
  'EPFP Akbache',
  'Wanylab',
  'S3D',
  'BSS',
  'ETM',
  'Integrated Solution',
  'CFA - Guidoum Kaddour',
  'DFP',
  'Unidées',
  'Odessial',
  'CFPM',
  'Pigier',
];

export const MODALITE_FORMATION_OPTIONS = [
  'Formation certifiante',
  'Qualifiante',
  'E-learning',
  'Diplômante',
];

// Plan de développement individuel (Section D/C — compétences spécifiques au poste).
export const PLAN_DEVELOPPEMENT_OPTIONS = [
  'Tutorat',
  'Accompagnement terrain',
  'Formation / Re-qualification procédure',
  'Mise en situation sur terrain',
];

export const APPRECIATION_GLOBALE_OPTIONS = [
  'Supérieur aux attentes',
  'Satisfaisant',
  'À améliorer',
  'Insatisfaisant',
];

// Catalogue des formations proposées dans "Formations demandées" (Intitulé de
// la formation), avec repli "Autre (à préciser)" pour toute formation absente
// de la liste.
export const TRAINING_CATALOG_OPTIONS = [
  'Rédaction CTD',
  'Gestion des variations réglementaires',
  'Affaires Réglementaires',
  'Gestion des projets',
  'Norme ISO 13485 (Dispositifs médicaux) / règlement UE Dispositif médicaux',
  'Power BI',
  'Techniques de communication et de négociation efficace',
  'Gestion des Change Control',
  'Gestion des Déviations',
  'Audit interne selon la norme 19011',
  'Audits et inspections',
  'Management',
  'POWER QUERY ET POWERPIVOT (Excel avancé)',
  'Power BI avancé',
  'SAP Business One - ERP',
  'Comptabilité Analytique',
  'Pratique de Budget sur ERP',
  'Excel de gestion',
  'Anglais',
  'Gestion des colonnes : Comment choisir et optimiser l\'utilisation des colonnes HPLC',
  'Problèmes et anomalies en HPLC: identification, résolution et prévention',
  'Data Integrity: Expertise',
  'Gestion des OOS et identification de root cause en microbiologie',
  'Les impuretés dans les API et produit fini',
  'Gestion des projets informatiques (PMP / Agile / Scrum)',
  'GAMP 5 & Cycle de vie des systèmes (SDLC)',
  'Data Integrity & ALCOA+ / ALCOA++',
  'Administration systèmes & réseaux (Windows/Linux)',
  'Requêtes ERP SAP & reporting',
  'Introduction à l\'IA appliquée (ChatGPT, Copilot…..)',
  'Power BI avancé & Data Analytics',
  'ISO 27001 – Sensibilisation & implémentation',
  'Loi 18-07 & protection des données personnelles',
  'Cloud Computing & Virtualisation',
  'ITIL Foundation & gestion des incidents',
  'SOC, PAM & gestion des accès',
  'Prompt Engineering & bonnes pratiques IA',
  'Maintenance des systémes automatiques et systéme BMS',
  'Les systèmes frigorifiques industriels',
  'Méthode SMED',
  'Fonctionnement des chaudières et régulation des brûleurs et des circuits de vapeur',
  'Les Bonnes Pratiques de Fabrication (BPF)',
  'Maintien de l\'intégrité des données (DATA INTEGRITY)',
  'Reporting Financier et suivi des Investissements',
  'Comptabilité d\'Engagement dans l\'Industrie Pharmaceutique',
  'Journée d\'Information sur la loi de Finance 2026',
  'Fiscalité du contrat de service',
  'BCP',
  'CTR',
  'Secoursisme',
  'ATEX',
  'IRCA 14001',
  'Risque Biologique (Ciblée pour les nouveaux produits pharmaceutiques innovés)',
  'Empreinte Carbon',
  'Habilitation chariot elevateur',
  'Habilitation Electrique',
  'Veille Réglementaire et elaboration du rapport de conformité légale & SDA',
  'Intelligence Artificielle',
  'Gestion documentaire & Traçabilité',
  'Gestion des émotions et travail en équipe',
  'Gestion des priorités et différence entre priorité et urgence',
  'Conformité promotionnelle et réglementaire marketing',
  'Brand Planning et stratégie Marketing',
  'Magement de la performance et de la sous traitance',
  'Certification en Facility Mnagement Stratégique',
  'Technique d\'Accueil',
  'Application Microsoft 365',
  'Validation de nettoyage',
  'Ongoing Process Verification (OPV)',
  'COMEX',
  'DEDOUANEMENT',
  'Bâtir une gestion prévisionnelle des emplois et des compétences – GPEC',
  'Ingénierie et Management de la formation',
  'Digitalisation et enjeux modernes des Ressources Humaines',
  'Pratiquer l\'audit social et l\'audit RH',
  'Procédures disciplinaire',
  'Initiation Power BI',
  'Gestion des projets PMP',
  'Pilotage des Processus pour les Pilotes & Co pilotes',
  'Techniques d\'investigation et gestion des CAPA',
  'Maitrise des changements',
  'Gestion des Risques',
  'Formation sur MS 365 & gestion documentaire via sharpoint',
  'Minitab',
  'Gestion documentaire et Archivage',
  'Data intégrité',
  'Validation des Systèmes Informatisés',
  'ISO 22000 & HACCP — Systèmes de management de la sécurité alimentaire et des dangers',
  'ISO 13485:2016 — Exigences du système de management de la qualité pour dispositifs médicaux',
  'la loi 18 07 et 25-11 protection données à caractere personnel',
  'Systèmes de management de la continuité d\'activité ISO 22301',
  'ISO/IEC 17025 :2017 - Exigences générales concernant la compétence des laboratoires d\'étalonnages et d\'essais.',
  'Maitrise des équipements de surveillance et de mesure.',
  'Métrologie des températures.',
  'Métrologie des pressions.',
  'Formation sur les incertitudes de mesures.',
  'Qualification des installations, équipements et utilités',
  'Validation des méthodes analytiques',
  'Validation du cycle de vie',
  'Validation/Revalidation des procedes (fabrication/conditionnement)',
  'Stratégie de Validation & Validation Master Plan (VMP)',
  'ISO 9001 version 2026',
  'ISO 14001 version 2026',
  'KPI & reporting',
];
