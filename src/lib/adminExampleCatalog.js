const quizSuggestionFile = {
  label: 'JSON complet — Suggestion',
  filename: 'exemple_quiz_mode_suggestion_complet.json',
  payload: {
    kind: 'quiz_mode_suggestion',
    chapterNumber: 1,
    chapterTitle: 'Grammaire et syntaxe',
    title: 'Quiz modèle — Accord du participe passé',
    timing: {
      questionDelaySeconds: 45,
      timeLimitSeconds: 180,
    },
    scoring: {
      wrongPenalty: 8,
      hintPenalty: 2,
      subjectCoefficient: 2,
      scoreScale: 100,
    },
    questions: [
      {
        text: 'Choisissez la phrase correctement accordée.',
        options: [
          { text: 'Les lettres que j’ai écrites hier sont parties.', translations: { mg: 'Nalefako omaly ireo taratasy ireo.' } },
          { text: 'Les lettres que j’ai écrit hier sont parties.', translations: { mg: 'Diso fanoratana ny endrika eto.' } },
          { text: 'Les lettres que j’ai écrite hier sont parties.', translations: { mg: 'Tsy mifanaraka amin’ny COD ity.' } }
        ],
        correct_answer: 'Les lettres que j’ai écrites hier sont parties.',
        hint: 'Le COD “lettres” est placé avant le verbe.',
        explanation: 'Avec avoir, le participe passé s’accorde avec le COD placé avant.',
        translations: {
          text: { mg: 'Safidio ny fehezanteny voaorina tsara.' },
          options: [
            { mg: 'Nalefako omaly ireo taratasy ireo.' },
            { mg: 'Tsy marina io fanovàna io.' },
            { mg: 'Tsy mifanaraka ny fanononana eto.' }
          ]
        }
      },
      {
        text: 'Repérez la proposition correcte.',
        options: [
          { text: 'Les chansons qu’elle a chantées.', translations: { mg: 'Ireo hira nohirainy.' } },
          { text: 'Les chansons qu’elle a chanté.', translations: { mg: 'Diso ny accord eto.' } }
        ],
        correct_answer: 'Les chansons qu’elle a chantées.',
        hint: 'Le COD “chansons” est avant.',
        explanation: 'Le participe passé prend la marque du pluriel féminin.',
        translations: {
          text: { mg: 'Tadiavo ny soso-kevitra marina.' },
          options: [
            { mg: 'Ireo hira nohirainy.' },
            { mg: 'Tsy voalanjalanja ny endrika eto.' }
          ]
        }
      }
    ]
  }
};

const quizInputFile = {
  label: 'JSON complet — Input',
  filename: 'exemple_quiz_mode_input_complet.json',
  payload: {
    kind: 'quiz_mode_input',
    chapterNumber: 2,
    chapterTitle: 'Calcul algébrique',
    title: 'Quiz modèle — Simplification rapide',
    timing: {
      questionDelaySeconds: 35,
      timeLimitSeconds: 120,
    },
    scoring: {
      wrongPenalty: 8,
      hintPenalty: 2,
      subjectCoefficient: 3,
      scoreScale: 100,
    },
    questions: [
      {
        text: 'Complétez : 2x + 3x = ...',
        correct_answer: '5x',
        acceptedAnswers: ['5x'],
        blockOptions: ['5x', '6x', 'x5', '2x3'],
        optionCount: 4,
        helperText: 'Additionne les coefficients des termes semblables.',
        hint: '2 + 3 = 5.',
        explanation: 'On additionne uniquement les coefficients de x.',
        translations: {
          text: { mg: 'Fenoy: 2x + 3x = ...' }
        }
      },
      {
        text: 'Complétez : 7a - 2a = ...',
        correct_answer: '5a',
        acceptedAnswers: ['5a'],
        blockOptions: ['5a', '9a', '7a', '2a'],
        optionCount: 4,
        helperText: 'Soustrais les coefficients.',
        hint: '7 - 2 = 5.',
        explanation: 'Les termes semblables se combinent directement.',
        translations: {
          text: { mg: 'Fenoy: 7a - 2a = ...' }
        }
      }
    ]
  }
};

