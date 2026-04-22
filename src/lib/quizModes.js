import { buildHints } from './hintSystem';
import {
  buildTextTranslationMap,
  mapValuesToTranslations,
  normalizeTranslationLeaf,
  normalizeTranslations,
} from './translations';

function normalizeText(value) {
  return (value || '').toString().trim();
}

function uniqueAnswers(values) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = normalizeText(value);
    if (!normalized) return false;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitToBlocks(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function detectPreferMath(values, explicit = false) {
  if (explicit === true) return true;
  return (values || []).some((value) => /\$|\\|\^|_|=|\(|\)|\[|\]|\{|\}/.test((value || '').toString()));
}

function compactInputText(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function buildTitle(quiz) {
  if (quiz.quiz_metadata?.quiz_title) return quiz.quiz_metadata.quiz_title;
  return quiz.title || 'Quiz';
}

function buildQuestionText(question) {
  return question.text || question.question || question.title || '';
}

function buildHint(question) {
  if (question.hint || question.indice) return question.hint || question.indice;
  const hints = buildHints(question);
  return hints[0]?.text || '';
}

function buildHintList(question) {
  return buildHints(question);
}

function buildExplanation(question) {
  return question.explanation || question.explication || '';
}

function collectOptionTranslationEntries(options = []) {
  return options.map((option) => normalizeTranslationLeaf(option?.translations));
}

function buildQuestionTranslationPayload(question, builtValues = [], sourceValues = []) {
  const normalized = normalizeTranslations(question?.translations);
  const fallbackOptionEntries = collectOptionTranslationEntries(Array.isArray(question?.options) ? question.options : []);
  const translationEntries = normalized.options.length > 0 ? normalized.options : fallbackOptionEntries;
  const optionMap = buildTextTranslationMap(sourceValues, translationEntries);

  return {
    question: normalized.question,
    subtitle: normalized.subtitle,
    enonce: normalized.enonce,
    prompt: normalized.prompt,
    options: mapValuesToTranslations(builtValues, optionMap),
    items: mapValuesToTranslations(builtValues, optionMap),
    steps: normalized.steps,
  };
}

function optionText(option) {
  if (typeof option === 'string') return option;
  return option?.text ?? '';
}

function shuffleArray(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function deriveCorrectAnswer(question) {
  if (question.correct_answer) return question.correct_answer;
  if (question.answer) return question.answer;
  if (Array.isArray(question.correctOrder)) return question.correctOrder.join(' ');
  if (Array.isArray(question.correctBlocks)) return question.correctBlocks.join(' ');
  if (Array.isArray(question.options) && typeof question.correct === 'number') {
    return optionText(question.options[question.correct]);
  }
  return '';
}

function buildInputAnswers(question) {
  return uniqueAnswers([
    ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : []),
    question.correct_answer,
    question.answer,
    deriveCorrectAnswer(question),
  ]);
}

function buildInputBlockOptions(question) {
  const acceptedAnswers = buildInputAnswers(question);
  const canonicalAnswer = normalizeText(deriveCorrectAnswer(question) || acceptedAnswers[0]);
  if (!canonicalAnswer) return null;

  const pool = uniqueAnswers([
    ...(Array.isArray(question.blockOptions) ? question.blockOptions : []),
    ...(Array.isArray(question.suggestionPool) ? question.suggestionPool : []),
    ...(Array.isArray(question.distractors) ? question.distractors : []),
    ...(Array.isArray(question.options) ? question.options.map(optionText) : []),
    canonicalAnswer,
  ]);

  const optionCount = Math.max(2, Math.min(4, Number(question.optionCount) || pool.length || 4));
  const options = uniqueAnswers([
    canonicalAnswer,
    ...pool.filter((option) => normalizeText(option).toLowerCase() !== canonicalAnswer.toLowerCase()),
  ]).slice(0, optionCount);

  if (options.length < 2) return null;

  const shuffled = shuffleArray(options);
  return {
    options: shuffled,
    correct: shuffled.findIndex(option => normalizeText(option).toLowerCase() === canonicalAnswer.toLowerCase()),
    answer: canonicalAnswer,
    acceptedAnswers,
    preferMath: detectPreferMath(shuffled, question.preferMath),
  };
}

/**
 * Mode Pièges (single-select MCQ avec option vide).
 * - Le quiz présente une question + plusieurs propositions.
 * - Exactement UNE proposition non-piège est attendue (ou l'option vide si
 *   TOUTES les propositions visibles sont des pièges).
 * - Une option vide est toujours injectée et devient la bonne réponse
 *   lorsqu'il n'existe aucune proposition non-piège.
 */
function buildTrapItems(question) {
  // Schéma canonique : options = [{ text, is_trap }, ...]
  const canonical = (() => {
    if (Array.isArray(question.options) && question.options.length > 0) {
      // Si options[0] est déjà un objet {text, is_trap}
      if (typeof question.options[0] === 'object' && question.options[0] !== null) {
        return question.options
          .map((option) => ({
            text: optionText(option),
            isTrap: Boolean(option?.is_trap ?? option?.isTrap),
          }))
          .filter((option) => option.text.length > 0 || option.isTrap);
      }
      // Si options est un tableau de strings + champ `correct` (MCQ recyclé)
      if (typeof question.correct === 'number') {
        return question.options.map((option, index) => ({
          text: optionText(option),
          isTrap: index !== question.correct,
        }));
      }
    }

    // Schéma hérité : items[] + traps[]
    if (question.type === 'trap' && Array.isArray(question.items)) {
      const trapSet = new Set((question.traps || []).map(Number).filter(Number.isInteger));
      return question.items.map((item, index) => ({
        text: normalizeText(item),
        isTrap: trapSet.has(index),
      }));
    }

    return null;
  })();

  if (!canonical) return null;

  // Filtrer les options non-pièges explicitement non vides.
  const nonTrapOptions = canonical.filter((option) => !option.isTrap && option.text.length > 0);
  const trapOptions = canonical.filter((option) => option.isTrap && option.text.length > 0);

  // Construction finale : 1 non-trap (si existe) + plusieurs traps + 1 vide.
  const finalOptions = [];
  if (nonTrapOptions.length > 0) {
    // Prend la première non-trap (les énoncés ne devraient en avoir qu'une).
    finalOptions.push({ text: nonTrapOptions[0].text, isTrap: false });
  }
  // Complète avec les pièges (max 3 pour garder 4 options total avec l'empty).
  trapOptions.slice(0, 3).forEach((option) => {
    finalOptions.push({ text: option.text, isTrap: true });
  });

  // Si aucune non-trap n'existe, l'option vide devient la bonne réponse.
  const emptyIsCorrect = nonTrapOptions.length === 0;
  finalOptions.push({ text: '', isTrap: !emptyIsCorrect });

  if (finalOptions.length < 2) return null;

  // Mélange les options (on retrouve ensuite l'index correct via isTrap === false).
  const shuffled = shuffleArray(finalOptions);
  const correctIndex = shuffled.findIndex((option) => !option.isTrap);

  return {
    items: shuffled.map((option) => option.text),
    traps: shuffled.map((option, index) => option.isTrap ? index : -1).filter((index) => index >= 0),
    correctIndex,
    emptyIndex: shuffled.findIndex((option) => option.text === ''),
  };
}

function buildSuggestionOptions(question) {
  if (Array.isArray(question.options) && question.options.length > 0) {
    const mapped = question.options.map(optionText).slice(0, 4);
    const correctAnswer = normalizeText(deriveCorrectAnswer(question));
    const correctIndex = mapped.findIndex(option => normalizeText(option) === correctAnswer);
    const shuffled = shuffleArray(mapped);
    return {
      options: shuffled,
      correct: shuffled.findIndex(option => normalizeText(option) === correctAnswer || (correctIndex >= 0 && option === mapped[correctIndex])),
    };
  }

  if (Array.isArray(question.suggestions) && question.suggestions.length > 0) {
    const correctAnswer = (question.correctOrder || question.suggestions).join(' ');
    const distractors = [];

    if (question.suggestions.length > 2) {
      distractors.push([...question.suggestions].reverse().join(' '));
      distractors.push(question.suggestions.slice(1).concat(question.suggestions[0]).join(' '));
    }

    if (Array.isArray(question.acceptedAnswers)) {
      distractors.push(...question.acceptedAnswers.slice(1, 3));
    }

    const options = [...new Set([correctAnswer, ...distractors.map(normalizeText).filter(Boolean)])].slice(0, 4);
    const shuffled = shuffleArray(options);
    return {
      options: shuffled,
      correct: shuffled.findIndex(option => normalizeText(option) === normalizeText(correctAnswer)),
    };
  }

  if (Array.isArray(question.correctBlocks) && question.correctBlocks.length > 0) {
    const correctAnswer = question.correctBlocks.join(' ');
    const pool = Array.isArray(question.suggestionPool) ? question.suggestionPool : [];
    const distractors = [];

    if (pool.length >= question.correctBlocks.length) {
      distractors.push(pool.slice(0, question.correctBlocks.length).join(' '));
      distractors.push([...pool].reverse().slice(0, question.correctBlocks.length).join(' '));
    }

    const options = [...new Set([correctAnswer, ...distractors.map(normalizeText).filter(Boolean)])].slice(0, 4);
    const shuffled = shuffleArray(options);
    return {
      options: shuffled,
      correct: shuffled.findIndex(option => normalizeText(option) === normalizeText(correctAnswer)),
    };
  }

  return null;
}

function buildDuelIntrusOptions(question) {
  if (Array.isArray(question.options) && question.options.length >= 2) {
    const normalizedOptions = question.options
      .map((option) => typeof option === 'string'
        ? { text: option, isTrap: false }
        : { text: optionText(option), isTrap: Boolean(option?.is_trap ?? option?.isTrap) })
      .filter((option) => normalizeText(option.text));

    const safeOptions = normalizedOptions.filter((option) => !option.isTrap);
    if (normalizedOptions.length >= 2 && safeOptions.length === 1) {
      const correctAnswer = safeOptions[0].text;
      const shuffled = shuffleArray(normalizedOptions.map((option) => option.text).slice(0, 4));
      return {
        options: shuffled,
        correct: shuffled.findIndex((option) => normalizeText(option).toLowerCase() === normalizeText(correctAnswer).toLowerCase()),
        answer: correctAnswer,
        preferMath: detectPreferMath(shuffled, question.preferMath),
      };
    }
  }

  const safeBlock = normalizeText(question.safeBlock);
  const trapBlock = normalizeText(question.trapBlock);
  if (safeBlock && trapBlock) {
    const shuffled = shuffleArray([safeBlock, trapBlock]);
    return {
      options: shuffled,
      correct: shuffled.findIndex((option) => normalizeText(option).toLowerCase() === safeBlock.toLowerCase()),
      answer: safeBlock,
      preferMath: detectPreferMath(shuffled, question.preferMath),
    };
  }

  return null;
}

function buildDeminageDefinition(question) {
  const prefilledBlocks = Array.isArray(question.prefilledBlocks)
    ? question.prefilledBlocks
    : Array.isArray(question.currentBlocks)
      ? question.currentBlocks
      : splitToBlocks(question.prefilledAnswer || question.currentAnswer || '');
  const correctBlocks = Array.isArray(question.correctBlocks)
    ? question.correctBlocks
    : splitToBlocks(deriveCorrectAnswer(question));
  const suggestionPool = uniqueAnswers([
    ...(Array.isArray(question.suggestionPool) ? question.suggestionPool : []),
    ...(Array.isArray(question.blockOptions) ? question.blockOptions : []),
    ...(Array.isArray(question.distractors) ? question.distractors : []),
    ...correctBlocks,
  ]);

  if (!prefilledBlocks.length || !correctBlocks.length || prefilledBlocks.length !== correctBlocks.length || suggestionPool.length < 2) {
    return null;
  }

  return {
    prefilledBlocks,
    correctBlocks,
    suggestionPool,
    preferMath: detectPreferMath([...prefilledBlocks, ...correctBlocks, ...suggestionPool], question.preferMath),
  };
}

export function getQuizModeQuestions(quiz, mode) {
  const modeQuestions = quiz.modeQuestions?.[mode] || quiz.questions || [];

  if (mode === 'suggestion') {
    return modeQuestions
      .map(question => {
        const built = buildSuggestionOptions(question);
        if (!built || built.correct < 0 || built.options.length < 2) return null;
        return {
          type: 'mcq',
          question: buildQuestionText(question),
          options: built.options,
          correct: built.correct,
          translations: buildQuestionTranslationPayload(
            question,
            built.options,
            Array.isArray(question.options) ? question.options.map(optionText) : []
          ),
          hint: buildHint(question),
          hints: buildHintList(question),
          explanation: buildExplanation(question),
        };
      })
      .filter(Boolean);
  }

  if (mode === 'input') {
    return modeQuestions
      .map(question => {
        const built = buildInputBlockOptions(question);
        if (!built || built.correct < 0 || built.options.length < 2) return null;

        return {
          type: 'input',
          question: buildQuestionText(question),
          answer: built.answer,
          acceptedAnswers: built.acceptedAnswers,
          options: built.options,
          correct: built.correct,
          preferMath: built.preferMath,
          helperText: question.helperText || question.promptContext || question.recognitionContext || '',
          translations: buildQuestionTranslationPayload(question),
          hint: buildHint(question),
          hints: buildHintList(question),
          explanation: buildExplanation(question),
        };
      })
      .filter(Boolean);
  }

  if (mode === 'trap') {
    return modeQuestions
      .map(question => {
        const built = buildTrapItems(question);
        if (!built || built.items.length < 2 || built.correctIndex < 0) return null;
        return {
          type: 'trap',
          question: buildQuestionText(question),
          subtitle: question.subtitle || 'Choisissez la seule proposition juste, ou l\'option vide si toutes sont piégées.',
          items: built.items,
          traps: built.traps,
          correct: built.correctIndex,
          emptyIndex: built.emptyIndex,
          translations: buildQuestionTranslationPayload(
            question,
            built.items,
            Array.isArray(question.options) ? question.options.map(optionText) : []
          ),
          hint: buildHint(question),
          hints: buildHintList(question),
          explanation: buildExplanation(question),
        };
      })
      .filter(Boolean);
  }

  if (mode === 'duel_intrus') {
    return modeQuestions
      .map((question) => {
        const built = buildDuelIntrusOptions(question);
        if (!built || built.correct < 0 || built.options.length < 2) return null;
        return {
          type: 'duel-intrus',
          question: buildQuestionText(question),
          subtitle: question.subtitle || 'Sélectionnez le bloc sain et rejetez le piège.',
          options: built.options,
          correct: built.correct,
          answer: built.answer,
          preferMath: built.preferMath,
          translations: buildQuestionTranslationPayload(
            question,
            built.options,
            Array.isArray(question.options) ? question.options.map(optionText) : [question.safeBlock, question.trapBlock].filter(Boolean)
          ),
          scoring: {
            wrongPenalty: Number(question.scoring?.wrongPenalty) || 6,
            hintPenalty: Number(question.scoring?.hintPenalty) || 2,
          },
          hint: buildHint(question),
          hints: buildHintList(question),
          explanation: buildExplanation(question),
        };
      })
      .filter(Boolean);
  }

  if (mode === 'deminage') {
    return modeQuestions
      .map((question) => {
        const built = buildDeminageDefinition(question);
        if (!built) return null;
        return {
          type: 'deminage',
          question: buildQuestionText(question),
          subtitle: question.subtitle || 'Repérez les blocs erronés, brisez-les puis remplacez-les.',
          prefilledBlocks: built.prefilledBlocks,
          correctBlocks: built.correctBlocks,
          suggestionPool: built.suggestionPool,
          preferMath: built.preferMath,
          answer: built.correctBlocks.join(' '),
          translations: buildQuestionTranslationPayload(question),
          scoring: {
            wrongPenalty: Number(question.scoring?.wrongPenalty) || 7,
            hintPenalty: Number(question.scoring?.hintPenalty) || 2,
          },
          hint: buildHint(question),
          hints: buildHintList(question),
          explanation: buildExplanation(question),
        };
      })
      .filter(Boolean);
  }

  return [];
}

export function getQuizSessionTitle(quiz, mode) {
  const suffixMap = {
    suggestion: 'Suggestion',
    input: 'Input Blocs',
    trap: 'Pièges',
    duel_intrus: 'Duel de l’Intrus',
    deminage: 'Déminage',
  };
  return `${buildTitle(quiz)} — ${suffixMap[mode] || 'Quiz'}`;
}
