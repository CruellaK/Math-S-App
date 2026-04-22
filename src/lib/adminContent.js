import { CLASSES, SUBJECTS } from './constants';

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value) {
  return (value || '').toString().trim().toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateSchema(value, schema, path = 'root') {
  const errors = [];
  if (!schema) return errors;

  if (schema.anyOf?.length) {
    const valid = schema.anyOf.some(option => validateSchema(value, option, path).length === 0);
    if (!valid) errors.push(`${path} ne correspond à aucun format autorisé`);
    return errors;
  }

  if (schema.oneOf?.length) {
    const validCount = schema.oneOf.filter(option => validateSchema(value, option, path).length === 0).length;
    if (validCount !== 1) errors.push(`${path} doit correspondre à un format unique autorisé`);
    return errors;
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    errors.push(`${path} doit valoir ${schema.const}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} doit appartenir à ${schema.enum.join(', ')}`);
    return errors;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') errors.push(`${path} doit être une chaîne`);
    else if (schema.minLength && value.trim().length < schema.minLength) errors.push(`${path} doit contenir au moins ${schema.minLength} caractère(s)`);
    return errors;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`${path} doit être un nombre`);
    else if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path} doit être >= ${schema.minimum}`);
    else if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path} doit être <= ${schema.maximum}`);
    return errors;
  }

  if (schema.type === 'integer') {
    if (!Number.isInteger(value)) errors.push(`${path} doit être un entier`);
    else if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path} doit être >= ${schema.minimum}`);
    else if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path} doit être <= ${schema.maximum}`);
    return errors;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') errors.push(`${path} doit être un booléen`);
    return errors;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path} doit être un tableau`);
      return errors;
    }
    if (schema.minItems && value.length < schema.minItems) errors.push(`${path} doit contenir au moins ${schema.minItems} élément(s)`);
    if (schema.maxItems && value.length > schema.maxItems) errors.push(`${path} doit contenir au plus ${schema.maxItems} élément(s)`);
    if (schema.items) {
      value.forEach((entry, index) => {
        errors.push(...validateSchema(entry, schema.items, `${path}[${index}]`));
      });
    }
    return errors;
  }

  if (schema.type === 'object') {
    if (!isObject(value)) {
      errors.push(`${path} doit être un objet`);
      return errors;
    }
    if (typeof schema.minProperties === 'number' && Object.keys(value).length < schema.minProperties) {
      errors.push(`${path} doit contenir au moins ${schema.minProperties} propriété(s)`);
    }
    if (typeof schema.maxProperties === 'number' && Object.keys(value).length > schema.maxProperties) {
      errors.push(`${path} doit contenir au plus ${schema.maxProperties} propriété(s)`);
    }
    (schema.required || []).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path}.${key} est requis`);
      }
    });
    Object.entries(schema.properties || {}).forEach(([key, propertySchema]) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateSchema(value[key], propertySchema, `${path}.${key}`));
      }
    });
    if (schema.additionalProperties === false) {
      Object.keys(value).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) {
          errors.push(`${path}.${key} n'est pas autorisé`);
        }
      });
    }
    return errors;
  }

  return errors;
}

const stringListSchema = { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } };
const translationLeafSchema = {
  oneOf: [
    { type: 'string', minLength: 1 },
    {
      type: 'object',
      minProperties: 1,
      properties: {
        fr: { type: 'string' },
        mg: { type: 'string' },
        en: { type: 'string' },
        text: { type: 'string' },
      },
      additionalProperties: false,
    },
  ],
};
const translationListSchema = { type: 'array', items: translationLeafSchema };
const translationsSchema = {
  oneOf: [
    translationLeafSchema,
    {
      type: 'object',
      properties: {
        question: translationLeafSchema,
        text: translationLeafSchema,
        subtitle: translationLeafSchema,
        enonce: translationLeafSchema,
        prompt: translationLeafSchema,
        options: translationListSchema,
        items: translationListSchema,
        steps: translationListSchema,
      },
    },
  ],
};
const brouillonQuestionSchema = {
  type: 'object',
  required: ['question', 'steps'],
  properties: {
    question: { type: 'string', minLength: 1 },
    steps: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
    explanation: { type: 'string' },
    translations: translationsSchema,
  },
};
const dynamicBankEntrySchema = {
  type: 'object',
  required: ['size', 'options'],
  properties: {
    size: { type: 'integer', minimum: 1 },
    options: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
  },
};
const timingSchema = {
  type: 'object',
  properties: {
    timeLimitSeconds: { type: 'integer', minimum: 0 },
    enonceDelaySeconds: { type: 'integer', minimum: 0 },
    brouillonDelaySeconds: { type: 'integer', minimum: 0 },
    treatmentDelaySeconds: { type: 'integer', minimum: 0 },
    questionDelaySeconds: { type: 'integer', minimum: 0 },
    stepDelaySeconds: { type: 'integer', minimum: 0 },
    refreshDelaySeconds: { type: 'integer', minimum: 0 },
    delaySeconds: { type: 'integer', minimum: 0 },
  },
};
const quizTopLevelScoringSchema = {
  type: 'object',
  properties: {
    wrongPenalty: { type: 'number' },
    hintPenalty: { type: 'number' },
    averageWeight: { type: 'number', minimum: 0 },
    fireMultiplier: { type: 'number', minimum: 0 },
    subjectCoefficient: { type: 'integer', minimum: 1 },
    scoreScale: { enum: [80, 100] },
  },
};
const traitementBrouillonSchema = {
  type: 'object',
  properties: {
    steps: { type: 'array', items: { type: 'string', minLength: 1 } },
    translations: translationsSchema,
  },
};
const traitementLineSchema = {
  type: 'object',
  required: ['question', 'correctBlocks', 'suggestionPool'],
  properties: {
    question: { type: 'string', minLength: 1 },
    prompt: { type: 'string' },
    refreshPrompt: { type: 'string' },
    lineLabel: { type: 'string' },
    label: { type: 'string' },
    refreshLabel: { type: 'string' },
    rafraichissementLabel: { type: 'string' },
    delaySeconds: { type: 'integer', minimum: 0 },
    refreshDelaySeconds: { type: 'integer', minimum: 0 },
    stepDelaySeconds: { type: 'integer', minimum: 0 },
    timing: timingSchema,
    correctBlocks: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    suggestionPool: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
    blockSuggestionPool: { type: 'array', items: { type: 'string', minLength: 1 } },
    blockSuggestions: { type: 'array', items: { type: 'string', minLength: 1 } },
    banqueDeSuggestionDeBlocs: { type: 'array', items: { type: 'string', minLength: 1 } },
    banqueDeBlocs: { type: 'array', items: { type: 'string', minLength: 1 } },
    microSteps: { type: 'array', items: { type: 'integer', minimum: 1 } },
    dynamicBank: {
      type: 'array',
      items: dynamicBankEntrySchema,
    },
    blockSuggestionBank: {
      type: 'array',
      items: dynamicBankEntrySchema,
    },
    refreshBank: {
      type: 'array',
      items: dynamicBankEntrySchema,
    },
    hint: { type: 'string' },
    explanation: { type: 'string' },
    translations: translationsSchema,
    acceptedAnswers: { type: 'array', items: { type: 'string', minLength: 1 } },
    brouillon: traitementBrouillonSchema,
  },
};
const traitementQuestionSchema = {
  anyOf: [
    {
      type: 'object',
      required: ['type', 'question', 'correctBlocks', 'suggestionPool'],
      properties: {
        type: { const: 'block-input' },
        question: { type: 'string', minLength: 1 },
        delaySeconds: { type: 'integer', minimum: 0 },
        questionDelaySeconds: { type: 'integer', minimum: 0 },
        stepDelaySeconds: { type: 'integer', minimum: 0 },
        refreshDelaySeconds: { type: 'integer', minimum: 0 },
        timing: timingSchema,
        correctBlocks: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
        suggestionPool: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
        microSteps: { type: 'array', items: { type: 'integer', minimum: 1 } },
        dynamicBank: {
          type: 'array',
          items: dynamicBankEntrySchema,
        },
        hint: { type: 'string' },
        explanation: { type: 'string' },
        translations: translationsSchema,
        acceptedAnswers: { type: 'array', items: { type: 'string', minLength: 1 } },
        brouillon: traitementBrouillonSchema,
      },
    },
    {
      type: 'object',
      required: ['type', 'question', 'lines'],
      properties: {
        type: { const: 'block-input' },
        question: { type: 'string', minLength: 1 },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        delaySeconds: { type: 'integer', minimum: 0 },
        questionDelaySeconds: { type: 'integer', minimum: 0 },
        stepDelaySeconds: { type: 'integer', minimum: 0 },
        refreshDelaySeconds: { type: 'integer', minimum: 0 },
        timing: timingSchema,
        hint: { type: 'string' },
        explanation: { type: 'string' },
        translations: translationsSchema,
        brouillon: traitementBrouillonSchema,
        lines: { type: 'array', minItems: 1, items: traitementLineSchema },
      },
    },
    {
      type: 'object',
      required: ['type', 'question', 'refreshes'],
      properties: {
        type: { const: 'block-input' },
        question: { type: 'string', minLength: 1 },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        delaySeconds: { type: 'integer', minimum: 0 },
        questionDelaySeconds: { type: 'integer', minimum: 0 },
        stepDelaySeconds: { type: 'integer', minimum: 0 },
        refreshDelaySeconds: { type: 'integer', minimum: 0 },
        timing: timingSchema,
        hint: { type: 'string' },
        explanation: { type: 'string' },
        translations: translationsSchema,
        brouillon: traitementBrouillonSchema,
        refreshes: { type: 'array', minItems: 1, items: traitementLineSchema },
      },
    },
    {
      type: 'object',
      required: ['type', 'question', 'rafraichissements'],
      properties: {
        type: { const: 'block-input' },
        question: { type: 'string', minLength: 1 },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        delaySeconds: { type: 'integer', minimum: 0 },
        questionDelaySeconds: { type: 'integer', minimum: 0 },
        stepDelaySeconds: { type: 'integer', minimum: 0 },
        refreshDelaySeconds: { type: 'integer', minimum: 0 },
        timing: timingSchema,
        hint: { type: 'string' },
        explanation: { type: 'string' },
        translations: translationsSchema,
        brouillon: traitementBrouillonSchema,
        rafraichissements: { type: 'array', minItems: 1, items: traitementLineSchema },
      },
    },
  ],
};

