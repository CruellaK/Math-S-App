/* ═══════════════════════════════════════════════════
   CONSTANTS — Classes, subjects, default data
   ═══════════════════════════════════════════════════ */

export const DEFAULT_CLASS_NAMES = ['Terminale', 'Troisième', 'PPC', 'Primaire'];

export const CLASSES = DEFAULT_CLASS_NAMES;

export const SUBJECTS = [
  { id: 1, name: 'Mathématiques', icon: 'calculator', color: '#f5b83d' },
  { id: 2, name: 'Physique-Chimie', icon: 'atom', color: '#3b82f6' },
  { id: 3, name: 'SVT', icon: 'leaf', color: '#22c55e' },
  { id: 4, name: 'Français', icon: 'book-open', color: '#8b5cf6' },
  { id: 5, name: 'Anglais', icon: 'globe', color: '#ef4444' },
  { id: 6, name: 'Histoire-Géographie', icon: 'map', color: '#f97316' },
  { id: 7, name: 'Malagasy', icon: 'flag', color: '#06b6d4' },
  { id: 8, name: 'EPS', icon: 'dumbbell', color: '#84cc16' },
];

export const SUBJECT_ICON_OPTIONS = [
  { value: 'calculator', label: 'Calculatrice' },
  { value: 'atom', label: 'Atome' },
  { value: 'leaf', label: 'Feuille' },
  { value: 'book-open', label: 'Livre' },
  { value: 'globe', label: 'Globe' },
  { value: 'map', label: 'Carte' },
  { value: 'flag', label: 'Drapeau' },
  { value: 'dumbbell', label: 'Haltère' },
];

export const PARCOURS = [
  { id: 'mention_bien', label: 'Mention Bien', minScore: 12 },
  { id: 'mention_tres_bien', label: 'Mention Très Bien', minScore: 16 },
];

export const DEFAULT_OBJECTIVE_GROUP_ID = 'objectif_mention_tres_bien';

export const CONTENT_OBJECTIVE_GROUPS = [
  { id: DEFAULT_OBJECTIVE_GROUP_ID, label: 'Objectif mention très bien' },
  { id: 'objectif_mention_restreinte', label: 'Objectif mention restreinte' },
];

export const DEFAULT_CONTENT_DIFFICULTY = 'tres_bien';

export const CONTENT_DIFFICULTY_LEVELS = [
  { id: 'debutant', label: 'Débutant', shortLabel: 'D' },
  { id: 'faible', label: 'Faible', shortLabel: 'F' },
  { id: 'moyen', label: 'Moyen', shortLabel: 'M' },
  { id: 'assez_bien', label: 'Assez bien', shortLabel: 'AB' },
  { id: 'bien', label: 'Bien', shortLabel: 'B' },
  { id: 'tres_bien', label: 'Très bien', shortLabel: 'TB' },
  { id: 'parfait', label: 'Parfait', shortLabel: 'P' },
];

export const QUIZ_TYPES = ['mcq', 'input', 'trap', 'logic-sorter', 'redaction', 'block-input'];

export const SCORE_CONFIG = {
  correctBase: 10,
  wrongPenalty: -10,
  hintCost: -3,
  starValue: 5,
  timeBonus: 2,
  verifyLineEnergyCost: 1,
  translateQuestionCost: 2,
  translateOptionCost: 1,
};

export const DEFAULT_SCORE_CAPS = {
  energy: 100,
  credits: 999,
  globalScore: 9999,
  fire: 999,
  stars: 999,
};

export const DEFAULT_SUBJECT_TRANSLATION_SETTINGS = {
  energyCost: 4,
  optionEnergyCost: 2,
  hintPackCost: 1,
};

export const DEFAULT_STUDENT_IDENTITY = {
  mode: 'device',
  studentId: '',
  remoteUserId: '',
  email: '',
  displayName: '',
  authProvider: 'local',
  role: 'student',
};

export const DEFAULT_PROFILE_AUTH = {
  provider: 'local',
  googleEnabled: false,
  firebaseEnabled: false,
  supabaseEnabled: false,
  remoteProfileId: '',
  remoteUserId: '',
  lastAuthAt: '',
};

