---
title: 'Story 1.2 — Enregistrer les erreurs pour le support'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '9db4859c6cec39444f1d0617d1222f3d9938e359'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aujourd'hui, une erreur affiche l'écran anglais de Next.js et ne laisse aucune trace durable (les journaux de Vercel ne durent qu'une heure) : le support ne peut pas retrouver un problème, et l'utilisateur voit un détail technique.

**Approach:** Créer la table `journal_technique` et son unique chemin d'écriture (`ecrire_journal` → `journaliser()`), enregistrer les erreurs de page (`onRequestError`) et d'action (enveloppe commune) avec un code court, afficher S2 et S3 selon EXPERIENCE.md, et fournir des pages d'essai pour le vérifier.

## Boundaries & Constraints

**Always:** AD-12 (format `{ ok, … }`, 8 codes fermés, erreur prévue jamais levée) ; AD-13 (écriture uniquement par `journaliser`, liste fermée des 14 événements, jamais de mot de passe ni de donnée de demandeur : on garde le chemin de la page **sans** ses paramètres, jamais le message de l'erreur) ; AD-9 (RLS activé, aucun droit direct sur la table, fonction `security definer`, `search_path = ''`, exécution réservée à `service_role`) ; textes exacts d'EXPERIENCE.md ; tokens de DESIGN.md ; dates « 8 nov. 2026, 9 h 14 » en heure de Paris ; un échec d'écriture du journal ne casse jamais la page.

**Never:** règle ESLint sur la clé secrète (story 1.3) ; connexion, garde ou lien « Retour aux demandes » (stories 1.6 et 1.8) ; téléphone de Nova sur S3 (table `parametres`, story 1.3) ; écran de consultation du journal ; pages d'essai accessibles en production ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Erreur de page | ouvrir `/essais/erreur` (dev) | S3 : message, « Réessayer », « Déposer une demande », ligne « Code : X · date · /essais/erreur » ; ligne `erreur` / `erreur_inattendue` avec le même code | journal injoignable → S3 s'affiche quand même |
| Adresse inconnue | `/nimporte-quoi` | S2 « Cette page n'existe pas ou a été supprimée. » + « Déposer une demande » | N/A |
| Erreur prévue | action d'essai | `{ ok: false, code: "VALIDATION", message, champs }`, rien au journal | N/A |
| Erreur imprévue | action d'essai qui lève | `{ ok: false, code: "ERREUR_INTERNE", message, codeSupport }` + ligne au journal | journal injoignable → même réponse |
| Production | `/essais/*` ou action d'essai | S2 / `INTROUVABLE` | N/A |

</frozen-after-approval>

## Code Map

- `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/{logo,ui/button}.tsx` -- réutiliser `Logo`, `Button` (variantes `principal`, `secondaire`), classes de tokens ; ne pas modifier.
- `src/proxy.ts`, `src/lib/supabase/*` -- `[ADOPTED]`, ne pas toucher.
- `next.config.ts` -- `cacheComponents: true` : une page qui lève au rendu casse `next build` ; les pages d'essai appellent `notFound()` hors développement, avant tout calcul.
- Next 16 : `error.tsx` reçoit `{ error, retry }` (`retry`, pas `reset`) ; `error.digest` = empreinte décimale (`string-hash`) posée par Next, identique dans `onRequestError` ; `global-error.tsx` doit inclure `<html>`, `<body>`, `globals.css` et Inter ; `unstable_rethrow` (next/navigation) pour laisser passer `redirect`/`notFound`.
- `server-only` : résolu par Next, absent de `node_modules` → alias vers un module vide dans `vitest.config.mts`.
- `.env.local` -- n'a pas encore `SUPABASE_SECRET_KEY` : Aurel doit l'ajouter (clé du projet dev).
- `supabase/migrations/20261108201012_socle_droits.sql` -- modèle des révocations ; la nouvelle migration suit son style.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<horodatage>_journal_technique.sql` -- table (uuid, `date_creation`, `niveau` et `evenement` en listes fermées par contrainte, `details` jsonb, `code_erreur`), index sur la date, RLS sans règle, droits retirés à `anon`/`authenticated`/`service_role`, fonction `ecrire_journal` protégée, exécutable par `service_role` seul -- AD-9, AD-13, AD-16.
- [x] `src/shared/reponse.ts` -- types `Reponse<T>`, `CodeErreur`, aides `succes()` / `echec()` -- AD-12.
- [x] `src/shared/code-support.ts` -- `codeDepuisDigest()` (décimal → base 36 majuscules) et `nouveauCodeSupport()` (aléatoire, même forme) -- un seul format de code.
- [x] `src/shared/dates.ts` -- `formaterDateHeure()` au format UX, heure de Paris.
- [x] `src/server/supabase-secret.ts` -- client clé secrète, `server-only`, sans session -- AD-9.
- [x] `src/server/journal/index.ts` -- `journaliser(niveau, evenement, details, codeErreur?)` via `ecrire_journal` ; ne lève jamais -- AD-13.
- [x] `src/server/actions/enveloppe.ts` -- `executerAction(fn)` : relance les erreurs internes de Next, journalise l'imprévu avec un code, renvoie `ERREUR_INTERNE` -- AD-12.
- [x] `src/instrumentation.ts` -- `onRequestError` → `journaliser("erreur", "erreur_inattendue", { page, route, type }, codeDepuisDigest(digest))` -- AD-12.
- [x] `src/components/ecran-erreur.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx` -- S3 et S2 -- UX-DR19.
- [x] `src/app/essais/{page,erreur/page,action/page}.tsx`, `src/server/actions/essais.ts` -- pages et actions d'essai, développement seulement.
- [x] `tests/socle/*.test.ts(x)` -- format de réponse, codes, dates, enveloppe, instrumentation, journal (client simulé), migration (texte), S2/S3 (rendu).

**Acceptance Criteria:**
- Given `/essais/erreur`, when je l'ouvre, then S3 affiche « Une erreur inattendue s'est produite. », un code court, l'heure et la page.
- Given ce code, when je filtre `journal_technique` sur `code_erreur` dans Supabase, then je trouve la ligne, niveau `erreur`, avec sa date.
- Given une adresse inexistante, when je l'ouvre, then S2 « Cette page n'existe pas ou a été supprimée. » s'affiche.
- Given l'action d'essai « erreur prévue », when je l'appelle, then elle répond `ok: false`, un code de la liste fermée et un message en français.

## Design Notes

Le code court vient de l'empreinte de Next pour les erreurs de page (S3 la lit dans `error.digest`, le serveur dans `onRequestError` : même calcul des deux côtés, sans échange), et d'un tirage aléatoire pour les actions. Une erreur levée dans le navigateur n'a pas d'empreinte : S3 s'affiche sans code et rien n'est journalisé (l'enregistrer demanderait une porte publique d'écriture, à protéger plus tard).

**Décision d'Aurel (19 nov. 2026), après vérification à l'écran :** la même erreur de page donne toujours le même code (l'empreinte de Next.js dépend du contenu de l'erreur), alors que chaque erreur d'action a son propre code. On garde ce fonctionnement. Le support retrouve la bonne ligne avec le code **et** l'heure affichés par S3. Solutions écartées : faire demander un code au serveur par l'écran S3 (porte d'écriture publique avant l'anti-spam), ou un code unique seulement pour la lecture des données (couverture partielle, pièce de la story 1.8).

## Verification

**Commands:**
- `npm run lint` -- expected: aucune erreur.
- `npx tsc --noEmit` -- expected: aucune erreur.
- `npm run test` -- expected: tests verts.
- `npm run build` -- expected: build réussi (pages d'essai en 404).

**Manual checks:**
- `npm run dev` : `/essais/erreur`, `/nimporte-quoi`, `/essais/action` ; puis la ligne du code dans `journal_technique` (après migration et clé secrète).

## Implementation Notes

- Textes de S2/S3 et du message `ERREUR_INTERNE` centralisés dans `src/shared/messages.ts` (apostrophe droite, comme dans EXPERIENCE.md).
- `executerAction(fn, action?)` : le nom facultatif de l'action est enregistré dans `details` (`{ type: "action", action }`), jamais le message de l'erreur.
- `journaliser` abandonne l'écriture après 3 s (`abortSignal`) pour ne pas bloquer la page.
- Liens « Déposer une demande » vers `/` (le formulaire arrive en story 1.3), via `next/link` (règle ESLint `no-html-link-for-pages`).
- Vérifié en dev : `/essais/erreur` → `onRequestError` reçoit `digest` 4004721091, code `1U8B2KJ` (même calcul que S3) ; sans clé secrète, l'échec du journal est seulement signalé dans la console.
- Vitest échoue (« reading 'config' ») si lancé depuis un dossier `c:\…` en minuscule (Git Bash) : lancer depuis `C:\…` (PowerShell). Problème d'environnement préexistant.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind | Erreur imprévue d'action : message et pile perdus partout | medium | `executerAction` attrape l'erreur, Next ne la voit plus, rien dans la console | patch (console serveur seulement) |
| 2 | blind | `code_erreur` accepte 8 caractères, le format en annonce 7 | low | regex `{1,8}` contre `{1,7}` dans code-support.ts | patch |
| 3 | blind | Pas d'index sur `code_erreur`, colonne filtrée par le support | low | seul `date_creation` indexé | patch (index partiel) |
| 4 | blind + verif | `error.tsx` / `global-error.tsx` jamais rendus en test | medium | aucun import dans `tests/` | patch |
| 5 | verif | Noms des paramètres `ecrire_journal` / `journaliser` non comparés | medium | un renommage couperait le journal sans test rouge | patch |
| 6 | verif | Garde `notFound()` des pages d'essai non testée | medium | suppression de la garde sans test rouge | patch |
| 7 | blind | Pas de durée de conservation du journal | low | architecture §10 la reporte à la doc « Données personnelles » | defer |
| 8 | edge | Erreur de composant client rejouée dans le navigateur : S3 sans code alors que le journal a une ligne | maybe-false | dépend du rejeu côté navigateur ; heure et page de S3 permettent de retrouver la ligne | defer (avec erreurs navigateur) |
| 9 | blind | Attente jusqu'à 3 s du journal dans une action en échec | low | seulement si la base est lente ; `after()` ajoute de la complexité | rejeté |
| 10 | blind | Même code pour la même erreur répétée, codes page/action sans préfixe | low | S3 montre aussi l'heure et la page ; `details.type` distingue | rejeté |
| 11 | blind | Chemin dynamique journalisé en entier | low | aucune route ne porte de donnée de demandeur ; une référence est permise (AD-13) | rejeté |
| 12 | blind + edge | Heure de S3 figée si « Réessayer » échoue encore | low | le code reste le même ; écart de quelques secondes | rejeté |
| 13 | blind | Réglage Inter copié dans `global-error.tsx` | low | deux copies commentées, imposées par Next | rejeté |
| 14 | blind | Liens `<a>` sur `/essais` | low | page d'essai, chargement complet voulu | rejeté |
| 15 | blind | Tests faibles (regex gloutonne, délai 3 s, `notFound` dans l'enveloppe) | low | cosmétique, comportement couvert ailleurs | rejeté |
| 16 | edge | Empreinte non décimale → pas de code | false | aucun code du projet ne pose d'empreinte ; Next calcule toujours un nombre | rejeté |
| 17 | edge | Rejet d'une action d'essai remonte vers S3 | low | page d'essai seulement, S3 est alors le bon écran | rejeté |