export const ADMIN_SCHEMAS = {
  parcours_bien: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'sections'],
    properties: {
      kind: { const: 'parcours_bien' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      sections: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['title', 'contentBlocks'],
          properties: {
            title: { type: 'string', minLength: 1 },
            contentBlocks: stringListSchema,
            checkpointQuestions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['type', 'question'],
                properties: {
                  type: { enum: ['mcq', 'input', 'logic-sorter'] },
                  question: { type: 'string', minLength: 1 },
                },
              },
            },
          },
        },
      },
    },
  },
  parcours_tres_bien: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'criticalAnalysis', 'sections'],
    properties: {
      kind: { const: 'parcours_tres_bien' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      criticalAnalysis: stringListSchema,
      sections: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['title', 'contentBlocks', 'analysisAxis'],
          properties: {
            title: { type: 'string', minLength: 1 },
            contentBlocks: stringListSchema,
            analysisAxis: { type: 'string', minLength: 1 },
            checkpointQuestions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['type', 'question'],
                properties: {
                  type: { enum: ['mcq', 'input', 'logic-sorter'] },
                  question: { type: 'string', minLength: 1 },
                },
              },
            },
          },
        },
      },
    },
  },
  sujet_type_enonce: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'enonce'],
    properties: {
      kind: { const: 'sujet_type_enonce' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      enonce: { type: 'string', minLength: 1 },
      translations: translationsSchema,
    },
  },
  sujet_type_brouillon: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'questions'],
    properties: {
      kind: { const: 'sujet_type_brouillon' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      questions: { type: 'array', minItems: 1, items: brouillonQuestionSchema },
    },
  },
  sujet_type_traitement: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'timeLimitSeconds', 'initialScore', 'questions'],
    properties: {
      kind: { const: 'sujet_type_traitement' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      timeLimitSeconds: { type: 'integer', minimum: 60 },
      initialScore: { type: 'integer', minimum: 1 },
      timing: timingSchema,
      scoring: {
        type: 'object',
        properties: {
          verificationPenalty: { type: 'integer', minimum: 0 },
          hintPenalty: { type: 'integer', minimum: 0 },
          wrongPenalty: { type: 'integer', minimum: 0 },
          scoreScale: { enum: [80, 100] },
        },
      },
      questions: { type: 'array', minItems: 1, items: traitementQuestionSchema },
    },
  },
  sujet_type_traitement_question: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'question'],
    properties: {
      kind: { const: 'sujet_type_traitement_question' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      question: traitementQuestionSchema,
    },
  },
  exercice_enonce: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'enonce'],
    properties: {
      kind: { const: 'exercice_enonce' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      enonce: { type: 'string', minLength: 1 },
      translations: translationsSchema,
    },
  },
  exercice_brouillon: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'questions'],
    properties: {
      kind: { const: 'exercice_brouillon' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      questions: { type: 'array', minItems: 1, items: brouillonQuestionSchema },
    },
  },
  exercice_traitement: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'timeLimitSeconds', 'initialScore', 'questions'],
    properties: {
      kind: { const: 'exercice_traitement' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      timeLimitSeconds: { type: 'integer', minimum: 60 },
      initialScore: { type: 'integer', minimum: 1 },
      scoring: {
        type: 'object',
        properties: {
          verificationPenalty: { type: 'integer', minimum: 0 },
          hintPenalty: { type: 'integer', minimum: 0 },
          wrongPenalty: { type: 'integer', minimum: 0 },
          scoreScale: { enum: [80, 100] },
        },
      },
      questions: { type: 'array', minItems: 1, items: traitementQuestionSchema },
    },
  },
  exercice_traitement_question: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'question'],
    properties: {
      kind: { const: 'exercice_traitement_question' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      question: traitementQuestionSchema,
    },
  },
  quiz_mode_suggestion: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'questions'],
    properties: {
      kind: { const: 'quiz_mode_suggestion' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      timing: timingSchema,
      scoring: quizTopLevelScoringSchema,
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['text', 'options', 'correct_answer'],
          properties: {
            text: { type: 'string', minLength: 1 },
            options: {
              type: 'array',
              minItems: 2,
              items: {
                oneOf: [
                  { type: 'string', minLength: 1 },
                  {
                    type: 'object',
                    required: ['text'],
                    properties: {
                      text: { type: 'string', minLength: 1 },
                      translations: translationLeafSchema,
                    },
                  },
                ],
              },
            },
            correct_answer: { type: 'string', minLength: 1 },
            hint: { type: 'string' },
            explanation: { type: 'string' },
            translations: translationsSchema,
          },
        },
      },
    },
  },
  quiz_mode_input: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'questions'],
    properties: {
      kind: { const: 'quiz_mode_input' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      timing: timingSchema,
      scoring: quizTopLevelScoringSchema,
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['text', 'correct_answer', 'blockOptions'],
          properties: {
            text: { type: 'string', minLength: 1 },
            correct_answer: { type: 'string', minLength: 1 },
            acceptedAnswers: { type: 'array', items: { type: 'string', minLength: 1 } },
            blockOptions: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
            suggestionPool: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
            distractors: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
            optionCount: { type: 'integer', minimum: 2, maximum: 4 },
            helperText: { type: 'string' },
            promptContext: { type: 'string' },
            recognitionContext: { type: 'string' },
            preferMath: { type: 'boolean' },
            hint: { type: 'string' },
            explanation: { type: 'string' },
            translations: translationsSchema,
          },
        },
      },
    },
  },
  quiz_mode_duel_intrus: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'questions'],
    properties: {
      kind: { const: 'quiz_mode_duel_intrus' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      timing: timingSchema,
      scoring: quizTopLevelScoringSchema,
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['text'],
          properties: {
            text: { type: 'string', minLength: 1 },
            subtitle: { type: 'string' },
            safeBlock: { type: 'string', minLength: 1 },
            trapBlock: { type: 'string', minLength: 1 },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                oneOf: [
                  { type: 'string', minLength: 1 },
                  {
                    type: 'object',
                    required: ['text'],
                    properties: {
                      text: { type: 'string', minLength: 1 },
                      is_trap: { type: 'boolean' },
                      isTrap: { type: 'boolean' },
                      translations: translationLeafSchema,
                    },
                  },
                ],
              },
            },
            preferMath: { type: 'boolean' },
            scoring: {
              type: 'object',
              properties: {
                wrongPenalty: { type: 'number' },
                hintPenalty: { type: 'number' },
              },
            },
            hint: { type: 'string' },
            explanation: { type: 'string' },
            translations: translationsSchema,
          },
        },
      },
    },
  },
  quiz_mode_deminage: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'questions'],
    properties: {
      kind: { const: 'quiz_mode_deminage' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      timing: timingSchema,
      scoring: quizTopLevelScoringSchema,
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['text', 'prefilledBlocks', 'correctBlocks', 'suggestionPool'],
          properties: {
            text: { type: 'string', minLength: 1 },
            subtitle: { type: 'string' },
            prefilledBlocks: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
            currentBlocks: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
            prefilledAnswer: { type: 'string', minLength: 1 },
            currentAnswer: { type: 'string', minLength: 1 },
            correctBlocks: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
            correct_answer: { type: 'string', minLength: 1 },
            suggestionPool: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
            blockOptions: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
            distractors: { type: 'array', items: { type: 'string', minLength: 1 } },
            preferMath: { type: 'boolean' },
            scoring: {
              type: 'object',
              properties: {
                wrongPenalty: { type: 'number' },
                hintPenalty: { type: 'number' },
              },
            },
            hint: { type: 'string' },
            explanation: { type: 'string' },
            translations: translationsSchema,
          },
        },
      },
    },
  },
  quiz_mode_trap: {
    type: 'object',
    required: ['kind', 'title', 'chapterNumber', 'chapterTitle', 'questions'],
    properties: {
      kind: { const: 'quiz_mode_trap' },
      title: { type: 'string', minLength: 1 },
      chapterNumber: { type: 'integer', minimum: 1 },
      chapterTitle: { type: 'string', minLength: 1 },
      timing: timingSchema,
      scoring: quizTopLevelScoringSchema,
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['text', 'options'],
          properties: {
            text: { type: 'string', minLength: 1 },
            options: {
              type: 'array',
              minItems: 2,
              items: {
                type: 'object',
                required: ['text', 'is_trap'],
                properties: {
                  text: { type: 'string', minLength: 1 },
                  is_trap: { type: 'boolean' },
                  translations: translationLeafSchema,
                },
              },
            },
            hint: { type: 'string' },
            explanation: { type: 'string' },
            translations: translationsSchema,
          },
        },
      },
    },
  },
};

export const CONTENT_TYPE_OPTIONS = [
  { id: 'parcours', label: 'Parcours' },
  { id: 'sujet-type', label: 'Sujet type' },
  { id: 'exercice', label: 'Exercice' },
  { id: 'quiz', label: 'Quiz' },
];

export const DEFAULT_ADMIN_CLASS = CLASSES[0];
export const DEFAULT_ADMIN_SUBJECT_ID = SUBJECTS[0]?.id || 1;

export function detectAdminImportKind(payload) {
  return isObject(payload) && typeof payload.kind === 'string' ? payload.kind : null;
}

export function validateAdminPayload(payload, expectedKinds = []) {
  const detectedKind = detectAdminImportKind(payload);
  if (!detectedKind) {
    return { valid: false, kind: null, errors: ['Le champ kind est requis pour identifier le schéma JSON'] };
  }

  if (expectedKinds.length > 0 && !expectedKinds.includes(detectedKind)) {
    return {
      valid: false,
      kind: detectedKind,
      errors: [
        `Le fichier ${detectedKind} ne correspond pas à ce bouton d'import. Ici, il faut ${expectedKinds.join(' ou ')}. Le mode Écraser/Fusionner s'applique seulement après cette vérification du type de fichier.`
      ]
    };
  }

  const schema = ADMIN_SCHEMAS[detectedKind];
  if (!schema) {
    return { valid: false, kind: detectedKind, errors: [`Aucun schéma défini pour ${detectedKind}`] };
  }

  const errors = validateSchema(payload, schema);
  return { valid: errors.length === 0, kind: detectedKind, errors };
}

