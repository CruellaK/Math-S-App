import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { storage } from '../lib/store';
import {
  CLASSES,
  CONTENT_DIFFICULTY_LEVELS,
  CONTENT_OBJECTIVE_GROUPS,
  DEFAULT_CONTENT_DIFFICULTY,
  DEFAULT_OBJECTIVE_GROUP_ID,
  createDefaultClassDefaults,
  createDefaultTimingDefaults,
  createSubjectShell,
  normalizeClassName,
  SUBJECT_ICON_OPTIONS,
} from '../lib/constants';
import { computeSubjectAccess } from '../lib/subjectAccess';
import {
  applyAdminImportToSubject,
  CONTENT_TYPE_OPTIONS,
  createAdminChapter,
  createAdminNamedItem,
  DEFAULT_ADMIN_CLASS,
  DEFAULT_ADMIN_SUBJECT_ID,
  deleteAdminItemFromSubject,
  exportAdminItemFiles,
  EXAMPLE_IMPORT_FILES,
  getImportSlots,
  listAdminItems,
  PROMPT_BANK,
  renameAdminChapter,
  renameAdminNamedItem,
  validateAdminPayload,
} from '../lib/adminContent';
import { ADMIN_DOWNLOADABLE_EXAMPLES } from '../lib/adminExampleCatalog';
import {
  Shield, Upload, Download, FileText, Trash2,
  Copy, Check, BookOpen, Brain, AlertCircle, GraduationCap, Layers, Settings2,
  User, Save, RefreshCw, Users, Lock, Unlock
} from 'lucide-react';

/* ═══════════════════════════════════════════════════
   ADMIN VIEW — Import/Export, password, prompts IA
   ═══════════════════════════════════════════════════ */

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const QUIZ_MODE_LABELS = {
  suggestion: 'Suggestion',
  input: 'Input',
  trap: 'Pièges',
  duel_intrus: 'Duel',
  deminage: 'Déminage',
  unknown: 'Non précisé',
};

function formatAdminDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

function formatAdminScore(value) {
  return Number(Number(value) || 0).toFixed(1);
}

function mergeAdminProfileHistory(profile = {}) {
  const statsSessions = Array.isArray(profile?.user?.stats?.recentSessions) ? profile.user.stats.recentSessions : [];
  const legacySessions = Array.isArray(profile?.user?.history) ? profile.user.history : [];
  const merged = [];
  const seen = new Set();

  const pushEntry = (entry, index, source) => {
    const key = [
      source,
      entry?.recordedAt || entry?.date || index,
      entry?.title || entry?.chapter || '',
      entry?.sessionKind || entry?.type || '',
      entry?.quizMode || '',
      entry?.subjectId || entry?.subjectName || '',
    ].join('::');
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({
      recordedAt: entry?.recordedAt || entry?.date || '',
      title: entry?.title || entry?.chapter || 'Session',
      sessionKind: entry?.sessionKind || entry?.type || 'quiz',
      quizMode: entry?.quizMode || '',
      flowType: entry?.flowType || '',
      subjectId: entry?.subjectId ?? null,
      subjectName: entry?.subjectName || '',
      average20: Number(entry?.average20 ?? entry?.average ?? 0) || 0,
      displayScore: Number(entry?.displayScore ?? entry?.score ?? 0) || 0,
      scoreScale: Number(entry?.scoreScale || 100) || 100,
      totalQuestions: Number(entry?.totalQuestions || 0) || 0,
      verifyCount: Number(entry?.verifyCount || 0) || 0,
      goodVerifications: Number(entry?.goodVerifications || 0) || 0,
      badVerifications: Number(entry?.badVerifications || 0) || 0,
      hintsUsed: Number(entry?.hintsUsed || 0) || 0,
      timeSpentSeconds: Number(entry?.timeSpentSeconds || 0) || 0,
      averageQuestionSeconds: Number(entry?.averageQuestionSeconds || 0) || 0,
      mention: entry?.mention || '',
    });
  };

  statsSessions.forEach((entry, index) => pushEntry(entry, index, 'recent'));
  legacySessions.forEach((entry, index) => pushEntry(entry, index, 'legacy'));

  return merged.sort((left, right) => new Date(right.recordedAt || 0).getTime() - new Date(left.recordedAt || 0).getTime());
}

function buildTeacherProfileSummary(profile = {}, row = {}) {
  const user = profile?.user || {};
  const stats = user?.stats || {};
  const mergedHistory = mergeAdminProfileHistory(profile);
  const verificationRate = (Number(stats.totalVerifications) || 0) > 0
    ? Math.round(((Number(stats.goodVerifications) || 0) / Math.max(1, Number(stats.totalVerifications) || 0)) * 100)
    : 0;
  const quizModes = {
    suggestion: 0,
    input: 0,
    trap: 0,
    duel_intrus: 0,
    deminage: 0,
    unknown: 0,
  };
  const activity = {
    quizzes: 0,
    exercices: 0,
    sujetTypes: 0,
    other: 0,
  };

  mergedHistory.forEach((entry) => {
    if (entry.sessionKind === 'quiz') {
      activity.quizzes += 1;
      const modeKey = Object.prototype.hasOwnProperty.call(quizModes, entry.quizMode) ? entry.quizMode : 'unknown';
      quizModes[modeKey] += 1;
      return;
    }
    if (entry.sessionKind === 'exercise-flow') {
      if (entry.flowType === 'sujet-type') activity.sujetTypes += 1;
      else activity.exercices += 1;
      return;
    }
    activity.other += 1;
  });

  return {
    row,
    user,
    stats,
    verificationRate,
    mergedHistory,
    quizModes,
    activity,
    subjectPerformance: Object.entries(stats.subjectPerformance || {}),
  };
}

function GoogleIcon({ size = 18, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M21.805 10.023H12.25v3.955h5.469c-.235 1.272-.961 2.351-2 3.076v2.551h3.236c1.895-1.745 2.986-4.314 2.986-7.355 0-.743-.067-1.457-.136-2.227Z" fill="#4285F4" />
      <path d="M12.25 22c2.727 0 5.014-.904 6.685-2.445l-3.236-2.551c-.901.604-2.055.961-3.449.961-2.637 0-4.872-1.779-5.671-4.172H3.234v2.634A10.094 10.094 0 0 0 12.25 22Z" fill="#34A853" />
      <path d="M6.579 13.793a6.067 6.067 0 0 1-.317-1.918c0-.666.114-1.314.317-1.918V7.323H3.234A10.094 10.094 0 0 0 2.25 11.875c0 1.629.389 3.172 1.078 4.552l3.251-2.634Z" fill="#FBBC05" />
      <path d="M12.25 5.785c1.485 0 2.819.511 3.868 1.513l2.9-2.9C17.26 2.76 14.973 1.75 12.25 1.75a10.094 10.094 0 0 0-9.016 5.573l3.345 2.634c.799-2.394 3.034-4.172 5.671-4.172Z" fill="#EA4335" />
    </svg>
  );
}

function ContentMetaChips({ item }) {
  const difficulty = item?.difficulty || item?.quiz_metadata?.difficulty || DEFAULT_CONTENT_DIFFICULTY;
  const difficultyMeta = CONTENT_DIFFICULTY_LEVELS.find((entry) => entry.id === difficulty)
    || CONTENT_DIFFICULTY_LEVELS.find((entry) => entry.id === DEFAULT_CONTENT_DIFFICULTY);
  const objectiveGroup = item?.objectiveGroup || item?.quiz_metadata?.objectiveGroup || DEFAULT_OBJECTIVE_GROUP_ID;
  const objectiveMeta = CONTENT_OBJECTIVE_GROUPS.find((entry) => entry.id === objectiveGroup) || CONTENT_OBJECTIVE_GROUPS[0];
  return (
    <>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-primary/10 text-primary-dark">
        <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5 14 5v6L8 14.5 2 11V5L8 1.5Z" fill="currentColor" opacity="0.18" />
          <path d="M8 2.6 13 5.5v5L8 13.4 3 10.5v-5L8 2.6Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5.2 8.4 7.1 10.2 11 5.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {difficultyMeta?.label || 'Très bien'}
      </span>
      <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-accent-purple/10 text-accent-purple">
        {objectiveMeta?.label || 'Objectif mention très bien'}
      </span>
    </>
  );
}

function SubjectStatusChips({ contentType, item }) {
  if (contentType === 'quiz') {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        <ContentMetaChips item={item} />
        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.hasSuggestion ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'}`}>Suggestion</span>
        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.hasInput ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'}`}>Input</span>
        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.hasTrap ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'}`}>Pièges</span>
        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.hasDuelIntrus ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'}`}>Duel</span>
        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.hasDeminage ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'}`}>Déminage</span>
      </div>
    );
  }

  if (contentType === 'parcours') {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        <ContentMetaChips item={item} />
        <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-primary/10 text-primary-dark">Leçon validée</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <ContentMetaChips item={item} />
      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.hasEnonce ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'}`}>Sujet</span>
      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.hasBrouillon ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'}`}>Brouillon</span>
      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${item.hasTraitement ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'}`}>Traitement</span>
    </div>
  );
}

function buildQuestionReference(item, subjectName, questionIndex) {
  return `${subjectName || 'Matière'} · Chapitre ${item.chapterNumber} · ${item.title} · Question ${questionIndex + 1}`;
}

function normalizeAdminKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildAdminItemId(contentType, chapterNumber, title) {
  if (contentType === 'quiz') return `${chapterNumber}-quiz-${title}`;
  if (contentType === 'sujet-type') return `${chapterNumber}-sujet-${title}`;
  if (contentType === 'exercice') return `${chapterNumber}-exercice-${title}`;
  return '';
}

