---
title: 'Story 3.4 — Désactiver ou réactiver un compte'
type: 'feature'
created: '2026-11-25'
status: 'done'
baseline_commit: '520fde20f7ec1123f760c76fd46cfb2030167029'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'administrateur ne peut pas couper l'accès d'une personne qui part, ni le lui rendre : A1 n'a aucune action, `modifier_compte` n'existe pas, et une session ouverte d'un compte désactivé revient à la connexion sans le message de l'UX (FR-22, FR-25, RM-9, RM-10).

**Approach:** Nouvelle migration `modifier_compte` (verrou des administrateurs, règle du dernier administrateur actif) ; `src/server/admin` y passe puis bloque ou débloque le compte dans Supabase Auth ; une Server Function réservée aux administrateurs ; colonne « Actions » d'A1 avec « Désactiver » (fenêtre de confirmation) ou « Réactiver » ; le proxy et la garde ferment la session d'un compte désactivé et montrent « Votre session a pris fin. Contactez votre administrateur si besoin. » sur I1.

## Boundaries & Constraints

**Always:** `exigerAdministrateur()` en premier (sinon `ACCES_REFUSE`, rien n'est appelé) ; `modifier_compte` `security definer`, `search_path = ''`, `revoke … from public`, exécutable par `service_role` seul, qui revérifie que l'auteur est un administrateur actif (NV202) ; règle tenue face à deux administrateurs simultanés, y compris sur son propre compte ; message exact « Impossible : il doit rester au moins un administrateur actif. » et rien ne change ; un compte n'est jamais supprimé ; `compte_desactive` / `compte_reactive` au journal (compte_id, email, auteur) ; textes exacts d'EXPERIENCE.md ; fenêtre de confirmation : sélection sur « Annuler », Échap ferme, bouton principal (pas danger) ; nouvelle migration, anciennes intactes (AD-16) ; tests RM-9 et RM-10 dans `tests/regles/`.

**Never:** boutons « Modifier » et « Réinitialiser le mot de passe » (stories 3.3, 3.5) ; changement de rôle dans `modifier_compte` (la 3.3 l'étendra) ; affichage « (désactivé) » dans la liste ou l'attribution (Should, plus tard) ; clé secrète hors de `src/server/admin` ; message qui dit pourquoi la session a pris fin ; désactivation de comptes par les tests automatiques sur dev ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Désactiver | « Désactiver » sur Lucas, puis confirmer | badge *Désactivé*, bouton « Réactiver », toast « Compte désactivé » ; Auth bloqué | N/A |
| Connexion après | Lucas, bons identifiants | « Identifiants incorrects » (déjà en place) | N/A |
| Session ouverte | Lucas connecté, ouvre une page ou lance une action | session fermée, I1 avec l'encadré neutre « Votre session a pris fin… » | N/A |
| Dernier administrateur | seul administrateur actif (soi ou autre) | message exact dans la fenêtre, rien ne change, Auth non touché | N/A |
| Deux administrateurs simultanés | A désactive B pendant que B désactive A | un seul réussit ; l'autre reçoit refus (NV202 ou dernier administrateur) | N/A |
| Se désactiver soi-même | deux administrateurs actifs | réussite, puis I1 avec « Votre session a pris fin… » | N/A |
| Réactiver | « Réactiver » sur un compte désactivé | « Actif », bouton « Désactiver », Auth débloqué ; peut se reconnecter | N/A |
| Panne | base ou Auth injoignable | « Le compte n'a pas pu être désactivé. Réessayez. » (ou « réactivé ») ; état inchangé | blocage Auth raté → profil remis comme avant ; code court au journal |
| Collaborateur | appelle l'action directement | `ACCES_REFUSE`, aucun appel | N/A |
| Double clic | deux clics sur le bouton | un seul envoi | N/A |

## Decisions

- `modifier_compte(p_auteur uuid, p_compte uuid, p_actif boolean)` → jsonb `{nom, email, change}`. Elle verrouille toutes les lignes administrateur (`for update`, triées par id), vérifie ensuite l'auteur, puis compte les autres administrateurs actifs. Codes : NV203 (dernier administrateur), NV204 (compte introuvable). Déjà dans l'état voulu → `change = faux`, rien au journal.
- Ordre : base d'abord (elle seule applique la règle), puis Supabase Auth (`ban_duration` `876000h` / `none`). Si Auth échoue, la base est remise comme avant.
- Fenêtre « Désactiver » : titre « Désactiver le compte de Lucas Bernard ? », texte de l'UX avec le premier mot du nom, boutons « Annuler » et « Désactiver ». Le refus du dernier administrateur et les pannes s'affichent dans la fenêtre, qui reste ouverte.
- « Réactiver » (décision d'Aurel, 2026-11-25) : clic direct, sans fenêtre ; indicateur « Réactivation… » sur le bouton, toast « Compte réactivé » ; refus ou panne en toast d'erreur (reste jusqu'à fermeture).
- Migration appliquée sur la base dev `aodcgbzapnruciesaycg` (accord d'Aurel, 2026-11-25), jamais sur prod dans cette story.
- Fiche gardée entière (environ 3 000 tokens) : validé par Aurel le 2026-11-25.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261124160000_comptes_administration.sql` -- modèle (`exiger_administrateur`, droits, commentaires). Nouvelle migration `20261125090000_desactiver_compte.sql`. Codes NV déjà pris : 001-002, 101-106, 201-202, 301-302, 401.
- `src/server/admin/index.ts` -- `clientSecret()`, `erreurImprevue()`, `DELAI_MS`, `journaliser` : ajouter `changerEtatCompte(compteId, actif, { auteur })` (Zod, rpc, `auth.admin.updateUserById`, retour arrière).
- `src/server/actions/creer-compte.ts`, `enveloppe.ts` -- modèle de la Server Function (`executerAction`, `exigerAdministrateur`, `refresh()`, remplacement d'`ERREUR_INTERNE` par le message de l'écran).
- `src/server/garde/index.ts` -- `lireUtilisateur` renvoie `null` pour un profil inactif (garder ce contrat) ; `exigerUtilisateur` / `exigerChangementMotDePasse` doivent, pour un profil **existant mais inactif**, fermer la session (`signOut({ scope: "local" })`) et poser le message, puis renvoyer vers I1. Écrire un cookie est impossible pendant un rendu : `try/catch`, le proxy l'a déjà fait.
- `src/lib/supabase/proxy.ts` -- `lireDoitChangerMdp` → lire aussi `actif` ; inactif sur page protégée : `fermerSession()`, cookie `session_terminee`, renvoi I1 (comme l'expiration). Les actions (`estAction`) restent à la garde.
- `src/server/passage/index.ts:198-260` -- `MessageConnexion` : ajouter `session_terminee` (schéma, `valeurSessionTerminee()`, une fonction qui le pose depuis une Server Function). `src/app/connexion/message-connexion.tsx` -- second encadré, même style `information`.
- `src/shared/messages.ts:175,338` -- `MESSAGES_COMPTES` (colonne Actions, fenêtre, toasts, pannes, dernier administrateur) ; `MESSAGE_SESSION_TERMINEE` à côté de `MESSAGE_SESSION_EXPIREE`.
- `src/shared/schemas/compte.ts` -- schéma `{ compteId: uuid, actif: boolean }`.
- `src/components/interne/tableau-comptes.tsx` -- colonne « Actions » ; `src/components/ui/alert-dialog.tsx`, `src/components/interne/actions-statut.tsx` (fenêtre « Rouvrir » : modèle), `creer-compte.tsx` (verrou d'envoi, aides pures exportées et testées), `ui/sonner.tsx` (`afficherSucces`, `afficherErreur`).
- Historique (AC 3) : `20261121200000_changer_statut.sql:277-327` lit déjà le nom dans `profils` même désactivé (`security definer`) : ne rien changer, le prouver par un test.
- `src/server/connexion/index.ts:43` -- `user_banned` déjà traité comme « Identifiants incorrects ».
- Tests : `tests/aides/supabase-connexion.ts` (simulation à étendre : `updateUserById`, rpc `modifier_compte`), `tests/regles/rm-10-compte-desactive.test.ts`, `tests/comptes/migration-comptes-administration.test.ts` (lecture du SQL), `tests/comptes/action-creer-compte.test.ts`, `creer-compte-ecran.test.tsx` ; Vitest en `node`, `renderToStaticMarkup`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261125090000_desactiver_compte.sql` -- `modifier_compte` (voir Decisions) -- règle tenue par la base (AD-10).
- [x] `src/server/admin/index.ts` -- `changerEtatCompte` : base, Auth, retour arrière, journal ; `CONFLIT` pour NV203, `ACCES_REFUSE` pour NV202, `INTROUVABLE` pour NV204.
- [x] `src/server/actions/changer-etat-compte.ts` -- `actionChangerEtatCompte(saisie)` ; soi-même désactivé : fermer sa session, message, renvoi I1.
- [x] `src/server/passage/index.ts`, `src/app/connexion/message-connexion.tsx`, `src/lib/supabase/proxy.ts`, `src/server/garde/index.ts` -- fin de session d'un compte désactivé avec le message.
- [x] `src/shared/messages.ts`, `src/shared/schemas/compte.ts` -- textes et schéma.
- [x] `src/components/interne/etat-compte.tsx` (nouveau), `tableau-comptes.tsx` -- colonne « Actions », fenêtre « Désactiver », « Réactiver ».
- [x] `tests/regles/rm-09-dernier-administrateur.test.ts`, `tests/regles/rm-10-compte-desactive.test.ts`, `tests/comptes/migration-desactiver-compte.test.ts`, `tests/comptes/changer-etat-compte.test.ts`, `tests/comptes/etat-compte-ecran.test.tsx`, tests du proxy et de la garde -- la matrice.

**Acceptance Criteria:**
- Given la fenêtre de désactivation, when je confirme, then le compte porte le badge *Désactivé*, et la personne ne peut plus se connecter.
- Given une personne connectée dont je désactive le compte, when elle fait sa prochaine action, then elle revient à la connexion avec « Votre session a pris fin. Contactez votre administrateur si besoin. »
- Given une demande traitée par cette personne, when j'ouvre son historique, then son nom y figure toujours.
- Given le dernier administrateur actif, when j'essaie de le désactiver, then l'action est refusée avec le message du dernier administrateur ; un compte désactivé peut être réactivé.

## Implementation Notes

- Écart assumé : seconde fonction `retablir_compte(p_compte, p_actif)` (service_role seul, même verrou et même règle du dernier administrateur, sans vérification de l'auteur) pour le retour arrière quand Auth échoue : un administrateur qui vient de se désactiver ne passerait plus la vérification de `modifier_compte` (NV202).
- `db push` refusé à l'agent de codage (permission) ; appliqué sur dev par l'agent principal le 2026-11-25 avec l'accord d'Aurel donné à la fiche : 16 migrations, la dernière `20261125090000` présente côté « remote » (projet `aodcgbzapnruciesaycg`).
- **Avant toute mise en ligne** : appliquer cette migration sur la base de prod avant le code (sinon « Désactiver » échoue en panne).
- Après relecture (11 corrections, 12 constats rejetés, 1 report) : redirection relancée côté navigateur (`unstable_rethrow`) ; Auth resynchronisé même sans changement du profil ; plus de retour arrière à l'aveugle sur réponse illisible ; `user_banned` au renouvellement du jeton → même fin de session avec message (code non observé en vrai) ; aiguillage de la réponse sorti en aide pure testée ; e2e des droits réels.
- Vérifications de l'agent principal (2026-11-25) : lint, `tsc`, build sans erreur ; 89 fichiers / 1 772 tests Vitest verts ; `administration.spec.ts` (3 tests e2e) vert sur dev, refus `42501` des deux fonctions pour le collaborateur. Pas de commit : Aurel vérifie d'abord à l'écran.
- Vérifié à l'écran par Aurel le 25 nov. 2026 : tous les critères sont bons ; commit ensuite.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | edge | Redirection d'une Server Function (soi-même désactivé, garde) : le `catch` d'`envoyerEtatCompte` l'avale et affiche « n'a pas pu être désactivé » | medium | Vérifié : `server-action-reducer.js:237-254`, Next rejette la promesse avec une erreur de redirection ; le projet relance déjà avec `unstable_rethrow` (`formulaire-connexion.tsx:188`) | patch |
| 2 | blind + edge | `change: faux` ne resynchronise pas Auth : après un retour arrière raté, « Réessayez » répond succès sans bloquer/débloquer | medium | Vérifié : branche `if (!change) return succes(...)` avant `updateUserById` ; le cas `profil_retabli: false` est journalisé mais jamais réparable | patch (appliquer le blocage voulu même sans changement) |
| 3 | blind + edge | Réponse illisible de `modifier_compte` : retour arrière à l'aveugle (`!voulu`), qui peut inverser un compte inchangé | low | Vérifié ; cas presque impossible, mais la correction est une suppression (ne pas rétablir, journaliser ; la resynchronisation du n° 2 répare au nouvel essai) | patch |
| 4 | verif | Le test du proxy ne vérifie pas que `actif` est demandé : le retirer du `select` resterait vert | medium | Pré-vérifié : la simulation renvoie tout le profil quelles que soient les colonnes | patch |
| 5 | verif + blind | Aiguillage de la réponse dans `EtatCompte` (erreur dans la fenêtre / toast, fermeture, succès) non testé | medium | Pré-vérifié : seul un rendu statique d'`EtatCompte` | patch (aide pure exportée + test) |
| 6 | verif | « Clés absentes » : le code du support n'est pas vérifié dans le journal | low | Pré-vérifié ; correction = une assertion, comme `action-creer-compte.test.ts:271-285` | patch |
| 7 | verif | Branche « réponse illisible » jamais exécutée | medium | Pré-vérifié : aucun test n'atteint `reponse_inattendue` | patch (avec le n° 3) |
| 8 | verif + blind | Droits réels de `modifier_compte` / `retablir_compte` jamais essayés contre la base | medium | Pré-vérifié : seulement le texte SQL ; un e2e appelle déjà `lister_comptes` en collaborateur | patch (e2e : refus pour le collaborateur) |
| 9 | verif + blind | Règle RM-9 et verrou jamais exécutés sur un vrai Postgres (appels simultanés) | medium | Pré-vérifié : simulation TypeScript seulement ; l'e2e n'a volontairement pas d'identifiants administrateur | defer |
| 10 | edge | Jeton expiré (~1 h) d'un compte bloqué : le renouvellement échoue, I1 sans « Votre session a pris fin… » | medium | Vérifié : `getClaims` renvoie une erreur, le proxy renvoie sans message ; contredit le critère 2 au-delà d'une heure | patch (erreur `user_banned` → même fin que « inactif ») |
| 11 | blind | Test de migration figé sur 16 fichiers et sur « dernière migration » : cassera à la 3.5 | low | Vérifié ; correction directe | patch |
| 12 | blind | Commentaire « une seule fois par requête » : `cache` de React n'agit pas dans une Server Function | low | Vérifié ; correction directe du commentaire | patch |
| 13 | blind + edge | Administrateurs simultanés : étapes base et Auth entrelacées (profil actif mais bloqué) | low | Réel mais deux clics sur le même compte à la même milliseconde ; un nouvel essai répare grâce au n° 2 ; correction lourde (verrou à travers Auth) | rejeté |
| 14 | blind | `retablir_compte` écrase sans vérifier la valeur attendue | low | Même course que le n° 13 ; même raison | rejeté |
| 15 | blind | Cookie d'activité laissé par la garde et l'auto-désactivation | low | Sans effet : sans session il ne donne aucun accès, il est réécrit à la connexion | rejeté |
| 16 | blind | Fenêtre à la troisième personne quand on se désactive soi-même | low | Texte imposé par l'UX ; nouveau texte hors UX | rejeté |
| 17 | blind | Sélection clavier perdue après « Réactiver » en erreur | low | Cas rare ; correction = nouvelle gestion du focus | rejeté |
| 18 | blind | Compte introuvable : « Réessayez » trompeur | low | Inatteignable en pratique (identifiants du tableau, jamais de suppression) | rejeté |
| 19 | blind | Refus (collaborateur, dernier administrateur) absents du journal | false | La liste des événements est fermée (AD-13) et ne prévoit pas de refus ; même choix qu'en 3.2 | rejeté |
| 20 | blind | Nom générique `modifier_compte` | false | Imposé par l'architecture (AD-9, AD-10) ; la 3.3 l'étendra | rejeté |
| 21 | blind | Nom du compte absent pour les lecteurs d'écran pendant « Réactivation… » | low | Bref ; nouveau texte hors UX | rejeté |
| 22 | edge | `signOut` en panne dans la garde : cookies de session gardés | low | Accès toujours refusé (la garde relit `actif`) ; le proxy ferme à la page suivante | rejeté |
| 23 | edge | Rendu de page avec lecture du profil ratée dans le proxy : pas de message | low | Double panne rare ; accès refusé quand même | rejeté |
| 24 | edge | Auto-désactivation : `deconnecter`/`poserSessionTerminee` qui lève | false | `deconnecter` ne lève jamais (documenté) ; `poserSessionTerminee` seulement sans secret, erreur de configuration | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (depuis `C:\…`, lettre en majuscule), `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `migration list --remote` (dev, si accepté) -- expected: 16 migrations.

**Manual checks:**
- `npm run dev` : les quatre critères avec le compte administrateur et un second navigateur connecté avec le compte à désactiver.
