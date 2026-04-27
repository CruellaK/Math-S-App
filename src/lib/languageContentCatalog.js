function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unique(items = []) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function rotate(list = [], offset = 0) {
  if (!list.length) return [];
  const safeOffset = ((offset % list.length) + list.length) % list.length;
  return [...list.slice(safeOffset), ...list.slice(0, safeOffset)];
}

function splitBlocks(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function replaceWholeToken(sentence = '', token = '', replacement = '_____') {
  const target = String(token || '').trim();
  if (!target) return sentence;
  const blocks = splitBlocks(sentence);
  const index = blocks.findIndex((block) => block === target);
  if (index === -1) return sentence;
  const next = [...blocks];
  next[index] = replacement;
  return next.join(' ');
}

function findDifferenceIndex(correctBlocks = [], wrongBlocks = [], answerToken = '') {
  for (let index = 0; index < Math.min(correctBlocks.length, wrongBlocks.length); index += 1) {
    if (correctBlocks[index] !== wrongBlocks[index]) return index;
  }
  const fallbackIndex = correctBlocks.findIndex((block) => block === answerToken);
  return fallbackIndex >= 0 ? fallbackIndex : 0;
}

function buildDynamicBankForBlocks(correctBlocks = [], suggestionPool = []) {
  const safePool = unique([
    ...correctBlocks,
    ...suggestionPool,
  ]);

  return correctBlocks.map((block, index) => {
    const distractors = safePool.filter((entry) => entry !== block).slice(0, 4);
    const options = unique([block, ...distractors]).slice(0, 5);
    return {
      size: Math.max(2, Math.min(5, options.length)),
      options,
    };
  });
}

function createSentenceCase({
  prompt,
  correct,
  wrongs,
  answer,
  blockOptions,
  hint,
  explanation,
  duelTrap,
  trapPrompt,
  duelPrompt,
  deminagePrompt,
}) {
  const safeWrongs = unique(wrongs).slice(0, 3);
  const safeOptions = unique([answer, ...(blockOptions || [])]).slice(0, 4);
  return {
    prompt,
    correct,
    wrongs: safeWrongs,
    answer,
    blockOptions: safeOptions,
    hint,
    explanation,
    duelTrap: duelTrap || safeOptions.find((option) => option !== answer) || safeWrongs[0] || answer,
    trapPrompt: trapPrompt || 'Repérez les formulations fautives.',
    duelPrompt: duelPrompt || 'Choisissez la forme exacte.',
    deminagePrompt: deminagePrompt || 'Réparez la phrase proposée.',
  };
}

function buildSuggestionQuestions(cases = []) {
  return cases.map((entry, index) => ({
    text: entry.prompt,
    options: rotate([entry.correct, ...entry.wrongs], index).slice(0, 4),
    correct_answer: entry.correct,
    hint: entry.hint,
    explanation: entry.explanation,
  }));
}

function buildInputQuestions(cases = []) {
  return cases.map((entry) => ({
    text: replaceWholeToken(entry.correct, entry.answer, '_____'),
    correct_answer: entry.answer,
    acceptedAnswers: unique([entry.answer]),
    blockOptions: entry.blockOptions,
    optionCount: Math.max(2, Math.min(4, entry.blockOptions.length)),
    helperText: entry.prompt,
    hint: entry.hint,
    explanation: entry.explanation,
  }));
}

function buildTrapQuestions(cases = []) {
  return cases.map((entry, index) => ({
    text: entry.trapPrompt,
    options: rotate([
      { text: entry.correct, is_trap: false },
      ...entry.wrongs.map((wrong) => ({ text: wrong, is_trap: true })),
    ], index),
    hint: entry.hint,
    explanation: entry.explanation,
  }));
}

function buildDuelQuestions(cases = []) {
  return cases.map((entry) => ({
    text: entry.duelPrompt,
    subtitle: entry.prompt,
    options: [
      { text: entry.answer, is_trap: false },
      { text: entry.duelTrap, is_trap: true },
    ],
    hint: entry.hint,
    explanation: entry.explanation,
  }));
}

function buildDeminageQuestions(cases = []) {
  return cases.map((entry) => {
    const correctBlocks = splitBlocks(entry.correct);
    const wrongSentence = entry.wrongs[0] || entry.correct;
    const wrongBlocks = splitBlocks(wrongSentence);
    const wrongIndex = findDifferenceIndex(correctBlocks, wrongBlocks, entry.answer);
    const prefilledBlocks = correctBlocks.map((block, index) => {
      if (index !== wrongIndex) return block;
      return wrongBlocks[index] || entry.duelTrap;
    });

    return {
      text: entry.deminagePrompt,
      subtitle: entry.prompt,
      prefilledBlocks,
      correctBlocks,
      suggestionPool: unique([entry.answer, entry.duelTrap, ...entry.blockOptions]).slice(0, 5),
      hint: entry.hint,
      explanation: entry.explanation,
    };
  });
}

function buildQuizFilesForItem(chapter, item, subjectCoefficient = 1) {
  const modeBuilders = {
    suggestion: buildSuggestionQuestions,
    input: buildInputQuestions,
    trap: buildTrapQuestions,
    duel_intrus: buildDuelQuestions,
    deminage: buildDeminageQuestions,
  };

  const modeTimings = {
    suggestion: { questionDelaySeconds: 45, timeLimitSeconds: 270 },
    input: { questionDelaySeconds: 35, timeLimitSeconds: 210 },
    trap: { questionDelaySeconds: 55, timeLimitSeconds: 330 },
    duel_intrus: { questionDelaySeconds: 35, timeLimitSeconds: 210 },
    deminage: { questionDelaySeconds: 55, timeLimitSeconds: 330 },
  };

  const modeScorings = {
    suggestion: { subjectCoefficient, scoreScale: 100, wrongPenalty: 6, hintPenalty: 2 },
    input: { subjectCoefficient, scoreScale: 100, wrongPenalty: 6, hintPenalty: 2 },
    trap: { subjectCoefficient, scoreScale: 100, wrongPenalty: 8, hintPenalty: 2 },
    duel_intrus: { subjectCoefficient, scoreScale: 100, wrongPenalty: 12, hintPenalty: 4, averageWeight: 2, fireMultiplier: 5 },
    deminage: { subjectCoefficient, scoreScale: 100, wrongPenalty: 14, hintPenalty: 4, averageWeight: 2, fireMultiplier: 5 },
  };

  return Object.entries(modeBuilders).map(([mode, builder]) => ({
    label: `${item.title} · ${mode}`,
    filename: `${slugify(chapter.subject)}_${slugify(chapter.title)}_${slugify(item.title)}_${mode}.json`,
    payload: {
      kind: `quiz_mode_${mode}`,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      title: item.title,
      timing: modeTimings[mode],
      scoring: modeScorings[mode],
      questions: builder(item.cases),
    },
  }));
}

function buildRefreshLine(refresh, refreshIndex) {
  const correctBlocks = splitBlocks(refresh.answer);
  const distractorBlocks = unique([
    ...splitBlocks(refresh.distractors?.join(' ') || ''),
    ...(refresh.extraBlocks || []),
  ]);
  const suggestionPool = unique([...correctBlocks, ...distractorBlocks]);

  return {
    question: refresh.instruction,
    refreshLabel: `Rafraîchissement ${refreshIndex + 1}`,
    stepIndex: refresh.stepIndex,
    refreshDelaySeconds: refresh.refreshDelaySeconds || 90,
    correctBlocks,
    suggestionPool,
    dynamicBank: buildDynamicBankForBlocks(correctBlocks, distractorBlocks),
    hint: refresh.hint || '',
    explanation: refresh.explanation || '',
  };
}

function buildGuidedQuestion(question, questionIndex) {
  const refreshes = (question.refreshes || []).map((refresh, refreshIndex) => buildRefreshLine(refresh, refreshIndex));
  return {
    type: 'block-input',
    title: `Question ${questionIndex + 1}`,
    question: question.question,
    questionDelaySeconds: question.questionDelaySeconds || 300,
    hint: question.hint || '',
    explanation: question.explanation || '',
    brouillon: {
      steps: question.steps,
    },
    refreshes,
  };
}

function createRuleQuestion({
  question,
  notion,
  rule,
  focus,
  correction,
  conclusion,
  distractors = [],
  hint,
  explanation,
}) {
  return {
    question,
    steps: [
      'Repérer la notion grammaticale ou lexicale visée',
      'Appliquer la règle au passage concerné',
      'Rédiger une correction complète et justifiée',
    ],
    hint,
    explanation,
    refreshes: [
      {
        stepIndex: 0,
        instruction: 'Nommez précisément la notion travaillée.',
        answer: notion,
        distractors,
        hint,
      },
      {
        stepIndex: 0,
        instruction: 'Rappelez la règle utile à cet endroit.',
        answer: rule,
        distractors,
      },
      {
        stepIndex: 1,
        instruction: 'Repérez le segment qui commande la correction.',
        answer: focus,
        distractors,
      },
      {
        stepIndex: 1,
        instruction: 'Énoncez la correction attendue.',
        answer: correction,
        distractors,
      },
      {
        stepIndex: 2,
        instruction: 'Rédigez la phrase de conclusion.',
        answer: conclusion,
        distractors,
      },
      {
        stepIndex: 2,
        instruction: 'Justifiez proprement la réponse finale.',
        answer: explanation,
        distractors,
      },
    ],
  };
}

function createComprehensionQuestion({
  question,
  cue,
  interpretation,
  evidence,
  reformulation,
  conclusion,
  distractors = [],
  hint,
  explanation,
}) {
  return {
    question,
    steps: [
      'Repérer un indice précis dans le texte',
      'Interpréter cet indice dans le contexte',
      'Rédiger une réponse claire et complète',
    ],
    hint,
    explanation,
    refreshes: [
      {
        stepIndex: 0,
        instruction: 'Désignez l indice principal à retenir.',
        answer: cue,
        distractors,
      },
      {
        stepIndex: 0,
        instruction: 'Citez un appui textuel pertinent.',
        answer: evidence,
        distractors,
      },
      {
        stepIndex: 1,
        instruction: 'Interprétez la portée de cet indice.',
        answer: interpretation,
        distractors,
      },
      {
        stepIndex: 1,
        instruction: 'Reformulez cette idée avec vos mots.',
        answer: reformulation,
        distractors,
      },
      {
        stepIndex: 2,
        instruction: 'Rédigez la réponse rédigée attendue.',
        answer: conclusion,
        distractors,
      },
      {
        stepIndex: 2,
        instruction: 'Ajoutez une justification concise.',
        answer: explanation,
        distractors,
      },
    ],
  };
}

function createWritingQuestion({
  question,
  issue,
  thesis,
  axisOne,
  axisTwo,
  finalOpening,
  distractors = [],
  hint,
  explanation,
}) {
  return {
    question,
    steps: [
      'Dégager l enjeu du sujet',
      'Formuler une position et un plan',
      'Rédiger une réponse longue structurée',
    ],
    hint,
    explanation,
    refreshes: [
      {
        stepIndex: 0,
        instruction: 'Formulez l enjeu central du sujet.',
        answer: issue,
        distractors,
      },
      {
        stepIndex: 0,
        instruction: 'Précisez la problématique directrice.',
        answer: thesis,
        distractors,
      },
      {
        stepIndex: 1,
        instruction: 'Annoncez le premier axe de développement.',
        answer: axisOne,
        distractors,
      },
      {
        stepIndex: 1,
        instruction: 'Annoncez le second axe de développement.',
        answer: axisTwo,
        distractors,
      },
      {
        stepIndex: 2,
        instruction: 'Rédigez la phrase de conclusion argumentée.',
        answer: explanation,
        distractors,
      },
      {
        stepIndex: 2,
        instruction: 'Proposez une ouverture ou un prolongement.',
        answer: finalOpening,
        distractors,
      },
    ],
  };
}

function buildExerciseFiles(chapter, exercise, subjectCoefficient = 1) {
  const traitementQuestions = exercise.questions.map((question, index) => buildGuidedQuestion(question, index));
  const brouillonQuestions = traitementQuestions.map((question) => ({
    question: question.question,
    steps: question.brouillon.steps,
    explanation: question.explanation,
  }));
  const enonce = [exercise.introduction, ...(exercise.supportText ? [exercise.supportText] : []), exercise.instructions]
    .filter(Boolean)
    .join('\n\n');

  return [
    {
      label: `${exercise.title} · Enoncé`,
      filename: `${slugify(chapter.subject)}_${slugify(chapter.title)}_${slugify(exercise.title)}_enonce.json`,
      payload: {
        kind: 'exercice_enonce',
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        title: exercise.title,
        enonce,
      },
    },
    {
      label: `${exercise.title} · Brouillon`,
      filename: `${slugify(chapter.subject)}_${slugify(chapter.title)}_${slugify(exercise.title)}_brouillon.json`,
      payload: {
        kind: 'exercice_brouillon',
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        title: exercise.title,
        questions: brouillonQuestions,
      },
    },
    {
      label: `${exercise.title} · Traitement`,
      filename: `${slugify(chapter.subject)}_${slugify(chapter.title)}_${slugify(exercise.title)}_traitement.json`,
      payload: {
        kind: 'exercice_traitement',
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        title: exercise.title,
        timeLimitSeconds: exercise.timeLimitSeconds || 10800,
        initialScore: exercise.initialScore || Math.max(24, traitementQuestions.length * 2),
        timing: {
          enonceDelaySeconds: 300,
          brouillonDelaySeconds: 480,
          treatmentDelaySeconds: 3600,
          questionDelaySeconds: 300,
          stepDelaySeconds: 120,
          refreshDelaySeconds: 90,
        },
        scoring: {
          verificationPenalty: 2,
          hintPenalty: 1,
          wrongPenalty: 5,
          scoreScale: 100,
          subjectCoefficient,
        },
        questions: traitementQuestions,
      },
    },
  ];
}

function buildQuizPackEntries(chapters, subjectCoefficient) {
  return chapters.map((chapter) => ({
    id: `${slugify(chapter.subject)}-quiz-pack-${chapter.number}`,
    title: `${chapter.subject} · ${chapter.title} · Quiz 5 modes`,
    description: `5 items nommés, 25 fichiers JSON, 25 questions par mode dans ce chapitre.`,
    files: chapter.quizItems.flatMap((item) => buildQuizFilesForItem(chapter, item, subjectCoefficient)),
  }));
}

function buildExercisePackEntries(chapters, subjectCoefficient) {
  return chapters.map((chapter) => ({
    id: `${slugify(chapter.subject)}-exercise-pack-${chapter.number}`,
    title: `${chapter.subject} · ${chapter.title} · Exercices longs`,
    description: `2 exercices longs, questions multiples, brouillon obligatoire et traitements à rafraîchissements successifs.`,
    files: chapter.exercises.flatMap((exercise) => buildExerciseFiles(chapter, exercise, subjectCoefficient)),
  }));
}

const FRENCH_QUIZ_CHAPTERS = [
  {
    subject: 'Français',
    number: 1,
    title: 'Bases orthographiques et accords',
    quizItems: [
      {
        title: 'Accords du nom et de l adjectif',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correctement accordée.',
            correct: 'Les fleurs blanches décorent la table.',
            wrongs: [
              'Les fleurs blanc décorent la table.',
              'Les fleur blanches décorent la table.',
              'Les fleurs blanche décorent la table.',
            ],
            answer: 'blanches',
            blockOptions: ['blanches', 'blanc', 'blanche', 'blancs'],
            hint: 'Le nom est féminin pluriel.',
            explanation: 'L adjectif prend ici la marque du féminin pluriel.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la forme exacte de la phrase.',
            correct: 'Des élèves motivés préparent l examen.',
            wrongs: [
              'Des élèves motivé préparent l examen.',
              'Des élève motivés préparent l examen.',
              'Des élèves motivée préparent l examen.',
            ],
            answer: 'motivés',
            blockOptions: ['motivés', 'motivé', 'motivée', 'motivées'],
            hint: 'Le groupe nominal est masculin pluriel.',
            explanation: 'L adjectif s accorde avec élèves, masculin pluriel.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Ces histoires anciennes restent passionnantes.',
            wrongs: [
              'Ces histoires anciennes reste passionnantes.',
              'Ces histoire anciennes restent passionnantes.',
              'Ces histoires ancienne restent passionnantes.',
            ],
            answer: 'anciennes',
            blockOptions: ['anciennes', 'ancienne', 'anciens', 'ancien'],
            hint: 'Histoires est féminin pluriel.',
            explanation: 'Anciennes reprend le genre et le nombre de histoires.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la rédaction juste.',
            correct: 'Les réponses exactes étaient rassurantes.',
            wrongs: [
              'Les réponses exacte étaient rassurantes.',
              'Les réponse exactes étaient rassurantes.',
              'Les réponses exactes était rassurantes.',
            ],
            answer: 'exactes',
            blockOptions: ['exactes', 'exacte', 'exacts', 'exact'],
            hint: 'Réponses est féminin pluriel.',
            explanation: 'L adjectif exactes suit le nom féminin pluriel réponses.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase grammaticalement correcte.',
            correct: 'Les décisions finales semblent prudentes.',
            wrongs: [
              'Les décisions finales semble prudentes.',
              'Les décision finales semblent prudentes.',
              'Les décisions finale semblent prudentes.',
            ],
            answer: 'finales',
            blockOptions: ['finales', 'finale', 'finaux', 'final'],
            hint: 'Décisions est féminin pluriel.',
            explanation: 'Finales s accorde avec décisions au féminin pluriel.',
          }),
        ],
      },
      {
        title: 'Pluriel simple et marques du nombre',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la forme correcte.',
            correct: 'Les chevaux traversent la plaine.',
            wrongs: [
              'Les chevals traversent la plaine.',
              'Les cheval traversent la plaine.',
              'Les chevaux traverse la plaine.',
            ],
            answer: 'chevaux',
            blockOptions: ['chevaux', 'chevals', 'cheval', 'chevaus'],
            hint: 'Le nom prend une marque de pluriel irrégulière.',
            explanation: 'Cheval forme son pluriel en chevaux.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Des journaux anciens sont conservés ici.',
            wrongs: [
              'Des journals anciens sont conservés ici.',
              'Des journal anciens sont conservés ici.',
              'Des journaux ancien sont conservés ici.',
            ],
            answer: 'journaux',
            blockOptions: ['journaux', 'journals', 'journal', 'journales'],
            hint: 'Journal suit la série des noms en al qui prennent aux.',
            explanation: 'Le pluriel de journal est journaux.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase bien formée.',
            correct: 'Les détails essentiels apparaissent clairement.',
            wrongs: [
              'Les détails essentiels apparaissent clairement.',
              'Les détail essentiel apparaissent clairement.',
              'Les détails essentiel apparaît clairement.',
            ],
            answer: 'détails',
            blockOptions: ['détails', 'détailss', 'détail', 'détails'],
            hint: 'Le pluriel du nom doit être marqué.',
            explanation: 'Détails porte la marque régulière du pluriel.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la bonne phrase.',
            correct: 'Ces travaux longs demandent du temps.',
            wrongs: [
              'Ces travails longs demandent du temps.',
              'Ces travail longs demandent du temps.',
              'Ces travaux long demande du temps.',
            ],
            answer: 'travaux',
            blockOptions: ['travaux', 'travails', 'travail', 'travauxs'],
            hint: 'Travail fait partie des pluriels en aux.',
            explanation: 'Le pluriel usuel de travail est travaux.',
          }),
          createSentenceCase({
            prompt: 'Repérez la forme juste.',
            correct: 'Les prix affichés restent stables.',
            wrongs: [
              'Les prixs affichés restent stables.',
              'Les prix affiché restent stables.',
              'Les prix affichés reste stables.',
            ],
            answer: 'prix',
            blockOptions: ['prix', 'prixs', 'pris', 'prixes'],
            hint: 'Prix est invariable au singulier et au pluriel.',
            explanation: 'Le mot prix conserve la même graphie au pluriel.',
          }),
        ],
      },
      {
        title: 'Homophones grammaticaux',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Il a réussi grâce à son travail.',
            wrongs: [
              'Il à réussi grâce a son travail.',
              'Il a réussi grâce a son travail.',
              'Il à réussi grâce à son travail.',
            ],
            answer: 'à',
            blockOptions: ['à', 'a', 'as', 'ont'],
            hint: 'Le second mot introduit un complément.',
            explanation: 'On écrit à avec accent pour la préposition.',
          }),
          createSentenceCase({
            prompt: 'Repérez la rédaction juste.',
            correct: 'La pièce est calme et lumineuse.',
            wrongs: [
              'La pièce et calme et lumineuse.',
              'La pièce est calme est lumineuse.',
              'La pièce et calme est lumineuse.',
            ],
            answer: 'est',
            blockOptions: ['est', 'et', 'ait', 'es'],
            hint: 'Il faut ici le verbe être.',
            explanation: 'Est correspond au verbe être à la troisième personne.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Son frère prend ses livres.',
            wrongs: [
              'Sont frère prend ses livres.',
              'Son frère prend c est livres.',
              'Son frère prend ces livres.',
            ],
            answer: 'Son',
            blockOptions: ['Son', 'Sont', 'Ces', 'C est'],
            hint: 'Le premier mot indique la possession.',
            explanation: 'Son est ici le déterminant possessif.',
            duelTrap: 'Sont',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Ces élèves savent où aller.',
            wrongs: [
              'Ses élèves savent où aller.',
              'Ces élèves savent ou aller.',
              'Ses élèves savent ou aller.',
            ],
            answer: 'où',
            blockOptions: ['où', 'ou', 'ses', 'ces'],
            hint: 'Le mot introduit ici le lieu.',
            explanation: 'On écrit où avec accent quand il s agit d un adverbe de lieu.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la bonne forme.',
            correct: 'C est leur décision, pas la nôtre.',
            wrongs: [
              'S est leur décision, pas la nôtre.',
              'C est leurs décision, pas la nôtre.',
              'C est leur décision, pas la notre.',
            ],
            answer: 'leur',
            blockOptions: ['leur', 'leurs', 'leurss', 'leurses'],
            hint: 'Le déterminant possessif reste au singulier devant décision.',
            explanation: 'On écrit leur car le nom qui suit est singulier.',
          }),
        ],
      },
      {
        title: 'Accord sujet verbe',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Les élèves participent activement au débat.',
            wrongs: [
              'Les élèves participe activement au débat.',
              'Les élève participent activement au débat.',
              'Les élèves participes activement au débat.',
            ],
            answer: 'participent',
            blockOptions: ['participent', 'participe', 'participes', 'participons'],
            hint: 'Le sujet est pluriel.',
            explanation: 'Le verbe s accorde avec le sujet pluriel élèves.',
          }),
          createSentenceCase({
            prompt: 'Repérez la forme correcte.',
            correct: 'Ni le professeur ni les élèves ne renoncent.',
            wrongs: [
              'Ni le professeur ni les élèves ne renonce.',
              'Ni le professeur ni les élèves ne renonçons.',
              'Ni le professeur ni les élève ne renoncent.',
            ],
            answer: 'renoncent',
            blockOptions: ['renoncent', 'renonce', 'renonçons', 'renonces'],
            hint: 'Le noyau le plus proche est pluriel.',
            explanation: 'Dans cette coordination, l accord se fait ici au pluriel.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase bien accordée.',
            correct: 'La majorité des candidats réussit cette étape.',
            wrongs: [
              'La majorité des candidats réussissent cette étape.',
              'La majorité des candidat réussit cette étape.',
              'La majorité des candidats réussi cette étape.',
            ],
            answer: 'réussit',
            blockOptions: ['réussit', 'réussissent', 'réussi', 'réussis'],
            hint: 'Le sujet grammatical est majorité.',
            explanation: 'Le verbe s accorde avec majorité, noyau singulier.',
          }),
          createSentenceCase({
            prompt: 'Repérez la rédaction juste.',
            correct: 'Chaque réponse mérite une vérification.',
            wrongs: [
              'Chaque réponse méritent une vérification.',
              'Chaque réponses mérite une vérification.',
              'Chaque réponse mériter une vérification.',
            ],
            answer: 'mérite',
            blockOptions: ['mérite', 'méritent', 'mériter', 'mérites'],
            hint: 'Chaque commande le singulier.',
            explanation: 'Le sujet introduit par chaque entraîne un accord au singulier.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Toi et moi savons pourquoi agir.',
            wrongs: [
              'Toi et moi sait pourquoi agir.',
              'Toi et moi savez pourquoi agir.',
              'Toi et moi savons pourquoi agirs.',
            ],
            answer: 'savons',
            blockOptions: ['savons', 'savez', 'sait', 'save'],
            hint: 'Le sujet coordonné inclut la première personne.',
            explanation: 'Toi et moi impose l accord à la première personne du pluriel.',
          }),
        ],
      },
      {
        title: 'Participe passé avec avoir',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Les lettres que j ai écrites sont parties.',
            wrongs: [
              'Les lettres que j ai écrit sont parties.',
              'Les lettres que j ai écrite sont parties.',
              'Les lettre que j ai écrites sont parties.',
            ],
            answer: 'écrites',
            blockOptions: ['écrites', 'écrit', 'écrite', 'écrits'],
            hint: 'Le COD lettres est placé avant.',
            explanation: 'Avec avoir, le participe passé s accorde avec le COD placé avant.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Les chansons qu elle a chantées plaisent au jury.',
            wrongs: [
              'Les chansons qu elle a chanté plaisent au jury.',
              'Les chansons qu elle a chantée plaisent au jury.',
              'Les chanson qu elle a chantées plaisent au jury.',
            ],
            answer: 'chantées',
            blockOptions: ['chantées', 'chanté', 'chantée', 'chantés'],
            hint: 'Le COD chansons est avant le verbe.',
            explanation: 'Le participe passé prend le féminin pluriel ici.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la forme exacte.',
            correct: 'Les fautes qu ils ont corrigées disparaissent.',
            wrongs: [
              'Les fautes qu ils ont corrigé disparaissent.',
              'Les fautes qu ils ont corrigée disparaissent.',
              'Les faute qu ils ont corrigées disparaissent.',
            ],
            answer: 'corrigées',
            blockOptions: ['corrigées', 'corrigé', 'corrigée', 'corrigés'],
            hint: 'Le COD fautes est féminin pluriel.',
            explanation: 'Le participe passé s accorde avec fautes, placé avant.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Les pages qu il a relues sont annotées.',
            wrongs: [
              'Les pages qu il a relu sont annotées.',
              'Les pages qu il a relue sont annotées.',
              'Les page qu il a relues sont annotées.',
            ],
            answer: 'relues',
            blockOptions: ['relues', 'relu', 'relue', 'relus'],
            hint: 'Le COD pages précède le verbe.',
            explanation: 'Relues s accorde avec pages, féminin pluriel.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la rédaction correcte.',
            correct: 'Les réponses que nous avons données sont nettes.',
            wrongs: [
              'Les réponses que nous avons donné sont nettes.',
              'Les réponses que nous avons donnée sont nettes.',
              'Les réponse que nous avons données sont nettes.',
            ],
            answer: 'données',
            blockOptions: ['données', 'donné', 'donnée', 'donnés'],
            hint: 'Le COD réponses est placé avant.',
            explanation: 'Données prend le féminin pluriel à cause de réponses.',
          }),
        ],
      },
    ],
    exercises: [],
  },
  {
    subject: 'Français',
    number: 2,
    title: 'Grammaire, conjugaison et phrase complexe',
    quizItems: [
      {
        title: 'Temps simples et valeurs du présent',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correctement conjuguée.',
            correct: 'Je finis ce devoir avant midi.',
            wrongs: [
              'Je finie ce devoir avant midi.',
              'Je finit ce devoir avant midi.',
              'Je finir ce devoir avant midi.',
            ],
            answer: 'finis',
            blockOptions: ['finis', 'finie', 'finit', 'finir'],
            hint: 'Le sujet est je au présent.',
            explanation: 'Avec je, le verbe finir donne finis au présent.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase juste.',
            correct: 'Nous prenons des notes détaillées.',
            wrongs: [
              'Nous prennons des notes détaillées.',
              'Nous prend des notes détaillées.',
              'Nous prendre des notes détaillées.',
            ],
            answer: 'prenons',
            blockOptions: ['prenons', 'prennons', 'prend', 'prendre'],
            hint: 'Le sujet est nous.',
            explanation: 'Au présent, prendre se conjugue nous prenons.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la forme correcte.',
            correct: 'Vous dites la vérité avec calme.',
            wrongs: [
              'Vous ditesz la vérité avec calme.',
              'Vous dites la vérité avec calme.',
              'Vous dire la vérité avec calme.',
            ],
            answer: 'dites',
            blockOptions: ['dites', 'ditesz', 'disez', 'dire'],
            hint: 'Le verbe dire a une forme irrégulière à vous.',
            explanation: 'La seule forme correcte est vous dites.',
          }),
          createSentenceCase({
            prompt: 'Repérez la conjugaison correcte.',
            correct: 'Ils voient déjà la difficulté.',
            wrongs: [
              'Ils voyent déjà la difficulté.',
              'Ils voit déjà la difficulté.',
              'Ils voyaient déjà la difficulté.',
            ],
            answer: 'voient',
            blockOptions: ['voient', 'voyent', 'voit', 'voyaient'],
            hint: 'Le sujet est ils au présent.',
            explanation: 'Voir se conjugue ils voient au présent.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Tu peux encore améliorer ton plan.',
            wrongs: [
              'Tu peut encore améliorer ton plan.',
              'Tu peux encore amélioreres ton plan.',
              'Tu pouvoir encore améliorer ton plan.',
            ],
            answer: 'peux',
            blockOptions: ['peux', 'peut', 'pouvoir', 'peu'],
            hint: 'Le sujet est tu.',
            explanation: 'Au présent, pouvoir donne tu peux.',
          }),
        ],
      },
      {
        title: 'Imparfait, passé simple et narration',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correctement conjuguée.',
            correct: 'Le héros avançait quand la foule cria.',
            wrongs: [
              'Le héros avançait quand la foule criait.',
              'Le héros avança quand la foule cria.',
              'Le héros avançer quand la foule cria.',
            ],
            answer: 'avançait',
            blockOptions: ['avançait', 'avança', 'avançer', 'avançais'],
            hint: 'L action de fond demande l imparfait.',
            explanation: 'Avançait exprime ici l arrière plan narratif.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase juste.',
            correct: 'Ils observaient la scène puis partirent.',
            wrongs: [
              'Ils observaient la scène puis partaient.',
              'Ils observèrent la scène puis partirent.',
              'Ils observer la scène puis partirent.',
            ],
            answer: 'partirent',
            blockOptions: ['partirent', 'partaient', 'observèrent', 'parties'],
            hint: 'L action brève de premier plan appelle le passé simple.',
            explanation: 'Partirent marque l événement ponctuel de la narration.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la forme correcte.',
            correct: 'Pendant qu il lisait, la pluie redoubla.',
            wrongs: [
              'Pendant qu il lut, la pluie redoubla.',
              'Pendant qu il lisait, la pluie redoublait.',
              'Pendant qu il lire, la pluie redoubla.',
            ],
            answer: 'lisait',
            blockOptions: ['lisait', 'lut', 'lire', 'lisent'],
            hint: 'Pendant que introduit une action en cours.',
            explanation: 'Lisait convient pour une action durative d arrière plan.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Les témoins attendaient lorsqu un bruit éclata.',
            wrongs: [
              'Les témoins attendirent lorsqu un bruit éclata.',
              'Les témoins attendaient lorsqu un bruit éclatait.',
              'Les témoins attendre lorsqu un bruit éclata.',
            ],
            answer: 'attendaient',
            blockOptions: ['attendaient', 'attendirent', 'attendre', 'attendait'],
            hint: 'L attente constitue le cadre.',
            explanation: 'Attendaient exprime la durée, éclata l événement soudain.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la bonne phrase.',
            correct: 'La porte grinçait quand il entra.',
            wrongs: [
              'La porte grinça quand il entra.',
              'La porte grinçait quand il entrait.',
              'La porte grinçer quand il entra.',
            ],
            answer: 'grinçait',
            blockOptions: ['grinçait', 'grinça', 'grinçer', 'grince'],
            hint: 'Le son constitue la toile de fond.',
            explanation: 'Grinçait relève de l imparfait descriptif.',
          }),
        ],
      },
      {
        title: 'Futur et conditionnel',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Je viendrai demain si le train arrive à l heure.',
            wrongs: [
              'Je viendrais demain si le train arrive à l heure.',
              'Je viendrai demain si le train arrivera à l heure.',
              'Je venirai demain si le train arrive à l heure.',
            ],
            answer: 'viendrai',
            blockOptions: ['viendrai', 'viendrais', 'venirai', 'viendra'],
            hint: 'La principale exprime le futur simple.',
            explanation: 'Avec si au présent, la conséquence se met au futur simple.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Nous serions prêts si vous confirmiez votre présence.',
            wrongs: [
              'Nous serons prêts si vous confirmiez votre présence.',
              'Nous serions prêts si vous confirmerez votre présence.',
              'Nous être prêts si vous confirmiez votre présence.',
            ],
            answer: 'serions',
            blockOptions: ['serions', 'serons', 'être', 'serait'],
            hint: 'La proposition principale relève de l hypothèse.',
            explanation: 'Le conditionnel présent exprime l éventualité ici.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la forme juste.',
            correct: 'Tu pourrais reformuler cette idée.',
            wrongs: [
              'Tu pourras reformuler cette idée.',
              'Tu pourrais reformulera cette idée.',
              'Tu pouvoir reformuler cette idée.',
            ],
            answer: 'pourrais',
            blockOptions: ['pourrais', 'pourras', 'pouvoir', 'pourrait'],
            hint: 'Il s agit d une suggestion polie.',
            explanation: 'Le conditionnel atténue l injonction et marque la politesse.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Ils finiront ce travail avant la nuit.',
            wrongs: [
              'Ils finiraient ce travail avant la nuit.',
              'Ils finirons ce travail avant la nuit.',
              'Ils finiront ce travail avant la nuits.',
            ],
            answer: 'finiront',
            blockOptions: ['finiront', 'finiraient', 'finirons', 'finirait'],
            hint: 'Aucune hypothèse n est exprimée.',
            explanation: 'Le futur simple convient pour une projection certaine.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la rédaction correcte.',
            correct: 'Elle aurait répondu si elle avait compris.',
            wrongs: [
              'Elle aura répondu si elle avait compris.',
              'Elle aurait répondu si elle aurait compris.',
              'Elle aurait répondre si elle avait compris.',
            ],
            answer: 'aurait',
            blockOptions: ['aurait', 'aura', 'avait', 'aurai'],
            hint: 'La phrase relève de l irréel du passé.',
            explanation: 'La principale prend le conditionnel passé.',
          }),
        ],
      },
      {
        title: 'Pronoms relatifs et reprises',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Le livre que tu cherches est ici.',
            wrongs: [
              'Le livre qui tu cherches est ici.',
              'Le livre dont tu cherches est ici.',
              'Le livre que tu cherche est ici.',
            ],
            answer: 'que',
            blockOptions: ['que', 'qui', 'dont', 'où'],
            hint: 'Le pronom reprend le COD de cherches.',
            explanation: 'Que introduit ici la relative objet.',
          }),
          createSentenceCase({
            prompt: 'Repérez la forme correcte.',
            correct: 'La ville où il habite change vite.',
            wrongs: [
              'La ville dont il habite change vite.',
              'La ville que il habite change vite.',
              'La ville où il habitent change vite.',
            ],
            answer: 'où',
            blockOptions: ['où', 'dont', 'que', 'qui'],
            hint: 'Le pronom indique le lieu.',
            explanation: 'Où sert à reprendre un complément de lieu.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'L auteur dont nous parlons convainc le jury.',
            wrongs: [
              'L auteur que nous parlons convainc le jury.',
              'L auteur où nous parlons convainc le jury.',
              'L auteur dont nous parle convainc le jury.',
            ],
            answer: 'dont',
            blockOptions: ['dont', 'que', 'où', 'qui'],
            hint: 'Le verbe parler se construit avec de.',
            explanation: 'Dont reprend un complément introduit par de.',
          }),
          createSentenceCase({
            prompt: 'Repérez la rédaction correcte.',
            correct: 'Les élèves qui participent progressent vite.',
            wrongs: [
              'Les élèves que participent progressent vite.',
              'Les élèves qui participe progressent vite.',
              'Les élèves dont participent progressent vite.',
            ],
            answer: 'qui',
            blockOptions: ['qui', 'que', 'dont', 'où'],
            hint: 'Le pronom joue ici le rôle de sujet du verbe participent.',
            explanation: 'Qui remplit la fonction sujet dans la relative.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Voici le sujet auquel elle réfléchit.',
            wrongs: [
              'Voici le sujet que elle réfléchit.',
              'Voici le sujet auquel elle réfléchissent.',
              'Voici le sujet dont elle réfléchit.',
            ],
            answer: 'auquel',
            blockOptions: ['auquel', 'dont', 'que', 'qui'],
            hint: 'Réfléchir à impose un pronom correspondant.',
            explanation: 'Auquel reprend un complément introduit par à.',
          }),
        ],
      },
      {
        title: 'Connecteurs et phrase complexe',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correctement ponctuée.',
            correct: 'Il hésitait, pourtant il a répondu clairement.',
            wrongs: [
              'Il hésitait pourtant il a répondu clairement.',
              'Il hésitait, pourtant, il a répondu clairement.',
              'Il hésitait pourtant, il a répondu clairement.',
            ],
            answer: 'pourtant',
            blockOptions: ['pourtant', 'donc', 'car', 'or'],
            hint: 'Le lien marque l opposition.',
            explanation: 'Pourtant introduit une opposition logique.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase logique.',
            correct: 'Puisqu il a compris, il peut conclure.',
            wrongs: [
              'Puisqu il a compris, il pourrait conclure hier.',
              'Puisqu il a compris il peut conclure.',
              'Puisqu il a comprendre, il peut conclure.',
            ],
            answer: 'Puisqu',
            blockOptions: ['Puisqu', 'Donc', 'Mais', 'Si'],
            hint: 'Le connecteur exprime la cause évidente.',
            explanation: 'Puisque relie la cause immédiatement admise à la conséquence.',
            duelTrap: 'Donc',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Bien qu il doute, il avance encore.',
            wrongs: [
              'Bien qu il doute il avance encore.',
              'Bien qu il doute, il avancent encore.',
              'Bien qu il douter, il avance encore.',
            ],
            answer: 'Bien',
            blockOptions: ['Bien', 'Même', 'Donc', 'Car'],
            hint: 'Le groupe introducteur annonce une concession.',
            explanation: 'Bien que introduit une subordonnée concessive.',
            duelTrap: 'Donc',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase la plus cohérente.',
            correct: 'Il révise afin qu il réussisse.',
            wrongs: [
              'Il révise afin qu il réussit.',
              'Il révise afin que il réussisse.',
              'Il révise afin qu il réussir.',
            ],
            answer: 'réussisse',
            blockOptions: ['réussisse', 'réussit', 'réussir', 'réussira'],
            hint: 'Afin que exige le subjonctif.',
            explanation: 'La subordonnée finale se construit ici avec le subjonctif.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la bonne phrase.',
            correct: 'Quand il termine, il relit chaque phrase.',
            wrongs: [
              'Quand il termine il relit chaque phrase.',
              'Quand il terminera, il relit chaque phrase.',
              'Quand il terminé, il relit chaque phrase.',
            ],
            answer: 'termine',
            blockOptions: ['termine', 'terminera', 'terminé', 'termines'],
            hint: 'La proposition temporelle reste au présent ici.',
            explanation: 'Le présent convient dans cette phrase de vérité habituelle.',
          }),
        ],
      },
    ],
    exercises: [],
  },
  {
    subject: 'Français',
    number: 3,
    title: 'Compréhension, vocabulaire et analyse',
    quizItems: [
      {
        title: 'Lexique de la thèse et de l argument',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase exacte.',
            correct: 'La thèse exprime l idée que l auteur défend.',
            wrongs: [
              'La thèse exprime l idée que l auteur attaque.',
              'La thèse expriment l idée que l auteur défend.',
              'La thèse exprime l idée que l auteur défendre.',
            ],
            answer: 'défend',
            blockOptions: ['défend', 'attaque', 'défendent', 'défendre'],
            hint: 'La thèse correspond à la position soutenue.',
            explanation: 'Défend est le verbe juste pour caractériser la thèse.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Un exemple renforce souvent un argument.',
            wrongs: [
              'Un exemple renforce souvent une argument.',
              'Un exemple renforcent souvent un argument.',
              'Un exemple renforce souvent un arguments.',
            ],
            answer: 'argument',
            blockOptions: ['argument', 'arguments', 'arguent', 'argumente'],
            hint: 'Le nom reste ici au singulier.',
            explanation: 'L exemple renforce un argument pris isolément.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la formulation juste.',
            correct: 'La concession nuance le raisonnement sans l annuler.',
            wrongs: [
              'La concession nuance le raisonnement sans le annuler.',
              'La concession nuancent le raisonnement sans l annuler.',
              'La concession nuance le raisonnements sans l annuler.',
            ],
            answer: 'nuance',
            blockOptions: ['nuance', 'nuancent', 'annule', 'raisonnements'],
            hint: 'Le sujet est singulier.',
            explanation: 'Nuance s accorde avec concession, sujet singulier.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Le champ lexical éclaire la tonalité du passage.',
            wrongs: [
              'Le champ lexical éclaires la tonalité du passage.',
              'Le champ lexicale éclaire la tonalité du passage.',
              'Le champ lexical éclairer la tonalité du passage.',
            ],
            answer: 'éclaire',
            blockOptions: ['éclaire', 'éclaires', 'éclairer', 'éclairent'],
            hint: 'Le sujet est au singulier.',
            explanation: 'Le groupe sujet champ lexical commande éclaire.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'La reformulation clarifie une idée complexe.',
            wrongs: [
              'La reformulation clarifient une idée complexe.',
              'La reformulation clarifie une idées complexe.',
              'La reformulation clarifier une idée complexe.',
            ],
            answer: 'clarifie',
            blockOptions: ['clarifie', 'clarifient', 'clarifier', 'clarifiait'],
            hint: 'Le sujet est singulier.',
            explanation: 'Clarifie convient avec reformulation au présent.',
          }),
        ],
      },
      {
        title: 'Figures de style',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Cette métaphore rend l image plus frappante.',
            wrongs: [
              'Cette métaphore rendent l image plus frappante.',
              'Cette métaphore rend l image plus frappantes.',
              'Cette métaphore rendre l image plus frappante.',
            ],
            answer: 'métaphore',
            blockOptions: ['métaphore', 'comparaison', 'hyperbole', 'antithèse'],
            hint: 'Le procédé nommé transforme le sens par image.',
            explanation: 'Le terme juste ici est métaphore.',
            duelTrap: 'comparaison',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'L hyperbole exagère volontairement la réalité.',
            wrongs: [
              'L hyperbole exagèrent volontairement la réalité.',
              'L hyperbole exagère volontairement les réalité.',
              'L hyperbole exagérer volontairement la réalité.',
            ],
            answer: 'exagère',
            blockOptions: ['exagère', 'exagèrent', 'exagérer', 'atténue'],
            hint: 'L hyperbole amplifie.',
            explanation: 'Exagère correspond à la fonction de l hyperbole.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase juste.',
            correct: 'Une antithèse rapproche deux idées opposées.',
            wrongs: [
              'Une antithèse rapproche deux idée opposées.',
              'Une antithèse rapprochent deux idées opposées.',
              'Une antithèse rapprocher deux idées opposées.',
            ],
            answer: 'opposées',
            blockOptions: ['opposées', 'opposés', 'opposée', 'identiques'],
            hint: 'Le sens même de l antithèse repose sur l opposition.',
            explanation: 'On rapproche ici deux idées opposées.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'La comparaison met deux réalités en relation.',
            wrongs: [
              'La comparaison mets deux réalités en relation.',
              'La comparaison met deux réalités en relations.',
              'La comparaison mettre deux réalités en relation.',
            ],
            answer: 'met',
            blockOptions: ['met', 'mets', 'mettre', 'liait'],
            hint: 'Le verbe se conjugue avec comparaison.',
            explanation: 'La comparaison met en relation deux termes.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la formulation correcte.',
            correct: 'La personnification attribue un trait humain à un objet.',
            wrongs: [
              'La personnification attribuent un trait humain à un objet.',
              'La personnification attribue un traits humain à un objet.',
              'La personnification attribuer un trait humain à un objet.',
            ],
            answer: 'attribue',
            blockOptions: ['attribue', 'attribuent', 'attribuer', 'retranche'],
            hint: 'Le sujet est singulier.',
            explanation: 'Attribue convient pour définir la personnification.',
          }),
        ],
      },
      {
        title: 'Registres et tonalités',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Le registre tragique fait naître la pitié et la crainte.',
            wrongs: [
              'Le registre tragique font naître la pitié et la crainte.',
              'Le registre tragique fait naître les pitié et la crainte.',
              'Le registre tragique faire naître la pitié et la crainte.',
            ],
            answer: 'tragique',
            blockOptions: ['tragique', 'comique', 'lyrique', 'polémique'],
            hint: 'Le couple pitié et crainte est caractéristique.',
            explanation: 'Le registre évoqué ici est le tragique.',
            duelTrap: 'comique',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Le registre polémique cherche à combattre une position.',
            wrongs: [
              'Le registre polémique cherchent à combattre une position.',
              'Le registre polémique cherche à combattre des position.',
              'Le registre polémique chercher à combattre une position.',
            ],
            answer: 'polémique',
            blockOptions: ['polémique', 'pathétique', 'épique', 'didactique'],
            hint: 'Il s agit d un affrontement d idées.',
            explanation: 'Le registre polémique attaque et conteste.',
            duelTrap: 'pathétique',
          }),
          createSentenceCase({
            prompt: 'Choisissez la forme juste.',
            correct: 'La tonalité lyrique met en avant les émotions.',
            wrongs: [
              'La tonalité lyrique mettent en avant les émotions.',
              'La tonalité lyrique met en avant les émotion.',
              'La tonalité lyrique mettre en avant les émotions.',
            ],
            answer: 'lyrique',
            blockOptions: ['lyrique', 'satirique', 'tragique', 'ironique'],
            hint: 'On insiste ici sur l expression du moi.',
            explanation: 'Le lyrisme valorise les émotions et la subjectivité.',
            duelTrap: 'satirique',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Le registre didactique vise à instruire clairement.',
            wrongs: [
              'Le registre didactique visent à instruire clairement.',
              'Le registre didactique vise à instruire claires.',
              'Le registre didactique viser à instruire clairement.',
            ],
            answer: 'didactique',
            blockOptions: ['didactique', 'épique', 'tragique', 'comique'],
            hint: 'Le but est d expliquer et d enseigner.',
            explanation: 'Le registre didactique transmet un savoir.',
            duelTrap: 'épique',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Le comique de mots repose sur le jeu verbal.',
            wrongs: [
              'Le comique de mots reposent sur le jeu verbal.',
              'Le comique de mots repose sur les jeu verbal.',
              'Le comique de mots reposer sur le jeu verbal.',
            ],
            answer: 'repose',
            blockOptions: ['repose', 'reposent', 'reposer', 'retombe'],
            hint: 'Le sujet est singulier.',
            explanation: 'Le verbe se met au singulier avec comique.',
          }),
        ],
      },
      {
        title: 'Reformulation et précision du vocabulaire',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Reformuler permet de clarifier sans déformer.',
            wrongs: [
              'Reformuler permet de clarifier sans déformé.',
              'Reformuler permettent de clarifier sans déformer.',
              'Reformuler permet de clarifier sans déformes.',
            ],
            answer: 'clarifier',
            blockOptions: ['clarifier', 'clarifie', 'clarifient', 'déformer'],
            hint: 'Le verbe suit de après permet.',
            explanation: 'Après permet de, on emploie l infinitif clarifier.',
          }),
          createSentenceCase({
            prompt: 'Repérez la forme correcte.',
            correct: 'Une nuance pertinente évite les contresens.',
            wrongs: [
              'Une nuance pertinent évite les contresens.',
              'Une nuance pertinente évitent les contresens.',
              'Une nuance pertinente éviter les contresens.',
            ],
            answer: 'pertinente',
            blockOptions: ['pertinente', 'pertinent', 'pertinents', 'pertinentes'],
            hint: 'Nuance est féminin singulier.',
            explanation: 'Pertinente s accorde avec nuance, féminin singulier.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Le synonyme doit respecter le contexte.',
            wrongs: [
              'Le synonyme doivent respecter le contexte.',
              'Le synonyme doit respecté le contexte.',
              'Le synonyme doit respecte le contexte.',
            ],
            answer: 'respecter',
            blockOptions: ['respecter', 'respecté', 'respecte', 'respectaient'],
            hint: 'Après doit, on emploie l infinitif.',
            explanation: 'Le modal doit est suivi de l infinitif respecter.',
          }),
          createSentenceCase({
            prompt: 'Repérez la formulation correcte.',
            correct: 'Le mot précis réduit l ambiguïté.',
            wrongs: [
              'Le mot précise réduit l ambiguïté.',
              'Le mots précis réduit l ambiguïté.',
              'Le mot précis réduisent l ambiguïté.',
            ],
            answer: 'précis',
            blockOptions: ['précis', 'précise', 'précises', 'précisa'],
            hint: 'Le mot est masculin singulier.',
            explanation: 'Précis reste au masculin singulier avec mot.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la bonne phrase.',
            correct: 'La paraphrase reprend une idée autrement.',
            wrongs: [
              'La paraphrase reprennent une idée autrement.',
              'La paraphrase reprend une idée autrements.',
              'La paraphrase reprendre une idée autrement.',
            ],
            answer: 'reprend',
            blockOptions: ['reprend', 'reprennent', 'reprendre', 'repris'],
            hint: 'Le sujet est singulier.',
            explanation: 'Paraphrase commande la forme reprend.',
          }),
        ],
      },
      {
        title: 'Ponctuation et enchaînement logique',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Cependant, l auteur maintient sa réserve.',
            wrongs: [
              'Cependant l auteur maintient sa réserve.',
              'Cependant l auteur maintiennent sa réserve.',
              'Cependant, l auteur maintenir sa réserve.',
            ],
            answer: 'Cependant,',
            blockOptions: ['Cependant,', 'Pourtant,', 'Donc,', 'Car,'],
            hint: 'Le connecteur détaché en tête de phrase est suivi d une virgule.',
            explanation: 'La virgule isole ici le connecteur d opposition.',
            duelTrap: 'Donc,',
          }),
          createSentenceCase({
            prompt: 'Repérez la ponctuation correcte.',
            correct: 'Il observe, puis il conclut.',
            wrongs: [
              'Il observe puis il conclut.',
              'Il observe puis, il conclut.',
              'Il observe, puis il concluent.',
            ],
            answer: 'puis',
            blockOptions: ['puis', 'donc', 'car', 'mais'],
            hint: 'Le connecteur marque la succession.',
            explanation: 'Puis organise une progression chronologique.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'En effet, cette preuve renforce la thèse.',
            wrongs: [
              'En effet cette preuve renforce la thèse.',
              'En effet, cette preuve renforcent la thèse.',
              'En effet, cette preuve renforcer la thèse.',
            ],
            answer: 'En',
            blockOptions: ['En', 'Mais', 'Donc', 'Or'],
            hint: 'Le connecteur introduit une explication.',
            explanation: 'En effet annonce une justification ou une précision.',
            duelTrap: 'Donc',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase juste.',
            correct: 'D une part, le texte décrit ; d autre part, il juge.',
            wrongs: [
              'D une part le texte décrit ; d autre part, il juge.',
              'D une part, le texte décrit d autre part, il juge.',
              'D une part, le texte décrivent ; d autre part, il juge.',
            ],
            answer: 'part,',
            blockOptions: ['part,', 'part', 'juge', 'décrit'],
            hint: 'Les expressions corrélatives sont séparées par la ponctuation.',
            explanation: 'La virgule stabilise ici la structure d une part / d autre part.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la forme correcte.',
            correct: 'Ainsi, la conclusion répond à la question posée.',
            wrongs: [
              'Ainsi la conclusion répond à la question posée.',
              'Ainsi, la conclusion répondent à la question posée.',
              'Ainsi, la conclusion répondre à la question posée.',
            ],
            answer: 'Ainsi,',
            blockOptions: ['Ainsi,', 'Or,', 'Mais,', 'Puis,'],
            hint: 'Le connecteur introductif prend ici une virgule.',
            explanation: 'Ainsi marque la conséquence et s isole par la ponctuation.',
            duelTrap: 'Mais,',
          }),
        ],
      },
    ],
    exercises: [],
  },
  {
    subject: 'Français',
    number: 4,
    title: 'Méthodologie, commentaire et dissertation',
    quizItems: [
      {
        title: 'Annonce de la problématique',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la formulation correcte.',
            correct: 'La problématique transforme le sujet en question directrice.',
            wrongs: [
              'La problématique transforment le sujet en question directrice.',
              'La problématique transforme le sujet en questions directrice.',
              'La problématique transformer le sujet en question directrice.',
            ],
            answer: 'transforme',
            blockOptions: ['transforme', 'transforment', 'transformer', 'résume'],
            hint: 'Le sujet est singulier.',
            explanation: 'Le verbe s accorde avec problématique.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase juste.',
            correct: 'Une bonne problématique ouvre un vrai débat.',
            wrongs: [
              'Une bonne problématique ouvrent un vrai débat.',
              'Une bonne problématique ouvre un vrais débat.',
              'Une bonne problématique ouvrir un vrai débat.',
            ],
            answer: 'ouvre',
            blockOptions: ['ouvre', 'ouvrent', 'ouvrir', 'ferme'],
            hint: 'Il faut ici le verbe au présent singulier.',
            explanation: 'La problématique, sujet singulier, ouvre un débat.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la bonne phrase.',
            correct: 'La question doit rester précise et féconde.',
            wrongs: [
              'La question doivent rester précise et féconde.',
              'La question doit rester précis et féconde.',
              'La question doit resté précise et féconde.',
            ],
            answer: 'précise',
            blockOptions: ['précise', 'précis', 'précises', 'préciser'],
            hint: 'Question est féminin singulier.',
            explanation: 'Précise s accorde avec question, féminin singulier.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'La problématique évite la simple récitation du cours.',
            wrongs: [
              'La problématique évitent la simple récitation du cours.',
              'La problématique évite les simple récitation du cours.',
              'La problématique éviter la simple récitation du cours.',
            ],
            answer: 'évite',
            blockOptions: ['évite', 'évitent', 'éviter', 'élargit'],
            hint: 'Le sujet est singulier.',
            explanation: 'On écrit évite avec le sujet problématique au singulier.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la formulation correcte.',
            correct: 'Elle conduit le lecteur vers un enjeu littéraire.',
            wrongs: [
              'Elle conduisent le lecteur vers un enjeu littéraire.',
              'Elle conduit le lecteur vers une enjeu littéraire.',
              'Elle conduire le lecteur vers un enjeu littéraire.',
            ],
            answer: 'conduit',
            blockOptions: ['conduit', 'conduisent', 'conduire', 'guide'],
            hint: 'Le sujet pronominal est singulier.',
            explanation: 'Le verbe conduire prend ici la forme conduit.',
          }),
        ],
      },
      {
        title: 'Annonce du plan',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Le plan annonce deux axes équilibrés.',
            wrongs: [
              'Le plan annoncent deux axes équilibrés.',
              'Le plan annonce deux axe équilibrés.',
              'Le plan annoncer deux axes équilibrés.',
            ],
            answer: 'annonce',
            blockOptions: ['annonce', 'annoncent', 'annoncer', 'résume'],
            hint: 'Le sujet est singulier.',
            explanation: 'Le plan annonce, au singulier.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Chaque partie répond à la problématique.',
            wrongs: [
              'Chaque partie répondent à la problématique.',
              'Chaque parties répond à la problématique.',
              'Chaque partie répondre à la problématique.',
            ],
            answer: 'répond',
            blockOptions: ['répond', 'répondent', 'répondre', 'répondit'],
            hint: 'Chaque impose le singulier.',
            explanation: 'Le verbe reste au singulier après chaque.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la formulation correcte.',
            correct: 'La transition prépare le mouvement suivant.',
            wrongs: [
              'La transition préparent le mouvement suivant.',
              'La transition prépare les mouvement suivant.',
              'La transition préparer le mouvement suivant.',
            ],
            answer: 'prépare',
            blockOptions: ['prépare', 'préparent', 'préparer', 'précise'],
            hint: 'Le sujet transition est singulier.',
            explanation: 'Prépare s accorde avec transition.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase juste.',
            correct: 'Le développement progresse sans répétition.',
            wrongs: [
              'Le développement progressent sans répétition.',
              'Le développement progresse sans répétitions.',
              'Le développement progresser sans répétition.',
            ],
            answer: 'progresse',
            blockOptions: ['progresse', 'progressent', 'progresser', 'avance'],
            hint: 'Le sujet développement est singulier.',
            explanation: 'On emploie progresse avec le sujet singulier.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Une conclusion synthétique ferme le devoir.',
            wrongs: [
              'Une conclusion synthétique ferment le devoir.',
              'Une conclusion synthétique ferme les devoir.',
              'Une conclusion synthétique fermer le devoir.',
            ],
            answer: 'ferme',
            blockOptions: ['ferme', 'ferment', 'fermer', 'ouvre'],
            hint: 'Le sujet est conclusion.',
            explanation: 'Le verbe ferme se met au singulier ici.',
          }),
        ],
      },
      {
        title: 'Citation et analyse',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'La citation doit être commentée avec précision.',
            wrongs: [
              'La citation doivent être commentée avec précision.',
              'La citation doit être commenté avec précision.',
              'La citation doit être commentées avec précision.',
            ],
            answer: 'commentée',
            blockOptions: ['commentée', 'commenté', 'commentées', 'commenter'],
            hint: 'Le participe s accorde avec citation.',
            explanation: 'Commentée reprend citation, féminin singulier.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase juste.',
            correct: 'L analyse relie la preuve à l idée directrice.',
            wrongs: [
              'L analyse relient la preuve à l idée directrice.',
              'L analyse relie la preuves à l idée directrice.',
              'L analyse relier la preuve à l idée directrice.',
            ],
            answer: 'relie',
            blockOptions: ['relie', 'relient', 'relier', 'sépare'],
            hint: 'Le sujet analyse est singulier.',
            explanation: 'Le verbe relie s accorde avec analyse.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la formulation correcte.',
            correct: 'Le commentaire explicite les effets du texte.',
            wrongs: [
              'Le commentaire explicitent les effets du texte.',
              'Le commentaire explicite les effet du texte.',
              'Le commentaire expliciter les effets du texte.',
            ],
            answer: 'explicite',
            blockOptions: ['explicite', 'explicitent', 'expliciter', 'annule'],
            hint: 'Le sujet commentaire est singulier.',
            explanation: 'Le commentaire explicite les effets du passage.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Une remarque pertinente éclaire la citation.',
            wrongs: [
              'Une remarque pertinent éclaire la citation.',
              'Une remarque pertinente éclairent la citation.',
              'Une remarque pertinente éclairer la citation.',
            ],
            answer: 'pertinente',
            blockOptions: ['pertinente', 'pertinent', 'pertinentes', 'pertinents'],
            hint: 'Remarque est féminin singulier.',
            explanation: 'Pertinente s accorde avec remarque.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'La conclusion partielle prépare la suite du raisonnement.',
            wrongs: [
              'La conclusion partielle préparent la suite du raisonnement.',
              'La conclusion partielle prépare la suites du raisonnement.',
              'La conclusion partielle préparer la suite du raisonnement.',
            ],
            answer: 'prépare',
            blockOptions: ['prépare', 'préparent', 'préparer', 'reprend'],
            hint: 'Le sujet est au singulier.',
            explanation: 'La conclusion partielle prépare la suite argumentée.',
          }),
        ],
      },
      {
        title: 'Ouvertures et conclusions longues',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'La conclusion répond d abord au sujet.',
            wrongs: [
              'La conclusion répondent d abord au sujet.',
              'La conclusion répond d abord aux sujet.',
              'La conclusion répondre d abord au sujet.',
            ],
            answer: 'répond',
            blockOptions: ['répond', 'répondent', 'répondre', 'reprend'],
            hint: 'Le sujet est la conclusion.',
            explanation: 'Le verbe répond s accorde avec conclusion.',
          }),
          createSentenceCase({
            prompt: 'Repérez la formulation correcte.',
            correct: 'Elle récapitule ensuite les acquis du devoir.',
            wrongs: [
              'Elle récapitulent ensuite les acquis du devoir.',
              'Elle récapitule ensuite les acquis du devoirs.',
              'Elle récapituler ensuite les acquis du devoir.',
            ],
            answer: 'récapitule',
            blockOptions: ['récapitule', 'récapitulent', 'récapituler', 'oublie'],
            hint: 'Le pronom elle appelle le singulier.',
            explanation: 'La conclusion récapitule les résultats obtenus.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Enfin, elle ouvre une perspective pertinente.',
            wrongs: [
              'Enfin elle ouvre une perspective pertinente.',
              'Enfin, elle ouvrent une perspective pertinente.',
              'Enfin, elle ouvrir une perspective pertinente.',
            ],
            answer: 'Enfin,',
            blockOptions: ['Enfin,', 'Car,', 'Donc,', 'Mais,'],
            hint: 'Le connecteur conclusif s isole par une virgule.',
            explanation: 'Enfin marque ici la dernière étape de la conclusion.',
            duelTrap: 'Donc,',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'L ouverture prolonge sans détourner le sujet.',
            wrongs: [
              'L ouverture prolongent sans détourner le sujet.',
              'L ouverture prolonge sans détourner les sujet.',
              'L ouverture prolonger sans détourner le sujet.',
            ],
            answer: 'prolonge',
            blockOptions: ['prolonge', 'prolongent', 'prolonger', 'interrompt'],
            hint: 'Le sujet ouverture est singulier.',
            explanation: 'On attend un prolongement, non une rupture complète.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la bonne phrase.',
            correct: 'Une conclusion forte reste sobre et nette.',
            wrongs: [
              'Une conclusion forte restent sobre et nette.',
              'Une conclusion forte reste sobres et nette.',
              'Une conclusion forte rester sobre et nette.',
            ],
            answer: 'reste',
            blockOptions: ['reste', 'restent', 'rester', 'paraît'],
            hint: 'Le sujet est singulier.',
            explanation: 'Reste s accorde avec conclusion au singulier.',
          }),
        ],
      },
      {
        title: 'Transitions de dissertation',
        cases: [
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'Cette transition relance le débat sans rupture brutale.',
            wrongs: [
              'Cette transition relancent le débat sans rupture brutale.',
              'Cette transition relance le débat sans ruptures brutale.',
              'Cette transition relancer le débat sans rupture brutale.',
            ],
            answer: 'relance',
            blockOptions: ['relance', 'relancent', 'relancer', 'annule'],
            hint: 'Le sujet transition est singulier.',
            explanation: 'La transition relance la réflexion entre deux axes.',
          }),
          createSentenceCase({
            prompt: 'Repérez la forme correcte.',
            correct: 'Elle résume le point acquis avant de nuancer.',
            wrongs: [
              'Elle résument le point acquis avant de nuancer.',
              'Elle résume le point acquis avant de nuancés.',
              'Elle résumer le point acquis avant de nuancer.',
            ],
            answer: 'résume',
            blockOptions: ['résume', 'résument', 'résumer', 'annonce'],
            hint: 'Le pronom elle reste singulier.',
            explanation: 'Résume convient avec le sujet elle.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la phrase correcte.',
            correct: 'La transition ménage une progression lisible.',
            wrongs: [
              'La transition ménagent une progression lisible.',
              'La transition ménage des progression lisible.',
              'La transition ménager une progression lisible.',
            ],
            answer: 'ménage',
            blockOptions: ['ménage', 'ménagent', 'ménager', 'brise'],
            hint: 'Le sujet est singulier.',
            explanation: 'La transition ménage la cohérence du devoir.',
          }),
          createSentenceCase({
            prompt: 'Repérez la phrase correcte.',
            correct: 'Le lien logique prépare l argument suivant.',
            wrongs: [
              'Le lien logique préparent l argument suivant.',
              'Le lien logique prépare les argument suivant.',
              'Le lien logique préparer l argument suivant.',
            ],
            answer: 'prépare',
            blockOptions: ['prépare', 'préparent', 'préparer', 'supprime'],
            hint: 'Lien logique est singulier.',
            explanation: 'Le lien logique prépare le mouvement suivant.',
          }),
          createSentenceCase({
            prompt: 'Choisissez la bonne phrase.',
            correct: 'La nuance évite un raisonnement trop rigide.',
            wrongs: [
              'La nuance évitent un raisonnement trop rigide.',
              'La nuance évite un raisonnements trop rigide.',
              'La nuance éviter un raisonnement trop rigide.',
            ],
            answer: 'évite',
            blockOptions: ['évite', 'évitent', 'éviter', 'renforce'],
            hint: 'Le sujet est singulier.',
            explanation: 'La nuance permet d éviter la rigidité argumentative.',
          }),
        ],
      },
    ],
    exercises: [],
  },
];