function ensureChapter(subject, chapterNumber, chapterTitle, options = {}) {
  const chapters = Array.isArray(subject.chapters) ? [...subject.chapters] : [];
  const matchByNumberOnly = Boolean(options.matchByNumberOnly);
  let chapterIndex = chapters.findIndex((chapter) => (
    Number(chapter.number) === Number(chapterNumber)
    || (!matchByNumberOnly && normalizeText(chapter.title) === normalizeText(chapterTitle))
  ));

  if (chapterIndex < 0) {
    chapters.push({
      number: Number(chapterNumber) || chapters.length + 1,
      title: chapterTitle || `Chapitre ${chapters.length + 1}`,
      sections: [],
      quizzes: [],
      sujetTypes: [],
      exercises: [],
      parcours: {},
    });
    chapterIndex = chapters.length - 1;
  }

  const source = chapters[chapterIndex] || {};
  chapters[chapterIndex] = {
    ...source,
    number: Number(chapterNumber) || source.number || chapterIndex + 1,
    title: chapterTitle || source.title || `Chapitre ${chapterIndex + 1}`,
    sections: [...(source.sections || [])],
    quizzes: [...(source.quizzes || [])],
    sujetTypes: [...(source.sujetTypes || [])],
    exercises: [...(source.exercises || [])],
    parcours: { ...(source.parcours || {}) },
  };

  return { chapters, chapterIndex, chapter: chapters[chapterIndex] };
}

function buildEmptyQuizItem(title, chapterNumber, chapterTitle) {
  return {
    title,
    quiz_metadata: {
      chapter_num: chapterNumber,
      chapter_title: chapterTitle,
      quiz_title: title,
    },
    modeConfigs: {
      suggestion: {},
      input: {},
      trap: {},
      duel_intrus: {},
      deminage: {},
    },
    modeQuestions: {
      suggestion: [],
      input: [],
      trap: [],
      duel_intrus: [],
      deminage: [],
    },
  };
}

function buildEmptyCompositeItem(title, mode, type) {
  return {
    title,
    mode,
    type,
    enonce: '',
    brouillon: { required: true },
    traitement: { questions: [] },
  };
}

function getCollectionKeyForContentType(contentType) {
  if (contentType === 'quiz') return 'quizzes';
  if (contentType === 'sujet-type') return 'sujetTypes';
  if (contentType === 'exercice') return 'exercises';
  return null;
}

function upsertByTitle(collection, title, factory) {
  const list = [...(collection || [])];
  const index = list.findIndex((entry) => normalizeText(entry.title) === normalizeText(title));
  if (index >= 0) {
    return { list, index, item: { ...list[index] } };
  }
  const item = factory();
  list.push(item);
  return { list, index: list.length - 1, item };
}

function mergeBrouillonQuestions(existingQuestions, importedQuestions) {
  const questionMap = new Map((existingQuestions || []).map((question) => [normalizeText(question.question), { ...question }]));

  (importedQuestions || []).forEach((entry) => {
    const key = normalizeText(entry.question);
    const current = questionMap.get(key) || { type: 'block-input', question: entry.question };
    questionMap.set(key, {
      ...current,
      question: entry.question,
      translations: entry.translations || current.translations || undefined,
      brouillon: {
        ...(current.brouillon || {}),
        steps: [...entry.steps],
        translations: entry.translations || current.brouillon?.translations || undefined,
      },
    });
  });

  return Array.from(questionMap.values());
}

function mergeTraitementQuestions(existingQuestions, importedQuestions, overwrite = false) {
  const questionMap = new Map(
    (overwrite ? [] : (existingQuestions || [])).map((question) => [normalizeText(question.question), clone(question)])
  );

  (importedQuestions || []).forEach((question) => {
    const key = normalizeText(question.question);
    const current = questionMap.get(key) || {};
    questionMap.set(key, {
      ...current,
      ...clone(question),
      brouillon: question.brouillon || current.brouillon || undefined,
    });
  });

  return Array.from(questionMap.values());
}

export function applyAdminImportToSubject(subject, payload, options = {}) {
  const overwrite = Boolean(options.overwrite);
  const kind = detectAdminImportKind(payload);
  const resolvedChapterNumber = Number(options.targetChapterNumber) || Number(payload.chapterNumber) || 1;
  const resolvedChapterTitle = options.targetChapterTitle || payload.chapterTitle || `Chapitre ${resolvedChapterNumber}`;
  const targetItemTitle = options.targetItemTitle || payload.title;
  const nextSubject = {
    ...subject,
    chapters: [...(subject.chapters || [])],
  };
  const { chapters, chapterIndex, chapter } = ensureChapter(nextSubject, resolvedChapterNumber, resolvedChapterTitle, {
    matchByNumberOnly: Number(options.targetChapterNumber) > 0,
  });

  if (kind === 'parcours_bien' || kind === 'parcours_tres_bien') {
    const mentionKey = kind === 'parcours_bien' ? 'mention_bien' : 'mention_tres_bien';
    chapter.parcours[mentionKey] = overwrite
      ? { ...clone(payload), chapterNumber: resolvedChapterNumber, chapterTitle: resolvedChapterTitle }
      : { ...(chapter.parcours[mentionKey] || {}), ...clone(payload), chapterNumber: resolvedChapterNumber, chapterTitle: resolvedChapterTitle };
    chapters[chapterIndex] = chapter;
    nextSubject.chapters = chapters;
    return { subject: nextSubject, message: `${payload.title} importé dans ${mentionKey}` };
  }

  if (kind.startsWith('sujet_type_') || kind.startsWith('exercice_')) {
    const isSujetType = kind.startsWith('sujet_type_');
    const collectionKey = isSujetType ? 'sujetTypes' : 'exercises';
    const baseMode = isSujetType ? 'exam' : 'standard';
    const baseType = isSujetType ? 'sujet-type' : undefined;
    const resolvedTitle = payload.title || targetItemTitle;
    const { list, index, item } = upsertByTitle(chapter[collectionKey], targetItemTitle || resolvedTitle, () => buildEmptyCompositeItem(resolvedTitle, baseMode, baseType));

    if (kind.endsWith('_enonce')) {
      list[index] = {
        ...item,
        title: resolvedTitle,
        mode: baseMode,
        type: baseType,
        enonce: payload.enonce,
        translations: payload.translations || item.translations,
        brouillon: item.brouillon || { required: true },
        traitement: item.traitement || { questions: [] },
      };
    }

    if (kind.endsWith('_brouillon')) {
      const existingQuestions = item.traitement?.questions || item.questions || [];
      const nextQuestions = mergeBrouillonQuestions(existingQuestions, payload.questions || []);
      list[index] = {
        ...item,
        title: resolvedTitle,
        mode: baseMode,
        type: baseType,
        brouillon: { required: true },
        traitement: {
          ...(item.traitement || {}),
          questions: nextQuestions,
        },
      };
    }

    if (kind.endsWith('_traitement')) {
      const existingQuestions = item.traitement?.questions || [];
      list[index] = {
        ...item,
        title: resolvedTitle,
        mode: baseMode,
        type: baseType,
        brouillon: { required: true },
        traitement: {
          timeLimitSeconds: payload.timeLimitSeconds,
          initialScore: payload.initialScore,
          scoring: payload.scoring || {},
          timing: payload.timing || {},
          questions: mergeTraitementQuestions(existingQuestions, payload.questions || [], overwrite),
        },
      };
    }

    if (kind.endsWith('_traitement_question')) {
      const existingQuestions = item.traitement?.questions || [];
      list[index] = {
        ...item,
        title: resolvedTitle,
        mode: baseMode,
        type: baseType,
        brouillon: { required: true },
        traitement: {
          ...(item.traitement || {}),
          questions: mergeTraitementQuestions(existingQuestions, [payload.question], false),
        },
      };
    }

    chapter[collectionKey] = list;
    chapters[chapterIndex] = chapter;
    nextSubject.chapters = chapters;
    return { subject: nextSubject, message: `${resolvedTitle} importé dans ${isSujetType ? 'Sujet type' : 'Exercice'}` };
  }

  if (kind.startsWith('quiz_mode_')) {
    const mode = kind.replace('quiz_mode_', '');
    const resolvedTitle = payload.title || targetItemTitle;
    const { list, index, item } = upsertByTitle(chapter.quizzes, targetItemTitle || resolvedTitle, () => buildEmptyQuizItem(resolvedTitle, resolvedChapterNumber, resolvedChapterTitle));

    list[index] = {
      ...item,
      title: resolvedTitle,
      quiz_metadata: {
        ...(item.quiz_metadata || {}),
        chapter_num: resolvedChapterNumber,
        chapter_title: resolvedChapterTitle,
        quiz_title: resolvedTitle,
      },
      modeConfigs: {
        suggestion: { ...(item.modeConfigs?.suggestion || {}) },
        input: { ...(item.modeConfigs?.input || {}) },
        trap: { ...(item.modeConfigs?.trap || {}) },
        duel_intrus: { ...(item.modeConfigs?.duel_intrus || {}) },
        deminage: { ...(item.modeConfigs?.deminage || {}) },
        [mode]: {
          ...(item.modeConfigs?.[mode] || {}),
          timing: clone(payload.timing || {}),
          scoring: clone(payload.scoring || {}),
        },
      },
      modeQuestions: {
        suggestion: [...(item.modeQuestions?.suggestion || [])],
        input: [...(item.modeQuestions?.input || [])],
        trap: [...(item.modeQuestions?.trap || [])],
        duel_intrus: [...(item.modeQuestions?.duel_intrus || [])],
        deminage: [...(item.modeQuestions?.deminage || [])],
        [mode]: overwrite ? clone(payload.questions || []) : clone(payload.questions || []),
      },
    };

    chapter.quizzes = list;
    chapters[chapterIndex] = chapter;
    nextSubject.chapters = chapters;
    return { subject: nextSubject, message: `${resolvedTitle} importé dans Quiz ${mode}` };
  }

  return { subject: nextSubject, message: 'Aucune action effectuée' };
}

function collectChapterItems(subject, mapper) {
  return (subject.chapters || []).flatMap((chapter) => mapper(chapter).filter(Boolean));
}

function hasCompositeAdminItemContent(item) {
  return Boolean(
    item?.enonce
    || item?.questions?.length
    || item?.traitement?.questions?.length
    || item?.traitement?.lines?.length
    || item?.traitement?.refreshes?.length
    || item?.traitement?.rafraichissements?.length
  );
}

