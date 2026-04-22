import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { hasPlayableCompositeContent, hasPlayableQuizContent } from '../lib/contentVisibility';
import {
  Calculator, Atom, Leaf, BookOpen, Globe, Map, Flag, Dumbbell,
  ChevronRight, Search, GraduationCap, TrendingUp, Trophy, Zap, Star
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

function buildQuizEntries(chapter) {
  if (chapter.quizzes?.length) return chapter.quizzes.filter(hasQuizContent);
  return (chapter.sections || []).filter(section => section.type !== 'exercise' && hasQuizContent(section));
}

function buildSujetTypeEntries(chapter) {
  return chapter.sujetTypes?.length
    ? chapter.sujetTypes.filter(hasCompositeContent)
    : (chapter.exercises || []).filter(item => (item.mode === 'exam' || item.type === 'sujet-type') && hasCompositeContent(item));
}

function buildExerciseEntries(chapter) {
  const directExercises = chapter.exercises?.filter(item => item.mode !== 'exam' && item.type !== 'sujet-type' && hasCompositeContent(item)) || [];
  if (chapter.exercises?.length || chapter.sujetTypes?.length) return directExercises;
  return (chapter.sections || []).filter(section => section.type === 'exercise' && hasCompositeContent(section));
}

function getVisibleChapters(subject) {
  return (subject?.chapters || []).filter((chapter) => {
    return buildQuizEntries(chapter).length > 0
      || buildSujetTypeEntries(chapter).length > 0
      || buildExerciseEntries(chapter).length > 0;
  });
}

function formatContentCount(count, singularLabel, pluralLabel = `${singularLabel}s`) {
  return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}

function getSubjectContentSummary(subject) {
  const totals = getVisibleChapters(subject).reduce((acc, chapter) => {
    acc.quiz += buildQuizEntries(chapter).length;
    acc.sujetTypes += buildSujetTypeEntries(chapter).length;
    acc.exercices += buildExerciseEntries(chapter).length;
    return acc;
  }, { quiz: 0, sujetTypes: 0, exercices: 0 });

  if (!totals.quiz && !totals.sujetTypes && !totals.exercices) {
    return 'Aucun contenu jouable';
  }

  return [
    formatContentCount(totals.quiz, 'quiz', 'quiz'),
    formatContentCount(totals.sujetTypes, 'sujet type', 'sujets types'),
    formatContentCount(totals.exercices, 'exercice'),
  ].join(' · ') + ' au total';
}

export default function HomePage({ tab }) {
  const { data, navigate, playClick, setCurrentSubjectId } = useApp();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(tab === 'subjects' ? 'subjects' : 'home');

  const user = data?.user || {};
  const subjects = data?.subjects || [];
  const level = Math.floor((user.xp || 0) / 500) + 1;
  const xpInLevel = (user.xp || 0) % 500;

  const filteredSubjects = useMemo(() => {
    if (!search) return subjects;
    return subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  }, [subjects, search]);

  if (activeTab === 'subjects') {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <header className="bg-bg/80 backdrop-blur-xl border-b border-primary/10 px-4 pt-3 pb-3">
          <div className="mb-3">
            <h1 className="text-xl font-extrabold tracking-tight">
              Bac<span className="text-primary">Booster</span>
            </h1>
            <p className="text-xs text-txt-sub font-medium mt-0.5">
              {subjects.length} matières · {user.selectedClass || 'Terminale'}
            </p>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une matière..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-primary/8 text-sm font-medium placeholder:text-txt-muted/50 focus:outline-none focus:border-primary/30 transition-colors"
            />
          </div>
        </header>

        <main className="flex-1 px-4 py-4 pb-28 space-y-3">
          {filteredSubjects.map((subject, idx) => {
            const Icon = ICON_MAP[subject.icon] || BookOpen;
            const chapCount = getVisibleChapters(subject).length;
            const contentSummary = getSubjectContentSummary(subject);
            return (
              <button
                key={subject.id}
                onClick={() => {
                  playClick();
                  setCurrentSubjectId(subject.id);
                  navigate('chapter', { subjectId: subject.id });
                }}
                className="w-full flex items-center gap-3.5 p-4 rounded-2xl bg-white border border-gray-100 shadow-card active:shadow-card-hover active:scale-[0.98] transition-all animate-fade-in-up"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-bouncy" style={{ backgroundColor: subject.color + '18' }}>
                  <Icon size={24} style={{ color: subject.color }} />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-sm">{subject.name}</h3>
                  <p className="text-[11px] text-txt-sub">{chapCount} chapitre{chapCount !== 1 ? 's' : ''} · {contentSummary}</p>
                </div>
                <ChevronRight size={18} className="text-txt-muted" />
              </button>
            );
          })}

          {filteredSubjects.length === 0 && (
            <div className="text-center py-16 animate-fade-in">
              <BookOpen size={48} className="text-primary/20 mx-auto mb-3" />
              <p className="text-txt-sub font-semibold text-sm">Aucune matière trouvée</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  /* ── HOME TAB ── */
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <main className="flex-1 px-4 py-3 pb-28 space-y-4">
        {/* Level card */}
        <div className="bg-white rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <GraduationCap size={22} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-txt-sub">Niveau</p>
                <p className="font-extrabold text-lg text-primary-dark">{level}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-txt-sub">{user.selectedClass || 'Terminale'}</p>
              <div className="flex items-center gap-1 mt-0.5">
                {[0, 1, 2].map(i => (
                  <Star key={i} size={12} className={i < Math.min(3, level) ? 'text-primary fill-primary' : 'text-gray-200'} />
                ))}
              </div>
            </div>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-700"
              style={{ width: `${(xpInLevel / 500) * 100}%` }} />
          </div>
          <p className="text-[10px] text-txt-muted mt-1 text-right">{xpInLevel}/500 XP</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { playClick(); setActiveTab('subjects'); }}
            className="p-4 rounded-2xl bg-white shadow-card active:shadow-card-hover active:scale-[0.97] transition-all"
          >
            <BookOpen size={24} className="text-accent-blue mb-2" />
            <p className="font-bold text-sm">Matières</p>
            <p className="text-[11px] text-txt-sub">{subjects.length} disponibles</p>
          </button>
          <button
            onClick={() => { playClick(); navigate('profile'); }}
            className="p-4 rounded-2xl bg-white shadow-card active:shadow-card-hover active:scale-[0.97] transition-all"
          >
            <TrendingUp size={24} className="text-accent-green mb-2" />
            <p className="font-bold text-sm">Progression</p>
            <p className="text-[11px] text-txt-sub">Voir mes stats</p>
          </button>
        </div>

        {/* Recent activity */}
        {(user.history || []).length > 0 && (
          <div>
            <h3 className="font-bold text-sm mb-2 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-primary" /> Activité récente
            </h3>
            <div className="space-y-2">
              {(user.history || []).slice(0, 5).map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-50 shadow-card text-sm animate-fade-in-up"
                  style={{ animationDelay: `${i * 30}ms` }}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(Number(h.average20) || 0) >= 10 ? 'bg-accent-green/10' : 'bg-accent-red/10'}`}>
                    {(Number(h.average20) || 0) >= 10 ? <Trophy size={14} className="text-accent-green" /> : <Zap size={14} className="text-accent-red" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs truncate">{h.chapter || 'Quiz'}</p>
                    <p className="text-[10px] text-txt-muted">{h.date}{h.subjectName ? ` · ${h.subjectName}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold ${(Number(h.average20) || 0) >= 10 ? 'text-accent-green' : 'text-accent-red'}`}>{h.score}</span>
                    <p className="text-[10px] text-txt-muted">XP +{h.xp || 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subjects grid preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm">Tes matières</h3>
            <button onClick={() => setActiveTab('subjects')} className="text-xs font-semibold text-primary">Tout voir</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {subjects.slice(0, 8).map(s => {
              const Icon = ICON_MAP[s.icon] || BookOpen;
              return (
                <button key={s.id}
                  onClick={() => { playClick(); setCurrentSubjectId(s.id); navigate('chapter', { subjectId: s.id }); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white shadow-card active:scale-95 transition-transform">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: s.color + '18' }}>
                    <Icon size={20} style={{ color: s.color }} />
                  </div>
                  <span className="text-[10px] font-semibold text-center leading-tight truncate w-full">{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
