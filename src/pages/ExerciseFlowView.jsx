import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { renderMixedContent } from '../components/KaTeXRenderer';
import { TranslationButton, TranslationModal } from '../components/TranslationWidgets';
import { SCORE_CONFIG } from '../lib/constants';
import { getPlayableCompositeQuestions } from '../lib/contentVisibility';
import { getTranslationText, normalizeTranslations, resolveTranslationPricing } from '../lib/translations';
import {
  ArrowLeft, ArrowRight, ChevronUp, ChevronDown, CheckCircle, XCircle,
  FileText, Layers, BookOpen, Zap, Lock, Unlock, Eye, RotateCcw,
  ChevronRight, AlertTriangle
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   EXERCISE FLOW VIEW — 3 pages:
   1. Énoncé  → lire le sujet / exercice
   2. Prion   → réorganiser les étapes par question
   3. Traitement → page de traitement (QuizView)
   ═══════════════════════════════════════════════════════════════ */

/* ── STEP INDICATOR ── */
function StepIndicator({ current, steps }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            {i > 0 && <div className={`w-8 h-0.5 rounded ${done ? 'bg-accent-green' : 'bg-gray-200'}`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
              active ? 'bg-primary text-white shadow-gold scale-105' :
              done ? 'bg-accent-green/10 text-accent-green' : 'bg-gray-100 text-txt-muted'
            }`}>
              {done ? <CheckCircle size={12} /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{s}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildTranslationTarget({ id, title, raw, cost, energyCost, scoreCost }) {
  return {
    id,
    title,
    translationText: getTranslationText(raw, 'mg'),
    cost: Math.max(1, Number(cost) || 0),
    energyCost: Math.max(1, Number(energyCost ?? cost) || 0),
    scoreCost: Math.max(0, Number(scoreCost ?? energyCost ?? cost) || 0),
  };
}

async function spendTranslationAccess({ cost, energyCost, data, save, showToast, pushFloatingFx, consumeInventoryItem }) {
  const safePackCost = Math.max(1, Math.round(Number(cost) || 0));
  const safeEnergyCost = Math.max(1, Math.round(Number(energyCost ?? cost) || 0));
  const userHintPacks = Math.max(0, Number(data?.user?.inventory?.hints) || 0);
  if (userHintPacks >= safePackCost && typeof consumeInventoryItem === 'function') {
    const consumed = await consumeInventoryItem('hints', safePackCost);
    if (consumed) {
      showToast(`Traduction révélée · ${safePackCost} pack${safePackCost > 1 ? 's' : ''} d'indice`, 'info');
      return true;
    }
  }

  const userEnergy = Math.max(0, Number(data?.user?.energy) || 0);
  if (userEnergy < safeEnergyCost) {
    showToast(`Il faut ${safePackCost} pack${safePackCost > 1 ? 's' : ''} d'indice ou ${safeEnergyCost} énergie`, 'error');
    return false;
  }

  const nextUser = { ...data.user, energy: Math.max(0, userEnergy - safeEnergyCost) };
  await save({ ...data, user: nextUser });
  pushFloatingFx({ kind: 'energy', label: 'Énergie', amount: -safeEnergyCost, positive: false });
  showToast(`Traduction révélée · ${safeEnergyCost} énergie`, 'info');
  return true;
}

/* ════════════════════════════════════
   PAGE 1 — ÉNONCÉ
   ════════════════════════════════════ */
