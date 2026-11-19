---
title: 'Story 1.4 — Recevoir la confirmation avec sa référence'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: 'fdb8e12f73c819473fd60adb0fd789b54ef1cfac'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-08/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-08/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Après l'envoi, le demandeur ne voit qu'un encadré provisoire ; actualiser ne réaffiche rien, un envoi parti deux fois crée deux demandes, et une panne n'affiche pas le message de l'UX avec le téléphone de Nova.

**Approach:** Écran P2 à `/confirmation`, alimenté par un cookie serveur chiffré et signé de 30 minutes (`src/server/passage`, AD-20) ; numéro d'envoi unique tiré à l'affichage du formulaire et enregistré par `deposer_demande`, qui renvoie la demande déjà créée au second envoi ; message de panne de l'UX avec le téléphone lu dans `parametres`.

## Boundaries & Constraints

**Always:** AD-1, AD-2 (aucune écriture directe), AD-9 (fonction `security definer`, `search_path = ''`, exécution par `service_role` seul), AD-12 (`executerAction`, format `{ ok, … }`), AD-16 (nouvelle migration ; l'ancienne `deposer_demande` à 8 paramètres reste en place), AD-19 (tokens, lucide-react), AD-20 (rien de personnel dans l'adresse, cookie `httpOnly`, `sameSite: lax`, `secure` hors développement, 30 min) ; textes exacts d'EXPERIENCE.md (P1 « Erreur technique », P2) ; contact Nova lu à chaque affichage (FR-31) ; P2 utilisable à 360 px.

**Never:** téléphone sur S3 (reste en attente dans `deferred-work.md`) ; champ caché anti-robots et limite d'envois (6.5) ; email de confirmation (FR-7) ; lien « Aller au contenu » (6.7) ; suppression de l'ancienne fonction ; lecture de la table `demandes` par l'application ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Envoi correct | formulaire valide | cookie posé, passage à `/confirmation` : titre, icône verte, « Votre référence » + référence 28 px, phrase « Notez-la… », objet, « Nous vous répondrons à {email} », « Une question urgente ? {téléphone} — {email de contact} », lien « Déposer une autre demande » | N/A |
| Actualisation | F5 sur P2 dans les 30 min | même écran, même référence, rien créé | N/A |
| Double envoi | même numéro d'envoi envoyé deux fois (réponse perdue, nouvel essai) | une seule demande ; le second envoi reçoit la référence, l'objet et l'email de la première | deux envois simultanés : verrou par numéro |
| Panne | base injoignable ou refus imprévu à l'envoi, ou réseau coupé | reste sur P1, saisie intacte, encadré « Votre demande n'a pas pu être envoyée. Vos informations sont conservées : réessayez dans un instant. Si le problème continue, appelez-nous au {téléphone}. », sélection sur l'encadré, aucune confirmation | journalisé par l'enveloppe |
| Accès direct | `/confirmation` sans cookie, cookie expiré, modifié ou d'un autre type | renvoi vers `/`, rien affiché d'une demande | N/A |
| Téléphone absent | `parametres.telephone` vide | P1 : « … écrivez-nous à {email de contact}. » ; P2 : seulement l'email de contact | N/A |

## Decisions (Aurel, 2026-11-19)

- La migration est appliquée sur la base **dev** par l'agent (`npx supabase db push --remote`).
- L'agent ajoute à `.env.local` une valeur `SECRET_COOKIES` tirée au hasard, sans l'afficher.
- Plan gardé entier malgré sa longueur (environ 2 600 tokens).

</frozen-after-approval>

## Code Map

