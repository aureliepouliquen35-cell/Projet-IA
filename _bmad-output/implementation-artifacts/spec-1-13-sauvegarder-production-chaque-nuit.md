---
title: 'Story 1.13 — Sauvegarder la production chaque nuit'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: 'dd61ce714971073b2201aa1e948ff70c2958d363'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'offre gratuite de Supabase ne garantit aucune sauvegarde : si la base de production est perdue, toutes les demandes le sont aussi (NFR-7, perte maximale de 24 h).

**Approach:** Une tâche GitHub Actions planifiée chaque nuit exporte la base **prod** avec la Supabase CLI (rôles, structure, données), chiffre l'export avec un mot de passe rangé dans les secrets GitHub, le garde 7 jours comme artefact, puis écrit `sauvegarde_reussie` dans `journal_technique` (AD-18). `docs/deploiement.md` guide Aurel pas à pas pour créer les secrets, lancer un premier essai à la main et vérifier les 3 critères. Les actions sur GitHub et Supabase sont faites par Aurel.

## Boundaries & Constraints

**Always:** AD-18 (export prod par la Supabase CLI 3.0.0, version du `package-lock.json` ; chiffrement par mot de passe ; artefact gardé 7 jours ; mot de passe aussi dans un gestionnaire de mots de passe) ; AD-13 (événement `sauvegarde_reussie`, niveau `info`, détails sans aucune donnée de demandeur : nom du fichier, numéro d'exécution, taille) ; AD-15 (aucun secret dans le dépôt, la conversation ni les journaux d'exécution, qui sont **publics** : le mot de passe de la base contenu dans l'adresse est masqué) ; le dépôt étant public, les artefacts sont téléchargeables par tout compte GitHub : seul le fichier chiffré est publié ; la ligne du journal n'est écrite qu'après la publication réussie de l'artefact ; tout échec fait échouer la tâche (croix rouge dans *Actions*) ; actions GitHub épinglées par empreinte de commit ; droits du jeton GitHub au minimum ; textes et messages en français.

**Never:** restauration (story 5.1) ; documentation *Maintenance* complète (5.3) ; vérifications automatiques à chaque envoi sur `main` (entrée de deferred-work) ; nouvelle migration ou changement de `journal_technique` ; export non chiffré dans un artefact, le dépôt ou les journaux ; `--dry-run` ou `--debug` de la CLI (ils affichent le mot de passe) ; envoi sur GitHub, commit ou lancement de la tâche par l'agent ; nouvelle dépendance npm.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nuit normale | secrets présents, base prod joignable | artefact `sauvegarde-prod-AAAA-MM-JJ-HHMM` (un seul fichier `.tar.gz.gpg`), gardé 7 jours ; ligne `sauvegarde_reussie` dans le journal | N/A |
| Lancement à la main | *Run workflow* dans l'onglet *Actions* | même résultat que la nuit | N/A |
| Secret manquant | un des deux secrets vide | arrêt avant l'export, message qui nomme le secret à créer | échec, rien de publié |
| Mot de passe trop court | moins de 32 caractères | arrêt avant l'export, message qui le dit | échec, rien de publié |
| Mauvaise adresse | connexion directe `db.….supabase.co` (IPv6, injoignable depuis GitHub) ou port 6543 | arrêt avec un message : utiliser l'adresse *Session pooler* | échec, rien de publié |
| Mauvaise base | export sans la table `public.demandes` | arrêt (« ce n'est pas la base de Nova ») | échec, rien de publié |
| Fichier illisible | le déchiffrement d'essai échoue | arrêt | échec, rien de publié |
| Journal injoignable | écriture du journal refusée | la tâche échoue (artefact déjà publié) | croix rouge, visible le matin |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261119090000_journal_technique.sql` -- `ecrire_journal(p_niveau, p_evenement, p_details, p_code_erreur)`, `security definer`, exécution retirée à `public` : appelable par son propriétaire `postgres` (utilisateur de l'adresse *Session pooler*). Ne pas modifier.
- `src/server/journal/index.ts` -- `EVENEMENTS_JOURNAL` contient déjà `sauvegarde_reussie`. Ne pas modifier.
- `package-lock.json` -- `node_modules/supabase` en 3.0.0 : même version dans la tâche.
- CLI 3.0 : `supabase db dump --remote=<adresse> -f <fichier>` avec `--role-only`, (rien) pour la structure, `--data-only --use-copy` pour les données (inclut `auth.users`, mots de passe hachés). `--dry-run` affiche `PGPASSWORD` en clair.
- Actions épinglées : `actions/checkout` v7.0.1 = `3d3c42e5aac5ba805825da76410c181273ba90b1`, `supabase/setup-cli` v3.2.0 = `689adcfb80d947100a1eab127289b97d1fb07b13`, `actions/upload-artifact` v7.0.2 = `cf430e030ddbb5b0abf93d22962f4752f3646cd9`.
- `tests/socle/mise-en-ligne.test.ts` -- modèle des tests sur fichiers (lecture du texte, `process.cwd()`).
- `docs/deploiement.md` -- parties « Installation » et « Mise en ligne » (§2 : mot de passe de la base prod dans le gestionnaire) ; ajouter une partie « Sauvegarde de nuit », ne pas réécrire le reste.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/sauvegarde/sauvegarder.sh` -- Bash, `set -euo pipefail`, `umask 077`. `preparer <dossier>` : contrôles de la matrice, masque du mot de passe de la base, trois exports dans un dossier temporaire, contrôle `public.demandes`, `tar` + `gpg --symmetric` AES256 (mot de passe par descripteur, jamais en argument), déchiffrement d'essai, suppression des exports en clair, sortie `nom`/`fichier`. `noter <fichier>` : `psql` avec `ON_ERROR_STOP`, variables psql, appel de `ecrire_journal('info', 'sauvegarde_reussie', …)` -- logique testable hors de GitHub.
- [x] `.github/workflows/sauvegarde-nuit.yml` -- `schedule` chaque nuit (vers 2 h–3 h à Paris, minute non ronde) et `workflow_dispatch` ; `ubuntu-24.04` ; `permissions: contents: read` ; `concurrency` ; `timeout-minutes` ; étapes checkout → setup-cli 3.0.0 → `preparer` → upload (fichier `.gpg` seul, `retention-days: 7`, `if-no-files-found: error`) → `noter` ; secrets `SAUVEGARDE_URL_BASE_PROD` et `SAUVEGARDE_MOT_DE_PASSE` passés en variables d'environnement.
- [x] `tests/socle/sauvegarde-nuit.test.ts` -- Vitest sur le texte des deux fichiers : planification + lancement manuel, 7 jours, seul le `.gpg` publié, secrets par `secrets.…`, aucune adresse `postgres…` écrite en dur, pas de `--dry-run`/`--debug`/`set -x`, actions épinglées (40 caractères), version de la CLI = lockfile, événement `sauvegarde_reussie` présent dans `EVENEMENTS_JOURNAL`, journal après l'upload.
- [x] `docs/deploiement.md` -- partie « Sauvegarde de nuit » : générer le mot de passe dans le gestionnaire, copier l'adresse *Session pooler* de prod, créer les deux secrets GitHub sans jamais les coller ailleurs, premier lancement à la main après l'envoi de `main`, vérifications des 3 critères (Actions, journal filtré, rangement du mot de passe), vérification mensuelle (pause après 60 jours d'inactivité) ; lien depuis l'introduction.

**Acceptance Criteria:**
- Given la tâche GitHub Actions planifiée, when Aurel regarde l'onglet *Actions* le matin, then la sauvegarde de la nuit a réussi, et son fichier est chiffré et gardé 7 jours.
- Given le journal technique, when Aurel le filtre sur `sauvegarde_reussie`, then la dernière ligne a moins de 24 heures.
- Given le mot de passe de chiffrement, when Aurel vérifie où il est rangé, then il est dans les secrets GitHub et aussi hors de GitHub (gestionnaire de mots de passe), et jamais dans le dépôt.

## Implementation Notes

- Fichiers : `.github/workflows/sauvegarde-nuit.yml`, `scripts/sauvegarde/sauvegarder.sh`, `tests/socle/sauvegarde-nuit.test.ts` (texte), `tests/socle/sauvegarde-script.test.ts` (lance vraiment le script avec de faux `supabase`/`psql` et le vrai gpg, Git Bash trouvé par `git --exec-path`), `docs/deploiement.md` (partie « Sauvegarde de nuit »), `.gitattributes` (ajout : `*.sh` en fins de ligne LF, sinon bash refuse le script extrait sur Windows).
- Actions épinglées : checkout v7.0.1, setup-cli v3.2.0 (CLI 3.0.0), upload-artifact v7.0.2 ; secrets seulement sur les étapes du script.
- Sortie hors GitHub : `/dev/stdout` échouait sous Git Bash quand la sortie est un tuyau ; écrit sur la sortie standard.
- Pas encore lancé pour de vrai : il faut l'envoi de `main` et les deux secrets (Aurel). La CLI dans Docker, la connexion *Session pooler*, `psql` du runner et `ecrire_journal` en tant que `postgres` seront éprouvés au premier lancement à la main.
- gpg-agent : chemin de socket limité (~100 caractères) ; `/tmp` court sur GitHub, chemins courts dans les tests.
- Après relecture (22 nov.) : mot de passe de la base limité à `A-Za-z0-9._~-` (plus de décodage pour le masque), motif d'adresse sans blancs, `noter` ne reçoit plus le mot de passe de chiffrement, tests ajoutés (export en échec ou vide, déchiffrement différent, adresses fautives, arguments de la CLI), doc précisée (dev non distingué de prod ; nuit ratée = jusqu'à 48 h, plus rien après 7 nuits d'échec). Vérifié : lint, `tsc`, 71 fichiers / 1 282 tests verts, gitleaks (historique et nouveaux fichiers) sans fuite. Pas de commit (demande d'Aurel).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge | Masque du mot de passe décodé par `printf '%b'` : `\n`, `%0A`, `\c`, `%25` coupent ou faussent la ligne `::add-mask::`, un morceau du mot de passe peut s'afficher dans les journaux publics | medium | Vérifié : `printf '%b'` sur `ab\ncd` donne un vrai retour à la ligne | patch : exiger un mot de passe de base en caractères sûrs (lettres, chiffres, `._~-`), supprimer le décodage |
| 2 | edge | Espace ou retour à la ligne dans l'adresse accepté par le motif | low | Vérifié : `(/[^?]*)?` et `(.*)` acceptent les blancs | patch : motif sans blancs |
| 3 | blind | `noter` reçoit le mot de passe de chiffrement, inutile | low | Vérifié : `controler_secrets` exige les deux ; étape `noter` les reçoit | patch : contrôles séparés, étape sans ce secret |
| 4 | verif | Export en échec ou vide jamais simulé | medium | Pré-vérifié (faux `supabase` toujours à 0, fichier non vide) | patch |
| 5 | verif | Contrôles `cmp` et contenu de l'archive après déchiffrement non testés | medium | Pré-vérifié | patch |
| 6 | verif + blind | `[YOUR-PASSWORD]`, mot de passe vide, adresse mal formée, non testés | medium | Pré-vérifié | patch |
| 7 | blind | Le faux `supabase` ne note pas ses arguments : `--remote=<adresse>` jamais vérifié à l'exécution | low | Vérifié : seul le mode est noté | patch |
| 8 | blind | `not.toMatch(/write/)` casse sur tout mot contenant « write » | low | Vérifié | patch : viser `: write` |
| 9 | blind + edge | Adresse de dev acceptée (elle a aussi `public.demandes`) ; la doc dit « vérifie que c'est bien la base de Nova » | low | Vérifié ; mais la ligne `sauvegarde_reussie` irait au journal de dev, et la vérification 5.2 sur prod le révèle. Comparer à l'identifiant prod demande un nouveau réglage | patch : préciser la doc (ne distingue pas dev de prod, contrôle du journal prod) |
| 10 | blind + edge | 7 jours d'artefacts même sans nouvelle réussite ; une nuit ratée = jusqu'à 48 h ; doc « au plus 24 h » | low | Vérifié : rétention fixe, une seule planification | patch : doc (réparer et relancer à la main le jour même ; plus rien après 7 jours d'échec) |
| 11 | blind | Pas d'alerte automatique si la dernière sauvegarde a plus de 24 h | low | Décision d'architecture AD-18 : vérification mensuelle à la main ; GitHub prévient des échecs | rejeté |
| 12 | blind | `psql` non vérifié avant l'export | low | `psql` est fourni par `ubuntu-24.04` ; ajout d'un garde-fou pour un cas improbable | rejeté |
| 13 | blind | `auth.users` dans l'export non contrôlé | low | Export de la CLI vérifié à blanc (`--schema "*"`, `auth` non exclu) ; restauration en 5.1 | rejeté |
| 14 | blind | Pas de Dependabot pour les actions épinglées | low | Hors de la story | rejeté |
| 15 | blind | La restauration n'est pas encore éprouvée | low | Déjà écrit dans la doc (story 5.1) | rejeté |
| 16 | edge | Paramètres `?pgbouncer=true` acceptés, `psql` les refuserait | low | L'adresse *Session pooler* de Supabase n'en a pas ; garde-fou pour un cas improbable | rejeté |
| 17 | edge | Retour à la ligne dans le mot de passe de chiffrement | low | Généré par un gestionnaire, une ligne ; garde-fou pour un cas improbable | rejeté |
| 18 | verif | SQL envoyé à `psql` jamais exécuté sur une vraie base | medium (non vérifié) | Aucun banc Postgres dans le dépôt ; le premier lancement à la main le vérifie | defer |
| 19 | verif | Heure de Paris du nom non testée | low | Cosmétique, test sensible à l'horloge | rejeté |

## Design Notes

- Le journal est écrit par `ecrire_journal`, le même et seul chemin SQL que `journaliser` : la tâche n'est pas du code de l'application (pas de clé secrète Supabase en plus dans GitHub), et un échec doit se voir, alors que `journaliser` l'avale par conception.
- `psql` est déjà sur `ubuntu-24.04` ; `supabase db dump` y utilise Docker, présent aussi.
- Adresse *Session pooler* (port 5432, IPv4) : la connexion directe de l'offre gratuite est en IPv6, que GitHub ne sait pas joindre ; le port 6543 (*Transaction pooler*) ne convient pas à `pg_dump`.

## Verification

**Commands:**
- `bash scripts/sauvegarde/sauvegarder.sh …` avec de faux `supabase` et `psql` (dossier temporaire en tête du `PATH`) -- expected: chaque ligne de la matrice se comporte comme prévu, fichier déchiffrable, aucun `.sql` dans le dossier de sortie.
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (PowerShell), `npm run secrets` -- expected: aucune erreur, tests verts, aucune fuite.

**Manual checks:**
- Après l'envoi de `main` par Aurel : suivre « Sauvegarde de nuit » dans `docs/deploiement.md`.
