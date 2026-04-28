import { DEFAULT_SCORE_CAPS, DEFAULT_STUDENT_IDENTITY, DEFAULT_SYNC_SETTINGS } from './constants';

export const SHOP_ITEMS = [
  {
    id: 'hint_pack_universal',
    label: 'Pack d’indices universel',
    description: 'Ajoute 3 packs d’indice utilisables partout, y compris pour les traductions.',
    price: 9,
    compareAtPrice: 12,
    promoLabel: 'Promo méthode',
    inventoryKey: 'hints',
    quantity: 3,
    accent: 'primary',
  },
  {
    id: 'hint_pack_minor',
    label: 'Pack indice mineur',
    description: 'Ajoute 4 packs pour les indices d’orientation rapide.',
    price: 5,
    compareAtPrice: 7,
    promoLabel: 'Offre découverte',
    inventoryKey: 'hintsMinor',
    quantity: 4,
    accent: 'blue',
  },
  {
    id: 'hint_pack_major',
    label: 'Pack indice majeur',
    description: 'Ajoute 3 packs pour les indices de méthode.',
    price: 8,
    compareAtPrice: 10,
    promoLabel: 'Méthode ciblée',
    inventoryKey: 'hintsMajor',
    quantity: 3,
    accent: 'primary',
  },
  {
    id: 'hint_pack_critical',
    label: 'Pack indice critique',
    description: 'Ajoute 2 packs pour les indices les plus puissants.',
    price: 10,
    compareAtPrice: 13,
    promoLabel: 'Secours premium',
    inventoryKey: 'hintsCritical',
    quantity: 2,
    accent: 'red',
  },
  {
    id: 'time_boost',
    label: 'Bonus de temps',
    description: 'Ajoute 15 minutes à un chronomètre pendant une session.',
    price: 14,
    compareAtPrice: 18,
    promoLabel: 'Flash révision',
    inventoryKey: 'timeBoosts',
    quantity: 1,
    accent: 'green',
  },
];

export const BADGE_DEFINITIONS = [
  {
    id: 'speed_runner',
    label: 'Rapide comme l’éclair',
    description: 'Terminer une session avec moins de 20 secondes de moyenne par question.',
  },
  {
    id: 'zero_fault',
    label: 'Zéro Faute',
    description: 'Réussir une session sans mauvaise vérification.',
  },
  {
    id: 'methodologist',
    label: 'Méthodologue',
    description: 'Valider 100% des micro-étapes obligatoires sur un sujet ou exercice.',
  },
  {
    id: 'rich_mind',
    label: 'Capital Stratégique',
    description: 'Atteindre 120 crédits.',
  },
  {
    id: 'xp_1000',
    label: '1 000 XP',
    description: 'Accumuler 1 000 XP.',
  },
  {
    id: 'session_master',
    label: 'Mention Très Bien',
    description: 'Obtenir au moins 85% sur une session.',
  },
];

export function clampFloor(value, floor = 0) {
  return Math.max(floor, Number.isFinite(Number(value)) ? Number(value) : floor);
}

