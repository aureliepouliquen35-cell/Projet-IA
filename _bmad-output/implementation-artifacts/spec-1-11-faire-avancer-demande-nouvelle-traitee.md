---
title: 'Story 1.11 — Faire avancer une demande de Nouvelle à Traitée'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'd4671609c1c2d54db677aebe22d45135e85e8988'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le détail I4 montre le statut d'une demande, mais personne ne peut le changer : impossible de dire « je m'en occupe » ou « c'est réglé », et l'historique ne garde que « Demande créée » (FR-16, FR-17).

**Approach:** Le panneau « Statut » de I4 propose seulement les passages permis (« Passer En cours », « Marquer Traitée », « Rouvrir (En cours) » avec fenêtre de confirmation). Une nouvelle fonction SQL `changer_statut` vérifie l'appelant, verrouille la demande, applique la règle depuis le statut **réel**, écrit l'événement « Statut : ancien → nouveau » avec l'auteur interne et gère la date de clôture, dans une seule transaction. Après l'action : badge, historique et compteur à jour, toast « Statut mis à jour » ; si un collègue est passé avant, encadré « Cette demande a été modifiée par … à … L'affichage a été mis à jour. »

## Boundaries & Constraints

**Always:** AD-2 (seul chemin d'écriture : `changer_statut`, même transaction pour demande + événement + `date_derniere_activite`), AD-3 (événements en ajout seul), AD-5 (`changer_statut` fait foi ; `TRANSITIONS_STATUT` de `src/shared/constantes.ts` sert à afficher, un test compare les deux), AD-7/AD-9 (`exigerUtilisateur()` puis `exiger_utilisateur_interne()`, `security definer`, `search_path = ''`, `authenticated` seul), AD-12 (réponse `{ ok, … }`, conflit renvoyé et jamais levé, enveloppe `executerAction`), AD-13 (journal : référence et code seulement), AD-16 (nouvelle migration, anciennes intactes), AD-19 (tokens, lucide) ; jamais de retour à *Nouvelle* (ni bouton, ni accepté par la base) ; choisir le statut déjà en place ne crée rien ; *Traitée* pose la date de clôture, la réouverture l'efface ; le nom de l'auteur reste affiché si son compte est désactivé ; un seul bouton principal ; toast de succès 5 s, toast d'erreur jusqu'à fermeture ; fenêtre : sélection sur « Annuler », Échap ferme.

**Never:** attribution, priorité, commentaires, suppression (Should / admin) ; filtres de la liste (2.1) ; écriture directe dans une table ; confirmation pour « Passer En cours » ou « Marquer Traitée » ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Passer En cours | vue *Nouvelle*, réel *Nouvelle* | *En cours*, événement « Statut : Nouvelle → En cours · Karim Benali · heure », compteur −1, toast | N/A |
| Marquer Traitée | vue *Nouvelle* ou *En cours* | *Traitée*, « Clôturée le … » affiché | N/A |
| Rouvrir | vue *Traitée*, confirmé | *En cours*, date de clôture effacée | Annuler : rien ne change |
| Collègue avant moi, passage encore permis | vu *Nouvelle*, réel *En cours* (Lucas, 9 h 11), clic « Marquer Traitée » | appliqué : « Statut : En cours → Traitée » ; encadré « modifiée par Lucas Bernard à 9 h 11 » + toast | N/A |
| Collègue avant moi, même statut | vu *Nouvelle*, réel *En cours*, clic « Passer En cours » | aucun événement ; encadré ; affichage mis à jour | `CONFLIT` |
| Retour à *Nouvelle* demandé | appel direct au serveur | refusé, rien n'est écrit | `VALIDATION` |
| Demande supprimée | référence inconnue | page « demande introuvable » après mise à jour | `INTROUVABLE` |
| Panne | base injoignable | toast d'erreur « Le statut n'a pas pu être modifié. Réessayez. », écran à l'état réel | journalisé (code seulement) |
| Collègue a clôturé, je demande *En cours* sans avoir vu *Traitée* | vu *Nouvelle*, réel *Traitée*, clic « Passer En cours » | rien n'est appliqué (`refuse`) ; encadré « modifiée par … » | `CONFLIT` |

## Decisions (Aurel, 2026-11-21)

- Fenêtre « Rouvrir » : titre « Rouvrir la demande NOVA-2026-0042 ? », texte « Elle repassera En cours et sa date de clôture sera effacée. », boutons « Annuler » et « Rouvrir la demande ».
- Une réouverture n'est appliquée que si la personne voyait *Traitée* (`p_statut_vu = 'traitee'`) : sinon rien ne change et l'encadré « modifiée par … » s'affiche. Une réouverture passe donc toujours par la fenêtre de confirmation.
- Migration : comme en 1.8 à 1.10, l'agent essaie `npx.cmd supabase db push --remote --yes` sur dev ; en cas de refus, il donne la commande à Aurel.
- Plan gardé entier (environ 2 400 tokens).

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261119180000_depot_demande.sql:114-213` -- `demandes`, `evenements` (`auteur_libelle` obligatoire, `demandeur`/`systeme`). Ne pas modifier.
- `supabase/migrations/20261120230000_liste_demandes.sql` -- `exiger_utilisateur_interne()` (renvoie `auth.uid()`), colonne générée `a_traiter` (le compteur baisse seul). Modèle des droits.
- `supabase/migrations/20261121150000_detail_demande.sql` -- `lire_demande` à remplacer (`create or replace`) dans la nouvelle migration.
- `supabase/migrations/20261120090000_comptes.sql` -- `profils (id, nom, actif)` : auteur interne.
- `src/server/lectures/demande.ts` -- `schemaDetail`, `EvenementDemande`, `DetailDemande` : à élargir (ancien/nouveau statut, nom de l'auteur, date de clôture).
- `src/shared/{constantes,libelles,messages,dates}.ts` -- `STATUTS`, `TYPES_EVENEMENTS`, `AUTEURS_EVENEMENTS`, `LIBELLES_*`, `MESSAGES_DETAIL`, `formaterDateHeure`.
- `src/server/actions/{enveloppe,choisir-mot-de-passe}.ts`, `src/shared/reponse.ts` -- modèle de Server Function.
- `src/app/(interne)/demandes/[reference]/contenu-demande.tsx` -- panneau « Statut » (lignes ~140-155), bloc « Informations ».
- `src/components/interne/historique-demande.tsx` -- libellé à construire pour `statut`, auteur interne.
- `src/components/ui/{sonner,alert,button}.tsx` -- toasts (ajouter fermeture des erreurs), `alert` information, variantes de bouton. Pas encore de fenêtre : ajouter `src/components/ui/alert-dialog.tsx` (shadcn, `radix-ui` déjà installé).
- `tests/aides/supabase-connexion.ts`, `tests/detail/*` -- simulation `rpc` à étendre (`changer_statut`).
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md` -- `refresh()` de `next/cache` dans la Server Function.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261121200000_changer_statut.sql` -- `demandes.date_cloture` + contrainte (non nulle ssi *Traitée*) ; `evenements.auteur_id` (→ `profils`), `ancien_statut`, `nouveau_statut`, `auteur_libelle` facultatif, contraintes (un seul auteur ; `statut` ⇒ ancien ≠ nouveau, nouveau ≠ `nouvelle`) ; `transition_statut_permise(de, vers)` (liste des 4 passages) ; `changer_statut(p_reference, p_statut_vu, p_nouveau_statut)` → `{ resultat: applique|inchange|refuse|introuvable, statut, modifiee_par: { nom, date } | null }` ; `lire_demande` remplacée (date de clôture, `auteur_nom`, ancien/nouveau statut).
- [x] `src/shared/constantes.ts`, `libelles.ts`, `messages.ts` -- `TRANSITIONS_STATUT`, `transitionsDepuis`, type `statut`, libellés des boutons, de la fenêtre, toasts, encadré, « Clôturée le ».
- [x] `src/server/lectures/demande.ts` -- schéma élargi ; `src/server/actions/changer-statut.ts` -- garde, Zod, `rpc`, réponses, `refresh()`.
- [x] `src/components/ui/alert-dialog.tsx`, `src/components/ui/sonner.tsx` -- fenêtre DESIGN.md ; bouton de fermeture des toasts d'erreur.
- [x] `src/components/interne/actions-statut.tsx` (client), `historique-demande.tsx`, `contenu-demande.tsx` -- boutons, indicateur pendant l'action, encadré, date de clôture, historique « Statut : … ».
- [x] `tests/statut/*`, `tests/aides/supabase-connexion.ts` -- matrice : texte de la migration (droits, verrou `for update`, transitions = `TRANSITIONS_STATUT`), action (chaque résultat, `nouvelle` refusée sans appel, panne sans donnée au journal), rendu (boutons par statut, fenêtre, encadré, historique, clôture).

**Acceptance Criteria:**
- Given une demande *Nouvelle*, when je clique sur « Passer En cours », then le badge devient *En cours*, l'historique ajoute « Statut : Nouvelle → En cours » avec mon nom et l'heure, et le compteur « à traiter » baisse de 1.
- Given une demande *Nouvelle*, when je regarde les actions, then « Passer En cours » et « Marquer Traitée » sont proposées ; *En cours* : seule « Marquer Traitée » ; après « Marquer Traitée », la date de clôture s'affiche ; jamais de retour à *Nouvelle*.
- Given une demande *Traitée*, when je clique sur « Rouvrir (En cours) » et confirme, then elle repasse *En cours* et sa date de clôture disparaît.
- Given un collègue qui a changé le statut juste avant moi, when je clique, then je lis « Cette demande a été modifiée par … à … L'affichage a été mis à jour. » et l'historique indique le statut réel avant mon action.

## Implementation Notes

- **Migration pas encore appliquée sur dev** : `npx.cmd supabase db push --remote --yes` refusé à l'agent (permission), projet lié vérifié = dev (`aodcgbzapnruciesaycg`, même identifiant que `.env.local`). À lancer par Aurel, puis `npx.cmd supabase migration list --remote` (11 migrations attendues). Tant qu'elle n'est pas appliquée, ouvrir un détail donne l'écran S3 (`lire_demande` 1.10 ne renvoie pas `date_cloture`).
- `changer_statut` : refus prévus NV301 (statut demandé absent, inconnu ou *Nouvelle*) et NV302 (statut vu inconnu), traduits en `VALIDATION` ; le serveur les refuse déjà avant l'appel. `inchange` / `refuse` → `CONFLIT` dont le `message` est le texte de l'encadré ; `applique` → `succes({ statut, modifiee })`. Statut réel différent sans événement `statut` connu (cas imprévu) : encadré « Cette demande a été modifiée entre-temps. L'affichage a été mis à jour. ».
- `refresh()` est appelé pour `applique`, `inchange`, `refuse` et `introuvable` ; pas en cas de panne (aucun changement optimiste à l'écran : il montre déjà le dernier état lu ; un nouveau rendu avec la base injoignable donnerait S3 au lieu du toast).
- Encadré « modifiée par … » placé dans le panneau « Statut », au-dessus des boutons ; il reste après `refresh()` (`key` = référence) et disparaît au clic suivant.
- Toasts : `afficherSucces` / `afficherErreur` dans `src/components/ui/sonner.tsx` ; erreur = `duration: Infinity` + croix « Fermer la notification ».
- Migration : par précaution, une demande déjà *Traitée* (aucune en principe) reçoit `date_derniere_activite` comme date de clôture avant la contrainte. `transition_statut_permise` n'est exécutable par personne (appelée par `changer_statut`, même propriétaire), comme `exiger_utilisateur_interne`.
- Tests : `tests/statut/` (migration, action, écran), `tests/regles/rm-04-jamais-retour-nouvelle.test.ts` ; tests 1.10 adaptés (panneau avec boutons, nouvelle forme de l'auteur). Entrée de deferred-work sur l'ancien schéma Zod retirée.
- Sous Git Bash, Vitest échoue (« failed to find the current suite ») car le dossier est vu `C:/` et `c:/` : lancer les tests depuis PowerShell.
- Vérifié : lint, `tsc --noEmit`, 68 fichiers / 1 197 tests verts, `npm run build`. Pas de commit. Reste : migration sur dev et vérification à l'écran (deux onglets pour le conflit).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge | Toasts d'erreur infinis sans `id` : ils s'empilent à chaque nouvel échec | low | Vérifié : `afficherErreur` sans `id` ; un `id` stable = correction directe | patch |
| 2 | verif + blind | Logique avec état d'`ActionsStatut` (verrou anti double envoi, choix du toast, encadré) jamais exécutée par un test | medium | Pré-vérifié (couche verif) : seuls des tests sur le texte du fichier ; modèle `envoyerMotDePasse` disponible | patch |
| 3 | verif | Règles `refine` des événements (un seul auteur, ancien/nouveau statut) non testées | low | Pré-vérifié : aucun cas d'échec ne les vise | patch |
| 4 | blind | Cas de course réalistes absents ; le test « je l'avais vue En cours » envoie `en_cours → en_cours`, impossible depuis l'écran | low | Vérifié (`action-changer-statut.test.ts:194-198`) | patch |
| 5 | verif + blind | `changer_statut`, contraintes et nouvelle `lire_demande` jamais exécutés sur un vrai Postgres | medium | Réel ; pas de base de test dans le dépôt (comme 1.8 à 1.10) | defer |
| 6 | verif | Câblage des clics et maintien de l'encadré après `refresh()` (clé) non testables sans DOM | low | Réel ; environnement `node` sans bibliothèque DOM ; vérification à l'écran | defer |
| 7 | blind + edge | Conflit détecté par le statut seul : A → B → A d'un collègue passe inaperçu | low | Choix d'AD-5 (« reçoit le statut que l'utilisateur avait sous les yeux ») | rejeté |
| 8 | blind + edge | « modifiée par » peut nommer la personne elle-même (deuxième onglet) | low | Information exacte (elle a bien modifié la demande à cette heure) | rejeté |
| 9 | edge | Jointure interne : un événement `statut` d'auteur « Système » serait sauté | false | Aucune fonction n'écrit ni n'écrira de changement de statut par « Système » (anonymisation ≠ statut) | rejeté |
| 10 | edge | Redirection (session expirée) avalée par le `catch` du client, toast d'erreur sur la connexion | false | Même modèle que `envoyerMotDePasse` (1.7) : la redirection d'une Server Function ne rejette pas la promesse, d'où la branche « aucune réponse » | rejeté |
| 11 | edge | Réponse perdue (délai dépassé après écriture) : toast d'échec, écran pas recalculé | low | Rare (8 s) ; le clic suivant affiche l'encadré et l'état réel ; recalculer en panne donnerait S3 (choix noté) | rejeté |
| 12 | edge | `NV201` de `changer_statut` (compte désactivé entre la garde et l'appel) journalisé comme panne | low | Fenêtre de quelques millisecondes | rejeté |
| 13 | edge | Futurs types d'événements (attribution, priorité…) feraient tomber le détail en S3 | low | Aucun n'est écrit ; chaque story Should élargira le schéma avec sa fonction | rejeté |
| 14 | edge | Entrée deferred-work « retour arrière vers 1.10 » retirée à tort | false | La production n'ouvre qu'en 1.12 : aucune version antérieure à 1.11 n'y tournera | rejeté |
| 15 | blind | Encadré : l'heure sans la date si la page est restée ouverte d'un jour à l'autre | low | Texte de l'UX (« à 9 h 11 ») ; cas rare | rejeté |
| 16 | blind | Sélection clavier perdue après un changement (le bouton cliqué disparaît) | low | Réel ; espace interne sur ordinateur, à la souris d'abord ; correction = gestion du focus en plus | rejeté |
| 17 | blind | Encadré inséré déjà rempli : certains lecteurs d'écran ne l'annoncent pas | low | Réel selon les lecteurs ; correction = zone permanente en plus | rejeté |
| 18 | blind | `TitreFenetreRouvrir` suppose la référence dans le titre | low | Texte fixe qui la contient toujours | rejeté |
| 19 | blind | `formaterHeure` dépend du format de `formaterDateHeure` | false | Un test vérifie l'heure seule en heure de Paris : tout changement de format le casse | rejeté |
| 20 | blind | `date_cloture` obligatoire dans le schéma : application avant migration → S3 | low | Ordre imposé par AD-16 (migration d'abord) | rejeté |
| 21 | blind | Troisième copie des passages permis dans la simulation de test ; dernière activité non simulée | low | Copie volontairement indépendante du code testé ; dernière activité vérifiée sur le SQL | rejeté |
| 22 | blind | Bouton principal choisi par position ; `ChangementStatut.statut` jamais lu | low | `transitionsDepuis` ne renvoie jamais `nouvelle` ; champ inutilisé sans effet | rejeté |

## Design Notes

- Boutons : depuis *Nouvelle*, « Passer En cours » principal et « Marquer Traitée » secondaire ; depuis *En cours*, « Marquer Traitée » principal ; « Rouvrir (En cours) » secondaire. Pendant l'action, le bouton cliqué montre un indicateur et les autres boutons de statut sont désactivés (aucun double envoi, AD-20).
- « modifiée par » = auteur et heure du dernier événement `statut` (heure seule, Paris : « 9 h 11 »).
- Retour arrière vers 1.10 sans risque : la production n'ouvre qu'en 1.12 (entrée de deferred-work sur l'ancien schéma Zod close).

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase migration list --remote` -- expected: 11 migrations sur dev.

**Manual checks:**
- `npm run dev` : les quatre critères avec le compte de test (deux onglets pour le conflit).
