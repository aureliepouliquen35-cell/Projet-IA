# Déploiement de Nova Services

Ce document décrit la mise en place de Nova Services sur un projet Supabase. Il décrit aussi la [mise en ligne](#mise-en-ligne) (story 1.12) et la [sauvegarde de nuit](#sauvegarde-de-nuit) de la base prod (story 1.13) ; il sera complété par l'exploitation (epic 5).

Deux projets Supabase existent : **dev** (poste local, essais) et **prod** (production Vercel). Faites toujours chaque étape sur **dev** d'abord, vérifiez-la, puis seulement sur **prod**.

## Installation

L'installation se fait une seule fois par projet Supabase. Elle crée la structure de la base, ferme les inscriptions, crée le **premier administrateur** et enregistre les **vraies coordonnées** de Nova. Ensuite, elle ne sert plus : les comptes suivants et les coordonnées se gèrent depuis l'application (écrans *Comptes* et *Informations générales*).

### 1. Ce qu'il faut avant de commencer

- Le dépôt sur votre poste, avec ses dépendances : `npm install`.
- Le projet Supabase lié à la ligne de commande : `npx supabase link --project-ref <identifiant du projet>` (l'identifiant est dans l'adresse du tableau de bord, `https://supabase.com/dashboard/project/<identifiant>`).
- Un fichier de clés, jamais envoyé sur GitHub (tous les fichiers `.env…` sont ignorés par git, sauf `.env.example`) :
  - **dev** : `.env.local`, copie de `.env.example` remplie avec les valeurs du projet dev ;
  - **prod** : `.env.prod.local`, avec seulement `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SECRET_KEY` du projet prod. Next.js ne lit jamais ce fichier. **Effacez-le dès la fin de l'installation** (étape 7).

Les commandes d'installation ne montrent jamais les clés. Avant d'agir, elles affichent l'adresse du projet visé et attendent que vous tapiez `oui` : vérifiez bien que c'est le bon projet.

### 2. Réglages de Supabase Auth

Dans le tableau de bord Supabase du projet (les intitulés peuvent légèrement varier) :

1. **Fermer les inscriptions** : *Authentication › Sign In / Providers*, section *User Signups* : désactivez **Allow new users to sign up**, puis *Save*. Personne ne peut plus créer de compte seul (RM-8) ; les comptes existants se connectent toujours.
2. **Garder la connexion par email** : sur la même page, le fournisseur **Email** reste activé (c'est lui qui permet de se connecter avec un email et un mot de passe).
3. **Longueur minimale du mot de passe** : dans les réglages du fournisseur **Email**, mettez **Minimum password length** à `12`, puis *Save*.

Les mêmes valeurs sont écrites dans `supabase/config.toml` (`enable_signup = false`, `minimum_password_length = 12`), pour en garder la trace. Ce fichier ne règle **pas** le projet en ligne : on ne lance pas `supabase config push`, le réglage se fait à la main ci-dessus.

### 3. Structure de la base

```bash
npx supabase db push --remote
npx supabase migration list --remote
```

`--remote` vise le projet lié (sans lui, la ligne de commande cherche une base locale). Elle le présente comme « production » : c'est le nom que Supabase donne à la branche principale de **tout** projet, pas le signe que vous visez le projet prod de Nova. Vérifiez l'identifiant affiché (`Target: project … (<identifiant>)`).

La seconde commande doit montrer toutes les migrations de `supabase/migrations` dans les deux colonnes *Local* et *Remote* (cinq au moment de la story 1.5, la dernière étant `20261120090000`, « comptes »).

### 4. Premier administrateur

Sur **dev** :

```bash
npm run compte:creer -- --nom "Prénom Nom" --email prenom.nom@exemple.fr --role administrateur
```

1. Vérifiez l'adresse du projet affichée et le résumé, puis tapez `oui`.
2. La commande affiche le **mot de passe temporaire une seule fois**. Notez-le et transmettez-le vous-même à la personne (de vive voix de préférence). Aucun email n'est envoyé.
3. À sa première connexion, la personne devra choisir son propre mot de passe.

Ce qu'il faut vérifier dans le tableau de bord :

- *Authentication › Users* : le compte existe, son email est confirmé.
- *Table Editor › profils* : une ligne avec le même identifiant, `role` = `administrateur`, `actif` = `true`, `doit_changer_mdp` = `true`.
- *Table Editor › mdp_temporaires* : une ligne pour ce compte, dont l'empreinte commence par `$2` (jamais le mot de passe en clair).
- *Table Editor › journal_technique* : un événement `compte_cree`, sans aucun mot de passe.

Messages possibles :

| Message | Ce qu'il faut faire |
|---|---|
| « Un compte existe déjà avec cet email. » | Rien n'a été créé. Le compte existe déjà : vérifiez-le dans *Authentication › Users*. S'il y est mais n'a **aucune ligne** dans *Table Editor › profils* (commande interrompue, par Ctrl+C ou une coupure réseau, entre les deux étapes), supprimez-le dans *Authentication › Users*, puis relancez la commande. |
| Une erreur sur `--nom`, `--email` ou `--role` | Rien n'a été créé. Corrigez l'option et relancez. |
| « …manquante ou invalide : complétez le fichier d'environnement… » | Complétez le fichier de clés sur le modèle de `.env.example`. |
| « …n'a pas pu être confirmée, et sa suppression dans Supabase Auth a échoué (identifiant : …) » | Ouvrez *Table Editor › profils* et cherchez cet identifiant. Si une ligne existe, le compte a bien été créé : il ne faut pas le supprimer, mais son mot de passe temporaire (jamais affiché) devra être réinitialisé. Sinon, le compte Auth est resté seul : supprimez-le dans *Authentication › Users*, puis relancez la commande. Donnez le code affiché au support s'il se reproduit. |

### 5. Coordonnées de Nova

Elles s'affichent aux demandeurs : téléphone et email de contact sur l'écran de confirmation et en cas de panne, contact pour les données personnelles dans la mention du formulaire. La migration a mis des valeurs d'exemple (`…@nova-services.example`) : remplacez-les.

```bash
npm run parametres:installer -- --telephone "01 23 45 67 89" --email-contact contact@exemple.fr --contact-donnees donnees@exemple.fr
```

- `--telephone` est facultatif : sans lui, aucun téléphone n'est affiché (c'est l'email de contact qui le remplace).
- Sur **dev**, utilisez des valeurs d'essai (différentes des valeurs d'exemple, pour voir le changement). Sur **prod**, les vraies coordonnées de Nova.
- Vérifiez l'adresse du projet et le résumé, puis tapez `oui`.

Ce qu'il faut vérifier :

- *Table Editor › parametres* : une seule ligne, avec les nouvelles valeurs.
- *Table Editor › journal_technique* : un événement `parametres_modifies`.
- Dans l'application : la mention du formulaire montre le nouveau contact ; après un dépôt, l'écran de confirmation montre le nouveau téléphone (ou email). Aucune mise en production n'est nécessaire.

### 6. Collaborateur de test (dev seulement)

Pour essayer l'espace interne avec un compte sans droits d'administration, sur **dev** uniquement :

```bash
npm run compte:creer -- --nom "Collaborateur Essai" --email collaborateur.essai@exemple.fr --role collaborateur
```

Ne créez **jamais** de compte de test sur **prod**.

### 7. Production

À faire lors de la mise en ligne (partie [Mise en ligne](#mise-en-ligne), étape 2), après avoir tout vérifié sur dev :

1. Réglages Auth du projet **prod** : étape 2.
2. Migrations : liez la ligne de commande au projet prod (`npx supabase link --project-ref <identifiant prod>`), lancez `npx supabase db push --remote`, vérifiez avec `npx supabase migration list --remote`, puis reliez-la à dev (`npx supabase link --project-ref <identifiant dev>`).
3. Créez `.env.prod.local` (étape 1), puis lancez les commandes en indiquant ce fichier :

   ```bash
   node scripts/lancer.mjs .env.prod.local scripts/installation/creer-compte.ts --nom "Prénom Nom" --email prenom.nom@exemple.fr --role administrateur
   node scripts/lancer.mjs .env.prod.local scripts/installation/installer-parametres.ts --telephone "…" --email-contact … --contact-donnees …
   ```

   Vérifiez que l'adresse affichée est bien celle du projet **prod**.
4. Faites les vérifications des étapes 4 et 5 sur le tableau de bord du projet prod.
5. **Effacez `.env.prod.local`.** La clé secrète de prod donne tous les droits sur la base : elle ne doit pas rester sur le poste.

### 8. Vérifications finales

- Ouvrez `/inscription` (ou toute autre adresse d'inscription) : la page « Cette page n'existe pas ou a été supprimée. » s'affiche. Il n'existe aucune page d'inscription.
- *Authentication › Sign In / Providers* : les inscriptions sont fermées, la longueur minimale est 12.
- Le premier administrateur est dans *Authentication › Users* et dans `profils`, avec le rôle *administrateur*.
- Après un dépôt, l'écran de confirmation montre les coordonnées saisies à l'étape 5, et non les valeurs d'exemple.

## Mise en ligne

La mise en ligne publie l'application sur Vercel, reliée au projet Supabase **prod**, à une adresse `https://<nom du projet>.vercel.app`. Elle se fait une fois ; ensuite, chaque envoi de `main` sur GitHub publie une nouvelle version. Les actions sur Vercel, Supabase et GitHub (envoi, tag) se font à la main, en suivant les étapes ci-dessous dans l'ordre.

Règles à garder en tête (AD-15, AD-17) :

- la **production** Vercel (branche `main`) utilise **uniquement** le projet Supabase **prod** ; le poste et les aperçus Vercel utilisent **dev** ;
- une clé se copie du tableau de bord Supabase directement dans le champ de Vercel : jamais dans un fichier du dépôt, un message, un ticket ou une conversation ;
- aucun compte de test sur **prod**, et le test automatique ne vise jamais la production.

### 1. Tout vérifier sur dev

Sur le poste, relié à **dev** (`.env.local`) :

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm run test:e2e
npm run secrets
```

Chaque commande doit se terminer sans erreur.

`npm run test:e2e` rejoue le parcours principal (SM-1) dans un vrai navigateur : dépôt, référence, connexion, recherche de la référence, *En cours*, *Traitée*, puis les trois lignes de l'historique dans l'ordre. Il lance `npm run dev` si l'application ne tourne pas déjà. Il lui faut :

- une première fois sur le poste : `npx playwright install chromium` (le navigateur du test) ;
- dans `.env.local`, les identifiants d'un **collaborateur de test du projet dev**, qui a déjà choisi son mot de passe.

Pour préparer ce compte, une seule fois, sur **dev** :

1. Créez-le avec `npm run compte:creer` (partie Installation, [étape 6 « Collaborateur de test »](#6-collaborateur-de-test-dev-seulement)).
2. Notez le mot de passe temporaire, affiché une seule fois.
3. Connectez-vous une fois avec ce compte sur `/connexion` (application locale, reliée à dev), avec le mot de passe temporaire.
4. Choisissez le nouveau mot de passe demandé.
5. Ajoutez dans `.env.local` l'email du compte et ce **nouveau** mot de passe (pas le temporaire) :

   ```
   E2E_EMAIL=<email du compte de test>
   E2E_MOT_DE_PASSE=<son nouveau mot de passe>
   ```

Messages possibles :

| Message | Ce qu'il faut faire |
|---|---|
| « Identifiants du compte de test manquants… » | Ajoutez la ou les lignes indiquées dans `.env.local`. Rien n'a été lancé. |
| « E2E_ADRESSE vaut … : le test ne tourne que sur dev… » | Le test refuse toute adresse autre que `http://localhost:<port>` ou `http://127.0.0.1:<port>`. Retirez `E2E_ADRESSE` ou mettez une adresse locale de cette forme. |
| « Le compte de test a encore un mot de passe temporaire… » | Connectez-vous une fois à la main sur dev avec ce compte, choisissez son mot de passe, puis reportez-le dans `E2E_MOT_DE_PASSE`. |
| « Connexion refusée… » | Vérifiez `E2E_EMAIL` et `E2E_MOT_DE_PASSE`. Après 5 échecs, la connexion est bloquée un moment : attendez avant de relancer. |

Chaque passage laisse sur dev une demande dont l'objet commence par « Essai automatique SM-1 », passée *Traitée*. C'est voulu : elle sert à la vérification de l'étape 7 ci-dessous (« Données séparées »).

En cas d'échec, Playwright garde une trace dans `test-results/` et un rapport dans `playwright-report/` (à ouvrir avec `npx playwright show-report`). Ces dossiers sont ignorés par git, mais la trace contient ce qui a été tapé, **mot de passe du compte de test compris** : ne les partagez pas, et effacez-les quand vous avez trouvé la cause.

`npm run secrets` (gitleaks) vérifie qu'aucun secret n'est entré dans l'historique git. Il est obligatoire avant toute mise en production : le dépôt est public.

### 2. Projet Supabase prod

1. Sur [supabase.com](https://supabase.com/dashboard), *New project*, dans la même organisation que dev, offre *Free*.
2. Nom : par exemple `nova-prod`. Région : **Europe (Paris)** (`eu-west-3`), pour que les données restent en Europe et près des fonctions Vercel (étape 5).
3. Le mot de passe de la base est généré par Supabase : rangez-le dans votre gestionnaire de mots de passe, nulle part ailleurs. Il ne sert pas à l'application.
4. Suivez ensuite les étapes 1 à 5 de la partie [Production](#7-production) de l'installation : réglages Auth, migrations par la ligne de commande (jamais à la main), premier administrateur de prod, coordonnées de Nova, puis effacement de `.env.prod.local`. Faites les vérifications indiquées à chaque étape, sur le tableau de bord du projet **prod**.

### 3. Projet Vercel

1. Sur [vercel.com](https://vercel.com), offre *Hobby*, connectez votre compte GitHub.
2. *Add New… › Project*, puis importez le dépôt GitHub de Nova Services.
3. **Nom du projet** : il donne l'adresse publique, `https://<nom>.vercel.app`. Choisissez-le dès maintenant (par exemple `nova-services`) : le changer plus tard change l'adresse.
4. *Framework Preset* : Next.js (détecté seul). Ne changez ni le dossier racine (`./`), ni les commandes de construction.
5. **Ne cliquez pas encore sur *Deploy*** : saisissez d'abord les variables (étape 4). Si un premier déploiement est parti trop tôt, il échouera : ce n'est pas grave, relancez-le après l'étape 4 (*Redeploy*).
6. Une fois le projet créé : dans *Settings › Environments › Production* (les intitulés peuvent légèrement varier), vérifiez que la branche de production est **`main`**.

### 4. Variables d'environnement

Dans *Settings › Environment Variables* du projet Vercel, créez chaque variable **pour un seul environnement à la fois** (case *Production* seule, puis case *Preview* seule), avec la valeur indiquée :

| Variable | *Production* | *Preview* |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL du projet **prod** | Project URL du projet **dev** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key du projet **prod** | Publishable key du projet **dev** |
| `SUPABASE_SECRET_KEY` | Secret key du projet **prod** | Secret key du projet **dev** |
| `SECRET_EMPREINTE_IP` | Nouvelle valeur, propre à prod | Valeur utilisée sur dev |
| `SECRET_COOKIES` | Nouvelle valeur, propre à prod (32 caractères au moins), différente de la précédente | Valeur utilisée sur dev |

- Où trouver chaque valeur : commentaires de `.env.example`. Les deux secrets de prod se génèrent avec la commande indiquée dans `.env.example`, une fois chacun ; copiez le résultat directement dans Vercel, sans le garder ailleurs.
- Cochez *Sensitive* pour `SUPABASE_SECRET_KEY`, `SECRET_EMPREINTE_IP` et `SECRET_COOKIES` : Vercel ne les réaffichera plus.
- Ne cochez pas *Development* : le poste lit `.env.local`.
- Ne déclarez **jamais** dans Vercel les réglages réservés au poste : `DUREE_INACTIVITE_MINUTES`, `ESSAI_LISTE_DEMANDES`, `E2E_EMAIL`, `E2E_MOT_DE_PASSE`, `E2E_ADRESSE`.
- Les aperçus (*Preview*, toute branche autre que `main`) visent dev. Ils ne servent pas pour l'instant (commits directement sur `main`), mais ainsi une branche ne touche jamais la production.

**Toute modification d'une variable dans Vercel demande un redéploiement.** Une variable n'est lue qu'au déploiement, et les variables `NEXT_PUBLIC_…` sont même écrites dans le code envoyé au navigateur au moment de la construction : elles restent figées dans le déploiement en ligne. Après un changement : *Deployments*, menu « … » du dernier déploiement de production, *Redeploy*.

### 5. Région et version de Node.js

Ces deux réglages sont dans le dépôt ; Vercel les lit à chaque déploiement :

- `vercel.json` : `"regions": ["cdg1"]`, les fonctions de l'application tournent à **Paris**, près du projet Supabase prod (A-H2). À vérifier dans *Settings › Functions* : *Function Region* = Paris, France (`cdg1`).
- `package.json` : `"engines": { "node": "24.x" }`, Vercel construit et exécute l'application avec **Node.js 24** (A-H3). À vérifier dans *Settings › Build and Deployment* : *Node.js Version* = 24.x.

### 6. Premier déploiement

1. Envoyez `main` sur GitHub (`git push origin main`), ou cliquez sur *Deploy* (*Redeploy* si un premier déploiement est déjà parti).
2. Suivez la construction dans *Deployments* : elle doit se terminer par *Ready*. En cas d'échec, le journal de construction dit pourquoi (souvent une variable manquante : corrigez-la à l'étape 4, puis *Redeploy*).
3. Ensuite, chaque envoi de `main` publie automatiquement une nouvelle version.

### 7. Vérifications en production

Sur l'adresse de production (*Settings › Domains* du projet Vercel), avec le premier administrateur de prod :

1. **Adresse en HTTPS** : `https://<nom>.vercel.app` s'ouvre sur le formulaire de dépôt, avec le cadenas du navigateur ; `http://<nom>.vercel.app` renvoie vers `https://`.
2. **Données séparées** : sur dev, la liste des demandes montre la demande « Essai automatique SM-1 … » laissée par le test (étape 1). En production, connectez-vous : elle n'apparaît pas dans la liste, et la recherche « Essai automatique » ne trouve rien. Faites ce point avant le dépôt « Vérification mise en ligne » ci-dessous.
3. **Parcours principal** : `npm run test:e2e` est vert sur dev (étape 1). On ne le lance jamais contre la production.
4. **Version** : en production, le menu de l'espace interne affiche « Version v0.1.0 » (c'est la `version` de `package.json`).

Faites aussi les vérifications finales de l'installation (partie Installation, [étape 8 « Vérifications finales »](#8-vérifications-finales)) sur l'adresse de production. La dernière demande un vrai dépôt en production :

- déposez-le avec l'objet **« Vérification mise en ligne »** ;
- vérifiez les coordonnées sur l'écran de confirmation ;
- connectez-vous avec le premier administrateur de prod, ouvrez cette demande et passez-la *Traitée* (« Marquer Traitée »).

Ce n'est pas la demande « Essai automatique SM-1 … » du point 2 « Données séparées » : celle-ci n'existe que sur dev et ne doit jamais apparaître en production.

### 8. Tag de version

Seulement quand les tests sont verts sur dev (étape 1) et que les vérifications de l'étape 7 sont bonnes, posez le tag sur le commit de `main` publié :

```bash
git tag -a v0.1.0 -m "v0.1.0 : parcours principal en ligne"
git push origin v0.1.0
```

Le tag, la `version` de `package.json` et la version du menu sont toujours identiques (`v0.1.0`, `0.1.0`, « Version v0.1.0 »). Pour une version suivante : changez d'abord la `version` de `package.json` (par exemple `0.2.0`), refaites l'étape 1, envoyez `main`, vérifiez en production, puis posez le tag `v0.2.0`.

Si une mise en production pose problème, Vercel permet de revenir au déploiement de production précédent (*Deployments › Instant Rollback* ; un seul retour possible avec l'offre gratuite). La procédure complète viendra avec l'exploitation (epic 5).

## Sauvegarde de nuit

L'offre gratuite de Supabase ne garantit aucune sauvegarde. Chaque nuit, une tâche GitHub Actions (`.github/workflows/sauvegarde-nuit.yml`) sauvegarde donc la base **prod** (NFR-7 : au plus 24 h de demandes perdues) :

1. elle exporte la base avec la Supabase CLI : rôles, structure et données (comptes de `auth.users` compris, avec leurs mots de passe hachés) ;
2. elle vérifie que la base est bien une base de Nova (table `public.demandes`) : ce contrôle ne distingue pas dev de prod, c'est la vérification du journal de **prod** (étape 5, point 2) qui confirme que c'est bien prod qui est sauvegardée ; elle chiffre l'export avec un mot de passe (AES256), puis vérifie que le fichier se déchiffre ;
3. elle publie **seulement le fichier chiffré**, `sauvegarde-prod-AAAA-MM-JJ-HHMM.tar.gz.gpg` (heure de Paris), comme artefact gardé **7 jours** ;
4. enfin, elle écrit `sauvegarde_reussie` dans `journal_technique`.

Elle part vers 2 h 17 à Paris en hiver, 3 h 17 en été (GitHub peut la lancer avec un peu de retard). Tout échec donne une croix rouge dans l'onglet *Actions*, et rien n'est publié tant que le fichier chiffré n'est pas vérifié.

Une nuit en échec porte la perte possible à près de 48 h, et chaque fichier disparaît au bout de 7 jours, même si aucune sauvegarde plus récente n'a réussi : **en cas de croix rouge, corrigez et relancez la tâche à la main le jour même** (étape 4, point 2). Après 7 nuits d'échec, il ne reste plus aucune sauvegarde.

Le dépôt est **public** : les journaux d'exécution et les artefacts le sont aussi, tout compte GitHub peut les télécharger. C'est pourquoi le fichier est chiffré, et pourquoi les deux secrets ci-dessous ne s'écrivent **nulle part ailleurs** que dans GitHub et votre gestionnaire de mots de passe : jamais dans un fichier du dépôt, un message, un ticket ou une conversation (avec un assistant d'IA compris).

La restauration à partir de ce fichier viendra avec l'exploitation (story 5.1).

### 1. Mot de passe de chiffrement

1. Dans votre gestionnaire de mots de passe, créez une entrée « Nova – chiffrement des sauvegardes ».
2. Faites-lui générer un mot de passe de **40 caractères** (32 au moins : la tâche refuse un mot de passe plus court).
3. Enregistrez l'entrée. **Sans ce mot de passe, les sauvegardes sont illisibles** : il doit rester dans le gestionnaire, même si le secret GitHub est un jour supprimé.

### 2. Adresse de la base prod

La tâche se connecte à la base par l'adresse *Session pooler* : la connexion directe (`db.<identifiant>.supabase.co`) de l'offre gratuite n'est joignable qu'en IPv6, que GitHub ne sait pas joindre, et le *Transaction pooler* (port `6543`) ne convient pas à l'export.

1. Dans le tableau de bord du projet **prod**, bouton *Connect* (en haut de la page), onglet *Connection String*, méthode **Session pooler** (les intitulés peuvent légèrement varier).
2. L'adresse a la forme `postgresql://postgres.<identifiant prod>:[YOUR-PASSWORD]@aws-….pooler.supabase.com:5432/postgres` : vérifiez qu'elle contient bien l'identifiant du projet **prod** et le port `5432`.
3. Ne la recopiez pas encore : elle se colle directement dans GitHub à l'étape suivante, où vous remplacerez `[YOUR-PASSWORD]` par le **mot de passe de la base prod**, rangé dans votre gestionnaire lors de la mise en ligne ([étape 2](#2-projet-supabase-prod)).

Ce mot de passe ne doit contenir que des lettres, des chiffres et `. _ ~ -` : la tâche refuse tout autre caractère (avec d'autres caractères, l'adresse devrait être encodée, et le mot de passe pourrait apparaître en partie dans les journaux publics). S'il en contient d'autres : *Project Settings › Database › Reset database password*, générez un mot de passe fait seulement de lettres et de chiffres, et remplacez l'ancien dans votre gestionnaire. L'application n'utilise pas ce mot de passe : elle n'est pas touchée.

### 3. Secrets GitHub

Sur GitHub, dans le dépôt : *Settings › Secrets and variables › Actions*, onglet *Secrets*, *New repository secret*. Créez les deux secrets, avec exactement ces noms :

| Nom | Valeur |
|---|---|
| `SAUVEGARDE_URL_BASE_PROD` | L'adresse *Session pooler* de l'étape 2, collée depuis Supabase, où vous remplacez `[YOUR-PASSWORD]` (crochets compris) par le mot de passe de la base prod, copié depuis le gestionnaire. |
| `SAUVEGARDE_MOT_DE_PASSE` | Le mot de passe de chiffrement de l'étape 1, copié depuis le gestionnaire. |

GitHub ne réaffiche jamais un secret : pour le corriger, *Update* et collez la nouvelle valeur. Dans les journaux d'exécution, GitHub remplace les secrets par `***` ; la tâche masque aussi le mot de passe de la base contenu dans l'adresse.

### 4. Premier lancement à la main

La tâche n'existe pour GitHub qu'une fois le fichier `.github/workflows/sauvegarde-nuit.yml` envoyé sur `main`.

1. Envoyez `main` sur GitHub (`git push origin main`).
2. Onglet *Actions* du dépôt, tâche **Sauvegarde de nuit** (colonne de gauche), bouton *Run workflow*, branche `main`, puis *Run workflow*.
3. Ouvrez l'exécution qui apparaît et attendez qu'elle se termine (quelques minutes) : elle doit avoir une coche verte. En cas de croix rouge, ouvrez l'étape en échec : le message dit quoi faire (tableau ci-dessous).

Messages possibles :

| Message | Ce qu'il faut faire |
|---|---|
| « Le secret … est vide ou absent… » | Créez ce secret (étape 3), avec exactement ce nom, puis relancez. Rien n'a été exporté. |
| « …n'a pas la forme attendue… » ou « …ne contient pas le mot de passe de la base… » | Recollez l'adresse *Session pooler* (étape 2) et remplacez bien `[YOUR-PASSWORD]`, crochets compris. |
| « …n'est pas celle du « Session pooler »… » | Vous avez pris la connexion directe (`db.….supabase.co`) ou le port `6543` : reprenez l'adresse *Session pooler*, port `5432` (étape 2). |
| « …SAUVEGARDE_MOT_DE_PASSE est trop court… » | Générez un mot de passe de 40 caractères (étape 1), rangez-le dans le gestionnaire, puis mettez à jour le secret. |
| « L'export … a échoué. » | Le message au-dessus vient de la Supabase CLI. Souvent : mot de passe de la base faux dans l'adresse (*password authentication failed*), ou projet prod en pause dans Supabase. Corrigez, puis relancez. |
| « Le mot de passe de la base… contient des caractères spéciaux… » | Dans le projet prod, *Project Settings › Database › Reset database password* : générez un mot de passe fait seulement de lettres et de chiffres, rangez-le dans votre gestionnaire, puis mettez à jour `SAUVEGARDE_URL_BASE_PROD` (étapes 2 et 3). |
| « …ce n'est pas la base de Nova… » | L'adresse vise un autre projet (ou un projet sans les migrations) : reprenez l'adresse du projet **prod**. Attention, une adresse du projet **dev** passerait ce contrôle : seule la vérification du journal de prod (étape 5, point 2) le révèle. |
| « Le déchiffrement d'essai a échoué… » | Rien n'a été publié. Relancez ; si cela se reproduit, notez l'heure et le numéro de l'exécution pour le support. |
| « L'écriture de « sauvegarde_reussie » dans le journal technique a échoué… » | Le fichier chiffré est publié (il est dans les artefacts), mais le journal ne le dit pas. Relancez la tâche ; si cela se reproduit, notez l'heure et le numéro de l'exécution pour le support. |

### 5. Vérifications

Le lendemain matin du premier lancement, puis chaque fois que vous voulez vous assurer que tout va bien :

1. **La sauvegarde de la nuit a réussi** : onglet *Actions*, tâche *Sauvegarde de nuit* : la dernière exécution, déclenchée par *schedule* (la nuit) et non à la main, a une coche verte. En l'ouvrant, la partie *Artifacts* montre un seul artefact, `sauvegarde-prod-AAAA-MM-JJ-HHMM`, qui expire 7 jours plus tard ; les journaux de l'exécution ne montrent ni adresse complète, ni mot de passe (seulement `***`).
2. **Le journal a moins de 24 heures** : tableau de bord Supabase du projet **prod**, *Table Editor › journal_technique*, filtre `evenement` = `sauvegarde_reussie`, tri par `date_creation` décroissante : la première ligne a moins de 24 heures. Ses détails ne contiennent que le nom du fichier, le numéro de l'exécution (le même que dans *Actions*) et la taille, jamais une donnée de demandeur.
3. **Le mot de passe de chiffrement est bien rangé** : il est dans votre gestionnaire (étape 1) ; *Settings › Secrets and variables › Actions* liste `SAUVEGARDE_MOT_DE_PASSE` et `SAUVEGARDE_URL_BASE_PROD` (sans afficher leur valeur) ; il n'est dans aucun fichier du dépôt, et `npm run secrets` se termine sans erreur.

### 6. Vérification mensuelle

Une fois par mois, refaites le point 1 de l'étape 5. GitHub **met en pause les tâches planifiées d'un dépôt public après 60 jours sans activité** sur le dépôt : un bandeau l'indique alors dans l'onglet *Actions*, sur la tâche *Sauvegarde de nuit*. Cliquez sur *Enable workflow*, puis relancez-la à la main (étape 4, point 2) pour ne pas attendre la nuit suivante.

GitHub prévient en général par email d'un échec de tâche planifiée (la personne qui a modifié la planification en dernier) ; ne comptez pas seulement sur cet email.