const ENGLISH_QUIZ_CHAPTERS = [
  {
    subject: 'Anglais',
    number: 1,
    title: 'Foundations and everyday grammar',
    quizItems: [
      {
        title: 'Plural forms and determiners',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'These children carry heavy bags.',
            wrongs: [
              'These childs carry heavy bags.',
              'This children carry heavy bags.',
              'These children carries heavy bags.',
            ],
            answer: 'children',
            blockOptions: ['children', 'childs', 'child', 'childes'],
            hint: 'The noun has an irregular plural form.',
            explanation: 'Child becomes children in the plural.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Those boxes are ready now.',
            wrongs: [
              'Those boxs are ready now.',
              'That boxes are ready now.',
              'Those boxes is ready now.',
            ],
            answer: 'boxes',
            blockOptions: ['boxes', 'boxs', 'boxeses', 'box'],
            hint: 'The noun ends with x.',
            explanation: 'Box takes es in the plural: boxes.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct form.',
            correct: 'Many cities face the same problem.',
            wrongs: [
              'Many citys face the same problem.',
              'Much cities face the same problem.',
              'Many cities faces the same problem.',
            ],
            answer: 'cities',
            blockOptions: ['cities', 'citys', 'city', 'citis'],
            hint: 'The noun ends with consonant plus y.',
            explanation: 'City changes y to ies in the plural.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Several women lead the project.',
            wrongs: [
              'Several womans lead the project.',
              'Several women leads the project.',
              'Several woman lead the project.',
            ],
            answer: 'women',
            blockOptions: ['women', 'womans', 'woman', 'womens'],
            hint: 'The plural of woman is irregular.',
            explanation: 'Woman becomes women in the plural.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'Few buses stop here at night.',
            wrongs: [
              'Few bus stop here at night.',
              'Few busses stop here at night.',
              'Few buses stops here at night.',
            ],
            answer: 'buses',
            blockOptions: ['buses', 'busses', 'bus', 'buses'],
            hint: 'The noun ends with s.',
            explanation: 'Bus usually forms its plural with es: buses.',
          }),
        ],
      },
      {
        title: 'Articles and basic noun phrases',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'She bought an honest guide.',
            wrongs: [
              'She bought a honest guide.',
              'She bought an honesty guide.',
              'She bought an honest guides.',
            ],
            answer: 'an',
            blockOptions: ['an', 'a', 'the', 'some'],
            hint: 'Honest starts with a silent h sound.',
            explanation: 'We use an before a vowel sound, including honest.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'The sun was already low.',
            wrongs: [
              'A sun was already low.',
              'An sun was already low.',
              'The sun were already low.',
            ],
            answer: 'The',
            blockOptions: ['The', 'A', 'An', 'Some'],
            hint: 'There is only one sun in this context.',
            explanation: 'We use the for unique referents like the sun.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct form.',
            correct: 'He needs a useful notebook.',
            wrongs: [
              'He needs an useful notebook.',
              'He needs the useful notebook.',
              'He needs a useful notebooks.',
            ],
            answer: 'a',
            blockOptions: ['a', 'an', 'the', 'some'],
            hint: 'Useful begins with a consonant sound.',
            explanation: 'Useful starts with /j/, so the correct article is a.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'They found the answer quickly.',
            wrongs: [
              'They found an answer quickly.',
              'They found the answers quickly.',
              'They found the answer quick.',
            ],
            answer: 'the',
            blockOptions: ['the', 'a', 'an', 'some'],
            hint: 'The answer is specific and already identified.',
            explanation: 'The marks a precise known answer.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'I need some water now.',
            wrongs: [
              'I need a water now.',
              'I need an water now.',
              'I need some waters now.',
            ],
            answer: 'some',
            blockOptions: ['some', 'a', 'an', 'the'],
            hint: 'Water is uncountable here.',
            explanation: 'Some is appropriate with an unspecified amount of water.',
          }),
        ],
      },
      {
        title: 'Present simple and present continuous',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'She is reading a long article now.',
            wrongs: [
              'She reads a long article now.',
              'She is read a long article now.',
              'She are reading a long article now.',
            ],
            answer: 'is',
            blockOptions: ['is', 'are', 'reads', 'read'],
            hint: 'The action is in progress now.',
            explanation: 'Present continuous fits an action happening at the moment.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct form.',
            correct: 'They usually walk to school.',
            wrongs: [
              'They are usually walking to school.',
              'They usually walks to school.',
              'They usually walks to school.',
            ],
            answer: 'walk',
            blockOptions: ['walk', 'walks', 'walking', 'are walking'],
            hint: 'Usually points to a habit.',
            explanation: 'Present simple is used for habits.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'My brother plays the guitar every evening.',
            wrongs: [
              'My brother play the guitar every evening.',
              'My brother is playing the guitar every evening.',
              'My brother plays the guitars every evening.',
            ],
            answer: 'plays',
            blockOptions: ['plays', 'play', 'is playing', 'played'],
            hint: 'Every evening marks a repeated action.',
            explanation: 'With a habitual action and a third person singular subject, we use plays.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'We are waiting for the teacher.',
            wrongs: [
              'We wait for the teacher.',
              'We is waiting for the teacher.',
              'We are wait for the teacher.',
            ],
            answer: 'are',
            blockOptions: ['are', 'is', 'wait', 'waiting'],
            hint: 'The action is happening now.',
            explanation: 'We use are waiting for a temporary action in progress.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The train leaves at six every day.',
            wrongs: [
              'The train is leaving at six every day.',
              'The train leave at six every day.',
              'The train leaving at six every day.',
            ],
            answer: 'leaves',
            blockOptions: ['leaves', 'leave', 'is leaving', 'leaving'],
            hint: 'Timetables often use the present simple.',
            explanation: 'Official schedules commonly take the present simple.',
          }),
        ],
      },
      {
        title: 'Past simple and past participles',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'She wrote the summary yesterday.',
            wrongs: [
              'She writed the summary yesterday.',
              'She has wrote the summary yesterday.',
              'She write the summary yesterday.',
            ],
            answer: 'wrote',
            blockOptions: ['wrote', 'written', 'writed', 'write'],
            hint: 'Yesterday calls for the past simple.',
            explanation: 'Write has the irregular past form wrote.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'They have chosen the best option.',
            wrongs: [
              'They have chose the best option.',
              'They has chosen the best option.',
              'They have choosing the best option.',
            ],
            answer: 'chosen',
            blockOptions: ['chosen', 'chose', 'choose', 'choosing'],
            hint: 'Have must be followed by a past participle.',
            explanation: 'Chosen is the past participle of choose.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct form.',
            correct: 'He drove home after the meeting.',
            wrongs: [
              'He drived home after the meeting.',
              'He has drove home after the meeting.',
              'He drive home after the meeting.',
            ],
            answer: 'drove',
            blockOptions: ['drove', 'driven', 'drived', 'drive'],
            hint: 'After the meeting sets a finished past context.',
            explanation: 'The past simple of drive is drove.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'We have kept the original plan.',
            wrongs: [
              'We have keeped the original plan.',
              'We has kept the original plan.',
              'We have keep the original plan.',
            ],
            answer: 'kept',
            blockOptions: ['kept', 'keep', 'keeped', 'keeping'],
            hint: 'Present perfect requires the past participle.',
            explanation: 'Keep has the irregular participle kept.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The class began at eight.',
            wrongs: [
              'The class begun at eight.',
              'The class begins at eight yesterday.',
              'The class begin at eight.',
            ],
            answer: 'began',
            blockOptions: ['began', 'begun', 'begin', 'begins'],
            hint: 'A finished event in the past needs the past simple.',
            explanation: 'Begin becomes began in the past simple.',
          }),
        ],
      },
      {
        title: 'Modal verbs and obligation',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'You must submit the file today.',
            wrongs: [
              'You must to submit the file today.',
              'You must submits the file today.',
              'You are must submit the file today.',
            ],
            answer: 'must',
            blockOptions: ['must', 'have', 'should', 'can'],
            hint: 'This expresses strong obligation.',
            explanation: 'Must is followed by the base verb without to.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'She can solve the puzzle alone.',
            wrongs: [
              'She cans solve the puzzle alone.',
              'She can to solve the puzzle alone.',
              'She is can solve the puzzle alone.',
            ],
            answer: 'can',
            blockOptions: ['can', 'could', 'must', 'should'],
            hint: 'The sentence expresses ability.',
            explanation: 'Can is the basic modal for ability in the present.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'They should revise before the test.',
            wrongs: [
              'They should to revise before the test.',
              'They should revises before the test.',
              'They should revised before the test.',
            ],
            answer: 'should',
            blockOptions: ['should', 'must', 'can', 'might'],
            hint: 'The sentence gives advice.',
            explanation: 'Should expresses recommendation and takes the base verb.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct form.',
            correct: 'He might arrive later.',
            wrongs: [
              'He might arrives later.',
              'He might to arrive later.',
              'He may arriving later.',
            ],
            answer: 'might',
            blockOptions: ['might', 'must', 'should', 'can'],
            hint: 'The speaker is uncertain.',
            explanation: 'Might signals a weak possibility.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'We have to leave now.',
            wrongs: [
              'We have leave now.',
              'We has to leave now.',
              'We have to leaving now.',
            ],
            answer: 'have',
            blockOptions: ['have', 'has', 'must', 'had'],
            hint: 'The subject is we.',
            explanation: 'With we, the expression of obligation is have to.',
          }),
        ],
      },
    ],
    exercises: [],
  },
  {
    subject: 'Anglais',
    number: 2,
    title: 'Sentence building and advanced grammar',
    quizItems: [
      {
        title: 'Prepositions and place',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The keys are on the table.',
            wrongs: [
              'The keys are in the table.',
              'The keys is on the table.',
              'The keys are at the table top.',
            ],
            answer: 'on',
            blockOptions: ['on', 'in', 'at', 'under'],
            hint: 'The keys are resting on a surface.',
            explanation: 'On is the correct preposition for a surface.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'She arrived at the station early.',
            wrongs: [
              'She arrived to the station early.',
              'She arrived in the station early.',
              'She arrive at the station early.',
            ],
            answer: 'at',
            blockOptions: ['at', 'to', 'in', 'on'],
            hint: 'Arrive usually takes at for a specific point.',
            explanation: 'We say arrive at the station.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'They walked through the tunnel.',
            wrongs: [
              'They walked across the tunnel.',
              'They walked in the tunnelled.',
              'They walks through the tunnel.',
            ],
            answer: 'through',
            blockOptions: ['through', 'across', 'inside', 'over'],
            hint: 'They moved from one side to the other inside it.',
            explanation: 'Through expresses movement inside and across a space.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'We stayed in the library all morning.',
            wrongs: [
              'We stayed at the library all morning.',
              'We stayed on the library all morning.',
              'We stay in the library all morning yesterday.',
            ],
            answer: 'in',
            blockOptions: ['in', 'at', 'on', 'into'],
            hint: 'The idea is being inside the building.',
            explanation: 'In is used for an enclosed place.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The poster hangs above the desk.',
            wrongs: [
              'The poster hangs over the desk surface.',
              'The poster hang above the desk.',
              'The poster hangs on above the desk.',
            ],
            answer: 'above',
            blockOptions: ['above', 'below', 'between', 'behind'],
            hint: 'The poster is higher than the desk.',
            explanation: 'Above indicates a higher position without contact.',
          }),
        ],
      },
      {
        title: 'Relative clauses',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The woman who called me is my aunt.',
            wrongs: [
              'The woman which called me is my aunt.',
              'The woman who called me are my aunt.',
              'The woman whom called me is my aunt.',
            ],
            answer: 'who',
            blockOptions: ['who', 'which', 'whom', 'whose'],
            hint: 'The relative pronoun refers to a person as the subject.',
            explanation: 'Who is used for a person acting as the subject of the clause.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'The film that we watched was moving.',
            wrongs: [
              'The film who we watched was moving.',
              'The film that we watched were moving.',
              'The film that we watch was moving yesterday.',
            ],
            answer: 'that',
            blockOptions: ['that', 'who', 'where', 'whose'],
            hint: 'The pronoun refers to a thing used as object.',
            explanation: 'That can introduce a defining clause about a thing.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The town where she grew up has changed.',
            wrongs: [
              'The town which she grew up has changed.',
              'The town where she grow up has changed.',
              'The town where she grew up have changed.',
            ],
            answer: 'where',
            blockOptions: ['where', 'which', 'who', 'whose'],
            hint: 'The clause refers to a place.',
            explanation: 'Where is the natural relative marker for place.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'The student whose project won smiled.',
            wrongs: [
              'The student who project won smiled.',
              'The student whose project won smiled broadly.',
              'The student whose project win smiled.',
            ],
            answer: 'whose',
            blockOptions: ['whose', 'who', 'which', 'that'],
            hint: 'The clause expresses possession.',
            explanation: 'Whose shows possession inside the relative clause.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The reason why he left remains unclear.',
            wrongs: [
              'The reason where he left remains unclear.',
              'The reason why he leave remains unclear.',
              'The reason why he left remain unclear.',
            ],
            answer: 'why',
            blockOptions: ['why', 'where', 'that', 'whose'],
            hint: 'The noun reason usually pairs with why.',
            explanation: 'Why introduces the clause explaining reason.',
          }),
        ],
      },
      {
        title: 'Conditionals',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'If you study, you will improve.',
            wrongs: [
              'If you will study, you improve.',
              'If you studied, you will improve.',
              'If you study, you would improve yesterday.',
            ],
            answer: 'will',
            blockOptions: ['will', 'would', 'study', 'studied'],
            hint: 'This is a first conditional.',
            explanation: 'The main clause of a first conditional takes will.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'If I had more time, I would read more.',
            wrongs: [
              'If I have more time, I would read more.',
              'If I had more time, I will read more.',
              'If I had more time, I would reads more.',
            ],
            answer: 'would',
            blockOptions: ['would', 'will', 'had', 'have'],
            hint: 'This is a second conditional.',
            explanation: 'Second conditionals combine past simple with would.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'If they had listened, they would have understood.',
            wrongs: [
              'If they listened, they would have understood.',
              'If they had listened, they would understood.',
              'If they had listened, they will have understood.',
            ],
            answer: 'understood',
            blockOptions: ['understood', 'understand', 'understands', 'understanding'],
            hint: 'The structure is third conditional.',
            explanation: 'Would have plus past participle is needed here.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'Unless you hurry, you will miss the bus.',
            wrongs: [
              'Unless you will hurry, you miss the bus.',
              'Unless you hurry, you would miss the bus.',
              'Unless you hurried, you will miss the bus.',
            ],
            answer: 'Unless',
            blockOptions: ['Unless', 'If', 'Because', 'Although'],
            hint: 'The idea is negative condition.',
            explanation: 'Unless means if not and matches the sentence meaning.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct form.',
            correct: 'If he calls, tell me immediately.',
            wrongs: [
              'If he will call, tell me immediately.',
              'If he called, tell me immediately tomorrow.',
              'If he calls, tells me immediately.',
            ],
            answer: 'calls',
            blockOptions: ['calls', 'will call', 'called', 'calling'],
            hint: 'The if clause stays in the present for a real future condition.',
            explanation: 'First conditional if clauses take the present simple.',
          }),
        ],
      },
      {
        title: 'Reported speech',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'She said that she was tired.',
            wrongs: [
              'She said that she is tired.',
              'She said she was tire.',
              'She says that she was tired yesterday.',
            ],
            answer: 'was',
            blockOptions: ['was', 'is', 'were', 'be'],
            hint: 'The tense usually shifts back after a past reporting verb.',
            explanation: 'Reported speech commonly changes am/is to was after said.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'He told me that he had finished.',
            wrongs: [
              'He told me that he has finished.',
              'He told me that he had finish.',
              'He told me he finished before then.',
            ],
            answer: 'had',
            blockOptions: ['had', 'has', 'have', 'was'],
            hint: 'The original statement was in the present perfect.',
            explanation: 'Present perfect often backshifts to past perfect in reported speech.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'They asked whether I could stay.',
            wrongs: [
              'They asked whether could I stay.',
              'They asked that I could stay.',
              'They asked whether I can stay.',
            ],
            answer: 'whether',
            blockOptions: ['whether', 'that', 'if', 'because'],
            hint: 'This is a reported yes or no question.',
            explanation: 'Whether is appropriate in an indirect yes or no question.',
            duelTrap: 'that',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'She explained that the train had left.',
            wrongs: [
              'She explained that the train has left.',
              'She explained the train had leave.',
              'She explained that the train had lefted.',
            ],
            answer: 'had',
            blockOptions: ['had', 'has', 'have', 'left'],
            hint: 'The action happened before the explanation.',
            explanation: 'Past perfect is suitable for an earlier action in reported speech.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'He promised that he would help.',
            wrongs: [
              'He promised that he will help.',
              'He promised that he would helps.',
              'He promised he would helped.',
            ],
            answer: 'would',
            blockOptions: ['would', 'will', 'can', 'should'],
            hint: 'Future in direct speech often becomes would.',
            explanation: 'Would is the expected backshift from will.',
          }),
        ],
      },
      {
        title: 'Passive voice',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The report was written yesterday.',
            wrongs: [
              'The report wrote yesterday.',
              'The report was wrote yesterday.',
              'The report were written yesterday.',
            ],
            answer: 'written',
            blockOptions: ['written', 'wrote', 'write', 'writing'],
            hint: 'A passive form needs be plus past participle.',
            explanation: 'Written is the past participle needed after was.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'New solutions are discussed every week.',
            wrongs: [
              'New solutions discuss every week.',
              'New solutions is discussed every week.',
              'New solutions are discuss every week.',
            ],
            answer: 'are',
            blockOptions: ['are', 'is', 'be', 'were'],
            hint: 'The subject is plural.',
            explanation: 'Plural subject plus passive present gives are discussed.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The speech will be recorded.',
            wrongs: [
              'The speech will recorded.',
              'The speech will be record.',
              'The speech would be recorded yesterday.',
            ],
            answer: 'be',
            blockOptions: ['be', 'been', 'being', 'was'],
            hint: 'Future passive uses will be plus participle.',
            explanation: 'The auxiliary be is required after will.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'Their work has been praised.',
            wrongs: [
              'Their work has praised.',
              'Their work have been praised.',
              'Their work has been praise.',
            ],
            answer: 'been',
            blockOptions: ['been', 'be', 'being', 'was'],
            hint: 'Present perfect passive uses has been plus participle.',
            explanation: 'Been is required in the passive perfect form.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The doors were closed at noon.',
            wrongs: [
              'The doors was closed at noon.',
              'The doors were close at noon.',
              'The doors closed at noon by someone.',
            ],
            answer: 'were',
            blockOptions: ['were', 'was', 'are', 'be'],
            hint: 'The subject is plural and the action is in the past.',
            explanation: 'Plural past passive takes were closed.',
          }),
        ],
      },
    ],
    exercises: [],
  },
  {
    subject: 'Anglais',
    number: 3,
    title: 'Reading, vocabulary and interpretation',
    quizItems: [
      {
        title: 'Vocabulary in context',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The author suggests a gradual change.',
            wrongs: [
              'The author suggest a gradual change.',
              'The author suggests an gradual change.',
              'The author suggesteds a gradual change.',
            ],
            answer: 'gradual',
            blockOptions: ['gradual', 'sudden', 'careless', 'empty'],
            hint: 'The word means slow and progressive.',
            explanation: 'Gradual matches the idea of slow development.',
            duelTrap: 'sudden',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'Her tone remains cautious.',
            wrongs: [
              'Her tone remain cautious.',
              'Her tone remains caution.',
              'Her tone remaineds cautious.',
            ],
            answer: 'cautious',
            blockOptions: ['cautious', 'reckless', 'loud', 'carelessly'],
            hint: 'The word describes a careful attitude.',
            explanation: 'Cautious is the adjective that fits the tone.',
            duelTrap: 'reckless',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The witness gives a vivid description.',
            wrongs: [
              'The witness give a vivid description.',
              'The witness gives a vividly description.',
              'The witness gives a vivid descriptions.',
            ],
            answer: 'vivid',
            blockOptions: ['vivid', 'vaguely', 'vague', 'dry'],
            hint: 'The adjective means lively and detailed.',
            explanation: 'Vivid properly modifies description.',
            duelTrap: 'vague',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'The conclusion seems convincing.',
            wrongs: [
              'The conclusion seem convincing.',
              'The conclusion seems convince.',
              'The conclusion seems convincingly.',
            ],
            answer: 'convincing',
            blockOptions: ['convincing', 'confusing', 'convince', 'convincedly'],
            hint: 'The adjective evaluates the conclusion.',
            explanation: 'Convincing is the appropriate descriptive adjective.',
            duelTrap: 'confusing',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The article highlights a crucial issue.',
            wrongs: [
              'The article highlight a crucial issue.',
              'The article highlights a crucial issues.',
              'The article highlights a crucially issue.',
            ],
            answer: 'crucial',
            blockOptions: ['crucial', 'minor', 'crucially', 'secondary'],
            hint: 'The word means very important.',
            explanation: 'Crucial is the adjective that conveys importance.',
            duelTrap: 'minor',
          }),
        ],
      },
      {
        title: 'Inference and tone',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The speaker sounds ironic, not naïve.',
            wrongs: [
              'The speaker sound ironic, not naïve.',
              'The speaker sounds irony, not naïve.',
              'The speaker sounds ironic, not naïves.',
            ],
            answer: 'ironic',
            blockOptions: ['ironic', 'naïve', 'enthusiastic', 'flat'],
            hint: 'The tone includes distance and implied criticism.',
            explanation: 'Ironic best captures that indirect critical tone.',
            duelTrap: 'naïve',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'His reply feels defensive.',
            wrongs: [
              'His reply feel defensive.',
              'His reply feels defend.',
              'His reply feels defensively.',
            ],
            answer: 'defensive',
            blockOptions: ['defensive', 'open', 'aggressive', 'defend'],
            hint: 'The reply protects itself against criticism.',
            explanation: 'Defensive is the most accurate interpretation.',
            duelTrap: 'open',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The narrator appears uncertain.',
            wrongs: [
              'The narrator appear uncertain.',
              'The narrator appears uncertainty.',
              'The narrator appears certainly.',
            ],
            answer: 'uncertain',
            blockOptions: ['uncertain', 'certain', 'certainty', 'clearly'],
            hint: 'The narrator does not fully know what to think.',
            explanation: 'Uncertain matches hesitation and doubt.',
            duelTrap: 'certain',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'The mood becomes tense near the end.',
            wrongs: [
              'The mood become tense near the end.',
              'The mood becomes tension near the end.',
              'The mood becomes tensely near the end.',
            ],
            answer: 'tense',
            blockOptions: ['tense', 'calm', 'comic', 'tensefully'],
            hint: 'The emotional pressure rises.',
            explanation: 'Tense is the adjective that fits the mood shift.',
            duelTrap: 'calm',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The writer remains critical throughout.',
            wrongs: [
              'The writer remain critical throughout.',
              'The writer remains critic throughout.',
              'The writer remains critically throughout.',
            ],
            answer: 'critical',
            blockOptions: ['critical', 'supportive', 'neutral', 'critic'],
            hint: 'The writer keeps judging the subject negatively.',
            explanation: 'Critical captures that sustained evaluative stance.',
            duelTrap: 'supportive',
          }),
        ],
      },
      {
        title: 'Connectors and argument building',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'However, the second argument is stronger.',
            wrongs: [
              'However the second argument is stronger.',
              'However, the second argument are stronger.',
              'However, the second argument stronger.',
            ],
            answer: 'However,',
            blockOptions: ['However,', 'Therefore,', 'Because', 'Finally,'],
            hint: 'The connector marks contrast.',
            explanation: 'However introduces an opposition or contrast.',
            duelTrap: 'Therefore,',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'Therefore, the evidence supports the claim.',
            wrongs: [
              'Therefore the evidence supports the claim.',
              'Therefore, the evidence support the claim.',
              'Therefore, the evidence supports the claims strongly.',
            ],
            answer: 'Therefore,',
            blockOptions: ['Therefore,', 'However,', 'Although', 'Meanwhile,'],
            hint: 'The connector signals consequence.',
            explanation: 'Therefore links premises to a logical conclusion.',
            duelTrap: 'However,',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Moreover, the data confirm the trend.',
            wrongs: [
              'Moreover the data confirm the trend.',
              'Moreover, the data confirms the trend.',
              'Moreover, the data confirm the trends.',
            ],
            answer: 'Moreover,',
            blockOptions: ['Moreover,', 'Instead,', 'Although', 'Suddenly,'],
            hint: 'The connector adds another argument.',
            explanation: 'Moreover introduces additional support.',
            duelTrap: 'Instead,',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'In contrast, the final example weakens the point.',
            wrongs: [
              'In contrast the final example weakens the point.',
              'In contrast, the final example weaken the point.',
              'In contrast, the final examples weakens the point.',
            ],
            answer: 'In',
            blockOptions: ['In', 'For', 'As', 'By'],
            hint: 'The connector is a fixed contrasting phrase.',
            explanation: 'In contrast introduces a clear opposition.',
            duelTrap: 'For',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'As a result, the audience changed its view.',
            wrongs: [
              'As a result the audience changed its view.',
              'As a result, the audience change its view.',
              'As a result, the audience changed their views.',
            ],
            answer: 'result,',
            blockOptions: ['result,', 'contrast,', 'however,', 'reason,'],
            hint: 'The connector expresses consequence.',
            explanation: 'As a result is the correct fixed expression.',
          }),
        ],
      },
      {
        title: 'Error correction',
        cases: [
          createSentenceCase({
            prompt: 'Choose the corrected sentence.',
            correct: 'She does not agree with them.',
            wrongs: [
              'She do not agree with them.',
              'She does not agrees with them.',
              'She does not agree to them.',
            ],
            answer: 'does',
            blockOptions: ['does', 'do', 'did', 'is'],
            hint: 'Third person singular negative uses does not.',
            explanation: 'With she in the present simple negative, we use does not.',
          }),
          createSentenceCase({
            prompt: 'Pick the corrected sentence.',
            correct: 'They were waiting outside.',
            wrongs: [
              'They was waiting outside.',
              'They were wait outside.',
              'They waiting outside.',
            ],
            answer: 'were',
            blockOptions: ['were', 'was', 'are', 'be'],
            hint: 'The subject is plural.',
            explanation: 'Plural past continuous takes were waiting.',
          }),
          createSentenceCase({
            prompt: 'Choose the corrected sentence.',
            correct: 'I have never seen that film.',
            wrongs: [
              'I never have seen that film.',
              'I have never saw that film.',
              'I has never seen that film.',
            ],
            answer: 'seen',
            blockOptions: ['seen', 'saw', 'see', 'seeing'],
            hint: 'Present perfect needs the past participle.',
            explanation: 'Seen is the past participle of see.',
          }),
          createSentenceCase({
            prompt: 'Pick the corrected sentence.',
            correct: 'He explained the idea clearly.',
            wrongs: [
              'He explained clearly the idea.',
              'He explain the idea clearly.',
              'He explained the idea clear.',
            ],
            answer: 'clearly',
            blockOptions: ['clearly', 'clear', 'clearer', 'clarity'],
            hint: 'The sentence needs an adverb.',
            explanation: 'Clearly modifies the verb explained.',
          }),
          createSentenceCase({
            prompt: 'Choose the corrected sentence.',
            correct: 'We discussed the problem yesterday.',
            wrongs: [
              'We discussed about the problem yesterday.',
              'We discuss the problem yesterday.',
              'We discussed the problems yesterdayly.',
            ],
            answer: 'discussed',
            blockOptions: ['discussed', 'discuss', 'discussing', 'discusses'],
            hint: 'Yesterday signals the past simple.',
            explanation: 'Discuss does not take about here, and the tense is past simple.',
          }),
        ],
      },
      {
        title: 'Summary and reformulation',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'A summary keeps the main ideas only.',
            wrongs: [
              'A summary keep the main ideas only.',
              'A summary keeps only the mains ideas.',
              'A summary keeping the main ideas only.',
            ],
            answer: 'keeps',
            blockOptions: ['keeps', 'keep', 'keeping', 'kept'],
            hint: 'The subject is singular.',
            explanation: 'Summary is singular, so we use keeps.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'Paraphrasing changes the wording but not the meaning.',
            wrongs: [
              'Paraphrasing change the wording but not the meaning.',
              'Paraphrasing changes the wordings but not the meaning.',
              'Paraphrasing changed the wording but not the mean.',
            ],
            answer: 'meaning',
            blockOptions: ['meaning', 'wording', 'mean', 'message'],
            hint: 'Paraphrasing preserves the original sense.',
            explanation: 'The key point is that the meaning stays the same.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'A concise answer avoids repetition.',
            wrongs: [
              'A concise answer avoids repetition.',
              'A concise answer avoids repetitions everywhere.',
              'A concise answer avoiding repetition.',
            ],
            answer: 'avoids',
            blockOptions: ['avoids', 'avoid', 'avoiding', 'avoided'],
            hint: 'The subject is singular.',
            explanation: 'The verb must agree with answer: avoids.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'The rewritten sentence sounds clearer.',
            wrongs: [
              'The rewritten sentence sound clearer.',
              'The rewritten sentence sounds clearly.',
              'The rewritten sentences sounds clearer.',
            ],
            answer: 'clearer',
            blockOptions: ['clearer', 'clearly', 'clear', 'more clear'],
            hint: 'The sentence compares two versions.',
            explanation: 'Clearer is the comparative adjective needed here.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The new wording remains faithful to the source.',
            wrongs: [
              'The new wording remain faithful to the source.',
              'The new wording remains faith to the source.',
              'The new wording remained faithful to the source now.',
            ],
            answer: 'faithful',
            blockOptions: ['faithful', 'faith', 'loyal', 'faithfully'],
            hint: 'The adjective qualifies wording.',
            explanation: 'Faithful is the right adjective in this context.',
          }),
        ],
      },
    ],
    exercises: [],
  },
  {
    subject: 'Anglais',
    number: 4,
    title: 'Writing, essays and exam method',
    quizItems: [
      {
        title: 'Formal email building',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Dear Sir or Madam, I am writing to apply.',
            wrongs: [
              'Dear Sir or Madam I am writing to apply.',
              'Dear Sir or Madam, I writing to apply.',
              'Dear Sir or Madam, I am write to apply.',
            ],
            answer: 'writing',
            blockOptions: ['writing', 'write', 'written', 'wrote'],
            hint: 'After am, use the -ing form.',
            explanation: 'The formal opening takes I am writing to apply.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'I would be grateful for your reply.',
            wrongs: [
              'I will be grateful for your reply.',
              'I would be grate for your reply.',
              'I would grateful for your reply.',
            ],
            answer: 'grateful',
            blockOptions: ['grateful', 'great', 'gratitude', 'gratefully'],
            hint: 'The adjective expresses polite appreciation.',
            explanation: 'Grateful is the polite adjective used in formal requests.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Please find my documents attached.',
            wrongs: [
              'Please find my documents attach.',
              'Please finds my documents attached.',
              'Please find attached my documentsly.',
            ],
            answer: 'attached',
            blockOptions: ['attached', 'attach', 'attaching', 'attachment'],
            hint: 'The sentence uses a past participle after documents.',
            explanation: 'Attached is the standard formal wording here.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'I look forward to hearing from you.',
            wrongs: [
              'I look forward to hear from you.',
              'I am looking forward hear from you.',
              'I look forward for hearing from you.',
            ],
            answer: 'hearing',
            blockOptions: ['hearing', 'hear', 'to hear', 'heard'],
            hint: 'Look forward to is followed by a gerund.',
            explanation: 'The fixed pattern is look forward to hearing from you.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Yours faithfully, Maria Noro.',
            wrongs: [
              'Yours faithfully, Maria Noro.',
              'Yours faithful, Maria Noro.',
              'Yours faithfully Maria Noro.',
            ],
            answer: 'faithfully,',
            blockOptions: ['faithfully,', 'faithful,', 'sincerely,', 'regards,'],
            hint: 'This is a formal closing.',
            explanation: 'Yours faithfully is the expected closing after Dear Sir or Madam.',
            duelTrap: 'sincerely,',
          }),
        ],
      },
      {
        title: 'Opinion essay thesis',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'In my view, social media can be useful.',
            wrongs: [
              'In my view social media can be useful.',
              'In my view, social media can useful.',
              'In my view, social media could be usefully.',
            ],
            answer: 'useful',
            blockOptions: ['useful', 'usefully', 'harmful', 'useless'],
            hint: 'The sentence needs an adjective after be.',
            explanation: 'Useful is the correct adjective complement.',
            duelTrap: 'harmful',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'First, online tools save valuable time.',
            wrongs: [
              'First online tools save valuable time.',
              'First, online tools saves valuable time.',
              'First, online tools save valuables time.',
            ],
            answer: 'save',
            blockOptions: ['save', 'saves', 'saving', 'saved'],
            hint: 'The plural subject needs the base form.',
            explanation: 'Tools is plural, so the verb is save.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Secondly, they widen access to information.',
            wrongs: [
              'Secondly they widen access to information.',
              'Secondly, they widens access to information.',
              'Secondly, they widen accesses to information.',
            ],
            answer: 'widen',
            blockOptions: ['widen', 'widens', 'widening', 'broadened'],
            hint: 'The subject is plural.',
            explanation: 'They takes the base form widen.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'However, they may also distract students.',
            wrongs: [
              'However they may also distract students.',
              'However, they may also distracts students.',
              'However, they also may distract studentsly.',
            ],
            answer: 'distract',
            blockOptions: ['distract', 'distracts', 'distracted', 'distraction'],
            hint: 'The modal may is followed by a base verb.',
            explanation: 'After may, we use distract without inflection.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Therefore, schools should teach balanced use.',
            wrongs: [
              'Therefore schools should teach balanced use.',
              'Therefore, schools should teaches balanced use.',
              'Therefore, schools should teaching balanced use.',
            ],
            answer: 'should',
            blockOptions: ['should', 'must', 'can', 'would'],
            hint: 'The conclusion gives a recommendation.',
            explanation: 'Should is the most natural modal for advice here.',
            duelTrap: 'must',
          }),
        ],
      },
      {
        title: 'Long argumentative writing',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'A strong introduction frames the debate clearly.',
            wrongs: [
              'A strong introduction frame the debate clearly.',
              'A strong introduction frames the debates clearly.',
              'A strong introduction framing the debate clearly.',
            ],
            answer: 'frames',
            blockOptions: ['frames', 'frame', 'framing', 'framed'],
            hint: 'The subject is singular.',
            explanation: 'Introduction takes the singular verb frames.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'Each paragraph develops one clear idea.',
            wrongs: [
              'Each paragraph develops one clear idea.',
              'Each paragraph develops one clearly idea.',
              'Each paragraphs develops one clear idea.',
            ],
            answer: 'develops',
            blockOptions: ['develops', 'develop', 'developing', 'developed'],
            hint: 'Each requires a singular verb.',
            explanation: 'Each paragraph develops, not develop.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Relevant examples strengthen the argument.',
            wrongs: [
              'Relevant examples strengthens the argument.',
              'Relevant example strengthen the argument.',
              'Relevant examples strengthen the arguments broadly.',
            ],
            answer: 'strengthen',
            blockOptions: ['strengthen', 'strengthens', 'strengthened', 'strong'],
            hint: 'The subject is plural.',
            explanation: 'Examples is plural, so we use strengthen.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'The conclusion should not repeat the body word for word.',
            wrongs: [
              'The conclusion should not repeats the body word for word.',
              'The conclusion should not repeating the body word for word.',
              'The conclusion should not repeat the body words for word.',
            ],
            answer: 'repeat',
            blockOptions: ['repeat', 'repeats', 'repeating', 'repeated'],
            hint: 'After should, use the base verb.',
            explanation: 'Modal verbs are followed by the infinitive without to.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'A final opening can broaden the perspective.',
            wrongs: [
              'A final opening can broadens the perspective.',
              'A final opening can broadening the perspective.',
              'A final openings can broaden the perspective.',
            ],
            answer: 'broaden',
            blockOptions: ['broaden', 'broadens', 'broadening', 'broadened'],
            hint: 'Can is followed by the base verb.',
            explanation: 'Broaden is the correct base form after can.',
          }),
        ],
      },
      {
        title: 'Essay transitions and nuance',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'On the one hand, digital tools save time.',
            wrongs: [
              'On the one hand digital tools save time.',
              'On the one hand, digital tools saves time.',
              'On the one hand, digital tool save time.',
            ],
            answer: 'save',
            blockOptions: ['save', 'saves', 'saving', 'saved'],
            hint: 'The subject is plural.',
            explanation: 'Tools is plural, so the correct verb is save.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'On the other hand, they may reduce concentration.',
            wrongs: [
              'On the other hand they may reduce concentration.',
              'On the other hand, they reduces concentration.',
              'On the other hand, they may reduced concentration.',
            ],
            answer: 'reduce',
            blockOptions: ['reduce', 'reduces', 'reduced', 'reducing'],
            hint: 'After may, use the base verb.',
            explanation: 'Modal verbs are followed by the infinitive without to.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Moreover, a nuanced argument sounds more convincing.',
            wrongs: [
              'Moreover a nuanced argument sounds more convincing.',
              'Moreover, a nuanced argument sound more convincing.',
              'Moreover, a nuance argument sounds more convincing.',
            ],
            answer: 'sounds',
            blockOptions: ['sounds', 'sound', 'sounding', 'sounded'],
            hint: 'The subject is singular.',
            explanation: 'Argument is singular, so the verb takes s.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'However, one example alone cannot prove everything.',
            wrongs: [
              'However one example alone cannot prove everything.',
              'However, one example alone can proves everything.',
              'However, one examples alone cannot prove everything.',
            ],
            answer: 'prove',
            blockOptions: ['prove', 'proves', 'proved', 'proving'],
            hint: 'After cannot, use the base verb.',
            explanation: 'Cannot must be followed by the base form prove.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Therefore, the conclusion must remain balanced.',
            wrongs: [
              'Therefore the conclusion must remain balanced.',
              'Therefore, the conclusion must remains balanced.',
              'Therefore, the conclusion must balanced remain.',
            ],
            answer: 'remain',
            blockOptions: ['remain', 'remains', 'remaining', 'remained'],
            hint: 'After must, use the base verb.',
            explanation: 'Remain is the correct verb after must.',
          }),
        ],
      },
      {
        title: 'Summary and final check',
        cases: [
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'A final draft needs careful proofreading.',
            wrongs: [
              'A final draft need careful proofreading.',
              'A final draft needs carefully proofreading.',
              'A final draft needed careful proofreading now.',
            ],
            answer: 'needs',
            blockOptions: ['needs', 'need', 'needing', 'needed'],
            hint: 'The subject is singular.',
            explanation: 'Draft is singular, so the verb is needs.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'Small errors can weaken a good essay.',
            wrongs: [
              'Small errors can weak a good essay.',
              'Small errors can weakens a good essay.',
              'Small error can weaken a good essay.',
            ],
            answer: 'weaken',
            blockOptions: ['weaken', 'weakened', 'weakens', 'weak'],
            hint: 'After can, use the base verb.',
            explanation: 'Can must be followed by weaken.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'Linking words improve the flow of ideas.',
            wrongs: [
              'Linking words improves the flow of ideas.',
              'Linking word improve the flow of ideas.',
              'Linking words improve the flows of ideas.',
            ],
            answer: 'improve',
            blockOptions: ['improve', 'improves', 'improved', 'improving'],
            hint: 'The subject is plural.',
            explanation: 'Words is plural, so we use improve.',
          }),
          createSentenceCase({
            prompt: 'Pick the correct sentence.',
            correct: 'The title should remain precise.',
            wrongs: [
              'The title should remains precise.',
              'The title should remaining precise.',
              'The title should remain precisely.',
            ],
            answer: 'remain',
            blockOptions: ['remain', 'remains', 'remaining', 'precisely'],
            hint: 'After should, use the base verb.',
            explanation: 'Remain is the correct base form after should.',
          }),
          createSentenceCase({
            prompt: 'Choose the correct sentence.',
            correct: 'The last reading often reveals hidden flaws.',
            wrongs: [
              'The last reading often reveal hidden flaws.',
              'The last reading often reveals hidden flawsly.',
              'The last readings often reveals hidden flaws.',
            ],
            answer: 'reveals',
            blockOptions: ['reveals', 'reveal', 'revealed', 'revealing'],
            hint: 'The subject is singular.',
            explanation: 'Reading is singular, so the verb takes s.',
          }),
        ],
      },
    ],
    exercises: [],
  },
];

