---
title: 'Story 1.8 — Voir toutes les demandes et le compteur « à traiter »'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: 'efc76908b59cdf2c4827d6ada1446351a681b289'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Après la connexion, « Demandes » est une page d'attente : aucun menu, aucune demande, aucun compteur.

**Approach:** Menu latéral de l'espace interne (logo, « Demandes » + pastille, nom, rôle, « Se déconnecter », « Version v0.1.0 ») et écran I3 : carte « *N* à traiter » puis tableau paginé (25 par page, plus récentes d'abord) avec ses états vide, chargement et erreur. Une migration ajoute la définition unique de « à traiter » (AD-5) et deux fonctions de lecture SQL réservées aux utilisateurs internes actifs ; la page les appelle par `src/server/lectures`.

## Boundaries & Constraints

**Always:** AD-1 (lecture par Server Component + `src/server/lectures`, jamais depuis le navigateur), AD-5 (« à traiter » défini une seule fois en base : *Nouvelle*, ou *Urgente* non *Traitée*), AD-7 (`exigerUtilisateur()` en tête de chaque lecture), AD-9 (fonctions `security definer`, `search_path = ''`, appelant vérifié, `authenticated` seul), AD-12/AD-13 (erreur imprévue journalisée avec un code, sans donnée de demandeur), AD-16 (nouvelle migration), AD-19 (tokens, lucide-react) ; RM-6 (aucun filtre par personne) ; textes exacts d'EXPERIENCE.md ; libellés des statuts dans `src/shared/libelles.ts` ; dates au format « 8 nov. 2026, 9 h 12 » ; vrai tableau `<table>` ; badges écrits en toutes lettres ; lecture de l'adresse (`?page=`) sous `<Suspense>`.

**Never:** recherche (1.9), filtres, nombre de résultats et bouton « Réinitialiser » (2.1), clic sur la carte et « Tout est à jour » (2.2), « Nouvelle demande » (bouton et menu) et « Saisir une demande reçue par téléphone » (2.3), section Administration (3.x), clic sur une ligne ou lien vers le détail (1.10), colonnes et badges Should (Attribuée à, Urgente, Sans activité), menu replié et cartes sur téléphone (6.7) ; droit de lecture directe des tables ; modification des anciennes migrations ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Accueil | connecté, 5 *Nouvelle* sur 42 | carte « 5 à traiter », pastille « 5 », 25 lignes, « Demandes 1 à 25 sur 42 · Page 1 sur 2 », « Précédente » grisé | N/A |
| Page suivante | clic « Suivante » (`?page=2`) | lignes 26 à 42, « Page 2 sur 2 », « Suivante » grisé | N/A |
| Page impossible | `?page=0`, `abc`, `-3` | page 1 | N/A |
| Page trop loin | `?page=9` avec 2 pages | dernière page | N/A |
| Une seule page | ≤ 25 demandes | « Page 1 sur 1 », deux boutons grisés | N/A |
| Base vide | 0 demande | « 0 à traiter », « Aucune demande pour le moment. Les demandes déposées sur le formulaire apparaîtront ici. » à la place du tableau | N/A |
| Chargement lent | lecture > 300 ms | squelette : carte + 8 lignes grises | N/A |
| Panne de lecture | base injoignable ou refus | « Impossible de charger les demandes. » + « Réessayer » ; carte « — » ; pas de pastille | `erreur_inattendue` journalisée avec un code |
| Appel direct | fonction SQL appelée sans profil actif, ou mot de passe à changer | refus `NV201` | N/A |

## Decisions (Aurel, 2026-11-20)

- Sous-texte de la carte : « Nouvelles » (« + urgentes non traitées » viendra avec FR-19).
- Données d'essai : commande `npm run demandes:essai` (`.env.local` seulement, projet affiché et « oui » demandé, comme `compte:creer`) qui dépose 30 demandes fictives par `src/server/depot`.
- États à l'écran : réglage réservé au développement `ESSAI_LISTE_DEMANDES=vide|lent|erreur` dans `.env.local`, lu seulement quand `NODE_ENV` vaut `development` ; décrit en commentaire dans `.env.example`.
- Plan gardé entier (environ 2 700 tokens).
- Migration : comme en 1.6/1.7, l'agent essaie `npx.cmd supabase db push --remote` sur dev ; en cas de refus, il donne la commande à Aurel.

</frozen-after-approval>

## Code Map

