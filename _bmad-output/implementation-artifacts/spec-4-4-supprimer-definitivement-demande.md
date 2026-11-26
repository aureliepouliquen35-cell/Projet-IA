---
title: 'Story 4.4 — Supprimer définitivement une demande'
type: 'feature'
created: '2026-11-26'
status: 'done'
baseline_commit: 'beb0467c32ac53164cf20b5532596882072e2a71'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aujourd'hui, personne ne peut effacer une demande. Une personne qui exerce son droit à l'effacement (RGPD) ne peut donc pas être satisfaite (FR-28, RM-5, RM-7).

**Approach:** On ajoute une nouvelle fonction SQL `supprimer_demande`, réservée aux administrateurs : c'est le seul chemin qui efface une demande et son historique, en une seule transaction. On ajoute aussi une Server Function réservée aux administrateurs, qui écrit `demande_supprimee` au journal. Sur le détail I4, une zone administrateur en bas du panneau d'actions affiche « Supprimer la demande… ». Ce bouton ouvre une fenêtre de confirmation. Après la suppression, on revient à la liste avec un toast.

## Boundaries & Constraints

**Always:**
- **La protection.** `exigerAdministrateur()` est appelée en premier. Sinon, la réponse est `ACCES_REFUSE` puis `refresh()`, et rien n'est appelé. La fonction SQL est `security definer`, avec `search_path = ''`. Le droit de l'exécuter est retiré à `public`, `anon` et `service_role`, et donné à `authenticated`. Elle commence par `exiger_administrateur()` (NV202). Le rôle est toujours relu dans `profils` (AD-7).
- **L'effacement.** La demande est verrouillée (`for update`), puis ses événements sont effacés, puis la demande. Les événements ne sont effacés nulle part ailleurs (AD-3).
- **Le journal.** On écrit `demande_supprimee` par `journaliser()`, avec seulement `{ reference, auteur }` (l'identifiant de l'administrateur). Le journal ne contient jamais de nom, de coordonnées ni de texte du demandeur (AD-13).
- **Les textes.** Ce sont exactement ceux d'EXPERIENCE.md :
  - le bouton « Supprimer la demande… » ;
  - le titre « Supprimer définitivement la demande NOVA-… ? », avec la référence en chasse fixe ;
  - le texte « La demande et tout son historique seront effacés. Cette action est irréversible. » ;
  - les boutons « Annuler » et « Supprimer définitivement » ;
  - le toast « Demande NOVA-… supprimée ».
- **La fenêtre.** Elle fait 440 px de large au plus. La sélection se place sur « Annuler » à l'ouverture. Échap ferme la fenêtre. Pendant l'envoi, elle ne se ferme pas, et un double clic n'envoie qu'une seule fois (AD-20).
- **Le style.** Le bouton qui ouvre la fenêtre est un lien rouge en semi-gras, sans fond, avec une corbeille. Seul « Supprimer définitivement » utilise la variante `danger`.
- **Les migrations.** On ajoute une nouvelle migration et on ne touche pas aux anciennes (AD-16). L'index `evenements_demande_id_date_creation` existe déjà : il ne faut pas en créer d'autre.