function hasQuizAdminItemContent(item) {
  return Boolean(
    item?.modeQuestions?.suggestion?.length
    || item?.modeQuestions?.input?.length
    || item?.modeQuestions?.trap?.length
    || item?.modeQuestions?.duel_intrus?.length
    || item?.modeQuestions?.deminage?.length
    || item?.questions?.length
  );
}

export function listAdminItems(subject, contentType, mentionVariant = 'mention_bien', options = {}) {
  if (!subject) return [];
  const includeEmpty = Boolean(options?.includeEmpty);

  if (contentType === 'parcours') {
    return collectChapterItems(subject, (chapter) => {
      const item = chapter.parcours?.[mentionVariant];
      if (!item) return [];
      return [{
        id: `${chapter.number}-${mentionVariant}-${item.title}`,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        title: item.title,
        data: item,
        mentionVariant,
      }];
    });
  }

  if (contentType === 'sujet-type') {
    return collectChapterItems(subject, (chapter) => (chapter.sujetTypes || []).map((item) => ({
      id: `${chapter.number}-sujet-${item.title}`,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      title: item.title,
      data: item,
      hasEnonce: Boolean(item.enonce),
      hasBrouillon: Boolean(item.traitement?.questions?.some((question) => question.brouillon?.steps?.length)),
      hasTraitement: Boolean(item.traitement?.questions?.length),
    })).filter((item) => includeEmpty || hasCompositeAdminItemContent(item.data)));
  }

  if (contentType === 'exercice') {
    return collectChapterItems(subject, (chapter) => (chapter.exercises || [])
      .filter((item) => item.mode !== 'exam' && item.type !== 'sujet-type')
      .map((item) => ({
        id: `${chapter.number}-exercice-${item.title}`,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        title: item.title,
        data: item,
        hasEnonce: Boolean(item.enonce),
        hasBrouillon: Boolean(item.traitement?.questions?.some((question) => question.brouillon?.steps?.length)),
        hasTraitement: Boolean(item.traitement?.questions?.length),
      })).filter((item) => includeEmpty || hasCompositeAdminItemContent(item.data)));
  }

  if (contentType === 'quiz') {
    return collectChapterItems(subject, (chapter) => (chapter.quizzes || []).map((item) => ({
      id: `${chapter.number}-quiz-${item.title}`,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      title: item.title,
      data: item,
      hasSuggestion: Boolean(item.modeQuestions?.suggestion?.length),
      hasInput: Boolean(item.modeQuestions?.input?.length),
      hasTrap: Boolean(item.modeQuestions?.trap?.length),
      hasDuelIntrus: Boolean(item.modeQuestions?.duel_intrus?.length),
      hasDeminage: Boolean(item.modeQuestions?.deminage?.length),
    })).filter((item) => includeEmpty || hasQuizAdminItemContent(item.data)));
  }

  return [];
}

function buildCompositeExportFiles(item, chapterNumber, chapterTitle, baseKind) {
  const files = [];
  if (item.enonce) {
    files.push({
      label: 'Énoncé',
      filename: `${baseKind}_${item.title.replace(/\s+/g, '_')}_enonce.json`,
      payload: {
        kind: `${baseKind}_enonce`,
        title: item.title,
        chapterNumber,
        chapterTitle,
        enonce: item.enonce,
        translations: item.translations,
      },
    });
  }
  const brouillonQuestions = (item.traitement?.questions || [])
    .filter((question) => question.brouillon?.steps?.length)
    .map((question) => ({
      question: question.question,
      steps: question.brouillon.steps,
      translations: question.brouillon?.translations || question.translations,
    }));
  if (brouillonQuestions.length) {
    files.push({
      label: 'Brouillon',
      filename: `${baseKind}_${item.title.replace(/\s+/g, '_')}_brouillon.json`,
      payload: {
        kind: `${baseKind}_brouillon`,
        title: item.title,
        chapterNumber,
        chapterTitle,
        questions: brouillonQuestions,
      },
    });
  }
  if (item.traitement?.questions?.length) {
    files.push({
      label: 'Traitement',
      filename: `${baseKind}_${item.title.replace(/\s+/g, '_')}_traitement.json`,
      payload: {
        kind: `${baseKind}_traitement`,
        title: item.title,
        chapterNumber,
        chapterTitle,
        timeLimitSeconds: item.traitement.timeLimitSeconds || 3600,
        initialScore: item.traitement.initialScore || 20,
        scoring: item.traitement.scoring || {},
        timing: item.traitement.timing || {},
        questions: item.traitement.questions,
      },
    });
  }
  return files;
}

function buildQuestionExportFile(item, chapterNumber, chapterTitle, baseKind, question, questionIndex) {
  return {
    label: `Question ${questionIndex + 1}`,
    filename: `${baseKind}_${item.title.replace(/\s+/g, '_')}_question_${questionIndex + 1}.json`,
    payload: {
      kind: `${baseKind}_traitement_question`,
      title: item.title,
      chapterNumber,
      chapterTitle,
      question: clone(question),
    },
  };
}

export function exportAdminItemFiles(itemRecord, contentType, mentionVariant = 'mention_bien', questionIndex = null) {
  if (!itemRecord) return [];

  if (contentType === 'parcours') {
    return [{
      label: mentionVariant === 'mention_tres_bien' ? 'Parcours Très Bien' : 'Parcours Bien',
      filename: `${mentionVariant}_${itemRecord.title.replace(/\s+/g, '_')}.json`,
      payload: itemRecord.data,
    }];
  }

  if (contentType === 'sujet-type') {
    if (Number.isInteger(questionIndex)) {
      const question = itemRecord.data?.traitement?.questions?.[questionIndex];
      return question ? [buildQuestionExportFile(itemRecord.data, itemRecord.chapterNumber, itemRecord.chapterTitle, 'sujet_type', question, questionIndex)] : [];
    }
    return buildCompositeExportFiles(itemRecord.data, itemRecord.chapterNumber, itemRecord.chapterTitle, 'sujet_type');
  }

  if (contentType === 'exercice') {
    if (Number.isInteger(questionIndex)) {
      const question = itemRecord.data?.traitement?.questions?.[questionIndex];
      return question ? [buildQuestionExportFile(itemRecord.data, itemRecord.chapterNumber, itemRecord.chapterTitle, 'exercice', question, questionIndex)] : [];
    }
    return buildCompositeExportFiles(itemRecord.data, itemRecord.chapterNumber, itemRecord.chapterTitle, 'exercice');
  }

  if (contentType === 'quiz') {
    const files = [];
    ['suggestion', 'input', 'trap', 'duel_intrus', 'deminage'].forEach((mode) => {
      const questions = itemRecord.data.modeQuestions?.[mode] || [];
      if (!questions.length) return;
      files.push({
        label: `Quiz ${mode}`,
        filename: `quiz_${mode}_${itemRecord.title.replace(/\s+/g, '_')}.json`,
        payload: {
          kind: `quiz_mode_${mode}`,
          title: itemRecord.title,
          chapterNumber: itemRecord.chapterNumber,
          chapterTitle: itemRecord.chapterTitle,
          timing: itemRecord.data.modeConfigs?.[mode]?.timing || {},
          scoring: itemRecord.data.modeConfigs?.[mode]?.scoring || {},
          questions,
        },
      });
    });
    return files;
  }

  return [];
}

export function createAdminChapter(subject, chapterTitle = '') {
  const nextSubject = {
    ...subject,
    chapters: [...(subject?.chapters || [])],
  };
  const nextNumber = nextSubject.chapters.reduce((maxValue, chapter) => Math.max(maxValue, Number(chapter?.number) || 0), 0) + 1;
  const title = chapterTitle || `Chapitre ${nextNumber}`;
  nextSubject.chapters.push({
    number: nextNumber,
    title,
    sections: [],
    quizzes: [],
    sujetTypes: [],
    exercises: [],
    parcours: {},
  });
  return { subject: nextSubject, chapterNumber: nextNumber, chapterTitle: title };
}

export function renameAdminChapter(subject, chapterNumber, chapterTitle) {
  const nextSubject = {
    ...subject,
    chapters: [...(subject?.chapters || [])],
  };
  nextSubject.chapters = nextSubject.chapters.map((chapter) => {
    if (Number(chapter?.number) !== Number(chapterNumber)) return chapter;
    return {
      ...chapter,
      title: chapterTitle || chapter.title,
      quizzes: [...(chapter.quizzes || [])].map((item) => ({
        ...item,
        quiz_metadata: {
          ...(item.quiz_metadata || {}),
          chapter_num: Number(chapterNumber),
          chapter_title: chapterTitle || chapter.title,
        },
      })),
    };
  });
  return nextSubject;
}

export function createAdminNamedItem(subject, contentType, chapterNumber, itemTitle) {
  const collectionKey = getCollectionKeyForContentType(contentType);
  if (!collectionKey) return subject;
  const nextSubject = {
    ...subject,
    chapters: [...(subject?.chapters || [])],
  };
  const { chapters, chapterIndex, chapter } = ensureChapter(nextSubject, chapterNumber, `Chapitre ${chapterNumber}`, { matchByNumberOnly: true });
  const { list, index } = upsertByTitle(chapter[collectionKey], itemTitle, () => {
    if (contentType === 'quiz') return buildEmptyQuizItem(itemTitle, chapter.number, chapter.title);
    if (contentType === 'sujet-type') return buildEmptyCompositeItem(itemTitle, 'exam', 'sujet-type');
    return buildEmptyCompositeItem(itemTitle, 'standard', undefined);
  });
  chapter[collectionKey] = list;
  chapters[chapterIndex] = chapter;
  nextSubject.chapters = chapters;
  return index >= 0 ? nextSubject : nextSubject;
}

export function renameAdminNamedItem(subject, contentType, chapterNumber, currentTitle, nextTitle) {
  const collectionKey = getCollectionKeyForContentType(contentType);
  if (!collectionKey) return subject;
  const nextSubject = {
    ...subject,
    chapters: [...(subject?.chapters || [])],
  };
  nextSubject.chapters = nextSubject.chapters.map((chapter) => {
    if (Number(chapter?.number) !== Number(chapterNumber)) return chapter;
    const nextChapter = {
      ...chapter,
      quizzes: [...(chapter.quizzes || [])],
      sujetTypes: [...(chapter.sujetTypes || [])],
      exercises: [...(chapter.exercises || [])],
    };
    nextChapter[collectionKey] = nextChapter[collectionKey].map((item) => {
      if (normalizeText(item?.title) !== normalizeText(currentTitle)) return item;
      if (contentType === 'quiz') {
        return {
          ...item,
          title: nextTitle,
          quiz_metadata: {
            ...(item.quiz_metadata || {}),
            quiz_title: nextTitle,
          },
        };
      }
      return {
        ...item,
        title: nextTitle,
      };
    });
    return nextChapter;
  });
  return nextSubject;
}