const quizTrapFile = {
  label: 'JSON complet — Pièges',
  filename: 'exemple_quiz_mode_pieges_complet.json',
  payload: {
    kind: 'quiz_mode_trap',
    chapterNumber: 3,
    chapterTitle: 'Fonctions numériques',
    title: 'Quiz modèle — Repérage d’erreurs',
    timing: {
      questionDelaySeconds: 50,
      timeLimitSeconds: 180,
    },
    scoring: {
      wrongPenalty: 10,
      hintPenalty: 3,
      subjectCoefficient: 2,
      scoreScale: 100,
    },
    questions: [
      {
        text: 'Repérez les propositions fausses sur la dérivation de x² + x.',
        options: [
          { text: 'La dérivée de x² est 2x.', is_trap: false, translations: { mg: '2x no dérivée an’ny x².' } },
          { text: 'La dérivée de x est 0.', is_trap: true, translations: { mg: 'Diso io satria 1 ny dérivée an’ny x.' } },
          { text: 'La dérivée de x² + x est 2x + 1.', is_trap: false, translations: { mg: '2x + 1 no valiny marina.' } },
          { text: 'La dérivée de x² + x est 2x - 1.', is_trap: true, translations: { mg: 'Diso ny famantarana eto.' } }
        ],
        hint: 'Vérifie séparément la dérivée de x et celle de x².',
        explanation: 'x a pour dérivée 1, donc 2x - 1 est faux.',
        translations: {
          text: { mg: 'Tadiavo ireo soso-kevitra diso momba ny dérivation an’ny x² + x.' },
          options: [
            { mg: '2x no dérivée an’ny x².' },
            { mg: 'Diso io satria 1 ny dérivée an’ny x.' },
            { mg: '2x + 1 no valiny marina.' },
            { mg: 'Diso ny famantarana eto.' }
          ]
        }
      }
    ]
  }
};

const quizDuelIntrusFile = {
  label: 'JSON complet — Duel de l’Intrus',
  filename: 'exemple_quiz_mode_duel_intrus_complet.json',
  payload: {
    kind: 'quiz_mode_duel_intrus',
    chapterNumber: 4,
    chapterTitle: 'Suites numériques',
    title: 'Quiz modèle — Intrus algébrique',
    timing: {
      questionDelaySeconds: 30,
      timeLimitSeconds: 120,
    },
    scoring: {
      wrongPenalty: 12,
      hintPenalty: 4,
      averageWeight: 2,
      fireMultiplier: 5,
      subjectCoefficient: 2,
      scoreScale: 100,
    },
    questions: [
      {
        text: 'Choisissez le bloc correct pour la raison d’une suite arithmétique.',
        subtitle: 'Les deux blocs se ressemblent fortement.',
        options: [
          { text: 'u_{n+1}=u_n+r', is_trap: false, translations: { mg: 'Ity no soratra marina.' } },
          { text: 'u_{n+1}=u_n×r', is_trap: true, translations: { mg: 'Io no intrus eto.' } }
        ],
        preferMath: true,
        hint: 'Une suite arithmétique se construit par addition.',
        explanation: 'La multiplication correspond à une suite géométrique.',
        translations: {
          text: { mg: 'Safidio ny bloc marina momba ny suite arithmétique.' },
          subtitle: { mg: 'Mitovitovy be ireo soratra roa ireo.' },
          options: [
            { mg: 'Ity no soratra marina.' },
            { mg: 'Io no intrus eto.' }
          ]
        }
      }
    ]
  }
};

const quizDeminageFile = {
  label: 'JSON complet — Déminage',
  filename: 'exemple_quiz_mode_deminage_complet.json',
  payload: {
    kind: 'quiz_mode_deminage',
    chapterNumber: 4,
    chapterTitle: 'Suites numériques',
    title: 'Quiz modèle — Réparation de chaîne',
    timing: {
      questionDelaySeconds: 45,
      timeLimitSeconds: 150,
    },
    scoring: {
      wrongPenalty: 14,
      hintPenalty: 4,
      averageWeight: 2,
      fireMultiplier: 5,
      subjectCoefficient: 2,
      scoreScale: 100,
    },
    questions: [
      {
        text: 'Corrigez l’expression proposée pour une suite arithmétique.',
        subtitle: 'Repérez le bloc fautif puis remplacez-le.',
        prefilledBlocks: ['u_{n+1}', '=', 'u_n', '×', 'r'],
        correctBlocks: ['u_{n+1}', '=', 'u_n', '+', 'r'],
        suggestionPool: ['+', '×', 'r', 'u_n'],
        preferMath: true,
        hint: 'On ajoute une raison constante.',
        explanation: 'Le signe × doit être remplacé par +.',
        translations: {
          text: { mg: 'Ahitsio ilay soratra nomena ho an’ny suite arithmétique.' },
          subtitle: { mg: 'Tadiavo aloha ny bloc diso dia soloina.' }
        }
      }
    ]
  }
};

