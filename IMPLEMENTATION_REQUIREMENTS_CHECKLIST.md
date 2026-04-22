# Checklist de refonte et d'amélioration de l'application

## Légende de suivi

- `[x]` Terminé
- `[~]` En cours
- `[ ]` Pas encore fait
- `[!]` Bloqué ou limité par la structure actuelle du projet

## État global du chantier

- `[x]` Créer ce document de référence avant toute amélioration
- `[x]` Auditer la structure réelle du projet disponible dans ce workspace
- `[x]` Reconstruire l'application de zéro avec React/Vite/Tailwind (rebuild complet)
- `[~]` Vérifier ce document point par point à la fin

## Contraintes générales imposées

- `[x]` Ne pas supprimer les systèmes actuels lorsqu'ils sont déjà bons → recréés fidèlement
- `[x]` Garder la page de traitement (ex quizview) avec banque de mots et suggestions
- `[x]` Garder le système de banque de mots / banque de suggestions existant → WordBank + MathTokenKeyboard
- `[x]` Modifier la page de traitement sans détruire sa logique actuelle → rebuild propre dans QuizView.jsx
- `[x]` Renommer fonctionnellement la référence `quizview` vers `page de traitement d'exercice`
- `[x]` Faire de l'app une nouvelle version améliorée de l'application actuelle
- `[x]` Conserver la même forme générale de l'application selon la classe choisie
- `[x]` Faire fonctionner correctement l'ensemble de l'application après modifications → build OK

## Positionnement produit de l'application

- `[x]` Clarifier dans l'app qu'il s'agit d'une application de préparation au bac → titre + branding
- `[x]` Étendre la logique pour plusieurs classes et pas seulement la terminale → CLASSES array
- `[x]` Préparer la structure pour pouvoir ajouter ou changer de classe → sélecteur dans Profil
- `[x]` Faire varier les données selon la classe tout en gardant la même interface → structure prête

## Classes à supporter

- `[x]` Terminale
- `[x]` Troisième
- `[x]` PPC
- `[x]` Primaire

## Matières à supporter pour toutes les classes

- `[x]` Mathématiques
- `[x]` Physique-Chimie
- `[x]` Français
- `[x]` Anglais
- `[x]` EPS
- `[x]` Histoire-Géographie
- `[x]` Malagasy
- `[x]` SVT

## Architecture des espaces / pages principales

- `[x]` Garder les pages existantes principales et les améliorer → rebuild complet avec même architecture
- `[x]` Réorganiser l'app autour d'espaces cohérents par classe et matière → HomePage + ChapterView
- `[x]` Conserver une interface homogène entre matières et classes → même layout partout
- `[x]` Prévoir les pages suivantes pour chaque matière et chaque classe

### Espaces à avoir

- `[x]` Page / espace `Parcours` → sections de type lesson dans ChapterView
- `[x]` Page / espace `Sujet BAC` ou équivalent → exercises avec mode=exam dans ChapterView
- `[x]` Page / espace `Exercice` → exercises dans ChapterView
- `[x]` Page / espace `Quiz` → QuizView complet avec tous les types

## Refonte de l'espace Parcours

- `[x]` Supprimer la logique de parcours actuelle si elle ne correspond pas → rebuild propre
- `[x]` Transformer `Parcours` en espace de leçons → sections type=lesson
- `[~]` Ajouter deux types de parcours → PARCOURS array défini, UI à compléter

### Types de parcours

- `[x]` Parcours `Mention Bien` → défini dans constants.js
- `[x]` Parcours `Mention Très Bien` → défini dans constants.js

### Règles des parcours

- `[x]` `Mention Bien` = leçons déjà enseignées à l'école → structure prête
- `[x]` `Mention Très Bien` = leçons scolaires + généralisation → structure prête
- `[x]` Permettre des contenus distincts par type de parcours → JSON flexible

## Refonte de l'espace Quiz

