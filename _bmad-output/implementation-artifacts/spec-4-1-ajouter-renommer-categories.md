---
title: 'Story 4.1 — Ajouter et renommer des catégories'
type: 'feature'
created: '2026-11-26'
status: 'done'
baseline_commit: '25e0ab8588f8c758f9e9a4c434cac691a5f257a1'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les cinq catégories du formulaire sont figées depuis l'installation. Pour en ajouter une ou corriger un nom, il faut un développeur (FR-26, RM-7).

**Approach:** On crée l'écran A2 « Catégories », réservé aux administrateurs, avec le lien « Catégories » dans la section Administration du menu. En haut de l'écran : le champ « Nouvelle catégorie » et le bouton « Ajouter ». Dessous : la liste des catégories, avec « Renommer » sur chaque ligne. Le nom devient alors un champ modifiable, avec « Enregistrer » et « Annuler ». Les écritures passent par deux nouvelles fonctions SQL, `ajouter_categorie` et `modifier_categorie`. Le formulaire public, le filtre de I3 et le détail I4 relisent déjà les catégories à chaque visite : ils montrent le changement sans rien modifier de leur côté.

## Boundaries & Constraints

**Always:**
- **La protection (triple).** La page et sa lecture appellent `exigerAdministrateur()` : un collaborateur voit S1, sans aucune donnée. Les Server Functions commencent par `exigerAdministrateur()` : sinon, `ACCES_REFUSE` puis `refresh()`. Les fonctions SQL commencent par `exiger_administrateur()` (NV202). Elles sont `security definer`, avec `search_path = ''`. Le droit de les exécuter est retiré à `public`, `anon` et `service_role`, et donné à `authenticated`. On utilise la session de l'administrateur, jamais la clé secrète (AD-7, AD-9).
- **Le nom unique.** Deux catégories actives ne portent jamais le même nom, sans tenir compte des majuscules. C'est la base qui le garantit : l'index `categories_nom_actif_unique` existe déjà. La fonction transforme ce refus en NV501, même si deux administrateurs agissent en même temps. Les espaces au début et à la fin du nom sont retirés.
- **Les textes de l'UX, mot pour mot :** « Nouvelle catégorie », « Ajouter », « Renommer », « Enregistrer », « Annuler », le toast « Catégorie Facturation ajoutée. Elle est déjà proposée dans le formulaire. », « Une catégorie active porte déjà ce nom. », « Impossible de charger les catégories. » avec « Réessayer ». Un seul schéma Zod, dans `src/shared/schemas/categorie.ts` (AD-11).
- **Les comportements.** Un squelette s'affiche pendant le chargement. Pendant une action, un indicateur apparaît sur le bouton concerné. Un double clic n'envoie qu'une seule fois. Une erreur s'affiche sous le champ concerné, et la saisie est gardée. Après un ajout réussi, le champ se vide.
- **La migration.** On ajoute une nouvelle migration, sans toucher aux anciennes (AD-16).

**Never:**
- désactiver, réactiver ou supprimer une catégorie : c'est la story 4.2 ;
- les statuts, les informations générales (4.3) ;
- une écriture directe dans `categories` ;
- un événement de journal pour les catégories ;
- modifier `lister_categories` ou le formulaire public ;
- un commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ajout | « Facturation », nom libre | La catégorie est créée active, en dernière position. Toast de l'UX, champ vidé, liste à jour. Elle est proposée sur P1 à la visite suivante. | N/A |
| Ajout en double | « facturation » alors que *Facturation* est active | « Une catégorie active porte déjà ce nom. » sous le champ, saisie gardée | `CONFLIT` |
| Renommage | « Autre » → « Divers » | La ligne repasse en lecture avec le nouveau nom. Toast « Catégorie renommée ». I4 et le filtre de I3 montrent « Divers ». | N/A |
| Renommage en double | Le nom d'une autre catégorie active | Message de l'UX sous le champ de la ligne | `CONFLIT` |
| Même nom | Aucun changement | Rien n'est écrit, la ligne repasse en lecture, sans toast | N/A |
| Annuler / Échap | Pendant le renommage | Le nom d'origine revient, rien n'est envoyé | N/A |
| Nom vide | « » ou que des espaces | « Ce champ est obligatoire », rien n'est envoyé | `VALIDATION` |
| Nom trop long | Plus de 50 caractères | « Le nom ne doit pas dépasser 50 caractères », rien n'est envoyé | `VALIDATION` |
| Collaborateur | Il tape `/admin/categories` ou appelle l'action | S1 / `ACCES_REFUSE`, rien n'est écrit (NV202 côté base) | N/A |
| Supprimée entre-temps | Renommage d'une catégorie inconnue | `INTROUVABLE` puis `refresh()` | N/A |
| Panne | La base ne répond pas | « La catégorie n'a pas pu être enregistrée. Réessayez. » sous le champ, saisie gardée | code court au journal (enveloppe) |

