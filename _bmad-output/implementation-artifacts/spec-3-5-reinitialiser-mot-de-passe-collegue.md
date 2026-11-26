---
title: 'Story 3.5 — Réinitialiser le mot de passe d''un collègue'
type: 'feature'
created: '2026-11-25'
status: 'done'
baseline_commit: '3dcf5ae61a118a4a3bb31e52fa89a1da66bc38f8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un collègue qui a oublié son mot de passe ne peut pas retrouver l'accès : A1 n'a pas d'action « Réinitialiser le mot de passe », et rien ne remet un mot de passe temporaire avec obligation de le changer (FR-23, AD-6).

**Approach:** Nouvelle migration `reinitialiser_mdp` (auteur revérifié, `doit_changer_mdp = vrai`, empreinte du temporaire remplacée) ; `src/server/admin` y passe puis change le mot de passe dans Supabase Auth ; une Server Function réservée aux administrateurs ; bouton « Réinitialiser le mot de passe » sur chaque ligne d'A1, avec sa fenêtre (champ + « Générer »), puis affichage unique avec « Copier ». La connexion (« Identifiants incorrects ») et le renvoi vers I2 existent déjà.

## Boundaries & Constraints

**Always:** `exigerAdministrateur()` en premier (sinon `ACCES_REFUSE`, rien n'est appelé) ; fonction SQL `security definer`, `search_path = ''`, `revoke … from public/anon/authenticated`, exécutable par `service_role` seul, qui revérifie que l'auteur est un administrateur actif au mot de passe choisi ; empreinte bcrypt (`extensions.crypt`), jamais le mot de passe en clair ni dans le journal, ni dans la réponse du serveur ; `mot_de_passe_reinitialise` au journal (compte_id, email, auteur) ; textes exacts d'EXPERIENCE.md (A1) ; 12 caractères minimum (schéma partagé, même règle que la création) ; fenêtre 440 px, Échap ferme, pas de fermeture pendant l'envoi ni par clic à côté ; un seul envoi par double clic ; nouvelle migration, anciennes intactes (AD-16).

**Never:** bouton « Modifier » (story 3.3) ; lien « Mot de passe oublié » (epic 7) ; envoi d'email ; clé secrète hors de `src/server/admin` ; mot de passe dans l'adresse, le stockage du navigateur ou la réponse ; réactivation implicite d'un compte désactivé ; réinitialisation de vrais comptes par les tests automatiques sur dev ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Réinitialiser | « Réinitialiser le mot de passe » sur Lucas, « Générer », valider | mot de passe affiché une fois avec « Copier » (puis « Copié »), bouton « Fermer », toast « Mot de passe réinitialisé » | N/A |
| Ancien mot de passe | Lucas essaie l'ancien | « Identifiants incorrects » (Auth, déjà en place) | N/A |
| Nouveau temporaire | Lucas se connecte avec | I2 avant toute autre page ; le temporaire y est refusé (déjà en place) | N/A |
| Lucas déjà connecté | session ouverte pendant la réinitialisation | à sa prochaine page, renvoi vers I2 (proxy, déjà en place) | N/A |
| Trop court | moins de 12 caractères | « 12 caractères minimum » sous le champ, rien n'est envoyé | N/A |
| Soi-même | l'administrateur réinitialise son propre compte | mot de passe affiché ; à sa prochaine page, I2 | N/A |
| Compte désactivé | réinitialisation sur un compte *Désactivé* | permise ; le compte reste désactivé et bloqué | N/A |
| Panne | base ou Auth injoignable | encadré « Le mot de passe n'a pas pu être réinitialisé. Réessayez. », saisie gardée | code court au journal ; base d'abord, donc au pire l'ancien mot de passe marche encore et doit être changé |
| Collaborateur | appelle l'action directement | `ACCES_REFUSE`, aucun appel | N/A |

## Decisions

- `reinitialiser_mdp(p_auteur uuid, p_compte uuid, p_mdp_temporaire text)` → jsonb `{nom, email}`. Codes : NV202 (auteur), NV204 (compte introuvable), NV205 (moins de 12 caractères). Verrouille le profil, met `doit_changer_mdp = vrai`, remplace la ligne de `mdp_temporaires` (`on conflict … do update`).
- Ordre : base d'abord, puis `auth.admin.updateUserById(id, { password })`. Si Auth échoue, pas de retour arrière : l'ancien mot de passe marche encore, la personne devra le changer ; un nouvel essai répare. (Auth d'abord laisserait un temporaire utilisable sans obligation de le changer.)
- Pas de `refresh()` : le tableau ne change pas, et la fenêtre (mot de passe affiché) reste ouverte même pour soi-même.
- Fenêtre : titre « Réinitialiser le mot de passe de Lucas Bernard », champ « Nouveau mot de passe temporaire * » + « Générer », texte de l'UX avec le premier mot du nom ; boutons « Annuler » et « Réinitialiser » (« Réinitialisation… » pendant l'envoi) ; sélection sur le champ à l'ouverture, sur « Copier » après.
- Toast « Mot de passe réinitialisé » après réussite, « comme à la création ».
- Migration appliquée sur la base dev `aodcgbzapnruciesaycg` (accord d'Aurel, 2026-11-25), jamais sur prod dans cette story.
- Fiche approuvée telle quelle par Aurel le 2026-11-25 (bouton sur chaque ligne, « Réinitialiser », toast).

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261125090000_desactiver_compte.sql` -- modèle (en-tête, vérification de l'auteur NV202, droits). Nouvelle `20261125120000_reinitialiser_mot_de_passe.sql`. Codes NV pris : 001-002, 101-106, 201-204.
- `supabase/migrations/20261120090000_comptes.sql:73-160` -- `mdp_temporaires` (clé `profil_id`, contrainte `$2_$%`), insertion de l'empreinte dans `creer_profil`.
- `supabase/migrations/20261120200000_mot_de_passe.sql` -- `terminer_changement_mdp` efface l'empreinte ; NV106 déjà géré si réinitialisé entre-temps (`src/server/connexion/index.ts:241`). Ne pas modifier.
- `src/server/admin/index.ts` -- `clientSecret()`, `erreurImprevue()`, `echecValidation`, `DELAI_MS` : ajouter `reinitialiserMotDePasse(saisie, { auteur })` (Zod, rpc, `updateUserById`, `weak_password` → VALIDATION, journal).
- `src/server/actions/creer-compte.ts`, `changer-etat-compte.ts`, `enveloppe.ts` -- modèle de la Server Function (`executerAction`, remplacement d'`ERREUR_INTERNE` par le message de l'écran, clés absentes journalisées).
- `src/shared/schemas/compte.ts` -- réutiliser la règle `motDePasseTemporaire` et `FORME_IDENTIFIANT` : schéma `{ compteId, motDePasseTemporaire }`.
- `src/shared/messages.ts:66,183` -- `MESSAGES_COMPTE.reinitialisationImpossible` ; `MESSAGES_COMPTES.reinitialisation` (bouton, nom accessible, titre, champ, texte, boutons, toast).
- `src/components/interne/creer-compte.tsx` -- modèle à suivre (réducteur, verrou d'envoi, `CompteCreeAffiche`, Copier, aides pures exportées) ; `genererMotDePasseTemporaire` de `src/shared/mot-de-passe-temporaire`. Nouveau `reinitialiser-mot-de-passe.tsx`.
- `src/components/interne/tableau-comptes.tsx:62-64`, `etat-compte.tsx` (`premierMot`, bouton `secondaire`) -- ajouter le bouton dans la colonne Actions, à côté de `EtatCompte`.
- Tests : `tests/aides/supabase-connexion.ts` (simulation : `updateUserById`, rpc), `tests/comptes/*` (migration lue en texte, action, écran en `renderToStaticMarkup`), `tests/regles/rm-07-administration-reservee.test.ts` ; e2e `administration.spec.ts` (refus `42501` pour le collaborateur).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261125120000_reinitialiser_mot_de_passe.sql` -- `reinitialiser_mdp` (voir Decisions).
- [x] `src/shared/schemas/compte.ts`, `src/shared/messages.ts` -- schéma et textes.
- [x] `src/server/admin/index.ts` -- `reinitialiserMotDePasse` ; `ACCES_REFUSE` pour NV202, `INTROUVABLE` pour NV204, `VALIDATION` pour NV205.
- [x] `src/server/actions/reinitialiser-mot-de-passe.ts` -- `actionReinitialiserMotDePasse(saisie)`, réponse sans mot de passe.
- [x] `src/components/interne/reinitialiser-mot-de-passe.tsx` (nouveau), `tableau-comptes.tsx` -- bouton, fenêtre, affichage unique.
- [x] `tests/comptes/migration-reinitialiser-mot-de-passe.test.ts`, `reinitialiser-mot-de-passe.test.ts`, `reinitialiser-mot-de-passe-ecran.test.tsx`, compléments RM-7 et e2e -- la matrice.

**Acceptance Criteria:**
- Given la fenêtre « Réinitialiser le mot de passe de … », when je valide un nouveau mot de passe temporaire, then il s'affiche une seule fois avec « Copier ».
- Given cette réinitialisation, when le collègue essaie son ancien mot de passe, then il reçoit « Identifiants incorrects ».
- Given le nouveau mot de passe temporaire, when il se connecte, then il doit choisir un nouveau mot de passe avant toute autre page.

## Implementation Notes

- Verrou : `reinitialiser_mdp` ne verrouille que la ligne du compte visé (`for update`) ; l'auteur est relu sans verrou. Un seul verrou, donc aucun interblocage possible avec `modifier_compte` (qui verrouille toutes les lignes administrateur puis le compte) ni avec `terminer_changement_mdp`.
- Ordre des refus dans la base : 22004 (paramètre absent), NV202 (auteur), NV205 (longueur), NV204 (compte). `actif` et `role` ne sont jamais écrits : un compte désactivé le reste (et reste bloqué dans Auth, `updateUserById` ne reçoit que `password`).
- Écart assumé : `same_password` renvoyé par Auth est lu comme une réussite (le mot de passe voulu est déjà en place). `weak_password` → `VALIDATION` « 12 caractères minimum » comme le prévoit la fiche ; la base a déjà été écrite à ce moment-là (drapeau vrai, nouvelle empreinte), donc l'ancien mot de passe marche encore mais oblige à passer par I2, comme pour une panne d'Auth.
- Nouveau texte hors UX, pour un appel direct mal formé seulement : `MESSAGES_COMPTE.compteInvalide` (« Le compte demandé n'est pas valide. »).
- Fenêtre : `Dialog` (440 px, Échap, pas de clic à côté, pas de fermeture pendant l'envoi) ; texte de l'UX en `DialogDescription`, gardé aussi pendant l'affichage du mot de passe. Sélection : champ à l'ouverture et après un refus, encadré après une panne, « Copier » après la réussite. Une redirection de la Server Function (session terminée) est relancée côté navigateur (`unstable_rethrow`), comme en 3.4.
- Tests anciens ajustés : `migration-mot-de-passe.test.ts` (filtre `_mot_de_passe.sql` qui attrapait aussi la nouvelle migration → nom exact), exclusivité de NV202 / NV204 (`migration-comptes-administration`, `migration-desactiver-compte` : la nouvelle fonction les reprend avec le même sens), `ecran-comptes.test.tsx` (deux boutons par ligne).
- `db push` sur dev refusé à l'agent de codage (permission), comme en 3.4 : la migration n'est **pas** appliquée sur `aodcgbzapnruciesaycg`. Le nouvel e2e (`reinitialiser_mdp` refusée en `42501` au collaborateur) n'a donc pas été lancé.
- Migration appliquée sur dev par l'agent principal le 2026-11-25 (accord d'Aurel donné à la fiche) : 17 migrations, `20261125120000` présente côté « remote » (projet `aodcgbzapnruciesaycg`).
- **Avant toute mise en ligne** : appliquer cette migration sur la base de prod avant le code.
- Après relecture (2 corrections, 11 constats rejetés, 4 reports) : fermeture de la fenêtre sortie en aide testée ; « Accès refusé » au lieu de « Réessayez » pour un administrateur refusé.
- Vérifications de l'agent principal (2026-11-25) : lint, `tsc`, build sans erreur ; 92 fichiers / 1 857 tests Vitest verts ; `administration.spec.ts` (4 tests e2e) vert sur dev. Pas de commit : Aurel vérifie d'abord à l'écran.
- Vérifié à l'écran par Aurel le 2026-11-26 : les 9 points de contrôle sont bons.
- Correction hors story, faite pendant la vérification (commit séparé) : la connexion I1 plantait en développement (« Blocking Route », `Date.now()` pendant la préparation de la page) quand un message « session expirée / terminée » était à afficher. `await connection()` est ajouté avant la lecture du cookie dans `message-connexion.tsx`, et de même dans `confirmation/page.tsx`, qui avait le même défaut.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif | Fermeture de la fenêtre (oubli du mot de passe affiché, refus pendant l'envoi) non testée : écrite en ligne dans le composant | medium | Pré-vérifié : seuls le réducteur et l'aide sont testés ; la 3.4 a sorti et testé `changerOuvertureEtat` | patch |
| 2 | verif | Le corps réel de `reinitialiser_mdp` n'est jamais exécuté par un test (texte SQL et simulation seulement) | medium | Pré-vérifié ; pas de Postgres local, et la fiche interdit de réinitialiser de vrais comptes sur dev | defer |
| 3 | blind | `ACCES_REFUSE` affiché « n'a pas pu être réinitialisé. Réessayez. » : un nouvel essai échouera toujours | low | Vérifié : `actionApresReponseReinitialisation` ; la 3.4 montre le message d'accès refusé ; atteignable avec la 3.3 (rétrogradation) | patch |
| 4 | blind | Les sessions déjà ouvertes du collègue restent valides ; sur I2, elles choisissent un mot de passe sans connaître le temporaire | medium | Vérifié : rien ne ferme les sessions ; comportement décidé dans la fiche (ligne « Lucas déjà connecté »), gênant seulement si le compte est piraté | defer |
| 5 | blind + edge | Choix du mot de passe par le collègue entre l'étape base et l'étape Auth : temporaire actif sans obligation de le changer | low | Réel en théorie ; fenêtre de quelques millisecondes, impossible à la main ; correction lourde | rejeté |
| 6 | edge | Deux administrateurs réinitialisent le même compte au même instant, étapes entrelacées | low | Même course que le n° 13 de la 3.4 ; un nouvel essai répare | rejeté |
| 7 | edge | Auteur relu sans verrou pendant une désactivation simultanée | low | Négligeable (même milliseconde) ; migration déjà appliquée sur dev | rejeté |
| 8 | blind + edge | `weak_password` d'Auth : « 12 caractères minimum » peut être faux, et l'état partiel n'est pas journalisé | false | `supabase/config.toml:187-190` : seule règle, 12 caractères, déjà vérifiée par le schéma avant tout appel | rejeté |
| 9 | edge | Mot de passe temporaire de plus de 72 octets : base écrite puis refus d'Auth, panne à chaque essai | low | Vérifié ; la règle vient du schéma de création (story 3.2), commune aux deux | defer |
| 10 | edge | `updateUserById` sans délai maximal : la fenêtre peut rester bloquée | low | Vérifié ; même manque dans toute l'administration (création, désactivation) | defer |
| 11 | blind | Sélection ratée après un refus du serveur (champ encore figé) | low | Chemin pratiquement inatteignable : le navigateur vérifie la même règle avant l'envoi | rejeté |
| 12 | blind | « Copier » sans message si le presse-papiers est refusé | low | Même comportement qu'à la création ; le mot de passe reste affiché | rejeté |
| 13 | blind | Texte à la troisième personne quand on se réinitialise soi-même | low | Texte imposé par l'UX (même choix qu'en 3.4, n° 16) | rejeté |
| 14 | blind | Repli « clés absentes » copié dans trois Server Functions | low | Aucun tort nommé ; factoriser toucherait les stories 3.2 et 3.4 | rejeté |
| 15 | blind | Réponse de succès non lue par l'écran (identifiant, nom, email) | low | Sans effet : l'administrateur voit déjà ces informations dans le tableau | rejeté |
| 16 | blind | Encadré de panne gardé pendant la saisie d'un autre mot de passe | low | Même comportement qu'à la création ; effacé au nouvel envoi | rejeté |
| 17 | blind | Autres manques de tests (fenêtre réelle, 22004 simulé, refus `anon` en e2e) | low | Pas de navigateur simulé dans le projet (Vitest en `node`) ; la fermeture est couverte par le n° 1 | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `migration list --remote` (dev, si accepté) -- expected: 17 migrations.

**Manual checks:**
- `npm run dev` : les trois critères avec le compte administrateur et un compte de test.