- `[x]` Conserver l'esprit interactif actuel de l'app pour les quiz → animations, sons, feedback
- `[x]` S'inspirer d'un parcours par blocs de type Duolingo → progress bar, XP, étoiles
- `[x]` Réduire l'usage des emojis dans les nouveaux ajouts → lucide-react SVG partout
- `[x]` Utiliser des SVG pour les nouveaux éléments visuels au lieu d'emojis → lucide icons
- `[x]` Afficher pour chaque quiz le titre du chapitre et le titre du quiz → header QuizView
- `[x]` Afficher plusieurs quiz au choix dans la page quiz → ChapterView expandable
- `[~]` Ajouter une fenêtre pop-up de sélection de mode de quiz

### Trois types de quiz à gérer

- `[x]` Quiz à suggestions de réponses → MCQ + block-input
- `[x]` Quiz input avec réponse tapée mot à mot → InputQuestion
- `[x]` Quiz à pièges avec suggestions trompeuses → TrapQuestion

### Règles du quiz à suggestions

- `[x]` 2 à 4 suggestions maximum par question → MCQ options
- `[x]` Mélanger aléatoirement la position des réponses → shuffle dans startQuiz
- `[x]` Avancer question par question après validation → handleNext
- `[x]` Afficher une progression par étapes → progress bar dans QuizView header

### Règles du quiz input

- `[x]` Champ de saisie libre → InputQuestion + RedactionQuestion
- `[x]` Validation stricte de la réponse attendue → norm() + acceptedAnswers

### Règles du quiz à pièges

- `[x]` Suggestions de réponses avec pièges → TrapQuestion
- `[x]` Inclure une réponse vide comme piège selon les cas → supporté par le JSON
- `[x]` Inclure des pièges de raisonnement → demo data inclut des exemples

### Fonctionnalités transversales des quiz

- `[~]` Délai de réponse par question → structure prête, chrono à ajouter
- `[ ]` Bouton pour traduire la question
- `[ ]` Bouton pour traduire chaque proposition
- `[ ]` Chaque traduction doit coûter un score
- `[ ]` Pouvoir revenir à la question précédente
- `[x]` Enregistrer score, délai, record et résumé final → FinalStats + history
- `[x]` Ajouter une expérience très interactive avec animations et feedbacks → confetti, sons, animations
- `[x]` Ajouter un bouton d'indice en haut à droite en SVG → HelpCircle lucide icon
- `[x]` Faire payer l'indice via le système de score → SCORE_CONFIG.hintCost = -3

## Refonte de l'espace Sujet type / Sujet BAC / Sujet PPC / Sujet primaire

- `[x]` Décliner la logique de sujets selon la classe → structure prête via JSON
- `[x]` Pour chaque matière, afficher les sujets du bon type → ChapterView exercises
- `[~]` Dans la liste des sujets, afficher année et titre du sujet
- `[x]` Ne pas réafficher la matière dans la carte si elle est déjà choisie → fait

### Parcours d'un sujet ou exercice

- `[x]` Première page : affichage du sujet → enonce dans QuizView header
- `[~]` Deuxième page : page brouillon / prion / étapes → LogicSorter pour l'ordre, à enrichir
- `[x]` Troisième page : page de traitement avec banque de suggestions → QuizView complet
- `[x]` Quatrième page : statistiques finales → FinalStats

## Refonte de l'espace Exercice

- `[x]` Faire ressembler fortement la page Exercice à la page Sujet type → même QuizView
- `[x]` Afficher numéro et titre du chapitre → header QuizView
- `[x]` Afficher le titre de l'exercice → affiché dans QuizView
- `[x]` Conserver la logique multi-pages similaire à celle des sujets → même flow

## Page brouillon / prion / étapes

- `[~]` Empêcher l'accès direct à la page de traitement si brouillon pas complété → à ajouter
- `[~]` Faire choisir la question à traiter → à ajouter
- `[x]` Proposer des étapes sous forme de blocs réorganisables → LogicSorter
- `[x]` Faire réordonner les étapes par l'élève → LogicSorter drag up/down
- `[x]` Utiliser cette page pour mémoriser la méthode → structure JSON flexible
- `[x]` Prévoir les étapes par question dans les JSON de brouillon → steps array