const exerciseEnonceFile = {
  label: 'Fichier 1 — Énoncé',
  filename: 'exemple_exercice_complet_enonce.json',
  payload: {
    kind: 'exercice_enonce',
    chapterNumber: 5,
    chapterTitle: 'Fractions rationnelles',
    title: 'Exercice modèle — Simplification et somme',
    enonce: 'On considère deux expressions rationnelles.\n\n1) Simplifier la fraction algébrique proposée.\n2) Mettre deux fractions au même dénominateur puis conclure.\n\nRédigez proprement chaque réponse.',
    translations: {
      enonce: {
        mg: 'Dinihina ireo expression rationnelle roa.\n\n1) Ahena ny fraction algébrique nomena.\n2) Ataovy mitovy dénominateur aloha ireo fractions roa dia farano tsara.\n\nSoraty madio ny valiny tsirairay.'
      }
    }
  }
};

const exerciseBrouillonFile = {
  label: 'Fichier 2 — Brouillon',
  filename: 'exemple_exercice_complet_brouillon.json',
  payload: {
    kind: 'exercice_brouillon',
    chapterNumber: 5,
    chapterTitle: 'Fractions rationnelles',
    title: 'Exercice modèle — Simplification et somme',
    questions: [
      {
        question: 'Simplifier l’expression $\\frac{12x}{18}$.',
        steps: [
          'Identifier le facteur commun au numérateur et au dénominateur',
          'Diviser chaque terme par le PGCD',
          'Présenter la forme simplifiée finale'
        ],
        explanation: 'La méthode repose sur la réduction par le PGCD.',
        translations: {
          question: { mg: 'Ahena ny expression $\\frac{12x}{18}$.' },
          steps: [
            { mg: 'Fantaro ny facteur commun eo amin’ny numérateur sy dénominateur.' },
            { mg: 'Zarao amin’ny PGCD ny terme tsirairay.' },
            { mg: 'Soraty ny endrika tsotra farany.' }
          ]
        }
      },
      {
        question: 'Calculer $\\frac{3}{4}+\\frac{5}{8}$.',
        steps: [
          'Chercher le plus petit dénominateur commun',
          'Réécrire chaque fraction avec ce dénominateur',
          'Additionner les numérateurs et conclure'
        ],
        explanation: 'La somme passe d’abord par un dénominateur commun.',
        translations: {
          question: { mg: 'Kajio $\\frac{3}{4}+\\frac{5}{8}$.' },
          steps: [
            { mg: 'Tadiavo ny dénominateur commun kely indrindra.' },
            { mg: 'Soraty indray miaraka amin’io dénominateur io ny fractions roa.' },
            { mg: 'Ampio ny numérateur dia farano tsara.' }
          ]
        }
      }
    ]
  }
};

