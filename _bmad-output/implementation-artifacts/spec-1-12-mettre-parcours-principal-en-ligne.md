---
title: 'Story 1.12 — Mettre le parcours principal en ligne'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '249764cea4ee1a8e502e7b17cdfc1770e8678212'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le parcours principal (dépôt → référence → recherche → *En cours* → *Traitée*) ne tourne que sur le poste d'Aurel, relié à la base dev : aucun vrai utilisateur ne peut s'en servir, rien ne prouve automatiquement que le parcours entier fonctionne, et aucune procédure ne dit comment publier ni quelle version tourne (NFR-1, NFR-2, NFR-4, SM-1).

**Approach:** Ajouter le test Playwright du parcours SM-1, lancé sur dev (serveur local), et préparer l'application pour Vercel (Node 24, fonctions à Paris). Compléter `docs/deploiement.md` avec la mise en ligne pas à pas : projet Supabase prod, projet Vercel relié à `main`, variables saisies dans Vercel, premier administrateur de prod (procédure 1.5), vérifications, puis tag `v0.1.0`. Les actions sur Vercel, Supabase prod et GitHub (envoi, tag) sont faites par Aurel en suivant la procédure.

## Boundaries & Constraints

**Always:** AD-15 (prod Vercel = Supabase prod uniquement ; aperçus et poste = dev ; aucune clé dans le dépôt ni dans la conversation, `.env*` ignorés ; gitleaks avant la mise en production), AD-16 (migrations par la CLI, dev puis prod, jamais à la main), AD-17 (version de `package.json` = tag `vX.Y.Z` = « Version v0.1.0 » du menu ; Vitest et Playwright verts sur dev avant le tag ; retour arrière Vercel), A-H2 (Europe), A-H3 (Node 24) ; le test e2e ne tourne que sur une adresse locale et refuse toute autre adresse ; identifiants du compte de test lus dans `.env.local`, jamais écrits dans le dépôt ni affichés ; textes de l'interface inchangés ; variables `NEXT_PUBLIC_` figées à la construction : tout changement dans Vercel demande un redéploiement (le dire dans la procédure).

**Never:** sauvegarde de nuit (1.13) ; procédure de retour arrière testée et documentation d'exploitation (epic 5) ; page protégée pour provoquer une erreur en production (entrée de deferred-work, hors des critères de 1.12) ; nom de domaine ; compte de test sur prod ; test e2e contre la production ; modification d'une migration ; commit, envoi sur GitHub ou tag par l'agent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Parcours SM-1 | `npm run test:e2e`, compte de test dev renseigné dans `.env.local` | dépôt → « Votre demande a bien été enregistrée » + référence ; connexion ; recherche de la référence → 1 ligne ; détail ; « Passer En cours » ; « Marquer Traitée » ; historique = « Demande créée · Demandeur », « Statut : Nouvelle → En cours · nom », « Statut : En cours → Traitée · nom », dans cet ordre ; « Clôturée le » visible | N/A |
| Identifiants absents | `E2E_EMAIL` ou `E2E_MOT_DE_PASSE` vide | le test s'arrête avant d'ouvrir le navigateur avec un message français qui dit quoi ajouter dans `.env.local` | échec clair, aucune demande créée |
| Adresse non locale | `E2E_ADRESSE` différente de `localhost` / `127.0.0.1` | refus de lancer (« le test ne tourne que sur dev ») | échec clair |
| Compte à mot de passe temporaire | le compte de test doit encore choisir son mot de passe | échec avec un message qui le dit | échec clair |

</frozen-after-approval>

## Code Map

