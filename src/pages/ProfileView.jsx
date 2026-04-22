import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { createDefaultData } from '../lib/constants';
import { BADGE_DEFINITIONS, SHOP_ITEMS } from '../lib/progression';
import { BADGE_ICON_MAP } from '../components/BadgeIcons';
import { renderMixedContent } from '../components/KaTeXRenderer';
import {
  User, Zap, Flame, Trophy, GraduationCap, Edit3, Check, Volume2, VolumeX,
  RotateCcw, ChevronRight, Award, Target, Calendar, Coins, ShoppingBag, Upload,
  Sparkles, BatteryCharging, BookOpen, LifeBuoy, BarChart3, History, Gauge,
  Timer, AlertTriangle, ShieldCheck,
} from 'lucide-react';

/* ════════ Helpers temps ════════ */

function formatDuration(totalSeconds) {
  const safe = Math.max(0, totalSeconds || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  return `${minutes} min`;
}

function formatPace(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatPaceDelta(deltaSeconds) {
  if (!Number.isFinite(Number(deltaSeconds)) || Number(deltaSeconds) === 0) return 'Stable';
  const numeric = Number(deltaSeconds);
  const sign = numeric < 0 ? '-' : '+';
  return `${sign}${formatPace(Math.abs(numeric))}`;
}

function formatRecordedDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString();
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

/* ════════ Tabs ════════ */

const TABS = [
  { id: 'progression', label: 'Progression', Icon: BarChart3 },
  { id: 'history', label: 'Historique', Icon: History },
  { id: 'shop', label: 'Boutique', Icon: ShoppingBag },
  { id: 'help', label: 'Aide', Icon: LifeBuoy },
];

export default function ProfileView() {
  const {
    data, save, playClick, playSpecial, showToast, purchaseItem, updateProfile, changeSelectedClass, availableClasses,
    adminStatus,
    cloudStatus, signInActiveProfileWithGoogle, signOutActiveProfileCloud,
  } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState('progression');
  const [expandedSessionIndex, setExpandedSessionIndex] = useState(null);
  const [cloudActionLoading, setCloudActionLoading] = useState(false);
  const fileInputRef = useRef(null);

  const user = data?.user || {};
  const settings = data?.settings || {};
  const level = Math.floor((user.xp || 0) / 500) + 1;
  const xpInLevel = (user.xp || 0) % 500;
  const stats = user.stats || {};
  const averageScore = Number(user.averageScore || 0).toFixed(1);
  const energy = Math.round(user.energy || 0);
  const scoreCaps = settings.scoreCaps || {};
  const energyCap = Math.max(1, Math.round(Number(scoreCaps.energy) || 100));
  const capsEnabled = settings.enableScoreCaps !== false;
  const fire = user.fire || user.streak || 0;
  const verificationRate = (stats.totalVerifications || 0) > 0
    ? Math.round(((stats.goodVerifications || 0) / stats.totalVerifications) * 100)
    : 0;
  const activeSubjects = data?.subjects || [];
  const recentSessions = Array.isArray(stats.recentSessions) ? stats.recentSessions : [];
  const selectedClass = user.selectedClass || settings.selectedClass || 'Terminale';
  const cloudSessionUser = adminStatus?.isUserSessionActive ? (cloudStatus?.sessionUser || null) : null;
  const isAdminSessionActive = Boolean(adminStatus?.isAdminSessionActive);
  const isGoogleAuthAvailable = Boolean(cloudStatus?.configured);
  const isGoogleSignedIn = Boolean(cloudSessionUser?.id);
  const googleDisplayName = (
    cloudSessionUser?.user_metadata?.full_name
    || cloudSessionUser?.user_metadata?.name
    || 'Compte Google'
  ).toString();
  const googleEmail = (cloudSessionUser?.email || '').toString();
  const googleAvatar = (
    cloudSessionUser?.user_metadata?.avatar_url
    || cloudSessionUser?.user_metadata?.picture
    || ''
  ).toString();

  const runCloudAction = async (action, successMessage) => {
    playClick();
    setCloudActionLoading(true);
    try {
      await action();
      if (successMessage) showToast(successMessage, 'success');
    } catch (error) {
      showToast(error?.message || 'Connexion Google impossible', 'error');
    } finally {
      setCloudActionLoading(false);
    }
  };

  const timingComparisons = useMemo(() => recentSessions.slice(0, 12).map((session, index, entries) => {
    const previousComparable = entries.slice(index + 1).find((candidate) => (
      String(candidate?.subjectId || '') === String(session?.subjectId || '')
      && String(candidate?.sessionKind || '') === String(session?.sessionKind || '')
      && String(candidate?.flowType || '') === String(session?.flowType || '')
    ));
    const previousChapterComparable = entries.slice(index + 1).find((candidate) => (
      String(candidate?.subjectId || '') === String(session?.subjectId || '')
      && String(candidate?.title || '') === String(session?.title || '')
    ));
    const deltaQuestionSeconds = previousComparable
      ? (Number(session?.averageQuestionSeconds) || 0) - (Number(previousComparable?.averageQuestionSeconds) || 0)
      : null;
    const deltaStepSeconds = previousComparable
      ? (Number(session?.averageStepSeconds) || 0) - (Number(previousComparable?.averageStepSeconds) || 0)
      : null;
    const deltaRefreshSeconds = previousComparable
      ? (Number(session?.averageRefreshSeconds) || 0) - (Number(previousComparable?.averageRefreshSeconds) || 0)
      : null;
    const deltaSessionSeconds = previousComparable
      ? (Number(session?.timeSpentSeconds) || 0) - (Number(previousComparable?.timeSpentSeconds) || 0)
      : null;
    const deltaChapterQuestionSeconds = previousChapterComparable
      ? (Number(session?.averageQuestionSeconds) || 0) - (Number(previousChapterComparable?.averageQuestionSeconds) || 0)
      : null;
    return {
      ...session,
      previousComparable,
      previousChapterComparable,
      deltaQuestionSeconds,
      deltaStepSeconds,
      deltaRefreshSeconds,
      deltaSessionSeconds,
      deltaChapterQuestionSeconds,
    };
  }), [recentSessions]);
  const latestTimingSession = timingComparisons[0] || null;

  const subjectCards = activeSubjects
    .map(subject => ({
      ...subject,
      performance: stats.subjectPerformance?.[String(subject.id)] || null,
    }))
    .filter(subject => subject.performance?.sessions);

  const badges = BADGE_DEFINITIONS.map((badge) => ({
    ...badge,
    earned: (user.badges || []).includes(badge.id),
    Icon: BADGE_ICON_MAP[badge.id] || Award,
  }));

  const combinedHistory = useMemo(() => {
    const recent = recentSessions || [];
    const legacy = Array.isArray(user.history) ? user.history : [];
    const merged = [];
    const seen = new Set();
    const pushEntry = (entry, index, source) => {
      if (!entry) return;
      const key = `${entry.title || entry.chapter || 'session'}-${entry.recordedAt || entry.date || ''}-${index}-${source}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ ...entry, __source: source, __key: key });
    };
    recent.forEach((session, index) => pushEntry(session, index, 'recent'));
    legacy.forEach((entry, index) => pushEntry({
      title: entry.chapter,
      subjectName: entry.subjectName,
      subjectCoefficient: entry.subjectCoefficient,
      scoreScale: entry.noteScale ? Number((entry.noteScale || '').toString().split('/')[1]) : 100,
      displayScore: entry.noteScale ? Number((entry.noteScale || '').toString().split('/')[0]) : null,
      average20: entry.average20 ?? (entry.score ? Number((entry.score || '').toString().split('/')[0]) : null),
      xpDelta: entry.xp,
      creditsDelta: entry.credits,
      energyDelta: entry.energy,
      fireDelta: entry.fire,
      verifyCount: entry.verifyCount,
      goodVerifications: entry.goodVerifications,
      badVerifications: entry.badVerifications,
      hintsUsed: entry.hintsUsed,
      timeSpentSeconds: entry.timeSpentSeconds,
      averageQuestionSeconds: entry.averageQuestionSeconds,
      timeLimitSeconds: entry.timeLimitSeconds,
      recordedAt: entry.date,
      sessionKind: entry.type,
    }, index, 'legacy'));
    return merged.slice(0, 40);
  }, [recentSessions, user.history]);

  const startEditName = () => {
    setNameVal(user.profileName || '');
    setEditingName(true);
  };

  const saveName = async () => {
    if (!nameVal.trim()) return;
    playClick();
    await updateProfile({ profileName: nameVal.trim() });
    setEditingName(false);
    showToast('Nom mis à jour', 'success');
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
      await updateProfile({ avatar });
      showToast('Avatar mis à jour', 'success');
    } catch (error) {
      showToast('Impossible de charger l’image', 'error');
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const toggleSound = async () => {
    playClick();
    await save({ ...data, settings: { ...settings, uiSoundEnabled: !settings.uiSoundEnabled } });
  };

  const changeClass = async (cls) => {
    playClick();
    await changeSelectedClass(cls);
    showToast(`Classe: ${cls}`, 'success');
  };

  const resetProgress = async () => {
    playClick();
    const defaults = createDefaultData();
    await save({
      ...data,
      user: {
        ...defaults.user,
        selectedClass: settings.selectedClass || defaults.user.selectedClass,
      },
    });
    setShowReset(false);
    playSpecial('whoosh');
    showToast('Progression réinitialisée', 'info');
  };

  const buyItem = async (itemId) => {
    playClick();
    await purchaseItem(itemId);
  };

  const updateSettings = async (partialSettings) => {
    await save({
      ...data,
      settings: {
        ...settings,
        ...partialSettings,
      },
    });
  };

  const handleGoogleSignIn = async () => {
    await runCloudAction(async () => {
      await signInActiveProfileWithGoogle();
    });
  };

  const handleGoogleSignOut = async () => {
    await runCloudAction(async () => {
      await signOutActiveProfileCloud();
    }, 'Compte Google déconnecté');
  };

  const toggleScoreCaps = async () => {
    playClick();
    await updateSettings({ enableScoreCaps: !capsEnabled });
  };

  const adjustScoreCap = async (key, delta) => {
    playClick();
    const current = Math.max(1, Math.round(Number(scoreCaps?.[key]) || 1));
    const nextValue = Math.max(1, current + delta);
    await updateSettings({
      scoreCaps: {
        ...scoreCaps,
        [key]: nextValue,
      },
    });
  };

  const adjustSubjectTranslationCost = async (subjectId, delta) => {
    const nextSubjects = activeSubjects.map((subject) => {
      if (String(subject.id) !== String(subjectId)) return subject;
      const currentCost = Math.max(1, Math.round(Number(subject.translationSettings?.energyCost) || 4));
      const nextCost = Math.max(1, currentCost + delta);
      return {
        ...subject,
        translationSettings: {
          ...subject.translationSettings,
          energyCost: nextCost,
          optionEnergyCost: Math.max(1, Math.floor(nextCost / 2)),
          hintPackCost: Math.max(1, Math.round(Number(subject.translationSettings?.hintPackCost) || 1)),
        },
      };
    });
    playClick();
    await save({
      ...data,
      subjects: nextSubjects,
      classContent: {
        ...(data?.classContent || {}),
        [selectedClass]: nextSubjects,
      },
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-extrabold">Profil</h1>
      </header>

      <main className="flex-1 px-4 py-3 pb-28 space-y-4">
        {/* ═══════ Zone rapide (hors onglets) ═══════ */}
        <div className="bg-white rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center shadow-gold overflow-hidden active:scale-95 transition-transform"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt="Avatar profil" className="w-full h-full object-cover" />
                ) : (
                  <User size={32} className="text-white" />
                )}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-white border border-primary/15 shadow-sm flex items-center justify-center text-primary active:scale-90"
              >
                <Upload size={14} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="flex-1">
              {editingName ? (
                <div className="flex gap-2">
                  <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveName(); }}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-bg border border-primary/20 text-sm font-semibold focus:outline-none focus:border-primary/50" />
                  <button onClick={saveName} className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white active:scale-90">
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="font-extrabold text-lg">{user.profileName || 'Élève BacBooster'}</h2>
                  <button onClick={startEditName} className="text-txt-muted active:text-primary transition-colors">
                    <Edit3 size={14} />
                  </button>
                </div>
              )}
              <p className="text-xs text-txt-sub mt-0.5">{user.selectedClass || 'Terminale'} · Niveau {level}</p>
              <p className="text-[11px] text-txt-muted mt-1">{isUploadingAvatar ? 'Chargement avatar…' : 'PNG / JPG acceptés'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="text-center p-2.5 rounded-xl bg-accent-blue/5">
              <Trophy size={18} className="text-accent-blue mx-auto mb-1" />
              <p className="font-extrabold text-sm text-accent-blue">{averageScore}</p>
              <p className="text-[10px] text-txt-muted">Moyenne /20</p>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-amber-50">
              <BatteryCharging size={18} className="text-amber-700 mx-auto mb-1" />
              <p className="font-extrabold text-sm text-amber-700">{energy}/{energyCap}</p>
              <p className="text-[10px] text-txt-muted">Énergie</p>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-accent-green/5">
              <Coins size={18} className="text-accent-green mx-auto mb-1" />
              <p className="font-extrabold text-sm text-accent-green">{user.credits || 0}</p>
              <p className="text-[10px] text-txt-muted">Crédits</p>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-accent-red/5">
              <Flame size={18} className="text-accent-red mx-auto mb-1" />
              <p className="font-extrabold text-sm text-accent-red">{fire}</p>
              <p className="text-[10px] text-txt-muted">Feu</p>
            </div>
            <div className="text-center p-2.5 rounded-xl bg-primary/5 sm:col-span-4">
              <Zap size={18} className="text-primary mx-auto mb-1" />
              <p className="font-extrabold text-sm text-primary-dark">{user.xp || 0}</p>
              <p className="text-[10px] text-txt-muted">XP Total</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-[11px] font-semibold text-txt-sub mb-1">
              <span>Niveau {level}</span>
              <span>{xpInLevel}/500 XP</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-700"
                style={{ width: `${(xpInLevel / 500) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Classe – accès rapide hors onglets */}
        <div className="bg-white rounded-2xl p-4 shadow-card">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <GraduationCap size={16} className="text-accent-blue" /> Classe active
          </h3>
          <div className="flex flex-wrap gap-2">
            {availableClasses.map(cls => (
              <button key={cls} onClick={() => changeClass(cls)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                  (user.selectedClass || 'Terminale') === cls
                    ? 'bg-primary text-white shadow-gold'
                    : 'bg-gray-100 text-txt-sub'
                }`}>{cls}</button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Identité élève simplifiée</h3>
              <p className="text-[11px] text-txt-muted">L’écran élève suit maintenant le compte Google connecté. La gestion multi-profils locale n’est plus affichée ici.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
            <p className="text-xs font-semibold text-primary-dark">Profil affiché</p>
            <p className="text-sm font-extrabold mt-1">{user.profileName || googleDisplayName || 'Élève'}</p>
            <p className="text-[11px] text-txt-muted mt-1">{isGoogleSignedIn ? 'Les données se calent sur ce compte Google.' : 'Sans connexion Google, tu restes sur le profil local courant.'}</p>
          </div>

          <div className="rounded-2xl border border-gray-100 p-3 space-y-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <GoogleIcon size={24} />
              </div>
              <div>
                <p className="text-sm font-extrabold">Compte Google</p>
                <p className="text-[11px] text-txt-muted">Connexion Google simple pour ce profil, comme sur un site classique.</p>
              </div>
            </div>

            <div className={`rounded-2xl px-3 py-3 border ${isGoogleSignedIn ? 'bg-accent-green/5 border-accent-green/15' : 'bg-gray-50 border-gray-100'}`}>
              {isGoogleSignedIn ? (
                <div className="flex items-center gap-3">
                  {googleAvatar ? (
                    <img src={googleAvatar} alt={googleDisplayName} className="w-12 h-12 rounded-full object-cover border border-white shadow-sm" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-txt-sub shadow-sm">
                      <User size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-primary-dark truncate">{googleDisplayName}</p>
                    <p className="text-xs text-txt-muted truncate">{googleEmail || 'Compte Google connecté'}</p>
                    <p className="text-[11px] font-semibold text-accent-green mt-1">Connecté</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-extrabold text-primary-dark">Aucun compte Google connecté</p>
                  <p className="text-xs text-txt-muted">Connecte-toi avec Google pour retrouver ton compte dans l’app.</p>
                </div>
              )}
            </div>

            {isAdminSessionActive ? (
              <p className="text-[11px] font-semibold text-accent-red">Déconnecte d’abord le compte admin avant de connecter un élève.</p>
            ) : null}

            {cloudStatus?.error && !isGoogleSignedIn ? (
              <p className="text-[11px] font-semibold text-accent-red">{cloudStatus.error}</p>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleGoogleSignIn}
                disabled={cloudActionLoading || cloudStatus?.busy || !isGoogleAuthAvailable || isAdminSessionActive}
                className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-extrabold text-primary-dark disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 inline-flex items-center justify-center gap-2"
              >
                <GoogleIcon size={16} />
                {isGoogleSignedIn ? 'Changer de compte Google' : 'Continuer avec Google'}
              </button>
              <button
                onClick={handleGoogleSignOut}
                disabled={cloudActionLoading || cloudStatus?.busy || !isGoogleAuthAvailable || !isGoogleSignedIn}
                className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>

        {/* ═══════ Barre d'onglets ═══════ */}
        <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-3 bg-bg border-b border-gray-200 shadow-sm">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {TABS.map((tab) => {
              const TIcon = tab.Icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { playClick(); setActiveTab(tab.id); }}
                  className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${
                    active
                      ? 'bg-primary text-white shadow-gold'
                      : 'bg-white text-txt-sub border border-gray-200 hover:text-primary-dark'
                  }`}
                >
                  <TIcon size={14} /> {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════ Onglet Progression ═══════ */}
        {activeTab === 'progression' && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-card">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Target size={16} className="text-accent-blue" /> Progression détaillée
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCell color="accent-blue" title="Sessions" value={stats.sessionsCompleted || 0}
                  subtitle={`Parfaites : ${stats.perfectSessions || 0}`} />
                <StatCell color="primary" title="Vérifications" value={`${verificationRate}%`}
                  subtitle={`${stats.goodVerifications || 0} bonnes / ${stats.badVerifications || 0} mauvaises`} />
                <StatCell color="accent-green" title="Temps total" value={formatDuration(stats.timeStudiedSeconds || 0)}
                  subtitle={`Indices utilisés : ${stats.totalHintsUsed || 0}`} />
                <StatCell color="accent-red" title="Feu maximal" value={stats.bestFire || fire}
                  subtitle={`Rythme moyen : ${formatPace(stats.averageQuestionSeconds || 0)} / question`} />
                <div className="col-span-2 rounded-2xl bg-primary/5 border border-primary/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Meilleure moyenne</p>
                  <p className="text-lg font-extrabold text-primary-dark">{Number(stats.bestAverageScore || 0).toFixed(1)}/20</p>
                  <p className="text-[11px] text-txt-muted mt-1">Questions résolues : {stats.totalQuestionsCompleted || 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <BookOpen size={16} className="text-primary" /> Notes par matière
              </h3>
              {subjectCards.length === 0 ? (
                <p className="text-sm text-txt-sub">Aucune note de matière enregistrée pour le moment.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {subjectCards.map(subject => (
                    <div key={subject.id} className="rounded-2xl border border-gray-100 p-3" style={{ backgroundColor: `${subject.color}10` }}>
                      <p className="text-xs font-extrabold" style={{ color: subject.color }}>{subject.name}</p>
                      <p className="text-lg font-extrabold mt-1">{Number(subject.performance.average || 0).toFixed(1)}/20</p>
                      <p className="text-[11px] text-txt-muted mt-1">Dernière : {Number(subject.performance.lastScore || 0).toFixed(1)}/20 · Meilleure : {Number(subject.performance.best || 0).toFixed(1)}/20</p>
                      <p className="text-[10px] text-txt-muted mt-1">Coeff. {subject.coefficient || 1} · {subject.performance.sessions || 0} session(s)</p>
                      <p className="text-[10px] text-txt-muted mt-1">Rythme moyen : {formatPace(subject.performance.averageQuestionSeconds || 0)} / question</p>
                      <p className="text-[10px] text-txt-muted mt-1">Meilleure vitesse : {formatPace(subject.performance.bestQuestionSeconds || 0)} / question</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Gauge size={16} className="text-accent-purple" /> Progression des temps
              </h3>
              {latestTimingSession ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-primary/5 border border-primary/10 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Dernier rythme</p>
                      <p className="text-lg font-extrabold text-primary-dark">{formatPace(latestTimingSession.averageQuestionSeconds || 0)} / question</p>
                      <p className="text-[11px] text-txt-muted mt-1">{latestTimingSession.deltaQuestionSeconds == null ? 'Première mesure comparable' : `Écart : ${formatPaceDelta(latestTimingSession.deltaQuestionSeconds)} par question`}</p>
                    </div>
                    <div className="rounded-2xl bg-accent-green/5 border border-accent-green/10 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Dernière session</p>
                      <p className="text-lg font-extrabold text-accent-green">{formatDuration(latestTimingSession.timeSpentSeconds || 0)}</p>
                      <p className="text-[11px] text-txt-muted mt-1">{latestTimingSession.subjectName || 'Session libre'} · coeff. {latestTimingSession.subjectCoefficient || 1}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {timingComparisons.slice(0, 8).map((session, index) => (
                      <div key={`${session.title || 'session'}-${index}`} className="rounded-2xl border border-gray-100 px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-extrabold">{renderMixedContent(session.title || 'Session')}</p>
                            <p className="text-[11px] text-txt-muted mt-1">{session.subjectName || 'Session libre'} · {session.sessionKind === 'exercise-flow' ? 'Traitement guidé' : 'Quiz'}{session.flowType ? ` · ${session.flowType}` : ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-extrabold text-primary-dark">{formatPace(session.averageQuestionSeconds || 0)} / question</p>
                            <p className={`text-[10px] font-bold ${session.deltaQuestionSeconds == null ? 'text-txt-muted' : session.deltaQuestionSeconds <= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                              {session.deltaQuestionSeconds == null ? 'Référence initiale' : `${formatPaceDelta(session.deltaQuestionSeconds)} par question`}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <DeltaCell label="Étape" value={formatPace(session.averageStepSeconds || 0)} delta={session.deltaStepSeconds} color="primary-dark" bg="primary/5" />
                          <DeltaCell label="Rafraîchissement" value={formatPace(session.averageRefreshSeconds || 0)} delta={session.deltaRefreshSeconds} color="accent-blue" bg="accent-blue/5" />
                          <DeltaCell label="Session" value={formatDuration(session.timeSpentSeconds || 0)} delta={session.deltaSessionSeconds} color="accent-green" bg="accent-green/5" />
                          <DeltaCell label="Chapitre" value={`${formatPace(session.averageQuestionSeconds || 0)} / q.`} delta={session.deltaChapterQuestionSeconds} color="accent-purple" bg="accent-purple/5" emptyLabel="Nouveau chapitre" />
                        </div>
                        <p className="text-[11px] text-txt-muted">Vérifs : {session.goodVerifications || 0}/{session.verifyCount || 0} · Coeff. {session.subjectCoefficient || 1}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-txt-sub">Les comparaisons de temps apparaîtront après quelques sessions enregistrées.</p>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Award size={16} className="text-primary" /> Badges
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {badges.map(b => {
                  const BIcon = b.Icon;
                  return (
                    <div key={b.id} className={`p-3 rounded-2xl border transition-all ${b.earned ? 'bg-primary/5 border-primary/15' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${b.earned ? 'bg-white text-primary shadow-sm' : 'bg-white text-txt-muted'}`}>
                          <BIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs font-extrabold leading-tight">{b.label}</p>
                          <p className="text-[10px] text-txt-muted mt-1 leading-relaxed">{b.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ═══════ Onglet Historique ═══════ */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Calendar size={16} className="text-accent-green" /> Historique détaillé
              <span className="text-[10px] text-txt-muted font-normal">({combinedHistory.length})</span>
            </h3>
            {combinedHistory.length === 0 ? (
              <p className="text-sm text-txt-sub">Aucune session terminée pour l’instant.</p>
            ) : (
              <div className="space-y-2">
                {combinedHistory.map((h, idx) => {
                  const expanded = expandedSessionIndex === idx;
                  const questionTimes = Array.isArray(h.questionTimes) ? h.questionTimes : [];
                  const pageTimes = Array.isArray(h.pageTimes) ? h.pageTimes : [];
                  const stepTimes = Array.isArray(h.stepTimes) ? h.stepTimes : [];
                  const refreshTimes = Array.isArray(h.refreshTimes) ? h.refreshTimes : [];
                  return (
                    <div key={h.__key || idx} className="rounded-2xl border border-gray-100 px-4 py-3 space-y-2">
                      <button onClick={() => setExpandedSessionIndex(expanded ? null : idx)} className="w-full text-left">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-extrabold">{renderMixedContent(h.title || h.chapter || 'Session')}</p>
                            <p className="text-[11px] text-txt-muted mt-1">
                              {h.subjectName || 'Session libre'}{h.sessionKind ? ` · ${h.sessionKind === 'exercise-flow' ? 'Traitement guidé' : h.sessionKind}` : ''}{h.flowType ? ` · ${h.flowType}` : ''}
                              {formatRecordedDate(h.recordedAt) ? ` · ${formatRecordedDate(h.recordedAt)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-lg bg-accent-blue/10 text-accent-blue text-[11px] font-bold">
                              {h.average20 != null ? `${Number(h.average20).toFixed(1)}/20` : (h.score || '—')}
                            </span>
                            <ChevronRight size={14} className={`text-txt-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          </div>
                        </div>
                      </button>
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        {h.displayScore != null && h.scoreScale != null && (
                          <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary-dark font-bold">Session {h.displayScore}/{h.scoreScale}</span>
                        )}
                        {h.subjectCoefficient ? <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary-dark font-bold">Coeff. {h.subjectCoefficient}</span> : null}
                        <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary-dark font-bold">XP {h.xpDelta >= 0 ? '+' : ''}{h.xpDelta || 0}</span>
                        <span className="px-2 py-1 rounded-lg bg-accent-green/10 text-accent-green font-bold">Crédits {h.creditsDelta >= 0 ? '+' : ''}{h.creditsDelta || 0}</span>
                        <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 font-bold">Énergie {h.energyDelta >= 0 ? '+' : ''}{h.energyDelta || 0}</span>
                        <span className="px-2 py-1 rounded-lg bg-accent-red/10 text-accent-red font-bold">Feu {h.fireDelta >= 0 ? '+' : ''}{h.fireDelta || 0}</span>
                      </div>
                      <p className="text-[11px] text-txt-muted">
                        Vérifs : {h.goodVerifications || 0}/{h.verifyCount || 0} · Indices : {h.hintsUsed || 0} · Temps : {formatDuration(h.timeSpentSeconds || 0)}
                        {h.timeLimitSeconds ? ` / ${formatDuration(h.timeLimitSeconds)}` : ''} · Rythme : {formatPace(h.averageQuestionSeconds || 0)} par question
                      </p>

                      {expanded && (
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                          {pageTimes.length > 0 && (
                            <SectionList title="Temps par page" icon={<Timer size={14} className="text-primary" />}>
                              {pageTimes.map(entry => (
                                <li key={`page-${entry.id}`} className="flex justify-between text-[11px] py-1">
                                  <span className="font-bold">{entry.label}</span>
                                  <span className="text-txt-muted">{formatDuration(entry.seconds)}{entry.targetSeconds ? ` / cible ${formatDuration(entry.targetSeconds)}` : ''}</span>
                                </li>
                              ))}
                            </SectionList>
                          )}
                          {questionTimes.length > 0 && (
                            <SectionList title="Temps par question" icon={<Timer size={14} className="text-accent-blue" />}>
                              {questionTimes.map((entry) => (
                                <li key={`q-${entry.questionIdx}`} className="py-1 text-[11px]">
                                  <div className="flex justify-between">
                                    <span className="font-bold">Q{entry.questionIdx + 1}</span>
                                    <span className="text-txt-muted">{formatDuration(entry.seconds)}{entry.targetSeconds ? ` / cible ${formatDuration(entry.targetSeconds)}` : ''}</span>
                                  </div>
                                  <div className="text-txt-muted line-clamp-2">{renderMixedContent(entry.title)}</div>
                                </li>
                              ))}
                            </SectionList>
                          )}
                          {stepTimes.length > 0 && (
                            <SectionList title="Temps par étape" icon={<Timer size={14} className="text-accent-purple" />}>
                              {stepTimes.map(entry => (
                                <li key={`step-${entry.id}`} className="py-1 text-[11px]">
                                  <div className="flex justify-between">
                                    <span className="font-bold">Q{entry.questionIdx + 1} · {entry.label}</span>
                                    <span className="text-txt-muted">{formatDuration(entry.seconds)}</span>
                                  </div>
                                  <div className="text-txt-muted line-clamp-2">{renderMixedContent(entry.title)}</div>
                                </li>
                              ))}
                            </SectionList>
                          )}
                          {refreshTimes.length > 0 && (
                            <SectionList title="Temps par rafraîchissement" icon={<Timer size={14} className="text-accent-red" />}>
                              {refreshTimes.map(entry => (
                                <li key={`rf-${entry.id}`} className="py-1 text-[11px]">
                                  <div className="flex justify-between">
                                    <span className="font-bold">Q{entry.questionIdx + 1} · {entry.label}</span>
                                    <span className="text-txt-muted">{formatDuration(entry.seconds)}</span>
                                  </div>
                                </li>
                              ))}
                            </SectionList>
                          )}
                          {(questionTimes.length === 0 && pageTimes.length === 0 && stepTimes.length === 0 && refreshTimes.length === 0) && (
                            <p className="text-[11px] text-txt-muted">Pas de détail chronométrique pour cette session (session ancienne ou mode sans mesure).</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════ Onglet Boutique / Inventaire / Réglages ═══════ */}
        {activeTab === 'shop' && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-card">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Sparkles size={16} className="text-accent-purple" /> Inventaire
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <InventoryCell label="Indices U." value={user.inventory?.hints || 0} />
                <InventoryCell label="Mineurs" value={user.inventory?.hintsMinor || 0} />
                <InventoryCell label="Majeurs" value={user.inventory?.hintsMajor || 0} />
                <InventoryCell label="Critiques" value={user.inventory?.hintsCritical || 0} />
                <InventoryCell label="Bonus temps" value={user.inventory?.timeBoosts || 0} />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <ShoppingBag size={16} className="text-accent-green" /> Boutique
                </h3>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-green/10 text-accent-green text-xs font-extrabold">
                  <Coins size={14} /> {user.credits || 0}
                </div>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-primary/5 px-3 py-2.5">
                <p className="text-[11px] font-bold text-primary-dark">Promos du moment</p>
                <p className="text-[10px] text-txt-muted mt-1">Les traductions utilisent 1 pack d’indice universel ou l’énergie définie par matière.</p>
              </div>
              {SHOP_ITEMS.map(item => (
                <div key={item.id} className="rounded-2xl border border-gray-100 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold">{item.label}</p>
                    {item.promoLabel ? <p className="text-[10px] font-extrabold uppercase tracking-wider text-primary mt-1">{item.promoLabel}</p> : null}
                    <p className="text-[11px] text-txt-muted mt-1">{item.description}</p>
                    <p className="text-[10px] text-txt-muted mt-1">+{item.quantity} dans l’inventaire</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {item.compareAtPrice ? <span className="text-[10px] text-txt-muted line-through">{item.compareAtPrice} crédits</span> : null}
                    <button
                      onClick={() => buyItem(item.id)}
                      className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-extrabold shadow-gold active:scale-95 transition-transform disabled:opacity-50 disabled:shadow-none"
                      disabled={(user.credits || 0) < item.price}
                    >
                      {item.price} crédits
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Volume2 size={16} className="text-accent-purple" /> Réglages
              </h3>
              <button onClick={toggleSound} className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 active:bg-gray-100 transition-colors">
                <div className="flex items-center gap-2">
                  {settings.uiSoundEnabled !== false ? <Volume2 size={16} className="text-accent-purple" /> : <VolumeX size={16} className="text-txt-muted" />}
                  <span className="text-sm font-semibold">Sons UI</span>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors relative ${settings.uiSoundEnabled !== false ? 'bg-primary' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.uiSoundEnabled !== false ? 'translate-x-4.5 left-[1px]' : 'left-[2px]'}`}
                    style={{ transform: settings.uiSoundEnabled !== false ? 'translateX(17px)' : 'translateX(0)' }} />
                </div>
              </button>

              <div className="rounded-2xl border border-gray-100 p-3 space-y-3">
                <button onClick={toggleScoreCaps} className="w-full flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-3 active:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-primary-dark" />
                    <div className="text-left">
                      <p className="text-sm font-semibold">Plafonds des scores</p>
                      <p className="text-[10px] text-txt-muted">Si désactivé, seul le plafond énergie reste appliqué.</p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full transition-colors relative ${capsEnabled ? 'bg-primary' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${capsEnabled ? 'translate-x-4.5 left-[1px]' : 'left-[2px]'}`}
                      style={{ transform: capsEnabled ? 'translateX(17px)' : 'translateX(0)' }} />
                  </div>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { key: 'energy', label: 'Énergie', alwaysOn: true },
                    { key: 'credits', label: 'Crédits' },
                    { key: 'globalScore', label: 'Score' },
                    { key: 'fire', label: 'Feu' },
                    { key: 'stars', label: 'Étoiles' },
                  ].map((entry) => {
                    const locked = !capsEnabled && !entry.alwaysOn;
                    const value = Math.max(1, Math.round(Number(scoreCaps?.[entry.key]) || 1));
                    return (
                      <div key={entry.key} className={`rounded-xl border px-3 py-2 ${locked ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-primary/10 bg-primary/5'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-primary-dark">{entry.label}</p>
                            <p className="text-[10px] text-txt-muted">Max {value}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => adjustScoreCap(entry.key, -1)} disabled={locked} className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-sm font-extrabold active:scale-95 disabled:opacity-40">-</button>
                            <button onClick={() => adjustScoreCap(entry.key, 1)} disabled={locked} className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-sm font-extrabold active:scale-95 disabled:opacity-40">+</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Coût de traduction par matière</p>
                    <p className="text-[10px] text-txt-muted">Chaque traduction coûte toujours 1 pack d’indice universel. L’énergie est le secours par matière.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {activeSubjects.map((subject) => {
                    const questionCost = Math.max(1, Math.round(Number(subject.translationSettings?.energyCost) || 4));
                    const optionCost = Math.max(1, Math.round(Number(subject.translationSettings?.optionEnergyCost) || Math.floor(questionCost / 2) || 1));
                    return (
                      <div key={subject.id} className="rounded-xl border border-gray-100 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-extrabold" style={{ color: subject.color }}>{subject.name}</p>
                            <p className="text-[10px] text-txt-muted mt-1">Question: 1 pack ou {questionCost} énergie · Choix/étape: 1 pack ou {optionCost} énergie</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => adjustSubjectTranslationCost(subject.id, -1)} className="w-8 h-8 rounded-lg bg-gray-100 text-sm font-extrabold active:scale-95">-</button>
                            <span className="min-w-10 text-center text-sm font-extrabold text-primary-dark">{questionCost}</span>
                            <button onClick={() => adjustSubjectTranslationCost(subject.id, 1)} className="w-8 h-8 rounded-lg bg-primary text-white text-sm font-extrabold active:scale-95">+</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════ Onglet Aide ═══════ */}
        {activeTab === 'help' && <HelpTab />}

        {/* Footer hors onglets */}
        <button onClick={() => setShowReset(true)}
          className="w-full py-3 rounded-xl bg-accent-red/5 border border-accent-red/15 text-accent-red text-sm font-bold active:scale-[0.98] transition-transform">
          <RotateCcw size={14} className="inline mr-1.5" /> Réinitialiser ma progression
        </button>
      </main>

      {showReset && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowReset(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-2">Réinitialiser ?</h3>
            <p className="text-sm text-txt-sub mb-4">Cela effacera tes XP, moyenne, énergie, combo feu, crédits, inventaire, badges et historique. Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowReset(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-sm font-bold active:scale-95">Annuler</button>
              <button onClick={resetProgress} className="flex-1 py-2.5 rounded-xl bg-accent-red text-white text-sm font-bold active:scale-95">Réinitialiser</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════ Sous-composants ════════ */

const STAT_CELL_STYLES = {
  'accent-blue': 'rounded-2xl bg-accent-blue/5 border border-accent-blue/10 p-3',
  primary: 'rounded-2xl bg-primary/5 border border-primary/10 p-3',
  'accent-green': 'rounded-2xl bg-accent-green/5 border border-accent-green/10 p-3',
  'accent-red': 'rounded-2xl bg-accent-red/5 border border-accent-red/10 p-3',
};
const STAT_TEXT_STYLES = {
  'accent-blue': 'text-lg font-extrabold text-accent-blue',
  primary: 'text-lg font-extrabold text-primary-dark',
  'accent-green': 'text-lg font-extrabold text-accent-green',
  'accent-red': 'text-lg font-extrabold text-accent-red',
};

function StatCell({ color, title, value, subtitle }) {
  return (
    <div className={STAT_CELL_STYLES[color] || STAT_CELL_STYLES.primary}>
      <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">{title}</p>
      <p className={STAT_TEXT_STYLES[color] || STAT_TEXT_STYLES.primary}>{value}</p>
      {subtitle && <p className="text-[11px] text-txt-muted mt-1">{subtitle}</p>}
    </div>
  );
}

const DELTA_BG_STYLES = {
  'primary/5': 'rounded-xl bg-primary/5 px-2 py-1.5',
  'accent-blue/5': 'rounded-xl bg-accent-blue/5 px-2 py-1.5',
  'accent-green/5': 'rounded-xl bg-accent-green/5 px-2 py-1.5',
  'accent-purple/5': 'rounded-xl bg-accent-purple/5 px-2 py-1.5',
};
const DELTA_TEXT_STYLES = {
  'primary-dark': 'font-extrabold text-primary-dark',
  'accent-blue': 'font-extrabold text-accent-blue',
  'accent-green': 'font-extrabold text-accent-green',
  'accent-purple': 'font-extrabold text-accent-purple',
};

function DeltaCell({ label, value, delta, color, bg, emptyLabel }) {
  return (
    <div className={DELTA_BG_STYLES[bg] || DELTA_BG_STYLES['primary/5']}>
      <p className="text-txt-muted">{label}</p>
      <p className={DELTA_TEXT_STYLES[color] || DELTA_TEXT_STYLES['primary-dark']}>{value}</p>
      <p className={`${delta == null ? 'text-txt-muted' : delta <= 0 ? 'text-accent-green' : 'text-accent-red'} font-bold`}>
        {delta == null ? (emptyLabel || '—') : formatPaceDelta(delta)}
      </p>
    </div>
  );
}

function InventoryCell({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <p className="text-lg font-extrabold text-primary-dark">{value}</p>
      <p className="text-[10px] text-txt-muted">{label}</p>
    </div>
  );
}

function SectionList({ title, icon, children }) {
  return (
    <div>
      <p className="text-[11px] font-extrabold flex items-center gap-1.5 mb-1 text-txt-sub">
        {icon} {title}
      </p>
      <ul className="rounded-xl bg-gray-50 px-3 py-2 divide-y divide-gray-100">{children}</ul>
    </div>
  );
}

/* ════════ Onglet Aide ════════ */

function HelpTab() {
  return (
    <div className="space-y-3">
      <HelpCard
        title="Comment fonctionne la note ?"
        icon={<Trophy size={16} className="text-accent-blue" />}
        color="accent-blue"
      >
        <p><strong>Moyenne globale /20</strong> : calculée à partir du pourcentage de bonnes réponses, puis corrigée par des bonus/malus (rythme, vérifications, indices, dépassement de délai).</p>
        <p><strong>Note session</strong> : affichée sur 80 ou 100 selon les réglages. C’est l’équivalent « score absolu » d’une session.</p>
        <p><strong>Coefficient matière</strong> : multiplie le poids de la session dans ta moyenne (réglable en admin, jusqu’à ×60 pour les matières bac à fort coefficient).</p>
        <p><strong>Étoiles</strong> : 1 étoile dès 50%, 2 dès 70%, 3 dès 85%.</p>
      </HelpCard>

      <HelpCard
        title="Énergie — gagnée et perdue"
        icon={<BatteryCharging size={16} className="text-amber-700" />}
        color="amber-500"
      >
        <p><strong>+ Énergie</strong> : tu en gagnes lorsque tu termines une session <em>avant</em> le délai prévu, et lorsque ton rythme par question est rapide.</p>
        <p><strong>− Énergie</strong> : chaque vérification pendant le traitement coûte un peu d’énergie, et tu en perds davantage si tu dépasses le délai ou multiplies les mauvaises vérifications.</p>
        <p>L’énergie est une <strong>quantité</strong> avec un <strong>plafond maximum</strong> réglable dans le profil. Ce plafond reste toujours actif.</p>
      </HelpCard>

      <HelpCard
        title="Crédits et boutique"
        icon={<Coins size={16} className="text-accent-green" />}
        color="accent-green"
      >
        <p>Tu gagnes des crédits selon ta note :</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>≥ 10/20 : <strong>+3 crédits</strong></li>
          <li>≥ 12/20 : <strong>+6 crédits</strong></li>
          <li>≥ 15/20 : <strong>+10 crédits</strong></li>
          <li>≥ 17/20 : <strong>+14 crédits</strong></li>
          <li>Session parfaite (0 indice, 0 mauvaise vérif, 100% correct) : <strong>+6 bonus</strong></li>
        </ul>
        <p>Les crédits servent à acheter des <strong>packs d’indices universels</strong>, des <strong>packs mineurs/majeurs/critiques</strong> ou des <strong>bonus temps</strong>. Les promos boutique restent proches des coûts réels en session pour éviter les écarts absurdes.</p>
      </HelpCard>

      <HelpCard
        title="Indices — niveaux et prix"
        icon={<LifeBuoy size={16} className="text-primary" />}
        color="primary"
      >
        <p>Les indices ont <strong>trois niveaux d’importance</strong> et s’affichent aussi en variantes <strong>Fun</strong>, <strong>Complet</strong> et <strong>Complexe</strong> :</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Mineur</strong> — orientation générale, coût faible</li>
          <li><strong>Majeur</strong> — méthode clé, coût moyen</li>
          <li><strong>Critique</strong> — solution partielle, coût élevé</li>
        </ul>
        <p>Et <strong>quatre natures</strong> : <em>concret</em>, <em>exemple</em>, <em>théorique</em>, <em>formule</em>. Les indices concrets sont moins chers que les formules théoriques.</p>
        <p>Tu peux payer un indice soit avec des <strong>crédits</strong>, soit avec tes <strong>packs d’indice</strong> typés, avec fallback automatique sur le pack universel.</p>
        <p>Les traductions utilisent d’abord <strong>1 pack d’indice universel</strong>, puis basculent sur l’<strong>énergie</strong> si l’inventaire est vide. Le coût énergie dépend de la matière.</p>
        <p>Plus tu demandes d’indices, moins tu gagnes d’XP et de crédits — l’économie est équilibrée pour encourager l’effort.</p>
      </HelpCard>

      <HelpCard
        title="Chronomètres et délais"
        icon={<Timer size={16} className="text-accent-purple" />}
        color="accent-purple"
      >
        <p>Tous les chronomètres sont <strong>en mode montant</strong> (chrono). L’application mesure précisément :</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>le temps sur la <strong>page énoncé</strong></li>
          <li>le temps sur la <strong>page brouillon</strong></li>
          <li>le temps sur la <strong>page traitement</strong> (global)</li>
          <li>le temps par <strong>question</strong></li>
          <li>le temps par <strong>étape</strong> de question</li>
          <li>le temps entre chaque <strong>rafraîchissement</strong></li>
        </ul>
        <p>Les cibles (<em>délais par défaut</em>) se règlent par matière dans l’admin, ou au cas par cas dans le JSON de chaque exercice/quiz.</p>
      </HelpCard>

      <HelpCard
        title="Feu (combo)"
        icon={<Flame size={16} className="text-accent-red" />}
        color="accent-red"
      >
        <p>Le <strong>feu</strong> monte quand tu enchaînes de bonnes vérifications sans erreur, et retombe à chaque mauvaise vérification.</p>
        <p>Il est multiplié par le <strong>coefficient matière</strong>. Une matière à coeff. élevé fait grimper le combo plus vite.</p>
      </HelpCard>

      <HelpCard
        title="5 modes de quiz"
        icon={<ShieldCheck size={16} className="text-primary-dark" />}
        color="primary-dark"
      >
        <p><strong>Suggestion</strong> : QCM classique, 4 propositions, une seule juste.</p>
        <p><strong>Input Blocs</strong> : complète une phrase en choisissant le bon bloc parmi plusieurs.</p>
        <p><strong>Pièges</strong> : identifie les propositions fausses dans une liste (toujours au moins un piège vide).</p>
        <p><strong>Duel de l’Intrus</strong> : choisis le bloc sain et rejette l’intrus piégé.</p>
        <p><strong>Déminage</strong> : repère les blocs erronés d’une phrase pré-remplie, brise-les et remplace-les.</p>
      </HelpCard>

      <HelpCard
        title="Traitement guidé — verification & validation"
        icon={<AlertTriangle size={16} className="text-amber-600" />}
        color="amber-500"
      >
        <p><strong>Vérifier</strong> : chaque bloc correct s’entoure d’un <strong>halo vert</strong>, chaque bloc faux d’un <strong>halo rouge</strong>. Ces halos restent <em>définitivement</em> jusqu’à ce que tu supprimes ou remplaces le bloc.</p>
        <p><strong>Valider</strong> : l’étape entière passe en couleurs vives aléatoires (une par bloc). Les halos verify restent visibles par-dessus.</p>
        <p>Chaque vérification coûte un peu d’énergie. Chaque mauvaise vérification réduit ton feu et pénalise la note.</p>
      </HelpCard>

      <HelpCard
        title="Historique & comparaisons"
        icon={<History size={16} className="text-accent-green" />}
        color="accent-green"
      >
        <p>L’onglet <strong>Historique</strong> liste toutes tes sessions avec le détail chronométrique : pages, questions, étapes, rafraîchissements.</p>
        <p>L’onglet <strong>Progression</strong> montre l’évolution de ton rythme (par question, étape, session, chapitre) pour prouver que tu progresses.</p>
        <p>Les flèches <span className="text-accent-green font-bold">vertes</span> signalent une amélioration (plus rapide), les <span className="text-accent-red font-bold">rouges</span> un ralentissement.</p>
      </HelpCard>

      <HelpCard
        title="Anti-triche — équilibrage"
        icon={<ShieldCheck size={16} className="text-accent-red" />}
        color="accent-red"
      >
        <p>Pour garder l’expérience <strong>juste et réaliste</strong> :</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Les gains d’énergie et de crédits sont <strong>plafonnés</strong> par session.</li>
          <li>Une session remplie d’indices rapporte très peu d’XP et <strong>zéro crédit</strong>.</li>
          <li>Multiplier les mauvaises vérifications fait chuter le combo feu et pénalise la note.</li>
          <li>Le <strong>coefficient matière</strong> pondère la moyenne : tu ne peux pas booster ta moyenne avec une matière à faible coeff.</li>
          <li>Les <strong>cibles de délai</strong> servent de référence : aller plus vite est valorisé, mais bâcler fait chuter la note.</li>
        </ul>
      </HelpCard>
    </div>
  );
}

const HELP_BORDER_STYLES = {
  'accent-blue': 'bg-white rounded-2xl p-4 shadow-card border-l-4 border-accent-blue',
  'amber-500': 'bg-white rounded-2xl p-4 shadow-card border-l-4 border-amber-500',
  'accent-green': 'bg-white rounded-2xl p-4 shadow-card border-l-4 border-accent-green',
  primary: 'bg-white rounded-2xl p-4 shadow-card border-l-4 border-primary',
  'accent-purple': 'bg-white rounded-2xl p-4 shadow-card border-l-4 border-accent-purple',
  'accent-red': 'bg-white rounded-2xl p-4 shadow-card border-l-4 border-accent-red',
  'primary-dark': 'bg-white rounded-2xl p-4 shadow-card border-l-4 border-primary-dark',
};

function HelpCard({ title, icon, color, children }) {
  return (
    <div className={HELP_BORDER_STYLES[color] || HELP_BORDER_STYLES.primary}>
      <h3 className="font-bold text-sm mb-2 flex items-center gap-2">{icon} {title}</h3>
      <div className="text-[12px] text-txt-sub leading-relaxed space-y-2">{children}</div>
    </div>
  );
}