function buildFrenchExercises() {
  return [
    {
      chapterNumber: 1,
      title: 'Exercice long - Accord, pluriel et relecture guidée',
      introduction: 'Vous préparez une fiche de révision de Terminale sur les bases du français écrit. Pour chaque question, vous devez observer une phrase, rappeler la règle, corriger, puis justifier votre réponse comme dans un vrai devoir long.',
      supportText: '',
      instructions: 'Répondez à toutes les questions. Chaque question comporte plusieurs étapes de brouillon, puis plusieurs rafraîchissements de traitement.',
      questions: [
        createRuleQuestion({
          question: 'Question 1 - Corriger l accord dans « Les décision finale était claire. »',
          notion: 'Accord du nom, de l adjectif et du verbe.',
          rule: 'Chaque adjectif et chaque verbe s accordent avec le noyau sujet en genre et en nombre.',
          focus: 'Le groupe sujet est Les décisions finales.',
          correction: 'Les décisions finales étaient claires.',
          conclusion: 'La phrase corrigée rétablit donc le pluriel sur décisions, finales, étaient et claires.',
          hint: 'Repérez le nom noyau du groupe sujet.',
          explanation: 'On corrige simultanément le nom, l adjectif et le verbe pour rétablir la cohérence grammaticale.',
          distractors: ['singulier', 'masculin', 'était claire', 'décision finale'],
        }),
        createRuleQuestion({
          question: 'Question 2 - Justifier le pluriel de « chevaux » dans une phrase de synthèse.',
          notion: 'Pluriel irrégulier des noms en al.',
          rule: 'Certains noms en al forment leur pluriel en aux.',
          focus: 'Le mot à corriger est cheval.',
          correction: 'Le pluriel correct est chevaux.',
          conclusion: 'Dans une phrase de révision, on écrira donc : les chevaux traversent la plaine.',
          hint: 'Comparez singulier et pluriel.',
          explanation: 'Cheval appartient à la série des noms qui passent de al à aux.',
          distractors: ['chevals', 'chevals', 'cheval', 'auxiliaire'],
        }),
        createRuleQuestion({
          question: 'Question 3 - Compléter la phrase « Les lettres que j ai ... hier » et expliquer l accord.',
          notion: 'Participe passé avec avoir.',
          rule: 'Avec avoir, le participe passé s accorde avec le COD seulement si celui-ci est placé avant.',
          focus: 'Le COD lettres est placé avant le verbe.',
          correction: 'Les lettres que j ai écrites hier.',
          conclusion: 'On retient donc la forme écrites parce que le COD féminin pluriel précède.',
          hint: 'Cherchez le COD et sa place.',
          explanation: 'Le participe passé reprend ici le féminin pluriel du COD lettres.',
          distractors: ['écrit', 'écrite', 'écrits', 'après le verbe'],
        }),
        createRuleQuestion({
          question: 'Question 4 - Réécrire correctement « La majorité des candidat réussissent. »',
          notion: 'Accord sujet verbe avec un noyau collectif.',
          rule: 'Le verbe s accorde avec le noyau du groupe sujet quand on insiste sur l unité.',
          focus: 'Le noyau sujet est majorité.',
          correction: 'La majorité des candidats réussit.',
          conclusion: 'Le verbe reste donc au singulier, car la majorité est prise comme un ensemble.',
          hint: 'Identifiez le mot central du sujet.',
          explanation: 'On met réussit au singulier parce que le noyau majorité commande l accord.',
          distractors: ['réussissent', 'collectif pluriel', 'candidat', 'réussiront'],
        }),
        createRuleQuestion({
          question: 'Question 5 - Corriger les homophones dans « Il à raison et il c est tu. »',
          notion: 'Homophones grammaticaux.',
          rule: 'On distingue le verbe avoir de la préposition à, et la structure c est de ses homophones.',
          focus: 'Les segments fautifs sont à et c est.',
          correction: 'Il a raison et il s est tu.',
          conclusion: 'La correction remplace la préposition fautive et remet la forme pronominale du verbe.',
          hint: 'Testez le remplacement par avait et observez le verbe pronominal.',
          explanation: 'A est la forme du verbe avoir, tandis que s est appartient à la forme pronominale.',
          distractors: ['à', 'c est', 'avait', 'préposition'],
        }),
        createRuleQuestion({
          question: 'Question 6 - Expliquer la différence entre « ces » et « ses » dans une phrase d exemple.',
          notion: 'Déterminants démonstratif et possessif.',
          rule: 'Ces montre, ses indique la possession.',
          focus: 'Le sens dépend de la relation entre le déterminant et le nom.',
          correction: 'Ces livres sont sur la table ; ses livres appartiennent à Paul.',
          conclusion: 'On choisit donc ces pour montrer et ses pour exprimer la possession.',
          hint: 'Cherchez si le groupe nominal montre ou possède.',
          explanation: 'Le sens du déterminant commande ici la bonne graphie.',
          distractors: ['c est', 's est', 'possession', 'désignation'],
        }),
        createRuleQuestion({
          question: 'Question 7 - Corriger « Chaque réponses montrent un effort. »',
          notion: 'Accord après chaque.',
          rule: 'Chaque entraîne le singulier sur le nom et sur le verbe.',
          focus: 'Chaque commande réponses et montrent.',
          correction: 'Chaque réponse montre un effort.',
          conclusion: 'Le singulier s impose sur le nom comme sur le verbe après chaque.',
          hint: 'Chaque est un signal fort de singulier.',
          explanation: 'On passe du pluriel fautif au singulier cohérent.',
          distractors: ['réponses', 'montrent', 'pluriel', 'chaques'],
        }),
        createRuleQuestion({
          question: 'Question 8 - Reformuler correctement « Des journals ancien ».',
          notion: 'Pluriel des noms et accord de l adjectif.',
          rule: 'Journal devient journaux au pluriel et ancien s accorde avec lui.',
          focus: 'Le groupe nominal entier doit être harmonisé.',
          correction: 'Des journaux anciens.',
          conclusion: 'Le pluriel correct combine journaux et anciens.',
          hint: 'Corrigez le nom avant l adjectif.',
          explanation: 'Le groupe nominal se reconstruit par double accord.',
          distractors: ['journals', 'ancien', 'anciens', 'journal'],
        }),
        createRuleQuestion({
          question: 'Question 9 - Distinguer valeur descriptive et valeur ponctuelle dans une mini narration.',
          notion: 'Imparfait et passé simple.',
          rule: 'L imparfait exprime souvent le cadre, le passé simple l événement bref.',
          focus: 'La phrase oppose durée et surgissement.',
          correction: 'Le héros avançait quand la foule cria.',
          conclusion: 'On garde donc avançait pour le fond et cria pour la rupture narrative.',
          hint: 'Repérez ce qui dure et ce qui surgit.',
          explanation: 'La valeur des temps oriente la correction de la narration.',
          distractors: ['avança', 'criait', 'durée', 'rupture'],
        }),
        createWritingQuestion({
          question: 'Question 10 - Rédiger une courte synthèse sur les bases à retenir pour éviter les fautes d accord.',
          issue: 'L enjeu est de transformer plusieurs règles isolées en une méthode rapide de relecture.',
          thesis: 'On peut sécuriser l écriture en vérifiant d abord le noyau sujet, puis les accords autour de lui, enfin les formes verbales sensibles.',
          axisOne: 'Premier axe : repérer le noyau du groupe sujet et les mots qui en dépendent.',
          axisTwo: 'Second axe : contrôler ensuite les participes passés, les déterminants et les homophones grammaticaux.',
          finalOpening: 'Cette méthode de relecture peut ensuite être réutilisée dans les dissertations longues et les commentaires rédigés.',
          hint: 'Organisez votre réponse comme une petite méthode.',
          explanation: 'Une bonne synthèse rappelle les règles, les hiérarchise et annonce une méthode de vérification réutilisable.',
          distractors: ['désordre', 'hors sujet', 'aucune méthode', 'simple copie'],
        }),
      ],
    },
    {
      chapterNumber: 1,
      title: 'Exercice long - De la règle à la phrase juste',
      introduction: 'Vous êtes chargé de bâtir une page de révision pour des élèves de Terminale. Chaque réponse doit être expliquée, reformulée et réécrite proprement.',
      supportText: '',
      instructions: 'Traitez les questions dans l ordre. Chaque traitement doit rester long, progressif et justifié.',
      questions: [
        createRuleQuestion({
          question: 'Question 1 - Corriger « Les élève attentif écoute. »',
          notion: 'Accord nom adjectif verbe.',
          rule: 'Le nom, l adjectif et le verbe s alignent sur le sujet réel.',
          focus: 'Le sujet réel est Les élèves attentifs.',
          correction: 'Les élèves attentifs écoutent.',
          conclusion: 'La phrase rétablit le pluriel sur tous les éléments du groupe sujet et sur le verbe.',
          hint: 'Comptez les marques du pluriel manquantes.',
          explanation: 'L accord complet exige élèves, attentifs et écoutent.',
          distractors: ['élève', 'attentif', 'écoute', 'singulier'],
        }),
        createRuleQuestion({
          question: 'Question 2 - Réécrire « Il a prit ses affaires. »',
          notion: 'Participe passé et forme du verbe prendre.',
          rule: 'Le passé composé emploie le participe passé correct du verbe.',
          focus: 'Le verbe prendre a pour participe passé pris.',
          correction: 'Il a pris ses affaires.',
          conclusion: 'On remplace donc prit par pris pour rétablir la forme correcte.',
          hint: 'Vérifiez le participe passé de prendre.',
          explanation: 'Prit est une confusion avec le passé simple ; pris est attendu après avoir.',
          distractors: ['prit', 'prendre', 'prise', 'passé simple'],
        }),
        createRuleQuestion({
          question: 'Question 3 - Reconstituer la règle entre « on » et le verbe.',
          notion: 'Accord avec on.',
          rule: 'Le verbe avec on se met d ordinaire au singulier, même si le sens peut être collectif.',
          focus: 'Le pronom sujet est on.',
          correction: 'On retient donc un verbe au singulier dans la phrase de base.',
          conclusion: 'La vigilance sur on évite les accords pluriels réflexes mais fautifs.',
          hint: 'Le sens collectif ne suffit pas à imposer le pluriel verbal.',
          explanation: 'En français courant, on commande d abord le singulier verbal.',
          distractors: ['pluriel automatique', 'ils', 'nous', 'collectif'],
        }),
        createRuleQuestion({
          question: 'Question 4 - Distinguer « leur » déterminant et « leur » pronom.',
          notion: 'Fonctions de leur.',
          rule: 'Leur déterminant précède un nom ; leur pronom remplace un complément.',
          focus: 'La place de leur permet d identifier sa nature.',
          correction: 'Leur professeur leur parle calmement.',
          conclusion: 'Le premier leur est déterminant, le second est pronom complément.',
          hint: 'Observez si un nom suit immédiatement leur.',
          explanation: 'La fonction grammaticale dépend de la position dans la phrase.',
          distractors: ['leurs', 'déterminant', 'pronom', 'nom absent'],
        }),
        createRuleQuestion({
          question: 'Question 5 - Réparer la ponctuation de « Pourtant il répond, calmement ». ',
          notion: 'Virgule après un connecteur introductif.',
          rule: 'Un connecteur placé en tête se détache souvent par une virgule.',
          focus: 'Le connecteur initial est pourtant.',
          correction: 'Pourtant, il répond calmement.',
          conclusion: 'La virgule doit donc suivre le connecteur et non séparer le verbe de son adverbe.',
          hint: 'Le verbe et l adverbe doivent rester liés.',
          explanation: 'La ponctuation organise la logique sans casser le groupe verbal.',
          distractors: ['Pourtant il', 'répond, calmement', 'adverbe', 'connecteur'],
        }),
        createRuleQuestion({
          question: 'Question 6 - Choisir entre « c est » et « s est » dans une phrase pronominale.',
          notion: 'Homophones c est / s est.',
          rule: 'S est appartient à un verbe pronominal ; c est sert à désigner ou identifier.',
          focus: 'Le sens d action sur soi-même déclenche la forme pronominale.',
          correction: 'Il s est souvenu de la consigne.',
          conclusion: 'On emploie s est car le verbe se souvenir est pronominal.',
          hint: 'Cherchez le verbe à l infinitif.',
          explanation: 'Se souvenir conserve son pronom à toutes les personnes.',
          distractors: ['c est', 'souvenu', 'souvenir', 'identification'],
        }),
        createRuleQuestion({
          question: 'Question 7 - Construire une phrase correcte avec « ni... ni... »',
          notion: 'Coordination négative.',
          rule: 'La coordination impose une structure rigoureuse et un accord cohérent.',
          focus: 'Le second terme du sujet peut guider l accord verbal selon le sens retenu.',
          correction: 'Ni le doute ni les objections ne suffisent à bloquer la réflexion.',
          conclusion: 'La phrase garde la symétrie de la coordination tout en accordant le verbe avec le groupe final pluriel.',
          hint: 'Préservez la double négation ni / ni.',
          explanation: 'La coordination doit rester parallèle et lisible.',
          distractors: ['ou', 'et', 'suffit', 'bloqueront'],
        }),
        createRuleQuestion({
          question: 'Question 8 - Réécrire « Bien qu il doute, il avance ».',
          notion: 'Subjonctif après bien que.',
          rule: 'Bien que introduit une concession et appelle le subjonctif.',
          focus: 'Le verbe douter dans la subordonnée doit être au subjonctif.',
          correction: 'Bien qu il doute, il avance.',
          conclusion: 'La forme doute est déjà correcte parce qu elle correspond au subjonctif attendu.',
          hint: 'Il faut parfois justifier une forme déjà juste.',
          explanation: 'Le travail consiste ici à expliquer pourquoi la phrase doit être conservée.',
          distractors: ['indicatif', 'doute', 'avance', 'subjonctif'],
        }),
        createRuleQuestion({
          question: 'Question 9 - Refaire une mini leçon sur le singulier et le pluriel à partir de trois exemples.',
          notion: 'Méthode de vérification du nombre.',
          rule: 'On part du déterminant, on observe le nom noyau, puis on contrôle les accords autour.',
          focus: 'La méthode vaut pour le nom, l adjectif et le verbe.',
          correction: 'Déterminant, nom noyau, adjectif, verbe : voilà l ordre de vérification.',
          conclusion: 'Cette méthode en chaîne sécurise la relecture de presque toutes les phrases courantes.',
          hint: 'Transformez la règle en procédure.',
          explanation: 'Une bonne réponse fait apparaître une vraie méthode et non une simple définition.',
          distractors: ['hasard', 'au cas par cas', 'sans ordre', 'simple intuition'],
        }),
        createWritingQuestion({
          question: 'Question 10 - Rédiger la conclusion d une fiche de révision sur l accord.',
          issue: 'Il faut conclure en montrant que la maîtrise des accords améliore à la fois la justesse et la lisibilité du devoir.',
          thesis: 'Une relecture méthodique des accords permet de réduire les erreurs simples avant même d approfondir l analyse littéraire.',
          axisOne: 'Premier rappel : accorder le groupe nominal et le groupe verbal à partir du noyau sujet.',
          axisTwo: 'Second rappel : vérifier ensuite les homophones et les participes passés sensibles.',
          finalOpening: 'Cette exigence de justesse grammaticale prépare directement les écrits longs du commentaire et de la dissertation.',
          hint: 'Concluez comme dans un vrai document pédagogique.',
          explanation: 'La conclusion attendue doit résumer la méthode puis ouvrir vers les écrits longs.',
          distractors: ['hors sujet', 'aucune méthode', 'simple liste', 'pas de conclusion'],
        }),
      ],
    },
  ];
}