- `package.json` -- `version` déjà `0.1.0` ; scripts existants (`secrets` = gitleaks) ; ajouter `@playwright/test` 1.65, script `test:e2e`, `engines.node`.
- `src/components/interne/menu-lateral.tsx:35-36`, `src/shared/messages.ts:161` -- version affichée « Version v0.1.0 », lue dans `package.json`. Ne pas modifier (AC4 déjà couvert par le code).
- `vitest.config.mts` -- `include: tests/**/*.test.{ts,tsx}` : nommer le test e2e `*.spec.ts` pour que Vitest l'ignore.
- `src/app/(public)/formulaire-depot.tsx:371-505` -- étiquettes : « Nom et prénom », « Email », « Catégorie » (liste native, 1re option vide), « Objet », « Description » (minimum de caractères), case « J'ai pris connaissance… » (Radix `Checkbox`, rôle `checkbox`), bouton « Envoyer ma demande ».
- `src/app/(public)/confirmation/vue-confirmation.tsx:51-54` -- `[data-slot=reference]`.
- `src/app/connexion/formulaire-connexion.tsx`, `src/shared/messages.ts:138-142` -- « Email », « Mot de passe », « Se connecter » ; `/connexion/nouveau-mot-de-passe` si mot de passe à choisir.
- `src/components/interne/recherche-demandes.tsx:105-120` -- champ `searchbox` « Rechercher par référence… », recherche après une pause de frappe ou Entrée.
- `src/components/interne/tableau-demandes.tsx:60` -- lien de la ligne vers le détail.
- `src/components/interne/historique-demande.tsx` -- `ol[data-slot=historique] > li[data-slot=evenement]`, « quoi » puis « qui · date ».
- `src/shared/libelles.ts:38-44` -- « Passer En cours », « Marquer Traitée » ; `MESSAGES_STATUT.clotureeLe`.
- `docs/deploiement.md` §7 « Production » -- base de la procédure ; à compléter, pas à réécrire.
- `.env.example` -- documenter `E2E_EMAIL`, `E2E_MOT_DE_PASSE` (facultatifs, dev seulement).
- `.gitignore` -- ajouter les dossiers de rapports Playwright.
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md:158-166` -- `NEXT_PUBLIC_` figées au build.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `package-lock.json` -- `npm install -D @playwright/test@1.65.1`, `npx playwright install chromium` ; script `"test:e2e": "playwright test"` ; `"engines": { "node": "24.x" }` -- Playwright choisi par l'architecture ; Node 24 = A-H3 (Vercel le lit).
- [x] `playwright.config.ts` -- dossier `tests/e2e`, Chromium seul, un seul worker, `baseURL` = `E2E_ADRESSE` ou `http://localhost:3000` (refus si non local), `webServer` `npm run dev` réutilisé s'il tourne, variables lues dans `.env.local` (`process.loadEnvFile`), trace à l'échec -- tests sur dev seulement (AD-17, architecture §7).
- [x] `tests/e2e/parcours-sm1.spec.ts` -- matrice ; objet unique `Essai automatique SM-1 <horodatage>` ; attentes sur les textes de l'UX -- preuve de SM-1 (AC3).
- [x] `vercel.json` -- `regions: ["cdg1"]` (Paris) -- A-H2, près de la base prod créée à Paris.
- [x] `.env.example`, `.gitignore` -- variables e2e commentées ; `/playwright-report/`, `/test-results/`.
- [x] `docs/deploiement.md` -- nouvelle partie « Mise en ligne » : créer Supabase prod (Paris), étapes 2 à 5 sur prod (lien §7), créer le projet Vercel depuis GitHub, variables par environnement (Production = prod ; Preview = dev) sans jamais les coller ailleurs, région, premier déploiement, vérifications des 4 critères, tag `v0.1.0` après tests verts ; rappel redéploiement si une variable change.
- [x] `tests/socle/mise-en-ligne.test.ts` -- Vitest : version de `package.json` au format `X.Y.Z`, `engines.node` 24, `vercel.json` en Europe, test e2e présent, aucun identifiant écrit en dur dans `tests/e2e`.

