---
title: 'Story 1.9 — Retrouver une demande par la recherche'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: '8fe49298ca2afaa7d46ef3e63b91405cd7ccf6e8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur « Demandes », on ne peut que feuilleter les pages : impossible de retrouver vite (SM-6, moins de 30 s) une demande par sa référence, son demandeur, son email, son entreprise ou son objet.

**Approach:** Barre de recherche sous la carte « à traiter » (I3) : la recherche part 300 ms après la dernière frappe ou avec Entrée, et le texte est gardé dans l'adresse (`?q=`). Une nouvelle migration ajoute `unaccent` et un paramètre `p_q` à `lister_demandes` (référence, nom, email, entreprise, objet ; sans majuscules ni accents) ; la ligne « *N* demandes » s'affiche au-dessus du tableau, et l'état « Aucune demande trouvée » remplace le tableau quand rien ne correspond.

## Boundaries & Constraints

**Always:** convention « Recherche » (une seule fonction de lecture qui renvoie la page et le total, `unaccent`) ; convention « Adresse de la liste » (`q` et `page`, une nouvelle recherche revient à la page 1, la pagination garde `q`) ; AD-1, AD-7, AD-9 (`security definer`, `search_path = ''`, `authenticated` seul), AD-12/AD-13 (le texte cherché n'est jamais journalisé : il peut contenir un nom ou un email), AD-16 (nouvelle migration, anciennes intactes), AD-19 ; textes exacts d'EXPERIENCE.md ; pastille d'icône loupe (UX-DR13) ; nombre de résultats annoncé aux lecteurs d'écran ; pendant une nouvelle recherche, le tableau précédent reste visible, estompé ; la liste n'affiche toujours ni email ni téléphone.

**Never:** filtres et bouton de filtre (2.1), clic sur la carte (2.2), « Voir ses autres demandes » (2.4), clic sur une ligne et fil d'Ariane (1.10), test de rapidité avec 5 000 demandes et index de recherche (6.8) ; lecture directe des tables ; modification des anciennes migrations ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Référence | `NOVA-2026-0042` (ou `nova-2026-0042`) | seule cette demande ; « 1 demande » | N/A |
| Accents, majuscules | `helene`, `HÉLÈNE` | trouve « Hélène Dupuis » | N/A |
| Email, entreprise, objet | une partie du texte (`dupuis@`, `boulang`) | toutes les demandes qui le contiennent, quel que soit leur statut | N/A |
| Rien ne correspond | `zzzz` | « Aucune demande trouvée » + « Vérifiez l'orthographe ou retirez des filtres. » à la place du tableau | N/A |
| Texte vide ou espaces | `   ` | liste complète, `q` retiré de l'adresse | N/A |
| Caractères spéciaux | `%`, `_`, `'`, `\` | cherchés tels quels (pas de joker) | N/A |
| Texte trop long | plus de 150 caractères (adresse tapée à la main) | coupé à 150 | N/A |
| Plusieurs pages | 30 résultats, `?q=essai&page=2` | lignes 26 à 30 ; « Précédente » garde `q` | N/A |
| Base vide | 0 demande, sans `q` | message « Aucune demande pour le moment… » (inchangé) | N/A |
| Panne | lecture impossible avec `q` | « Impossible de charger les demandes. » + « Réessayer » ; la barre reste utilisable | journalisée avec un code, sans le texte cherché |

## Decisions (Aurel, 2026-11-20)

- « Réinitialiser » (bouton secondaire) ajouté dès maintenant dans l'état « Aucune demande trouvée » : il vide la recherche et réaffiche toute la liste (adresse `/demandes`). La story 2.1 lui fera aussi retirer les filtres. Pas de « Réinitialiser » ailleurs (2.1).
- Champ de recherche comme la maquette : loupe et phrase « Rechercher par référence, nom, email, entreprise ou objet » en gris dans le champ ; pas d'étiquette visible, le nom du champ est donné aux lecteurs d'écran (`aria-label`).
- Plan gardé entier (environ 2 800 tokens).
- Migration : comme en 1.8, l'agent essaie `npx.cmd supabase db push --remote --yes` sur dev ; en cas de refus, il donne la commande à Aurel.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261120230000_liste_demandes.sql` -- `lister_demandes(p_page, p_taille)`, `exiger_utilisateur_interne()`, modèle des droits : ne pas modifier.
- `supabase/migrations/20261120090000_comptes.sql:32` -- modèle `create extension if not exists … with schema extensions`.
- `src/server/lectures/demandes.ts` -- `lireListeDemandes(page)` (`cache`), `lirePage`, `lire()` (journal sans données), `essai()` : ajouter `q`.
- `src/app/(interne)/demandes/contenu-demandes.tsx` -- lit `searchParams` ; choisit vide / erreur / tableau ; ajouter la barre et la ligne de résultat.
- `src/components/interne/pagination.tsx` -- `adressePage(page)` : à remplacer par une adresse qui garde `q`.
- `src/components/interne/etat-liste.tsx` -- `CADRE`, `PASTILLE`, `EtatListeVide` : modèle de l'état « aucune demande trouvée ».
- `src/components/ui/input.tsx`, `src/components/ui/button.tsx` (`secondaire`) -- à réutiliser.
- `src/shared/messages.ts` (`MESSAGES_LISTE`), `src/shared/constantes.ts` (`formaterNombre`, `LONGUEURS_MAXIMALES.objet` = 150), `src/shared/acces.ts` (`ADRESSE_ACCUEIL_INTERNE`).
- `tests/aides/supabase-connexion.ts` (`rpcSession`, simulation de `lister_demandes`), `tests/liste/{lecture-demandes,ecran-demandes,migration-liste-demandes}.test.ts*` -- à étendre ; le test de migration 1.8 dit « postérieure à ».
- `node_modules/next/dist/docs/` -- `useRouter`, `useTransition`, `useSearchParams` à relire avant d'écrire le composant client.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261121090000_recherche_demandes.sql` -- `unaccent` dans `extensions` ; `normaliser_recherche(text)` immuable (`lower(extensions.unaccent('extensions.unaccent'::regdictionary, …))`, exécutable par personne) ; supprimer puis recréer `lister_demandes(p_page, p_taille, p_q text default null)` : `p_q` nettoyé (espaces de bord retirés, 150 caractères au plus, vide = pas de recherche) ; correspondance par `strpos` sur la référence, le nom, l'email, l'entreprise et l'objet normalisés ; `total` = nombre de résultats ; mêmes droits.
- [x] `src/shared/adresse-liste.ts` -- `lireRecherche(valeur)` (premier si tableau, nettoyé, coupé à 150) et `adresseListe({ q, page })` (page 1 et `q` vide omis).
- [x] `src/shared/messages.ts` -- libellé de recherche, `nombreDemandes(n)` (« 1 demande », « 42 demandes »), textes de l'état sans résultat.
- [x] `src/server/lectures/demandes.ts` -- `lireListeDemandes(page, q)` → `p_q` ; réponse `recherche` pour l'écran.
- [x] `src/components/interne/recherche-demandes.tsx` (client) -- formulaire `role="search"` (`GET /demandes`, marche sans JavaScript), loupe, champ `q` (`maxLength` 150) ; 300 ms ou Entrée → `router.replace` dans une transition ; enfants estompés et `aria-busy` pendant l'attente ; texte resynchronisé si l'adresse change (bouton Retour).
- [x] `src/components/interne/{etat-liste,pagination}.tsx` -- `EtatRechercheVide` (pastille loupe, `role="status"`, lien-bouton secondaire « Réinitialiser » vers `/demandes`) ; liens de pagination par `adresseListe`.
- [x] `src/app/(interne)/demandes/contenu-demandes.tsx` -- assemblage : carte, barre, puis ligne « *N* demandes » (`role="status"`) + tableau + pagination, ou état sans résultat, vide, erreur.
- [x] `tests/liste/*`, `tests/regles/fr-12-recherche.test.ts`, `tests/aides/supabase-connexion.ts` -- matrice (simulation avec accents et majuscules), texte de la migration, adresses, rendu HTML (formulaire, ligne de résultat, état sans résultat, pagination avec `q`), absence du texte cherché dans le journal.

**Acceptance Criteria:**
- Given la demande `NOVA-2026-0042`, when je tape sa référence, then elle est la seule affichée et je lis « 1 demande ».
- Given une demandeuse « Hélène Dupuis », when je tape `helene` ou `HÉLÈNE`, then sa demande est trouvée.
- Given un texte qui ne correspond à rien, when je lance la recherche, then je lis « Aucune demande trouvée » et « Vérifiez l'orthographe ou retirez des filtres. », et « Réinitialiser » réaffiche toute la liste avec un champ vide.
- Given une recherche en cours, when je recharge la page ou partage l'adresse, then la même recherche et ses résultats s'affichent.

## Implementation Notes

- **Migration pas encore appliquée sur dev** : `npx.cmd supabase db push --remote --yes` a été refusé à l'agent (permission). À lancer par Aurel, puis `npx.cmd supabase migration list --remote` (9 migrations attendues). Tant qu'elle n'est pas appliquée, la liste simple marche encore, mais toute recherche donne « Impossible de charger les demandes. ».
- Le serveur n'envoie `p_q` que pour une recherche non vide : la liste simple reste l'appel de 1.8 (`{ p_page, p_taille }`).
- `lireRecherche` remplace les caractères de contrôle (U+0000–U+001F, U+007F) par une espace : Postgres refuse U+0000 dans un texte.
- Annonce aux lecteurs d'écran : une seule zone `role="status"` (`sr-only`), toujours présente dans `RechercheDemandes`, reçoit le texte (« 42 demandes », « Aucune demande trouvée », vide sinon) ; la ligne visible et l'état sans résultat n'ont plus de `role`.
- Un changement d'adresse venu d'ailleurs (« Réinitialiser », Retour) arrête la recherche en attente (300 ms), dans un `useLayoutEffect`. « Réinitialiser » remplace l'adresse (`replace`), comme la recherche.
- Nettoyage du texte fait deux fois, de la même façon : `lireRecherche` (bords, 150 caractères comptés comme la base, espace final retiré après la coupe) puis la fonction SQL (seconde barrière). La lecture de `?q=` sert aussi au champ (rechargement, adresse partagée).
- Composant client : `q` vient du serveur en propriété (pas de `useSearchParams`, donc pas de `<Suspense>` en plus). Resynchronisation du champ seulement si le nouveau `q` n'est pas la dernière recherche lancée par la barre (sinon la suite tapée entre-temps serait effacée). Une frappe qui ne change pas le texte nettoyé (espace au bord) ne relance pas la lecture ; Entrée relance toujours.
- Les recherches changent `searchParams` sans changer l'identité de l'arbre React (Next.js garde l'état d'un segment malgré les paramètres, `layout-router`) : le champ garde le focus et le texte, et l'ancien tableau reste affiché, estompé, pendant la transition.
- « 0 demande » (singulier) si jamais affiché ; la ligne ne s'affiche qu'avec au moins un résultat.
- Simulation : `DemandeSimulee` reçoit `email` et `entreprise` (facultative) ; recherche simulée avec `normalize("NFD")` (proche de `unaccent`, pas identique pour quelques lettres comme « œ » ou « ß »).
- Pas de test automatisé du comportement dans le navigateur (300 ms, Entrée, estompage, Retour) : pas de DOM dans Vitest ni Playwright installé. Vérifié par le texte du composant ; à voir à la main (`ESSAI_LISTE_DEMANDES=lent` rend l'estompage visible).
- Migration appliquée sur dev par Aurel (`npx.cmd supabase db push --remote --yes`) : 9 migrations. Alerte « Hydration failed » vue une fois : l'onglet était resté sur l'ancienne version pendant les corrections.
- Vérifié à l'écran par Aurel le 21 nov. 2026 : tous les critères sont bons (référence, accents et majuscules, email et entreprise des demandes d'essai, « Aucune demande trouvée » et « Réinitialiser », recherche gardée dans l'adresse, pagination).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif + blind + edge | SQL de recherche jamais exécuté ; matrice FR-12 vérifiée sur la simulation JavaScript (NFD ≠ `unaccent` pour œ, ß, ø…) | medium | Réel ; pas de base de test dans le dépôt (comme 1.1 à 1.8) ; vérification à l'écran sur dev | defer |
| 2 | verif + blind | Comportement du composant client (300 ms, Entrée, resynchronisation) vérifié seulement par le texte du fichier | low | Réel ; Vitest sans DOM (même constat qu'en 1.8, n° 2) ; vérification à l'écran prévue | rejeté |
| 3 | verif + blind + edge | Minuteur de 300 ms pas arrêté quand l'adresse change ailleurs : taper puis cliquer « Réinitialiser » (ou Suivante) en moins de 300 ms relance l'ancienne recherche | medium | Vérifié : le bloc de resynchronisation remet `texte`/`envoye` mais ne touche pas `minuteur` ; contredit le critère « Réinitialiser » | patch |
| 4 | verif | Test RM-6 relit la migration 1.8 (fonction supprimée) ; titre « n'envoie que la page et la taille » faux | low | Vérifié : `_liste_demandes.sql` chargé ; correction directe | patch |
| 5 | blind | Ligne « N demandes » et état sans résultat insérés/retirés : région annoncée créée à la volée, souvent pas lue | low | Réel : les deux `role="status"` changent de branche ; contrainte « nombre de résultats annoncé » ; une région persistante dans `RechercheDemandes` suffit | patch |
| 6 | blind + edge | `maxLength` compte en unités UTF-16, la base en caractères (émoji) | low | Réel mais sans usage courant (recherche d'émojis) | rejeté |
| 7 | blind | Pas de normalisation NFC du texte cherché | low | Texte décomposé collé : rare ; `unaccent` traite déjà les lettres usuelles | rejeté |
| 8 | blind | Focus perdu après « Réinitialiser » | low | Hors UX ; ajout de gestion du focus | rejeté |
| 9 | blind | « Réinitialiser » ajoute une entrée d'historique, contrairement à la recherche | low | Vérifié : `<Link>` simple ; Retour ramène à « zzzz » ; prop `replace` = correction directe | patch |
| 10 | blind + edge | `p_q` toujours envoyé (même `null`) : la liste sans recherche tombe en panne tant que la migration n'est pas passée | low | Vérifié (dev en panne actuellement) ; n'envoyer `p_q` que s'il est rempli = correction directe | patch |
| 11 | blind | Condition de recherche écrite deux fois (compte et page), 10 normalisations par ligne | low | Rapidité = 6.8 ; filtres = 2.1 reprendront la fonction | rejeté |
| 12 | blind | Texte cherché visible dans l'adresse (historique, journaux d'hébergement) | false | Décidé par l'architecture (convention « Adresse de la liste », paramètre `q`) | rejeté |
| 13 | blind | Commentaire faux dans le test FR-12 (« 2, 4, 6 et 20 à 40 ») | low | Vérifié ; correction directe | patch |
| 14 | blind | Sans JavaScript, `?q=+++` reste dans l'adresse | low | Rare ; il faudrait un renvoi en plus ; affichage correct | rejeté |
| 15 | blind | Commentaire de `ListeDemandes.total` ambigu | low | Vérifié ; correction directe | patch |
| 16 | edge | `?q=%00` (caractère nul) : Postgres refuse le texte, page en erreur et journal | low | Adresse tapée à la main ; remplacer les caractères de contrôle par une espace dans `lireRecherche` = correction directe | patch |
| 17 | edge | Navigation de recherche abandonnée (clic sur Suivante pendant l'attente) : champ et résultats peuvent différer | maybe-false | Dépend de l'abandon des transitions par Next ; il faudrait l'observer à l'écran ; au plus low | rejeté |
| 18 | edge | Nettoyage par expression régulière avant la coupe à 150 sur un très long `p_q` | low | Appel direct authentifié seulement ; coût négligeable | rejeté |
| 19 | verif + edge | `unaccent` déjà installé dans un autre schéma : le transtypage échoue | false | Une fonction `language sql` est vérifiée à sa création : la migration échouerait bruyamment, pas en silence ; `unaccent` n'est pas préinstallé sur Supabase | rejeté |
| 20 | edge | Texte réduit à vide par `unaccent` (accents combinants seuls) : liste complète | low | Saisie absurde ; ajout d'un drapeau | rejeté |
| 21 | edge | Simulation sans table pour ø, ß, æ, œ | low | Rejoint le n° 1 (vrai SQL non exécuté) | rejeté |

## Design Notes

- `strpos` plutôt que `like` : pas de joker à neutraliser (`%`, `_`).
- Une condition par champ (et non un texte collé) : un mot ne peut pas « déborder » d'un champ sur le suivant.
- `router.replace` (pas `push`) : taper ne remplit pas l'historique ; l'entrée courante garde `q`, donc Retour depuis le détail (1.10) retrouvera la recherche.
- La ligne « *N* demandes » s'affiche avec ou sans recherche (I3, point 5) ; 2.1 la réutilisera pour les filtres.
- Pas d'index de recherche ici : rapidité avec 5 000 demandes = story 6.8.

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (depuis PowerShell), `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `migration list --remote` -- expected: 9 migrations sur dev (comme en 1.8, sinon commande donnée à Aurel).

**Manual checks:**
- `npm run dev` : les quatre critères avec le compte collaborateur de test ; une demande « Hélène Dupuis » déposée sur le formulaire public.
