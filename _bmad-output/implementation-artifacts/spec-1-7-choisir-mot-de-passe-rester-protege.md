---
title: 'Story 1.7 — Choisir son mot de passe et rester protégé'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: 'aaf8c59ccc05f1c4854d83e25ff581d20969c202'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un compte créé avec un mot de passe temporaire entre directement dans l'espace interne (1.6), et une session ouverte ne se ferme jamais d'elle-même.

**Approach:** Écran I2 à `/connexion/nouveau-mot-de-passe`, imposé tant que `profils.doit_changer_mdp` est vrai (proxy + garde, AD-7) ; une Server Function refuse le mot de passe temporaire (empreinte comparée par une fonction SQL), change le mot de passe dans Supabase Auth, puis lève le drapeau et efface l'empreinte ; arrivée sur « Demandes » avec le toast « Mot de passe enregistré ». Le proxy tient un cookie serveur signé de dernière activité : au-delà de 8 h, il ferme la session et renvoie vers I1, qui affiche « Votre session a expiré. Reconnectez-vous pour continuer. » (message passé par `src/server/passage`, AD-20).

## Boundaries & Constraints

**Always:** AD-6 (nouveau mot de passe ≠ temporaire, empreinte effacée dès le changement), AD-7 (proxy à chaque requête ; garde `exigerUtilisateur` relit le profil et renvoie vers I2 ; expiration par cookie applicatif), AD-9 (fonctions `security definer`, `search_path = ''`, `service_role` seul, appelées depuis `src/server/connexion`), AD-11 (un schéma Zod, messages exacts de l'UX), AD-12 (`Reponse<T>`, `executerAction`), AD-16 (nouvelle migration, anciennes intactes), AD-20 (message « session expirée » dans un cookie de `src/server/passage`, jamais dans l'adresse) ; toast via shadcn/ui (Sonner), habillé avec les tokens de DESIGN.md (fond foncé, pastille verte, bas à droite, 5 s, annoncé) ; textes exacts d'I1/I2 ; champs vidés après toute erreur d'I2 ; curseur dans le premier champ ; « Enregistrement… » pendant l'envoi.

**Never:** retour à la page demandée après reconnexion ; message « session terminée » ou déconnexion d'un compte désactivé par le proxy (3.x) ; « Mot de passe oublié » ; réinitialisation par un administrateur (3.5) ; nouvel événement de journal (liste fermée d'AD-13) ; lecture de `mdp_temporaires` par l'application ; menu latéral, liste (1.8) ; modification des anciennes migrations ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connexion, mot de passe à changer | bons identifiants, `doit_changer_mdp = vrai` | arrivée directe sur I2 | N/A |
| Autre page pendant le changement | `/demandes` ou `/admin…` ouvert | renvoi vers I2 (proxy, et garde en dernier recours) | N/A |
| I2 sans changement à faire | drapeau faux | renvoi vers `/demandes` | N/A |
| I2 sans session | non connecté | renvoi vers `/connexion` | N/A |
| Trop court | < 12 caractères | « 12 caractères minimum » sous le 1er champ ; rien envoyé | champs vidés |
| Différents | confirmation ≠ nouveau | « Les deux mots de passe ne sont pas identiques » sous « Confirmer » | champs vidés |
| Temporaire réutilisé | = mot de passe temporaire | « Choisissez un mot de passe différent du mot de passe temporaire » ; Auth non modifié | champs vidés |
| Valide | ≥ 12, identiques, ≠ temporaire | Auth modifié, drapeau faux, empreinte effacée, `/demandes` + toast « Mot de passe enregistré » | N/A |
| Déjà changé dans Auth, drapeau resté vrai | même mot de passe renvoyé après une panne | Auth répond `same_password` → traité comme fait, drapeau levé | N/A |
| Panne | Auth ou base injoignable | « Votre mot de passe n'a pas pu être enregistré. Réessayez. » | `ERREUR_INTERNE` journalisée ; champs vidés |
| Inactivité > 8 h | dernière activité > 8 h, ou cookie d'activité absent / falsifié | session fermée, `/connexion` avec l'encadré d'information | N/A |
| Server Function après 8 h | POST d'action sur une page protégée | session fermée, pas de renvoi HTTP : la garde de l'action renvoie vers `/connexion` | N/A |
| Activité | page protégée ouverte dans les 8 h | cookie d'activité renouvelé | N/A |

## Decisions (Aurel, 2026-11-20)

