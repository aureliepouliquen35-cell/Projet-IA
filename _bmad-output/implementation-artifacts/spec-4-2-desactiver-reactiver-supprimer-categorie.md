---
title: 'Story 4.2 — Désactiver, réactiver ou supprimer une catégorie'
type: 'feature'
created: '2026-11-26'
status: 'done'
baseline_commit: 'baad77c85d932a7bd9251d5274945f9f2cb84ca9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur l'écran A2, l'administrateur peut ajouter et renommer une catégorie, mais pas la retirer du formulaire. Une catégorie inutile reste donc proposée aux demandeurs (FR-26, RM-11).

**Approach:** On ajoute sur chaque ligne de A2 « Désactiver » ou « Réactiver », et « Supprimer » seulement si la catégorie n'a aucune demande. Supprimer ouvre une fenêtre de confirmation. Les trois actions passent par une nouvelle version de `modifier_categorie`, qui garde en base la règle « au moins une catégorie active » (AD-10). Le détail I4 affiche « (désactivée) » après le nom d'une catégorie désactivée. Le filtre de I3 et le formulaire public le gèrent déjà.

## Boundaries & Constraints

**Always:**
- **La protection (triple), comme en 4.1.** Chaque Server Function commence par `exigerAdministrateur()` : sinon `ACCES_REFUSE` puis `refresh()`. La fonction SQL commence par `exiger_administrateur()` (NV202). Elle est `security definer`, avec `search_path = ''`. Le droit de l'exécuter est retiré à `public`, `anon` et `service_role`, et donné à `authenticated` seul. On utilise la session de l'administrateur, jamais la clé secrète.
- **La dernière catégorie active (AD-10).** La base verrouille les catégories actives, les compte et refuse (NV503) une désactivation ou une suppression qui n'en laisserait aucune, même si deux administrateurs agissent en même temps. Le bouton reste visible ; le refus affiche le message exact : « Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable. »
- **La suppression.** Seule une catégorie sans aucune demande peut être supprimée. La base le vérifie, ligne verrouillée, et la clé étrangère `demandes_categorie_id_fkey` sert de dernière barrière. Le refus (NV504) affiche : « Impossible de supprimer une catégorie utilisée par des demandes. Vous pouvez la désactiver. » La fenêtre affiche « Supprimer la catégorie *Facturation* ? » et « Elle n'a jamais été utilisée. Cette action est irréversible. ». Le bouton danger est rouge, la sélection se place sur « Annuler », et Échap ferme la fenêtre.
- **La réactivation.** Si une catégorie active porte déjà le même nom, l'index unique refuse ; on affiche alors « Une catégorie active porte déjà ce nom. » (NV501).
- **Les comportements.** Pendant l'envoi, un indicateur apparaît sur le bouton concerné. Un double clic n'envoie qu'une seule fois. Après la réponse, `refresh()` met la liste à jour : badge *Désactivée* et bouton « Réactiver », ou l'inverse. Une ligne supprimée disparaît.
- **La migration.** Une nouvelle migration, qui ne touche pas aux anciennes (AD-16). Rien n'est écrit au journal pour les catégories.

**Never:**
- les statuts : aucun écran ne permet d'en ajouter, d'en renommer ou d'en supprimer (RM-3, critère 4, vérifié par un test) ;
- les informations générales (4.3) ;
- une écriture directe dans `categories` ;
- modifier le formulaire public, la saisie I5 ou le filtre de I3, qui ne proposent déjà que les catégories actives (le filtre liste aussi les désactivées) ;
- un commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Désactiver | Catégorie active, utilisée, ≥ 2 actives | Badge *Désactivée*, bouton « Réactiver ». Elle disparaît de P1 et de I5. I4 affiche « Autre (désactivée) ». Le filtre de I3 la liste sous le trait. | N/A |
| Dernière active | Désactiver ou supprimer l'unique catégorie active | Message exact, rien n'est écrit | `CONFLIT` (NV503) |
| Réactiver | Catégorie désactivée | Badge « Active ». Elle revient dans P1. | N/A |
| Réactiver, nom pris | Une catégorie active porte le même nom | « Une catégorie active porte déjà ce nom. » | `CONFLIT` (NV501) |
| Supprimer | 0 demande, après confirmation | La ligne disparaît. Toast. | N/A |
| Supprimer, utilisée | Une demande est arrivée entre l'affichage et la confirmation | Message exact dans la fenêtre. `refresh()` : « Supprimer » disparaît. | `CONFLIT` (NV504) |
| Déjà dans l'état voulu | Désactiver une catégorie déjà désactivée (autre administrateur) | Rien n'est écrit, `refresh()`, pas d'erreur | N/A |
| Introuvable | Catégorie supprimée entre-temps | `refresh()`, la ligne disparaît | `INTROUVABLE` (NV502) |
| Collaborateur | Il appelle une action directement | Rien n'est écrit | `ACCES_REFUSE` / NV202 |
| Panne | La base ne répond pas | Message de panne, rien n'est perdu | `ERREUR_INTERNE` (enveloppe) |