const exerciseTraitementFile = {
  label: 'Fichier 3 — Traitement',
  filename: 'exemple_exercice_complet_traitement.json',
  payload: {
    kind: 'exercice_traitement',
    chapterNumber: 5,
    chapterTitle: 'Fractions rationnelles',
    title: 'Exercice modèle — Simplification et somme',
    timeLimitSeconds: 5400,
    initialScore: 20,
    timing: {
      enonceDelaySeconds: 180,
      brouillonDelaySeconds: 360,
      treatmentDelaySeconds: 1200,
      questionDelaySeconds: 240,
      stepDelaySeconds: 120,
      refreshDelaySeconds: 90
    },
    scoring: {
      verificationPenalty: 2,
      hintPenalty: 1,
      wrongPenalty: 4,
      scoreScale: 100
    },
    questions: [
      {
        type: 'block-input',
        question: 'Simplifier l’expression $\\frac{12x}{18}$.',
        title: 'Question 1',
        subtitle: 'Réduction par le PGCD',
        timing: {
          questionDelaySeconds: 180,
          stepDelaySeconds: 90,
          refreshDelaySeconds: 60
        },
        hint: 'Le PGCD de 12 et 18 est 6.',
        explanation: 'On réduit numérateur et dénominateur par 6.',
        translations: {
          question: { mg: 'Ahena ny expression $\\frac{12x}{18}$.' },
          subtitle: { mg: 'Fampihenana amin’ny alalan’ny PGCD.' }
        },
        brouillon: {
          steps: [
            'Identifier le facteur commun',
            'Diviser par le PGCD',
            'Écrire la forme simplifiée'
          ],
          translations: {
            steps: [
              { mg: 'Fantaro ny facteur commun.' },
              { mg: 'Zarao amin’ny PGCD.' },
              { mg: 'Soraty ny endrika tsotra.' }
            ]
          }
        },
        lines: [
          {
            question: 'Réduire la fraction',
            lineLabel: 'Ligne 1',
            refreshDelaySeconds: 60,
            correctBlocks: ['\\frac{12x}{18}', '=', '\\frac{2x}{3}'],
            suggestionPool: ['\\frac{12x}{18}', '=', '\\frac{2x}{3}', '\\frac{3x}{2}', '\\frac{6x}{9}'],
            microSteps: [3],
            dynamicBank: [
              { size: 5, options: ['\\frac{12x}{18}', '=', '\\frac{2x}{3}', '\\frac{3x}{2}', '\\frac{6x}{9}'] }
            ],
            hint: 'Divise 12 et 18 par 6.',
            explanation: 'La fraction irréductible est $\\frac{2x}{3}$.',
            translations: {
              question: { mg: 'Ahena ilay fraction.' }
            }
          }
        ]
      },
      {
        type: 'block-input',
        question: 'Calculer $\\frac{3}{4}+\\frac{5}{8}$.',
        title: 'Question 2',
        subtitle: 'Passage au dénominateur commun',
        timing: {
          questionDelaySeconds: 220,
          stepDelaySeconds: 100,
          refreshDelaySeconds: 70
        },
        hint: 'Transforme d’abord $\\frac{3}{4}$ en huitièmes.',
        explanation: '$\\frac{3}{4}=\\frac{6}{8}$ donc la somme vaut $\\frac{11}{8}$.',
        translations: {
          question: { mg: 'Kajio $\\frac{3}{4}+\\frac{5}{8}$.' },
          subtitle: { mg: 'Alefa amin’ny dénominateur commun aloha.' }
        },
        brouillon: {
          steps: [
            'Choisir le dénominateur commun',
            'Réécrire les fractions',
            'Additionner et conclure'
          ],
          translations: {
            steps: [
              { mg: 'Safidio ny dénominateur commun.' },
              { mg: 'Soraty indray ireo fractions.' },
              { mg: 'Ampio dia farano tsara.' }
            ]
          }
        },
        lines: [
          {
            question: 'Transformer $\\frac{3}{4}$ en huitièmes',
            lineLabel: 'Ligne 1',
            refreshDelaySeconds: 60,
            correctBlocks: ['\\frac{3}{4}', '=', '\\frac{6}{8}'],
            suggestionPool: ['\\frac{3}{4}', '=', '\\frac{6}{8}', '\\frac{3}{8}', '\\frac{5}{8}'],
            microSteps: [3],
            dynamicBank: [
              { size: 5, options: ['\\frac{3}{4}', '=', '\\frac{6}{8}', '\\frac{3}{8}', '\\frac{5}{8}'] }
            ],
            hint: 'Multiplie numérateur et dénominateur par 2.',
            explanation: 'On obtient $\\frac{6}{8}$.',
            translations: {
              question: { mg: 'Avadiho ho ampahavalo ny $\\frac{3}{4}$.' }
            }
          },
          {
            question: 'Additionner puis conclure',
            lineLabel: 'Ligne 2',
            refreshDelaySeconds: 70,
            correctBlocks: ['\\frac{6}{8}', '+', '\\frac{5}{8}', '=', '\\frac{11}{8}'],
            suggestionPool: ['\\frac{6}{8}', '+', '\\frac{5}{8}', '=', '\\frac{11}{8}', '\\frac{10}{8}'],
            microSteps: [5],
            dynamicBank: [
              { size: 6, options: ['\\frac{6}{8}', '+', '\\frac{5}{8}', '=', '\\frac{11}{8}', '\\frac{10}{8}'] }
            ],
            hint: 'Les dénominateurs sont déjà identiques.',
            explanation: 'On additionne seulement les numérateurs.',
            translations: {
              question: { mg: 'Ampio dia farano ny valiny.' }
            }
          }
        ]
      }
    ]
  }
};