export function deleteAdminItemFromSubject(subject, itemRecord, contentType, mentionVariant = 'mention_bien') {
  const nextSubject = { ...subject, chapters: [...(subject.chapters || [])] };
  nextSubject.chapters = nextSubject.chapters.map((chapter) => {
    if (Number(chapter.number) !== Number(itemRecord.chapterNumber)) return chapter;
    const nextChapter = {
      ...chapter,
      quizzes: [...(chapter.quizzes || [])],
      sujetTypes: [...(chapter.sujetTypes || [])],
      exercises: [...(chapter.exercises || [])],
      parcours: { ...(chapter.parcours || {}) },
    };

    if (contentType === 'parcours') {
      delete nextChapter.parcours[mentionVariant];
    }

    if (contentType === 'sujet-type') {
      nextChapter.sujetTypes = nextChapter.sujetTypes.filter((entry) => normalizeText(entry.title) !== normalizeText(itemRecord.title));
    }

    if (contentType === 'exercice') {
      nextChapter.exercises = nextChapter.exercises.filter((entry) => normalizeText(entry.title) !== normalizeText(itemRecord.title));
    }

    if (contentType === 'quiz') {
      nextChapter.quizzes = nextChapter.quizzes.filter((entry) => normalizeText(entry.title) !== normalizeText(itemRecord.title));
    }

    return nextChapter;
  });
  return nextSubject;
}

export function getImportSlots(contentType, mentionVariant = 'mention_bien') {
  if (contentType === 'parcours') {
    return [{
      id: mentionVariant,
      label: mentionVariant === 'mention_tres_bien' ? 'Importer Mention Très Bien' : 'Importer Mention Bien',
      expectedKinds: [mentionVariant === 'mention_tres_bien' ? 'parcours_tres_bien' : 'parcours_bien'],
    }];
  }

  if (contentType === 'sujet-type') {
    return [
      { id: 'enonce', label: 'Importer Sujet', expectedKinds: ['sujet_type_enonce'] },
      { id: 'brouillon', label: 'Importer Brouillon', expectedKinds: ['sujet_type_brouillon'] },
      { id: 'traitement', label: 'Importer Traitement', expectedKinds: ['sujet_type_traitement'] },
    ];
  }

  if (contentType === 'exercice') {
    return [
      { id: 'enonce', label: 'Importer Sujet', expectedKinds: ['exercice_enonce'] },
      { id: 'brouillon', label: 'Importer Brouillon', expectedKinds: ['exercice_brouillon'] },
      { id: 'traitement', label: 'Importer Traitement', expectedKinds: ['exercice_traitement'] },
    ];
  }

  if (contentType === 'quiz') {
    return [
      { id: 'suggestion', label: 'Importer Suggestion', expectedKinds: ['quiz_mode_suggestion'] },
      { id: 'input', label: 'Importer Input', expectedKinds: ['quiz_mode_input'] },
      { id: 'trap', label: 'Importer Pièges', expectedKinds: ['quiz_mode_trap'] },
      { id: 'duel_intrus', label: 'Importer Duel de l\'Intrus', expectedKinds: ['quiz_mode_duel_intrus'] },
      { id: 'deminage', label: 'Importer Déminage', expectedKinds: ['quiz_mode_deminage'] },
    ];
  }

  return [];
}