function buildFrenchAdvancedExercises() {
  const textOne = 'Texte support : Un narrateur observe une ville moderne qui promet la vitesse, la lumière et le confort, mais il s interroge sur le prix humain de cette efficacité. Les rues brillent, les vitrines séduisent, pourtant les passants se croisent sans se regarder. Peu à peu, le texte oppose le progrès matériel au besoin de lien, de mémoire et de lenteur.';
  const textTwo = 'Texte support : Dans un extrait polémique, une essayiste défend l idée que lire ne sert pas seulement à se divertir. Selon elle, la lecture apprend à nommer le monde, à nuancer ses jugements et à résister aux opinions toutes faites. Elle critique une culture de l immédiateté qui valorise la réaction plus que la réflexion.';

  return [
    {
      chapterNumber: 3,
      title: 'Exercice long - Compréhension de texte, grammaire et dissertation courte',
      introduction: 'À partir d un texte argumentatif de Terminale, vous devez construire des réponses longues, articulées et justifiées.',
      supportText: textOne,
      instructions: 'Lisez le texte, organisez votre brouillon, puis traitez chaque question pas à pas.',
      questions: [
        createComprehensionQuestion({
          question: 'Question 1 - Identifier le thème central du texte support.',
          cue: 'Le texte met en tension le progrès matériel et la relation humaine.',
          evidence: 'Les passants se croisent sans se regarder.',
          interpretation: 'Le narrateur critique une modernité efficace mais appauvrie sur le plan humain.',
          reformulation: 'La ville moderne fascine, mais elle produit aussi une forme d isolement.',
          conclusion: 'Le thème central est donc le conflit entre vitesse moderne et besoin de lien humain.',
          hint: 'Cherchez ce qui oppose les deux pôles du passage.',
          explanation: 'Une réponse solide doit nommer les deux pôles de l opposition et les relier.',
          distractors: ['description pure', 'ville heureuse', 'technologie neutre', 'aucune critique'],
        }),
        createComprehensionQuestion({
          question: 'Question 2 - Expliquer la valeur de « pourtant » dans le passage.',
          cue: 'Pourtant marque une rupture argumentative.',
          evidence: 'Les vitrines séduisent, pourtant les passants se croisent sans se regarder.',
          interpretation: 'Le connecteur fait basculer la phrase de l attirance apparente vers la critique.',
          reformulation: 'Il casse l illusion du confort pour révéler un manque plus profond.',
          conclusion: 'Le mot pourtant introduit donc l opposition majeure du texte.',
          hint: 'Observez ce qui est annoncé avant et après le connecteur.',
          explanation: 'La valeur du connecteur se comprend dans le mouvement logique de la phrase.',
          distractors: ['addition', 'conséquence', 'chronologie', 'simple exemple'],
        }),
        createRuleQuestion({
          question: 'Question 3 - Relever et justifier un champ lexical dans le texte.',
          notion: 'Champ lexical de la modernité urbaine.',
          rule: 'Un champ lexical regroupe des mots liés par une même idée dominante.',
          focus: 'Vitesse, lumière, confort, vitrines.',
          correction: 'Ces mots construisent le champ lexical d une modernité séduisante et matérielle.',
          conclusion: 'Le champ lexical renforce donc l image d une ville brillante mais impersonnelle.',
          hint: 'Regroupez les mots qui parlent du même univers.',
          explanation: 'La réponse doit à la fois relever et interpréter les termes.',
          distractors: ['nature', 'ruralité', 'silence', 'famille'],
        }),
        createComprehensionQuestion({
          question: 'Question 4 - Montrer comment la phrase finale oriente l interprétation du texte.',
          cue: 'La phrase finale oppose progrès matériel et besoin de mémoire.',
          evidence: 'Le texte oppose le progrès matériel au besoin de lien, de mémoire et de lenteur.',
          interpretation: 'Cette clôture transforme une simple description urbaine en réflexion critique.',
          reformulation: 'Le lecteur comprend que la vraie question porte sur la qualité de vie et non sur les objets.',
          conclusion: 'La fin du texte donne donc explicitement une portée critique et philosophique au passage.',
          hint: 'Cherchez ce que la dernière phrase ajoute à l ensemble.',
          explanation: 'La dernière phrase livre le sens global du passage et guide la lecture.',
          distractors: ['fin neutre', 'simple répétition', 'hors sujet', 'digression'],
        }),
        createRuleQuestion({
          question: 'Question 5 - Réécrire « les passants se croisent sans se regarder » au passé en gardant le sens.',
          notion: 'Transposition verbale et cohérence du temps.',
          rule: 'On choisit un temps cohérent avec un récit passé tout en conservant la relation logique.',
          focus: 'Le segment verbal doit être harmonisé.',
          correction: 'Les passants se croisaient sans se regarder.',
          conclusion: 'L imparfait garde ici la valeur descriptive et répétitive de la scène.',
          hint: 'Le passage décrit une scène de fond.',
          explanation: 'Le choix de l imparfait permet de conserver la dimension de cadre.',
          distractors: ['croisèrent', 'se regardèrent', 'présent', 'futur'],
        }),
        createRuleQuestion({
          question: 'Question 6 - Corriger et commenter « les rues brillant et les vitrines séduisait ».',
          notion: 'Accords et cohérence verbale.',
          rule: 'On contrôle la forme du participe ou de l adjectif et l accord du verbe avec le sujet.',
          focus: 'Le groupe nominal et le verbe doivent être reconstruits.',
          correction: 'Les rues brillent et les vitrines séduisent.',
          conclusion: 'La correction remet chaque verbe au présent pluriel et supprime la forme fautive brillant.',
          hint: 'Il faut deux verbes conjugués.',
          explanation: 'Le sujet de chaque proposition impose ici un verbe au présent pluriel.',
          distractors: ['brillant', 'séduisait', 'séduire', 'singulier'],
        }),
        createComprehensionQuestion({
          question: 'Question 7 - Expliquer la critique implicite de la ville moderne.',
          cue: 'La critique vise une efficacité qui oublie la relation humaine.',
          evidence: 'Les passants se croisent sans se regarder.',
          interpretation: 'La ville promet le confort mais appauvrit les échanges et la mémoire commune.',
          reformulation: 'Le texte dénonce une modernité pleine d objets mais pauvre en présence humaine.',
          conclusion: 'La critique implicite porte donc sur une modernité performante mais déshumanisée.',
          hint: 'Reliez les détails matériels au sentiment général.',
          explanation: 'La réponse doit articuler description concrète et interprétation critique.',
          distractors: ['ville parfaite', 'nature absente sans enjeu', 'éloge pur', 'neutralité'],
        }),
        createWritingQuestion({
          question: 'Question 8 - Formuler une réponse argumentée : « Le progrès suffit-il à rendre une société heureuse ? »',
          issue: 'Le sujet oppose le confort matériel à la qualité du lien social et moral.',
          thesis: 'Le progrès matériel améliore les conditions de vie, mais il ne suffit pas sans relation, mémoire et attention à autrui.',
          axisOne: 'Premier axe : reconnaître les bénéfices réels du progrès et de la technique.',
          axisTwo: 'Second axe : montrer que le bonheur humain dépend aussi de la relation, du temps et du sens partagé.',
          finalOpening: 'On peut alors ouvrir vers la question d une modernité plus humaine et plus responsable.',
          hint: 'Construisez une mini dissertation en deux axes.',
          explanation: 'La réponse doit poser un débat, nuancer, puis conclure proprement.',
          distractors: ['réponse binaire', 'hors sujet', 'aucun plan', 'liste sans lien'],
        }),
        createWritingQuestion({
          question: 'Question 9 - Rédiger le début d une introduction de dissertation sur la modernité.',
          issue: 'L introduction doit faire sentir l ambivalence de la modernité sans répondre trop vite.',
          thesis: 'La modernité attire par sa puissance mais inquiète par ce qu elle peut retirer à l expérience humaine.',
          axisOne: 'Premier mouvement : partir d une observation générale sur la vitesse et le confort modernes.',
          axisTwo: 'Second mouvement : faire naître la question du prix humain de cette accélération.',
          finalOpening: 'La problématique peut alors s ouvrir sur la tension entre efficacité et humanité.',
          hint: 'Soignez la progression de l accroche vers la problématique.',
          explanation: 'Une bonne introduction prépare le débat, elle ne le ferme pas.',
          distractors: ['réponse immédiate', 'titre seul', 'citation sans commentaire', 'hors problème'],
        }),
        createWritingQuestion({
          question: 'Question 10 - Rédiger une conclusion de dissertation sur la ville moderne.',
          issue: 'La conclusion doit répondre clairement au sujet sans répéter mécaniquement le développement.',
          thesis: 'La ville moderne n est souhaitable que si elle conjugue progrès technique et présence humaine.',
          axisOne: 'Rappel 1 : le confort matériel représente un acquis réel et nécessaire.',
          axisTwo: 'Rappel 2 : cet acquis ne vaut que s il reste compatible avec la mémoire, la lenteur et le lien.',
          finalOpening: 'On peut enfin ouvrir sur l idée d un urbanisme conçu pour les rencontres autant que pour la vitesse.',
          hint: 'Répondez puis ouvrez, sans repartir dans un nouveau développement.',
          explanation: 'La conclusion doit synthétiser puis proposer une ouverture maîtrisée.',
          distractors: ['nouvel argument majeur', 'répétition brute', 'hors texte', 'pas de réponse'],
        }),
      ],
    },
    {
      chapterNumber: 4,
      title: 'Exercice long - Lecture critique, commentaire et dissertation guidée',
      introduction: 'Vous devez exploiter un texte argumentatif de niveau Terminale en mobilisant compréhension, vocabulaire, grammaire et écriture longue.',
      supportText: textTwo,
      instructions: 'Traitez successivement les questions. Le parcours est volontairement long pour simuler un vrai devoir de français.',
      questions: [
        createComprehensionQuestion({
          question: 'Question 1 - Identifier la thèse défendue par l essayiste.',
          cue: 'La lecture sert à former le jugement autant qu à divertir.',
          evidence: 'La lecture apprend à nommer le monde, à nuancer ses jugements et à résister aux opinions toutes faites.',
          interpretation: 'L auteure attribue à la lecture une fonction intellectuelle et civique décisive.',
          reformulation: 'Lire ne relève pas seulement du loisir : c est un apprentissage de la pensée.',
          conclusion: 'La thèse soutient donc que la lecture forme l esprit critique du lecteur.',
          hint: 'Cherchez l affirmation la plus générale du passage.',
          explanation: 'La thèse doit être formulée comme une position défendue.',
          distractors: ['lecture inutile', 'simple détente', 'thèse absente', 'éloge de la vitesse'],
        }),
        createComprehensionQuestion({
          question: 'Question 2 - Expliquer l expression « opinions toutes faites ».',
          cue: 'L expression désigne des jugements reçus et non réfléchis.',
          evidence: 'Résister aux opinions toutes faites.',
          interpretation: 'L auteure critique ici les idées reprises sans examen personnel.',
          reformulation: 'Elle vise les formules automatiques que l on répète sans penser.',
          conclusion: 'L expression renvoie donc à des idées toutes prêtes que la lecture aide à discuter.',
          hint: 'Interprétez l expression dans son contexte polémique.',
          explanation: 'Une bonne réponse explicite le sens et la portée critique de l expression.',
          distractors: ['opinion savante', 'connaissance précise', 'preuve scientifique', 'citation neutre'],
        }),
        createRuleQuestion({
          question: 'Question 3 - Relever deux verbes qui donnent une fonction active à la lecture.',
          notion: 'Lexique de l action intellectuelle.',
          rule: 'On relève des verbes et on les interprète en lien avec la thèse.',
          focus: 'Nommer et résister.',
          correction: 'Les verbes nommer et résister montrent que la lecture agit sur la pensée et le jugement.',
          conclusion: 'Le texte présente donc la lecture comme une force active de formation intellectuelle.',
          hint: 'Cherchez des verbes d action mentale ou morale.',
          explanation: 'La réponse doit relever les verbes et expliquer leur effet argumentatif.',
          distractors: ['divertir seulement', 'passivité', 'immédiateté', 'consommer'],
        }),
        createRuleQuestion({
          question: 'Question 4 - Corriger « la lecture apprennent à nuancer ses jugement ».',
          notion: 'Accord et pluriel nominal.',
          rule: 'Le verbe s accorde avec lecture et le nom jugement doit prendre le pluriel après ses.',
          focus: 'Le sujet singulier est la lecture.',
          correction: 'La lecture apprend à nuancer ses jugements.',
          conclusion: 'On garde le verbe au singulier et on met jugements au pluriel après ses.',
          hint: 'Repérez le sujet réel puis le déterminant possessif.',
          explanation: 'L accord correct combine lecture apprend et ses jugements.',
          distractors: ['apprennent', 'jugement', 'lecture apprennent', 'ses jugement'],
        }),
        createComprehensionQuestion({
          question: 'Question 5 - Montrer la critique de l immédiateté dans le texte.',
          cue: 'L auteure oppose réaction immédiate et réflexion lente.',
          evidence: 'Une culture de l immédiateté qui valorise la réaction plus que la réflexion.',
          interpretation: 'Le texte dénonce une société qui réagit vite mais pense trop peu.',
          reformulation: 'L immédiateté devient un danger quand elle remplace l examen critique.',
          conclusion: 'La critique vise donc une vitesse mentale qui affaiblit le jugement.',
          hint: 'Confrontez les deux termes réaction et réflexion.',
          explanation: 'L opposition lexicale permet de dégager la critique implicite.',
          distractors: ['éloge de la vitesse', 'neutralité complète', 'simple narration', 'absence de valeur'],
        }),
        createWritingQuestion({
          question: 'Question 6 - Rédiger un paragraphe argumenté sur la fonction de la lecture.',
          issue: 'Il faut montrer que la lecture engage à la fois la langue, la pensée et la liberté du jugement.',
          thesis: 'La lecture forme un lecteur plus autonome parce qu elle enrichit son vocabulaire, affine son esprit critique et ralentit sa réaction immédiate.',
          axisOne: 'Premier axe : la lecture apprend à nommer avec précision et à comprendre les nuances.',
          axisTwo: 'Second axe : elle aide à résister aux idées toutes faites et aux réactions automatiques.',
          finalOpening: 'On peut ouvrir sur le rôle démocratique de lecteurs capables de juger par eux-mêmes.',
          hint: 'Faites apparaître un raisonnement net et progressif.',
          explanation: 'Le paragraphe doit articuler langue, pensée et autonomie de jugement.',
          distractors: ['liste de livres', 'hors sujet', 'aucun lien logique', 'simple définition'],
        }),
        createWritingQuestion({
          question: 'Question 7 - Construire un plan de dissertation sur « Lire rend-il plus libre ? »',
          issue: 'Le sujet appelle un débat entre émancipation réelle et limites possibles de la lecture.',
          thesis: 'Lire peut rendre plus libre, à condition que cette lecture reste active, critique et confrontée au monde.',
          axisOne: 'Axe 1 : la lecture élargit le langage, l imagination et la capacité de jugement.',
          axisTwo: 'Axe 2 : la lecture ne libère vraiment que si elle s accompagne d appropriation personnelle et d expérience vécue.',
          finalOpening: 'L ouverture peut conduire vers la responsabilité du lecteur dans la vie civique.',
          hint: 'Annoncez un vrai débat et non un simple catalogue.',
          explanation: 'Le plan doit articuler affirmation, nuance et condition.',
          distractors: ['réponse unique', 'plan thématique vide', 'hors problème', 'aucune nuance'],
        }),
        createWritingQuestion({
          question: 'Question 8 - Rédiger une longue introduction de dissertation.',
          issue: 'L introduction doit partir d une idée large sur la lecture puis faire émerger l enjeu de la liberté.',
          thesis: 'Lire expose à d autres voix, mais la liberté du lecteur dépend de sa manière d accueillir, de discuter et de transformer ces voix.',
          axisOne: 'Mouvement 1 : rappeler que la lecture est souvent associée à l ouverture d esprit.',
          axisTwo: 'Mouvement 2 : montrer qu une liberté authentique suppose aussi distance critique et appropriation.',
          finalOpening: 'La problématique peut alors demander comment la lecture devient une véritable pratique de liberté.',
          hint: 'Progressez de l idée générale vers la question centrale.',
          explanation: 'Une introduction forte problématise et annonce l orientation du devoir.',
          distractors: ['réponse prématurée', 'hors sujet', 'citation brute', 'liste de livres'],
        }),
        createWritingQuestion({
          question: 'Question 9 - Écrire la conclusion d un commentaire sur le texte support.',
          issue: 'La conclusion doit faire le bilan de la thèse, de sa stratégie et de sa portée.',
          thesis: 'Le texte défend une lecture formatrice qui résiste à l immédiateté et protège le jugement personnel.',
          axisOne: 'Bilan 1 : rappeler la fonction intellectuelle et morale attribuée à la lecture.',
          axisTwo: 'Bilan 2 : souligner la critique d une culture trop rapide et trop réactive.',
          finalOpening: 'L ouverture peut porter sur la place de la lecture dans une société saturée d informations rapides.',
          hint: 'Répondez au texte sans recopier vos développements.',
          explanation: 'La conclusion doit synthétiser puis ouvrir avec mesure.',
          distractors: ['nouvel argument', 'copie des axes', 'pas de bilan', 'hors texte'],
        }),
        createWritingQuestion({
          question: 'Question 10 - Formuler une prise de position longue et personnelle sur la lecture aujourd hui.',
          issue: 'La réponse doit croiser expérience personnelle, réflexion générale et exigence scolaire.',
          thesis: 'La lecture reste décisive aujourd hui parce qu elle ralentit, approfondit et structure une pensée plus autonome.',
          axisOne: 'Premier axe : la lecture donne du vocabulaire et des nuances pour penser plus précisément.',
          axisTwo: 'Second axe : elle entraîne à la distance critique face aux réactions immédiates des réseaux et des opinions rapides.',
          finalOpening: 'On peut enfin ouvrir sur la responsabilité de l école dans la formation de lecteurs patients et libres.',
          hint: 'Assumez une position personnelle, mais organisez-la comme un devoir de Terminale.',
          explanation: 'La réponse doit articuler expérience, argumentation et portée civique.',
          distractors: ['récit pur', 'hors sujet', 'simple slogan', 'absence de plan'],
        }),
      ],
    },
  ];
}

