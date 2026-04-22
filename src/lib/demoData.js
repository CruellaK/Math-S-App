/* ═══════════════════════════════════════════════════
   DEMO DATA — Exemples embarqués pour toutes matières
   Math block-input, Français word bank, Histoire MCQ
   ═══════════════════════════════════════════════════ */

export const DEMO_CHAPTERS = {
  /* ── MATHÉMATIQUES (id: 1) ── */
  1: [
    {
      number: 1,
      title: 'Démo Math — Exercices & Quiz',
      quizzes: [
        {
          quiz_metadata: {
            chapter_num: 1,
            chapter_title: 'Démo Math — Exercices & Quiz',
            quiz_title: 'Quiz démo — 5 modes',
          },
          modeQuestions: {
            suggestion: [
              {
                text: 'Dans le nombre complexe $z = 2 + 7i$, quelle affirmation décrit correctement la partie imaginaire ?',
                options: [
                  'La partie imaginaire vaut $7$, car c’est le coefficient de $i$ dans $a + bi$.',
                  'La partie imaginaire vaut $2$, car c’est le premier terme du nombre.',
                  'La partie imaginaire vaut $7i$, car elle inclut obligatoirement l’unité imaginaire.',
                  'La partie imaginaire vaut $9$, car c’est la somme des deux coefficients.',
                ],
                correct_answer: 'La partie imaginaire vaut $7$, car c’est le coefficient de $i$ dans $a + bi$.',
                hint: 'Dans l’écriture $a + bi$, la partie imaginaire est le coefficient réel qui multiplie $i$.',
                explanation: 'Pour $z = a + bi$, la partie imaginaire est $b$ (sans le $i$). Ici $b = 7$.',
              },
              {
                text: 'On considère l’équation $2x + 3 = 11$. Quelle méthode et quel résultat sont corrects ?',
                options: [
                  'On retire $3$ de chaque côté puis on divise par $2$ : on obtient $x = 4$.',
                  'On retire $2$ de chaque côté puis on divise par $3$ : on obtient $x = 3$.',
                  'On multiplie par $2$ de chaque côté : on obtient $x = 8$.',
                  'On remplace $x$ par $11$ et on simplifie : on obtient $x = 5$.',
                ],
                correct_answer: 'On retire $3$ de chaque côté puis on divise par $2$ : on obtient $x = 4$.',
                hint: 'Isolez $x$ : soustrayez d’abord la constante, puis divisez par le coefficient de $x$.',
                explanation: '$2x + 3 = 11 \\Rightarrow 2x = 8 \\Rightarrow x = 4$.',
              },
              {
                text: 'Laquelle des propositions suivantes donne correctement la dérivée de $f(x) = x^2$ ?',
                options: [
                  'La dérivée est $f\'(x) = 2x$, appliquée à la formule $(x^n)\' = nx^{n-1}$.',
                  'La dérivée est $f\'(x) = x^2$, car la dérivée conserve la forme initiale.',
                  'La dérivée est $f\'(x) = 2$, car on supprime simplement l’exposant.',
                  'La dérivée est $f\'(x) = x$, car on divise l’exposant par lui-même.',
                ],
                correct_answer: 'La dérivée est $f\'(x) = 2x$, appliquée à la formule $(x^n)\' = nx^{n-1}$.',
                hint: 'Utilisez $(x^n)\' = n x^{n-1}$ avec $n = 2$.',
                explanation: 'Pour $n = 2$ : $(x^2)\' = 2 x^{2-1} = 2x$.',
              },
            ],
            input: [
              {
                text: 'Complétez : dans $z = 2 + 7i$, la partie imaginaire est __.',
                correct_answer: '7',
                acceptedAnswers: ['7'],
                blockOptions: ['7', '2', '7i', '9'],
                maxLength: 2,
                hint: 'On lit le coefficient de $i$.',
                explanation: 'Le coefficient de $i$ est $7$.',
              },
              {
                text: 'Complétez : si $2x + 3 = 11$, alors $x = __$.',
                correct_answer: '4',
                acceptedAnswers: ['4'],
                blockOptions: ['4', '5', '8', '2'],
                maxLength: 2,
                hint: 'Retirez 3 puis divisez par 2.',
                explanation: '$2x = 8$, donc $x = 4$.',
              },
              {
                text: 'Complétez : l\'inconnue usuelle en algèbre est __.',
                correct_answer: 'x',
                acceptedAnswers: ['x', 'X'],
                blockOptions: ['x', 'y', 'z', 't'],
                maxLength: 1,
                hint: 'C\'est la lettre la plus utilisée pour une inconnue.',
                explanation: 'On note souvent l\'inconnue $x$.',
              },
            ],
            trap: [
              {
                text: 'Repérez les propositions piégées.',
                options: [
                  { text: 'La partie imaginaire de $2 + 7i$ vaut $7$.', is_trap: false },
                  { text: 'Si $2x + 3 = 11$, alors $x = 5$.', is_trap: true },
                  { text: '$(x^2)\' = 2x$.', is_trap: false },
                ],
                hints: [
                  { text: 'Une seule égalité est fausse.', importance: 'mineur', nature: 'concret', level: 1 },
                  { text: 'Isolez $x$ dans $2x+3=11$ puis vérifiez.', importance: 'majeur', nature: 'theorique', level: 2 },
                ],
                explanation: 'Le piège est $x = 5$ ; le mode ajoute aussi une option vide.',
              },
              {
                text: 'Repérez les propositions piégées sur les calculs usuels.',
                options: [
                  { text: '$3 + 4 = 7$', is_trap: false },
                  { text: '$5 - 2 = 1$', is_trap: true },
                  { text: '$2 \\times 3 = 6$', is_trap: false },
                ],
                hint: 'Refaites chaque calcul mentalement.',
                explanation: 'Le piège est $5 - 2 = 1$ ; le mode ajoute aussi une option vide.',
              },
              {
                text: 'Repérez les propositions piégées sur les lettres mathématiques.',
                options: [
                  { text: 'La lettre $x$ peut représenter une inconnue.', is_trap: false },
                  { text: 'Le symbole $=$ signifie « différent de ».', is_trap: true },
                  { text: 'Le chiffre $7$ est un nombre.', is_trap: false },
                ],
                hint: 'Regardez la signification des symboles.',
                explanation: 'Le piège est « $=$ signifie différent de » ; le mode ajoute aussi une option vide.',
              },
            ],
            duel_intrus: [
              {
                text: 'Choisis le bloc qui donne la dérivée correcte de $x^2$.',
                options: [
                  { text: '$2x$', is_trap: false },
                  { text: '$x^2$', is_trap: true },
                ],
                hints: [
                  { text: 'Une seule proposition suit $(x^n)\'=nx^{n-1}$.', importance: 'mineur', nature: 'formule', level: 1 },
                ],
                explanation: 'La dérivée de $x^2$ est $2x$, pas $x^2$.',
              },
              {
                text: 'Quel calcul donne la bonne racine de $x^2=9$ ?',
                options: [
                  { text: '$x=\\pm 3$', is_trap: false },
                  { text: '$x=9$', is_trap: true },
                ],
                hint: 'Une racine carrée donne deux solutions.',
                explanation: 'Les racines de $x^2=9$ sont $+3$ et $-3$.',
              },
              {
                text: 'Sélectionnez la propriété exacte de $e^x$.',
                options: [
                  { text: '$e^x > 0$ pour tout $x$', is_trap: false },
                  { text: '$e^x$ peut être négatif', is_trap: true },
                ],
                hint: 'Pense au graphe de l’exponentielle.',
                explanation: '$e^x$ est strictement positif sur $\\mathbb{R}$.',
              },
            ],
            deminage: [
              {
                text: 'Corrige la dérivée : repère et remplace le bloc erroné.',
                prefilledBlocks: ["f'(x)", '=', '3x^2', '+', '5'],
                correctBlocks: ["f'(x)", '=', '3x^2', '+', '0'],
                suggestionPool: ["f'(x)", '=', '3x^2', '+', '0', '5', '-', '3'],
                hints: [
                  { text: 'La dérivée d’une constante vaut zéro.', importance: 'majeur', nature: 'formule', level: 2 },
                ],
                explanation: 'La dérivée de $f(x)=x^3+5$ est $3x^2+0=3x^2$ : le bloc $5$ doit être remplacé par $0$.',
              },
              {
                text: 'Corrige l’équation : repère et remplace le bloc erroné.',
                prefilledBlocks: ['2x', '+', '6', '=', '11'],
                correctBlocks: ['2x', '+', '3', '=', '11'],
                suggestionPool: ['2x', '+', '6', '3', '=', '11', '-'],
                hint: 'Relis l’énoncé initial $2x+3=11$.',
                explanation: 'On retrouve l’équation de départ en remettant $3$ au lieu de $6$.',
              },
            ],
          },
        },
      ],
      sections: [],
      sujetTypes: [],
      exercises: [
        {
          title: 'Exercice démo — Fonction exponentielle',
          mode: 'standard',
          enonce: 'On considère la fonction définie sur $\\mathbb{R}$ par $f(x) = (x-1)e^x + 1$.\n\nLe démo exercice contient exactement deux questions.\n\n**Question 1** : Déterminer une expression simplifiée de $f\'(x)$.\n**Question 2** : Résoudre $f\'(x)=0$, puis en déduire le signe de $f\'(x)$ et la valeur remarquable $f(0)$.',
          brouillon: { required: true },
          traitement: {
            timeLimitSeconds: 7200,
            initialScore: 36,
            scoring: {
              verificationPenalty: 2,
              hintPenalty: 1,
              wrongPenalty: 5,
            },
            questions: [
              {
                type: 'block-input',
                question: 'Déterminer une expression simplifiée de $f\'(x)$.',
                brouillon: {
                  steps: [
                    'Appliquer la formule du produit',
                    'Factoriser par $e^x$',
                    'Simplifier l\'expression obtenue',
                  ],
                },
                lines: [
                  {
                    lineLabel: 'Ligne 1',
                    stepIndex: 0,
                    question: 'Écrire la dérivée en appliquant la formule du produit.',
                    correctBlocks: ["f'(x)", '=', '1 \\cdot', 'e^x', '+', '(x-1)', '\\cdot', 'e^x'],
                    suggestionPool: ["f'(x)", 'f(x)', '=', '+', '1 \\cdot', 'x \\cdot', 'e^x', 'e^{-x}', '(x-1)', '(x+1)', '\\cdot'],
                    dynamicBank: [
                      { size: 3, options: ["f'(x)", 'f(x)', 'F(x)'] },
                      { size: 3, options: ['=', '+', '-'] },
                      { size: 3, options: ['1 \\cdot', 'x \\cdot', '0 \\cdot'] },
                      { size: 3, options: ['e^x', 'e^{-x}', '1'] },
                      { size: 3, options: ['+', '-', '\\times'] },
                      { size: 3, options: ['(x-1)', '(x+1)', 'x'] },
                      { size: 3, options: ['\\cdot', '/', '+'] },
                      { size: 3, options: ['e^x', '1', 'xe^x'] },
                    ],
                    hint: 'Utilisez la formule $(uv)\' = u\'v + uv\'.$',
                    explanation: '$f\'(x) = 1 \\cdot e^x + (x-1) \\cdot e^x$',
                  },
                  {
                    lineLabel: 'Ligne 2',
                    stepIndex: 1,
                    question: 'Factoriser l\'expression par $e^x$.',
                    correctBlocks: ["f'(x)", '=', '[1+(x-1)]', '\\cdot', 'e^x'],
                    suggestionPool: ["f'(x)", '=', '[1+(x-1)]', '[1-(x-1)]', '(1+x-1)', '\\cdot', '+', 'e^x', 'x', '0'],
                    dynamicBank: [
                      { size: 3, options: ["f'(x)", 'f(x)', 'F(x)'] },
                      { size: 3, options: ['=', '+', '-'] },
                      { size: 3, options: ['[1+(x-1)]', '[1-(x-1)]', '(1+x-1)'] },
                      { size: 3, options: ['\\cdot', '+', '/'] },
                      { size: 3, options: ['e^x', 'x', '0'] },
                    ],
                    hint: 'Les deux termes contiennent $e^x$ : mettez-le en facteur commun.',
                    explanation: '$f\'(x) = [1+(x-1)] \\cdot e^x$',
                  },
                  {
                    lineLabel: 'Ligne 3',
                    stepIndex: 2,
                    question: 'Simplifier la dérivée.',
                    correctBlocks: ["f'(x)", '=', 'x', '\\cdot', 'e^x'],
                    suggestionPool: ["f'(x)", '=', 'x', 'x-1', '1+x', '\\cdot', '+', 'e^x', 'e^{-x}'],
                    dynamicBank: [
                      { size: 3, options: ["f'(x)", 'f(x)', 'F(x)'] },
                      { size: 3, options: ['=', '+', '-'] },
                      { size: 3, options: ['x', 'x-1', '1+x'] },
                      { size: 3, options: ['\\cdot', '+', '/'] },
                      { size: 3, options: ['e^x', 'e^{-x}', '1'] },
                    ],
                    hint: 'Dans le crochet, $1+(x-1)=x$.',
                    explanation: '$f\'(x) = x \\cdot e^x$',
                  },
                ],
              },
              {
                type: 'block-input',
                question: 'Résoudre $f\'(x)=0$, puis en déduire le signe de $f\'(x)$ et la valeur remarquable $f(0)$.',
                brouillon: {
                  steps: [
                    'Écrire l\'équation $f\'(x)=0$',
                    'Utiliser la positivité de $e^x$',
                    'Conclure sur le signe de $f\'(x)$ puis sur $f(0)$',
                  ],
                },
                lines: [
                  {
                    lineLabel: 'Ligne 1',
                    stepIndex: 0,
                    question: 'Transformer $f\'(x)=0$ en produit nul.',
                    correctBlocks: ["f'(x)", '=', '0', '\\iff', 'x', '\\cdot', 'e^x', '=', '0'],
                    suggestionPool: ["f'(x)", '=', '0', '\\iff', 'x', '\\cdot', 'e^x', '+', '1', 'xe^x'],
                    dynamicBank: [
                      { size: 3, options: ["f'(x)", 'f(x)', 'x'] },
                      { size: 3, options: ['=', '+', '-'] },
                      { size: 3, options: ['0', '1', 'e^x'] },
                      { size: 3, options: ['\\iff', '\\Rightarrow', '='] },
                      { size: 3, options: ['x', 'x-1', '1'] },
                      { size: 3, options: ['\\cdot', '+', '/'] },
                      { size: 3, options: ['e^x', '1', 'xe^x'] },
                      { size: 3, options: ['=', '+', '\\neq'] },
                      { size: 3, options: ['0', '1', 'x'] },
                    ],
                    hint: 'Repartir de la forme simplifiée $f\'(x)=xe^x$.',
                    explanation: '$f\'(x) = 0 \\iff x \\cdot e^x = 0$',
                  },
                  {
                    lineLabel: 'Ligne 2',
                    stepIndex: 1,
                    question: 'Utiliser le fait que $e^x$ est strictement positif.',
                    correctBlocks: ['e^x', '>', '0', '\\Rightarrow', 'x', '=', '0'],
                    suggestionPool: ['e^x', '>', '0', '<', '\\Rightarrow', '\\iff', 'x', '=', '1', '0'],
                    dynamicBank: [
                      { size: 3, options: ['e^x', 'x', 'f(x)'] },
                      { size: 3, options: ['>', '<', '='] },
                      { size: 3, options: ['0', '1', 'x'] },
                      { size: 3, options: ['\\Rightarrow', '\\iff', '='] },
                      { size: 3, options: ['x', 'e^x', '0'] },
                      { size: 3, options: ['=', '\\neq', '>'] },
                      { size: 3, options: ['0', '1', 'e^x'] },
                    ],
                    hint: '$e^x$ ne s\'annule jamais sur $\\mathbb{R}$.',
                    explanation: '$e^x > 0 \\Rightarrow x = 0$',
                  },
                  {
                    lineLabel: 'Ligne 3',
                    stepIndex: 2,
                    question: 'Donner le signe de $f\'(x)$ selon le signe de $x$.',
                    correctBlocks: ['x<0', '\\Rightarrow', "f'(x)<0", ';', 'x>0', '\\Rightarrow', "f'(x)>0"],
                    suggestionPool: ['x<0', 'x>0', '\\Rightarrow', ';', "f'(x)<0", "f'(x)>0", "f'(x)=0", 'x=0'],
                    dynamicBank: [
                      { size: 3, options: ['x<0', 'x>0', 'x=0'] },
                      { size: 3, options: ['\\Rightarrow', '\\iff', '='] },
                      { size: 3, options: ["f'(x)<0", "f'(x)>0", "f'(x)=0"] },
                      { size: 3, options: [';', ':', '='] },
                      { size: 3, options: ['x>0', 'x<0', 'x=0'] },
                      { size: 3, options: ['\\Rightarrow', '\\iff', '='] },
                      { size: 3, options: ["f'(x)>0", "f'(x)<0", "f'(x)=0"] },
                    ],
                    hint: '$e^x$ étant positif, le signe de $f\'(x)$ est celui de $x$.',
                    explanation: 'Si $x<0$, alors $f\'(x)<0$ ; si $x>0$, alors $f\'(x)>0$.',
                  },
                  {
                    lineLabel: 'Ligne 4',
                    stepIndex: 2,
                    question: 'Calculer la valeur remarquable au point critique.',
                    correctBlocks: ['f(0)', '=', '(0-1)e^0+1', '=', '0'],
                    suggestionPool: ['f(0)', 'f(1)', '=', '(0-1)e^0+1', '(1-1)e^1+1', '0', '1', '-1'],
                    dynamicBank: [
                      { size: 3, options: ['f(0)', 'f(1)', "f'(0)"] },
                      { size: 3, options: ['=', '+', '-'] },
                      { size: 3, options: ['(0-1)e^0+1', '(1-1)e^1+1', '(0+1)e^0'] },
                      { size: 3, options: ['=', '+', '\\Rightarrow'] },
                      { size: 3, options: ['0', '1', '-1'] },
                    ],
                    hint: 'Remplacez $x$ par $0$ dans l\'expression de $f(x)$.',
                    explanation: '$f(0) = (0-1)e^0+1 = -1+1 = 0$',
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ],

  /* ── FRANÇAIS (id: 4) ── */
  4: [
    {
      number: 1,
      title: 'Démo Français — Quiz',
      quizzes: [
        {
          quiz_metadata: {
            chapter_num: 1,
            chapter_title: 'Démo Français — Quiz',
            quiz_title: 'Quiz démo — 5 modes',
          },
          modeQuestions: {
            suggestion: [
              {
                text: 'Complétez : « Les enfant__ jouent. » Quelle lettre manque ?',
                options: ['s', 't', 'x', 'e'],
                correct_answer: 's',
                hint: 'Le nom est au pluriel.',
                explanation: 'On écrit « les enfants » avec un $s$.',
              },
              {
                text: 'Complétez : « Il fini__ son devoir. » Quelle lettre manque ?',
                options: ['t', 's', 'e', 'x'],
                correct_answer: 't',
                hint: 'Pensez au verbe « finir » au présent.',
                explanation: 'On écrit « il finit » avec un $t$.',
              },
              {
                text: 'Complétez : « Bonjour__ » Quel signe convient ?',
                options: ['!', '?', ',', ';'],
                correct_answer: '!',
                hint: 'La phrase exprime une salutation vive.',
                explanation: 'Le signe attendu ici est le point d\'exclamation.',
              },
            ],
            input: [
              {
                text: 'Complétez : « Les enfant__ jouent. » Écrivez la lettre manquante.',
                correct_answer: 's',
                acceptedAnswers: ['s', 'S'],
                blockOptions: ['s', 't', 'x', 'e'],
                maxLength: 1,
                hint: 'Le nom est au pluriel.',
                explanation: 'On écrit « les enfants » avec un $s$.',
              },
              {
                text: 'Complétez : « Il fini__ son devoir. » Écrivez la lettre manquante.',
                correct_answer: 't',
                acceptedAnswers: ['t', 'T'],
                blockOptions: ['t', 's', 'e', 'x'],
                maxLength: 1,
                hint: 'C\'est le présent du verbe « finir ».',
                explanation: 'On écrit « il finit » avec un $t$.',
              },
              {
                text: 'Complétez : « Bonjour__ » Écrivez le signe attendu.',
                correct_answer: '!',
                acceptedAnswers: ['!'],
                blockOptions: ['!', '?', '.', ','],
                maxLength: 1,
                hint: 'Il s\'agit d\'une ponctuation expressive.',
                explanation: 'Le signe attendu est « ! ».',
              },
            ],
            trap: [
              {
                text: 'Repérez les suggestions piégées.',
                options: [
                  { text: '« Les enfant__ jouent » → s', is_trap: false },
                  { text: '« Il fini__ son devoir » → s', is_trap: true },
                  { text: '« Bonjour__ » → !', is_trap: false },
                ],
                hints: [
                  { text: 'Une seule terminaison est fausse.', importance: 'mineur', nature: 'concret', level: 1 },
                  { text: 'Pense au présent du verbe « finir » : il prend un « t ».', importance: 'majeur', nature: 'theorique', level: 2 },
                ],
                explanation: 'Le piège est « il fini__ » → $s$ ; le mode ajoute aussi une option vide.',
              },
              {
                text: 'Repérez les suggestions piégées sur les accords.',
                options: [
                  { text: '« des livre__ » → s', is_trap: false },
                  { text: '« un ami__ » → s', is_trap: true },
                  { text: '« les fille__ » → s', is_trap: false },
                ],
                hint: 'Regardez le nombre grammatical.',
                explanation: 'Le piège est « un ami__ » → $s$ ; le mode ajoute aussi une option vide.',
              },
              {
                text: 'Repérez les suggestions piégées sur la ponctuation.',
                options: [
                  { text: '« Salut__ » → !', is_trap: false },
                  { text: '« Qui est là__ » → !', is_trap: true },
                  { text: '« Bonjour__ » → !', is_trap: false },
                ],
                hint: 'Une question appelle un autre signe.',
                explanation: 'Le piège est « Qui est là__ » → $!$ ; le mode ajoute aussi une option vide.',
              },
            ],
            duel_intrus: [
              {
                text: 'Choisis la phrase correctement accordée.',
                options: [
                  { text: 'Les enfants jouent.', is_trap: false },
                  { text: 'Les enfant jouent.', is_trap: true },
                ],
                hints: [
                  { text: 'Le sujet est pluriel.', importance: 'mineur', nature: 'concret', level: 1 },
                ],
                explanation: 'On écrit « les enfants » avec un « s ».',
              },
              {
                text: 'Choisis la conjugaison correcte.',
                options: [
                  { text: 'Il finit son devoir.', is_trap: false },
                  { text: 'Il finis son devoir.', is_trap: true },
                ],
                hint: 'À la 3ᵉ personne du singulier, le présent du 2ᵉ groupe prend « t ».',
                explanation: '« Il finit » : sujet 3ᵉ personne → « t ».',
              },
              {
                text: 'Choisis la ponctuation adaptée.',
                options: [
                  { text: 'Tu viens ?', is_trap: false },
                  { text: 'Tu viens !', is_trap: true },
                ],
                hint: 'La phrase est interrogative.',
                explanation: 'Une question se termine par « ? ».',
              },
            ],
            deminage: [
              {
                text: 'Corrige la phrase : repère et remplace le bloc erroné.',
                prefilledBlocks: ['Les', 'enfant', 'jouent', 'dans', 'le', 'parc'],
                correctBlocks: ['Les', 'enfants', 'jouent', 'dans', 'le', 'parc'],
                suggestionPool: ['Les', 'enfant', 'enfants', 'jouent', 'dans', 'le', 'parc'],
                hints: [
                  { text: 'Le sujet est au pluriel.', importance: 'mineur', nature: 'concret', level: 1 },
                  { text: 'Ajoute le « s » du pluriel à « enfant ».', importance: 'majeur', nature: 'exemple', level: 2 },
                ],
                explanation: '« enfant » → « enfants » pour accorder avec « Les ».',
              },
              {
                text: 'Corrige la phrase : repère et remplace le bloc erroné.',
                prefilledBlocks: ['Il', 'finis', 'son', 'devoir'],
                correctBlocks: ['Il', 'finit', 'son', 'devoir'],
                suggestionPool: ['Il', 'finis', 'finit', 'son', 'devoir'],
                hint: '3ᵉ personne du singulier du verbe « finir ».',
                explanation: '« Il finit » avec « t » à la 3ᵉ personne.',
              },
            ],
          },
        },
      ],
      sections: [],
      sujetTypes: [],
      exercises: [],
    },
  ],

  /* ── HISTOIRE-GÉO (id: 6) ── */
  6: [
    {
      number: 1,
      title: 'Démo Histoire-Géo — Terminale',
      quizzes: [
        {
          quiz_metadata: {
            chapter_num: 1,
            chapter_title: 'Démo Histoire-Géo — Terminale',
            quiz_title: 'Quiz démo — 5 modes',
          },
          modeQuestions: {
            suggestion: [
              {
                text: 'En quelle année débute la Seconde Guerre mondiale ?',
                options: ['1914', '1929', '1939', '1945'],
                correct_answer: '1939',
                hints: [
                  { text: 'C’est la fin des années 1930.', importance: 'mineur', nature: 'concret', level: 1 },
                  { text: 'Invasion de la Pologne par l’Allemagne nazie.', importance: 'majeur', nature: 'exemple', level: 2 },
                ],
                explanation: 'La guerre débute le 1er septembre 1939 avec l’invasion de la Pologne.',
              },
              {
                text: 'Qui a prononcé l’appel du 18 juin 1940 ?',
                options: ['Pétain', 'De Gaulle', 'Churchill', 'Roosevelt'],
                correct_answer: 'De Gaulle',
                hint: 'Depuis Londres, sur les ondes de la BBC.',
                explanation: 'Le général de Gaulle appelle à la résistance depuis Londres.',
              },
              {
                text: 'Quel événement marque la fin de la guerre froide ?',
                options: ['Traité de Versailles', 'Chute du mur de Berlin', 'Conférence de Yalta', 'Crise de Cuba'],
                correct_answer: 'Chute du mur de Berlin',
                hint: '9 novembre 1989.',
                explanation: 'La chute du mur de Berlin (1989) symbolise la fin de la guerre froide.',
              },
            ],
            input: [
              {
                text: 'Complétez : l’appel du 18 juin a été lancé en __.',
                correct_answer: '1940',
                acceptedAnswers: ['1940'],
                blockOptions: ['1940', '1939', '1944', '1945'],
                maxLength: 4,
                hint: 'Année de la défaite française.',
                explanation: 'Appel lancé le 18 juin 1940.',
              },
              {
                text: 'Complétez : la crise de Cuba a eu lieu en __.',
                correct_answer: '1962',
                acceptedAnswers: ['1962'],
                blockOptions: ['1962', '1947', '1958', '1989'],
                maxLength: 4,
                hint: 'Début des années 1960.',
                explanation: 'La crise des missiles de Cuba s’est produite en 1962.',
              },
              {
                text: 'Complétez : le mur de Berlin est tombé en __.',
                correct_answer: '1989',
                acceptedAnswers: ['1989'],
                blockOptions: ['1989', '1979', '1991', '1968'],
                maxLength: 4,
                hint: 'Fin des années 1980.',
                explanation: 'Le mur tombe le 9 novembre 1989.',
              },
            ],
            trap: [
              {
                text: 'Repérez les affirmations piégées sur la Seconde Guerre mondiale.',
                options: [
                  { text: 'La guerre commence en 1939.', is_trap: false },
                  { text: 'De Gaulle appelle à la résistance en 1945.', is_trap: true },
                  { text: 'La conférence de Yalta a lieu en 1945.', is_trap: false },
                ],
                hint: 'Vérifiez les dates de l’appel du 18 juin.',
                explanation: 'L’appel du 18 juin date de 1940, pas 1945.',
              },
              {
                text: 'Repérez les affirmations piégées sur la guerre froide.',
                options: [
                  { text: 'La doctrine Truman date de 1947.', is_trap: false },
                  { text: 'La chute du mur de Berlin a eu lieu en 1979.', is_trap: true },
                  { text: 'La crise de Cuba date de 1962.', is_trap: false },
                ],
                hint: 'Le mur est tombé à la fin des années 1980.',
                explanation: 'Le mur tombe en 1989, pas 1979.',
              },
            ],
            duel_intrus: [
              {
                text: 'Choisis la date correcte de l’armistice de 1918.',
                options: [
                  { text: '11 novembre 1918', is_trap: false },
                  { text: '8 mai 1918', is_trap: true },
                ],
                hint: '« Le 11 » est un jour férié français.',
                explanation: 'L’armistice est signé le 11 novembre 1918.',
              },
              {
                text: 'Choisis le dirigeant soviétique à l’origine de la Perestroïka.',
                options: [
                  { text: 'Gorbatchev', is_trap: false },
                  { text: 'Brejnev', is_trap: true },
                ],
                hint: 'Dernier dirigeant de l’URSS.',
                explanation: 'Mikhaïl Gorbatchev lance la Perestroïka en 1985.',
              },
            ],
            deminage: [
              {
                text: 'Corrige la chronologie : repère et remplace le bloc erroné.',
                prefilledBlocks: ['1939', '—', 'Début', 'de', 'la', 'Première', 'Guerre', 'mondiale'],
                correctBlocks: ['1939', '—', 'Début', 'de', 'la', 'Seconde', 'Guerre', 'mondiale'],
                suggestionPool: ['1939', '—', 'Début', 'de', 'la', 'Première', 'Seconde', 'Guerre', 'mondiale'],
                hints: [
                  { text: 'La Première Guerre mondiale débute en 1914.', importance: 'majeur', nature: 'theorique', level: 2 },
                ],
                explanation: '1939 marque le début de la Seconde Guerre mondiale.',
              },
            ],
          },
        },
      ],
      sections: [],
      sujetTypes: [],
      exercises: [
        {
          title: 'Exercice démo — Analyse d’un document historique',
          mode: 'standard',
          enonce: 'À partir de l’extrait suivant, tiré d’un discours de Charles de Gaulle prononcé le 18 juin 1940 à la BBC :\n\n« La flamme de la résistance française ne doit pas s’éteindre et ne s’éteindra pas. »\n\n**Question 1** : Identifiez le contexte historique dans lequel ce discours est prononcé.\n**Question 2** : Expliquez en quoi ce texte fonde un appel à la résistance.',
          brouillon: { required: true },
          traitement: {
            timeLimitSeconds: 5400,
            enonceDelaySeconds: 240,
            brouillonDelaySeconds: 360,
            treatmentDelaySeconds: 2400,
            initialScore: 20,
            scoring: {
              verificationPenalty: 1,
              hintPenalty: 2,
              wrongPenalty: 3,
            },
            questions: [
              {
                type: 'redaction',
                question: 'Identifiez le contexte historique dans lequel ce discours est prononcé.',
                timing: { questionDelaySeconds: 900, stepDelaySeconds: 300 },
                brouillon: {
                  steps: [
                    'Situer la date (juin 1940)',
                    'Rappeler l’armistice de Pétain',
                    'Situer de Gaulle depuis Londres',
                  ],
                },
                expectedAnswer: 'Le discours est prononcé depuis Londres, au lendemain de la demande d’armistice du maréchal Pétain (17 juin 1940). La France est alors partiellement occupée.',
                hints: [
                  { text: 'Juin 1940 : débâcle et demande d’armistice.', importance: 'mineur', nature: 'concret', level: 1 },
                  { text: 'De Gaulle s’exprime depuis la BBC à Londres.', importance: 'majeur', nature: 'exemple', level: 2 },
                  { text: 'L’appel est une réponse directe à Pétain.', importance: 'critique', nature: 'theorique', level: 3 },
                ],
                explanation: 'Contexte : défaite militaire, armistice demandé par Pétain le 17 juin, appel lancé depuis Londres le 18 juin.',
              },
              {
                type: 'redaction',
                question: 'Expliquez en quoi ce texte fonde un appel à la résistance.',
                timing: { questionDelaySeconds: 1200, stepDelaySeconds: 300 },
                brouillon: {
                  steps: [
                    'Repérer la métaphore de la flamme',
                    'Analyser le registre (mobilisateur, ferme)',
                    'Conclure sur la portée politique',
                  ],
                },
                expectedAnswer: 'La métaphore de la flamme qui « ne s’éteindra pas » transforme la défaite militaire en résistance morale. De Gaulle refuse la capitulation et invite les Français à poursuivre le combat depuis l’étranger.',
                hints: [
                  { text: 'Relève la métaphore centrale.', importance: 'mineur', nature: 'concret', level: 1 },
                  { text: 'Registre mobilisateur et déterminé.', importance: 'majeur', nature: 'theorique', level: 2 },
                ],
                explanation: 'La flamme = résistance morale ; le texte refuse la défaite et appelle à poursuivre le combat.',
              },
            ],
          },
        },
      ],
      sections: [
        {
          title: 'Leçon — La Seconde Guerre mondiale (Parcours Mention Bien)',
          parcours: 'mention_bien',
          summary: 'Résumé structuré de 1939 à 1945, points-clés à retenir pour viser la mention Bien.',
          content: [
            '**1. Chronologie essentielle**',
            '- 1er septembre 1939 : invasion de la Pologne.',
            '- 18 juin 1940 : appel du général de Gaulle.',
            '- 1941 : entrée en guerre des États-Unis (Pearl Harbor, décembre).',
            '- 1944 : débarquement en Normandie (6 juin).',
            '- 1945 : capitulations allemande (8 mai) et japonaise (2 septembre).',
            '',
            '**2. Acteurs majeurs**',
            '- Puissances de l’Axe : Allemagne nazie, Italie fasciste, Japon impérial.',
            '- Alliés : France libre, Royaume-Uni, URSS, États-Unis.',
            '',
            '**3. Notions-clés**',
            '- Guerre totale, génocide, collaboration / résistance, conférences de Yalta et Potsdam.',
          ],
          checkpoints: [
            { label: 'Je sais dater les 4 événements majeurs', mandatory: true },
            { label: 'Je sais nommer 2 acteurs par camp', mandatory: true },
            { label: 'Je sais expliquer la notion de guerre totale', mandatory: false },
          ],
        },
        {
          title: 'Leçon — La Seconde Guerre mondiale (Parcours Mention Très Bien)',
          parcours: 'mention_tres_bien',
          summary: 'Approfondissement pour viser la mention Très Bien : analyses, documents, problématiques historiographiques.',
          content: [
            '**1. Problématiques de fond**',
            '- En quoi la Seconde Guerre mondiale constitue-t-elle une guerre d’anéantissement ?',
            '- Quels sont les traits distinctifs du génocide des Juifs d’Europe ?',
            '- Comment la guerre bouleverse-t-elle l’ordre mondial après 1945 ?',
            '',
            '**2. Analyses documentaires attendues**',
            '- Étude d’extraits de discours (Churchill, de Gaulle, Roosevelt).',
            '- Analyse de cartes : occupation européenne, théâtres du Pacifique.',
            '- Interprétation des images de la Shoah (prudence éthique et méthodologique).',
            '',
            '**3. Repères historiographiques**',
            '- Débat sur la notion de collaboration (Paxton).',
            '- Mémoires de la guerre : construction, conflits, politiques publiques.',
            '- Bilans : refondations politiques (ONU 1945, procès de Nuremberg 1945-46).',
            '',
            '**4. Méthode de dissertation (mention TB)**',
            '- Problématique claire en introduction.',
            '- Plan thématique ou analytique (pas seulement chronologique).',
            '- Documents mobilisés en exemples précis, datés et contextualisés.',
          ],
          checkpoints: [
            { label: 'Je formule une problématique pertinente', mandatory: true },
            { label: 'Je cite 3 documents précis', mandatory: true },
            { label: 'Je mobilise 2 références historiographiques', mandatory: true },
            { label: 'Je propose un plan argumenté (non chronologique)', mandatory: true },
          ],
        },
      ],
      sujetTypes: [],
    },
  ],

  /* ── PHYSIQUE-CHIMIE (id: 2) ── */
  2: [],
};

function normalizeDemoTitle(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BUILT_IN_DEMO_SIGNATURES = {
  1: [
    ['nombres complexes', 'derivation continuite', 'suites numeriques'],
    ['demo math exercices quiz'],
  ],
  2: [
    ['mecanique lois de newton'],
  ],
  4: [
    ['argumentation dissertation'],
    ['demo francais quiz'],
  ],
  6: [
    ['la seconde guerre mondiale'],
    ['demo histoire geo terminale'],
  ],
};

function shouldApplyBuiltInDemo(subject, replaceLegacyDemo) {
  const chapters = Array.isArray(subject?.chapters) ? subject.chapters : [];
  if (!chapters.length) return true;
  if (!replaceLegacyDemo) return false;

  const titles = chapters.map(chapter => normalizeDemoTitle(chapter?.title));
  const signatures = BUILT_IN_DEMO_SIGNATURES[Number(subject?.id)] || [];
  return signatures.some(signature => (
    signature.length === titles.length
    && signature.every((title, index) => title === titles[index])
  ));
}

/**
 * Version du jeu de démos embarqué. Augmentez ce nombre à chaque évolution
 * (nouveau mode, nouveau chapitre, nouveau contenu intégré) pour forcer
 * le rechargement des démos chez les utilisateurs ayant un contenu persisté.
 */
export const DEMO_BUNDLE_VERSION = 4;

export function loadDemoData(subjects, options = {}) {
  const { replaceLegacyDemo = false } = options;

  return subjects.map(subject => {
    const demoChapters = DEMO_CHAPTERS[subject.id];
    if (!Array.isArray(demoChapters)) return subject;
    if (!shouldApplyBuiltInDemo(subject, replaceLegacyDemo)) return subject;
    return { ...subject, chapters: demoChapters };
  });
}

export function stripBuiltInDemoData(subjects, options = {}) {
  const { replaceLegacyDemo = true } = options;

  return (Array.isArray(subjects) ? subjects : []).map((subject) => {
    const demoChapters = DEMO_CHAPTERS[subject?.id];
    if (!Array.isArray(demoChapters)) return subject;
    if (!Array.isArray(subject?.chapters) || !subject.chapters.length) return subject;
    if (!shouldApplyBuiltInDemo(subject, replaceLegacyDemo)) return subject;
    return {
      ...subject,
      chapters: [],
    };
  });
}