export function clampRange(value, min = 0, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeScoreCaps(rawCaps = {}) {
  return {
    energy: Math.max(1, clampFloor(rawCaps.energy ?? DEFAULT_SCORE_CAPS.energy, 1)),
    credits: Math.max(1, clampFloor(rawCaps.credits ?? DEFAULT_SCORE_CAPS.credits, 1)),
    globalScore: Math.max(1, clampFloor(rawCaps.globalScore ?? DEFAULT_SCORE_CAPS.globalScore, 1)),
    fire: Math.max(1, clampFloor(rawCaps.fire ?? DEFAULT_SCORE_CAPS.fire, 1)),
    stars: Math.max(1, clampFloor(rawCaps.stars ?? DEFAULT_SCORE_CAPS.stars, 1)),
  };
}

export function applyUserScoreCaps(user = {}, settings = {}) {
  const caps = normalizeScoreCaps(settings?.scoreCaps);
  const capOtherScores = settings?.enableScoreCaps !== false;
  return {
    ...user,
    energy: clampRange(user.energy, 0, caps.energy),
    credits: capOtherScores ? clampRange(user.credits, 0, caps.credits) : clampFloor(user.credits),
    globalScore: capOtherScores ? clampRange(user.globalScore, 0, caps.globalScore) : clampFloor(user.globalScore),
    fire: capOtherScores ? clampRange(user.fire, 0, caps.fire) : clampFloor(user.fire),
    streak: capOtherScores ? clampRange(user.streak ?? user.fire, 0, caps.fire) : clampFloor(user.streak ?? user.fire),
    stars: capOtherScores ? clampRange(user.stars, 0, caps.stars) : clampFloor(user.stars),
  };
}

function roundMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

export function sanitizeStudentIdentity(identity = {}) {
  return {
    mode: ['device', 'shared', 'cloud'].includes(identity?.mode) ? identity.mode : DEFAULT_STUDENT_IDENTITY.mode,
    studentId: (identity?.studentId || '').toString().trim(),
    remoteUserId: (identity?.remoteUserId || '').toString().trim(),
    email: (identity?.email || '').toString().trim(),
    displayName: (identity?.displayName || '').toString().trim(),
    authProvider: (identity?.authProvider || DEFAULT_STUDENT_IDENTITY.authProvider).toString().trim() || DEFAULT_STUDENT_IDENTITY.authProvider,
    role: (identity?.role || DEFAULT_STUDENT_IDENTITY.role).toString().trim() || DEFAULT_STUDENT_IDENTITY.role,
  };
}

export function sanitizeSyncSettings(sync = {}) {
  return {
    mode: ['local', 'cloud-ready', 'hybrid'].includes(sync?.mode) ? sync.mode : DEFAULT_SYNC_SETTINGS.mode,
    provider: (sync?.provider || DEFAULT_SYNC_SETTINGS.provider).toString().trim() || DEFAULT_SYNC_SETTINGS.provider,
    autoSync: Boolean(sync?.autoSync),
    lastSyncedAt: (sync?.lastSyncedAt || '').toString(),
    lastSyncStatus: ['idle', 'pending', 'success', 'error'].includes(sync?.lastSyncStatus) ? sync.lastSyncStatus : DEFAULT_SYNC_SETTINGS.lastSyncStatus,
    pendingLocalChanges: Boolean(sync?.pendingLocalChanges),
    conflictStrategy: ['local-first', 'remote-first', 'manual'].includes(sync?.conflictStrategy) ? sync.conflictStrategy : DEFAULT_SYNC_SETTINGS.conflictStrategy,
  };
}

export function sanitizeUserData(user = {}, settings = {}) {
  const stats = user.stats || {};
  const inventory = user.inventory || {};
  const blockedSubjectIds = [...new Set(
    (Array.isArray(user.blockedSubjectIds) ? user.blockedSubjectIds : [])
      .map((subjectId) => String(subjectId || '').trim())
      .filter(Boolean)
  )];
  const unlockedSubjectIds = [...new Set(
    (Array.isArray(user.unlockedSubjectIds) ? user.unlockedSubjectIds : [])
      .map((subjectId) => String(subjectId || '').trim())
      .filter(Boolean)
  )];
  const safeAverageScore = clampRange(user.averageScore ?? (user.globalScore ? Number(user.globalScore) / 5 : 0), 0, 20);
  const safeFire = clampFloor(user.fire ?? user.streak);
  const caps = normalizeScoreCaps(settings?.scoreCaps);
  const safeEnergy = clampRange(user.energy ?? caps.energy, 0, caps.energy);
  const averageScoreSum = Number.isFinite(Number(stats.averageScoreSum))
    ? Number(stats.averageScoreSum)
    : safeAverageScore * clampFloor(stats.averageSamples);
  const subjectPerformance = Object.entries(stats.subjectPerformance || {}).reduce((acc, [subjectId, entry]) => {
    if (!entry || typeof entry !== 'object') return acc;
    const sessions = clampFloor(entry.sessions);
    const averageSum = Number.isFinite(Number(entry.averageSum)) ? Number(entry.averageSum) : clampRange(entry.average, 0, 20) * sessions;
    const weightedSamples = clampFloor(entry.weightedSamples || sessions);
    const timingSum = Number.isFinite(Number(entry.timingSum)) ? Number(entry.timingSum) : clampFloor(entry.averageQuestionSeconds) * sessions;
    acc[subjectId] = {
      sessions,
      averageSum,
      weightedSamples,
      average: weightedSamples > 0 ? roundMetric(averageSum / weightedSamples) : 0,
      best: clampRange(entry.best, 0, 20),
      lastScore: clampRange(entry.lastScore, 0, 20),
      lastPlayedAt: entry.lastPlayedAt || '',
      timingSum,
      averageQuestionSeconds: sessions > 0 ? roundMetric(timingSum / sessions) : 0,
      bestQuestionSeconds: clampFloor(entry.bestQuestionSeconds),
      lastQuestionSeconds: clampFloor(entry.lastQuestionSeconds),
    };
    return acc;
  }, {});

  return applyUserScoreCaps({
    xp: clampFloor(user.xp),
    xpGoal: clampFloor(user.xpGoal || 1000, 1000),
    streak: safeFire,
    stars: clampFloor(user.stars),
    credits: clampFloor(user.credits ?? 30),
    globalScore: clampFloor(user.globalScore),
    averageScore: safeAverageScore,
    energy: safeEnergy,
    fire: safeFire,
    history: Array.isArray(user.history) ? user.history : [],
    badges: Array.isArray(user.badges) ? user.badges : [],
    blockedSubjectIds,
    unlockedSubjectIds,
    selectedClass: user.selectedClass || 'Terminale',
    profileName: user.profileName || 'Élève BacBooster',
    avatar: user.avatar || '',
    studentIdentity: sanitizeStudentIdentity(user.studentIdentity),
    inventory: {
      hints: clampFloor(inventory.hints),
      hintsMinor: clampFloor(inventory.hintsMinor),
      hintsMajor: clampFloor(inventory.hintsMajor),
      hintsCritical: clampFloor(inventory.hintsCritical),
      timeBoosts: clampFloor(inventory.timeBoosts),
    },
    stats: {
      sessionsCompleted: clampFloor(stats.sessionsCompleted),
      perfectSessions: clampFloor(stats.perfectSessions),
      totalQuestionsCompleted: clampFloor(stats.totalQuestionsCompleted),
      totalVerifications: clampFloor(stats.totalVerifications),
      goodVerifications: clampFloor(stats.goodVerifications),
      badVerifications: clampFloor(stats.badVerifications),
      mandatoryCheckpointsTotal: clampFloor(stats.mandatoryCheckpointsTotal),
      mandatoryCheckpointsPassed: clampFloor(stats.mandatoryCheckpointsPassed),
      fastestQuestionSeconds: Number.isFinite(Number(stats.fastestQuestionSeconds)) ? Number(stats.fastestQuestionSeconds) : null,
      averageQuestionSeconds: clampFloor(stats.averageQuestionSeconds),
      averageScoreSum,
      averageSamples: clampFloor(stats.averageSamples),
      bestAverageScore: clampRange(stats.bestAverageScore, 0, 20),
      totalHintsUsed: clampFloor(stats.totalHintsUsed),
      timeStudiedSeconds: clampFloor(stats.timeStudiedSeconds),
      bestFire: clampFloor(stats.bestFire),
      subjectPerformance,
      recentSessions: Array.isArray(stats.recentSessions) ? stats.recentSessions : [],
    },
  }, settings);
}

export function sanitizeSettings(settings = {}) {
  const caps = normalizeScoreCaps(settings.scoreCaps);
  return {
    uiSoundEnabled: settings.uiSoundEnabled !== false,
    uiSound: settings.uiSound || 'bubble',
    enableWordBankAnimation: Boolean(settings.enableWordBankAnimation),
    selectedClass: settings.selectedClass || 'Terminale',
    adminPassword: (settings.adminPassword || '8765').toString(),
    finalScoreScale: [80, 100].includes(Number(settings.finalScoreScale)) ? Number(settings.finalScoreScale) : 100,
    enableScoreCaps: settings.enableScoreCaps !== false,
    scoreCaps: caps,
    sync: sanitizeSyncSettings(settings.sync),
  };
}

export function getFinalScoreScale(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if ([80, 100].includes(parsed)) return parsed;
  }
  return 100;
}