function buildEnglishExercises() {
  return [
    {
      chapterNumber: 1,
      title: 'Long exercise - Core grammar, correction and guided rewriting',
      introduction: 'You are preparing a Terminale revision file for English. Each answer must move from rule spotting to correction, then to a full written justification.',
      supportText: '',
      instructions: 'Treat every question through the brouillon and the long treatment sequence.',
      questions: [
        createRuleQuestion({
          question: 'Question 1 - Correct « She go to school every day. »',
          notion: 'Present simple, third person singular.',
          rule: 'In the present simple, a third person singular subject usually takes a verb ending in s.',
          focus: 'The subject is She.',
          correction: 'She goes to school every day.',
          conclusion: 'The final answer adds the third person singular ending and restores the correct sentence.',
          hint: 'Look at the subject before choosing the verb form.',
          explanation: 'The verb go becomes goes with she in the present simple.',
          distractors: ['go', 'going', 'went', 'plural subject'],
        }),
        createRuleQuestion({
          question: 'Question 2 - Repair « They was waiting outside. »',
          notion: 'Past continuous with a plural subject.',
          rule: 'Past continuous combines was or were with the ing form, and the auxiliary must agree with the subject.',
          focus: 'The subject is They.',
          correction: 'They were waiting outside.',
          conclusion: 'The correct version uses were with the plural subject and keeps waiting as the ing form.',
          hint: 'Choose the plural auxiliary.',
          explanation: 'They requires were, not was.',
          distractors: ['was', 'waited', 'waiting outside', 'singular'],
        }),
        createRuleQuestion({
          question: 'Question 3 - Correct « I have saw that scene before. »',
          notion: 'Present perfect and past participle.',
          rule: 'After have, English uses the past participle and not the past simple.',
          focus: 'The verb see takes the participle seen.',
          correction: 'I have seen that scene before.',
          conclusion: 'The corrected sentence replaces the past simple saw with the participle seen.',
          hint: 'Distinguish past simple from past participle.',
          explanation: 'Seen is the past participle required after have.',
          distractors: ['saw', 'see', 'seeing', 'present simple'],
        }),
        createRuleQuestion({
          question: 'Question 4 - Correct « He can sings very well. »',
          notion: 'Modal verbs.',
          rule: 'A modal verb is followed by the base form without s, to or ing.',
          focus: 'The modal is can.',
          correction: 'He can sing very well.',
          conclusion: 'The final answer keeps the modal and removes the incorrect ending on the main verb.',
          hint: 'After can, keep the bare infinitive.',
          explanation: 'Sing must stay in the base form after can.',
          distractors: ['sings', 'to sing', 'singing', 'can'],
        }),
        createRuleQuestion({
          question: 'Question 5 - Rewrite « We discussed about the problem. »',
          notion: 'Verb pattern and prepositions.',
          rule: 'Some verbs already contain their own complementation pattern and do not need an extra preposition.',
          focus: 'Discuss is followed directly by its object.',
          correction: 'We discussed the problem.',
          conclusion: 'The correction removes the unnecessary preposition and keeps a direct object.',
          hint: 'Check whether the verb already takes a direct object.',
          explanation: 'Discuss is transitive and does not need about in this pattern.',
          distractors: ['about', 'discussed about', 'problem about', 'indirect object'],
        }),
        createRuleQuestion({
          question: 'Question 6 - Explain the difference between « some » and « any » in a short rule sentence.',
          notion: 'Determiners with countable and uncountable nouns.',
          rule: 'Some is common in affirmative statements, while any often appears in negatives, questions or broader unrestricted contexts.',
          focus: 'The choice depends on sentence type and nuance.',
          correction: 'We usually use some in affirmative statements and any in many negatives or questions.',
          conclusion: 'The final rule contrasts positive supply with negative or interrogative openness.',
          hint: 'Do not define the words separately; contrast their uses.',
          explanation: 'A clear answer compares typical sentence environments.',
          distractors: ['always interchangeable', 'plural only', 'past tense', 'article'],
        }),
        createRuleQuestion({
          question: 'Question 7 - Correct « The informations are clear. »',
          notion: 'Uncountable noun with singular agreement.',
          rule: 'Information is uncountable and usually stays singular in standard English.',
          focus: 'The noun itself is the problem.',
          correction: 'The information is clear.',
          conclusion: 'The corrected sentence removes the false plural and restores singular agreement.',
          hint: 'Check whether the noun can normally take s.',
          explanation: 'Information is uncountable, so it takes singular agreement.',
          distractors: ['informations', 'are', 'clearly', 'countable'],
        }),
        createRuleQuestion({
          question: 'Question 8 - Correct « If he will come, tell me. »',
          notion: 'First conditional.',
          rule: 'The if clause of a first conditional stays in the present simple, while the main clause may use an imperative or will.',
          focus: 'The problem is inside the if clause.',
          correction: 'If he comes, tell me.',
          conclusion: 'The corrected sentence uses present simple in the condition and keeps the imperative in the result.',
          hint: 'Do not put will directly after if here.',
          explanation: 'English keeps the real condition in the present simple after if.',
          distractors: ['will come', 'came', 'is coming', 'future in both clauses'],
        }),
        createRuleQuestion({
          question: 'Question 9 - Repair « The report was wrote yesterday. »',
          notion: 'Passive voice and past participle.',
          rule: 'A passive form uses be plus the past participle.',
          focus: 'Write has the participle written.',
          correction: 'The report was written yesterday.',
          conclusion: 'The final sentence restores the passive by combining was with written.',
          hint: 'Choose the past participle, not the past simple.',
          explanation: 'Written is the correct participle after was in the passive.',
          distractors: ['wrote', 'write', 'writing', 'active voice'],
        }),
        createWritingQuestion({
          question: 'Question 10 - Write a long revision conclusion on how to avoid basic grammar mistakes.',
          issue: 'The challenge is to turn isolated grammar rules into a real proofreading method for Terminale students.',
          thesis: 'A reliable proofreading method checks the subject, the tense, the verb pattern and the final wording in a fixed order.',
          axisOne: 'First axis: identify the subject, the time frame and the structure of the sentence.',
          axisTwo: 'Second axis: verify the key danger zones such as auxiliaries, participles, modals and uncountable nouns.',
          finalOpening: 'This method can then support longer exam writing tasks such as summaries, emails and opinion essays.',
          hint: 'End with a method, not with a loose list.',
          explanation: 'A strong final answer synthesises the rules and organises them into a sequence.',
          distractors: ['random advice', 'no order', 'pure vocabulary list', 'outside topic'],
        }),
      ],
    },
    {
      chapterNumber: 1,
      title: 'Long exercise - From sentence correction to structured explanation',
      introduction: 'In this long exercise, you move from short corrections to full written justifications in the style expected at Terminale level.',
      supportText: '',
      instructions: 'Answer every question slowly and fully. Each treatment question contains several refreshes and several blocks per step.',
      questions: [
        createRuleQuestion({
          question: 'Question 1 - Correct « He don t likes noise. »',
          notion: 'Present simple negative and base form.',
          rule: 'After do or does in the negative, the main verb stays in the base form.',
          focus: 'The auxiliary and the lexical verb are both affected.',
          correction: 'He does not like noise.',
          conclusion: 'The correction introduces does not and restores like as a base verb.',
          hint: 'Look at the third person singular negative pattern.',
          explanation: 'Does not takes the base form like, not likes.',
          distractors: ['do not likes', 'likes', 'don t', 'third person plural'],
        }),
        createRuleQuestion({
          question: 'Question 2 - Repair « We was very surprise. »',
          notion: 'Past be and adjective form.',
          rule: 'The auxiliary must agree with the subject and the complement must have the correct adjectival form.',
          focus: 'The subject is plural and the adjective derives from surprise.',
          correction: 'We were very surprised.',
          conclusion: 'The corrected version uses were for the plural subject and surprised as an adjective.',
          hint: 'Check the auxiliary first, then the adjective ending.',
          explanation: 'Were agrees with we, and surprised describes the state of the speakers.',
          distractors: ['was', 'surprise', 'surprising', 'singular'],
        }),
        createRuleQuestion({
          question: 'Question 3 - Correct « She explained me the rule. »',
          notion: 'Verb complementation.',
          rule: 'Explain usually takes an object of thing directly and a person after to.',
          focus: 'The person complement is misplaced.',
          correction: 'She explained the rule to me.',
          conclusion: 'The direct object remains the rule, while me is moved after to.',
          hint: 'Find the thing explained, then place the person after the correct preposition.',
          explanation: 'Explain follows the pattern explain something to someone.',
          distractors: ['explained me', 'to rule', 'direct person object', 'past participle'],
        }),
        createRuleQuestion({
          question: 'Question 4 - Correct « I am agree with you. »',
          notion: 'Fixed expression with agree.',
          rule: 'Agree is usually a lexical verb, not a complement of be in this context.',
          focus: 'The verb agree stands alone.',
          correction: 'I agree with you.',
          conclusion: 'The correction removes the unnecessary auxiliary and keeps agree as the main verb.',
          hint: 'Think of the normal verbal pattern.',
          explanation: 'English says I agree, not I am agree.',
          distractors: ['am agree', 'agreeing', 'agreed with you now', 'be plus adjective'],
        }),
        createRuleQuestion({
          question: 'Question 5 - Rebuild a short rule for regular and irregular past forms.',
          notion: 'Past simple formation.',
          rule: 'Regular verbs add ed, while irregular verbs change form and must be memorised in context.',
          focus: 'The rule contrasts two formation patterns.',
          correction: 'Regular verbs usually take ed, whereas irregular verbs use a learned lexical form.',
          conclusion: 'A safe learner rule therefore separates pattern learning from memorised forms.',
          hint: 'Contrast the two systems in one clean sentence.',
          explanation: 'The answer should show both the pattern and its limit.',
          distractors: ['always ed', 'no irregular verbs', 'present simple', 'plural marker'],
        }),
        createRuleQuestion({
          question: 'Question 6 - Correct « There is many reasons. »',
          notion: 'Existential there and agreement.',
          rule: 'The verb agrees with the noun phrase that follows in standard classroom English.',
          focus: 'The noun phrase reasons is plural.',
          correction: 'There are many reasons.',
          conclusion: 'The plural noun reasons requires are in this sentence.',
          hint: 'Look at the noun after there.',
          explanation: 'Many reasons is plural, so the existential form must be are.',
          distractors: ['is', 'reason', 'many reason', 'singular'],
        }),
        createRuleQuestion({
          question: 'Question 7 - Repair « She enjoys to read poems. »',
          notion: 'Verb followed by a gerund.',
          rule: 'Some verbs, including enjoy, are followed by the ing form.',
          focus: 'The verb enjoy controls the form of the following verb.',
          correction: 'She enjoys reading poems.',
          conclusion: 'The final answer replaces the infinitive with the gerund after enjoys.',
          hint: 'Check the verb pattern of enjoy.',
          explanation: 'Enjoy is followed by reading, not to read.',
          distractors: ['to read', 'reads', 'read', 'infinitive only'],
        }),
        createRuleQuestion({
          question: 'Question 8 - Correct « The news are interesting. »',
          notion: 'Singular agreement with news.',
          rule: 'News is grammatically singular in standard English even if it looks plural.',
          focus: 'The subject news takes singular agreement.',
          correction: 'The news is interesting.',
          conclusion: 'The corrected sentence keeps news and restores singular agreement.',
          hint: 'Do not trust the final s automatically.',
          explanation: 'News behaves like a singular noun in standard usage.',
          distractors: ['are', 'interestingly', 'plural marker', 'uncertain agreement'],
        }),
        createRuleQuestion({
          question: 'Question 9 - Explain why « could » may be softer than « can » in a request.',
          notion: 'Politeness and modal choice.',
          rule: 'A more distant modal often softens the force of a request.',
          focus: 'The contrast concerns tone rather than grammar alone.',
          correction: 'Could often sounds more polite because it creates more distance than can.',
          conclusion: 'Choosing could therefore softens the request and sounds less direct.',
          hint: 'Think of social effect, not only tense.',
          explanation: 'The answer should connect modal choice with interpersonal tone.',
          distractors: ['same force always', 'past time only', 'future certainty', 'plural form'],
        }),
        createWritingQuestion({
          question: 'Question 10 - Write a long concluding paragraph about how to move from correction to explanation in English.',
          issue: 'Students often correct isolated mistakes without understanding the pattern that produced them.',
          thesis: 'A strong learner first names the rule, then applies it, and finally rewrites the sentence in a complete and justified form.',
          axisOne: 'First axis: identify the structure involved, such as tense, agreement, complementation or modality.',
          axisTwo: 'Second axis: turn the correction into an explicit verbal explanation that can be reused in later writing tasks.',
          finalOpening: 'This habit prepares students not only for grammar drills but also for longer exam writing and oral justification.',
          hint: 'Conclude by showing the transfer value of the method.',
          explanation: 'The paragraph should transform grammar knowledge into a reusable method.',
          distractors: ['pure correction only', 'no explanation', 'outside the lesson', 'random examples'],
        }),
      ],
    },
  ];
}