export const EXAMPLE_IMPORT_FILES = [
  {
    id: 'math_exercice_enonce',
    category: 'Exemple',
    label: 'Maths — Exercice — Sujet',
    description: 'Énoncé de calcul complexe pour tester le flux Exercice.',
    payload: {
      kind: 'exercice_enonce',
      chapterNumber: 1,
      chapterTitle: 'Calcul algébrique',
      title: 'Exercice IA — Calcul de fractions',
      enonce: 'Résoudre les questions suivantes sur les fractions algébriques.\\n\\n1) Simplifier.\\n2) Mettre au même dénominateur.\\n3) Conclure proprement.',
    },
  },
  {
    id: 'math_exercice_brouillon',
    category: 'Exemple',
    label: 'Maths — Exercice — Brouillon',
    description: 'Étapes de méthodologie pour chaque question.',
    payload: {
      kind: 'exercice_brouillon',
      chapterNumber: 1,
      chapterTitle: 'Calcul algébrique',
      title: 'Exercice IA — Calcul de fractions',
      questions: [
        {
          question: 'Simplifier l’expression $\\frac{6x}{9}$',
          steps: ['Identifier le facteur commun au numérateur et au dénominateur', 'Diviser le numérateur et le dénominateur par 3', 'Écrire la fraction simplifiée finale'],
        },
        {
          question: 'Calculer $\\frac{2}{3} + \\frac{1}{6}$',
          steps: ['Chercher le plus petit dénominateur commun', 'Transformer chaque fraction', 'Additionner les numérateurs', 'Simplifier si nécessaire'],
        },
      ],
    },
  },
  {
    id: 'math_exercice_traitement',
    category: 'Exemple',
    label: 'Maths — Exercice — Traitement',
    description: 'Banques de suggestions et corrections exactes par micro-étape.',
    payload: {
      kind: 'exercice_traitement',
      chapterNumber: 1,
      chapterTitle: 'Calcul algébrique',
      title: 'Exercice IA — Calcul de fractions',
      timeLimitSeconds: 5400,
      initialScore: 20,
      timing: { enonceDelaySeconds: 180, brouillonDelaySeconds: 300, treatmentDelaySeconds: 900, questionDelaySeconds: 180, refreshDelaySeconds: 90 },
      scoring: { verificationPenalty: 2, hintPenalty: 1, wrongPenalty: 4, scoreScale: 80 },
      questions: [
        {
          type: 'block-input',
          question: 'Simplifier l’expression $\\frac{6x}{9}$',
          questionDelaySeconds: 120,
          correctBlocks: ['\\frac{2x}{3}'],
          suggestionPool: ['\\frac{2x}{3}', '\\frac{3x}{2}', '\\frac{6x}{3}', '\\frac{x}{3}'],
          microSteps: [1],
          dynamicBank: [{ size: 4, options: ['\\frac{2x}{3}', '\\frac{3x}{2}', '\\frac{6x}{3}', '\\frac{x}{3}'] }],
          hint: 'Simplifier par le PGCD de 6 et 9.',
          explanation: 'On divise le numérateur et le dénominateur par 3.',
        },
        {
          type: 'block-input',
          question: 'Calculer $\\frac{2}{3} + \\frac{1}{6}$',
          questionDelaySeconds: 180,
          correctBlocks: ['\\frac{5}{6}'],
          suggestionPool: ['\\frac{5}{6}', '\\frac{3}{6}', '\\frac{1}{2}', '\\frac{4}{6}'],
          microSteps: [1],
          dynamicBank: [{ size: 4, options: ['\\frac{5}{6}', '\\frac{3}{6}', '\\frac{1}{2}', '\\frac{4}{6}'] }],
          hint: 'Transformer d’abord $\\frac{2}{3}$ en sixièmes.',
          explanation: '$\\frac{2}{3}=\\frac{4}{6}$ donc $\\frac{4}{6}+\\frac{1}{6}=\\frac{5}{6}$.',
        },
      ],
    },
  },
  {
    id: 'math_exercice_traitement_question',
    category: 'Exemple',
    label: 'Maths — Exercice — Question traitement',
    description: 'Exemple de JSON ciblé sur une seule question avec plusieurs lignes.',
    payload: {
      kind: 'exercice_traitement_question',
      chapterNumber: 1,
      chapterTitle: 'Calcul algébrique',
      title: 'Exercice IA — Calcul de fractions',
      question: {
        type: 'block-input',
        question: 'Résoudre proprement $\\frac{2}{3} + \\frac{1}{6}$',
        timing: { questionDelaySeconds: 180, stepDelaySeconds: 90, refreshDelaySeconds: 60 },
        brouillon: {
          steps: ['Mettre les fractions au même dénominateur', 'Additionner les numérateurs', 'Conclure proprement'],
        },
        lines: [
          {
            question: 'Transformer $\\frac{2}{3}$ en sixièmes',
            lineLabel: 'Ligne 1',
            refreshDelaySeconds: 60,
            correctBlocks: ['\\frac{2}{3}', '=', '\\frac{4}{6}'],
            suggestionPool: ['\\frac{2}{3}', '=', '\\frac{4}{6}', '\\frac{3}{6}', '\\frac{5}{6}'],
            microSteps: [3],
            dynamicBank: [{ size: 5, options: ['\\frac{2}{3}', '=', '\\frac{4}{6}', '\\frac{3}{6}', '\\frac{5}{6}'] }],
          },
          {
            question: 'Additionner puis conclure',
            lineLabel: 'Ligne 2',
            refreshDelaySeconds: 75,
            correctBlocks: ['\\frac{4}{6}', '+', '\\frac{1}{6}', '=', '\\frac{5}{6}'],
            suggestionPool: ['\\frac{4}{6}', '+', '\\frac{1}{6}', '=', '\\frac{5}{6}', '\\frac{3}{6}'],
            microSteps: [5],
            dynamicBank: [{ size: 6, options: ['\\frac{4}{6}', '+', '\\frac{1}{6}', '=', '\\frac{5}{6}', '\\frac{3}{6}'] }],
            hint: 'Utilise le résultat de la ligne précédente.',
            explanation: '$\\frac{4}{6}+\\frac{1}{6}=\\frac{5}{6}$.',
          },
        ],
      },
    },
  },
  {
    id: 'math_sujet_type_traitement_question',
    category: 'Exemple',
    label: 'Maths — Sujet type — Question traitement',
    description: 'Question unique de sujet type avec rédaction fractionnée en lignes.',
    payload: {
      kind: 'sujet_type_traitement_question',
      chapterNumber: 3,
      chapterTitle: 'Fonctions numériques',
      title: 'Sujet type IA — Étude de fonction',
      question: {
        type: 'block-input',
        question: 'Étudier le sens de variation de la fonction sur l’intervalle donné',
        brouillon: {
          steps: ['Calculer la dérivée', 'Étudier son signe', 'Conclure sur les variations'],
        },
        lines: [
          {
            question: 'Exprimer la dérivée',
            lineLabel: 'Ligne 1',
            correctBlocks: ['f\'(x)', '=', '2x', '-', '3'],
            suggestionPool: ['f\'(x)', '=', '2x', '-', '3', '+', '1'],
            microSteps: [5],
            dynamicBank: [{ size: 7, options: ['f\'(x)', '=', '2x', '-', '3', '+', '1'] }],
          },
          {
            question: 'Conclure sur l’intervalle',
            lineLabel: 'Ligne 2',
            correctBlocks: ['Donc', 'f', 'est', 'croissante', 'sur', '[2;+∞['],
            suggestionPool: ['Donc', 'f', 'est', 'croissante', 'sur', '[2;+∞[', 'décroissante'],
            microSteps: [7],
            dynamicBank: [{ size: 7, options: ['Donc', 'f', 'est', 'croissante', 'sur', '[2;+∞[', 'décroissante'] }],
            hint: 'La dérivée est positive sur cet intervalle.',
          },
        ],
      },
    },
  },
  {
    id: 'fr_quiz_suggestion',
    category: 'Exemple',
    label: 'Français — Quiz — Suggestion',
    description: 'Quiz de grammaire en mode suggestion.',
    payload: {
      kind: 'quiz_mode_suggestion',
      chapterNumber: 1,
      chapterTitle: 'Grammaire et syntaxe',
      title: 'Quiz IA — Accord du participe passé',
      timing: { questionDelaySeconds: 45 },
      scoring: { subjectCoefficient: 1, scoreScale: 100 },
      questions: [
        {
          text: 'Choisissez la phrase correctement accordée.',
          options: ['Les fleurs que j\'ai cueillies sont rouges.', 'Les fleurs que j\'ai cueilli sont rouges.', 'Les fleurs que j\'ai cueillie sont rouges.'],
          correct_answer: 'Les fleurs que j\'ai cueillies sont rouges.',
          hint: 'Le COD est placé avant l’auxiliaire avoir.',
          explanation: 'Le participe passé s’accorde avec le COD placé avant.',
        },
      ],
    },
  },
  {
    id: 'fr_quiz_input',
    category: 'Exemple',
    label: 'Français — Quiz — Input',
    description: 'Quiz de grammaire en sélection de blocs courts.',
    payload: {
      kind: 'quiz_mode_input',
      chapterNumber: 1,
      chapterTitle: 'Grammaire et syntaxe',
      title: 'Quiz IA — Accord du participe passé',
      timing: { questionDelaySeconds: 40 },
      scoring: { subjectCoefficient: 1, scoreScale: 100 },
      questions: [
        {
          text: 'Complétez : Les lettres que j\'ai ... hier.',
          correct_answer: 'écrites',
          acceptedAnswers: ['écrites', 'ecrites'],
          blockOptions: ['écrites', 'écrit', 'écrits', 'écrite'],
          optionCount: 4,
          hint: 'Le COD “lettres” est avant le verbe.',
          explanation: 'Avec avoir, le participe passé s’accorde avec le COD placé avant.',
        },
      ],
    },
  },
  {
    id: 'fr_quiz_trap',
    category: 'Exemple',
    label: 'Français — Quiz — Pièges',
    description: 'Quiz de grammaire avec distracteurs piégés.',
    payload: {
      kind: 'quiz_mode_trap',
      chapterNumber: 1,
      chapterTitle: 'Grammaire et syntaxe',
      title: 'Quiz IA — Accord du participe passé',
      timing: { questionDelaySeconds: 50 },
      scoring: { subjectCoefficient: 1, scoreScale: 100 },
      questions: [
        {
          text: 'Repérez les propositions fautives.',
          options: [
            { text: 'Les chansons que j\'ai écoutées.', is_trap: false },
            { text: 'Les devoirs que j\'ai fait.', is_trap: true },
            { text: 'Les fautes qu\'elle a corrigées.', is_trap: false },
            { text: 'La robe qu\'il a porté.', is_trap: true }
          ],
          hint: 'Cherchez le COD placé avant.',
          explanation: 'Les formes “fait” et “porté” devraient être accordées ici.',
        },
      ],
    },
  },
  {
    id: 'math_quiz_duel_intrus',
    category: 'Exemple',
    label: 'Mathématiques — Quiz — Duel de l\'Intrus',
    description: 'Quiz avancé à haut risque avec deux blocs presque identiques.',
    payload: {
      kind: 'quiz_mode_duel_intrus',
      chapterNumber: 1,
      chapterTitle: 'Fonctions et dérivation',
      title: 'Quiz IA — Lecture de dérivée',
      timing: { questionDelaySeconds: 30, timeLimitSeconds: 90 },
      scoring: { wrongPenalty: 12, hintPenalty: 4, averageWeight: 2, fireMultiplier: 5, subjectCoefficient: 2, scoreScale: 100 },
      questions: [
        {
          text: 'Sélectionnez l\'écriture correcte de la dérivée.',
          subtitle: 'Deux écritures se ressemblent fortement, une seule est juste.',
          options: [
            { text: 'f\'(x)=2x+1', is_trap: false },
            { text: 'f\'(x)=2x-1', is_trap: true }
          ],
          preferMath: true,
          hint: 'La dérivée de x²+x vaut 2x+1.',
          explanation: 'Le signe du terme constant ne doit pas être inversé.',
        },
      ],
    },
  },
  {
    id: 'math_quiz_deminage',
    category: 'Exemple',
    label: 'Mathématiques — Quiz — Déminage',
    description: 'Quiz avancé où il faut casser et remplacer des blocs erronés.',
    payload: {
      kind: 'quiz_mode_deminage',
      chapterNumber: 1,
      chapterTitle: 'Fonctions et dérivation',
      title: 'Quiz IA — Correction d\'une chaîne',
      timing: { questionDelaySeconds: 45, timeLimitSeconds: 120 },
      scoring: { wrongPenalty: 14, hintPenalty: 4, averageWeight: 2, fireMultiplier: 5, subjectCoefficient: 2, scoreScale: 100 },
      questions: [
        {
          text: 'Corrigez la dérivée proposée.',
          subtitle: 'Repérez les blocs faux dans la chaîne puis remplacez-les.',
          prefilledBlocks: ['f\'(x)', '=', '2x', '-', '1'],
          correctBlocks: ['f\'(x)', '=', '2x', '+', '1'],
          suggestionPool: ['+', '-', '1', '2x'],
          preferMath: true,
          hint: 'La dérivée de x²+x conserve un terme +1.',
          explanation: 'Il faut remplacer le signe moins par plus.',
        },
      ],
    },
  },
  {
    id: 'hg_parcours_tres_bien',
    category: 'Exemple',
    label: 'Histoire — Parcours Très Bien',
    description: 'Leçon avancée avec analyse critique.',
    payload: {
      kind: 'parcours_tres_bien',
      chapterNumber: 2,
      chapterTitle: 'Décolonisation et nouveaux États',
      title: 'Parcours IA — Analyse critique de la décolonisation',
      criticalAnalysis: [
        'Comparer les rythmes de décolonisation en Asie et en Afrique.',
        'Évaluer les limites politiques et économiques des indépendances acquises.'
      ],
      sections: [
        {
          title: 'Cadres historiques',
          analysisAxis: 'Identifier les causes structurelles et les événements déclencheurs.',
          contentBlocks: [
            'La décolonisation s’accélère après 1945 sous l’effet de l’affaiblissement des métropoles.',
            'Les élites nationalistes s’organisent et transforment les revendications politiques en mouvements de masse.'
          ],
          checkpointQuestions: [
            { type: 'mcq', question: 'Quelle période accélère le processus de décolonisation ?' }
          ]
        }
      ],
    },
  },
];

