---
title: 'Story 3.3 — Modifier le nom ou le rôle d''un compte'
type: 'feature'
created: '2026-11-26'
status: 'done'
baseline_commit: '1e49436b03a6b2d3fde929d97ef91376079bd36e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'administrateur ne peut ni corriger le nom d'un collègue ni changer son rôle : A1 n'a pas de bouton « Modifier », `modifier_compte` ne sait que désactiver/réactiver, et un administrateur rétrogradé garde la section Administration de son menu jusqu'au prochain rafraîchissement (report de la 3.1) (FR-22, FR-25, RM-9).

**Approach:** Nouvelle migration qui remplace `modifier_compte` par une version qui sait aussi changer le nom et le rôle, avec la même règle du dernier administrateur ; `modifierCompte` dans `src/server/admin` ; une Server Function réservée ; bouton « Modifier » (premier de la colonne Actions) et sa fenêtre. Pour la « prochaine action » : toute action d'administration refusée (`ACCES_REFUSE`) recharge la page (S1, menu à jour), et le menu se recharge à la navigation quand le rôle a changé.

## Boundaries & Constraints

**Always:** `exigerAdministrateur()` en premier (sinon `ACCES_REFUSE`, rien n'est appelé) ; `modifier_compte` `security definer`, `search_path = ''`, `revoke … from public/anon/authenticated`, `service_role` seul, auteur revérifié (NV202), même verrou (toutes les lignes administrateur triées par id) ; règle du dernier administrateur actif tenue par la base, y compris sur soi-même et face à deux administrateurs simultanés ; message exact « Impossible : il doit rester au moins un administrateur actif. » et rien ne change ; seuls le nom et le rôle sont modifiables, l'email est affiché en texte ; rôle toujours relu dans `profils` (AD-7) ; `role_modifie` au journal (compte_id, email, ancien_role, nouveau_role, auteur) ; textes exacts d'EXPERIENCE.md (« Modifier », « Enregistrer », toast « Compte modifié ») ; mêmes règles du nom qu'à la création (schéma partagé) ; fenêtre 440 px, Échap ferme, pas de fermeture pendant l'envoi ni par clic à côté, un seul envoi par double clic ; nouvelle migration, anciennes intactes (AD-16) ; la désactivation/réactivation (3.4) continue de marcher sans changement visible.

**Never:** modification de l'email ; signal de rôle côté navigateur utilisé comme protection ou lu par le serveur ; changement visuel des autres actions d'A1 ; envoi d'email ; clé secrète hors de `src/server/admin` ; modification de vrais comptes par les tests automatiques sur dev ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Corriger le nom | « Modifier » sur Lucas, nom changé, « Enregistrer » | fenêtre fermée, toast « Compte modifié », tableau à jour (et nom à jour dans l'historique, qui le lit dans `profils`) | N/A |
| Changer le rôle | Collaborateur → Administrateur, ou l'inverse avec un autre administrateur actif | tableau à jour, `role_modifie` au journal | N/A |
| Rien changé | « Enregistrer » sans modification | toast « Compte modifié », rien écrit, rien au journal | N/A |
| Dernier administrateur | seul administrateur actif passé en Collaborateur (soi ou autre) | message exact dans la fenêtre, qui reste ouverte ; rien ne change | N/A |
| Simultané | A rétrograde B pendant que B rétrograde A | un seul réussit ; l'autre reçoit le message exact ou « Accès refusé » | N/A |
| Se rétrograder | deux administrateurs actifs, je me passe Collaborateur | toast « Compte modifié », puis S1 à la place d'A1 et plus de section Administration | N/A |
| Rétrogradé, navigation | B rétrogradé par A, B change de page | la section Administration disparaît ; page d'administration → S1 ; autres pages normales | N/A |
| Rétrogradé, action | B, encore sur A1, lance une action d'administration | « Accès refusé », puis S1 et menu sans Administration | N/A |
| Compte désactivé | modification d'un compte *Désactivé* | permise ; il reste désactivé (la règle ne compte que les administrateurs actifs) | N/A |
| Nom invalide | vide ou plus de 100 caractères | message sous le champ (textes de la création), rien n'est envoyé | N/A |
| Panne | base injoignable | encadré « Le compte n'a pas pu être modifié. Réessayez. », saisie gardée | code court au journal |
| Collaborateur | appelle l'action directement | `ACCES_REFUSE`, aucun appel | N/A |

## Decisions