const sujetTypeEnonceFile = {
  label: 'Fichier 1 — Énoncé',
  filename: 'exemple_sujet_type_complet_enonce.json',
  payload: {
    kind: 'sujet_type_enonce',
    chapterNumber: 6,
    chapterTitle: 'Fonctions numériques',
    title: 'Sujet type modèle — Étude d’une fonction affine',
    enonce: 'On considère la fonction f définie par f(x)=2x-3.\n\n1) Calculer l’image de 4.\n2) Déterminer l’antécédent de 5.\n3) Interpréter le résultat dans une rédaction courte et correcte.',
    translations: {
      enonce: {
        mg: 'Diniho ny fonction f voafaritra amin’ny f(x)=2x-3.\n\n1) Kajio ny sary an’ny 4.\n2) Tadiavo ny antécédent an’ny 5.\n3) Adikao amin’ny fanoratra fohy sy marina ny vokatra.'
      }
    }
  }
};

const sujetTypeBrouillonFile = {
  label: 'Fichier 2 — Brouillon',
  filename: 'exemple_sujet_type_complet_brouillon.json',
  payload: {
    kind: 'sujet_type_brouillon',
    chapterNumber: 6,
    chapterTitle: 'Fonctions numériques',
    title: 'Sujet type modèle — Étude d’une fonction affine',
    questions: [
      {
        question: 'Calculer f(4) pour f(x)=2x-3.',
        steps: [
          'Remplacer x par 4 dans l’expression',
          'Effectuer la multiplication puis la soustraction',
          'Présenter proprement la conclusion'
        ],
        translations: {
          question: { mg: 'Kajio ny f(4) raha f(x)=2x-3.' },
          steps: [
            { mg: 'Soloy 4 ny x ao amin’ilay expression.' },
            { mg: 'Ataovy ny multiplication avy eo ny soustraction.' },
            { mg: 'Soraty madio ny famaranana.' }
          ]
        }
      },
      {
        question: 'Déterminer l’antécédent de 5.',
        steps: [
          'Écrire l’équation f(x)=5',
          'Résoudre l’équation obtenue',
          'Formuler la réponse dans une phrase correcte'
        ],
        translations: {
          question: { mg: 'Tadiavo ny antécédent an’ny 5.' },
          steps: [
            { mg: 'Soraty aloha ny équation f(x)=5.' },
            { mg: 'Vahao ilay équation.' },
            { mg: 'Ataovy fehezanteny marina ny valiny.' }
          ]
        }
      }
    ]
  }
};

