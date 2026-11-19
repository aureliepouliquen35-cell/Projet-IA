---
title: 'Story 1.3 — Déposer une demande'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: 'e55958eea07f0693046cc459f22a7871d1fde8c1'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-08/mockups/key-formulaire-depot.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-08/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-08/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La page d'accueil est provisoire : un demandeur ne peut pas encore transmettre sa demande, et la base n'a aucune table pour la recevoir.

**Approach:** Remplacer l'accueil par le formulaire P1 (téléphone d'abord), vérifié par un schéma Zod unique (navigateur et serveur), et enregistrer la demande par la fonction SQL `deposer_demande`, qui attribue la référence et écrit l'événement « Demande créée ». Ajouter la règle ESLint qui réserve la clé secrète aux 4 modules autorisés.

## Boundaries & Constraints

**Always:** AD-1 (le navigateur n'appelle que la Server Function) ; AD-2 et AD-4 (aucun `insert` direct, référence `NOVA-AAAA-NNNN` calculée par la base, compteur annuel verrouillé) ; AD-9 (RLS sans règle sur les 5 tables, aucun droit pour `anon` ni `authenticated`, fonction `security definer`, `search_path = ''`, exécution par `service_role` seul) ; AD-11 (limites du PRD et messages exacts d'EXPERIENCE.md dans un seul schéma, mêmes limites en base) ; AD-12 (`executerAction`, format `{ ok, … }`) ; AD-19 (tokens, lucide-react) ; RM-1, RM-2, RM-12 gardées par la base ; rien de saisi n'est jamais effacé après une erreur ; utilisable à 360 px, au clavier, étiquettes visibles.

**Never:** écran de confirmation P2, cookie signé, numéro d'envoi unique, message « Votre demande n'a pas pu être envoyée… » avec le téléphone (story 1.4) ; champ caché anti-robots et limite d'envois (story 6.5) ; lecture des demandes, règles RLS de lecture, index de liste (1.8) ; colonnes d'attribution, de clôture, d'anonymisation, auteur interne des événements (stories qui en ont besoin) ; téléphone de Nova sur S3 ; lien « Aller au contenu » (6.7) ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Affichage | ouvrir `/` à 360 px | 7 champs étiquetés, 5 catégories (aucune présélectionnée), mention « 3 ans » avec le contact données, case, bouton « Envoyer ma demande », pas de défilement horizontal | base injoignable → S3 |
| Champ manquant | email vide ou case non cochée, puis envoi | encadré « 1 champ est à corriger » (sélection dessus, lien vers le champ), message sous le champ, saisie intacte, rien en base | N/A |
| Format et limites | `claire@`, objet de 151 caractères, description de 9 | messages exacts de l'UX ; format de l'email vérifié à la sortie du champ ; compteur en rouge au-delà de la limite, texte jamais coupé | N/A |
| Envoi correct | formulaire valide | bouton « Envoi en cours… » désactivé ; demande `NOVA-2026-0001`, `nouvelle`, `normale`, `formulaire` + événement `creation` par `demandeur` ; message provisoire de réussite avec la référence | N/A |
| Contournement | appel direct de l'action sans case, ou catégorie inactive | `{ ok: false, code: "VALIDATION", champs }`, rien en base | refus aussi par `deposer_demande` |
| Panne | la base refuse ou ne répond pas | formulaire intact, encadré d'erreur avec le message de la réponse `ERREUR_INTERNE` | journalisé par l'enveloppe |
| Clé secrète | import de `supabase-secret` hors des 4 modules | `npm run lint` signale une erreur | N/A |

## Decisions (Aurel, 2026-11-19)

- Plan gardé entier malgré sa longueur (environ 2 000 tokens), validé pour construction immédiate.
- La migration est appliquée sur la base **dev** par l'agent (`npx supabase db push --remote`), la CLI étant déjà liée et autorisée sur le poste.

</frozen-after-approval>

## Code Map