export function formatSessionHistoryEntry(sessionSummary = {}) {
  const scoreValue = Number.isFinite(Number(sessionSummary.displayScore)) ? Number(sessionSummary.displayScore) : 0;
  const scoreScale = getFinalScoreScale(sessionSummary.scoreScale);
  const average20 = clampRange(sessionSummary.average20, 0, 20);
  return {
    date: new Date().toLocaleDateString(),
    chapter: sessionSummary.title || 'Session',
    score: `${average20}/20`,
    type: sessionSummary.sessionKind || 'quiz',
    subjectId: sessionSummary.subjectId || null,
    subjectName: sessionSummary.subjectName || '',
    noteScale: `${scoreValue}/${scoreScale}`,
    average20,
    credits: clampFloor(sessionSummary.creditsDelta),
    xp: clampFloor(sessionSummary.xpDelta),
    energy: Number(sessionSummary.energyDelta) || 0,
    fire: Number(sessionSummary.fireDelta) || 0,
    globalScore: clampFloor(sessionSummary.globalScoreDelta),
    verifyCount: clampFloor(sessionSummary.verifyCount),
    goodVerifications: clampFloor(sessionSummary.goodVerifications),
    badVerifications: clampFloor(sessionSummary.badVerifications),
    hintsUsed: clampFloor(sessionSummary.hintsUsed),
    averageQuestionSeconds: clampFloor(sessionSummary.averageQuestionSeconds),
    subjectCoefficient: Math.max(1, clampFloor(sessionSummary.subjectCoefficient, 1)),
    timeSpentSeconds: clampFloor(sessionSummary.timeSpentSeconds),
    timeLimitSeconds: clampFloor(sessionSummary.timeLimitSeconds),
  };
}

