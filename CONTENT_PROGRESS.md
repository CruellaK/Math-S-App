# Suivi des contenus FR / EN — Multi-sessions

## Décisions cadrage
- Ampleur : **Standard** (~1500 questions visées, ~2800 en réalité avec règle 5/10).
- Règle questions par item : majorité **5 questions**, ~30% à **10 questions**.
- Pas d'ajout de questions sur les items existants.
- Tous les nouveaux items = nouveaux titres = pas de duplication possible (idempotence vérifiée).

## Architecture
- Toute la génération vit dans `src/lib/languageContentCatalog.js`.
- Les payloads JSON sortent automatiquement via `MASSIVE_DOWNLOADABLE_EXAMPLES`.
- L'utilisateur clique le bouton vert "Tout importer (N)" dans Admin → Contenu après avoir sélectionné Français ou Anglais.

## Phases

### Phase A — Champ description (PARTIEL cette session)
- [x] `description` accepté par les schémas (additionalProperties n'est pas false, donc accepté silencieusement — vérifié dans `validateSchema`)
- [x] `chapter.description` persisté dans `ensureChapter` via `payload.chapterDescription` (`adminContent.js`)
- [x] `item.description` persisté dans `applyAdminImportToSubject` pour kinds `_enonce`, `_brouillon`, `quiz_mode_*`
- [x] `description` propagé dans les payloads JSON via `buildQuizFilesForItem` (`languageContentCatalog.js`)
- [x] Descriptions ajoutées à tous les chapitres + items FR existants
- [x] Descriptions ajoutées à tous les nouveaux items FR de Phase B
- [ ] Descriptions à ajouter sur les chapitres + items EN existants (TODO session suivante, ~10 lignes)
- [ ] Description à propager dans `buildExerciseFiles` aussi pour les exercices longs (TODO session suivante)
- [ ] Description affichée dans l'admin UI sous chaque titre d'item (cosmétique, TODO session suivante)
- [ ] Description persistée pour kind `_traitement` aussi (oubli, TODO session suivante)

### Bug fix réalisé cette session
- [x] **Duel de l'Intrus (1ère tentative)** : ajout d'un panneau dans `DuelIntrusQuestion` — INSUFFISANT, créait 3 occurrences de "Choisissez la forme exacte".
- [x] **Duel de l'Intrus (fix définitif)** : revert du panneau, et dans `buildDuelQuestions` (`languageContentCatalog.js`) on ne pose plus que `text: entry.prompt` (pas de `subtitle` dupliqué). Dans `quizModes.js` `getQuizModeQuestions` pour `duel_intrus`, on ne met plus de fallback `subtitle: 'Sélectionnez le bloc sain et rejetez le piège.'`. Résultat : une seule consigne (le `<h3>`) au-dessus des deux blocs. ⚠️ NÉCESSITE re-import via "Tout importer" pour que les anciennes données duel se régénèrent sans `subtitle`.

### Feature — Classes & élèves (FAIT cette session)
Nouvelle gestion fine des accès aux matières par classe et par élève.
- [x] **Modèle de données** : `data.classDefaults = { [className]: { blockedSubjectIds: [] } }` au top-level. `user.unlockedSubjectIds = []` ajouté par profil (`@.../src/lib/constants.js`).
- [x] **Helper** : `@.../src/lib/subjectAccess.js` exporte `computeSubjectAccess({ subject, user, classDefaults })` → `{ blocked, source }` avec source ∈ `'open' | 'class-default' | 'personal'`. Et `sortSubjectsByAccess()` qui trie débloquées en haut, bloquées en bas (stable).
- [x] **HomePage.jsx** : utilise `computeSubjectAccess` au lieu de l'ancien `isSubjectBlocked` local. Trie les matières via `sortSubjectsByAccess`. Le label sous l'icône précise désormais "Matière bloquée par défaut pour Terminale" (vs "par l'administrateur").
- [x] **Sanitizer** : `progression.js` nettoie maintenant `unlockedSubjectIds` côté user.
- [x] **Admin UI** : nouvel onglet "Classes & élèves" (`@.../src/pages/AdminView.jsx`) avec :
  - Sélecteur de classe (réutilise `selectedClass`)
  - Liste des matières avec toggle "Bloquée par défaut" / "Ouverte" pour la classe
  - Liste des élèves rattachés à la classe (`<details>` repliables)
  - Pour chaque élève × matière : badge d'état (BLOC. CLASSE / BLOC. PERSO / DÉBLOC. PERSO / OUVERTE) + bouton "Débloquer" (si bloquée par classe) ou "Bloquer" (si ouverte par classe)
- [x] **Règle de priorité** documentée dans `subjectAccess.js` : blocage personnel > déblocage personnel > blocage de classe > ouvert.

### Phase B — Extension chapitres FR existants ✅ (COMPLET — 20/20)
Cible : +5 items / chapitre × 4 chapitres = 20 items. ✅ Livré : 20 items (≈110 cases, ≈550 questions sur les 5 modes).
- [x] Chapitre 1 "Bases orthographiques et accords" → 5/5 (Adjectifs de couleur, Accents/diacritiques, Élision/apostrophe, **Trait d union et noms composés**, **Majuscules et noms propres**)
- [x] Chapitre 2 "Grammaire, conjugaison et phrase complexe" → 5/5 (Subjonctif présent, Voix passive, **Discours rapporté direct/indirect**, **Négation et restrictions**, **Concordance des temps**)
- [x] Chapitre 3 "Compréhension, vocabulaire et analyse" → 5/5 (Synonymie précise, Mots de liaison hiérarchisés, **Antonymie et nuances**, **Champs lexicaux thématiques**, **Polysémie et faux amis**)
- [x] Chapitre 4 "Méthodologie, commentaire et dissertation" → 5/5 (Hiérarchisation des arguments [10 cases], Reformulation rigoureuse, **Exemples littéraires choisis**, **Analyse stylistique appliquée**, **Conclusion ouverte et perspective**)
- Insertion dans `@.../src/lib/languageContentCatalog.js:4825-5235` via 4 nouveaux `FRENCH_QUIZ_CHAPTERS[i].quizItems.push(...)` (gras = ajoutés cette session).
- ⚠️ Re-importer via "Tout importer" pour générer les fichiers JSON correspondants.

### Phase C — Extension chapitres EN existants (À FAIRE — session suivante, 0/20)
Même structure que FR : +5 items / chapitre × 4 chapitres = 20 items.
- [ ] Chapter 1 "Foundations and everyday grammar" → 5 items (idées : Phrasal verbs basics, Question forms, Possessives, Comparatives/superlatives, Quantifiers).
- [ ] Chapter 2 "Sentence building and advanced grammar" → 5 items (idées : Gerunds vs infinitives, Inversion in formal English, Cleft sentences, Mixed conditionals, Used to / would).
- [ ] Chapter 3 "Reading, vocabulary and interpretation" → 5 items (idées : Idioms in context, Collocations, False friends, Register markers, Implicit meaning).
- [ ] Chapter 4 "Writing, essays and exam method" → 5 items (idées : Topic sentences, Linking devices nuanced, Counter-argument framing, Hedging language, Conclusion strategies).

### Phase D — Nouveaux chapitres A1 → C2 (À FAIRE — session suivante)
6 niveaux × 2 langues × 4 items chacun = 48 nouveaux items :
- [ ] FR A1 "Découverte" — 4 items basiques (alphabet, articles élémentaires, présent de être/avoir, vocabulaire du quotidien)
- [ ] FR A2 "Bases solides" — 4 items
- [ ] FR B1 "Intermédiaire" — 4 items
- [ ] FR B2 "Pré-avancé" — 4 items
- [ ] FR C1 "Avancé" — 4 items
- [ ] FR C2 "Maîtrise" — 4 items
- [ ] EN A1 "First steps" — 4 items
- [ ] EN A2 "Solid basics" — 4 items
- [ ] EN B1 "Intermediate" — 4 items
- [ ] EN B2 "Upper intermediate" — 4 items
- [ ] EN C1 "Advanced" — 4 items
- [ ] EN C2 "Mastery" — 4 items

### Phase E — Exercices longs sur nouveaux chapitres (À FAIRE — session suivante)
1 exercice long par nouveau chapitre = 12 exercices longs (énoncé + brouillon + traitement).

### Phase F — Document récap final (À FAIRE — dernière session)
`CONTENU_FINAL_RECAP.md` listant chaque chapitre + item + description courte, FR et EN.

## Notes
- Le bug d'affichage du Duel de l'Intrus (titre/phrase non affichés) a été corrigé dans `QuizView.jsx` au début de la session.
- Le bouton "Tout importer (N)" auto-filtre les packs par slug du nom de la matière (`francais-*` / `anglais-*`).
- Le mode Fusionner conserve les anciens items et ajoute uniquement les nouveaux. C'est le mode recommandé pour les ré-imports.