- `src/app/page.tsx` -- accueil provisoire : supprimé, remplacé par `src/app/(public)/page.tsx` (toujours l'adresse `/`, cible des liens « Déposer une demande » de S2/S3).
- `next.config.ts` -- `cacheComponents: true` : la lecture des catégories se fait dans un composant asynchrone sous `<Suspense>` (squelette sans animation), jamais dans la coque statique.
- React 19 : `<form action>` vide les champs non contrôlés après l'action → champs contrôlés, envoi par `onSubmit` + `useTransition`, `noValidate`.
- `src/server/actions/enveloppe.ts` (`executerAction`), `src/shared/reponse.ts` (`succes`, `echec`, `ErreursChamps`), `src/server/supabase-secret.ts` (`creerClientSecret`) -- à réutiliser tels quels.
- `src/components/ui/button.tsx`, `src/components/logo.tsx`, `src/lib/utils.ts` (`cn`) -- à réutiliser ; après chaque `shadcn add` : import de `cn`, classes `dark:` et couleurs par défaut à remplacer par les tokens.
- `supabase/migrations/20261119090000_journal_technique.sql` -- modèle de style (commentaires, révocations, droits de la fonction).
- `eslint.config.mjs` -- configuration à plat, sans règle maison pour l'instant.
- `tests/socle/accueil.test.tsx` -- teste l'accueil provisoire : à adapter au formulaire.
- Zod 4.6.7 présent seulement en dépendance indirecte : à déclarer dans `package.json`.
- Vitest : à lancer depuis `C:\…` (PowerShell), pas depuis Git Bash.
- Supabase CLI liée au projet dev : `npx supabase db push --remote` (application décidée par Aurel, voir Decisions). Écrire le SQL avec soin : pas de base locale (pas de Docker), une migration appliquée ne se corrige que par une nouvelle migration.
- **Ne créer aucune vraie demande sur dev** pendant la vérification : `NOVA-2026-0001` est réservée à la vérification d'Aurel, et rien ne permet de supprimer une demande. Pour essayer `deposer_demande`, utiliser une transaction annulée (`begin … rollback`) si la CLI permet d'exécuter du SQL sur dev ; sinon, le dire dans le compte rendu.
- Next.js 16 : lire le guide concerné dans `node_modules/next/dist/docs/` avant d'écrire du code Next (`01-app/02-guides/forms.md`, `01-app/01-getting-started/08-caching.md`).
- Ne pas lancer `npm run dev` en fin de travail et ne rien commiter : Aurel vérifie d'abord.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261119180000_depot_demande.sql` -- tables `categories` (5 de départ), `parametres` (une ligne, valeurs fictives en `.example`), `compteurs_reference`, `demandes` (limites, listes fermées, valeurs par défaut `nouvelle` / `normale`, case obligatoire), `evenements` ; RLS, droits ; fonction `deposer_demande` -- AD-2, AD-4, AD-9, AD-16.
- [x] `src/shared/constantes.ts`, `src/shared/schemas/depot.ts`, `src/shared/messages.ts` -- limites, schéma Zod, messages et résumé « n champ(s) » -- AD-11.
- [x] `src/server/depot/index.ts` -- `lireFormulaireDepot()` (catégories actives, contact données) et `deposerDemande()` (appel de `deposer_demande`, traduction des refus prévus) -- AD-9.
- [x] `src/server/actions/deposer-demande.ts` -- Server Function : validation qui fait foi, `executerAction` -- AD-1, AD-12.
- [x] `src/components/ui/{input,textarea,label,checkbox,native-select,alert}.tsx`, `src/components/formulaire/{champ,resume-erreurs}.tsx` -- composants habillés selon DESIGN.md -- UX-DR4, 5, 11, 13.
- [x] `src/app/(public)/{page,formulaire-depot}.tsx` -- P1 : vue sans état (testable) et composant avec état -- P1, UX-DR17.
- [x] `eslint.config.mjs` -- import de `supabase-secret` et lecture de `SUPABASE_SECRET_KEY` interdits hors des modules autorisés -- AD-9.
- [x] `tests/regles/rm-{01,02,12}-*.test.ts`, `tests/depot/*.test.ts(x)`, `tests/socle/lint-cle-secrete.test.ts` -- règles métier, matrice, migration, règle ESLint.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- noter le téléphone de Nova sur S3, promis pour 1.3 par la spec 1.2 mais absent de la story.

**Acceptance Criteria:**
- Given le formulaire ouvert à 360 px, when il s'affiche, then les 7 champs, les 5 catégories, la mention et la case sont visibles sans défilement horizontal.
- Given l'email ou la case oubliés, when j'envoie, then « 1 champ est à corriger » et le message de l'UX s'affichent, et ma saisie est intacte.
- Given un fichier hors des 4 modules qui importe la clé secrète, when je lance `npm run lint`, then une erreur est signalée.
- Given un formulaire correct, when j'envoie, then la base dev contient la demande `NOVA-2026-0001` (*Nouvelle*, *Normale*, *Formulaire*) et son événement de création par le demandeur.

## Design Notes

- Après un envoi réussi, la story 1.4 affichera P2. D'ici là, le formulaire laisse place à un encadré de réussite provisoire (« Votre demande a bien été enregistrée. » + référence), pour que l'écran réponde et que la référence puisse être comparée à la base.
- `evenements.auteur_libelle` ne connaît que `demandeur` et `systeme` ; la colonne de l'auteur interne arrive avec `profils` (1.5). Les valeurs fermées sont en minuscules sans accent, le texte affiché viendra de `libelles.ts` quand un écran en aura besoin.
- Refus prévus de `deposer_demande` : codes SQL propres (`NV001` case, `NV002` catégorie inactive), traduits en `VALIDATION` ; tout autre refus est imprévu.

## Verification

**Commands:**
- `npm run lint` -- expected: aucune erreur.
- `npx tsc --noEmit` -- expected: aucune erreur.
- `npm run test` -- expected: tests verts.
- `npm run build` -- expected: build réussi.
- `npx supabase migration list --remote` -- expected: 3 migrations appliquées sur dev.

**Manual checks:**
- `npm run dev`, `/` à 360 px : affichage, erreurs, envoi ; puis tables `demandes` et `evenements` dans le tableau de bord de dev.

## Implementation Notes

- Migration appliquée sur dev (3 migrations). Avant et après, la fonction a été essayée sur dev dans un bloc `do` qui se termine toujours par une exception : 56 vérifications réussies, rien d'enregistré (0 demande, 0 compteur ; `NOVA-2026-0001` reste libre).
- Droits : tout est retiré sur les 5 tables, y compris à `service_role`, qui garde seulement la lecture de `categories` et `parametres` (pour `lireFormulaireDepot`). Aucun `insert` direct n'est possible, même avec la clé secrète.
- Ajouts à la base non cités par la spec : colonne `categories.ordre` (ordre d'affichage = ordre de création), index « un seul nom par catégorie active », index « une seule ligne » sur `parametres`, déclencheur qui refuse de modifier `demandes.reference` (RM-2), colonne `demandes.date_derniere_activite` (AD-2).
- Pas de vérification du format de l'email en base : seulement les longueurs (AD-11), pour ne pas gêner la future anonymisation. Le format est vérifié par le schéma, avec une forme volontairement souple (`FORME_EMAIL`).
- Les longueurs sont comptées comme la base (`char_length`) : un émoji compte pour un caractère. Les textes sont nettoyés de leurs espaces de début et de fin ; le compteur affiche le nombre qui sera vérifié.
- Message ajouté, absent d'EXPERIENCE.md : « Cette catégorie n'est plus proposée. Choisissez-en une autre. » (catégorie désactivée entre l'affichage et l'envoi, refus `NV002`).
- Champ déjà en erreur : son message se met à jour pendant la saisie et disparaît dès qu'il est corrigé ; le résumé du haut suit et disparaît avec la dernière erreur.
- Squelette : visible seulement après 300 ms (`animate-apres-300ms`, ajouté à `globals.css`), sans mouvement.
- `shadcn add` avait ajouté le paquet `cn` à `package.json` : retiré, les composants importent `cn` de `@/lib/utils`.
- Délais : 8 s pour lire le formulaire, 10 s pour l'envoi. Un envoi abandonné après 10 s peut quand même avoir été enregistré : le numéro d'envoi unique de la story 1.4 couvrira ce cas.
- `tests/socle/theme.test.tsx` importait aussi l'ancien accueil : adapté, et il vérifie désormais que chaque classe du formulaire a une règle dans le thème.
- Vérifié dans Edge sans fenêtre, à 360 px, requêtes vers le serveur bloquées : pas de défilement horizontal, champs de 44 px en 16 px, « 1 champ est à corriger » avec la sélection sur l'encadré, saisie intacte, compteur rouge à 151 / 150. L'envoi réel (critère 4) reste à faire par Aurel.

- Corrections de relecture : tri de la réponse du serveur sorti dans `actionApresReponse` (fonction pure, testée) ; champs et case non modifiables pendant l'envoi ; codes `NV001` / `NV002` exportés (`CODES_REFUS_PREVUS`) et comparés au texte brut de la migration ; règle ESLint étendue aux écritures entre accents graves ; rôle de `Alert` selon la variante (`alert` pour une erreur, `status` sinon) ; texte lisible dans le squelette. Après corrections : lint, types, 268 tests et build réussis.
- Vérifié à l'écran par Aurel le 19 nov. 2026 : les 4 critères sont bons (envoi réel compris).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif + blind | Le tri de la réponse du serveur dans `envoyer` n'est exécuté par aucun test | medium | Tests en rendu statique et sur le réducteur seulement ; inverser les branches laissait la suite verte | patch |
| 2 | verif | Codes `NV001` / `NV002` non reliés entre la migration et le serveur ; SQL mis en minuscules avant comparaison | medium | `errcode = 'nv002'` (invalide) passait tous les tests | patch |
| 3 | verif + blind | Aucun test n'exécute le SQL (déclencheur, droits réels, verrou du compteur) | medium | Tests sur le texte de la migration ; effet réel prouvé une fois à la main sur dev (56 vérifications) | defer |
| 4 | blind + edge | Champs modifiables pendant l'envoi : la saisie faite à ce moment est perdue | medium | `actionDeposerDemande(etat.valeurs)` envoie l'état du clic, puis le formulaire disparaît | patch |
| 5 | blind + edge | Règle ESLint contournable avec des accents graves | low | Sélecteurs limités à `Literal` ; correction directe | patch |
| 6 | blind | `Alert` : `role="alert"` par défaut pour toutes les variantes | low | Une information affichée au chargement serait annoncée comme urgente ; correction directe | patch |
| 7 | blind | Squelette : `role="status"` sans texte, seulement un `aria-label` | low | Souvent non annoncé ; correction directe | patch |
| 8 | blind | Un test fige les lectures `.from()` de tout `src/` | medium | La première story qui lit une table (1.5, 1.8) aurait cassé ce test | patch |
| 9 | edge | Double demande après un délai dépassé ou une réponse perdue | medium | Réel, mais le numéro d'envoi unique est exclu par l'intention (story 1.4, AD-20) | rejeté (story 1.4) |
| 10 | blind + edge | Après un refus `NV002`, la catégorie désactivée reste dans la liste | low | Demande une désactivation pendant la saisie (écran des catégories : story 4.2) ; correctif = rafraîchissement et état en plus | rejeté |
| 11 | blind | Erreurs annoncées deux fois (rôle `alert` + sélection + zones `aria-live`) | low | L'UX demande à la fois la sélection sur le résumé et l'annonce des messages ; gêne limitée à une répétition | rejeté |
| 12 | blind | La base accepte un texte fait d'espaces (`char_length` sans `btrim`) | low | Inatteignable : seul `deposer_demande` écrit, appelé par le serveur après nettoyage ; correctif = nouvelle migration | rejeté |
| 13 | blind | `categories.ordre` non modifiable ; nom unique sans `btrim` | low | Aucune exigence de réordonner (FR-26) ; `ajouter_categorie` (4.1) nettoiera le nom | rejeté |
| 14 | blind | `champs` avec une clé inconnue : résumé vide | false | L'action ne renvoie que des clés de `CHAMPS_DEPOT` (`validerDepot`, `REFUS_PREVUS`) | rejeté |
| 15 | edge | Aucune catégorie active : formulaire inutilisable | false | « Impossible par construction », aucun écran prévu (EXPERIENCE.md, P1) | rejeté |
| 16 | edge | Caractère nul ou demi-caractère isolé refusé par Postgres → erreur générique | low | Saisie impossible au clavier ; correctif = garde sur chaque champ | rejeté |
| 17 | edge | Champ facultatif d'un mauvais type : message « ne doit pas dépasser… » | low | Appel direct seulement, refusé de toute façon | rejeté |
| 18 | blind | Regex « aucune écriture directe » limitée à 200 caractères ; `Reflect.get` | low | Garde-fou contre l'oubli, pas contre un contournement volontaire ; les droits de la base font foi | rejeté |
