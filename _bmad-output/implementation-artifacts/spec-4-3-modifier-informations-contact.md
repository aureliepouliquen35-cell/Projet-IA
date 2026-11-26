---
title: 'Story 4.3 — Modifier les informations de contact affichées aux demandeurs'
type: 'feature'
created: '2026-11-26'
status: 'done'
baseline_commit: 'f765498d9ee9d3691a14e0a6cf46d693f1645c51'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le téléphone, l'email de contact et le contact pour les données personnelles ne se changent que par la procédure d'installation (`npm run parametres:installer`). L'administrateur ne peut pas les corriger lui-même (FR-31).

**Approach:** On ajoute l'écran A3 « Informations générales » (`/admin/informations`), relié au menu Administration. Il a trois champs, un aperçu sous chaque champ et le bouton « Enregistrer ». L'enregistrement passe par `modifier_parametres`, ouverte aux administrateurs. Le formulaire public P1 et la confirmation P2 relisent déjà `parametres` à chaque affichage : le changement y est visible aussitôt.

## Boundaries & Constraints

**Always:**
- **La protection (triple), comme en 4.1.** La page, sa lecture et la Server Function commencent par `exigerAdministrateur()`. Sinon : écran S1, ou `ACCES_REFUSE` puis `refresh()`. Côté base, une nouvelle `lire_parametres_administration()` et la nouvelle version de `modifier_parametres` appellent `exiger_administrateur()` (NV202) pour tout appelant connecté. Les deux sont `security definer`, avec `search_path = ''`. On utilise la session de l'administrateur, jamais la clé secrète.
- **L'installation continue de marcher.** `modifier_parametres` reste exécutable par `service_role` pour `installerParametres` (story 1.5). Elle devient aussi exécutable par `authenticated`, jamais par `anon` ni `public`.
- **La validation.** On utilise le schéma partagé `schemaParametres`, dans le navigateur puis dans la Server Function, et la base revérifie (NV103). Les messages sont exacts et s'affichent sous le champ : « Ce champ est obligatoire », « L'email doit avoir la forme nom@exemple.fr ». Le téléphone est facultatif : vide, il devient `null`, et P1/P2 montrent alors l'email.
- **Rien n'est perdu.** Après un refus ou une panne, les trois saisies restent affichées. Une panne affiche « Les informations n'ont pas pu être enregistrées. Réessayez. ». Pendant l'envoi, le bouton affiche « Enregistrement… ». Un double clic n'envoie qu'une seule fois.
- **Après la réussite.** Le toast « Informations mises à jour. Elles sont visibles immédiatement. » s'affiche, puis `refresh()`. Le journal reçoit `parametres_modifies` par `journaliser()`, avec l'email de l'administrateur comme auteur. La date et l'heure sont celles de la ligne. Aucune autre donnée n'est écrite.
- **Le chargement.** Un squelette des trois champs s'affiche. Si la lecture échoue : « Impossible de charger les informations. » + « Réessayer » (même modèle que A2).
- **La migration.** On crée une nouvelle migration, sans toucher aux anciennes (AD-16).

**Never:**
- modifier P1, P2, I5 ou `src/server/depot`, qui relisent déjà les paramètres ;
- écrire directement dans `parametres` ;
- écrire un détail de journal avec les valeurs saisies ;
- toucher aux catégories, aux comptes ou aux statuts ;
- faire un commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enregistrer | Trois valeurs valides | Toast, valeurs nettoyées affichées. P1 (message de panne, mention) et P2 les montrent à la visite suivante. Journal `parametres_modifies` | N/A |
| Téléphone vidé | `telephone` = "" | Enregistré `null`. P1 et P2 affichent l'email | N/A |
| Email mal écrit | `contact@nova` | Message sous le champ, saisies gardées, rien n'est envoyé | `VALIDATION` (navigateur, serveur, NV103) |
| Champ obligatoire vide | Email ou contact données vide | « Ce champ est obligatoire » | `VALIDATION` |
| Trop long | Au-delà des `LONGUEURS_MAXIMALES_PARAMETRES` | Message existant de `MESSAGES_PARAMETRES` | `VALIDATION` |
| Collaborateur | Adresse tapée, ou action appelée directement | S1, rien n'est lu ni écrit | `ACCES_REFUSE` / NV202 |
| Panne | La base ne répond pas | Message de panne, saisies gardées | `ERREUR_INTERNE` (enveloppe) |
| Ligne absente | `parametres` vide | Message de panne | NV104 → `ERREUR_INTERNE` |

## Decisions