- `src/app/(public)/formulaire-depot.tsx` -- état `reduireDepot`, `actionApresReponse`, `VueFormulaireDepot`, `ReussiteDepot` (provisoire, à supprimer), `FormulaireDepot` (envoi par `onSubmit` + `useTransition`, verrou `envoiVerrouille`, sélection sur l'encadré via `appelsEncadre`).
- `src/app/(public)/page.tsx` -- P1 ; `FormulaireCharge` (après `connection()`) lit `lireFormulaireDepot()` : y ajouter les contacts Nova.
- `src/server/depot/index.ts` -- `lireFormulaireDepot`, `deposerDemande` (rpc + `REFUS_PREVUS` `NV001`/`NV002`, délai 10 s) : passer à la nouvelle signature et au retour en ligne (référence, objet, email).
- `src/server/actions/deposer-demande.ts` -- Server Function ; y poser le cookie après réussite.
- `src/shared/messages.ts` -- `MESSAGE_DEMANDE_ENREGISTREE` (provisoire, avec point final) à remplacer par les textes de P2 et de la panne.
- `src/shared/schemas/depot.ts` -- `FORME_IDENTIFIANT` (UUID) à réutiliser pour le numéro d'envoi.
- `src/components/ui/alert.tsx`, `src/components/logo.tsx`, `src/components/ui/button.tsx` -- à réutiliser.
- `supabase/migrations/20261119180000_depot_demande.sql` -- ne pas modifier ; modèle de style. Le nouveau fichier ne doit pas finir par `_depot_demande.sql` (`tests/aides/migration-depot.ts` en attend un seul).
- `tests/depot/formulaire-depot.test.tsx`, `tests/depot/action-deposer-demande.test.ts`, `tests/socle/theme.test.tsx` -- utilisent `ReussiteDepot`, `{ type: "panne", message }` et la réponse `"NOVA-2026-0001"` : à adapter.
- Next 16 + `cacheComponents` : `cookies()` hors `<Suspense>` bloque la page (lire `04-functions/cookies.md`, `redirect.md`, `02-route-segment-config/instant.md`). Un `redirect()` sous `<Suspense>` devient une redirection côté navigateur.
- Numéro d'envoi tiré dans le navigateur avec `crypto.getRandomValues` (fonctionne aussi en `http://` sur le réseau local, contrairement à `randomUUID`) et renouvelé après une réussite : le retour arrière peut réafficher le formulaire depuis le cache.
- Vitest depuis PowerShell. Ne créer aucune vraie demande sur dev : essais SQL dans un bloc annulé.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261119210000_numero_envoi.sql` -- colonne `demandes.numero_envoi uuid` unique (facultative pour les lignes existantes) ; nouvelle `deposer_demande` à 9 paramètres : verrou par numéro, renvoi de la demande existante avant toute vérification, sinon création comme avant ; renvoie `reference, objet, email` ; droits -- AD-2, AD-9, AD-20.
- [x] `src/server/passage/index.ts` -- écrire et lire le cookie de confirmation (AES-256-GCM, clé dérivée de `SECRET_COOKIES`, nom du cookie lié au contenu, expiration dans le contenu aussi) ; secret absent ou trop court → erreur -- AD-20.
- [x] `src/server/depot/index.ts`, `src/server/actions/deposer-demande.ts` -- numéro d'envoi vérifié, nouvelle signature, cookie posé ; `lireContactsNova()` (téléphone, email de contact).
- [x] `src/shared/messages.ts` -- textes de P2 et message de panne (avec ou sans téléphone).
- [x] `src/app/(public)/formulaire-depot.tsx`, `src/app/(public)/page.tsx` -- numéro d'envoi, message de panne, passage à `/confirmation`, suppression de `ReussiteDepot`.
- [x] `src/app/(public)/confirmation/page.tsx` -- écran P2 ; sans cookie valable, renvoi vers `/`.
- [x] `tests/depot/*`, `tests/socle/theme.test.tsx`, `tests/regles/rm-02-*` -- matrice ci-dessus, cookie (aller-retour, modifié, expiré, autre nom), migration.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- retirer plus tard l'ancienne `deposer_demande` à 8 paramètres.

**Acceptance Criteria:**
- Given une demande enregistrée, when P2 s'affiche, then je lis « Votre demande a bien été enregistrée », la référence en grand, l'objet, mon email et le téléphone de Nova.
- Given P2, when je l'actualise, then la même référence s'affiche et aucune deuxième demande n'est créée.
- Given une panne à l'envoi, when j'envoie, then je reste sur le formulaire avec ma saisie, le message de l'UX et le téléphone, sans confirmation.
- Given `/confirmation` ouverte sans venir du formulaire, when la page se charge, then je suis renvoyé au formulaire, sans aucune information d'une demande dans l'adresse ni à l'écran.

## Implementation Notes

- **Migration non appliquée sur dev par l'agent** : le contrôle de permissions a refusé `npx supabase db push --remote`, la CLI nommant le projet lié « production » (nom par défaut de Supabase). Le projet lié est bien celui de `.env.local` (dev). Aurel lance la commande elle-même ; d'ici là, tout envoi affiche le message de panne.
- Migration essayée sur dev dans une transaction annulée : 30 vérifications réussies (second envoi = même demande, aucun numéro consommé, refus NV001/NV002, ancienne fonction intacte, droits), base inchangée ensuite.
- Cookie `nova_confirmation` : AES-256-GCM, clé HKDF de `SECRET_COOKIES` (32 caractères au moins), nom du cookie signé avec le contenu, expiration dans le contenu, `path: /confirmation`. `SECRET_COOKIES` ajouté à `.env.local` (valeur jamais affichée).
- `/confirmation` sans cookie valable : la réponse est diffusée en continu (Cache Components), le renvoi vers `/` est fait par le navigateur, pas par un code 307. Rien d'une demande n'est affiché.
- Numéro d'envoi tiré à l'affichage du formulaire (dans le navigateur, `crypto.getRandomValues`), gardé après une panne ou un refus, renouvelé après une réussite. Déroulé de l'envoi sorti dans `envoyerDepot` (testé).
- Nouveau token `--text-reference-confirmation` (28 px) dans `globals.css`.
- Après relecture : lint, types, 359 tests et build réussis.
- Vérifié à l'écran par Aurel le 19 nov. 2026 : les 4 critères sont bons (migration appliquée sur dev par Aurel).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif + blind | Le déroulé de l'envoi dans `FormulaireDepot.envoyer` (même numéro après une panne, nouveau après une réussite, réinitialisation + passage à P2, déverrouillage) n'est exécuté par aucun test | medium | Tests en rendu statique, sur le réducteur et une regex du source ; supprimer `numeroEnvoi.current = numeroApresReponse(…)` laisse la suite verte | patch |
| 2 | edge + blind | Le formulaire peut rester verrouillé, vierge, si le passage à P2 revient sur `/` sans démonter le formulaire | medium | Le verrou ne s'ouvre que dans le nettoyage de `useLayoutEffect` ; une redirection de `/confirmation` vers `/` (cookie refusé) ne démonte pas forcément le formulaire. Après la réinitialisation, le formulaire est vierge : rouvrir le verrou à ce moment est sans risque | patch |
| 3 | edge + blind | Le numéro d'envoi est tiré au premier envoi, alors que le plan, l'architecture (AD-20) et les commentaires disent « à l'affichage » | low | `numeroEnvoi.current ??= nouveauNumeroEnvoi()` dans `envoyer` ; effet identique pour la personne, mais écart avec le plan | patch |
| 4 | verif + blind | `deposer_demande` à 9 paramètres (verrou, demande existante renvoyée, aucun numéro consommé) n'est vérifiée qu'en lisant le texte SQL | medium | Effet réel prouvé une fois sur dev, dans un bloc annulé (30 vérifications) ; il faut une base de test, déjà notée pour 1.3 | defer |
| 5 | edge + blind | Cookie `secure` hors développement : refusé par un navigateur sur un serveur de production en `http://` (réseau local) | low | `next dev` → non `secure` ; production sur Vercel en HTTPS ; `localhost` est traité comme sûr. Cas réservé à une installation hors plan | rejeté |
| 6 | edge + blind | Cookies bloqués : demande enregistrée, renvoi silencieux vers `/`, nouvel envoi = doublon | low | Réel mais rare (cookies désactivés) ; correctif = solution de secours côté navigateur, hors AD-20 | rejeté |
| 7 | blind | Poser le cookie réaffiche `/` dans la même réponse (2 lectures de plus) | low | Confirmé (`server-actions.md`) ; coût négligeable, aucun effet visible en temps normal | rejeté |
| 8 | blind | Nouvel essai avec une saisie corrigée et le même numéro : la confirmation montre la première demande | low | Comportement voulu par AD-20 (« renvoie la demande déjà créée ») ; P2 montre ce qui est vraiment enregistré | rejeté |
| 9 | blind | Le numéro ne survit pas à un rechargement de la page | false | AD-20 : numéro tiré à l'affichage ; recharger = nouvel affichage, donc nouveau numéro, comme prévu | rejeté |
| 10 | blind | Message de panne construit deux fois (`messagePanneDepot` et `EncadrePanne`) | low | Mêmes constantes `MESSAGES_PANNE_DEPOT` ; un test compare les deux, une divergence serait vue | rejeté |
| 11 | blind | `/` échoue si les contacts manquent ; `parametres` lu deux fois ; `.limit(1)` sans ordre | false | `email_contact` est `not null` avec contrôle ; une seule ligne garantie par `parametres_ligne_unique` ; une base injoignable fait déjà échouer les autres lectures | rejeté |
| 12 | blind | Le cookie de confirmation n'est jamais effacé : sur un ordinateur partagé, la personne suivante peut revoir l'objet et l'email pendant 30 min | low | Réel mais limité (même navigateur, moins de 30 min, adresse retapée) ; la durée vient d'AD-20 ; effacer demande une action de plus | rejeté (signalé à Aurel) |
| 13 | edge + blind | Aucune sélection placée sur P2 à son arrivée | low | Next annonce le nouveau titre de page ; déplacer la sélection demande un composant client de plus | rejeté |
| 14 | edge + blind | `lienTelephone` : numéro sans chiffre → `tel:` vide ; « +33 (0)1… » mal converti | low | Numéro saisi par un administrateur (story 4.x) ; format actuel « 01 99 00 00 00 » correct | rejeté |
| 15 | edge | `mailto:` sans encodage de l'email de contact | low | Valeur saisie par un administrateur, dont le format sera vérifié (FR-31) | rejeté |
| 16 | verif | Message « Le formulaire est incomplet… » jamais affiché | low | Seul un appel direct peut envoyer un numéro mal formé | rejeté |

## Design Notes

- Contenu de P2 dans le cookie (référence, objet, email) ; contacts Nova relus en base à chaque affichage. Le cookie est chiffré : l'architecture le veut « illisible », et il contient un email.
- Titre P2 sans point final (texte exact de FR-4).

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx supabase migration list --remote` -- expected: 4 migrations sur dev.

**Manual checks:**
- `npm run dev` : envoi → P2 ; F5 ; `/confirmation` dans une fenêtre privée → `/` ; panne simulée (réseau coupé après l'affichage du formulaire).