export const DEFAULT_SYNC_SETTINGS = {
  mode: 'local',
  provider: 'none',
  autoSync: false,
  lastSyncedAt: '',
  lastSyncStatus: 'idle',
  pendingLocalChanges: false,
  conflictStrategy: 'online-first',
};

export const DEFAULT_USER = {
  xp: 0,
  xpGoal: 1000,
  streak: 0,
  stars: 0,
  blockedSubjectIds: [],
  unlockedSubjectIds: [],
  credits: 30,
  globalScore: 0,
  averageScore: 0,
  energy: 100,
  fire: 0,
  history: [],
  badges: [],
  selectedClass: 'Terminale',
  profileName: 'Élève BacBooster',
  avatar: '',
  studentIdentity: { ...DEFAULT_STUDENT_IDENTITY },
  inventory: {
    hints: 0,
    hintsMinor: 0,
    hintsMajor: 0,
    hintsCritical: 0,
    timeBoosts: 0,
  },
  stats: {
    sessionsCompleted: 0,
    perfectSessions: 0,
    totalQuestionsCompleted: 0,
    totalVerifications: 0,
    goodVerifications: 0,
    badVerifications: 0,
    mandatoryCheckpointsTotal: 0,
    mandatoryCheckpointsPassed: 0,
    fastestQuestionSeconds: null,
    averageQuestionSeconds: 0,
    averageScoreSum: 0,
    averageSamples: 0,
    bestAverageScore: 0,
    totalHintsUsed: 0,
    timeStudiedSeconds: 0,
    bestFire: 0,
    subjectPerformance: {},
    recentSessions: [],
  },
};

export const DEFAULT_SETTINGS = {
  uiSoundEnabled: true,
  uiSound: 'bubble',
  enableWordBankAnimation: false,
  selectedClass: 'Terminale',
  adminPassword: '8765',
  finalScoreScale: 100,
  enableScoreCaps: true,
  scoreCaps: { ...DEFAULT_SCORE_CAPS },
  sync: { ...DEFAULT_SYNC_SETTINGS },
};

export const DEFAULT_ADMIN_STATE = {
  ownerRemoteUserId: '',
  ownerEmail: '',
  ownerDisplayName: '',
  ownerAvatar: '',
  lastClaimedAt: '',
  sessionScope: 'none',
};

export function createDefaultTimingDefaults() {
  return {
    quizQuestionDelaySeconds: 0,
    advancedQuizQuestionDelaySeconds: 35,
    exerciseDelaySeconds: 7200,
    examDelaySeconds: 10800,
    enonceDelaySeconds: 180,
    brouillonDelaySeconds: 300,
    treatmentDelaySeconds: 1200,
    questionDelaySeconds: 240,
    stepDelaySeconds: 120,
    refreshDelaySeconds: 90,
  };
}

export function createSubjectShell(subject = {}) {
  return {
    ...subject,
    id: Number(subject.id) || 1,
    name: subject.name || 'Nouvelle matière',
    icon: subject.icon || 'book-open',
    color: subject.color || '#8b5cf6',
    objectiveGroup: subject.objectiveGroup || DEFAULT_OBJECTIVE_GROUP_ID,
    defaultDifficulty: subject.defaultDifficulty || DEFAULT_CONTENT_DIFFICULTY,
    chapters: Array.isArray(subject.chapters) ? subject.chapters : [],
    scoreScale: [80, 100].includes(Number(subject.scoreScale)) ? Number(subject.scoreScale) : 100,
    coefficient: Math.max(1, Math.round(Number(subject.coefficient) || 1)),
    timingDefaults: {
      ...createDefaultTimingDefaults(),
      ...(subject.timingDefaults || {}),
    },
    translationSettings: {
      ...DEFAULT_SUBJECT_TRANSLATION_SETTINGS,
      ...(subject.translationSettings || {}),
    },
  };
}

export function createSubjectShells() {
  return SUBJECTS.map(subject => createSubjectShell(subject));
}

export function normalizeClassName(value, fallback = DEFAULT_CLASS_NAMES[0]) {
  const normalized = (value || '').toString().trim();
  return normalized || fallback;
}

