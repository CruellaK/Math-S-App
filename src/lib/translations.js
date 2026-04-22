import { DEFAULT_SUBJECT_TRANSLATION_SETTINGS } from './constants';

function normalizeText(value) {
  return (value || '').toString().trim();
}

const STRUCTURED_KEYS = new Set(['question', 'text', 'title', 'label', 'subtitle', 'enonce', 'prompt', 'options', 'items', 'choices', 'steps', 'mg', 'fr', 'en']);

export function normalizeTranslationLeaf(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const mg = normalizeText(raw);
    return mg ? { mg, fr: '', en: '' } : null;
  }
  if (typeof raw !== 'object') return null;
  const mg = normalizeText(raw.mg || raw.text || raw.value || raw.label || '');
  const fr = normalizeText(raw.fr || '');
  const en = normalizeText(raw.en || '');
  if (!mg && !fr && !en) return null;
  return { mg, fr, en };
}

export function getTranslationText(raw, lang = 'mg') {
  const entry = normalizeTranslationLeaf(raw);
  if (!entry) return '';
  return normalizeText(entry[lang] || entry.mg || entry.fr || entry.en || '');
}

export function normalizeTranslationList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTranslationLeaf);
}

export function normalizeTranslations(raw) {
  if (!raw) {
    return {
      question: null,
      subtitle: null,
      enonce: null,
      prompt: null,
      options: [],
      items: [],
      steps: [],
    };
  }

  if (typeof raw === 'string') {
    return {
      question: normalizeTranslationLeaf(raw),
      subtitle: null,
      enonce: null,
      prompt: null,
      options: [],
      items: [],
      steps: [],
    };
  }

  if (typeof raw !== 'object') {
    return {
      question: null,
      subtitle: null,
      enonce: null,
      prompt: null,
      options: [],
      items: [],
      steps: [],
    };
  }

  const keys = Object.keys(raw);
  const looksLikeQuestionLeaf = keys.length > 0 && keys.every((key) => STRUCTURED_KEYS.has(key)) && !('options' in raw) && !('items' in raw) && !('steps' in raw) && !('enonce' in raw) && !('subtitle' in raw) && !('prompt' in raw);
  if (looksLikeQuestionLeaf && (raw.mg || raw.fr || raw.en || raw.text || raw.label || raw.value)) {
    return {
      question: normalizeTranslationLeaf(raw),
      subtitle: null,
      enonce: null,
      prompt: null,
      options: [],
      items: [],
      steps: [],
    };
  }

  return {
    question: normalizeTranslationLeaf(raw.question || raw.text || raw.title || raw.label || null),
    subtitle: normalizeTranslationLeaf(raw.subtitle || null),
    enonce: normalizeTranslationLeaf(raw.enonce || null),
    prompt: normalizeTranslationLeaf(raw.prompt || null),
    options: normalizeTranslationList(raw.options || raw.choices || []),
    items: normalizeTranslationList(raw.items || []),
    steps: normalizeTranslationList(raw.steps || []),
  };
}

export function buildTextTranslationMap(values = [], entries = []) {
  const map = new Map();
  values.forEach((value, index) => {
    const key = normalizeText(value).toLowerCase();
    const entry = normalizeTranslationLeaf(entries[index]);
    if (key && entry) map.set(key, entry);
  });
  return map;
}

export function mapValuesToTranslations(values = [], map = new Map()) {
  return values.map((value) => {
    const key = normalizeText(value).toLowerCase();
    return key ? (map.get(key) || null) : null;
  });
}

export function resolveTranslationPricing(subject, kind = 'question') {
  const settings = subject?.translationSettings || {};
  const questionEnergyCost = Math.max(1, Math.round(Number(settings.energyCost) || DEFAULT_SUBJECT_TRANSLATION_SETTINGS.energyCost));
  const optionEnergyCost = Math.max(1, Math.round(Number(settings.optionEnergyCost) || Math.max(1, Math.floor(questionEnergyCost / 2)) || DEFAULT_SUBJECT_TRANSLATION_SETTINGS.optionEnergyCost));
  const hintPackCost = Math.max(1, Math.round(Number(settings.hintPackCost) || DEFAULT_SUBJECT_TRANSLATION_SETTINGS.hintPackCost));
  const energyCost = kind === 'option' ? optionEnergyCost : questionEnergyCost;
  return {
    energyCost,
    hintPackCost,
    scoreCost: energyCost,
  };
}
