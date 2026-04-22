import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getAdminPassword, storage } from '../lib/store';
import {
  CLASSES,
  DEFAULT_ADMIN_STATE,
  createDefaultProfile,
  createSubjectShell,
  createDefaultClassContent,
  createDefaultData,
  createDefaultTimingDefaults,
  createSubjectShells,
  DEFAULT_SUBJECT_TRANSLATION_SETTINGS,
  normalizeClassName,
} from '../lib/constants';
import { hasPlayableCompositeContent, hasPlayableQuizContent } from '../lib/contentVisibility';
import { stripBuiltInDemoData } from '../lib/demoData';
import {
  SHOP_ITEMS,
  clampFloor,
  clampRange,
  deriveBadges,
  mergeSessionStats,
  sanitizeSettings,
  sanitizeUserData,
} from '../lib/progression';
import SoundEngine from '../lib/sounds';
import {
  getSupabaseClient,
  getSupabaseSession,
  isSupabaseConfigured,
  onSupabaseAuthStateChange,
  signInWithGoogle,
  signOutSupabase,
} from '../lib/supabase';
import {
  clearSharedAdminRegistry,
  deleteSupabaseProfiles,
  getSharedAdminRegistry,
  getSharedContentRegistry,
  listSupabaseAccounts,
  listSupabaseProfiles,
  listSupabaseProfilesWithPayload,
  pullProfileFromSupabase,
  pushProfileToSupabase,
  setSharedContentRegistry,
  setSharedAdminRegistry,
  SHARED_ADMIN_REMOTE_USER_ID,
  SHARED_CONTENT_REMOTE_USER_ID,
} from '../lib/cloudSync';

const AppContext = createContext(null);