// Class-level defaults : pour chaque classe, on peut bloquer des matières par défaut.
// Les élèves de cette classe verront ces matières bloquées sauf s'ils ont la matière
// dans leur user.unlockedSubjectIds (déblocage personnel).
export function createDefaultClassDefaults(classNames = DEFAULT_CLASS_NAMES) {
  const safeNames = [...new Set((Array.isArray(classNames) ? classNames : DEFAULT_CLASS_NAMES)
    .map((className) => normalizeClassName(className, ''))
    .filter(Boolean))];
  return Object.fromEntries(safeNames.map((cls) => [cls, { blockedSubjectIds: [] }]));
}

export function createDefaultClassContent(classNames = DEFAULT_CLASS_NAMES, options = {}) {
  const withDefaultSubjects = Boolean(options.withDefaultSubjects);
  const safeNames = [...new Set((Array.isArray(classNames) ? classNames : DEFAULT_CLASS_NAMES)
    .map(className => normalizeClassName(className, ''))
    .filter(Boolean))];

  return Object.fromEntries(safeNames.map(cls => [cls, withDefaultSubjects ? createSubjectShells() : []]));
}

export function createDefaultProfile(profile = {}) {
  const selectedClass = normalizeClassName(
    profile.user?.selectedClass || profile.settings?.selectedClass || profile.selectedClass,
    DEFAULT_CLASS_NAMES[0]
  );
  const classContent = profile.classContent || createDefaultClassContent(DEFAULT_CLASS_NAMES, { withDefaultSubjects: true });

  return {
    id: (profile.id || '').toString().trim(),
    createdAt: (profile.createdAt || '').toString(),
    updatedAt: (profile.updatedAt || '').toString(),
    auth: {
      ...DEFAULT_PROFILE_AUTH,
      ...(profile.auth || {}),
    },
    user: {
      ...DEFAULT_USER,
      ...(profile.user || {}),
      selectedClass,
      studentIdentity: {
        ...DEFAULT_STUDENT_IDENTITY,
        ...(profile.user?.studentIdentity || {}),
      },
      inventory: {
        ...DEFAULT_USER.inventory,
        ...(profile.user?.inventory || {}),
      },
      stats: {
        ...DEFAULT_USER.stats,
        ...(profile.user?.stats || {}),
      },
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(profile.settings || {}),
      selectedClass,
      scoreCaps: {
        ...DEFAULT_SCORE_CAPS,
        ...(profile.settings?.scoreCaps || {}),
      },
      sync: {
        ...DEFAULT_SYNC_SETTINGS,
        ...(profile.settings?.sync || {}),
      },
    },
    classContent,
    subjects: Array.isArray(profile.subjects) ? profile.subjects : (classContent[selectedClass] || createSubjectShells()),
    starQuizzes: Array.isArray(profile.starQuizzes) ? profile.starQuizzes : [],
    traitementSujets: Array.isArray(profile.traitementSujets) ? profile.traitementSujets : [],
    exerciceScolaires: Array.isArray(profile.exerciceScolaires) ? profile.exerciceScolaires : [],
    exerciceGlobaux: Array.isArray(profile.exerciceGlobaux) ? profile.exerciceGlobaux : [],
  };
}

export function createDefaultData() {
  const defaultProfile = createDefaultProfile({ id: 'student-1' });
  return {
    admin: { ...DEFAULT_ADMIN_STATE },
    activeProfileId: defaultProfile.id,
    profileOrder: [defaultProfile.id],
    profiles: {
      [defaultProfile.id]: defaultProfile,
    },
    classDefaults: createDefaultClassDefaults(DEFAULT_CLASS_NAMES),
    user: defaultProfile.user,
    subjects: defaultProfile.subjects,
    classContent: defaultProfile.classContent,
    settings: defaultProfile.settings,
    starQuizzes: defaultProfile.starQuizzes,
    traitementSujets: defaultProfile.traitementSujets,
    exerciceScolaires: defaultProfile.exerciceScolaires,
    exerciceGlobaux: defaultProfile.exerciceGlobaux,
  };
}
