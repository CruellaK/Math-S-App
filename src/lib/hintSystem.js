import { getTranslationText } from './translations';

/* ═══════════════════════════════════════════════════
   HINT SYSTEM — Indices à plusieurs niveaux
   ═══════════════════════════════════════════════════
   Chaque indice possède:
     - text          : contenu (string, KaTeX supporté via $...$)
     - importance    : 'mineur' | 'majeur' | 'critique'
     - nature        : 'concret' | 'theorique' | 'exemple' | 'formule'
     - level         : 1 (orientation) | 2 (méthode) | 3 (solution partielle)
     - price         : override optionnel en crédits (sinon calculé)
   ═══════════════════════════════════════════════════ */

export const HINT_IMPORTANCE_LABELS = {
  mineur: 'Mineur',
  majeur: 'Majeur',
  critique: 'Critique',
};

export const HINT_NATURE_LABELS = {
  concret: 'Concret',
  theorique: 'Théorique',
  exemple: 'Exemple',
  formule: 'Formule',
};

export const HINT_LEVEL_LABELS = {
  1: 'Niveau 1 — Orientation',
  2: 'Niveau 2 — Méthode',
  3: 'Niveau 3 — Solution partielle',
};

export const HINT_STYLE_LABELS = {
  fun: 'Fun',
  complet: 'Complet',
  complexe: 'Complexe',
};

const IMPORTANCE_MULTIPLIER = {
  mineur: 1,
  majeur: 2,
  critique: 3,
};

const STYLE_BY_LEVEL = {
  1: 'fun',
  2: 'complet',
  3: 'complexe',
};

const NATURE_MODIFIER = {
  concret: -1,
  exemple: -1,
  theorique: +1,
  formule: +1,
};

const HINT_INVENTORY_KEYS = {
  mineur: 'hintsMinor',
  majeur: 'hintsMajor',
  critique: 'hintsCritical',
};

function normalizeHintText(value) {
  return (value || '').toString().trim();
}

function resolveHintTextValue(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return normalizeHintText(raw);
  if (typeof raw !== 'object') return normalizeHintText(raw);

  const directText = normalizeHintText(raw.text || raw.indice || raw.label || raw.value || raw.hint || '');
  if (directText) return directText;

  const translatedText = getTranslationText(raw, 'mg');
  if (translatedText) return translatedText;

  const nestedHint = getTranslationText(raw.hint, 'mg');
  if (nestedHint) return nestedHint;

  return '';
}

function pickHintStyle(level, rawStyle) {
  if (HINT_STYLE_LABELS[rawStyle]) return rawStyle;
  return STYLE_BY_LEVEL[level] || 'fun';
}

function extractAnswerSnippet(question = {}) {
  const rawAnswer = question.correct_answer
    || question.answer
    || (Array.isArray(question.correctOrder) ? question.correctOrder.join(' ') : '')
    || (Array.isArray(question.correctBlocks) ? question.correctBlocks.join(' ') : '')
    || (Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers[0] : '');
  return normalizeHintText(rawAnswer);
}

function buildAutoHintEntries(question = {}, existingHints = []) {
  const occupiedLevels = new Set(existingHints.map(hint => Number(hint?.level) || 0));
  const primaryHint = resolveHintTextValue(
    question.helperText
    || question.promptContext
    || question.recognitionContext
    || question.hint
    || question.indice
    || existingHints[0]?.text
  );
  const explanation = normalizeHintText(question.explanation || question.explication);
  const answerSnippet = extractAnswerSnippet(question);
  const candidates = [
    {
      level: 1,
      text: primaryHint || 'Repère d’abord l’information clé demandée avant de répondre.',
      importance: 'mineur',
      nature: 'concret',
      style: 'fun',
    },
    {
      level: 2,
      text: explanation || (primaryHint ? `Méthode : ${primaryHint}` : 'Reprends la méthode attendue étape par étape avant de valider.'),
      importance: 'majeur',
      nature: explanation ? 'theorique' : 'exemple',
      style: 'complet',
    },
    {
      level: 3,
      text: answerSnippet ? `Forme attendue : ${answerSnippet}` : (explanation || primaryHint || 'Compare ta réponse à la structure correcte attendue.'),
      importance: 'critique',
      nature: answerSnippet ? 'formule' : 'theorique',
      style: 'complexe',
    },
  ];

  return candidates
    .filter(candidate => !occupiedLevels.has(candidate.level) && normalizeHintText(candidate.text))
    .map((candidate, index) => normalizeHint({
      id: `hint-auto-${candidate.level}`,
      ...candidate,
    }, existingHints.length + index))
    .filter(Boolean);
}