**Never:**
- un `delete` direct sur `demandes` ou `evenements` depuis l'application ;
- la clé secrète pour supprimer (on utilise la session de l'administrateur) ;
- la référence ou un message dans l'adresse ;
- une suppression de vraies demandes par les tests automatiques sur dev ;
- les catégories et les informations générales (stories 4.1 à 4.3) ;
- l'anonymisation ;
- un commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Suppression | Administrateur, « Supprimer définitivement » | La demande et ses événements sont effacés. Le journal reçoit `demande_supprimee`. Toast « Demande NOVA-… supprimée ». On revient à la liste d'où l'on venait (même recherche, mêmes filtres). La carte et la pastille « à traiter » sont à jour. | N/A |
| Recherche ensuite | Même email, sa seule demande a été supprimée | « Aucune demande trouvée » | N/A |
| Annuler / Échap | Fenêtre ouverte | La fenêtre se ferme, rien n'est envoyé | N/A |
| Double clic | Deux clics sur « Supprimer définitivement » | Un seul envoi | N/A |
| Déjà supprimée | Un autre administrateur l'a supprimée avant | `INTROUVABLE`, `refresh()` : page S2 « Cette demande n'existe pas ou a été supprimée. » | N/A |
| Collègue, demande ouverte | Il clique sur un bouton de statut après la suppression | Page S2, même message (le chemin `introuvable` existe déjà) | N/A |
| Collaborateur | Il ouvre le détail | Pas de zone administrateur, pas de bouton | N/A |
| Collaborateur, appel direct | Il appelle l'action ou la fonction SQL | `ACCES_REFUSE` / NV202, rien n'est effacé | N/A |
| Rétrogradé entre-temps | Le rôle a changé pendant que la fenêtre était ouverte | `ACCES_REFUSE` puis `refresh()` : le bouton disparaît | N/A |
| Référence mal formée | Saisie invalide | `VALIDATION`, aucun appel à la base | toast d'erreur |
| Panne | La base ne répond pas | Toast d'erreur « La demande n'a pas pu être supprimée. Réessayez. ». La fenêtre se ferme, la demande reste affichée. | code court au journal (enveloppe) |

## Decisions

- **La migration `20261126120000_supprimer_demande.sql`** crée `supprimer_demande(p_reference text) returns jsonb`. Elle renvoie `{ "resultat": "supprimee" | "introuvable", "reference" }`. La référence est mise en majuscules. Aucun nouveau code NV n'est nécessaire.
- **Le texte d'erreur** « La demande n'a pas pu être supprimée. Réessayez. » n'est pas écrit dans l'UX. Il reprend le modèle de « Le statut n'a pas pu être modifié. Réessayez. ».
- **Après la réussite**, la Server Function n'appelle pas `refresh()`, sinon le détail afficherait brièvement S2. C'est le navigateur qui fait le travail : il affiche le toast, puis `router.replace(retour)`, puis `router.refresh()`. Comme pour la story 2.3, il n'y a pas de redirection serveur : le cookie de passage n'est pas nécessaire.
- **La migration est appliquée sur la base dev** `aodcgbzapnruciesaycg` seulement, avec l'accord d'Aurel au moment de l'approbation. Elle n'est jamais appliquée sur prod dans cette story.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261121200000_changer_statut.sql` -- modèle de `changer_statut` : verrou, `upper`, droits, `introuvable`. `supabase/migrations/20261124160000_comptes_administration.sql:42` -- `exiger_administrateur()` (NV202). `evenements.demande_id` est déjà en `on delete cascade` (`20261119180000_depot_demande.sql:196`), mais l'effacement des événements reste explicite.
- `src/server/actions/changer-statut.ts` -- modèle de la Server Function : `executerAction`, `lireReference`, rpc par `createClient()`, `DELAI_MS`, `reponseInattendue`. `changer-etat-compte.ts` -- modèle pour `ACCES_REFUSE` suivi de `refresh()`. Nouvelle Server Function : `src/server/actions/supprimer-demande.ts`.
- `src/server/journal/index.ts` -- `journaliser("info", "demande_supprimee", …)`. L'événement existe déjà dans la liste et dans la contrainte SQL.
- `src/shared/messages.ts:443-500` -- ajouter `MESSAGES_SUPPRESSION` (bouton, titre(référence), texte, annuler, confirmer, toast(référence), échec, nom de la zone).
- `src/components/interne/actions-statut.tsx` -- modèles à reprendre :
  - le titre en chasse fixe (`TitreFenetreRouvrir`) ;
  - le verrou d'envoi ;
  - la séparation écran sans état / composant avec état ;
  - les fonctions pures exportées pour les tests.

  Le chemin `INTROUVABLE` de ce fichier couvre déjà le cas du collègue : ne pas le modifier.
- `src/components/ui/alert-dialog.tsx`, `button.tsx` (variante `danger`), `sonner.tsx` (`afficherSucces`, `afficherErreur`). Nouveau composant `src/components/interne/supprimer-demande.tsx`.
- `src/app/(interne)/demandes/[reference]/contenu-demande.tsx` -- récupérer le rôle avec `exigerUtilisateur()`. Si la personne est administrateur, rendre la zone (bordure du haut, « Supprimer la demande… ») en bas de l'`aside`, et lui passer `reference` et `retour`. Mettre à jour le commentaire « ni zone administrateur ».
- Tests :
  - `tests/aides/supabase-connexion.ts` -- ajouter la simulation de `supprimer_demande` : NV202 sauf pour un administrateur, effacement dans `demandes`.
  - `tests/detail/*` -- modèles d'écran (`renderToStaticMarkup`).
  - `tests/regles/rm-07-administration-reservee.test.ts` -- à compléter. Nouveau `tests/regles/rm-05-suppression-historique.test.ts`.
  - `tests/e2e/administration.spec.ts` -- un collaborateur n'a pas de bouton, et l'appel direct à la vraie fonction sur une référence inexistante donne NV202.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261126120000_supprimer_demande.sql` -- créer `supprimer_demande` (voir Decisions) -- seul chemin d'effacement (AD-2, AD-3).
- [x] `src/shared/messages.ts` -- ajouter les textes exacts.
- [x] `src/server/actions/supprimer-demande.ts` -- créer la Server Function : garde, Zod, rpc, journal, `INTROUVABLE` suivi de `refresh()`.
- [x] `src/components/interne/supprimer-demande.tsx` -- créer la zone, le bouton et la fenêtre, avec ce qui se passe après la réponse.
- [x] `src/app/(interne)/demandes/[reference]/contenu-demande.tsx` -- afficher la zone pour les seuls administrateurs.
- [x] Tests -- couvrir la matrice : la migration (texte), l'action (administrateur, collaborateur, introuvable, panne, validation, journal sans donnée du demandeur), l'écran (zone visible ou non, textes, variante), les fonctions pures, RM-5, RM-7 et l'e2e collaborateur.

**Acceptance Criteria:**
- Given le détail d'une demande, when je suis administrateur, then je vois « Supprimer la demande… » en bas du panneau d'actions ; un collaborateur ne le voit pas.
- Given ce bouton, when je clique, then une fenêtre demande « Supprimer définitivement la demande NOVA-… ? » et prévient que l'action est irréversible.
- Given que je confirme, when je relance une recherche sur l'email de la personne, then je lis « Aucune demande trouvée », et le compteur ne compte plus cette demande.
- Given un collègue qui avait la demande ouverte, when il fait une action, then il voit « Cette demande n'existe pas ou a été supprimée. »

## Implementation Notes

- Agent de codage (2026-11-26) : migration appliquée sur dev `aodcgbzapnruciesaycg` (19 migrations, `20261126120000` présente côté « remote ») ; rien sur prod.
- `SupprimerDemande` : après une réussite, le verrou reste fermé et la fenêtre reste occupée jusqu'au changement de page (rien ne peut repartir) ; une redirection du serveur (session terminée) est relancée pour Next.js. Sélection sur « Annuler » et Échap : comportement par défaut de Radix, non modifié.
- Nom de la zone pour les lecteurs d'écran : « Administration de la demande » (`MESSAGES_SUPPRESSION.zone`).
- `tests/regles/rm-10-compte-desactive.test.ts` : simulation de `useRouter` ajoutée (le détail rendu en administrateur contient désormais la zone, qui utilise le routeur).
- e2e `tests/e2e/administration.spec.ts` (dev) : 6/6 au second passage ; au premier, deux délais dépassés (connexion et clic sur une ligne) au démarrage à froid de `next dev`. L'appel direct à la vraie fonction vise `NOVA-1999-9999` (inexistante) : aucune vraie demande touchée.
- Agent principal : le dossier `test-results/` du premier passage e2e contenait les identifiants du compte de test en clair (ignoré par git) : supprimé. `npm run test` relancé : 100 fichiers, 2096 tests verts. Matrice : chaque ligne couverte (`tests/suppression/*`, `tests/regles/rm-05-*`, `rm-07-*`, e2e).
- Après relecture (3 corrections, 2 reports, 8 rejets) : clé distincte pour `SupprimerDemande` ; fabrique pure `dependancesSuiteSuppression` (réussite : `setSupprimee(true)`, toast, `replace(retour)` puis `refresh()`), testée avec un faux routeur ; commentaire du toast corrigé. Lint, tsc, `npm run test` (100 fichiers, 2099 tests) et `npm run build` : verts. Pas de commit : Aurel vérifie d'abord à l'écran.
- Vérifié à l'écran par Aurel le 26 nov. 2026 : tous les critères sont bons. Commit local sur `main`, sans envoi.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge + verif | `ActionsStatut` et `SupprimerDemande`, frères dans l'`aside`, portent la même clé | low | Vérifié (`contenu-demande.tsx:177,179`) : React signale les clés en double parmi des enfants frères ; correction directe | patch |
| 2 | verif (+ blind) | Branchement du composant avec état (`setSupprimee`, `replace` puis `refresh`) jamais exécuté par un test | medium | Pré-vérifié : seules des expressions régulières sur le source et un rendu au repos | patch (fabrique pure testée) |
| 3 | blind | Commentaire du toast : « affiché au retour sur la liste » alors qu'il part du détail | low | Vérifié : `appliquerSuiteSuppression` affiche le toast avant `retourner()` ; correction directe | patch |
| 4 | blind | `demande_supprimee` écrit hors de la transaction : perdu si le journal échoue | medium | Vérifié : `journaliser()` après le retour de la fonction SQL, erreurs avalées ; même modèle que les stories 3.2 à 3.5 (AD-13 impose `journaliser()`) | defer |
| 5 | blind + edge | Délai de 8 s dépassé après la validation de la transaction : « n'a pas pu être supprimée » pour une demande effacée, et rien au journal | low | Réel mais rare (8 s pour une suppression d'une ligne) ; correction = nouvelles branches (relire, journaliser) ; une nouvelle tentative affiche S2 | rejeté |
| 6 | verif + blind | La vraie `supprimer_demande` n'est exécutée en administrateur par aucun test automatique | medium | Pré-vérifié ; pas de Postgres local ni de compte administrateur de test (même report qu'en 3.3 et 3.5) | defer |
| 7 | edge | `p_reference` nul en appel direct : `reference` nulle renvoyée | false | Le seul appelant (`actionSupprimerDemande`) envoie toujours une référence vérifiée ; un nul ne renvoie que `introuvable`, rien n'est effacé | rejeté |
| 8 | blind | Fenêtre bloquée si `router.replace` ne change pas de page | low | `retour` est toujours une adresse de la liste (`adresseListe`) ; en cas d'échec, Next.js recharge la page | rejeté |
| 9 | blind | La simulation imbrique les événements dans la demande : RM-5 ne verrait pas un oubli du `delete` des événements | false | Même oublié, `on delete cascade` (story 1.3) efface les événements : l'issue décrite ne peut pas arriver | rejeté |
| 10 | blind | `TitreFenetreSupprimer` sans repli si la référence manque du titre | false | `fenetreTitre(reference)` contient toujours `reference` telle quelle | rejeté |
| 11 | blind | Test e2e collaborateur dépendant d'au moins une demande sur dev | low | Même hypothèse que les autres tests e2e du projet | rejeté |
| 12 | blind | Garde RM-5 limitée à `.from("…")` littéral | low | Aucun tort nommé ; usage du projet | rejeté |
| 13 | blind | Tests par expressions régulières fragiles ; test simulé en double dans rm-07 et l'action | low | Usage déjà répandu (3.3 n° 16) ; aucun tort nommé | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (lancé depuis `C:\…`, lettre de lecteur en majuscule), `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `migration list --remote` (dev) -- expected: 19 migrations, dont `20261126120000`.

**Manual checks:**
- `npm run dev` : vérifier les quatre critères avec le compte administrateur et le compte collaborateur de test, dans deux navigateurs, sur une demande d'essai créée pour l'occasion.
