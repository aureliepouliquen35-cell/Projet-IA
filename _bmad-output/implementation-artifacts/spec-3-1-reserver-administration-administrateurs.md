---
title: 'Story 3.1 — Réserver l''administration aux administrateurs'
type: 'feature'
created: '2026-11-24'
status: 'done'
baseline_commit: 'f3d21ac35e26054af3df6205cb8ae457f8324fe4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'espace interne n'a aucune section d'administration : l'administrateur ne peut pas voir les comptes, et rien ne garantit encore qu'un collaborateur serait refusé s'il tapait l'adresse d'une page réservée (FR-24, RM-7).

**Approach:** Ajouter au menu latéral une section « Administration » avec l'élément « Comptes », visible des seuls administrateurs. Créer la page A1 `/admin/comptes` qui affiche le tableau des comptes (Nom · Email · Rôle · État). La protection est vérifiée trois fois (AD-7, AD-9) : par `exigerAdministrateur()` dans la page, dans la lecture et dans la fonction SQL. Un collaborateur qui force l'adresse voit l'écran S1 « Accès refusé. Cette page est réservée aux administrateurs. » avec « Retour aux demandes ».

## Boundaries & Constraints

**Always:** le rôle est relu dans `profils` à chaque requête, jamais dans les métadonnées Supabase (AD-7) ; lecture par une fonction SQL `security definer`, `search_path = ''`, exécutable par `authenticated` seul, qui vérifie elle-même que l'appelant est un administrateur actif (AD-9) ; nouvelle migration, anciennes intactes (AD-16) ; panne de lecture journalisée avec un code court, sans donnée personnelle (AD-12, AD-13), et affichée « Impossible de charger les comptes. » + « Réessayer » ; squelette du tableau après 300 ms ; badge gris *Désactivé* toujours écrit, « Actif » en texte ; textes exacts d'EXPERIENCE.md ; accessibilité (vrai tableau avec en-têtes, élément actif du menu avec `aria-current`, focus visible) ; test RM-7 dans `tests/regles/`.

**Never:** bouton « Créer un compte » et colonne « Actions » (Modifier, Réinitialiser, Désactiver/Réactiver : stories 3.2 à 3.5) ; éléments « Catégories », « Informations générales », « Données personnelles » dans le menu (epics 4 et 6) ; fonction expérimentale `forbidden()` de Next.js ; lecture directe de la table `profils` ; mot de passe ou empreinte renvoyés par la lecture ; protection des pages d'essai (report existant) ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Administrateur | ouvre le menu puis « Comptes » | section « Administration » › « Comptes » (actif sur `/admin/comptes`) ; tableau de tous les comptes, désactivés compris, triés par nom | N/A |
| Collaborateur, menu | n'importe quelle page interne | aucune section, aucun lien ni bouton d'administration | N/A |
| Collaborateur, adresse forcée | `/admin/comptes` | écran S1 dans l'espace interne, menu gardé, aucune donnée de compte dans la réponse (`/admin` seul n'est pas une page : S2, comme toute adresse inconnue) | N/A |
| Sans session | `/admin/comptes` | renvoi vers la connexion (déjà fait par le proxy) | N/A |
| Appel SQL direct | collaborateur appelle `lister_comptes` avec sa session | refus (code NV202) | N/A |
| Panne | base injoignable ou réponse inattendue | « Impossible de charger les comptes. » + « Réessayer » | journalisée (code court) |

## Decisions

- Pour l'instant, le menu « Administration » ne contient que « Comptes ». Les autres éléments arriveront avec leurs stories.
- Ni bouton ni colonne d'actions dans A1 tant que les stories 3.2 à 3.5 ne sont pas faites.
- S1 est affiché par la page elle-même, à la même adresse. On n'utilise pas la fonction `forbidden()` de Next.js, encore expérimentale.
- Fiche gardée entière (environ 2 300 tokens), et migration appliquée sur dev : validé par Aurel le 2026-11-24.

</frozen-after-approval>

## Code Map