- Migration `20261126090000_modifier_compte.sql` : `drop function public.modifier_compte(uuid, uuid, boolean)` puis `modifier_compte(p_auteur uuid, p_compte uuid, p_actif boolean default null, p_nom text default null, p_role text default null)` ; `null` = inchangé, au moins un des trois (sinon 22004). Renvoie `{nom, email, role, actif, change, ancien_role}`. Refus : NV202, NV203 (si le compte est un administrateur actif et ne le serait plus après l'appel, sans autre administrateur actif), NV204 ; nom ou rôle invalides heurtent les contraintes de `profils` (23514). Le module 3.4 l'appelle sans changement (paramètres nommés).
- Fenêtre : titre « Modifier le compte de Lucas Bernard » ; champs Nom * (prérempli) et Rôle * (liste, comme à la création) ; « Email » affiché en texte ; boutons « Annuler » et « Enregistrer » (« Enregistrement… » pendant l'envoi) ; sélection sur le champ Nom à l'ouverture.
- `ACCES_REFUSE` d'une action d'administration (création, désactivation/réactivation, réinitialisation, modification) : la Server Function appelle `refresh()` avant de répondre.
- Navigation : le proxy, qui lit déjà le profil à chaque page, lit aussi `role` et pose un petit cookie lisible par la page (`nova_role`, sans valeur secrète). Un composant du menu compare, à chaque changement d'adresse, ce cookie au rôle avec lequel le menu a été rendu ; s'ils diffèrent, il recharge le menu (`router.refresh()`). Simple signal d'affichage : la page, la garde et la base restent la protection.
- Rien n'est écrit au journal pour un simple changement de nom (FR-22 ne trace que les changements de rôle).
- Migration appliquée sur la base dev `aodcgbzapnruciesaycg` (accord d'Aurel, 2026-11-26), jamais sur prod dans cette story.
- Fiche gardée entière (environ 3 000 tokens) : approuvée par Aurel le 2026-11-26.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261125090000_desactiver_compte.sql` -- `modifier_compte` actuel (verrou, NV202-204, droits) : modèle à reprendre, ne pas modifier. `retablir_compte` inchangé. Codes NV pris : 001-002, 101-106, 201-205, 301-302, 401.
- `supabase/migrations/20261120090000_comptes.sql:44-52` -- contraintes `profils_nom_check` (non vide, 100 max) et `profils_role_check`.
- `src/server/admin/index.ts` -- `changerEtatCompte` (modèle : rpc, `REFUS_*`, `schemaModification` à élargir au nouveau retour, `erreurImprevue`, `echecValidation`, `DELAI_MS`) : ajouter `modifierCompte(saisie, { auteur })` → `CONFLIT` (NV203), `ACCES_REFUSE` (NV202), `INTROUVABLE` (NV204), `VALIDATION` (23514). Aucun appel à Auth.
- `src/shared/schemas/compte.ts` -- schéma `{ compteId, nom, role }` réutilisant `schemaCompte.shape.nom` / `.role` et `FORME_IDENTIFIANT`.
- `src/shared/messages.ts:66,190` -- `MESSAGES_COMPTE.modificationImpossible` ; `MESSAGES_COMPTES.modification` (bouton, nom accessible, titre, libellés, boutons, toast).
- `src/server/actions/changer-etat-compte.ts`, `reinitialiser-mot-de-passe.ts`, `creer-compte.ts`, `enveloppe.ts` -- modèle de la Server Function ; y ajouter `refresh()` avant le retour `ACCES_REFUSE`. Nouvelle `modifier-compte.ts` (réussite : `refresh()`).
- `src/components/interne/reinitialiser-mot-de-passe.tsx`, `creer-compte.tsx` (`Dialog`, réducteur, verrou d'envoi, `Champ`, `NativeSelect`, aides pures exportées), `etat-compte.tsx` (`premierMot`, `unstable_rethrow`) -- modèles. Nouveau `modifier-compte.tsx`.
- `src/components/interne/tableau-comptes.tsx:62-64` -- « Modifier » en premier dans Actions (le composant reçoit id, nom, email, rôle).
- `src/lib/supabase/proxy.ts` -- `lireProfil` : ajouter `role` ; poser `nova_role` sur les pages protégées passées (pas pour les Server Functions) ; mettre à jour le commentaire « Le proxy ne regarde pas le rôle ».
- `src/components/interne/section-administration.tsx`, `menu-lateral.tsx` -- rendre le composant client de suivi du rôle pour les deux rôles ; corriger les commentaires sur le menu non relu.
- Tests : `tests/aides/supabase-connexion.ts` (simulation rpc), `tests/comptes/*` (migration lue en texte, admin, action, écran en `renderToStaticMarkup`), `tests/regles/rm-09-dernier-administrateur.test.ts`, `rm-07-administration-reservee.test.ts`, `tests/connexion/proxy.test.ts`, e2e `tests/e2e/administration.spec.ts` (refus `42501` pour le collaborateur).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261126090000_modifier_compte.sql` -- nouvelle `modifier_compte` (voir Decisions) -- règle tenue par la base (AD-10).
- [x] `src/shared/schemas/compte.ts`, `src/shared/messages.ts` -- schéma et textes.
- [x] `src/server/admin/index.ts` -- `modifierCompte` ; `changerEtatCompte` lit le nouveau retour.
- [x] `src/server/actions/modifier-compte.ts` (nouveau) + `refresh()` sur `ACCES_REFUSE` dans les trois autres actions d'administration.
- [x] `src/components/interne/modifier-compte.tsx` (nouveau), `tableau-comptes.tsx` -- bouton et fenêtre.
- [x] `src/lib/supabase/proxy.ts`, `section-administration.tsx` (+ nouveau composant client de suivi) -- menu à jour à la navigation.
- [x] Tests de la matrice : migration (texte), `modifierCompte`, action, écran, aide de comparaison du rôle, proxy, RM-9 et RM-7, e2e.

**Acceptance Criteria:**
- Given la fenêtre « Modifier », when je change le nom ou le rôle, then la modification est enregistrée ; l'email est affiché mais ne peut pas être modifié.
- Given que je suis le seul administrateur actif, when j'essaie de me passer en collaborateur, then je lis « Impossible : il doit rester au moins un administrateur actif. » et rien ne change.
- Given un administrateur que je viens de passer en collaborateur, when il fait sa prochaine action, then la section Administration disparaît de son menu, et une page d'administration ouverte affiche « Accès refusé ».

## Implementation Notes

- `changerEtatCompte` lit la réponse de `modifier_compte` avec un schéma réduit (`nom`, `email`, `change`), commun à l'ancienne et à la nouvelle fonction : tant que la migration 3.3 n'est pas passée sur une base (prod), la désactivation y continue de marcher. `modifierCompte` exige la réponse complète (`role`, `actif`, `ancien_role`).
- `ACCES_REFUSE` venu de la base (NV202, auteur rétrogradé entre la garde et la fonction SQL) recharge aussi la page (`refresh()`), dans les actions de désactivation, de réinitialisation et de modification.
- `SuiviRole` (`src/components/interne/suivi-role.tsx`) : vérification à chaque changement d'adresse seulement (`useEffectEvent`), donc pas de boucle de rechargement ; sans cookie lisible, rien. Aides pures `lireCookieRole` et `roleAChange` dans `src/shared/acces.ts`.
- Refus 23514 de la base : champ déduit du nom de la contrainte (`profils_role_check` → Rôle, sinon Nom « trop long », le schéma partagé ayant déjà écarté le nom vide).
- Tests : `npm run test` doit être lancé depuis `C:\…` (lettre de lecteur en majuscule) ; depuis `c:\…`, Vitest 5 charge deux fois son exécuteur et toutes les suites échouent (« Cannot read properties of undefined (reading 'config') »).

- Agent principal (2026-11-26) : migration appliquée sur dev `aodcgbzapnruciesaycg` (18 migrations, `20261126090000` présente côté « remote ») ; le `db push` avait été refusé à l'agent de codage (permission).
- Agent principal : le test e2e attendait le cookie `nova_role` juste après la connexion ; or la page « Demandes » y est rendue dans la réponse de la Server Function, sans passer par le proxy. Vérification déplacée après `page.goto("/admin/comptes")`. Les échecs e2e d'abord observés venaient d'un ancien `next dev` (story 3.5) encore lancé, réutilisé par Playwright après un `next build` : arrêté et relancé.
- Après relecture (8 corrections, 4 reports, 9 rejets) : sélection qui sautait sur « Rôle » pendant la frappe du nom ; valeurs gardées pendant l'animation de fermeture ; `SuiviRole` écoute aussi le changement du cookie (`cookieStore`, si le navigateur le permet), ce qui couvre les filtres et une page affichée avant l'arrivée du cookie, et garde la vérification au changement de chemin en repli ; 23514 : seules `profils_nom_check` et `profils_role_check` donnent un message sous un champ, le reste est une panne ; `nova_role` effacé à la fin de session (désactivation, expiration) ; test de migration qui ne dépend plus du nombre de migrations ; commentaire de la fenêtre corrigé (S1 après un accès refusé). La session de l'agent de codage s'est interrompue en cours de correction : l'agent principal a fini les trois dernières (23514, cookie à la fin de session, test de migration).
- Sonde navigateur (dev, supprimée ensuite) : au changement d'adresse, `SuiviRole` lit déjà le cookie posé par la réponse de navigation (aucun rechargement en trop avec un cookie périmé contraire).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge | Après un nom refusé, la sélection saute sur « Rôle » dès qu'on retape le nom | medium | Vérifié : effet dépendant de `nomEnErreur`, qui passe à faux à la première lettre valide | patch |
| 2 | blind + edge | Recherche ou filtre seuls (adresse inchangée) : aucune comparaison du cookie ; en prod, l'adresse peut changer avant l'arrivée du cookie | medium | Vérifié : effet sur `usePathname()` seul ; la sonde dev est bonne, mais le préchargement de prod n'est pas couvert | patch (écoute `cookieStore`) |
| 3 | verif | Dépendance `[chemin]` de `SuiviRole` tenue seulement par une expression régulière | medium | Pré-vérifié : le faux `useEffect` ignore ses dépendances | patch |
| 4 | blind | Tout 23514 autre que le rôle affiché « nom trop long », sans trace | low | Vérifié ; correction directe | patch |
| 5 | blind + edge | `nova_role` gardé après la fin de session (expiration, compte désactivé) | low | Vérifié : seul `COOKIE_ACTIVITE` est effacé ; correction directe | patch |
| 6 | edge | Champs vidés pendant l'animation de fermeture de la fenêtre | low | Vérifié : `reussite` et `reinitialisation` remettent les valeurs vides | patch |
| 7 | blind | Commentaire : « Accès refusé. » dans la fenêtre, alors que `refresh()` montre S1 | low | Vérifié : la fenêtre disparaît avec A1 | patch (commentaire) |
| 8 | blind | Test de migration cassé par la prochaine migration (`at(-1)`, 18) | low | Vérifié ; suppression directe | patch |
| 9 | verif | Le vrai `modifier_compte` n'est exécuté par aucun test (texte SQL et simulation) | medium | Pré-vérifié ; pas de Postgres local ni de compte administrateur de test (même report qu'en 3.5) | defer |
| 10 | verif | Sélection après un refus (encadré, Nom, Rôle) non testée | low | Pré-vérifié ; Vitest en `node`, sans DOM (mêmes manques en 3.2 et 3.5) | defer |
| 11 | blind | Côté administrateur sans e2e (fenêtre, dernier administrateur, rétrogradation, menu) | medium | Vérifié ; report existant (identifiants administrateur de test) | defer |
| 12 | blind | `role_modifie` écrit hors de la transaction : perdu si le journal ou le délai échouent | low | Vérifié ; même modèle que création, désactivation, réinitialisation (`journaliser`, AD-13) | defer |
| 13 | edge | Deux administrateurs modifient le même compte : le dernier enregistrement l'emporte | low | Réel, rare ; correction qui change la règle d'envoi | rejeté |
| 14 | blind + edge | Rechargement en trop juste après la connexion si un ancien cookie dit l'autre rôle | low | Sans dommage (un rechargement) ; réduit par le n° 5 | rejeté |
| 15 | blind | Cookie renvoyé à chaque page protégée | low | Aucun tort nommé | rejeté |
| 16 | blind | Tests par expressions régulières sur le source | low | Usage déjà répandu dans le projet ; comportement aussi testé | rejeté |
| 17 | blind | Faux identifiant passé au schéma pour vérifier nom et rôle | low | Fonctionne ; purement cosmétique | rejeté |
| 18 | blind | Conversion de type non vérifiée dans le réducteur (rôle) | low | Valeur venue d'une liste fermée ; revérifiée par Zod et la base | rejeté |
| 19 | blind | Verrou de toutes les lignes administrateur pour un simple changement de nom | low | Négligeable pour quelques comptes | rejeté |
| 20 | blind | Nettoyage des espaces différent entre la simulation et la base | false | Zod nettoie avant l'envoi ; `btrim` ne trouve plus rien à retirer | rejeté |
| 21 | blind | Scénarios RM-9 répétés dans deux fichiers de test | low | Aucun tort nommé | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `migration list --remote` (dev, si accepté) -- expected: 18 migrations.

**Manual checks:**
- `npm run dev` : les trois critères avec le compte administrateur et un compte de test (deux navigateurs pour la rétrogradation).