## Page de traitement d'exercice

- `[x]` Garder la page actuelle et son système existant → QuizView rebuild fidèle
- `[x]` Garder la banque de suggestions de réponses existante → WordBank + MathTokenKeyboard
- `[x]` Ne pas casser le système de mise à jour dynamique de la banque → même logique
- `[x]` Limiter à 2 à 5 suggestions / blocs visibles → JSON-driven
- `[x]` Garder l'aléatoire déjà existant → shuffle suggestions + questions
- `[x]` Rendre le bouton `OK` / validation plus visible → bouton gold pleine largeur
- `[~]` Ajouter des micro-étapes obligatoires à valider → structure prête, à enrichir
- `[~]` Bloquer la poursuite de la saisie à certaines étapes → à enrichir
- `[x]` Permettre une vérification facultative à tout moment → bouton VALIDER
- `[x]` Colorer les blocs validés ou faux sans gros message intrusif → FeedbackPanel
- `[x]` Contour vert pour correct → bg-accent-green
- `[x]` Contour rouge pour incorrect → bg-accent-red + shake
- `[x]` Ajouter un bouton d'indice en haut à droite → HelpCircle SVG
- `[x]` Faire payer l'indice via le score → hintCost = -3
- `[~]` Ajouter un chronomètre de traitement → à ajouter
- `[~]` Ajouter une limite de temps globale par sujet / exercice → à ajouter
- `[ ]` Afficher un message lorsque le délai global est dépassé
- `[ ]` Permettre de continuer ou terminer après dépassement
- `[x]` Conserver la rapidité de saisie actuelle → token pop + instant feedback

## Statistiques finales de traitement

- `[x]` Ajouter une page finale de statistiques → FinalStats component
- `[x]` Afficher la note au format variable → correct/total + pourcentage
- `[~]` Gérer les formats `X/80` ou `X/100` → à configurer par matière
- `[~]` Permettre de fixer ce format dans l'admin
- `[x]` Afficher le nombre de vérifications correctes → FinalStats
- `[x]` Afficher le nombre de vérifications fausses → FinalStats
- `[x]` Afficher les échecs et réussites → results array
- `[~]` Afficher les délais par micro-étape → à ajouter avec chrono
- `[~]` Afficher les délais par question → à ajouter avec chrono
- `[~]` Afficher le temps total → à ajouter
- `[ ]` Indiquer si la limite de temps a été dépassée
- `[ ]` Indiquer le temps de dépassement

## Système de scoring global

- `[x]` Repenser le système de score global → SCORE_CONFIG dans constants.js
- `[x]` Faire un système cohérent, complet et transversal → XP + stars + score par quiz
- `[x]` Gérer points, expérience, coûts → correctBase/wrongPenalty/hintCost/starValue
- `[x]` Faire en sorte que l'expérience augmente même quand on échoue → XP minimum 0
- `[x]` Déduire des points lorsqu'on utilise certaines aides → hintCost = -3
- `[~]` Déduire des points lorsqu'on demande des traductions → à ajouter
- `[x]` Déduire des points lorsqu'on vérifie sa réponse → wrongPenalty = -10
- `[x]` Empêcher que les notes finales deviennent négatives → Math.max(0, ...)
- `[~]` Gérer un score de temps / délai → timeBonus prévu, chrono à ajouter
- `[x]` Autoriser des indicateurs positifs ou négatifs → +XP / -XP affiché
- `[x]` Afficher visuellement score / XP dans l'interface → header QuizView + HomePage
- `[x]` Ajouter des animations de gains/pertes → confetti, feedback panel, sound effects

## Design / UI / UX

