---
title: 'Story 2.2 — Afficher d''un clic les demandes à traiter'
type: 'feature'
created: '2026-11-24'
status: 'done'
baseline_commit: '376bcb011f5e5ac0ea6b0781112e938b0c2650db'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La carte « N à traiter » de « Demandes » affiche le nombre mais n'est pas cliquable : pour voir ces demandes, il faut choisir soi-même « Statut : Nouvelle », ce qui ne suivra plus la bonne définition quand la priorité *Urgente* arrivera (epic 6).

**Approach:** La carte devient un lien vers `/demandes?a_traiter=oui`. Une nouvelle migration ajoute à `lister_demandes` le filtre `p_a_traiter`, qui lit la colonne `demandes.a_traiter` (seule définition, AD-5) ; le filtre « À traiter » apparaît actif dans la rangée des filtres, se combine avec la recherche et les autres filtres, et suit l'adresse comme eux. Sous-texte « Tout est à jour » quand le compte vaut 0.

## Boundaries & Constraints

**Always:** convention « Adresse de la liste » (paramètre `a_traiter`, seule valeur `oui`, placé après `canal` et avant `page` ; toute autre valeur ignorée ; gardé par la pagination, le lien vers le détail et le fil d'Ariane ; un changement revient à la page 1) ; filtre lu dans la base par la colonne `a_traiter`, jamais recodé en TypeScript ni en SQL (AD-5) ; une seule fonction de lecture paginée (page + total) ; AD-7, AD-9 (`security definer`, `search_path = ''`, `authenticated` seul) ; AD-12/AD-13 (aucun filtre dans le journal) ; AD-16 (nouvelle migration, anciennes intactes) ; carte de DESIGN.md (fond `primary`, chiffre 32 px blanc, étoile 35 %), zone cliquable ≥ 44 px, focus visible, utilisable au clavier et sans JavaScript ; « 0 à traiter » + « Tout est à jour », **sans félicitations** ; « — » si le compteur est illisible ; nombre de résultats annoncé à chaque changement ; « Réinitialiser » (rangée et état sans résultat) retire aussi `a_traiter`.

**Never:** priorité *Urgente*, « + urgentes » dans le sous-texte, filtres Priorité / Attribution / « Sans activité » (epic 6) ; « Voir ses autres demandes » (2.4) ; index de rapidité (6.8) ; modification des anciennes migrations ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clic sur la carte | 5 *Nouvelle* sur 42 | `/demandes?a_traiter=oui` ; « 5 demandes », toutes *Nouvelle* ; filtre « À traiter » actif ; « Réinitialiser » visible | N/A |
| Combiné | `?a_traiter=oui&categorie=…&q=imprimante` | demandes qui remplissent toutes les conditions | N/A |
| Contradictoire | `?a_traiter=oui&statut=traitee` | « Aucune demande trouvée » + « Réinitialiser » | N/A |
| Valeur inconnue | `?a_traiter=1`, `?a_traiter=non` | filtre ignoré, liste non filtrée, filtre inactif | N/A |
| Rien à traiter | aucune *Nouvelle* | carte « 0 à traiter » + « Tout est à jour » ; tableau normal ; carte toujours cliquable | N/A |
| Après un passage *En cours* | 5 → une demande passe *En cours*, retour à la liste | carte et pastille du menu à 4 ; la liste `a_traiter=oui` ne la montre plus | N/A |
| Compteur illisible | panne de `compter_a_traiter` | carte « — », toujours cliquable | journalisée (inchangé) |

## Decisions (validées par Aurel, 2026-11-24)

- Filtre « À traiter » : un bouton **toujours présent** dans la rangée des filtres, à droite de « Canal » ; même aspect que les boutons de filtre (gris inactif, fond `primary-soft`, bordure et texte bleus actif), sans chevron ; un clic l'allume ou l'éteint, appliqué tout de suite (page 1, `replace`, texte tapé gardé).
- Clic sur la carte : **repart de zéro**, il ouvre `/demandes?a_traiter=oui` (recherche et autres filtres retirés) ; la liste montre exactement les N demandes de la carte. On peut ensuite ajouter recherche ou filtres.
- Plan gardé entier (environ 2 300 tokens), comme pour la 2.1.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261122140000_filtres_demandes.sql` -- `lister_demandes(p_page, p_taille, p_q, p_statut, p_categorie, p_canal)` : modèle à reprendre (drop + create, mêmes droits), ne pas modifier.
- `supabase/migrations/20261120230000_liste_demandes.sql:33-55` -- colonne générée `demandes.a_traiter` et index partiel `demandes_a_traiter` : la définition à lire.
- `src/shared/adresse-liste.ts` -- `FiltresListe`, `lireFiltres`, `filtreActif`, `suiteListe` : ajouter `aTraiter` (seule définition de l'adresse).
- `src/server/lectures/demandes.ts` -- `lireListeDemandes(page, q, filtres)` : envoyer `p_a_traiter: true` seulement si le filtre est choisi ; `compterATraiter()` inchangé (partagé avec la pastille via `cache`).
- `src/components/interne/carte-a-traiter.tsx` -- carte actuelle (non cliquable, commentaire « story 2.2 »).
- `src/components/interne/filtres-demandes.tsx` -- `BoutonFiltre`, `FiltresDemandes`, « Réinitialiser » ; ajouter le bouton « À traiter » (bascule, `aria-pressed`, même aspect actif), et un champ caché `a_traiter` pour l'envoi sans JavaScript.
- `src/components/interne/recherche-demandes.tsx` -- `naviguer`/`filtrer` : la bascule passe par `filtrer` ; la resynchronisation depuis l'adresse couvre le clic sur la carte (changement « venu d'ailleurs »).
- `src/app/(interne)/demandes/contenu-demandes.tsx` -- lit les filtres, passe la carte et l'état complet (`filtresAppliques` garde `aTraiter`).
- `src/components/interne/etat-liste.tsx`, `pagination.tsx`, `tableau-demandes.tsx`, `[reference]/contenu-demande.tsx` -- transmettent déjà `EtatListe` : vérifier que `aTraiter` suit.
- `src/components/interne/menu-lateral.tsx` -- pastille (même `compterATraiter`) ; `src/server/actions/changer-statut.ts:116` -- `refresh()` après un passage : critère 3 sans doute déjà tenu, à prouver par un test.
- `src/shared/messages.ts:173-176` -- `MESSAGES_LISTE` : ajouter « À traiter », « Tout est à jour », « Afficher ces demandes ».
- `tests/aides/supabase-connexion.ts:440-460` -- simulation de `lister_demandes` (ajouter `p_a_traiter` en réutilisant `aTraiter`) ; `tests/liste/*`, `tests/regles/fr-13-filtres.test.ts`, `tests/e2e/filtres-demandes.spec.ts` (modèle).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261124140000_filtre_a_traiter.sql` -- supprimer puis recréer `lister_demandes(…, p_canal text, p_a_traiter boolean default null)` : `p_a_traiter` vrai → `d.a_traiter` dans le compte et la page ; faux/`null` → pas de filtre ; reste identique ; mêmes droits.
- [x] `src/shared/adresse-liste.ts` -- `aTraiter?: true` dans `FiltresListe` (lu seulement de `oui`), compté par `filtreActif`, écrit `a_traiter=oui`.
- [x] `src/server/lectures/demandes.ts` -- transmettre le filtre.
- [x] `src/shared/messages.ts` -- nouveaux textes.
- [x] `src/components/interne/carte-a-traiter.tsx` -- lien (`next/link`) vers l'adresse de la carte ; « Afficher ces demandes → » (maquette) ; sous-texte « Tout est à jour » à 0 ; nom accessible « 5 à traiter, afficher ces demandes ».
- [x] `src/components/interne/filtres-demandes.tsx`, `recherche-demandes.tsx`, `contenu-demandes.tsx` -- filtre « À traiter » visible et actif selon la décision ; « Réinitialiser » le retire.
- [x] `tests/aides/supabase-connexion.ts`, `tests/liste/*`, `tests/regles/fr-14-a-traiter.test.ts`, `tests/e2e/a-traiter.spec.ts` -- matrice ci-dessus, texte de la migration (lit `a_traiter`, pas `statut = 'nouvelle'`), adresses, rendu HTML (lien de la carte, « Tout est à jour », bouton actif), parcours sur dev : clic sur la carte puis passage *En cours* → compteur et pastille −1.

**Acceptance Criteria:**
- Given la carte « 5 à traiter », when je clique dessus, then la liste n'affiche que ces 5 demandes et le filtre « À traiter » apparaît actif.
- Given aucune demande *Nouvelle*, when j'ouvre l'accueil, then la carte affiche « 0 à traiter » et « Tout est à jour », sans félicitations.
- Given que je passe une demande *En cours*, when je reviens à la liste, then le compteur et la pastille du menu ont baissé de 1.

## Implementation Notes

- Agent de codage : migration `20261124140000_filtre_a_traiter.sql` (condition `(not v_a_traiter or d.a_traiter)` dans le compte et la page), `relireFiltres` (relit un objet de filtres, clé `aTraiter`, sans confusion avec la clé d'adresse `a_traiter`), bouton bascule « À traiter » (`aria-pressed`, champ caché `a_traiter=oui` quand il est allumé), carte = `next/link` vers `/demandes?a_traiter=oui`, squelette de la carte `h-36`.
- `db push` refusé à l'agent de codage (permission) ; appliqué sur dev par l'agent principal le 2026-11-24 avec l'accord d'Aurel : 14 migrations, la dernière `20261124140000` présente côté « remote » (projet `aodcgbzapnruciesaycg` ; « production » est l'étiquette Supabase de la branche principale de ce projet).
- **Avant toute mise en ligne** : appliquer cette migration sur la base de prod avant le code (sinon `?a_traiter=oui` donne « Impossible de charger les demandes. »).
- Critère 3 : déjà tenu par `refresh()` de `changer-statut` (story 1.11) ; prouvé par `tests/regles/fr-14-a-traiter.test.ts` et `tests/e2e/a-traiter.spec.ts`.
- Après relecture : la carte est rendue dans `RechercheDemandes` (prop `carte`, zone `zone-carte` avec `onClickCapture` → `ouvrirATraiter` : minuteur arrêté, texte vidé, choix `{ aTraiter: true }`) ; elle reste un vrai lien. Nom accessible dédié quand le compteur est illisible.
- Vérifications de l'agent principal (2026-11-24) : lint, `tsc`, build sans erreur ; 79 fichiers / 1 493 tests Vitest verts ; `npm run test:e2e` sur dev : 4 réussis (dont `a-traiter.spec.ts`). Aucun report dans `deferred-work.md`.
- Vérifié à l'écran par Aurel le 24 nov. 2026 : tous les critères sont bons ; commit ensuite.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge | Clic sur la carte pendant une frappe en attente (300 ms) ou déjà sur `?a_traiter=oui` : la recherche tapée repart et annule « repart de zéro » | medium | Vérifié : la carte est un `<Link>` hors de `RechercheDemandes`, le minuteur n'est arrêté qu'au retour du serveur, et sans changement d'adresse rien ne se resynchronise | patch |
| 2 | edge | Clic sur la carte pendant une transition de la barre : champ et filtres affichent l'ancien état | medium | Même cause que le n° 1 | patch (avec n° 1) |
| 3 | blind + edge | Bouton « À traiter » inopérant sans JavaScript (`type="button"`) | low | Réel ; un bouton d'envoi nommé serait pris par Entrée (envoi implicite) et allumerait le filtre ; usage interne sans JavaScript improbable (comme 2.1 n° 16) ; la carte, elle, marche sans JavaScript | rejeté |
| 4 | verif + blind | `choisir` qui garde « À traiter » quand on change un autre filtre : jamais exécuté par un test | medium | Vérifié : tests Vitest en rendu statique, l'e2e ne change pas d'autre filtre | patch (étape e2e) |
| 5 | verif | Bouton bascule vérifié seulement par le texte du fichier ; jamais allumé par un test | medium | Vérifié : l'e2e l'éteint seulement | patch (avec n° 4) |
| 6 | verif + blind | `filtresAppliques` avec `a_traiter=oui` et catégorie inconnue : non testé | low | Vérifié ; correction = un cas de test | patch |
| 7 | verif | SQL de `p_a_traiter` vérifié seulement par texte et simulation | medium | Réel ; schéma habituel du dépôt : couvert par l'e2e sur dev, désormais possible (migration appliquée) | patch (lancer l'e2e) |
| 8 | edge + verif + blind | L'e2e exige « Nouvelle » sur chaque ligne, contraire à AD-5 (*Urgente* non *Traitée*) | low | Vérifié ; faux échec dès qu'une priorité existera ; correction directe | patch |
| 9 | edge + verif + blind | Test de migration figé sur 14 fichiers et « dernière migration » | low | Vérifié : cassera à la prochaine migration ; correction directe | patch |
| 10 | blind | Commentaire : l'index partiel semble servir ce filtre | low | La condition dépend d'une variable : usage non garanti ; correction de commentaire | patch |
| 11 | blind | Sous-texte « Nouvelles » alors que le filtre inclut les *Urgente* | false | Aucune priorité *Urgente* possible avant FR-19 ; « + urgentes » exclu par l'intention (epic 6) | rejeté |
| 12 | blind | Nom accessible « — à traiter… » quand le compteur est illisible | low | Vérifié ; message dédié = correction directe | patch |
| 13 | blind | Carte sans `aria-current` ; un clic déjà filtré ajoute une entrée d'historique | low | Cosmétique ; le bouton « À traiter » montre déjà l'état | rejeté |
| 14 | edge + blind | Ordre de mise en ligne : code avant migration → erreur | low | Vrai pour chaque migration ; noté dans les Implementation Notes | rejeté |
| 15 | blind | Commentaires périmés (`lireFiltres`) et lignes mal coupées | low | Vérifié ; correction directe | patch |
| 16 | blind | `choisir` pourrait être plus simple | low | Aucun tort nommé | rejeté |
| 17 | blind | Hauteur du squelette non testée | low | Cosmétique | rejeté |
| 18 | blind | Test sur le texte du composant, pas son comportement | low | Schéma du dépôt (pas de DOM dans Vitest) ; comblé par l'e2e (n° 4, 5) | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (depuis PowerShell), `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `npx.cmd supabase migration list --remote` -- expected: 14 migrations sur dev (`aodcgbzapnruciesaycg`).
- `npm run test:e2e` -- expected: parcours « à traiter » vert sur dev.

**Manual checks:**
- `npm run dev`, compte de test, demandes d'essai : les trois critères.