- `src/app/(interne)/layout.tsx` -- en-tête provisoire (1.6) à remplacer par le menu latéral ; garder `RechargementSiRestauree` ; lecture sous `<Suspense>` (Cache Components).
- `src/app/(interne)/demandes/{page,contenu-demandes}.tsx` -- page d'attente ; `page.tsx` passe la promesse `searchParams` à `ContenuDemandes` sous `<Suspense>` (doc Next locale : « Move URL data behind Suspense »).
- `src/components/interne/{utilisateur-connecte,bouton-deconnexion}.tsx` -- nom/rôle via `exigerUtilisateur`, `BoutonDeconnexion` à réutiliser dans le pied du menu.
- `src/components/logo.tsx`, `src/components/ui/button.tsx` (`secondaire`, `sm` = 36 px, `asChild`) -- à réutiliser.
- `src/server/garde/index.ts` -- `exigerUtilisateur` (en tête des lectures).
- `src/server/journal/index.ts`, `src/shared/code-support.ts` -- `journaliser("erreur", "erreur_inattendue", { type: "lecture", lecture }, code)` ; modèle : `src/server/actions/enveloppe.ts`.
- `src/lib/supabase/server.ts` -- client de session pour `rpc` (rôle `authenticated`).
- `src/shared/dates.ts` (`formaterDateHeure`), `src/shared/constantes.ts`, `src/shared/messages.ts` -- ajouter `TAILLE_PAGE = 25`, `STATUTS`, `MESSAGES_LISTE`.
- `src/app/globals.css` -- tokens déjà présents : `status-*`, `text-counter`, `spacing-sidebar`, `accent-nova*`, `animate-apres-300ms`.
- `supabase/migrations/20261119180000_depot_demande.sql` -- tables `demandes`, `categories` (RLS sans règle, aucun droit direct) : ne pas modifier.
- `tests/aides/supabase-connexion.ts` -- simulation à étendre (`rpc` de session pour les deux lectures).
- `tests/regles/rm-10-compte-desactive.test.ts`, `tests/mot-de-passe/action-choisir-mot-de-passe.test.ts`, `tests/connexion/deconnexion.test.tsx` -- appellent `ContenuDemandes()` / `UtilisateurConnecte` : à adapter.
- `package.json` -- `version` affichée (AD-17).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261120230000_liste_demandes.sql` -- colonne générée `demandes.a_traiter` (AD-5) ; index `date_depot desc, reference desc` et index partiel `where a_traiter` ; `exiger_utilisateur_interne()` (profil de `auth.uid()` actif, mot de passe choisi, sinon `NV201` ; exécutable par personne) ; `compter_a_traiter() → integer` et `lister_demandes(p_page, p_taille) → jsonb` `{ total, page, demandes: [{ id, reference, date_depot, nom, objet, categorie, statut }] }`, page ramenée entre 1 et la dernière, taille 1 à 100, tri date puis référence décroissantes ; `authenticated` seul.
- [x] `src/shared/{libelles,constantes,messages}.ts` -- libellés des statuts, `TAILLE_PAGE`, textes de l'écran.
- [x] `src/server/lectures/demandes.ts` -- `lireListeDemandes(page)` et `compterATraiter()` (`cache` de React), après `exigerUtilisateur()` ; réponse contrôlée (Zod) ; `{ ok: true, donnees } | { ok: false }`, erreur journalisée avec code.
- [x] `src/components/interne/menu-lateral.tsx` (+ lien actif client `aria-current`) -- menu de DESIGN.md ; pastille annoncée « à traiter » ; ≥ 1 024 px fixe à gauche (240 px), en dessous bandeau en haut.
- [x] `src/components/interne/{badge-statut,carte-a-traiter,tableau-demandes,pagination,etat-liste}.tsx` -- composants d'I3 ; « Réessayer » = `router.refresh()`.
- [x] `src/app/(interne)/layout.tsx`, `src/app/(interne)/demandes/{page,contenu-demandes}.tsx` -- assemblage, squelettes après 300 ms.
- [x] `src/server/lectures/essai.ts`, `.env.example` -- réglage `ESSAI_LISTE_DEMANDES` (vide : total 0 et compteur 0 ; lent : 2 s d'attente ; erreur : panne simulée, journalisée) ; sans effet hors développement.
- [x] `scripts/essai/creer-demandes-essai.ts`, `package.json` -- commande `demandes:essai` (voir Decisions) ; données clairement fictives (`@exemple.fr`).
- [x] `tests/liste/*`, `tests/regles/rm-06-toutes-les-demandes.test.ts`, tests existants -- matrice (simulation), texte de la migration, rendu HTML (badges, tableau, pagination, états, menu), lecture de `?page=`.

**Acceptance Criteria:**
- Given que je me connecte, when l'accueil s'affiche, then je vois le menu latéral (logo, « Demandes » avec sa pastille, mon nom et mon rôle, « Se déconnecter », le numéro de version) et la carte « *N* à traiter », égale au nombre de demandes *Nouvelle*.
- Given des demandes en base, when je regarde la liste, then chaque ligne montre la référence, la date de dépôt, le demandeur, l'objet, la catégorie et un badge de statut écrit en toutes lettres, des plus récentes aux plus anciennes.
- Given plus de 25 demandes, when je regarde le bas de la liste, then je lis « Page 1 sur 2 » et je peux passer à la page suivante.
- Given aucune demande, une lecture lente ou une panne, when j'ouvre la liste, then je vois le message vide, le squelette, ou « Impossible de charger les demandes. » avec « Réessayer ».

## Implementation Notes

- **Migration appliquée sur dev par l'agent** (`npx.cmd supabase db push --remote --yes`) ; `migration list --remote` montre 8 migrations. Vérifié par appel REST : `anon` et `service_role` reçoivent `42501` sur les trois fonctions. Le chemin `authenticated` (résultats réels, `NV201`) reste à voir à l'écran avec le compte de test.
- `npm run demandes:essai` n'a pas été lancé (il écrit 30 demandes sur dev après « oui ») : à lancer par Aurel. `scripts/lancer.mjs` pose désormais `NOVA_FICHIER_CLES` (chemin du fichier lu depuis la racine, barres « / ») ; la commande refuse tout autre fichier que `.env.local` à la racine. Numéros d'envoi fixes (`00000000-0000-4000-8000-0000000000NN`) : relancer ne recrée pas les demandes (AD-20).
- Panne de la **garde** (profil illisible) : la page affiche S3, comme avant (AD-7) ; seules les pannes des deux lectures donnent l'état d'erreur de la liste.
- Pastille : affichée dès que le compteur est connu, y compris « 0 » ; absente en cas de panne.
- Carte et pastille partagent `compterATraiter()` ; la carte affiche « — » si le compteur échoue, même quand la liste s'affiche.
- `?page=` : entier ≥ 1, sinon 1 ; plafonné à 1 000 000 avant l'appel (la base ramène ensuite à la dernière page).
- Sous 1 024 px : bandeau en haut (logo, « Demandes », personne, version) ; tableau dans un cadre qui défile horizontalement au besoin (les cartes sur téléphone arrivent avec 6.7).
- Le texte « Vérifiez votre connexion, puis réessayez. » de la maquette n'est pas repris : EXPERIENCE.md l'emporte.
- Tests à lancer depuis PowerShell (Vitest échoue depuis Git Bash, comme en 1.6/1.7).
- Vérification à l'écran (Aurel, 20 nov. 2026) : alerte Next.js « Blocking Route — Date.now() while prerendering » sur `PastilleATraiter` (la lecture de session de Supabase consulte l'heure). Corrigé par `await connection()` en tête de `PastilleATraiter`, puis (l'alerte s'étant déplacée) de `UtilisateurConnecte` et `ContenuDemandes`, les trois lectures de session de l'écran, comme `FormulaireCharge` (P1) ; tests adaptés.
- Vérifié à l'écran par Aurel le 20 nov. 2026 : tous les critères sont bons (pagination avec 30 demandes d'essai, états vide, lent et panne avec `ESSAI_LISTE_DEMANDES`, ligne retirée ensuite de `.env.local`) ; plus aucune alerte Next.js.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif | Fonctions SQL jamais exécutées ; règles recopiées en JavaScript dans la simulation | medium | Réel ; pas de base de test dans le dépôt (comme 1.1 à 1.7) | defer (entrée déjà écrite par l'implémentation) |
| 2 | verif | « Réessayer » vérifié seulement par le texte du fichier | low | Réel ; Vitest sans DOM ; rejoint l'entrée 1.7 sur un environnement de test du navigateur ; vérification à l'écran prévue | rejeté |
| 3 | verif | Layout interne et squelette de `/demandes` vérifiés par le texte, pas par le rendu | low | Réel : `toContain("<MenuLateral />")` passerait avec un commentaire ; le rendu statique est déjà utilisé ailleurs | patch |
| 4 | verif + blind + edge | Garde « dev seulement » fondée sur le seul nom du fichier : `../prod/.env.local` serait accepté ; ce que le lanceur écrit n'est pas testé | low | Vérifié : `nomEnv = basename(cheminEnv)` ; il faut appeler le lanceur à la main avec un autre chemin (le script npm impose `.env.local`) ; correction directe (chemin relatif à la racine) | patch |
| 5 | blind | « Tout est à jour » absent quand rien n'est à traiter | false | Exclu par l'intention : critère 2 de la story 2.2 (Never du plan, consigne d'Aurel « que cette story ») | rejeté |
| 6 | blind + edge | Départage par référence en texte : `NOVA-2026-10000` avant `9999` | low | Ne joue qu'à date de dépôt identique à la microseconde près | rejeté |
| 7 | blind | NFR-13 (5 000 demandes en moins de 2 s) non mesuré | false | Story 6.8 (« Garder une liste rapide avec beaucoup de demandes ») | rejeté |
| 8 | blind + edge | Relancer `demandes:essai` ajoute 30 nouvelles demandes identiques | low | Vérifié : `randomUUID()` à chaque dépôt ; un numéro d'envoi fixe par demande d'essai suffit (AD-20 renvoie alors la demande existante) | patch |
| 9 | blind | `@exemple.fr` n'est pas un domaine réservé | low | Aucun email n'est envoyé en v1 (7.1 Could) ; choix inscrit au plan | rejeté |
| 10 | blind | Le test « ni email ni téléphone » ne peut pas échouer | low | Réel pour le test ; sans effet à l'écran : la lecture ne recopie que les champs connus | rejeté |
| 11 | blind | Le test de la migration casse dès la migration suivante (« la dernière », 8 fichiers) | low | Vérifié ; les tests 1.6/1.7 disent « postérieure à » ; correction directe | patch |
| 12 | blind | Refus `NV201` de la base affiché comme une panne | low | Seulement si le compte est désactivé entre la garde et la lecture (millisecondes) | rejeté |
| 13 | blind | Pastille et carte peuvent différer après un changement de page | low | Voulu (Design Notes, FR-14 « au plus tard au rafraîchissement ») | rejeté |
| 14 | blind | État d'erreur non annoncé aux lecteurs d'écran ; « — » lu tel quel | low | Vérifié : aucun `role` ; `role="alert"` est une correction directe ; un texte caché pour « — » serait un texte hors UX | patch (alerte seulement) |
| 15 | blind | `?page=9` ou `abc` restent dans l'adresse | low | Il faudrait un renvoi supplémentaire ; affichage correct | rejeté |
| 16 | blind | `adressePage` écrit `/demandes` en dur au lieu d'`ADRESSE_ACCUEIL_INTERNE` ; perdra les filtres futurs | low | Constante : correction directe ; filtres : stories 1.9 / 2.1 | patch (constante) |
| 17 | blind | Cadre défilant du tableau inaccessible au clavier sur écran étroit | low | Seulement sous la largeur du tableau ; confort sur petits écrans = 6.7 | rejeté |
| 18 | blind | La panne simulée écrit de vraies lignes dans le journal dev | low | Voulu (« journalisée comme une vraie », Decisions) ; dev seulement | rejeté |
| 19 | edge | Menu fixe coupé sur un écran large mais peu haut (« Se déconnecter » inaccessible) | low | Vérifié : `lg:h-dvh` sans défilement ; ajout de `lg:overflow-y-auto` | patch |

## Design Notes

- Lecture par fonctions `security definer` plutôt que par droits directs sur les tables : un seul appel donne la page et le total (convention « Recherche » : 1.9 y ajoutera `p_q`), la définition « à traiter » reste en base, et aucune table n'est ouverte en lecture directe.
- Colonne générée `a_traiter` : la définition existe une fois ; le compteur (ici) et le filtre « À traiter » (2.2) la lisent. Aujourd'hui la priorité est toujours *Normale*, donc le compte = nombre de *Nouvelle*.
- Pastille du menu et carte lisent `compterATraiter()` (une seule lecture par requête grâce à `cache`). Le menu ne se relit pas lors du passage d'une page à l'autre : la pastille est juste au plus tard au rafraîchissement (FR-14).

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (depuis PowerShell), `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase migration list --remote` -- expected: 8 migrations sur dev.

**Manual checks:**
- `npm run dev` : les quatre critères ci-dessus avec le compte collaborateur de test.