function normalizeSubjectLabel(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getBuiltInSubjectKey(normalizedName) {
  if (normalizedName === 'physique' || normalizedName === 'physique chimie') return 'id:2';
  if (normalizedName === 'mathematiques' || normalizedName === 'maths') return 'id:1';
  if (normalizedName === 'svt' || normalizedName === 'science de la vie et de la terre') return 'id:3';
  if (normalizedName === 'francais') return 'id:4';
  if (normalizedName === 'anglais') return 'id:5';
  if (normalizedName === 'histoire geographie' || normalizedName === 'histoire geo') return 'id:6';
  if (normalizedName === 'malagasy') return 'id:7';
  if (normalizedName === 'eps') return 'id:8';
  return '';
}

function getCanonicalSubjectKey(subject) {
  const normalizedName = normalizeSubjectLabel(subject?.name);
  const builtInKey = getBuiltInSubjectKey(normalizedName);
  if (builtInKey) return builtInKey;
  if (Number(subject?.id) > 0) return `id:${Number(subject.id)}`;
  return `name:${normalizedName}`;
}

function getFloatingLabel(kind) {
  if (kind === 'credits') return 'Crédits';
  if (kind === 'globalScore') return 'Score';
  if (kind === 'energy') return 'Énergie';
  if (kind === 'fire') return 'Feu';
  if (kind === 'xp') return 'XP';
  if (kind === 'hints') return 'Indices';
  if (kind === 'translations') return 'Traductions';
  if (kind === 'timeBoosts') return 'Bonus temps';
  return kind;
}

function normalizeTimingDefaults(timingDefaults) {
  const base = createDefaultTimingDefaults();
  return Object.fromEntries(Object.entries(base).map(([key, fallback]) => {
    const numeric = Number(timingDefaults?.[key]);
    return [key, Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback];
  }));
}

function normalizeTranslationSettings(translationSettings) {
  return {
    energyCost: Math.max(1, Math.round(Number(translationSettings?.energyCost) || DEFAULT_SUBJECT_TRANSLATION_SETTINGS.energyCost)),
    optionEnergyCost: Math.max(1, Math.round(Number(translationSettings?.optionEnergyCost) || DEFAULT_SUBJECT_TRANSLATION_SETTINGS.optionEnergyCost)),
    hintPackCost: Math.max(1, Math.round(Number(translationSettings?.hintPackCost) || DEFAULT_SUBJECT_TRANSLATION_SETTINGS.hintPackCost)),
  };
}

function getAvailableClasses(classContent, selectedClass) {
  return [...new Set([
    ...CLASSES,
    ...Object.keys(classContent || {}).map((className) => normalizeClassName(className, '')).filter(Boolean),
    normalizeClassName(selectedClass, CLASSES[0]),
  ])];
}

function normalizeSubjectBucket(subjects, options = {}) {
  const fallbackSubjects = Array.isArray(options.fallbackSubjects) ? options.fallbackSubjects : [];
  const injectDefaultShells = Boolean(options.injectDefaultShells);
  const shells = injectDefaultShells ? createSubjectShells() : [];
  const source = Array.isArray(subjects) && subjects.length ? subjects : fallbackSubjects;
  const subjectMap = new Map();
  const keyOrder = [];

  (source || []).forEach((subject) => {
    const key = getCanonicalSubjectKey(subject);
    if (!subjectMap.has(key)) keyOrder.push(key);
    const previous = subjectMap.get(key) || {};
    subjectMap.set(key, {
      ...previous,
      ...subject,
      chapters: Array.isArray(subject?.chapters)
        ? subject.chapters
        : Array.isArray(previous?.chapters)
          ? previous.chapters
          : [],
    });
  });

  const consumedKeys = new Set();
  const normalizedShells = shells.map((shell) => {
    const idKey = `id:${Number(shell.id)}`;
    const nameKey = `name:${normalizeSubjectLabel(shell.name)}`;
    const match = subjectMap.get(idKey)
      || subjectMap.get(nameKey)
      || {};
    if (subjectMap.has(idKey)) consumedKeys.add(idKey);
    else if (subjectMap.has(nameKey)) consumedKeys.add(nameKey);
    return createSubjectShell({
      ...match,
      ...shell,
      chapters: Array.isArray(match.chapters) ? match.chapters : [],
      scoreScale: [80, 100].includes(Number(match.scoreScale)) ? Number(match.scoreScale) : 100,
      coefficient: Math.max(1, Math.round(Number(match.coefficient) || 1)),
      timingDefaults: normalizeTimingDefaults(match.timingDefaults),
      translationSettings: normalizeTranslationSettings(match.translationSettings),
    });
  });

  const nextCustomIdBase = [...normalizedShells, ...Array.from(subjectMap.values())].reduce((maxId, subject) => Math.max(maxId, Number(subject.id) || 0), 0);
  const extraSubjects = keyOrder
    .filter((key) => !consumedKeys.has(key))
    .map((key, index) => {
      const subject = subjectMap.get(key);
      return createSubjectShell({
      ...subject,
      id: Number(subject.id) || (nextCustomIdBase + index + 1),
      name: (subject.name || '').toString().trim() || `Matière ${index + 1}`,
      chapters: Array.isArray(subject.chapters) ? subject.chapters : [],
      scoreScale: [80, 100].includes(Number(subject.scoreScale)) ? Number(subject.scoreScale) : 100,
      coefficient: Math.max(1, Math.round(Number(subject.coefficient) || 1)),
      timingDefaults: normalizeTimingDefaults(subject.timingDefaults),
      translationSettings: normalizeTranslationSettings(subject.translationSettings),
      });
    });

  return [...normalizedShells, ...extraSubjects];
}

function normalizeClassContent(classContent, legacySubjects, selectedClass) {
  const classNames = getAvailableClasses(classContent, selectedClass);
  const baseMap = createDefaultClassContent(classNames, { withDefaultSubjects: true });
  const nextMap = { ...baseMap };

  classNames.forEach((className) => {
    nextMap[className] = normalizeSubjectBucket(classContent?.[className], {
      fallbackSubjects: baseMap[className],
      injectDefaultShells: true,
    });
  });

  if (Array.isArray(legacySubjects) && legacySubjects.length) {
    nextMap[selectedClass] = normalizeSubjectBucket(legacySubjects, {
      fallbackSubjects: nextMap[selectedClass],
      injectDefaultShells: true,
    });
  }

  return nextMap;
}

function sanitizeChapterStudentContent(chapter = {}) {
  const nextChapter = { ...chapter };

  if (Array.isArray(chapter?.quizzes)) {
    nextChapter.quizzes = chapter.quizzes.filter((item) => hasPlayableQuizContent(item));
  }

  if (Array.isArray(chapter?.sujetTypes)) {
    nextChapter.sujetTypes = chapter.sujetTypes.filter((item) => hasPlayableCompositeContent(item));
  }

  if (Array.isArray(chapter?.exercises)) {
    nextChapter.exercises = chapter.exercises.filter((item) => hasPlayableCompositeContent(item));
  }

  if (Array.isArray(chapter?.sections)) {
    nextChapter.sections = chapter.sections.filter((section) => {
      return section?.type === 'exercise'
        ? hasPlayableCompositeContent(section)
        : hasPlayableQuizContent(section);
    });
  }

  const hasPlayableContent = [
    nextChapter.quizzes,
    nextChapter.sujetTypes,
    nextChapter.exercises,
    nextChapter.sections,
  ].some((items) => Array.isArray(items) && items.length > 0);

  return hasPlayableContent ? nextChapter : null;
}

function sanitizeSubjectBucketForStudents(subjects = []) {
  const strippedSubjects = stripBuiltInDemoData(Array.isArray(subjects) ? subjects : [], {
    replaceLegacyDemo: true,
  });

  return strippedSubjects.map((subject) => ({
    ...subject,
    chapters: (Array.isArray(subject?.chapters) ? subject.chapters : [])
      .map((chapter) => sanitizeChapterStudentContent(chapter))
      .filter(Boolean),
  }));
}

function sanitizeClassContentForStudents(classContent = {}) {
  if (!classContent || typeof classContent !== 'object') return {};

  return Object.fromEntries(Object.entries(classContent).map(([className, bucket]) => {
    return [className, sanitizeSubjectBucketForStudents(bucket)];
  }));
}

function sanitizeProfileContentForStudents(profilePayload = {}) {
  const selectedClass = normalizeClassName(
    profilePayload?.user?.selectedClass || profilePayload?.settings?.selectedClass || CLASSES[0],
    CLASSES[0]
  );
  const sanitizedClassContent = sanitizeClassContentForStudents(profilePayload?.classContent || {});
  const sanitizedSubjects = sanitizeSubjectBucketForStudents(profilePayload?.subjects || []);

  return {
    ...profilePayload,
    classContent: sanitizedClassContent,
    subjects: sanitizedClassContent[selectedClass] || sanitizedSubjects,
  };
}

function resolveAuthoritativeStudentClassContent(sharedClassContent = null, fallbackClassContent = null) {
  const sanitizedSharedClassContent = sanitizeClassContentForStudents(sharedClassContent);
  if (Object.keys(sanitizedSharedClassContent).length) return sanitizedSharedClassContent;
  return sanitizeClassContentForStudents(fallbackClassContent);
}

function applyAuthoritativeStudentContent(profilePayload = {}, sharedClassContent = null, fallbackClassContent = null) {
  const sanitizedProfile = sanitizeProfileContentForStudents(profilePayload);
  const selectedClass = normalizeClassName(
    sanitizedProfile?.user?.selectedClass || sanitizedProfile?.settings?.selectedClass || CLASSES[0],
    CLASSES[0]
  );
  const authoritativeClassContent = resolveAuthoritativeStudentClassContent(sharedClassContent, fallbackClassContent || sanitizedProfile.classContent);

  return {
    ...sanitizedProfile,
    classContent: authoritativeClassContent,
    subjects: authoritativeClassContent[selectedClass] || [],
  };
}

function buildStudentProfileCloudPayload(profilePayload = {}) {
  const sanitizedProfile = sanitizeProfileContentForStudents(profilePayload);

  return {
    ...sanitizedProfile,
    classContent: {},
    subjects: [],
  };
}

function reconcileSharedClassContent(payload, sharedClassContent) {
  const normalized = normalizeAppData(payload);
  const sanitizedSharedClassContent = sanitizeClassContentForStudents(sharedClassContent);
  if (!Object.keys(sanitizedSharedClassContent).length) {
    return { changed: false, data: normalized };
  }

  let changed = false;
  const nextProfiles = {};

  (normalized.profileOrder || []).forEach((profileId) => {
    const profile = normalized.profiles?.[profileId];
    if (!profile) return;
    const selectedClass = normalizeClassName(
      profile?.user?.selectedClass || profile?.settings?.selectedClass || CLASSES[0],
      CLASSES[0]
    );
    const nextClassContent = normalizeClassContent(sanitizedSharedClassContent, [], selectedClass);
    const nextSubjects = nextClassContent[selectedClass] || [];
    if (
      JSON.stringify(profile?.classContent || {}) !== JSON.stringify(nextClassContent)
      || JSON.stringify(profile?.subjects || []) !== JSON.stringify(nextSubjects)
    ) {
      changed = true;
    }
    nextProfiles[profileId] = {
      ...profile,
      classContent: nextClassContent,
      subjects: nextSubjects,
    };
  });

  return {
    changed,
    data: changed
      ? normalizeAppData({
        ...normalized,
        profiles: nextProfiles,
      })
      : normalized,
  };
}

function normalizeProfileAuth(auth = {}) {
  return {
    provider: (auth?.provider || 'local').toString().trim() || 'local',
    googleEnabled: Boolean(auth?.googleEnabled),
    firebaseEnabled: Boolean(auth?.firebaseEnabled),
    supabaseEnabled: Boolean(auth?.supabaseEnabled),
    guestPlaceholder: Boolean(auth?.guestPlaceholder),
    remoteProfileId: (auth?.remoteProfileId || '').toString().trim(),
    remoteUserId: (auth?.remoteUserId || '').toString().trim(),
    linkedRemoteUserId: (auth?.linkedRemoteUserId || auth?.remoteUserId || '').toString().trim(),
    lastAuthAt: (auth?.lastAuthAt || '').toString(),
  };
}

function getProfileLinkedRemoteUserId(profile = {}) {
  return (
    profile?.auth?.linkedRemoteUserId
    || profile?.auth?.remoteUserId
    || profile?.user?.studentIdentity?.remoteUserId
    || ''
  ).toString().trim();
}

function getProfileRemoteRecordId(profile = {}) {
  return (profile?.auth?.remoteProfileId || profile?.id || '').toString().trim();
}

function pickRemoteProfileEntry(remoteProfiles = [], profile = null) {
  const entries = Array.isArray(remoteProfiles) ? remoteProfiles.filter(Boolean) : [];
  if (!entries.length) return null;
  const remoteProfileId = getProfileRemoteRecordId(profile);
  const localProfileId = (profile?.id || '').toString().trim();
  return entries.find((entry) => (entry?.profile_id || '').toString().trim() === remoteProfileId)
    || entries.find((entry) => (entry?.profile_id || '').toString().trim() === localProfileId)
    || entries[0]
    || null;
}

function buildNeutralLocalProfileState(payload) {
  const baseState = normalizeAppData(payload || createDefaultData());
  const existingIds = Object.keys(baseState.profiles || {});
  const guestProfileId = (baseState.profileOrder || []).find((profileId) => {
    return baseState.profiles?.[profileId]?.auth?.guestPlaceholder === true;
  }) || generateProfileId(existingIds);
  const selectedClass = normalizeClassName(
    baseState.user?.selectedClass || baseState.settings?.selectedClass || CLASSES[0],
    CLASSES[0]
  );
  const classContent = normalizeClassContent(baseState.classContent, baseState.subjects, selectedClass);
  const guestProfile = normalizeProfileEntry({
    id: guestProfileId,
    auth: {
      provider: 'local',
      googleEnabled: false,
      firebaseEnabled: false,
      supabaseEnabled: false,
      guestPlaceholder: true,
      linkedRemoteUserId: '',
      remoteUserId: '',
      remoteProfileId: '',
      lastAuthAt: '',
    },
    user: {
      profileName: 'Profil local',
      avatar: '',
      selectedClass,
      studentIdentity: {
        studentId: guestProfileId,
        displayName: 'Profil local',
        email: '',
        remoteUserId: '',
        authProvider: 'local',
      },
    },
    settings: {
      selectedClass,
      sync: {
        provider: 'none',
        mode: 'local',
        autoSync: false,
        lastSyncStatus: 'idle',
        lastSyncedAt: '',
        pendingLocalChanges: false,
      },
    },
    classContent,
    subjects: classContent[selectedClass] || [],
    starQuizzes: [],
    traitementSujets: [],
    exerciceScolaires: [],
    exerciceGlobaux: [],
  }, guestProfileId);
  const nextOrder = [...new Set([...(baseState.profileOrder || []), guestProfileId])];

  return projectActiveProfile({
    ...baseState,
    activeProfileId: guestProfileId,
    profileOrder: nextOrder,
    profiles: {
      ...(baseState.profiles || {}),
      [guestProfileId]: guestProfile,
    },
  }, guestProfile);
}

function normalizeAdminState(admin = {}) {
  const sessionScope = ['none', 'user', 'admin'].includes(String(admin?.sessionScope || 'none'))
    ? String(admin.sessionScope || 'none')
    : 'none';
  return {
    ...DEFAULT_ADMIN_STATE,
    ...(admin || {}),
    ownerRemoteUserId: (admin?.ownerRemoteUserId || '').toString().trim(),
    ownerEmail: (admin?.ownerEmail || '').toString().trim(),
    ownerDisplayName: (admin?.ownerDisplayName || '').toString().trim(),
    ownerAvatar: (admin?.ownerAvatar || '').toString().trim(),
    lastClaimedAt: (admin?.lastClaimedAt || '').toString(),
    sessionScope,
  };
}

function generateProfileId(existingIds = []) {
  let index = Math.max(1, existingIds.length + 1);
  let candidate = `student-${index}`;
  while (existingIds.includes(candidate)) {
    index += 1;
    candidate = `student-${index}`;
  }
  return candidate;
}

function normalizeProfileEntry(profilePayload = {}, fallbackId = 'student-1') {
  const resolvedId = (profilePayload.id || fallbackId).toString().trim() || fallbackId;
  const baseProfile = createDefaultProfile({ id: resolvedId });
  const settings = sanitizeSettings({ ...baseProfile.settings, ...(profilePayload.settings || {}) });
  const user = sanitizeUserData({ ...baseProfile.user, ...(profilePayload.user || {}) }, settings);
  const selectedClass = normalizeClassName(
    user.selectedClass || settings.selectedClass || baseProfile.user.selectedClass,
    baseProfile.user.selectedClass
  );
  const classContent = normalizeClassContent(profilePayload.classContent, profilePayload.subjects, selectedClass);
  const activeSubjects = normalizeSubjectBucket(classContent[selectedClass], {
    fallbackSubjects: Array.isArray(profilePayload.subjects) && profilePayload.subjects.length ? profilePayload.subjects : baseProfile.subjects,
  });
  const profileName = (user.profileName || '').toString().trim() || baseProfile.user.profileName;

  return {
    ...baseProfile,
    ...profilePayload,
    id: resolvedId,
    createdAt: (profilePayload.createdAt || baseProfile.createdAt || new Date().toISOString()).toString(),
    updatedAt: (profilePayload.updatedAt || profilePayload.createdAt || '').toString(),
    auth: normalizeProfileAuth(profilePayload.auth || baseProfile.auth),
    user: {
      ...user,
      profileName,
      selectedClass,
      studentIdentity: {
        ...(user.studentIdentity || {}),
        displayName: user.studentIdentity?.displayName || profileName,
        studentId: user.studentIdentity?.studentId || resolvedId,
      },
    },
    settings: {
      ...settings,
      selectedClass,
    },
    classContent,
    subjects: activeSubjects,
    starQuizzes: Array.isArray(profilePayload.starQuizzes) ? profilePayload.starQuizzes : [],
    traitementSujets: Array.isArray(profilePayload.traitementSujets) ? profilePayload.traitementSujets : [],
    exerciceScolaires: Array.isArray(profilePayload.exerciceScolaires) ? profilePayload.exerciceScolaires : [],
    exerciceGlobaux: Array.isArray(profilePayload.exerciceGlobaux) ? profilePayload.exerciceGlobaux : [],
  };
}

function projectActiveProfile(payload, activeProfile) {
  return {
    ...payload,
    user: activeProfile.user,
    settings: activeProfile.settings,
    classContent: activeProfile.classContent,
    subjects: activeProfile.subjects,
    starQuizzes: activeProfile.starQuizzes,
    traitementSujets: activeProfile.traitementSujets,
    exerciceScolaires: activeProfile.exerciceScolaires,
    exerciceGlobaux: activeProfile.exerciceGlobaux,
  };
}

function patchActiveProfileState(payload, patch = {}) {
  const activeProfileId = (payload?.activeProfileId || payload?.profileOrder?.[0] || '').toString();
  const activeProfile = payload?.profiles?.[activeProfileId];
  if (!activeProfile) return payload;

  const nextProfile = normalizeProfileEntry({
    ...activeProfile,
    ...patch,
    updatedAt: new Date().toISOString(),
    auth: normalizeProfileAuth({
      ...(activeProfile.auth || {}),
      ...(patch.auth || {}),
    }),
    user: {
      ...(activeProfile.user || {}),
      ...(patch.user || {}),
      studentIdentity: {
        ...(activeProfile.user?.studentIdentity || {}),
        ...(patch.user?.studentIdentity || {}),
      },
    },
    settings: {
      ...(activeProfile.settings || {}),
      ...(patch.settings || {}),
      sync: {
        ...(activeProfile.settings?.sync || {}),
        ...(patch.settings?.sync || {}),
      },
    },
    classContent: patch.classContent ?? activeProfile.classContent,
    subjects: patch.subjects ?? activeProfile.subjects,
    starQuizzes: Object.prototype.hasOwnProperty.call(patch, 'starQuizzes') ? patch.starQuizzes : activeProfile.starQuizzes,
    traitementSujets: Object.prototype.hasOwnProperty.call(patch, 'traitementSujets') ? patch.traitementSujets : activeProfile.traitementSujets,
    exerciceScolaires: Object.prototype.hasOwnProperty.call(patch, 'exerciceScolaires') ? patch.exerciceScolaires : activeProfile.exerciceScolaires,
    exerciceGlobaux: Object.prototype.hasOwnProperty.call(patch, 'exerciceGlobaux') ? patch.exerciceGlobaux : activeProfile.exerciceGlobaux,
  }, activeProfileId);

  return projectActiveProfile({
    ...payload,
    profiles: {
      ...(payload?.profiles || {}),
      [activeProfileId]: nextProfile,
    },
  }, nextProfile);
}

function normalizeProfilesPayload(payload) {
  const rawProfiles = payload?.profiles && typeof payload.profiles === 'object' ? payload.profiles : null;
  const legacyProfileId = (payload?.activeProfileId || 'student-1').toString();
  const legacyProfilePayload = {
    id: legacyProfileId,
    user: payload?.user,
    settings: payload?.settings,
    classContent: payload?.classContent,
    subjects: payload?.subjects,
    starQuizzes: payload?.starQuizzes,
    traitementSujets: payload?.traitementSujets,
    exerciceScolaires: payload?.exerciceScolaires,
    exerciceGlobaux: payload?.exerciceGlobaux,
  };
  const sourceProfiles = rawProfiles && Object.keys(rawProfiles).length
    ? rawProfiles
    : { [legacyProfileId]: legacyProfilePayload };
  const requestedOrder = Array.isArray(payload?.profileOrder) && payload.profileOrder.length
    ? payload.profileOrder.map((entry) => String(entry)).filter(Boolean)
    : Object.keys(sourceProfiles).map((entry) => String(entry));
  const profileOrder = [...new Set([...requestedOrder, ...Object.keys(sourceProfiles).map((entry) => String(entry))])].filter(Boolean);
  const ensuredOrder = profileOrder.length ? profileOrder : ['student-1'];
  const profiles = {};

  ensuredOrder.forEach((profileId, index) => {
    profiles[profileId] = normalizeProfileEntry(sourceProfiles[profileId] || { id: profileId }, profileId || `student-${index + 1}`);
  });

  const activeProfileId = ensuredOrder.includes(String(payload?.activeProfileId))
    ? String(payload.activeProfileId)
    : ensuredOrder[0];

  return { profiles, profileOrder: ensuredOrder, activeProfileId };
}

function normalizeAppData(payload) {
  const base = createDefaultData();
  if (!payload) return base;

  const profileState = normalizeProfilesPayload(payload);
  const activeProfile = profileState.profiles[profileState.activeProfileId] || profileState.profiles[profileState.profileOrder[0]];
  const admin = normalizeAdminState(payload?.admin);

  return projectActiveProfile({
    ...base,
    ...payload,
    admin,
    activeProfileId: profileState.activeProfileId,
    profileOrder: profileState.profileOrder,
    profiles: profileState.profiles,
  }, activeProfile);
}

function reconcileProfileDemoContent(profile) {
  const selectedClass = normalizeClassName(profile?.user?.selectedClass || profile?.settings?.selectedClass || CLASSES[0], CLASSES[0]);
  const nextClassContent = {
    ...(profile?.classContent || createDefaultClassContent()),
  };
  const rawSettings = profile?.settings || {};
  const { enableDemoContent, demoVersion, ...nextSettings } = rawSettings;
  let changed = false;

  Object.keys(nextClassContent).forEach((className) => {
    const bucket = Array.isArray(nextClassContent[className]) ? nextClassContent[className] : [];
    const strippedBucket = stripBuiltInDemoData(bucket, {
      replaceLegacyDemo: true,
    });
    if (JSON.stringify(strippedBucket) !== JSON.stringify(bucket)) {
      nextClassContent[className] = strippedBucket;
      changed = true;
    }
  });

  const nextSubjects = nextClassContent[selectedClass] || profile?.subjects || [];

  if (!Array.isArray(profile?.subjects) || JSON.stringify(profile.subjects) !== JSON.stringify(nextSubjects)) {
    changed = true;
  }

  if (
    Object.prototype.hasOwnProperty.call(rawSettings, 'enableDemoContent')
    || Object.prototype.hasOwnProperty.call(rawSettings, 'demoVersion')
  ) {
    changed = true;
  }

  if (!changed) return { profile, changed: false };

  return {
    changed: true,
    profile: normalizeProfileEntry({
      ...profile,
      classContent: nextClassContent,
      subjects: nextSubjects,
      settings: nextSettings,
      updatedAt: profile?.updatedAt || '',
    }, profile?.id || 'student-1'),
  };
}

function reconcileAppProfiles(payload) {
  const normalized = normalizeAppData(payload);
  let changed = false;
  const nextProfiles = {};

  (normalized.profileOrder || []).forEach((profileId) => {
    const reconciled = reconcileProfileDemoContent(normalized.profiles?.[profileId]);
    nextProfiles[profileId] = reconciled.profile;
    if (reconciled.changed) changed = true;
  });

  if (!changed) return { data: normalized, changed: false };

  return {
    changed: true,
    data: normalizeAppData({
      ...normalized,
      profiles: nextProfiles,
    }),
  };
}

export function AppProvider({ children }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('home');
  const [viewParams, setViewParams] = useState({});
  const [currentSubjectId, setCurrentSubjectId] = useState(1);
  const [quizState, setQuizState] = useState(null);
  const [toast, setToast] = useState(null);
  const [floatingFx, setFloatingFx] = useState([]);
  const toastTimeoutRef = useRef(null);
  const cloudSyncInFlightRef = useRef(false);
  const profileResolutionInFlightRef = useRef(false);
  const lastRemoteHydrationKeyRef = useRef('');
  const persistenceProfile = storage.getPersistenceProfile();
  const [cloudState, setCloudState] = useState({
    configured: isSupabaseConfigured(),
    sessionUser: null,
    remoteProfiles: [],
    sharedAdminOwner: null,
    sharedAdminRegistryAvailable: false,
    sharedAdminRegistryError: '',
    sharedContent: null,
    sharedContentRegistryAvailable: false,
    sharedContentRegistryError: '',
    knownAccounts: [],
    knownAccountsAvailable: false,
    knownAccountsError: '',
    busy: false,
    error: '',
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const stored = await storage.load();
        const source = stored || createDefaultData();
        const reconciled = reconcileAppProfiles(source);
        const normalized = normalizeAppData({
          ...reconciled.data,
          settings: {
            ...(reconciled.data?.settings || {}),
            adminPassword: reconciled.data?.settings?.adminPassword || getAdminPassword(),
          },
        });
        setData(normalized);

        if (
          !stored
          || reconciled.changed
          || !stored?.profiles
          || !Array.isArray(stored?.profileOrder)
          || !stored?.activeProfileId
          || !stored?.user?.inventory
          || !stored?.user?.stats
          || typeof stored?.user?.credits !== 'number'
          || typeof stored?.user?.globalScore !== 'number'
          || typeof stored?.user?.averageScore !== 'number'
          || typeof stored?.user?.energy !== 'number'
          || typeof stored?.user?.fire !== 'number'
          || !('avatar' in (stored?.user || {}))
          || !('finalScoreScale' in (stored?.settings || {}))
        ) {
          await storage.save(normalized);
        }
      } catch (e) { console.error(e); setData(normalizeAppData(createDefaultData())); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => () => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (data?.settings?.uiSoundEnabled === false) SoundEngine.setMasterVolume(0);
    else SoundEngine.setMasterVolume(0.7);
  }, [data?.settings?.uiSoundEnabled]);

  const buildPersistableState = useCallback((next) => {
    const base = next || createDefaultData();
    const activeProfileId = (base.activeProfileId || base.profileOrder?.[0] || 'student-1').toString();
    const nextProfiles = { ...(base.profiles || {}) };
    const existingActive = nextProfiles[activeProfileId] || { id: activeProfileId };
    const mergedSettings = {
      ...(existingActive.settings || {}),
      ...(base.settings || {}),
    };
    nextProfiles[activeProfileId] = {
      ...existingActive,
      id: activeProfileId,
      createdAt: existingActive.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: base.user ?? existingActive.user,
      settings: sanitizeSettings({
        ...mergedSettings,
        adminPassword: mergedSettings.adminPassword || getAdminPassword(),
      }),
      classContent: base.classContent ?? existingActive.classContent,
      subjects: base.subjects ?? existingActive.subjects,
      starQuizzes: Object.prototype.hasOwnProperty.call(base, 'starQuizzes') ? base.starQuizzes : existingActive.starQuizzes,
      traitementSujets: Object.prototype.hasOwnProperty.call(base, 'traitementSujets') ? base.traitementSujets : existingActive.traitementSujets,
      exerciceScolaires: Object.prototype.hasOwnProperty.call(base, 'exerciceScolaires') ? base.exerciceScolaires : existingActive.exerciceScolaires,
      exerciceGlobaux: Object.prototype.hasOwnProperty.call(base, 'exerciceGlobaux') ? base.exerciceGlobaux : existingActive.exerciceGlobaux,
      auth: existingActive.auth || {},
    };
    const profileOrder = [...new Set([...(Array.isArray(base.profileOrder) ? base.profileOrder.map((entry) => String(entry)).filter(Boolean) : []), activeProfileId])];

    return {
      ...base,
      activeProfileId,
      profileOrder,
      profiles: nextProfiles,
    };
  }, []);

  const persistLocal = useCallback(async (normalized) => {
    setData(normalized);
    await storage.save(normalized);
    return normalized;
  }, []);

  const setActiveProfileLocally = useCallback(async (profileId, profileOverride = null) => {
    if (!data) return null;
    const targetId = String(profileId || '').trim();
    const nextProfile = profileOverride || data.profiles?.[targetId];
    if (!targetId || !nextProfile) return null;
    const nextOrder = Array.isArray(data.profileOrder)
      ? data.profileOrder.map((entry) => String(entry)).filter(Boolean)
      : [];
    if (!nextOrder.includes(targetId)) nextOrder.push(targetId);
    const nextState = normalizeAppData(buildPersistableState({
      ...data,
      activeProfileId: targetId,
      profileOrder: nextOrder,
      profiles: {
        ...(data.profiles || {}),
        [targetId]: nextProfile,
      },
    }));
    await persistLocal(nextState);
    return nextState;
  }, [buildPersistableState, data, persistLocal]);

  const refreshCloudState = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      const nextCloudState = {
        configured: false,
        sessionUser: null,
        remoteProfiles: [],
        sharedAdminOwner: null,
        sharedAdminRegistryAvailable: false,
        sharedAdminRegistryError: '',
        sharedContent: null,
        sharedContentRegistryAvailable: false,
        sharedContentRegistryError: '',
        knownAccounts: [],
        knownAccountsAvailable: false,
        knownAccountsError: '',
        busy: false,
        error: '',
      };
      setCloudState(nextCloudState);
      return nextCloudState;
    }

    try {
      const session = await getSupabaseSession();
      const sessionUser = session?.user || null;
      const remoteProfiles = sessionUser ? await listSupabaseProfiles(sessionUser.id) : [];
      let sharedAdminOwner = null;
      let sharedAdminRegistryAvailable = false;
      let sharedAdminRegistryError = '';
      let sharedContent = null;
      let sharedContentRegistryAvailable = false;
      let sharedContentRegistryError = '';

      try {
        sharedAdminOwner = await getSharedAdminRegistry();
        sharedAdminRegistryAvailable = true;
      } catch (registryError) {
        sharedAdminRegistryError = registryError?.message || 'Registre admin indisponible';
      }

      try {
        sharedContent = await getSharedContentRegistry();
        if (sharedContent?.classContent) {
          sharedContent = {
            ...sharedContent,
            classContent: sanitizeClassContentForStudents(sharedContent.classContent),
          };
        }
        sharedContentRegistryAvailable = true;
      } catch (registryError) {
        sharedContentRegistryError = registryError?.message || 'Contenu partagé indisponible';
      }

      setCloudState((prev) => {
        const next = {
          ...prev,
          configured: true,
          sessionUser,
          remoteProfiles,
          sharedAdminOwner,
          sharedAdminRegistryAvailable,
          sharedAdminRegistryError,
          sharedContent,
          sharedContentRegistryAvailable,
          sharedContentRegistryError,
          busy: false,
          error: '',
        };
        return next;
      });
      return {
        configured: true,
        sessionUser,
        remoteProfiles,
        sharedAdminOwner,
        sharedAdminRegistryAvailable,
        sharedAdminRegistryError,
        sharedContent,
        sharedContentRegistryAvailable,
        sharedContentRegistryError,
        busy: false,
        error: '',
      };
    } catch (error) {
      setCloudState((prev) => ({
        ...prev,
        configured: true,
        sessionUser: null,
        remoteProfiles: [],
        sharedAdminOwner: prev.sharedAdminOwner,
        sharedAdminRegistryAvailable: prev.sharedAdminRegistryAvailable,
        sharedAdminRegistryError: prev.sharedAdminRegistryError,
        sharedContent: prev.sharedContent,
        sharedContentRegistryAvailable: prev.sharedContentRegistryAvailable,
        sharedContentRegistryError: prev.sharedContentRegistryError,
        busy: false,
        error: error?.message || 'Erreur Supabase',
      }));
      return {
        configured: true,
        sessionUser: null,
        remoteProfiles: [],
        sharedAdminOwner: cloudState.sharedAdminOwner,
        sharedAdminRegistryAvailable: cloudState.sharedAdminRegistryAvailable,
        sharedAdminRegistryError: cloudState.sharedAdminRegistryError,
        sharedContent: cloudState.sharedContent,
        sharedContentRegistryAvailable: cloudState.sharedContentRegistryAvailable,
        sharedContentRegistryError: cloudState.sharedContentRegistryError,
        busy: false,
        error: error?.message || 'Erreur Supabase',
      };
    }
  }, []);

  const maybeAutoSyncProfile = useCallback(async (normalized) => {
    if (cloudSyncInFlightRef.current || !isSupabaseConfigured()) return null;

    const adminState = normalizeAdminState(normalized?.admin);
    if (adminState.sessionScope !== 'user') return null;

    const activeProfileId = normalized?.activeProfileId;
    const activeProfile = normalized?.profiles?.[activeProfileId];
    const syncSettings = activeProfile?.settings?.sync || {};
    const auth = activeProfile?.auth || {};
    if (syncSettings.provider !== 'supabase' || !syncSettings.autoSync || !auth.remoteUserId) return null;

    cloudSyncInFlightRef.current = true;
    setCloudState(prev => ({ ...prev, busy: true, error: '' }));

    try {
      const remote = await pushProfileToSupabase(buildStudentProfileCloudPayload(activeProfile), {
        remoteUserId: auth.remoteUserId,
      });
      const syncedState = patchActiveProfileState(normalized, {
        auth: {
          provider: 'supabase',
          googleEnabled: true,
          supabaseEnabled: true,
          remoteUserId: auth.remoteUserId,
          remoteProfileId: remote?.profile_id || activeProfile.id,
        },
        settings: {
          sync: {
            provider: 'supabase',
            mode: 'hybrid',
            lastSyncedAt: new Date().toISOString(),
            lastSyncStatus: 'success',
            pendingLocalChanges: false,
          },
        },
      });
      await persistLocal(normalizeAppData(buildPersistableState(syncedState)));
      await refreshCloudState();
      return remote;
    } catch (error) {
      const failedState = patchActiveProfileState(normalized, {
        settings: {
          sync: {
            provider: 'supabase',
            mode: 'hybrid',
            lastSyncStatus: 'error',
            pendingLocalChanges: true,
          },
        },
      });
      await persistLocal(normalizeAppData(buildPersistableState(failedState)));
      setCloudState(prev => ({
        ...prev,
        error: error?.message || 'Échec de synchronisation Supabase',
      }));
      return null;
    } finally {
      cloudSyncInFlightRef.current = false;
      setCloudState(prev => ({ ...prev, busy: false }));
    }
  }, [buildPersistableState, persistLocal, refreshCloudState]);

  const save = useCallback(async (next) => {
    const normalized = normalizeAppData(buildPersistableState(next));
    await persistLocal(normalized);
    const adminState = normalizeAdminState(normalized?.admin);
    const sanitizedSharedClassContent = sanitizeClassContentForStudents(normalized?.classContent || {});
    const sharedOwnerRemoteUserId = (cloudState.sharedAdminOwner?.ownerRemoteUserId || adminState.ownerRemoteUserId || '').toString().trim();
    const sessionUserId = (cloudState.sessionUser?.id || '').toString().trim();
    const canPublishSharedContent = (
      isSupabaseConfigured()
      && adminState.sessionScope === 'admin'
      && sessionUserId
      && sessionUserId === sharedOwnerRemoteUserId
    );

    if (canPublishSharedContent) {
      try {
        await setSharedContentRegistry({
          classContent: sanitizedSharedClassContent,
          updatedAt: new Date().toISOString(),
        });
        setCloudState((prev) => ({
          ...prev,
          sharedContent: {
            classContent: sanitizedSharedClassContent,
            updatedAt: new Date().toISOString(),
          },
          sharedContentRegistryAvailable: true,
          sharedContentRegistryError: '',
        }));
      } catch (error) {
        setCloudState((prev) => ({
          ...prev,
          sharedContentRegistryError: error?.message || 'Publication du contenu partagé impossible',
        }));
      }
    }

    void maybeAutoSyncProfile(normalized);
    return normalized;
  }, [buildPersistableState, cloudState.sessionUser, cloudState.sharedAdminOwner, maybeAutoSyncProfile, persistLocal]);

  useEffect(() => {
    void refreshCloudState();
    const { data: authSubscription } = onSupabaseAuthStateChange(() => {
      void refreshCloudState();
    });
    return () => {
      authSubscription?.subscription?.unsubscribe?.();
    };
  }, [refreshCloudState]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    const client = getSupabaseClient();
    if (!client?.channel) return undefined;

    const channel = client
      .channel('student-profiles-shared-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_profiles' }, (payload) => {
        const remoteUserId = (
          payload?.new?.remote_user_id
          || payload?.old?.remote_user_id
          || ''
        ).toString();
        if (![SHARED_ADMIN_REMOTE_USER_ID, SHARED_CONTENT_REMOTE_USER_ID].includes(remoteUserId)) return;
        if (cloudSyncInFlightRef.current || profileResolutionInFlightRef.current) return;
        void refreshCloudState();
      })
      .subscribe();

    return () => {
      channel?.unsubscribe?.();
      client?.removeChannel?.(channel);
    };
  }, [refreshCloudState]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    const syncSharedAdminLock = () => {
      if (document.visibilityState === 'hidden') return;
      if (cloudSyncInFlightRef.current || profileResolutionInFlightRef.current) return;
      void refreshCloudState();
    };

    const intervalId = window.setInterval(syncSharedAdminLock, 10000);
    const handleFocus = () => syncSharedAdminLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncSharedAdminLock();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshCloudState]);

  const refreshAdminCloudDirectory = useCallback(async () => {
    if (!isSupabaseConfigured()) return [];
    setCloudState((prev) => ({
      ...prev,
      busy: true,
      knownAccountsError: '',
    }));

    try {
      const knownAccounts = await listSupabaseAccounts();
      setCloudState((prev) => ({
        ...prev,
        knownAccounts,
        knownAccountsAvailable: true,
        knownAccountsError: '',
        busy: false,
      }));
      return knownAccounts;
    } catch (error) {
      setCloudState((prev) => ({
        ...prev,
        knownAccounts: [],
        knownAccountsAvailable: false,
        knownAccountsError: error?.message || 'Annuaire cloud indisponible',
        busy: false,
      }));
      throw error;
    }
  }, []);

  useEffect(() => {
    profileResolutionInFlightRef.current = false;
    lastRemoteHydrationKeyRef.current = '';
  }, [cloudState.sessionUser?.id]);

  useEffect(() => {
    if (!data || !cloudState.sharedAdminRegistryAvailable) return;
    const adminState = normalizeAdminState(data.admin);
    const sharedOwner = normalizeAdminState(cloudState.sharedAdminOwner || {});

    if (!sharedOwner.ownerRemoteUserId) {
      if (!adminState.ownerRemoteUserId || adminState.sessionScope === 'admin') return;
      void persistLocal(normalizeAppData(buildPersistableState({
        ...data,
        admin: {
          ...DEFAULT_ADMIN_STATE,
          sessionScope: adminState.sessionScope === 'user' ? 'user' : 'none',
        },
      })));
      return;
    }

    const needsSync = (
      adminState.ownerRemoteUserId !== sharedOwner.ownerRemoteUserId
      || adminState.lastClaimedAt !== sharedOwner.lastClaimedAt
      || (sharedOwner.ownerEmail && adminState.ownerEmail !== sharedOwner.ownerEmail)
      || (sharedOwner.ownerDisplayName && adminState.ownerDisplayName !== sharedOwner.ownerDisplayName)
      || (sharedOwner.ownerAvatar && adminState.ownerAvatar !== sharedOwner.ownerAvatar)
    );

    if (!needsSync) return;

    void persistLocal(normalizeAppData(buildPersistableState({
      ...data,
      admin: {
        ...adminState,
        ownerRemoteUserId: sharedOwner.ownerRemoteUserId,
        ownerEmail: sharedOwner.ownerEmail || adminState.ownerEmail,
        ownerDisplayName: sharedOwner.ownerDisplayName || adminState.ownerDisplayName,
        ownerAvatar: sharedOwner.ownerAvatar || adminState.ownerAvatar,
        lastClaimedAt: sharedOwner.lastClaimedAt,
        sessionScope: adminState.sessionScope,
      },
    })));
  }, [buildPersistableState, cloudState.sharedAdminOwner, cloudState.sharedAdminRegistryAvailable, data, persistLocal]);

  useEffect(() => {
    if (!data || !cloudState.sharedContentRegistryAvailable) return;
    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope === 'admin') return;
    const sharedClassContent = cloudState.sharedContent?.classContent;
    const reconciled = reconcileSharedClassContent(data, sharedClassContent);
    if (!reconciled.changed) return;
    void persistLocal(normalizeAppData(buildPersistableState(reconciled.data)));
  }, [buildPersistableState, cloudState.sharedContent, cloudState.sharedContentRegistryAvailable, data, persistLocal]);

  useEffect(() => {
    if (!data || !cloudState.sessionUser?.id) return;
    const adminState = normalizeAdminState(data.admin);
    const sharedOwnerRemoteUserId = (cloudState.sharedAdminOwner?.ownerRemoteUserId || '').toString().trim();
    const activeOwnerRemoteUserId = sharedOwnerRemoteUserId || adminState.ownerRemoteUserId;
    if (adminState.sessionScope !== 'admin') return;
    if (!activeOwnerRemoteUserId) return;
    if ((cloudState.sessionUser?.id || '').toString().trim() !== activeOwnerRemoteUserId) return;
    void refreshAdminCloudDirectory();
  }, [cloudState.sessionUser?.id, cloudState.sharedAdminOwner, data, refreshAdminCloudDirectory]);

  useEffect(() => {
    if (!data || !cloudState.sessionUser) return;
    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope !== 'none') return;
    const sessionUserId = (cloudState.sessionUser.id || '').toString();
    const hasLinkedLocalUser = (data.profileOrder || []).some((profileId) => {
      return getProfileLinkedRemoteUserId(data.profiles?.[profileId]) === sessionUserId;
    });
    let inferredScope = 'none';

    const knownAdminOwnerId = (cloudState.sharedAdminOwner?.ownerRemoteUserId || adminState.ownerRemoteUserId || '').toString();
    if (knownAdminOwnerId && knownAdminOwnerId === sessionUserId) inferredScope = 'admin';
    else if (hasLinkedLocalUser) inferredScope = 'user';

    if (inferredScope === 'none') return;

    void persistLocal(normalizeAppData(buildPersistableState({
      ...data,
      admin: {
        ...adminState,
        sessionScope: inferredScope,
      },
    })));
  }, [buildPersistableState, cloudState.sessionUser, data, persistLocal]);

  useEffect(() => {
    if (!data || !cloudState.sessionUser) return;
    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope !== 'admin') return;

    const sessionUser = cloudState.sessionUser;
    const remoteUserId = (sessionUser.id || '').toString();
    const email = (sessionUser.email || '').toString();
    const displayName = (
      sessionUser.user_metadata?.full_name
      || sessionUser.user_metadata?.name
      || email
      || 'Administrateur'
    ).toString();
    const avatar = (
      sessionUser.user_metadata?.avatar_url
      || sessionUser.user_metadata?.picture
      || ''
    ).toString();
    const lockedSharedOwner = normalizeAdminState(cloudState.sharedAdminOwner || {});
    const lockedOwnerRemoteUserId = (lockedSharedOwner.ownerRemoteUserId || adminState.ownerRemoteUserId || '').toString();
    const lockedOwnerEmail = (lockedSharedOwner.ownerEmail || adminState.ownerEmail || '').toString();
    const lockedOwnerDisplayName = (lockedSharedOwner.ownerDisplayName || adminState.ownerDisplayName || displayName).toString();
    const lockedOwnerAvatar = (lockedSharedOwner.ownerAvatar || adminState.ownerAvatar || avatar).toString();
    const lockedLastClaimedAt = (lockedSharedOwner.lastClaimedAt || adminState.lastClaimedAt || new Date().toISOString()).toString();

    if (lockedOwnerRemoteUserId && lockedOwnerRemoteUserId !== remoteUserId) {
      void (async () => {
        setCloudState(prev => ({
          ...prev,
          error: 'Ce compte Google ne correspond pas à l’administrateur propriétaire',
        }));
        await signOutSupabase();
        await persistLocal(normalizeAppData(buildPersistableState({
          ...data,
          admin: {
            ...adminState,
            sessionScope: 'none',
          },
        })));
        await refreshCloudState();
      })();
      return;
    }

    const needsUpdate = (
      adminState.ownerRemoteUserId !== (lockedOwnerRemoteUserId || remoteUserId)
      || adminState.ownerEmail !== (lockedOwnerEmail || email)
      || adminState.ownerDisplayName !== (lockedOwnerDisplayName || displayName)
      || adminState.ownerAvatar !== (lockedOwnerAvatar || avatar)
      || adminState.lastClaimedAt !== lockedLastClaimedAt
    );

    if (!needsUpdate && lockedOwnerRemoteUserId) return;

    void (async () => {
      try {
        if (!lockedOwnerRemoteUserId) {
          await setSharedAdminRegistry({
            ownerRemoteUserId: remoteUserId,
            ownerEmail: email,
            ownerDisplayName: displayName,
            ownerAvatar: avatar,
            lastClaimedAt: lockedLastClaimedAt,
            updatedAt: new Date().toISOString(),
          });
        }

        await persistLocal(normalizeAppData(buildPersistableState({
          ...data,
          admin: {
            ...adminState,
            ownerRemoteUserId: lockedOwnerRemoteUserId || remoteUserId,
            ownerEmail: lockedOwnerEmail || email,
            ownerDisplayName: lockedOwnerDisplayName || displayName,
            ownerAvatar: lockedOwnerAvatar || avatar,
            lastClaimedAt: lockedLastClaimedAt,
            sessionScope: 'admin',
          },
        })));
        await refreshCloudState();
      } catch (error) {
        setCloudState((prev) => ({
          ...prev,
          error: error?.message || 'Impossible de verrouiller l’admin partagé',
        }));
      }
    })();
  }, [buildPersistableState, cloudState.sessionUser, cloudState.sharedAdminOwner, data, persistLocal, refreshCloudState]);

  useEffect(() => {
    if (!data || !cloudState.sessionUser || profileResolutionInFlightRef.current) return;
    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope !== 'user') return;

    const sessionUser = cloudState.sessionUser;
    const remoteUserId = (sessionUser.id || '').toString().trim();
    if (!remoteUserId) return;

    const activeProfile = data.profiles?.[data.activeProfileId];
    if (!activeProfile) return;

    const remoteProfiles = Array.isArray(cloudState.remoteProfiles) ? cloudState.remoteProfiles : [];
    const linkedProfileId = (data.profileOrder || []).find((profileId) => {
      return getProfileLinkedRemoteUserId(data.profiles?.[profileId]) === remoteUserId;
    });
    const activeLinkedRemoteUserId = getProfileLinkedRemoteUserId(activeProfile);
    const isActiveGuestProfile = Boolean(activeProfile.auth?.guestPlaceholder);

    if (linkedProfileId && linkedProfileId !== data.activeProfileId) {
      profileResolutionInFlightRef.current = true;
      void (async () => {
        try {
          await setActiveProfileLocally(linkedProfileId);
        } finally {
          profileResolutionInFlightRef.current = false;
        }
      })();
      return;
    }

    const preferredRemote = pickRemoteProfileEntry(
      remoteProfiles,
      linkedProfileId ? data.profiles?.[linkedProfileId] : activeProfile
    );

    if (!linkedProfileId && preferredRemote) {
      const preferredRemoteProfileId = (preferredRemote.profile_id || '').toString().trim();
      if (!preferredRemoteProfileId) return;

      const activeRemoteRecordId = getProfileRemoteRecordId(activeProfile);
      if (activeRemoteRecordId === preferredRemoteProfileId && (!activeLinkedRemoteUserId || activeLinkedRemoteUserId === remoteUserId)) {
        return;
      }

      const existingRemoteLocalId = (data.profileOrder || []).find((profileId) => {
        const profile = data.profiles?.[profileId];
        return getProfileLinkedRemoteUserId(profile) === remoteUserId
          && getProfileRemoteRecordId(profile) === preferredRemoteProfileId;
      });

      if (existingRemoteLocalId && existingRemoteLocalId !== data.activeProfileId) {
        profileResolutionInFlightRef.current = true;
        void (async () => {
          try {
            await setActiveProfileLocally(existingRemoteLocalId);
          } finally {
            profileResolutionInFlightRef.current = false;
          }
        })();
        return;
      }

      if (!existingRemoteLocalId) {
        const existingIds = Object.keys(data.profiles || {});
        const nextLocalProfileId = !existingIds.includes(preferredRemoteProfileId)
          ? preferredRemoteProfileId
          : generateProfileId(existingIds);
        const selectedClass = normalizeClassName(
          preferredRemote.selected_class || data.user?.selectedClass || data.settings?.selectedClass || CLASSES[0],
          CLASSES[0]
        );
        const nextProfileName = (
          preferredRemote.profile_name
          || sessionUser.user_metadata?.full_name
          || sessionUser.user_metadata?.name
          || sessionUser.email
          || `Élève ${existingIds.length + 1}`
        ).toString().trim() || `Élève ${existingIds.length + 1}`;
        const nextClassContent = normalizeClassContent(data.classContent, data.subjects, selectedClass);
        const nextProfile = normalizeProfileEntry({
          id: nextLocalProfileId,
          auth: {
            provider: 'supabase',
            googleEnabled: true,
            supabaseEnabled: true,
            guestPlaceholder: false,
            remoteProfileId: preferredRemoteProfileId,
            linkedRemoteUserId: remoteUserId,
          },
          user: {
            profileName: nextProfileName,
            selectedClass,
            studentIdentity: {
              studentId: nextLocalProfileId,
              displayName: nextProfileName,
              email: (sessionUser.email || preferredRemote.email || '').toString(),
              authProvider: 'supabase',
            },
          },
          settings: {
            selectedClass,
            sync: {
              provider: 'supabase',
              mode: 'hybrid',
              autoSync: true,
              lastSyncStatus: 'pending',
              pendingLocalChanges: false,
            },
          },
          classContent: nextClassContent,
          subjects: nextClassContent[selectedClass] || [],
        }, nextLocalProfileId);

        profileResolutionInFlightRef.current = true;
        lastRemoteHydrationKeyRef.current = '';
        void (async () => {
          try {
            await setActiveProfileLocally(nextLocalProfileId, nextProfile);
          } finally {
            profileResolutionInFlightRef.current = false;
          }
        })();
        return;
      }
    }

    if (!linkedProfileId && !remoteProfiles.length && (isActiveGuestProfile || (activeLinkedRemoteUserId && activeLinkedRemoteUserId !== remoteUserId))) {
      const existingIds = Object.keys(data.profiles || {});
      const nextLocalProfileId = generateProfileId(existingIds);
      const selectedClass = normalizeClassName(
        data.user?.selectedClass || data.settings?.selectedClass || CLASSES[0],
        CLASSES[0]
      );
      const nextClassContent = normalizeClassContent(data.classContent, data.subjects, selectedClass);
      const nextProfileName = (
        sessionUser.user_metadata?.full_name
        || sessionUser.user_metadata?.name
        || sessionUser.email
        || `Élève ${existingIds.length + 1}`
      ).toString().trim() || `Élève ${existingIds.length + 1}`;
      const nextProfile = normalizeProfileEntry({
        id: nextLocalProfileId,
        auth: {
          provider: 'supabase',
          googleEnabled: true,
          supabaseEnabled: true,
          guestPlaceholder: false,
          linkedRemoteUserId: remoteUserId,
        },
        user: {
          profileName: nextProfileName,
          selectedClass,
          studentIdentity: {
            studentId: nextLocalProfileId,
            displayName: nextProfileName,
            email: (sessionUser.email || '').toString(),
            authProvider: 'supabase',
          },
        },
        settings: {
          selectedClass,
          sync: {
            provider: 'supabase',
            mode: 'hybrid',
            autoSync: true,
            lastSyncStatus: 'pending',
            pendingLocalChanges: true,
          },
        },
        classContent: nextClassContent,
        subjects: nextClassContent[selectedClass] || [],
      }, nextLocalProfileId);

      profileResolutionInFlightRef.current = true;
      lastRemoteHydrationKeyRef.current = '';
      void (async () => {
        try {
          await setActiveProfileLocally(nextLocalProfileId, nextProfile);
        } finally {
          profileResolutionInFlightRef.current = false;
        }
      })();
    }
  }, [cloudState.remoteProfiles, cloudState.sessionUser, data, setActiveProfileLocally]);

  useEffect(() => {
    if (!data || !cloudState.sessionUser) return;
    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope !== 'user') return;
    const activeProfile = data.profiles?.[data.activeProfileId];
    if (!activeProfile || activeProfile.settings?.sync?.provider !== 'supabase' || profileResolutionInFlightRef.current) return;

    const sessionUser = cloudState.sessionUser;
    const remoteUserId = (sessionUser.id || '').toString();
    const email = (sessionUser.email || '').toString();
    const displayName = (
      sessionUser.user_metadata?.full_name
      || sessionUser.user_metadata?.name
      || activeProfile.user?.studentIdentity?.displayName
      || activeProfile.user?.profileName
      || ''
    ).toString();
    const remoteEntry = pickRemoteProfileEntry(cloudState.remoteProfiles, activeProfile);
    const remoteProfileId = (
      remoteEntry?.profile_id
      || activeProfile.auth?.remoteProfileId
      || activeProfile.id
      || ''
    ).toString().trim();
    const hasRemoteSnapshot = Boolean(remoteEntry && remoteProfileId);
    const hydrationKey = `${remoteUserId}:${data.activeProfileId}:${remoteProfileId || 'none'}`;
    const needsUpdate = (
      activeProfile.auth?.remoteUserId !== remoteUserId
      || activeProfile.auth?.linkedRemoteUserId !== remoteUserId
      || activeProfile.auth?.remoteProfileId !== remoteProfileId
      || activeProfile.user?.studentIdentity?.remoteUserId !== remoteUserId
      || activeProfile.user?.studentIdentity?.email !== email
      || activeProfile.user?.studentIdentity?.displayName !== displayName
      || activeProfile.user?.studentIdentity?.authProvider !== 'supabase'
      || activeProfile.auth?.provider !== 'supabase'
      || activeProfile.auth?.googleEnabled !== true
      || activeProfile.auth?.supabaseEnabled !== true
    );

    void (async () => {
      let workingState = data;
      let workingProfile = activeProfile;

      if (needsUpdate) {
        const linkedState = patchActiveProfileState(data, {
          auth: {
            provider: 'supabase',
            googleEnabled: true,
            supabaseEnabled: true,
            guestPlaceholder: false,
            remoteUserId,
            linkedRemoteUserId: remoteUserId,
            remoteProfileId,
            lastAuthAt: new Date().toISOString(),
          },
          user: {
            studentIdentity: {
              remoteUserId,
              email,
              displayName,
              authProvider: 'supabase',
            },
          },
          settings: {
            sync: {
              provider: 'supabase',
              mode: 'hybrid',
              autoSync: true,
              lastSyncStatus: hasRemoteSnapshot ? 'pending' : (activeProfile.settings?.sync?.lastSyncStatus || 'idle'),
              pendingLocalChanges: hasRemoteSnapshot ? false : (activeProfile.settings?.sync?.pendingLocalChanges ?? true),
            },
          },
        });

        workingState = normalizeAppData(buildPersistableState(linkedState));
        workingProfile = workingState.profiles?.[workingState.activeProfileId] || workingProfile;
        await persistLocal(workingState);
      }

      if (hasRemoteSnapshot && lastRemoteHydrationKeyRef.current !== hydrationKey) {
        lastRemoteHydrationKeyRef.current = hydrationKey;
        try {
          const remote = await pullProfileFromSupabase(remoteProfileId, remoteUserId);
          if (!remote?.payload) return;

          const restoredProfile = normalizeProfileEntry({
            ...applyAuthoritativeStudentContent(
              remote.payload,
              cloudState.sharedContent?.classContent,
              workingState.classContent
            ),
            id: workingState.activeProfileId,
            auth: {
              ...(remote.payload?.auth || {}),
              provider: 'supabase',
              googleEnabled: true,
              supabaseEnabled: true,
              guestPlaceholder: false,
              remoteUserId,
              linkedRemoteUserId: remoteUserId,
              remoteProfileId,
              lastAuthAt: workingProfile?.auth?.lastAuthAt || new Date().toISOString(),
            },
            user: {
              ...(remote.payload?.user || {}),
              studentIdentity: {
                ...(remote.payload?.user?.studentIdentity || {}),
                remoteUserId,
                email: cloudState.sessionUser?.email || remote?.email || remote.payload?.user?.studentIdentity?.email || '',
                authProvider: 'supabase',
              },
            },
            settings: {
              ...(remote.payload?.settings || {}),
              sync: {
                ...(remote.payload?.settings?.sync || {}),
                provider: 'supabase',
                mode: 'hybrid',
                autoSync: true,
                lastSyncedAt: new Date().toISOString(),
                lastSyncStatus: 'success',
                pendingLocalChanges: false,
              },
            },
          }, workingState.activeProfileId);

          const restoredState = normalizeAppData({
            ...workingState,
            profiles: {
              ...(workingState.profiles || {}),
              [workingState.activeProfileId]: restoredProfile,
            },
          });
          await persistLocal(normalizeAppData(buildPersistableState(restoredState)));
          await refreshCloudState();
          return;
        } catch (error) {
          lastRemoteHydrationKeyRef.current = '';
          setCloudState(prev => ({
            ...prev,
            error: error?.message || 'Échec de récupération Supabase',
          }));
          return;
        }
      }

      if (!hasRemoteSnapshot && !activeProfile.auth?.remoteUserId) {
        try {
          await maybeAutoSyncProfile(workingState);
        } catch {
        }
      }
    })();
  }, [buildPersistableState, cloudState.remoteProfiles, cloudState.sessionUser, data, maybeAutoSyncProfile, persistLocal, refreshCloudState]);

  const createStudentProfile = useCallback(async (draft = {}) => {
    if (!data) return null;
    const existingIds = Object.keys(data.profiles || {});
    const id = generateProfileId(existingIds);
    const selectedClass = normalizeClassName(
      draft.selectedClass || draft.user?.selectedClass || draft.settings?.selectedClass || data.user?.selectedClass || CLASSES[0],
      CLASSES[0]
    );
    const classContent = normalizeClassContent(data.classContent, data.subjects, selectedClass);
    if (selectedClass === 'Terminale' && !(data.classContent?.[selectedClass]?.length)) {
      classContent[selectedClass] = createSubjectShells();
    }
    const profileName = (draft.profileName || draft.user?.profileName || `Élève ${existingIds.length + 1}`).toString().trim() || `Élève ${existingIds.length + 1}`;
    const createdAt = new Date().toISOString();
    const nextProfile = normalizeProfileEntry({
      id,
      createdAt,
      updatedAt: createdAt,
      auth: {
        provider: draft.authProvider || draft.auth?.provider || 'local',
        googleEnabled: Boolean(draft.auth?.googleEnabled),
        firebaseEnabled: Boolean(draft.auth?.firebaseEnabled),
        supabaseEnabled: Boolean(draft.auth?.supabaseEnabled),
      },
      user: {
        ...draft.user,
        profileName,
        avatar: draft.avatar || draft.user?.avatar || '',
        selectedClass,
        studentIdentity: {
          ...(draft.user?.studentIdentity || {}),
          studentId: id,
          displayName: draft.user?.studentIdentity?.displayName || profileName,
          email: draft.user?.studentIdentity?.email || draft.email || '',
          authProvider: draft.user?.studentIdentity?.authProvider || draft.authProvider || 'local',
        },
      },
      settings: {
        ...draft.settings,
        selectedClass,
        sync: {
          ...(draft.settings?.sync || {}),
          provider: draft.settings?.sync?.provider || 'none',
        },
      },
      classContent,
      subjects: classContent[selectedClass] || [],
      starQuizzes: [],
      traitementSujets: [],
      exerciceScolaires: [],
      exerciceGlobaux: [],
    }, id);

    await save({
      ...data,
      activeProfileId: id,
      profileOrder: [...(data.profileOrder || []), id],
      profiles: {
        ...(data.profiles || {}),
        [id]: nextProfile,
      },
      user: nextProfile.user,
      settings: nextProfile.settings,
      classContent: nextProfile.classContent,
      subjects: nextProfile.subjects,
      starQuizzes: nextProfile.starQuizzes,
      traitementSujets: nextProfile.traitementSujets,
      exerciceScolaires: nextProfile.exerciceScolaires,
      exerciceGlobaux: nextProfile.exerciceGlobaux,
    });
    return id;
  }, [data, save]);

  const switchStudentProfile = useCallback(async (profileId) => {
    if (!data) return null;
    const targetId = String(profileId || '').trim();
    const targetProfile = data.profiles?.[targetId];
    if (!targetProfile) return null;
    await save({
      ...data,
      activeProfileId: targetId,
      user: targetProfile.user,
      settings: targetProfile.settings,
      classContent: targetProfile.classContent,
      subjects: targetProfile.subjects,
      starQuizzes: targetProfile.starQuizzes,
      traitementSujets: targetProfile.traitementSujets,
      exerciceScolaires: targetProfile.exerciceScolaires,
      exerciceGlobaux: targetProfile.exerciceGlobaux,
    });
    return targetId;
  }, [data, save]);

  const deleteStudentProfile = useCallback(async (profileId) => {
    if (!data) return false;
    const targetId = String(profileId || '').trim();
    const profileOrder = Array.isArray(data.profileOrder) ? data.profileOrder : [];
    if (profileOrder.length <= 1 || !data.profiles?.[targetId]) return false;
    const nextProfiles = { ...(data.profiles || {}) };
    delete nextProfiles[targetId];
    const nextOrder = profileOrder.filter((entry) => String(entry) !== targetId);
    const nextActiveProfileId = data.activeProfileId === targetId ? nextOrder[0] : data.activeProfileId;
    const nextActiveProfile = nextProfiles[nextActiveProfileId];
    await save({
      ...data,
      activeProfileId: nextActiveProfileId,
      profileOrder: nextOrder,
      profiles: nextProfiles,
      user: nextActiveProfile.user,
      settings: nextActiveProfile.settings,
      classContent: nextActiveProfile.classContent,
      subjects: nextActiveProfile.subjects,
      starQuizzes: nextActiveProfile.starQuizzes,
      traitementSujets: nextActiveProfile.traitementSujets,
      exerciceScolaires: nextActiveProfile.exerciceScolaires,
      exerciceGlobaux: nextActiveProfile.exerciceGlobaux,
    });
    return true;
  }, [data, save]);

  const updateProfileAuth = useCallback(async (partialAuth) => {
    if (!data) return null;
    const activeProfileId = data.activeProfileId;
    const activeProfile = data.profiles?.[activeProfileId];
    if (!activeProfile) return null;
    const nextAuth = normalizeProfileAuth({
      ...(activeProfile.auth || {}),
      ...(partialAuth || {}),
    });
    await save({
      ...data,
      profiles: {
        ...(data.profiles || {}),
        [activeProfileId]: {
          ...activeProfile,
          auth: nextAuth,
          updatedAt: new Date().toISOString(),
        },
      },
    });
    return nextAuth;
  }, [data, save]);

  const changeSelectedClass = useCallback(async (selectedClass) => {
    if (!data) return null;
    const resolvedClass = normalizeClassName(selectedClass, data.user?.selectedClass || data.settings?.selectedClass || CLASSES[0]);
    const availableClasses = getAvailableClasses(data.classContent, resolvedClass);
    if (!availableClasses.includes(resolvedClass)) return null;
    const nextSubjects = data.classContent?.[resolvedClass] || [];
    await save({
      ...data,
      user: { ...data.user, selectedClass: resolvedClass },
      settings: { ...data.settings, selectedClass: resolvedClass },
      subjects: nextSubjects,
    });
    return resolvedClass;
  }, [data, save]);

  const isStudentGoogleSignedIn = Boolean(
    cloudState?.sessionUser?.id && normalizeAdminState(data?.admin).sessionScope === 'user'
  );

  const showToast = useCallback((message, type = 'info') => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const navigate = useCallback((v, params = {}) => {
    if (data?.settings?.uiSoundEnabled !== false) SoundEngine.playClick('softClick');
    if (['subjects', 'chapter', 'quiz', 'exercise-flow'].includes(v) && !isStudentGoogleSignedIn) {
      setView('profile');
      setViewParams({});
      showToast('Connecte-toi avec Google pour accéder aux contenus', 'info');
      window.scrollTo(0, 0);
      return;
    }
    setView(v);
    setViewParams(params);
    window.scrollTo(0, 0);
  }, [data?.settings?.uiSoundEnabled, isStudentGoogleSignedIn, showToast]);

  const pushFloatingFx = useCallback((entries) => {
    const nextEntries = (Array.isArray(entries) ? entries : [entries])
      .filter(Boolean)
      .map((entry, index) => ({
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        amount: Number(entry.amount) || 0,
        label: entry.label || '',
        kind: entry.kind || 'score',
        positive: entry.positive ?? (Number(entry.amount) || 0) >= 0,
      }));

    if (!nextEntries.length) return;

    setFloatingFx(prev => [...prev, ...nextEntries]);
    nextEntries.forEach(entry => {
      window.setTimeout(() => {
        setFloatingFx(prev => prev.filter(item => item.id !== entry.id));
      }, 1500);
    });
  }, []);

  const playClick = useCallback(() => {
    if (data?.settings?.uiSoundEnabled !== false) SoundEngine.playClick(data?.settings?.uiSound || 'bubble');
  }, [data?.settings]);

  const playSpecial = useCallback((type) => {
    if (data?.settings?.uiSoundEnabled !== false) SoundEngine.playSpecial(type);
  }, [data?.settings]);

  const updateProfile = useCallback(async (partial) => {
    if (!data) return null;

    const previousUser = sanitizeUserData(data.user, data.settings);
    const nextUser = sanitizeUserData({ ...data.user, ...partial }, data.settings);
    nextUser.badges = deriveBadges(nextUser);
    const next = { ...data, user: nextUser };
    await save(next);

    const floatingEntries = [
      'credits',
      'globalScore',
      'energy',
      'fire',
      'xp',
    ].map((key) => {
      const delta = Number(nextUser?.[key] || 0) - Number(previousUser?.[key] || 0);
      if (!delta) return null;
      return {
        kind: key,
        label: getFloatingLabel(key),
        amount: key === 'energy' ? Math.round(delta) : delta,
        positive: delta >= 0,
      };
    }).filter(Boolean);

    if (floatingEntries.length) pushFloatingFx(floatingEntries);
    return nextUser;
  }, [data, pushFloatingFx, save]);

  const updateStudentIdentity = useCallback(async (partialIdentity) => {
    if (!data) return null;
    const next = {
      ...data,
      user: {
        ...data.user,
        studentIdentity: {
          ...(data.user?.studentIdentity || {}),
          ...(partialIdentity || {}),
        },
      },
      settings: {
        ...data.settings,
        sync: {
          ...(data.settings?.sync || {}),
          pendingLocalChanges: true,
        },
      },
    };
    await save(next);
    return next.user?.studentIdentity || null;
  }, [data, save]);

  const updateSyncSettings = useCallback(async (partialSync) => {
    if (!data) return null;
    const nextSync = {
      ...(data.settings?.sync || {}),
      ...(partialSync || {}),
    };
    const next = {
      ...data,
      settings: {
        ...data.settings,
        sync: nextSync,
      },
    };
    await save(next);
    return nextSync;
  }, [data, save]);

  const signInActiveProfileWithGoogle = useCallback(async () => {
    if (!data) throw new Error('Données non chargées');
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré');

    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope === 'admin' && cloudState.sessionUser?.id) {
      throw new Error('Déconnectez d’abord le compte admin avant de connecter un utilisateur');
    }

    const preparedState = patchActiveProfileState({
      ...data,
      admin: {
        ...adminState,
        sessionScope: 'user',
      },
    }, {
      auth: {
        provider: 'supabase',
        googleEnabled: true,
        firebaseEnabled: false,
        supabaseEnabled: true,
      },
      settings: {
        sync: {
          provider: 'supabase',
          mode: 'hybrid',
          autoSync: true,
          lastSyncStatus: 'pending',
          pendingLocalChanges: true,
        },
      },
    });

    await persistLocal(normalizeAppData(buildPersistableState(preparedState)));
    await signInWithGoogle({ redirectTo: window.location.origin });
    return true;
  }, [buildPersistableState, cloudState.sessionUser, data, persistLocal]);

  const signInAdminWithGoogle = useCallback(async () => {
    if (!data) throw new Error('Données non chargées');
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré');

    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope === 'user' && cloudState.sessionUser?.id) {
      throw new Error('Déconnectez d’abord le compte utilisateur avant de connecter l’admin');
    }

    const latestCloudState = await refreshCloudState();

    await persistLocal(normalizeAppData(buildPersistableState({
      ...data,
      admin: {
        ...adminState,
        sessionScope: 'admin',
      },
    })));

    const sharedOwner = normalizeAdminState(latestCloudState?.sharedAdminOwner || cloudState.sharedAdminOwner || {});
    const ownerRemoteUserId = (sharedOwner.ownerRemoteUserId || adminState.ownerRemoteUserId || '').toString().trim();
    const sessionUserId = (cloudState.sessionUser?.id || '').toString().trim();
    if (ownerRemoteUserId && sessionUserId && sessionUserId !== ownerRemoteUserId) {
      await signOutSupabase();
    }

    await signInWithGoogle({
      redirectTo: window.location.origin,
      forceAccountSelection: true,
    });
    return true;
  }, [buildPersistableState, cloudState.sessionUser, cloudState.sharedAdminOwner, data, persistLocal, refreshCloudState]);

  const signOutActiveProfileCloud = useCallback(async () => {
    if (!data) return false;
    const adminState = normalizeAdminState(data.admin);
    const activeProfile = data.profiles?.[data.activeProfileId];
    setCloudState(prev => ({
      ...prev,
      sessionUser: null,
      remoteProfiles: [],
      busy: true,
      error: '',
    }));
    await signOutSupabase();
    const clearedState = patchActiveProfileState({
      ...data,
      admin: {
        ...adminState,
        sessionScope: adminState.sessionScope === 'user' ? 'none' : adminState.sessionScope,
      },
    }, {
      auth: {
        provider: 'local',
        googleEnabled: false,
        supabaseEnabled: false,
        guestPlaceholder: false,
        linkedRemoteUserId: activeProfile?.auth?.linkedRemoteUserId || activeProfile?.auth?.remoteUserId || '',
        remoteUserId: '',
        remoteProfileId: activeProfile?.auth?.remoteProfileId || '',
        lastAuthAt: '',
      },
      user: {
        studentIdentity: {
          displayName: activeProfile?.user?.profileName || activeProfile?.user?.studentIdentity?.displayName || '',
          remoteUserId: '',
          email: '',
          authProvider: 'local',
        },
      },
      settings: {
        sync: {
          provider: 'none',
          autoSync: false,
          lastSyncStatus: 'idle',
          lastSyncedAt: '',
          pendingLocalChanges: false,
        },
      },
    });
    const neutralState = buildNeutralLocalProfileState(normalizeAppData(buildPersistableState(clearedState)));
    profileResolutionInFlightRef.current = false;
    lastRemoteHydrationKeyRef.current = '';
    await persistLocal(normalizeAppData(buildPersistableState(neutralState)));
    await refreshCloudState();
    return true;
  }, [buildPersistableState, data, persistLocal, refreshCloudState]);

  const signOutAdminCloud = useCallback(async (options = {}) => {
    if (!data) return false;
    const adminState = normalizeAdminState(data.admin);
    const clearOwnership = Boolean(options?.clearOwnership);
    const sessionUserId = (cloudState.sessionUser?.id || '').toString();

    if (clearOwnership && adminState.ownerRemoteUserId && adminState.ownerRemoteUserId !== sessionUserId) {
      throw new Error('Seul le compte admin propriétaire actuellement connecté peut se désister');
    }

    setCloudState(prev => ({
      ...prev,
      sessionUser: null,
      remoteProfiles: [],
      busy: true,
      error: '',
    }));
    if (clearOwnership) {
      await clearSharedAdminRegistry();
    }
    await signOutSupabase();
    await persistLocal(normalizeAppData(buildPersistableState({
      ...data,
      admin: clearOwnership
        ? {
          ...DEFAULT_ADMIN_STATE,
          sessionScope: 'none',
        }
        : {
          ...adminState,
          sessionScope: 'none',
        },
    })));
    await refreshCloudState();
    return true;
  }, [buildPersistableState, cloudState.sessionUser, data, persistLocal, refreshCloudState]);

  const resetCurrentUserCloudProfiles = useCallback(async () => {
    if (!data) throw new Error('Données non chargées');
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré');
    if (normalizeAdminState(data.admin).sessionScope !== 'user') {
      throw new Error('Connectez d’abord le profil utilisateur avec Google avant la réinitialisation cloud');
    }

    const remoteUserId = (cloudState.sessionUser?.id || '').toString().trim();
    if (!remoteUserId) throw new Error('Aucun compte Google élève connecté');

    setCloudState(prev => ({
      ...prev,
      busy: true,
      error: '',
    }));

    try {
      await deleteSupabaseProfiles(remoteUserId);

      const retainedProfiles = {};
      const retainedOrder = [];
      (data.profileOrder || []).forEach((profileId) => {
        const profile = data.profiles?.[profileId];
        if (!profile) return;
        if (getProfileLinkedRemoteUserId(profile) === remoteUserId) return;
        retainedProfiles[profileId] = profile;
        retainedOrder.push(profileId);
      });

      const resetState = buildNeutralLocalProfileState({
        ...data,
        admin: {
          ...normalizeAdminState(data.admin),
          sessionScope: 'none',
        },
        activeProfileId: retainedOrder[0] || '',
        profileOrder: retainedOrder,
        profiles: retainedProfiles,
      });

      profileResolutionInFlightRef.current = false;
      lastRemoteHydrationKeyRef.current = '';
      await signOutSupabase();
      await persistLocal(normalizeAppData(buildPersistableState(resetState)));
      await refreshCloudState();
      return true;
    } catch (error) {
      setCloudState(prev => ({
        ...prev,
        error: error?.message || 'Échec de réinitialisation Supabase',
      }));
      throw error;
    } finally {
      setCloudState(prev => ({ ...prev, busy: false }));
    }
  }, [buildPersistableState, cloudState.sessionUser, data, persistLocal, refreshCloudState]);

  const resetCloudProfilesForRemoteUser = useCallback(async (remoteUserId) => {
    if (!data) throw new Error('Données non chargées');
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré');

    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope !== 'admin') {
      throw new Error('Connectez-vous d’abord comme administrateur');
    }

    const targetRemoteUserId = (remoteUserId || '').toString().trim();
    if (!targetRemoteUserId) throw new Error('Compte cloud introuvable');

    setCloudState(prev => ({
      ...prev,
      busy: true,
      error: '',
      knownAccountsError: '',
    }));

    try {
      await deleteSupabaseProfiles(targetRemoteUserId);

      const retainedProfiles = {};
      const retainedOrder = [];
      (data.profileOrder || []).forEach((profileId) => {
        const profile = data.profiles?.[profileId];
        if (!profile) return;
        if (getProfileLinkedRemoteUserId(profile) === targetRemoteUserId) return;
        retainedProfiles[profileId] = profile;
        retainedOrder.push(profileId);
      });

      const baseState = {
        ...data,
        activeProfileId: retainedOrder.includes(data.activeProfileId) ? data.activeProfileId : (retainedOrder[0] || ''),
        profileOrder: retainedOrder,
        profiles: retainedProfiles,
      };
      const nextState = retainedOrder.length
        ? normalizeAppData(buildPersistableState(baseState))
        : buildNeutralLocalProfileState(baseState);

      profileResolutionInFlightRef.current = false;
      lastRemoteHydrationKeyRef.current = '';
      await persistLocal(normalizeAppData(buildPersistableState(nextState)));
      await refreshCloudState();
      await refreshAdminCloudDirectory();
      return true;
    } catch (error) {
      setCloudState(prev => ({
        ...prev,
        error: error?.message || 'Échec de suppression cloud administrateur',
      }));
      throw error;
    } finally {
      setCloudState(prev => ({ ...prev, busy: false }));
    }
  }, [buildPersistableState, data, persistLocal, refreshAdminCloudDirectory, refreshCloudState]);

  const inspectCloudAccount = useCallback(async (remoteUserId) => {
    if (!data) throw new Error('Données non chargées');
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré');

    const adminState = normalizeAdminState(data.admin);
    if (adminState.sessionScope !== 'admin') {
      throw new Error('Connectez-vous d’abord comme administrateur');
    }

    const targetRemoteUserId = (remoteUserId || '').toString().trim();
    if (!targetRemoteUserId) throw new Error('Compte cloud introuvable');

    return listSupabaseProfilesWithPayload(targetRemoteUserId);
  }, [data]);

  const pushActiveProfileToCloud = useCallback(async () => {
    if (!data) throw new Error('Données non chargées');
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré');
    if (normalizeAdminState(data.admin).sessionScope !== 'user') {
      throw new Error('Connectez d’abord le profil utilisateur avec Google avant la synchronisation');
    }

    const activeProfile = data.profiles?.[data.activeProfileId];
    if (!activeProfile) throw new Error('Profil actif introuvable');

    const remoteUserId = (
      cloudState.sessionUser?.id
      || activeProfile.auth?.remoteUserId
      || activeProfile.user?.studentIdentity?.remoteUserId
      || ''
    ).toString().trim();

    if (!remoteUserId) throw new Error('Connectez Google pour ce profil avant la synchronisation');

    cloudSyncInFlightRef.current = true;
    setCloudState(prev => ({ ...prev, busy: true, error: '' }));

    const pendingState = patchActiveProfileState(data, {
      settings: {
        sync: {
          provider: 'supabase',
          mode: 'hybrid',
          lastSyncStatus: 'pending',
          pendingLocalChanges: true,
        },
      },
    });
    await persistLocal(normalizeAppData(buildPersistableState(pendingState)));

    try {
      const remote = await pushProfileToSupabase(buildStudentProfileCloudPayload(pendingState.profiles?.[pendingState.activeProfileId]), {
        remoteUserId,
      });
      const syncedState = patchActiveProfileState(pendingState, {
        auth: {
          provider: 'supabase',
          googleEnabled: true,
          supabaseEnabled: true,
          guestPlaceholder: false,
          remoteUserId,
          linkedRemoteUserId: remoteUserId,
          remoteProfileId: remote?.profile_id || activeProfile.auth?.remoteProfileId || activeProfile.id,
          lastAuthAt: activeProfile.auth?.lastAuthAt || new Date().toISOString(),
        },
        user: {
          studentIdentity: {
            remoteUserId,
            email: cloudState.sessionUser?.email || activeProfile.user?.studentIdentity?.email || '',
            authProvider: 'supabase',
          },
        },
        settings: {
          sync: {
            provider: 'supabase',
            mode: 'hybrid',
            lastSyncedAt: new Date().toISOString(),
            lastSyncStatus: 'success',
            pendingLocalChanges: false,
          },
        },
      });
      await persistLocal(normalizeAppData(buildPersistableState(syncedState)));
      await refreshCloudState();
      return remote;
    } catch (error) {
      const failedState = patchActiveProfileState(pendingState, {
        settings: {
          sync: {
            lastSyncStatus: 'error',
            pendingLocalChanges: true,
          },
        },
      });
      await persistLocal(normalizeAppData(buildPersistableState(failedState)));
      setCloudState(prev => ({
        ...prev,
        error: error?.message || 'Échec de synchronisation Supabase',
      }));
      throw error;
    } finally {
      cloudSyncInFlightRef.current = false;
      setCloudState(prev => ({ ...prev, busy: false }));
    }
  }, [buildPersistableState, cloudState.sessionUser, data, persistLocal, refreshCloudState]);

  const pullActiveProfileFromCloud = useCallback(async () => {
    if (!data) throw new Error('Données non chargées');
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré');
    if (normalizeAdminState(data.admin).sessionScope !== 'user') {
      throw new Error('Connectez d’abord le profil utilisateur avec Google avant la récupération cloud');
    }

    const activeProfile = data.profiles?.[data.activeProfileId];
    if (!activeProfile) throw new Error('Profil actif introuvable');

    const remoteUserId = (
      cloudState.sessionUser?.id
      || activeProfile.auth?.remoteUserId
      || activeProfile.auth?.linkedRemoteUserId
      || activeProfile.user?.studentIdentity?.remoteUserId
      || ''
    ).toString().trim();
    const remoteProfileId = getProfileRemoteRecordId(activeProfile);
    if (!remoteUserId) throw new Error('Connectez Google pour ce profil avant la récupération');
    if (!remoteProfileId) throw new Error('Profil cloud distant introuvable pour cet élève');

    cloudSyncInFlightRef.current = true;
    setCloudState(prev => ({ ...prev, busy: true, error: '' }));

    try {
      const remote = await pullProfileFromSupabase(remoteProfileId, remoteUserId);
      if (!remote?.payload) throw new Error('Aucun profil distant trouvé pour cet élève');

      const restoredProfile = normalizeProfileEntry({
        ...applyAuthoritativeStudentContent(
          remote.payload,
          cloudState.sharedContent?.classContent,
          data.classContent
        ),
        id: activeProfile.id,
        auth: {
          ...(remote.payload?.auth || {}),
          provider: 'supabase',
          googleEnabled: true,
          supabaseEnabled: true,
          guestPlaceholder: false,
          remoteUserId,
          linkedRemoteUserId: remoteUserId,
          remoteProfileId: remote?.profile_id || activeProfile.auth?.remoteProfileId || activeProfile.id,
          lastAuthAt: activeProfile.auth?.lastAuthAt || new Date().toISOString(),
        },
        user: {
          ...(remote.payload?.user || {}),
          studentIdentity: {
            ...(remote.payload?.user?.studentIdentity || {}),
            remoteUserId,
            email: cloudState.sessionUser?.email || remote?.email || remote.payload?.user?.studentIdentity?.email || '',
            authProvider: 'supabase',
          },
        },
        settings: {
          ...(remote.payload?.settings || {}),
          sync: {
            ...(remote.payload?.settings?.sync || {}),
            provider: 'supabase',
            mode: 'hybrid',
            lastSyncedAt: new Date().toISOString(),
            lastSyncStatus: 'success',
            pendingLocalChanges: false,
          },
        },
      }, activeProfile.id);

      const restoredState = normalizeAppData({
        ...data,
        profiles: {
          ...(data.profiles || {}),
          [activeProfile.id]: restoredProfile,
        },
      });
      await persistLocal(normalizeAppData(buildPersistableState(restoredState)));
      await refreshCloudState();
      return restoredProfile;
    } catch (error) {
      const failedState = patchActiveProfileState(data, {
        settings: {
          sync: {
            lastSyncStatus: 'error',
          },
        },
      });
      await persistLocal(normalizeAppData(buildPersistableState(failedState)));
      setCloudState(prev => ({
        ...prev,
        error: error?.message || 'Échec de récupération Supabase',
      }));
      throw error;
    } finally {
      cloudSyncInFlightRef.current = false;
      setCloudState(prev => ({ ...prev, busy: false }));
    }
  }, [buildPersistableState, cloudState.sessionUser, data, persistLocal, refreshCloudState]);

  const consumeInventoryItem = useCallback(async (inventoryKey, quantity = 1) => {
    if (!data) return false;

    const user = sanitizeUserData(data.user, data.settings);
    const safeQuantity = clampFloor(quantity || 1, 1);
    if ((user.inventory?.[inventoryKey] || 0) < safeQuantity) return false;

    const nextUser = {
      ...user,
      inventory: {
        ...user.inventory,
        [inventoryKey]: clampFloor((user.inventory?.[inventoryKey] || 0) - safeQuantity),
      },
    };

    await save({ ...data, user: nextUser });
    pushFloatingFx({
      kind: inventoryKey,
      label: getFloatingLabel(inventoryKey),
      amount: -safeQuantity,
      positive: false,
    });
    return true;
  }, [data, pushFloatingFx, save]);

  const addXp = useCallback(async (amount, chapterTitle = '') => {
    if (!data) return;
    const user = sanitizeUserData(data.user, data.settings);
    const delta = clampFloor(amount);
    const nextUser = {
      ...user,
      xp: user.xp + delta,
      history: [{ date: new Date().toLocaleDateString(), chapter: chapterTitle, score: `+${delta} XP` }, ...(user.history || [])].slice(0, 40),
    };
    nextUser.badges = deriveBadges(nextUser);
    const next = { ...data, user: nextUser };
    await save(next);
    if (delta > 0) {
      pushFloatingFx({ kind: 'xp', label: 'XP', amount: delta, positive: true });
    }
  }, [data, save]);

  const applySessionRewards = useCallback(async (sessionSummary) => {
    if (!data) return null;

    const user = sanitizeUserData(data.user, data.settings);
    const xpDelta = clampFloor(sessionSummary?.xpDelta);
    const creditsDelta = Number(sessionSummary?.creditsDelta) || 0;
    const averageWeight = Math.max(1, clampFloor(sessionSummary?.averageWeight, 1));
    const nextAverageSamples = (user.stats?.averageSamples || 0) + averageWeight;
    const nextAverageScoreSum = Number(user.stats?.averageScoreSum || 0) + (Number(sessionSummary?.average20 || 0) * averageWeight);
    const averageAfter = clampRange(nextAverageSamples > 0 ? (nextAverageScoreSum / nextAverageSamples) : user.averageScore, 0, 20);
    const energyDelta = Number(sessionSummary?.energyDelta) || 0;
    const fireDelta = Number(sessionSummary?.fireDelta) || 0;
    const fireAfter = clampFloor((sessionSummary?.fireAfter ?? (user.fire + fireDelta)) || 0);
    const globalScoreDelta = Number(sessionSummary?.globalScoreDelta) || 0;
    const resolvedSummary = {
      ...sessionSummary,
      averageAfter,
      averageDelta: Number((averageAfter - Number(user.averageScore || 0)).toFixed(1)),
      fireAfter,
      fireDelta,
    };
    const nextUser = mergeSessionStats({
      ...user,
      xp: user.xp + xpDelta,
      credits: clampFloor(user.credits + creditsDelta),
      globalScore: clampFloor(user.globalScore + globalScoreDelta),
      averageScore: averageAfter,
      energy: clampRange(user.energy + energyDelta, 0, data.settings?.scoreCaps?.energy || 100),
      fire: fireAfter,
      streak: fireAfter,
    }, resolvedSummary, data.settings);
    nextUser.badges = deriveBadges(nextUser);

    await save({ ...data, user: nextUser });

    const unlockedBadges = nextUser.badges.filter(badgeId => !(user.badges || []).includes(badgeId));
    if (unlockedBadges.length > 0) {
      showToast(`Badge débloqué : ${unlockedBadges[0].replace(/_/g, ' ')}`, 'success');
    }

    pushFloatingFx([
      xpDelta > 0 ? { kind: 'xp', label: 'XP', amount: xpDelta, positive: true } : null,
      creditsDelta !== 0 ? { kind: 'credits', label: 'Crédits', amount: creditsDelta, positive: creditsDelta >= 0 } : null,
      (Number(resolvedSummary.averageDelta) || 0) !== 0 ? { kind: 'average', label: 'Moy.', amount: Number(resolvedSummary.averageDelta).toFixed(1), positive: Number(resolvedSummary.averageDelta) >= 0 } : null,
      energyDelta !== 0 ? { kind: 'energy', label: 'Énergie', amount: energyDelta, positive: energyDelta >= 0 } : null,
      fireDelta !== 0 ? { kind: 'fire', label: 'Feu', amount: fireDelta, positive: fireDelta >= 0 } : null,
    ]);

    return nextUser;
  }, [data, pushFloatingFx, save, showToast]);

  const purchaseItem = useCallback(async (itemId) => {
    if (!data) return false;

    const item = SHOP_ITEMS.find(entry => entry.id === itemId);
    if (!item) {
      showToast('Article introuvable', 'error');
      return false;
    }

    const user = sanitizeUserData(data.user, data.settings);
    if (user.credits < item.price) {
      showToast('Crédits insuffisants', 'error');
      return false;
    }

    const nextUser = {
      ...user,
      credits: clampFloor(user.credits - item.price),
      inventory: {
        ...user.inventory,
        [item.inventoryKey]: clampFloor((user.inventory?.[item.inventoryKey] || 0) + item.quantity),
      },
    };
    nextUser.badges = deriveBadges(nextUser);

    await save({ ...data, user: nextUser });
    pushFloatingFx([
      { kind: 'credits', label: 'Crédits', amount: -item.price, positive: false },
      { kind: item.inventoryKey, label: item.label, amount: item.quantity, positive: true },
    ]);
    showToast(`${item.label} ajouté à l'inventaire`, 'success');
    return true;
  }, [data, pushFloatingFx, save, showToast]);

  const startQuiz = useCallback((questions, title, mode = 'standard', enonce, meta = {}) => {
    if (!isStudentGoogleSignedIn) {
      showToast('Connecte-toi avec Google pour accéder aux contenus', 'info');
      navigate('profile');
      return false;
    }
    const nextQuestions = meta.shuffleQuestions === false
      ? [...questions]
      : [...questions].sort(() => Math.random() - 0.5);
    setQuizState({ questions: nextQuestions, title, mode, enonce, ...meta });
    navigate('quiz');
    return true;
  }, [isStudentGoogleSignedIn, navigate, showToast]);

  const profiles = (data?.profileOrder || []).map((profileId, index) => {
    const profile = data?.profiles?.[profileId];
    return {
      id: profileId,
      name: profile?.user?.profileName || `Élève ${index + 1}`,
      avatar: profile?.user?.avatar || '',
      selectedClass: profile?.user?.selectedClass || profile?.settings?.selectedClass || CLASSES[0],
      stats: profile?.user?.stats || {},
      studentIdentity: profile?.user?.studentIdentity || null,
      syncSettings: profile?.settings?.sync || null,
      auth: profile?.auth || null,
      createdAt: profile?.createdAt || '',
      updatedAt: profile?.updatedAt || '',
    };
  });
  const adminState = normalizeAdminState(data?.admin);
  const sharedAdminOwner = normalizeAdminState(cloudState.sharedAdminOwner || {});
  const adminSessionUser = adminState.sessionScope === 'admin' ? cloudState.sessionUser : null;
  const userSessionUser = adminState.sessionScope === 'user' ? cloudState.sessionUser : null;
  const adminStatus = {
    ...adminState,
    ownerRemoteUserId: sharedAdminOwner.ownerRemoteUserId || adminState.ownerRemoteUserId,
    ownerEmail: sharedAdminOwner.ownerEmail || adminState.ownerEmail,
    ownerDisplayName: sharedAdminOwner.ownerDisplayName || adminState.ownerDisplayName,
    ownerAvatar: sharedAdminOwner.ownerAvatar || adminState.ownerAvatar,
    lastClaimedAt: sharedAdminOwner.lastClaimedAt || adminState.lastClaimedAt,
    configured: cloudState.configured,
    busy: cloudState.busy,
    error: cloudState.error,
    sessionUser: adminSessionUser,
    userSessionUser,
    sharedOwner: cloudState.sharedAdminOwner,
    sharedRegistryAvailable: cloudState.sharedAdminRegistryAvailable,
    sharedRegistryError: cloudState.sharedAdminRegistryError,
    knownAccounts: cloudState.knownAccounts,
    knownAccountsAvailable: cloudState.knownAccountsAvailable,
    knownAccountsError: cloudState.knownAccountsError,
    isAdminSessionActive: Boolean(adminSessionUser?.id),
    isUserSessionActive: Boolean(userSessionUser?.id),
  };

  const value = {
    data, save, loading,
    view, viewParams, navigate,
    currentSubjectId, setCurrentSubjectId,
    quizState, startQuiz, setQuizState,
    toast, showToast,
    floatingFx, pushFloatingFx,
    playClick, playSpecial,
    addXp,
    applySessionRewards,
    purchaseItem,
    availableClasses: getAvailableClasses(data?.classContent, data?.user?.selectedClass || data?.settings?.selectedClass),
    profiles,
    activeProfileId: data?.activeProfileId || null,
    persistenceProfile,
    adminStatus,
    cloudStatus: cloudState,
    isStudentGoogleSignedIn,
    studentIdentity: data?.user?.studentIdentity || null,
    syncSettings: data?.settings?.sync || null,
    changeSelectedClass,
    createStudentProfile,
    switchStudentProfile,
    deleteStudentProfile,
    updateProfile,
    updateProfileAuth,
    updateStudentIdentity,
    updateSyncSettings,
    signInActiveProfileWithGoogle,
    signOutActiveProfileCloud,
    resetCurrentUserCloudProfiles,
    resetCloudProfilesForRemoteUser,
    inspectCloudAccount,
    signInAdminWithGoogle,
    signOutAdminCloud,
    releaseAdminAccess: () => signOutAdminCloud({ clearOwnership: true }),
    refreshAdminCloudDirectory,
    pushActiveProfileToCloud,
    pullActiveProfileFromCloud,
    refreshCloudState,
    consumeInventoryItem,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