function buildEnglishAdvancedExercises() {
  const readingOne = 'Text support: A student journalist describes a school that has become fully digital. Tablets replace notebooks, announcements arrive through apps, and homework is submitted online. Yet the narrator wonders whether constant connection also creates distraction, fatigue and a weaker sense of shared attention in the classroom.';
  const readingTwo = 'Text support: In an opinion column, a writer argues that language shapes responsibility. According to the article, vague words hide the truth, while precise language helps people judge events fairly. The writer warns against slogans that reduce complex situations to quick emotional reactions.';

  return [
    {
      chapterNumber: 3,
      title: 'Long exercise - Reading comprehension, grammar and opinion paragraph',
      introduction: 'Read the text carefully and answer as if you were preparing for a long Terminale task in English.',
      supportText: readingOne,
      instructions: 'Each question contains several refreshes. Build precise, long answers step by step.',
      questions: [
        createComprehensionQuestion({
          question: 'Question 1 - Identify the main issue raised by the text.',
          cue: 'The text questions the cost of permanent digital connection at school.',
          evidence: 'The narrator wonders whether constant connection also creates distraction and fatigue.',
          interpretation: 'The article does not reject technology completely, but it doubts its educational balance.',
          reformulation: 'Digital tools are useful, yet they may weaken attention and classroom presence.',
          conclusion: 'The main issue is therefore the tension between digital efficiency and the quality of learning attention.',
          hint: 'Look for the contrast in the final part of the text.',
          explanation: 'A strong answer names both the benefit and the concern.',
          distractors: ['pure praise', 'no issue', 'sports article', 'historical narrative'],
        }),
        createComprehensionQuestion({
          question: 'Question 2 - Explain the role of « yet » in the text.',
          cue: 'Yet introduces a critical turn.',
          evidence: 'Yet the narrator wonders whether constant connection also creates distraction.',
          interpretation: 'The connector shifts the reader from descriptive facts to evaluation and doubt.',
          reformulation: 'It breaks the positive digital picture and opens the debate.',
          conclusion: 'Yet functions as the pivot from apparent progress to critical questioning.',
          hint: 'Compare what comes before and after the connector.',
          explanation: 'The value of the connector depends on the argumentative movement.',
          distractors: ['addition', 'chronology', 'conclusion', 'example only'],
        }),
        createRuleQuestion({
          question: 'Question 3 - Rewrite « homework is submitted online » in the active voice.',
          notion: 'Passive and active voice transformation.',
          rule: 'The passive highlights the action or the result, while the active restores the agent.',
          focus: 'The hidden agent is students.',
          correction: 'Students submit homework online.',
          conclusion: 'The active voice brings the learners back as explicit actors of the action.',
          hint: 'Who performs the action in the school context?',
          explanation: 'The active subject students makes the action direct and concrete.',
          distractors: ['homework submits', 'online is submitted', 'passive only', 'teacher submits'],
        }),
        createRuleQuestion({
          question: 'Question 4 - Correct « Tablets replaces notebooks. »',
          notion: 'Subject verb agreement.',
          rule: 'A plural subject takes the base plural verb form in the present simple.',
          focus: 'The subject Tablets is plural.',
          correction: 'Tablets replace notebooks.',
          conclusion: 'The plural subject requires replace without s.',
          hint: 'Check the number of the subject.',
          explanation: 'Replace agrees with tablets in the plural.',
          distractors: ['replaces', 'notebooks', 'tablet', 'singular subject'],
        }),
        createComprehensionQuestion({
          question: 'Question 5 - Show how the text links technology and distraction.',
          cue: 'The text moves from efficiency to attention loss.',
          evidence: 'Announcements arrive through apps, yet constant connection creates distraction.',
          interpretation: 'The same tools that simplify school life may also fragment concentration.',
          reformulation: 'Convenience and distraction come from the same digital environment.',
          conclusion: 'The text links technology and distraction by showing that utility and mental overload coexist.',
          hint: 'Do not separate the positive and negative details; connect them.',
          explanation: 'The answer should explain the paradox rather than list facts.',
          distractors: ['technology only positive', 'no link', 'simple description', 'outside topic'],
        }),
        createWritingQuestion({
          question: 'Question 6 - Write an opinion paragraph: « Can digital tools improve learning? »',
          issue: 'The debate opposes practical efficiency to risks for concentration and shared attention.',
          thesis: 'Digital tools can improve learning if they remain structured, limited and guided by clear classroom goals.',
          axisOne: 'First axis: digital tools save time, centralise resources and support access to information.',
          axisTwo: 'Second axis: they can also multiply distraction unless teachers organise their use carefully.',
          finalOpening: 'A final opening can ask how schools might combine innovation with deeper forms of attention.',
          hint: 'Build a balanced opinion, not a one-word answer.',
          explanation: 'The paragraph should combine usefulness, limits and conditions.',
          distractors: ['yes only', 'no only', 'no structure', 'random examples'],
        }),
        createWritingQuestion({
          question: 'Question 7 - Prepare a mini essay plan on attention in the classroom.',
          issue: 'The essay must examine whether tools help students learn or simply keep them busy.',
          thesis: 'Attention remains the core condition of learning, so technology must be judged by its effect on concentration.',
          axisOne: 'Axis 1: some digital tools improve access, feedback and organisation.',
          axisTwo: 'Axis 2: without limits, the same tools can scatter focus and weaken shared classroom time.',
          finalOpening: 'The opening may extend the debate to home study and personal discipline.',
          hint: 'State an issue, then organise two clear directions.',
          explanation: 'A plan should show tension, not a flat list.',
          distractors: ['single example only', 'no issue', 'three unrelated topics', 'off topic'],
        }),
        createWritingQuestion({
          question: 'Question 8 - Write the opening of an argumentative essay on digital school life.',
          issue: 'The introduction must start from a broad social observation and move toward the educational question.',
          thesis: 'Digital school life promises speed and access, but it also raises serious questions about fatigue, distraction and collective attention.',
          axisOne: 'Move 1: start from the visible spread of screens in education.',
          axisTwo: 'Move 2: show that the real issue concerns the quality of learning attention.',
          finalOpening: 'The final sentence of the introduction may then formulate the debate in a sharp way.',
          hint: 'Move from context to problem without giving the full answer too early.',
          explanation: 'A good introduction frames the issue before arguing it.',
          distractors: ['answer immediately', 'history only', 'no problem', 'list of devices'],
        }),
        createWritingQuestion({
          question: 'Question 9 - Write the conclusion of an essay on digital tools and learning.',
          issue: 'The conclusion must answer the question clearly while keeping a nuanced final tone.',
          thesis: 'Digital tools become valuable only when they support attention instead of replacing it.',
          axisOne: 'Reminder 1: technological efficiency can help learning when it remains purposeful.',
          axisTwo: 'Reminder 2: attention, depth and classroom presence remain essential human conditions.',
          finalOpening: 'The final opening may ask how future schools can protect attention while innovating.',
          hint: 'Synthesis first, opening second.',
          explanation: 'The conclusion should close the debate before extending it carefully.',
          distractors: ['new argument', 'pure repetition', 'outside topic', 'no answer'],
        }),
        createWritingQuestion({
          question: 'Question 10 - Take a long personal position on distraction and study habits.',
          issue: 'The answer must connect personal experience to a broader reflection on attention and responsibility.',
          thesis: 'Students need not reject digital tools, but they must learn to control the rhythm, place and purpose of their use.',
          axisOne: 'First axis: tools are helpful when they organise work and provide clear resources.',
          axisTwo: 'Second axis: they become harmful when they fill every pause and break concentration.',
          finalOpening: 'A final opening may focus on the role of schools in teaching digital discipline.',
          hint: 'Use a personal position, but keep an academic structure.',
          explanation: 'A strong answer links experience, argument and educational reflection.',
          distractors: ['story only', 'no structure', 'pure slogan', 'outside context'],
        }),
      ],
    },
    {
      chapterNumber: 4,
      title: 'Long exercise - Precision of language, summary and essay writing',
      introduction: 'This long task combines reading, language analysis, rewriting and full essay preparation at Terminale level.',
      supportText: readingTwo,
      instructions: 'Use the brouillon to organise your reasoning, then validate each refresh before moving on.',
      questions: [
        createComprehensionQuestion({
          question: 'Question 1 - State the main claim of the opinion column.',
          cue: 'Precise language supports fair judgement and responsibility.',
          evidence: 'Precise language helps people judge events fairly.',
          interpretation: 'The writer connects linguistic precision to ethical and civic responsibility.',
          reformulation: 'Words matter because they shape how people understand and judge reality.',
          conclusion: 'The central claim is that precise language protects both truth and responsible judgement.',
          hint: 'Find the broadest statement that organises the whole text.',
          explanation: 'The answer should move from wording to civic meaning.',
          distractors: ['language is decorative only', 'precision is useless', 'pure narrative', 'no claim'],
        }),
        createComprehensionQuestion({
          question: 'Question 2 - Explain why vague words are criticised.',
          cue: 'Vague words hide complexity and blur responsibility.',
          evidence: 'Vague words hide the truth.',
          interpretation: 'Imprecision allows people to avoid naming actions and consequences clearly.',
          reformulation: 'The writer criticises vagueness because it weakens honest judgement.',
          conclusion: 'Vague language is criticised because it can protect confusion more than truth.',
          hint: 'Link the vocabulary judgement to the ethical issue.',
          explanation: 'A good answer shows both the linguistic and moral dimensions of vagueness.',
          distractors: ['vague words are poetic', 'vagueness creates clarity', 'neutral style', 'pure humour'],
        }),
        createRuleQuestion({
          question: 'Question 3 - Correct « precise words helps people judge ». ',
          notion: 'Plural subject with present simple.',
          rule: 'A plural subject takes the base plural verb form in the present simple.',
          focus: 'The subject precise words is plural.',
          correction: 'Precise words help people judge.',
          conclusion: 'The verb loses the singular s because the subject is plural.',
          hint: 'Identify the subject before checking the verb ending.',
          explanation: 'Words is plural, so the verb is help, not helps.',
          distractors: ['helps', 'word', 'judges', 'singular subject'],
        }),
        createRuleQuestion({
          question: 'Question 4 - Rewrite « slogans reduce complex situations to quick emotional reactions » as a passive sentence.',
          notion: 'Active to passive transformation.',
          rule: 'The passive changes focus by making the object the new subject and using be plus past participle.',
          focus: 'Complex situations becomes the new grammatical starting point.',
          correction: 'Complex situations are reduced to quick emotional reactions by slogans.',
          conclusion: 'The passive keeps the meaning while shifting attention to the affected situation.',
          hint: 'Promote the object to subject position.',
          explanation: 'Are reduced is the correct passive present form here.',
          distractors: ['is reduced', 'reduce by slogans', 'active voice only', 'quickly reduce'],
        }),
        createComprehensionQuestion({
          question: 'Question 5 - Show how the text links language and responsibility.',
          cue: 'The text treats naming as a moral act.',
          evidence: 'Language shapes responsibility.',
          interpretation: 'Choosing words precisely means accepting the effort to judge reality honestly.',
          reformulation: 'Speech becomes responsible when it refuses shortcuts and slogans.',
          conclusion: 'The article links language and responsibility by making precision a condition of fair judgement.',
          hint: 'Think beyond style: what does language do to judgement?',
          explanation: 'The answer must move from wording to ethical consequence.',
          distractors: ['style only', 'no ethics', 'pure grammar', 'outside topic'],
        }),
        createWritingQuestion({
          question: 'Question 6 - Write a paragraph on why precise language matters in public debate.',
          issue: 'Public debate may become unfair when language is vague, emotional or manipulative.',
          thesis: 'Precise language matters because it names facts clearly, protects judgement and resists emotional simplification.',
          axisOne: 'First axis: precision helps identify facts, actors and responsibilities more accurately.',
          axisTwo: 'Second axis: precision resists slogans and prevents quick emotional reactions from replacing thought.',
          finalOpening: 'A final opening can ask what schools should do to train careful speakers and readers.',
          hint: 'Build a civic argument, not a dictionary definition.',
          explanation: 'The answer should connect language to truth, judgement and responsibility.',
          distractors: ['style only', 'no civic angle', 'pure emotion', 'random vocabulary'],
        }),
        createWritingQuestion({
          question: 'Question 7 - Prepare a summary plan of the article in clear English.',
          issue: 'A summary must keep the argument while removing examples that are not essential.',
          thesis: 'The article argues that precise language is necessary for fair judgement and responsible civic life.',
          axisOne: 'Step 1: keep the link between vague language and hidden truth.',
          axisTwo: 'Step 2: keep the link between precise language and fair judgement.',
          finalOpening: 'The summary may close by noting the danger of slogans and instant reactions.',
          hint: 'Think in terms of argument hierarchy.',
          explanation: 'A summary keeps the skeleton of the reasoning, not every detail.',
          distractors: ['all details equal', 'copy full sentences', 'outside topic', 'no structure'],
        }),
        createWritingQuestion({
          question: 'Question 8 - Write the introduction of an essay on language and truth.',
          issue: 'The introduction must show that word choice is not neutral in public life.',
          thesis: 'Because language frames perception, precise wording can serve truth while vague wording can protect confusion or irresponsibility.',
          axisOne: 'Move 1: start from the common belief that words simply describe reality.',
          axisTwo: 'Move 2: show that words also orient judgement and moral responsibility.',
          finalOpening: 'The problem can then become: how does linguistic precision shape public truth?',
          hint: 'Move from an obvious observation to a sharper problem.',
          explanation: 'A strong introduction gradually intensifies the issue.',
          distractors: ['answer first', 'no problem', 'history lesson only', 'word list'],
        }),
        createWritingQuestion({
          question: 'Question 9 - Write the conclusion of an essay on slogans and complexity.',
          issue: 'The conclusion must answer the question and avoid turning complexity into another slogan.',
          thesis: 'Slogans may mobilise quickly, but they often damage complexity, precision and responsibility.',
          axisOne: 'Reminder 1: slogans simplify and accelerate reaction.',
          axisTwo: 'Reminder 2: careful language restores complexity and fair judgement.',
          finalOpening: 'The final opening may ask how democratic debate can remain accessible without becoming simplistic.',
          hint: 'Answer first, open after.',
          explanation: 'The conclusion should balance firmness with nuance.',
          distractors: ['new major point', 'no answer', 'pure repetition', 'outside politics'],
        }),
        createWritingQuestion({
          question: 'Question 10 - Take a long personal position on the role of language in responsibility.',
          issue: 'The response must combine personal conviction, social reflection and precise organisation.',
          thesis: 'Language matters because careless words can distort events, while precise language makes judgement slower, fairer and more accountable.',
          axisOne: 'First axis: words name facts, actors and responsibilities in a concrete way.',
          axisTwo: 'Second axis: words also influence emotional reaction, so precision protects critical distance.',
          finalOpening: 'A final opening can focus on education, media and the duty to speak accurately.',
          hint: 'Keep a personal voice, but write like a Terminale essay.',
          explanation: 'The answer should mix conviction, structure and conceptual clarity.',
          distractors: ['story only', 'no structure', 'pure slogan', 'outside language'],
        }),
      ],
    },
  ];
}

