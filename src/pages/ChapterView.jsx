import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getQuizModeQuestions, getQuizSessionTitle } from '../lib/quizModes';
import {
  countPlayableCompositeQuestions,
  countPlayableQuizModes,
  countPlayableQuizQuestions,
  hasPlayableCompositeContent,
  hasPlayableQuizContent,
} from '../lib/contentVisibility';
import {
  ArrowLeft, ChevronRight, BookOpen, Play, FileText, Brain,
  Zap, Calculator, Atom, Leaf, Globe, Map, Flag, Dumbbell,
  X, Type, AlertTriangle
} from 'lucide-react';

const ICON_MAP = {
  calculator: Calculator, atom: Atom, leaf: Leaf, 'book-open': BookOpen,
  globe: Globe, map: Map, flag: Flag, dumbbell: Dumbbell,
};

function hasQuizContent(item) {
  return hasPlayableQuizContent(item);
}

function hasCompositeContent(item) {
  return hasPlayableCompositeContent(item);
}

function buildQuizEntries(chapter, chapterIndex) {
  if (chapter.quizzes?.length) return chapter.quizzes.filter(hasQuizContent);

  return (chapter.sections || [])
    .filter(section => section.type !== 'exercise' && hasQuizContent(section))
    .map((section, index) => ({
      ...section,
      quiz_metadata: {
        chapter_num: chapter.number || chapterIndex + 1,
        chapter_title: chapter.title,
        quiz_title: section.title,
      },
    }));
}

function buildSujetTypeEntries(chapter) {
  return (chapter.sujetTypes?.length ? chapter.sujetTypes.filter(hasCompositeContent) : (chapter.exercises || []).filter(item => (item.mode === 'exam' || item.type === 'sujet-type') && hasCompositeContent(item)));
}

function buildExerciseEntries(chapter) {
  const directExercises = chapter.exercises?.filter(item => item.mode !== 'exam' && item.type !== 'sujet-type' && hasCompositeContent(item)) || [];
  if (chapter.exercises?.length || chapter.sujetTypes?.length) return directExercises;
  return (chapter.sections || []).filter(section => section.type === 'exercise' && hasCompositeContent(section));
}

function getVisibleChapters(subject) {
  return (subject?.chapters || []).filter((chapter, chapterIndex) => {
    return buildQuizEntries(chapter, chapterIndex).length > 0
      || buildSujetTypeEntries(chapter).length > 0
      || buildExerciseEntries(chapter).length > 0;
  });
}

function formatContentCount(count, singularLabel, pluralLabel = `${singularLabel}s`) {
  return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}

function getChapterContentSummary(chapter, chapterIndex) {
  const quizEntries = buildQuizEntries(chapter, chapterIndex);
  const sujetTypeEntries = buildSujetTypeEntries(chapter);
  const exerciseEntries = buildExerciseEntries(chapter);

  return {
    quizEntries,
    sujetTypeEntries,
    exerciseEntries,
    summaryLabel: [
      formatContentCount(quizEntries.length, 'quiz', 'quiz'),
      formatContentCount(sujetTypeEntries.length, 'sujet type', 'sujets types'),
      formatContentCount(exerciseEntries.length, 'exercice'),
    ].join(' · ') + ' au total',
  };
}

function countItemQuestions(item) {
  if (item.modeQuestions) return countPlayableQuizQuestions(item);
  return countPlayableCompositeQuestions(item);
}

function countTotalQuizModeQuestions(item) {
  return countPlayableQuizQuestions(item);
}

function countQuizModes(item) {
  return countPlayableQuizModes(item);
}

function resolveDefaultContentType(quizEntries, sujetTypeEntries, exerciseEntries) {
  if (quizEntries.length) return 'quiz';
  if (sujetTypeEntries.length) return 'sujet-type';
  if (exerciseEntries.length) return 'exercice';
  return 'quiz';
}

function EmptySectionCard({ icon: Icon, title, subtitle }) {
  return (
    <div className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-dashed border-gray-200 opacity-80">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
        <Icon size={16} className="text-txt-muted" />
      </div>
      <div className="flex-1 text-left">
        <p className="font-semibold text-xs text-txt-main">{title}</p>
        <p className="text-[10px] text-txt-muted">{subtitle}</p>
      </div>
    </div>
  );
}