Choix d'Aurel, 26 nov. 2026 :
- **L'aperçu est une phrase d'aide sous chaque champ.** Téléphone et Email : « Affiché sur l'écran de confirmation et dans le message d'erreur du formulaire. » Contact données : « Affiché dans la mention sur les données personnelles du formulaire. »
- **Textes absents de l'UX, validés :** l'entrée de menu « Informations générales », avec l'icône `Info` ; le titre de page « Informations générales » ; l'erreur de lecture « Impossible de charger les informations. » + « Réessayer ».
- **La migration est appliquée sur la base dev** `aodcgbzapnruciesaycg` par l'agent, jamais sur prod.
- Le plan dépasse 1 600 jetons : on le garde entier, car il n'a qu'un seul objectif.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261120090000_comptes.sql:183-220` -- `modifier_parametres(text,text,text)` actuelle (NV103, NV104, `service_role` seul) : à reprendre en `create or replace`, avec `if auth.uid() is not null then perform public.exiger_administrateur(); end if;` et `grant … to authenticated`. Le retour reste `void`.
- `supabase/migrations/20261126150000_categories_administration.sql` -- modèle de `lister_categories_administration` (jsonb, `stable`, droits) pour `lire_parametres_administration()` → `{telephone, email_contact, contact_donnees}`.
- `src/server/admin/index.ts:207-249` -- `installerParametres` (clé secrète, installation) : **ne pas changer**. Il sert de modèle pour les codes (NV103 → erreur sous `emailContact`).
- `src/shared/schemas/parametres.ts`, `src/shared/messages.ts:104` (`MESSAGES_PARAMETRES`) -- schéma et textes existants. Ajouter le titre, les étiquettes, les aperçus, « Enregistrer », « Enregistrement… », le toast et l'erreur de lecture.
- `src/server/lectures/categories.ts` -- modèle de la nouvelle `src/server/lectures/parametres.ts` (`exigerAdministrateur`, `lire`, Zod, `accesRefuse`, `cache`).
- `src/server/actions/ajouter-categorie.ts` -- modèle de la nouvelle `modifier-parametres.ts` (garde, Zod, rpc par session, NV202/NV103, `refresh()`, enveloppe, message de panne). Ajouter `journaliser("info", "parametres_modifies", { auteur: administrateur.email })` après la réussite.
- `src/app/(interne)/admin/categories/{page,contenu-categories}.tsx` -- modèle de `src/app/(interne)/admin/informations/`.
- `src/components/interne/ajouter-categorie.tsx` -- modèle (fonctions pures exportées, `useReducer`, verrou, `useTransition`, `unstable_rethrow`, `Champ`) de `src/components/interne/informations-generales.tsx` (formulaire + squelette + erreur).
- `src/shared/acces.ts` (`ADRESSE_INFORMATIONS = "/admin/informations"`), `src/components/interne/section-administration.tsx` -- le lien du menu et son commentaire.
- Tests : `tests/aides/supabase-connexion.ts` (simuler `lire_parametres_administration` et `modifier_parametres`) ; nouveau `tests/parametres/*` (migration en texte, action, écran, fonctions pures) ; `tests/regles/rm-07-administration-reservee.test.ts` (page, lecture, action) ; `tests/e2e/administration.spec.ts` (collaborateur : pas de lien, S1, NV202 sur les deux fonctions réelles). `tests/comptes/installer-parametres.test.ts` doit rester vert.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261127120000_informations_generales.sql` -- `lire_parametres_administration` ; nouvelle `modifier_parametres` ; droits.
- [x] `src/shared/messages.ts`, `src/shared/acces.ts` -- textes, adresse.
- [x] `src/server/lectures/parametres.ts`, `src/server/actions/modifier-parametres.ts` -- lecture et enregistrement.
- [x] `src/components/interne/informations-generales.tsx`, `src/app/(interne)/admin/informations/{page,contenu-informations}.tsx`, `section-administration.tsx` -- écran A3 et menu.
- [ ] Tests -- couvrir la matrice, RM-7, la migration et le e2e collaborateur.

**Acceptance Criteria:**
- Given la page « Informations générales », when je change le téléphone et j'enregistre, then le nouveau numéro apparaît aussitôt sur l'écran de confirmation et dans le message d'erreur du formulaire.
- Given un email de contact mal écrit, when j'enregistre, then je lis « L'email doit avoir la forme nom@exemple.fr » et rien n'est perdu.
- Given un nouveau contact pour les données personnelles, when j'ouvre le formulaire public, then la mention affiche ce contact.

## Implementation Notes

- Agent de codage (2026-11-26) : tout est construit. Lint, tsc, `npm run test` (111 fichiers, 2459 tests, lancés depuis PowerShell) et `npm run build` sont au vert. L'outil de sécurité a refusé `supabase db push` à l'agent, comme en 4.1 et en 4.2 ; l'essai à blanc vise bien `aodcgbzapnruciesaycg`.
- **Écart au plan :** l'utilisateur connecté n'avait pas d'email. La garde (`src/server/garde/index.ts`) lit maintenant aussi `profils.email`, déjà permis par la règle « sa propre ligne », et `UtilisateurConnecte` porte `email`. Lire `profils` depuis l'action aurait cassé une règle de test RM-7.
- Agent principal, après la relecture (4 corrections, 2 reports, 10 rejets) : lint, tsc, `npm run test` (111 fichiers, 2460 tests) et `npm run build` sont au vert. Avec l'accord d'Aurel, la migration est appliquée sur dev (`aodcgbzapnruciesaycg`) : 22 migrations des deux côtés. Les e2e `administration.spec.ts` et `parcours-sm1.spec.ts` passent (11/11). `parcours-sm1` a échoué une première fois, sur la lenteur de la première compilation de P2 ; il passe au second essai. Pas de commit : Aurel vérifie d'abord à l'écran.
- Vérifié à l'écran par Aurel le 26 nov. 2026 : tous les critères sont bons. Commit local sur `main`, sans envoi.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif | L'e2e collaborateur `not.toContain("informations-generales")` échouera sous `next dev` : le squelette vient d'un module client, et son chemin apparaît dans la réponse | medium | Vérifié : `SqueletteInformations` vient de `informations-generales.tsx` (`"use client"`), et Turbopack met en dev le chemin complet des modules | patch |
| 2 | blind + verif | Le titre « P1, P2 et A3 relisent la ligne » annonce plus que le test ne vérifie (A3 seule) | low | Vérifié : `actions-parametres.test.ts:149` ne relit que par `lireInformationsGenerales` | patch |
| 3 | verif | Le nouveau refus de la garde (email illisible) n'est pas testé | low | Pré-vérifié : aucun test ne met d'email invalide | patch |
| 4 | blind | Le commentaire SQL dit 23514 pour un contact vide, alors qu'un contact absent (`null`) donne 23502 | low | Vérifié : colonne `not null` | patch |
| 5 | blind + verif | Le vrai chemin administrateur (lecture, enregistrement) et l'installation ne tournent jamais sur une vraie base | medium | Pré-vérifié ; pas de compte administrateur e2e (même report qu'en 4.1 et 4.2) | defer |
| 6 | blind + verif | Le câblage du formulaire avec état (envoi, sélection, toast) n'est vérifié que sur le texte | medium | Pré-vérifié ; vitest sans DOM (même report qu'en 4.1 et 4.2) | defer |
| 7 | blind | L'aide sous « Email de contact » dit « et dans le message d'erreur du formulaire », alors que ce message ne montre l'email que s'il n'y a pas de téléphone | low | Vérifié : `messagePanneDepot` ; P2 affiche bien les deux. C'est le texte validé par Aurel (bloc figé) : signalé à Aurel | rejeté |
| 8 | blind + edge | Deux administrateurs qui enregistrent en même temps : le dernier gagne, sans avertissement | low | Une seule ligne de réglages, peu d'administrateurs ; une protection demande un paramètre et un nouveau refus | rejeté |
| 9 | edge | Délai dépassé après l'écriture : l'écran annonce une panne alors que c'est enregistré | low | Rare ; un nouvel enregistrement redonne les mêmes valeurs ; la correction ajoute une relecture | rejeté |
| 10 | blind + edge | Les longueurs maximales ne sont vérifiées que par l'application, pas par la base | low | Seul un administrateur, en contournant l'écran, pourrait les dépasser ; A3 le signale ensuite sous le champ | rejeté |
| 11 | blind | `auth.uid()` vide passe pour l'installation : un jeton `authenticated` sans `sub` sauterait le contrôle | low | Supabase met toujours `sub` dans un jeton `authenticated`, et `anon` n'a pas le droit d'exécuter | rejeté |
| 12 | blind | Un enregistrement sans changement écrit quand même au journal et met à jour la date | low | C'est sans tort : le journal dit qui a enregistré, et quand | rejeté |
| 13 | blind | Le journal ne dit pas quels champs ont changé | low | Le PRD demande l'auteur, la date et l'heure, ce que le journal donne | rejeté |
| 14 | blind | La garde lit l'email à chaque requête, et refuse un profil sans email | false | La colonne est `not null` : le refus n'arrive jamais ; une colonne de plus dans la même lecture | rejeté |
| 15 | blind | `NV202` et `DELAI_MS` sont recopiés et importés comme ailleurs | low | Même usage que les lectures et actions existantes ; aucun tort nommé | rejeté |
| 16 | blind | Le titre de l'onglet est neutre (« Administration ») | false | Choix voulu, comme A1 et A2 : le titre s'affiche aussi au-dessus de S1 | rejeté |

## Design Notes

`auth.uid()` vide signifie un appel par la clé secrète (installation), puisque `anon` n'a pas le droit d'exécuter la fonction. Avec une session, la fonction refait le contrôle administrateur. On garde ainsi un seul chemin d'écriture (AD-2), sans ouvrir la clé secrète à l'écran A3 (AD-9).

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.

**Manual checks:**
- `npm run dev` : les trois critères, avec le compte administrateur, P1 et P2 dans un autre onglet.