## Decisions

Choix d'Aurel, 26 nov. 2026 :
- **« Désactiver » et « Réactiver » agissent d'un seul clic**, sans fenêtre, avec un toast. Un refus ou une panne s'affiche dans un toast d'erreur, qui reste jusqu'à fermeture. Seul « Supprimer » ouvre une fenêtre ; son refus ou sa panne s'affiche dans la fenêtre, qui reste ouverte.
- **La mention « (désactivée) » s'affiche dans le détail I4 seulement**, comme dans l'UX. Le tableau de I3 garde le nom seul.
- **Textes absents de l'UX, validés :** toasts « Catégorie désactivée », « Catégorie réactivée », « Catégorie supprimée » ; indicateurs « Désactivation… », « Réactivation… », « Suppression… » ; bouton danger de la fenêtre « Supprimer » ; panne « La catégorie n'a pas pu être modifiée. Réessayez. ».
- **La migration est appliquée sur la base dev** `aodcgbzapnruciesaycg` par l'agent, jamais sur prod.
- Le plan dépasse 1 600 jetons : il est gardé entier, car il n'a qu'un seul objectif.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261126150000_categories_administration.sql` -- `modifier_categorie(uuid, text)` (renommage, NV501/NV502, `change`) à remplacer : `drop function` puis nouvelle signature, sur le modèle de `20261126090000_modifier_compte.sql` (champs facultatifs, verrou, compte de ce qui reste, retour `change`). `lister_categories_administration` donne déjà `active` et `nombre_demandes`.
- `supabase/migrations/20261121200000_changer_statut.sql:287` -- dernière version de `lire_demande` (`'categorie', c.nom`) : `create or replace` avec en plus `'categorie_active', c.active`, droits recopiés.
- `src/server/lectures/demande.ts:81,103,196` et `src/app/(interne)/demandes/[reference]/contenu-demande.tsx:197` -- lire `categorie_active` et afficher « Autre (désactivée) » (`MESSAGES_LISTE.desactivee`).
- `src/server/actions/renommer-categorie.ts` -- modèle (garde, Zod, rpc, NV202/NV501/NV502, `refresh()`, enveloppe, message de panne) des nouvelles `changer-etat-categorie.ts` et `supprimer-categorie.ts`. Il appelle `modifier_categorie` : adapter l'appel à la nouvelle signature.
- `src/components/interne/etat-compte.tsx` -- modèle du bouton « Désactiver »/« Réactiver » (verrou, `useTransition`, fonctions pures exportées, sélection rendue). `src/components/interne/supprimer-demande.tsx` -- modèle de la fenêtre danger (pastille corbeille, `variant="danger"`). Nouveaux : `etat-categorie.tsx`, `supprimer-categorie.tsx`.
- `src/components/interne/renommer-categorie.tsx:216-349` -- `VueLigneCategorie`, cellule Actions : y placer les deux nouveaux composants (avec des clés, voir le défaut n° 1 de la 4.1). `tableau-categories.tsx` -- en-tête de commentaire à mettre à jour.
- `src/shared/messages.ts:319` (`MESSAGES_CATEGORIES`), `src/shared/schemas/categorie.ts` -- textes et schémas (identifiant, `active`).
- Tests : `tests/aides/supabase-connexion.ts:633` (simulation de `modifier_categorie`, à étendre : NV503, NV504, réactivation en double) ; `tests/categories/*` ; `tests/detail/*` (mention) ; `tests/regles/rm-07-administration-reservee.test.ts` (les deux actions) ; nouveau `tests/regles/rm-03-statuts-fixes.test.ts` (aucune page ni action de statut dans `src/app/(interne)/admin`) et `rm-11-categorie-desactivee.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261127090000_desactiver_supprimer_categorie.sql` -- nouvelle `modifier_categorie(p_categorie, p_nom default null, p_active default null, p_supprimer default false)` et `lire_demande` avec `categorie_active`, avec leurs droits.
- [x] `src/shared/schemas/categorie.ts`, `src/shared/messages.ts` -- schémas et textes.
- [x] `src/server/actions/changer-etat-categorie.ts`, `supprimer-categorie.ts` ; `renommer-categorie.ts` adapté.
- [x] `src/components/interne/etat-categorie.tsx`, `supprimer-categorie.tsx` ; `renommer-categorie.tsx`, `tableau-categories.tsx`.
- [x] `src/server/lectures/demande.ts`, `contenu-demande.tsx` -- la mention dans I4.
- [x] Tests -- couvrir la matrice : la migration (texte), les actions, l'écran, les fonctions pures, I4, RM-3, RM-7, RM-11.

**Acceptance Criteria:**
- Given une catégorie utilisée, when je la désactive, then elle disparaît du formulaire public, la demande l'affiche suivie de « (désactivée) », et le filtre de I3 la propose encore.
- Given une catégorie utilisée, when je regarde ses actions, then « Supprimer » n'est pas proposé ; given une catégorie jamais utilisée, when je la supprime et confirme, then elle disparaît.
- Given la dernière catégorie active, when je la désactive ou la supprime, then je lis « Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable. »
- Given l'espace d'administration, when je le parcours, then aucun écran ne gère les statuts.

## Implementation Notes

- Agent de codage (2026-11-26) : tout est construit. Lint, tsc, `npm run test` (108 fichiers, 2368 tests, lancés depuis PowerShell) et `npm run build` sont au vert. **La migration n'est pas appliquée sur dev** : l'outil de sécurité a refusé `supabase db push --remote --yes`, comme en 4.1. L'essai à blanc vise bien `aodcgbzapnruciesaycg`, avec la seule migration `20261127090000`. Tant qu'elle n'est pas appliquée, le détail I4 échoue sur dev, car `categorie_active` est obligatoire. En prod aussi, il faudra appliquer la migration avant de mettre le code en ligne.
- `renommer-categorie.ts` n'a changé que dans son commentaire : il appelle `modifier_categorie` par noms de paramètres, et les autres gardent leur valeur par défaut.
- Après la relecture (8 corrections en 1 envoi, 2 reports, 9 rejets) :
  - la sélection revient au bouton après chaque réponse ;
  - les autres actions restent montées pendant un renommage (cachées) ;
  - le bouton danger est désactivé après un refus NV504 ;
  - l'e2e envoie les deux nouvelles formes d'appel ;
  - les tests de migration et de RM-3 ne figent plus la liste ;
  - deux tests trompeurs sont réparés.

  Agent principal : lint, tsc, `npm run test` (108 fichiers, 2372 tests) et `npm run build` sont au vert. Pas de commit : Aurel vérifie d'abord à l'écran.
- Migration appliquée sur dev par l'agent principal, avec l'accord d'Aurel (`aodcgbzapnruciesaycg`, 21 migrations des deux côtés). Les e2e `administration.spec.ts` et `parcours-sm1.spec.ts` passent (9/9).
- Vérifié à l'écran par Aurel le 26 nov. 2026 : tous les critères sont bons. Commit local sur `main`, sans envoi.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | edge + blind | Après « Désactiver »/« Réactiver », la sélection tombe sur la page si la réponse est un refus, une panne ou `change` faux : le bouton est désactivé pendant l'envoi, et seule une réussite rend la sélection | medium | Vérifié : `rendreSelection` n'est mis qu'en cas de succès, l'effet ne dépend que de `categorie.active` ; il n'y a pas de fenêtre pour rendre la sélection comme en A1 | patch |
| 2 | edge + blind | « Renommer » cliqué pendant un envoi démonte `EtatCategorie` : son verrou est perdu, un second envoi devient possible (AD-20) | low | Vérifié : `autresActions` n'est rendu qu'en lecture ; au retour, un nouveau `useRef(false)` | patch |
| 3 | blind | Après un refus NV504, la fenêtre reste ouverte avec le bouton danger actif et le texte « Elle n'a jamais été utilisée » | low | Vérifié : `!proposee && fenetreOuverte` garde la fenêtre ; rien ne désactive « Supprimer » | patch |
| 4 | verif | Les nouvelles formes d'appel (`p_active`, `p_supprimer`) ne sont jamais envoyées à la vraie base | medium | Pré-vérifié : l'e2e n'appelle que `{p_categorie, p_nom}` ; on peut ajouter les deux formes en collaborateur (NV202 attendu) | patch |
| 5 | verif + blind | Les règles côté administrateur (NV503, NV504, NV501 à la réactivation, deux administrateurs en même temps) ne tournent jamais sur une vraie base | medium | Pré-vérifié ; pas de compte administrateur e2e ni de Postgres local (même report qu'en 4.1 n° 5) | defer |
| 6 | verif | La sélection rendue et le câblage de la fenêtre (avec état) ne sont pas exécutés par un test | medium | Pré-vérifié ; vitest sans DOM (même report qu'en 4.1 n° 6) | defer |
| 7 | blind | Le test de migration exige qu'elle soit la dernière (`at(-1)`) : il cassera à la prochaine migration (4.3) | medium | Vérifié : `migration-desactiver-supprimer-categorie.test.ts:47` | patch |
| 8 | blind | RM-3 fige la liste des pages d'administration (`["categories", "comptes"]`) et le texte du menu : la 4.3 le cassera sans aucun écran de statut | medium | Vérifié : `rm-03-statuts-fixes.test.ts:70,86` | patch |
| 9 | blind | Un titre de test annonce « la dernière active garde son Désactiver » sans le vérifier | low | Vérifié : `etat-suppression-categorie-ecran.test.tsx:433-435` | patch |
| 10 | blind | Le test « le tableau de I3 garde le nom seul » ne peut pas échouer : il rend `TableauDemandes` avec des données écrites à la main | low | Vérifié : `ecran-demande.test.tsx:144-151` | patch |
| 11 | edge + blind | Après une suppression réussie, la sélection tombe sur la page (le bouton qui a ouvert la fenêtre n'existe plus) | low | Réel ; corriger demande de choisir une nouvelle cible, et la situation est rare (clavier seulement) | rejeté |
| 12 | edge + blind | Un dépôt envoyé au moment exact d'une suppression heurte la clé étrangère : panne générique au lieu de NV002 | low | Fenêtre de quelques millisecondes, sur une catégorie jamais utilisée ; corriger touche les fonctions de dépôt | rejeté |
| 13 | edge | Code mis en ligne avant la migration : I4 échoue | low | L'ordre en usage est la migration d'abord, puis le code (mémoire de déploiement) ; noté dans les Implementation Notes | rejeté |
| 14 | blind | Le nom n'est pas en italique dans le titre de la fenêtre | false | Dans EXPERIENCE.md, l'italique marque un exemple de valeur (comme « Lucas »), pas une mise en forme | rejeté |
| 15 | blind | Supprimer une catégorie désactivée verrouille quand même toutes les actives | low | Une dizaine de lignes, un verrou de quelques millisecondes | rejeté |
| 16 | blind | Des tests vérifient le texte du code (regex) plutôt que le comportement | low | Même usage qu'en 4.1 (P1 lit avec la clé secrète, non simulée) | rejeté |
| 17 | blind | `messageEchecCategorie` mal placé ; liste de refus commune à deux opérations | low | Le serveur ne renvoie que ses propres messages ; aucun tort nommé | rejeté |
| 18 | blind | La réponse n'est pas comparée à la demande (`active`, `id`) | low | La base renvoie la ligne qu'elle a verrouillée ; aucun chemin ne donne une autre ligne | rejeté |
| 19 | blind | I4 emprunte `MESSAGES_LISTE.desactivee` | low | Même texte, une seule source ; aucun tort | rejeté |

## Design Notes

`modifier_categorie` fait une seule opération par appel. Pour désactiver ou supprimer une catégorie active, elle verrouille d'abord **toutes** les catégories actives (`select … where active order by id for update`), dans un ordre fixe pour éviter un interblocage, puis elle les compte. Deux administrateurs qui désactivent chacun l'une des deux dernières catégories passent donc l'un après l'autre, et le second est refusé. Supprimer une catégorie désactivée ne change pas le nombre de catégories actives. Avant de supprimer, la fonction vérifie `exists (select 1 from demandes where categorie_id = …)`. Une `foreign_key_violation` pendant le `delete` donne aussi NV504.

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase migration list --remote` (dev) -- expected: 21 migrations, dont la nouvelle.

**Manual checks:**
- `npm run dev` : vérifier les quatre critères avec le compte administrateur, avec P1 dans un autre onglet et une demande d'essai.
