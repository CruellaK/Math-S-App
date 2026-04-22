import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { renderMixedContent } from '../components/KaTeXRenderer';
import { TranslationButton, TranslationModal } from '../components/TranslationWidgets';
import SoundEngine from '../lib/sounds';
import { SCORE_CONFIG, SUBJECTS } from '../lib/constants';
import { buildMention, clampRange, getFinalScoreScale } from '../lib/progression';
import {
  buildHints,
  HINT_IMPORTANCE_LABELS,
  HINT_NATURE_LABELS,
  HINT_LEVEL_LABELS,
  HINT_STYLE_LABELS,
  getHintCost,
  getHintInventoryCost,
  getHintInventoryKeys,
} from '../lib/hintSystem';
import { getTranslationText, normalizeTranslations, resolveTranslationPricing } from '../lib/translations';
import { ArrowLeft, HelpCircle, CheckCircle, XCircle, ChevronRight, ChevronUp, ChevronDown, RotateCcw, Star, Zap, Lightbulb, X, Trophy, Coins, Target, Languages, Eye, Lock, Unlock } from 'lucide-react';

/* ═══════════════════════════════════════════════════
   QUIZ VIEW — Page de traitement complète
   Banque de mots, token keyboard, tous types de quiz,
   scoring Duolingo-like, feedback, confetti
   ═══════════════════════════════════════════════════ */

/* ── Confetti helper ── */
let confettiLoaded = null;
async function fireConfetti() {
  try {
    if (!confettiLoaded) confettiLoaded = (await import('canvas-confetti')).default;
    confettiLoaded({ particleCount: 80, spread: 70, origin: { y: 0.7 }, colors: ['#f5b83d', '#22c55e', '#3b82f6', '#8b5cf6'] });
  } catch {}
}

/* ── Normalize for comparison ── */
function norm(s) {
  return (s || '').toString().replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c');
}

function arraysMatch(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => norm(v) === norm(b[i]));
}

