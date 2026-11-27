# Epic 5 Context: Exploiter l'application sans risque

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rendre l'application maintenable, réparable et reprenable par une autre personne, comme l'exige le cahier des charges. Il faut d'abord savoir **restaurer** une sauvegarde de nuit, puis **revenir à la version précédente** en moins de 15 minutes. Ces deux procédures doivent avoir été **réellement exécutées**, avec la date et la durée notées (SM-4). L'epic écrit ensuite les cinq documents d'exploitation. Il se termine par la preuve de qualité avant le rendu : règles métier testées, aucun secret dans l'historique Git, une preuve pour chaque ligne du tableau de couverture (SM-2). C'est un Must, exigé pour le rendu. L'application est complète et conforme à la fin de cet epic. L'epic s'appuie sur la sauvegarde de nuit (story 1.13), la mise en ligne et le tag de version (story 1.12), le journal technique (story 1.2) et `docs/deploiement.md`, déjà en partie rédigé.

## Stories

- Story 5.1 : Restaurer une sauvegarde
- Story 5.2 : Revenir à la version précédente en moins de 15 minutes
- Story 5.3 : Rédiger la documentation d'exploitation
- Story 5.4 : Prouver la qualité avant le rendu

## Requirements & Constraints

**Restauration (story 5.1)**
- La procédure est écrite dans `docs/maintenance.md`. Elle restaure une sauvegarde de nuit **sur dev**, jamais sur prod pour le test. Après la restauration, les demandes doivent être complètes, **avec leur historique**.
- La date et la durée du test réel sont notées dans la documentation.
- La procédure dit où trouver le mot de passe de chiffrement : dans les secrets GitHub, et aussi dans un gestionnaire de mots de passe hors de GitHub. Elle dit aussi comment vérifier chaque mois que la sauvegarde de nuit tourne toujours.
- Les sauvegardes sont quotidiennes et gardées 7 jours. La perte maximale acceptée est de 24 heures.

**Retour arrière (story 5.2)**
- La procédure est écrite dans `docs/maintenance.md`. Avec deux versions taguées en production, la version précédente doit être en ligne en **moins de 15 minutes**, et le menu doit afficher son numéro.
- La date et la durée mesurée du test réel sont notées.
- La procédure dit quoi faire quand la version à annuler a modifié la base (migration).

**Documentation (story 5.3)** : cinq documents courts dans `docs/`.
- `deploiement.md` : mettre en ligne une nouvelle version. Critère : une personne qui n'a pas développé le projet le suit **sans aide**.
- `maintenance.md` : mises à jour, journal, sauvegardes, retour arrière.
- `support.md` : il contient trois parties.
  - Le **niveau 1** est assuré par un administrateur Nova, sans compétence technique : questions d'utilisation, mot de passe à réinitialiser, catégorie à ajouter.
  - Le **niveau 2** est assuré par le développeur : bug, panne, restauration, retour arrière. Le document dit quand le niveau 1 passe la main et ce qu'il transmet : heure, page, code d'erreur, référence de la demande. Il dit aussi comment vérifier chaque mois la sauvegarde de nuit.
  - Le **plan en cas d'indisponibilité** répond à cinq questions : comment on s'aperçoit de la panne ; qui prévenir ; quoi vérifier dans l'ordre (hébergeur, base, dernière mise en production) ; quand revenir en arrière ou restaurer ; que dire aux demandeurs (« contactez-nous par téléphone au… »).
  - Pour le challenge, des rôles fictifs suffisent pour les deux niveaux.
- `securite-acces.md` : qui a accès à quoi, gestion des comptes, gestion des secrets.
- `donnees-personnelles.md` : données collectées, finalité, conservation 3 ans après clôture, droits des personnes, procédure de suppression (FR-28) et règle d'anonymisation (FR-29). La règle doit être documentée même si la fonction d'anonymisation (Should) n'est pas réalisée. Le document doit aussi **fixer la durée de conservation du journal technique**, aujourd'hui sans purge. L'architecture propose 12 mois, avec une purge par la tâche de nuit.
- Toute documentation produite par l'IA est relue.

