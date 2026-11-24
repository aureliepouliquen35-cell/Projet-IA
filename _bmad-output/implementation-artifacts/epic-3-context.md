# Epic 3 Context: Gérer les comptes et les droits

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Donner à l'administrateur la maîtrise complète des accès à l'espace interne, sans aucune inscription publique ni envoi d'email. Il dispose d'une section Administration qu'il est seul à voir. Il y crée les comptes avec un mot de passe temporaire qu'il transmet lui-même, modifie le nom ou le rôle, désactive ou réactive un compte et réinitialise un mot de passe. L'application doit toujours garder au moins un administrateur actif. Un collaborateur n'a accès à aucune fonction d'administration, et le serveur le vérifie. C'est un Must du cahier des charges (gestion des comptes, droits collaborateur et administrateur). L'epic s'appuie sur les comptes, la connexion et le premier mot de passe livrés par l'epic 1.

## Stories

- Story 3.1 : Réserver l'administration aux administrateurs
- Story 3.2 : Créer un compte pour un nouveau collègue
- Story 3.3 : Modifier le nom ou le rôle d'un compte
- Story 3.4 : Désactiver ou réactiver un compte
- Story 3.5 : Réinitialiser le mot de passe d'un collègue

## Requirements & Constraints

- Deux rôles : **collaborateur** et **administrateur**. L'administrateur a tous les droits du collaborateur, plus la gestion des comptes, des catégories, des informations générales, la suppression et l'anonymisation. Un collaborateur ne voit **ni menu ni bouton** d'administration. S'il force l'adresse d'une page ou appelle directement une action réservée, le **serveur** refuse (« Accès refusé ») : cacher le bouton ne suffit pas (RM-7).
- **Création** (RM-8) : nom, email, rôle (Collaborateur par défaut) et mot de passe temporaire d'au moins 12 caractères. Deux comptes ne peuvent pas avoir le même email. Aucun email n'est envoyé. À sa première connexion, l'utilisateur doit choisir un nouveau mot de passe, différent du mot de passe temporaire, avant d'accéder à toute autre page. L'administrateur ne connaît jamais le mot de passe définitif.
- **Modification** : seuls le nom et le rôle sont modifiables. L'email est affiché mais ne peut pas être changé.
- **Désactivation** (RM-10) : un compte n'est **jamais supprimé**. Un compte désactivé ne peut plus se connecter (« Identifiants incorrects »). S'il était connecté, il perd l'accès au plus tard à sa prochaine action. Son nom reste dans l'historique des demandes. Un compte désactivé peut être réactivé.
- **Rétrogradation** : un administrateur passé collaborateur perd ses droits d'administration à sa prochaine action, sans attendre la fin de sa session.
- **Réinitialisation** : l'administrateur donne un nouveau mot de passe temporaire. L'ancien ne fonctionne plus, et l'utilisateur doit en choisir un nouveau à sa connexion suivante. Le lien « Mot de passe oublié » n'est pas dans cet epic (Could, epic 7).
- **Dernier administrateur** (RM-9) : il est impossible de désactiver ou de rétrograder le dernier administrateur actif, y compris son propre compte, et même si deux administrateurs agissent au même instant. Message exact : « Impossible : il doit rester au moins un administrateur actif. »
- Les créations, les changements de rôle, les désactivations, les réactivations et les réinitialisations sont tracés dans le journal technique, sans aucun mot de passe.
- Chaque règle RM touchée (RM-7, RM-8, RM-9, RM-10) a son test automatisé dans `tests/regles/`.

## Technical Decisions

- **Création de compte, en deux temps** : `src/server/admin` crée le compte dans Supabase Auth avec l'API d'administration (« email confirmé », donc sans email), puis appelle aussitôt la fonction SQL `creer_profil` (nom, email, rôle). Si `creer_profil` échoue, le compte Auth est supprimé : il n'existe jamais de compte sans profil. Aucun déclencheur sur `auth.users`.
- **Mot de passe temporaire** : à la création et à la réinitialisation, `doit_changer_mdp = vrai` et l'empreinte du mot de passe temporaire est enregistrée dans `mdp_temporaires`. L'application ne peut pas lire cette table, et l'empreinte est effacée dès que l'utilisateur choisit son mot de passe.
- **Désactivation** : `actif = faux` dans `profils` **et** blocage du compte dans Supabase Auth, pour que la session ne puisse plus se renouveler.
- **Changement de rôle et désactivation** passent par la fonction SQL `modifier_compte`. Elle verrouille les lignes concernées, compte les administrateurs actifs restants et refuse avec le message exact. C'est la base qui garantit la règle face aux actions simultanées.
- Les fonctions SQL des comptes (`creer_profil`, `modifier_compte`) ne peuvent être lancées que par le rôle `service_role`. La clé secrète n'est utilisée que dans `src/server/admin` (règle ESLint). Chaque fonction est `security definer`, avec `search_path = ''` et `revoke … from public`, et vérifie qui l'appelle. Personne n'écrit directement dans une table.
- **Garde d'accès** : `src/proxy.ts` déconnecte un compte inactif et envoie vers I2 tant que `doit_changer_mdp` est vrai. Chaque action et chaque lecture d'administration commence par `exigerAdministrateur()` (`src/server/garde`), qui relit le profil (actif, rôle) dans la base. **Le rôle vient toujours de `profils`**, jamais des métadonnées du compte Supabase.
- **RLS** : les utilisateurs internes actifs lisent les profils (pour afficher les noms). Seuls les administrateurs voient les profils désactivés dans la gestion des comptes.
- Un schéma Zod par formulaire (création, modification, réinitialisation) dans `src/shared/schemas`, avec les messages exacts de l'UX. Les réponses ont le format `{ ok, … }`, avec les codes `VALIDATION`, `ACCES_REFUSE`, `CONFLIT`, etc. Une erreur prévue ne lève jamais d'exception.
- Le journal passe uniquement par `journaliser()`, avec les événements `compte_cree`, `role_modifie`, `compte_desactive`, `compte_reactive` et `mot_de_passe_reinitialise`. Les détails peuvent contenir l'identifiant ou l'email de l'utilisateur interne, jamais de mot de passe.
- Les libellés des rôles se trouvent uniquement dans `src/shared/libelles.ts`, avec les valeurs `collaborateur` et `administrateur`.