function shuffleArray(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function uniqueNormalized(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = norm(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSuggestionPoolEntries(source) {
  return uniqueNormalized([
    ...(Array.isArray(source?.suggestionPool) ? source.suggestionPool : []),
    ...(Array.isArray(source?.suggestions) ? source.suggestions : []),
    ...(Array.isArray(source?.blockSuggestionPool) ? source.blockSuggestionPool : []),
    ...(Array.isArray(source?.blockSuggestions) ? source.blockSuggestions : []),
    ...(Array.isArray(source?.banqueDeSuggestionDeBlocs) ? source.banqueDeSuggestionDeBlocs : []),
    ...(Array.isArray(source?.banqueDeBlocs) ? source.banqueDeBlocs : []),
  ]);
}

function getDynamicBankEntries(source) {
  const rawBank = source?.dynamicBank
    || source?.blockSuggestionBank
    || source?.refreshBank
    || [];

  if (!Array.isArray(rawBank)) return [];

  return rawBank
    .map((entry) => {
      if (Array.isArray(entry)) {
        return {
          size: entry.length,
          options: entry,
        };
      }
      if (Array.isArray(entry?.options)) {
        return {
          size: Number(entry.size) || entry.options.length,
          options: entry.options,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, totalSeconds || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getCorrectText(question) {
  return question.answer || question.correctOrder?.join(' ') || question.correctBlocks?.join(' ') || (question.options && question.options[question.correct]);
}

function getExpectedBlocks(question) {
  if (question.correctBlocks?.length) return question.correctBlocks;
  if (question.correctOrder?.length) return question.correctOrder;
  if (question.suggestions?.length) return question.correctOrder || question.suggestions;
  return [];
}

function getCheckpointLengths(question, expectedBlocks) {
  const raw = question.microSteps || question.checkpoints || [];
  const parsed = raw
    .map(step => (typeof step === 'number' ? step : step?.length ?? step?.targetLength ?? step?.after))
    .map(Number)
    .filter(length => Number.isFinite(length) && length > 0 && length <= expectedBlocks.length);

  if (expectedBlocks.length > 0 && !parsed.includes(expectedBlocks.length)) {
    parsed.push(expectedBlocks.length);
  }

  return [...new Set(parsed)].sort((a, b) => a - b);
}

function buildDynamicBank(question, expectedBlocks, index) {
  if (!expectedBlocks[index]) return [];

  const dynamicBankEntries = getDynamicBankEntries(question);
  const bankConfig = dynamicBankEntries[index] || null;
  const configuredOptions = Array.isArray(bankConfig?.options) ? bankConfig.options : [];

  const fallbackPool = [
    ...getSuggestionPoolEntries(question),
    ...expectedBlocks.filter((_, itemIndex) => itemIndex !== index),
  ];

  const size = Math.max(2, Number(bankConfig?.size || question.bankSize || configuredOptions.length || 4));
  const pool = uniqueNormalized([expectedBlocks[index], ...shuffleArray(configuredOptions.length ? configuredOptions : fallbackPool)]);
  const current = pool.slice(0, Math.min(size, pool.length));

  if (current.length >= 2) return shuffleArray(current);

  return shuffleArray(uniqueNormalized([expectedBlocks[index], ...fallbackPool]).slice(0, Math.min(size, Math.max(2, fallbackPool.length + 1))));
}

function getPenaltyValue(question, sessionScoring, key, fallback) {
  const value = question?.scoring?.[key] ?? question?.[key] ?? sessionScoring?.[key] ?? fallback;
  return Math.max(0, Math.abs(Number(value) || 0));
}

function splitToBlocks(value) {
  return (value || '').toString().split(/\s+/).map(part => part.trim()).filter(Boolean);
}

function trimTrailingEmptyBlocks(blocks = []) {
  const next = [...blocks];
  while (next.length > 0 && !norm(next[next.length - 1])) {
    next.pop();
  }
  return next;
}

function getVisibleBlockAnswer(blocks = []) {
  return trimTrailingEmptyBlocks(blocks).filter(block => norm(block)).join(' ');
}

function getFilledBlockCount(blocks = []) {
  return blocks.reduce((count, block) => count + (norm(block) ? 1 : 0), 0);
}

function getContiguousFilledCount(blocks = [], expectedLength = blocks.length) {
  let count = 0;
  for (let index = 0; index < Math.min(expectedLength, blocks.length); index += 1) {
    if (!norm(blocks[index])) break;
    count += 1;
  }
  return count;
}

function isCompleteBlockSequence(blocks = [], expectedLength = 0) {
  if (!expectedLength || blocks.length < expectedLength) return false;
  for (let index = 0; index < expectedLength; index += 1) {
    if (!norm(blocks[index])) return false;
  }
  return true;
}

function resolveActiveBlockIndex(blocks = [], expectedLength = 0, preferredIndex = null) {
  if (!expectedLength) return -1;
  if (Number.isInteger(preferredIndex)) {
    return clampRange(preferredIndex, 0, expectedLength - 1);
  }
  for (let index = 0; index < expectedLength; index += 1) {
    if (!norm(blocks[index])) return index;
  }
  return -1;
}

function findLastFilledBlockIndex(blocks = []) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (norm(blocks[index])) return index;
  }
  return -1;
}

function evaluateCurrentLineAnswer(line, selectedWords) {
  const expectedBlocks = Array.isArray(line?.correctBlocks) ? line.correctBlocks : [];
  const answerBlocks = trimTrailingEmptyBlocks(Array.isArray(selectedWords) ? selectedWords : []);
  const userAnswer = getVisibleBlockAnswer(answerBlocks);
  const acceptedAnswers = Array.isArray(line?.acceptedAnswers) ? line.acceptedAnswers : [];
  const fullCorrect = isCompleteBlockSequence(answerBlocks, expectedBlocks.length)
    && (norm(userAnswer) === norm(expectedBlocks.join(' '))
      || acceptedAnswers.some(answer => norm(userAnswer) === norm(answer)));

  if (fullCorrect) {
    return { userAnswer, fullCorrect: true, verifyCorrect: true };
  }

  const contiguousCount = getContiguousFilledCount(answerBlocks, expectedBlocks.length);
  const hasGapAfterPrefix = answerBlocks.slice(contiguousCount, expectedBlocks.length).some(block => norm(block));
  const prefixCorrect = contiguousCount > 0
    && !hasGapAfterPrefix
    && answerBlocks.slice(0, contiguousCount).every((block, index) => norm(block) === norm(expectedBlocks[index]));

  return {
    userAnswer,
    fullCorrect: false,
    verifyCorrect: prefixCorrect,
  };
}

function getQuestionSteps(question) {
  if (Array.isArray(question?.brouillon?.steps) && question.brouillon.steps.length) return question.brouillon.steps;
  if (Array.isArray(question?.steps) && question.steps.length) return question.steps;
  return [];
}

function resolveLineStepIndex(line, question, lineIndex, totalLines) {
  const explicitStepIndex = Number(line?.stepIndex);
  if (Number.isInteger(explicitStepIndex) && explicitStepIndex >= 0) return explicitStepIndex;
  const steps = getQuestionSteps(question);
  if (!steps.length) return 0;
  if (steps.length === totalLines) return lineIndex;
  return Math.min(lineIndex, steps.length - 1);
}

function normalizeExerciseFlowLine(line, question, questionIndex, lineIndex) {
  const source = line || {};
  const correctText = getCorrectText(source);
  const expectedBlocks = getExpectedBlocks(source);
  const correctBlocks = expectedBlocks.length ? expectedBlocks : splitToBlocks(correctText);
  const totalLines = Array.isArray(question?.lines) && question.lines.length
    ? question.lines.length
    : Array.isArray(question?.refreshes) && question.refreshes.length
      ? question.refreshes.length
      : Array.isArray(question?.rafraichissements) && question.rafraichissements.length
        ? question.rafraichissements.length
        : 1;
  const stepIndex = resolveLineStepIndex(source, question, lineIndex, totalLines);
  const steps = getQuestionSteps(question);
  const suggestionPool = getSuggestionPoolEntries(source).length
    ? getSuggestionPoolEntries(source)
    : uniqueNormalized(source.options?.filter((_, optionIndex) => optionIndex !== source.correct) || []);
  const refreshLabel = source.refreshLabel || source.rafraichissementLabel || source.lineLabel || source.label || `Rafraîchissement ${lineIndex + 1}`;

  return {
    ...source,
    id: source.id || `${question.id || `exercise-flow-${questionIndex}`}-line-${lineIndex}`,
    type: 'block-input',
    question: source.question || source.prompt || source.refreshPrompt || source.title || refreshLabel,
    prompt: source.prompt || source.refreshPrompt || source.question || source.title || refreshLabel,
    lineLabel: refreshLabel,
    refreshLabel,
    stepIndex,
    stepLabel: source.stepLabel || steps[stepIndex] || `Étape ${stepIndex + 1}`,
    timing: source.timing || {},
    refreshDelaySeconds: resolveTimingSeconds(source.refreshDelaySeconds, source.delaySeconds, source.timing?.refreshDelaySeconds, source.timing?.delaySeconds),
    stepDelaySeconds: resolveTimingSeconds(source.stepDelaySeconds, source.timing?.stepDelaySeconds),
    correctBlocks,
    suggestionPool,
  };
}

function normalizeExerciseFlowQuestion(question, index) {
  const rawLines = Array.isArray(question.lines) && question.lines.length
    ? question.lines
    : Array.isArray(question.refreshes) && question.refreshes.length
      ? question.refreshes
      : Array.isArray(question.rafraichissements) && question.rafraichissements.length
        ? question.rafraichissements
        : [question];

  return {
    ...question,
    id: question.id || `exercise-flow-${index}`,
    type: 'block-input',
    timing: question.timing || {},
    questionDelaySeconds: resolveTimingSeconds(question.questionDelaySeconds, question.delaySeconds, question.timing?.questionDelaySeconds),
    stepDelaySeconds: resolveTimingSeconds(question.stepDelaySeconds, question.timing?.stepDelaySeconds),
    refreshDelaySeconds: resolveTimingSeconds(question.refreshDelaySeconds, question.timing?.refreshDelaySeconds),
    translations: normalizeTranslations(question.translations),
    lines: rawLines.map((line, lineIndex) => normalizeExerciseFlowLine(line, question, index, lineIndex)),
  };
}

function createLineDraft() {
  return {
    selectedWords: [],
    verifiedCheckpoints: [],
    feedbackState: null,
    bankVersion: 0,
    editIndex: null,
    visualBreakBeforeIndices: [],
    verifiedBlockStates: [],
    validatedBlockColors: [],
    completed: false,
    correct: null,
    userAnswer: '',
  };
}

function createExerciseDraft(question) {
  const lines = question?.lines?.length ? question.lines : [question];
  return {
    lineStates: lines.map(() => createLineDraft()),
    currentLineIndex: 0,
    completed: false,
    userAnswer: '',
    touched: false,
  };
}

function getExercisePointValue(entry) {
  const raw = entry?.points ?? entry?.score ?? entry?.maxPoints ?? entry?.scoring?.points;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function distributeExercisePoints(entries = [], totalPoints = 0) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeTotal = Math.max(0, Number(totalPoints) || 0);
  if (!safeEntries.length || safeTotal <= 0) return safeEntries.map(() => 0);

  const explicitValues = safeEntries.map(getExercisePointValue);
  const explicitSum = explicitValues.reduce((sum, value) => sum + (value || 0), 0);
  const missingCount = explicitValues.filter(value => value == null).length;

  if (explicitSum <= 0) {
    const equalShare = safeTotal / safeEntries.length;
    return safeEntries.map(() => equalShare);
  }

  if (explicitSum >= safeTotal) {
    return explicitValues.map(value => (value ? (safeTotal * value) / explicitSum : 0));
  }

  const remaining = Math.max(0, safeTotal - explicitSum);
  const fallbackShare = missingCount > 0 ? remaining / missingCount : 0;
  return explicitValues.map(value => (value == null ? fallbackShare : value));
}

function buildExerciseScorePlan(questions = [], totalMaxScore = 0) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const fallbackTotal = Math.max(0, Number(totalMaxScore) || 0);
  const resolvedTotal = fallbackTotal > 0
    ? fallbackTotal
    : Math.max(20, safeQuestions.length * SCORE_CONFIG.correctBase);
  const questionPoints = distributeExercisePoints(safeQuestions, resolvedTotal);

  return {
    totalMaxScore: resolvedTotal,
    questions: safeQuestions.map((question, questionIndex) => {
      const lines = question?.lines?.length ? question.lines : [question];
      const maxScore = questionPoints[questionIndex] || 0;
      const linePoints = distributeExercisePoints(lines, maxScore);
      return {
        id: question?.id || `exercise-plan-${questionIndex}`,
        maxScore,
        lines: lines.map((line, lineIndex) => ({
          id: line?.id || `${question?.id || questionIndex}-line-${lineIndex}`,
          maxScore: linePoints[lineIndex] || 0,
        })),
      };
    }),
  };
}

function computeExerciseEarnedScore(questionStates = [], scorePlan = {}) {
  return (scorePlan.questions || []).reduce((questionSum, questionPlan, questionIndex) => {
    const lineStates = questionStates[questionIndex]?.lineStates || [];
    const earnedQuestionScore = (questionPlan.lines || []).reduce((lineSum, linePlan, lineIndex) => {
      const lineState = lineStates[lineIndex];
      return lineSum + (lineState?.correct === true ? (Number(linePlan.maxScore) || 0) : 0);
    }, 0);
    return questionSum + earnedQuestionScore;
  }, 0);
}

function buildQuestionUserAnswer(question, lineStates = []) {
  return (question?.lines || []).map((line, lineIndex) => {
    const state = lineStates[lineIndex] || createLineDraft();
    return state.userAnswer || getVisibleBlockAnswer(state.selectedWords);
  }).filter(Boolean).join('\n');
}

function buildVisualRows(sourceBlocks = [], breakBeforeIndices = []) {
  const visibleBreaks = new Set(
    (Array.isArray(breakBeforeIndices) ? breakBeforeIndices : [])
      .map(Number)
      .filter(index => Number.isInteger(index) && index > 0 && index < sourceBlocks.length)
  );
  const rows = [[]];

  sourceBlocks.forEach((block, blockIndex) => {
    if (!norm(block)) return;
    if (visibleBreaks.has(blockIndex) && rows[rows.length - 1].length > 0) {
      rows.push([]);
    }
    rows[rows.length - 1].push({ value: block, blockIndex });
  });

  return rows.filter(row => row.length > 0);
}

const VIVID_BLOCK_COLORS = [
  { backgroundColor: '#ef4444', color: '#ffffff', borderColor: '#b91c1c' },
  { backgroundColor: '#f97316', color: '#ffffff', borderColor: '#c2410c' },
  { backgroundColor: '#eab308', color: '#111827', borderColor: '#ca8a04' },
  { backgroundColor: '#22c55e', color: '#ffffff', borderColor: '#15803d' },
  { backgroundColor: '#06b6d4', color: '#ffffff', borderColor: '#0891b2' },
  { backgroundColor: '#3b82f6', color: '#ffffff', borderColor: '#1d4ed8' },
  { backgroundColor: '#8b5cf6', color: '#ffffff', borderColor: '#6d28d9' },
  { backgroundColor: '#ec4899', color: '#ffffff', borderColor: '#be185d' },
];

function getBlockVerificationStates(expectedBlocks = [], selectedWords = []) {
  const answerBlocks = Array.isArray(selectedWords) ? selectedWords : [];
  const maxLength = Math.max(expectedBlocks.length, answerBlocks.length);
  return Array.from({ length: maxLength }, (_, index) => {
    const value = answerBlocks[index];
    if (!norm(value)) return null;
    return norm(value) === norm(expectedBlocks[index]) ? 'correct' : 'wrong';
  });
}

function clearPersistedBlockDecorations(lineState, nextWords = [], clearedIndex = -1) {
  const verifiedBlockStates = [...(lineState?.verifiedBlockStates || [])];
  const validatedBlockColors = [...(lineState?.validatedBlockColors || [])];

  if (Number.isInteger(clearedIndex) && clearedIndex >= 0) {
    verifiedBlockStates[clearedIndex] = null;
    validatedBlockColors[clearedIndex] = null;
  }

  verifiedBlockStates.length = nextWords.length;
  validatedBlockColors.length = nextWords.length;

  return {
    verifiedBlockStates,
    validatedBlockColors,
  };
}

function buildValidatedBlockColors(blocks = []) {
  const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
  return normalizedBlocks.map((block, index) => {
    if (!norm(block)) return null;
    const seed = Math.floor(Math.random() * VIVID_BLOCK_COLORS.length);
    return VIVID_BLOCK_COLORS[(seed + index) % VIVID_BLOCK_COLORS.length];
  });
}

function getBlockVisualStyle({ tone, verificationState, validatedColor }) {
  const baseStyle = validatedColor
    ? {
        backgroundColor: validatedColor.backgroundColor,
        color: validatedColor.color,
        borderColor: validatedColor.borderColor,
      }
    : tone === 'completed'
      ? { backgroundColor: '#22c55e', color: '#ffffff', borderColor: '#16a34a' }
      : tone === 'current'
        ? { backgroundColor: '#f5b83d', color: '#ffffff', borderColor: '#d29a2b' }
        : { backgroundColor: '#f3f4f6', color: '#1f2937', borderColor: '#e5e7eb' };

  if (verificationState === 'correct') {
    return {
      ...baseStyle,
      boxShadow: '0 0 0 2px rgba(34,197,94,0.95), 0 0 18px rgba(34,197,94,0.45)',
    };
  }

  if (verificationState === 'wrong') {
    return {
      ...baseStyle,
      borderColor: validatedColor?.borderColor || baseStyle.borderColor,
      boxShadow: '0 0 0 2px rgba(239,68,68,0.95), 0 0 18px rgba(239,68,68,0.45)',
    };
  }

  return baseStyle;
}

function findNextIncompleteQuestionIndex(states, currentIndex) {
  const forwardIndex = states.findIndex((state, index) => index > currentIndex && !state.completed);
  if (forwardIndex >= 0) return forwardIndex;
  return states.findIndex((state, index) => index !== currentIndex && !state.completed);
}

function upsertResult(results, nextResult) {
  return [...results.filter(result => result.questionIdx !== nextResult.questionIdx), nextResult]
    .sort((a, b) => a.questionIdx - b.questionIdx);
}

function renderBlockValue(block, preferMath = false) {
  const value = (block || '').toString();
  const alreadyMath = /^\$.*\$$/.test(value.trim());
  return renderMixedContent(preferMath && !alreadyMath ? `$${value}$` : value);
}

function renderFeedbackValue(value, preferMath = false) {
  const text = (value || '').toString();
  const alreadyMath = /^\$.*\$$/.test(text.trim()) || /\$\$.*\$\$/.test(text.trim());
  const looksFormulaOnly = /[=+\-*/^_\\()[\]{}]/.test(text)
    && !/[.!?]/.test(text)
    && !/[A-Za-zÀ-ÿ]{4,}/.test(text);
  return renderMixedContent(preferMath && looksFormulaOnly && !alreadyMath ? `$${text}$` : text);
}

function buildTranslationTarget({ id, title, raw, cost, energyCost, scoreCost }) {
  const translationText = getTranslationText(raw, 'mg');
  return {
    id,
    title,
    translationText,
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
  pushFloatingFx([{ kind: 'energy', label: 'Énergie', amount: -safeEnergyCost, positive: false }]);
  showToast(`Traduction révélée · ${safeEnergyCost} énergie`, 'info');
  return true;
}

/* ══════════════════════════════════════════════════════
   TRANSLATE PANEL — Traduction malgache (mg)
   ══════════════════════════════════════════════════════ */
function TranslatePanel({ question, data, save, showToast, pushFloatingFx, consumeInventoryItem }) {
  const [showQuestionMg, setShowQuestionMg] = useState(false);
  const [revealedOptions, setRevealedOptions] = useState([]);
  const mgData = question?.mg;
  const hasMgQuestion = Boolean(mgData?.question || mgData?.text);
  const hasMgOptions = Array.isArray(mgData?.options) && mgData.options.length > 0;
  if (!hasMgQuestion && !hasMgOptions) return null;

  const userEnergy = data?.user?.energy || 0;
  const userTranslationPacks = Math.max(0, Number(data?.user?.inventory?.translations) || 0);

  const spendTranslation = async (cost) => {
    const safeCost = Math.max(1, Math.round(Number(cost) || 0));
    if (userTranslationPacks >= safeCost && typeof consumeInventoryItem === 'function') {
      const consumed = await consumeInventoryItem('translations', safeCost);
      if (consumed) {
        showToast(`Traduction révélée · ${safeCost} pass${safeCost > 1 ? 's' : ''} traduction`, 'info');
        return true;
      }
    }
    if (userEnergy < cost) {
      showToast(`Il faut ${safeCost} pass${safeCost > 1 ? 's' : ''} traduction ou ${safeCost} énergie`, 'error');
      return false;
    }
    const nextUser = { ...data.user, energy: Math.max(0, userEnergy - safeCost) };
    save({ ...data, user: nextUser });
    pushFloatingFx([{ kind: 'energy', label: 'Énergie', amount: -safeCost, positive: false }]);
    showToast(`Traduction révélée · ${safeCost} énergie`, 'info');
    return true;
  };

  const revealQuestion = async () => {
    if (showQuestionMg) return;
    if (await spendTranslation(SCORE_CONFIG.translateQuestionCost)) {
      setShowQuestionMg(true);
    }
  };

  const revealOption = async (idx) => {
    if (revealedOptions.includes(idx)) return;
    if (await spendTranslation(SCORE_CONFIG.translateOptionCost)) {
      setRevealedOptions(prev => [...prev, idx]);
    }
  };

  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-cyan-700">
        <Languages size={14} />
        <span>Dikany Malagasy</span>
      </div>
      {hasMgQuestion && (
        showQuestionMg ? (
          <div className="text-sm text-cyan-900 leading-relaxed">{renderMixedContent(mgData.question || mgData.text)}</div>
        ) : (
          <button onClick={revealQuestion} className="w-full text-left px-3 py-2 rounded-xl bg-cyan-100 text-cyan-700 text-xs font-semibold active:scale-95 transition-transform">
            Traduire la question ({SCORE_CONFIG.translateQuestionCost} pass ou {SCORE_CONFIG.translateQuestionCost} énergie)
          </button>
        )
      )}
      {hasMgOptions && (
        <div className="flex flex-wrap gap-2">
          {mgData.options.map((opt, idx) => (
            revealedOptions.includes(idx) ? (
              <span key={idx} className="px-2.5 py-1.5 rounded-xl bg-cyan-100 text-cyan-900 text-xs font-semibold">{renderMixedContent(opt)}</span>
            ) : (
              <button key={idx} onClick={() => revealOption(idx)} className="px-2.5 py-1.5 rounded-xl bg-white border border-cyan-200 text-cyan-600 text-xs font-semibold active:scale-95 transition-transform">
                Option {idx + 1} ({SCORE_CONFIG.translateOptionCost} pass ou {SCORE_CONFIG.translateOptionCost} énergie)
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}

function getQuestionTitle(question, index) {
  if (typeof question?.question === 'string' && question.question.trim()) return question.question.trim();
  if (typeof question?.title === 'string' && question.title.trim()) return question.title.trim();
  return `Question ${index + 1}`;
}

function buildStars(scorePercent) {
  if (scorePercent >= 90) return 3;
  if (scorePercent >= 70) return 2;
  if (scorePercent >= 50) return 1;
  return 0;
}

function roundMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
}

function resolveTimingSeconds(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  }
  return 0;
}

function resolveSubjectName(subjectId) {
  return SUBJECTS.find(subject => Number(subject.id) === Number(subjectId))?.name || '';
}

function sanitizeDetailedTimingEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => {
      const seconds = Math.max(0, Math.round(Number(entry?.seconds) || 0));
      if (!seconds) return null;
      return {
        ...entry,
        id: entry?.id || entry?.key || `${index}`,
        label: entry?.label || `Mesure ${index + 1}`,
        seconds,
        targetSeconds: resolveTimingSeconds(entry?.targetSeconds),
      };
    })
    .filter(Boolean);
}

function buildSessionSummary({
  title,
  sessionKind,
  quizMode,
  flowType,
  score,
  maxScore,
  results,
  totalQuestions,
  hintsUsed,
  timeSpentSeconds,
  timeLimitSeconds,
  timeFailed,
  verifyCount,
  goodVerifications,
  badVerifications,
  mandatoryCheckpointsPassed,
  mandatoryCheckpointsTotal,
  questionTimes,
  microStepTimes,
  pageTimes,
  stepTimes,
  refreshTimes,
  timing,
  scoreScale,
  subjectId,
  subjectName,
  subjectCoefficient,
  averageWeight,
  fireMultiplier,
}) {
  const correct = results.filter(result => result.correct).length;
  const safeMaxScore = Math.max(0, Number(maxScore) || 0);
  const safeScore = Math.max(0, Number(score) || 0);
  const scorePercent = safeMaxScore > 0 ? Math.round((safeScore / safeMaxScore) * 100) : 0;
  const finalScoreScale = getFinalScoreScale(scoreScale);
  const displayScore = Math.round((scorePercent / 100) * finalScoreScale);
  const starsEarned = buildStars(scorePercent);
  const safeAverageWeight = Math.max(1, Number(averageWeight) || 1);
  const safeFireMultiplier = Math.max(1, Number(fireMultiplier) || 1);
  const safeSubjectCoefficient = Math.max(1, Number(subjectCoefficient) || 1);
  const mandatorySuccessRate = mandatoryCheckpointsTotal > 0
    ? Math.round((mandatoryCheckpointsPassed / mandatoryCheckpointsTotal) * 100)
    : 0;
  const safeQuestionTimes = (Array.isArray(questionTimes) ? questionTimes : []).map((entry, index) => ({
    ...entry,
    questionIdx: Number.isInteger(entry?.questionIdx) ? entry.questionIdx : index,
    title: entry?.title || `Question ${index + 1}`,
    seconds: Math.max(0, Math.round(Number(entry?.seconds) || 0)),
    verifyAttempts: Math.max(0, Math.round(Number(entry?.verifyAttempts) || 0)),
    goodVerifications: Math.max(0, Math.round(Number(entry?.goodVerifications) || 0)),
    badVerifications: Math.max(0, Math.round(Number(entry?.badVerifications) || 0)),
    targetSeconds: resolveTimingSeconds(entry?.targetSeconds),
  })).filter(entry => entry.seconds > 0 || entry.verifyAttempts > 0);
  const safePageTimes = sanitizeDetailedTimingEntries(pageTimes);
  const safeStepTimes = sanitizeDetailedTimingEntries(stepTimes);
  const safeRefreshTimes = sanitizeDetailedTimingEntries(refreshTimes);
  const questionSeconds = safeQuestionTimes.map(entry => Number(entry.seconds) || 0);
  const averageQuestionSeconds = questionSeconds.length
    ? Math.round(questionSeconds.reduce((sum, value) => sum + value, 0) / questionSeconds.length)
    : 0;
  const averageStepSeconds = safeStepTimes.length
    ? Math.round(safeStepTimes.reduce((sum, entry) => sum + entry.seconds, 0) / safeStepTimes.length)
    : 0;
  const averageRefreshSeconds = safeRefreshTimes.length
    ? Math.round(safeRefreshTimes.reduce((sum, entry) => sum + entry.seconds, 0) / safeRefreshTimes.length)
    : 0;
  const overtimeSeconds = timeLimitSeconds ? Math.max(0, timeSpentSeconds - timeLimitSeconds) : 0;
  const timeBonus = timeLimitSeconds && !timeFailed
    ? Math.max(0, Math.round((timeLimitSeconds - timeSpentSeconds) / Math.max(30, totalQuestions * 20 || 30)))
    : 0;
  const verificationOveruse = Math.max(0, verifyCount - totalQuestions);
  const verificationPenalty20 = (badVerifications * 0.35) + (verificationOveruse * 0.12);
  const hintPenalty20 = hintsUsed * 0.25;
  const overtimePenalty20 = timeFailed ? Math.min(3, overtimeSeconds / 300) : 0;
  const paceBonus20 = timeLimitSeconds && !timeFailed
    ? Math.min(0.8, ((timeLimitSeconds - timeSpentSeconds) / Math.max(timeLimitSeconds, 1)) * 2)
    : 0;
  const average20 = roundMetric(clampRange(((scorePercent / 100) * 20) - verificationPenalty20 - hintPenalty20 - overtimePenalty20 + paceBonus20, 0, 20));
  const rawXp = (correct * 8)
    + Math.round(average20)
    + timeBonus
    - (hintsUsed * 4)
    - (verifyCount * 2)
    - (badVerifications * 3);
  const xpDelta = Math.max(
    0,
    Math.max(correct > 0 ? 2 : 0, rawXp)
  );

  let creditsDelta = 0;
  if (average20 >= 17) creditsDelta = 14;
  else if (average20 >= 15) creditsDelta = 10;
  else if (average20 >= 12) creditsDelta = 6;
  else if (average20 >= 10) creditsDelta = 3;

  if (badVerifications === 0 && hintsUsed === 0 && correct === totalQuestions && totalQuestions > 0) {
    creditsDelta += 6;
  }

  // Anti-triche : pénaliser les sessions avec abus d'indices, dépassement, ou verifications excessives.
  const hintsPerQuestion = totalQuestions > 0 ? hintsUsed / totalQuestions : 0;
  if (hintsPerQuestion >= 1.5) {
    // Plus de 1,5 indice par question : aucun crédit gagné.
    creditsDelta = 0;
  } else if (hintsPerQuestion >= 1) {
    creditsDelta = Math.round(creditsDelta / 2);
  }
  if (timeFailed) {
    creditsDelta = Math.round(creditsDelta / 2);
  }
  if (verificationOveruse > totalQuestions) {
    // Plus de 2x les vérifications attendues : crédits plafonnés.
    creditsDelta = Math.min(creditsDelta, 3);
  }
  // Plafond absolu par session pour éviter le farming.
  creditsDelta = Math.max(0, Math.min(20, creditsDelta));

  const baseEnergyDelta = timeLimitSeconds
    ? (timeFailed
      ? -Math.min(12, Math.max(4, Math.round(overtimeSeconds / 60)))
      : Math.min(8, Math.max(2, Math.round((timeLimitSeconds - timeSpentSeconds) / Math.max(60, totalQuestions * 20 || 60)))))
    : (average20 >= 15 ? 2 : average20 >= 10 ? 1 : -2);
  // L'énergie perd aussi à chaque vérification excessive et par indice demandé.
  const energyDelta = Math.max(-20, Math.min(10,
    baseEnergyDelta
    - Math.min(6, Math.max(0, verificationOveruse))
    - Math.min(6, Math.round(hintsUsed * 1.5))
  ));

  const baseFireDelta = correct === totalQuestions && badVerifications === 0
    ? Math.max(1, Math.round((goodVerifications + totalQuestions) / Math.max(1, totalQuestions)))
    : (goodVerifications > badVerifications ? 1 : -Math.max(1, badVerifications || (totalQuestions - correct)));
  const fireDelta = baseFireDelta > 0 ? baseFireDelta * safeFireMultiplier : baseFireDelta;

  return {
    recordedAt: new Date().toISOString(),
    title,
    sessionKind: sessionKind || 'quiz',
    quizMode: (quizMode || '').toString(),
    flowType: flowType || 'quiz',
    subjectId: subjectId ?? null,
    subjectName: subjectName || resolveSubjectName(subjectId),
    subjectCoefficient: safeSubjectCoefficient,
    score: safeScore,
    maxScore: safeMaxScore,
    scorePercent,
    scoreScale: finalScoreScale,
    displayScore,
    average20,
    correct,
    totalQuestions,
    hintsUsed,
    verifyCount,
    goodVerifications,
    badVerifications,
    mandatoryCheckpointsPassed,
    mandatoryCheckpointsTotal,
    mandatorySuccessRate,
    optionalCheckpointsValidated: microStepTimes.length,
    timeSpentSeconds,
    timeLimitSeconds,
    timeFailed,
    overtimeSeconds,
    averageQuestionSeconds,
    averageStepSeconds,
    averageRefreshSeconds,
    questionTimes: safeQuestionTimes,
    microStepTimes,
    pageTimes: safePageTimes,
    stepTimes: safeStepTimes,
    refreshTimes: safeRefreshTimes,
    timing: {
      enonceDelaySeconds: resolveTimingSeconds(timing?.enonceDelaySeconds),
      brouillonDelaySeconds: resolveTimingSeconds(timing?.brouillonDelaySeconds),
      treatmentDelaySeconds: resolveTimingSeconds(timing?.treatmentDelaySeconds),
      questionDelaySeconds: resolveTimingSeconds(timing?.questionDelaySeconds),
      stepDelaySeconds: resolveTimingSeconds(timing?.stepDelaySeconds),
      refreshDelaySeconds: resolveTimingSeconds(timing?.refreshDelaySeconds),
    },
    xpDelta,
    creditsDelta,
    globalScoreDelta: Math.max(0, displayScore),
    energyDelta,
    fireDelta,
    averageWeight: safeAverageWeight,
    averageDelta: roundMetric(average20, 1),
    starsEarned,
    mention: buildMention(scorePercent),
    results,
  };
}

/* ══════════════════════════════════════════════════════
   WORD BANK COMPONENT — Banque de mots exacte
   ══════════════════════════════════════════════════════ */
function WordBank({ suggestions, selectedWords, onToggleWord, animate }) {
  return (
    <div className="space-y-3">
      {/* Selected area */}
      <div className="min-h-[56px] p-3 rounded-xl bg-white border-2 border-dashed border-primary/30 flex flex-wrap gap-2 items-center">
        {selectedWords.length === 0 && (
          <span className="text-xs text-txt-muted italic">Appuyez sur les mots pour écrire...</span>
        )}
        {selectedWords.map((w, i) => (
          <button
            key={`sel-${i}`}
            onClick={() => onToggleWord(w, false)}
            className={`px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold shadow-bouncy btn-bounce ${animate ? 'animate-token-pop' : ''}`}
          >
            {renderMixedContent(w)}
          </button>
        ))}
      </div>

      {/* Available words */}
      <div className="flex flex-wrap gap-2 justify-center">
        {suggestions.map((w, i) => {
          const used = selectedWords.includes(w);
          return (
            <button
              key={`sug-${i}`}
              onClick={() => { if (!used) onToggleWord(w, true); }}
              disabled={used}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-bouncy btn-bounce transition-all ${
                used
                  ? 'bg-gray-100 text-gray-300 shadow-none cursor-default'
                  : 'bg-white border border-gray-200 text-txt-main active:scale-95'
              }`}
            >
              {renderMixedContent(w)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeExpiredModal({ open, onFinish, onContinue }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] bg-black/45 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-xl animate-scale-in space-y-4">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent-red/10 flex items-center justify-center">
            <span className="text-2xl">⏰</span>
          </div>
          <h3 className="font-extrabold text-lg">Temps écoulé !</h3>
          <p className="text-sm text-txt-sub">Vous pouvez terminer maintenant ou continuer pour vous entraîner. Le délai sera marqué comme échoué dans les statistiques.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onFinish} className="flex-1 py-3 rounded-xl bg-accent-red text-white font-bold text-sm active:scale-95 transition-transform">
            Terminer
          </button>
          <button onClick={onContinue} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-gold btn-bounce active:scale-95 transition-transform">
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MATH TOKEN KEYBOARD — Clavier tokens mathématiques
   ══════════════════════════════════════════════════════ */
const MATH_KEYS = [
  { label: '+', val: '+', type: 'op' },
  { label: '−', val: '-', type: 'op' },
  { label: '×', val: '\\times', type: 'op' },
  { label: '÷', val: '\\div', type: 'op' },
  { label: '=', val: '=', type: 'op' },
  { label: '(', val: '(', type: 'op' },
  { label: ')', val: ')', type: 'op' },
  { label: 'x', val: 'x', type: 'var' },
  { label: 'y', val: 'y', type: 'var' },
  { label: 'z', val: 'z', type: 'var' },
  { label: '²', val: '^2', type: 'op' },
  { label: '√', val: '\\sqrt{}', type: 'func' },
  { label: 'π', val: '\\pi', type: 'var' },
  { label: 'frac', val: '\\frac{}{}', type: 'func' },
  { label: 'lim', val: '\\lim', type: 'func' },
  { label: '∫', val: '\\int', type: 'func' },
  { label: 'sin', val: '\\sin', type: 'func' },
  { label: 'cos', val: '\\cos', type: 'func' },
  { label: 'ln', val: '\\ln', type: 'func' },
  { label: '∞', val: '\\infty', type: 'var' },
];

const NUM_KEYS = ['0','1','2','3','4','5','6','7','8','9','.'];

function MathTokenKeyboard({ tokens, setTokens, correctBlocks, suggestionPool }) {
  const [showKeyboard, setShowKeyboard] = useState(false);

  const handleInsert = useCallback((val, type) => {
    SoundEngine.playInsert(type);
    setTokens(prev => [...prev, val]);
  }, [setTokens]);

  const handleDelete = useCallback(() => {
    SoundEngine.playDelete();
    setTokens(prev => prev.slice(0, -1));
  }, [setTokens]);

  const handleSuggestion = useCallback((block) => {
    SoundEngine.playInsert('func');
    setTokens(prev => [...prev, block]);
  }, [setTokens]);

  /* Build pool: correct blocks + distractors, shuffled once */
  const allSuggestions = useMemo(() => {
    const pool = [...(correctBlocks || []), ...(suggestionPool || [])];
    const unique = [...new Set(pool)];
    return unique.sort(() => Math.random() - 0.5);
  }, [correctBlocks, suggestionPool]);

  return (
    <div className="space-y-3">
      {/* Token display area */}
      <div
        onClick={() => setShowKeyboard(true)}
        className="min-h-[56px] p-3 rounded-xl bg-white border-2 border-primary/30 flex flex-wrap gap-1.5 items-center cursor-text"
      >
        {tokens.length === 0 && (
          <span className="text-xs text-txt-muted italic">Touche ici pour écrire...</span>
        )}
        {tokens.map((t, i) => (
          <span key={i} className="px-2 py-1 rounded-lg bg-primary/10 text-primary-dark text-sm font-semibold animate-token-pop">
            {renderMixedContent(`$${t}$`)}
          </span>
        ))}
        <span className="w-0.5 h-5 bg-primary animate-pulse rounded" />
      </div>

      {/* Math block suggestions */}
      {allSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allSuggestions.map((block, i) => {
            const used = tokens.includes(block);
            return (
              <button
                key={i}
                onClick={() => { if (!used) handleSuggestion(block); }}
                disabled={used}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-bouncy btn-bounce transition-all ${
                  used ? 'bg-gray-100 text-gray-300 shadow-none' : 'bg-white border border-primary/20 text-txt-main'
                }`}
              >
                {renderMixedContent(`$${block}$`)}
              </button>
            );
          })}
        </div>
      )}

      {/* Full keyboard */}
      {showKeyboard && (
        <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-card animate-kb-up space-y-2">
          {/* Number row */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {NUM_KEYS.map(k => (
              <button key={k} onClick={() => handleInsert(k, 'num')}
                className="w-9 h-9 rounded-lg bg-gray-50 text-sm font-bold flex items-center justify-center active:scale-90 active:bg-primary/10 transition-all">
                {k}
              </button>
            ))}
          </div>
          {/* Math keys */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {MATH_KEYS.map(k => (
              <button key={k.label} onClick={() => handleInsert(k.val, k.type)}
                className="px-2.5 h-9 rounded-lg bg-gray-50 text-xs font-bold flex items-center justify-center active:scale-90 active:bg-primary/10 transition-all">
                {k.label}
              </button>
            ))}
          </div>
          {/* Actions row */}
          <div className="flex gap-2 justify-center">
            <button onClick={handleDelete} className="px-4 py-2 rounded-lg bg-accent-red/10 text-accent-red text-xs font-bold active:scale-95">
              ← Suppr
            </button>
            <button onClick={() => setShowKeyboard(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-txt-sub text-xs font-bold active:scale-95">
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MCQ COMPONENT
   ══════════════════════════════════════════════════════ */
function MCQ({ question, onAnswer, onTranslateOption }) {
  const [selected, setSelected] = useState(null);

  const handle = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
    const isCorrect = idx === question.correct;
    setTimeout(() => onAnswer(isCorrect, question.options[idx]), 400);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
        <p className="text-[11px] font-extrabold text-primary-dark uppercase tracking-wider">Mode Suggestion · QCM classique</p>
        <p className="text-xs text-txt-sub mt-1">Lis chaque proposition complète, puis sélectionne l’unique bonne réponse parmi {question.options.length}.</p>
      </div>
      {question.options.map((opt, i) => {
        let cls = 'bg-white border border-gray-200 text-txt-main';
        if (selected !== null) {
          if (i === question.correct) cls = 'bg-accent-green/10 border-accent-green text-accent-green';
          else if (i === selected) cls = 'bg-accent-red/10 border-accent-red text-accent-red animate-shake';
        }
        return (
          <div key={i} className="flex items-start gap-2">
            <button onClick={() => handle(i)}
              className={`flex-1 p-4 rounded-xl text-left font-semibold text-sm shadow-bouncy btn-bounce transition-all ${cls}`}>
              <div className="flex items-start gap-3">
                <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary-dark text-xs font-extrabold">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1 leading-relaxed">{renderMixedContent(opt)}</span>
              </div>
            </button>
            <div className="shrink-0 pt-3">
              <TranslationButton onClick={() => onTranslateOption?.(i)} title={`Traduction de l’option ${String.fromCharCode(65 + i)}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   TRAP COMPONENT — MCQ single-select avec option vide
   ══════════════════════════════════════════════════════ */
function TrapQuestion({ question, onAnswer, onTranslateOption }) {
  const [selected, setSelected] = useState(null);
  const items = Array.isArray(question.items) ? question.items : [];
  const correctIndex = typeof question.correct === 'number' ? question.correct : -1;
  const traps = Array.isArray(question.traps) ? question.traps : [];
  const emptyIndex = typeof question.emptyIndex === 'number' ? question.emptyIndex : items.findIndex(item => !norm(item));

  const handle = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
    const isCorrect = idx === correctIndex;
    setTimeout(() => onAnswer(isCorrect, items[idx] || ''), 400);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-accent-red/20 bg-accent-red/5 px-4 py-3">
        <p className="text-[11px] font-extrabold text-accent-red uppercase tracking-wider">Mode Pièges · QCM avec option vide</p>
        <p className="text-xs text-txt-sub mt-1">Une seule proposition est juste. Choisis l’option « Aucune » si toutes sont piégées.</p>
      </div>
      {items.map((item, i) => {
        const isEmpty = i === emptyIndex || !norm(item);
        const isCorrect = i === correctIndex;
        const isTrap = traps.includes(i);
        let cls = 'bg-white border border-gray-200 text-txt-main';
        if (selected !== null) {
          if (isCorrect) cls = 'bg-accent-green/10 border-accent-green text-accent-green';
          else if (i === selected) cls = 'bg-accent-red/10 border-accent-red text-accent-red animate-shake';
        }
        return (
          <div key={i} className="flex items-start gap-2">
            <button onClick={() => handle(i)}
              disabled={selected !== null}
              className={`flex-1 p-4 rounded-xl text-left font-semibold text-sm shadow-bouncy btn-bounce transition-all ${cls}`}>
              <div className="flex items-start gap-3">
                <span className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-extrabold ${isEmpty ? 'bg-gray-200 text-txt-muted' : 'bg-accent-red/10 text-accent-red'}`}>
                  {isEmpty ? '∅' : String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1 leading-relaxed">
                  {isEmpty
                    ? <em className="text-txt-muted font-semibold">Aucune proposition n’est juste</em>
                    : renderMixedContent(item)}
                  {selected !== null && isTrap && i !== correctIndex && (
                    <span className="block text-[10px] text-accent-red mt-1 font-bold">Piège</span>
                  )}
                </span>
              </div>
            </button>
            {!isEmpty ? (
              <div className="shrink-0 pt-3">
                <TranslationButton onClick={() => onTranslateOption?.(i)} title={`Traduction de l’option ${String.fromCharCode(65 + i)}`} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function InputQuestion({ question, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const options = Array.isArray(question.options) ? question.options.slice(0, 4) : [];
  const preferMath = Boolean(question.preferMath);
  const acceptedAnswers = useMemo(() => uniqueNormalized([
    ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : []),
    question.answer,
  ]), [question.acceptedAnswers, question.answer]);

  useEffect(() => {
    setSelected(null);
  }, [question]);

  const handleSelect = (index) => {
    if (selected !== null) return;
    const value = options[index];
    setSelected(index);
    const correct = typeof question.correct === 'number'
      ? index === question.correct
      : acceptedAnswers.some((answer) => norm(value) === norm(answer));
    setTimeout(() => onAnswer(correct, value), 350);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/5 px-4 py-3">
        <p className="text-[11px] font-extrabold text-accent-blue uppercase tracking-wider">Mode Input Blocs · Choix rapide</p>
        <p className="text-xs text-txt-sub mt-1">Touche directement le bloc court qui complète l’énoncé — {options.length || 0} blocs proposés, pas de clavier.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option, index) => {
          let cls = 'bg-white border-2 border-accent-blue/20 text-accent-blue';
          if (selected !== null) {
            if (index === question.correct) cls = 'bg-accent-green/10 border-2 border-accent-green text-accent-green';
            else if (index === selected) cls = 'bg-accent-red/10 border-2 border-accent-red text-accent-red animate-shake';
          }

          return (
            <button
              key={`${index}-${option}`}
              onClick={() => handleSelect(index)}
              disabled={selected !== null}
              className={`min-h-[4.5rem] px-3 py-3 rounded-2xl text-base font-extrabold shadow-bouncy btn-bounce transition-all active:scale-95 ${cls}`}
            >
              {renderBlockValue(option, preferMath)}
            </button>
          );
        })}
      </div>
      {question.helperText ? (
        <p className="text-[11px] text-txt-sub leading-relaxed">{question.helperText}</p>
      ) : null}
    </div>
  );
}

function DuelIntrusQuestion({ question, onAnswer, onTranslateOption }) {
  const [selected, setSelected] = useState(null);
  const preferMath = Boolean(question.preferMath);

  useEffect(() => {
    setSelected(null);
  }, [question]);

  const handleSelect = (index) => {
    if (selected !== null) return;
    setSelected(index);
    const value = question.options?.[index] || '';
    setTimeout(() => onAnswer(index === question.correct, value), 350);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-accent-red/15 bg-accent-red/5 px-4 py-3">
        <p className="text-[11px] font-bold text-accent-red uppercase tracking-wider">Duel de l&apos;Intrus</p>
        <p className="text-xs text-txt-sub mt-1">Deux blocs presque jumeaux. Un seul est parfaitement correct.</p>
      </div>
      <div className="space-y-3">
        {(question.options || []).map((option, index) => {
          let cls = 'bg-white border border-gray-200 text-txt-main';
          if (selected !== null) {
            if (index === question.correct) cls = 'bg-accent-green/10 border-accent-green text-accent-green';
            else if (index === selected) cls = 'bg-accent-red/10 border-accent-red text-accent-red animate-shake';
          }

          return (
            <div key={`${index}-${option}`} className="flex items-start gap-2">
              <button
                onClick={() => handleSelect(index)}
                disabled={selected !== null}
                className={`flex-1 px-4 py-4 rounded-2xl text-left text-sm font-semibold shadow-bouncy btn-bounce transition-all active:scale-[0.99] ${cls}`}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-black/5 text-xs font-extrabold">
                    {index + 1}
                  </span>
                  <span className="flex-1 min-w-0">{renderBlockValue(option, preferMath)}</span>
                </div>
              </button>
              <div className="shrink-0 pt-3">
                <TranslationButton onClick={() => onTranslateOption?.(index)} title={`Traduction du bloc ${index + 1}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeminageQuestion({ question, onAnswer }) {
  const [currentBlocks, setCurrentBlocks] = useState(() => [...(question.prefilledBlocks || [])]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const preferMath = Boolean(question.preferMath);
  const correctBlocks = Array.isArray(question.correctBlocks) ? question.correctBlocks : [];
  const suggestionPool = useMemo(() => uniqueNormalized([
    ...(Array.isArray(question.suggestionPool) ? question.suggestionPool : []),
    ...correctBlocks,
  ]), [question.suggestionPool, correctBlocks]);
  const canSubmit = currentBlocks.length > 0 && currentBlocks.every((block) => norm(block));

  useEffect(() => {
    setCurrentBlocks([...(question.prefilledBlocks || [])]);
    setSelectedIndex(null);
    setSubmitted(false);
  }, [question]);

  const clearSelected = () => {
    if (submitted || selectedIndex == null) return;
    SoundEngine.playDelete();
    setCurrentBlocks((prev) => prev.map((block, index) => (index === selectedIndex ? '' : block)));
  };

  const applyBlock = (block) => {
    if (submitted || selectedIndex == null) return;
    SoundEngine.playInsert(preferMath ? 'func' : 'var');
    setCurrentBlocks((prev) => prev.map((value, index) => (index === selectedIndex ? block : value)));
  };

  const submit = () => {
    if (submitted || !canSubmit) return;
    setSubmitted(true);
    setTimeout(() => onAnswer(arraysMatch(currentBlocks, correctBlocks), currentBlocks.join(' ')), 350);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
        <p className="text-[11px] font-bold text-primary-dark uppercase tracking-wider">Déminage</p>
        <p className="text-xs text-txt-sub mt-1">Touchez un bloc à corriger, brisez-le puis remplacez-le avec la banque proposée.</p>
      </div>
      <div className="min-h-[72px] p-3 rounded-2xl bg-white border-2 border-dashed border-primary/30 flex flex-wrap gap-2 items-center">
        {currentBlocks.map((block, index) => {
          const selected = selectedIndex === index;
          const isCorrect = norm(block) === norm(correctBlocks[index]);
          const cls = submitted
            ? (isCorrect ? 'bg-accent-green text-white' : 'bg-accent-red text-white')
            : selected
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-txt-main';

          return (
            <button
              key={`${index}-${block || 'empty'}`}
              onClick={() => !submitted && setSelectedIndex(index)}
              disabled={submitted}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${cls}`}
            >
              {block ? renderBlockValue(block, preferMath) : <span className="italic opacity-70">Bloc vide</span>}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={clearSelected} disabled={submitted || selectedIndex == null} className="py-3 rounded-xl bg-gray-100 text-txt-main font-bold text-xs active:scale-95 transition-transform disabled:opacity-40">
          Briser le bloc
        </button>
        <button onClick={submit} disabled={submitted || !canSubmit} className="py-3 rounded-xl bg-primary text-white font-bold text-xs shadow-gold btn-bounce disabled:opacity-40">
          Vérifier
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-primary-dark">
          <span>Banque de remplacement</span>
          <span className="text-[10px] text-txt-sub">{selectedIndex == null ? 'Choisissez un bloc à corriger' : `Position ${selectedIndex + 1}`}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestionPool.map((block, index) => (
            <button
              key={`${index}-${block}`}
              onClick={() => applyBlock(block)}
              disabled={submitted || selectedIndex == null}
              className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold shadow-bouncy btn-bounce active:scale-95 disabled:opacity-40"
            >
              {renderBlockValue(block, preferMath)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EnonceModal({ enonce, onClose }) {
  if (!enonce) return null;
  const lines = enonce.toString().split('\n').filter(line => line.trim());

  return (
    <div className="fixed inset-0 z-[120] bg-black/45 p-4 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-xl rounded-3xl bg-white shadow-xl animate-scale-in overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Sujet</p>
            <h3 className="text-base font-extrabold">Énoncé complet</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 text-txt-sub flex items-center justify-center active:scale-90 transition-transform">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto px-5 py-4 space-y-3 text-sm text-txt-main leading-relaxed">
          {(lines.length ? lines : [enonce]).map((line, index) => (
            <p key={`${index}-${line.slice(0, 20)}`}>{renderMixedContent(line)}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function HintsModal({ open, question, data, onClose, onSpend }) {
  const hints = useMemo(() => (open && question ? buildHints(question) : []), [open, question]);
  const [revealedIds, setRevealedIds] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setRevealedIds([]);
      setBusy(false);
    }
  }, [open, question]);

  if (!open) return null;

  const userCredits = Math.max(0, Number(data?.user?.credits) || 0);
  const userHintPacks = Math.max(0, Number(data?.user?.inventory?.hints) || 0);

  const handleReveal = async (hint) => {
    if (!hint || busy || revealedIds.includes(hint.id)) return;
    setBusy(true);
    try {
      const ok = typeof onSpend === 'function' ? await onSpend(hint) : true;
      if (ok) setRevealedIds(prev => [...prev, hint.id]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/45 p-4 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-xl animate-scale-in overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-primary-dark">
            <Lightbulb size={18} className="text-primary" />
            <h3 className="text-base font-extrabold">Indices disponibles</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 text-txt-sub flex items-center justify-center active:scale-90 transition-transform">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-3 flex items-center gap-3 text-[11px] text-txt-sub border-b border-gray-100 bg-gray-50/60">
          <span className="inline-flex items-center gap-1"><Coins size={12} className="text-accent-green" /> {userCredits} crédits</span>
          <span className="inline-flex items-center gap-1"><Lightbulb size={12} className="text-primary" /> {userHintPacks} pack{userHintPacks > 1 ? 's' : ''} d’indice</span>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto px-5 py-4 space-y-3">
          {hints.length === 0 ? (
            <p className="text-sm text-txt-sub text-center py-6">Aucun indice n’est proposé pour cette question.</p>
          ) : hints.map((hint) => {
            const revealed = revealedIds.includes(hint.id);
            const creditCost = getHintCost(hint);
            const inventoryCost = getHintInventoryCost(hint);
            const canUsePack = userHintPacks >= inventoryCost;
            const canUseCredits = userCredits >= creditCost;
            const affordable = canUsePack || canUseCredits;
            return (
              <div key={hint.id} className={`rounded-2xl border px-4 py-3 ${revealed ? 'border-primary/30 bg-primary/5' : 'border-gray-200 bg-white'}`}>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-primary/10 text-primary-dark">{HINT_LEVEL_LABELS[hint.level] || `Niveau ${hint.level}`}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${hint.style === 'complexe' ? 'bg-violet-100 text-violet-700' : hint.style === 'complet' ? 'bg-emerald-100 text-emerald-700' : 'bg-pink-100 text-pink-700'}`}>{HINT_STYLE_LABELS[hint.style] || 'Fun'}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${hint.importance === 'critique' ? 'bg-accent-red/10 text-accent-red' : hint.importance === 'majeur' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-txt-sub'}`}>{HINT_IMPORTANCE_LABELS[hint.importance] || 'Mineur'}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-cyan-50 text-cyan-700">{HINT_NATURE_LABELS[hint.nature] || 'Concret'}</span>
                </div>
                {revealed ? (
                  <div className="text-sm text-txt-main leading-relaxed">{renderMixedContent(hint.text)}</div>
                ) : (
                  <>
                    <p className="text-xs text-txt-muted italic mb-2">Indice masqué. Dévoilez-le pour en voir le contenu.</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col text-[11px] text-txt-sub leading-tight">
                        <span className="inline-flex items-center gap-1"><Coins size={12} className="text-accent-green" /> {creditCost} crédit{creditCost > 1 ? 's' : ''}</span>
                        <span className="inline-flex items-center gap-1"><Lightbulb size={12} className="text-primary" /> ou {inventoryCost} pack{inventoryCost > 1 ? 's' : ''} d’indice</span>
                      </div>
                      <button
                        onClick={() => handleReveal(hint)}
                        disabled={busy || !affordable}
                        className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-transform active:scale-95 ${affordable ? 'bg-primary text-white shadow-gold' : 'bg-gray-100 text-txt-muted cursor-not-allowed'}`}>
                        {affordable ? <><Unlock size={12} /> Dévoiler</> : <><Lock size={12} /> Insuffisant</>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FeedbackPanel({ isCorrect, correctAnswer, explanation, preferMath, onNext }) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/45 p-4 flex items-end justify-center animate-fade-in">
      <div className="w-full max-w-lg rounded-t-[2rem] bg-white shadow-xl animate-kb-up overflow-hidden">
        <div className={`px-5 py-4 ${isCorrect ? 'bg-accent-green/10' : 'bg-accent-red/10'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isCorrect ? 'bg-accent-green text-white' : 'bg-accent-red text-white'}`}>
              {isCorrect ? <CheckCircle size={22} /> : <XCircle size={22} />}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Résultat</p>
              <h3 className="text-base font-extrabold">{isCorrect ? 'Bonne réponse' : 'Réponse incorrecte'}</h3>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          {!isCorrect && correctAnswer && (
            <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-primary-dark font-semibold mb-1">Réponse attendue</p>
              <div className="text-sm font-semibold text-txt-main break-words">{renderFeedbackValue(correctAnswer, preferMath)}</div>
            </div>
          )}
          {explanation && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold mb-1">Explication</p>
              <div className="text-sm text-txt-main leading-relaxed break-words">{renderFeedbackValue(explanation, preferMath)}</div>
            </div>
          )}
          <button onClick={onNext} className="w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm shadow-gold btn-bounce active:scale-95 transition-transform">
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
}

function LogicSorter({ question, onAnswer }) {
  const sourceOrder = useMemo(() => {
    if (Array.isArray(question.correctOrder) && question.correctOrder.length) return question.correctOrder;
    if (Array.isArray(question.items) && question.items.length) return question.items;
    if (Array.isArray(question.suggestions) && question.suggestions.length) return question.suggestions;
    return [];
  }, [question.correctOrder, question.items, question.suggestions]);
  const [userOrder, setUserOrder] = useState(() => {
    const next = shuffleArray(sourceOrder);
    if (next.length > 1 && arraysMatch(next, sourceOrder)) {
      return [next[1], next[0], ...next.slice(2)];
    }
    return next;
  });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const next = shuffleArray(sourceOrder);
    setUserOrder(next.length > 1 && arraysMatch(next, sourceOrder) ? [next[1], next[0], ...next.slice(2)] : next);
    setSubmitted(false);
  }, [sourceOrder]);

  const moveItem = (index, direction) => {
    if (submitted) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= userOrder.length) return;
    setUserOrder(prev => {
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const submit = () => {
    if (!userOrder.length || submitted) return;
    setSubmitted(true);
    const correct = arraysMatch(userOrder, sourceOrder);
    setTimeout(() => onAnswer(correct, userOrder.join(' ')), 350);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {userOrder.map((item, index) => (
          <div key={`${index}-${item}`} className="flex items-center gap-2 p-3 rounded-xl bg-white border border-gray-200 shadow-bouncy">
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-extrabold shrink-0">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0 text-sm font-semibold leading-relaxed">
              {renderMixedContent(item)}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => moveItem(index, -1)} disabled={submitted || index === 0} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
                <ChevronUp size={14} />
              </button>
              <button onClick={() => moveItem(index, 1)} disabled={submitted || index === userOrder.length - 1} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={submit} disabled={submitted || userOrder.length === 0} className="w-full py-3 rounded-xl bg-primary text-white font-bold shadow-gold btn-bounce disabled:opacity-40">
        VALIDER L'ORDRE
      </button>
    </div>
  );
}

function RedactionQuestion({ question, onAnswer }) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || submitted) return;
    setSubmitted(true);
    const answers = uniqueNormalized([
      ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : []),
      question.answer,
    ]);
    const correct = answers.length > 0 && answers.some(answer => norm(trimmed) === norm(answer));
    setTimeout(() => onAnswer(correct, trimmed), 350);
  };

  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Rédigez votre réponse ici..."
        disabled={submitted}
        rows={5}
        className="w-full p-3 rounded-2xl bg-white border border-gray-200 text-sm font-medium placeholder:text-txt-muted focus:outline-none focus:border-primary/40 resize-none"
      />
      <button onClick={submit} disabled={submitted || !value.trim()} className="w-full py-3 rounded-xl bg-primary text-white font-bold shadow-gold btn-bounce disabled:opacity-40">
        VALIDER
      </button>
    </div>
  );
}

function BlockInputQuestion({ question, onAnswer }) {
  const expectedBlocks = getExpectedBlocks(question);
  const suggestionPool = useMemo(() => uniqueNormalized([
    ...expectedBlocks,
    ...getSuggestionPoolEntries(question),
  ]), [expectedBlocks, question]);
  const [tokens, setTokens] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const preferMath = Boolean(question.correctBlocks?.length);
  const acceptedAnswers = useMemo(() => uniqueNormalized([
    ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : []),
    question.answer,
    question.correctOrder?.join(' '),
    question.correctBlocks?.join(' '),
  ]), [question.acceptedAnswers, question.answer, question.correctBlocks, question.correctOrder]);

  useEffect(() => {
    setTokens([]);
    setSubmitted(false);
  }, [question]);

  const appendToken = (token) => {
    if (submitted) return;
    SoundEngine.playInsert(preferMath ? 'func' : 'var');
    setTokens(prev => [...prev, token]);
  };

  const removeLast = () => {
    if (submitted || tokens.length === 0) return;
    SoundEngine.playDelete();
    setTokens(prev => prev.slice(0, -1));
  };

  const submit = () => {
    if (!tokens.length || submitted) return;
    setSubmitted(true);
    const userAnswer = tokens.join(' ');
    const expectedAnswer = expectedBlocks.join(' ');
    const correct = uniqueNormalized([expectedAnswer, ...acceptedAnswers]).some(answer => norm(userAnswer) === norm(answer));
    setTimeout(() => onAnswer(correct, userAnswer), 350);
  };

  return (
    <div className="space-y-3">
      <div className="min-h-[64px] p-3 rounded-2xl bg-white border-2 border-dashed border-primary/30 flex flex-wrap gap-2 items-center">
        {tokens.length === 0 ? (
          <span className="text-xs text-txt-muted italic">Composez la réponse avec la banque de suggestion de blocs...</span>
        ) : tokens.map((token, index) => (
          <span key={`${index}-${token}`} className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold ${preferMath ? 'bg-primary text-white' : 'bg-primary/10 text-primary-dark'}`}>
            {renderBlockValue(token, preferMath)}
          </span>
        ))}
      </div>

      {suggestionPool.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-primary-dark">
            <span>Banque de suggestion de blocs</span>
            <span className="text-[10px] text-txt-sub">Réservoir principal</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestionPool.map((token, index) => (
              <button key={`${index}-${token}`} onClick={() => appendToken(token)} disabled={submitted} className="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-semibold shadow-bouncy btn-bounce active:scale-95 disabled:opacity-40">
                {renderBlockValue(token, preferMath)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={removeLast} disabled={submitted || tokens.length === 0} className="py-3 rounded-xl bg-gray-100 text-txt-main font-bold text-xs active:scale-95 transition-transform disabled:opacity-40">
          Effacer
        </button>
        <button onClick={submit} disabled={submitted || tokens.length === 0} className="py-3 rounded-xl bg-primary text-white font-bold text-xs shadow-gold btn-bounce disabled:opacity-40">
          Vérifier
        </button>
      </div>
    </div>
  );
}

function FinalStats({ results, title, totalQuestions, onHome, onRetry, sessionKind, flowType, flowTotalSteps, chapterTitle, chapterNumber, score, maxScore, timeSpentSeconds, timeLimitSeconds, timeFailed, sessionSummary }) {
  const summary = sessionSummary || buildSessionSummary({
    title,
    sessionKind,
    flowType,
    score,
    maxScore,
    results,
    totalQuestions,
    hintsUsed: 0,
    timeSpentSeconds,
    timeLimitSeconds,
    timeFailed,
    verifyCount: results.length,
    goodVerifications: results.filter(result => result.correct).length,
    badVerifications: results.filter(result => !result.correct).length,
    mandatoryCheckpointsPassed: 0,
    mandatoryCheckpointsTotal: 0,
    questionTimes: [],
    microStepTimes: [],
    scoreScale: 100,
    subjectId: null,
    subjectName: '',
  });

  useEffect(() => {
    if (summary.scorePercent >= 50) fireConfetti();
  }, [summary.scorePercent]);

  return (
    <div className="min-h-[100dvh] px-4 py-6 pb-12 animate-scale-in">
      <div className="w-full max-w-lg mx-auto space-y-4">
        <div className="bg-white rounded-3xl p-6 shadow-card space-y-5">
          <div className="text-center">
            {sessionKind === 'exercise-flow' && (
              <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-2">
                Étape 4/{flowTotalSteps || 4} · Statistiques {flowType === 'sujet-type' ? 'Sujet type' : 'Exercice'}
              </p>
            )}
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${summary.scorePercent >= 50 ? 'bg-accent-green/10' : 'bg-accent-red/10'}`}>
              {summary.scorePercent >= 50 ? <Trophy size={40} className="text-accent-green" /> : <RotateCcw size={40} className="text-accent-red" />}
            </div>
            <h2 className="text-2xl font-extrabold">{summary.mention}</h2>
            <div className="text-sm text-txt-sub mt-1">{renderMixedContent(title)}</div>
            {chapterTitle && (
              <p className="text-[11px] text-txt-muted mt-1">Chapitre {chapterNumber || 1} · <span className="align-middle">{renderMixedContent(chapterTitle)}</span></p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Moyenne globale</p>
              <p className="text-2xl font-extrabold text-primary-dark">{summary.average20}/20</p>
              <p className="text-[11px] text-txt-muted mt-1">Note session : {summary.displayScore}/{summary.scoreScale}</p>
            </div>
            <div className={`rounded-2xl border p-4 text-center ${summary.timeFailed ? 'bg-accent-red/5 border-accent-red/20' : 'bg-accent-green/5 border-accent-green/20'}`}>
              <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Délai</p>
              <p className={`text-sm font-extrabold ${summary.timeFailed ? 'text-accent-red' : 'text-accent-green'}`}>
                {summary.timeLimitSeconds ? (summary.timeFailed ? 'Temps dépassé' : 'Temps respecté') : 'Libre'}
              </p>
              <p className="text-[11px] text-txt-sub mt-1">
                {formatDuration(summary.timeSpentSeconds)}
                {summary.timeLimitSeconds ? ` / ${formatDuration(summary.timeLimitSeconds)}` : ''}
              </p>
              {summary.overtimeSeconds > 0 ? <p className="text-[11px] text-accent-red mt-1">+{formatDuration(summary.overtimeSeconds)} de dépassement</p> : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm font-bold">
              <span>{summary.correct}/{summary.totalQuestions} correct</span>
              <span className="text-primary">{summary.scorePercent}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${summary.scorePercent >= 50 ? 'bg-accent-green' : 'bg-accent-red'}`} style={{ width: `${summary.scorePercent}%` }} />
            </div>
          </div>

          <div className="flex justify-center gap-2">
            {[0, 1, 2].map(i => (
              <Star key={i} size={32} className={`transition-all duration-300 ${i < summary.starsEarned ? 'text-primary fill-primary' : 'text-gray-200'}`} />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-primary/5 p-3">
              <Zap size={16} className="text-primary mx-auto mb-1" />
              <p className="text-sm font-extrabold text-primary-dark">+{summary.xpDelta}</p>
              <p className="text-[10px] text-txt-muted">XP</p>
            </div>
            <div className="rounded-2xl bg-accent-green/5 p-3">
              <Coins size={16} className="text-accent-green mx-auto mb-1" />
              <p className="text-sm font-extrabold text-accent-green">+{summary.creditsDelta}</p>
              <p className="text-[10px] text-txt-muted">Crédits</p>
            </div>
            <div className="rounded-2xl bg-accent-blue/5 p-3">
              <Trophy size={16} className="text-accent-blue mx-auto mb-1" />
              <p className="text-sm font-extrabold text-accent-blue">{summary.averageDelta > 0 ? '+' : ''}{summary.averageDelta}</p>
              <p className="text-[10px] text-txt-muted">Impact Moy.</p>
            </div>
            <div className="rounded-2xl bg-accent-red/5 p-3">
              <Star size={16} className="text-accent-red mx-auto mb-1" />
              <p className="text-sm font-extrabold text-accent-red">{summary.fireDelta > 0 ? '+' : ''}{summary.fireDelta}</p>
              <p className="text-[10px] text-txt-muted">Combo Feu</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-2xl border p-4 text-center ${summary.energyDelta >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-orange-50 border-orange-200'}`}>
              <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Énergie</p>
              <p className={`text-lg font-extrabold ${summary.energyDelta >= 0 ? 'text-amber-700' : 'text-orange-600'}`}>{summary.energyDelta > 0 ? '+' : ''}{summary.energyDelta}</p>
              <p className="text-[11px] text-txt-muted mt-1">Impact du rythme global</p>
            </div>
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-txt-muted font-semibold">Matière</p>
              <p className="text-lg font-extrabold text-primary-dark">{summary.subjectName || 'Session libre'}</p>
              <p className="text-[11px] text-txt-muted mt-1">Note conservée : {summary.displayScore}/{summary.scoreScale}</p>
            </div>
          </div>

          {sessionKind === 'exercise-flow' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target size={16} className="text-primary" />
                  <p className="text-xs font-extrabold uppercase tracking-wider text-primary-dark">Vérifications</p>
                </div>
                <p className="text-lg font-extrabold text-primary-dark">{summary.goodVerifications}/{summary.verifyCount || 0}</p>
                <p className="text-[11px] text-txt-muted mt-1">Bonnes : {summary.goodVerifications} · Mauvaises : {summary.badVerifications}</p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb size={16} className="text-primary" />
                  <p className="text-xs font-extrabold uppercase tracking-wider text-primary-dark">Indices utilisés</p>
                </div>
                <p className="text-lg font-extrabold text-primary-dark">{summary.hintsUsed || 0}</p>
                <p className="text-[11px] text-txt-muted mt-1">Chaque indice révélé coûte crédits ou packs d’indice</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target size={16} className="text-primary" />
                  <p className="text-xs font-extrabold uppercase tracking-wider text-primary-dark">Réponses</p>
                </div>
                <p className="text-lg font-extrabold text-primary-dark">{summary.correct}/{summary.totalQuestions}</p>
                <p className="text-[11px] text-txt-muted mt-1">Bonnes : {summary.correct} · Ratées : {Math.max(0, summary.totalQuestions - summary.correct)}</p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb size={16} className="text-primary" />
                  <p className="text-xs font-extrabold uppercase tracking-wider text-primary-dark">Indices utilisés</p>
                </div>
                <p className="text-lg font-extrabold text-primary-dark">{summary.hintsUsed || 0}</p>
                <p className="text-[11px] text-txt-muted mt-1">Chaque indice révélé coûte crédits ou packs d’indice</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-card space-y-4">
          <h3 className="text-sm font-extrabold">Temps par question</h3>
          <div className="space-y-2">
            {summary.questionTimes.length > 0 ? summary.questionTimes.map((entry) => (
              <div key={`question-time-${entry.questionIdx}`} className="rounded-2xl border border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold">Q{entry.questionIdx + 1}</p>
                    <div className="text-[11px] text-txt-muted mt-1 line-clamp-2">{renderMixedContent(entry.title)}</div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-primary-dark">{formatDuration(entry.seconds)}</p>
                    <p className="text-[10px] text-txt-muted">{summary.sessionKind === 'exercise-flow' ? `${entry.goodVerifications}/${entry.verifyAttempts || 0} vérifs` : 'Suivi chrono'}{entry.targetSeconds ? ` · cible ${formatDuration(entry.targetSeconds)}` : ''}</p>
                  </div>
                </div>
              </div>
            )) : <p className="text-sm text-txt-muted">Aucune mesure détaillée disponible.</p>}
          </div>
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-xs text-txt-muted">Moyenne par question : <span className="font-extrabold text-primary-dark">{formatDuration(summary.averageQuestionSeconds)}</span></p>
          </div>
        </div>

        {summary.pageTimes.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-card space-y-3">
            <h3 className="text-sm font-extrabold">Temps par page</h3>
            <div className="space-y-2">
              {summary.pageTimes.map((entry) => (
                <div key={`page-time-${entry.id}`} className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3 text-sm">
                  <div>
                    <p className="font-bold">{renderMixedContent(entry.label)}</p>
                    <p className="text-[11px] text-txt-muted mt-1">{entry.targetSeconds ? `Objectif ${formatDuration(entry.targetSeconds)}` : 'Chrono libre'}</p>
                  </div>
                  <span className="font-extrabold text-primary-dark">{formatDuration(entry.seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.stepTimes.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-card space-y-3">
            <h3 className="text-sm font-extrabold">Temps par étape</h3>
            <div className="space-y-2">
              {summary.stepTimes.map((entry) => (
                <div key={`step-time-${entry.id}`} className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3 text-sm">
                  <div>
                    <p className="font-bold">Q{entry.questionIdx + 1} · <span className="align-middle">{renderMixedContent(entry.label)}</span></p>
                    <div className="text-[11px] text-txt-muted mt-1">{renderMixedContent(entry.title)}{entry.targetSeconds ? ` · cible ${formatDuration(entry.targetSeconds)}` : ''}</div>
                  </div>
                  <span className="font-extrabold text-primary-dark">{formatDuration(entry.seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.refreshTimes.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-card space-y-3">
            <h3 className="text-sm font-extrabold">Temps par rafraîchissement</h3>
            <div className="space-y-2">
              {summary.refreshTimes.map((entry) => (
                <div key={`refresh-time-${entry.id}`} className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3 text-sm">
                  <div>
                    <p className="font-bold">Q{entry.questionIdx + 1} · <span className="align-middle">{renderMixedContent(entry.label)}</span></p>
                    <div className="text-[11px] text-txt-muted mt-1">{renderMixedContent(entry.stepLabel || entry.title)}{entry.targetSeconds ? ` · cible ${formatDuration(entry.targetSeconds)}` : ''}</div>
                  </div>
                  <span className="font-extrabold text-primary-dark">{formatDuration(entry.seconds)}</span>
                </div>
              ))}
            </div>
            {summary.averageRefreshSeconds > 0 ? (
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs text-txt-muted">Moyenne par rafraîchissement : <span className="font-extrabold text-primary-dark">{formatDuration(summary.averageRefreshSeconds)}</span></p>
              </div>
            ) : null}
          </div>
        )}

        {summary.sessionKind !== 'exercise-flow' && summary.microStepTimes.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-card space-y-3">
            <h3 className="text-sm font-extrabold">Temps par micro-étape</h3>
            <div className="space-y-2">
              {summary.microStepTimes.map((entry, index) => (
                <div key={`micro-step-${entry.questionIdx}-${index}`} className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3 text-sm">
                  <div>
                    <p className="font-bold">Q{entry.questionIdx + 1} · {entry.label}</p>
                    <div className="text-[11px] text-txt-muted mt-1">{renderMixedContent(entry.title)}</div>
                  </div>
                  <span className="font-extrabold text-primary-dark">{formatDuration(entry.seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onRetry} className="flex-1 py-3 rounded-xl bg-gray-100 text-txt-main font-bold text-sm active:scale-95 transition-transform">
            <RotateCcw size={16} className="inline mr-1" /> Réessayer
          </button>
          <button onClick={onHome} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-gold btn-bounce active:scale-95 transition-transform">
            Accueil
          </button>
        </div>
      </div>
    </div>
  );
}
/* ══════════════════════════════════════════════════════
   MAIN QUIZ VIEW
   ══════════════════════════════════════════════════════ */
function ExerciseFlowTreatmentView({ quizState, navigate, applySessionRewards, playSpecial, showToast, setQuizState, data, save, pushFloatingFx, updateProfile, consumeInventoryItem, viewParams }) {
  const questions = useMemo(
    () => (quizState?.questions || []).map((question, index) => normalizeExerciseFlowQuestion(question, index)),
    [quizState?.questions]
  );
  const total = questions.length;
  const configuredMaxScore = quizState?.initialScore || (total * SCORE_CONFIG.correctBase);
  const exerciseScorePlan = useMemo(() => buildExerciseScorePlan(questions, configuredMaxScore), [configuredMaxScore, questions]);
  const baseScore = exerciseScorePlan.totalMaxScore;
  const initialPenaltyScore = Math.max(0, Number(quizState?.prefilledScorePenalty) || 0);
  const timeLimitSeconds = quizState?.timeLimitSeconds || (quizState?.flowType === 'sujet-type' ? 10800 : 7200);
  const sessionScoring = quizState?.scoringConfig || {};
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [questionStates, setQuestionStates] = useState(() => questions.map(question => createExerciseDraft(question)));
  const [results, setResults] = useState([]);
  const [finished, setFinished] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showEnonce, setShowEnonce] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showTimeExpired, setShowTimeExpired] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [penaltyScore, setPenaltyScore] = useState(initialPenaltyScore);
  const [scoreFx, setScoreFx] = useState(null);
  const [translationTarget, setTranslationTarget] = useState(null);
  const [revealedTranslationIds, setRevealedTranslationIds] = useState([]);
  const [translationBusy, setTranslationBusy] = useState(false);
  const scoreFxTimeoutRef = useRef(null);
  const answerScrollRef = useRef(null);
  const shouldAutoScrollAnswerRef = useRef(true);
  const finishAwardedRef = useRef(false);
  const metricsRef = useRef([]);
  const activeQuestionRef = useRef(null);
  const viewportBaseHeightRef = useRef(typeof window !== 'undefined' ? Math.round(window.innerHeight || window.visualViewport?.height || 0) : 0);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(false);
  const [viewportMetrics, setViewportMetrics] = useState(() => ({
    height: typeof window !== 'undefined'
      ? Math.round(window.visualViewport?.height || window.innerHeight || 0)
      : 0,
    keyboardInset: 0,
  }));
  const scoreScale = getFinalScoreScale(quizState?.scoreScale, sessionScoring?.scoreScale, data?.settings?.finalScoreScale);
  const timingConfig = quizState?.timing || {};
  const subjectCoefficient = Math.max(1, Number(quizState?.subjectCoefficient ?? sessionScoring?.subjectCoefficient) || 1);
  const earnedScore = useMemo(() => computeExerciseEarnedScore(questionStates, exerciseScorePlan), [exerciseScorePlan, questionStates]);
  const score = useMemo(() => roundMetric(Math.max(0, earnedScore - penaltyScore), 2), [earnedScore, penaltyScore]);
  const panelVisualGap = bottomPanelCollapsed ? 18 : 24;
  const keyboardAvoidOffset = viewportMetrics.keyboardInset + panelVisualGap;
  const bottomPanelPadding = (bottomPanelCollapsed ? 96 : 296) + panelVisualGap;
  const layoutMinHeight = viewportMetrics.height ? viewportMetrics.height + viewportMetrics.keyboardInset : 0;

  const ensureAnswerVisible = useCallback((behavior = 'smooth') => {
    const run = () => {
      const scroller = answerScrollRef.current;
      if (scroller && shouldAutoScrollAnswerRef.current) {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
      return;
    }

    run();
  }, []);

  const handleAnswerScroll = useCallback(() => {
    const scroller = answerScrollRef.current;
    if (!scroller) return;
    const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    shouldAutoScrollAnswerRef.current = distanceToBottom <= 28;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateViewportMetrics = () => {
      const viewport = window.visualViewport;
      const layoutHeight = Math.round(window.innerHeight || viewport?.height || 0);
      const visualHeight = Math.round(viewport?.height || layoutHeight || 0);
      const viewportOffsetTop = Math.round(viewport?.offsetTop || 0);
      const baselineHeight = Math.max(viewportBaseHeightRef.current || 0, layoutHeight, visualHeight);
      const nextKeyboardInset = Math.max(0, baselineHeight - (visualHeight + viewportOffsetTop));
      if (nextKeyboardInset < 24) {
        viewportBaseHeightRef.current = Math.max(viewportBaseHeightRef.current || 0, layoutHeight, visualHeight);
      }
      setViewportMetrics((prev) => {
        if (prev.height === visualHeight && prev.keyboardInset === nextKeyboardInset) return prev;
        return { height: visualHeight, keyboardInset: nextKeyboardInset };
      });
    };

    updateViewportMetrics();
    const viewport = window.visualViewport;
    window.addEventListener('resize', updateViewportMetrics);
    viewport?.addEventListener('resize', updateViewportMetrics);
    viewport?.addEventListener('scroll', updateViewportMetrics);

    return () => {
      window.removeEventListener('resize', updateViewportMetrics);
      viewport?.removeEventListener('resize', updateViewportMetrics);
      viewport?.removeEventListener('scroll', updateViewportMetrics);
    };
  }, []);

  useEffect(() => {
    setSelectedIdx(0);
    setQuestionStates(questions.map(question => createExerciseDraft(question)));
    setResults([]);
    setFinished(false);
    setShowHints(false);
    setShowEnonce(false);
    setHintsUsed(0);
    setShowTimeExpired(false);
    setTimeExpired(false);
    setElapsedSeconds(0);
    setPenaltyScore(initialPenaltyScore);
    setScoreFx(null);
    setTranslationTarget(null);
    setRevealedTranslationIds([]);
    setTranslationBusy(false);
    setSessionSummary(null);
    setBottomPanelCollapsed(false);
    metricsRef.current = questions.map((question, index) => ({
      questionIdx: index,
      title: getQuestionTitle(question, index),
      verifyAttempts: 0,
      goodVerifications: 0,
      badVerifications: 0,
      accumulatedMs: 0,
      activeSince: null,
      checkpointStartMs: null,
      microStepTimes: [],
      refreshTimes: [],
      stepTimeMap: {},
      refreshStartMs: Date.now(),
      mandatoryPassed: 0,
      mandatoryTotal: question?.lines?.length || 1,
    }));
    activeQuestionRef.current = 0;
    finishAwardedRef.current = false;
    shouldAutoScrollAnswerRef.current = true;
  }, [questions, baseScore, timeLimitSeconds]);

  const pauseQuestionTracking = useCallback((index, now = Date.now()) => {
    const metric = metricsRef.current[index];
    if (!metric || metric.activeSince == null) return;
    metric.accumulatedMs += Math.max(0, now - metric.activeSince);
    metric.activeSince = null;
  }, []);

  useEffect(() => {
    const now = Date.now();
    const previousIndex = activeQuestionRef.current;
    if (previousIndex != null && previousIndex !== selectedIdx) {
      pauseQuestionTracking(previousIndex, now);
    }

    const metric = metricsRef.current[selectedIdx];
    if (metric) {
      if (metric.activeSince == null) metric.activeSince = now;
      if (metric.checkpointStartMs == null) metric.checkpointStartMs = now;
      if (metric.refreshStartMs == null) metric.refreshStartMs = now;
    }
    activeQuestionRef.current = selectedIdx;
  }, [pauseQuestionTracking, selectedIdx]);

  useEffect(() => {
    if (!scoreFx) return undefined;
    if (scoreFxTimeoutRef.current) window.clearTimeout(scoreFxTimeoutRef.current);
    scoreFxTimeoutRef.current = window.setTimeout(() => setScoreFx(null), 900);
    return () => {
      if (scoreFxTimeoutRef.current) window.clearTimeout(scoreFxTimeoutRef.current);
    };
  }, [scoreFx]);

  useEffect(() => {
    if (finished) return undefined;
    const interval = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [finished]);

  useEffect(() => {
    if (!timeLimitSeconds || finished || timeExpired || elapsedSeconds < timeLimitSeconds) return;
    setTimeExpired(true);
    setShowTimeExpired(true);
  }, [elapsedSeconds, finished, timeExpired, timeLimitSeconds]);

  const currentQuestion = questions[selectedIdx] || {};
  const currentQuestionState = questionStates[selectedIdx] || createExerciseDraft(currentQuestion);
  const userEnergy = Math.max(0, Number(data?.user?.energy || 0));
  const firstUnlockedLineIndex = (currentQuestionState.lineStates || []).findIndex(state => !state.completed);
  const maxUnlockedLineIndex = firstUnlockedLineIndex >= 0
    ? firstUnlockedLineIndex
    : Math.max(0, (currentQuestion.lines?.length || 1) - 1);
  const currentLineIndex = Math.max(0, maxUnlockedLineIndex);
  const currentLine = currentQuestion.lines?.[currentLineIndex] || currentQuestion.lines?.[0] || {};
  const currentLineState = currentQuestionState.lineStates?.[currentLineIndex] || createLineDraft();
  const expectedBlocks = currentLine.correctBlocks || [];
  const checkpointLengths = getCheckpointLengths(currentLine, expectedBlocks);
  const activeBlockIndex = resolveActiveBlockIndex(currentLineState.selectedWords, expectedBlocks.length, currentLineState.editIndex);
  const lastFilledBlockIndex = findLastFilledBlockIndex(currentLineState.selectedWords);
  const filledBlockCount = getFilledBlockCount(currentLineState.selectedWords);
  const completedCount = questionStates.filter(state => state.completed).length;
  const allCompleted = total > 0 && completedCount === total;
  const progress = total > 0 ? (completedCount / total) * 100 : 0;
  const timeSpentSeconds = elapsedSeconds;
  const questionSteps = getQuestionSteps(currentQuestion);
  const currentStepIndex = Number.isInteger(currentLine.stepIndex) ? currentLine.stepIndex : 0;
  const currentStepLabel = questionSteps[currentStepIndex] || currentLine.stepLabel || `Étape ${currentStepIndex + 1}`;
  const activeSubject = (data?.subjects || []).find(subject => Number(subject.id) === Number(quizState?.subjectId));
  const questionTranslationPricing = resolveTranslationPricing(activeSubject, 'question');
  const optionTranslationPricing = resolveTranslationPricing(activeSubject, 'option');
  const currentQuestionTranslationTarget = buildTranslationTarget({
    id: `exercise-question-${selectedIdx}`,
    title: `Question ${selectedIdx + 1}`,
    raw: currentQuestion.translations?.question,
    cost: questionTranslationPricing.hintPackCost,
    energyCost: questionTranslationPricing.energyCost,
    scoreCost: questionTranslationPricing.scoreCost,
  });
  const currentStepTranslationTarget = buildTranslationTarget({
    id: `exercise-step-${selectedIdx}-${currentStepIndex}`,
    title: currentStepLabel,
    raw: currentQuestion.translations?.steps?.[currentStepIndex] || currentLine.translations?.prompt || currentLine.translations?.question,
    cost: optionTranslationPricing.hintPackCost,
    energyCost: optionTranslationPricing.energyCost,
    scoreCost: optionTranslationPricing.scoreCost,
  });
  const enonceTranslationTarget = buildTranslationTarget({
    id: 'exercise-enonce',
    title: 'Énoncé',
    raw: quizState?.translations?.enonce || quizState?.translations?.question,
    cost: questionTranslationPricing.hintPackCost,
    energyCost: questionTranslationPricing.energyCost,
    scoreCost: questionTranslationPricing.scoreCost,
  });
  const finalResults = questions.map((question, index) => {
    const existing = results.find(result => result.questionIdx === index);
    if (existing) return existing;
    const state = questionStates[index] || createExerciseDraft(question);
    const lineStates = state.lineStates || [];
    return {
      questionIdx: index,
      correct: lineStates.length > 0 ? lineStates.every(lineState => lineState.correct === true) : Boolean(state.completed),
      userAnswer: buildQuestionUserAnswer(question, lineStates),
    };
  });
  const hasMathBlocks = Boolean(currentLine.correctBlocks?.length);
  const verificationEnergyCost = Math.max(0, Number(SCORE_CONFIG.verifyLineEnergyCost || 0));
  const verificationBlockedByEnergy = verificationEnergyCost > 0 && userEnergy < verificationEnergyCost;
  const canEraseCurrentLine = !currentQuestionState.completed && !currentLineState.completed && lastFilledBlockIndex >= 0;
  const canVerifyCurrentLine = !currentQuestionState.completed && !currentLineState.completed;
  const canValidateCurrentLine = !currentQuestionState.completed && !currentLineState.completed;
  const verifyButtonCostLabel = verificationEnergyCost > 0 ? `-${verificationEnergyCost} énergie` : '';
  const activeBank = useMemo(() => {
    if (currentQuestionState.completed || currentLineState.completed || activeBlockIndex < 0 || activeBlockIndex >= expectedBlocks.length) return [];
    return buildDynamicBank(currentLine, expectedBlocks, activeBlockIndex, currentLineState.bankVersion);
  }, [activeBlockIndex, currentLine, currentLineState.bankVersion, currentLineState.completed, currentQuestionState.completed, expectedBlocks]);
  const constructedAnswerSegments = useMemo(() => (currentQuestion.lines || []).filter((line, index) => index <= maxUnlockedLineIndex).map((line, index) => {
    const state = currentQuestionState.lineStates?.[index] || createLineDraft();
    const isCurrent = index === currentLineIndex;
    const sourceBlocks = state.selectedWords?.length
      ? state.selectedWords
      : splitToBlocks(state.userAnswer);

    return {
      id: line.id || `${currentQuestion.id || selectedIdx}-line-${index}`,
      index,
      sourceBlocks,
      rows: buildVisualRows(sourceBlocks, state.visualBreakBeforeIndices),
      visualBreakBeforeIndices: state.visualBreakBeforeIndices || [],
      verifiedBlockStates: state.verifiedBlockStates || [],
      validatedBlockColors: state.validatedBlockColors || [],
      completed: state.completed,
      correct: state.correct,
      current: isCurrent,
      preferMath: Boolean(line.correctBlocks?.length),
      feedbackState: state.feedbackState,
    };
  }), [currentLineIndex, currentQuestion, currentQuestionState.lineStates, maxUnlockedLineIndex, selectedIdx]);
  const constructedAnswerRowCount = useMemo(
    () => constructedAnswerSegments.reduce((count, segment) => count + Math.max(segment.rows.length, 0), 0),
    [constructedAnswerSegments]
  );
  const hasConstructedAnswer = constructedAnswerSegments.some(segment => segment.rows.length > 0);
  const answerStatusLabel = currentQuestionState.completed
    ? 'Question validée'
    : currentLineState.feedbackState === 'wrong'
      ? 'Correction nécessaire'
      : 'Construction en cours';
  const answerCardTone = currentQuestionState.completed
    ? 'border-accent-green/20 bg-accent-green/5'
    : currentLineState.feedbackState === 'wrong'
      ? 'border-accent-red/30 bg-accent-red/5'
      : 'border-primary/20 bg-primary/5';

  useEffect(() => {
    if (!currentLineState.feedbackState) return undefined;
    const timeout = window.setTimeout(() => {
      setQuestionStates(prev => {
        const next = [...prev];
        const state = next[selectedIdx];
        if (!state) return prev;
        const lineStates = [...(state.lineStates || [])];
        const lineState = lineStates[currentLineIndex];
        if (!lineState) return prev;
        lineStates[currentLineIndex] = { ...lineState, feedbackState: null };
        next[selectedIdx] = { ...state, lineStates };
        return next;
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [currentLineIndex, currentLineState.feedbackState, selectedIdx]);

  useEffect(() => {
    ensureAnswerVisible(viewportMetrics.keyboardInset > 0 ? 'smooth' : 'auto');
  }, [bottomPanelCollapsed, constructedAnswerRowCount, currentLineIndex, currentLineState.selectedWords.length, currentLineState.visualBreakBeforeIndices?.length, ensureAnswerVisible, selectedIdx, viewportMetrics.keyboardInset]);

  const applyPenalty = useCallback((amount) => {
    const safeAmount = Math.max(0, Math.abs(Number(amount) || 0));
    if (!safeAmount) return;
    setPenaltyScore(prev => prev + safeAmount);
    setScoreFx({ id: Date.now(), amount: safeAmount });
  }, []);

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
      applyPenalty(translationTarget.scoreCost);
      pushFloatingFx({ kind: 'score', label: 'Score', amount: -translationTarget.scoreCost, positive: false });
    } finally {
      setTranslationBusy(false);
    }
  }, [applyPenalty, consumeInventoryItem, data, pushFloatingFx, revealedTranslationIds, save, showToast, translationBusy, translationTarget]);

  const handleExit = useCallback(() => {
    const nextParams = quizState?.subjectId ? { subjectId: quizState.subjectId } : undefined;
    setQuizState(null);
    if (quizState?.subjectId) {
      navigate('chapter', nextParams);
      return;
    }
    navigate('home');
  }, [navigate, quizState?.subjectId, setQuizState]);

  const spendVerificationEnergy = useCallback(() => {
    const cost = Math.max(0, Number(SCORE_CONFIG.verifyLineEnergyCost || 0));
    if (!cost) return true;
    if (userEnergy < cost) {
      showToast(`Énergie insuffisante (${cost} requise)`, 'error');
      return false;
    }
    const nextUser = {
      ...(data?.user || {}),
      energy: Math.max(0, userEnergy - cost),
    };
    save({ ...data, user: nextUser });
    pushFloatingFx([{ kind: 'energy', label: 'Énergie', amount: -cost, positive: false }]);
    return true;
  }, [data, pushFloatingFx, save, showToast, userEnergy]);

  const handleApplyBlock = useCallback((block) => {
    if (currentQuestionState.completed || currentLineState.completed) return;

    setQuestionStates(prev => {
      const next = [...prev];
      const state = next[selectedIdx] || createExerciseDraft(currentQuestion);
      const lineStates = [...(state.lineStates || currentQuestion.lines.map(() => createLineDraft()))];
      const lineState = lineStates[currentLineIndex] || createLineDraft();
      const targetIndex = resolveActiveBlockIndex(lineState.selectedWords, expectedBlocks.length, lineState.editIndex);
      if (targetIndex < 0) return prev;

      SoundEngine.playInsert(hasMathBlocks ? 'func' : 'var');
      const selectedWords = [...lineState.selectedWords];
      while (selectedWords.length < targetIndex) selectedWords.push('');
      if (targetIndex < selectedWords.length) selectedWords[targetIndex] = block;
      else selectedWords.push(block);

      const nextWords = trimTrailingEmptyBlocks(selectedWords);
      const contiguousCount = getContiguousFilledCount(nextWords, expectedBlocks.length);
      const persistedDecorations = clearPersistedBlockDecorations(lineState, nextWords, targetIndex);
      lineStates[currentLineIndex] = {
        ...lineState,
        selectedWords: nextWords,
        verifiedCheckpoints: checkpointLengths.filter(length => length <= contiguousCount),
        bankVersion: lineState.bankVersion + 1,
        feedbackState: null,
        editIndex: targetIndex + 1 < expectedBlocks.length ? targetIndex + 1 : null,
        verifiedBlockStates: persistedDecorations.verifiedBlockStates,
        validatedBlockColors: persistedDecorations.validatedBlockColors,
        completed: false,
        correct: null,
        userAnswer: getVisibleBlockAnswer(nextWords),
      };
      next[selectedIdx] = {
        ...state,
        lineStates,
        userAnswer: buildQuestionUserAnswer(currentQuestion, lineStates),
        touched: true,
      };
      return next;
    });
    ensureAnswerVisible('smooth');
  }, [checkpointLengths, currentLineIndex, currentLineState.completed, currentQuestion, currentQuestionState.completed, ensureAnswerVisible, expectedBlocks.length, hasMathBlocks, selectedIdx]);

  const handleRemoveBlockAt = useCallback((blockIndex) => {
    if (currentQuestionState.completed || currentLineState.completed) return;

    setQuestionStates(prev => {
      const next = [...prev];
      const state = next[selectedIdx] || createExerciseDraft(currentQuestion);
      const lineStates = [...(state.lineStates || currentQuestion.lines.map(() => createLineDraft()))];
      const lineState = lineStates[currentLineIndex] || createLineDraft();
      if (!norm(lineState.selectedWords[blockIndex])) return prev;

      SoundEngine.playDelete();
      const selectedWords = [...lineState.selectedWords];
      selectedWords[blockIndex] = '';
      const nextWords = trimTrailingEmptyBlocks(selectedWords);
      const contiguousCount = getContiguousFilledCount(nextWords, expectedBlocks.length);
      const persistedDecorations = clearPersistedBlockDecorations(lineState, nextWords, blockIndex);

      lineStates[currentLineIndex] = {
        ...lineState,
        selectedWords: nextWords,
        verifiedCheckpoints: checkpointLengths.filter(length => length <= contiguousCount),
        bankVersion: lineState.bankVersion + 1,
        feedbackState: null,
        editIndex: blockIndex,
        verifiedBlockStates: persistedDecorations.verifiedBlockStates,
        validatedBlockColors: persistedDecorations.validatedBlockColors,
        completed: false,
        correct: null,
        userAnswer: getVisibleBlockAnswer(nextWords),
      };
      next[selectedIdx] = {
        ...state,
        lineStates,
        userAnswer: buildQuestionUserAnswer(currentQuestion, lineStates),
        touched: true,
      };
      return next;
    });
    ensureAnswerVisible('smooth');
  }, [checkpointLengths, currentLineIndex, currentLineState.completed, currentQuestion, currentQuestionState.completed, ensureAnswerVisible, expectedBlocks.length, selectedIdx]);

  const handleInsertVisualBreak = useCallback(() => {
    if (currentQuestionState.completed || currentLineState.completed) return;

    setQuestionStates(prev => {
      const next = [...prev];
      const state = next[selectedIdx] || createExerciseDraft(currentQuestion);
      const lineStates = [...(state.lineStates || currentQuestion.lines.map(() => createLineDraft()))];
      const lineState = lineStates[currentLineIndex] || createLineDraft();
      const breakIndex = resolveActiveBlockIndex(lineState.selectedWords, expectedBlocks.length, lineState.editIndex);
      if (breakIndex <= 0) return prev;

      const visualBreakBeforeIndices = [...new Set([...(lineState.visualBreakBeforeIndices || []), breakIndex])].sort((a, b) => a - b);
      lineStates[currentLineIndex] = {
        ...lineState,
        visualBreakBeforeIndices,
      };
      next[selectedIdx] = {
        ...state,
        lineStates,
        touched: true,
      };
      return next;
    });
    ensureAnswerVisible('smooth');
  }, [currentLineIndex, currentLineState.completed, currentQuestion, currentQuestionState.completed, ensureAnswerVisible, expectedBlocks.length, selectedIdx]);

  const handleVerify = useCallback(() => {
    if (currentQuestionState.completed || currentLineState.completed) return;
    if (!filledBlockCount) {
      showToast('Ajoutez au moins un bloc avant de vérifier', 'info');
      return;
    }
    if (!spendVerificationEnergy()) return;

    const { userAnswer, verifyCorrect } = evaluateCurrentLineAnswer(currentLine, currentLineState.selectedWords);
    const metric = metricsRef.current[selectedIdx];
    if (metric) {
      metric.verifyAttempts += 1;
      const checkpointNow = Date.now();
      if (verifyCorrect) {
        metric.goodVerifications += 1;
      } else {
        metric.badVerifications += 1;
      }
      metric.microStepTimes.push({
        questionIdx: selectedIdx,
        title: metric.title,
        label: `${currentLine.stepLabel || currentStepLabel} · ${currentLine.refreshLabel || currentLine.lineLabel || `Rafraîchissement ${currentLineIndex + 1}`}`,
        seconds: Math.max(1, Math.round((checkpointNow - (metric.checkpointStartMs || checkpointNow)) / 1000)),
      });
      metric.checkpointStartMs = checkpointNow;
    }

    const nextLineStates = (currentQuestion.lines || []).map((line, index) => {
      const state = currentQuestionState.lineStates?.[index] || createLineDraft();
      if (index !== currentLineIndex) return state;
      return {
        ...state,
        feedbackState: verifyCorrect ? 'correct' : 'wrong',
        verifiedCheckpoints: checkpointLengths.filter(length => length <= getContiguousFilledCount(state.selectedWords, expectedBlocks.length)),
        verifiedBlockStates: getBlockVerificationStates(expectedBlocks, state.selectedWords),
        bankVersion: verifyCorrect ? state.bankVersion : state.bankVersion + 1,
        completed: false,
        correct: null,
        userAnswer,
      };
    });

    setQuestionStates(prev => {
      const next = [...prev];
      const state = next[selectedIdx] || createExerciseDraft(currentQuestion);
      next[selectedIdx] = {
        ...state,
        lineStates: nextLineStates,
        completed: false,
        userAnswer: buildQuestionUserAnswer(currentQuestion, nextLineStates),
        touched: true,
      };
      return next;
    });

    if (!verifyCorrect) {
      playSpecial('error');
      applyPenalty(getPenaltyValue(currentLine, sessionScoring, 'wrongPenalty', Math.abs(SCORE_CONFIG.wrongPenalty)));
    } else {
      playSpecial('success');
    }
    ensureAnswerVisible('smooth');
  }, [applyPenalty, checkpointLengths, currentLine, currentLineIndex, currentLineState.completed, currentLineState.selectedWords, currentQuestion, currentQuestionState.completed, currentQuestionState.lineStates, currentStepLabel, ensureAnswerVisible, expectedBlocks.length, filledBlockCount, playSpecial, selectedIdx, sessionScoring, showToast, spendVerificationEnergy]);

  const handleValidate = useCallback(() => {
    if (currentQuestionState.completed || currentLineState.completed) return;

    const { userAnswer, fullCorrect } = evaluateCurrentLineAnswer(currentLine, currentLineState.selectedWords);
    const validationColors = buildValidatedBlockColors(currentLineState.selectedWords);
    const nextLineStates = (currentQuestion.lines || []).map((line, index) => {
      const state = currentQuestionState.lineStates?.[index] || createLineDraft();
      if (index !== currentLineIndex) return state;
      return {
        ...state,
        feedbackState: fullCorrect ? 'correct' : 'wrong',
        verifiedCheckpoints: checkpointLengths.filter(length => length <= getContiguousFilledCount(state.selectedWords, expectedBlocks.length)),
        validatedBlockColors: validationColors,
        completed: true,
        correct: fullCorrect,
        userAnswer,
        editIndex: null,
      };
    });
    const questionCompleted = nextLineStates.length > 0 && nextLineStates.every(state => state.completed);
    const nextQuestionIndex = questionCompleted ? findNextIncompleteQuestionIndex(questionStates, selectedIdx) : -1;
    const questionCorrect = nextLineStates.length > 0 && nextLineStates.every(state => state.correct === true);
    const nextQuestionAnswer = buildQuestionUserAnswer(currentQuestion, nextLineStates);
    const checkpointNow = Date.now();
    const metric = metricsRef.current[selectedIdx];
    if (metric) {
      if (fullCorrect) metric.mandatoryPassed += 1;
      const refreshSeconds = Math.max(1, Math.round((checkpointNow - (metric.refreshStartMs || checkpointNow)) / 1000));
      const refreshLabel = currentLine.refreshLabel || currentLine.lineLabel || `Rafraîchissement ${currentLineIndex + 1}`;
      const stepLabel = currentLine.stepLabel || currentStepLabel;
      metric.refreshTimes.push({
        id: `${selectedIdx}-${currentLineIndex}-${metric.refreshTimes.length}`,
        questionIdx: selectedIdx,
        title: metric.title,
        label: refreshLabel,
        stepLabel,
        seconds: refreshSeconds,
        targetSeconds: resolveTimingSeconds(currentLine.refreshDelaySeconds, currentQuestion.refreshDelaySeconds, timingConfig.refreshDelaySeconds),
      });
      const stepKey = `${selectedIdx}-${currentLine.stepIndex ?? currentStepIndex}-${stepLabel}`;
      const previousStep = metric.stepTimeMap[stepKey] || {
        id: stepKey,
        questionIdx: selectedIdx,
        title: metric.title,
        label: stepLabel,
        seconds: 0,
        refreshCount: 0,
        targetSeconds: resolveTimingSeconds(currentLine.stepDelaySeconds, currentQuestion.stepDelaySeconds, timingConfig.stepDelaySeconds),
      };
      metric.stepTimeMap[stepKey] = {
        ...previousStep,
        seconds: previousStep.seconds + refreshSeconds,
        refreshCount: previousStep.refreshCount + 1,
      };
      metric.refreshStartMs = checkpointNow;
      metric.checkpointStartMs = checkpointNow;
    }

    setQuestionStates(prev => {
      const next = [...prev];
      const state = next[selectedIdx] || createExerciseDraft(currentQuestion);
      next[selectedIdx] = {
        ...state,
        lineStates: nextLineStates,
        completed: questionCompleted,
        userAnswer: nextQuestionAnswer,
        touched: true,
      };
      return next;
    });

    playSpecial(fullCorrect ? 'success' : 'error');

    if (questionCompleted) {
      setResults(prev => upsertResult(prev, { questionIdx: selectedIdx, correct: questionCorrect, userAnswer: nextQuestionAnswer }));
      if (nextQuestionIndex >= 0) {
        window.setTimeout(() => {
          setSelectedIdx(nextQuestionIndex);
          ensureAnswerVisible('smooth');
        }, 450);
      }
    } else {
      ensureAnswerVisible('smooth');
    }
  }, [checkpointLengths, currentLine, currentLineIndex, currentLineState.completed, currentLineState.selectedWords, currentQuestion, currentQuestionState.completed, currentQuestionState.lineStates, ensureAnswerVisible, expectedBlocks.length, playSpecial, questionStates, selectedIdx]);

  const hintSource = useMemo(() => {
    const fromLine = buildHints(currentLine);
    if (fromLine.length) return currentLine;
    return currentQuestion;
  }, [currentLine, currentQuestion]);

  const handleHintSpend = useCallback(async (hint) => {
    if (!hint) return false;
    const creditCost = getHintCost(hint);
    const inventoryCost = getHintInventoryCost(hint);
    const userCredits = Math.max(0, Number(data?.user?.credits) || 0);
    let paid = false;
    if (typeof consumeInventoryItem === 'function') {
      for (const inventoryKey of getHintInventoryKeys(hint)) {
        const available = Math.max(0, Number(data?.user?.inventory?.[inventoryKey]) || 0);
        if (available < inventoryCost) continue;
        paid = await consumeInventoryItem(inventoryKey, inventoryCost);
        if (paid) {
          showToast(`Indice révélé · ${inventoryCost} pack${inventoryCost > 1 ? 's' : ''} d'indice`, 'info');
          break;
        }
      }
    }
    if (!paid && userCredits >= creditCost && typeof updateProfile === 'function') {
      await updateProfile({ credits: userCredits - creditCost });
      showToast(`Indice révélé · ${creditCost} crédit${creditCost > 1 ? 's' : ''}`, 'info');
      paid = true;
    }
    if (!paid) {
      showToast(`Il faut ${creditCost} crédits ou ${inventoryCost} pack(s) d'indice`, 'error');
      return false;
    }
    setHintsUsed(prev => prev + 1);
    applyPenalty(getPenaltyValue(hintSource, sessionScoring, 'hintPenalty', Math.abs(SCORE_CONFIG.hintCost)));
    return true;
  }, [applyPenalty, consumeInventoryItem, data, hintSource, sessionScoring, showToast, updateProfile]);

  const handleOpenHints = useCallback(() => {
    const hints = buildHints(hintSource);
    if (!hints.length) {
      showToast('Pas d’indice disponible pour cette étape', 'info');
      return;
    }
    setShowHints(true);
  }, [hintSource, showToast]);

  const handleRetry = useCallback(() => {
    // If exercise-flow, restart the full flow from Énoncé page.
    if (quizState?.sessionKind === 'exercise-flow' && quizState?.sourceParams) {
      setQuizState(null);
      navigate('exerciseFlow', quizState.sourceParams);
      return;
    }
    setSelectedIdx(0);
    setQuestionStates(questions.map(question => createExerciseDraft(question)));
    setResults([]);
    setFinished(false);
    setShowHints(false);
    setShowEnonce(false);
    setHintsUsed(0);
    setShowTimeExpired(false);
    setTimeExpired(false);
    setElapsedSeconds(0);
    setPenaltyScore(0);
    setScoreFx(null);
    setSessionSummary(null);
    metricsRef.current = questions.map((question, index) => ({
      questionIdx: index,
      title: getQuestionTitle(question, index),
      verifyAttempts: 0,
      goodVerifications: 0,
      badVerifications: 0,
      accumulatedMs: 0,
      activeSince: null,
      checkpointStartMs: null,
      microStepTimes: [],
      refreshTimes: [],
      stepTimeMap: {},
      refreshStartMs: Date.now(),
      mandatoryPassed: 0,
      mandatoryTotal: question?.lines?.length || 1,
    }));
    activeQuestionRef.current = 0;
    finishAwardedRef.current = false;
  }, [baseScore, navigate, questions, quizState, setQuizState, timeLimitSeconds]);

  const finishSession = useCallback(async () => {
    if (finishAwardedRef.current) {
      setFinished(true);
      return;
    }
    pauseQuestionTracking(selectedIdx);
    const questionTimes = metricsRef.current.map(metric => ({
      questionIdx: metric.questionIdx,
      title: metric.title,
      seconds: Math.max(1, Math.round(metric.accumulatedMs / 1000)),
      verifyAttempts: metric.verifyAttempts,
      goodVerifications: metric.goodVerifications,
      badVerifications: metric.badVerifications,
      targetSeconds: resolveTimingSeconds(questions[metric.questionIdx]?.questionDelaySeconds, timingConfig.questionDelaySeconds),
      mandatoryPassed: metric.mandatoryPassed,
      mandatoryTotal: metric.mandatoryTotal,
    }));
    const microStepTimes = metricsRef.current.flatMap(metric => metric.microStepTimes);
    const refreshTimes = metricsRef.current.flatMap(metric => metric.refreshTimes || []);
    const stepTimes = metricsRef.current.flatMap(metric => Object.values(metric.stepTimeMap || {}));
    const verifyCount = questionTimes.reduce((sum, entry) => sum + entry.verifyAttempts, 0);
    const goodVerifications = questionTimes.reduce((sum, entry) => sum + entry.goodVerifications, 0);
    const badVerifications = questionTimes.reduce((sum, entry) => sum + entry.badVerifications, 0);
    const mandatoryCheckpointsPassed = questionTimes.reduce((sum, entry) => sum + entry.mandatoryPassed, 0);
    const mandatoryCheckpointsTotal = questionTimes.reduce((sum, entry) => sum + entry.mandatoryTotal, 0);
    const pageTimes = [
      ...((Array.isArray(quizState?.pageTimes) ? quizState.pageTimes : []).map(entry => ({ ...entry }))),
      {
        id: 'treatment',
        key: 'treatment',
        label: 'Traitement',
        seconds: timeSpentSeconds,
        targetSeconds: resolveTimingSeconds(timingConfig.treatmentDelaySeconds, timeLimitSeconds),
      },
    ].filter(entry => Number(entry.seconds) > 0);
    const summary = buildSessionSummary({
      title: quizState?.title || 'Traitement',
      sessionKind: quizState?.sessionKind,
      quizMode: quizState?.mode,
      flowType: quizState?.flowType,
      score,
      maxScore: baseScore,
      results: finalResults,
      totalQuestions: total,
      hintsUsed,
      timeSpentSeconds,
      timeLimitSeconds,
      timeFailed: timeExpired,
      verifyCount,
      goodVerifications,
      badVerifications,
      mandatoryCheckpointsPassed,
      mandatoryCheckpointsTotal,
      questionTimes,
      microStepTimes,
      pageTimes,
      stepTimes,
      refreshTimes,
      timing: timingConfig,
      scoreScale,
      subjectId: quizState?.subjectId,
      subjectName: resolveSubjectName(quizState?.subjectId),
      subjectCoefficient,
      averageWeight: sessionScoring?.averageWeight,
      fireMultiplier: sessionScoring?.fireMultiplier,
    });
    const nextUser = await applySessionRewards(summary);
    setSessionSummary({
      ...summary,
      averageAfter: nextUser?.averageScore,
      averageDelta: roundMetric((nextUser?.averageScore || 0) - (data?.user?.averageScore || 0), 1),
      fireAfter: nextUser?.fire,
    });
    finishAwardedRef.current = true;
    setFinished(true);
  }, [applySessionRewards, baseScore, data?.user?.averageScore, finalResults, hintsUsed, pauseQuestionTracking, quizState?.flowType, quizState?.sessionKind, quizState?.subjectId, quizState?.title, score, scoreScale, selectedIdx, timeExpired, timeLimitSeconds, timeSpentSeconds, total]);

  const handleContinueAfterTimeExpired = useCallback(() => {
    setShowTimeExpired(false);
  }, []);

  const handleFinishAfterTimeExpired = useCallback(async () => {
    setShowTimeExpired(false);
    await finishSession();
  }, [finishSession]);

  useEffect(() => {
    if (!allCompleted || finished || showTimeExpired) return undefined;
    const timeout = window.setTimeout(() => {
      finishSession();
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [allCompleted, finishSession, finished, showTimeExpired]);

  if (!quizState || !total) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-txt-sub font-semibold">Aucune question disponible</p>
        <button onClick={() => navigate('home')} className="px-6 py-3 rounded-xl bg-primary text-white font-bold shadow-gold btn-bounce">
          Retour
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <FinalStats
        results={finalResults}
        title={quizState.title || 'Traitement'}
        totalQuestions={total}
        onHome={handleExit}
        onRetry={handleRetry}
        sessionKind={quizState.sessionKind}
        flowType={quizState.flowType}
        flowTotalSteps={quizState.flowTotalSteps}
        chapterTitle={quizState.chapterTitle}
        chapterNumber={quizState.chapterNumber}
        score={score}
        maxScore={baseScore}
        timeSpentSeconds={timeSpentSeconds}
        timeLimitSeconds={timeLimitSeconds}
        timeFailed={timeExpired}
        sessionSummary={sessionSummary}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg" style={layoutMinHeight ? { minHeight: `${layoutMinHeight}px`, paddingBottom: `${keyboardAvoidOffset}px` } : undefined}>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-primary/10 px-3 py-2">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={handleExit} className="text-txt-sub active:scale-90 transition-transform">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{renderMixedContent(quizState.title || 'Traitement')}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-txt-sub flex-wrap leading-none mt-0.5">
                <span>Étape {quizState.flowStep || 3}/{quizState.flowTotalSteps || 4}</span>
                <span>·</span>
                <span>{quizState.flowType === 'sujet-type' ? 'Sujet type' : 'Exercice'}</span>
                <span>·</span>
                <span>{completedCount}/{total} finies</span>
                <span>·</span>
                <span className={timeExpired ? 'text-accent-red font-bold' : 'text-primary-dark font-bold'}>{formatDuration(timeSpentSeconds)}</span>
                {timeLimitSeconds > 0 ? <span>/ {formatDuration(timeLimitSeconds)}</span> : null}
                <span>·</span>
                <span className="relative flex items-center gap-1"><Zap size={10} className="text-primary" />{score}{scoreFx ? <span key={scoreFx.id} className="absolute -bottom-3 right-0 text-[9px] font-extrabold text-accent-red animate-bounce">-{scoreFx.amount}</span> : null}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {quizState.enonce ? (
                <button onClick={() => setShowEnonce(true)} className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform">
                  <Eye size={16} />
                </button>
              ) : null}
              {quizState.enonce ? (
                <TranslationButton onClick={() => setTranslationTarget(enonceTranslationTarget)} title="Traduction de l’énoncé" />
              ) : null}
              <button onClick={handleOpenHints} className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform">
                <HelpCircle size={16} />
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2">
            {questions.map((question, index) => {
              const state = questionStates[index] || createExerciseDraft(question);
              const active = index === selectedIdx;
              const started = (state.lineStates || []).some((lineState) => lineState.completed || lineState.selectedWords.length > 0);
              return (
                <button
                  key={question.id || index}
                  onClick={() => {
                    setSelectedIdx(index);
                    ensureAnswerVisible('smooth');
                  }}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all active:scale-95 ${
                    active
                      ? 'bg-primary text-white border-primary shadow-gold'
                      : state.completed
                        ? 'bg-accent-green/10 text-accent-green border-accent-green/20'
                        : started
                          ? 'bg-primary/5 text-primary-dark border-primary/20'
                          : 'bg-white text-txt-sub border-gray-100'
                  }`}
                >
                  Q{index + 1}
                </button>
              );
            })}
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden px-3 py-3 max-w-lg mx-auto w-full">
        <div className="h-full flex flex-col gap-3" style={{ paddingBottom: `${bottomPanelPadding}px` }}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-3 space-y-2 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider">Question en cours</p>
              <div className="flex items-start gap-2 mt-1">
                <h3 className="text-sm font-bold leading-snug flex-1">{renderMixedContent(currentQuestion.question || currentQuestion.title || `Question ${selectedIdx + 1}`)}</h3>
                <TranslationButton onClick={() => setTranslationTarget(currentQuestionTranslationTarget)} title="Traduction de la question" />
              </div>
            </div>
            {currentQuestionState.completed ? (
              <span className="px-2.5 py-1 rounded-lg bg-accent-green/10 text-accent-green text-[10px] font-bold">Terminée</span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-txt-muted text-[10px] font-bold">En cours</span>
            )}
          </div>
          <div className="rounded-2xl border border-primary/10 bg-primary/5 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-primary-dark font-semibold">Étape en cours</p>
                <div className="text-sm font-bold text-primary-dark mt-1">{renderMixedContent(currentStepLabel)}</div>
              </div>
              <TranslationButton onClick={() => setTranslationTarget(currentStepTranslationTarget)} title="Traduction de l’étape" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-3 space-y-3 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold text-primary-dark uppercase tracking-wider">Réponse construite</p>
            <span className="text-[10px] text-txt-muted font-semibold">{answerStatusLabel}</span>
          </div>
          <div ref={answerScrollRef} onScroll={handleAnswerScroll} className="flex-1 min-h-0 overflow-y-auto pr-1 pb-1" style={{ scrollPaddingBottom: '18px' }}>
            <div className={`rounded-2xl border px-3 py-3 transition-all min-h-full ${answerCardTone}`}>
              {hasConstructedAnswer ? (
                <div className="space-y-3 min-h-[2.25rem]">
                  {constructedAnswerSegments.map((segment) => (
                    (segment.rows.length > 0 || segment.current) ? (
                      <div key={segment.id} className="space-y-2">
                        {(segment.rows.length > 0 ? segment.rows : [[]]).map((row, rowIndex) => (
                          <div key={`${segment.id}-row-${rowIndex}`} className="flex flex-wrap gap-1.5 items-start min-h-[2.25rem]">
                            {row.length > 0 ? row.map((block) => (
                              <button
                                key={`${segment.id}-${block.blockIndex}`}
                                type="button"
                                onClick={segment.current && !segment.completed ? () => handleRemoveBlockAt(block.blockIndex) : undefined}
                                disabled={!segment.current || segment.completed}
                                className="px-2 py-1 rounded-xl text-[11px] font-semibold border transition-all"
                                style={getBlockVisualStyle({
                                  tone: segment.completed ? 'completed' : segment.current ? 'current' : 'idle',
                                  verificationState: segment.verifiedBlockStates?.[block.blockIndex] || null,
                                  validatedColor: segment.validatedBlockColors?.[block.blockIndex] || null,
                                })}
                              >
                                {renderBlockValue(block.value, segment.preferMath)}
                              </button>
                            )) : segment.current ? <span className="text-[11px] text-txt-muted">Nouvelle ligne prête.</span> : null}
                          </div>
                        ))}
                      </div>
                    ) : null
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 min-h-[2.25rem] items-start">
                  <span className="text-xs font-semibold text-primary-dark">Composez la réponse avec la banque de suggestion de blocs.</span>
                </div>
              )}
              {!currentQuestionState.completed && hasConstructedAnswer && (
                <p className="text-[11px] text-txt-muted italic mt-3">
                  {currentLineState.feedbackState === 'wrong' ? 'Touchez un bloc pour le remplacer, ou validez pour passer à la suite.' : 'Touchez un bloc déjà posé pour le remplacer à partir de cet endroit.'}
                </p>
              )}
            </div>
          </div>
        </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 px-2 pb-2 safe-bottom pointer-events-none">
        <div className="max-w-lg mx-auto pointer-events-auto space-y-1.5">
          <button
            onClick={() => {
              setBottomPanelCollapsed(prev => !prev);
              ensureAnswerVisible('smooth');
            }}
            className="w-full rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-xl shadow-lg px-3 py-2 text-[11px] font-bold text-primary-dark active:scale-95 transition-transform"
          >
            {bottomPanelCollapsed ? 'Afficher le clavier ▲' : 'Cacher le clavier ▼'}
          </button>

          {!bottomPanelCollapsed ? (
            <div className="rounded-3xl border border-gray-100 bg-white/95 backdrop-blur-xl shadow-xl p-3 space-y-2.5">
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => handleRemoveBlockAt(lastFilledBlockIndex)}
                  disabled={!canEraseCurrentLine}
                  className="py-2.5 rounded-2xl bg-gray-100 text-txt-main font-bold text-xs active:scale-95 transition-transform disabled:opacity-40"
                >
                  Effacer
                </button>
                <button
                  onClick={handleInsertVisualBreak}
                  disabled={!canValidateCurrentLine || activeBlockIndex <= 0}
                  className="py-2.5 rounded-2xl bg-gray-100 text-txt-main font-bold text-xs active:scale-95 transition-transform disabled:opacity-40"
                >
                  Ligne
                </button>
                <button
                  onClick={handleVerify}
                  className={`py-2 rounded-2xl font-bold shadow-gold btn-bounce flex flex-col items-center justify-center gap-0.5 ${canVerifyCurrentLine ? 'bg-primary text-white' : 'bg-gray-100 text-txt-muted'}`}
                >
                  <span className="text-[11px] leading-none">Vérifier</span>
                  {verifyButtonCostLabel ? <span className="text-[9px] leading-none px-1.5 py-0.5 rounded-full bg-white/15 text-white/85">{verifyButtonCostLabel}</span> : null}
                </button>
                <button
                  onClick={handleValidate}
                  className={`py-2.5 rounded-2xl font-bold text-xs shadow-gold btn-bounce ${canValidateCurrentLine ? 'bg-accent-green text-white' : 'bg-gray-100 text-txt-muted'}`}
                >
                  Valider
                </button>
              </div>
              {verificationBlockedByEnergy && canVerifyCurrentLine ? (
                <div className="rounded-2xl bg-primary/5 border border-primary/15 px-4 py-3 text-xs text-primary-dark font-semibold text-center">
                  Vérifier reste disponible, mais il faut {verificationEnergyCost} énergie pour lancer la vérification.
                </div>
              ) : null}
              {!currentQuestionState.completed && !currentLineState.completed && activeBank.length > 0 ? (
                <>
                  <div className="max-h-36 overflow-y-auto rounded-2xl bg-white border border-gray-100 p-2 shadow-card">
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {activeBank.map((block, index) => (
                        <button
                          key={`${selectedIdx}-${currentLineIndex}-${block}-${index}-${currentLineState.bankVersion}`}
                          onClick={() => handleApplyBlock(block)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold shadow-bouncy btn-bounce transition-all bg-white border border-primary/20 text-txt-main active:scale-95"
                        >
                          {renderBlockValue(block, hasMathBlocks)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <EnonceModal enonce={showEnonce ? quizState.enonce : ''} onClose={() => setShowEnonce(false)} />
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
      <HintsModal open={showHints} question={hintSource} data={data} onClose={() => setShowHints(false)} onSpend={handleHintSpend} />
      <TimeExpiredModal open={showTimeExpired} onFinish={handleFinishAfterTimeExpired} onContinue={handleContinueAfterTimeExpired} />
    </div>
  );
}

function StandardQuizView({ quizState, navigate, applySessionRewards, playSpecial, showToast, setQuizState, data, save, pushFloatingFx, updateProfile, consumeInventoryItem }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(null);
  const [showHints, setShowHints] = useState(false);
  const [finished, setFinished] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showTimeExpired, setShowTimeExpired] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);
  const [scoreFx, setScoreFx] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [translationTarget, setTranslationTarget] = useState(null);
  const [revealedTranslationIds, setRevealedTranslationIds] = useState([]);
  const [translationBusy, setTranslationBusy] = useState(false);
  const [score, setScore] = useState((quizState?.initialScore || ((quizState?.questions?.length || 0) * SCORE_CONFIG.correctBase)));
  const scoreFxTimeoutRef = useRef(null);
  const questionStartRef = useRef(Date.now());
  const finishAwardedRef = useRef(false);
  const questionMetricsRef = useRef([]);
  const [sessionSummary, setSessionSummary] = useState(null);

  const questions = quizState?.questions || [];
  const total = questions.length;
  const q = questions[currentIdx] || {};
  const baseScore = quizState?.initialScore || (total * SCORE_CONFIG.correctBase);
  const timeLimitSeconds = quizState?.timeLimitSeconds || (quizState?.sessionKind === 'exercise-flow' ? (quizState?.flowType === 'sujet-type' ? 10800 : 7200) : 0);
  const timeSpentSeconds = elapsedSeconds;
  const progress = total > 0 ? ((currentIdx) / total) * 100 : 0;
  const modeLabel = ({
    suggestion: 'Suggestion',
    input: 'Input Blocs',
    trap: 'Pièges',
    duel_intrus: 'Duel de l’Intrus',
    deminage: 'Déminage',
  })[quizState?.mode] || 'Traitement';
  const sessionScoring = quizState?.scoringConfig || {};
  const scoreScale = getFinalScoreScale(quizState?.scoreScale, sessionScoring?.scoreScale, data?.settings?.finalScoreScale);
  const timingConfig = quizState?.timing || {};
  const subjectCoefficient = Math.max(1, Number(quizState?.subjectCoefficient ?? sessionScoring?.subjectCoefficient) || 1);
  const activeSubject = (data?.subjects || []).find(subject => Number(subject.id) === Number(quizState?.subjectId));
  const questionTranslationPricing = resolveTranslationPricing(activeSubject, 'question');
  const optionTranslationPricing = resolveTranslationPricing(activeSubject, 'option');
  const questionTranslationTarget = buildTranslationTarget({
    id: `quiz-question-${currentIdx}`,
    title: `Question ${currentIdx + 1}`,
    raw: q.translations?.question,
    cost: questionTranslationPricing.hintPackCost,
    energyCost: questionTranslationPricing.energyCost,
    scoreCost: questionTranslationPricing.scoreCost,
  });

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [currentIdx]);

  useEffect(() => {
    questionMetricsRef.current = questions.map((question, index) => ({
      questionIdx: index,
      title: getQuestionTitle(question, index),
      seconds: 0,
      verifyAttempts: 0,
      goodVerifications: 0,
      badVerifications: 0,
      targetSeconds: resolveTimingSeconds(question?.delaySeconds, question?.timing?.questionDelaySeconds, timingConfig.questionDelaySeconds),
    }));
    questionStartRef.current = Date.now();
    finishAwardedRef.current = false;
    setElapsedSeconds(0);
    setTimeExpired(false);
    setShowTimeExpired(false);
    setTranslationTarget(null);
    setRevealedTranslationIds([]);
    setTranslationBusy(false);
    setSessionSummary(null);
  }, [questions, timingConfig.questionDelaySeconds]);

  useEffect(() => {
    if (!scoreFx) return undefined;
    if (scoreFxTimeoutRef.current) window.clearTimeout(scoreFxTimeoutRef.current);
    scoreFxTimeoutRef.current = window.setTimeout(() => setScoreFx(null), 900);
    return () => {
      if (scoreFxTimeoutRef.current) window.clearTimeout(scoreFxTimeoutRef.current);
    };
  }, [scoreFx]);

  useEffect(() => {
    if (finished) return undefined;
    const interval = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [finished]);

  useEffect(() => {
    if (!timeLimitSeconds || finished || timeExpired || elapsedSeconds < timeLimitSeconds) return;
    setTimeExpired(true);
    setShowTimeExpired(true);
  }, [elapsedSeconds, finished, timeExpired, timeLimitSeconds]);

  const applyPenalty = useCallback((amount) => {
    const safeAmount = Math.max(0, Math.abs(Number(amount) || 0));
    if (!safeAmount) return;
    setScore(prev => Math.max(0, prev - safeAmount));
    setScoreFx({ id: Date.now(), amount: safeAmount });
  }, []);

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
      applyPenalty(translationTarget.scoreCost);
      pushFloatingFx({ kind: 'score', label: 'Score', amount: -translationTarget.scoreCost, positive: false });
    } finally {
      setTranslationBusy(false);
    }
  }, [applyPenalty, consumeInventoryItem, data, pushFloatingFx, revealedTranslationIds, save, showToast, translationBusy, translationTarget]);

  const handleOpenOptionTranslation = useCallback((index) => {
    const rawTranslation = q.translations?.options?.[index] || q.translations?.items?.[index] || null;
    setTranslationTarget(buildTranslationTarget({
      id: `quiz-option-${currentIdx}-${index}`,
      title: `Option ${index + 1}`,
      raw: rawTranslation,
      cost: optionTranslationPricing.hintPackCost,
      energyCost: optionTranslationPricing.energyCost,
      scoreCost: optionTranslationPricing.scoreCost,
    }));
  }, [currentIdx, optionTranslationPricing.energyCost, optionTranslationPricing.hintPackCost, optionTranslationPricing.scoreCost, q]);

  const handleExit = useCallback(() => {
    const nextParams = quizState.subjectId ? { subjectId: quizState.subjectId } : undefined;
    setQuizState(null);
    if (quizState.subjectId) {
      navigate('chapter', nextParams);
      return;
    }
    navigate('home');
  }, [navigate, quizState.subjectId, setQuizState]);

  const handleAnswer = useCallback((correct, userAnswer) => {
    const questionMetric = questionMetricsRef.current[currentIdx];
    if (questionMetric) {
      questionMetric.seconds = Math.max(1, Math.round((Date.now() - questionStartRef.current) / 1000));
      questionMetric.verifyAttempts += 1;
      if (correct) questionMetric.goodVerifications += 1;
      else questionMetric.badVerifications += 1;
    }
    setResults(prev => [...prev, { questionIdx: currentIdx, correct, userAnswer }]);

    if (correct) {
      playSpecial('success');
    } else {
      playSpecial('error');
      applyPenalty(getPenaltyValue(q, sessionScoring, 'wrongPenalty', Math.abs(SCORE_CONFIG.wrongPenalty)));
    }

    const correctText = getCorrectText(q);
    setShowFeedback({ correct, correctAnswer: correctText, explanation: q.explanation, preferMath: Boolean(q.preferMath) });
  }, [currentIdx, q, playSpecial, applyPenalty, sessionScoring]);

  const finishSession = useCallback(async () => {
    if (finishAwardedRef.current) {
      setFinished(true);
      return;
    }

    const verifyCount = questionMetricsRef.current.reduce((sum, entry) => sum + entry.verifyAttempts, 0);
    const goodVerifications = questionMetricsRef.current.reduce((sum, entry) => sum + entry.goodVerifications, 0);
    const badVerifications = questionMetricsRef.current.reduce((sum, entry) => sum + entry.badVerifications, 0);
    const summary = buildSessionSummary({
      title: quizState?.title || 'Quiz',
      sessionKind: quizState?.sessionKind,
      flowType: quizState?.flowType,
      score,
      maxScore: baseScore,
      results,
      totalQuestions: total,
      hintsUsed,
      timeSpentSeconds,
      timeLimitSeconds,
      timeFailed: timeExpired,
      verifyCount,
      goodVerifications,
      badVerifications,
      mandatoryCheckpointsPassed: 0,
      mandatoryCheckpointsTotal: 0,
      questionTimes: questionMetricsRef.current.map((entry, index) => ({
        ...entry,
        targetSeconds: resolveTimingSeconds(questions[index]?.delaySeconds, questions[index]?.timing?.questionDelaySeconds, timingConfig.questionDelaySeconds),
      })),
      microStepTimes: [],
      pageTimes: [],
      stepTimes: [],
      refreshTimes: [],
      timing: timingConfig,
      scoreScale,
      subjectId: quizState?.subjectId,
      subjectName: resolveSubjectName(quizState?.subjectId),
      subjectCoefficient,
      averageWeight: sessionScoring?.averageWeight,
      fireMultiplier: sessionScoring?.fireMultiplier,
    });
    const nextUser = await applySessionRewards(summary);
    setSessionSummary({
      ...summary,
      averageAfter: nextUser?.averageScore,
      averageDelta: roundMetric((nextUser?.averageScore || 0) - (data?.user?.averageScore || 0), 1),
      fireAfter: nextUser?.fire,
    });
    finishAwardedRef.current = true;
    setFinished(true);
  }, [applySessionRewards, baseScore, data?.user?.averageScore, hintsUsed, questions, quizState?.flowType, quizState?.sessionKind, quizState?.subjectId, quizState?.title, results, score, scoreScale, subjectCoefficient, timeExpired, timeLimitSeconds, timeSpentSeconds, timingConfig, total]);

  const handleNext = useCallback(async () => {
    setShowFeedback(null);
    if (currentIdx + 1 >= total) {
      await finishSession();
    } else {
      setCurrentIdx(prev => prev + 1);
    }
  }, [currentIdx, finishSession, total]);

  const handleOpenHints = useCallback(() => {
    const hints = buildHints(q);
    if (!hints.length) {
      showToast('Pas d’indice disponible', 'info');
      return;
    }
    setShowHints(true);
  }, [q, showToast]);

  const handleHintSpend = useCallback(async (hint) => {
    if (!hint) return false;
    const creditCost = getHintCost(hint);
    const inventoryCost = getHintInventoryCost(hint);
    const userCredits = Math.max(0, Number(data?.user?.credits) || 0);
    let paid = false;
    if (typeof consumeInventoryItem === 'function') {
      for (const inventoryKey of getHintInventoryKeys(hint)) {
        const available = Math.max(0, Number(data?.user?.inventory?.[inventoryKey]) || 0);
        if (available < inventoryCost) continue;
        paid = await consumeInventoryItem(inventoryKey, inventoryCost);
        if (paid) {
          showToast(`Indice révélé · ${inventoryCost} pack${inventoryCost > 1 ? 's' : ''} d'indice`, 'info');
          break;
        }
      }
    }
    if (!paid && userCredits >= creditCost && typeof updateProfile === 'function') {
      await updateProfile({ credits: userCredits - creditCost });
      showToast(`Indice révélé · ${creditCost} crédit${creditCost > 1 ? 's' : ''}`, 'info');
      paid = true;
    }
    if (!paid) {
      showToast(`Il faut ${creditCost} crédits ou ${inventoryCost} pack(s) d'indice`, 'error');
      return false;
    }
    setHintsUsed(prev => prev + 1);
    applyPenalty(getPenaltyValue(q, sessionScoring, 'hintPenalty', Math.abs(SCORE_CONFIG.hintCost)));
    return true;
  }, [applyPenalty, consumeInventoryItem, data, q, sessionScoring, showToast, updateProfile]);

  const handleContinueAfterTimeExpired = () => {
    setShowTimeExpired(false);
  };

  const handleFinishAfterTimeExpired = async () => {
    setShowTimeExpired(false);
    await finishSession();
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setResults([]);
    setFinished(false);
    setScore(baseScore);
    setHintsUsed(0);
    setShowFeedback(null);
    setShowHints(false);
    setElapsedSeconds(0);
    setTimeExpired(false);
    setShowTimeExpired(false);
    setScoreFx(null);
    setTranslationTarget(null);
    setRevealedTranslationIds([]);
    setTranslationBusy(false);
    setSessionSummary(null);
    questionMetricsRef.current = questions.map((question, index) => ({
      questionIdx: index,
      title: getQuestionTitle(question, index),
      seconds: 0,
      verifyAttempts: 0,
      goodVerifications: 0,
      badVerifications: 0,
      targetSeconds: resolveTimingSeconds(question?.delaySeconds, question?.timing?.questionDelaySeconds, timingConfig.questionDelaySeconds),
    }));
    questionStartRef.current = Date.now();
    finishAwardedRef.current = false;
  };

  if (!quizState || !total) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-txt-sub font-semibold">Aucune question disponible</p>
        <button onClick={() => navigate('home')} className="px-6 py-3 rounded-xl bg-primary text-white font-bold shadow-gold btn-bounce">
          Retour
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <FinalStats
        results={results}
        title={quizState.title || 'Quiz'}
        totalQuestions={total}
        onHome={handleExit}
        onRetry={handleRetry}
        sessionKind={quizState.sessionKind}
        flowType={quizState.flowType}
        flowTotalSteps={quizState.flowTotalSteps}
        chapterTitle={quizState.chapterTitle}
        chapterNumber={quizState.chapterNumber}
        score={score}
        maxScore={baseScore}
        timeSpentSeconds={timeSpentSeconds}
        timeLimitSeconds={timeLimitSeconds}
        timeFailed={timeExpired}
        sessionSummary={sessionSummary}
      />
    );
  }

  const renderQuestion = () => {
    const type = q.type || 'mcq';
    switch (type) {
      case 'mcq': return <MCQ question={q} onAnswer={handleAnswer} onTranslateOption={handleOpenOptionTranslation} />;
      case 'input': return <InputQuestion question={q} onAnswer={handleAnswer} />;
      case 'trap': return <TrapQuestion question={q} onAnswer={handleAnswer} onTranslateOption={handleOpenOptionTranslation} />;
      case 'duel-intrus': return <DuelIntrusQuestion question={q} onAnswer={handleAnswer} onTranslateOption={handleOpenOptionTranslation} />;
      case 'deminage': return <DeminageQuestion question={q} onAnswer={handleAnswer} />;
      case 'logic-sorter': return <LogicSorter question={q} onAnswer={handleAnswer} />;
      case 'redaction': return <RedactionQuestion question={q} onAnswer={handleAnswer} />;
      case 'block-input': return <BlockInputQuestion question={q} onAnswer={handleAnswer} onPenalty={applyPenalty} sessionScoring={sessionScoring} />;
      default: return <MCQ question={q} onAnswer={handleAnswer} />;
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-primary/10 px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={handleExit} className="text-txt-sub active:scale-90 transition-transform">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1">
            <div className="text-sm font-bold truncate">{renderMixedContent(quizState.title || 'Quiz')}</div>
            <div className="flex items-center gap-2 text-xs text-txt-sub">
              {quizState.sessionKind === 'exercise-flow' && (
                <>
                  <span>Étape {quizState.flowStep || 3}/{quizState.flowTotalSteps || 4}</span>
                  <span>·</span>
                </>
              )}
              {quizState.chapterTitle && (
                <>
                  <span>Chapitre {quizState.chapterNumber || 1}</span>
                  <span>·</span>
                </>
              )}
              <span>{modeLabel}</span>
              <span>·</span>
              <span>{currentIdx + 1}/{total}</span>
              <span>·</span>
              {timeLimitSeconds > 0 && (
                <>
                  <span className={timeSpentSeconds >= timeLimitSeconds ? 'text-accent-red font-bold' : 'text-primary-dark font-bold'}>{formatDuration(timeSpentSeconds)}</span>
                  <span>/ {formatDuration(timeLimitSeconds)}</span>
                  <span>·</span>
                </>
              )}
              {timeLimitSeconds <= 0 && <span className="text-primary-dark font-bold">{formatDuration(timeSpentSeconds)}</span>}
              <span className="relative flex items-center gap-1"><Zap size={12} className="text-primary" />{score}{scoreFx ? <span key={scoreFx.id} className="absolute -bottom-4 right-0 text-[10px] font-extrabold text-accent-red animate-bounce">-{scoreFx.amount}</span> : null}</span>
            </div>
          </div>
          <button onClick={handleOpenHints} className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform">
            <HelpCircle size={18} />
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {/* Question area */}
      <main className="flex-1 px-4 py-5 pb-32 max-w-lg mx-auto w-full">
        {/* Enoncé (sujet type BAC) */}
        {quizState.enonce && (
          <div className="mb-4 p-4 rounded-2xl bg-primary/5 border border-primary/15">
            <p className="text-xs font-bold text-primary-dark mb-1">Énoncé du sujet :</p>
            <div className="text-sm text-txt-main leading-relaxed">{renderMixedContent(quizState.enonce)}</div>
          </div>
        )}

        {/* Question text */}
        <div className="mb-5 animate-fade-in-up" key={currentIdx}>
          <div className="flex items-start gap-2 mb-1">
            <h3 className="text-base font-bold leading-snug flex-1">
              {renderMixedContent(q.question || q.title)}
            </h3>
            <TranslationButton onClick={() => setTranslationTarget(questionTranslationTarget)} title="Traduction de la question" />
          </div>
          {q.subtitle && <p className="text-xs text-txt-sub mt-1">{renderMixedContent(q.subtitle)}</p>}
        </div>

        {/* Question component */}
        <div key={`q-${currentIdx}`} className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          {renderQuestion()}
        </div>
      </main>

      {/* Feedback overlay */}
      {showFeedback && (
        <FeedbackPanel
          isCorrect={showFeedback.correct}
          correctAnswer={showFeedback.correctAnswer}
          explanation={showFeedback.explanation}
          preferMath={showFeedback.preferMath}
          onNext={handleNext}
        />
      )}

      {/* Hints modal */}
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
      <HintsModal open={showHints} question={q} data={data} onClose={() => setShowHints(false)} onSpend={handleHintSpend} />
      <TimeExpiredModal open={showTimeExpired} onFinish={handleFinishAfterTimeExpired} onContinue={handleContinueAfterTimeExpired} />
    </div>
  );
}

export default function QuizView() {
  const app = useApp();

  if (app.quizState?.sessionKind === 'exercise-flow') {
    return <ExerciseFlowTreatmentView {...app} />;
  }

  return <StandardQuizView {...app} />;
}