function attachExercises(chapters, exercises) {
  const grouped = new Map();
  exercises.forEach((exercise) => {
    const list = grouped.get(exercise.chapterNumber) || [];
    list.push(exercise);
    grouped.set(exercise.chapterNumber, list);
  });

  return chapters.map((chapter) => ({
    ...chapter,
    exercises: grouped.get(chapter.number) || [],
  }));
}

const FRENCH_CHAPTERS = attachExercises(FRENCH_QUIZ_CHAPTERS, [
  ...buildFrenchExercises(),
  ...buildFrenchAdvancedExercises(),
]);

const ENGLISH_CHAPTERS = attachExercises(ENGLISH_QUIZ_CHAPTERS, [
  ...buildEnglishExercises(),
  ...buildEnglishAdvancedExercises(),
]);

const MASSIVE_DOWNLOADABLE_EXAMPLES = [
  ...buildQuizPackEntries(FRENCH_CHAPTERS, 2),
  ...buildExercisePackEntries(FRENCH_CHAPTERS, 2),
  ...buildQuizPackEntries(ENGLISH_CHAPTERS, 2),
  ...buildExercisePackEntries(ENGLISH_CHAPTERS, 2),
];

function firstPayloadByKind(entries, matcher) {
  for (const entry of entries) {
    const file = (entry.files || []).find((candidate) => matcher(candidate?.payload || {}));
    if (file) return file.payload;
  }
  return null;
}