## Decisions

- **La migration `20261126150000_categories_administration.sql`** crée trois fonctions :
  - `lister_categories_administration()` renvoie `[{ id, nom, active, nombre_demandes }]` dans l'ordre `ordre` ;
  - `ajouter_categorie(p_nom)` renvoie `{ id, nom }` ;
  - `modifier_categorie(p_categorie, p_nom)` renvoie `{ id, nom, change }`. La story 4.2 la remplacera par une version qui sait aussi désactiver et supprimer, comme pour `modifier_compte`.

  Codes d'erreur : NV501 pour un nom déjà pris, NV502 pour une catégorie introuvable, NV202 pour un non-administrateur. La migration ajoute aussi la contrainte `char_length(nom) <= 50`.
- **Les colonnes de la liste** (choix d'Aurel, 26 nov. 2026) : les quatre colonnes de l'UX dès la 4.1, soit Nom · État · Nombre de demandes · Actions. Tant que la 4.2 n'est pas faite, toutes les catégories sont « Active ». Le badge *Désactivée* est quand même prêt.
- **Textes absents de l'UX** (validés par Aurel le 26 nov. 2026) :
  - « Catégorie renommée » ;
  - « Ce champ est obligatoire » ;
  - « Le nom ne doit pas dépasser 50 caractères » ;
  - « La catégorie n'a pas pu être enregistrée. Réessayez. ».
- **La migration est appliquée sur la base dev** `aodcgbzapnruciesaycg` seulement, avec l'accord d'Aurel donné à l'approbation. Jamais sur prod dans cette story.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261119180000_depot_demande.sql:30-54` -- table `categories` (`nom`, `active`, `ordre` identité) et index unique `lower(nom) where active`. `20261126120000_supprimer_demande.sql` -- modèle d'une fonction `authenticated` qui commence par `perform public.exiger_administrateur()` (droits en fin de fichier). `20261126090000_modifier_compte.sql` -- modèle des commentaires, du retour `change` et des codes d'erreur.
- `src/server/lectures/comptes.ts` -- modèle de `src/server/lectures/categories.ts` (`cache`, `lire`, Zod, `accesRefuse` sur NV202).
- `src/server/actions/supprimer-demande.ts` -- modèle des nouvelles `ajouter-categorie.ts` et `renommer-categorie.ts` : garde, Zod, rpc par `createClient()`, `DELAI_MS`, NV202 traduit en `ACCES_REFUSE` avec `refresh()`, `refresh()` après réussite. `src/shared/reponse.ts` (`echec`, `succes`, `champs`).
- `src/app/(interne)/admin/comptes/page.tsx`, `contenu-comptes.tsx` -- modèle de `admin/categories/` (`Suspense`, `connection()`, S1, titre d'onglet neutre).
- `src/components/interne/tableau-comptes.tsx` (tableau, `BadgeDesactive`, état d'erreur, squelette) et `modifier-compte.tsx` (réducteur, verrou d'envoi, fonctions pures exportées pour les tests) -- modèles de `tableau-categories.tsx`, `ajouter-categorie.tsx` et `renommer-categorie.tsx`. `src/components/ui/sonner.tsx` (`afficherSucces`), `formulaire/champ.tsx`.
- `src/components/interne/section-administration.tsx` -- ajouter « Catégories » après « Comptes » (icône `Tags`). `src/shared/acces.ts` -- `ADRESSE_CATEGORIES = "/admin/categories"`. `src/shared/messages.ts` -- `MESSAGES_INTERNE.categories` et `MESSAGES_CATEGORIES`.
- Tests : `tests/aides/supabase-connexion.ts` (`rpcSession` : simuler les trois fonctions, NV202 sauf pour un administrateur, NV501 pour un nom déjà pris) ; `tests/comptes/*` (modèles migration, action, écran) ; `tests/regles/rm-07-administration-reservee.test.ts` (ajouter A2 et les deux actions) ; `tests/liste/menu-lateral.test.tsx` ; `tests/e2e/administration.spec.ts` (un collaborateur voit S1 sur `/admin/categories`).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261126150000_categories_administration.sql` -- les trois fonctions, la contrainte de longueur et les droits.
- [x] `src/shared/schemas/categorie.ts`, `src/shared/messages.ts`, `src/shared/acces.ts` -- le schéma, les textes et l'adresse.
- [x] `src/server/lectures/categories.ts` -- la lecture de A2.
- [x] `src/server/actions/ajouter-categorie.ts`, `renommer-categorie.ts` -- les Server Functions.
- [x] `src/components/interne/tableau-categories.tsx`, `ajouter-categorie.tsx`, `renommer-categorie.tsx` -- l'écran.
- [x] `src/app/(interne)/admin/categories/page.tsx`, `contenu-categories.tsx` ; `section-administration.tsx` -- la page et le lien du menu.
- [x] Tests -- couvrir la matrice : la migration (texte), les actions (administrateur, collaborateur, doublon, introuvable, panne, validation), l'écran, les fonctions pures, RM-7, le menu et l'e2e collaborateur.

**Acceptance Criteria:**
- Given la page « Catégories », when j'ajoute *Facturation*, then je lis « Catégorie Facturation ajoutée. Elle est déjà proposée dans le formulaire. », et elle apparaît dans le formulaire public.
- Given une catégorie active *Facturation*, when j'ajoute ou renomme une autre catégorie en *Facturation*, then je lis « Une catégorie active porte déjà ce nom. »
- Given une catégorie renommée, when j'ouvre une demande qui l'utilise, then le nouveau nom s'affiche.

## Implementation Notes

- Agent de codage (2026-11-26) : tout est construit. Lint, tsc, `npm run test` (103 fichiers, 2229 tests) et `npm run build` sont au vert. **La migration n'est pas appliquée sur dev** : l'outil de sécurité a refusé `supabase db push --remote`, et ce refus n'a pas été contourné. Aurel l'applique elle-même. Le test d'essai (`--dry-run`) vise bien `aodcgbzapnruciesaycg`, avec la seule migration `20261126150000`. Les tests e2e n'ont pas été lancés, faute de migration.
- Textes ajoutés pour les lecteurs d'écran seulement (aucun texte visible nouveau) : `renommerNom`, `champRenommage`. Une catégorie mal identifiée ou `INTROUVABLE` affiche la panne validée. Pendant l'envoi, le champ passe en lecture seule (au lieu d'être désactivé) pour garder la sélection.
- `tests/regles/rm-08-pas-d-inscription.test.ts` a échoué une fois sur un passage complet (délai dépassé, machine chargée), puis il est passé seul et au passage suivant. Sans lien avec cette story.
- Après la relecture (4 corrections en 3 envois, 2 reports, 14 rejets) :
  - `refresh()` sur NV501 (ajout et renommage) et sur chaque renommage réussi ;
  - `aria-label` sur « Enregistrer » et « Annuler » de la ligne (`enregistrerNom`, `annulerNom`) ;
  - commentaire d'en-tête de l'e2e à jour.

  Agent principal : lint, tsc, `npm run test` (103 fichiers, 2229 tests) et `npm run build` sont au vert. Pas de commit : Aurel vérifie d'abord à l'écran.
- Migration appliquée sur dev par Aurel (20 migrations, `20261126150000` présente des deux côtés). L'e2e `administration.spec.ts` est passé 8/8.
- Deux défauts vus à l'écran par Aurel, puis corrigés :
  1. **« Renommer » ne faisait rien.** La ligne passait en édition, puis se refermait 12 ms plus tard. Sans clé, React réutilisait le bouton « Renommer » pour « Enregistrer » (`type="submit"`) pendant le clic. Le navigateur terminait alors le clic par un envoi du nom inchangé, ce qui donnait `inchange` puis le retour en lecture. Correction : des clés distinctes sur les trois boutons. Le défaut a été reproduit, puis la correction vérifiée, dans Chromium (Playwright) sur une page d'essai temporaire, supprimée ensuite. Les tests sans DOM ne pouvaient pas le voir : c'est le report n° 6 du tri.
  2. **Le champ vidé après un message d'erreur restait en erreur** (« Ce champ est obligatoire »). Nouvelle fonction `erreurPendantSaisie` : un champ vidé n'affiche rien, et l'obligation n'est vérifiée qu'à l'envoi (EXPERIENCE.md, Champ de formulaire). Elle s'applique à l'ajout et au renommage.

  Après ces corrections : lint, tsc et `npm run test` (103 fichiers, 2233 tests) sont au vert.
- Vérifié à l'écran par Aurel le 26 nov. 2026 : tous les critères sont bons. Commit local sur `main`, sans envoi.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | edge | NV501 sans `refresh()` (ajout et renommage) : la catégorie en conflit, ajoutée par un autre administrateur, n'est pas dans la liste affichée | low | Vérifié : seules la réussite de l'ajout et `change` vrai appellent `refresh()` ; corriger, c'est ajouter un appel | patch |
| 2 | edge | Renommage `change: false` sans `refresh()` alors que le nom affiché est périmé (renommage concurrent) | low | Même cause que n° 1 : la liste n'est pas recalculée quand la base révèle un autre état ; on retire la condition | patch (groupé avec 1) |
| 3 | blind | « Enregistrer » et « Annuler » de la ligne sans nom lié à la catégorie (lecteurs d'écran) | low | Vérifié : seul « Renommer » a un `aria-label` ; plusieurs lignes peuvent être ouvertes en même temps | patch |
| 4 | blind | Le commentaire d'en-tête de l'e2e ne cite pas la nouvelle migration | low | Vérifié ; correction directe | patch |
| 5 | verif + blind | Les vraies fonctions SQL ne sont jamais exécutées en administrateur par un test automatique | medium | Pré-vérifié ; pas de compte administrateur de test ni de Postgres local (même report qu'en 3.3, 3.5, 4.4) | defer |
| 6 | verif + blind | Les gestes avec état de A2 (Échap, verrou d'« Annuler », sélection, toast du renommage) sont vérifiés par lecture du source, ou pas du tout | medium | Pré-vérifié ; vitest sans DOM, même usage qu'en A1 | defer |
| 7 | blind + verif | P1 n'est pas testé après un ajout ou un renommage | low | Code inchangé : `lireFormulaireDepot` relit les catégories actives à chaque visite ; le critère est vérifié à l'écran | rejeté |
| 8 | blind + edge | Pas de normalisation Unicode (é composé ou décomposé), ni des espaces intérieurs | low | Réel, mais un clavier ordinaire produit la forme composée ; corriger touche le schéma et la base | rejeté |
| 9 | blind + edge | `btrim` SQL ne retire que l'espace, Zod tous les blancs : un nom fait de tabulations passe par un appel direct | low | Seul un administrateur peut faire cet appel direct ; l'application envoie toujours un nom déjà nettoyé par Zod | rejeté |
| 10 | blind | L'ancien nom peut s'afficher un instant après un renommage (mise à jour après `await`, hors transition) | maybe-false | À observer à l'écran ; si c'est vrai, c'est un simple clignotement (low) | rejeté (à observer) |
| 11 | blind | `INTROUVABLE` sans message visible (la ligne disparaît au `refresh()`) | false | Aucune suppression de catégorie n'existe en 4.1 : le cas est inatteignable | rejeté |
| 12 | blind | Plusieurs lignes peuvent être en édition en même temps | false | L'UX ne l'interdit pas, et chaque ligne a son verrou ; aucun tort nommé | rejeté |
| 13 | blind | Comptage des demandes par sous-requête, `demandes.categorie_id` sans index | low | Une dizaine de catégories, quelques milliers de demandes au plus : négligeable | rejeté |
| 14 | blind | Code de l'ajout et du renommage en double | low | Aucun tort nommé ; même modèle que A1 | rejeté |
| 15 | blind | Ordre des imports | low | Le lint l'accepte, aucun tort | rejeté |
| 16 | blind | Point final irrégulier entre les messages | false | Textes de l'UX et textes validés par Aurel, mot pour mot | rejeté |
| 17 | verif | La simulation recopie le nouveau nom dans les demandes : le test de I4 passe par construction | low | En vrai, les lectures font une jointure sur `categories` (`detail_demande.sql:94`) ; critère vérifié à l'écran | rejeté |
| 18 | edge | Nom tapé égal au nom affiché mais périmé : rien n'est envoyé | low | Suppose deux administrateurs sur la même ligne au même moment ; corriger demande une nouvelle branche | rejeté |
| 19 | edge | Délai dépassé après l'écriture : « n'a pas pu être enregistrée » pour une catégorie créée | low | Rare (8 s pour une insertion), même rejet qu'en 4.4 n° 5 ; une nouvelle tentative affiche le conflit | rejeté |
| 20 | edge | Renommer une catégorie désactivée avec le nom d'une catégorie active passe sans message | false | La règle ne vise que les catégories actives, et aucune ne peut être désactivée en 4.1 ; la réactivation (4.2) heurtera l'index | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (lancé depuis `C:\…`), `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `migration list --remote` (dev) -- expected: 20 migrations, dont `20261126150000`.

**Manual checks:**
- `npm run dev` : vérifier les trois critères avec le compte administrateur de test, sur P1 dans un autre onglet et sur une demande d'essai.