**Acceptance Criteria:**
- Given le projet Supabase prod et le projet Vercel reliés à `main`, when Aurel envoie `main` sur GitHub, then l'application est publiée sur une adresse `*.vercel.app`, en HTTPS.
- Given une demande de test créée sur dev, when Aurel ouvre la liste en production, then elle n'y apparaît pas.
- Given le test Playwright du parcours SM-1, when il est lancé sur dev, then il passe : dépôt, référence, recherche, *En cours*, *Traitée*, et trois lignes d'historique dans l'ordre.
- Given le tag `v0.1.0` posé sur `main`, when Aurel ouvre l'espace interne en production, then le menu affiche la version `v0.1.0`.

## Implementation Notes

- Fichiers : `package.json` (+ lock), `playwright.config.ts`, `tests/e2e/environnement.ts`, `tests/e2e/parcours-sm1.spec.ts`, `tests/socle/mise-en-ligne.test.ts`, `vercel.json`, `.env.example`, `.gitignore`, `docs/deploiement.md` (partie « Mise en ligne »).
- Adresse e2e : seulement `http://localhost:<port>` ou `http://127.0.0.1:<port>` (le serveur lancé ne sert que HTTP). Identifiants manquants ou mot de passe vide : arrêt au chargement de la configuration, avant le navigateur.
- Test SM-1 **pas encore passé en entier** : `.env.local` n'a pas les identifiants du compte de test (`E2E_EMAIL`, `E2E_MOT_DE_PASSE`), à ajouter par Aurel. Un essai avec de faux identifiants a validé dépôt + référence, puis échec propre à la connexion ; il a laissé sur dev une demande « Essai automatique SM-1 … » *Nouvelle*.
- La trace Playwright d'un échec contient le mot de passe tapé : dossiers ignorés par git, avertissement dans la doc.
- Pendant l'implémentation, un `npm ci` interrompu (fichier tenu par `npm run dev`) a vidé `node_modules` ; restauré par `npm install`.
- Vitest : lancer depuis PowerShell (échoue sous Git Bash, problème d'environnement).
- Vérifié : lint, `tsc --noEmit`, 69 fichiers / 1 239 tests verts, `npm run build`, gitleaks (aucune fuite). Pas de commit (demande d'Aurel).
- Après livraison (22 nov.) : le test e2e échouait à la connexion. Cause : Next.js 16 rejette la promesse de la Server Function avec sa redirection ; `envoyerConnexion` le prenait pour une panne et affichait « Une erreur inattendue s'est produite. » ~0,1 s avant « Demandes ». Corrigé avec `unstable_rethrow` (`src/app/connexion/formulaire-connexion.tsx`) + test ; le test e2e ne regarde plus que les éléments visibles (Next.js garde la page quittée, cachée). `npm run test:e2e` : 1 passed ; 1 240 tests verts.
- Même défaut sur I2 (« Choisir un nouveau mot de passe »), seulement pour les renvois du serveur (session expirée, mot de passe déjà choisi) : message « Votre mot de passe n'a pas pu être enregistré. Réessayez. » bref et verrou rouvert. Corrigé de la même façon (`src/app/connexion/nouveau-mot-de-passe/formulaire-mot-de-passe.tsx`) + test ; la réussite normale (sans redirection) n'avait pas le défaut. 1 241 tests verts, e2e 1 passed.
- Avertissement Next.js « Blocking Route » sur `/connexion/nouveau-mot-de-passe` (`Date.now()` pendant la préparation, défaut de la story 1.7 vu à l'écran par Aurel) : `await connection()` avant la garde, comme `contenu-demandes.tsx` et `menu-lateral.tsx` ; test de l'ordre `connection` → garde. Décision d'Aurel : corriger maintenant. 1 242 tests verts, build, e2e 1 passed.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif | Garde « dev seulement » de `playwright.config.ts` vérifiée par lecture du texte : un `baseURL` réécrit avec l'adresse brute passerait les tests | medium | Pré-vérifié : `mise-en-ligne.test.ts` ne charge pas la configuration | patch |
| 2 | blind + edge + verif | `https://localhost` accepté (le serveur lancé ne sert que HTTP, attente de 180 s) ; adresse sans port → `--port 80` | low | Vérifié : `new URL("http://localhost").port` = `""`, repli 80/443 | patch |
| 3 | blind | « Vérifications finales » en production = un dépôt réel sur prod, sans consigne (objet, clôture), confondu avec le contrôle « Données séparées » | low | Vérifié : §8 de l'installation, renvoyé par l'étape 7 | patch |
| 4 | blind | Renvois « étape 6 » ambigus (deux parties numérotées 1 à 8) | low | Vérifié : `.env.example:53` | patch |
| 5 | blind | Préparation du compte de test (mot de passe temporaire → connexion → choix) non décrite à un seul endroit | low | Vérifié : étape 6 de l'installation ne donne que la commande | patch |
| 6 | blind + edge | Analyse de `tests/e2e` non récursive : un sous-dossier fait planter le fichier (EISDIR) | low | Vérifié : `readdirSync` sans filtre | patch |
| 7 | blind | Contrôle du `.gitignore` limité à 2 des 4 dossiers Playwright | low | Vérifié | patch |
| 8 | edge | `E2E_MOT_DE_PASSE` fait d'espaces jugé renseigné : une demande est créée avant l'échec | low | Vérifié : seul l'email est `trim()` | patch |
| 9 | blind + edge | Variables du terminal pointant vers prod l'emportent sur `.env.local` (`loadEnvFile` et Next.js) | low | Vérifié (`loadEnvFile` garde la valeur du terminal) ; la procédure n'exporte jamais de clé dans le terminal (`.env.prod.local` lu par `lancer.mjs` seul) | rejeté |
| 10 | blind | Mot de passe du compte de test dans la trace Playwright en cas d'échec | low | Réel ; dossier ignoré par git, compte de dev, avertissement écrit ; trace à l'échec demandée | rejeté |
| 11 | blind | Le test vise `next dev` et non une construction de production | low | Choix du plan (dev = serveur local) ; `npm run build` reste dans l'étape 1 | rejeté |
| 12 | blind | Contrôles sur le texte des fichiers (format, version 1.65) fragiles | low | Version 1.65 imposée par l'architecture ; le point de fond est traité en #1 | rejeté |
| 13 | blind | Aucune vérification automatique avant l'envoi sur `main` (pas de CI) | low | Hors 1.12 : GitHub Actions arrive avec 1.13 et l'epic 5 | defer |
| 14 | blind | `engines` 24.x non imposé sur le poste (Node 26 local) | low | Avertissement seulement ; Vercel l'applique, c'est l'environnement qui compte (A-H3) | rejeté |
| 15 | edge | Email mal formé : refus côté navigateur, attente générique de 20 s | low | Cas rare ; message de l'écran visible dans la trace | rejeté |
| 16 | edge | Aucune catégorie sur dev : `selectOption` échoue sans message clair | low | 5 catégories créées par la migration 1.3 | rejeté |
| 17 | edge | Recherche par sous-chaîne : une autre demande contenant la référence ferait 2 lignes | low | Seulement au-delà de 9 999 demandes sur dev | rejeté |
| 18 | edge | `reuseExistingServer` réutilise tout serveur local déjà lancé | low | Voulu : réutiliser `npm run dev` d'Aurel ; adresse locale imposée | rejeté |
| 19 | edge | Lancé depuis un autre dossier, `.env.local` introuvable | low | Lancé par `npm run test:e2e` depuis la racine ; message clair dans ce cas | rejeté |

## Design Notes

- Les critères 1, 2 et 4 se vérifient chez Vercel et Supabase : l'agent livre le code prêt à publier et la procédure ; Aurel publie quand il a vérifié (pas de sauvegarde demandée maintenant).
- Le test e2e laisse sa demande sur dev (objet « Essai automatique… ») : elle sert aussi au critère 2.

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npm run test:e2e` -- expected: 1 test vert (si le compte de test est renseigné dans `.env.local`).
- `npm run secrets` -- expected: aucune fuite.

**Manual checks:**
- Suivre `docs/deploiement.md` « Mise en ligne » ; vérifier les 4 critères en production.