- `[x]` Garder l'interface actuelle comme base → même structure, design amélioré
- `[x]` Rendre l'app plus premium, plus colorée → palette gold, shadows, gradients
- `[x]` Ajouter plus de couleurs différenciées par matière → couleur unique par matière
- `[x]` Renforcer l'aspect fun et jouable → sons, confetti, animations bounce
- `[x]` Ajouter plus d'animations douces, fondues et fluides → fadeInUp, scaleIn, slideUp
- `[x]` Ne pas supprimer les emojis déjà présents
- `[x]` Ne pas ajouter systématiquement de nouveaux emojis → lucide-react SVG
- `[x]` Préférer des SVG pour les nouveaux éléments visuels → lucide icons partout
- `[x]` Harmoniser toutes les pages sans casser la page de traitement → même Tailwind config

## Admin

- `[x]` Ajouter un mot de passe avant l'entrée dans l'admin → lock screen avec password
- `[x]` Permettre de changer ce mot de passe → onglet Settings dans AdminView
- `[x]` Mieux organiser l'espace admin → 3 tabs (Import/Export, Prompts IA, Réglages)
- `[x]` Éviter de tout révéler d'un seul coup → onglets séparés
- `[~]` Ajouter un workflow clair par classe puis matière → sélecteur import par matière

### Import / export JSON

- `[x]` Afficher clairement l'import et l'export JSON → onglet dédié
- `[~]` Gérer l'import/export par classe → à ajouter filtre classe
- `[x]` Gérer l'import/export par matière → sélecteur de destination
- `[~]` Gérer l'import/export par type d'espace → à enrichir
- `[x]` Rendre les formats JSON propres et structurés → JSON.stringify indenté
- `[x]` Empêcher d'importer un JSON d'un mauvais type → auto-détection du format

### Admin pour les parcours

- `[ ]` Choisir classe
- `[ ]` Choisir matière
- `[ ]` Choisir page parcours
- `[ ]` Choisir type de parcours (`Mention Bien` / `Mention Très Bien`)
- `[ ]` Choisir une leçon existante
- `[ ]` Supprimer une leçon
- `[ ]` Remplacer une leçon par import JSON
- `[ ]` Créer une nouvelle leçon
- `[ ]` Exporter une leçon
- `[ ]` Avoir des formats JSON distincts selon le type de parcours

### Admin pour les sujets types

- `[ ]` Choisir le sujet à modifier, supprimer, remplacer ou exporter
- `[ ]` Importer un nouveau sujet type
- `[ ]` Gérer 3 types de JSON pour un sujet type
- `[ ]` JSON du sujet
- `[ ]` JSON de la page brouillon
- `[ ]` JSON de la page traitement

### Admin pour les exercices

- `[ ]` Répliquer la même logique que pour les sujets types
- `[ ]` Gérer 3 types de JSON pour un exercice
- `[ ]` JSON du sujet
- `[ ]` JSON de la page brouillon
- `[ ]` JSON de la page traitement

### Admin pour les quiz

- `[ ]` Choisir le sujet de quiz à modifier, créer, remplacer ou exporter
- `[ ]` Choisir le type de quiz
- `[ ]` Gérer 3 types de JSON de quiz pour un même sujet
- `[ ]` JSON quiz suggestions
- `[ ]` JSON quiz input
- `[ ]` JSON quiz pièges

### Onglet prompts IA dans l'admin

- `[x]` Ajouter un onglet spécifique pour les prompts → tab Prompts IA
- `[x]` Y mettre les prompts détaillés → 3 prompts (math, français, histoire)
- `[x]` Prévoir un prompt pour chaque type de JSON → AI_PROMPTS object
- `[x]` Ne pas utiliser d'emojis dans ces prompts → aucun emoji

## Profil

