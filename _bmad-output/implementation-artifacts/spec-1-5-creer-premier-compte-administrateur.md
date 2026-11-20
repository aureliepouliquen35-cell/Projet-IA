---
title: 'Story 1.5 — Créer le premier compte administrateur'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '8c0e2333e61e53fe432f90ff3890e3cda94ff67c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aucun compte interne n'existe et rien ne permet d'en créer un sans page d'inscription publique ; les coordonnées de Nova affichées aux demandeurs sont encore des valeurs d'exemple.

**Approach:** Une migration crée `profils`, `mdp_temporaires`, les fonctions `creer_profil` et `modifier_parametres` ; `src/server/admin` crée le compte (Auth, email confirmé) puis appelle `creer_profil`, et supprime le compte Auth si le profil échoue (AD-6). Deux commandes d'installation lancées depuis le poste (`compte:creer`, `parametres:installer`) et la procédure écrite dans `docs/deploiement.md` (réglages Auth, premier administrateur, coordonnées réelles, compte collaborateur de test sur dev).

## Boundaries & Constraints

**Always:** AD-6 (une seule façon de créer un compte, aucun déclencheur sur `auth.users`, rôle jamais dans les métadonnées Auth), AD-9 (RLS sans règle, droits directs retirés à tous, fonctions `security definer` + `search_path = ''`, exécution par `service_role` seul), AD-13 (`compte_cree`, `parametres_modifies` via `journaliser`, jamais de mot de passe), AD-15 (clés prises dans un fichier `.env*` ignoré, jamais affichées), AD-16 (nouvelle migration, anciennes intactes), AD-11 (schémas Zod dans `src/shared/schemas`) ; mot de passe temporaire de 12 caractères au moins, tiré au hasard, affiché une seule fois ; empreinte bcrypt (pgcrypto) dans `mdp_temporaires`, illisible par l'application ; textes en français, vouvoiement.

**Never:** page ou route d'inscription, appel à `auth.signUp` ; écrans de connexion, I2, garde `src/proxy.ts`, `exigerUtilisateur` (1.6, 1.7) ; règles RLS de lecture pour `authenticated` ; écran A1 ou A3 (3.2, 4.3) ; colonne `evenements.auteur_id` (1.11) ; `supabase config push` ; exécution des commandes sur prod ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création | nom, email, rôle valides | compte Auth confirmé + profil (rôle, actif, doit changer son mot de passe) + empreinte ; `compte_cree` au journal ; mot de passe affiché une fois | N/A |
| Saisie invalide | email mal formé, nom vide ou > 100, rôle inconnu | message clair, rien créé | code de sortie ≠ 0 |
| Email déjà utilisé | email d'un compte existant | « Un compte existe déjà avec cet email. », rien créé | code de sortie ≠ 0 |
| Profil refusé | `creer_profil` échoue | compte Auth supprimé, message d'échec | si la suppression échoue : identifiant affiché pour nettoyage manuel |
| Coordonnées | téléphone (facultatif), email de contact, contact données valides | ligne `parametres` remplacée, `parametres_modifies` au journal, visibles aussitôt sur P1/P2 | email mal formé : message de l'UX, rien modifié |
| Clés absentes | fichier `.env` sans URL ou clé secrète | message qui renvoie à `.env.example` | code de sortie ≠ 0 |

## Decisions (Aurel, 2026-11-19)

