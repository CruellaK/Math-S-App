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

function replaceAnswerWithBlank(sentence = '', answer = '') {
  const replaced = replaceWholeToken(sentence, answer, '_____');
  if (replaced !== sentence && replaced.includes('_____')) return replaced;
  const source = String(sentence || '');
  const target = String(answer || '').trim();
  if (target && source.includes(target)) return source.replace(target, '_____');
  return `${source} _____`.trim();
}

function isGenericQuizPrompt(prompt = '') {
  return /choisissez|rep[eé]rez|forme exacte|bonne r[eé]ponse|r[eé]daction juste|phrase correcte|proposition correcte/i.test(String(prompt || ''));
}

function buildContextualQuizPrompt(entry) {
  const correct = String(entry.correct || '');
  const answer = String(entry.answer || '');
  const hint = String(entry.hint || '');
  if (answer && correct) return `Dans « ${replaceAnswerWithBlank(correct, answer)} », quel élément convient compte tenu de la règle : ${hint || 'justifiez le choix avec la méthode du cours'} ?`;
  if (correct) return `Quelle proposition respecte précisément la méthode attendue dans ce contexte : « ${correct} » ?`;
  return entry.prompt || 'Analysez le contexte puis sélectionnez la proposition cohérente.';
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
  const contextualPrompt = isGenericQuizPrompt(prompt) ? buildContextualQuizPrompt({ correct, answer, hint, prompt }) : prompt;
  const safeDuelTrap = duelTrap || safeOptions.find((option) => option !== answer) || safeWrongs[0] || answer;
  return {
    prompt: contextualPrompt,
    correct,
    wrongs: safeWrongs,
    answer,
    blockOptions: safeOptions,
    hint,
    explanation,
    duelTrap: safeDuelTrap,
    trapPrompt: trapPrompt || 'Repérez les formulations fautives.',
    duelPrompt: duelPrompt || `Entre « ${answer} » et « ${safeDuelTrap} », lequel complète correctement « ${replaceAnswerWithBlank(correct, answer)} » ?`,
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
    text: replaceAnswerWithBlank(entry.correct, entry.answer),
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
    text: entry.duelPrompt || entry.prompt,
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
      chapterDescription: chapter.description || '',
      title: item.title,
      description: item.description || '',
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

function buildSujetTypeFiles(chapter, exercise, subjectCoefficient = 1) {
  return buildExerciseFiles(chapter, exercise, subjectCoefficient).map((file) => ({
    ...file,
    filename: file.filename
      .replace('_enonce.json', '_sujet_type_enonce.json')
      .replace('_brouillon.json', '_sujet_type_brouillon.json')
      .replace('_traitement.json', '_sujet_type_traitement.json'),
    payload: {
      ...file.payload,
      kind: file.payload.kind.replace('exercice_', 'sujet_type_'),
    },
  }));
}

function buildQuizPackEntries(chapters, subjectCoefficient) {
  return chapters.map((chapter) => ({
    id: `${slugify(chapter.subject)}-quiz-pack-${chapter.number}`,
    title: `${chapter.subject} · ${chapter.title} · Quiz 5 modes`,
    description: `${chapter.quizItems.length} items nommés, 5 modes complets et questions contextualisées dans ce chapitre.`,
    files: chapter.quizItems.flatMap((item) => buildQuizFilesForItem(chapter, item, subjectCoefficient)),
  }));
}

function buildExercisePackEntries(chapters, subjectCoefficient) {
  return chapters.map((chapter) => ({
    id: `${slugify(chapter.subject)}-exercise-pack-${chapter.number}`,
    title: `${chapter.subject} · ${chapter.title} · Exercices longs`,
    description: `${chapter.exercises.length} exercices longs, questions multiples, brouillon obligatoire et traitements à rafraîchissements successifs.`,
    files: chapter.exercises.flatMap((exercise) => buildExerciseFiles(chapter, exercise, subjectCoefficient)),
  }));
}

function buildSujetTypePackEntries(chapters, subjectCoefficient) {
  return chapters.filter((chapter) => chapter.sujetTypes?.length).map((chapter) => ({
    id: `${slugify(chapter.subject)}-sujet-type-pack-${chapter.number}`,
    title: `${chapter.subject} · ${chapter.title} · Sujets types longs`,
    description: `${chapter.sujetTypes.length} sujet(s) type(s) long(s), enoncé développé, brouillon méthodique et traitement très guidé.`,
    files: chapter.sujetTypes.flatMap((exercise) => buildSujetTypeFiles(chapter, exercise, subjectCoefficient)),
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

// ════════════════════════════════════════════════════════════════════
// EXTENSIONS DE CONTENU — Phase B : nouveaux items FR (chapitres existants)
// Chaque chapitre existant FR reçoit ici 2 à 3 nouveaux items thématiques
// qui COMPLETENT (ne remplacent pas) les items déjà présents.
// Règle : majorité 5 questions par item, ~30% à 10 questions.
// Le helper fc() wrappe createSentenceCase pour réduire la verbosité.
// ════════════════════════════════════════════════════════════════════

function fc(prompt, correct, wrongs, answer, blockOptions, hint, explanation) {
  return createSentenceCase({ prompt, correct, wrongs, answer, blockOptions, hint, explanation });
}

// Annoter les chapitres FR existants avec une description courte
FRENCH_QUIZ_CHAPTERS[0].description = 'Bases du français écrit : accords nom/adjectif/verbe, pluriels, homophones, participes passés. Niveau collège-lycée.';
FRENCH_QUIZ_CHAPTERS[1].description = 'Grammaire avancée et conjugaison : temps simples et composés, modes, pronoms, connecteurs logiques. Niveau lycée.';
FRENCH_QUIZ_CHAPTERS[2].description = 'Compréhension fine, vocabulaire d analyse, figures de style, registres et ponctuation argumentative. Niveau lycée-Terminale.';
FRENCH_QUIZ_CHAPTERS[3].description = 'Méthodologie de la dissertation et du commentaire : problématique, plan, citations, transitions, ouvertures. Niveau Terminale.';

// Annoter aussi les items existants FR (descriptions courtes)
const FR_EXISTING_DESCRIPTIONS = {
  1: {
    'Accords du nom et de l adjectif': 'Accord en genre et en nombre de l adjectif avec le nom qu il qualifie.',
    'Pluriel simple et marques du nombre': 'Marques du pluriel des noms communs, y compris pluriels irréguliers (chevaux, journaux).',
    'Homophones grammaticaux': 'Distinction des homophones courants : a/à, ou/où, ces/ses, etc.',
    'Accord sujet verbe': 'Accord du verbe avec son sujet, y compris sujets éloignés et inversés.',
    'Participe passé avec avoir': 'Règle de l accord du participe passé avec avoir et le COD antéposé.',
  },
  2: {
    'Temps simples et valeurs du présent': 'Présent de l indicatif : valeurs descriptive, narrative, de vérité générale.',
    'Imparfait, passé simple et narration': 'Distinction des temps du récit, valeurs aspectuelles dans le passé.',
    'Futur et conditionnel': 'Conjugaison et emploi du futur simple et du conditionnel présent.',
    'Pronoms relatifs et reprises': 'Choix entre qui, que, dont, où selon la fonction du relatif.',
    'Connecteurs et phrase complexe': 'Articulation des phrases complexes par des connecteurs logiques.',
  },
  3: {
    'Lexique de la thèse et de l argument': 'Vocabulaire technique de l argumentation : thèse, antithèse, concession.',
    'Figures de style': 'Identification des principales figures : métaphore, anaphore, antithèse, etc.',
    'Registres et tonalités': 'Reconnaissance des registres soutenu, courant, familier et des tonalités.',
    'Reformulation et précision du vocabulaire': 'Choix du mot juste et reformulation synonymique précise.',
    'Ponctuation et enchaînement logique': 'Effet sémantique de la ponctuation dans une phrase argumentative.',
  },
  4: {
    'Annonce de la problématique': 'Formulation d une problématique de dissertation à partir d un sujet.',
    'Annonce du plan': 'Annonce structurée du plan en deux ou trois parties.',
    'Citation et analyse': 'Insertion d une citation et amorce d analyse littéraire.',
    'Ouvertures et conclusions longues': 'Rédaction d une conclusion étoffée avec ouverture finale.',
    'Transitions de dissertation': 'Phrases de transition entre les parties d une dissertation.',
  },
};
FRENCH_QUIZ_CHAPTERS.forEach((chapter) => {
  const map = FR_EXISTING_DESCRIPTIONS[chapter.number] || {};
  chapter.quizItems.forEach((item) => {
    if (!item.description && map[item.title]) item.description = map[item.title];
  });
});

// ─── Chapitre 1 — 3 nouveaux items ───────────────────────────────────
FRENCH_QUIZ_CHAPTERS[0].quizItems.push(
  {
    title: 'Adjectifs de couleur et invariabilité',
    description: 'Cas particulier des adjectifs de couleur : règle générale d accord et exceptions invariables (orange, marron, kaki, noms employés comme couleurs).',
    cases: [
      fc('Choisissez la forme correcte.',
        'Des chaussures orange complétaient sa tenue.',
        ['Des chaussures oranges complétaient sa tenue.', 'Des chaussure orange complétaient sa tenue.', 'Des chaussures orange complétait sa tenue.'],
        'orange', ['orange', 'oranges', 'orangé', 'orangés'],
        'Orange est un nom employé comme adjectif de couleur, donc invariable.',
        'Les noms de fruits ou objets employés comme couleurs (orange, marron, kaki) restent invariables.'),
      fc('Choisissez la phrase correctement accordée.',
        'Elle portait des robes bleues à pois blancs.',
        ['Elle portait des robe bleues à pois blancs.', 'Elle portait des robes bleu à pois blancs.', 'Elle portait des robes bleues à pois blanc.'],
        'bleues', ['bleues', 'bleu', 'bleus', 'bleue'],
        'Bleu est un adjectif de couleur simple, il s accorde.',
        'Les adjectifs de couleur simples (bleu, vert, rouge) s accordent avec le nom.'),
      fc('Choisissez la forme exacte.',
        'Ses cheveux châtain clair lui allaient bien.',
        ['Ses cheveux châtains clairs lui allaient bien.', 'Ses cheveux châtain clairs lui allaient bien.', 'Ses cheveu châtain clair lui allaient bien.'],
        'châtain clair', ['châtain clair', 'châtains clairs', 'châtains clair', 'châtain clairs'],
        'Quand un adjectif de couleur est complété, l ensemble reste invariable.',
        'Les adjectifs de couleur composés ou complétés (bleu marine, châtain clair, vert pomme) sont invariables.'),
      fc('Repérez la phrase correcte.',
        'Les murs vert d eau apaisaient la pièce.',
        ['Les murs verts d eau apaisaient la pièce.', 'Les murs vert d eaux apaisaient la pièce.', 'Le murs vert d eau apaisaient la pièce.'],
        'vert d eau', ['vert d eau', 'verts d eau', 'verts d eaux', 'verte d eau'],
        'L expression vert d eau reste invariable.',
        'Les couleurs précisées par un complément (d eau, pomme, citron) sont invariables.'),
      fc('Choisissez la rédaction juste.',
        'Des écharpes marron pendaient au porte-manteau.',
        ['Des écharpes marrons pendaient au porte-manteau.', 'Des écharpe marron pendaient au porte-manteau.', 'Des écharpes marron pendait au porte-manteau.'],
        'marron', ['marron', 'marrons', 'marronne', 'marronnes'],
        'Marron est un nom employé comme adjectif de couleur, donc invariable.',
        'Marron, comme orange ou kaki, ne prend ni s ni e quand il sert d adjectif.'),
    ],
  },
  {
    title: 'Accents, diacritiques et homophones',
    description: 'Accents aigus, graves et circonflexes : différences de sens (a/à, ou/où, du/dû, sur/sûr) et corrections d accents fréquents.',
    cases: [
      fc('Choisissez la forme exacte.',
        'Il faut être sûr de son choix avant de signer.',
        ['Il faut être sur de son choix avant de signer.', 'Il faut être sûre de son choix avant de signer.', 'Il faut être sûr de son choix avant de signé.'],
        'sûr', ['sûr', 'sur', 'sûre', 'sure'],
        'Sûr (avec accent) signifie certain, alors que sur sans accent est une préposition.',
        'L accent circonflexe distingue sûr (certain) de sur (préposition).'),
      fc('Choisissez la forme correcte.',
        'Ce livre, je l ai lu là où personne ne va.',
        ['Ce livre, je l ai lu la où personne ne va.', 'Ce livre, je l ai lu là ou personne ne va.', 'Ce livre, je l ai lu la ou personne ne va.'],
        'là où', ['là où', 'la où', 'là ou', 'la ou'],
        'Là est un adverbe de lieu (accent grave), où est un pronom relatif de lieu.',
        'Là (lieu) avec accent et où (lieu) avec accent permettent de marquer un endroit précis.'),
      fc('Choisissez la phrase correctement accentuée.',
        'Il a dû partir tôt à cause de la pluie.',
        ['Il a du partir tôt à cause de la pluie.', 'Il a dû partir tot à cause de la pluie.', 'Il a dû partir tôt a cause de la pluie.'],
        'dû', ['dû', 'du', 'dut', 'dus'],
        'Dû (participe passé de devoir) prend un accent circonflexe au masculin singulier.',
        'L accent distingue dû (participe passé) de du (article contracté).'),
      fc('Repérez la phrase correcte.',
        'À la fin du concert, tout le monde a applaudi.',
        ['A la fin du concert, tout le monde a applaudi.', 'À la fin du concert, tout le monde a applaudie.', 'À la fin du concert, tout le monde a applaudis.'],
        'À', ['À', 'A', 'Á', 'â'],
        'À en début de phrase prend l accent grave.',
        'La majuscule ne dispense pas de l accent grave sur À ou É.'),
      fc('Choisissez la rédaction juste.',
        'Où vas-tu passer tes vacances cette année ?',
        ['Ou vas-tu passer tes vacances cette année ?', 'Où va-tu passer tes vacances cette année ?', 'Où vas tu passer tes vacances cette année ?'],
        'Où', ['Où', 'Ou', 'D où', 'Là où'],
        'Où interrogatif prend l accent grave.',
        'Où avec accent introduit une question de lieu, ou sans accent est une conjonction.'),
    ],
  },
  {
    title: 'Élision, apostrophe et liaisons écrites',
    description: 'Règles d élision devant voyelle ou h muet, formes contractées (l, j, n, qu, c, d) et cas du h aspiré (la halte, le hibou).',
    cases: [
      fc('Choisissez la forme exacte.',
        'L heure du dîner approchait doucement.',
        ['La heure du dîner approchait doucement.', 'L heure du dîné approchait doucement.', 'L heure de le dîner approchait doucement.'],
        'L heure', ['L heure', 'La heure', 'Le heure', 'Lheure'],
        'Devant un h muet, on élide l article : l heure.',
        'L élision remplace la voyelle finale par une apostrophe devant une voyelle ou un h muet.'),
      fc('Choisissez la phrase correcte.',
        'Le hibou hulule chaque nuit dans la forêt.',
        ['L hibou hulule chaque nuit dans la forêt.', 'Le hibou hulules chaque nuit dans la forêt.', 'Le hibous hulule chaque nuit dans la forêt.'],
        'Le hibou', ['Le hibou', 'L hibou', 'La hibou', 'Les hibou'],
        'Hibou commence par un h aspiré : pas d élision.',
        'Devant un h aspiré (le héros, la halte, le hibou), on n élide pas l article.'),
      fc('Repérez la forme juste.',
        'J ai oublié mes clés sur la table.',
        ['Je ai oublié mes clés sur la table.', 'J ai oubliée mes clés sur la table.', 'J ai oublié mes clé sur la table.'],
        'J ai', ['J ai', 'Je ai', 'J a', 'Je a'],
        'Je s élide devant une voyelle.',
        'Le pronom je devient j devant une voyelle ou un h muet.'),
      fc('Choisissez la rédaction juste.',
        'Qu en penses-tu après réflexion ?',
        ['Que en penses-tu après réflexion ?', 'Qu en pense-tu après réflexion ?', 'Qu en penses tu après réflexion ?'],
        'Qu en', ['Qu en', 'Que en', 'Q en', 'Qu un'],
        'Que s élide devant en.',
        'Que devient qu devant un mot commençant par une voyelle.'),
      fc('Choisissez la phrase exactement formulée.',
        'L homme aux cheveux gris est mon grand-père.',
        ['Le homme aux cheveux gris est mon grand-père.', 'L homme au cheveux gris est mon grand-père.', 'L homme aux cheveux gris est mon grand père.'],
        'L homme', ['L homme', 'Le homme', 'Les hommes', 'Lhomme'],
        'Le h de homme est muet, donc on élide.',
        'Devant homme, hôpital, herbe (h muet), l article est élidé.'),
    ],
  },
);

// ─── Chapitre 2 — 3 nouveaux items ───────────────────────────────────
FRENCH_QUIZ_CHAPTERS[1].quizItems.push(
  {
    title: 'Subjonctif présent et obligation',
    description: 'Emploi du subjonctif après les verbes de volonté, doute, sentiment et après il faut que.',
    cases: [
      fc('Choisissez la forme correcte.',
        'Il faut que tu sois patient pour réussir.',
        ['Il faut que tu es patient pour réussir.', 'Il faut que tu seras patient pour réussir.', 'Il faut que tu étais patient pour réussir.'],
        'sois', ['sois', 'es', 'seras', 'étais'],
        'Après il faut que, on utilise le subjonctif présent.',
        'Il faut que appelle systématiquement le subjonctif.'),
      fc('Choisissez la phrase correcte.',
        'Je doute qu il vienne à la fête ce soir.',
        ['Je doute qu il vient à la fête ce soir.', 'Je doute qu il viendra à la fête ce soir.', 'Je doute qu il venait à la fête ce soir.'],
        'vienne', ['vienne', 'vient', 'viendra', 'venait'],
        'Le verbe douter introduit un subjonctif.',
        'Les verbes de doute (douter, ne pas penser) commandent le subjonctif.'),
      fc('Repérez la forme juste.',
        'Je veux que vous écoutiez attentivement.',
        ['Je veux que vous écoutez attentivement.', 'Je veux que vous écouterez attentivement.', 'Je veux que vous écoutiez attentivements.'],
        'écoutiez', ['écoutiez', 'écoutez', 'écouterez', 'écoutiers'],
        'Vouloir que demande le subjonctif.',
        'Les verbes de volonté (vouloir, exiger, souhaiter) entraînent le subjonctif.'),
      fc('Choisissez la phrase grammaticalement correcte.',
        'Il est possible qu elle ait raison.',
        ['Il est possible qu elle a raison.', 'Il est possible qu elle aura raison.', 'Il est possible qu elle avait raison.'],
        'ait', ['ait', 'a', 'aura', 'avait'],
        'Il est possible que demande le subjonctif.',
        'Les expressions de possibilité (il est possible que, il se peut que) entraînent le subjonctif.'),
      fc('Choisissez la rédaction juste.',
        'Bien qu il fasse froid, nous sortirons.',
        ['Bien qu il fait froid, nous sortirons.', 'Bien qu il fera froid, nous sortirons.', 'Bien qu il faisait froid, nous sortirons.'],
        'fasse', ['fasse', 'fait', 'fera', 'faisait'],
        'Bien que est suivi du subjonctif.',
        'Les conjonctions de concession (bien que, quoique) commandent le subjonctif.'),
    ],
  },
  {
    title: 'Voix passive et complément d agent',
    description: 'Transformation actif/passif, conservation du temps verbal, repérage du complément d agent.',
    cases: [
      fc('Choisissez la transformation correcte.',
        'Le livre a été lu par tous les élèves.',
        ['Le livre a été lus par tous les élèves.', 'Le livre est lu par tous les élèves.', 'Les livres a été lu par tous les élèves.'],
        'a été lu', ['a été lu', 'est lu', 'a été lus', 'sera lu'],
        'Le passé composé actif devient être au passé composé + participe passé.',
        'À la voix passive, on utilise être au temps de l actif suivi du participe passé.'),
      fc('Choisissez la forme exacte.',
        'Ces décisions seront prises par le directeur demain.',
        ['Ces décisions seront pris par le directeur demain.', 'Ces décisions sera prises par le directeur demain.', 'Ces décision seront prises par le directeur demain.'],
        'prises', ['prises', 'pris', 'prise', 'prisent'],
        'Le participe passé s accorde avec le sujet à la voix passive.',
        'À la voix passive, le participe passé s accorde toujours avec le sujet.'),
      fc('Repérez la phrase correcte.',
        'La maison fut construite par mon grand-père.',
        ['La maison fut construit par mon grand-père.', 'La maison furent construite par mon grand-père.', 'La maisons fut construite par mon grand-père.'],
        'construite', ['construite', 'construit', 'construits', 'construites'],
        'Maison est féminin singulier, donc accord en e.',
        'Le participe passé après être accorde avec le sujet en genre et nombre.'),
      fc('Choisissez la phrase juste.',
        'Les gâteaux sont préparés par les enfants.',
        ['Les gâteaux sont préparé par les enfants.', 'Les gâteau sont préparés par les enfants.', 'Les gâteaux sont préparées par les enfants.'],
        'préparés', ['préparés', 'préparé', 'préparées', 'préparés'],
        'Gâteaux est masculin pluriel.',
        'Voix passive : participe passé masculin pluriel avec gâteaux.'),
      fc('Choisissez la rédaction juste.',
        'Cette idée a été défendue avec passion par l auteure.',
        ['Cette idée a été défendu avec passion par l auteure.', 'Cette idée à été défendue avec passion par l auteure.', 'Cette idée a était défendue avec passion par l auteure.'],
        'a été défendue', ['a été défendue', 'a été défendu', 'à été défendue', 'a était défendue'],
        'Idée est féminin singulier.',
        'Voix passive au passé composé : être au passé composé + participe accordé.'),
    ],
  },
);

// ─── Chapitre 3 — 2 nouveaux items ───────────────────────────────────
FRENCH_QUIZ_CHAPTERS[2].quizItems.push(
  {
    title: 'Synonymie précise et nuances de sens',
    description: 'Choix du synonyme exact selon la nuance (vétuste vs ancien, austère vs sévère, prouver vs démontrer).',
    cases: [
      fc('Choisissez le synonyme le plus précis.',
        'Cette demeure vétuste tombe en ruines.',
        ['Cette demeure neuve tombe en ruines.', 'Cette demeure ancienne tombe en ruines.', 'Cette demeure jolie tombe en ruines.'],
        'vétuste', ['vétuste', 'ancienne', 'neuve', 'jolie'],
        'Vétuste implique l idée de dégradation.',
        'Vétuste signifie ancien et délabré, alors que ancien indique seulement l âge.'),
      fc('Choisissez la formulation exacte.',
        'Le juge a corroboré les faits par plusieurs témoignages.',
        ['Le juge a inventé les faits par plusieurs témoignages.', 'Le juge a oublié les faits par plusieurs témoignages.', 'Le juge a contredit les faits par plusieurs témoignages.'],
        'corroboré', ['corroboré', 'inventé', 'oublié', 'contredit'],
        'Corroborer = confirmer en apportant des preuves.',
        'Corroborer signifie renforcer la véracité d un fait avec des preuves convergentes.'),
      fc('Repérez la phrase la plus précise.',
        'L orateur a réfuté chacun des arguments adverses.',
        ['L orateur a accepté chacun des arguments adverses.', 'L orateur a copié chacun des arguments adverses.', 'L orateur a évité chacun des arguments adverses.'],
        'réfuté', ['réfuté', 'accepté', 'copié', 'évité'],
        'Réfuter = démontrer la fausseté d un argument.',
        'Réfuter implique une démonstration argumentée du contraire, alors que rejeter est plus général.'),
      fc('Choisissez le mot juste.',
        'Sa vision austère du monde l isolait des autres.',
        ['Sa vision austère du monde l isolait des autres.', 'Sa vision joyeuse du monde l isolait des autres.', 'Sa vision colorée du monde l isolait des autres.'],
        'austère', ['austère', 'joyeuse', 'colorée', 'naïve'],
        'Austère évoque la sévérité morale et la sobriété.',
        'Austère insiste sur la rigueur morale, sévère sur la dureté du jugement.'),
      fc('Choisissez la rédaction juste.',
        'Cet argument est étayé par plusieurs études récentes.',
        ['Cet argument est combattu par plusieurs études récentes.', 'Cet argument est ignoré par plusieurs études récentes.', 'Cet argument est annulé par plusieurs études récentes.'],
        'étayé', ['étayé', 'combattu', 'ignoré', 'annulé'],
        'Étayer = soutenir par des éléments solides.',
        'Étayer un argument signifie l appuyer par des preuves ou des exemples convergents.'),
    ],
  },
  {
    title: 'Mots de liaison hiérarchisés',
    description: 'Hiérarchisation des connecteurs logiques selon leur force (cause, conséquence, opposition, addition).',
    cases: [
      fc('Choisissez la formulation la plus forte.',
        'Cette politique a échoué ; en conséquence, le ministre démissionne.',
        ['Cette politique a échoué ; aussi, le ministre démissionne.', 'Cette politique a échoué ; mais, le ministre démissionne.', 'Cette politique a échoué ; ou, le ministre démissionne.'],
        'en conséquence', ['en conséquence', 'aussi', 'mais', 'ou'],
        'En conséquence est un connecteur logique de conséquence forte.',
        'Pour exprimer une conséquence ferme, on préfère en conséquence ou par conséquent.'),
      fc('Choisissez la connexion la plus juste.',
        'Il a échoué, néanmoins il continue à se battre.',
        ['Il a échoué, ou il continue à se battre.', 'Il a échoué, donc il continue à se battre.', 'Il a échoué, en plus il continue à se battre.'],
        'néanmoins', ['néanmoins', 'donc', 'ou', 'en plus'],
        'Néanmoins exprime une opposition forte.',
        'Néanmoins, cependant, toutefois sont des connecteurs d opposition forte.'),
      fc('Repérez la formulation correcte.',
        'L enquête a révélé une fraude ; par ailleurs, des perquisitions ont eu lieu.',
        ['L enquête a révélé une fraude ; alors, des perquisitions ont eu lieu.', 'L enquête a révélé une fraude ; mais, des perquisitions ont eu lieu.', 'L enquête a révélé une fraude ; donc, des perquisitions ont eu lieu.'],
        'par ailleurs', ['par ailleurs', 'alors', 'mais', 'donc'],
        'Par ailleurs ajoute un fait supplémentaire dans l argumentation.',
        'Par ailleurs sert à introduire un fait nouveau qui s ajoute au précédent.'),
      fc('Choisissez la phrase juste.',
        'En somme, ces résultats confirment l hypothèse de départ.',
        ['Pour ainsi dire, ces résultats confirment l hypothèse de départ.', 'Cependant, ces résultats confirment l hypothèse de départ.', 'Ainsi par contre, ces résultats confirment l hypothèse de départ.'],
        'En somme', ['En somme', 'Pour ainsi dire', 'Cependant', 'Ainsi par contre'],
        'En somme introduit une synthèse.',
        'En somme, en définitive, en conclusion sont des connecteurs de synthèse.'),
      fc('Choisissez la rédaction juste.',
        'Non seulement il est rapide, mais en outre il est précis.',
        ['Non seulement il est rapide, mais cependant il est précis.', 'Non seulement il est rapide, mais ou il est précis.', 'Non seulement il est rapide, mais alors il est précis.'],
        'en outre', ['en outre', 'cependant', 'ou', 'alors'],
        'En outre = de plus, ajoute un argument cumulatif.',
        'Non seulement... mais en outre est une structure cumulative classique de la rhétorique.'),
    ],
  },
);

// ─── Chapitre 4 — 2 nouveaux items ───────────────────────────────────
FRENCH_QUIZ_CHAPTERS[3].quizItems.push(
  {
    title: 'Hiérarchisation des arguments en dissertation',
    description: 'Mise en place d un plan progressif : de l argument le plus simple au plus subtil, gradation rhétorique.',
    cases: [
      fc('Choisissez la formulation hiérarchisée juste.',
        'Tout d abord, ce roman explore la solitude ; ensuite, il interroge le mensonge ; enfin, il bouleverse la notion de vérité.',
        ['Enfin, ce roman explore la solitude ; tout d abord, il interroge le mensonge ; ensuite, il bouleverse la notion de vérité.', 'Tout d abord, ce roman explore la solitude ; tout d abord, il interroge le mensonge ; ensuite, il bouleverse la notion de vérité.', 'Tout d abord, ce roman explore la solitude ensuite il interroge le mensonge enfin il bouleverse la notion de vérité.'],
        'Tout d abord, ensuite, enfin', ['Tout d abord, ensuite, enfin', 'Enfin, tout d abord, ensuite', 'Tout d abord, tout d abord, ensuite', 'sans connecteurs'],
        'Une dissertation hiérarchise par tout d abord / ensuite / enfin.',
        'Le triptyque tout d abord / ensuite / enfin organise une progression logique du plus simple au plus subtil.'),
      fc('Choisissez la phrase correcte.',
        'L argument le plus convaincant intervient en dernier pour clore la démonstration.',
        ['L argument le plus convaincant intervient en premier pour clore la démonstration.', 'L argument le plus convaincant intervient au milieu pour clore la démonstration.', 'L argument le plus convaincant intervient ailleurs pour clore la démonstration.'],
        'en dernier', ['en dernier', 'en premier', 'au milieu', 'ailleurs'],
        'L argument décisif est traditionnellement placé en fin de partie ou de dissertation.',
        'Dans la rhétorique classique, le climax (argument fort) est placé en dernier pour marquer.'),
      fc('Repérez la formulation juste.',
        'Au-delà de cette première analyse, il convient d aller plus loin.',
        ['Au-delà de cette première analyse, il convient d arrêter.', 'Au-delà de cette première analyse, il convient de revenir en arrière.', 'Au-delà de cette première analyse, il convient de répéter la même chose.'],
        'aller plus loin', ['aller plus loin', 'arrêter', 'revenir en arrière', 'répéter'],
        'Au-delà de... il convient d aller plus loin annonce un approfondissement.',
        'Cette formule sert à marquer le passage d un argument simple à un argument plus subtil.'),
      fc('Choisissez la formulation hiérarchisée correcte.',
        'D un point de vue purement formel, mais surtout, d un point de vue thématique.',
        ['D un point de vue purement formel, mais aussi, d un point de vue thématique.', 'D un point de vue purement formel, ou bien, d un point de vue thématique.', 'D un point de vue purement formel, comme par exemple, d un point de vue thématique.'],
        'mais surtout', ['mais surtout', 'mais aussi', 'ou bien', 'comme par exemple'],
        'Mais surtout marque la hiérarchie : ce qui suit est plus important.',
        'Mais surtout introduit l argument le plus fort dans une comparaison hiérarchisée.'),
      fc('Choisissez la rédaction juste.',
        'Il faut d abord noter que..., puis souligner que..., et enfin insister sur...',
        ['Il faut d abord noter que..., puis souligner que..., et insister.', 'Il faut d abord noter que..., insister sur..., puis souligner que...', 'Il faut d abord souligner que..., noter que..., puis insister sur...'],
        'd abord, puis, enfin', ['d abord, puis, enfin', 'd abord, puis, et', 'd abord, insister, puis', 'souligner, noter, puis'],
        'D abord / puis / enfin organise trois moments d argumentation.',
        'Cette structure ternaire (d abord / puis / enfin) est très courante en dissertation française.'),
      fc('Choisissez la formulation la plus rigoureuse.',
        'Cette première lecture, certes utile, demande à être nuancée.',
        ['Cette première lecture, certes utile, demande à être ignorée.', 'Cette première lecture, certes utile, demande à être copiée.', 'Cette première lecture, certes utile, demande à être abandonnée.'],
        'nuancée', ['nuancée', 'ignorée', 'copiée', 'abandonnée'],
        'Demander à être nuancée signifie qu on va affiner le propos.',
        'Cette formule sert de transition vers une partie qui complexifie l argument initial.'),
      fc('Repérez la phrase juste.',
        'Pour terminer cette progression, il faut s interroger sur les limites mêmes de notre raisonnement.',
        ['Pour terminer cette progression, il faut répéter la première idée.', 'Pour terminer cette progression, il faut commencer une nouvelle idée.', 'Pour terminer cette progression, il faut oublier le sujet.'],
        's interroger sur les limites', ['s interroger sur les limites', 'répéter', 'commencer une nouvelle idée', 'oublier'],
        'La dernière partie d une dissertation interroge souvent ses propres limites.',
        'Une bonne troisième partie remet en cause partiellement ce qui précède pour ouvrir vers la nuance.'),
      fc('Choisissez la formulation finale juste.',
        'Cette ultime étape de notre démonstration ouvre la voie à une véritable réflexion personnelle.',
        ['Cette ultime étape de notre démonstration ferme la voie à une véritable réflexion personnelle.', 'Cette ultime étape de notre démonstration efface la voie à une véritable réflexion personnelle.', 'Cette ultime étape de notre démonstration cache la voie à une véritable réflexion personnelle.'],
        'ouvre la voie', ['ouvre la voie', 'ferme la voie', 'efface la voie', 'cache la voie'],
        'Une bonne dissertation termine en ouvrant le débat.',
        'Ouvrir la voie en fin de dissertation invite à un prolongement personnel ou critique.'),
      fc('Choisissez la phrase la plus complète.',
        'Au terme de notre argumentation, il apparaît clairement que la question initiale dépasse les apparences.',
        ['Au terme de notre argumentation, il apparaît que la question est simple.', 'Au terme de notre argumentation, il apparaît que la question n a pas de sens.', 'Au terme de notre argumentation, il apparaît que la question est répétitive.'],
        'dépasse les apparences', ['dépasse les apparences', 'est simple', 'n a pas de sens', 'est répétitive'],
        'Conclure en disant que le sujet dépasse les apparences est une formule classique de fin.',
        'La conclusion d une dissertation montre que le sujet a une profondeur cachée révélée par l analyse.'),
      fc('Choisissez la rédaction la plus rigoureuse.',
        'En définitive, c est moins la réponse que le cheminement qui importe ici.',
        ['En définitive, c est plus la réponse que le cheminement qui importe ici.', 'En définitive, c est ni la réponse ni le cheminement qui importe ici.', 'En définitive, c est aussi bien la réponse que le silence qui importe ici.'],
        'moins la réponse que le cheminement', ['moins la réponse que le cheminement', 'plus la réponse que le cheminement', 'ni la réponse ni le cheminement', 'aussi bien la réponse que le silence'],
        'C est moins X que Y est une structure rhétorique fréquente en dissertation.',
        'Cette structure place l accent sur Y en relativisant X, typique des conclusions nuancées.'),
    ],
  },
  {
    title: 'Reformulation rigoureuse de sujet',
    description: 'Reformulation analytique d un sujet de dissertation : repérage des termes-clés et amorce de problématique.',
    cases: [
      fc('Choisissez la reformulation correcte.',
        'Le sujet interroge la fonction du roman face à la réalité.',
        ['Le sujet interroge la fonction du film face à la fiction.', 'Le sujet interroge la fonction du poème face à la nature.', 'Le sujet interroge la fonction du théâtre face au public.'],
        'roman face à la réalité', ['roman face à la réalité', 'film face à la fiction', 'poème face à la nature', 'théâtre face au public'],
        'Le sujet portait sur le roman et la réalité.',
        'Une bonne reformulation reprend les termes essentiels sans les déformer.'),
      fc('Choisissez la phrase juste.',
        'Reformulons : la dissertation propose d examiner si l art doit nécessairement instruire.',
        ['Reformulons : la dissertation propose d examiner si l art doit nécessairement effacer.', 'Reformulons : la dissertation propose d examiner si l art doit nécessairement copier.', 'Reformulons : la dissertation propose d examiner si l art doit nécessairement diviser.'],
        'instruire', ['instruire', 'effacer', 'copier', 'diviser'],
        'Le verbe instruire est central dans le sujet.',
        'Une reformulation valide remplace les termes-clés par des synonymes ou les développe sans en changer le sens.'),
      fc('Repérez la reformulation rigoureuse.',
        'Autrement dit, peut-on encore considérer la lecture comme une expérience nécessaire ?',
        ['Autrement dit, faut-il interdire la lecture aujourd hui ?', 'Autrement dit, qui décide du programme de lecture ?', 'Autrement dit, peut-on lire avec une seule main ?'],
        'expérience nécessaire', ['expérience nécessaire', 'lecture interdite', 'programme imposé', 'lecture mécanique'],
        'Autrement dit introduit une reformulation analytique.',
        'La reformulation transpose le sujet en question implicite tout en restant fidèle à son enjeu.'),
      fc('Choisissez la phrase correcte.',
        'Précisons : on entend par récit toute mise en mots d une suite d événements.',
        ['Précisons : on entend par récit toute peinture muette.', 'Précisons : on entend par récit toute mélodie chantée.', 'Précisons : on entend par récit toute statue immobile.'],
        'mise en mots d une suite d événements', ['mise en mots d une suite d événements', 'peinture muette', 'mélodie chantée', 'statue immobile'],
        'Précisons définit le terme-clé du sujet.',
        'Définir les termes du sujet en introduction est une exigence méthodologique.'),
      fc('Choisissez la rédaction juste.',
        'En d autres termes, le sujet pose la question de la sincérité dans l écriture autobiographique.',
        ['En d autres termes, le sujet pose la question de la rapidité dans l écriture autobiographique.', 'En d autres termes, le sujet pose la question du paysage dans l écriture autobiographique.', 'En d autres termes, le sujet pose la question du nombre de pages dans l écriture autobiographique.'],
        'sincérité', ['sincérité', 'rapidité', 'paysage', 'nombre de pages'],
        'Sincérité est le terme central du sujet d origine.',
        'Une reformulation pertinente cible le concept central et le présente de manière analytique.'),
    ],
  },
);

// ─── Phase B (suite) — Chapitre 1 : 2 items finaux ──────────────────────
FRENCH_QUIZ_CHAPTERS[0].quizItems.push(
  {
    title: 'Trait d union et noms composés',
    description: 'Règles d emploi du trait d union dans les noms composés, les nombres composés et les pronoms toniques.',
    cases: [
      fc('Choisissez la forme correcte.',
        'Mon arrière-grand-père vivait à la campagne.',
        ['Mon arrière grand père vivait à la campagne.', 'Mon arrièregrandpère vivait à la campagne.', 'Mon arrière-grand père vivait à la campagne.'],
        'arrière-grand-père', ['arrière-grand-père', 'arrière grand père', 'arrièregrandpère', 'arrière-grand père'],
        'Les noms composés avec arrière prennent un trait d union à chaque jonction.',
        'Arrière-grand-père, beau-frère, sous-marin : trait d union systématique entre chaque élément.'),
      fc('Choisissez la phrase correctement écrite.',
        'Il a dépensé vingt-cinq euros dans la librairie.',
        ['Il a dépensé vingt cinq euros dans la librairie.', 'Il a dépensé vingt-cinqs euros dans la librairie.', 'Il a dépensé vingtcinq euros dans la librairie.'],
        'vingt-cinq', ['vingt-cinq', 'vingt cinq', 'vingtcinq', 'vingt-cinqs'],
        'Les nombres composés inférieurs à 100 prennent un trait d union, sauf avec et.',
        'Vingt-cinq, trente-deux, soixante-douze : trait d union. Mais vingt et un sans trait.'),
      fc('Repérez la forme exacte.',
        'Crois-tu vraiment qu il viendra demain ?',
        ['Crois tu vraiment qu il viendra demain ?', 'Croistu vraiment qu il viendra demain ?', 'Crois-tu, vraiment qu il viendra demain ?'],
        'Crois-tu', ['Crois-tu', 'Crois tu', 'Croistu', 'Croit-tu'],
        'Le pronom inversé prend un trait d union après le verbe.',
        'À l interrogation par inversion, on relie verbe et pronom par un trait d union : crois-tu, vient-il.'),
      fc('Choisissez la rédaction juste.',
        'Le chef-d œuvre du musée attire des milliers de visiteurs.',
        ['Le chef d œuvre du musée attire des milliers de visiteurs.', 'Le chefd œuvre du musée attire des milliers de visiteurs.', 'Le chef-d-œuvre du musée attire des milliers de visiteurs.'],
        'chef-d œuvre', ['chef-d œuvre', 'chef d œuvre', 'chefd œuvre', 'chef-d-œuvre'],
        'Chef-d œuvre s écrit avec un seul trait d union avant le d.',
        'Certains noms composés gardent un trait d union avant l apostrophe : chef-d œuvre, prud hommes.'),
      fc('Choisissez la phrase correcte.',
        'Donnez-moi la réponse avant la fin de l heure.',
        ['Donnez moi la réponse avant la fin de l heure.', 'Donnezmoi la réponse avant la fin de l heure.', 'Donnez-moi-là, la réponse avant la fin de l heure.'],
        'Donnez-moi', ['Donnez-moi', 'Donnez moi', 'Donnezmoi', 'Donne-moi'],
        'À l impératif, le pronom postposé est relié par un trait d union.',
        'Impératif + pronom postposé : trait d union (donnez-moi, allez-y, dis-le).'),
    ],
  },
  {
    title: 'Majuscules et noms propres',
    description: 'Règles d emploi de la majuscule : noms propres, peuples, institutions, titres d œuvres, points cardinaux.',
    cases: [
      fc('Choisissez la phrase correcte.',
        'Les Français adorent les longues conversations à table.',
        ['Les français adorent les longues conversations à table.', 'Les FRANÇAIS adorent les longues conversations à table.', 'Les Francais adorent les longues conversations à table.'],
        'Français', ['Français', 'français', 'FRANÇAIS', 'Francais'],
        'Le nom de peuple prend une majuscule quand il désigne des personnes.',
        'Les Français (peuple) prend une majuscule, mais l adjectif (la cuisine française) reste en minuscule.'),
      fc('Choisissez la rédaction juste.',
        'Il a visité le musée du Louvre dimanche dernier.',
        ['Il a visité le Musée du Louvre dimanche dernier.', 'Il a visité le musée du louvre dimanche dernier.', 'Il a visité le Musée Du Louvre dimanche dernier.'],
        'musée du Louvre', ['musée du Louvre', 'Musée du Louvre', 'musée du louvre', 'Musée Du Louvre'],
        'Musée est un nom commun ; seule la dénomination propre (Louvre) prend la majuscule.',
        'Pour les institutions à nom commun + nom propre, seul le nom propre porte la majuscule.'),
      fc('Repérez la phrase correcte.',
        'Nous partons vers le sud pour les vacances de Pâques.',
        ['Nous partons vers le Sud pour les vacances de pâques.', 'Nous partons vers le sud pour les vacances de pâques.', 'Nous partons vers le Sud pour les Vacances de Pâques.'],
        'sud ... Pâques', ['sud ... Pâques', 'Sud ... pâques', 'sud ... pâques', 'Sud ... Pâques'],
        'Sud (direction) reste en minuscule ; Pâques (fête) prend la majuscule.',
        'Les points cardinaux comme directions sont en minuscule ; les fêtes religieuses prennent la majuscule.'),
      fc('Choisissez la phrase juste.',
        'J ai relu Les Misérables de Victor Hugo cet été.',
        ['J ai relu les misérables de victor hugo cet été.', 'J ai relu Les misérables de Victor hugo cet été.', 'J ai relu les Misérables de victor Hugo cet été.'],
        'Les Misérables ... Victor Hugo', ['Les Misérables ... Victor Hugo', 'les misérables ... victor hugo', 'Les misérables ... Victor hugo', 'les Misérables ... victor Hugo'],
        'Les titres d œuvres et les noms d auteurs prennent une majuscule.',
        'Titre d œuvre : majuscule au premier mot et aux noms propres. Auteur : majuscule au prénom et au nom.'),
      fc('Choisissez la rédaction correcte.',
        'Le président de la République prendra la parole demain soir.',
        ['Le Président de la république prendra la parole demain soir.', 'Le président de la république prendra la parole demain soir.', 'Le Président de la République prendra la parole demain soir.'],
        'président de la République', ['président de la République', 'Président de la République', 'Président de la république', 'président de la république'],
        'République (institution unique) prend la majuscule ; président est une fonction et reste en minuscule.',
        'Pour les institutions politiques uniques (la République, l Assemblée nationale, l État), majuscule à l institution.'),
    ],
  },
);

// ─── Phase B (suite) — Chapitre 2 : 3 items finaux ──────────────────────
FRENCH_QUIZ_CHAPTERS[1].quizItems.push(
  {
    title: 'Discours rapporté direct et indirect',
    description: 'Transposition discours direct ↔ indirect : changement de pronoms, de temps verbaux, suppression des marques d oralité.',
    cases: [
      fc('Choisissez la transposition correcte.',
        'Il a dit qu il viendrait le lendemain.',
        ['Il a dit qu il vient le lendemain.', 'Il a dit qu il viendra le lendemain.', 'Il a dit qu il était venu le lendemain.'],
        'viendrait', ['viendrait', 'vient', 'viendra', 'était venu'],
        'Au discours indirect avec verbe principal au passé, le futur devient conditionnel présent.',
        'Concordance : il dit "je viendrai" → il a dit qu il viendrait.'),
      fc('Choisissez la phrase correctement transposée.',
        'Elle m a demandé si j avais terminé mes devoirs.',
        ['Elle m a demandé si j ai terminé mes devoirs.', 'Elle m a demandé que j avais terminé mes devoirs.', 'Elle m a demandé est-ce que j avais terminé mes devoirs.'],
        'avais terminé', ['avais terminé', 'ai terminé', 'aurai terminé', 'avais terminés'],
        'Au discours indirect passé, le passé composé devient plus-que-parfait.',
        'Elle m a demandé : "as-tu terminé ?" → elle m a demandé si j avais terminé.'),
      fc('Repérez la rédaction juste.',
        'Le professeur nous a demandé ce que nous pensions du texte.',
        ['Le professeur nous a demandé qu est-ce que nous pensions du texte.', 'Le professeur nous a demandé que pensons-nous du texte.', 'Le professeur nous a demandé ce que pensons-nous du texte.'],
        'ce que nous pensions', ['ce que nous pensions', 'qu est-ce que nous pensions', 'que pensons-nous', 'ce que pensons-nous'],
        'Au discours indirect, qu est-ce que devient ce que.',
        'Question directe en qu est-ce que → discours indirect en ce que.'),
      fc('Choisissez la phrase correcte.',
        'Il a affirmé qu il avait raison sur ce point.',
        ['Il a affirmé : il a raison sur ce point.', 'Il a affirmé qu il a raison sur ce point.', 'Il a affirmé qu il aurait raison sur ce point.'],
        'avait raison', ['avait raison', 'a raison', 'aurait raison', 'aura raison'],
        'Verbe introducteur au passé + présent direct → imparfait à l indirect.',
        'Concordance discours indirect : présent direct → imparfait quand le verbe principal est au passé.'),
      fc('Choisissez la rédaction juste.',
        'Elle a répondu qu elle viendrait dès qu elle pourrait.',
        ['Elle a répondu qu elle viendra dès qu elle pourra.', 'Elle a répondu qu elle vient dès qu elle peut.', 'Elle a répondu qu elle est venue dès qu elle a pu.'],
        'viendrait ... pourrait', ['viendrait ... pourrait', 'viendra ... pourra', 'vient ... peut', 'est venue ... a pu'],
        'Futur direct + futur direct → conditionnel + conditionnel à l indirect passé.',
        'Au discours indirect avec verbe principal au passé, les futurs deviennent conditionnels.'),
    ],
  },
  {
    title: 'Négation et restrictions',
    description: 'Formes de négation : ne...pas, ne...plus, ne...jamais, ne...rien ; et restriction ne...que. Distinction entre négation et restriction.',
    cases: [
      fc('Choisissez la formulation juste.',
        'Il ne mange que des légumes biologiques.',
        ['Il ne mange pas des légumes biologiques.', 'Il mange ne que des légumes biologiques.', 'Il ne mange rien que des légumes biologiques.'],
        'ne ... que', ['ne ... que', 'ne ... pas', 'ne ... rien', 'ne ... plus'],
        'Ne...que est une restriction : il mange uniquement des légumes biologiques.',
        'Ne...que = seulement (restriction), à distinguer de ne...pas (négation totale).'),
      fc('Choisissez la phrase correcte.',
        'Personne n est venu à la réunion ce matin.',
        ['Personne est venu à la réunion ce matin.', 'Personne n est pas venu à la réunion ce matin.', 'N est personne venu à la réunion ce matin.'],
        'Personne n est venu', ['Personne n est venu', 'Personne est venu', 'Personne n est pas venu', 'N est personne venu'],
        'Personne (sujet négatif) appelle ne sans pas.',
        'Avec personne, rien, jamais, aucun en sujet : on emploie ne sans pas.'),
      fc('Repérez la rédaction juste.',
        'Il n a ni argent ni envie de sortir.',
        ['Il n a pas argent ni envie de sortir.', 'Il a ni argent ni envie de sortir.', 'Il n a pas ni argent ni envie de sortir.'],
        'n a ni ... ni', ['n a ni ... ni', 'n a pas ... ni', 'a ni ... ni', 'n a pas ni ... ni'],
        'Ni...ni remplace pas : on n écrit jamais "ne pas ni".',
        'Double négation coordonnée : ne...ni...ni (sans pas).'),
      fc('Choisissez la phrase correcte.',
        'Elle ne dit jamais rien d intéressant en réunion.',
        ['Elle ne dit pas jamais rien d intéressant en réunion.', 'Elle ne dit pas rien d intéressant en réunion.', 'Elle dit jamais rien d intéressant en réunion.'],
        'ne dit jamais rien', ['ne dit jamais rien', 'ne dit pas jamais rien', 'ne dit pas rien', 'dit jamais rien'],
        'Jamais et rien peuvent se cumuler après ne, mais pas avec pas.',
        'On peut combiner ne...jamais...rien, ne...plus...rien, mais jamais avec pas.'),
      fc('Choisissez la rédaction juste.',
        'Je n ai vu personne qui sache répondre à cette question.',
        ['Je n ai vu pas personne qui sache répondre à cette question.', 'Je ai vu personne qui sache répondre à cette question.', 'Je n ai pas vu personne qui sache répondre à cette question.'],
        'n ai vu personne', ['n ai vu personne', 'n ai pas vu personne', 'ai vu personne', 'n ai pas vu personne'],
        'Personne en complément remplace pas dans la négation.',
        'Personne en COD ou attribut : ne sans pas (je n ai vu personne).'),
    ],
  },
  {
    title: 'Concordance des temps',
    description: 'Accord des temps dans une phrase complexe : verbe principal et verbe subordonné, antériorité, simultanéité, postériorité.',
    cases: [
      fc('Choisissez la phrase correctement conjuguée.',
        'Quand il sera arrivé, nous commencerons la réunion.',
        ['Quand il arrivera, nous commencerons la réunion.', 'Quand il était arrivé, nous commencerons la réunion.', 'Quand il arrive, nous commencerons la réunion.'],
        'sera arrivé', ['sera arrivé', 'arrivera', 'était arrivé', 'arrive'],
        'L antériorité dans le futur s exprime par le futur antérieur.',
        'Antériorité par rapport au futur : futur antérieur (sera arrivé) puis futur simple (commencerons).'),
      fc('Choisissez la rédaction correcte.',
        'Je pensais qu il avait déjà compris la consigne.',
        ['Je pensais qu il a déjà compris la consigne.', 'Je pense qu il avait déjà compris la consigne.', 'Je pensais qu il ait déjà compris la consigne.'],
        'avait déjà compris', ['avait déjà compris', 'a déjà compris', 'ait déjà compris', 'aurait déjà compris'],
        'Verbe principal à l imparfait + antériorité → plus-que-parfait.',
        'Concordance des temps : imparfait dans la principale → plus-que-parfait pour l antériorité.'),
      fc('Repérez la phrase juste.',
        'S il avait étudié davantage, il aurait réussi son examen.',
        ['S il aurait étudié davantage, il aurait réussi son examen.', 'S il a étudié davantage, il aurait réussi son examen.', 'S il étudiait davantage, il aurait réussi son examen.'],
        'avait étudié ... aurait réussi', ['avait étudié ... aurait réussi', 'aurait étudié ... aurait réussi', 'a étudié ... aurait réussi', 'étudiait ... aurait réussi'],
        'Hypothèse irréelle du passé : si + plus-que-parfait, conditionnel passé.',
        'Hypothèse irréalisée dans le passé : si + plus-que-parfait → conditionnel passé.'),
      fc('Choisissez la phrase correcte.',
        'Il faudrait que tu sois prêt avant huit heures.',
        ['Il faudrait que tu es prêt avant huit heures.', 'Il faudrait que tu seras prêt avant huit heures.', 'Il faudrait que tu fus prêt avant huit heures.'],
        'sois prêt', ['sois prêt', 'es prêt', 'seras prêt', 'fus prêt'],
        'Il faudrait que appelle le subjonctif présent.',
        'Conditionnel présent + il faut que → subjonctif présent (concordance simultanée).'),
      fc('Choisissez la rédaction juste.',
        'Elle avait fini ses devoirs avant que je rentre du travail.',
        ['Elle avait fini ses devoirs avant que je suis rentré du travail.', 'Elle a fini ses devoirs avant que je rentrais du travail.', 'Elle finissait ses devoirs avant que je rentre du travail.'],
        'avait fini ... rentre', ['avait fini ... rentre', 'a fini ... rentrais', 'finissait ... rentre', 'avait fini ... suis rentré'],
        'Avant que appelle le subjonctif présent, et l antériorité s exprime par le plus-que-parfait.',
        'Antériorité dans le passé + avant que : plus-que-parfait + subjonctif présent.'),
    ],
  },
);

// ─── Phase B (suite) — Chapitre 3 : 3 items finaux ──────────────────────
FRENCH_QUIZ_CHAPTERS[2].quizItems.push(
  {
    title: 'Antonymie et nuances',
    description: 'Choix de l antonyme exact : différences entre antonymes contradictoires (vrai/faux), contraires (chaud/froid) et complémentaires (acheter/vendre).',
    cases: [
      fc('Choisissez l antonyme le plus précis.',
        'Cette analyse est superficielle, contrairement à la précédente, qui était approfondie.',
        ['Cette analyse est superficielle, contrairement à la précédente, qui était simple.', 'Cette analyse est superficielle, contrairement à la précédente, qui était lente.', 'Cette analyse est superficielle, contrairement à la précédente, qui était courte.'],
        'approfondie', ['approfondie', 'simple', 'lente', 'courte'],
        'L antonyme exact de superficielle est approfondie.',
        'Antonymes : superficiel/approfondi désignent deux degrés opposés sur l axe de la profondeur d analyse.'),
      fc('Choisissez la formulation correcte.',
        'Sa démarche est rigoureuse, à l opposé d une approche laxiste.',
        ['Sa démarche est rigoureuse, à l opposé d une approche rapide.', 'Sa démarche est rigoureuse, à l opposé d une approche colorée.', 'Sa démarche est rigoureuse, à l opposé d une approche savoureuse.'],
        'laxiste', ['laxiste', 'rapide', 'colorée', 'savoureuse'],
        'Laxiste est l antonyme de rigoureuse dans le contexte méthodologique.',
        'Rigoureux/laxiste s opposent sur l axe de la discipline méthodologique.'),
      fc('Repérez l antonyme juste.',
        'Sa réaction prudente contraste avec l attitude téméraire de son frère.',
        ['Sa réaction prudente contraste avec l attitude lente de son frère.', 'Sa réaction prudente contraste avec l attitude triste de son frère.', 'Sa réaction prudente contraste avec l attitude calme de son frère.'],
        'téméraire', ['téméraire', 'lente', 'triste', 'calme'],
        'Téméraire = qui agit sans peser les risques, opposé à prudent.',
        'Prudent/téméraire : axe du rapport au risque (mesure vs imprudence).'),
      fc('Choisissez le mot juste.',
        'Cette politique généreuse a remplacé une approche mesquine du passé.',
        ['Cette politique généreuse a remplacé une approche brève du passé.', 'Cette politique généreuse a remplacé une approche bruyante du passé.', 'Cette politique généreuse a remplacé une approche neuve du passé.'],
        'mesquine', ['mesquine', 'brève', 'bruyante', 'neuve'],
        'Mesquine est l antonyme moral de généreuse.',
        'Généreux/mesquin : axe de la libéralité morale et financière.'),
      fc('Choisissez la rédaction juste.',
        'L abondance de ressources cache parfois une réelle pénurie de compétences.',
        ['L abondance de ressources cache parfois une réelle clarté de compétences.', 'L abondance de ressources cache parfois une réelle joie de compétences.', 'L abondance de ressources cache parfois une réelle hauteur de compétences.'],
        'pénurie', ['pénurie', 'clarté', 'joie', 'hauteur'],
        'Pénurie est l antonyme exact d abondance.',
        'Abondance/pénurie : axe quantitatif sur la disponibilité des ressources.'),
    ],
  },
  {
    title: 'Champs lexicaux thématiques',
    description: 'Reconnaissance et construction de champs lexicaux : vocabulaire de la peur, de la lumière, du temps, de la guerre, de l art.',
    cases: [
      fc('Choisissez le champ lexical attendu.',
        'Le brouillard, l ombre, le silence et l angoisse construisent un champ lexical de la peur.',
        ['Le brouillard, l ombre, le silence et l angoisse construisent un champ lexical de la joie.', 'Le brouillard, l ombre, le silence et l angoisse construisent un champ lexical de la mer.', 'Le brouillard, l ombre, le silence et l angoisse construisent un champ lexical du sport.'],
        'peur', ['peur', 'joie', 'mer', 'sport'],
        'Brouillard, ombre, silence, angoisse appartiennent au champ lexical de la peur.',
        'Un champ lexical regroupe des mots autour d un même thème : ici, l univers anxiogène.'),
      fc('Choisissez la formulation juste.',
        'Aurore, éclat, lueur et rayon évoquent ensemble le champ lexical de la lumière.',
        ['Aurore, éclat, lueur et rayon évoquent ensemble le champ lexical de l ombre.', 'Aurore, éclat, lueur et rayon évoquent ensemble le champ lexical du froid.', 'Aurore, éclat, lueur et rayon évoquent ensemble le champ lexical de la mort.'],
        'lumière', ['lumière', 'ombre', 'froid', 'mort'],
        'Aurore, éclat, lueur, rayon convergent autour de la lumière.',
        'Le champ lexical de la lumière englobe sources naturelles et qualités lumineuses.'),
      fc('Repérez le champ correct.',
        'Combat, blessure, défaite et armée appartiennent au champ lexical de la guerre.',
        ['Combat, blessure, défaite et armée appartiennent au champ lexical de l amour.', 'Combat, blessure, défaite et armée appartiennent au champ lexical du voyage.', 'Combat, blessure, défaite et armée appartiennent au champ lexical de la cuisine.'],
        'guerre', ['guerre', 'amour', 'voyage', 'cuisine'],
        'Combat, blessure, défaite, armée sont tous liés à la guerre.',
        'Le champ lexical de la guerre couvre acteurs (armée), actions (combat), conséquences (blessure, défaite).'),
      fc('Choisissez le champ attendu.',
        'Toile, palette, modèle et atelier construisent un champ lexical de la peinture.',
        ['Toile, palette, modèle et atelier construisent un champ lexical de la mer.', 'Toile, palette, modèle et atelier construisent un champ lexical de la justice.', 'Toile, palette, modèle et atelier construisent un champ lexical du sport.'],
        'peinture', ['peinture', 'mer', 'justice', 'sport'],
        'Toile, palette, modèle, atelier renvoient au monde du peintre.',
        'Le champ lexical de la peinture englobe outils (palette), supports (toile), lieux (atelier) et sujets (modèle).'),
      fc('Choisissez la rédaction correcte.',
        'Horloge, instant, durée et éternité forment un champ lexical du temps.',
        ['Horloge, instant, durée et éternité forment un champ lexical de la couleur.', 'Horloge, instant, durée et éternité forment un champ lexical du voyage.', 'Horloge, instant, durée et éternité forment un champ lexical de la nourriture.'],
        'temps', ['temps', 'couleur', 'voyage', 'nourriture'],
        'Horloge, instant, durée, éternité tournent autour de la perception du temps.',
        'Le champ lexical du temps mêle instruments (horloge), unités (instant, durée) et concepts (éternité).'),
    ],
  },
  {
    title: 'Polysémie et faux amis',
    description: 'Mots polysémiques (sens contextuels multiples) et confusions courantes entre mots proches (faux amis internes au français).',
    cases: [
      fc('Choisissez le sens correct.',
        'La banque où je travaille se trouve sur la grande avenue.',
        ['La banque où je travaille se trouve sur le bord du fleuve.', 'La banque où je travaille se trouve sur la table du salon.', 'La banque où je travaille se trouve sur le banc du parc.'],
        'avenue', ['avenue', 'bord du fleuve', 'table du salon', 'banc du parc'],
        'Banque a ici le sens d établissement financier, donc une avenue.',
        'Banque est polysémique : établissement, banc de poissons, banque de données. Le contexte détermine le sens.'),
      fc('Choisissez la phrase correcte.',
        'Il faut éviter de confondre prétention et prétendant.',
        ['Il faut éviter de confondre prétendant et prétention.', 'Il faut éviter de confondre prétention et prévention.', 'Il faut éviter de confondre prétention et présentation.'],
        'prétention et prétendant', ['prétention et prétendant', 'prétention et prévention', 'prétention et présentation', 'prétendant et prétention'],
        'Prétention (orgueil) et prétendant (candidat à un titre) sont deux mots distincts.',
        'Faux amis lexicaux : prétention/prétendant ne sont pas synonymes ni interchangeables.'),
      fc('Repérez l usage juste.',
        'Le ministre a affirmé sa volonté d éradiquer la corruption.',
        ['Le ministre a affirmé sa volonté de corruption d éradiquer la corruption.', 'Le ministre a affirmé sa volonté d éradication la corruption.', 'Le ministre a affirmé sa volonté éradiquant la corruption.'],
        'éradiquer', ['éradiquer', 'éradication', 'éradiquant', 'corrompre'],
        'Éradiquer (verbe) signifie supprimer totalement.',
        'Distinguer éradiquer (verbe) de éradication (nom) : la syntaxe impose le verbe après volonté de.'),
      fc('Choisissez la rédaction juste.',
        'L expression conjoncture économique désigne la situation actuelle, pas la conjecture.',
        ['L expression conjecture économique désigne la situation actuelle, pas la conjoncture.', 'L expression conjoncture économique désigne une supposition actuelle, pas une situation.', 'L expression conjecture économique désigne la situation actuelle, pas l hypothèse.'],
        'conjoncture économique', ['conjoncture économique', 'conjecture économique', 'conjecture actuelle', 'conjoncture hypothétique'],
        'Conjoncture (situation économique) ≠ conjecture (supposition).',
        'Faux amis fréquents : conjoncture (état des choses) et conjecture (hypothèse).'),
      fc('Choisissez la phrase correcte.',
        'Cette décision a un impact considérable sur l économie.',
        ['Cette décision a un impact considérablement sur l économie.', 'Cette décision a un impact considérée sur l économie.', 'Cette décision a un impact considérante sur l économie.'],
        'considérable', ['considérable', 'considérablement', 'considérée', 'considérante'],
        'Considérable (adjectif) qualifie le nom impact.',
        'Faux amis morphologiques : considérable (adj.) ≠ considérablement (adv.) ≠ considérée (part. passé).'),
    ],
  },
);

// ─── Phase B (suite) — Chapitre 4 : 3 items finaux ──────────────────────
FRENCH_QUIZ_CHAPTERS[3].quizItems.push(
  {
    title: 'Exemples littéraires choisis',
    description: 'Choix d exemples pertinents en dissertation : auteurs canoniques, équilibre des œuvres, justification de l exemple par l argument.',
    cases: [
      fc('Choisissez l exemple le plus pertinent.',
        'Pour illustrer la solitude tragique, on peut citer le Meursault de L Étranger d Albert Camus.',
        ['Pour illustrer la solitude tragique, on peut citer la recette de cuisine de mon grand-père.', 'Pour illustrer la solitude tragique, on peut citer un panneau routier.', 'Pour illustrer la solitude tragique, on peut citer un titre de chanson populaire.'],
        'Meursault de L Étranger', ['Meursault de L Étranger', 'recette de cuisine', 'panneau routier', 'titre de chanson populaire'],
        'Meursault est un personnage de roman emblématique de la solitude tragique.',
        'Un bon exemple littéraire vient d une œuvre canonique et illustre précisément l idée à démontrer.'),
      fc('Choisissez la formulation juste.',
        'Comme le montre Madame Bovary de Flaubert, l ennui peut conduire à la perte de soi.',
        ['Comme le montre Madame Bovary de Flaubert, la cuisine régionale est variée.', 'Comme le montre Madame Bovary de Flaubert, le climat normand est doux.', 'Comme le montre Madame Bovary de Flaubert, les chemins ruraux sont longs.'],
        'l ennui peut conduire à la perte de soi', ['l ennui peut conduire à la perte de soi', 'la cuisine régionale est variée', 'le climat normand est doux', 'les chemins ruraux sont longs'],
        'L exemple doit éclairer l argument : l ennui d Emma comme moteur de sa déchéance.',
        'L exemple littéraire doit être justifié par une analyse précise du lien œuvre/argument.'),
      fc('Repérez l exemple convaincant.',
        'On songera à Antigone de Sophocle pour penser le conflit entre la loi écrite et la loi morale.',
        ['On songera à Antigone de Sophocle pour penser la couleur des vêtements antiques.', 'On songera à Antigone de Sophocle pour penser le climat méditerranéen.', 'On songera à Antigone de Sophocle pour penser la structure des amphithéâtres.'],
        'conflit entre la loi écrite et la loi morale', ['conflit entre la loi écrite et la loi morale', 'couleur des vêtements antiques', 'climat méditerranéen', 'structure des amphithéâtres'],
        'Antigone illustre le conflit entre Créon (loi écrite) et Antigone (loi morale).',
        'Choisir un exemple littéraire, c est choisir une œuvre dont l intrigue répond directement à l argument.'),
      fc('Choisissez la rédaction juste.',
        'Le personnage de Jean Valjean dans Les Misérables incarne la possibilité d une rédemption morale.',
        ['Le personnage de Jean Valjean dans Les Misérables incarne la mode du dix-neuvième siècle.', 'Le personnage de Jean Valjean dans Les Misérables incarne la richesse industrielle de l époque.', 'Le personnage de Jean Valjean dans Les Misérables incarne le vocabulaire technique de la chimie.'],
        'possibilité d une rédemption morale', ['possibilité d une rédemption morale', 'mode du dix-neuvième siècle', 'richesse industrielle', 'vocabulaire technique de la chimie'],
        'Jean Valjean est l icône hugolienne de la rédemption.',
        'L exemple littéraire vaut quand il met en lumière le concept central de l argument.'),
      fc('Choisissez l illustration juste.',
        'On peut prendre Le Père Goriot de Balzac pour analyser l ambition dévorante du jeune Rastignac.',
        ['On peut prendre Le Père Goriot de Balzac pour analyser le climat parisien d aujourd hui.', 'On peut prendre Le Père Goriot de Balzac pour analyser la cuisine bourgeoise contemporaine.', 'On peut prendre Le Père Goriot de Balzac pour analyser la mode des années 1980.'],
        'ambition dévorante du jeune Rastignac', ['ambition dévorante du jeune Rastignac', 'climat parisien d aujourd hui', 'cuisine bourgeoise contemporaine', 'mode des années 1980'],
        'Rastignac est la figure littéraire de l ambition au dix-neuvième siècle.',
        'Bon exemple : œuvre canonique + personnage central + lien direct avec le concept argumenté.'),
    ],
  },
  {
    title: 'Analyse stylistique appliquée',
    description: 'Repérage et nomination des figures de style en commentaire : métaphore, métonymie, oxymore, hyperbole, anaphore, chiasme.',
    cases: [
      fc('Choisissez la figure correcte.',
        'Cette nuit blanche révèle un oxymore qui dit l angoisse de l insomnie.',
        ['Cette nuit blanche révèle une métaphore qui dit l angoisse de l insomnie.', 'Cette nuit blanche révèle une hyperbole qui dit l angoisse de l insomnie.', 'Cette nuit blanche révèle une comparaison qui dit l angoisse de l insomnie.'],
        'oxymore', ['oxymore', 'métaphore', 'hyperbole', 'comparaison'],
        'Nuit blanche associe deux termes contraires : c est un oxymore.',
        'Oxymore : alliance de deux mots opposés pour créer un effet paradoxal (nuit blanche, soleil noir).'),
      fc('Choisissez la nomination juste.',
        'Boire un verre désigne la boisson par le contenant : c est une métonymie.',
        ['Boire un verre désigne la boisson par le contenant : c est une métaphore.', 'Boire un verre désigne la boisson par le contenant : c est une hyperbole.', 'Boire un verre désigne la boisson par le contenant : c est une anaphore.'],
        'métonymie', ['métonymie', 'métaphore', 'hyperbole', 'anaphore'],
        'La métonymie remplace une chose par une autre liée par une relation logique (contenant pour contenu).',
        'Métonymie : déplacement de sens par contiguïté (contenant pour contenu, auteur pour œuvre, lieu pour institution).'),
      fc('Repérez la figure correcte.',
        'Je meurs de soif au milieu de l océan illustre une hyperbole appliquée à la frustration.',
        ['Je meurs de soif au milieu de l océan illustre une métonymie appliquée à la frustration.', 'Je meurs de soif au milieu de l océan illustre un chiasme appliqué à la frustration.', 'Je meurs de soif au milieu de l océan illustre une anaphore appliquée à la frustration.'],
        'hyperbole', ['hyperbole', 'métonymie', 'chiasme', 'anaphore'],
        'L exagération mourir de soif pour souffrir relève de l hyperbole.',
        'Hyperbole : amplification expressive qui dépasse la réalité pour souligner un sentiment.'),
      fc('Choisissez la figure juste.',
        'La répétition de Demain dès l aube en début de strophe est une anaphore.',
        ['La répétition de Demain dès l aube en début de strophe est un oxymore.', 'La répétition de Demain dès l aube en début de strophe est une métaphore.', 'La répétition de Demain dès l aube en début de strophe est une hyperbole.'],
        'anaphore', ['anaphore', 'oxymore', 'métaphore', 'hyperbole'],
        'Anaphore : reprise d un même mot ou groupe en début de plusieurs vers ou phrases.',
        'Anaphore : effet rythmique d insistance par répétition initiale (Hugo, Demain dès l aube).'),
      fc('Choisissez la rédaction juste.',
        'Il faut manger pour vivre et non vivre pour manger illustre un chiasme.',
        ['Il faut manger pour vivre et non vivre pour manger illustre une anaphore.', 'Il faut manger pour vivre et non vivre pour manger illustre une hyperbole.', 'Il faut manger pour vivre et non vivre pour manger illustre une métonymie.'],
        'chiasme', ['chiasme', 'anaphore', 'hyperbole', 'métonymie'],
        'Le chiasme inverse l ordre des termes en miroir (ABBA).',
        'Chiasme : structure en croix qui souligne par symétrie inversée une opposition de sens.'),
    ],
  },
  {
    title: 'Conclusion ouverte et perspective',
    description: 'Construction d une conclusion : synthèse des axes, réponse à la problématique et ouverture vers une perspective élargie.',
    cases: [
      fc('Choisissez la conclusion correcte.',
        'Au terme de notre analyse, il apparaît que le roman du dix-neuvième siècle a profondément renouvelé les codes du récit.',
        ['Au terme de notre analyse, il apparaît que le roman du dix-neuvième siècle est rouge.', 'Au terme de notre analyse, il apparaît que le roman du dix-neuvième siècle existe.', 'Au terme de notre analyse, il apparaît que le roman du dix-neuvième siècle se vend.'],
        'a profondément renouvelé les codes du récit', ['a profondément renouvelé les codes du récit', 'est rouge', 'existe', 'se vend'],
        'La conclusion synthétise un résultat substantiel de la démonstration.',
        'Une conclusion réussie reformule la réponse à la problématique en une affirmation forte.'),
      fc('Choisissez la formulation juste.',
        'Si la dissertation a montré la force de l argumentation, on peut désormais s interroger sur la persuasion par l image.',
        ['Si la dissertation a montré la force de l argumentation, on peut désormais répéter les arguments du début.', 'Si la dissertation a montré la force de l argumentation, on peut désormais oublier le sujet posé.', 'Si la dissertation a montré la force de l argumentation, on peut désormais critiquer le devoir tout entier.'],
        's interroger sur la persuasion par l image', ['s interroger sur la persuasion par l image', 'répéter les arguments du début', 'oublier le sujet posé', 'critiquer le devoir tout entier'],
        'L ouverture déplace le débat vers un domaine voisin et nouveau.',
        'Une ouverture pertinente prolonge l analyse en évoquant un terrain comparable mais distinct.'),
      fc('Repérez la conclusion réussie.',
        'En définitive, ce parcours montre que la modernité est moins une rupture qu une reprise critique de l héritage.',
        ['En définitive, ce parcours montre que la modernité est rouge.', 'En définitive, ce parcours montre que la modernité existe.', 'En définitive, ce parcours montre que la modernité s achète.'],
        'moins une rupture qu une reprise critique', ['moins une rupture qu une reprise critique', 'est rouge', 'existe', 's achète'],
        'La structure moins X que Y nuance et hiérarchise la conclusion.',
        'Conclusion nuancée : la formule moins...que sert à dépasser une opposition trop simple.'),
      fc('Choisissez la rédaction juste.',
        'Il reste alors à se demander si la littérature peut, à elle seule, transformer la conscience d une époque.',
        ['Il reste alors à se demander si la littérature peut, à elle seule, supprimer la conscience d une époque.', 'Il reste alors à se demander si la littérature peut, à elle seule, ignorer la conscience d une époque.', 'Il reste alors à se demander si la littérature peut, à elle seule, rétrécir la conscience d une époque.'],
        'transformer la conscience', ['transformer la conscience', 'supprimer la conscience', 'ignorer la conscience', 'rétrécir la conscience'],
        'La question posée en ouverture doit prolonger positivement l analyse.',
        'L ouverture interrogative finale invite le lecteur à poursuivre la réflexion engagée.'),
      fc('Choisissez la conclusion la plus rigoureuse.',
        'Pour conclure, ce travail aura surtout mis au jour la difficulté qu il y a à séparer la forme du sens.',
        ['Pour conclure, ce travail aura surtout mis au jour la facilité qu il y a à séparer la forme du sens.', 'Pour conclure, ce travail aura surtout mis au jour la nécessité qu il y a à séparer la forme du sens.', 'Pour conclure, ce travail aura surtout mis au jour l impossibilité totale qu il y a à séparer la forme du sens.'],
        'difficulté qu il y a à séparer la forme du sens', ['difficulté qu il y a à séparer la forme du sens', 'facilité', 'nécessité', 'impossibilité totale'],
        'Une conclusion universitaire valide reconnaît une difficulté plutôt qu un absolu.',
        'La conclusion analytique privilégie la nuance (difficulté) à l affirmation absolue (impossibilité).'),
    ],
  },
);

const FRENCH_CHAPTERS = attachExercises(FRENCH_QUIZ_CHAPTERS, [
  ...buildFrenchExercises(),
  ...buildFrenchAdvancedExercises(),
]);

const ENGLISH_CHAPTERS = attachExercises(ENGLISH_QUIZ_CHAPTERS, [
  ...buildEnglishExercises(),
  ...buildEnglishAdvancedExercises(),
]);

function mq(prompt, correct, wrongs, answer, blockOptions, hint, explanation) {
  return createSentenceCase({
    prompt,
    correct,
    wrongs,
    answer,
    blockOptions,
    hint,
    explanation,
    duelPrompt: `Entre « ${answer} » et « ${blockOptions.find((option) => option !== answer) || wrongs[0]} », quel bloc rend l’énoncé mathématique exact dans « ${replaceAnswerWithBlank(correct, answer)} » ?`,
    trapPrompt: `Parmi ces écritures proches, repérez celles qui contredisent la méthode : ${hint}`,
    deminagePrompt: `Corrigez l’écriture mathématique en respectant la méthode : ${hint}`,
  });
}

const MATH_QUIZ_CHAPTERS = [
  {
    subject: 'Mathématiques',
    number: 1,
    title: 'Fonction logarithme népérien',
    description: 'Domaine de définition, limites usuelles, dérivées et propriétés algébriques du logarithme népérien.',
    quizItems: [
      {
        title: 'Domaines de définition avec logarithme',
        description: 'Identifier les conditions A(x)>0, résoudre les inégalités et conclure avec un intervalle.',
        cases: [
          mq('Pour f(x)=ln(x-4), déterminez la condition exacte sur x.', 'x-4>0 donc x>4 et D_f=]4,+∞[.', ['x-4≥0 donc D_f=[4,+∞[.', 'x-4<0 donc D_f=]-∞,4[.', 'x-4≠0 donc D_f=R\\{4}.'], 'x>4', ['x>4', 'x≥4', 'x<4', 'x≠4'], 'L’argument d’un logarithme doit être strictement positif.', 'On impose x-4>0, donc x>4.'),
          mq('Pour f(x)=ln(3-x), isolez correctement x.', '3-x>0 donc x<3 et D_f=]-∞,3[.', ['3-x≥0 donc D_f=]-∞,3].', '3-x>0 donc x>3.', '3-x≠0 donc D_f=R\\{3}.'], 'x<3', ['x<3', 'x≤3', 'x>3', 'x≠3'], 'Quand on multiplie par -1, le sens de l’inégalité change.', '3-x>0 équivaut à -x>-3 donc x<3.'),
          mq('Pour f(x)=ln(x-1)-ln(5-x), combinez les deux conditions.', 'x-1>0 et 5-x>0 donc D_f=]1,5[.', ['x-1>0 ou 5-x>0 donc D_f=R.', 'x-1≥0 et 5-x≥0 donc D_f=[1,5].', 'x-1≠0 et 5-x≠0 donc D_f=R\\{1,5}.'], ']1,5[', [']1,5[', '[1,5]', 'R\\{1,5}', ']-∞,1['], 'Chaque logarithme impose une condition stricte.', 'Il faut x>1 et x<5 simultanément.'),
          mq('Pour f(x)=ln((x-2)/(x-6)), choisissez l’intervalle issu du tableau de signes.', '(x-2)/(x-6)>0 donc D_f=]-∞,2[∪]6,+∞[.', ['(x-2)/(x-6)>0 donc D_f=]2,6[.', '(x-2)/(x-6)≥0 donc D_f=]-∞,2]∪[6,+∞[.', 'x≠2 et x≠6 donc D_f=R\\{2,6}.'], ']-∞,2[∪]6,+∞[', [']-∞,2[∪]6,+∞[', ']2,6[', 'R\\{2,6}', ']-∞,2]'], 'Un quotient est positif quand numérateur et dénominateur ont le même signe.', 'Les bornes 2 et 6 sont exclues car l’argument doit être strictement positif.'),
          mq('Pour f(x)=2xln(x+3), gardez seulement la condition due au logarithme.', 'x+3>0 donc D_f=]-3,+∞[.', ['2x>0 donc D_f=]0,+∞[.', 'x+3≥0 donc D_f=[-3,+∞[.', 'x≠-3 donc D_f=R\\{-3}.'], ']-3,+∞[', [']-3,+∞[', '[-3,+∞[', ']0,+∞[', 'R\\{-3}'], 'Le facteur 2x n’impose aucune restriction de domaine.', 'Seul ln(x+3) exige x+3>0.'),
        ],
      },
      {
        title: 'Limites classiques du logarithme',
        description: 'Utiliser les limites usuelles du cours pour conclure rapidement et correctement.',
        cases: [
          mq('Évaluez la limite classique en 0 à droite.', 'lim_{x→0+} ln x = -∞.', ['lim_{x→0+} ln x = +∞.', 'lim_{x→0+} ln x = 0.', 'lim_{x→0+} ln x = 1.'], '-∞', ['-∞', '+∞', '0', '1'], 'La courbe de ln x descend sans borne près de 0+.', 'C’est une limite usuelle fondamentale.'),
          mq('Évaluez la limite classique à l’infini.', 'lim_{x→+∞} ln x = +∞.', ['lim_{x→+∞} ln x = 0.', 'lim_{x→+∞} ln x = -∞.', 'lim_{x→+∞} ln x = 1.'], '+∞', ['+∞', '0', '-∞', '1'], 'Le logarithme croît indéfiniment, même lentement.', 'La limite à +∞ de ln x vaut +∞.'),
          mq('Comparez ln x à une puissance de x.', 'lim_{x→+∞} (ln x)/x² = 0.', ['lim_{x→+∞} (ln x)/x² = +∞.', 'lim_{x→+∞} (ln x)/x² = 1.', 'lim_{x→+∞} (ln x)/x² = -∞.'], '0', ['0', '+∞', '1', '-∞'], 'Toute puissance positive de x domine ln x à l’infini.', 'Le quotient tend donc vers 0.'),
          mq('Utilisez la limite usuelle autour de 1.', 'lim_{x→1} (ln x)/(x-1) = 1.', ['lim_{x→1} (ln x)/(x-1) = 0.', 'lim_{x→1} (ln x)/(x-1) = +∞.', 'lim_{x→1} (ln x)/(x-1) = -1.'], '1', ['1', '0', '+∞', '-1'], 'C’est le taux d’accroissement de ln en 1.', 'La dérivée de ln en 1 vaut 1.'),
          mq('Utilisez l’équivalent de ln(1+x) près de 0.', 'lim_{x→0} ln(1+x)/x = 1.', ['lim_{x→0} ln(1+x)/x = 0.', 'lim_{x→0} ln(1+x)/x = +∞.', 'lim_{x→0} ln(1+x)/x = -1.'], '1', ['1', '0', '+∞', '-1'], 'ln(1+x) est équivalent à x près de 0.', 'Le quotient tend vers 1.'),
        ],
      },
      {
        title: 'Dérivées et propriétés de ln',
        description: 'Appliquer u’/u, les propriétés ln(ab), ln(a/b), ln(a^n) et les simplifications attendues.',
        cases: [
          mq('Dérivez f(x)=ln(2x-5).', 'f’(x)=2/(2x-5).', ['f’(x)=1/(2x-5).', 'f’(x)=ln(2).', 'f’(x)=(2x-5)/2.'], '2/(2x-5)', ['2/(2x-5)', '1/(2x-5)', 'ln(2)', '(2x-5)/2'], 'La dérivée de ln(u) est u’/u.', 'Ici u=2x-5 et u’=2.'),
          mq('Dérivez f(x)=ln(4-x).', 'f’(x)=-1/(4-x).', ['f’(x)=1/(4-x).', 'f’(x)=ln(-1).', 'f’(x)=4-x.'], '-1/(4-x)', ['-1/(4-x)', '1/(4-x)', 'ln(-1)', '4-x'], 'Le numérateur est u’, pas seulement 1.', 'u=4-x donc u’=-1.'),
          mq('Simplifiez ln(a×b) avec a,b>0.', 'ln(a×b)=ln a+ln b.', ['ln(a×b)=ln a×ln b.', 'ln(a×b)=ln a-ln b.', 'ln(a×b)=a+b.'], 'ln a+ln b', ['ln a+ln b', 'ln a×ln b', 'ln a-ln b', 'a+b'], 'Le produit devient une somme de logarithmes.', 'C’est une propriété directe du logarithme.'),
          mq('Simplifiez ln(a/b) avec a,b>0.', 'ln(a/b)=ln a-ln b.', ['ln(a/b)=ln a+ln b.', 'ln(a/b)=ln a/ln b.', 'ln(a/b)=a-b.'], 'ln a-ln b', ['ln a-ln b', 'ln a+ln b', 'ln a/ln b', 'a-b'], 'Le quotient devient une différence.', 'On soustrait le logarithme du dénominateur.'),
          mq('Simplifiez ln(e^x).', 'ln(e^x)=x.', ['ln(e^x)=e^x.', 'ln(e^x)=ln x.', 'ln(e^x)=1/x.'], 'x', ['x', 'e^x', 'ln x', '1/x'], 'ln et exponentielle sont réciproques.', 'Pour tout réel x, ln(e^x)=x.'),
        ],
      },
    ],
  },
  {
    subject: 'Mathématiques',
    number: 2,
    title: 'Analyse, TVI et fonction réciproque',
    description: 'Continuité, unicité par monotonie, bijection, fonction réciproque et symétrie par rapport à y=x.',
    quizItems: [
      {
        title: 'Théorème des valeurs intermédiaires',
        description: 'Vérifier le changement de signe puis conclure sur l’existence d’une solution.',
        cases: [
          mq('Pour appliquer le TVI sur [1,2], vérifiez la condition de signe.', 'f(1)×f(2)<0 garantit au moins une solution dans ]1,2[.', ['f(1)×f(2)>0 garantit une solution.', 'f(1)=f(2) garantit l’unicité.', 'f(1)+f(2)<0 suffit toujours.'], 'f(1)×f(2)<0', ['f(1)×f(2)<0', 'f(1)×f(2)>0', 'f(1)=f(2)', 'f(1)+f(2)<0'], 'Le changement de signe est l’indice essentiel.', 'Si la fonction est continue et change de signe, elle s’annule entre les deux bornes.'),
          mq('Ajoutez la condition qui donne l’unicité.', 'La stricte monotonie sur l’intervalle assure l’unicité de α.', ['La positivité assure l’unicité.', 'La parité assure l’unicité.', 'La périodicité assure l’unicité.'], 'stricte monotonie', ['stricte monotonie', 'positivité', 'parité', 'périodicité'], 'Une fonction strictement monotone coupe une valeur donnée au plus une fois.', 'TVI donne existence ; monotonie stricte donne unicité.'),
          mq('Pour g(1,2)<0 et g(1,4)>0, choisissez la conclusion correcte.', 'Il existe α∈]1,2;1,4[ tel que g(α)=0.', ['Il existe α∈]0;1,2[ tel que g(α)=0.', 'g ne s’annule pas.', 'α vaut obligatoirement 1,3.'], 'α∈]1,2;1,4[', ['α∈]1,2;1,4[', 'α∈]0;1,2[', 'aucune solution', 'α=1,3'], 'La solution est localisée entre les deux valeurs testées.', 'Le changement de signe encadre une racine.'),
          mq('Dans une rédaction TVI, indiquez d’abord la propriété de f.', 'f est continue sur [a,b].', ['f est quelconque sur [a,b].', 'f est discontinue sur [a,b].', 'f est définie seulement en a.'], 'continue', ['continue', 'quelconque', 'discontinue', 'définie seulement en a'], 'Le TVI exige la continuité sur l’intervalle fermé.', 'Sans continuité, le passage par 0 n’est pas garanti.'),
          mq('Pour conclure proprement après TVI et monotonie, donnez la formulation finale.', 'L’équation f(x)=0 admet une unique solution α dans l’intervalle.', ['La fonction vaut toujours 0.', 'Toutes les valeurs sont solutions.', 'La solution est hors de l’intervalle.'], 'unique solution α', ['unique solution α', 'toutes les valeurs', 'aucune solution', 'solution hors intervalle'], 'La conclusion doit mentionner existence et unicité.', 'On nomme souvent la solution α.'),
        ],
      },
      {
        title: 'Bijection et réciproque',
        description: 'Reconnaître les conditions de bijection et les propriétés de la réciproque.',
        cases: [
          mq('Pour montrer qu’une fonction est bijective de I vers J, choisissez la propriété suffisante du cours.', 'f est continue et strictement monotone sur I.', ['f est seulement positive sur I.', 'f est seulement paire sur I.', 'f est définie en un point.'], 'continue et strictement monotone', ['continue et strictement monotone', 'positive', 'paire', 'définie en un point'], 'Le cours associe continuité et stricte monotonie.', 'Cela permet d’obtenir une bijection de I vers f(I).'),
          mq('Si f:I→J est bijective, indiquez le sens de la réciproque.', 'f^{-1}:J→I.', ['f^{-1}:I→J.', 'f^{-1}:R→R toujours.', 'f^{-1}:I→I.'], 'J→I', ['J→I', 'I→J', 'R→R', 'I→I'], 'La réciproque inverse les ensembles de départ et d’arrivée.', 'Si y=f(x), alors f^{-1}(y)=x.'),
          mq('Indiquez l’axe de symétrie entre les courbes de f et f^{-1}.', 'Les courbes sont symétriques par rapport à y=x.', ['Les courbes sont symétriques par rapport à x=0.', 'Les courbes sont symétriques par rapport à y=0.', 'Les courbes sont parallèles.'], 'y=x', ['y=x', 'x=0', 'y=0', 'parallèles'], 'La première bissectrice échange abscisse et ordonnée.', 'C’est l’axe de symétrie des fonctions réciproques.'),
          mq('Pour exp et ln, identifiez la réciproque correcte.', 'La réciproque de exp(x) est ln(x).', ['La réciproque de exp(x) est x².', 'La réciproque de exp(x) est 1/x.', 'La réciproque de exp(x) est sin(x).'], 'ln(x)', ['ln(x)', 'x²', '1/x', 'sin(x)'], 'ln et exp annulent leurs effets respectifs.', 'ln(exp(x))=x et exp(ln(x))=x pour x>0.'),
          mq('Pour la dérivée d’une réciproque, choisissez la formule utile.', '(f^{-1})’(y0)=1/f’(x0) avec y0=f(x0).', ['(f^{-1})’(y0)=f’(x0).', '(f^{-1})’(y0)=0.', '(f^{-1})’(y0)=f(x0).'], '1/f’(x0)', ['1/f’(x0)', 'f’(x0)', '0', 'f(x0)'], 'La pente de la réciproque est l’inverse de la pente initiale.', 'La formule exige f’(x0) non nul.'),
        ],
      },
      {
        title: 'Lecture graphique de la réciproque',
        description: 'Interpréter les points et la symétrie sur un repère.',
        cases: [
          mq('Si A(2,5) appartient à Cf, donnez le point correspondant sur Cf^{-1}.', 'A’(5,2) appartient à Cf^{-1}.', ['A’(2,5) appartient à Cf^{-1}.', 'A’(-2,-5) appartient à Cf^{-1}.', 'A’(5,5) appartient à Cf^{-1}.'], '(5,2)', ['(5,2)', '(2,5)', '(-2,-5)', '(5,5)'], 'On échange les coordonnées.', 'La symétrie par rapport à y=x transforme (a,b) en (b,a).'),
          mq('Si f(3)=7, traduisez avec la réciproque.', 'f^{-1}(7)=3.', ['f^{-1}(3)=7.', 'f^{-1}(7)=10.', 'f^{-1}(3)=3.'], 'f^{-1}(7)=3', ['f^{-1}(7)=3', 'f^{-1}(3)=7', 'f^{-1}(7)=10', 'f^{-1}(3)=3'], 'La réciproque renvoie l’antécédent.', 'Comme 7 est l’image de 3, 3 est l’image de 7 par f^{-1}.'),
          mq('Pour construire Cf^{-1}, choisissez l’opération géométrique.', 'On réfléchit Cf par rapport à la droite y=x.', ['On translate Cf vers le haut.', 'On multiplie les ordonnées par 2.', 'On efface les abscisses négatives.'], 'réfléchit', ['réfléchit', 'translate', 'multiplie', 'efface'], 'La réciproque correspond à une symétrie.', 'La droite y=x est le miroir.'),
          mq('Si f est croissante et bijective, indiquez le sens de variation de f^{-1}.', 'f^{-1} est croissante sur J.', ['f^{-1} est décroissante sur J.', 'f^{-1} est constante.', 'f^{-1} n’a pas de variation.'], 'croissante', ['croissante', 'décroissante', 'constante', 'sans variation'], 'La réciproque conserve le sens de variation.', 'Une bijection croissante a une réciproque croissante.'),
          mq('Pour vérifier graphiquement une réciproque, choisissez le test cohérent.', 'Les points correspondants doivent être symétriques par rapport à y=x.', ['Les points doivent avoir même abscisse.', 'Les courbes doivent être horizontales.', 'Les ordonnées doivent être toutes positives.'], 'symétriques par rapport à y=x', ['symétriques par rapport à y=x', 'même abscisse', 'horizontales', 'ordonnées positives'], 'La symétrie est le critère géométrique.', 'On vérifie l’échange des coordonnées.'),
        ],
      },
    ],
  },
  {
    subject: 'Mathématiques',
    number: 3,
    title: 'Primitives et intégrales',
    description: 'Primitives usuelles, intégrales définies, changement de primitive et intégration par parties.',
    quizItems: [
      {
        title: 'Primitives usuelles',
        description: 'Associer une fonction à une primitive correcte.',
        cases: [
          mq('Donnez une primitive de f(x)=x².', 'F(x)=x³/3.', ['F(x)=2x.', 'F(x)=3x².', 'F(x)=x²/2.'], 'x³/3', ['x³/3', '2x', '3x²', 'x²/2'], 'On augmente l’exposant de 1 puis on divise par le nouvel exposant.', 'Une primitive de x² est x³/3.'),
          mq('Donnez une primitive de f(x)=1/x sur ]0,+∞[.', 'F(x)=ln x.', ['F(x)=x²/2.', 'F(x)=1/x².', 'F(x)=e^x.'], 'ln x', ['ln x', 'x²/2', '1/x²', 'e^x'], 'La dérivée de ln x est 1/x.', 'Sur un intervalle positif, une primitive de 1/x est ln x.'),
          mq('Donnez une primitive de f(x)=cos x.', 'F(x)=sin x.', ['F(x)=-sin x.', 'F(x)=-cos x.', 'F(x)=tan x.'], 'sin x', ['sin x', '-sin x', '-cos x', 'tan x'], 'La dérivée de sin x est cos x.', 'Donc sin x convient.'),
          mq('Donnez une primitive de f(x)=sin x.', 'F(x)=-cos x.', ['F(x)=cos x.', 'F(x)=sin x.', 'F(x)=1/cos x.'], '-cos x', ['-cos x', 'cos x', 'sin x', '1/cos x'], 'La dérivée de cos x vaut -sin x.', 'La dérivée de -cos x vaut sin x.'),
          mq('Pour f(x)=u’(x)e^{u(x)}, choisissez la primitive.', 'F(x)=e^{u(x)}.', ['F(x)=u(x)e^x.', 'F(x)=ln|u(x)|.', 'F(x)=u’(x)e^x.'], 'e^{u(x)}', ['e^{u(x)}', 'u(x)e^x', 'ln|u(x)|', 'u’(x)e^x'], 'La dérivée de e^u est u’e^u.', 'On reconnaît directement la forme composée.'),
        ],
      },
      {
        title: 'Intégrales définies',
        description: 'Calculer une intégrale avec une primitive et respecter les bornes.',
        cases: [
          mq('Pour I=∫_a^b f(x)dx et F primitive de f, choisissez la formule.', 'I=F(b)-F(a).', ['I=F(a)-F(b).', 'I=F(a)+F(b).', 'I=f(b)-f(a).'], 'F(b)-F(a)', ['F(b)-F(a)', 'F(a)-F(b)', 'F(a)+F(b)', 'f(b)-f(a)'], 'On évalue la primitive à la borne haute puis à la borne basse.', 'C’est la formule fondamentale.'),
          mq('Calculez ∫_0^1 2x dx.', '∫_0^1 2x dx = [x²]_0^1 = 1.', ['∫_0^1 2x dx = 0.', '∫_0^1 2x dx = 2.', '∫_0^1 2x dx = -1.'], '1', ['1', '0', '2', '-1'], 'Une primitive de 2x est x².', '1²-0²=1.'),
          mq('Calculez ∫_1^3 x² dx.', '∫_1^3 x² dx = [x³/3]_1^3 = 26/3.', ['∫_1^3 x² dx = 8.', '∫_1^3 x² dx = 9.', '∫_1^3 x² dx = 27/3.'], '26/3', ['26/3', '8', '9', '27/3'], 'Évaluez x³/3 en 3 puis en 1.', '27/3-1/3=26/3.'),
          mq('Calculez ∫_1^e 1/x dx.', '∫_1^e 1/x dx = [ln x]_1^e = 1.', ['∫_1^e 1/x dx = e.', '∫_1^e 1/x dx = 0.', '∫_1^e 1/x dx = -1.'], '1', ['1', 'e', '0', '-1'], 'ln e=1 et ln 1=0.', 'La différence vaut 1.'),
          mq('Dans un calcul d’aire, précisez l’unité finale.', 'L’intégrale positive donne une aire en unités d’aire.', ['L’intégrale donne toujours des degrés.', 'L’intégrale donne une probabilité uniquement.', 'L’intégrale n’a jamais d’unité.'], 'unités d’aire', ['unités d’aire', 'degrés', 'probabilité uniquement', 'aucune unité'], 'Le document note u.a. pour unité d’aire.', 'Une aire se conclut en unités d’aire.'),
        ],
      },
      {
        title: 'Intégration par parties',
        description: 'Choisir u, v, u’ et v’ pour appliquer la formule d’IPP.',
        cases: [
          mq('Choisissez la formule d’intégration par parties utilisée dans le cours.', '∫u’v=[uv]-∫uv’.', ['∫u’v=∫uv’.', '∫u’v=[u’v’]-∫uv.', '∫u’v=u+v.'], '∫u’v=[uv]-∫uv’', ['∫u’v=[uv]-∫uv’', '∫u’v=∫uv’', '∫u’v=u+v', '[u’v’]-∫uv'], 'Elle vient de la dérivée du produit uv.', 'On réarrange (uv)’=u’v+uv’.'),
          mq('Pour ∫x²lnx dx, choisissez le couple du document.', 'u’=x² et v=lnx.', ['u’=lnx et v=x².', 'u’=x et v=x.', 'u’=1/x et v=x².'], 'u’=x² et v=lnx', ['u’=x² et v=lnx', 'u’=lnx et v=x²', 'u’=x et v=x', 'u’=1/x et v=x²'], 'On primitive x² facilement et on dérive ln x facilement.', 'Cela donne u=x³/3 et v’=1/x.'),
          mq('Si u’=x², choisissez u.', 'u=x³/3.', ['u=2x.', 'u=x²/2.', 'u=3x².'], 'x³/3', ['x³/3', '2x', 'x²/2', '3x²'], 'Il faut prendre une primitive de x².', 'La primitive est x³/3.'),
          mq('Si v=lnx, choisissez v’.', 'v’=1/x.', ['v’=x.', 'v’=lnx/x.', 'v’=e^x.'], '1/x', ['1/x', 'x', 'lnx/x', 'e^x'], 'La dérivée du logarithme est 1/x.', 'C’est ce qui simplifie le produit.'),
          mq('Dans une IPP définie, indiquez ce qu’il faut faire avec [uv].', 'On évalue [uv] entre la borne basse et la borne haute.', ['On supprime toujours [uv].', 'On remplace [uv] par 0.', 'On inverse les bornes sans calcul.'], 'évalue [uv]', ['évalue [uv]', 'supprime [uv]', 'remplace par 0', 'inverse les bornes'], 'Le crochet représente une évaluation aux bornes.', 'Il faut calculer uv(b)-uv(a).'),
        ],
      },
    ],
  },
  {
    subject: 'Mathématiques',
    number: 4,
    title: 'Probabilités, Bernoulli et loi binomiale',
    description: 'Univers, événements, combinaisons, arrangements, variable aléatoire, espérance, variance et loi binomiale.',
    quizItems: [
      {
        title: 'Univers et événements',
        description: 'Employer le vocabulaire probabiliste et les opérations sur événements.',
        cases: [
          mq('Pour un lancer de dé équilibré, donnez l’univers.', 'Ω={1,2,3,4,5,6}.', ['Ω={0,1,2,3,4,5}.', 'Ω={pile,face}.', 'Ω={1,2,3}.'], 'Ω={1,2,3,4,5,6}', ['Ω={1,2,3,4,5,6}', 'Ω={0,1,2,3,4,5}', 'Ω={pile,face}', 'Ω={1,2,3}'], 'L’univers contient toutes les issues possibles.', 'Un dé cubique numéroté de 1 à 6 a six issues.'),
          mq('Identifiez la notation de l’intersection.', 'A∩B signifie A et B réalisés en même temps.', ['A∪B signifie A et B réalisés en même temps.', 'A∩B signifie ni A ni B.', 'A∩B signifie A seulement.'], 'A∩B', ['A∩B', 'A∪B', 'A seulement', 'ni A ni B'], 'Intersection signifie simultanéité.', 'A∩B regroupe les issues communes à A et B.'),
          mq('En équiprobabilité, choisissez la formule de P(A).', 'P(A)=Card(A)/Card(Ω).', ['P(A)=Card(Ω)/Card(A).', 'P(A)=Card(A)+Card(Ω).', 'P(A)=Card(A)-Card(Ω).'], 'Card(A)/Card(Ω)', ['Card(A)/Card(Ω)', 'Card(Ω)/Card(A)', 'Card(A)+Card(Ω)', 'Card(A)-Card(Ω)'], 'On divise les cas favorables par les cas possibles.', 'C’est la formule d’équiprobabilité.'),
          mq('Pour deux tirages simultanés, choisissez l’outil de dénombrement.', 'On utilise les combinaisons C_n^p.', ['On utilise les arrangements avec répétition.', 'On utilise seulement n+p.', 'On utilise une dérivée.'], 'combinaisons C_n^p', ['combinaisons C_n^p', 'arrangements avec répétition', 'n+p', 'dérivée'], 'L’ordre ne compte pas dans un tirage simultané.', 'Les combinaisons conviennent.'),
          mq('Pour des tirages successifs avec remise, choisissez l’outil de dénombrement.', 'On utilise les arrangements avec répétition n^p.', ['On utilise seulement les combinaisons.', 'On utilise p/n.', 'On utilise une intégrale.'], 'arrangements avec répétition n^p', ['arrangements avec répétition n^p', 'combinaisons seules', 'p/n', 'intégrale'], 'L’ordre compte et on remet à chaque fois.', 'Chaque tirage conserve le même nombre de possibilités.'),
        ],
      },
      {
        title: 'Variable aléatoire et paramètres',
        description: 'Construire une loi de probabilité et calculer les paramètres usuels.',
        cases: [
          mq('Pour une variable aléatoire discrète X, choisissez la notation de la loi.', 'La loi donne les valeurs x_i et les probabilités P(X=x_i).', ['La loi donne seulement E(X).', 'La loi donne seulement Ω.', 'La loi donne seulement σ.'], 'P(X=x_i)', ['P(X=x_i)', 'E(X) seulement', 'Ω seulement', 'σ seulement'], 'Une loi associe chaque valeur à sa probabilité.', 'On présente souvent un tableau.'),
          mq('Choisissez la formule de l’espérance.', 'E(X)=Σ x_i P(X=x_i).', ['E(X)=Σ P(X=x_i).', 'E(X)=Σ x_i.', 'E(X)=V(X)².'], 'Σ x_i P(X=x_i)', ['Σ x_i P(X=x_i)', 'Σ P(X=x_i)', 'Σ x_i', 'V(X)²'], 'L’espérance est une moyenne pondérée.', 'Chaque valeur est multipliée par sa probabilité.'),
          mq('Choisissez la formule pratique de la variance.', 'V(X)=E(X²)-[E(X)]².', ['V(X)=E(X)-E(X²).', 'V(X)=E(X)+1.', 'V(X)=σ(X).'], 'E(X²)-[E(X)]²', ['E(X²)-[E(X)]²', 'E(X)-E(X²)', 'E(X)+1', 'σ(X)'], 'La variance utilise le second moment.', 'On retire le carré de l’espérance.'),
          mq('Reliez écart-type et variance.', 'σ(X)=√V(X).', ['σ(X)=V(X)².', 'σ(X)=V(X)+1.', 'σ(X)=E(X).'], '√V(X)', ['√V(X)', 'V(X)²', 'V(X)+1', 'E(X)'], 'L’écart-type est la racine carrée de la variance.', 'Il retrouve l’unité de X.'),
          mq('Pour une fonction de répartition F, choisissez la définition.', 'F(x)=P(X≤x).', ['F(x)=P(X=x) uniquement.', 'F(x)=P(X>x).', 'F(x)=E(X).'], 'P(X≤x)', ['P(X≤x)', 'P(X=x)', 'P(X>x)', 'E(X)'], 'La fonction de répartition cumule les probabilités.', 'Elle donne la probabilité d’être inférieur ou égal à x.'),
        ],
      },
      {
        title: 'Bernoulli et loi binomiale',
        description: 'Reconnaître une épreuve de Bernoulli et appliquer la loi binomiale.',
        cases: [
          mq('Définissez une épreuve de Bernoulli.', 'Une épreuve de Bernoulli possède deux issues : succès ou échec.', ['Elle possède toujours trois issues.', 'Elle impose une infinité d’issues.', 'Elle interdit les probabilités.'], 'succès ou échec', ['succès ou échec', 'trois issues', 'infinité d’issues', 'sans probabilités'], 'Bernoulli signifie deux issues possibles.', 'On note souvent la probabilité du succès p.'),
          mq('Si on répète n épreuves indépendantes de Bernoulli de paramètre p, donnez la loi.', 'X suit une loi binomiale B(n,p).', ['X suit toujours une loi uniforme.', 'X suit une loi géométrique sans condition.', 'X suit une loi normale exacte.'], 'B(n,p)', ['B(n,p)', 'uniforme', 'géométrique', 'normale exacte'], 'La binomiale compte le nombre de succès.', 'Elle modélise n répétitions indépendantes.'),
          mq('Choisissez la formule de P(X=k) pour X~B(n,p).', 'P(X=k)=C_n^k p^k(1-p)^{n-k}.', ['P(X=k)=p+n+k.', 'P(X=k)=C_n^k p^{n-k}.', 'P(X=k)=k/n.'], 'C_n^k p^k(1-p)^{n-k}', ['C_n^k p^k(1-p)^{n-k}', 'p+n+k', 'C_n^k p^{n-k}', 'k/n'], 'On choisit les places des succès puis on multiplie les probabilités.', 'C_n^k compte les positions des k succès.'),
          mq('Pour X~B(n,p), choisissez l’espérance.', 'E(X)=np.', ['E(X)=n+p.', 'E(X)=p/n.', 'E(X)=n(1-p).'], 'np', ['np', 'n+p', 'p/n', 'n(1-p)'], 'L’espérance binomiale est nombre d’essais × probabilité de succès.', 'C’est une formule directe du cours.'),
          mq('Pour X~B(n,p), choisissez la variance.', 'V(X)=np(1-p).', ['V(X)=np.', 'V(X)=n+p.', 'V(X)=p(1-p)/n.'], 'np(1-p)', ['np(1-p)', 'np', 'n+p', 'p(1-p)/n'], 'La variance binomiale ajoute le facteur q=1-p.', 'On écrit aussi npq.'),
        ],
      },
    ],
  },
  {
    subject: 'Mathématiques',
    number: 5,
    title: 'Exponentielle, suites et nombres complexes',
    description: 'Fonction exponentielle, suites arithmétiques et géométriques, équations complexes et géométrie dans le plan complexe.',
    quizItems: [
      {
        title: 'Fonction exponentielle',
        description: 'Étudier le domaine, les limites, la dérivée et les propriétés de exp.',
        cases: [
          mq('Donnez le domaine de définition de e^x.', 'La fonction e^x est définie sur R.', ['La fonction e^x est définie seulement sur R+*.', 'La fonction e^x est définie sur ]0,+∞[.', 'La fonction e^x est définie sauf en 0.'], 'R', ['R', 'R+*', ']0,+∞[', 'R\\{0}'], 'L’exponentielle accepte tout réel.', 'Son domaine est R.'),
          mq('Donnez la dérivée de e^x.', '(e^x)’=e^x.', ['(e^x)’=lnx.', '(e^x)’=1/x.', '(e^x)’=xe^{x-1}.'], 'e^x', ['e^x', 'lnx', '1/x', 'xe^{x-1}'], 'L’exponentielle est sa propre dérivée.', 'C’est une propriété fondamentale.'),
          mq('Donnez la limite de e^x quand x tend vers +∞.', 'lim_{x→+∞} e^x=+∞.', ['lim_{x→+∞} e^x=0.', 'lim_{x→+∞} e^x=-∞.', 'lim_{x→+∞} e^x=1.'], '+∞', ['+∞', '0', '-∞', '1'], 'L’exponentielle croît très vite.', 'Elle diverge vers +∞.'),
          mq('Donnez la limite de e^x quand x tend vers -∞.', 'lim_{x→-∞} e^x=0.', ['lim_{x→-∞} e^x=+∞.', 'lim_{x→-∞} e^x=-∞.', 'lim_{x→-∞} e^x=1.'], '0', ['0', '+∞', '-∞', '1'], 'La courbe admet l’axe des abscisses comme asymptote à gauche.', 'La limite vaut 0.'),
          mq('Simplifiez e^{a+b}.', 'e^{a+b}=e^a×e^b.', ['e^{a+b}=e^a+e^b.', 'e^{a+b}=e^{ab}.', 'e^{a+b}=a+b.'], 'e^a×e^b', ['e^a×e^b', 'e^a+e^b', 'e^{ab}', 'a+b'], 'Une somme dans l’exposant devient un produit.', 'C’est la propriété multiplicative de l’exponentielle.'),
        ],
      },
      {
        title: 'Suites numériques',
        description: 'Distinguer suites arithmétiques, géométriques, récurrence et limites.',
        cases: [
          mq('Reconnaissez la forme d’une suite arithmétique.', 'u_{n+1}=u_n+r.', ['u_{n+1}=u_n×q.', 'u_{n+1}=q/u_n.', 'u_{n+1}=u_n^2.'], 'u_{n+1}=u_n+r', ['u_{n+1}=u_n+r', 'u_{n+1}=u_n×q', 'q/u_n', 'u_n^2'], 'Une suite arithmétique ajoute une raison constante.', 'La différence u_{n+1}-u_n vaut r.'),
          mq('Reconnaissez la forme d’une suite géométrique.', 'u_{n+1}=q u_n.', ['u_{n+1}=u_n+r.', 'u_{n+1}=u_n-q.', 'u_{n+1}=u_n+1.'], 'q u_n', ['q u_n', 'u_n+r', 'u_n-q', 'u_n+1'], 'Une suite géométrique multiplie par une raison constante.', 'Le quotient u_{n+1}/u_n vaut q si u_n≠0.'),
          mq('Donnez la formule explicite d’une suite arithmétique.', 'u_n=u_0+nr.', ['u_n=u_0q^n.', 'u_n=u_0+nq.', 'u_n=r^n.'], 'u_0+nr', ['u_0+nr', 'u_0q^n', 'u_0+nq', 'r^n'], 'On ajoute r à chaque rang.', 'À partir de u_0, après n pas, on ajoute nr.'),
          mq('Donnez la formule explicite d’une suite géométrique.', 'u_n=u_0q^n.', ['u_n=u_0+nr.', 'u_n=u_0+nq.', 'u_n=q+n.'], 'u_0q^n', ['u_0q^n', 'u_0+nr', 'u_0+nq', 'q+n'], 'On multiplie par q à chaque rang.', 'Après n pas, le facteur est q^n.'),
          mq('Pour montrer qu’une suite est constante, choisissez le critère.', 'On montre que u_{n+1}-u_n=0 pour tout n.', ['On montre que u_{n+1}-u_n=1.', 'On montre que u_n>0 seulement.', 'On montre que u_n est définie.'], 'u_{n+1}-u_n=0', ['u_{n+1}-u_n=0', 'u_{n+1}-u_n=1', 'u_n>0', 'u_n définie'], 'Une suite constante ne varie pas.', 'La différence de deux termes consécutifs est nulle.'),
        ],
      },
      {
        title: 'Nombres complexes',
        description: 'Utiliser parties réelle et imaginaire, factorisation, affixes et similitude directe.',
        cases: [
          mq('Pour qu’un nombre complexe a+ib soit nul, choisissez la condition.', 'a=0 et b=0.', ['a=0 ou b=0.', 'a=b.', 'a+b=1.'], 'a=0 et b=0', ['a=0 et b=0', 'a=0 ou b=0', 'a=b', 'a+b=1'], 'Partie réelle et partie imaginaire doivent s’annuler.', 'C’est utilisé dans l’identification du document.'),
          mq('Identifiez la partie réelle de 4-3i.', 'La partie réelle est 4.', ['La partie réelle est -3.', 'La partie réelle est i.', 'La partie réelle est 1.'], '4', ['4', '-3', 'i', '1'], 'La partie réelle est le coefficient sans i.', 'Dans 4-3i, elle vaut 4.'),
          mq('Identifiez la partie imaginaire de 4-3i.', 'La partie imaginaire est -3.', ['La partie imaginaire est 4.', 'La partie imaginaire est -3i.', 'La partie imaginaire est i.'], '-3', ['-3', '4', '-3i', 'i'], 'La partie imaginaire est le coefficient de i.', 'On ne garde pas le symbole i dans Im(z).'),
          mq('Si z_A=2+i, donnez les coordonnées du point A.', 'A(2,1).', ['A(1,2).', 'A(2,-1).', 'A(-2,1).'], '(2,1)', ['(2,1)', '(1,2)', '(2,-1)', '(-2,1)'], 'L’affixe x+iy correspond au point (x,y).', 'La partie réelle donne l’abscisse et la partie imaginaire l’ordonnée.'),
          mq('Pour factoriser un polynôme complexe ayant 2i pour racine, choisissez le facteur.', 'Le facteur associé est (z-2i).', ['Le facteur associé est (z+2i).', 'Le facteur associé est (z-2).', 'Le facteur associé est (z+i).'], 'z-2i', ['z-2i', 'z+2i', 'z-2', 'z+i'], 'Si α est racine, z-α est facteur.', 'Avec α=2i, le facteur est z-2i.'),
        ],
      },
    ],
  },
];

const MATH_EXTRA_QUIZ_ITEMS = {
  1: [
    {
      title: 'Équations et inéquations logarithmiques',
      description: 'Résoudre avec les conditions d’existence, les propriétés de ln et la stricte croissance.',
      cases: [
        mq('Résolvez ln(x-1)=ln(5).', 'x-1=5 donc x=6, avec x>1.', ['x=4.', 'x=5.', 'x=-4.'], 'x=6', ['x=6', 'x=4', 'x=5', 'x=-4'], 'ln est injective sur ]0,+∞[.', 'On vérifie d’abord x-1>0 puis on égalise les arguments.'),
        mq('Résolvez ln(x)<ln(4).', 'x<4 avec x>0 donc S=]0,4[.', ['S=]-∞,4[.', 'S=]4,+∞[.', 'S=[0,4].'], ']0,4[', [']0,4[', ']-∞,4[', ']4,+∞[', '[0,4]'], 'La croissance de ln conserve le sens de l’inégalité.', 'La condition x>0 ne doit pas disparaître.'),
        mq('Simplifiez ln(x²)-ln(x) sur ]0,+∞[.', 'ln(x²)-ln(x)=ln(x).', ['ln(x²)-ln(x)=ln(x²-x).', 'ln(x²)-ln(x)=x.', 'ln(x²)-ln(x)=2.'], 'ln(x)', ['ln(x)', 'ln(x²-x)', 'x', '2'], 'ln(a)-ln(b)=ln(a/b).', 'x²/x=x pour x>0.'),
        mq('Résolvez ln(x)+ln(2)=ln(10).', 'ln(2x)=ln(10) donc x=5, avec x>0.', ['x=8.', 'x=10.', 'x=1/5.'], 'x=5', ['x=5', 'x=8', 'x=10', 'x=1/5'], 'Une somme de logarithmes devient le logarithme du produit.', 'ln(2x)=ln(10) donne 2x=10.'),
      ],
    },
  ],
  2: [
    {
      title: 'Étude complète avant réciproque',
      description: 'Domaine, dérivée, variations, bijection et traduction par la fonction réciproque.',
      cases: [
        mq('Pour f(x)=x+lnx sur ]0,+∞[, donnez le signe de f’.', 'f’(x)=1+1/x>0 sur ]0,+∞[.', ['f’(x)=1-1/x<0 partout.', 'f’(x)=lnx.', 'f’(x)=0 partout.'], 'f’(x)>0', ['f’(x)>0', 'f’(x)<0', 'f’(x)=lnx', 'f’(x)=0'], 'Sur ]0,+∞[, 1/x est positif.', 'La fonction est strictement croissante.'),
        mq('Concluez sur la bijection de f(x)=x+lnx.', 'f réalise une bijection de ]0,+∞[ vers R.', ['f réalise une bijection de R vers R.', 'f n’est pas monotone.', 'f est définie sur ]-∞,0[.'], ']0,+∞[ vers R', [']0,+∞[ vers R', 'R vers R', 'pas monotone', ']-∞,0['], 'Les limites sont -∞ en 0+ et +∞ en +∞.', 'Continuité et stricte croissance donnent la bijection.'),
        mq('Si f(1)=1, donnez la valeur de la réciproque.', 'f^{-1}(1)=1.', ['f^{-1}(1)=0.', 'f^{-1}(1)=e.', 'f^{-1}(1)=-1.'], 'f^{-1}(1)=1', ['f^{-1}(1)=1', '0', 'e', '-1'], 'La réciproque renvoie l’antécédent.', 'Si l’image de 1 est 1, l’antécédent de 1 est 1.'),
        mq('Donnez la dérivée de la réciproque en 1 si f’(1)=2.', '(f^{-1})’(1)=1/2.', ['(f^{-1})’(1)=2.', '(f^{-1})’(1)=0.', '(f^{-1})’(1)=-2.'], '1/2', ['1/2', '2', '0', '-2'], 'La dérivée réciproque est l’inverse de la dérivée initiale.', 'On applique 1/f’(x0).'),
      ],
    },
  ],
  3: [
    {
      title: 'Aires, primitives composées et IPP',
      description: 'Choisir la bonne primitive, poser une IPP et conclure en unités d’aire.',
      cases: [
        mq('Calculez une primitive de 2x e^{x²}.', 'Une primitive est e^{x²}.', ['Une primitive est 2e^{x²}.', 'Une primitive est x²e^x.', 'Une primitive est ln(x²).'], 'e^{x²}', ['e^{x²}', '2e^{x²}', 'x²e^x', 'ln(x²)'], 'On reconnaît u’e^u avec u=x².', 'La dérivée de e^{x²} vaut 2xe^{x²}.'),
        mq('Pour ∫_0^1 e^{2x}dx, choisissez la primitive.', 'Une primitive est (1/2)e^{2x}.', ['Une primitive est 2e^{2x}.', 'Une primitive est e^{x²}.', 'Une primitive est ln(2x).'], '(1/2)e^{2x}', ['(1/2)e^{2x}', '2e^{2x}', 'e^{x²}', 'ln(2x)'], 'Il faut compenser la dérivée de 2x.', 'La dérivée de (1/2)e^{2x} vaut e^{2x}.'),
        mq('Dans une IPP de ∫x e^x dx, choisissez u et v’.', 'On prend u=x et v’=e^x.', ['On prend u=e^x et v’=x.', 'On prend u=x² et v’=lnx.', 'On prend u=1 et v’=x.'], 'u=x et v’=e^x', ['u=x et v’=e^x', 'u=e^x et v’=x', 'u=x²', 'u=1'], 'On dérive le polynôme et on primitive exponentielle facilement.', 'Ce choix simplifie l’intégrale restante.'),
        mq('Si f est positive sur [a,b], interprétez ∫_a^b f(x)dx.', 'C’est l’aire sous la courbe en unités d’aire.', ['C’est une longueur en cm.', 'C’est une probabilité obligatoire.', 'C’est toujours nul.'], 'aire sous la courbe', ['aire sous la courbe', 'longueur', 'probabilité', 'nul'], 'L’intégrale positive mesure l’aire entre courbe et axe.', 'On conclut en unités d’aire.'),
      ],
    },
  ],
  4: [
    {
      title: 'Dénombrement et loi binomiale en situation',
      description: 'Choisir entre combinaison, arrangement et modèle binomial selon l’expérience.',
      cases: [
        mq('Pour choisir 3 élèves parmi 12 sans ordre, choisissez le calcul.', 'On calcule C_12^3.', ['On calcule 12^3.', 'On calcule A_12^3.', 'On calcule 12+3.'], 'C_12^3', ['C_12^3', '12^3', 'A_12^3', '12+3'], 'Sans ordre, on utilise les combinaisons.', 'On choisit un groupe, pas une liste ordonnée.'),
        mq('Pour former un code de 4 chiffres avec répétition, choisissez le cardinal.', 'Il y a 10^4 codes.', ['Il y a C_10^4 codes.', 'Il y a 10×4 codes.', 'Il y a 4^10 codes.'], '10^4', ['10^4', 'C_10^4', '10×4', '4^10'], 'Chaque position a 10 possibilités.', 'La répétition rend les choix indépendants.'),
        mq('Pour X~B(20;0,3), donnez E(X).', 'E(X)=20×0,3=6.', ['E(X)=20+0,3.', 'E(X)=0,3/20.', 'E(X)=14.'], '6', ['6', '20,3', '0,015', '14'], 'L’espérance binomiale vaut np.', '20 multiplié par 0,3 donne 6.'),
        mq('Pour X~B(10;0,4), écrivez P(X=3).', 'P(X=3)=C_10^3(0,4)^3(0,6)^7.', ['P(X=3)=10×0,4×3.', 'P(X=3)=C_10^3(0,4)^7.', 'P(X=3)=3/10.'], 'C_10^3(0,4)^3(0,6)^7', ['C_10^3(0,4)^3(0,6)^7', '10×0,4×3', 'C_10^3(0,4)^7', '3/10'], 'k succès donnent p^k et n-k échecs donnent (1-p)^{n-k}.', 'Ici n=10, k=3 et 1-p=0,6.'),
      ],
    },
  ],
  5: [
    {
      title: 'Synthèse exponentielle, suites et complexes',
      description: 'Relier calcul fonctionnel, récurrence et interprétation géométrique complexe.',
      cases: [
        mq('Résolvez e^x=7.', 'x=ln(7).', ['x=e^7.', 'x=7e.', 'x=1/7.'], 'ln(7)', ['ln(7)', 'e^7', '7e', '1/7'], 'ln est la réciproque de exp.', 'On applique ln aux deux membres.'),
        mq('Pour u_{n+1}=3u_n et u_0=2, donnez u_n.', 'u_n=2×3^n.', ['u_n=2+3n.', 'u_n=3+2n.', 'u_n=6n.'], '2×3^n', ['2×3^n', '2+3n', '3+2n', '6n'], 'C’est une suite géométrique de raison 3.', 'La formule est u_0q^n.'),
        mq('Pour z=5-2i, donnez Im(z).', 'Im(z)=-2.', ['Im(z)=5.', 'Im(z)=-2i.', 'Im(z)=2.'], '-2', ['-2', '5', '-2i', '2'], 'La partie imaginaire est le coefficient de i.', 'On ne garde pas le symbole i.'),
        mq('Si une similitude directe s’écrit z’=az+b, identifiez le coefficient utile au rapport.', 'Le rapport est |a|.', ['Le rapport est b.', 'Le rapport est a+b.', 'Le rapport est Re(b).'], '|a|', ['|a|', 'b', 'a+b', 'Re(b)'], 'Dans z’=az+b, a porte rotation et agrandissement.', 'Le module de a donne le rapport.'),
      ],
    },
  ],
};

function createMathQuestion(question, steps, answers, distractors, hint, explanation) {
  return {
    question,
    steps,
    hint,
    explanation,
    refreshes: answers.map((entry, index) => ({
      stepIndex: Math.min(index, steps.length - 1),
      instruction: entry.instruction,
      answer: entry.answer,
      distractors,
      hint,
      explanation,
    })),
  };
}

const MATH_EXERCISE_CONTEXTS = {
  1: [
    'On considère une fonction logarithmique définie par plusieurs expressions sur un intervalle réel. Les bornes proposées dans l’énoncé ne sont pas toutes admissibles : certaines annulent un argument de logarithme, d’autres rendent un quotient négatif. L’élève doit déterminer précisément les domaines, puis poursuivre l’étude par dérivation, simplification et limite.',
    'Dans une étude de croissance, une entreprise modélise une quantité positive par une expression contenant ln(x), ln(x-2) et un quotient. Les calculs ne sont valables que si chaque logarithme reçoit un argument strictement positif. On demande une rédaction complète avec tableau de signes lorsque le quotient intervient.',
    'Une courbe représentative est donnée par une expression logarithmique. Avant toute lecture graphique, il faut retrouver l’ensemble de définition, dériver, analyser une limite et expliquer pourquoi les bornes interdites ne peuvent pas être incluses.',
    'On étudie une famille de fonctions utilisant les propriétés ln(ab), ln(a/b), ln(a^n) et la dérivée de ln(u). L’objectif est de produire une solution de niveau bac, sans saut de calcul et avec justification de chaque transformation.',
  ],
  2: [
    'On étudie une fonction continue sur un intervalle fermé afin de localiser une solution d’équation. Des valeurs numériques aux bornes sont fournies, mais elles ne suffisent pas seules : il faut citer la continuité, vérifier le changement de signe, puis ajouter la monotonie pour obtenir l’unicité.',
    'Une fonction définie sur un intervalle I est destinée à être inversée. Il faut montrer qu’elle réalise une bijection de I vers son image J, préciser le sens de la fonction réciproque, interpréter graphiquement la symétrie et calculer une dérivée de réciproque.',
    'Le professeur donne une courbe croissante et plusieurs points remarquables. On demande de reconstruire les points de la courbe réciproque, de formuler la propriété f^{-1}(f(x))=x et de rédiger la conclusion avec les ensembles de départ et d’arrivée.',
    'Une équation f(x)=0 doit être résolue par encadrement. L’exercice impose de combiner TVI, calcul de dérivée, tableau de variation et conclusion sur l’existence et l’unicité de la solution α.',
  ],
  3: [
    'On considère plusieurs intégrales définies provenant d’aires sous courbe. Les fonctions sont positives sur les intervalles indiqués. Il faut trouver les primitives adaptées, évaluer correctement aux bornes et conclure avec l’unité d’aire.',
    'Une intégrale contenant un logarithme doit être calculée par intégration par parties. Le choix de u et v’ doit suivre la méthode du document : dériver le logarithme, primitiver le polynôme, puis calculer l’intégrale restante.',
    'Des primitives composées sont cachées dans des expressions de type u’u^n et u’e^u. L’exercice demande d’identifier u, de vérifier la présence de u’ et de compenser le coefficient si nécessaire.',
    'Un problème d’aire mélange calcul direct, primitive composée et IPP. Toutes les évaluations aux bornes doivent être écrites sous forme de crochets avant toute simplification numérique.',
  ],
  4: [
    'Une urne contient des boules de plusieurs couleurs. Selon les questions, le tirage est simultané, successif avec remise ou successif sans remise. Il faut donc choisir entre combinaisons, arrangements ou puissances, puis calculer les probabilités demandées.',
    'Une variable aléatoire X compte un gain ou un nombre de succès. L’énoncé demande de construire la loi complète de X, de vérifier que les probabilités totalisent 1, puis de calculer E(X), V(X) et σ(X).',
    'Une expérience répétée peut être modélisée par une loi binomiale seulement si les épreuves sont indépendantes, identiques et à deux issues. L’exercice impose de justifier ces conditions avant d’utiliser la formule C_n^k p^k(1-p)^{n-k}.',
    'Un sujet de probabilités combine dénombrement, événement contraire, fonction de répartition et paramètres d’une variable aléatoire. Les réponses attendues doivent distinguer clairement univers, événement et probabilité.',
  ],
  5: [
    'On étudie une fonction exponentielle puis une suite associée. L’exercice demande le domaine, la dérivée, les limites, le tableau de variation et une interprétation d’une relation de récurrence.',
    'Une suite numérique est donnée par récurrence. Il faut reconnaître si elle est arithmétique ou géométrique, obtenir une formule explicite, calculer un terme éloigné et interpréter la limite lorsque c’est possible.',
    'Dans le plan complexe, des points sont définis par leurs affixes. L’exercice demande de lire les coordonnées, séparer partie réelle et partie imaginaire, résoudre une équation complexe et interpréter une transformation de type z’=az+b.',
    'Un problème de synthèse mélange exponentielle, logarithme réciproque, suites et nombres complexes. Il faut résoudre chaque partie avec la méthode du cours et ne jamais confondre coefficient imaginaire et terme contenant i.',
  ],
};

function buildMathExerciseFromChapter(chapter, itemIndex, variant = 'exercice') {
  const baseTitle = variant === 'sujet-type' ? `Sujet type Bac — ${chapter.title}` : `Exercice long ${itemIndex + 1} — ${chapter.title}`;
  const context = MATH_EXERCISE_CONTEXTS[chapter.number]?.[itemIndex] || MATH_EXERCISE_CONTEXTS[chapter.number]?.[0] || chapter.description;
  const longIntro = variant === 'sujet-type'
    ? `Sujet type de mathématiques.\n\n${context}\n\nLe sujet est composé de parties liées. Les résultats intermédiaires peuvent être réutilisés dans les questions suivantes. Toute réponse doit être rédigée avec les conditions de validité, les calculs et une conclusion claire.`
    : `Énoncé.\n\n${context}\n\nOn demande de résoudre les questions suivantes comme dans une copie de mathématiques complète : les calculs doivent apparaître, les intervalles doivent être justifiés et les conclusions doivent être écrites en phrases.`;
  const supportText = `Données utiles du chapitre : ${chapter.description} Les notations usuelles sont celles du cours : D_f pour domaine, α pour une solution localisée par TVI, F(b)-F(a) pour une intégrale, C_n^k pour les combinaisons, E(X), V(X), σ(X) pour une variable aléatoire, Re(z) et Im(z) pour les complexes.`;
  const instructions = `Questions : traiter toutes les demandes dans l’ordre. Lorsque l’exercice demande une justification, ne pas se limiter au résultat final : écrire les conditions, la méthode, les calculs intermédiaires et la conclusion.`;
  const commonDistractors = ['condition large', 'borne incluse', 'signe inversé', 'résultat sans justification', 'méthode incomplète', 'conclusion absente', 'égalité non valable'];
  const questionSets = {
    1: [
      createMathQuestion('Déterminer le domaine de définition de f(x)=ln(x-2)+ln(7-x).', ['Imposer chaque argument strictement positif', 'Résoudre les deux inégalités', 'Intersecter les conditions puis conclure'], [
        { instruction: 'Écrire les deux conditions issues des logarithmes.', answer: 'x-2>0 et 7-x>0' },
        { instruction: 'Résoudre séparément les deux inégalités.', answer: 'x>2 et x<7' },
        { instruction: 'Conclure par l’intervalle du domaine.', answer: 'D_f=]2,7[' },
        { instruction: 'Justifier l’exclusion des bornes.', answer: 'les arguments de ln doivent être strictement positifs' },
      ], commonDistractors, 'Chaque logarithme impose un argument strictement positif.', 'Le domaine est l’intersection des deux conditions : ]2,7[.'),
      createMathQuestion('Étudier le signe de (x-1)/(x-5) pour définir ln((x-1)/(x-5)).', ['Repérer les valeurs interdites', 'Construire le signe du quotient', 'Garder uniquement les intervalles positifs'], [
        { instruction: 'Nommer les valeurs critiques du quotient.', answer: '1 et 5' },
        { instruction: 'Indiquer les intervalles où le quotient est positif.', answer: ']-∞,1[ et ]5,+∞[' },
        { instruction: 'Écrire le domaine du logarithme.', answer: 'D_f=]-∞,1[∪]5,+∞[' },
        { instruction: 'Expliquer pourquoi 1 et 5 sont exclus.', answer: 'le quotient ne doit être ni nul ni non défini' },
      ], commonDistractors, 'Un quotient est positif quand les deux facteurs ont le même signe.', 'Le logarithme exige un quotient strictement positif.'),
      createMathQuestion('Dériver f(x)=ln(3x-4)-ln(x+1).', ['Identifier les deux fonctions composées', 'Appliquer u’/u à chaque logarithme', 'Soustraire les dérivées correctement'], [
        { instruction: 'Dériver le premier logarithme.', answer: '3/(3x-4)' },
        { instruction: 'Dériver le second logarithme.', answer: '1/(x+1)' },
        { instruction: 'Assembler la dérivée de f.', answer: 'f’(x)=3/(3x-4)-1/(x+1)' },
        { instruction: 'Rappeler la règle utilisée.', answer: 'la dérivée de ln(u) est u’/u' },
      ], commonDistractors, 'Ne pas oublier le numérateur u’.', 'La dérivée finale est une différence de deux quotients.'),
      createMathQuestion('Calculer la limite de ln(x)/x quand x tend vers +∞.', ['Identifier la croissance comparée', 'Comparer ln(x) à x', 'Conclure sur le quotient'], [
        { instruction: 'Nommer la limite usuelle mobilisée.', answer: 'ln(x)/x tend vers 0' },
        { instruction: 'Interpréter la comparaison de croissances.', answer: 'x domine ln(x) à l’infini' },
        { instruction: 'Écrire la conclusion.', answer: 'lim_{x→+∞} ln(x)/x=0' },
      ], commonDistractors, 'Toute puissance positive de x domine ln(x).', 'Le quotient tend vers 0.'),
    ],
    2: [
      createMathQuestion('Montrer que g(x)=x²-2+ln(x) admet une solution dans ]1,2;1,4[.', ['Vérifier la continuité', 'Calculer les signes aux bornes', 'Appliquer le TVI'], [
        { instruction: 'Indiquer la continuité sur l’intervalle.', answer: 'g est continue sur [1,2;1,4]' },
        { instruction: 'Donner le signe en 1,2.', answer: 'g(1,2)<0' },
        { instruction: 'Donner le signe en 1,4.', answer: 'g(1,4)>0' },
        { instruction: 'Conclure par le TVI.', answer: 'il existe α∈]1,2;1,4[ tel que g(α)=0' },
      ], commonDistractors, 'Le changement de signe permet l’existence.', 'La continuité et les signes opposés donnent une racine.'),
      createMathQuestion('Justifier l’unicité de la solution précédente.', ['Calculer ou étudier la dérivée', 'Montrer la stricte monotonie', 'Associer TVI et monotonie'], [
        { instruction: 'Exprimer la dérivée.', answer: 'g’(x)=2x+1/x' },
        { instruction: 'Donner son signe sur l’intervalle positif.', answer: 'g’(x)>0' },
        { instruction: 'Conclure sur les variations.', answer: 'g est strictement croissante' },
        { instruction: 'Conclure sur l’unicité.', answer: 'la solution α est unique' },
      ], commonDistractors, 'Une fonction strictement monotone ne coupe pas deux fois le même niveau.', 'La dérivée positive assure l’unicité.'),
      createMathQuestion('Construire la réciproque d’une fonction bijective graphiquement.', ['Identifier la courbe initiale', 'Appliquer la symétrie', 'Traduire les points'], [
        { instruction: 'Nommer l’axe de symétrie.', answer: 'la droite y=x' },
        { instruction: 'Transformer un point (a,b).', answer: '(a,b) devient (b,a)' },
        { instruction: 'Écrire le sens de la réciproque.', answer: 'f^{-1}:J→I' },
      ], commonDistractors, 'La réciproque échange image et antécédent.', 'Graphiquement, on réfléchit la courbe par rapport à y=x.'),
      createMathQuestion('Calculer la dérivée d’une réciproque en y0=f(x0).', ['Repérer x0 et y0', 'Vérifier que f’(x0) est non nul', 'Appliquer la formule'], [
        { instruction: 'Écrire la relation entre y0 et x0.', answer: 'y0=f(x0)' },
        { instruction: 'Énoncer la formule.', answer: '(f^{-1})’(y0)=1/f’(x0)' },
        { instruction: 'Préciser la condition.', answer: 'f’(x0)≠0' },
      ], commonDistractors, 'La pente de la réciproque est l’inverse de la pente.', 'On applique directement la formule du cours.'),
    ],
    3: [
      createMathQuestion('Calculer I=∫_0^1 2x(x²+1)^3 dx.', ['Reconnaître la forme u’u^n', 'Trouver une primitive', 'Évaluer aux bornes'], [
        { instruction: 'Poser la fonction intérieure.', answer: 'u=x²+1 et u’=2x' },
        { instruction: 'Écrire une primitive.', answer: 'F(x)=(x²+1)^4/4' },
        { instruction: 'Évaluer entre 0 et 1.', answer: 'I=16/4-1/4' },
        { instruction: 'Conclure.', answer: 'I=15/4' },
      ], commonDistractors, 'La présence de 2x est la dérivée de x²+1.', 'La primitive composée permet le calcul direct.'),
      createMathQuestion('Calculer par IPP I=∫_1^3 x²ln(x) dx.', ['Choisir u’ et v', 'Appliquer la formule d’IPP', 'Calculer l’intégrale restante'], [
        { instruction: 'Choisir les fonctions comme dans le cours.', answer: 'u’=x² et v=ln(x)' },
        { instruction: 'Donner u et v’.', answer: 'u=x³/3 et v’=1/x' },
        { instruction: 'Écrire la formule appliquée.', answer: 'I=[x³ln(x)/3]_1^3-∫_1^3 x²/3 dx' },
        { instruction: 'Conclure après évaluation.', answer: 'I=9ln(3)-26/9' },
      ], commonDistractors, 'On primitive x² et on dérive ln(x).', 'L’IPP transforme l’intégrale en une intégrale de polynôme.'),
      createMathQuestion('Trouver une primitive de f(x)=3(3x-2)^4.', ['Identifier u et u’', 'Adapter le coefficient', 'Écrire la primitive'], [
        { instruction: 'Poser la fonction intérieure.', answer: 'u=3x-2 et u’=3' },
        { instruction: 'Reconnaître la forme.', answer: '3(3x-2)^4=u’u^4' },
        { instruction: 'Donner une primitive.', answer: 'F(x)=(3x-2)^5/5' },
      ], commonDistractors, 'La dérivée de 3x-2 est déjà présente.', 'On applique ∫u’u^n=u^{n+1}/(n+1).'),
      createMathQuestion('Interpréter une intégrale positive comme une aire.', ['Vérifier la positivité', 'Calculer l’intégrale', 'Conclure avec l’unité'], [
        { instruction: 'Indiquer la condition graphique.', answer: 'la fonction est positive sur [a,b]' },
        { instruction: 'Écrire le calcul d’aire.', answer: 'A=∫_a^b f(x)dx' },
        { instruction: 'Donner l’unité finale.', answer: 'unités d’aire' },
      ], commonDistractors, 'Une aire ne se conclut pas sans unité.', 'Si la fonction est positive, l’intégrale représente l’aire sous la courbe.'),
    ],
    4: [
      createMathQuestion('Résoudre un exercice d’urne avec tirage simultané de 2 boules.', ['Construire l’univers', 'Utiliser les combinaisons', 'Calculer les cas favorables'], [
        { instruction: 'Donner le cardinal de l’univers pour 8 boules prises 2 à 2.', answer: 'Card Ω=C_8^2=28' },
        { instruction: 'Indiquer l’outil utilisé.', answer: 'tirage simultané donc combinaisons' },
        { instruction: 'Écrire la probabilité d’un événement A.', answer: 'P(A)=Card(A)/28' },
      ], commonDistractors, 'Dans un tirage simultané, l’ordre ne compte pas.', 'On utilise les combinaisons.'),
      createMathQuestion('Construire la loi d’une variable X comptant le nombre de succès.', ['Définir les valeurs possibles', 'Calculer chaque probabilité', 'Présenter un tableau'], [
        { instruction: 'Écrire l’univers image.', answer: 'X(Ω)={0,1,2,3}' },
        { instruction: 'Nommer les probabilités à calculer.', answer: 'P(X=0), P(X=1), P(X=2), P(X=3)' },
        { instruction: 'Rédiger la conclusion.', answer: 'la loi de X est donnée par le tableau des valeurs et probabilités' },
      ], commonDistractors, 'Une loi donne toutes les valeurs possibles et leurs probabilités.', 'Le tableau est la présentation attendue.'),
      createMathQuestion('Calculer E(X), V(X) et σ(X) à partir d’une loi.', ['Appliquer l’espérance', 'Calculer le second moment', 'Déduire variance et écart-type'], [
        { instruction: 'Écrire la formule de l’espérance.', answer: 'E(X)=Σx_iP(X=x_i)' },
        { instruction: 'Écrire la formule de la variance.', answer: 'V(X)=E(X²)-[E(X)]²' },
        { instruction: 'Écrire la formule de l’écart-type.', answer: 'σ(X)=√V(X)' },
      ], commonDistractors, 'Les paramètres se calculent à partir de toute la loi.', 'L’écart-type est la racine de la variance.'),
      createMathQuestion('Identifier une loi binomiale dans une répétition indépendante.', ['Reconnaître Bernoulli', 'Vérifier indépendance et répétition', 'Donner les paramètres'], [
        { instruction: 'Nommer l’épreuve de base.', answer: 'épreuve de Bernoulli' },
        { instruction: 'Écrire la loi suivie.', answer: 'X suit B(n,p)' },
        { instruction: 'Donner la probabilité générale.', answer: 'P(X=k)=C_n^k p^k(1-p)^{n-k}' },
      ], commonDistractors, 'La loi binomiale compte les succès.', 'Il faut n répétitions indépendantes de même probabilité p.'),
    ],
    5: [
      createMathQuestion('Étudier une fonction exponentielle f(x)=e^x-x.', ['Déterminer le domaine', 'Calculer la dérivée', 'Étudier le signe et conclure'], [
        { instruction: 'Donner le domaine.', answer: 'D_f=R' },
        { instruction: 'Calculer la dérivée.', answer: 'f’(x)=e^x-1' },
        { instruction: 'Résoudre le signe de la dérivée.', answer: 'f’(x)=0 pour x=0' },
        { instruction: 'Conclure sur les variations.', answer: 'f décroît sur ]-∞,0] puis croît sur [0,+∞[' },
      ], commonDistractors, 'e^x est définie sur R et sa dérivée est elle-même.', 'Le signe de e^x-1 change en 0.'),
      createMathQuestion('Étudier une suite arithmétique de premier terme u0=3 et raison 5.', ['Identifier le type', 'Écrire la récurrence', 'Écrire la formule explicite'], [
        { instruction: 'Écrire la relation de récurrence.', answer: 'u_{n+1}=u_n+5' },
        { instruction: 'Écrire la formule explicite.', answer: 'u_n=3+5n' },
        { instruction: 'Calculer u_10.', answer: 'u_10=53' },
      ], commonDistractors, 'Une suite arithmétique ajoute la raison.', 'La formule est u_n=u_0+nr.'),
      createMathQuestion('Résoudre une équation complexe en séparant réel et imaginaire.', ['Remplacer dans l’expression', 'Regrouper réel et imaginaire', 'Annuler les deux parties'], [
        { instruction: 'Écrire la condition d’annulation.', answer: 'partie réelle=0 et partie imaginaire=0' },
        { instruction: 'Résoudre le système obtenu.', answer: 'les deux équations doivent donner la même valeur' },
        { instruction: 'Conclure.', answer: 'le nombre complexe est nul seulement si les deux parties sont nulles' },
      ], commonDistractors, 'Un complexe nul impose deux conditions simultanées.', 'On sépare toujours les termes avec i et sans i.'),
      createMathQuestion('Interpréter les affixes A=2+i, B=2i et C=3+3i dans le plan.', ['Lire réel et imaginaire', 'Placer les points', 'Utiliser les coordonnées'], [
        { instruction: 'Donner les coordonnées de A.', answer: 'A(2,1)' },
        { instruction: 'Donner les coordonnées de B.', answer: 'B(0,2)' },
        { instruction: 'Donner les coordonnées de C.', answer: 'C(3,3)' },
      ], commonDistractors, 'L’affixe x+iy donne le point (x,y).', 'La partie réelle est l’abscisse.'),
    ],
  };
  return {
    title: baseTitle,
    introduction: longIntro,
    supportText,
    instructions,
    timeLimitSeconds: variant === 'sujet-type' ? 14400 : 10800,
    initialScore: variant === 'sujet-type' ? 40 : 28,
    questions: rotate(questionSets[chapter.number] || questionSets[1], itemIndex),
  };
}

function buildMathExercises() {
  return MATH_QUIZ_CHAPTERS.flatMap((chapter) => [0, 1, 2, 3].map((index) => ({
    chapterNumber: chapter.number,
    ...buildMathExerciseFromChapter(chapter, index, 'exercice'),
    title: [
      `Exercice long ${index + 1} — ${chapter.title}`,
      `Exercice méthode approfondie — ${chapter.title}`,
      `Exercice type contrôle — ${chapter.title}`,
      `Exercice synthèse guidée — ${chapter.title}`,
    ][index],
  })));
}

function buildMathSujetTypes() {
  return MATH_QUIZ_CHAPTERS.flatMap((chapter) => [0, 1].map((index) => ({
    chapterNumber: chapter.number,
    ...buildMathExerciseFromChapter(chapter, index, 'sujet-type'),
    title: index === 0 ? `Sujet type Bac — ${chapter.title}` : `Sujet type Bac approfondi — ${chapter.title}`,
  })));
}

const MATH_CHAPTERS = attachExercises(MATH_QUIZ_CHAPTERS, buildMathExercises()).map((chapter) => ({
  ...chapter,
  quizItems: [
    ...(chapter.quizItems || []),
    ...(MATH_EXTRA_QUIZ_ITEMS[chapter.number] || []),
  ],
  sujetTypes: buildMathSujetTypes().filter((item) => item.chapterNumber === chapter.number),
}));

const MASSIVE_DOWNLOADABLE_EXAMPLES = [
  ...buildQuizPackEntries(FRENCH_CHAPTERS, 2),
  ...buildExercisePackEntries(FRENCH_CHAPTERS, 2),
  ...buildQuizPackEntries(ENGLISH_CHAPTERS, 2),
  ...buildExercisePackEntries(ENGLISH_CHAPTERS, 2),
  ...buildQuizPackEntries(MATH_CHAPTERS, 4),
  ...buildExercisePackEntries(MATH_CHAPTERS, 4),
  ...buildSujetTypePackEntries(MATH_CHAPTERS, 4),
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
const firstMathSuggestion = firstPayloadByKind(MASSIVE_DOWNLOADABLE_EXAMPLES, (payload) => payload.kind === 'quiz_mode_suggestion' && payload.chapterTitle === 'Fonction logarithme népérien');
const firstMathDeminage = firstPayloadByKind(MASSIVE_DOWNLOADABLE_EXAMPLES, (payload) => payload.kind === 'quiz_mode_deminage' && payload.chapterTitle === 'Fonction logarithme népérien');
const firstMathExerciseFiles = MASSIVE_DOWNLOADABLE_EXAMPLES
  .find((entry) => entry.id === 'mathematiques-exercise-pack-1')
  ?.files || [];
const firstMathSujetTypeFiles = MASSIVE_DOWNLOADABLE_EXAMPLES
  .find((entry) => entry.id === 'mathematiques-sujet-type-pack-1')
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
  firstMathSuggestion ? {
    id: 'math_terminale_quiz_massif_suggestion',
    category: 'Terminale massif',
    label: 'Mathématiques Terminale · Quiz suggestion',
    description: 'Extrait d un pack massif de quiz Terminale en Mathématiques.',
    payload: firstMathSuggestion,
  } : null,
  firstMathDeminage ? {
    id: 'math_terminale_quiz_massif_deminage',
    category: 'Terminale massif',
    label: 'Mathématiques Terminale · Quiz déminage',
    description: 'Extrait du mode Déminage pour les quiz Terminale en Mathématiques.',
    payload: firstMathDeminage,
  } : null,
  ...firstMathExerciseFiles.map((file, index) => ({
    id: `math_terminale_exercice_long_${index + 1}`,
    category: 'Terminale massif',
    label: `Mathématiques Terminale · ${file.label}`,
    description: 'Extrait d un exercice long Terminale en Mathématiques.',
    payload: file.payload,
  })),
  ...firstMathSujetTypeFiles.map((file, index) => ({
    id: `math_terminale_sujet_type_long_${index + 1}`,
    category: 'Terminale massif',
    label: `Mathématiques Terminale · ${file.label}`,
    description: 'Extrait d un sujet type long Terminale en Mathématiques.',
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
