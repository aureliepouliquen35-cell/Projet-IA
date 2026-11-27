# Maintenance de Nova Services

Ce document décrit l'exploitation de Nova Services une fois en ligne. Pour l'instant, il explique comment [restaurer une sauvegarde](#restaurer-une-sauvegarde) de nuit (story 5.1). Les autres parties (retour à la version précédente, mises à jour, journal) viendront avec la suite de l'exploitation (epic 5).

La mise en place (installation, mise en ligne, sauvegarde de nuit) est décrite dans [`deploiement.md`](deploiement.md).

## Restaurer une sauvegarde

Chaque nuit, la tâche *Sauvegarde de nuit* enregistre la base **prod** dans un fichier chiffré, gardé 7 jours comme artefact GitHub ([`deploiement.md`, partie « Sauvegarde de nuit »](deploiement.md#sauvegarde-de-nuit)). La restauration remet le contenu d'un de ces fichiers dans une base Supabase. Elle se lance depuis GitHub, par la tâche **Restaurer une sauvegarde** (`.github/workflows/restauration.yml`) :

- il n'y a rien à installer sur votre poste ;
- le mot de passe de chiffrement reste dans les secrets GitHub ;
- le fichier est déchiffré sur la machine de GitHub, puis effacé : les données en clair ne passent **jamais** par votre poste. Ne téléchargez donc pas l'artefact vous-même : la tâche le fait.

La tâche peut viser deux bases :

- **dev**, par défaut : c'est l'essai, pour vérifier que les sauvegardes se relisent vraiment. On ne fait jamais d'essai sur prod.
- **prod** : seulement en cas de vrai problème. Il faut alors recopier une phrase de confirmation.

### Ce que fait la restauration

1. Elle contrôle les secrets, et pour **dev** que l'adresse vise bien un **autre projet** que prod.
2. Elle vérifie que la base visée répond et qu'elle a les migrations de Nova (tables `demandes` et `evenements`).
3. Elle télécharge la sauvegarde choisie, ou, sur dev seulement, la plus récente qui n'a pas expiré. Seuls comptent les artefacts de la tâche lancée sur `main` dans ce dépôt. Elle la déchiffre, vérifie qu'elle était vraiment chiffrée et que c'est bien une sauvegarde de Nova.
4. Elle **remplace les données** de la base visée en **une seule transaction**. Elle vide les tables présentes dans la sauvegarde, comptes de connexion (`auth.users`) compris, puis recharge leurs lignes. Elle compte ensuite les demandes et les lignes d'historique : il doit y en avoir autant que dans la sauvegarde.

C'est **tout ou rien** : si une erreur survient ou si les comptes diffèrent, tout est annulé et la base visée reste exactement comme avant. Tant qu'un contrôle des étapes 1 à 3 échoue, rien n'est touché.

Seules les **données** sont restaurées. La structure de la base (tables, droits, fonctions) vient toujours des migrations de `supabase/migrations`, que la base visée doit **déjà** avoir. L'historique des migrations de la base visée n'est pas touché non plus.

La tâche ne publie rien et n'écrit aucune ligne dans le journal technique. Ses journaux d'exécution sont **publics**, comme le dépôt : ils ne montrent que les étapes, le nom de la sauvegarde, les nombres de demandes et de lignes d'historique, et la durée. Ils ne montrent ni secret, ni identifiant de projet, ni aucune donnée de demandeur.

### 1. Le mot de passe de chiffrement

Sans lui, les sauvegardes sont illisibles. Il est rangé à deux endroits :

- dans les **secrets GitHub** du dépôt, sous le nom `SAUVEGARDE_MOT_DE_PASSE` (*Settings › Secrets and variables › Actions*). GitHub ne le réaffiche jamais ;
- dans votre **gestionnaire de mots de passe**, entrée « Nova – chiffrement des sauvegardes », créée lors de la mise en place ([`deploiement.md`, « Sauvegarde de nuit », étape 1](deploiement.md#1-mot-de-passe-de-chiffrement)).

Si le secret GitHub a disparu ou a été changé par erreur, recréez-le en copiant le mot de passe depuis le gestionnaire. Ne le copiez nulle part ailleurs : jamais dans un fichier du dépôt, un message, un ticket ou une conversation (avec un assistant d'IA compris).

Un mot de passe de chiffrement changé ne vaut que pour les sauvegardes **suivantes**. Les fichiers déjà enregistrés ne s'ouvrent qu'avec l'ancien mot de passe.

### 2. L'adresse de la base dev (une seule fois)

La tâche a besoin de trois secrets :

- `SAUVEGARDE_MOT_DE_PASSE` et `SAUVEGARDE_URL_BASE_PROD` existent déjà (sauvegarde de nuit) ;
- un seul est à créer : `RESTAURATION_URL_BASE_DEV`, l'adresse *Session pooler* de la base **dev**.

1. Dans le tableau de bord Supabase du projet **dev**, bouton *Connect*, onglet *Connection String*, méthode **Session pooler** (les intitulés peuvent légèrement varier). L'adresse a la forme `postgresql://postgres.<identifiant dev>:[YOUR-DATABASE-PASSWORD]@aws-….pooler.supabase.com:5432/postgres`. Vérifiez qu'elle contient l'identifiant du projet **dev** (pas celui de prod) et le port `5432`.
2. Le mot de passe de la base dev ne doit contenir que des lettres, des chiffres et `. _ ~ -`. S'il contient d'autres caractères, ou si vous ne l'avez plus : *Project Settings › Database › Reset database password* du projet dev, générez un mot de passe fait seulement de lettres et de chiffres, puis rangez-le dans votre gestionnaire (entrée « Nova – base dev »). L'application n'utilise pas ce mot de passe : elle n'est pas touchée.
3. Sur GitHub, dans le dépôt : *Settings › Secrets and variables › Actions*, *New repository secret*. Nom : `RESTAURATION_URL_BASE_DEV`. Valeur : l'adresse de l'étape 1, en remplaçant `[YOUR-DATABASE-PASSWORD]`, **crochets compris**, par le mot de passe de la base dev. Résultat attendu : `postgresql://postgres.<identifiant dev>:MotDePasseDeLaBase@aws-….pooler.supabase.com:5432/postgres`, sans `[`, sans `]` ni espace.

La connexion directe (`db.<identifiant>.supabase.co`) ne convient pas : GitHub ne sait pas la joindre. Le port `6543` ne convient pas non plus. La tâche refuse ces deux adresses, et refuse aussi une adresse dev qui viserait le même projet que prod.

### 3. Avant un essai : dev a toutes les migrations

La sauvegarde ne contient que des données : dev doit avoir au moins les migrations de prod. Poste relié à **dev** (`npx supabase link --project-ref <identifiant dev>`) :

```bash
npx supabase migration list --remote
```

Toutes les migrations de `supabase/migrations` doivent figurer dans les colonnes *Local* et *Remote*. Sinon, appliquez-les d'abord avec `npx supabase db push --remote` ([`deploiement.md`, Installation, étape 3](deploiement.md#3-structure-de-la-base)).

### 4. Essai sur dev, pas à pas

La tâche n'existe pour GitHub qu'une fois le fichier `.github/workflows/restauration.yml` envoyé sur `main` (`git push origin main`).

1. Onglet *Actions* du dépôt, tâche **Restaurer une sauvegarde** (colonne de gauche), bouton *Run workflow*.
2. Remplissez le formulaire :
   - *Use workflow from* : `main` ;
   - *Base à remplacer* : `dev` ;
   - *Nom de l'artefact* : laissez **vide** pour la sauvegarde la plus récente, ou recopiez un nom `sauvegarde-prod-AAAA-MM-JJ-HHMM`. Les noms se trouvent dans la partie *Artifacts* d'une exécution de *Sauvegarde de nuit* ;
   - *Pour prod seulement* : laissez **vide**.
3. Cliquez sur *Run workflow*, notez l'heure, ouvrez l'exécution qui apparaît et attendez qu'elle se termine (quelques minutes). Elle doit avoir une **coche verte**. En cas de croix rouge, ouvrez l'étape *Télécharger, déchiffrer et restaurer* : le message dit quoi faire (voir « Messages possibles » ci-dessous). Dans ce cas, dev n'a pas été modifié.
4. En cas de réussite, l'étape *Télécharger, déchiffrer et restaurer* se termine par deux lignes :

   ```
   Restauration réussie sur la base dev : N demandes et M lignes d'historique restaurées, depuis sauvegarde-prod-AAAA-MM-JJ-HHMM.
   Durée : X min YY s.
   ```

5. Notez la date, la durée et le nom de la sauvegarde dans le tableau [« Essais de restauration »](#essais-de-restauration) ci-dessous. Vous y noterez le résultat après les vérifications de l'étape 5.

### 5. Ce qu'on vérifie sur dev

Lancez l'application sur le poste, reliée à dev (`npm run dev`, avec `.env.local`).

1. **On se connecte avec un compte de prod.** Les comptes de dev ont été remplacés par ceux de prod, avec leurs mots de passe : connectez-vous avec **votre compte administrateur de prod** et son mot de passe de prod. Les sessions ouvertes avant la restauration ne valent plus : il faut se reconnecter.
2. **Le bon nombre de demandes.** Sans recherche ni filtre, la liste des demandes de dev annonce « N demandes », comme la ligne « Restauration réussie ». En production, connectez-vous : la liste compte ces N demandes, plus celles déposées depuis l'heure de la sauvegarde, moins celles supprimées depuis.
3. **Les mêmes demandes, avec leur historique.** Ouvrez trois demandes de la sauvegarde, côte à côte en dev et en production : une ancienne, une récente, et une qui a changé de statut. Elles doivent montrer la même référence, le même contenu et le même historique (création et changements de statut, dans le même ordre).
4. **Plus de données de dev.** La demande « Essai automatique SM-1 … » laissée par le test automatique n'apparaît plus sur dev : la recherche « Essai automatique » ne trouve rien. C'est la preuve que les données de dev ont bien été remplacées. Les coordonnées de Nova affichées sur dev sont celles de prod.

Si tout est conforme, notez « Réussie » dans le tableau. Sinon, notez ce qui diffère, et gardez l'heure et le numéro de l'exécution pour le support.

### 6. Après l'essai : dev garde la copie de prod

Après l'essai, dev **reste** une copie de prod, comptes compris. Il contient donc de **vraies données personnelles** de demandeurs : traitez-le comme prod. Ne faites ni captures d'écran, ni partage de ses données, et ne donnez l'accès à personne d'autre.

Les comptes propres à dev ont disparu, en particulier le **collaborateur de test** utilisé par `npm run test:e2e`. Pour le recréer, sur **dev** (`.env.local`), comme lors de l'installation ([`deploiement.md`, Installation, étape 6](deploiement.md#6-collaborateur-de-test-dev-seulement)) :

```bash
npm run compte:creer -- --nom "Collaborateur Essai" --email collaborateur.essai@exemple.fr --role collaborateur
```

1. Vérifiez que l'adresse affichée est celle du projet **dev**, puis tapez `oui`.
2. Notez le mot de passe temporaire (affiché une seule fois).
3. Connectez-vous une fois avec ce compte sur `/connexion` (application locale) et choisissez son nouveau mot de passe.
4. Reportez ce nouveau mot de passe dans `E2E_MOT_DE_PASSE` de `.env.local`. `E2E_EMAIL` ne change pas.
5. Relancez `npm run test:e2e` : il doit être vert, et il laisse de nouveau sur dev une demande « Essai automatique SM-1 … » (vérification « Données séparées » de la mise en ligne).

Les autres commandes d'installation restent utilisables sur dev si besoin. Par exemple, `npm run parametres:installer` remet des coordonnées d'essai ([étape 5](deploiement.md#5-coordonnées-de-nova)).

### 7. Restaurer la production (vrai problème)

À faire seulement si les données de prod sont abîmées ou perdues : suppressions par erreur, base vidée, projet perdu. Un défaut de l'application ne se répare **pas** par une restauration. La restauration remplace **toutes** les données de prod par celles de la sauvegarde. Tout ce qui a été fait **depuis l'heure de la sauvegarde** est perdu : demandes déposées, changements de statut, comptes créés ou mots de passe changés. La perte est d'au plus 24 heures si l'on restaure la **dernière sauvegarde de nuit réussie** ; elle est plus grande si l'on choisit une sauvegarde plus ancienne (par exemple parce que le problème date de plusieurs jours).

1. **Gardez l'état actuel.** Lancez d'abord à la main la tâche *Sauvegarde de nuit* (*Actions › Sauvegarde de nuit › Run workflow*), et **attendez sa coche verte** avant de continuer. Elle conserve 7 jours une copie de la base telle qu'elle est maintenant, au cas où il faudrait y revenir. Cette copie devient la sauvegarde la plus récente : c'est pourquoi, pour prod, la tâche de restauration exige le nom exact de la sauvegarde voulue.
2. **Prévenez vos collègues** de ne pas utiliser l'application pendant la restauration (quelques minutes) : une modification faite pendant le chargement le fait échouer, et la restauration est alors annulée.
3. **Choisissez la sauvegarde.** *Actions › Sauvegarde de nuit*, ouvrez la dernière exécution réussie **avant** le problème. Sa partie *Artifacts* donne le nom `sauvegarde-prod-AAAA-MM-JJ-HHMM` (heure de Paris).
4. **Lancez la restauration.** *Actions › Restaurer une sauvegarde › Run workflow* : branche `main`, *Base à remplacer* `prod`, *Nom de l'artefact* = le nom de l'étape 3 (obligatoire pour prod). Dans *Pour prod seulement*, recopiez exactement `RESTAURER LA PRODUCTION`, en majuscules. Sans cette phrase exacte ou sans nom, la tâche s'arrête avant de télécharger quoi que ce soit.
5. **Vérifiez en production** comme à l'étape 5, points 2 et 3, sur l'adresse de production.
6. **Prévenez** les personnes qui ont travaillé depuis l'heure de la sauvegarde : leurs dernières actions (changements de statut, comptes) sont à refaire. Les demandeurs qui ont déposé une demande depuis cette heure-là devront la redéposer.

**Projet prod perdu** (supprimé, inaccessible) : créez un nouveau projet prod et refaites, sur ce projet, les étapes 2 et 3 de l'Installation ([réglages Auth, migrations](deploiement.md#installation)). Mettez à jour le secret `SAUVEGARDE_URL_BASE_PROD` avec l'adresse *Session pooler* du nouveau projet, puis restaurez comme ci-dessus. Les comptes reviennent avec la sauvegarde : ne recréez pas l'administrateur. Mettez enfin à jour les variables de Vercel ([Mise en ligne, étape 4](deploiement.md#4-variables-denvironnement)) et redéployez. Ce cas n'a pas été essayé.

### Messages possibles

| Message | Ce qu'il faut faire |
|---|---|
| « Restaurer la production remplace toutes ses données… recopiant exactement « RESTAURER LA PRODUCTION »… » | Relancez avec la phrase exacte, en majuscules, dans *Pour prod seulement*, seulement si vous voulez vraiment remplacer prod. Rien n'a été modifié. |
| « Pour restaurer la production, indiquez le nom de la sauvegarde voulue… » | Pour prod, le champ *Nom de l'artefact* est obligatoire : la plus récente peut être la copie de l'état abîmé ([étape 7](#7-restaurer-la-production-vrai-problème), points 1 et 3). Relancez avec le nom de la sauvegarde voulue. Rien n'a été modifié. |
| « Le secret … est vide ou absent… » | Créez ce secret, avec exactement ce nom ([étape 2](#2-ladresse-de-la-base-dev-une-seule-fois), ou [`deploiement.md`](deploiement.md#3-secrets-github) pour les deux secrets de la sauvegarde), puis relancez. |
| « …SAUVEGARDE_MOT_DE_PASSE est trop court… » | Ce n'est pas le mot de passe de chiffrement : recopiez-le depuis le gestionnaire ([étape 1](#1-le-mot-de-passe-de-chiffrement)). |
| « …n'a pas la forme attendue… », « …ne contient pas le mot de passe de la base… », « …entouré de crochets [ ]… », « …contient des caractères spéciaux… » | Recollez l'adresse *Session pooler* nommée dans le message, en remplaçant bien `[YOUR-DATABASE-PASSWORD]`, crochets compris ([étape 2](#2-ladresse-de-la-base-dev-une-seule-fois)). |
| « …n'est pas celle du « Session pooler »… » | Vous avez pris la connexion directe (`db.….supabase.co`) ou le port `6543` : reprenez l'adresse *Session pooler*, port `5432`. |
| « RESTAURATION_URL_BASE_DEV vise le même projet que SAUVEGARDE_URL_BASE_PROD… » | Le secret dev contient l'adresse de prod : remplacez-la par celle du projet **dev** ([étape 2](#2-ladresse-de-la-base-dev-une-seule-fois)). Rien n'a été modifié. |
| « La base … refuse le mot de passe… » ou « Le projet de l'adresse … est inconnu de Supabase… » | Mot de passe de la base ou identifiant du projet faux dans l'adresse : recopiez-les, puis mettez à jour le secret. |
| « La base … est injoignable… » | Le projet est peut-être en pause dans Supabase (offre gratuite) : ouvrez-le dans le tableau de bord et cliquez sur *Restore project*, puis relancez. |
| « La base … n'a pas les tables de Nova… » | La base visée n'a pas les migrations : appliquez-les ([étape 3](#3-avant-un-essai--dev-a-toutes-les-migrations)), puis relancez. |
| « La sauvegarde … est introuvable… » | Le nom est mal recopié, ou l'artefact ne vient pas de la tâche *Sauvegarde de nuit* lancée sur `main` dans ce dépôt (seuls ceux-là sont acceptés) : reprenez le nom dans la partie *Artifacts* d'une exécution de *Sauvegarde de nuit*, ou, sur dev, laissez le champ vide. |
| « La sauvegarde … a expiré… » | Elle a plus de 7 jours : choisissez-en une plus récente. |
| « Aucune sauvegarde disponible… » | Aucune sauvegarde de nuit n'a réussi depuis 7 jours : voyez la [vérification mensuelle](#vérification-mensuelle-de-la-sauvegarde-de-nuit), corrigez la tâche *Sauvegarde de nuit* et relancez-la. |
| « Le nom de sauvegarde n'a pas la forme attendue… » | Recopiez le nom exact, de la forme `sauvegarde-prod-AAAA-MM-JJ-HHMM`, sans `.tar.gz.gpg`. |
| « La liste des sauvegardes n'a pas pu être lue… » ou « Le téléchargement de la sauvegarde … a échoué… » | Problème passager de GitHub, le plus souvent : relancez. |
| « Le déchiffrement … a échoué : mot de passe de chiffrement faux ou fichier abîmé… » | Vérifiez que le secret `SAUVEGARDE_MOT_DE_PASSE` est identique à l'entrée du gestionnaire ([étape 1](#1-le-mot-de-passe-de-chiffrement)). Si le mot de passe a changé depuis cette sauvegarde, il faut l'ancien. Sinon, essayez une autre sauvegarde. |
| « …ce n'est pas une sauvegarde de Nova… » ou « …est incomplet… » | Le fichier n'est pas une sauvegarde complète : choisissez une autre sauvegarde. |
| « Une table ou une colonne de la sauvegarde manque dans la base… » | La base est inchangée. Le plus souvent, la base visée a moins de migrations que prod : appliquez-les ([étape 3](#3-avant-un-essai--dev-a-toutes-les-migrations)), puis relancez. Si l'erreur revient alors que les migrations sont à jour, la table en cause est sans doute dans le schéma `auth`, géré par Supabase et non par nos migrations : c'est une différence de version de Supabase entre les deux projets. Ne forcez rien : notez l'heure et le numéro de l'exécution pour le support. |
| « …ne compte pas N demandes et M lignes d'historique comme la sauvegarde… » | Restauration annulée, base inchangée. Ne recommencez pas tout de suite : notez l'heure et le numéro de l'exécution pour le support. |
| « La restauration a échoué (code d'erreur PostgreSQL …) » ou « Droits insuffisants… » ou « …s'est interrompue… » | Restauration annulée, base inchangée. Relancez une fois ; si cela se reproduit, notez le code, l'heure et le numéro de l'exécution pour le support. |

### Essais de restauration

Le premier essai réel sur dev prouve que la sauvegarde se relit (NFR-7, SM-4). Après chaque essai, ajoutez une ligne :

- **Date** : le jour et l'heure du lancement ;
- **Durée** : la ligne « Durée : … » affichée par la tâche ;
- **Sauvegarde** : le nom de l'artefact restauré ;
- **Résultat** : « Réussie » si les vérifications de l'[étape 5](#5-ce-quon-vérifie-sur-dev) sont bonnes, sinon ce qui diffère.

| Date | Durée | Sauvegarde | Résultat |
|---|---|---|---|
| *(premier essai sur dev à faire)* | | | |

### Vérification mensuelle de la sauvegarde de nuit

Une restauration n'est possible que si la sauvegarde de nuit tourne toujours. GitHub **met en pause, sans prévenir, les tâches planifiées d'un dépôt public resté 60 jours sans activité**. Il ne reste alors plus rien à restaurer au bout de 7 nuits. Une fois par mois :

1. **La tâche tourne** : onglet *Actions*, tâche *Sauvegarde de nuit*. La dernière exécution, déclenchée par *schedule* (la nuit), a une coche verte et date de moins de 24 heures. Sa partie *Artifacts* montre un artefact `sauvegarde-prod-AAAA-MM-JJ-HHMM`. Si un bandeau indique que la tâche est en pause, cliquez sur *Enable workflow*, puis relancez-la à la main (*Run workflow*) sans attendre la nuit.
2. **Le journal le confirme** : tableau de bord Supabase du projet **prod**, *Table Editor › journal_technique*, filtre `evenement` = `sauvegarde_reussie`, tri par `date_creation` décroissante. La première ligne a moins de 24 heures.
3. **Le mot de passe de chiffrement est toujours rangé** : l'entrée « Nova – chiffrement des sauvegardes » est dans votre gestionnaire, et *Settings › Secrets and variables › Actions* liste toujours `SAUVEGARDE_MOT_DE_PASSE`, `SAUVEGARDE_URL_BASE_PROD` et `RESTAURATION_URL_BASE_DEV`.

En cas de croix rouge, corrigez et relancez la tâche le jour même ([`deploiement.md`, « Sauvegarde de nuit », étapes 4 et 5](deploiement.md#4-premier-lancement-à-la-main)). Une nuit en échec porte la perte possible à près de 48 heures.
