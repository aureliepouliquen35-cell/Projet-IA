---
title: 'Story 5.1 — Restaurer une sauvegarde'
type: 'feature'
created: '2026-11-27'
status: 'done'
baseline_commit: '3916682f52ea27f12f836d9ac8aa3141936ff262'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La sauvegarde de nuit (story 1.13) n'a jamais été relue : personne ne sait remettre les demandes en place si la base de production est abîmée (NFR-7, SM-4).

**Approach:** Une procédure de restauration écrite dans un nouveau `docs/maintenance.md`, appuyée sur un script qui déchiffre la sauvegarde choisie, contrôle qu'elle vient bien de Nova, remplace les données de la base visée en une seule transaction (tout ou rien) puis compte les demandes et leur historique. Aurel la teste réellement sur **dev** et note la date et la durée dans la documentation.

**Décisions d'Aurel (27 nov. 2026) :**
1. La restauration se lance par une tâche GitHub Actions « Restaurer une sauvegarde » (*Run workflow*) : rien à installer, le mot de passe de chiffrement reste dans les secrets GitHub, les données déchiffrées ne passent jamais sur l'ordinateur d'Aurel. Un seul nouveau secret : l'adresse *Session pooler* de la base dev.
2. Cible au choix : **dev** (essai, par défaut) ou **prod** (vrai problème) ; prod exige de recopier une phrase de confirmation, et l'adresse de dev doit être différente de celle de prod. Seul dev est testé réellement.
3. Après l'essai, dev garde la copie de prod (comptes compris) : la doc le signale et explique comment recréer le collaborateur de test avec les commandes existantes.

## Boundaries & Constraints

**Always:** AD-18 (mot de passe de chiffrement dans les secrets GitHub **et** dans le gestionnaire de mots de passe ; aucun export en clair publié, commité ni affiché ; les journaux d'exécution sont publics, aucun secret ni donnée de demandeur n'y apparaît) ; AD-15 (aucun secret dans le dépôt ni dans la conversation) ; AD-16 (la structure vient des migrations : la restauration ne remplace que les **données**, la base visée doit déjà avoir les migrations) ; restauration en une seule transaction : en cas d'échec, la base visée reste comme avant ; la base visée doit être une base de Nova (table `public.demandes`) ; contrôle final : nombre de demandes et de lignes d'historique (`public.evenements`) restaurées égal à celui de la sauvegarde ; mêmes conventions que `sauvegarder.sh` (Bash, `set -euo pipefail`, `umask 077`, gpg par descripteur, messages en français qui disent quoi faire) ; actions GitHub épinglées par empreinte, droits du jeton au minimum ; `docs/maintenance.md` explique où trouver le mot de passe de chiffrement et la vérification mensuelle (en reprenant ou reliant la partie « Sauvegarde de nuit » de `docs/deploiement.md`).

**Never:** retour arrière de version (5.2) ; reste de la documentation *Maintenance* et autres documents (5.3) ; nouvelle migration, nouvel événement du journal ou changement de l'application ; `--dry-run`, `--debug`, `set -x` ; restauration de la structure ou des rôles par-dessus les migrations ; lancement de la restauration, envoi sur GitHub ou commit par l'agent ; nouvelle dépendance npm.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Restauration normale | sauvegarde valide, base visée de Nova | données remplacées ; « N demandes et M lignes d'historique restaurées », durée affichée | N/A |
| Secret manquant ou mauvaise adresse | mot de passe ou adresse absent, mal formé, connexion directe, port 6543 | arrêt avant tout changement, message qui dit quoi corriger | rien n'est modifié |
| Prod sans confirmation | cible prod, phrase absente ou mal recopiée | arrêt avant tout téléchargement | rien n'est modifié |
| Dev qui vise prod | adresse dev = même projet que prod | arrêt | rien n'est modifié |
| Sauvegarde introuvable | nom inconnu ou expiré (plus de 7 jours), ou aucune | arrêt, message qui le dit | rien n'est modifié |
| Mauvais mot de passe | gpg ne déchiffre pas | arrêt (« mot de passe de chiffrement faux ou fichier abîmé ») | rien n'est modifié |
| Fichier qui n'est pas une sauvegarde de Nova | archive sans les 3 exports, ou sans `public.demandes` | arrêt | rien n'est modifié |
| Base visée sans les migrations | pas de `public.demandes` | arrêt : appliquer d'abord les migrations (`docs/deploiement.md`) | rien n'est modifié |
| Échec en cours de chargement | erreur SQL au milieu | transaction annulée, message | base inchangée |
| Comptes différents | nombre en base ≠ nombre dans la sauvegarde | échec signalé | transaction annulée |