- Migration : comme en 1.6, l'agent essaie `npx.cmd supabase db push --remote` sur dev ; en cas de refus, il donne la commande à Aurel.
- Vérification de l'expiration : réglage réservé au développement `DUREE_INACTIVITE_MINUTES` (dans `.env.local`, lu seulement quand `NODE_ENV` vaut `development` ; en production, toujours 8 h). Décrit en commentaire dans `.env.example`.
- Plan gardé entier malgré sa longueur (environ 2 800 tokens).
- Après une reconnexion, arrivée sur « Demandes » (pas de retour à la page demandée, noté dans `deferred-work.md`).

</frozen-after-approval>

## Code Map

- `src/lib/supabase/proxy.ts` -- `updateSession` : ajouter, pour les pages protégées (internes + I2), l'expiration, le renvoi I2 ↔ `/demandes` d'après `doit_changer_mdp` (lu avec la session ; erreur de lecture → on laisse passer, la garde décide) et le renouvellement du cookie d'activité. Poser les cookies sur `response` **après** les appels Auth (`setAll` remplace `response`) ; copier les cookies sur chaque renvoi comme aujourd'hui. Requête d'action = `POST` + en-tête `next-action` : jamais de renvoi HTTP (constat n° 7 de 1.6).
- `src/shared/acces.ts` -- ajouter `ADRESSE_NOUVEAU_MOT_DE_PASSE`, `estPageNouveauMotDePasse`, `estPageProtegee` (même normalisation que `estPageInterne`).
- `src/server/garde/index.ts` -- `lireUtilisateur` renvoie aussi `doitChangerMdp` ; `exigerUtilisateur` renvoie vers I2 si vrai ; nouvelle `exigerChangementMotDePasse()` (sans session → `/connexion`, drapeau faux → `/demandes`).
- `src/server/connexion/index.ts` -- `connecter` : le profil lu donne aussi le drapeau → résultat `mot_de_passe_a_changer` ; pose le cookie d'activité à la réussite. Ajouter `choisirMotDePasse(id, motDePasse)`. Le module peut importer la clé secrète (règle ESLint).
- `src/server/actions/se-connecter.ts` -- renvoi vers I2 ou `/demandes` ; efface le message « session expirée ».
- `src/server/passage/index.ts` -- modèle `chiffrerPassage`/`dechiffrerPassage` ; y ajouter le message de connexion (cookie `path: /connexion`, 30 min).
- `src/app/connexion/page.tsx` -- page statique : l'encadré lit un cookie → sous `<Suspense fallback={null}>`.
- `src/app/connexion/formulaire-connexion.tsx`, `tests/connexion/formulaire-connexion.test.tsx` -- modèle à suivre pour le formulaire I2 (réducteur testable, `onSubmit`, `useTransition`, verrou, `ResumeErreurs`, sélection).
- `src/app/(interne)/layout.tsx`, `src/components/interne/{bouton-deconnexion,utilisateur-connecte}.tsx` -- réutiliser `BoutonDeconnexion`, `RechargementSiRestauree` ; I2 a son propre en-tête (logo + « Se déconnecter »), sans nom.
- `src/components/formulaire/champ.tsx` -- prop `aide` pour « 12 caractères minimum ».
- `src/shared/messages.ts`, `src/shared/constantes.ts` (`LONGUEUR_MINIMALE_MOT_DE_PASSE`, `compterCaracteres`), `src/shared/schemas/validation.ts` -- messages et validation.
- `supabase/migrations/20261120090000_comptes.sql` -- `mdp_temporaires` (bcrypt `extensions.crypt`), `profils.doit_changer_mdp` : ne pas modifier.
- `tests/connexion/proxy.test.ts`, `tests/aides/supabase-connexion.ts`, `tests/connexion/garde.test.ts`, `tests/connexion/action-se-connecter.test.ts`, `tests/connexion/migration-connexion.test.ts` -- à adapter (cookie d'activité désormais exigé, nouveau résultat, migration plus la dernière).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261120200000_mot_de_passe.sql` -- `est_mot_de_passe_temporaire(p_id, p_mdp) → boolean` et `terminer_changement_mdp(p_id, p_mdp)` (verrouille le profil ; sans effet si drapeau déjà faux ; refuse < 12 caractères `NV105` et le temporaire `NV106` ; drapeau faux, `date_modification`, empreinte effacée) ; `service_role` seul.
- [x] `src/shared/schemas/mot-de-passe.ts`, `src/shared/messages.ts` -- schéma (≥ 12 caractères, ≤ 72 octets comme Supabase Auth, confirmation identique sous `confirmation`) ; `MESSAGES_MOT_DE_PASSE`, `MESSAGE_SESSION_EXPIREE`.
- [x] `src/shared/acces.ts` -- adresses et `estPageProtegee`.
- [x] `src/server/garde/activite.ts` -- cookie `nova_activite` (httpOnly, `sameSite: lax`, `secure` hors dev, `path: /`, `maxAge` = durée) : horodatage signé HMAC-SHA-256 (clé dérivée de `SECRET_COOKIES`) ; `valeurActivite`, `activiteValide`, `poserActivite` ; durée 8 h.
- [x] `src/server/passage/index.ts` -- `valeurSessionExpiree`, options du cookie, `lireMessageConnexion`, `oublierMessageConnexion`.
- [x] `src/lib/supabase/proxy.ts` -- expiration, renvoi I2, renouvellement (voir Code Map).
- [x] `src/server/garde/index.ts`, `src/server/connexion/index.ts`, `src/server/actions/se-connecter.ts` -- voir Code Map.
- [x] `src/server/actions/choisir-mot-de-passe.ts` -- `exigerChangementMotDePasse`, validation, `choisirMotDePasse` ; temporaire → `VALIDATION` sur `motDePasse` ; réussite → `succes(null)`.
- [x] `src/components/ui/sonner.tsx`, `src/app/layout.tsx`, `package.json` -- installer `sonner` (2.0.8) ; `Toaster` habillé, dans le layout racine (il survit au passage d'I2 à `/demandes`).
- [x] `src/app/connexion/nouveau-mot-de-passe/{page,formulaire-mot-de-passe}.tsx` -- I2 ; contenu gardé sous `<Suspense>` ; réussite → `toast.success` puis `router.replace("/demandes")`.
- [x] `src/app/connexion/page.tsx` -- encadré `alert-info` (icône « i ») si le message est présent.
- [x] `tests/mot-de-passe/*`, tests existants -- matrice (clients simulés), schéma, texte de la migration, cookie d'activité (valide, ancien, futur, falsifié, absent), proxy, garde, réducteur I2 (champs vidés, messages), encadré I1.

**Acceptance Criteria:**
- Given un compte qui doit changer son mot de passe, when je me connecte, then I2 s'affiche avec « Se déconnecter », et `/demandes` me ramène à I2.
- Given I2, when je saisis moins de 12 caractères, deux mots de passe différents ou le temporaire, then le message de l'UX s'affiche et je peux toujours me reconnecter avec le temporaire.
- Given un nouveau mot de passe valide, when je l'enregistre, then j'arrive sur « Demandes » avec le toast « Mot de passe enregistré », et je me reconnecte ensuite avec ce mot de passe sans repasser par I2.
- Given plus de 8 h sans activité, when je clique sur une page interne, then j'arrive sur la connexion avec « Votre session a expiré. Reconnectez-vous pour continuer. »

## Implementation Notes

- **Migration à appliquer sur dev par Aurel** : le contrôle de permissions a refusé `npx.cmd supabase db push --remote --yes` à l'agent. Commande : `npx.cmd supabase db push --remote`, puis `npx.cmd supabase migration list --remote` (7 migrations attendues).
- `sonner` 2.0.8 ajouté (version exacte) ; `Toaster` habillé dans `src/components/ui/sonner.tsx`, monté dans le layout racine.
- Message « trop long » (72 octets, limite de Supabase Auth) : texte de l'agent, absent de l'UX, de la même forme que les autres.
- Une heure d'activité jusqu'à 1 minute dans le futur est acceptée (écart d'horloge entre serveurs).
- Si l'option « Secure password change » de Supabase Auth est un jour activée, `updateUser` demandera une réauthentification : l'écran affichera alors l'erreur technique.
- Tests à lancer depuis PowerShell (Vitest échoue depuis Git Bash, comme en 1.6).
- Vérifié à l'écran par Aurel le 20 nov. 2026 : tous les critères sont bons (expiration vérifiée avec `DUREE_INACTIVITE_MINUTES`, ligne retirée ensuite de `.env.local`).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif | Toast puis passage à « Demandes », verrou du double envoi et `Toaster` vérifiés seulement par le texte des fichiers | low | Réel ; même convention qu'en 1.6 (pas de DOM ni d'e2e dans le dépôt) ; vérification à l'écran prévue | defer |
| 2 | verif + blind | Fonctions SQL jamais exécutées ; règles recopiées en JavaScript dans la simulation | medium | Réel ; pas de base de test dans le dépôt | defer (entrée déjà écrite par l'implémentation) |
| 3 | blind | L'expiration n'est pas revérifiée par la garde : une Server Function interne envoyée à une adresse publique échappe au contrôle des 8 h | low | Réel, mais il faut fabriquer la requête à la main depuis le navigateur resté ouvert ; la garde lit les cookies de la requête, et à la connexion le cookie vient d'être posé dans la même requête (risque de faux « expiré ») : correction plus qu'une ligne | rejeté |
| 4 | blind + edge | `updateUser` (et `signOut` du proxy) sans délai maximum | low | Réel mais rare ; supabase-js n'accepte pas de signal ici, il faudrait une course de promesses ; même choix qu'en 1.6 (n° 5) | rejeté |
| 5 | blind | `weak_password` de Supabase Auth affiché comme une erreur technique | low | Supabase n'exige que 12 caractères (réglage 1.5), déjà vérifiés par le schéma ; les autres règles sont payantes ou désactivées | rejeté |
| 6 | blind | Réinitialisation par un administrateur pendant le changement : le temporaire deviendrait définitif | maybe-false | Impossible tant que la story 3.5 n'existe pas ; serait medium ensuite | defer (story 3.5) |
| 7 | blind | Le proxy relit le profil à chaque page protégée, puis la garde le relit | low | Voulu par AD-7 (renvoi propre avant l'affichage) ; volume très faible | rejeté |
| 8 | blind | Cookie d'activité ni effacé à la déconnexion, ni lié au compte | low | La connexion suivante pose un nouveau cookie ; sans session Supabase il ne donne aucun accès | rejeté |
| 9 | blind | L'encadré « session expirée » reste 30 min sur `/connexion` (ordinateur partagé) | low | Réel et sans gravité (message neutre) ; un composant serveur ne peut pas effacer un cookie | rejeté |
| 10 | blind | `doit_changer_mdp` non booléen traité de trois façons | false | Colonne `boolean not null` (migration 1.5) : la valeur ne peut pas arriver | rejeté |
| 11 | blind | I2 sans champ `username` caché pour les gestionnaires de mots de passe | low | Réel ; demanderait de passer l'email au formulaire ; le navigateur associe en général au dernier identifiant saisi sur le site | rejeté |
| 12 | blind | Règle visible sans le maximum ; « moins s'il contient des accents » imprécis pour les émojis | low | Seules de très longues phrases de passe sont concernées | rejeté |
| 13 | edge | Après une erreur technique, chaque envoi suivant redonne la sélection au premier champ, même après un refus (la sélection devait aller au résumé) | low | Vérifié : l'effet dépend de `envoiEnCours` et repart à chaque fin d'envoi tant que `appelsPremierChamp > 0` | patch |
| 14 | edge | Corriger le 1er champ pour qu'il égale la confirmation laisse « pas identiques » affiché | low | Vérifié : le cas `saisie` ne recalcule que le champ modifié | patch |
| 15 | edge | `SECRET_COOKIES` absente : le proxy lève une erreur sur chaque page protégée | low | Échec bruyant d'une erreur de configuration, comme `src/server/passage` | rejeté |
| 16 | edge | Deux onglets envoient en même temps : le second mot de passe remplace le premier | low | Les deux onglets disent « enregistré » ; le dernier gagne, la personne l'a choisi elle-même | rejeté |

## Design Notes

- Le toast n'est pas un « message après une redirection » au sens d'AD-20 : I2 l'affiche lui-même, puis change de page sans rechargement ; le `Toaster` du layout racine reste à l'écran. Actualiser « Demandes » ne le réaffiche pas.
- Cookie d'activité absent = session expirée : sinon, un cookie disparu (8 h de `maxAge`) redonnerait 8 h. Les sessions ouvertes avant cette story verront donc une fois le message « session expirée ».
- Le proxy lit `doit_changer_mdp` (AD-7) pour un renvoi propre avant l'affichage ; la garde le relit et reste la vraie protection (Server Functions, pages).

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase migration list --remote` -- expected: 7 migrations sur dev.

**Manual checks:**
- `npm run dev` : les quatre critères ci-dessus avec le compte collaborateur de test.