const firstFrenchSuggestion = firstPayloadByKind(MASSIVE_DOWNLOADABLE_EXAMPLES, (payload) => payload.kind === 'quiz_mode_suggestion' && payload.chapterTitle === 'Bases orthographiques et accords');
const firstFrenchExerciseFiles = MASSIVE_DOWNLOADABLE_EXAMPLES
  .find((entry) => entry.id === 'francais-exercise-pack-1')
  ?.files || [];
const firstEnglishSuggestion = firstPayloadByKind(MASSIVE_DOWNLOADABLE_EXAMPLES, (payload) => payload.kind === 'quiz_mode_suggestion' && payload.chapterTitle === 'Foundations and everyday grammar');
const firstEnglishExerciseFiles = MASSIVE_DOWNLOADABLE_EXAMPLES
  .find((entry) => entry.id === 'anglais-exercise-pack-1')
  ?.files || [];

export const MASSIVE_LANGUAGE_EXAMPLE_IMPORT_FILES = [
  firstFrenchSuggestion ? {
    id: 'fr_terminale_quiz_massif_suggestion',
    category: 'Terminale massif',
    label: 'Français Terminale · Quiz suggestion',
    description: 'Extrait d un pack massif de quiz Terminale en Français.',
    payload: firstFrenchSuggestion,
  } : null,
  ...firstFrenchExerciseFiles.map((file, index) => ({
    id: `fr_terminale_exercice_long_${index + 1}`,
    category: 'Terminale massif',
    label: `Français Terminale · ${file.label}`,
    description: 'Extrait d un exercice long Terminale en Français.',
    payload: file.payload,
  })),
  firstEnglishSuggestion ? {
    id: 'en_terminale_quiz_massif_suggestion',
    category: 'Terminale massif',
    label: 'Anglais Terminale · Quiz suggestion',
    description: 'Extrait d un pack massif de quiz Terminale en Anglais.',
    payload: firstEnglishSuggestion,
  } : null,
  ...firstEnglishExerciseFiles.map((file, index) => ({
    id: `en_terminale_exercice_long_${index + 1}`,
    category: 'Terminale massif',
    label: `Anglais Terminale · ${file.label}`,
    description: 'Extrait d un exercice long Terminale en Anglais.',
    payload: file.payload,
  })),
].filter(Boolean);

export const MASSIVE_LANGUAGE_DOWNLOADABLE_EXAMPLES = MASSIVE_DOWNLOADABLE_EXAMPLES;

export const LANGUAGE_PROMPT_BANK_EXTENSIONS = [
  {
    id: 'prompt_terminale_langues_quiz_massif',
    title: 'Prompt Bank — Terminale Français / Anglais, quiz massifs',
    description: 'Structure un volume massif par chapitres et items nommés, avec 5 modes complets et 100 questions minimum par mode pour chaque matière.',
    prompt: `Tu es un générateur strict de JSON pour une application scolaire mobile. Tu dois produire des quiz massifs pour Terminale en Français ou en Anglais, sans markdown et sans commentaire.

Objectif de volume :
- Pour UNE matière, produire au minimum 4 chapitres.
- Dans chaque chapitre, produire 5 items de quiz nommés.
- Dans chaque item, produire exactement 5 questions par mode.
- Comme il y a 5 modes, cela donne 25 questions par mode et par chapitre, soit au moins 100 questions par mode pour la matière complète.
- Répète ensuite le même niveau d exigence pour l autre matière.

Organisation obligatoire :
- Même chapterNumber, chapterTitle et title exacts entre les 5 fichiers d un même item.
- Les chapitres doivent aller des bases vers l avancé.
- Les items doivent être nommés précisément pour éviter des chapitres trop nombreux.
- Les thèmes Terminale peuvent commencer par des bases : pluriel, accords, homophones, grammar, vocabulary, conjugation, verb tenses, relative clauses, conditionals, etc.

Formats obligatoires :
- Mode 1 : kind = "quiz_mode_suggestion"
- Mode 2 : kind = "quiz_mode_input"
- Mode 3 : kind = "quiz_mode_trap"
- Mode 4 : kind = "quiz_mode_duel_intrus"
- Mode 5 : kind = "quiz_mode_deminage"

Contraintes de qualité :
- Chaque question doit être directement jouable dans l application.
- Le mode Input doit proposer entre 2 et 4 blockOptions, avec exactement une bonne réponse.
- Le mode Pièges doit contenir de vrais distracteurs plausibles.
- Le Duel de l Intrus doit opposer une forme correcte à un intrus extrêmement proche.
- Le Déminage doit corriger une chaîne préremplie bloc par bloc.
- Les explications doivent être pédagogiques, courtes et exactes.
- Les hints doivent pointer la règle utile sans donner immédiatement toute la réponse.

Contraintes de cohérence :
- Les 5 modes d un même item doivent porter sur les mêmes notions.
- Les bonnes réponses ne doivent pas se contredire d un mode à l autre.
- Le JSON doit être immédiatement interprétable par l application.
- Réponds uniquement avec du JSON pur.`
  },
  {
    id: 'prompt_terminale_langues_exercices_longs',
    title: 'Prompt Bank — Terminale Français / Anglais, exercices longs',
    description: 'Construit de vrais exercices longs avec texte support, 10 à 14 questions, plusieurs étapes, plusieurs rafraîchissements et banques de 2 à 5 blocs.',
    prompt: `Tu es un générateur strict de JSON pour des exercices scolaires longs de Terminale en Français ou en Anglais. Tu dois produire exactement 3 fichiers JSON distincts pour chaque exercice : Enoncé, Brouillon, Traitement.

Objectif pédagogique :
- Chaque exercice contient au minimum 5 questions, et en pratique vise 10 à 14 questions.
- La moyenne visée est environ 12 questions par exercice.
- Les exercices doivent être longs, progressifs et exigeants.
- Les sujets peuvent combiner compréhension de texte, vocabulaire, grammaire, conjugaison, argumentation, commentaire, dissertation, opinion essay, summary, formal email, etc.
- Certains exercices doivent demander une production longue de type dissertation ou essai argumentatif, mais le traitement reste guidé par blocs et rafraîchissements.

Organisation obligatoire :
- Regrouper les exercices par chapitres.
- Limiter le nombre de chapitres en utilisant plusieurs items nommés par chapitre.
- Commencer par des bases solides avant d aller vers les tâches Terminale longues.

Format du Brouillon :
- Chaque question doit contenir un vrai tableau steps.
- Prévois au moins 3 étapes par question.
- Les steps doivent annoncer une vraie méthode, pas une simple paraphrase.

Format du Traitement :
- kind = "exercice_traitement"
- Toutes les questions sont de type "block-input".
- Utilise refreshes, rafraichissements ou lines.
- Chaque question doit comporter plusieurs rafraîchissements.
- Plusieurs rafraîchissements peuvent appartenir à la même étape de brouillon via stepIndex.
- Pour une étape, prévois souvent 2 rafraîchissements ou plus avant de passer à l étape suivante.
- Le traitement doit donc suivre la logique : étape -> plusieurs rafraîchissements -> étape suivante.

Banque de blocs :
- La suggestion visible à chaque micro-validation ne doit jamais dépasser 5 blocs.
- Elle doit toujours proposer au moins 2 blocs.
- Utilise dynamicBank pour piloter ces banques courtes de 2 à 5 blocs.
- Le suggestionPool global peut être plus large, mais chaque entrée de dynamicBank.size doit rester entre 2 et 5.
- Les distracteurs doivent être crédibles et proches des erreurs réelles d élèves.

Exigences de qualité :
- L Enoncé peut contenir un texte support long à comprendre.
- Les réponses du traitement doivent être longues, progressives et scolaires.
- Chaque question doit produire une rédaction visible et exploitable dans la zone centrale.
- Les conclusions doivent être propres et sans ambiguïté.
- Les réponses longues de type dissertation doivent être découpées en plusieurs rafraîchissements : enjeu, problématique, axe 1, axe 2, formulation de conclusion, ouverture.

Contraintes techniques :
- Le JSON doit rester directement interprétable par l application.
- Chaque ligne ou rafraîchissement doit fournir correctBlocks, suggestionPool, dynamicBank, hint éventuel, explanation éventuelle.
- Réponds uniquement avec du JSON pur.`
  },
];