export function mergeSessionStats(user, sessionSummary = {}, settings = {}) {
  const safeUser = sanitizeUserData(user, settings);
  const subjectCoefficient = Math.max(1, clampFloor(sessionSummary.subjectCoefficient, 1));
  const averageWeight = Math.max(1, clampFloor(sessionSummary.averageWeight, 1)) * subjectCoefficient;
  const questionTimes = Array.isArray(sessionSummary.questionTimes)
    ? sessionSummary.questionTimes.map(entry => clampFloor(entry.seconds)).filter(value => value > 0)
    : [];
  const fastestQuestionSeconds = questionTimes.length
    ? Math.min(...questionTimes, safeUser.stats.fastestQuestionSeconds || Number.POSITIVE_INFINITY)
    : safeUser.stats.fastestQuestionSeconds;
  const totalQuestionSeconds = (safeUser.stats.averageQuestionSeconds || 0) * (safeUser.stats.sessionsCompleted || 0) + clampFloor(sessionSummary.averageQuestionSeconds);
  const nextSessionsCompleted = safeUser.stats.sessionsCompleted + 1;
  const nextAverageSamples = safeUser.stats.averageSamples + averageWeight;
  const nextAverageScoreSum = roundMetric((safeUser.stats.averageScoreSum || 0) + (clampRange(sessionSummary.average20, 0, 20) * averageWeight), 4);
  const nextHistory = [formatSessionHistoryEntry(sessionSummary), ...safeUser.history].slice(0, 40);
  const nextSubjectPerformance = { ...(safeUser.stats.subjectPerformance || {}) };
  if (sessionSummary.subjectId != null) {
    const subjectKey = String(sessionSummary.subjectId);
    const previous = nextSubjectPerformance[subjectKey] || {
      sessions: 0,
      averageSum: 0,
      weightedSamples: 0,
      average: 0,
      best: 0,
      lastScore: 0,
      lastPlayedAt: '',
      timingSum: 0,
      averageQuestionSeconds: 0,
      bestQuestionSeconds: 0,
      lastQuestionSeconds: 0,
    };
    const sessions = clampFloor(previous.sessions) + 1;
    const weightedSamples = clampFloor(previous.weightedSamples || previous.sessions) + averageWeight;
    const averageSum = roundMetric((Number(previous.averageSum) || 0) + (clampRange(sessionSummary.average20, 0, 20) * averageWeight), 4);
    const lastScore = clampRange(sessionSummary.average20, 0, 20);
    const lastQuestionSeconds = clampFloor(sessionSummary.averageQuestionSeconds);
    const timingSum = clampFloor(previous.timingSum) + lastQuestionSeconds;
    const previousBestQuestionSeconds = clampFloor(previous.bestQuestionSeconds);
    const bestQuestionSeconds = lastQuestionSeconds > 0
      ? (previousBestQuestionSeconds > 0 ? Math.min(previousBestQuestionSeconds, lastQuestionSeconds) : lastQuestionSeconds)
      : previousBestQuestionSeconds;
    nextSubjectPerformance[subjectKey] = {
      sessions,
      averageSum,
      weightedSamples,
      average: weightedSamples > 0 ? roundMetric(averageSum / weightedSamples) : 0,
      best: Math.max(clampRange(previous.best, 0, 20), lastScore),
      lastScore,
      lastPlayedAt: new Date().toISOString(),
      timingSum,
      averageQuestionSeconds: sessions > 0 ? roundMetric(timingSum / sessions) : 0,
      bestQuestionSeconds,
      lastQuestionSeconds,
    };
  }

  const nextStats = {
    ...safeUser.stats,
    sessionsCompleted: nextSessionsCompleted,
    perfectSessions: safeUser.stats.perfectSessions + (sessionSummary.badVerifications === 0 && sessionSummary.hintsUsed === 0 ? 1 : 0),
    totalQuestionsCompleted: safeUser.stats.totalQuestionsCompleted + clampFloor(sessionSummary.totalQuestions),
    totalVerifications: safeUser.stats.totalVerifications + clampFloor(sessionSummary.verifyCount),
    goodVerifications: safeUser.stats.goodVerifications + clampFloor(sessionSummary.goodVerifications),
    badVerifications: safeUser.stats.badVerifications + clampFloor(sessionSummary.badVerifications),
    mandatoryCheckpointsTotal: safeUser.stats.mandatoryCheckpointsTotal + clampFloor(sessionSummary.mandatoryCheckpointsTotal),
    mandatoryCheckpointsPassed: safeUser.stats.mandatoryCheckpointsPassed + clampFloor(sessionSummary.mandatoryCheckpointsPassed),
    fastestQuestionSeconds: Number.isFinite(fastestQuestionSeconds) ? fastestQuestionSeconds : null,
    averageQuestionSeconds: Math.round(totalQuestionSeconds / nextSessionsCompleted),
    averageScoreSum: nextAverageScoreSum,
    averageSamples: nextAverageSamples,
    bestAverageScore: Math.max(clampRange(safeUser.stats.bestAverageScore, 0, 20), clampRange(sessionSummary.average20, 0, 20)),
    totalHintsUsed: safeUser.stats.totalHintsUsed + clampFloor(sessionSummary.hintsUsed),
    timeStudiedSeconds: safeUser.stats.timeStudiedSeconds + clampFloor(sessionSummary.timeSpentSeconds),
    bestFire: Math.max(clampFloor(safeUser.stats.bestFire), clampFloor(sessionSummary.fireAfter ?? safeUser.fire)),
    subjectPerformance: nextSubjectPerformance,
    recentSessions: [sessionSummary, ...(safeUser.stats.recentSessions || [])].slice(0, 20),
  };

  return applyUserScoreCaps({
    ...safeUser,
    history: nextHistory,
    stats: nextStats,
  }, settings);
}