</frozen-after-approval>

## Code Map

- `scripts/sauvegarde/sauvegarder.sh` -- modèle à suivre (contrôle d'adresse *Session pooler*, masque, gpg par descripteur 3, dossier temporaire effacé par `trap`, `arreter`/`informer`). Ne pas modifier sauf pour partager une fonction si c'est plus simple ; noms d'exports `roles.sql`, `structure.sql`, `donnees.sql`.
- `.github/workflows/sauvegarde-nuit.yml` -- modèle de tâche (épinglage des actions, `permissions`, `concurrency`, secrets passés en variables d'environnement à une seule étape). Ne pas modifier.
- `donnees.sql` (export `--data-only --use-copy`) -- blocs `COPY <schéma>.<table> (…) FROM stdin;` terminés par `\.` ; contient `auth.users` et toutes les tables `public` ; peut contenir `\restrict`/`\unrestrict` (pg_dump récent).
- `supabase/migrations/20261119180000_depot_demande.sql` -- tables `public.demandes` (l. 114) et `public.evenements` (l. 192, historique).
- `tests/socle/sauvegarde-script.test.ts`, `tests/socle/sauvegarde-nuit.test.ts` -- modèles des tests (Git Bash trouvé par `git --exec-path`, faux `psql`/`supabase` en tête du `PATH`, vrai gpg).
- `docs/deploiement.md` -- l. 274 « La restauration … viendra avec l'exploitation (story 5.1) » : remplacer par un lien vers `maintenance.md` ; §6 « Vérification mensuelle » à relier.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/sauvegarde/restaurer.sh` -- contrôles de la matrice, déchiffrement dans un dossier temporaire, contrôle Nova, liste des tables à vider tirée des blocs `COPY` de `donnees.sql`, `psql --single-transaction` (vider puis charger, `session_replication_role = replica`), comptage final dans la même transaction, durée affichée -- logique testable hors de GitHub.
- [x] `.github/workflows/restauration.yml` -- `workflow_dispatch` seul ; entrées : cible (dev par défaut / prod), nom de la sauvegarde (vide = la plus récente non expirée), confirmation (exigée pour prod) ; téléchargement de l'artefact par l'API GitHub (`gh`, `actions: read`) ; secrets `RESTAURATION_URL_BASE_DEV`, `SAUVEGARDE_URL_BASE_PROD`, `SAUVEGARDE_MOT_DE_PASSE` passés à la seule étape du script ; ne publie rien.
- [x] `tests/socle/restauration-script.test.ts` -- chaque ligne de la matrice, avec faux `psql` et vrai gpg ; aucun secret ni texte de demandeur affiché ; aucun fichier en clair laissé.
- [x] `docs/maintenance.md` -- partie « Restaurer une sauvegarde » : quand restaurer, où est le mot de passe de chiffrement, secret à créer, pas à pas, ce qu'on vérifie à l'écran sur dev, messages possibles, tableau « Essais de restauration » (date, durée, sauvegarde, résultat) ; vérification mensuelle de la sauvegarde.
- [x] `docs/deploiement.md` -- lien vers `maintenance.md` à la place de l'annonce de la story 5.1.

**Acceptance Criteria:**
- Given une sauvegarde de nuit, when Aurel suit `docs/maintenance.md` pour la restaurer sur dev, then les demandes de la sauvegarde s'affichent dans l'application dev, avec leur historique.
- Given ce test réel, when Aurel ouvre `docs/maintenance.md`, then la date et la durée de la restauration y sont notées.
- Given la procédure, when Aurel la lit, then elle dit où trouver le mot de passe de chiffrement et comment vérifier chaque mois que la sauvegarde de nuit tourne toujours.

## Implementation Notes

- Téléchargement : `gh api --paginate …/actions/artifacts --jq …` pour lister (nom, expiré, exécution, branche, dépôts), filtre en awk (exécution sur `main`, `head_repository_id == repository_id` : le dépôt est public, une autre branche ou une copie peut publier un artefact du même nom), puis `gh run download <exécution> --name <nom>`.
- Déchiffrement : `--status-fd 1` et exigence de `[GNUPG:] BEGIN_DECRYPTION` et `[GNUPG:] DECRYPTION_OKAY` (gpg sort en 0 sur un message non chiffré `gpg --store`).
- Prod : nom de sauvegarde obligatoire (la plus récente peut être la copie de l'état abîmé prise juste avant).
- Le contrôle de la base visée (connexion + `public.demandes` et `public.evenements`) se fait **avant** le téléchargement ; les messages de psql ne sont jamais affichés (ils citent l'utilisateur `postgres.<identifiant>` ou une ligne de données) : `-v VERBOSITY=sqlstate -v SHOW_CONTEXT=never`, et seul le code SQLSTATE est repris dans le message.
- Les blocs `COPY` du schéma `supabase_migrations` et des tables d'historique des services Supabase (`auth.schema_migrations`, `storage.migrations`, `realtime.schema_migrations`, `supabase_functions.migrations`), s'il y en a, ne sont ni vidés ni chargés : ils décrivent la structure, qui vient des migrations de la base visée (AD-16) ou de sa version de Supabase.
- Ajout de `set row_security = off` avant les `DELETE` (comme pg_dump le fait avant ses `COPY`) : une règle RLS qui filtrerait des lignes donne une erreur au lieu d'un effacement partiel silencieux.
- Comptes différents : `raise exception using errcode = 'NV001'` dans un bloc `do`, après le chargement, dans la même transaction.
- Les adresses doivent avoir un utilisateur `postgres.<identifiant>` (forme du *Session pooler*) : c'est ce qui sert à comparer dev et prod (sans casse).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind | Fausse sauvegarde acceptée : `gpg --decrypt` sort en 0 sur un message non chiffré, et l'artefact est choisi par son seul nom dans le dépôt public | high | Vérifié : `gpg --store` puis `--decrypt` → code 0, statut sans `DECRYPTION_OKAY` ; liste `gh api` filtrée sur le nom seulement | patch : exiger `BEGIN_DECRYPTION`/`DECRYPTION_OKAY`, filtrer sur `main` et le dépôt, télécharger par id d'exécution |
| 2 | blind + edge | Prod avec nom vide : l'étape 7.1 rend la sauvegarde de l'état abîmé « la plus récente » | high | Vérifié : `choisir_sauvegarde ""` prend le plus grand nom, quelle que soit la cible | patch : nom exigé pour prod |
| 3 | blind | Tables d'historique des services Supabase (`auth.schema_migrations`…) non exclues | maybe-false → patch défensif | Dépend du contenu exact de l'export de la CLI ; exclusion d'une ligne, même mécanisme que `supabase_migrations` | patch |
| 4 | verif | Fuite des lignes du bloc `supabase_migrations` filtré non testée | medium | Pré-vérifié par la couche | patch : test |
| 5 | verif + blind | Messages « projet inconnu », 42501, 42703 sans test | medium | Pré-vérifié par la couche | patch : tests |
| 6 | blind | maintenance.md : « moins celles déposées depuis » à l'envers ; « au plus 24 h » ambigu ; « commentaires » inexistants | low | Vérifié dans le texte ; corrections directes | patch : doc |
| 7 | blind + edge | Écritures de l'application pendant une restauration de prod | medium | Réel pour prod : comptage NV001 ou lignes mêlées ; sur dev, improbable | patch : doc (demander de ne pas utiliser l'application, attendre la coche verte) ; pas de verrou ajouté |
| 8 | blind + edge | Message « appliquez les migrations » inadapté si la table manquante est dans `auth` | low | Correction directe de la doc | patch : doc |
| 9 | verif + blind | Le SQL réel n'est jamais lancé sur un vrai Postgres | medium (non vérifié) | Aucun banc Postgres dans le dépôt ; essai réel sur dev par Aurel prévu par la story | defer |
| 10 | blind | `BEGIN`/`COMMIT` dans l'export casserait le tout ou rien | false | pg_dump en texte, données seules, n'écrit aucun `BEGIN`/`COMMIT` | rejeté |
| 11 | blind | Seules deux tables comptées après chargement | low | Un `COPY` charge tout ou échoue ; compter `auth.sessions` etc. donnerait de faux échecs | rejeté |
| 12 | blind + edge | Tables de la base visée absentes de la sauvegarde laissées telles quelles | low | Seulement si dev a des migrations plus récentes que prod ; ajout de complexité | rejeté |
| 13 | blind | Prod protégée seulement par une phrase, pas d'`environment` GitHub | low | Seules les personnes avec droit d'écriture lancent une tâche ; elles peuvent déjà tout modifier | rejeté |
| 14 | blind | Tests absents : sous-dossier d'artefact, plusieurs `.gpg`, `GITHUB_REPOSITORY` vide, ancres de la doc | low | Garde-fous simples, rarement atteints | rejeté |
| 15 | blind | Dev garde des données personnelles sans fin ; pas d'essai périodique | low | Décision 3 d'Aurel ; la story demande un essai | rejeté |
| 16 | blind | Adresse dev seulement « différente de prod », pas identifiée | low | Demande un nouveau réglage ; l'adresse vient de Supabase, collée par Aurel | rejeté |
| 17 | edge | Codes 23502/42804 → message générique | low | Le message générique dit déjà quoi faire (code pour le support) | rejeté |
| 18 | edge | Date et durée pas encore notées (critère 2) | low | Voulu : l'essai réel est fait par Aurel ; le tableau l'attend | rejeté (à faire par Aurel) |

## Design Notes

- Données seulement : dev et prod ont la même structure par les migrations (AD-16) ; recharger `structure.sql` ou `roles.sql` sur une base existante échouerait (objets déjà présents). Pour une base neuve (projet prod perdu), on applique d'abord les migrations, puis la même restauration.
- Vider exactement les tables présentes dans la sauvegarde (pg_dump écrit un bloc `COPY` même pour une table vide) : aucune ligne de dev ne reste mêlée à celles de prod.
- Lire les blocs `COPY` avec un état (dans/hors d'un bloc, fin sur la ligne `\.`) : une ligne de données qui commencerait par « COPY » ne doit pas être prise pour une table. `DELETE` plutôt que `TRUNCATE` (droits du rôle `postgres` sur `auth.*` chez Supabase), avec `session_replication_role = replica` (clés étrangères et déclencheurs suspendus pendant le chargement).
- `\restrict`/`\unrestrict` : commandes psql ajoutées par les pg_dump récents ; un `psql` 16 ancien du runner les refuse. On peut retirer ces seules lignes (forme exacte `\restrict <clé>` / `\unrestrict <clé>` sur une ligne entière, impossible dans des données `COPY` où la barre oblique est doublée) : la sauvegarde vient de notre propre base.
- Runner `ubuntu-24.04` : `psql`, `gpg` et `gh` présents ; `gh api` avec `GH_TOKEN: ${{ github.token }}` liste et télécharge l'artefact (zip) sans nouvelle action à épingler. Aucun événement de journal (liste fermée d'AD-13, rien pour une restauration) ; durée et comptes dans le journal d'exécution, jamais une donnée de demandeur.
- Comparer dev et prod sur l'utilisateur de l'adresse (`postgres.<identifiant>`), sans jamais l'afficher. Phrase de confirmation pour prod : `RESTAURER LA PRODUCTION`.
- Non vérifiable par l'agent : aucun `psql`, Docker ni `gh` sur le poste ; le SQL réel n'est éprouvé qu'au premier lancement sur dev par Aurel.

## Verification

**Commands:**
- `npm run test` -- expected: tous les tests verts, dont ceux du script de restauration.
- `npm run lint`, `npx tsc --noEmit`, `npm run secrets` -- expected: aucune erreur, aucune fuite.

**Manual checks:**
- Aurel lance la restauration sur dev, ouvre l'application dev, compare quelques demandes et leur historique avec prod, puis note date et durée dans `docs/maintenance.md`.