- `src/server/garde/index.ts` -- `lireUtilisateur` (cache par requête), `exigerUtilisateur` : y ajouter `exigerAdministrateur()`.
- `src/components/interne/menu-lateral.tsx:59` -- emplacement prévu de la section Administration ; modèle `<Suspense>` + `LienMenu`/`VueLienMenu` ; la lecture du rôle passe par les cookies (`connection()` puis garde).
- `src/components/interne/lien-menu.tsx` -- `estActif` (actif sur `/admin/comptes`).
- `src/shared/acces.ts` -- `PREFIXES_INTERNES` contient déjà `/admin` (proxy, connexion, cache interdit) : ajouter `ADRESSE_COMPTES = "/admin/comptes"`.
- `src/server/lectures/demandes.ts` -- modèle de lecture : `lire()` (journalisation, `unstable_rethrow`), Zod, `DELAI_MS`, `reponseInattendue`.
- `supabase/migrations/20261120230000_liste_demandes.sql:58-95` -- modèle de `exiger_utilisateur_interne` (NV201) ; codes NV déjà pris : 001-002, 101-106, 201, 301-302, 401.
- `src/components/interne/tableau-demandes.tsx`, `etat-liste.tsx`, `bouton-reessayer.tsx`, `badge-statut.tsx` -- styles du tableau, de l'erreur et du squelette à reprendre.
- `src/components/ecran-erreur.tsx`, `src/app/(interne)/demandes/[reference]/not-found.tsx` -- modèle d'écran interne avec « Retour aux demandes » (`MESSAGES_*.retourAuxDemandes`, messages.ts:304).
- `src/shared/constantes.ts:72` -- `LIBELLES_ROLES` (à réutiliser) ; `globals.css` -- `inactive-bg`/`inactive-fg`.
- `tests/aides/supabase-connexion.ts` -- simulation RPC à étendre (`lister_comptes`) ; `tests/liste/menu-lateral.test.tsx`, `tests/connexion/proxy.test.ts` (déjà `/admin/comptes`), `tests/e2e/*` (modèles).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261124160000_comptes_administration.sql` -- `exiger_administrateur()` (profil actif, mot de passe choisi, rôle `administrateur`, sinon NV202 ; exécutable par personne) ; `lister_comptes()` → jsonb `[{id, nom, email, role, actif}]` trié par nom puis email ; droits `authenticated` seul.
- [x] `src/server/garde/index.ts` -- `exigerAdministrateur()` : `exigerUtilisateur()` puis l'utilisateur s'il est administrateur, sinon `null`.
- [x] `src/server/lectures/comptes.ts` -- `lireComptes()` : garde administrateur, RPC, contrôle Zod, panne → `{ ok: false }`.
- [x] `src/shared/acces.ts`, `src/shared/messages.ts` -- adresse et textes (Administration, Comptes, en-têtes, Actif, Désactivé, erreur, S1).
- [x] `src/components/interne/menu-lateral.tsx` (+ `section-administration.tsx`) -- titre de section et lien « Comptes » (icône `Users`), rendus seulement pour un administrateur, sous `<Suspense fallback={null}>`.
- [x] `src/components/interne/tableau-comptes.tsx`, `src/components/ecran-acces-refuse.tsx` -- tableau A1 (badge *Désactivé*), état d'erreur, squelette ; écran S1.
- [x] `src/app/(interne)/admin/comptes/page.tsx` (+ `contenu-comptes.tsx`) -- titre « Comptes » ; contenu sous `<Suspense>` : S1 si non administrateur, sinon tableau ou erreur.
- [x] `tests/regles/rm-07-administration-reservee.test.ts`, `tests/comptes/*`, `tests/e2e/administration.spec.ts` -- matrice ci-dessus (garde, lecture, SQL par texte, rendu menu/A1/S1, e2e : collaborateur sans section et S1 à l'adresse forcée).

**Acceptance Criteria:**
- Given que je suis administrateur, when j'ouvre le menu, then je vois la section « Administration » et, dans « Comptes », la liste des comptes avec nom, email, rôle et état.
- Given que je suis collaborateur, when j'ouvre le menu, then je ne vois aucune section ni aucun bouton d'administration.
- Given que je suis collaborateur, when je tape directement l'adresse de la page « Comptes », then je vois l'écran « Accès refusé. Cette page est réservée aux administrateurs. »

## Implementation Notes

- Agent de codage : `lire` exporté de `src/server/lectures/demandes.ts` pour réutiliser la journalisation ; `lireComptes()` renvoie `{ ok: false, accesRefuse: true }` pour un collaborateur (aucun appel à la base) et pour un refus NV202 de la base (rôle retiré entre-temps), affiché S1 sans journalisation ; tri SQL par `normaliser_recherche(nom)`, puis nom, puis email ; titre visible « Comptes » rendu après la vérification du rôle (un collaborateur ne le voit pas au-dessus de S1) ; titre de la section du menu réservé aux lecteurs d'écran sous 1 024 px.
- `db push` refusé à l'agent de codage (permission) ; appliqué sur dev par l'agent principal le 2026-11-24 avec l'accord d'Aurel : 15 migrations, la dernière `20261124160000` présente côté « remote » (projet `aodcgbzapnruciesaycg`).
- **Avant toute mise en ligne** : appliquer cette migration sur la base de prod avant le code (sinon la page « Comptes » affiche « Impossible de charger les comptes. »).
- Vérifications de l'agent de codage : lint, `tsc`, build sans erreur ; 83 fichiers / 1 575 tests Vitest verts ; `tests/e2e/administration.spec.ts` vert sur dev (côté collaborateur). Le côté administrateur n'a pas d'identifiants de test automatisés : vérification à l'écran.

- Après relecture (5 corrections) : titre d'onglet neutre « Administration — Nova Services » ; étape e2e qui appelle la vraie `lister_comptes` avec la session du collaborateur (refus NV202) ; commentaires corrigés ; texte inutilisé retiré.
- Vérifications de l'agent principal (2026-11-24) : lint, `tsc`, build sans erreur ; 83 fichiers / 1 575 tests Vitest verts ; `npm run test:e2e` sur dev : 7 réussis. Deux reports dans `deferred-work.md` (e2e administrateur, menu après rétrogradation pour la 3.3).
- Vérifié à l'écran par Aurel le 24 nov. 2026 : tous les critères sont bons ; commit ensuite.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif | Refus NV202 de `lister_comptes` jamais exécuté sur la vraie base (simulation seulement ; l'e2e collaborateur n'appelle pas la fonction) | medium | Écart pré-vérifié ; migration désormais appliquée sur dev | patch (étape e2e + nom du test unitaire) |
| 2 | verif + blind | Côté administrateur (section du menu, tableau) sans test exécuté de bout en bout | medium | Vérifié : `MenuLateral` rendu statique ne montre que le repli `null` ; aucun identifiant administrateur pour l'e2e | defer |
| 3 | blind + edge | Commentaire : un administrateur rétrogradé ne verrait plus la section « à sa prochaine action », alors que le menu (layout) n'est pas relu à la navigation | low | Vérifié (`menu-lateral.tsx`, « Le menu n'est pas relu… ») ; correction de commentaire ; le comportement relève de la 3.3 (FR-22) | patch + defer (3.3) |
| 4 | blind | « Vérifié trois fois » : la 2e garde applicative lit le même `cache` | false | Le commentaire attribue « rôle retiré entre-temps » au refus SQL, ce qui est exact ; la garde de `lireComptes` protège les autres appelants | rejeté |
| 5 | blind + edge | Titre d'onglet « Comptes » au-dessus de S1 pour un collaborateur | low | Vérifié : `metadata` statique ; correction directe | patch |
| 6 | blind | `MESSAGES_COMPTES.reessayer` inutilisé | low | Vérifié ; suppression directe | patch |
| 7 | blind | `EtatComptesErreur` recopie `EtatListeErreur` | low | Réel, mais la correction est une refonte | rejeté |
| 8 | blind | `lire`, `DELAI_MS` empruntés à `lectures/demandes.ts` | low | Aucun tort concret ; refonte | rejeté |
| 9 | blind | `null` comme signal de refus dans `lire` | low | Un seul chemin renvoie `null` ; refonte | rejeté |
| 10 | blind + verif + edge | Simulation : email repris du compte Auth si le profil n'en a pas | low | Réel, sans effet sur ce que la story affiche ; correction qui touche les jeux d'essai d'autres stories | rejeté |
| 11 | blind + edge | Ordre en cas d'homonymes non testé ; tri JS ≠ collation Postgres | low | Cas rare ; ajouter un test ou une collation dépasse la correction directe | rejeté |
| 12 | blind | `exiger_administrateur` répète la condition « utilisateur interne actif » | low | Réel, sans tort présent ; refonte SQL | rejeté |
| 13 | blind | Tests sur la forme du code source | low | Schéma habituel du dépôt (pas de DOM dans Vitest) | rejeté |
| 14 | blind | Commentaire de `menu-lateral.tsx` mal coupé | low | Vérifié ; correction directe | patch |
| 15 | edge | Administrateur désactivé entre la garde et l'appel SQL : S1 au lieu de la connexion | low | Fenêtre de quelques millisecondes dans une même requête ; la requête suivante renvoie à la connexion | rejeté |
| 16 | edge | Le test RM-7 ne repérerait pas une future page d'administration sans `contenu-*.tsx` | low | Hypothétique ; garde-fou supplémentaire | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` (projet dev `aodcgbzapnruciesaycg`, avec l'accord d'Aurel) puis `migration list --remote` -- expected: 15 migrations.
- `npm run test:e2e` -- expected: parcours verts sur dev.

**Manual checks:**
- `npm run dev` : les trois critères, avec le compte administrateur puis le compte collaborateur de test.