const sujetTypeTraitementFile = {
  label: 'Fichier 3 — Traitement',
  filename: 'exemple_sujet_type_complet_traitement.json',
  payload: {
    kind: 'sujet_type_traitement',
    chapterNumber: 6,
    chapterTitle: 'Fonctions numériques',
    title: 'Sujet type modèle — Étude d’une fonction affine',
    timeLimitSeconds: 7200,
    initialScore: 20,
    timing: {
      enonceDelaySeconds: 240,
      brouillonDelaySeconds: 420,
      treatmentDelaySeconds: 1500,
      questionDelaySeconds: 300,
      stepDelaySeconds: 120,
      refreshDelaySeconds: 90
    },
    scoring: {
      verificationPenalty: 2,
      hintPenalty: 1,
      wrongPenalty: 5,
      scoreScale: 100
    },
    questions: [
      {
        type: 'block-input',
        question: 'Calculer f(4) pour f(x)=2x-3.',
        title: 'Question 1',
        subtitle: 'Image d’un nombre par une fonction affine',
        hint: 'Commence par remplacer x par 4.',
        explanation: 'f(4)=2×4-3=8-3=5.',
        translations: {
          question: { mg: 'Kajio ny f(4) raha f(x)=2x-3.' },
          subtitle: { mg: 'Sary an’ny isa iray amin’ny fonction affine.' }
        },
        brouillon: {
          steps: [
            'Substituer x par 4',
            'Calculer 2×4 puis retirer 3',
            'Conclure proprement'
          ],
          translations: {
            steps: [
              { mg: 'Soloina 4 ny x.' },
              { mg: 'Kajio ny 2×4 dia esory 3.' },
              { mg: 'Farano tsara ny valiny.' }
            ]
          }
        },
        lines: [
          {
            question: 'Effectuer le calcul',
            lineLabel: 'Ligne 1',
            refreshDelaySeconds: 60,
            correctBlocks: ['f(4)', '=', '2×4-3', '=', '5'],
            suggestionPool: ['f(4)', '=', '2×4-3', '5', '8', '3'],
            microSteps: [5],
            dynamicBank: [
              { size: 6, options: ['f(4)', '=', '2×4-3', '=', '5', '8'] }
            ],
            hint: '2×4 vaut 8.',
            explanation: 'On obtient bien 5 comme image de 4.',
            translations: {
              question: { mg: 'Ataovy ny kajy.' }
            }
          }
        ]
      },
      {
        type: 'block-input',
        question: 'Déterminer l’antécédent de 5.',
        title: 'Question 2',
        subtitle: 'Résolution d’une équation simple',
        hint: 'Résous 2x-3=5.',
        explanation: '2x=8 donc x=4.',
        translations: {
          question: { mg: 'Tadiavo ny antécédent an’ny 5.' },
          subtitle: { mg: 'Famahana équation tsotra.' }
        },
        brouillon: {
          steps: [
            'Écrire 2x-3=5',
            'Ajouter 3 aux deux membres',
            'Diviser par 2 puis conclure'
          ],
          translations: {
            steps: [
              { mg: 'Soraty 2x-3=5.' },
              { mg: 'Ampio 3 amin’ny lafiny roa.' },
              { mg: 'Zarao amin’ny 2 dia farano.' }
            ]
          }
        },
        lines: [
          {
            question: 'Isoler 2x',
            lineLabel: 'Ligne 1',
            refreshDelaySeconds: 70,
            correctBlocks: ['2x', '-', '3', '=', '5', 'donc', '2x', '=', '8'],
            suggestionPool: ['2x', '-', '3', '=', '5', 'donc', '8', '4'],
            microSteps: [8],
            dynamicBank: [
              { size: 8, options: ['2x', '-', '3', '=', '5', 'donc', '2x', '8'] }
            ],
            hint: 'Ajoute 3 des deux côtés.',
            explanation: 'L’équation intermédiaire est 2x=8.',
            translations: {
              question: { mg: 'Ataovy mitokana ny 2x.' }
            }
          },
          {
            question: 'Conclure sur x',
            lineLabel: 'Ligne 2',
            refreshDelaySeconds: 70,
            correctBlocks: ['x', '=', '4'],
            suggestionPool: ['x', '=', '4', '8', '2'],
            microSteps: [3],
            dynamicBank: [
              { size: 5, options: ['x', '=', '4', '8', '2'] }
            ],
            hint: 'Divise 8 par 2.',
            explanation: 'L’antécédent de 5 est 4.',
            translations: {
              question: { mg: 'Farano ny x.' }
            }
          }
        ]
      }
    ]
  }
};

export const ADMIN_DOWNLOADABLE_EXAMPLES = [
  {
    id: 'quiz-suggestion',
    title: 'Quiz complet — Mode Suggestion',
    description: 'Exemple complet et téléchargeable du mode QCM classique, avec timings, scoring et traductions.',
    files: [quizSuggestionFile]
  },
  {
    id: 'quiz-input',
    title: 'Quiz complet — Mode Input',
    description: 'Exemple complet du mode sélection de blocs courts.',
    files: [quizInputFile]
  },
  {
    id: 'quiz-trap',
    title: 'Quiz complet — Mode Pièges',
    description: 'Exemple complet avec propositions piégées et traductions.',
    files: [quizTrapFile]
  },
  {
    id: 'quiz-duel-intrus',
    title: 'Quiz complet — Duel de l’Intrus',
    description: 'Exemple avancé avec scoring renforcé, fire multiplier et averageWeight.',
    files: [quizDuelIntrusFile]
  },
  {
    id: 'quiz-deminage',
    title: 'Quiz complet — Déminage',
    description: 'Exemple avancé où l’élève corrige des blocs pré-remplis.',
    files: [quizDeminageFile]
  },
  {
    id: 'exercise-triptych',
    title: 'Exercice complet — 3 fichiers séparés',
    description: 'Un exemple complet d’exercice avec Énoncé, Brouillon et Traitement distincts.',
    files: [exerciseEnonceFile, exerciseBrouillonFile, exerciseTraitementFile]
  },
  {
    id: 'sujet-type-triptych',
    title: 'Sujet type complet — 3 fichiers séparés',
    description: 'Un sujet type complet avec Énoncé, Brouillon et Traitement séparés.',
    files: [sujetTypeEnonceFile, sujetTypeBrouillonFile, sujetTypeTraitementFile]
  }
];