**Preuve de qualité (story 5.4, en dernier, juste avant le rendu)**
- Chaque règle de RM-1 à RM-14 qui concerne une fonction **réalisée** a au moins un test dans `tests/regles/`, et tous les tests passent. RM-13 (anonymisation) et RM-14 (attribution) relèvent de l'epic 6 (Should).
- gitleaks sur **tout l'historique Git** ne trouve aucun secret (SM-7).
- Le journal technique contient au moins une ligne de chaque événement de la liste fermée lié aux fonctions réalisées, sans aucune donnée de demandeur. `anonymisation` et `envoi_refuse` dépendent de fonctions Should.
- Chaque ligne du tableau de couverture du cahier des charges (addendum du PRD, §A) est cochée « ✓ » avec le lien vers sa preuve : capture, test ou document. Cela inclut SM-5 (une personne qui découvre le formulaire dépose une demande en moins de 2 minutes) et SM-6 (un collaborateur retrouve une demande en moins de 30 secondes).
- Une note **« Démarche IA »** décrit les outils utilisés, ce que l'IA a produit et comment cela a été vérifié. Le développeur reste responsable de la solution finale.

## Technical Decisions

- **Sauvegarde existante (AD-18, story 1.13)** : la tâche `.github/workflows/sauvegarde-nuit.yml` lance `scripts/sauvegarde/sauvegarder.sh`. Elle produit un artefact `sauvegarde-prod-AAAA-MM-JJ-HHMM` qui contient **un seul fichier `.tar.gz.gpg`**, chiffré en AES256 symétrique par `gpg` et gardé 7 jours.
  - L'archive contient trois exports de la Supabase CLI 3.0.0 (`supabase db dump`) : les rôles (`--role-only`), la structure, et les données (`--data-only --use-copy`). Les données incluent `auth.users`, avec les mots de passe hachés.
  - Les secrets sont `SAUVEGARDE_URL_BASE_PROD` et `SAUVEGARDE_MOT_DE_PASSE`. L'adresse est celle du *Session pooler*, port 5432 en IPv4. La connexion directe passe en IPv6, que GitHub ne sait pas joindre, et le port 6543 ne convient pas à `pg_dump`.
  - Chaque réussite écrit `sauvegarde_reussie` dans le journal, avec le nom du fichier, le numéro d'exécution et la taille.
  - La restauration n'a **jamais** été éprouvée.
- **Restauration (story 5.1)** : il faut télécharger l'artefact, le déchiffrer avec le mot de passe, puis réinjecter les exports dans **dev**.
  - Le dépôt est public : les artefacts et les journaux d'exécution sont téléchargeables par tous. Un export déchiffré ne doit **jamais** être publié, ni commité, ni affiché. Ne jamais utiliser `--dry-run`, `--debug` ni `set -x`, qui affichent le mot de passe.
  - Point à traiter dans la story : dev a déjà sa structure par migrations, et la sauvegarde contient les données personnelles de prod et `auth.users`.
- **Vérification mensuelle (AD-18)** : GitHub met en pause, sans prévenir, les tâches planifiées d'un dépôt public resté 60 jours sans activité. Chaque mois, il faut contrôler que la dernière `sauvegarde_reussie` date de moins de 24 h, et réactiver la tâche si besoin. Une nuit ratée laisse jusqu'à 48 h sans sauvegarde, et il ne reste plus rien après 7 nuits d'échec. La partie « Sauvegarde de nuit » de `docs/deploiement.md` décrit déjà ce contrôle, à reprendre ou à relier depuis `maintenance.md`.
- **Mise en production et retour arrière (AD-17)** : la production correspond à `main`, déployée automatiquement par Vercel Hobby.
  - Chaque mise en production porte un tag `vX.Y.Z`, identique à la version de `package.json` et affichée dans le menu. Avant le tag, Vitest et Playwright passent sur **dev**.
  - Pour le retour arrière, on utilise **Instant Rollback** de Vercel. L'offre gratuite ne permet de revenir qu'à **la** version précédente. Pour revenir plus loin, on redéploie un ancien tag.
  - `docs/deploiement.md` renvoie déjà à l'epic 5 pour la procédure complète.
