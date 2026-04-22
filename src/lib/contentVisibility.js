import { getQuizModeQuestions } from './quizModes';

const QUIZ_MODES = ['suggestion', 'input', 'trap', 'duel_intrus', 'deminage'];

function normalizeText(value) {
  return (value || '').toString().trim();
}

function optionText(option) {
  if (typeof option === 'string') return option;
  return option?.text ?? '';
}

function splitToBlocks(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function buildQuestionPrompt(question = {}) {
  return normalizeText(question?.text || question?.question || question?.title || question?.prompt);
}

function getOptionValues(options = []) {
  return (Array.isArray(options) ? options : []).map(optionText).map(normalizeText).filter(Boolean);
}

function getCorrectAnswerText(question = {}) {
  const explicit = normalizeText(question?.correct_answer || question?.answer);
  if (explicit) return explicit;

  if (Array.isArray(question?.correctOrder) && question.correctOrder.length) {
    const joined = question.correctOrder.map(normalizeText).filter(Boolean).join(' ');
    if (joined) return joined;
  }

  if (Array.isArray(question?.correctBlocks) && question.correctBlocks.length) {
    const joined = question.correctBlocks.map(normalizeText).filter(Boolean).join(' ');
    if (joined) return joined;
  }

  if (Array.isArray(question?.options) && Number.isInteger(question?.correct)) {
    return normalizeText(optionText(question.options[question.correct]));
  }

  return '';
}

function hasAcceptedAnswers(question = {}) {
  return Array.isArray(question?.acceptedAnswers)
    && question.acceptedAnswers.map(normalizeText).filter(Boolean).length > 0;
}

function getRawQuizModeQuestions(item = {}, mode) {
  if (Array.isArray(item?.modeQuestions?.[mode])) return item.modeQuestions[mode];
  if (Array.isArray(item?.questions)) return item.questions;
  return [];
}

function buildsToPlayableQuizQuestion(mode, question = {}) {
  try {
    return getQuizModeQuestions({ modeQuestions: { [mode]: [question] } }, mode).length > 0;
  } catch {
    return false;
  }
}

function isPlayableSuggestionQuestion(question = {}) {
  const prompt = buildQuestionPrompt(question);
  if (!prompt) return false;

  const options = getOptionValues(question.options);
  const correctAnswer = getCorrectAnswerText(question);
  if (options.length >= 2 && correctAnswer) {
    return options.some((option) => option.toLowerCase() === correctAnswer.toLowerCase());
  }

  return buildsToPlayableQuizQuestion('suggestion', question)
    && Boolean(
      correctAnswer
      || (Array.isArray(question?.suggestions) && question.suggestions.map(normalizeText).filter(Boolean).length >= 2)
      || (Array.isArray(question?.correctBlocks) && question.correctBlocks.map(normalizeText).filter(Boolean).length > 0)
      || (Array.isArray(question?.correctOrder) && question.correctOrder.map(normalizeText).filter(Boolean).length > 0)
    );
}

function isPlayableInputQuestion(question = {}) {
  const prompt = buildQuestionPrompt(question);
  if (!prompt) return false;

  return buildsToPlayableQuizQuestion('input', question)
    && Boolean(getCorrectAnswerText(question) || hasAcceptedAnswers(question));
}

function isPlayableTrapQuestion(question = {}) {
  const prompt = buildQuestionPrompt(question);
  if (!prompt) return false;

  const optionCount = getOptionValues(question.options).length;
  const itemCount = Array.isArray(question?.items) ? question.items.map(normalizeText).filter(Boolean).length : 0;
  return buildsToPlayableQuizQuestion('trap', question)
    && (optionCount >= 2 || itemCount >= 2);
}

function isPlayableDuelIntrusQuestion(question = {}) {
  const prompt = buildQuestionPrompt(question);
  if (!prompt) return false;

  const optionCount = getOptionValues(question.options).length;
  const safeBlock = normalizeText(question?.safeBlock);
  const trapBlock = normalizeText(question?.trapBlock);
  return buildsToPlayableQuizQuestion('duel_intrus', question)
    && (optionCount >= 2 || (safeBlock && trapBlock));
}

function isPlayableDeminageQuestion(question = {}) {
  const prompt = buildQuestionPrompt(question);
  if (!prompt) return false;

  const correctBlocks = Array.isArray(question?.correctBlocks)
    ? question.correctBlocks.map(normalizeText).filter(Boolean)
    : [];

  return buildsToPlayableQuizQuestion('deminage', question)
    && correctBlocks.length > 0;
}

function isPlayableQuizQuestion(mode, question = {}) {
  if (mode === 'suggestion') return isPlayableSuggestionQuestion(question);
  if (mode === 'input') return isPlayableInputQuestion(question);
  if (mode === 'trap') return isPlayableTrapQuestion(question);
  if (mode === 'duel_intrus') return isPlayableDuelIntrusQuestion(question);
  if (mode === 'deminage') return isPlayableDeminageQuestion(question);
  return false;
}

function getRawExerciseQuestionLines(question = {}) {
  if (Array.isArray(question?.lines) && question.lines.length) return question.lines;
  if (Array.isArray(question?.refreshes) && question.refreshes.length) return question.refreshes;
  if (Array.isArray(question?.rafraichissements) && question.rafraichissements.length) return question.rafraichissements;
  return [question];
}

function getLineAnswerText(line = {}) {
  const answer = normalizeText(line?.answer);
  if (answer) return answer;

  if (Array.isArray(line?.correctOrder) && line.correctOrder.length) {
    const joined = line.correctOrder.map(normalizeText).filter(Boolean).join(' ');
    if (joined) return joined;
  }

  if (Array.isArray(line?.correctBlocks) && line.correctBlocks.length) {
    const joined = line.correctBlocks.map(normalizeText).filter(Boolean).join(' ');
    if (joined) return joined;
  }

  if (Array.isArray(line?.options) && Number.isInteger(line?.correct)) {
    const correctOption = normalizeText(optionText(line.options[line.correct]));
    if (correctOption) return correctOption;
  }

  return '';
}

function getExpectedBlocks(line = {}) {
  if (Array.isArray(line?.correctBlocks) && line.correctBlocks.length) {
    return line.correctBlocks.map(normalizeText).filter(Boolean);
  }

  if (Array.isArray(line?.correctOrder) && line.correctOrder.length) {
    return line.correctOrder.map(normalizeText).filter(Boolean);
  }

  if (Array.isArray(line?.suggestions) && line.suggestions.length) {
    return line.suggestions.map(normalizeText).filter(Boolean);
  }

  return splitToBlocks(getLineAnswerText(line));
}

function isPlayableExerciseQuestion(question = {}) {
  const lines = getRawExerciseQuestionLines(question);
  return lines.some((line) => getExpectedBlocks(line).length > 0);
}

export function getPlayableCompositeQuestions(item = {}) {
  const questions = Array.isArray(item?.traitement?.questions) && item.traitement.questions.length
    ? item.traitement.questions
    : Array.isArray(item?.questions) && item.questions.length
      ? item.questions
      : [];

  return questions.filter((question) => isPlayableExerciseQuestion(question));
}

export function countPlayableQuizQuestions(item = {}) {
  return QUIZ_MODES.reduce((total, mode) => {
    return total + getRawQuizModeQuestions(item, mode).filter((question) => isPlayableQuizQuestion(mode, question)).length;
  }, 0);
}

export function countPlayableQuizModes(item = {}) {
  return QUIZ_MODES.reduce((total, mode) => {
    return total + (getRawQuizModeQuestions(item, mode).some((question) => isPlayableQuizQuestion(mode, question)) ? 1 : 0);
  }, 0);
}

export function hasPlayableQuizContent(item = {}) {
  return countPlayableQuizQuestions(item) > 0;
}

export function countPlayableCompositeQuestions(item = {}) {
  return getPlayableCompositeQuestions(item).length;
}

export function hasPlayableCompositeContent(item = {}) {
  return countPlayableCompositeQuestions(item) > 0;
}