function EnonceePage({ exerciseData, onContinue, onBack, playClick, onOpenTranslation, questionTranslationPricing }) {
  const { title, enonce, mode, chapterTitle, chapterNumber } = exerciseData;
  const questions = getPlayableCompositeQuestions(exerciseData);
  const enonceTranslations = normalizeTranslations(exerciseData.translations);
  const hasPlayableQuestions = questions.length > 0;

  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto no-scrollbar">
        {/* Title card */}
        <div className="bg-white rounded-2xl p-5 shadow-card border border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-bouncy ${
              mode === 'exam' ? 'bg-accent-red/10' : 'bg-accent-blue/10'
            }`}>
              {mode === 'exam'
                ? <FileText size={22} className="text-accent-red" />
                : <BookOpen size={22} className="text-accent-blue" />
              }
            </div>
            <div>
              <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider">
                {mode === 'exam' ? 'Sujet Type BAC' : 'Exercice'}
              </p>
              <h2 className="font-extrabold text-base">{title}</h2>
              <p className="text-[11px] text-txt-sub mt-1">
                Chapitre {chapterNumber || 1} · {chapterTitle || title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-txt-sub">
            <span className="flex items-center gap-1">
              <Layers size={12} /> {questions.length} question{questions.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Énoncé body */}
        {enonce && (
          <div className="bg-white rounded-2xl p-5 shadow-card border border-gray-100">
            <div className="font-bold text-sm mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2">
                <Eye size={16} className="text-primary" /> Énoncé
              </h3>
              <TranslationButton
                onClick={() => onOpenTranslation(buildTranslationTarget({
                  id: 'exercise-enonce',
                  title: 'Énoncé',
                  raw: enonceTranslations.enonce || enonceTranslations.question,
                  cost: questionTranslationPricing.hintPackCost,
                  energyCost: questionTranslationPricing.energyCost,
                  scoreCost: questionTranslationPricing.scoreCost,
                }))}
                title="Traduction de l’énoncé"
              />
            </div>
            <div className="text-sm leading-relaxed text-txt-main space-y-2">
              {enonce.split('\n').filter(l => l.trim()).map((line, i) => (
                <p key={i}>{renderMixedContent(line)}</p>
              ))}
            </div>
          </div>
        )}

        {/* Questions preview */}
        <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Layers size={16} className="text-accent-purple" /> Questions à traiter
          </h3>
          <div className="space-y-2">
            {hasPlayableQuestions ? questions.map((q, i) => {
              const translations = normalizeTranslations(q.translations);
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-extrabold text-primary">{i + 1}</span>
                  </div>
                  <p className="text-xs text-txt-sub flex-1 leading-relaxed">{renderMixedContent(q.question)}</p>
                  <TranslationButton
                    onClick={() => onOpenTranslation(buildTranslationTarget({
                      id: `exercise-preview-question-${i}`,
                      title: `Question ${i + 1}`,
                      raw: translations.question,
                      cost: questionTranslationPricing.hintPackCost,
                      energyCost: questionTranslationPricing.energyCost,
                      scoreCost: questionTranslationPricing.scoreCost,
                    }))}
                    title={`Traduction de la question ${i + 1}`}
                  />
                </div>
              );
            }) : (
              <div className="p-3 rounded-xl bg-gray-50 text-xs text-txt-sub">
                Aucune question jouable n’est disponible pour ce contenu.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom action */}
      <div className="px-4 py-4 border-t border-gray-100 bg-white/80 backdrop-blur-xl safe-bottom">
        <p className="text-[11px] text-txt-muted text-center mb-3">
          {hasPlayableQuestions ? 'Le brouillon est obligatoire avant le traitement' : 'Ce contenu n’est pas encore complet côté élève'}
        </p>
        <button
          onClick={() => { playClick(); if (hasPlayableQuestions) onContinue(); else onBack(); }}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary-light text-white font-bold text-sm shadow-gold btn-bounce flex items-center justify-center gap-2"
        >
          {hasPlayableQuestions ? <>Commencer le Brouillon <ArrowRight size={16} /></> : <>Retour au chapitre <ArrowLeft size={16} /></>}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   PAGE 2 — PRION (Brouillon / Étapes)
   ════════════════════════════════════ */
function PrionPage({ exerciseData, onContinue, onBack, playClick, playSpecial, showToast, onOpenTranslation, questionTranslationPricing, optionTranslationPricing }) {
  const questions = getPlayableCompositeQuestions(exerciseData);

  const questionsWithSteps = useMemo(() =>
    questions
      .map((q, idx) => {
        const brouillonSteps = q.brouillon?.steps?.length
          ? q.brouillon.steps
          : q.prionSteps?.length
            ? q.prionSteps
            : [];

        return {
          ...q,
          originalIndex: idx,
          brouillonSteps,
          normalizedTranslations: normalizeTranslations(q.translations),
          brouillonTranslations: normalizeTranslations(q.brouillon?.translations),
        };
      })
      .filter((q) => q.brouillonSteps.length > 0),
    [questions]
  );

  const [selectedQ, setSelectedQ] = useState(0);
  const [qStates, setQStates] = useState(() =>
    questionsWithSteps.map(q => ({
      userOrder: shuffleArray([...q.brouillonSteps]),
      validated: false,
      correct: false,
    }))
  );

  const allValidated = qStates.length > 0 && qStates.every(s => s.validated && s.correct);
  const currentQState = qStates[selectedQ];
  const currentQ = questionsWithSteps[selectedQ];

  useEffect(() => {
    setSelectedQ(0);
    setQStates(
      questionsWithSteps.map(q => ({
        userOrder: shuffleArray([...q.brouillonSteps]),
        validated: false,
        correct: false,
      }))
    );
  }, [questionsWithSteps]);

  const moveStep = useCallback((fromIdx, direction) => {
    const toIdx = fromIdx + direction;
    setQStates(prev => {
      const next = [...prev];
      const state = { ...next[selectedQ] };
      if (toIdx < 0 || toIdx >= state.userOrder.length) return prev;
      const arr = [...state.userOrder];
      [arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]];
      state.userOrder = arr;
      state.validated = false;
      state.correct = false;
      next[selectedQ] = state;
      return next;
    });
    playClick();
  }, [selectedQ, playClick]);

  const validateQuestion = useCallback(() => {
    if (!currentQ) return;
    const isCorrect = currentQState.userOrder.every((step, i) => step === currentQ.brouillonSteps[i]);
    const nextQuestionIndex = qStates.findIndex((state, index) => index !== selectedQ && !(state.validated && state.correct));
    const nextAllValidated = isCorrect && qStates.every((state, index) => (
      index === selectedQ ? true : state.validated && state.correct
    ));

    setQStates(prev => {
      const next = [...prev];
      next[selectedQ] = { ...next[selectedQ], validated: true, correct: isCorrect };
      return next;
    });

    if (isCorrect) {
      playSpecial('success');
      showToast('Ordre correct !', 'success');
      window.setTimeout(() => {
        if (nextQuestionIndex >= 0) {
          setSelectedQ(nextQuestionIndex);
          return;
        }
        if (nextAllValidated) {
          onContinue();
        }
      }, 450);
    } else {
      playSpecial('error');
      showToast('L\'ordre n\'est pas correct. Réessayez.', 'error');
    }
  }, [currentQ, currentQState, onContinue, playSpecial, qStates, selectedQ, showToast]);

  const resetQuestion = useCallback(() => {
    if (!currentQ) return;
    setQStates(prev => {
      const next = [...prev];
      next[selectedQ] = {
        userOrder: shuffleArray([...currentQ.brouillonSteps]),
        validated: false,
        correct: false,
      };
      return next;
    });
    playClick();
  }, [selectedQ, currentQ, playClick]);

  if (questionsWithSteps.length === 0) {
    return (
      <div className="flex-1 flex flex-col animate-fade-in">
        <div className="flex-1 px-4 py-4">
          <div className="bg-white rounded-2xl p-5 shadow-card border border-gray-100 text-center text-sm text-txt-sub">
            Aucun brouillon n’est configuré pour ce contenu.
          </div>
        </div>
        <div className="px-4 py-4 border-t border-gray-100 bg-white/80 backdrop-blur-xl safe-bottom">
          <button
            onClick={() => { playClick(); onContinue(); }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-accent-green to-green-400 text-white font-bold text-sm shadow-gold btn-bounce flex items-center justify-center gap-2"
          >
            Continuer vers le traitement <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      <div className="flex-1 px-4 py-3 overflow-y-auto no-scrollbar space-y-3">
        {/* Explanation card */}
        <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4">
          <h3 className="font-bold text-sm text-primary-dark flex items-center gap-2 mb-1">
            <Layers size={16} /> Page Brouillon — Organiser les étapes
          </h3>
          <p className="text-[11px] text-txt-sub leading-relaxed">
            Pour chaque question, réorganisez les étapes dans le bon ordre.
            C'est la méthode du professeur pour traiter chaque question.
            Validez toutes les questions pour accéder au traitement.
          </p>
        </div>

        {/* Question selector */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {questionsWithSteps.map((q, i) => {
            const state = qStates[i];
            const isActive = i === selectedQ;
            return (
              <button
                key={i}
                onClick={() => { playClick(); setSelectedQ(i); }}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  isActive
                    ? 'bg-primary text-white shadow-gold'
                    : state.validated && state.correct
                      ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                      : state.validated && !state.correct
                        ? 'bg-accent-red/10 text-accent-red border border-accent-red/20'
                        : 'bg-white text-txt-sub border border-gray-100'
                }`}
              >
                {state.validated && state.correct
                  ? <CheckCircle size={12} />
                  : state.validated && !state.correct
                    ? <XCircle size={12} />
                    : <span>Q{q.originalIndex + 1}</span>
                }
                <span>Q{q.originalIndex + 1}</span>
              </button>
            );
          })}
        </div>

        {/* Current question */}
        {currentQ && (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {/* Question header */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-1">
                Question {currentQ.originalIndex + 1}
              </p>
              <div className="flex items-start gap-2">
                <p className="text-sm font-semibold leading-relaxed flex-1">{renderMixedContent(currentQ.question)}</p>
                <TranslationButton
                  onClick={() => onOpenTranslation(buildTranslationTarget({
                    id: `exercise-brouillon-question-${currentQ.originalIndex}`,
                    title: `Question ${currentQ.originalIndex + 1}`,
                    raw: currentQ.normalizedTranslations.question,
                    cost: questionTranslationPricing.hintPackCost,
                    energyCost: questionTranslationPricing.energyCost,
                    scoreCost: questionTranslationPricing.scoreCost,
                  }))}
                  title={`Traduction de la question ${currentQ.originalIndex + 1}`}
                />
              </div>
            </div>

            {/* Steps to reorder */}
            <div className="p-3 space-y-2">
              <p className="text-[10px] text-txt-muted font-semibold px-1">
                Réorganisez les étapes dans le bon ordre :
              </p>
              {currentQState.userOrder.map((step, idx) => {
                const isValidated = currentQState.validated;
                const isCorrectStep = isValidated && currentQ.brouillonSteps[idx] === step;
                const isWrongStep = isValidated && currentQ.brouillonSteps[idx] !== step;

                return (
                  <div
                    key={`${selectedQ}-${idx}-${step}`}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      isCorrectStep
                        ? 'border-accent-green/40 bg-accent-green/5'
                        : isWrongStep
                          ? 'border-accent-red/40 bg-accent-red/5 animate-shake'
                          : 'border-gray-100 bg-white'
                    }`}
                  >
                    {/* Step number */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-extrabold ${
                      isCorrectStep
                        ? 'bg-accent-green/15 text-accent-green'
                        : isWrongStep
                          ? 'bg-accent-red/15 text-accent-red'
                          : 'bg-primary/10 text-primary'
                    }`}>
                      {idx + 1}
                    </div>

                    {/* Step text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-relaxed">{renderMixedContent(step)}</p>
                    </div>

                    <div className="shrink-0">
                      <TranslationButton
                        onClick={() => onOpenTranslation(buildTranslationTarget({
                          id: `exercise-brouillon-step-${currentQ.originalIndex}-${idx}`,
                          title: `Étape ${idx + 1}`,
                          raw: currentQ.brouillonTranslations.steps[idx] || currentQ.normalizedTranslations.steps[idx],
                          cost: optionTranslationPricing.hintPackCost,
                          energyCost: optionTranslationPricing.energyCost,
                          scoreCost: optionTranslationPricing.scoreCost,
                        }))}
                        title={`Traduction de l’étape ${idx + 1}`}
                      />
                    </div>

                    {/* Move buttons */}
                    {!isValidated || !currentQState.correct ? (
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          onClick={() => moveStep(idx, -1)}
                          disabled={idx === 0}
                          className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-20"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => moveStep(idx, 1)}
                          disabled={idx === currentQState.userOrder.length - 1}
                          className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-20"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    ) : (
                      <CheckCircle size={16} className="text-accent-green shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="p-3 border-t border-gray-100 flex gap-2">
              {(!currentQState.validated || !currentQState.correct) && (
                <>
                  <button onClick={resetQuestion}
                    className="flex-1 py-2.5 rounded-xl bg-gray-100 text-txt-sub text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95">
                    <RotateCcw size={12} /> Mélanger
                  </button>
                  <button onClick={validateQuestion}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-gold active:scale-95">
                    <CheckCircle size={12} /> Valider l'ordre
                  </button>
                </>
              )}
              {currentQState.validated && currentQState.correct && (
                <div className="flex-1 py-2.5 rounded-xl bg-accent-green/10 text-accent-green text-xs font-bold text-center flex items-center justify-center gap-1.5">
                  <CheckCircle size={14} /> Étapes validées
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress summary */}
        <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
          <h4 className="font-bold text-xs mb-2">Progression</h4>
          <div className="flex flex-wrap gap-2">
            {questionsWithSteps.map((q, i) => {
              const state = qStates[i];
              return (
                <div key={i} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                  state.validated && state.correct
                    ? 'bg-accent-green/10 text-accent-green'
                    : 'bg-gray-100 text-txt-muted'
                }`}>
                  {state.validated && state.correct ? <CheckCircle size={10} /> : <Lock size={10} />}
                  Q{q.originalIndex + 1}
                </div>
              );
            })}
          </div>
          {!allValidated && (
            <p className="text-[10px] text-txt-muted mt-2">
              Validez toutes les questions pour accéder au traitement
            </p>
          )}
        </div>
      </div>

      {/* Bottom action */}
      <div className="px-4 py-4 border-t border-gray-100 bg-white/80 backdrop-blur-xl safe-bottom">
        <button
          onClick={() => { playClick(); onContinue(); }}
          disabled={!allValidated}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            allValidated
              ? 'bg-gradient-to-r from-accent-green to-green-400 text-white shadow-gold btn-bounce'
              : 'bg-gray-100 text-txt-muted cursor-not-allowed'
          }`}
        >
          {allValidated ? (
            <><Unlock size={16} /> Accéder au traitement <ArrowRight size={16} /></>
          ) : (
            <><Lock size={16} /> Validez toutes les questions d'abord</>
          )}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════
   MAIN FLOW COMPONENT
   ════════════════════════════════════ */
export default function ExerciseFlowView() {
  const { data, navigate, playClick, playSpecial, showToast, startQuiz, viewParams, save, pushFloatingFx, consumeInventoryItem } = useApp();
  const exerciseData = viewParams?.exerciseData;
  const traitementConfig = exerciseData?.traitement || {};
  const playableQuestions = useMemo(() => getPlayableCompositeQuestions(exerciseData || {}), [exerciseData]);
  const subjectId = viewParams?.backParams?.subjectId;
  const activeSubject = (data?.subjects || []).find(subject => Number(subject.id) === Number(subjectId));
  const timingDefaults = exerciseData?.timingDefaults || activeSubject?.timingDefaults || {};
  const flowTiming = exerciseData?.timing || traitementConfig?.timing || {};
  const playableExerciseData = useMemo(() => {
    if (!exerciseData) return null;
    return {
      ...exerciseData,
      questions: playableQuestions,
      traitement: {
        ...(exerciseData.traitement || {}),
        questions: playableQuestions,
      },
    };
  }, [exerciseData, playableQuestions]);

  // 0 = Énoncé, 1 = Prion, 2 = Traitement (redirects to quiz view)
  const [step, setStep] = useState(0);
  const [stepElapsedSeconds, setStepElapsedSeconds] = useState(0);
  const [pageTimingState, setPageTimingState] = useState({ enonceSeconds: 0, brouillonSeconds: 0 });
  const [spentScore, setSpentScore] = useState(0);
  const [scoreFx, setScoreFx] = useState(null);
  const [translationTarget, setTranslationTarget] = useState(null);
  const [revealedTranslationIds, setRevealedTranslationIds] = useState([]);
  const [translationBusy, setTranslationBusy] = useState(false);

  const STEPS = ['Énoncé', 'Brouillon', 'Traitement', 'Statistiques'];
  const timingTargets = useMemo(() => ({
    enonceDelaySeconds: Math.max(0, Number(flowTiming?.enonceDelaySeconds ?? timingDefaults?.enonceDelaySeconds) || 0),
    brouillonDelaySeconds: Math.max(0, Number(flowTiming?.brouillonDelaySeconds ?? timingDefaults?.brouillonDelaySeconds) || 0),
    treatmentDelaySeconds: Math.max(0, Number(flowTiming?.treatmentDelaySeconds ?? timingDefaults?.treatmentDelaySeconds) || 0),
    questionDelaySeconds: Math.max(0, Number(flowTiming?.questionDelaySeconds ?? timingDefaults?.questionDelaySeconds) || 0),
    stepDelaySeconds: Math.max(0, Number(flowTiming?.stepDelaySeconds ?? timingDefaults?.stepDelaySeconds) || 0),
    refreshDelaySeconds: Math.max(0, Number(flowTiming?.refreshDelaySeconds ?? timingDefaults?.refreshDelaySeconds) || 0),
  }), [flowTiming, timingDefaults]);
  const currentTargetSeconds = step === 0
    ? timingTargets.enonceDelaySeconds
    : step === 1
      ? timingTargets.brouillonDelaySeconds
      : timingTargets.treatmentDelaySeconds;
  const questionTranslationPricing = useMemo(() => resolveTranslationPricing(activeSubject, 'question'), [activeSubject]);
  const optionTranslationPricing = useMemo(() => resolveTranslationPricing(activeSubject, 'option'), [activeSubject]);
  const initialScore = Math.max(0, Number(traitementConfig.initialScore) || (playableQuestions.length || 0) * SCORE_CONFIG.correctBase);
  const remainingScore = Math.max(0, initialScore - spentScore);

  useEffect(() => {
    setStepElapsedSeconds(0);
  }, [step, exerciseData?.title]);

  useEffect(() => {
    if (!exerciseData) return undefined;
    const interval = window.setInterval(() => {
      setStepElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [exerciseData, step]);

  useEffect(() => {
    setPageTimingState({ enonceSeconds: 0, brouillonSeconds: 0 });
    setSpentScore(0);
    setScoreFx(null);
    setTranslationTarget(null);
    setRevealedTranslationIds([]);
    setTranslationBusy(false);
  }, [exerciseData?.title]);

  useEffect(() => {
    if (!scoreFx) return undefined;
    const timeout = window.setTimeout(() => setScoreFx(null), 900);
    return () => window.clearTimeout(timeout);
  }, [scoreFx]);

  if (!exerciseData) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6 text-center">
        <div className="animate-fade-in">
          <AlertTriangle size={40} className="text-primary/30 mx-auto mb-3" />
          <p className="text-sm text-txt-sub font-semibold">Aucune donnée d'exercice</p>
          <button onClick={() => navigate('home')} className="mt-3 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold">
            Retour
          </button>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    if (step === 0) {
      navigate('chapter', viewParams?.backParams || {});
    } else {
      setStep(s => s - 1);
    }
  };

  const handleEnonceContinue = () => {
    setPageTimingState(prev => ({ ...prev, enonceSeconds: Math.max(1, stepElapsedSeconds) }));
    setStep(1);
  };

  const handlePrionContinue = () => {
    // Launch the QuizView with the exercise questions
    playSpecial('levelUp');
    const brouillonSeconds = Math.max(1, stepElapsedSeconds);
    const pageTimes = [
      {
        key: 'enonce',
        label: 'Énoncé',
        seconds: Math.max(0, pageTimingState.enonceSeconds),
        targetSeconds: timingTargets.enonceDelaySeconds,
      },
      {
        key: 'brouillon',
        label: 'Brouillon',
        seconds: brouillonSeconds,
        targetSeconds: timingTargets.brouillonDelaySeconds,
      },
    ].filter(entry => entry.seconds > 0);
    startQuiz(
      playableQuestions,
      exerciseData.title,
      exerciseData.mode || 'standard',
      exerciseData.enonce,
      {
        sessionKind: 'exercise-flow',
        flowType: exerciseData.mode === 'exam' ? 'sujet-type' : 'exercice',
        flowStep: 3,
        flowTotalSteps: 4,
        chapterTitle: exerciseData.chapterTitle,
        chapterNumber: exerciseData.chapterNumber,
        sourceParams: viewParams,
        subjectId,
        shuffleQuestions: false,
        timeLimitSeconds: traitementConfig.timeLimitSeconds || exerciseData.timeLimitSeconds,
        initialScore: traitementConfig.initialScore,
        scoringConfig: {
          ...(traitementConfig.scoring || exerciseData.scoring || {}),
          subjectCoefficient: Math.max(1, Number(exerciseData.subjectCoefficient) || 1),
        },
        scoreScale: traitementConfig.scoring?.scoreScale || exerciseData.scoreScale,
        timing: {
          ...timingTargets,
          ...(flowTiming || {}),
        },
        pageTimes,
        translations: normalizeTranslations(exerciseData.translations),
        prefilledScorePenalty: spentScore,
        subjectCoefficient: Math.max(1, Number(exerciseData.subjectCoefficient) || 1),
      }
    );
  };

  const handleRevealTranslation = useCallback(async () => {
    if (!translationTarget?.translationText || translationBusy || revealedTranslationIds.includes(translationTarget.id)) return;
    setTranslationBusy(true);
    try {
      const ok = await spendTranslationAccess({
        cost: translationTarget.cost,
        energyCost: translationTarget.energyCost,
        data,
        save,
        showToast,
        pushFloatingFx,
        consumeInventoryItem,
      });
      if (!ok) return;
      setRevealedTranslationIds(prev => (prev.includes(translationTarget.id) ? prev : [...prev, translationTarget.id]));
      setSpentScore(prev => prev + translationTarget.scoreCost);
      setScoreFx({ id: Date.now(), amount: translationTarget.scoreCost });
      pushFloatingFx({ kind: 'score', label: 'Score', amount: -translationTarget.scoreCost, positive: false });
    } finally {
      setTranslationBusy(false);
    }
  }, [consumeInventoryItem, data, pushFloatingFx, revealedTranslationIds, save, showToast, translationBusy, translationTarget]);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-xl border-b border-primary/10 px-4 py-2">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => { playClick(); handleBack(); }} className="text-txt-sub active:scale-90 transition-transform">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider">
              {exerciseData.mode === 'exam' ? 'Sujet Type' : 'Exercice'}
            </p>
            <h2 className="font-bold text-sm truncate">{exerciseData.title}</h2>
          </div>
        </div>
        <StepIndicator current={step} steps={STEPS} />
        <div className="flex items-center justify-between gap-3 mt-2 rounded-2xl bg-white/80 border border-primary/10 px-3 py-2 text-[11px] font-semibold text-txt-sub">
          <span>Chrono {step === 0 ? 'Énoncé' : step === 1 ? 'Brouillon' : 'Traitement'}</span>
          <div className="flex items-center gap-2">
            <span className="relative flex items-center gap-1 text-primary-dark"><Zap size={12} className="text-primary" />{remainingScore}{scoreFx ? <span key={scoreFx.id} className="absolute -bottom-3 right-0 text-[9px] font-extrabold text-accent-red animate-bounce">-{scoreFx.amount}</span> : null}</span>
            <span className={`font-extrabold ${currentTargetSeconds > 0 && stepElapsedSeconds >= currentTargetSeconds ? 'text-accent-red' : 'text-primary-dark'}`}>{formatDuration(stepElapsedSeconds)}</span>
            {currentTargetSeconds > 0 ? <span>/ {formatDuration(currentTargetSeconds)}</span> : <span>· libre</span>}
          </div>
        </div>
      </header>

      {/* Page content */}
      {step === 0 && (
        <EnonceePage
          exerciseData={playableExerciseData}
          onContinue={handleEnonceContinue}
          onBack={handleBack}
          playClick={playClick}
          onOpenTranslation={setTranslationTarget}
          questionTranslationPricing={questionTranslationPricing}
        />
      )}

      {step === 1 && (
        <PrionPage
          exerciseData={playableExerciseData}
          onContinue={handlePrionContinue}
          onBack={handleBack}
          playClick={playClick}
          playSpecial={playSpecial}
          showToast={showToast}
          onOpenTranslation={setTranslationTarget}
          questionTranslationPricing={questionTranslationPricing}
          optionTranslationPricing={optionTranslationPricing}
        />
      )}

      <TranslationModal
        open={Boolean(translationTarget)}
        target={translationTarget}
        revealed={Boolean(translationTarget && revealedTranslationIds.includes(translationTarget.id))}
        busy={translationBusy}
        userHintPacks={Math.max(0, Number(data?.user?.inventory?.hints) || 0)}
        userEnergy={Math.max(0, Number(data?.user?.energy) || 0)}
        onReveal={handleRevealTranslation}
        onClose={() => setTranslationTarget(null)}
      />
    </div>
  );
}

/* ── UTILITY ── */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Ensure shuffled is different from original if possible
  if (a.length > 1 && a.every((v, i) => v === arr[i])) {
    [a[0], a[1]] = [a[1], a[0]];
  }
  return a;
}