const QUIZ_MODE_DESCRIPTIONS = [
  {
    id: 'suggestion',
    label: 'Mode Suggestion',
    Icon: Brain,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10',
    cardClass: 'w-full p-4 rounded-2xl border border-gray-100 bg-white shadow-card text-left active:scale-[0.99] transition-transform',
    description: 'QCM classique : une question, quatre propositions longues, une seule bonne réponse à choisir.',
  },
  {
    id: 'input',
    label: 'Mode Input Blocs',
    Icon: Type,
    iconColor: 'text-accent-blue',
    iconBg: 'bg-accent-blue/10',
    cardClass: 'w-full p-4 rounded-2xl border border-gray-100 bg-white shadow-card text-left active:scale-[0.99] transition-transform',
    description: 'Choix rapide parmi 2 à 4 blocs courts (chiffres, symboles, mots) — pas de clavier libre.',
  },
  {
    id: 'trap',
    label: 'Mode Pièges',
    Icon: AlertTriangle,
    iconColor: 'text-accent-red',
    iconBg: 'bg-accent-red/10',
    cardClass: 'w-full p-4 rounded-2xl border border-gray-100 bg-white shadow-card text-left active:scale-[0.99] transition-transform',
    description: 'Analyse critique : repérez les affirmations fausses parmi plusieurs propositions (une option vide).',
  },
  {
    id: 'duel_intrus',
    label: 'Duel de l\u2019Intrus',
    Icon: Zap,
    iconColor: 'text-accent-red',
    iconBg: 'bg-accent-red/10',
    cardClass: 'w-full p-4 rounded-2xl border border-accent-red/10 bg-accent-red/[0.03] shadow-card text-left active:scale-[0.99] transition-transform',
    description: 'Avancé : deux blocs presque identiques, un seul est correct — choisissez-le et rejetez l\u2019intrus piégé.',
  },
  {
    id: 'deminage',
    label: 'Déminage',
    Icon: AlertTriangle,
    iconColor: 'text-primary-dark',
    iconBg: 'bg-primary/10',
    cardClass: 'w-full p-4 rounded-2xl border border-primary/10 bg-primary/[0.03] shadow-card text-left active:scale-[0.99] transition-transform',
    description: 'Avancé : une phrase pré-remplie contient des blocs erronés — brisez-les puis reconstruisez la version exacte.',
  },
];