## UX & Interaction Patterns

- **Menu latéral** : la section *Administration* (*Comptes*, *Catégories*, *Informations générales*) n'apparaît que pour un administrateur. En bas du menu : nom, rôle, « Se déconnecter ».
- **A1 — Comptes** : tableau Nom · Email · Rôle · État (Actif / badge gris *Désactivé*, toujours avec le mot écrit) · Actions (« Modifier », « Réinitialiser le mot de passe », « Désactiver » ou « Réactiver »). Bouton principal « Créer un compte ». Pendant le chargement, un squelette du tableau. En cas d'échec du chargement : « Impossible de charger les comptes. » + « Réessayer ». Il n'y a pas d'état vide, puisque l'administrateur connecté existe toujours.
- **Créer un compte** (fenêtre) : Nom *, Email *, Rôle *, Mot de passe temporaire * avec le bouton « Générer ». Aide : « Transmettez ce mot de passe vous-même à la personne. Elle devra le changer à sa première connexion. » Après la création, le mot de passe s'affiche **une seule fois** avec « Copier », puis le toast « Compte créé » apparaît. Erreurs sous le champ : « Cet email est déjà utilisé par un autre compte. », « 12 caractères minimum ».
- **Modifier** (fenêtre) : Nom *, Rôle *, email affiché non modifiable, bouton « Enregistrer », toast « Compte modifié ».
- **Réinitialiser le mot de passe de Lucas Bernard** (fenêtre) : champ « Nouveau mot de passe temporaire * » avec « Générer ». Texte : « L'ancien mot de passe ne fonctionnera plus. Lucas devra choisir un nouveau mot de passe à sa prochaine connexion. » Ensuite, affichage unique avec « Copier ».
- **Désactiver** (fenêtre de confirmation) : « Lucas ne pourra plus se connecter. Son nom restera dans l'historique des demandes. » Ensuite, toast « Compte désactivé ».
- **Dernier administrateur** : l'action reste visible, mais elle est refusée avec le message exact, et rien ne change.
- **Fenêtres** : 440 px de large au plus, la sélection se place sur « Annuler », Échap ferme, une seule fenêtre à la fois. Le bouton danger est réservé aux suppressions.
- **Compte désactivé pendant la session** : à sa prochaine action, la personne revient sur I1 avec l'encadré neutre « Votre session a pris fin. Contactez votre administrateur si besoin. »
- **Administrateur rétrogradé** : à sa prochaine action, la section Administration disparaît. S'il était sur une page d'administration, il voit S1. Ses autres pages fonctionnent normalement.
- **S1** : « Accès refusé. Cette page est réservée aux administrateurs. » + « Retour aux demandes ».

## Cross-Story Dependencies

- Ordre de construction : **3.1 → 3.2 → 3.4 → 3.5 → 3.3**. Couper l'accès d'une personne qui part passe avant la simple modification d'un nom.
- La 3.1 pose la section Administration, la page A1, `exigerAdministrateur()` et l'écran S1, sur lesquels reposent toutes les autres stories. La 3.3 et la 3.4 partagent `modifier_compte` et la règle du dernier administrateur.
- L'epic 1 a déjà livré `profils`, `mdp_temporaires`, la procédure du premier administrateur, la connexion (blocage, compte désactivé), l'écran I2, la garde `src/proxy.ts`, le journal et le format d'erreur. L'epic 3 les réutilise sans les recréer.
- L'epic 4 réutilisera la section Administration et `exigerAdministrateur()` pour les catégories, les informations générales et la suppression d'une demande. L'epic 5 documente la procédure du support de niveau 2 pour rendre l'accès au dernier administrateur.