/**
 * Normalise un indice utilisateur (ou une simple string legacy)
 * en structure complète avec defaults.
 */
export function normalizeHint(raw, index = 0) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    return {
      id: `hint-${index}`,
      text: raw.trim(),
      importance: 'mineur',
      nature: 'concret',
      level: 1,
      style: pickHintStyle(1),
      price: null,
    };
  }
  const text = resolveHintTextValue(raw);
  if (!text) return null;
  const importance = HINT_IMPORTANCE_LABELS[raw.importance] ? raw.importance : 'mineur';
  const nature = HINT_NATURE_LABELS[raw.nature] ? raw.nature : 'concret';
  const level = [1, 2, 3].includes(Number(raw.level)) ? Number(raw.level) : 1;
  const style = pickHintStyle(level, raw.style || raw.variant || raw.mode || raw.kind);
  const price = Number.isFinite(Number(raw.price)) && Number(raw.price) > 0
    ? Math.round(Number(raw.price))
    : null;
  return {
    id: raw.id || `hint-${index}`,
    text,
    importance,
    nature,
    level,
    style,
    price,
  };
}

/**
 * Construit une liste ordonnée d'indices à partir d'une question.
 * Accepte:
 *   - hints: [...]
 *   - hint: "unique text"
 *   - indices: [...]
 *   - hintLevels: { 1: '...', 2: '...', 3: '...' }
 */
export function buildHints(question = {}) {
  const collected = [];
  const array = Array.isArray(question.hints)
    ? question.hints
    : Array.isArray(question.indices)
      ? question.indices
      : [];
  array.forEach((raw, index) => {
    const normalized = normalizeHint(raw, index);
    if (normalized) collected.push(normalized);
  });

  if (!collected.length && typeof question.hintLevels === 'object' && question.hintLevels) {
    Object.entries(question.hintLevels).forEach(([key, value], index) => {
      const normalized = normalizeHint({
        text: value,
        level: Number(key) || index + 1,
        importance: index === 0 ? 'mineur' : index === 1 ? 'majeur' : 'critique',
        nature: 'theorique',
      }, index);
      if (normalized) collected.push(normalized);
    });
  }

  if (!collected.length && question.hint) {
    const normalized = normalizeHint(question.hint, 0);
    if (normalized) collected.push(normalized);
  }

  if (collected.length < 3) {
    collected.push(...buildAutoHintEntries(question, collected));
  }

  collected.sort((a, b) => a.level - b.level);
  return collected.slice(0, 3);
}

/**
 * Coût d'un indice en crédits.
 * Formule:
 *   base = 2
 *   × importance multiplier
 *   + nature modifier
 *   + (level - 1) bonus
 *   min 1 crédit, max 12 crédits
 */
export function getHintCost(hint) {
  if (!hint) return 0;
  if (Number.isFinite(Number(hint.price)) && Number(hint.price) > 0) {
    return Math.max(1, Math.round(Number(hint.price)));
  }
  const importance = IMPORTANCE_MULTIPLIER[hint.importance] || 1;
  const nature = NATURE_MODIFIER[hint.nature] || 0;
  const levelBonus = Math.max(0, Number(hint.level) - 1);
  const base = 2;
  return Math.min(12, Math.max(1, base * importance + nature + levelBonus));
}

/**
 * Compte d'indices consommables (inventaire) correspondant à un indice révélé.
 * Un indice mineur coûte 1, majeur 2, critique 3 (fallback lorsque pas en crédits).
 */
export function getHintInventoryCost(hint) {
  if (!hint) return 1;
  const multiplier = IMPORTANCE_MULTIPLIER[hint.importance] || 1;
  return Math.max(1, multiplier + Math.max(0, Number(hint.level) - 1));
}

export function getHintInventoryKeys(hint) {
  const typedKey = HINT_INVENTORY_KEYS[hint?.importance] || 'hints';
  return typedKey === 'hints' ? ['hints'] : [typedKey, 'hints'];
}