- **Migrations et retour arrière (AD-16)** : la structure de la base ne change que par `supabase/migrations/`. Une migration s'applique d'abord sur dev, puis sur prod avec la Supabase CLI. Aucune modification à la main dans le tableau de bord de prod.
  - Une migration reste **compatible avec la version précédente** : on ajoute d'abord, et on ne retire que dans une version suivante. C'est ce qui permet de revenir en arrière côté application sans toucher à la base.
  - La procédure de la story 5.2 doit l'expliquer pour une version qui a modifié la base.
- **Journal (AD-13)** : on écrit uniquement par `journaliser()`, avec une liste fermée d'événements. Le support de niveau 2 consulte et filtre le journal dans le tableau de bord de Supabase : il n'existe aucun écran dans l'application. Les journaux de Vercel ne sont gardés qu'une heure.
  - Pour une erreur de page, on retrouve la ligne avec le **code ET l'heure** affichés par S3, car la même erreur garde le même code. Ce point est à écrire dans `support.md`.
  - Rappel (NFR-6) : une erreur provoquée volontairement en production doit être retrouvée en moins de 5 minutes.
- **Secrets (AD-15)** : deux projets Supabase, dev et prod, en Europe. Les clés sont des variables d'environnement listées avec des valeurs fictives dans `.env.example`. Aucune clé secrète ne porte le préfixe `NEXT_PUBLIC_`. gitleaks analyse le dépôt avant chaque mise en production.
- **Tests** : Vitest, avec un fichier par règle dans `tests/regles/`, et Playwright pour le parcours SM-1. Ils tournent **uniquement sur dev**, jamais sur prod.
- **Report possible** : lancer automatiquement lint, types, Vitest et gitleaks par GitHub Actions à chaque envoi sur `main`, puisque chaque envoi publie la production. Ce report était renvoyé à l'exploitation.

## UX & Interaction Patterns

- **S3 (erreur inattendue)** : la page affiche une ligne discrète à recopier pour le support, par exemple « Code : 7F3A · 8 nov. 2026, 9 h 14 · /demandes/NOVA-2026-0042 ». Ce sont les informations que le niveau 1 transmet au niveau 2. Aucun détail technique n'est affiché.
- **Version** : le numéro de version s'affiche en bas du menu latéral de l'espace interne. C'est la preuve visible d'un retour arrière réussi.

## Cross-Story Dependencies

- **Ordre de construction : 5.1 → 5.2 → 5.3 → 5.4.** La 5.4 vient en dernier, juste avant le rendu.
- **5.1** dépend de la story 1.13 : la tâche doit avoir déjà produit au moins un artefact réel en prod. Aurel exécute les actions sur GitHub, Supabase et Vercel.
- **5.2** a besoin de deux versions taguées en production, issues de la story 1.12 et des mises en production suivantes.
- **5.1 et 5.2** créent `docs/maintenance.md`. La **5.3** le complète, puis écrit `support.md`, `securite-acces.md` et `donnees-personnelles.md`, et relit `deploiement.md` sans le réécrire entièrement.
- La procédure de suppression d'une demande (epic 4, story 4.4) est documentée dans `donnees-personnelles.md`.
- **5.4** s'appuie sur tous les epics 1 à 4 : tests des règles, événements du journal, captures. Les fonctions Should de l'epic 6 (anonymisation, anti-spam, attribution) sont hors périmètre de la preuve si elles ne sont pas réalisées.
