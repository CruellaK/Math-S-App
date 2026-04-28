// Centralise la logique d'accès aux matières.
//
// Chaque matière peut être :
//   - "open"           : aucun blocage, l'élève y accède
//   - "class-default"  : bloquée par défaut pour la classe de l'élève
//   - "personal"       : bloquée explicitement pour cet élève (override)
//
// Règles de priorité (du plus fort au plus faible) :
//   1. Si la matière est dans user.blockedSubjectIds  → BLOQUÉE (personnel)
//   2. Si la matière est dans classDefaults[selectedClass].blockedSubjectIds :
//      - Si la matière est dans user.unlockedSubjectIds  → DÉBLOQUÉE (override personnel)
//      - Sinon                                          → BLOQUÉE (par défaut de classe)
//   3. Sinon                                            → DÉBLOQUÉE

function normalizeIdSet(list) {
  const out = new Set();
  if (!Array.isArray(list)) return out;
  for (const value of list) {
    if (value == null) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    out.add(raw);
    // Tolère le préfixe legacy "id:42"
    if (raw.startsWith('id:')) out.add(raw.slice(3));
    else out.add(`id:${raw}`);
  }
  return out;
}

function getSubjectId(subject) {
  if (subject == null) return '';
  return String(subject?.id ?? '').trim();
}

export function computeSubjectAccess({ subject, user = {}, classDefaults = {} } = {}) {
  const id = getSubjectId(subject);
  if (!id) return { blocked: false, source: 'open' };

  const personalBlocked = normalizeIdSet(user.blockedSubjectIds);
  if (personalBlocked.has(id)) {
    return { blocked: true, source: 'personal' };
  }

  const className = (user.selectedClass || '').toString().trim();
  const classBlocked = normalizeIdSet(classDefaults?.[className]?.blockedSubjectIds);
  if (classBlocked.has(id)) {
    const personalUnlocked = normalizeIdSet(user.unlockedSubjectIds);
    if (personalUnlocked.has(id)) {
      return { blocked: false, source: 'open', overriddenFromClass: true };
    }
    return { blocked: true, source: 'class-default' };
  }

  return { blocked: false, source: 'open' };
}

export function isSubjectBlocked(subject, user, classDefaults) {
  return computeSubjectAccess({ subject, user, classDefaults }).blocked;
}

// Tri stable : les matières débloquées en premier, puis les bloquées.
// L'ordre relatif d'origine est conservé à l'intérieur de chaque groupe.
export function sortSubjectsByAccess(subjects, user, classDefaults) {
  if (!Array.isArray(subjects) || subjects.length === 0) return subjects || [];
  const decorated = subjects.map((subject, index) => ({
    subject,
    index,
    blocked: computeSubjectAccess({ subject, user, classDefaults }).blocked,
  }));
  decorated.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    return a.index - b.index;
  });
  return decorated.map((entry) => entry.subject);
}
