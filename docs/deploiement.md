# Déploiement de Nova Services

Ce document décrit la mise en place de Nova Services sur un projet Supabase. Il sera complété par la mise en ligne (story 1.12) et l'exploitation (epic 5).

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

À faire lors de la mise en ligne (story 1.12), après avoir tout vérifié sur dev :

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