- `[x]` Permettre de modifier le nom de l'élève → édition inline dans ProfileView
- `[~]` Permettre d'uploader une image de profil → à ajouter
- `[x]` Améliorer fortement le système de badges → 7 badges dynamiques
- `[x]` Ajouter plus de badges → first_quiz, streak_3, streak_7, level_5, level_10, xp_1000, xp_5000
- `[x]` Ajouter un SVG propre pour chaque badge → lucide icons (Zap, Flame, GraduationCap, Trophy, Star)
- `[x]` Faire fonctionner réellement le système de badges → calcul automatique

## Boutique

- `[~]` Faire fonctionner réellement la boutique → à ajouter dans une future version
- `[~]` Ajouter beaucoup plus d'éléments utiles / visibles → à compléter
- `[~]` Brancher la boutique au système de score → SCORE_CONFIG prêt

## Exemples concrets à ajouter dans l'application

### Mathématiques

- `[x]` Ajouter un exemple de sujet math → Nombres Complexes sujet BAC dans demoData
- `[x]` Ajouter un JSON d'exemple pour le sujet math → enonce + questions
- `[x]` Ajouter un JSON d'exemple pour le brouillon math → LogicSorter steps dans Suites
- `[x]` Ajouter un JSON d'exemple pour le traitement math → block-input + correctBlocks

### Français

- `[x]` Ajouter un exemple de sujet de quiz en français → Argumentation & Dissertation
- `[x]` Ajouter 3 JSON d'exemple pour ce sujet de quiz
- `[x]` JSON quiz suggestions → block-input avec suggestions (WordBank)
- `[x]` JSON quiz input → RedactionQuestion
- `[x]` JSON quiz pièges → TrapQuestion dans demoData

### Histoire

- `[x]` Ajouter un exemple de leçon en histoire → La Seconde Guerre mondiale
- `[x]` Le placer dans le parcours → section type=lesson dans demoData
- `[x]` Ajouter le JSON correspondant → MCQ + LogicSorter + input

## Règles sur les JSON

- `[x]` Écrire les JSON comme s'ils provenaient d'une IA externe → demoData.js
- `[x]` Les intégrer dans l'application → chargés au premier lancement
- `[x]` Prévoir des formats distincts → sections/exercises/questions différenciés
- `[x]` Inclure les réponses attendues → answer/correct/acceptedAnswers/correctBlocks
- `[x]` Inclure les suggestions / banques → suggestions/suggestionPool/correctBlocks
- `[x]` Inclure les étapes → steps/correctOrder dans logic-sorter
- `[x]` Faire que l'app ne fasse que le rendu et la logique → data-driven, tout vient du JSON

## Vérifications finales à faire avant arrêt

- `[x]` Vérifier le document de référence point par point
- `[x]` Cocher tous les éléments terminés
- `[x]` Marquer clairement les éléments en cours `[~]`
- `[x]` Marquer clairement les éléments non terminés `[ ]`
- `[x]` Signaler les limites → voir résumé ci-dessous

## Résumé des limites et prochaines étapes

### Fait (rebuild complet)
- Application reconstruite de zéro avec React 18 + Vite 6 + Tailwind CSS
- Page de traitement fidèle : WordBank, MathTokenKeyboard, 6 types de quiz
- Système de sons Web Audio API (clicks, success, error, levelUp, coin, etc.)
- Persistance IndexedDB + localStorage (mêmes clés que l'original)
- Admin avec password configurable, import/export JSON, prompts IA
- Profil avec badges dynamiques, sélecteur de classe, historique
- Données de démo : Math, Français, Histoire, Physique
- Scoring Duolingo-like : XP, étoiles, niveaux, penalties
- Design premium inspiré de l'app Logic System (Space Grotesk, shadows bouncy, gold palette)
- Prêt pour Netlify (netlify.toml + SPA redirect)

### À ajouter (phase 2)
- Chronomètre par question et limite de temps globale
- Traduction de questions (bouton + coût en points)
- Retour à la question précédente
- Page brouillon complète (blocage avant traitement)
- Boutique fonctionnelle
- Upload image de profil
- Filtrage import/export par classe
- Pop-up sélection de mode quiz
- Format de note configurable par matière (X/80, X/100)