function QuizModeModal({ quizEntry, chapter, onClose, onLaunch, playClick }) {
  if (!quizEntry || !chapter) return null;

  const chapterNumber = quizEntry.quiz_metadata?.chapter_num || chapter.number || 1;
  const chapterTitle = quizEntry.quiz_metadata?.chapter_title || chapter.title;
  const quizTitle = quizEntry.quiz_metadata?.quiz_title || quizEntry.title;

  // Pour chaque mode, on calcule le nombre de questions RÉELLEMENT jouables
  // (après validation/normalisation via getQuizModeQuestions) afin d'éviter
  // l'incohérence « N questions » + « mode indisponible ».
  const modeCounts = QUIZ_MODE_DESCRIPTIONS.reduce((acc, mode) => {
    try {
      acc[mode.id] = getQuizModeQuestions(quizEntry, mode.id).length;
    } catch {
      acc[mode.id] = 0;
    }
    return acc;
  }, {});
  const totalQuestions = Object.values(modeCounts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="fixed inset-0 z-[120] bg-black/45 flex items-end justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden animate-slide-up max-h-[90vh] flex flex-col" onClick={event => event.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Brain size={22} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider">Lancer un quiz · choisir le mode</p>
              <h3 className="font-extrabold text-base leading-tight">{quizTitle}</h3>
              <p className="text-[11px] text-txt-sub mt-1">Chapitre {chapterNumber} · {chapterTitle}</p>
              <p className="text-[11px] text-txt-muted mt-1">{totalQuestions} question{totalQuestions !== 1 ? 's' : ''} réparties sur les 5 modes</p>
            </div>
            <button onClick={() => { playClick(); onClose(); }} className="w-9 h-9 rounded-xl bg-gray-100 text-txt-sub flex items-center justify-center active:scale-90 transition-transform">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {QUIZ_MODE_DESCRIPTIONS.map((mode) => {
            const MIcon = mode.Icon;
            const count = modeCounts[mode.id] || 0;
            const disabled = count === 0;
            return (
              <button
                key={mode.id}
                onClick={() => { if (!disabled) onLaunch(mode.id); }}
                disabled={disabled}
                className={`${mode.cardClass} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${mode.iconBg} flex items-center justify-center shrink-0`}>
                    <MIcon size={18} className={mode.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-sm">{mode.label}</p>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${count > 0 ? 'bg-primary/10 text-primary-dark' : 'bg-gray-100 text-txt-muted'}`}>
                        {count} question{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-txt-sub mt-1 leading-relaxed">{mode.description}</p>
                    {disabled && <p className="text-[10px] text-accent-red mt-1 font-semibold">Pas encore de contenu pour ce mode</p>}
                  </div>
                  {!disabled && <ChevronRight size={16} className="text-txt-muted shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ChapterView() {
  const { data, viewParams, navigate, playClick, startQuiz, showToast } = useApp();
  const [expandedChapter, setExpandedChapter] = useState(null);
  const [quizModal, setQuizModal] = useState(null);
  const [selectedTypeByChapter, setSelectedTypeByChapter] = useState({});

  const subjectId = viewParams?.subjectId || 1;
  const subject = (data?.subjects || []).find(s => String(s.id) === String(subjectId)) || { name: 'Matière', chapters: [], color: '#f5b83d' };
  const chapters = getVisibleChapters(subject);
  const Icon = ICON_MAP[subject.icon] || BookOpen;

  const handleOpenQuiz = (chapter, quizEntry, chapterIndex) => {
    if (!countItemQuestions(quizEntry)) return;
    playClick();
    setQuizModal({ chapter, quizEntry, chapterIndex });
  };

  const handleStartExercise = (chapter, exercise) => {
    if (!countItemQuestions(exercise)) return;
    playClick();
    const subjectTimingDefaults = subject.timingDefaults || {};
    const treatmentTiming = exercise?.traitement?.timing || exercise?.timing || {};
    navigate('exercise-flow', {
      exerciseData: {
        ...exercise,
        title: exercise.title || `${chapter.title} — Exercice`,
        chapterTitle: chapter.title,
        chapterNumber: chapter.number,
        scoreScale: exercise.scoreScale || subject.scoreScale || data?.settings?.finalScoreScale || 100,
        subjectCoefficient: Math.max(1, Number(subject.coefficient) || 1),
        timingDefaults: subjectTimingDefaults,
        timing: treatmentTiming,
        timeLimitSeconds: exercise?.traitement?.timeLimitSeconds
          || exercise?.timeLimitSeconds
          || (exercise?.mode === 'exam' ? subjectTimingDefaults.examDelaySeconds : subjectTimingDefaults.exerciseDelaySeconds),
      },
      backParams: { subjectId },
    });
  };

  const handleSelectChapterType = (chapterIndex, typeId) => {
    playClick();
    setSelectedTypeByChapter(prev => ({
      ...prev,
      [chapterIndex]: typeId,
    }));
  };

  const handleLaunchQuizMode = (mode) => {
    if (!quizModal) return;

    const { quizEntry, chapter, chapterIndex } = quizModal;
    const questions = getQuizModeQuestions(quizEntry, mode);
    const isAdvancedMode = mode === 'duel_intrus' || mode === 'deminage';
    const subjectTimingDefaults = subject.timingDefaults || {};
    const modeConfig = quizEntry.modeConfigs?.[mode] || {};
    const modeTiming = modeConfig.timing || {};
    const modeScoring = modeConfig.scoring || {};
    const scoringConfig = isAdvancedMode
      ? {
          wrongPenalty: mode === 'deminage' ? 14 : 12,
          hintPenalty: 4,
          averageWeight: 2,
          fireMultiplier: 5,
          subjectCoefficient: Math.max(1, Number(subject.coefficient) || 1),
          scoreScale: quizEntry.scoreScale || subject.scoreScale || data?.settings?.finalScoreScale || 100,
          ...modeScoring,
        }
      : {
          subjectCoefficient: Math.max(1, Number(subject.coefficient) || 1),
          scoreScale: quizEntry.scoreScale || subject.scoreScale || data?.settings?.finalScoreScale || 100,
          ...modeScoring,
        };
    const defaultQuestionDelay = isAdvancedMode
      ? Number(subjectTimingDefaults.advancedQuizQuestionDelaySeconds)
      : Number(subjectTimingDefaults.quizQuestionDelaySeconds);
    const timeLimitSeconds = Number(modeTiming.timeLimitSeconds) > 0
      ? Number(modeTiming.timeLimitSeconds)
      : defaultQuestionDelay > 0
        ? Math.max(30, Math.round(questions.length * defaultQuestionDelay))
        : 0;

    if (!questions.length) {
      showToast('Ce mode n\'est pas encore disponible pour ce quiz', 'info');
      return;
    }

    startQuiz(
      questions,
      getQuizSessionTitle(quizEntry, mode),
      mode,
      undefined,
      {
        sessionKind: 'quiz',
        chapterTitle: chapter.title,
        chapterNumber: chapter.number || chapterIndex + 1,
        quizTitle: quizEntry.quiz_metadata?.quiz_title || quizEntry.title,
        subjectId,
        scoreScale: scoringConfig.scoreScale,
        scoringConfig,
        timeLimitSeconds,
        timing: modeTiming,
      }
    );
    setQuizModal(null);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-xl border-b border-primary/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => { playClick(); navigate('subjects'); }} className="text-txt-sub active:scale-90 transition-transform">
            <ArrowLeft size={22} />
          </button>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-bouncy" style={{ backgroundColor: subject.color + '18' }}>
            <Icon size={22} style={{ color: subject.color }} />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-sm">{subject.name}</h2>
            <p className="text-[11px] text-txt-sub">{chapters.length} chapitre{chapters.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-28 space-y-3">
        {chapters.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
            <BookOpen size={48} className="text-primary/20 mb-4" />
            <p className="text-txt-sub font-semibold text-sm">Aucun chapitre</p>
            <p className="text-xs text-txt-muted mt-1">Importez du contenu via l'espace Admin</p>
          </div>
        )}

        {chapters.map((chapter, cIdx) => {
          const isOpen = expandedChapter === cIdx;
          const { quizEntries, sujetTypeEntries, exerciseEntries, summaryLabel } = getChapterContentSummary(chapter, cIdx);
          const selectedType = selectedTypeByChapter[cIdx] || resolveDefaultContentType(quizEntries, sujetTypeEntries, exerciseEntries);
          const contentGroups = [
            {
              id: 'quiz',
              label: 'Quiz',
              pageLabel: 'Page Quiz',
              icon: Brain,
              iconWrapClass: 'bg-accent-purple/10',
              iconClass: 'text-accent-purple',
              chipClass: 'bg-accent-purple/10 text-accent-purple',
              entries: quizEntries,
              emptyTitle: 'Aucun quiz jouable',
              emptySubtitle: 'Aucun quiz complet n’est disponible dans ce chapitre.',
              description: 'Choisis un quiz nommé avant de sélectionner son mode.',
            },
            {
              id: 'sujet-type',
              label: 'Sujet type',
              pageLabel: 'Page Sujet type',
              icon: FileText,
              iconWrapClass: 'bg-accent-red/10',
              iconClass: 'text-accent-red',
              chipClass: 'bg-accent-red/10 text-accent-red',
              entries: sujetTypeEntries,
              emptyTitle: 'Aucun sujet type jouable',
              emptySubtitle: 'Aucun sujet type complet n’est disponible dans ce chapitre.',
              description: 'Choisis un sujet type nommé pour démarrer la session complète.',
            },
            {
              id: 'exercice',
              label: 'Exercice',
              pageLabel: 'Page Exercice',
              icon: Zap,
              iconWrapClass: 'bg-accent-green/10',
              iconClass: 'text-accent-green',
              chipClass: 'bg-accent-green/10 text-accent-green',
              entries: exerciseEntries,
              emptyTitle: 'Aucun exercice jouable',
              emptySubtitle: 'Aucun exercice complet n’est disponible dans ce chapitre.',
              description: 'Choisis un exercice nommé pour ouvrir son parcours.',
            },
          ];
          const activeGroup = contentGroups.find(group => group.id === selectedType) || contentGroups[0];

          return (
            <div key={cIdx} className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden animate-fade-in-up"
              style={{ animationDelay: `${cIdx * 40}ms` }}>
              {/* Chapter header */}
              <button
                onClick={() => { playClick(); setExpandedChapter(isOpen ? null : cIdx); }}
                className="w-full flex items-center gap-3 p-4 active:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-bouncy"
                  style={{ backgroundColor: subject.color }}>
                  {cIdx + 1}
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-sm">{chapter.title}</h3>
                  <p className="text-[11px] text-txt-sub">Chapitre {chapter.number || cIdx + 1} · {summaryLabel}</p>
                </div>
                <ChevronRight size={18} className={`text-txt-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-3 space-y-3 animate-fade-in">
                  <div className="rounded-2xl bg-white border border-gray-100 p-3 space-y-2.5 shadow-card">
                    <div className="px-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-txt-muted">Étape 1 · Choisir le type</p>
                      <p className="text-[11px] text-txt-sub mt-1">Sélectionne d’abord une famille de contenu avant de choisir l’item nommé du chapitre.</p>
                    </div>
                    <div className="grid gap-2 xl:grid-cols-3 md:grid-cols-2">
                      {contentGroups.map((group) => {
                        const GroupIcon = group.icon;
                        const isActiveType = group.id === activeGroup.id;
                        return (
                          <button
                            key={`${cIdx}-${group.id}`}
                            onClick={() => handleSelectChapterType(cIdx, group.id)}
                            className={`group rounded-[1.35rem] border px-3 py-3 text-left transition-all active:scale-[0.98] min-h-[7.25rem] md:min-h-[8rem] ${isActiveType ? 'border-primary bg-primary/[0.07] shadow-card ring-1 ring-primary/10' : 'border-gray-100 bg-white hover:border-primary/15 hover:bg-primary/[0.02] hover:shadow-card'}`}
                          >
                            <div className="flex h-full flex-col gap-2.5 min-w-0">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className={`w-10 h-10 md:w-11 md:h-11 rounded-2xl flex items-center justify-center shadow-sm shrink-0 transition-transform ${group.iconWrapClass} ${isActiveType ? 'scale-105' : 'group-hover:scale-105'}`}>
                                  <GroupIcon size={18} className={group.iconClass} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 min-w-0">
                                    <p className="min-w-0 font-extrabold text-sm md:text-[15px] leading-tight text-txt-main truncate">{group.label}</p>
                                    <span className={`shrink-0 inline-flex items-center justify-center min-w-[2.2rem] h-7 px-2.5 rounded-xl text-[10px] font-extrabold ${group.chipClass}`}>{group.entries.length}</span>
                                  </div>
                                  <p className="text-[10px] md:text-[10.5px] leading-relaxed text-txt-sub mt-1.5 pr-1 line-clamp-3">{group.description}</p>
                                </div>
                              </div>
                              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                                <span className={`text-[10px] font-bold ${isActiveType ? 'text-primary-dark' : 'text-txt-muted'}`}>
                                  {group.entries.length > 0 ? `${group.entries.length} disponible${group.entries.length > 1 ? 's' : ''}` : 'Aucun contenu jouable'}
                                </span>
                                <span className={`text-[10px] font-extrabold ${isActiveType ? 'text-primary' : 'text-txt-muted/70'}`}>
                                  {isActiveType ? 'Sélectionné' : 'Ouvrir'}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-txt-muted px-1">Étape 2 · {activeGroup.pageLabel}</p>
                    {activeGroup.entries.length > 0 ? activeGroup.entries.map((item, itemIndex) => {
                      const itemQuestionCount = activeGroup.id === 'quiz'
                        ? countTotalQuizModeQuestions(item)
                        : countItemQuestions(item);
                      const playableModeCount = activeGroup.id === 'quiz' ? countQuizModes(item) : 0;
                      const ItemIcon = activeGroup.icon;
                      return (
                        <button key={`${activeGroup.id}-${itemIndex}`}
                          onClick={() => {
                            if (activeGroup.id === 'quiz') {
                              handleOpenQuiz(chapter, item, cIdx);
                              return;
                            }
                            handleStartExercise(chapter, item);
                          }}
                          disabled={!itemQuestionCount}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 shadow-card active:scale-[0.98] transition-all disabled:opacity-40"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeGroup.iconWrapClass}`}>
                            <ItemIcon size={16} className={activeGroup.iconClass} />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-xs">{item.quiz_metadata?.quiz_title || item.title || `${activeGroup.label} ${itemIndex + 1}`}</p>
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${activeGroup.chipClass}`}>{itemQuestionCount} question{itemQuestionCount !== 1 ? 's' : ''}</span>
                            </div>
                            <p className="text-[10px] text-txt-muted mt-1">
                              {activeGroup.id === 'quiz'
                                ? `${playableModeCount} mode${playableModeCount !== 1 ? 's' : ''} disponible${playableModeCount !== 1 ? 's' : ''} · choisis ensuite Suggestion, Input, Pièges, Duel ou Déminage`
                                : `${itemQuestionCount} question${itemQuestionCount !== 1 ? 's' : ''} jouable${itemQuestionCount !== 1 ? 's' : ''}`}
                            </p>
                          </div>
                          <Play size={14} className="text-primary" />
                        </button>
                      );
                    }) : (
                      <EmptySectionCard icon={activeGroup.icon} title={activeGroup.emptyTitle} subtitle={activeGroup.emptySubtitle} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </main>

      <QuizModeModal
        quizEntry={quizModal?.quizEntry}
        chapter={quizModal?.chapter}
        onClose={() => setQuizModal(null)}
        onLaunch={handleLaunchQuizMode}
        playClick={playClick}
      />
    </div>
  );
}