function sanitizeFilenameSegment(value, fallback = 'backup') {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_');
  return normalized || fallback;
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function getBuiltInAdminSubjectKey(normalizedName) {
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

function getSubjectMergeKey(subject) {
  const normalizedName = normalizeAdminKey(subject?.name);
  const builtInKey = getBuiltInAdminSubjectKey(normalizedName);
  if (builtInKey) return builtInKey;
  if (Number(subject?.id) > 0) return `id:${Number(subject.id)}`;
  return `name:${normalizedName}`;
}

function mergeSubjectBuckets(existingSubjects = [], incomingSubjects = []) {
  const nextBucket = [...(Array.isArray(existingSubjects) ? existingSubjects : [])];
  const keyIndexMap = new Map(nextBucket.map((subject, index) => [getSubjectMergeKey(subject), index]));

  (Array.isArray(incomingSubjects) ? incomingSubjects : []).forEach((subject) => {
    const key = getSubjectMergeKey(subject);
    const existingIndex = keyIndexMap.get(key);
    if (existingIndex === undefined) {
      keyIndexMap.set(key, nextBucket.length);
      nextBucket.push(subject);
      return;
    }
    nextBucket[existingIndex] = {
      ...nextBucket[existingIndex],
      ...subject,
    };
  });

  return nextBucket;
}

function upsertSubjectInBucket(existingSubjects = [], incomingSubject, mergeMode = 'overwrite') {
  const nextBucket = [...(Array.isArray(existingSubjects) ? existingSubjects : [])];
  const incomingKey = getSubjectMergeKey(incomingSubject);
  const existingIndex = nextBucket.findIndex((subject) => getSubjectMergeKey(subject) === incomingKey);

  if (existingIndex === -1) return [...nextBucket, incomingSubject];

  nextBucket[existingIndex] = mergeMode === 'merge'
    ? { ...nextBucket[existingIndex], ...incomingSubject }
    : incomingSubject;
  return nextBucket;
}

function mergeClassContentMaps(currentClassContent = {}, incomingClassContent = {}) {
  const nextMap = { ...(currentClassContent || {}) };
  Object.entries(incomingClassContent || {}).forEach(([className, subjects]) => {
    nextMap[className] = mergeSubjectBuckets(nextMap[className], subjects);
  });
  return nextMap;
}

function buildProfileBackupSnapshot(appData, profileId, options = {}) {
  const profile = appData?.profiles?.[profileId];
  if (!profile) return null;

  const scopedClassName = normalizeClassName(
    options.className || profile?.user?.selectedClass || profile?.settings?.selectedClass || DEFAULT_ADMIN_CLASS,
    DEFAULT_ADMIN_CLASS
  );
  const scopedSubjects = Array.isArray(options.subjects)
    ? options.subjects
    : (profile?.classContent?.[scopedClassName] || []);

  return {
    id: profileId,
    createdAt: profile?.createdAt || '',
    updatedAt: new Date().toISOString(),
    auth: profile?.auth || {},
    user: {
      ...(profile?.user || {}),
      selectedClass: scopedClassName,
    },
    settings: {
      ...(profile?.settings || {}),
      selectedClass: scopedClassName,
    },
    classContent: {
      [scopedClassName]: scopedSubjects,
    },
    subjects: scopedSubjects,
    starQuizzes: Array.isArray(profile?.starQuizzes) ? profile.starQuizzes : [],
    traitementSujets: Array.isArray(profile?.traitementSujets) ? profile.traitementSujets : [],
    exerciceScolaires: Array.isArray(profile?.exerciceScolaires) ? profile.exerciceScolaires : [],
    exerciceGlobaux: Array.isArray(profile?.exerciceGlobaux) ? profile.exerciceGlobaux : [],
  };
}

function buildScopedProfileRestore(profileSnapshot, className, subjects, mergeMode, existingProfile) {
  const targetClassName = normalizeClassName(
    className || profileSnapshot?.user?.selectedClass || profileSnapshot?.settings?.selectedClass || DEFAULT_ADMIN_CLASS,
    DEFAULT_ADMIN_CLASS
  );
  const safeSubjects = Array.isArray(subjects) ? subjects : [];
  const mergedClassContent = mergeMode === 'merge'
    ? mergeClassContentMaps(existingProfile?.classContent || {}, { [targetClassName]: safeSubjects })
    : {
      ...(existingProfile?.classContent || {}),
      [targetClassName]: safeSubjects,
    };

  return {
    ...(existingProfile || {}),
    ...(profileSnapshot || {}),
    id: profileSnapshot?.id || existingProfile?.id,
    auth: {
      ...(existingProfile?.auth || {}),
      ...(profileSnapshot?.auth || {}),
    },
    user: {
      ...(existingProfile?.user || {}),
      ...(profileSnapshot?.user || {}),
      selectedClass: targetClassName,
    },
    settings: {
      ...(existingProfile?.settings || {}),
      ...(profileSnapshot?.settings || {}),
      selectedClass: targetClassName,
    },
    classContent: mergedClassContent,
    subjects: mergedClassContent[targetClassName] || safeSubjects,
    starQuizzes: Array.isArray(profileSnapshot?.starQuizzes) ? profileSnapshot.starQuizzes : (existingProfile?.starQuizzes || []),
    traitementSujets: Array.isArray(profileSnapshot?.traitementSujets) ? profileSnapshot.traitementSujets : (existingProfile?.traitementSujets || []),
    exerciceScolaires: Array.isArray(profileSnapshot?.exerciceScolaires) ? profileSnapshot.exerciceScolaires : (existingProfile?.exerciceScolaires || []),
    exerciceGlobaux: Array.isArray(profileSnapshot?.exerciceGlobaux) ? profileSnapshot.exerciceGlobaux : (existingProfile?.exerciceGlobaux || []),
  };
}

function mergeProfilesState(currentData, importedData) {
  const currentProfiles = currentData?.profiles || {};
  const incomingProfiles = importedData?.profiles || {};
  const nextProfiles = { ...currentProfiles };

  Object.entries(incomingProfiles).forEach(([profileId, profile]) => {
    const existingProfile = currentProfiles?.[profileId];
    if (!existingProfile) {
      nextProfiles[profileId] = profile;
      return;
    }

    const selectedClass = normalizeClassName(
      profile?.user?.selectedClass || profile?.settings?.selectedClass || existingProfile?.user?.selectedClass || DEFAULT_ADMIN_CLASS,
      DEFAULT_ADMIN_CLASS
    );
    const mergedClassContent = mergeClassContentMaps(existingProfile?.classContent || {}, profile?.classContent || {});
    nextProfiles[profileId] = {
      ...existingProfile,
      ...profile,
      auth: {
        ...(existingProfile?.auth || {}),
        ...(profile?.auth || {}),
      },
      user: {
        ...(existingProfile?.user || {}),
        ...(profile?.user || {}),
        selectedClass,
      },
      settings: {
        ...(existingProfile?.settings || {}),
        ...(profile?.settings || {}),
        selectedClass,
      },
      classContent: mergedClassContent,
      subjects: mergedClassContent[selectedClass] || profile?.subjects || existingProfile?.subjects || [],
      starQuizzes: Array.isArray(profile?.starQuizzes) ? profile.starQuizzes : (existingProfile?.starQuizzes || []),
      traitementSujets: Array.isArray(profile?.traitementSujets) ? profile.traitementSujets : (existingProfile?.traitementSujets || []),
      exerciceScolaires: Array.isArray(profile?.exerciceScolaires) ? profile.exerciceScolaires : (existingProfile?.exerciceScolaires || []),
      exerciceGlobaux: Array.isArray(profile?.exerciceGlobaux) ? profile.exerciceGlobaux : (existingProfile?.exerciceGlobaux || []),
    };
  });

  return {
    profiles: nextProfiles,
    profileOrder: [...new Set([...(currentData?.profileOrder || []), ...(importedData?.profileOrder || []), ...Object.keys(nextProfiles)])],
  };
}

function detectBackupPayloadScope(payload) {
  if (payload?.profiles || (payload?.user && (payload?.classContent || payload?.subjects))) return 'global';
  if (payload?.subject) return 'subject';
  if (payload?.className && Array.isArray(payload?.subjects)) return 'class';
  return null;
}

const SUBJECT_TIMING_FIELDS = [
  { key: 'quizQuestionDelaySeconds', label: 'Quiz / question' },
  { key: 'advancedQuizQuestionDelaySeconds', label: 'Quiz avancé / question' },
  { key: 'exerciseDelaySeconds', label: 'Exercice complet' },
  { key: 'examDelaySeconds', label: 'Sujet type complet' },
  { key: 'enonceDelaySeconds', label: 'Énoncé' },
  { key: 'brouillonDelaySeconds', label: 'Brouillon' },
  { key: 'treatmentDelaySeconds', label: 'Traitement' },
  { key: 'questionDelaySeconds', label: 'Traitement / question' },
  { key: 'stepDelaySeconds', label: 'Traitement / étape' },
  { key: 'refreshDelaySeconds', label: 'Traitement / rafraîchissement' },
];

export default function AdminView() {
  const {
    data,
    save,
    playClick,
    playSpecial,
    showToast,
    updateProfile,
    availableClasses,
    profiles,
    activeProfileId,
    adminStatus,
    signInAdminWithGoogle,
    signOutAdminCloud,
    releaseAdminAccess,
    resetCloudProfilesForRemoteUser,
    refreshAdminCloudDirectory,
    inspectCloudAccount,
    reassignCloudAccountToClass,
  } = useApp();
  const [activeTab, setActiveTab] = useState('content');
  const [copiedPrompt, setCopiedPrompt] = useState('');
  const [selectedClass, setSelectedClass] = useState(data?.user?.selectedClass || DEFAULT_ADMIN_CLASS || CLASSES[0]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(String(DEFAULT_ADMIN_SUBJECT_ID));
  const [contentType, setContentType] = useState('quiz');
  const [mentionVariant, setMentionVariant] = useState('mention_bien');
  const [importMode, setImportMode] = useState('merge');
  const [importEntryMode, setImportEntryMode] = useState('file');
  const [pendingSlot, setPendingSlot] = useState(null);
  const [pastedImportSlotId, setPastedImportSlotId] = useState('');
  const [pastedJsonText, setPastedJsonText] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [selectedModeratedProfileId, setSelectedModeratedProfileId] = useState(String(activeProfileId || ''));
  const [moderationName, setModerationName] = useState(data?.user?.profileName || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [subjectCoefficientDraft, setSubjectCoefficientDraft] = useState(1);
  const [subjectTimingDraft, setSubjectTimingDraft] = useState(createDefaultTimingDefaults());
  const [newClassName, setNewClassName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectIcon, setNewSubjectIcon] = useState(SUBJECT_ICON_OPTIONS[3]?.value || 'book-open');
  const [newSubjectColor, setNewSubjectColor] = useState('#8b5cf6');
  const [newSubjectGroup, setNewSubjectGroup] = useState(DEFAULT_OBJECTIVE_GROUP_ID);
  const [selectedChapterNumber, setSelectedChapterNumber] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [chapterTitleDraft, setChapterTitleDraft] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [itemTitleDraft, setItemTitleDraft] = useState('');
  const [expandedCloudAccountId, setExpandedCloudAccountId] = useState('');
  const [cloudAccountDetails, setCloudAccountDetails] = useState({});
  const [cloudAccountDetailLoadingId, setCloudAccountDetailLoadingId] = useState('');
  const [cloudAccountDetailError, setCloudAccountDetailError] = useState('');
  const contentFileRef = useRef(null);
  const bulkContentFileRef = useRef(null);
  const backupFileRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkImportSummary, setBulkImportSummary] = useState(null);
  const [backupRestoreMode, setBackupRestoreMode] = useState('overwrite');
  const [pendingBackupScope, setPendingBackupScope] = useState(null);

  const adminClasses = availableClasses?.length ? availableClasses : CLASSES;
  const classSubjects = data?.classContent?.[selectedClass] || [];
  const currentSubject = classSubjects.find(subject => String(subject.id) === String(selectedSubjectId)) || classSubjects[0] || null;
  const localProfileIds = (data?.profileOrder || []).map((profileId) => String(profileId));
  const localProfileRecords = (profiles || []).map((profile) => ({
    id: String(profile.id),
    name: profile.name || 'Eleve',
    avatar: profile.avatar || '',
    selectedClass: profile.selectedClass || CLASSES[0],
  }));
  const selectedModeratedProfile = data?.profiles?.[selectedModeratedProfileId] || data?.profiles?.[activeProfileId] || null;
  const selectedModeratedUser = selectedModeratedProfile?.user || {};
  const moderatedProfileClassName = normalizeClassName(
    selectedModeratedUser?.selectedClass || selectedModeratedProfile?.settings?.selectedClass || CLASSES[0],
    CLASSES[0]
  );
  const moderatedProfileSubjects = selectedModeratedProfile?.classContent?.[moderatedProfileClassName]
    || selectedModeratedProfile?.subjects
    || [];
  const moderatedBlockedSubjectIds = Array.isArray(selectedModeratedUser?.blockedSubjectIds)
    ? selectedModeratedUser.blockedSubjectIds.map((value) => String(value))
    : [];
  const adminSessionUser = adminStatus?.sessionUser || null;
  const isAdminConnected = Boolean(adminStatus?.isAdminSessionActive);
  const isUserSessionActive = Boolean(adminStatus?.isUserSessionActive);
  const isAdminOwnerSession = Boolean(adminSessionUser?.id && adminSessionUser.id === adminStatus?.ownerRemoteUserId);
  const adminOwnerClaimed = Boolean(adminStatus?.ownerRemoteUserId);
  const adminOwnerDisplayName = isAdminOwnerSession
    ? (adminStatus?.ownerDisplayName || adminStatus?.ownerEmail || 'Administrateur').toString()
    : 'Administrateur verrouillé';
  const adminOwnerEmail = isAdminOwnerSession ? (adminStatus?.ownerEmail || '').toString() : '';
  const adminOwnerAvatar = isAdminOwnerSession ? (adminStatus?.ownerAvatar || '').toString() : '';
  const knownAccounts = Array.isArray(adminStatus?.knownAccounts) ? adminStatus.knownAccounts : [];
  const adminSignInLabel = adminOwnerClaimed
    ? 'Continuer avec le compte admin propriétaire'
    : 'Revendiquer l’admin avec Google';
  const chapters = currentSubject?.chapters || [];
  const allItems = currentSubject ? listAdminItems(currentSubject, contentType, mentionVariant, { includeEmpty: true }) : [];
  const selectedChapter = chapters.find((chapter) => String(chapter.number) === String(selectedChapterNumber)) || chapters[0] || null;
  const chapterItems = allItems.filter((item) => Number(item.chapterNumber) === Number(selectedChapter?.number));
  const selectedItem = chapterItems.find((item) => item.id === selectedItemId) || chapterItems[0] || null;
  const importTargetReady = contentType === 'parcours' ? Boolean(selectedChapter) : Boolean(selectedChapter && selectedItem);
  const importSlots = getImportSlots(contentType, mentionVariant);
  const selectedPastedImportSlot = importSlots.find((slot) => slot.id === pastedImportSlotId) || importSlots[0] || null;
  const filteredExamples = EXAMPLE_IMPORT_FILES.filter((entry) => {
    if (entry.payload.kind.endsWith('_traitement_question')) return false;
    if (contentType === 'parcours') return entry.payload.kind.startsWith('parcours_');
    if (contentType === 'exercice') return entry.payload.kind.startsWith('exercice_');
    if (contentType === 'quiz') return entry.payload.kind.startsWith('quiz_mode_');
    return entry.payload.kind.startsWith('sujet_type_');
  });
  const downloadableExamples = ADMIN_DOWNLOADABLE_EXAMPLES.map((entry) => {
    const files = entry.files
      .filter((file) => !String(file.payload?.kind || '').endsWith('_traitement_question'))
      .map((file) => ({
      ...file,
      validation: validateAdminPayload(file.payload),
      }));
    return {
      ...entry,
      files,
      valid: files.every((file) => file.validation.valid),
    };
  }).filter((entry) => entry.files.length > 0);
  const filteredPromptBank = PROMPT_BANK.filter((entry) => !String(entry.prompt || '').includes('_traitement_question'));
  const allPromptsText = filteredPromptBank.map((entry, index) => {
    const sections = [
      `# ${entry.title}`,
      entry.description ? `Description: ${entry.description}` : null,
      `ID: ${entry.id}`,
      '',
      entry.prompt,
    ].filter(Boolean);
    return `${sections.join('\n')}\n${index < filteredPromptBank.length - 1 ? '\n\n' + '='.repeat(80) : ''}`;
  }).join('');

  useEffect(() => {
    if (!adminClasses.length) return;
    if (!adminClasses.includes(selectedClass)) {
      setSelectedClass(adminClasses[0]);
    }
  }, [adminClasses, selectedClass]);

  useEffect(() => {
    if (!classSubjects.length) return;
    const hasSelected = classSubjects.some(subject => String(subject.id) === String(selectedSubjectId));
    if (!hasSelected) {
      setSelectedSubjectId(String(classSubjects[0].id));
    }
  }, [classSubjects, selectedSubjectId]);

  useEffect(() => {
    if (!importSlots.length) {
      setPastedImportSlotId('');
      return;
    }
    const hasSelectedSlot = importSlots.some((slot) => slot.id === pastedImportSlotId);
    if (!hasSelectedSlot) {
      setPastedImportSlotId(importSlots[0].id);
    }
  }, [importSlots, pastedImportSlotId]);

  useEffect(() => {
    if (!localProfileIds.length) return;
    const currentId = String(selectedModeratedProfileId || '');
    if (currentId && localProfileIds.includes(currentId)) return;
    setSelectedModeratedProfileId(String(activeProfileId || localProfileIds[0]));
  }, [activeProfileId, localProfileIds, selectedModeratedProfileId]);

  useEffect(() => {
    setModerationName(selectedModeratedUser?.profileName || '');
  }, [selectedModeratedProfileId, selectedModeratedUser?.profileName]);

  useEffect(() => {
    const fallbackTiming = createDefaultTimingDefaults();
    setSubjectCoefficientDraft(Math.max(1, Number(currentSubject?.coefficient) || 1));
    setSubjectTimingDraft({
      ...fallbackTiming,
      ...(currentSubject?.timingDefaults || {}),
    });
  }, [currentSubject]);

  useEffect(() => {
    if (!chapters.length) {
      setSelectedChapterNumber('');
      return;
    }
    const hasSelectedChapter = chapters.some((chapter) => String(chapter.number) === String(selectedChapterNumber));
    if (!hasSelectedChapter) {
      setSelectedChapterNumber(String(chapters[0].number));
    }
  }, [chapters, selectedChapterNumber]);

  useEffect(() => {
    setChapterTitleDraft(selectedChapter?.title || '');
  }, [selectedChapter]);

  useEffect(() => {
    if (contentType === 'parcours') {
      setSelectedItemId('');
      return;
    }
    if (!chapterItems.length) {
      setSelectedItemId('');
      return;
    }
    const hasSelectedItem = chapterItems.some((item) => item.id === selectedItemId);
    if (!hasSelectedItem) {
      setSelectedItemId(chapterItems[0].id);
    }
  }, [chapterItems, contentType, selectedItemId]);

  useEffect(() => {
    setItemTitleDraft(selectedItem?.title || '');
  }, [selectedItem]);

  const runAdminAction = async (action, successMessage) => {
    playClick();
    setAdminActionLoading(true);
    try {
      await action();
      if (successMessage) showToast(successMessage, 'success');
    } catch (error) {
      showToast(error?.message || 'Connexion admin impossible', 'error');
    } finally {
      setAdminActionLoading(false);
    }
  };

  const buildSharedContentState = (profileUpdater) => {
    const nextProfiles = Object.fromEntries((data?.profileOrder || []).map((profileId) => {
      const currentProfile = data?.profiles?.[profileId];
      return [profileId, profileUpdater(currentProfile, profileId)];
    }));
    const nextActiveProfile = nextProfiles[data?.activeProfileId] || data?.profiles?.[data?.activeProfileId];
    return {
      ...data,
      profiles: nextProfiles,
      user: nextActiveProfile?.user || data?.user,
      settings: nextActiveProfile?.settings || data?.settings,
      classContent: nextActiveProfile?.classContent || data?.classContent,
      subjects: nextActiveProfile?.subjects || data?.subjects,
      starQuizzes: nextActiveProfile?.starQuizzes || data?.starQuizzes,
      traitementSujets: nextActiveProfile?.traitementSujets || data?.traitementSujets,
      exerciceScolaires: nextActiveProfile?.exerciceScolaires || data?.exerciceScolaires,
      exerciceGlobaux: nextActiveProfile?.exerciceGlobaux || data?.exerciceGlobaux,
    };
  };

  const persistModeratedProfileUserPatch = async (partialUser, successMessage = '') => {
    if (!selectedModeratedProfileId) return;

    const nextData = buildSharedContentState((profile, profileId) => {
      if (String(profileId) !== String(selectedModeratedProfileId)) return profile;
      return {
        ...profile,
        user: {
          ...(profile?.user || {}),
          ...(partialUser || {}),
          studentIdentity: {
            ...(profile?.user?.studentIdentity || {}),
            ...(partialUser?.studentIdentity || {}),
          },
        },
      };
    });

    await save(nextData);
    if (successMessage) showToast(successMessage, 'success');
  };

  const persistBucketForClass = async (nextBucket, successMessage, nextSelectedId = null) => {
    const nextData = buildSharedContentState((profile) => {
      const profileSelectedClass = profile?.user?.selectedClass || profile?.settings?.selectedClass || selectedClass;
      const nextClassContent = {
        ...(profile?.classContent || {}),
        [selectedClass]: nextBucket,
      };
      return {
        ...profile,
        classContent: nextClassContent,
        subjects: profileSelectedClass === selectedClass
          ? nextBucket
          : (nextClassContent[profileSelectedClass] || profile?.subjects || []),
      };
    });

    await save(nextData);
    if (nextSelectedId !== null && nextSelectedId !== undefined) setSelectedSubjectId(String(nextSelectedId));
    if (successMessage) showToast(successMessage, 'success');
  };

  const persistSubjectForClass = async (nextSubject, successMessage) => {
    if (!currentSubject) return;
    const nextBucket = classSubjects.map(subject => (
      Number(subject.id) === Number(nextSubject.id) ? nextSubject : subject
    ));
    await persistBucketForClass(nextBucket, successMessage);
  };

  const handleCreateClass = async () => {
    const className = normalizeClassName(newClassName, '').trim();
    if (!className) {
      showToast('Nom de classe requis', 'error');
      return;
    }
    const duplicate = adminClasses.some((entry) => normalizeAdminKey(entry) === normalizeAdminKey(className));
    if (duplicate) {
      showToast('Cette classe existe déjà', 'error');
      return;
    }

    await save(buildSharedContentState((profile) => {
      const profileSelectedClass = profile?.user?.selectedClass || profile?.settings?.selectedClass || className;
      const nextClassContent = {
        ...(profile?.classContent || {}),
        [className]: profile?.classContent?.[className] || [],
      };
      return {
        ...profile,
        classContent: nextClassContent,
        subjects: nextClassContent[profileSelectedClass] || profile?.subjects || [],
      };
    }));
    setSelectedClass(className);
    setNewClassName('');
    playSpecial('levelUp');
    showToast(`Classe ${className} créée`, 'success');
  };

  const getDefaultItemTitle = () => {
    const nextIndex = chapterItems.length + 1;
    if (contentType === 'quiz') return `Quiz ${nextIndex}`;
    if (contentType === 'sujet-type') return `Sujet type ${nextIndex}`;
    if (contentType === 'exercice') return `Exercice ${nextIndex}`;
    return `Élément ${nextIndex}`;
  };

  const prepareTargetedImport = (baseSubject, parsed) => {
    let workingSubject = baseSubject;
    let targetChapterNumber = Number(parsed.chapterNumber) || Number(selectedChapter?.number) || 1;
    let targetChapterTitle = parsed.chapterTitle || selectedChapter?.title || `Chapitre ${targetChapterNumber}`;
    let targetItemTitle = parsed.title || selectedItem?.title || '';

    if (selectedChapter) {
      targetChapterNumber = Number(selectedChapter.number);
      targetChapterTitle = selectedChapter.title;
      if (parsed.chapterTitle && normalizeAdminKey(parsed.chapterTitle) !== normalizeAdminKey(selectedChapter.title)) {
        const shouldReplaceChapterTitle = window.confirm(`Le chapitre sélectionné s’appelle "${selectedChapter.title}". Voulez-vous le renommer avec le titre du JSON "${parsed.chapterTitle}" avant l’import ?`);
        if (shouldReplaceChapterTitle) {
          workingSubject = renameAdminChapter(workingSubject, selectedChapter.number, parsed.chapterTitle);
          targetChapterTitle = parsed.chapterTitle;
        }
      }
    }

    if (contentType !== 'parcours' && selectedItem) {
      targetItemTitle = selectedItem.title;
      if (parsed.title && normalizeAdminKey(parsed.title) !== normalizeAdminKey(selectedItem.title)) {
        const shouldReplaceItemTitle = window.confirm(`L’élément sélectionné s’appelle "${selectedItem.title}". Voulez-vous le renommer avec le titre du JSON "${parsed.title}" avant l’import ?`);
        if (shouldReplaceItemTitle) {
          workingSubject = renameAdminNamedItem(workingSubject, contentType, selectedChapter.number, selectedItem.title, parsed.title);
          targetItemTitle = parsed.title;
        }
      }
    }

    return {
      subject: workingSubject,
      targetChapterNumber,
      targetChapterTitle,
      targetItemTitle,
    };
  };

  const handleAdminSignIn = async () => {
    await runAdminAction(async () => {
      await signInAdminWithGoogle();
    });
  };

  const handleAdminSignOut = async () => {
    await runAdminAction(async () => {
      await signOutAdminCloud();
    }, 'Compte admin déconnecté');
  };

  const handleReleaseAdminOwnership = async () => {
    await runAdminAction(async () => {
      await releaseAdminAccess();
    }, 'Accès admin libéré');
  };

  const handleRefreshCloudAccounts = async () => {
    await runAdminAction(async () => {
      await refreshAdminCloudDirectory();
    });
  };

  const handleResetCloudAccount = async (account) => {
    const accountLabel = account?.displayName || account?.email || account?.remoteUserId || 'ce compte';
    const confirmed = window.confirm(`Supprimer tous les profils cloud liés à ${accountLabel} ? Cette action est irréversible.`);
    if (!confirmed) return;
    await runAdminAction(async () => {
      await resetCloudProfilesForRemoteUser(account?.remoteUserId);
    }, `Cloud supprimé pour ${accountLabel}`);
  };

  const handleToggleCloudAccountDetails = async (account) => {
    const remoteUserId = (account?.remoteUserId || '').toString();
    if (!remoteUserId) return;

    if (expandedCloudAccountId === remoteUserId) {
      playClick();
      setExpandedCloudAccountId('');
      setCloudAccountDetailError('');
      return;
    }

    playClick();
    setExpandedCloudAccountId(remoteUserId);
    setCloudAccountDetailError('');

    if (cloudAccountDetails[remoteUserId]) return;

    setCloudAccountDetailLoadingId(remoteUserId);
    try {
      const rows = await inspectCloudAccount(remoteUserId);
      setCloudAccountDetails((prev) => ({
        ...prev,
        [remoteUserId]: rows,
      }));
    } catch (error) {
      setCloudAccountDetailError(error?.message || 'Impossible de lire les détails du compte cloud');
    } finally {
      setCloudAccountDetailLoadingId('');
    }
  };

  const handleExportAll = () => {
    playClick();
    storage.download(data, `bacbooster_full_${new Date().toISOString().split('T')[0]}.json`);
    showToast('Export complet téléchargé', 'success');
  };

  const handleExportClassSnapshot = () => {
    playClick();
    downloadJson({
      backupScope: 'class',
      profileId: activeProfileId,
      className: selectedClass,
      subjects: classSubjects,
      profileSnapshot: buildProfileBackupSnapshot(data, activeProfileId, {
        className: selectedClass,
        subjects: classSubjects,
      }),
    }, `bacbooster_class_${sanitizeFilenameSegment(selectedClass, 'classe')}.json`);
    showToast(`Classe ${selectedClass} exportée`, 'success');
  };

  const handleExportSubjectSnapshot = () => {
    if (!currentSubject) return;
    playClick();
    downloadJson({
      backupScope: 'subject',
      profileId: activeProfileId,
      className: selectedClass,
      subject: currentSubject,
      profileSnapshot: buildProfileBackupSnapshot(data, activeProfileId, {
        className: selectedClass,
        subjects: [currentSubject],
      }),
    }, `bacbooster_${sanitizeFilenameSegment(selectedClass, 'classe')}_${sanitizeFilenameSegment(currentSubject.name, 'matiere')}.json`);
    showToast(`${currentSubject.name} exporté`, 'success');
  };

  const handleStartBackupRestore = (scope) => {
    setPendingBackupScope(scope);
    playClick();
    backupFileRef.current?.click();
  };

  const applyGlobalBackupPayload = (payload) => {
    const imported = storage.parseImportJSON(payload);
    if (backupRestoreMode === 'overwrite') return imported;

    if (imported?.profiles) {
      const mergedProfilesState = mergeProfilesState(data, imported);
      return {
        ...data,
        ...imported,
        profiles: mergedProfilesState.profiles,
        profileOrder: mergedProfilesState.profileOrder,
      };
    }

    const activeClass = data?.user?.selectedClass || data?.settings?.selectedClass || selectedClass;
    const importedClassContent = imported.classContent || (imported.subjects?.length ? {
      [imported.user?.selectedClass || imported.settings?.selectedClass || activeClass]: imported.subjects,
    } : {});
    const mergedClassContent = mergeClassContentMaps(data?.classContent || {}, importedClassContent);

    return {
      ...data,
      ...imported,
      user: {
        ...(data?.user || {}),
        ...(imported.user || {}),
        selectedClass: activeClass,
      },
      settings: {
        ...(data?.settings || {}),
        ...(imported.settings || {}),
        selectedClass: activeClass,
      },
      classContent: mergedClassContent,
      subjects: mergedClassContent[activeClass] || data?.subjects || [],
      starQuizzes: Array.isArray(imported.starQuizzes) ? imported.starQuizzes : (data?.starQuizzes || []),
      traitementSujets: Array.isArray(imported.traitementSujets) ? imported.traitementSujets : (data?.traitementSujets || []),
      exerciceScolaires: Array.isArray(imported.exerciceScolaires) ? imported.exerciceScolaires : (data?.exerciceScolaires || []),
      exerciceGlobaux: Array.isArray(imported.exerciceGlobaux) ? imported.exerciceGlobaux : (data?.exerciceGlobaux || []),
    };
  };

  const applyClassBackupPayload = (payload) => {
    const targetClassName = normalizeClassName(payload.className, selectedClass);
    const incomingSubjects = Array.isArray(payload.subjects) ? payload.subjects : [];

    if (payload?.profileSnapshot?.id) {
      const targetProfileId = String(payload.profileSnapshot.id);
      const existingProfile = data?.profiles?.[targetProfileId] || null;
      const nextProfile = buildScopedProfileRestore(
        payload.profileSnapshot,
        targetClassName,
        incomingSubjects,
        backupRestoreMode,
        existingProfile
      );

      return {
        ...data,
        activeProfileId: targetProfileId,
        profileOrder: data?.profileOrder?.includes(targetProfileId)
          ? (data?.profileOrder || [])
          : [...(data?.profileOrder || []), targetProfileId],
        profiles: {
          ...(data?.profiles || {}),
          [targetProfileId]: nextProfile,
        },
        user: nextProfile.user,
        settings: nextProfile.settings,
        classContent: nextProfile.classContent,
        subjects: nextProfile.subjects,
        starQuizzes: nextProfile.starQuizzes,
        traitementSujets: nextProfile.traitementSujets,
        exerciceScolaires: nextProfile.exerciceScolaires,
        exerciceGlobaux: nextProfile.exerciceGlobaux,
      };
    }

    const nextBucket = backupRestoreMode === 'merge'
      ? mergeSubjectBuckets(data?.classContent?.[targetClassName] || [], incomingSubjects)
      : incomingSubjects;
    const activeClass = data?.user?.selectedClass || data?.settings?.selectedClass;

    return {
      ...data,
      classContent: {
        ...(data?.classContent || {}),
        [targetClassName]: nextBucket,
      },
      subjects: activeClass === targetClassName ? nextBucket : (data?.subjects || []),
    };
  };

  const applySubjectBackupPayload = (payload) => {
    const targetClassName = normalizeClassName(payload.className, selectedClass);
    if (!payload?.subject) throw new Error('Backup matière invalide');

    if (payload?.profileSnapshot?.id) {
      const targetProfileId = String(payload.profileSnapshot.id);
      const existingProfile = data?.profiles?.[targetProfileId] || null;
      const existingBucket = existingProfile?.classContent?.[targetClassName] || [];
      const nextBucket = upsertSubjectInBucket(
        existingBucket,
        payload.subject,
        backupRestoreMode
      );
      const nextProfile = buildScopedProfileRestore(
        payload.profileSnapshot,
        targetClassName,
        nextBucket,
        backupRestoreMode,
        existingProfile
      );

      return {
        ...data,
        activeProfileId: targetProfileId,
        profileOrder: data?.profileOrder?.includes(targetProfileId)
          ? (data?.profileOrder || [])
          : [...(data?.profileOrder || []), targetProfileId],
        profiles: {
          ...(data?.profiles || {}),
          [targetProfileId]: nextProfile,
        },
        user: nextProfile.user,
        settings: nextProfile.settings,
        classContent: nextProfile.classContent,
        subjects: nextProfile.subjects,
        starQuizzes: nextProfile.starQuizzes,
        traitementSujets: nextProfile.traitementSujets,
        exerciceScolaires: nextProfile.exerciceScolaires,
        exerciceGlobaux: nextProfile.exerciceGlobaux,
      };
    }

    const nextBucket = upsertSubjectInBucket(
      data?.classContent?.[targetClassName] || [],
      payload.subject,
      backupRestoreMode
    );
    const activeClass = data?.user?.selectedClass || data?.settings?.selectedClass;

    return {
      ...data,
      classContent: {
        ...(data?.classContent || {}),
        [targetClassName]: nextBucket,
      },
      subjects: activeClass === targetClassName ? nextBucket : (data?.subjects || []),
    };
  };

  const handleImportBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const detectedScope = detectBackupPayloadScope(payload);
      if (!detectedScope) throw new Error('Backup non reconnu');
      if (pendingBackupScope && detectedScope !== pendingBackupScope) {
        throw new Error(`Ce fichier correspond à une restauration ${detectedScope}, pas ${pendingBackupScope}`);
      }

      let nextData = null;
      if (detectedScope === 'global') nextData = applyGlobalBackupPayload(payload);
      if (detectedScope === 'class') nextData = applyClassBackupPayload(payload);
      if (detectedScope === 'subject') nextData = applySubjectBackupPayload(payload);
      if (!nextData) throw new Error('Restauration impossible');

      await save(nextData);
      if (detectedScope === 'class' || detectedScope === 'subject') {
        const restoredClass = normalizeClassName(payload.className, selectedClass);
        setSelectedClass(restoredClass);
      }
      if (detectedScope === 'subject' && payload?.subject?.id !== undefined) {
        setSelectedSubjectId(String(payload.subject.id));
      }
      playSpecial('success');
      showToast(`Backup ${detectedScope} restauré`, 'success');
    } catch (error) {
      playSpecial('error');
      showToast(`Erreur: ${error.message}`, 'error');
    }

    setPendingBackupScope(null);
    if (backupFileRef.current) backupFileRef.current.value = '';
  };

  const handleRestoreLocalBackup = async () => {
    try {
      const backup = storage.getLocalBackup();
      if (!backup) throw new Error('Aucune sauvegarde locale disponible');
      const nextData = applyGlobalBackupPayload(backup);
      await save(nextData);
      playSpecial('success');
      showToast('Dernière sauvegarde locale restaurée', 'success');
    } catch (error) {
      playSpecial('error');
      showToast(`Erreur: ${error.message}`, 'error');
    }
  };

  const importAdminPayload = async (parsed, slot) => {
    if (!currentSubject) {
      throw new Error('Aucune matière sélectionnée');
    }

    if (!slot) {
      throw new Error('Choisissez d’abord le type de JSON à importer');
    }

    const validation = validateAdminPayload(parsed, slot.expectedKinds || []);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      throw new Error(validation.errors[0] || 'JSON non conforme au schéma');
    }

    if (!importTargetReady && contentType !== 'parcours') {
      throw new Error('Sélectionnez d’abord un chapitre puis un élément cible');
    }

    if (!selectedChapter) {
      throw new Error('Sélectionnez d’abord un chapitre cible');
    }

    setValidationErrors([]);
    const prepared = prepareTargetedImport(currentSubject, parsed);
    const result = applyAdminImportToSubject(prepared.subject, parsed, {
      overwrite: importMode === 'overwrite',
      targetChapterNumber: prepared.targetChapterNumber,
      targetChapterTitle: prepared.targetChapterTitle,
      targetItemTitle: prepared.targetItemTitle,
    });
    await persistSubjectForClass(result.subject, result.message);
    if (contentType !== 'parcours' && prepared.targetItemTitle) {
      setSelectedItemId(buildAdminItemId(contentType, prepared.targetChapterNumber, prepared.targetItemTitle));
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await importAdminPayload(parsed, pendingSlot);
      playSpecial('success');
    } catch (err) {
      playSpecial('error');
      showToast(`Erreur: ${err.message}`, 'error');
    }
    setPendingSlot(null);
    if (contentFileRef.current) contentFileRef.current.value = '';
  };

  const handleImportPastedJson = async () => {
    if (!pastedJsonText.trim()) {
      showToast('Collez d’abord un JSON', 'error');
      return;
    }

    try {
      const parsed = JSON.parse(pastedJsonText);
      await importAdminPayload(parsed, selectedPastedImportSlot);
      setPastedJsonText('');
      playSpecial('success');
    } catch (err) {
      playSpecial('error');
      showToast(`Erreur: ${err.message}`, 'error');
    }
  };

  const handleStartSlotImport = (slot) => {
    if (!selectedChapter) {
      showToast('Créez ou sélectionnez d’abord un chapitre', 'error');
      return;
    }
    if (contentType !== 'parcours' && !selectedItem) {
      showToast('Créez ou sélectionnez d’abord un élément cible', 'error');
      return;
    }
    setPendingSlot(slot);
    playClick();
    contentFileRef.current?.click();
  };

  const slugifyForExamples = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const currentSubjectSlug = slugifyForExamples(currentSubject?.name || '');
  const matchingExamplePackPrefixes = (() => {
    if (!currentSubjectSlug) return [];
    const prefixes = new Set([currentSubjectSlug]);
    if (currentSubjectSlug === 'francais' || currentSubjectSlug.startsWith('francais')) {
      prefixes.add('francais');
      prefixes.add('français');
    }
    if (currentSubjectSlug === 'anglais' || currentSubjectSlug.startsWith('anglais') || currentSubjectSlug.startsWith('english')) {
      prefixes.add('anglais');
      prefixes.add('english');
    }
    return Array.from(prefixes);
  })();

  const matchingExamplePacks = ADMIN_DOWNLOADABLE_EXAMPLES.filter((entry) => {
    if (!matchingExamplePackPrefixes.length) return false;
    const entryId = String(entry?.id || '').toLowerCase();
    return matchingExamplePackPrefixes.some((prefix) => entryId.startsWith(`${prefix}-`));
  });
  const matchingExampleFilesCount = matchingExamplePacks.reduce(
    (acc, entry) => acc + (Array.isArray(entry?.files) ? entry.files.length : 0),
    0,
  );

  const handleImportLanguageExamples = async () => {
    if (!currentSubject) {
      showToast('Sélectionnez d’abord une matière cible', 'error');
      return;
    }
    if (!matchingExamplePacks.length) {
      showToast(`Aucun exemple JSON ne correspond à la matière "${currentSubject.name}". Renomme la matière en Français/Anglais ou utilise l’import multi-fichiers.`, 'error');
      return;
    }
    const total = matchingExampleFilesCount;
    const confirmed = window.confirm(`Importer ${total} fichier(s) d’exemples (${matchingExamplePacks.length} pack(s)) dans la matière "${currentSubject.name}" en mode ${importMode === 'overwrite' ? 'Écraser' : 'Fusionner'} ?`);
    if (!confirmed) return;

    setIsBulkImporting(true);
    setValidationErrors([]);
    setBulkImportSummary(null);

    const successes = [];
    const failures = [];
    let workingSubject = currentSubject;
    const overwrite = importMode === 'overwrite';

    const kindOrder = (kind) => {
      if (!kind) return 99;
      if (kind.startsWith('parcours_')) return 0;
      if (kind.endsWith('_enonce')) return 1;
      if (kind.endsWith('_brouillon')) return 2;
      if (kind.endsWith('_traitement')) return 3;
      if (kind.endsWith('_traitement_question')) return 4;
      if (kind.startsWith('quiz_mode_')) return 5;
      return 99;
    };

    const queue = [];
    matchingExamplePacks.forEach((entry) => {
      (entry.files || []).forEach((file) => {
        const payload = file?.payload;
        if (!payload) return;
        queue.push({
          name: file?.filename || file?.label || `${entry.id}-${file?.payload?.kind || 'item'}`,
          payload,
        });
      });
    });

    queue.sort((a, b) => {
      const ka = kindOrder(a.payload?.kind);
      const kb = kindOrder(b.payload?.kind);
      if (ka !== kb) return ka - kb;
      const ca = Number(a.payload?.chapterNumber) || 0;
      const cb = Number(b.payload?.chapterNumber) || 0;
      return ca - cb;
    });

    for (const { name, payload } of queue) {
      try {
        const detectedKind = payload && typeof payload.kind === 'string' ? payload.kind : null;
        if (!detectedKind) throw new Error('Champ kind manquant');

        const validation = validateAdminPayload(payload);
        if (!validation.valid) {
          throw new Error(validation.errors[0] || 'JSON non conforme au schéma');
        }

        const result = applyAdminImportToSubject(workingSubject, payload, {
          overwrite,
          targetChapterNumber: Number(payload.chapterNumber) || 1,
          targetChapterTitle: payload.chapterTitle || `Chapitre ${Number(payload.chapterNumber) || 1}`,
          targetItemTitle: payload.title || '',
        });
        workingSubject = result.subject;
        successes.push({ name, kind: detectedKind, message: result.message });
      } catch (err) {
        failures.push({ name, reason: err.message });
      }
    }

    if (successes.length > 0) {
      try {
        await persistSubjectForClass(workingSubject, `${successes.length} exemple(s) importé(s) dans ${currentSubject.name}`);
        playSpecial('success');
      } catch (err) {
        showToast(`Erreur de sauvegarde: ${err.message}`, 'error');
        playSpecial('error');
      }
    } else {
      playSpecial('error');
    }

    setBulkImportSummary({
      total: queue.length,
      successes,
      failures,
      subjectName: currentSubject?.name || '',
      mode: overwrite ? 'overwrite' : 'merge',
      source: `Exemples JSON (${matchingExamplePacks.length} pack(s))`,
    });
    setIsBulkImporting(false);
  };

  const handleStartBulkImport = () => {
    if (!currentSubject) {
      showToast('Sélectionnez d’abord une matière cible', 'error');
      return;
    }
    setBulkImportSummary(null);
    setValidationErrors([]);
    playClick();
    bulkContentFileRef.current?.click();
  };

  const handleBulkImport = async (event) => {
    const fileList = Array.from(event.target.files || []);
    if (!fileList.length) return;
    if (!currentSubject) {
      showToast('Aucune matière sélectionnée', 'error');
      if (bulkContentFileRef.current) bulkContentFileRef.current.value = '';
      return;
    }

    setIsBulkImporting(true);
    setValidationErrors([]);
    setBulkImportSummary(null);

    const successes = [];
    const failures = [];
    let workingSubject = currentSubject;
    const overwrite = importMode === 'overwrite';

    // Sort files for stable order: parcours → enonce → brouillon → traitement → quiz_mode_*
    const kindOrder = (kind) => {
      if (!kind) return 99;
      if (kind.startsWith('parcours_')) return 0;
      if (kind.endsWith('_enonce')) return 1;
      if (kind.endsWith('_brouillon')) return 2;
      if (kind.endsWith('_traitement')) return 3;
      if (kind.endsWith('_traitement_question')) return 4;
      if (kind.startsWith('quiz_mode_')) return 5;
      return 99;
    };

    const parsedFiles = [];
    for (const file of fileList) {
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        parsedFiles.push({ file, payload });
      } catch (err) {
        failures.push({ name: file.name, reason: `JSON invalide: ${err.message}` });
      }
    }

    parsedFiles.sort((a, b) => {
      const ka = kindOrder(a.payload?.kind);
      const kb = kindOrder(b.payload?.kind);
      if (ka !== kb) return ka - kb;
      const ca = Number(a.payload?.chapterNumber) || 0;
      const cb = Number(b.payload?.chapterNumber) || 0;
      return ca - cb;
    });

    for (const { file, payload } of parsedFiles) {
      try {
        const detectedKind = payload && typeof payload.kind === 'string' ? payload.kind : null;
        if (!detectedKind) throw new Error('Champ kind manquant dans le JSON');

        const validation = validateAdminPayload(payload);
        if (!validation.valid) {
          throw new Error(validation.errors[0] || 'JSON non conforme au schéma');
        }

        const targetChapterNumber = Number(payload.chapterNumber) || 1;
        const targetChapterTitle = payload.chapterTitle || `Chapitre ${targetChapterNumber}`;
        const targetItemTitle = payload.title || '';

        const result = applyAdminImportToSubject(workingSubject, payload, {
          overwrite,
          targetChapterNumber,
          targetChapterTitle,
          targetItemTitle,
        });
        workingSubject = result.subject;
        successes.push({ name: file.name, kind: detectedKind, message: result.message });
      } catch (err) {
        failures.push({ name: file.name, reason: err.message });
      }
    }

    if (successes.length > 0) {
      try {
        await persistSubjectForClass(workingSubject, `${successes.length} fichier(s) importé(s) en masse`);
        playSpecial('success');
      } catch (err) {
        showToast(`Erreur de sauvegarde: ${err.message}`, 'error');
        playSpecial('error');
      }
    } else {
      playSpecial('error');
    }

    setBulkImportSummary({
      total: fileList.length,
      successes,
      failures,
      subjectName: currentSubject?.name || '',
      mode: overwrite ? 'overwrite' : 'merge',
    });
    setIsBulkImporting(false);
    if (bulkContentFileRef.current) bulkContentFileRef.current.value = '';
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Supprimer "${item.title}" ?`)) return;
    const nextSubject = deleteAdminItemFromSubject(currentSubject, item, contentType, mentionVariant);
    await persistSubjectForClass(nextSubject, `${item.title} supprimé`);
  };

  const handleExportItem = (item, questionIndex = null) => {
    const files = exportAdminItemFiles(item, contentType, mentionVariant, questionIndex);
    if (!files.length) {
      showToast('Aucun fichier exportable pour cet élément', 'info');
      return;
    }
    files.forEach((file) => downloadJson(file.payload, file.filename));
    showToast(`${files.length} fichier(s) exporté(s)`, 'success');
  };

  const copyPrompt = (id, prompt) => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopiedPrompt(id);
      playClick();
      showToast('Prompt copié !', 'success');
      setTimeout(() => setCopiedPrompt(''), 2000);
    }).catch(() => {
      showToast('Impossible de copier le prompt', 'error');
    });
  };

  const handleCopyAllPrompts = () => {
    if (!allPromptsText.trim()) {
      showToast('Aucun prompt à copier', 'info');
      return;
    }

    navigator.clipboard.writeText(allPromptsText).then(() => {
      setCopiedPrompt('all-prompts');
      playClick();
      showToast(`${filteredPromptBank.length} prompt(s) copiés`, 'success');
      setTimeout(() => setCopiedPrompt(''), 2000);
    }).catch(() => {
      showToast('Impossible de copier tous les prompts', 'error');
    });
  };

  const handleExportAllPromptsTxt = () => {
    if (!allPromptsText.trim()) {
      showToast('Aucun prompt à exporter', 'info');
      return;
    }

    playClick();
    downloadTextFile(allPromptsText, `bacbooster_prompt_bank_${new Date().toISOString().split('T')[0]}.txt`);
    showToast(`${filteredPromptBank.length} prompt(s) exportés en .txt`, 'success');
  };

  const handleInstallExample = async (example) => {
    if (!currentSubject) return;
    const validation = validateAdminPayload(example.payload);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      showToast('Template exemple invalide', 'error');
      return;
    }
    if (!selectedChapter) {
      showToast('Sélectionnez d’abord un chapitre pour injecter ce template', 'error');
      return;
    }
    if (contentType !== 'parcours' && !selectedItem) {
      showToast('Sélectionnez d’abord un élément cible pour injecter ce template', 'error');
      return;
    }
    const prepared = prepareTargetedImport(currentSubject, example.payload);
    const result = applyAdminImportToSubject(prepared.subject, example.payload, {
      overwrite: false,
      targetChapterNumber: prepared.targetChapterNumber,
      targetChapterTitle: prepared.targetChapterTitle,
      targetItemTitle: prepared.targetItemTitle,
    });
    await persistSubjectForClass(result.subject, `${example.label} injecté`);
    if (contentType !== 'parcours' && prepared.targetItemTitle) {
      setSelectedItemId(buildAdminItemId(contentType, prepared.targetChapterNumber, prepared.targetItemTitle));
    }
    playSpecial('levelUp');
  };

  const handleDownloadExampleFile = (file) => {
    if (!file.validation.valid) {
      setValidationErrors(file.validation.errors);
      showToast('Exemple invalide selon le schéma', 'error');
      return;
    }
    setValidationErrors([]);
    playClick();
    downloadJson(file.payload, file.filename);
    showToast(`${file.filename} téléchargé`, 'success');
  };

  const handleDownloadExampleSet = (entry) => {
    const invalidFile = entry.files.find((file) => !file.validation.valid);
    if (invalidFile) {
      setValidationErrors(invalidFile.validation.errors);
      showToast('Au moins un fichier exemple est invalide', 'error');
      return;
    }
    setValidationErrors([]);
    playSpecial('success');
    entry.files.forEach((file) => downloadJson(file.payload, file.filename));
    showToast(`${entry.files.length} fichier(s) téléchargé(s)`, 'success');
  };

  const handleSaveScoreScale = async (scoreScale) => {
    if (!currentSubject) return;
    await persistSubjectForClass({ ...currentSubject, scoreScale }, `Barème ${currentSubject.name} mis à jour`);
  };

  const handleSaveSubjectSettings = async () => {
    if (!currentSubject) return;
    const fallbackTiming = createDefaultTimingDefaults();
    const nextTimingDefaults = Object.fromEntries(Object.entries(fallbackTiming).map(([key, fallback]) => {
      const numeric = Number(subjectTimingDraft?.[key]);
      return [key, Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback];
    }));
    await persistSubjectForClass({
      ...currentSubject,
      coefficient: Math.max(1, Math.round(Number(subjectCoefficientDraft) || 1)),
      timingDefaults: nextTimingDefaults,
    }, `Réglages ${currentSubject.name} mis à jour`);
  };

  const handleSaveModerationName = async () => {
    if (!moderationName.trim()) return;
    await persistModeratedProfileUserPatch({
      profileName: moderationName.trim(),
      studentIdentity: {
        ...(selectedModeratedUser?.studentIdentity || {}),
        displayName: moderationName.trim(),
      },
    }, 'Nom eleve modere');
  };

  const handleCreateSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) {
      showToast('Nom de matière requis', 'error');
      return;
    }
    const duplicate = classSubjects.some(subject => subject.name?.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      showToast('Cette matière existe déjà dans la classe', 'error');
      return;
    }
    const nextId = classSubjects.reduce((maxId, subject) => Math.max(maxId, Number(subject.id) || 0), 0) + 1;
    const nextSubject = createSubjectShell({
      id: nextId,
      name,
      icon: newSubjectIcon,
      color: newSubjectColor || '#8b5cf6',
      coefficient: 1,
      objectiveGroup: newSubjectGroup || DEFAULT_OBJECTIVE_GROUP_ID,
      timingDefaults: createDefaultTimingDefaults(),
    });
    await persistBucketForClass([...classSubjects, nextSubject], `Matière ${name} créée`, nextId);
    setNewSubjectName('');
    playSpecial('levelUp');
  };

  const handleCreateChapter = async () => {
    if (!currentSubject) return;
    const result = createAdminChapter(currentSubject, newChapterTitle.trim());
    await persistSubjectForClass(result.subject, `Chapitre ${result.chapterNumber} créé`);
    setSelectedChapterNumber(String(result.chapterNumber));
    setNewChapterTitle('');
  };

  const handleRenameSelectedChapter = async () => {
    if (!currentSubject || !selectedChapter) return;
    const nextTitle = chapterTitleDraft.trim();
    if (!nextTitle) {
      showToast('Titre du chapitre requis', 'error');
      return;
    }
    const nextSubject = renameAdminChapter(currentSubject, selectedChapter.number, nextTitle);
    await persistSubjectForClass(nextSubject, `Chapitre ${selectedChapter.number} renommé`);
  };

  const handleCreateItem = async () => {
    if (!currentSubject || !selectedChapter || contentType === 'parcours') return;
    const nextTitle = newItemTitle.trim() || getDefaultItemTitle();
    const duplicate = chapterItems.some((item) => normalizeAdminKey(item.title) === normalizeAdminKey(nextTitle));
    if (duplicate) {
      showToast('Un élément avec ce titre existe déjà dans ce chapitre', 'error');
      return;
    }
    const nextSubject = createAdminNamedItem(currentSubject, contentType, selectedChapter.number, nextTitle);
    await persistSubjectForClass(nextSubject, `${nextTitle} créé`);
    setSelectedItemId(buildAdminItemId(contentType, selectedChapter.number, nextTitle));
    setNewItemTitle('');
  };

  const handleRenameSelectedItem = async () => {
    if (!currentSubject || !selectedChapter || !selectedItem || contentType === 'parcours') return;
    const nextTitle = itemTitleDraft.trim();
    if (!nextTitle) {
      showToast('Titre de l’élément requis', 'error');
      return;
    }
    const duplicate = chapterItems.some((item) => item.id !== selectedItem.id && normalizeAdminKey(item.title) === normalizeAdminKey(nextTitle));
    if (duplicate) {
      showToast('Un autre élément porte déjà ce titre dans ce chapitre', 'error');
      return;
    }
    const nextSubject = renameAdminNamedItem(currentSubject, contentType, selectedChapter.number, selectedItem.title, nextTitle);
    await persistSubjectForClass(nextSubject, `${selectedItem.title} renommé`);
    setSelectedItemId(buildAdminItemId(contentType, selectedChapter.number, nextTitle));
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      showToast('Format accepté : PNG ou JPG', 'error');
      event.target.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const avatar = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await persistModeratedProfileUserPatch({
        avatar,
      }, 'Avatar eleve mis a jour');
    } catch (error) {
      showToast('Impossible de charger l’image', 'error');
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleToggleBlockedSubject = async (subject) => {
    if (!subject?.id) return;
    const subjectId = String(subject.id);
    const nextBlocked = new Set(moderatedBlockedSubjectIds);
    nextBlocked.delete(subjectId);
    nextBlocked.delete(`id:${subjectId}`);

    const isCurrentlyBlocked = moderatedBlockedSubjectIds.includes(subjectId) || moderatedBlockedSubjectIds.includes(`id:${subjectId}`);
    if (!isCurrentlyBlocked) nextBlocked.add(subjectId);

    await persistModeratedProfileUserPatch({
      blockedSubjectIds: Array.from(nextBlocked),
    }, isCurrentlyBlocked ? `${subject.name} debloquee pour ce profil` : `${subject.name} bloquee pour ce profil`);
  };

  /* ── Classes & élèves : blocage par défaut au niveau classe ── */
  const handleToggleClassDefaultBlocked = async (className, subject) => {
    if (!className || !subject?.id) return;
    const subjectId = String(subject.id);
    const currentDefaults = data?.classDefaults || {};
    const currentBlockedList = Array.isArray(currentDefaults?.[className]?.blockedSubjectIds)
      ? currentDefaults[className].blockedSubjectIds.map((value) => String(value))
      : [];
    const isCurrentlyBlocked = currentBlockedList.includes(subjectId);
    const nextBlockedList = isCurrentlyBlocked
      ? currentBlockedList.filter((value) => value !== subjectId && value !== `id:${subjectId}`)
      : [...currentBlockedList, subjectId];

    const nextClassDefaults = {
      ...currentDefaults,
      [className]: { ...(currentDefaults?.[className] || {}), blockedSubjectIds: nextBlockedList },
    };

    const nextData = { ...data, classDefaults: nextClassDefaults };
    await save(nextData);
    showToast(
      isCurrentlyBlocked
        ? `${subject.name} débloquée par défaut pour ${className}`
        : `${subject.name} bloquée par défaut pour ${className}`,
      'success'
    );
  };

  /* ── Override individuel : un élève débloque ou re-bloque une matière ── */
  const handleToggleStudentOverride = async (profileId, subject, kind /* 'unlock' | 'block' */) => {
    if (!profileId || !subject?.id) return;
    const subjectId = String(subject.id);
    const profile = data?.profiles?.[profileId];
    if (!profile) return;

    const userPatch = { ...(profile.user || {}) };
    const blocked = new Set((userPatch.blockedSubjectIds || []).map(String));
    const unlocked = new Set((userPatch.unlockedSubjectIds || []).map(String));
    blocked.delete(`id:${subjectId}`);
    unlocked.delete(`id:${subjectId}`);

    if (kind === 'unlock') {
      // Bascule : si déjà débloqué personnellement, on enlève. Sinon on ajoute (et on retire un blocage personnel s'il y en avait).
      if (unlocked.has(subjectId)) {
        unlocked.delete(subjectId);
      } else {
        unlocked.add(subjectId);
        blocked.delete(subjectId);
      }
    } else if (kind === 'block') {
      if (blocked.has(subjectId)) {
        blocked.delete(subjectId);
      } else {
        blocked.add(subjectId);
        unlocked.delete(subjectId);
      }
    }

    const nextProfiles = {
      ...(data?.profiles || {}),
      [profileId]: {
        ...profile,
        user: {
          ...(profile.user || {}),
          blockedSubjectIds: Array.from(blocked),
          unlockedSubjectIds: Array.from(unlocked),
        },
      },
    };

    const nextData = { ...data, profiles: nextProfiles };
    // Si on a modifié le profil actif, on recopie son user au top-level pour cohérence runtime.
    if (String(profileId) === String(data?.activeProfileId)) {
      nextData.user = nextProfiles[profileId].user;
    }
    await save(nextData);
  };

  /* ── Lock screen ── */
  if (!isAdminConnected) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-5 animate-scale-in">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Shield size={32} className="text-primary" />
            </div>
            <h2 className="text-lg font-extrabold">Espace Professeur</h2>
            <p className="text-xs text-txt-sub mt-1">Connexion Google dédiée à l’administrateur, séparée des comptes élèves.</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            {adminOwnerClaimed ? (
              <div className="rounded-2xl border border-primary/10 bg-primary/5 px-3 py-3 flex items-center gap-3">
                {adminOwnerAvatar ? (
                  <img src={adminOwnerAvatar} alt={adminOwnerDisplayName} className="w-11 h-11 rounded-full object-cover border border-white shadow-sm" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-white border border-gray-200 flex items-center justify-center text-txt-sub shadow-sm">
                    <User size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-primary-dark truncate">Admin propriétaire</p>
                  <p className="text-sm font-bold truncate">{adminOwnerDisplayName}</p>
                  <p className="text-[11px] text-txt-muted truncate">{isAdminOwnerSession ? (adminOwnerEmail || 'Compte Google administrateur') : 'Un compte Google admin est déjà enregistré'}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-txt-sub">Le premier compte Google connecté ici deviendra l’unique propriétaire admin jusqu’à désistement explicite.</p>
            )}

            {adminOwnerClaimed ? (
              <p className="text-[11px] text-txt-sub">L’accès admin est déjà verrouillé. Tant que le propriétaire ne se désiste pas depuis son propre compte, aucun autre compte Google ne peut devenir admin.</p>
            ) : null}

            {isUserSessionActive ? (
              <p className="text-xs font-semibold text-accent-red">Déconnecte d’abord le compte utilisateur avant d’ouvrir l’admin.</p>
            ) : null}

            {adminStatus?.error ? (
              <p className="text-xs font-semibold text-accent-red">{adminStatus.error}</p>
            ) : null}

            <button
              onClick={handleAdminSignIn}
              disabled={adminActionLoading || adminStatus?.busy || !adminStatus?.configured || isUserSessionActive}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold shadow-gold btn-bounce disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              <GoogleIcon size={16} /> {adminSignInLabel}
            </button>
            {adminOwnerClaimed ? <p className="text-[11px] text-txt-sub">Seul le compte Google déjà propriétaire pourra continuer ici. Tout autre compte sera refusé après vérification.</p> : null}
            {!adminStatus?.configured ? <p className="text-[11px] text-accent-red font-semibold">Supabase n’est pas configuré pour la connexion Google.</p> : null}
          </div>
        </div>
      </div>
    );
  }

  /* ── Admin panel ── */
  const TABS = [
    { id: 'content', label: 'Contenus', icon: Layers },
    { id: 'classes', label: 'Classes & élèves', icon: Users },
    { id: 'examples', label: 'Exemples JSON', icon: FileText },
    { id: 'prompts', label: 'Prompt Bank', icon: Brain },
    { id: 'settings', label: 'Paramètres', icon: Settings2 },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-primary" />
            <h1 className="text-xl font-extrabold">Admin</h1>
          </div>
          <button onClick={handleAdminSignOut} disabled={adminActionLoading || adminStatus?.busy} className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-bold text-txt-sub active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
            Déconnecter l’admin
          </button>
        </div>
        <p className="text-[11px] text-txt-sub">Accès sécurisé · contenus partagés pour tous les utilisateurs · validation JSON avant enregistrement</p>
        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 font-semibold">
          ⚠ Les contenus, JSON, matières, classes et comptes sauvegardés en ligne (Netlify / Supabase) priment sur les modifications locales. Toute modification effectuée ici sera <strong>temporaire</strong> tant qu’elle n’est pas publiée vers le cloud, et sera écrasée au prochain rafraîchissement par les données partagées en ligne.
        </div>
      </header>

      <div className="px-4 flex gap-2 mb-3">
        {TABS.map(t => {
          const TIcon = t.icon;
          return (
            <button key={t.id} onClick={() => { playClick(); setActiveTab(t.id); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                activeTab === t.id ? 'bg-primary text-white shadow-gold' : 'bg-white text-txt-sub border border-gray-100'
              }`}>
              <TIcon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      <main className="flex-1 px-4 pb-28 space-y-4">
        {activeTab === 'content' && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-card space-y-4">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
                  <GraduationCap size={16} className="text-accent-blue" /> Sélection de la classe
                </h3>
                <div className="flex flex-wrap gap-2">
                  {adminClasses.map((className) => (
                    <button key={className} onClick={() => { playClick(); setSelectedClass(className); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${selectedClass === className ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                      {className}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-accent-blue/15 bg-accent-blue/5 p-3 space-y-3">
                <div>
                  <h3 className="font-bold text-sm">Créer une nouvelle classe</h3>
                  <p className="text-[11px] text-txt-sub mt-1">La classe est créée vide pour tous les profils. Vous pourrez ensuite y ajouter vos matières et vos imports JSON partagés.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={newClassName}
                    onChange={(event) => setNewClassName(event.target.value)}
                    placeholder="Ex. Seconde C"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40"
                  />
                  <button onClick={handleCreateClass} className="px-4 py-3 rounded-xl bg-accent-blue text-white text-sm font-bold active:scale-95 transition-transform">
                    Créer la classe
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
                  <BookOpen size={16} className="text-accent-purple" /> Sélection de la matière
                </h3>
                {!classSubjects.length ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-txt-sub">
                    Aucune matière dans cette classe pour le moment.
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {classSubjects.map((subject) => (
                    <button key={subject.id} onClick={() => { playClick(); setSelectedSubjectId(String(subject.id)); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${String(subject.id) === String(selectedSubjectId) ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                      {subject.name}
                    </button>
                  ))}
                </div>
                )}
              </div>

              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 space-y-3">
                <div>
                  <h3 className="font-bold text-sm">Créer une nouvelle matière</h3>
                  <p className="text-[11px] text-txt-sub mt-1">La matière est ajoutée dans la classe sélectionnée pour tous les profils, avec réglages par défaut, coefficient, délais et traduction initialisés.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                  <input
                    value={newSubjectName}
                    onChange={(event) => setNewSubjectName(event.target.value)}
                    placeholder="Ex. Philosophie"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40"
                  />
                  <select
                    value={newSubjectIcon}
                    onChange={(event) => setNewSubjectIcon(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40"
                  >
                    {SUBJECT_ICON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <input
                    type="color"
                    value={newSubjectColor}
                    onChange={(event) => setNewSubjectColor(event.target.value)}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-white px-2 py-2"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-txt-sub block mb-1">Groupe d’objectif</label>
                  <select
                    value={newSubjectGroup}
                    onChange={(event) => setNewSubjectGroup(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40"
                  >
                    {CONTENT_OBJECTIVE_GROUPS.map((group) => (
                      <option key={group.id} value={group.id}>{group.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-txt-muted mt-1">Le groupe regroupe les contenus par objectif (mention très bien par défaut, mention restreinte pour les contenus alignés strictement sur un programme officiel).</p>
                </div>
                <button onClick={handleCreateSubject} className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-gold active:scale-95 transition-transform">
                  Créer la matière
                </button>
              </div>

              <div>
                <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
                  <Layers size={16} className="text-accent-green" /> Sélection du type de contenu
                </h3>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_TYPE_OPTIONS.map((option) => (
                    <button key={option.id} onClick={() => { playClick(); setContentType(option.id); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${contentType === option.id ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {contentType === 'parcours' && (
                <div>
                  <h3 className="font-bold text-sm mb-2">Niveau de parcours</h3>
                  <div className="flex gap-2">
                    <button onClick={() => { playClick(); setMentionVariant('mention_bien'); }} className={`flex-1 py-2 rounded-xl text-xs font-bold ${mentionVariant === 'mention_bien' ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                      Mention Bien
                    </button>
                    <button onClick={() => { playClick(); setMentionVariant('mention_tres_bien'); }} className={`flex-1 py-2 rounded-xl text-xs font-bold ${mentionVariant === 'mention_tres_bien' ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                      Mention Très Bien
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-4">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
                  <BookOpen size={16} className="text-primary" /> Chapitres de la matière
                </h3>
                <p className="text-[11px] text-txt-sub mb-3">Créez d’abord un chapitre, puis importez le contenu dans l’item ciblé de ce chapitre.</p>
                <div className="flex flex-wrap gap-2">
                  {chapters.map((chapter) => (
                    <button
                      key={`chapter-${chapter.number}`}
                      onClick={() => { playClick(); setSelectedChapterNumber(String(chapter.number)); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${String(chapter.number) === String(selectedChapter?.number) ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}
                    >
                      Chapitre {chapter.number} · {chapter.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={newChapterTitle}
                  onChange={(event) => setNewChapterTitle(event.target.value)}
                  placeholder="Nouveau chapitre (optionnel)"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40"
                />
                <button onClick={handleCreateChapter} disabled={!currentSubject} className="px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-gold active:scale-95 transition-transform disabled:opacity-40">
                  Créer chapitre
                </button>
              </div>

              {selectedChapter && (
                <div className="rounded-2xl border border-primary/10 bg-primary/[0.04] p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-primary-dark font-bold">Chapitre actif</p>
                      <p className="text-sm font-bold">Chapitre {selectedChapter.number} · {selectedChapter.title}</p>
                    </div>
                    <span className="px-2 py-1 rounded-lg bg-white text-[10px] font-bold text-primary-dark border border-primary/10">{chapterItems.length} élément(s)</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={chapterTitleDraft}
                      onChange={(event) => setChapterTitleDraft(event.target.value)}
                      placeholder="Renommer le chapitre"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40"
                    />
                    <button onClick={handleRenameSelectedChapter} className="px-4 py-3 rounded-xl bg-primary/10 text-primary-dark text-sm font-bold active:scale-95 transition-transform">
                      Renommer
                    </button>
                  </div>
                </div>
              )}

              {contentType !== 'parcours' && (
                <div className="rounded-2xl border border-gray-100 p-3 space-y-3">
                  <div>
                    <h4 className="font-bold text-sm">Éléments du chapitre sélectionné</h4>
                    <p className="text-[11px] text-txt-sub mt-1">Choisissez le quiz, l’exercice ou le sujet type cible avant l’import.</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {chapterItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => { playClick(); setSelectedItemId(item.id); }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${item.id === selectedItem?.id ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={newItemTitle}
                      onChange={(event) => setNewItemTitle(event.target.value)}
                      placeholder={getDefaultItemTitle()}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40"
                    />
                    <button onClick={handleCreateItem} disabled={!selectedChapter} className="px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-gold active:scale-95 transition-transform disabled:opacity-40">
                      Créer item
                    </button>
                  </div>

                  {selectedItem && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        value={itemTitleDraft}
                        onChange={(event) => setItemTitleDraft(event.target.value)}
                        placeholder="Renommer l’item"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40"
                      />
                      <button onClick={handleRenameSelectedItem} className="px-4 py-3 rounded-xl bg-primary/10 text-primary-dark text-sm font-bold active:scale-95 transition-transform">
                        Renommer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm">Barème final de la matière</h3>
                  <p className="text-[11px] text-txt-sub">Le choix pilote automatiquement la note finale sur la page Statistiques élève.</p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold">{currentSubject?.scoreScale || 100}/100</span>
              </div>
              <div className="flex gap-2">
                {[80, 100].map((scale) => (
                  <button key={scale} onClick={() => handleSaveScoreScale(scale)} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${(currentSubject?.scoreScale || 100) === scale ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                    Barème sur {scale}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm">Coefficient & délais par défaut</h3>
                  <p className="text-[11px] text-txt-sub">Appliqués aux moyennes pondérées et aux chronos si aucun JSON ne surcharge la matière.</p>
                </div>
                <button onClick={handleSaveSubjectSettings} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-gold active:scale-95 transition-transform">
                  <Save size={14} className="inline mr-1" /> Enregistrer
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-2xl border border-gray-100 p-3 space-y-1.5">
                  <span className="text-[11px] font-bold text-primary-dark">Coefficient matière</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={subjectCoefficientDraft}
                    onChange={(event) => setSubjectCoefficientDraft(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold focus:outline-none focus:border-primary/40"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 40, 60].map((preset) => {
                      const active = Number(subjectCoefficientDraft) === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setSubjectCoefficientDraft(preset)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-colors ${
                            active
                              ? 'bg-primary text-white border-primary shadow-gold'
                              : 'bg-white text-primary-dark border-primary/20 hover:bg-primary/5'
                          }`}
                        >
                          ×{preset}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-txt-muted">Presets rapides (incluant 40 et 60 pour le bac).</span>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {SUBJECT_TIMING_FIELDS.map((field) => (
                  <label key={field.key} className="rounded-2xl border border-gray-100 p-3 space-y-1.5">
                    <span className="text-[11px] font-bold text-primary-dark">{field.label}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={subjectTimingDraft?.[field.key] ?? 0}
                      onChange={(event) => setSubjectTimingDraft(prev => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold focus:outline-none focus:border-primary/40"
                    />
                    <span className="text-[10px] text-txt-muted">secondes</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Upload size={16} className="text-accent-blue" /> Import JSON validé par schéma
                  </h3>
                  <p className="text-[11px] text-txt-sub mt-1">Mode actuel : {importMode === 'overwrite' ? 'Écraser' : 'Fusionner / compléter'}.</p>
                </div>
                <button onClick={handleExportSubjectSnapshot} className="px-3 py-2 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold active:scale-95 transition-transform">
                  <Download size={14} className="inline mr-1" /> Export matière
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { playClick(); setImportMode('merge'); }} title="Fusionner : conserve l'item ciblé et ajoute ou met à jour seulement les parties trouvées dans le JSON importé." className={`flex-1 py-2 rounded-xl text-xs font-bold ${importMode === 'merge' ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                  Fusionner
                </button>
                <button onClick={() => { playClick(); setImportMode('overwrite'); }} title="Écraser : remplace entièrement la partie ciblée de l'item sélectionné par le contenu du JSON importé, après vérification que le type de fichier correspond bien au bouton choisi." className={`flex-1 py-2 rounded-xl text-xs font-bold ${importMode === 'overwrite' ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                  Écraser
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { playClick(); setImportEntryMode('file'); }} className={`flex-1 py-2 rounded-xl text-xs font-bold ${importEntryMode === 'file' ? 'bg-accent-blue text-white' : 'bg-gray-100 text-txt-sub'}`}>
                  Fichier JSON
                </button>
                <button onClick={() => { playClick(); setImportEntryMode('paste'); }} className={`flex-1 py-2 rounded-xl text-xs font-bold ${importEntryMode === 'paste' ? 'bg-accent-blue text-white' : 'bg-gray-100 text-txt-sub'}`}>
                  Coller du JSON
                </button>
              </div>

              {importEntryMode === 'file' ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {importSlots.map((slot) => (
                    <button key={slot.id} onClick={() => handleStartSlotImport(slot)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-accent-blue/5 border border-accent-blue/15 text-sm font-bold text-accent-blue active:scale-[0.98] transition-transform disabled:opacity-40"
                      disabled={!importTargetReady}
                    >
                      <Upload size={15} /> {slot.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-accent-blue/15 bg-accent-blue/5 p-3">
                  <p className="text-[11px] font-semibold text-accent-blue">Choisis le type de JSON puis colle son contenu brut. La validation est identique à l’import par fichier.</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {importSlots.map((slot) => {
                      const active = selectedPastedImportSlot?.id === slot.id;
                      return (
                        <button
                          key={`paste-${slot.id}`}
                          onClick={() => { playClick(); setPastedImportSlotId(slot.id); }}
                          className={`w-full px-3 py-3 rounded-xl text-sm font-bold transition-transform active:scale-[0.98] ${active ? 'bg-accent-blue text-white shadow-card' : 'bg-white text-accent-blue border border-accent-blue/20'}`}
                        >
                          {slot.label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={pastedJsonText}
                    onChange={(event) => setPastedJsonText(event.target.value)}
                    placeholder="Colle ici le JSON complet..."
                    className="min-h-[220px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-xs font-mono text-txt-main focus:outline-none focus:border-accent-blue/40"
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => setPastedJsonText('')}
                      className="px-3 py-2 rounded-xl bg-gray-100 text-txt-sub text-xs font-bold active:scale-95 transition-transform"
                    >
                      Vider
                    </button>
                    <button
                      onClick={handleImportPastedJson}
                      disabled={!pastedJsonText.trim() || !importTargetReady || !selectedPastedImportSlot}
                      className="px-3 py-2 rounded-xl bg-accent-blue text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-40"
                    >
                      <Upload size={14} className="inline mr-1" /> Importer le JSON collé
                    </button>
                  </div>
                </div>
              )}

              {(selectedChapter || selectedItem) && (
                <div className="rounded-2xl bg-primary/5 border border-primary/15 p-3">
                  <p className="text-[11px] text-primary-dark font-semibold">Les imports s’appliquent au chapitre et à l’item actuellement sélectionnés. Si le JSON porte un autre titre, l’app vous proposera de renommer l’item avant import.</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="px-2 py-1 rounded-lg bg-white text-[10px] font-bold text-primary-dark border border-primary/10">Classe : {selectedClass}</span>
                    <span className="px-2 py-1 rounded-lg bg-white text-[10px] font-bold text-primary-dark border border-primary/10">Matière : {currentSubject?.name || 'Non sélectionnée'}</span>
                    {selectedChapter ? <span className="px-2 py-1 rounded-lg bg-white text-[10px] font-bold text-primary-dark border border-primary/10">Chapitre : {selectedChapter.title}</span> : null}
                    {contentType !== 'parcours' && selectedItem ? <span className="px-2 py-1 rounded-lg bg-white text-[10px] font-bold text-primary-dark border border-primary/10">Item : {selectedItem.title}</span> : null}
                  </div>
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="rounded-2xl border border-accent-red/20 bg-accent-red/5 p-3">
                  <p className="text-xs font-bold text-accent-red mb-2">Erreurs de validation</p>
                  <div className="space-y-1">
                    {validationErrors.slice(0, 5).map((error, index) => (
                      <p key={`${error}-${index}`} className="text-[11px] text-accent-red">- {error}</p>
                    ))}
                  </div>
                </div>
              )}

              <input ref={contentFileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

              <div className="rounded-2xl border-2 border-dashed border-accent-purple/30 bg-accent-purple/5 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-xs font-bold text-accent-purple flex items-center gap-2">
                      <Upload size={14} /> Import en masse (multi-fichiers)
                    </p>
                    <p className="text-[11px] text-txt-sub mt-1">
                      Sélectionnez plusieurs fichiers JSON d’un coup (ou un dossier entier). Chaque fichier est routé automatiquement d’après son <code className="px-1 rounded bg-white/60">kind</code>, son <code className="px-1 rounded bg-white/60">chapterNumber</code>, <code className="px-1 rounded bg-white/60">chapterTitle</code> et son <code className="px-1 rounded bg-white/60">title</code>. Le mode {importMode === 'overwrite' ? 'Écraser' : 'Fusionner'} courant s’applique à tous. Cible : <strong>{currentSubject?.name || '(aucune matière)'}</strong>.
                    </p>
                  </div>
                  <button
                    onClick={handleStartBulkImport}
                    disabled={isBulkImporting || !currentSubject}
                    className="px-4 py-2 rounded-xl bg-accent-purple text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 shadow-card"
                  >
                    {isBulkImporting ? (<><RefreshCw size={14} className="inline mr-1 animate-spin" /> Import en cours…</>) : (<><Upload size={14} className="inline mr-1" /> Choisir les fichiers</>)}
                  </button>
                </div>

                <div className="rounded-xl bg-white border border-accent-purple/25 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-xs font-bold text-accent-purple flex items-center gap-2">
                        <FileText size={14} /> Importer tous les exemples JSON pour cette matière
                      </p>
                      <p className="text-[11px] text-txt-sub mt-1">
                        Injecte automatiquement tous les packs Français / Anglais déjà préparés dans la banque d’exemples ci-dessous, sans avoir à les télécharger un par un. Le matching se fait sur le nom de la matière courante (<strong>{currentSubject?.name || '—'}</strong>).
                      </p>
                      {matchingExamplePacks.length > 0 ? (
                        <p className="text-[11px] text-accent-green font-semibold mt-1">
                          {matchingExamplePacks.length} pack(s) détecté(s) · {matchingExampleFilesCount} fichier(s) à importer
                        </p>
                      ) : (
                        <p className="text-[11px] text-accent-red font-semibold mt-1">
                          Aucun pack ne correspond à cette matière. Sélectionne une matière nommée « Français » ou « Anglais ».
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleImportLanguageExamples}
                      disabled={isBulkImporting || !currentSubject || !matchingExamplePacks.length}
                      className="px-4 py-2 rounded-xl bg-accent-green text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 shadow-card"
                    >
                      {isBulkImporting ? (<><RefreshCw size={14} className="inline mr-1 animate-spin" /> Import…</>) : (<><Upload size={14} className="inline mr-1" /> Tout importer ({matchingExampleFilesCount})</>)}
                    </button>
                  </div>
                  {matchingExamplePacks.length > 0 && (
                    <details className="text-[11px] text-txt-sub">
                      <summary className="cursor-pointer font-semibold text-accent-purple">Voir le détail des packs ({matchingExamplePacks.length})</summary>
                      <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                        {matchingExamplePacks.map((entry) => (
                          <li key={entry.id} className="break-words">
                            · <strong>{entry.title || entry.id}</strong> <span className="text-txt-muted">({Array.isArray(entry.files) ? entry.files.length : 0} fichier(s))</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                {bulkImportSummary && (
                  <div className="rounded-xl bg-white border border-accent-purple/20 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span className="px-2 py-1 rounded-lg bg-accent-green/10 text-accent-green">✅ {bulkImportSummary.successes.length} importé(s)</span>
                      {bulkImportSummary.failures.length > 0 && (
                        <span className="px-2 py-1 rounded-lg bg-accent-red/10 text-accent-red">❌ {bulkImportSummary.failures.length} échec(s)</span>
                      )}
                      <span className="px-2 py-1 rounded-lg bg-gray-100 text-txt-sub">Total : {bulkImportSummary.total}</span>
                      <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary-dark">Mode : {bulkImportSummary.mode === 'overwrite' ? 'Écraser' : 'Fusionner'}</span>
                      <span className="px-2 py-1 rounded-lg bg-accent-blue/10 text-accent-blue">Matière : {bulkImportSummary.subjectName}</span>
                      {bulkImportSummary.source && (
                        <span className="px-2 py-1 rounded-lg bg-accent-purple/10 text-accent-purple">Source : {bulkImportSummary.source}</span>
                      )}
                    </div>
                    {bulkImportSummary.failures.length > 0 && (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        <p className="text-[11px] font-bold text-accent-red">Détail des échecs :</p>
                        {bulkImportSummary.failures.map((failure, index) => (
                          <p key={`${failure.name}-${index}`} className="text-[11px] text-accent-red break-words">
                            · <strong>{failure.name}</strong> — {failure.reason}
                          </p>
                        ))}
                      </div>
                    )}
                    {bulkImportSummary.successes.length > 0 && (
                      <details className="text-[11px] text-txt-sub">
                        <summary className="cursor-pointer font-semibold text-accent-green">Voir les {bulkImportSummary.successes.length} fichier(s) importé(s)</summary>
                        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                          {bulkImportSummary.successes.map((success, index) => (
                            <p key={`${success.name}-${index}`} className="break-words">
                              · <strong>{success.name}</strong> <span className="text-txt-muted">({success.kind})</span>
                            </p>
                          ))}
                        </div>
                      </details>
                    )}
                    <button
                      onClick={() => setBulkImportSummary(null)}
                      className="text-[11px] font-semibold text-txt-sub hover:text-txt-main"
                    >
                      Fermer le résumé
                    </button>
                  </div>
                )}

                <input
                  ref={bulkContentFileRef}
                  type="file"
                  accept=".json,application/json"
                  multiple
                  className="hidden"
                  onChange={handleBulkImport}
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <FileText size={16} className="text-primary" /> Éléments disponibles
                  </h3>
                  <p className="text-[11px] text-txt-sub">{chapterItems.length} élément(s) dans {selectedChapter?.title || 'le chapitre sélectionné'}.</p>
                </div>
              </div>

              {!selectedChapter && (
                <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-txt-sub">
                  Créez ou sélectionnez d’abord un chapitre.
                </div>
              )}

              {selectedChapter && chapterItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-txt-sub">
                  Aucun contenu pour ce chapitre et ce type. Créez un item ci-dessus pour commencer.
                </div>
              )}

              {chapterItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-txt-muted font-bold">Chapitre {item.chapterNumber} · {item.chapterTitle}</p>
                      <h4 className="font-bold text-sm mt-1">{item.title}</h4>
                      {item.id === selectedItem?.id && contentType !== 'parcours' ? <p className="text-[10px] text-primary-dark font-bold mt-1">Cible d’import active</p> : null}
                      <SubjectStatusChips contentType={contentType} item={item} />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {contentType !== 'parcours' ? (
                        <button onClick={() => setSelectedItemId(item.id)} className="px-3 py-2 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold active:scale-95 transition-transform">
                          Sélectionner
                        </button>
                      ) : null}
                      <button onClick={() => handleExportItem(item)} className="px-3 py-2 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold active:scale-95 transition-transform">
                        <Download size={14} className="inline mr-1" /> Exporter
                      </button>
                      <button onClick={() => handleDeleteItem(item)} className="px-3 py-2 rounded-xl bg-accent-red/10 text-accent-red text-xs font-bold active:scale-95 transition-transform">
                        <Trash2 size={14} className="inline mr-1" /> Supprimer
                      </button>
                    </div>
                  </div>

                  {(contentType === 'sujet-type' || contentType === 'exercice') && item.data?.traitement?.questions?.length ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-txt-muted font-bold">Questions de traitement</p>
                      {item.data.traitement.questions.map((question, questionIndex) => (
                        <div key={`${item.id}-question-${questionIndex}`} className="rounded-xl bg-white border border-gray-100 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-primary-dark">Question {questionIndex + 1}</p>
                            <p className="text-[11px] text-txt-sub truncate">{question.question}</p>
                            <p className="text-[10px] text-txt-muted mt-0.5">{Array.isArray(question.lines) ? `${question.lines.length} ligne(s)` : '1 ligne'} · {question.brouillon?.steps?.length || 0} étape(s) brouillon</p>
                            <p className="text-[10px] text-primary-dark mt-1 font-semibold">{buildQuestionReference(item, currentSubject?.name, questionIndex)}</p>
                            {Array.isArray(question.brouillon?.steps) && question.brouillon.steps.length ? (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {question.brouillon.steps.map((step, stepIndex) => (
                                  <span key={`${item.id}-question-${questionIndex}-step-${stepIndex}`} className="px-2 py-1 rounded-lg bg-primary/5 text-[10px] font-semibold text-primary-dark border border-primary/10">
                                    Étape {stepIndex + 1} · {step}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {Array.isArray(question.lines) && question.lines.length ? (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {question.lines.map((line, lineIndex) => (
                                  <span key={`${item.id}-question-${questionIndex}-line-${lineIndex}`} className="px-2 py-1 rounded-lg bg-gray-50 text-[10px] font-semibold text-txt-sub border border-gray-100">
                                    {line.lineLabel || `Ligne ${lineIndex + 1}`}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                            <button onClick={() => handleExportItem(item, questionIndex)} className="px-3 py-2 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold active:scale-95 transition-transform shrink-0">
                              <Download size={14} className="inline mr-1" /> JSON question
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Brain size={16} className="text-accent-purple" /> Templates d’exemple et tests
              </h3>
              {filteredExamples.length === 0 && (
                <div className="rounded-2xl bg-gray-50 p-4 text-sm text-txt-sub">
                  Aucun template prêt pour ce type. Utilise l’onglet Prompt Bank pour générer des JSON conformes.
                </div>
              )}
              {filteredExamples.map((example) => (
                <div key={example.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-sm">{example.label}</h4>
                      <p className="text-[11px] text-txt-sub mt-1">{example.description}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => downloadJson(example.payload, `${example.id}.json`)} className="px-3 py-2 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold active:scale-95 transition-transform">
                        <Download size={14} className="inline mr-1" /> Template
                      </button>
                      <button onClick={() => handleInstallExample(example)} className="px-3 py-2 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold active:scale-95 transition-transform">
                        <Check size={14} className="inline mr-1" /> Injecter
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'classes' && (() => {
          const classDefaultsMap = data?.classDefaults || {};
          const blockedForClass = new Set(
            (classDefaultsMap?.[selectedClass]?.blockedSubjectIds || []).map(String)
          );
          // Élèves rattachés à la classe sélectionnée (via user.selectedClass)
          const studentsInClass = (data?.profileOrder || [])
            .map((pid) => ({ id: String(pid), profile: data?.profiles?.[pid] }))
            .filter((entry) => entry.profile)
            .filter((entry) => normalizeClassName(
              entry.profile?.user?.selectedClass || entry.profile?.settings?.selectedClass || '',
              CLASSES[0]
            ) === selectedClass);
          const cloudAccountsForClass = knownAccounts.filter((account) => {
            const selectedClasses = Array.isArray(account.selectedClasses) ? account.selectedClasses : [];
            return selectedClasses.some((className) => normalizeClassName(className, CLASSES[0]) === selectedClass);
          });

          return (
            <div className="space-y-4">
              <div className="bg-accent-blue/5 border border-accent-blue/15 rounded-2xl p-4">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Users size={16} className="text-accent-blue" /> Classes &amp; élèves
                </h3>
                <p className="text-[11px] text-txt-sub mt-1">
                  Pour chaque classe, choisissez les matières <strong>bloquées par défaut</strong>. Les élèves de la classe verront ces matières bloquées,
                  sauf si vous leur accordez un déblocage personnel ci-dessous. Sur leur écran d&apos;accueil, les matières débloquées apparaissent en haut de la liste.
                </p>
              </div>

              {/* Sélection de la classe (réutilise selectedClass déjà piloté par l'onglet Contenus) */}
              <div className="bg-white rounded-2xl p-4 shadow-card">
                <h4 className="text-xs font-bold text-txt-sub mb-2 uppercase tracking-wider">Classe sélectionnée</h4>
                <div className="flex flex-wrap gap-2">
                  {adminClasses.map((className) => (
                    <button
                      key={className}
                      onClick={() => { playClick(); setSelectedClass(className); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        selectedClass === className ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'
                      }`}
                    >
                      {className}
                      <span className="ml-1.5 text-[10px] opacity-70">
                        ({(data?.classDefaults?.[className]?.blockedSubjectIds || []).length} bloquée{(data?.classDefaults?.[className]?.blockedSubjectIds || []).length !== 1 ? 's' : ''})
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Blocage par défaut au niveau classe */}
              <div className="bg-white rounded-2xl p-4 shadow-card">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Lock size={14} className="text-accent-red" /> Matières bloquées par défaut pour {selectedClass}
                  </h4>
                  <span className="text-[11px] text-txt-sub">{blockedForClass.size} / {classSubjects.length}</span>
                </div>
                {classSubjects.length === 0 ? (
                  <p className="text-xs text-txt-sub italic">Aucune matière dans cette classe pour l&apos;instant.</p>
                ) : (
                  <div className="space-y-2">
                    {classSubjects.map((subject) => {
                      const sid = String(subject.id);
                      const isBlocked = blockedForClass.has(sid);
                      return (
                        <button
                          key={sid}
                          onClick={() => handleToggleClassDefaultBlocked(selectedClass, subject)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                            isBlocked
                              ? 'bg-accent-red/5 border-accent-red/30'
                              : 'bg-white border-gray-200 hover:border-primary/30'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isBlocked ? 'bg-accent-red/10' : ''}`}
                               style={!isBlocked ? { backgroundColor: (subject.color || '#8b5cf6') + '18' } : {}}>
                            {isBlocked ? <Lock size={14} className="text-accent-red" /> : <Unlock size={14} style={{ color: subject.color || '#8b5cf6' }} />}
                          </div>
                          <span className="flex-1 text-sm font-semibold">{subject.name}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isBlocked ? 'bg-accent-red/10 text-accent-red' : 'bg-accent-green/10 text-accent-green'
                          }`}>
                            {isBlocked ? 'BLOQUÉE' : 'OUVERTE'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      <User size={14} className="text-accent-blue" /> Comptes email dans {selectedClass}
                    </h4>
                    <p className="text-[11px] text-txt-sub mt-1">Vue regroupée par compte cloud, comme dans Paramètres.</p>
                  </div>
                  <span className="text-[11px] text-txt-sub">{cloudAccountsForClass.length} compte{cloudAccountsForClass.length !== 1 ? 's' : ''}</span>
                </div>
                {adminStatus?.knownAccountsError ? <p className="text-[11px] font-semibold text-accent-red mb-2">{adminStatus.knownAccountsError}</p> : null}
                {!cloudAccountsForClass.length ? (
                  <p className="text-xs text-txt-sub italic">Aucun compte email cloud rattaché à cette classe pour le moment.</p>
                ) : (
                  <div className="space-y-2">
                    {cloudAccountsForClass.map((account) => {
                      const isExpanded = expandedCloudAccountId === account.remoteUserId;
                      const detailRows = cloudAccountDetails[account.remoteUserId] || [];
                      const detailSummaries = detailRows
                        .map((row) => buildTeacherProfileSummary(row?.payload || {}, row))
                        .filter((summary) => normalizeClassName(summary.user?.selectedClass || summary.row?.selected_class || '', CLASSES[0]) === selectedClass);
                      const isLoadingDetails = cloudAccountDetailLoadingId === account.remoteUserId;

                      return (
                        <div key={`class-account-${account.remoteUserId}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-extrabold truncate">{account.displayName || 'Compte élève'}</p>
                              <p className="text-[11px] text-txt-muted truncate">{account.email || account.remoteUserId}</p>
                              <p className="text-[10px] text-txt-muted mt-1">{account.profileCount} profil(s) · {account.selectedClasses?.join(', ') || 'Classe inconnue'}</p>
                              <p className="text-[10px] text-txt-muted">Dernière activité : {account.lastUpdatedAt ? new Date(account.lastUpdatedAt).toLocaleString() : 'inconnue'}</p>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              <button
                                onClick={() => handleToggleCloudAccountDetails(account)}
                                disabled={adminActionLoading || adminStatus?.busy || !isAdminOwnerSession}
                                className="px-3 py-2 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <FileText size={14} className="inline mr-1" /> {isExpanded ? 'Masquer' : 'Voir profils'}
                              </button>
                              <button
                                onClick={async () => {
                                  if (!isAdminOwnerSession) return;
                                  await runAdminAction(async () => {
                                    await reassignCloudAccountToClass(account.remoteUserId, selectedClass);
                                  }, `Compte assigné à ${selectedClass}`);
                                }}
                                disabled={adminActionLoading || adminStatus?.busy || !isAdminOwnerSession}
                                className="px-3 py-2 rounded-xl bg-accent-blue/10 text-accent-blue text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Users size={14} className="inline mr-1" /> Assigner ici
                              </button>
                            </div>
                          </div>
                          {isExpanded ? (
                            <div className="rounded-2xl bg-white border border-primary/10 p-3 space-y-2">
                              {cloudAccountDetailError ? <p className="text-[11px] font-semibold text-accent-red">{cloudAccountDetailError}</p> : null}
                              {isLoadingDetails ? (
                                <p className="text-[11px] text-txt-sub">Chargement des profils Supabase…</p>
                              ) : detailSummaries.length === 0 ? (
                                <p className="text-[11px] text-txt-sub">Aucun profil détaillé de ce compte dans {selectedClass}.</p>
                              ) : (
                                detailSummaries.map((summary) => (
                                  <div key={`class-account-${account.remoteUserId}-${summary.row?.profile_id || summary.user?.profileName || 'profile'}`} className="rounded-xl border border-gray-100 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-xs font-extrabold truncate">{summary.user?.profileName || summary.row?.profile_name || 'Profil élève'}</p>
                                        <p className="text-[10px] text-txt-muted">Classe : {summary.user?.selectedClass || summary.row?.selected_class || 'Inconnue'} · {summary.mergedHistory.length} session(s)</p>
                                      </div>
                                      <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary-dark text-[10px] font-bold">
                                        {formatAdminScore(summary.user?.averageScore)}/20
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[10px] text-txt-sub">
                                      <span>XP : <strong>{summary.user?.xp || 0}</strong></span>
                                      <span>Crédits : <strong>{summary.user?.credits || 0}</strong></span>
                                      <span>Vérif. : <strong>{summary.verificationRate}%</strong></span>
                                      <span>Temps : <strong>{formatAdminDuration(summary.stats?.timeStudiedSeconds || 0)}</strong></span>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Liste des élèves de la classe + overrides individuels */}
              <div className="bg-white rounded-2xl p-4 shadow-card">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <Users size={14} className="text-accent-blue" /> Élèves dans {selectedClass}
                  </h4>
                  <span className="text-[11px] text-txt-sub">{studentsInClass.length} élève{studentsInClass.length !== 1 ? 's' : ''}</span>
                </div>
                {studentsInClass.length === 0 ? (
                  <p className="text-xs text-txt-sub italic">Aucun élève rattaché à cette classe.</p>
                ) : (
                  <div className="space-y-3">
                    {studentsInClass.map(({ id: pid, profile }) => {
                      const studentUser = profile.user || {};
                      const personalBlocked = new Set((studentUser.blockedSubjectIds || []).map(String));
                      const personalUnlocked = new Set((studentUser.unlockedSubjectIds || []).map(String));
                      const studentName = studentUser.profileName || profile.id || 'Élève';
                      const overrideCount = personalBlocked.size + personalUnlocked.size;
                      return (
                        <details key={pid} className="rounded-xl border border-gray-100 bg-gray-50">
                          <summary className="px-3 py-2.5 cursor-pointer flex items-center gap-3 select-none">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                              {(studentName[0] || '?').toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{studentName}</p>
                              <p className="text-[10px] text-txt-muted truncate">
                                {overrideCount > 0
                                  ? `${overrideCount} dérogation${overrideCount > 1 ? 's' : ''} personnelle${overrideCount > 1 ? 's' : ''}`
                                  : 'Aucune dérogation personnelle'}
                              </p>
                            </div>
                            <span className="text-[10px] text-txt-sub">▾</span>
                          </summary>
                          <div className="px-3 pb-3 pt-1 space-y-1.5">
                            {classSubjects.length === 0 && (
                              <p className="text-[11px] text-txt-sub italic">Aucune matière à configurer.</p>
                            )}
                            {classSubjects.map((subject) => {
                              const sid = String(subject.id);
                              const access = computeSubjectAccess({
                                subject,
                                user: studentUser,
                                classDefaults: classDefaultsMap,
                              });
                              const classDefaultBlocked = blockedForClass.has(sid);
                              const personallyUnlocked = personalUnlocked.has(sid);
                              const personallyBlocked = personalBlocked.has(sid);
                              return (
                                <div key={sid} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white border border-gray-100">
                                  <span className="flex-1 text-xs font-semibold truncate">{subject.name}</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    access.blocked
                                      ? (access.source === 'personal' ? 'bg-accent-red/15 text-accent-red' : 'bg-orange-100 text-orange-700')
                                      : (personallyUnlocked ? 'bg-accent-green/15 text-accent-green' : 'bg-gray-100 text-txt-sub')
                                  }`}>
                                    {access.blocked
                                      ? (access.source === 'personal' ? 'BLOC. PERSO' : 'BLOC. CLASSE')
                                      : (personallyUnlocked ? 'DÉBLOC. PERSO' : 'OUVERTE')}
                                  </span>
                                  {/* Bouton débloquer perso : visible si la matière est bloquée par classe */}
                                  {classDefaultBlocked && (
                                    <button
                                      onClick={() => handleToggleStudentOverride(pid, subject, 'unlock')}
                                      className={`text-[10px] font-bold px-2 py-1 rounded ${
                                        personallyUnlocked
                                          ? 'bg-accent-green text-white'
                                          : 'bg-accent-green/10 text-accent-green hover:bg-accent-green/20'
                                      }`}
                                      title={personallyUnlocked ? 'Retirer le déblocage personnel' : 'Débloquer pour cet élève uniquement'}
                                    >
                                      {personallyUnlocked ? '✓ Débloquée' : 'Débloquer'}
                                    </button>
                                  )}
                                  {/* Bouton bloquer perso : visible si pas de bloc. classe (sinon redondant) */}
                                  {!classDefaultBlocked && (
                                    <button
                                      onClick={() => handleToggleStudentOverride(pid, subject, 'block')}
                                      className={`text-[10px] font-bold px-2 py-1 rounded ${
                                        personallyBlocked
                                          ? 'bg-accent-red text-white'
                                          : 'bg-accent-red/10 text-accent-red hover:bg-accent-red/20'
                                      }`}
                                      title={personallyBlocked ? 'Retirer le blocage personnel' : 'Bloquer pour cet élève uniquement'}
                                    >
                                      {personallyBlocked ? '✓ Bloquée' : 'Bloquer'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {activeTab === 'examples' && (
          <div className="space-y-4">
            <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4">
              <h3 className="font-bold text-sm">Exemples JSON complets et téléchargeables</h3>
              <p className="text-[11px] text-txt-sub mt-1">Chaque fichier ci-dessous est pré-validé avec les schémas de l’app. Les exemples incluent traductions, délais, coefficients, scoring et structures attendues par l’import admin.</p>
            </div>

            {downloadableExamples.map((entry) => (
              <div key={entry.id} className="bg-white rounded-2xl p-4 shadow-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-sm">{entry.title}</h4>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${entry.valid ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
                        {entry.valid ? 'Schéma validé' : 'À corriger'}
                      </span>
                    </div>
                    <p className="text-[11px] text-txt-sub mt-1">{entry.description}</p>
                  </div>
                  <button onClick={() => handleDownloadExampleSet(entry)} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-gold active:scale-95 transition-transform shrink-0">
                    <Download size={14} className="inline mr-1" /> Tout télécharger
                  </button>
                </div>

                <div className="space-y-2">
                  {entry.files.map((file) => (
                    <div key={file.filename} className="rounded-2xl border border-gray-100 bg-gray-50/70 px-3 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-primary-dark">{file.label}</p>
                        <p className="text-[11px] text-txt-sub truncate">{file.filename}</p>
                        <p className={`text-[10px] mt-1 font-semibold ${file.validation.valid ? 'text-accent-green' : 'text-accent-red'}`}>
                          {file.validation.valid ? 'Compatible import admin' : (file.validation.errors[0] || 'Erreur de schéma')}
                        </p>
                      </div>
                      <button onClick={() => handleDownloadExampleFile(file)} className="px-3 py-2 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold active:scale-95 transition-transform shrink-0">
                        <Download size={14} className="inline mr-1" /> Télécharger
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'prompts' && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/15">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-xs text-primary-dark font-semibold sm:max-w-3xl">
                  Ces prompts sont prêts à être copiés-collés dans une IA externe. Ils imposent les clés, types, valeurs et contraintes nécessaires pour que les JSON soient directement interprétables par l’application.
                </p>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    onClick={handleCopyAllPrompts}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${copiedPrompt === 'all-prompts' ? 'bg-accent-green/10 text-accent-green' : 'bg-primary/10 text-primary-dark'}`}
                  >
                    {copiedPrompt === 'all-prompts' ? <><Check size={12} className="inline mr-1" /> Tout copié</> : <><Copy size={12} className="inline mr-1" /> Copier tous</>}
                  </button>
                  <button
                    onClick={handleExportAllPromptsTxt}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-accent-green/10 text-accent-green transition-all active:scale-95"
                  >
                    <Download size={12} className="inline mr-1" /> Export .txt
                  </button>
                </div>
              </div>
            </div>
            {filteredPromptBank.map((entry) => (
              <div key={entry.id} className="bg-white rounded-2xl p-4 shadow-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm">{entry.title}</h4>
                    <p className="text-[11px] text-txt-sub mt-1">{entry.description}</p>
                  </div>
                  <button onClick={() => copyPrompt(entry.id, entry.prompt)}
                    className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${copiedPrompt === entry.id ? 'bg-accent-green/10 text-accent-green' : 'bg-primary/10 text-primary-dark'}`}>
                    {copiedPrompt === entry.id ? <><Check size={12} /> Copié</> : <><Copy size={12} /> Copier</>}
                  </button>
                </div>
                <pre className="text-[10px] text-txt-sub bg-gray-50 rounded-lg p-3 overflow-x-auto max-h-64 no-scrollbar whitespace-pre-wrap break-words">{entry.prompt}</pre>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Shield size={16} className="text-primary" /> Compte admin propriétaire
              </h3>
              <div className="rounded-2xl border border-primary/10 bg-primary/5 px-3 py-3 flex items-center gap-3">
                {adminOwnerAvatar ? (
                  <img src={adminOwnerAvatar} alt={adminOwnerDisplayName} className="w-12 h-12 rounded-full object-cover border border-white shadow-sm" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-txt-sub shadow-sm">
                    <User size={20} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-primary-dark truncate">{adminOwnerDisplayName}</p>
                  <p className="text-[11px] text-txt-muted truncate">{adminOwnerEmail || adminSessionUser?.email || 'Compte Google administrateur connecté'}</p>
                  <p className="text-[11px] font-semibold text-accent-green mt-1">Session admin active</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button onClick={handleAdminSignOut} disabled={adminActionLoading || adminStatus?.busy}
                  className="w-full py-3 rounded-xl bg-gray-100 text-txt-sub font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
                  Déconnecter l’admin
                </button>
                <button onClick={handleReleaseAdminOwnership} disabled={adminActionLoading || adminStatus?.busy || !isAdminOwnerSession}
                  className="w-full py-3 rounded-xl bg-primary text-white font-bold shadow-gold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
                  Se désister de l’admin
                </button>
              </div>
              <p className="text-[11px] text-txt-sub">Tant que l’admin propriétaire ne se désiste pas ici, aucun autre compte Google ne peut devenir administrateur.</p>
              {adminStatus?.sharedRegistryError ? <p className="text-[11px] font-semibold text-accent-red">Synchronisation multi-navigateurs : {adminStatus.sharedRegistryError}</p> : null}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <User size={16} className="text-accent-blue" /> Comptes cloud connectés
                  </h3>
                  <p className="text-[11px] text-txt-sub mt-1">Vue admin des comptes ayant stocké des profils dans Supabase.</p>
                </div>
                <button
                  onClick={handleRefreshCloudAccounts}
                  disabled={adminActionLoading || adminStatus?.busy || !isAdminOwnerSession}
                  className="px-3 py-2 rounded-xl bg-gray-100 text-txt-sub text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  <RefreshCw size={14} /> Actualiser
                </button>
              </div>
              {adminStatus?.knownAccountsError ? <p className="text-[11px] font-semibold text-accent-red">{adminStatus.knownAccountsError}</p> : null}
              {!knownAccounts.length ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-[11px] text-txt-sub">
                  Aucun compte cloud visible pour le moment.
                </div>
              ) : (
                <div className="space-y-2">
                  {knownAccounts.map((account) => {
                    const isExpanded = expandedCloudAccountId === account.remoteUserId;
                    const detailRows = cloudAccountDetails[account.remoteUserId] || [];
                    const detailSummaries = detailRows.map((row) => buildTeacherProfileSummary(row?.payload || {}, row));
                    const isLoadingDetails = cloudAccountDetailLoadingId === account.remoteUserId;

                    return (
                      <div key={account.remoteUserId} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold truncate">{account.displayName || 'Compte élève'}</p>
                            <p className="text-[11px] text-txt-muted truncate">{account.email || account.remoteUserId}</p>
                            <p className="text-[10px] text-txt-muted mt-1">{account.profileCount} profil(s) · {account.selectedClasses?.join(', ') || 'Classe inconnue'}</p>
                            <p className="text-[10px] text-txt-muted">Dernière activité : {account.lastUpdatedAt ? new Date(account.lastUpdatedAt).toLocaleString() : 'inconnue'}</p>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button
                              onClick={() => handleToggleCloudAccountDetails(account)}
                              disabled={adminActionLoading || adminStatus?.busy || !isAdminOwnerSession}
                              className="px-3 py-2 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <FileText size={14} className="inline mr-1" /> {isExpanded ? 'Masquer la fiche' : 'Voir la fiche'}
                            </button>
                            <button
                              onClick={() => handleResetCloudAccount(account)}
                              disabled={adminActionLoading || adminStatus?.busy || !isAdminOwnerSession}
                              className="px-3 py-2 rounded-xl bg-accent-red/10 text-accent-red text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={14} className="inline mr-1" /> Purger
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="rounded-2xl bg-white border border-primary/10 p-3 space-y-3">
                            {cloudAccountDetailError ? <p className="text-[11px] font-semibold text-accent-red">{cloudAccountDetailError}</p> : null}
                            {isLoadingDetails ? (
                              <p className="text-[11px] text-txt-sub">Chargement des profils Supabase…</p>
                            ) : detailSummaries.length === 0 ? (
                              <p className="text-[11px] text-txt-sub">Aucun snapshot détaillé trouvé pour ce compte.</p>
                            ) : (
                              <div className="space-y-4">
                                {detailSummaries.map((summary) => (
                                  <div key={`${account.remoteUserId}-${summary.row?.profile_id || summary.user?.profileName || 'profile'}`} className="rounded-2xl border border-gray-100 p-3 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-sm font-extrabold truncate">{summary.user?.profileName || summary.row?.profile_name || 'Profil élève'}</p>
                                        <p className="text-[11px] text-txt-muted">Classe : {summary.user?.selectedClass || summary.row?.selected_class || 'Inconnue'} · Sync : {summary.row?.provider || 'supabase'}</p>
                                        <p className="text-[10px] text-txt-muted">Mis à jour : {summary.row?.updated_at ? new Date(summary.row.updated_at).toLocaleString() : 'inconnu'}</p>
                                      </div>
                                      <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary-dark text-[10px] font-bold">
                                        {summary.mergedHistory.length} session(s)
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                      <div className="rounded-xl bg-primary/5 p-3">
                                        <p className="text-[10px] text-txt-muted uppercase">Moyenne</p>
                                        <p className="text-lg font-extrabold text-primary-dark">{formatAdminScore(summary.user?.averageScore)}/20</p>
                                      </div>
                                      <div className="rounded-xl bg-accent-green/5 p-3">
                                        <p className="text-[10px] text-txt-muted uppercase">XP / crédits</p>
                                        <p className="text-lg font-extrabold text-accent-green">{summary.user?.xp || 0} / {summary.user?.credits || 0}</p>
                                      </div>
                                      <div className="rounded-xl bg-accent-red/5 p-3">
                                        <p className="text-[10px] text-txt-muted uppercase">Énergie / feu</p>
                                        <p className="text-lg font-extrabold text-accent-red">{summary.user?.energy || 0} / {summary.user?.fire || 0}</p>
                                      </div>
                                      <div className="rounded-xl bg-accent-blue/5 p-3">
                                        <p className="text-[10px] text-txt-muted uppercase">Temps étudié</p>
                                        <p className="text-lg font-extrabold text-accent-blue">{formatAdminDuration(summary.stats?.timeStudiedSeconds || 0)}</p>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                                      <div className="rounded-xl border border-gray-100 p-3">
                                        <p className="text-txt-muted">Sessions complètes</p>
                                        <p className="font-extrabold text-primary-dark">{summary.stats?.sessionsCompleted || 0}</p>
                                      </div>
                                      <div className="rounded-xl border border-gray-100 p-3">
                                        <p className="text-txt-muted">Questions résolues</p>
                                        <p className="font-extrabold text-primary-dark">{summary.stats?.totalQuestionsCompleted || 0}</p>
                                      </div>
                                      <div className="rounded-xl border border-gray-100 p-3">
                                        <p className="text-txt-muted">Vérifications justes</p>
                                        <p className="font-extrabold text-primary-dark">{summary.verificationRate}%</p>
                                      </div>
                                      <div className="rounded-xl border border-gray-100 p-3">
                                        <p className="text-txt-muted">Meilleure moyenne</p>
                                        <p className="font-extrabold text-primary-dark">{formatAdminScore(summary.stats?.bestAverageScore)}/20</p>
                                      </div>
                                    </div>

                                    <div className="rounded-2xl bg-bg p-3 space-y-2">
                                      <p className="text-xs font-extrabold">Répartition des activités</p>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                                        <div className="rounded-xl bg-white p-2 border border-gray-100">Quiz : <strong>{summary.activity.quizzes}</strong></div>
                                        <div className="rounded-xl bg-white p-2 border border-gray-100">Exercices : <strong>{summary.activity.exercices}</strong></div>
                                        <div className="rounded-xl bg-white p-2 border border-gray-100">Sujets types : <strong>{summary.activity.sujetTypes}</strong></div>
                                        <div className="rounded-xl bg-white p-2 border border-gray-100">Autres : <strong>{summary.activity.other}</strong></div>
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                                        {Object.entries(summary.quizModes).map(([modeKey, count]) => (
                                          <div key={modeKey} className="rounded-xl bg-white p-2 border border-gray-100 flex items-center justify-between gap-2">
                                            <span>{QUIZ_MODE_LABELS[modeKey] || modeKey}</span>
                                            <strong>{count}</strong>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="space-y-2">
                                      <p className="text-xs font-extrabold">Performance par matière</p>
                                      {summary.subjectPerformance.length === 0 ? (
                                        <p className="text-[11px] text-txt-sub">Aucune matière jouée pour ce profil.</p>
                                      ) : (
                                        <div className="grid md:grid-cols-2 gap-2">
                                          {summary.subjectPerformance.map(([subjectId, entry]) => (
                                            <div key={subjectId} className="rounded-xl border border-gray-100 p-3 text-[11px]">
                                              <p className="font-bold text-primary-dark">Matière #{subjectId}</p>
                                              <p className="text-txt-muted mt-1">Sessions : {entry.sessions || 0} · Moyenne : {formatAdminScore(entry.average)}/20</p>
                                              <p className="text-txt-muted">Dernière : {formatAdminScore(entry.lastScore)}/20 · Meilleure : {formatAdminScore(entry.best)}/20</p>
                                              <p className="text-txt-muted">Rythme : {formatAdminDuration(entry.averageQuestionSeconds || 0)} / question</p>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div className="space-y-2">
                                      <p className="text-xs font-extrabold">Historique récent</p>
                                      {summary.mergedHistory.length === 0 ? (
                                        <p className="text-[11px] text-txt-sub">Aucun historique enregistré.</p>
                                      ) : (
                                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                          {summary.mergedHistory.slice(0, 20).map((entry, index) => (
                                            <div key={`${summary.row?.profile_id || 'profile'}-${index}`} className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-[11px]">
                                              <div className="flex items-start justify-between gap-3">
                                                <div>
                                                  <p className="font-bold text-primary-dark">{entry.title}</p>
                                                  <p className="text-txt-muted">{entry.subjectName || 'Matière'} · {entry.sessionKind === 'quiz' ? (QUIZ_MODE_LABELS[entry.quizMode] || 'Quiz') : (entry.flowType === 'sujet-type' ? 'Sujet type' : 'Exercice')}</p>
                                                </div>
                                                <div className="text-right">
                                                  <p className="font-extrabold text-primary-dark">{formatAdminScore(entry.average20)}/20</p>
                                                  <p className="text-txt-muted">{entry.displayScore}/{entry.scoreScale}</p>
                                                </div>
                                              </div>
                                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-txt-muted">
                                                <span>Questions : {entry.totalQuestions || 0}</span>
                                                <span>Vérifs : {entry.goodVerifications || 0}/{entry.verifyCount || 0}</span>
                                                <span>Indices : {entry.hintsUsed || 0}</span>
                                                <span>Durée : {formatAdminDuration(entry.timeSpentSeconds || 0)}</span>
                                              </div>
                                              <p className="text-[10px] text-txt-muted mt-2">{entry.recordedAt ? new Date(entry.recordedAt).toLocaleString() : 'Date inconnue'}</p>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-4">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <User size={16} className="text-accent-blue" /> Modération profil élève
              </h3>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-txt-sub">Profil eleve cible</label>
                <select
                  value={selectedModeratedProfileId}
                  onChange={event => setSelectedModeratedProfileId(event.target.value)}
                  disabled={!isAdminOwnerSession || localProfileRecords.length === 0}
                  className="w-full rounded-xl border border-gray-200 bg-bg px-3 py-3 text-sm font-semibold focus:outline-none focus:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {localProfileRecords.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} - {profile.selectedClass}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-txt-sub">
                  Seul l&apos;admin proprietaire peut moderer ce profil, bloquer ses matieres et changer son apparence.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={!isAdminOwnerSession || !selectedModeratedProfile}
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-light overflow-hidden text-white flex items-center justify-center shadow-gold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {selectedModeratedUser?.avatar ? (
                    <img src={selectedModeratedUser.avatar} alt="Avatar eleve" className="w-full h-full object-cover" />
                  ) : (
                    <User size={28} className="text-white" />
                  )}
                </button>
                <div className="flex-1">
                  <p className="font-bold text-sm">{selectedModeratedUser?.profileName || 'Profil eleve'}</p>
                  <p className="text-[11px] text-txt-muted mt-1">Classe : {moderatedProfileClassName}</p>
                  <p className="text-[11px] text-txt-sub mt-1">{isUploadingAvatar ? 'Chargement...' : 'PNG / JPG acceptes. Accessible ici pour moderation.'}</p>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={!isAdminOwnerSession || !selectedModeratedProfile}
                    className="mt-2 px-3 py-2 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Upload size={14} className="inline mr-1" /> Modifier l image
                  </button>
                </div>
              </div>
              <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleAvatarChange} />
              <div className="flex gap-2">
                <input
                  value={moderationName}
                  onChange={e => setModerationName(e.target.value)}
                  placeholder="Nom affiche de l eleve"
                  disabled={!isAdminOwnerSession || !selectedModeratedProfile}
                  className="flex-1 p-3 rounded-xl bg-bg border border-gray-200 text-sm font-semibold focus:outline-none focus:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSaveModerationName}
                  disabled={!isAdminOwnerSession || !selectedModeratedProfile}
                  className="px-4 py-3 rounded-xl bg-primary text-white font-bold shadow-gold active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save size={16} />
                </button>
              </div>
              <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">Blocage des matieres</p>
                    <p className="text-[11px] text-txt-sub mt-1">La matiere bloquee reste visible cote eleve avec un titre floute, mais son ouverture est interdite.</p>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary-dark text-[10px] font-bold">
                    {moderatedBlockedSubjectIds.length} bloquee(s)
                  </span>
                </div>
                {moderatedProfileSubjects.length === 0 ? (
                  <p className="text-[11px] text-txt-sub">Aucune matiere disponible pour ce profil.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {moderatedProfileSubjects.map((subject) => {
                      const isBlocked = moderatedBlockedSubjectIds.includes(String(subject.id)) || moderatedBlockedSubjectIds.includes(`id:${String(subject.id)}`);
                      return (
                        <button
                          key={`moderation-subject-${selectedModeratedProfileId}-${subject.id}`}
                          onClick={() => handleToggleBlockedSubject(subject)}
                          disabled={!isAdminOwnerSession}
                          className={`rounded-xl border px-3 py-3 text-left transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${isBlocked ? 'border-accent-red/25 bg-accent-red/5 text-accent-red' : 'border-gray-200 bg-white text-primary-dark'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm">{subject.name}</span>
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${isBlocked ? 'bg-accent-red/10 text-accent-red' : 'bg-accent-green/10 text-accent-green'}`}>
                              {isBlocked ? 'Bloquee' : 'Active'}
                            </span>
                          </div>
                          <p className="text-[11px] mt-1">
                            {isBlocked ? 'Cliquer pour debloquer cette matiere pour ce profil.' : 'Cliquer pour bloquer cette matiere seulement pour ce profil.'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Download size={16} className="text-accent-green" /> Sauvegarde complète
              </h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <button onClick={handleExportAll}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-accent-green/5 border border-accent-green/15 active:scale-[0.98] transition-transform">
                  <Download size={18} className="text-accent-green" />
                  <div className="text-left">
                    <p className="font-bold text-xs">Exporter tout</p>
                    <p className="text-[10px] text-txt-muted">App complète</p>
                  </div>
                </button>

                <button onClick={handleExportClassSnapshot}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-accent-blue/5 border border-accent-blue/15 active:scale-[0.98] transition-transform">
                  <Download size={18} className="text-accent-blue" />
                  <div className="text-left">
                    <p className="font-bold text-xs">Exporter la classe</p>
                    <p className="text-[10px] text-txt-muted">{selectedClass}</p>
                  </div>
                </button>

                <button onClick={handleExportSubjectSnapshot} disabled={!currentSubject}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15 active:scale-[0.98] transition-transform disabled:opacity-40"
                  title="Exporter la matière sélectionnée"
                >
                  <Download size={18} className="text-primary" />
                  <div className="text-left">
                    <p className="font-bold text-xs">Exporter la matière</p>
                    <p className="text-[10px] text-txt-muted">{currentSubject?.name || 'Aucune matière'}</p>
                  </div>
                </button>
              </div>
              <p className="text-[10px] text-txt-muted">Les exports restent en JSON pour conserver votre workflow actuel sur Netlify.</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card border border-accent-red/15">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-accent-red">
                <AlertCircle size={16} /> Zone danger
              </h3>
              <button onClick={async () => {
                if (!window.confirm('SUPPRIMER TOUTES les données ? Cette action est irréversible.')) return;
                await storage.reset();
                window.location.reload();
              }} className="w-full py-3 rounded-xl bg-accent-red/10 text-accent-red font-bold text-sm active:scale-95 transition-transform"
                title="Réinitialiser toutes les données de l'application"
              >
                <Trash2 size={14} className="inline mr-1.5" /> Tout réinitialiser
              </button>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3 border border-primary/15">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Upload size={16} className="text-primary" /> Restauration de backups
                </h3>
                <p className="text-[11px] text-txt-sub mt-1">Restaurez un backup global, une classe, ou une matière. Mode overwrite = remplacement, mode merge = fusion non destructive.</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { playClick(); setBackupRestoreMode('overwrite'); }} title="Remplacer : le contenu restauré prend la place du contenu existant sur le périmètre choisi (global, classe ou matière)." className={`flex-1 py-2 rounded-xl text-xs font-bold ${backupRestoreMode === 'overwrite' ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                  Remplacer
                </button>
                <button onClick={() => { playClick(); setBackupRestoreMode('merge'); }} title="Fusionner : restaure sans effacer tout le reste ; les données du backup sont ajoutées ou combinées avec celles déjà présentes quand c'est possible." className={`flex-1 py-2 rounded-xl text-xs font-bold ${backupRestoreMode === 'merge' ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-sub'}`}>
                  Fusionner
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <button onClick={() => handleStartBackupRestore('global')} title="Restaure toute l'application depuis un backup global." className="px-3 py-3 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold active:scale-95 transition-transform">
                  Restaurer tout
                </button>
                <button onClick={() => handleStartBackupRestore('class')} title="Restaure uniquement une classe complète et ses matières depuis un backup de classe." className="px-3 py-3 rounded-xl bg-accent-blue/10 text-accent-blue text-xs font-bold active:scale-95 transition-transform">
                  Restaurer une classe
                </button>
                <button onClick={() => handleStartBackupRestore('subject')} title="Restaure uniquement une matière depuis un backup matière." className="px-3 py-3 rounded-xl bg-primary/10 text-primary-dark text-xs font-bold active:scale-95 transition-transform">
                  Restaurer une matière
                </button>
              </div>

              <button onClick={handleRestoreLocalBackup} className="w-full py-3 rounded-xl bg-gray-100 text-txt-sub text-sm font-bold active:scale-95 transition-transform"
                title="Restaurer la dernière sauvegarde locale automatique"
              >
                Restaurer la dernière sauvegarde locale automatique
              </button>

              <input ref={backupFileRef} type="file" accept=".json" className="hidden" onChange={handleImportBackup} />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card border border-accent-red/15">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-accent-red">
                <AlertCircle size={16} /> Zone danger
              </h3>
              <button onClick={async () => {
                if (!window.confirm('SUPPRIMER TOUTES les données ? Cette action est irréversible.')) return;
                await storage.reset();
                window.location.reload();
              }} className="w-full py-3 rounded-xl bg-accent-red/10 text-accent-red font-bold text-sm active:scale-95 transition-transform">
                <Trash2 size={14} className="inline mr-1.5" /> Tout réinitialiser
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