export function deriveBadges(user) {
  const safeUser = sanitizeUserData(user);
  const recentSessions = safeUser.stats.recentSessions || [];
  const mandatoryRate = safeUser.stats.mandatoryCheckpointsTotal > 0
    ? Math.round((safeUser.stats.mandatoryCheckpointsPassed / safeUser.stats.mandatoryCheckpointsTotal) * 100)
    : 0;
  const earned = BADGE_DEFINITIONS.filter(def => {
    switch (def.id) {
      case 'speed_runner':
        return recentSessions.some(session => clampFloor(session.averageQuestionSeconds) > 0 && clampFloor(session.averageQuestionSeconds) <= 20);
      case 'zero_fault':
        return recentSessions.some(session => clampFloor(session.badVerifications) === 0 && clampFloor(session.hintsUsed) === 0 && clampRange(session.average20, 0, 20) >= 14);
      case 'methodologist':
        return recentSessions.some(session => session.sessionKind === 'exercise-flow' && (clampFloor(session.mandatorySuccessRate) === 100 || (clampFloor(session.goodVerifications) >= clampFloor(session.totalQuestions) && clampRange(session.average20, 0, 20) >= 14))) || mandatoryRate === 100;
      case 'rich_mind':
        return safeUser.credits >= 120;
      case 'xp_1000':
        return safeUser.xp >= 1000;
      case 'session_master':
        return recentSessions.some(session => clampRange(session.average20, 0, 20) >= 17);
      default:
        return false;
    }
  }).map(def => def.id);

  return [...new Set([...(safeUser.badges || []), ...earned])];
}

export function buildMention(scorePercent) {
  if (scorePercent >= 90) return 'Mention Très Bien !';
  if (scorePercent >= 75) return 'Bravo !';
  if (scorePercent >= 60) return 'Mention Bien';
  if (scorePercent >= 45) return 'Continue !';
  return 'Reprends la méthode';
}
