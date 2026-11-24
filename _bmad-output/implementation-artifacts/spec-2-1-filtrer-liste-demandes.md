---
title: 'Story 2.1 — Filtrer la liste des demandes'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: 'c3210942b86dd8bc04d81042deccbde02778f04f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur « Demandes », on peut chercher un texte mais pas restreindre la liste à un statut, une catégorie ou un canal : impossible de ne voir, par exemple, que les demandes *Nouvelle* de la catégorie *Problème technique*.

**Approach:** Sous la barre de recherche, une rangée « Filtres » avec trois boutons de filtre (« Statut : **Tous** », « Catégorie : **Toutes** », « Canal : **Tous** ») qui s'appliquent tout de suite, se combinent avec la recherche, et sont gardés dans l'adresse (`statut`, `categorie`, `canal`). Une nouvelle migration ajoute ces trois filtres à `lister_demandes` et une fonction qui donne les catégories au filtre. « Réinitialiser » apparaît dès qu'un filtre est actif.

## Boundaries & Constraints

**Always:** convention « Adresse de la liste » (codes fermés pour `statut` et `canal`, UUID pour `categorie` ; un changement de filtre revient à la page 1 ; pagination, lien vers le détail et fil d'Ariane gardent `q` + filtres) ; une seule fonction de lecture paginée qui renvoie la page et le total ; AD-7, AD-9 (`security definer`, `search_path = ''`, `authenticated` seul, aucune table lisible directement) ; AD-12/AD-13 (ni texte cherché ni filtre dans le journal) ; AD-16 (nouvelle migration, anciennes intactes) ; libellés des statuts et canaux pris dans `src/shared/libelles.ts` ; bouton de filtre de DESIGN.md (36 px, bordure grise, actif : fond `primary-soft`, bordure et texte bleus, icône « curseurs » devant « Filtres ») ; étiquette visible, utilisable au clavier ; nombre de résultats affiché et annoncé à chaque changement ; pendant la lecture, résultats précédents estompés ; marche sans JavaScript (même formulaire `GET` que la recherche).

**Never:** filtres Priorité, Attribution, « Sans activité », « À traiter » et clic sur la carte (2.2, epic 6) ; saisie téléphone/email (2.3) ; index de rapidité (6.8) ; modification des anciennes migrations ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Trois conditions | Statut *Nouvelle* + catégorie *Problème technique* + « imprimante » | seules les demandes qui remplissent les trois ; « N demandes » | N/A |
| Un seul filtre | `?canal=telephone` | demandes reçues par téléphone ; bouton Canal actif | N/A |
| Rien ne correspond | filtres sans résultat | « Aucune demande trouvée » + « Vérifiez l'orthographe ou retirez des filtres. » + « Réinitialiser » | N/A |
| Réinitialiser | un filtre actif (avec ou sans recherche) | `/demandes` : toute la liste, champ vide, filtres « Tous » | N/A |
| Retour du détail | filtres + `q` + page 2, ouvrir une ligne, Retour ou fil d'Ariane | mêmes filtres, recherche et page ; tous dans l'adresse | N/A |
| Valeur inconnue | `?statut=abc`, `?canal=fax`, `?categorie=pas-un-uuid` ou UUID d'aucune catégorie | filtre ignoré (« Tous »), liste non filtrée | N/A |
| Catégorie désactivée | catégorie inactive en base | proposée après les actives, sous un trait, suivie de « (désactivée) » ; filtrable | N/A |
| Catégories illisibles | panne de la lecture des catégories | bouton Catégorie désactivé ; le reste marche | journalisée avec un code |
| Panne de la liste | lecture impossible | « Impossible de charger les demandes. » + « Réessayer » ; filtres utilisables | journalisée, sans filtre ni texte |

## Decisions (validées par Aurel, 2026-11-24)

- « Réinitialiser » (bouton secondaire, à droite des filtres) retire filtres **et** recherche : « toutes les demandes réapparaissent ». Il n'apparaît pas pour une recherche seule (UX : « dès qu'un filtre est actif ») ; l'état sans résultat garde le sien.
- Un changement de filtre remplace l'adresse (`replace`), comme la recherche : Retour depuis le détail ramène à la liste filtrée, sans repasser par chaque filtre essayé.
- Bouton de filtre = liste déroulante du navigateur habillée en bouton (`<label>` « Statut : » + `<select>` + chevron) : clavier et lecteurs d'écran natifs.
- Migration : l'agent essaie `npx.cmd supabase db push --remote --yes` sur dev ; en cas de refus, il donne la commande à Aurel.
- Plan gardé entier (environ 2 700 tokens).

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261121090000_recherche_demandes.sql` -- `lister_demandes(p_page, p_taille, p_q)` et `normaliser_recherche` : modèle à reprendre, ne pas modifier.
- `supabase/migrations/20261119180000_depot_demande.sql` -- `categories(id, nom, active, ordre)`, `demandes.canal`, `demandes.categorie_id` ; lisibles seulement par `service_role`.
- `supabase/migrations/20261120230000_liste_demandes.sql` -- `exiger_utilisateur_interne()`.
- `src/shared/adresse-liste.ts` -- `EtatListe`, `suiteListe`, `adresseListe`, `adresseDetail`, `lireRecherche` : ajouter les filtres ici (seule définition).
- `src/server/lectures/demandes.ts` -- `lireListeDemandes(page, q)`, `lire()`, `essai()`, `reponseInattendue` ; `FORME_IDENTIFIANT` (`src/shared/schemas/depot.ts`).
- `src/app/(interne)/demandes/contenu-demandes.tsx` -- lecture des paramètres, annonce, choix vide / sans résultat / tableau.
- `src/app/(interne)/demandes/[reference]/contenu-demande.tsx:116` -- `retour` : garder les filtres.
- `src/components/interne/recherche-demandes.tsx` -- formulaire `role="search"`, minuteur 300 ms, `router.replace` en transition, resynchronisation depuis l'adresse, zone `role="status"` : y intégrer les filtres (une frappe en attente ne doit pas annuler un filtre, ni l'inverse).
- `src/components/interne/{pagination,tableau-demandes,etat-liste}.tsx` -- passent `q` : passer l'état complet.
- `src/components/ui/native-select.tsx`, `button.tsx` (`secondaire`, `sm`) ; `src/shared/constantes.ts` (`STATUTS`, `CANAUX`) ; `src/shared/libelles.ts` ; `src/shared/messages.ts` (`MESSAGES_LISTE`).
- `tests/aides/supabase-connexion.ts` -- simulation de `lister_demandes` : ajouter filtres, `categorie_id`, `lister_categories` ; `tests/liste/*`, `tests/regles/fr-12-recherche.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261122140000_filtres_demandes.sql` -- supprimer puis recréer `lister_demandes(p_page, p_taille, p_q, p_statut text, p_categorie uuid, p_canal text)` (défauts `null`) : statut/canal inconnus et catégorie inexistante ignorés ; mêmes recherche, tri, pagination, droits. Créer `lister_categories()` : `[{id, nom, active}]`, actives d'abord puis par `ordre`, appelant vérifié, `authenticated` seul.
- [x] `src/shared/adresse-liste.ts` -- `lireFiltres(parametres)` (valeurs sûres ou absentes), `EtatListe` avec `statut`, `categorie`, `canal`, `filtreActif(etat)` ; adresses dans l'ordre `q`, `statut`, `categorie`, `canal`, `page`.
- [x] `src/server/lectures/demandes.ts` -- `lireListeDemandes(page, q, filtres)` (paramètres envoyés seulement s'ils sont remplis) ; `lireCategoriesFiltre()` contrôlée par Zod.
- [x] `src/shared/messages.ts` -- « Filtres », « Statut », « Catégorie », « Canal », « Tous », « Toutes », « (désactivée) ».
- [x] `src/components/interne/filtres-demandes.tsx` + `recherche-demandes.tsx` -- rangée de filtres dans le formulaire de recherche ; changement → page 1, `replace` en transition avec le texte tapé ; « Réinitialiser » si filtre actif.
- [x] `contenu-demandes.tsx`, `contenu-demande.tsx`, `pagination.tsx`, `tableau-demandes.tsx`, `etat-liste.tsx` -- lire et transmettre l'état complet ; « Aucune demande trouvée » aussi pour des filtres sans résultat.
- [x] `tests/aides/supabase-connexion.ts`, `tests/liste/*`, `tests/regles/fr-13-filtres.test.ts` -- matrice ci-dessus, texte de la migration, adresses, rendu HTML (boutons actifs, Réinitialiser, liens qui gardent les filtres), journal sans filtre.

**Acceptance Criteria:**
- Given la liste, when je choisis *Nouvelle*, *Problème technique* et tape « imprimante », then seules les demandes qui remplissent les trois conditions s'affichent, avec leur nombre.
- Given un filtre actif, when je clique sur « Réinitialiser », then toutes les demandes réapparaissent.
- Given des filtres appliqués, when j'ouvre une demande puis reviens en arrière, then je retrouve les mêmes filtres, présents dans l'adresse.

## Implementation Notes

- **Migration pas encore appliquée sur dev** : `npx.cmd supabase db push --remote --yes` a été refusé à l'agent (permission). À lancer par Aurel, puis `npx.cmd supabase migration list --remote` (12 migrations ; la dernière, `20261122140000`, doit avoir sa colonne « remote » remplie). Le projet lié est bien dev (`aodcgbzapnruciesaycg`) : le mot « production » affiché par la CLI est l'étiquette Supabase de la branche principale de ce projet. Tant qu'elle n'est pas appliquée, « Demandes » affiche « Impossible de charger les demandes. ».
- Filtres dans le même formulaire `GET` que la recherche ; recherche et filtres partent toujours ensemble (`naviguer`), en `replace`, à la page 1. « Réinitialiser » de la rangée remet aussi l'état de la barre (`reinitialiser` : minuteur arrêté, texte et filtres vidés).
- Catégorie bien formée mais inconnue : retirée à l'écran (`filtresAppliques`) et ignorée par la base. Si les catégories n'ont pas pu être lues, la base reste seule juge (cas rare, voir triage n° 3).
- `lireCategoriesFiltre` n'applique pas `ESSAI_LISTE_DEMANDES` : une panne simulée de la liste laisse les filtres utilisables.
- Trait des catégories désactivées : `<hr>` dans `<select>` (React 19 l'accepte ; navigateurs récents).
- Nouveau test navigateur `tests/e2e/filtres-demandes.spec.ts` (sur dev, `npm run test:e2e`), pas encore lancé : il attend la migration.
- 2026-11-24 : migration appliquée sur dev par l'agent principal (`db push`, 12 migrations, projet `aodcgbzapnruciesaycg`) après l'écran d'erreur vu par Aurel (`PGRST202`) ; `tests/e2e/filtres-demandes.spec.ts` lancé sur dev : 1 réussi.
- `npm run test` à lancer depuis PowerShell (sous Git Bash, Vitest ne charge pas les fichiers).
- Vérifié à l'écran par Aurel le 24 nov. 2026 : tous les critères sont bons (filtres combinés avec la recherche, nombre de résultats, boutons actifs, « Réinitialiser », filtres gardés dans l'adresse, au retour du détail et dans la pagination, état sans résultat, clavier).
- Vérifications de l'agent : 73 fichiers de tests verts, `tsc`, lint et build sans erreur. Commit seulement après la vérification d'Aurel.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | edge + blind | « Réinitialiser » de la rangée pendant une frappe en attente (300 ms) : le minuteur part et remet l'ancien texte et les filtres | medium | Vérifié : le lien ne touche pas `minuteur` ; l'arrêt n'a lieu qu'au retour du serveur (`useLayoutEffect`), après les 300 ms possibles | patch |
| 2 | edge + blind | Filtre choisi puis « Réinitialiser » avant la réponse : l'adresse reçue reste `/demandes`, pas de resynchronisation, la liste montre encore « Nouvelle » sur une liste non filtrée | medium | Vérifié : `recue === derniereRecue` ; même cause que le n° 1 (le lien contourne l'état de la barre) | patch (avec n° 1) |
| 3 | blind + verif + edge | Catégories illisibles avec `?categorie=` : bouton « Toutes » au-dessus d'une liste filtrée ; sans JavaScript, la liste désactivée n'est pas envoyée ; branche non testée | low | Réel, mais suppose une panne de `lister_categories` alors que `lister_demandes` marche ; correction = valeur cachée + option en plus | rejeté |
| 4 | verif + blind | Comportement du composant client vérifié seulement par le texte du fichier | medium | Réel ; Vitest sans DOM, mais Playwright est installé (`tests/e2e`, story 1.12) : une étape de filtre sur dev le couvre | patch |
| 5 | verif + blind | SQL des filtres et de `lister_categories` jamais exécuté par un test | medium | Réel ; couvert par la même étape Playwright (vraie base dev) | patch (avec n° 4) |
| 6 | blind | `ListeDemandes.filtres` renvoyé mais jamais lu : deux sources pour « filtres appliqués » | low | Vérifié : `ContenuDemandes` utilise `filtresAppliques(lireFiltres(parametres))` ; suppression directe | patch |
| 7 | blind | Commentaire de la migration : un `p_categorie` mal formé n'est pas « ignoré » mais refusé (type `uuid`) | low | Vérifié : appel direct de l'API seulement ; correction du commentaire | patch |
| 8 | edge + blind | `<hr>` dans `<select>` : retiré par les navigateurs d'avant 2024, d'où une alerte au chargement | low | Seulement avec une catégorie désactivée (aucune avant 4.2) et un vieux navigateur ; le trait est demandé par l'UX | rejeté |
| 9 | blind | Condition écrite deux fois (compte et page) | low | Choix de 1.9 (n° 11) ; rapidité = 6.8 | rejeté |
| 10 | blind | Trait des désactivées non lu par les lecteurs d'écran | low | « (désactivée) » après chaque nom le dit déjà | rejeté |
| 11 | blind | Bouton Catégorie désactivé sans explication | low | Panne rare (voir n° 3) ; ajout d'un message | rejeté |
| 12 | blind | Même nombre de résultats : pas de nouvelle annonce | low | Réel mais rare ; il faudrait forcer la zone `status` | rejeté |
| 13 | blind | Espace avant « : » sécable dans les boutons | false | L'étiquette a `whitespace-nowrap` : pas de coupure | rejeté |
| 14 | blind | Type `CategorieFiltre` défini côté serveur, importé par des composants clients | low | Import de type seulement, effacé à la compilation ; pas de tort nommé | rejeté |
| 15 | blind | Sans JavaScript, adresse `?statut=&categorie=&canal=` | low | Lue correctement ; rare (même chose pour `q=` depuis 1.9) | rejeté |
| 16 | blind | Sans JavaScript, pas de bouton pour appliquer les filtres | low | Entrée dans le champ les envoie ; usage sans JavaScript improbable en interne | rejeté |
| 17 | blind | `field-sizing-content` absent de certains navigateurs | low | Repli : largeur de la plus longue option ; cosmétique | rejeté |
| 18 | blind | Liste désactivée ignorée par un envoi sans JavaScript | low | Rejoint le n° 3 | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `migration list --remote` -- expected: 12 migrations sur dev.

**Manual checks:**
- `npm run dev`, compte collaborateur de test, demandes d'essai (`npm run demandes:essai`) : les trois critères.