- L'agent essaie d'appliquer la migration sur dev (`npx supabase db push`) ; en cas de refus, il donne la commande à Aurel. Aurel suit la procédure (réglages Auth, comptes, coordonnées d'essai).
- Lanceur des commandes : **jiti** 2.7.0 (déjà dans `node_modules`), déclaré dans `devDependencies`.
- Plan gardé entier malgré sa longueur (environ 2 500 tokens).

</frozen-after-approval>

## Code Map

- `src/server/supabase-secret.ts` -- `creerClientSecret()` : à utiliser tel quel ; importable par `src/server/admin` (règle ESLint d'`eslint.config.mjs`, déjà prévue).
- `src/server/journal/index.ts` -- `journaliser(niveau, evenement, details)` ; `compte_cree`, `parametres_modifies` déjà dans la liste fermée.
- `src/shared/reponse.ts` -- `succes`, `echec`, `Reponse<T>`, codes `VALIDATION`, `CONFLIT`, `ERREUR_INTERNE`.
- `src/shared/constantes.ts` -- `FORME_EMAIL`, `LONGUEURS_MAXIMALES` (nom 100, email 100, téléphone 30), `compterCaracteres`.
- `src/shared/schemas/depot.ts` -- modèle de schéma (`trim`, `refine(auPlus…)`, messages de l'UX).
- `src/server/depot/index.ts` -- modèle d'appel rpc (`abortSignal(AbortSignal.timeout(…))`, erreur sans détail).
- `supabase/migrations/20261119180000_depot_demande.sql` -- `parametres` (une ligne, `parametres_ligne_unique`, valeurs d'exemple) ; modèle de style et de droits. Ne pas modifier.
- `supabase/config.toml` -- `[auth] enable_signup = true`, `minimum_password_length = 6` : à aligner (`false`, `12`) pour garder la trace versionnée.
- `vitest.config.mts` -- alias `@` et `server-only` → `tests/aides/module-vide.ts` : à reproduire dans le lanceur (`server-only` absent de `node_modules`).
- `tests/aides/migration-depot.ts` -- modèle d'aide qui lit le texte SQL d'une migration.
- `.gitignore` -- `.env*` ignoré : `.env.prod.local` (clés de prod, jamais chargé par Next) le sera aussi.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261120090000_comptes.sql` -- `profils` (id = `auth.users.id` sans cascade, nom, email unique sans casse, rôle fermé, actif, `doit_changer_mdp`, dates), `mdp_temporaires` (profil, empreinte, date) ; RLS + droits retirés ; `creer_profil(id, nom, email, role, mdp_temporaire)` vérifie que le compte Auth existe avec cet email, écrit profil + empreinte `extensions.crypt(…, gen_salt('bf'))` ; `modifier_parametres(telephone, email_contact, contact_donnees)` met à jour l'unique ligne ; droits `service_role` -- AD-6, AD-9.
- [x] `src/shared/schemas/compte.ts`, `src/shared/schemas/parametres.ts` -- saisies et messages (A1, A3) -- AD-11.
- [x] `src/server/admin/index.ts` -- `genererMotDePasseTemporaire()` (16 caractères, `crypto.randomInt`, sans caractères ambigus), `creerCompte()` (rollback AD-6, email existant → `CONFLIT`), `installerParametres()` ; réponses `Reponse<T>`, journal.
- [x] `scripts/lancer.mjs`, `scripts/installation/creer-compte.ts`, `scripts/installation/installer-parametres.ts`, `package.json` -- lecture des options (`--nom`, `--email`, `--role`, `--telephone`, `--email-contact`, `--contact-donnees`), adresse du projet affichée et confirmation « oui » avant d'agir, mot de passe affiché une fois ; scripts npm sur `.env.local`.
- [x] `supabase/config.toml` -- inscriptions fermées, 12 caractères.
- [x] `docs/deploiement.md` -- section « Installation » : réglages Auth (où cliquer), migration, premier administrateur, coordonnées réelles, collaborateur de test (dev seulement), fichier `.env.prod.local` à effacer après usage, vérifications.
- [x] `tests/comptes/*`, `tests/regles/rm-08-pas-d-inscription.test.ts` -- matrice ci-dessus (client simulé), schémas, mot de passe, texte de la migration, aucune route d'inscription ni `signUp`, réglages de `config.toml`.

**Acceptance Criteria:**
- Given la procédure de `docs/deploiement.md` suivie sur dev, when j'ouvre Supabase, then un compte existe dans Auth et dans `profils`, rôle *administrateur*, actif, « doit changer son mot de passe » ; un collaborateur de test peut être créé de la même façon.
- Given les réglages Auth de dev, when je les ouvre, then les inscriptions sont fermées et la longueur minimale est 12.
- Given l'application, when j'ouvre `/inscription` (ou toute adresse d'inscription), then l'écran S2 s'affiche.
- Given l'étape « coordonnées » suivie, when j'ouvre la confirmation après un dépôt, then elle affiche les coordonnées saisies et non les valeurs d'exemple.

## Implementation Notes

- **Migration pas encore appliquée sur dev** : le contrôle de permissions a refusé `npx supabase db push --remote` (la CLI appelle le projet lié « production », nom par défaut de Supabase ; c'est bien le projet dev de `.env.local`, `aodcgbzapnruciesaycg`). Le `--dry-run` montre que seule `20261120090000_comptes.sql` sera envoyée. Aurel lance `npx supabase db push --remote`, puis `npx supabase migration list --remote` (5 migrations attendues).
- CLI Supabase 3 : `db push` sans `--remote` vise une base locale (Docker) ; la procédure utilise donc `--remote`.
- Codes SQL propres : `NV101` (compte Auth absent ou email différent), `NV102` (mot de passe temporaire < 12), `NV103` (email de contact mal formé), `NV104` (ligne `parametres` absente).
- Messages ajoutés dans `src/shared/messages.ts` (`MESSAGES_COMPTE`, `MESSAGES_PARAMETRES`), comme pour le dépôt ; limites des informations générales dans `LONGUEURS_MAXIMALES_PARAMETRES` (contact données : 200, choix de l'agent). Réponse `CONFLIT` : « Un compte existe déjà avec cet email. » et, sous le champ, le texte d'A1.
- Commandes : `scripts/lancer.mjs <fichier .env> <commande .ts>` refuse un fichier qui n'est pas un `.env…` ignoré par git ; saisie vérifiée avant la confirmation « oui » ; le mot de passe n'est jamais renvoyé par `creerCompte` (seule la commande, qui l'a tiré, l'affiche).
- Sous Git Bash, Vitest échoue sur tous les fichiers (« failed to find the current suite ») quand le dossier courant s'écrit `c:` en minuscule : lancer les tests depuis PowerShell ou un chemin `C:\…`.
- Vérifié à l'écran par Aurel le 20 nov. 2026 : les 4 critères sont bons (migration appliquée sur dev par Aurel).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge + verif | Délai dépassé sur `creer_profil` déjà validé côté base : suppression Auth refusée (clé étrangère), message « supprimez-le à la main » faux | low | `profils.id → auth.users` sans cascade ; cas rare (10 s) ; correction = texte du message et de la doc | patch |
| 2 | blind + edge | Compte Auth resté sans profil (Ctrl+C, coupure) : chaque nouvel essai répond « Un compte existe déjà », la doc ne dit pas quoi faire | low | Aucun chemin de nettoyage écrit ; correction = une ligne de doc | patch |
| 3 | blind | Email gardé avec ses majuscules dans `profils` et le journal, en minuscules dans Auth | low | `btrim(p_email)` sans `lower` ; unicité déjà sans casse | patch |
| 4 | blind | `--role Administrateur` refusé par un message qui écrit « Administrateur » | low | `z.enum(ROLES)` en minuscules ; message trompeur | patch |
| 5 | blind + edge | Variables déjà présentes dans le terminal l'emportent sur le fichier de clés | low | `process.loadEnvFile` ne remplace pas (vérifié par la couche edge) ; l'adresse affichée limite le risque | patch |
| 6 | blind | Le lanceur d'installation dépend d'une aide de test (`tests/aides/module-vide.ts`) | low | Déplacer les aides de test casserait la procédure | patch |
| 7 | edge | Adresse Supabase mal formée annoncée comme « manquante » | low | `creerClientSecret` lève aussi pour une adresse invalide | patch |
| 8 | verif + blind | `scripts/lancer.mjs` (gardes du fichier de clés, alias, code de sortie, lecture du clavier) n'est exécuté par aucun test | medium | Lacune signalée par la couche verif (supprimer une garde laisse les 104 tests verts) | patch |
| 9 | verif | `creer_profil` et `modifier_parametres` vérifiées seulement sur leur texte SQL | medium | Pas de base de test dans le dépôt ; même choix que 1.3 et 1.4 ; vérification manuelle sur dev (doc, étapes 4 et 5) | defer |
| 10 | blind + edge | Appels Auth (`createUser`, `deleteUser`) sans délai maximum | low | Réel, mais rare et interrompable au clavier ; correction = course contre un délai | rejeté |
| 11 | blind | Aucune limite de longueur dans `modifier_parametres` ni sur la table `parametres` | low | Seul `service_role` l'appelle ; à ajouter quand la story 4.3 l'ouvrira aux administrateurs | rejeté |
| 12 | blind | Clé fausse détectée seulement après « oui », message générique | low | Rare ; correction = appel réseau de vérification | rejeté |
| 13 | blind | Pas de gestion d'erreur au plus haut niveau de `lancer.mjs` | low | Trace brute seulement sur une erreur imprévue de chargement | rejeté |
| 14 | blind | Toute violation d'unicité (23505) traitée comme « email déjà utilisé » | false | Seul `profils_email_unique` peut être heurté : l'identifiant vient d'un compte Auth neuf | rejeté |
| 15 | blind | Ligne `parametres` absente (NV104) : message « Réessayez » inutile | low | Impossible sans migration cassée | rejeté |
| 16 | blind | Sans `--telephone`, le téléphone existant est effacé sans prévenir | false | La doc le dit (« sans lui, aucun téléphone n'est affiché ») et le résumé affiche « (aucun) » avant « oui » | rejeté |
| 17 | blind | 12 écrit en dur dans le SQL et dans un test | low | Le SQL ne peut pas lire la constante TypeScript ; cosmétique | rejeté |
| 18 | blind | Téléphone non textuel : message « trop long » | low | Les commandes ne transmettent que du texte | rejeté |
| 19 | blind | Le test RM-8 ne vérifie pas que `/inscription` affiche S2 | low | Toute adresse inconnue affiche S2 (story 1.2, testé) ; le test vérifie qu'aucune route n'existe | rejeté |
| 20 | edge | Exigences de caractères ou mots de passe divulgués activés : message « 12 caractères minimum » trompeur | low | Réglages non utilisés (doc : longueur seule ; détection des fuites réservée à l'offre payante) | rejeté |
| 21 | edge | Email refusé par Auth mais accepté par `FORME_EMAIL` : message générique | low | Rare ; même forme que le dépôt | rejeté |
| 22 | edge + verif | `git check-ignore` en échec (code 128) : vérification sautée | low | Cas d'un fichier hors du dépôt, qui ne peut pas y être publié | rejeté |
| 23 | edge | Ctrl+C à la question « oui » : sortie avec un avertissement Node, sans « Annulé » | low | Rien n'est créé ; affichage seulement | rejeté |

## Design Notes

- Empreinte calculée par la base (bcrypt) : la story 1.7 comparera le nouveau mot de passe dans une fonction SQL, sans que l'application lise la table.
- `modifier_parametres` est réservée à `service_role` ici ; la story 4.3 l'ouvrira aux administrateurs (vérification de l'appelant).
- Les coordonnées de prod sont saisies par Aurel lors de la mise en ligne (1.12) ; sur dev, l'étape se vérifie avec des valeurs d'essai.

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx supabase migration list --remote` -- expected: 5 migrations sur dev.

**Manual checks:**
- `npm run dev` : `/inscription` → S2 ; après la procédure, dépôt → P2 avec les nouvelles coordonnées.