export const PROMPT_BANK = [
  {
    id: 'prompt_exercice_triptyque',
    title: 'Prompt Bank — Exercice en 3 fichiers',
    description: 'Génère séparément un fichier Sujet, un fichier Brouillon et un fichier Traitement.',
    prompt: `Tu es un générateur strict de JSON pour une application scolaire mobile. Tu dois produire exactement 3 fichiers JSON distincts et valides pour un exercice. Ne mets aucun markdown. Ne mets aucun commentaire. Réponds uniquement avec du JSON pur pour chaque fichier.

Contraintes globales :
1. Les champs chapterNumber doivent être des entiers >= 1.
2. Les champs title, chapterTitle, enonce, question, hint, explanation sont des chaînes.
3. Le fichier Traitement doit contenir uniquement des questions de type "block-input".
4. Le Brouillon doit exposer une vraie méthode par étapes avec un tableau steps ordonné.
5. Le Traitement doit suivre une progression stricte étape -> rafraîchissement.
6. Les rafraîchissements pilotent la banque de suggestion de blocs visible par l’élève.
7. Tu peux utiliser le nom technique lines, ou ses alias refreshes / rafraichissements.
8. Chaque rafraîchissement doit contenir : question, correctBlocks, suggestionPool, microSteps, dynamicBank.
9. Chaque rafraîchissement peut inclure facultativement stepIndex pour rattacher explicitement le rafraîchissement à une étape du brouillon.
10. Chaque micro-étape reste interne à un rafraîchissement et ne remplace jamais la structure principale.
11. Prévois un champ translations facultatif mais compatible avec l’application : soit { "mg": "..." }, soit un objet structuré comme { "question": { "mg": "..." }, "enonce": { "mg": "..." }, "steps": [{ "mg": "..." }] }.
12. Les réponses exactes doivent être immédiatement interprétables par l’application.
13. Tu peux ajouter un objet timing au niveau du Traitement, de la question, et de chaque rafraîchissement avec enonceDelaySeconds, brouillonDelaySeconds, treatmentDelaySeconds, questionDelaySeconds, stepDelaySeconds, refreshDelaySeconds ou delaySeconds.

Fichier 1, structure exacte :
{
  "kind": "exercice_enonce",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre de l’exercice",
  "enonce": "Énoncé complet avec retours à la ligne éventuels",
  "translations": { "enonce": { "mg": "Dika malagasy" } }
}

Fichier 2, structure exacte :
{
  "kind": "exercice_brouillon",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre de l’exercice",
  "questions": [
    {
      "question": "Texte exact de la question 1",
      "steps": ["Étape 1", "Étape 2", "Étape 3"],
      "translations": {
        "question": { "mg": "Fanontaniana 1" },
        "steps": [{ "mg": "Dingana 1" }, { "mg": "Dingana 2" }, { "mg": "Dingana 3" }]
      }
    }
  ]
}

Fichier 3, structure exacte :
{
  "kind": "exercice_traitement",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre de l’exercice",
  "timeLimitSeconds": 5400,
  "initialScore": 20,
  "timing": {
    "enonceDelaySeconds": 180,
    "brouillonDelaySeconds": 300,
    "treatmentDelaySeconds": 900,
    "questionDelaySeconds": 180,
    "refreshDelaySeconds": 90
  },
  "scoring": {
    "verificationPenalty": 2,
    "hintPenalty": 1,
    "wrongPenalty": 4,
    "scoreScale": 80
  },
  "questions": [
    {
      "type": "block-input",
      "question": "Texte exact de la question 1",
      "translations": { "question": { "mg": "Fanontaniana 1" }, "steps": [{ "mg": "Dingana 1" }, { "mg": "Dingana 2" }, { "mg": "Dingana 3" }] },
      "questionDelaySeconds": 180,
      "brouillon": {
        "steps": ["Étape 1", "Étape 2", "Étape 3"],
        "translations": { "steps": [{ "mg": "Dingana 1" }, { "mg": "Dingana 2" }, { "mg": "Dingana 3" }] }
      },
      "rafraichissements": [
        {
          "question": "Instruction du rafraîchissement 1",
          "translations": { "question": { "mg": "Toromarika amin'ny rafraîchissement 1" } },
          "refreshLabel": "Rafraîchissement 1",
          "stepIndex": 0,
          "refreshDelaySeconds": 90,
          "correctBlocks": ["bloc1", "bloc2"],
          "suggestionPool": ["bloc1", "bloc2", "piège1", "piège2"],
          "microSteps": [2],
          "dynamicBank": [
            { "size": 4, "options": ["bloc1", "bloc2", "piège1", "piège2"] }
          ],
          "hint": "Indice utile",
          "explanation": "Correction finale attendue"
        }
      ]
    }
  ]
}

Exigences pédagogiques : détaille les étapes du brouillon, fais correspondre chaque étape à un ou plusieurs rafraîchissements, privilégie plusieurs rafraîchissements courts et pédagogiques, introduis des distracteurs plausibles, et vérifie la cohérence exacte entre le Brouillon et le Traitement.`
  },
  {
    id: 'prompt_sujet_type_triptyque',
    title: 'Prompt Bank — Sujet type BAC en 3 fichiers',
    description: 'Version examen avec traitement volumineux et méthodologie obligatoire.',
    prompt: `Tu es un générateur strict de JSON pour un sujet type BAC. Tu dois fournir 3 fichiers JSON distincts sans markdown ni commentaire : Sujet, Brouillon, Traitement.

Exigences techniques :
- Le Sujet utilise kind = "sujet_type_enonce".
- Le Brouillon utilise kind = "sujet_type_brouillon".
- Le Traitement utilise kind = "sujet_type_traitement".
- Toutes les questions du Traitement sont de type "block-input".
- Chaque question doit inclure un brouillon par étapes et un traitement structuré en rafraîchissements.
- Utilise le nom technique lines, ou les alias refreshes / rafraichissements.
- Les rafraîchissements du traitement pilotent la banque de suggestion de blocs visible pour l’élève.
- Les micro-étapes restent internes à chaque rafraîchissement.
- Le barème final doit être fixé dans scoring.scoreScale avec 80 ou 100.
- Les suggestions doivent comporter entre 2 et 5 blocs utiles par micro-étape.
- Ajoute des pièges raisonnables dans suggestionPool.
- Tu peux ajouter timing au niveau global, par question ou par rafraîchissement pour piloter les objectifs de temps.
- Chaque question, étape de brouillon ou rafraîchissement peut aussi embarquer un champ translations structuré et des explanation lisibles par l’élève.

Structure obligatoire du fichier Traitement :
{
  "kind": "sujet_type_traitement",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre du sujet type",
  "timeLimitSeconds": 10800,
  "initialScore": 30,
  "timing": {
    "enonceDelaySeconds": 240,
    "brouillonDelaySeconds": 420,
    "treatmentDelaySeconds": 1800,
    "questionDelaySeconds": 240,
    "refreshDelaySeconds": 120
  },
  "scoring": {
    "verificationPenalty": 2,
    "hintPenalty": 1,
    "wrongPenalty": 6,
    "scoreScale": 100
  },
  "questions": [
    {
      "type": "block-input",
      "question": "Question de traitement",
      "questionDelaySeconds": 240,
      "brouillon": {
        "steps": ["Analyse", "Calcul", "Conclusion"]
      },
      "refreshes": [
        {
          "question": "Sous-tâche du rafraîchissement 1",
          "refreshLabel": "Rafraîchissement 1",
          "stepIndex": 0,
          "refreshDelaySeconds": 120,
          "correctBlocks": ["bloc1", "bloc2", "bloc3"],
          "suggestionPool": ["bloc1", "bloc2", "bloc3", "leurre1", "leurre2"],
          "microSteps": [2, 1],
          "dynamicBank": [
            { "size": 4, "options": ["bloc1", "leurre1", "bloc2", "leurre2"] },
            { "size": 3, "options": ["bloc3", "leurre3", "leurre4"] }
          ],
          "hint": "Indice",
          "explanation": "Correction exacte"
        }
      ]
    }
  ]
}

Exigences pédagogiques : le Sujet doit être réaliste, le Brouillon doit décomposer la méthodologie, le Traitement doit suivre une progression stricte étape -> rafraîchissement -> validation, et les conclusions doivent rester propres, explicites et exactes.`
  },
  {
    id: 'prompt_quiz_triptyque',
    title: 'Prompt Bank — Quiz 5 modes',
    description: 'Produit cinq fichiers JSON distincts pour Suggestion, Input Blocs, Pièges, Duel de l\'Intrus et Déminage.',
    prompt: `Tu es un générateur strict de JSON pour un quiz à 5 modes. Tu dois produire 5 fichiers séparés, sans markdown, sans commentaire, et uniquement en JSON pur.

Chaque fichier quiz peut contenir en plus :
- "timing": { "questionDelaySeconds": 45, "timeLimitSeconds": 180 }
- "scoring": { "wrongPenalty": 6, "hintPenalty": 2, "averageWeight": 2, "fireMultiplier": 5, "subjectCoefficient": 2, "scoreScale": 100 }

Mode 1 : kind = "quiz_mode_suggestion"
Structure :
{
  "kind": "quiz_mode_suggestion",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre du quiz",
  "timing": { "questionDelaySeconds": 45 },
  "scoring": { "subjectCoefficient": 1, "scoreScale": 100 },
  "questions": [
    {
      "text": "Question",
      "options": ["réponse A", "réponse B", "réponse C"],
      "correct_answer": "réponse B",
      "hint": "Indice",
      "explanation": "Correction",
      "translations": {
        "question": { "mg": "Fanontaniana" },
        "options": [{ "mg": "Valiny A" }, { "mg": "Valiny B" }, { "mg": "Valiny C" }]
      }
    }
  ]
}

Mode 2 : kind = "quiz_mode_input"
Le mode input est désormais un mode de sélection courte par blocs. Il ne doit jamais être mélangé au système de banque de blocs du traitement.
Chaque question doit contenir text, correct_answer et blockOptions.
Tu peux ajouter acceptedAnswers, suggestionPool, distractors, optionCount, helperText, promptContext, recognitionContext, hint, explanation, translations. Dans ce mode, translations doit surtout porter sur la question, pas sur les blocs.
Les blockOptions doivent proposer entre 2 et 4 blocs courts et plausibles, dont exactement un bloc juste.

Mode 3 : kind = "quiz_mode_trap"
Chaque question doit contenir text et options sous la forme :
"options": [
  { "text": "proposition 1", "is_trap": false, "translations": { "mg": "safidy 1" } },
  { "text": "proposition 2", "is_trap": true, "translations": { "mg": "safidy 2" } }
]

Mode 4 : kind = "quiz_mode_duel_intrus"
Chaque question doit contenir text et soit :
- safeBlock + trapBlock
ou
- options avec exactement un bloc sain et un ou plusieurs pièges très proches.
Tu peux ajouter subtitle, preferMath, scoring, hint, explanation, translations.
L'écart entre le bon bloc et le piège doit être minime mais pédagogique.

Mode 5 : kind = "quiz_mode_deminage"
Chaque question doit contenir text, prefilledBlocks, correctBlocks et suggestionPool.
Tu peux ajouter subtitle, currentBlocks, prefilledAnswer, currentAnswer, correct_answer, blockOptions, distractors, preferMath, scoring, hint, explanation, translations. Dans ce mode, translations doit viser la question et non la suggestionPool.
Les tableaux prefilledBlocks et correctBlocks doivent avoir exactement la même longueur. Une partie seulement des blocs doit être erronée dans la version préremplie.

Contraintes :
- Les 5 fichiers doivent partager exactement le même title et le même chapitre.
- Le contenu doit être cohérent entre les 5 modes.
- Le mode Pièges doit contenir de vrais distracteurs et de vrais pièges.
- Le Duel de l'Intrus doit être très discriminant.
- Le Déminage doit permettre une correction bloc par bloc, sans réponse libre.
- Les traductions sont facultatives mais recommandées pour la compréhension. Quand elles existent, fournis-les via translations.question et translations.options pour Suggestion / Pièges / Duel, et via translations.question seulement pour Input Blocs / Déminage.
- Le JSON doit être directement interprétable par l’application.`
  },
  {
    id: 'prompt_exercice_question_traitement',
    title: 'Prompt Bank — Exercice par question (Traitement)',
    description: 'Génère un seul JSON pour une question de traitement avec rafraîchissements, micro-étapes et banques de suggestion de blocs.',
    prompt: `Tu es un générateur strict de JSON pour une application scolaire mobile. Tu dois produire un seul fichier JSON, sans markdown, sans commentaire, pour UNE SEULE question de traitement d’un exercice.

Le fichier doit utiliser exactement kind = "exercice_traitement_question".
Le champ title doit correspondre exactement au titre de l’exercice cible déjà existant dans l’application.
Le couple chapterNumber + chapterTitle + title doit pointer vers l’élément exact à enrichir dans l’interface admin.
La question doit être exploitable seule, mais compatible avec une fusion dans un traitement plus grand.
La progression attendue dans l’application est stricte : étape -> rafraîchissement, sans navigation libre vers les rafraîchissements futurs.
Tu peux utiliser le nom technique lines, ou ses alias refreshes / rafraichissements.
Les rafraîchissements sont l’unité principale de validation. Les microSteps restent autorisés uniquement comme repères internes de construction du rafraîchissement.

Structure exacte attendue :
{
  "kind": "exercice_traitement_question",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre exact de l’exercice",
  "question": {
    "type": "block-input",
    "question": "Texte exact de la question principale",
    "translations": { "question": { "mg": "Fanontaniana lehibe" }, "steps": [{ "mg": "Dingana 1" }, { "mg": "Dingana 2" }, { "mg": "Dingana 3" }] },
    "brouillon": {
      "steps": ["Étape 1", "Étape 2", "Étape 3"],
      "translations": { "steps": [{ "mg": "Dingana 1" }, { "mg": "Dingana 2" }, { "mg": "Dingana 3" }] }
    },
    "rafraichissements": [
      {
        "question": "Instruction du rafraîchissement 1",
        "translations": { "question": { "mg": "Toromarika 1" } },
        "refreshLabel": "Rafraîchissement 1",
        "correctBlocks": ["bloc1", "bloc2"],
        "suggestionPool": ["bloc1", "bloc2", "leurre1", "leurre2"],
        "microSteps": [2],
        "dynamicBank": [
          { "size": 4, "options": ["bloc1", "bloc2", "leurre1", "leurre2"] }
        ],
        "hint": "Indice optionnel",
        "explanation": "Correction optionnelle"
      }
    ]
  }
}

Contraintes :
- La question doit contenir au moins 1 rafraîchissement, et idéalement plusieurs rafraîchissements si le raisonnement est long.
- Chaque rafraîchissement doit rester cohérent avec les steps du brouillon.
- Chaque rafraîchissement peut inclure facultativement "stepIndex" pour rattacher explicitement le rafraîchissement à une étape du brouillon.
- Si plusieurs rafraîchissements appartiennent à la même étape, ils doivent partager le même "stepIndex".
- Si "stepIndex" est absent, l’ordre des rafraîchissements doit rester parfaitement compatible avec l’ordre des steps.
- Chaque rafraîchissement doit décrire une production visible dans la zone centrale de réponse : égalité, transformation, justification courte, conclusion partielle, ou conclusion finale.
- Les suggestions doivent être réalistes, utiles et comporter des distracteurs crédibles.
- Les blocs corrects doivent permettre une reconstruction exacte de la réponse attendue.
- "correctBlocks" doit toujours correspondre exactement à la rédaction finale du rafraîchissement.
- "suggestionPool" doit contenir tous les blocs corrects du rafraîchissement, plus des distracteurs plausibles de même niveau.
- "dynamicBank" doit proposer une ou plusieurs banques successives cohérentes avec la longueur du rafraîchissement.
- "microSteps" doit être compatible avec la longueur de "correctBlocks" et ne jamais dépasser le nombre total de blocs.
- Tu peux ajouter des translations structurées sur la question principale, les steps du brouillon et chaque rafraîchissement.
- Préfère plusieurs rafraîchissements courts et pédagogiques plutôt qu’un seul rafraîchissement surchargé.
- Le dernier rafraîchissement doit produire une conclusion exploitable par l’élève sans ambiguïté.
- Si un rafraîchissement dépend du précédent, son texte "question" doit l’indiquer explicitement.
- Utilise un vocabulaire scolaire naturel, professionnel et directement exploitable en classe.
- Réponds uniquement avec du JSON pur.

Exigences pédagogiques détaillées :
- Le brouillon doit annoncer une vraie méthode de résolution, pas une simple reformulation de l’énoncé.
- Chaque étape du brouillon doit avoir au moins un rafraîchissement correspondant dans le traitement.
- Un rafraîchissement = une action intellectuelle identifiable : transformer, calculer, factoriser, comparer, conclure.
- Les distracteurs ne doivent pas être absurdes ; ils doivent représenter des erreurs réalistes d’élève.
- Les rafraîchissements de conclusion doivent être rédigés proprement, surtout pour les exercices de démonstration ou de résolution.
- Garde une cohérence parfaite entre la notation mathématique du brouillon, des rafraîchissements et des blocs.
- Réponds uniquement avec du JSON pur.`
  },
  {
    id: 'prompt_sujet_type_question_traitement',
    title: 'Prompt Bank — Sujet type par question (Traitement)',
    description: 'Génère un JSON unique pour une question de sujet type BAC, avec rafraîchissements méthodologiques détaillés.',
    prompt: `Tu es un générateur strict de JSON pour un sujet type BAC. Tu dois produire un seul fichier JSON, sans markdown ni commentaire, pour UNE question de traitement.

Le fichier doit utiliser exactement kind = "sujet_type_traitement_question".
Le champ title doit correspondre exactement au titre du sujet type déjà présent dans l’application.
Le couple chapterNumber + chapterTitle + title doit pointer vers le sujet type exact à enrichir dans l’admin.
La question doit pouvoir être fusionnée dans une page de traitement complète sans casser les autres questions.
La logique d’exécution dans l’application est stricte : l’élève valide un rafraîchissement complet, puis passe au suivant ; les rafraîchissements futurs restent verrouillés.
Utilise le nom technique lines, ou les alias refreshes / rafraichissements.
Les steps du brouillon servent à structurer la méthode, tandis que les rafraîchissements du traitement servent à la progression visible.

Structure obligatoire :
{
  "kind": "sujet_type_traitement_question",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre exact du sujet type",
  "question": {
    "type": "block-input",
    "question": "Question principale",
    "translations": { "question": { "mg": "Fanontaniana lehibe" }, "steps": [{ "mg": "Famakafakana" }, { "mg": "Kajy" }, { "mg": "Famaranana" }] },
    "brouillon": {
      "steps": ["Analyse", "Calcul", "Conclusion"],
      "translations": { "steps": [{ "mg": "Famakafakana" }, { "mg": "Kajy" }, { "mg": "Famaranana" }] }
    },
    "refreshes": [
      {
        "question": "Sous-tâche du rafraîchissement 1",
        "translations": { "question": { "mg": "Asa kely 1" } },
        "refreshLabel": "Rafraîchissement 1",
        "correctBlocks": ["bloc1", "bloc2", "bloc3"],
        "suggestionPool": ["bloc1", "bloc2", "bloc3", "leurre1", "leurre2"],
        "microSteps": [2, 1],
        "dynamicBank": [
          { "size": 4, "options": ["bloc1", "leurre1", "bloc2", "leurre2"] },
          { "size": 3, "options": ["bloc3", "leurre3", "leurre4"] }
        ],
        "hint": "Indice",
        "explanation": "Correction exacte"
      }
    ]
  }
}

Contraintes pédagogiques :
- Prévois une rédaction BAC propre, progressive et méthodique.
- Si la question est longue, découpe-la en plusieurs rafraîchissements logiques.
- Les steps du brouillon et les rafraîchissements du traitement doivent être parfaitement cohérents.
- Chaque rafraîchissement doit être solvable bloc par bloc avec une banque dynamique réaliste.
- Chaque rafraîchissement peut inclure un "stepIndex" explicite pour rattacher le rafraîchissement à une étape du brouillon.
- Les rafraîchissements d’une même étape doivent suivre une mini-progression locale, sans sauter directement à la conclusion générale.
- Chaque "question" de rafraîchissement doit être une consigne courte, claire et orientée production écrite.
- Chaque "refreshLabel" doit être simple et stable : "Rafraîchissement 1", "Rafraîchissement 2", etc.
- "correctBlocks" doit reconstituer exactement la phrase, l’égalité, l’inégalité, le tableau ou la conclusion attendue.
- "suggestionPool" doit mélanger blocs corrects, blocs voisins utiles et distracteurs typiques du BAC.
- "dynamicBank" doit rester réaliste et ne jamais proposer des blocs hors sujet.
- "microSteps" doit uniquement baliser des points internes de progression dans un rafraîchissement, sans remplacer la structure principale.
- Tu peux ajouter des translations structurées sur la question principale, les steps du brouillon et chaque rafraîchissement.
- Le dernier rafraîchissement doit formuler une conclusion de niveau examen, explicite et propre.
- Réponds uniquement avec du JSON pur.

Exigences de qualité BAC :
- Le raisonnement doit être rigoureux, élégant et directement présentable à l’examen.
- Les transitions entre lignes doivent être naturelles : calcul, interprétation, puis conclusion.
- Les distracteurs doivent correspondre à de vraies confusions de signe, de méthode, de dérivation, de lecture de tableau ou de conclusion.
- Les lignes doivent éviter toute ambiguïté de notation.
- La cohérence entre brouillon, traitement et réponse finale doit être totale.
- Réponds uniquement avec du JSON pur.`
  },
  {
    id: 'prompt_parcours',
    title: 'Prompt Bank — Parcours Bien / Très Bien',
    description: 'Deux formats volontairement différents pour éviter les erreurs d’import.',
    prompt: `Tu es un générateur strict de JSON pour des parcours de leçon. Tu dois produire un seul fichier JSON, soit pour Mention Bien, soit pour Mention Très Bien. Le format doit être strictement différent selon le niveau.

Format Mention Bien :
{
  "kind": "parcours_bien",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre du parcours",
  "sections": [
    {
      "title": "Section 1",
      "contentBlocks": ["idée 1", "idée 2"],
      "checkpointQuestions": [
        { "type": "mcq", "question": "Question simple de vérification" }
      ]
    }
  ]
}

Format Mention Très Bien :
{
  "kind": "parcours_tres_bien",
  "chapterNumber": 1,
  "chapterTitle": "Titre du chapitre",
  "title": "Titre du parcours avancé",
  "criticalAnalysis": ["axe critique 1", "axe critique 2"],
  "sections": [
    {
      "title": "Section 1",
      "analysisAxis": "angle d’analyse critique",
      "contentBlocks": ["argument 1", "argument 2"],
      "checkpointQuestions": [
        { "type": "input", "question": "Question d’analyse" }
      ]
    }
  ]
}

Contraintes :
- Le format Très Bien doit toujours contenir criticalAnalysis et analysisAxis.
- Le format Bien ne doit pas contenir ces deux champs.
- Les deux formats doivent rester compatibles avec une validation de schéma avant import.`
  },
];
